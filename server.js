import express from 'express';
import { TwitterApi } from 'twitter-api-v2';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import configManager from './config.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize configuration manager
await configManager.init();

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_ANON_KEY;
const useSupabase = Boolean(SUPA_URL && SUPA_KEY);
const supabase = useSupabase ? createClient(SUPA_URL, SUPA_KEY) : null;
const memory = { timeline: null, slots: [] };

// Asignar Supabase a global para que config.js pueda usarlo
if (supabase) {
  global.supabase = supabase;
  console.log('✅ Supabase client asignado a global.supabase');
} else {
  console.log('⚠️  Supabase no configurado - usando almacenamiento local');
}

function getTwitterClient() {
  const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET } = process.env;
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) return null;
  try {
    return new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
      accessToken: TWITTER_ACCESS_TOKEN,
      accessSecret: TWITTER_ACCESS_SECRET,
    });
  } catch (e) {
    return null;
  }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ===== ALGORITMO DE DISTRIBUCIÓN AUTOMÁTICA =====
function calculateSlots(postsPerDayTarget, intervalHours, monthsAhead, workStart, workEnd, timezone) {
  const slots = [];
  const [startHour, startMinute] = workStart.split(':').map(Number);
  const [endHour, endMinute] = workEnd.split(':').map(Number);

  const workStartMinutes = startHour * 60 + startMinute;
  const workEndMinutes = endHour * 60 + endMinute;
  const workMinutesPerDay = workEndMinutes - workStartMinutes;
  const intervalMinutes = intervalHours * 60;

  // ===== CALCULAR POSTS POR DÍA REALES =====
  // Cuántos posts caben en un día respetando el intervalo mínimo?
  const maxPostsPerDayByInterval = Math.floor(workMinutesPerDay / intervalMinutes);

  // El objetivo es postsPerDayTarget, pero si el intervalo no permite tantos, usar el máximo posible
  let postsPerDay, spacingMinutes;

  if (maxPostsPerDayByInterval >= postsPerDayTarget) {
    // Caben todos los posts deseados, distribuir uniformemente
    postsPerDay = postsPerDayTarget;
    // Distribuir uniformemente en todo el horario
    spacingMinutes = postsPerDay > 1 ? workMinutesPerDay / (postsPerDay - 1) : 0;
  } else {
    // No caben tantos, usar el máximo posible con intervalo mínimo
    postsPerDay = maxPostsPerDayByInterval;
    spacingMinutes = intervalMinutes;
  }

  // ===== CALCULAR DÍAS A GENERAR =====
  // Aproximado: 1 mes = 22 días laborables (5 días/semana × 4.4 semanas)
  const workdaysToGenerate = Math.ceil(monthsAhead * 22);

  // ===== DETERMINAR PUNTO DE INICIO =====
  const now = DateTime.now().setZone(timezone);
  const isWeekday = now.weekday >= 1 && now.weekday <= 5;
  const nowMinutes = now.hour * 60 + now.minute;

  let currentDate = now;
  let todayPostsCount = 0;

  // Calcular cuántos posts caben HOY (proporcional)
  if (isWeekday && nowMinutes < workEndMinutes) {
    let startMinutesToday;

    if (nowMinutes >= workStartMinutes) {
      // Ya estamos en horario laboral
      startMinutesToday = nowMinutes;
      currentDate = now.plus({ minutes: 1 }).set({ second: 0, millisecond: 0 });
    } else {
      // Aún no empieza el horario laboral hoy
      startMinutesToday = workStartMinutes;
      currentDate = now.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
    }

    const remainingMinutesToday = workEndMinutes - startMinutesToday;

    // Proporcional: Si quedan 3h de 9h = 33% del día → 33% de posts/día
    const proportionOfDay = remainingMinutesToday / workMinutesPerDay;
    todayPostsCount = Math.floor(postsPerDay * proportionOfDay);

    // Ajustar spacing para hoy si hay posts
    if (todayPostsCount > 0) {
      const todaySpacing = todayPostsCount > 1
        ? remainingMinutesToday / (todayPostsCount - 1)
        : 0;

      // Generar slots de HOY
      for (let i = 0; i < todayPostsCount; i++) {
        slots.push({
          slot_index: slots.length,
          scheduled_time: currentDate.plus({ minutes: i * todaySpacing }).toISO(),
          status: 'empty',
          content: null
        });
      }
    }

    // Mover al siguiente día laboral
    currentDate = now.plus({ days: 1 }).set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  } else {
    // Hoy no es laboral o ya pasó, empezar mañana
    currentDate = now.plus({ days: 1 }).set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  }

  // Saltar fines de semana
  while (currentDate.weekday === 6 || currentDate.weekday === 7) {
    currentDate = currentDate.plus({ days: 1 });
  }

  // ===== GENERAR SLOTS PARA DÍAS COMPLETOS =====
  let daysScheduled = 0;

  while (daysScheduled < workdaysToGenerate) {
    // Saltar fines de semana
    while (currentDate.weekday === 6 || currentDate.weekday === 7) {
      currentDate = currentDate.plus({ days: 1 });
    }

    // Generar posts para este día
    for (let i = 0; i < postsPerDay; i++) {
      const slotTime = currentDate.plus({ minutes: i * spacingMinutes });

      // Validar que esté dentro del horario laboral
      const slotMinutes = slotTime.hour * 60 + slotTime.minute;
      if (slotMinutes <= workEndMinutes) {
        slots.push({
          slot_index: slots.length,
          scheduled_time: slotTime.toISO(),
          status: 'empty',
          content: null
        });
      }
    }

    daysScheduled++;
    currentDate = currentDate.plus({ days: 1 });
  }

  return slots;
}

// ===== ENDPOINTS =====

// Obtener timeline actual (solo hay uno)
app.get('/api/timeline', async (req, res) => {
  try {
    if (!useSupabase) {
      const tl = memory.timeline;
      if (!tl) return res.json({ timeline: null });
      tl.slots.sort((a, b) => a.slot_index - b.slot_index);
      return res.json({ timeline: tl });
    }
    const { data: timeline } = await supabase
      .from('timelines')
      .select('*, slots(*)')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!timeline) return res.json({ timeline: null });
    timeline.slots.sort((a, b) => a.slot_index - b.slot_index);
    res.json({ timeline });
  } catch (error) {
    console.error('Error al obtener timeline:', error);
    res.json({ timeline: null });
  }
});

// Crear/actualizar timeline
app.post('/api/timeline/create', async (req, res) => {
  try {
    const { totalSlots, intervalHours, monthsAhead, workStart, workEnd, timezone } = req.body;
    
    // Si no hay Supabase configurado o no se puede conectar, usar memoria
    if (!useSupabase || !supabase) {
      const slotsData = calculateSlots(
        totalSlots,
        intervalHours,
        monthsAhead,
        workStart,
        workEnd,
        timezone
      );
      const timeline = {
        id: 'mem',
        name: 'Mi Timeline',
        total_slots: totalSlots,
        interval_hours: intervalHours,
        work_start: workStart,
        work_end: workEnd,
        timezone,
      };
      memory.timeline = timeline;
      memory.slots = slotsData.map((slot, i) => ({
        id: i + 1,
        timeline_id: 'mem',
        slot_index: slot.slot_index,
        scheduled_time: slot.scheduled_time,
        status: slot.status,
        content: slot.content,
        filled_at: null,
        published_at: null,
        tweet_id: null,
        error_message: null,
      }));
      const tl = { ...timeline, slots: [...memory.slots] };
      return res.json({ success: true, timeline: tl, message: 'Timeline creado exitosamente (modo memoria)', preservedCount: 0, publishedCount: 0 });
    } else {
      // Si hay Supabase disponible, usar la lógica de base de datos
      // PRESERVAR publicaciones del timeline anterior
      let existingPosts = [];
      let publishedSlots = [];

      const { data: oldTimeline } = await supabase
        .from('timelines')
        .select('id')
        .limit(1)
        .single();

      if (oldTimeline) {
        // Obtener slots PUBLICADOS (no se tocan nunca)
        const { data: published } = await supabase
          .from('slots')
          .select('*')
          .eq('timeline_id', oldTimeline.id)
          .eq('status', 'published')
          .order('slot_index', { ascending: true });

        if (published && published.length > 0) {
          publishedSlots = published;
          console.log(`🔒 ${published.length} slots publicados permanecen intocables`);
        }

        // Obtener slots llenos ANTES de borrar (para preservar)
        const { data: filledSlots } = await supabase
          .from('slots')
          .select('content, filled_at')
          .eq('timeline_id', oldTimeline.id)
          .eq('status', 'filled')
          .order('slot_index', { ascending: true });

        if (filledSlots && filledSlots.length > 0) {
          existingPosts = filledSlots.map(s => s.content);
          console.log(`📦 Preservando ${existingPosts.length} publicaciones pendientes...`);
        }

        // Borrar SOLO los slots no publicados (empty, filled, y failed)
        await supabase
          .from('slots')
          .delete()
          .eq('timeline_id', oldTimeline.id)
          .in('status', ['empty', 'filled', 'failed']);

        // Actualizar el timeline existente (no crear uno nuevo)
        const { data: timeline, error: timelineError } = await supabase
          .from('timelines')
          .update({
            total_slots: totalSlots,
            interval_hours: intervalHours,
            work_start: workStart,
            work_end: workEnd,
            timezone
          })
          .eq('id', oldTimeline.id)
          .select()
          .single();

        if (timelineError) throw timelineError;

        return await createOrUpdateTimelineSlots(timeline, totalSlots, intervalHours, monthsAhead, workStart, workEnd, timezone, existingPosts, publishedSlots, res);
      }

      // Si no hay timeline previo, crear uno nuevo
      const { data: timeline, error: timelineError } = await supabase
        .from('timelines')
        .insert({
          name: 'Mi Timeline',
          total_slots: totalSlots,
          interval_hours: intervalHours,
          work_start: workStart,
          work_end: workEnd,
          timezone
        })
        .select()
        .single();

      if (timelineError) throw timelineError;

      return await createOrUpdateTimelineSlots(timeline, totalSlots, intervalHours, monthsAhead, workStart, workEnd, timezone, existingPosts, publishedSlots, res);
    }
  } catch (error) {
    console.error('Error al crear/actualizar timeline:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function para crear/actualizar slots
async function createOrUpdateTimelineSlots(timeline, totalSlots, intervalHours, monthsAhead, workStart, workEnd, timezone, existingPosts, publishedSlots, res) {
  try {
    // Calcular slots nuevos
    const slotsData = calculateSlots(
      totalSlots,
      intervalHours,
      monthsAhead,
      workStart,
      workEnd,
      timezone
    );

    // MIGRAR contenido a nuevos slots
    const slotsToInsert = slotsData.map((slot, index) => {
      // Si hay contenido preservado para este índice, usarlo
      if (index < existingPosts.length) {
        return {
          ...slot,
          timeline_id: timeline.id,
          status: 'filled',
          content: existingPosts[index],
          filled_at: new Date().toISOString()
        };
      }
      // Si no, slot vacío
      return {
        ...slot,
        timeline_id: timeline.id
      };
    });

    // Insertar nuevos slots
    const { data: newSlots, error: slotsError } = await supabase
      .from('slots')
      .insert(slotsToInsert)
      .select();

    if (slotsError) throw slotsError;

    // Obtener TODOS los slots (nuevos + publicados)
    const { data: allSlots } = await supabase
      .from('slots')
      .select('*')
      .eq('timeline_id', timeline.id)
      .order('slot_index', { ascending: true });

    timeline.slots = allSlots;

    const message = existingPosts.length > 0
      ? `Timeline actualizado. ${existingPosts.length} publicaciones preservadas ✅. ${publishedSlots.length} publicados intocables 🔒`
      : 'Timeline creado exitosamente';

    res.json({
      success: true,
      timeline,
      message,
      preservedCount: existingPosts.length,
      publishedCount: publishedSlots.length
    });
  } catch (error) {
    console.error('Error al crear/actualizar timeline:', error);
    res.status(500).json({ error: error.message });
  }
}

// Agregar publicación al próximo slot vacío
app.post('/api/timeline/add-post', async (req, res) => {
  try {
    const { content, quality_score } = req.body;
    if (!useSupabase) {
      if (!memory.timeline) return res.status(404).json({ error: 'No hay timeline activo' });
      const now = DateTime.utc();
      const emptySlot = memory.slots
        .filter(s => s.status === 'empty')
        .filter(s => DateTime.fromISO(s.scheduled_time).toUTC() >= now)
        .sort((a, b) => a.slot_index - b.slot_index)[0];
      if (!emptySlot) return res.status(400).json({ error: 'No hay slots disponibles en el futuro' });
      emptySlot.status = 'filled';
      emptySlot.content = content;
      emptySlot.filled_at = new Date().toISOString();
      if (typeof quality_score === 'number') emptySlot.quality_score = quality_score;
      const tl = { ...memory.timeline, slots: [...memory.slots].sort((a, b) => a.slot_index - b.slot_index) };
      return res.json({ success: true, timeline: tl });
    }

    // Obtener timeline actual
    const { data: timeline } = await supabase
      .from('timelines')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!timeline) {
      return res.status(404).json({ error: 'No hay timeline activo' });
    }

  // Encontrar próximo slot vacío EN EL FUTURO
  const now = DateTime.utc();
  const { data: emptySlot } = await supabase
    .from('slots')
    .select('*')
    .eq('timeline_id', timeline.id)
    .eq('status', 'empty')
    .gte('scheduled_time', now.toISO()) // Solo slots en el futuro
    .order('slot_index', { ascending: true })
    .limit(1)
    .single();

    if (!emptySlot) {
      return res.status(400).json({ error: 'No hay slots disponibles en el futuro' });
    }

  // Actualizar slot (intenta guardar quality_score si existe la columna)
  try {
    await supabase
      .from('slots')
      .update({
        status: 'filled',
        content,
        filled_at: new Date().toISOString(),
        quality_score: typeof req.body.quality_score === 'number' ? req.body.quality_score : null,
      })
      .eq('id', emptySlot.id);
  } catch (err) {
    await supabase
      .from('slots')
      .update({
        status: 'filled',
        content,
        filled_at: new Date().toISOString()
      })
      .eq('id', emptySlot.id);
  }

    // Devolver timeline actualizado
    const { data: updatedTimeline } = await supabase
      .from('timelines')
      .select('*, slots(*)')
      .eq('id', timeline.id)
      .single();

    updatedTimeline.slots.sort((a, b) => a.slot_index - b.slot_index);

    res.json({ success: true, timeline: updatedTimeline });
  } catch (error) {
    console.error('Error al agregar publicación:', error);
    res.status(500).json({ error: error.message });
  }
});

// Eliminar publicación de un slot
app.delete('/api/timeline/slots/:slotId', async (req, res) => {
  try {
    const { slotId } = req.params;

    // Obtener el slot para verificar su estado y hora
    const { data: slot } = await supabase
      .from('slots')
      .select('timeline_id, status, scheduled_time')
      .eq('id', slotId)
      .single();

    if (!slot) {
      return res.status(404).json({ error: 'Slot no encontrado' });
    }

    // PROTEGER: No permitir borrar slots publicados
    if (slot.status === 'published') {
      return res.status(403).json({
        error: '🔒 No puedes eliminar un slot publicado. Solo se usan para analytics.'
      });
    }

    // PROTEGER: No permitir limpiar slots en el pasado
    const now = DateTime.utc();
    const slotTime = DateTime.fromISO(slot.scheduled_time, { zone: 'utc' });
    if (slotTime < now) {
      return res.status(403).json({
        error: '⏰ No puedes limpiar un slot del pasado. Los slots históricos se mantienen para registro.'
      });
    }

    // Vaciar el slot (solo si no está publicado)
    await supabase
      .from('slots')
      .update({
        status: 'empty',
        content: null,
        filled_at: null,
        error_message: null
      })
      .eq('id', slotId)
      .neq('status', 'published'); // Extra safety

    // Devolver timeline actualizado
    const { data: timeline } = await supabase
      .from('timelines')
      .select('*, slots(*)')
      .eq('id', slot.timeline_id)
      .single();

    timeline.slots.sort((a, b) => a.slot_index - b.slot_index);

    res.json({ success: true, timeline });
  } catch (error) {
    console.error('Error al eliminar publicación:', error);
    res.status(500).json({ error: error.message });
  }
});

// Shuffle: mezclar aleatoriamente el contenido de los slots llenos
app.post('/api/timeline/shuffle', async (req, res) => {
  try {
    if (!useSupabase) {
      if (!memory.timeline) {
        return res.status(404).json({ error: 'No hay timeline activo' });
      }
      const filledSlots = memory.slots
        .filter(s => s.status === 'filled')
        .sort((a, b) => a.slot_index - b.slot_index);
      if (!filledSlots || filledSlots.length < 2) {
        return res.status(400).json({ error: 'Necesitas al menos 2 publicaciones para mezclar' });
      }
      const contents = filledSlots.map(s => s.content);
      for (let i = contents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [contents[i], contents[j]] = [contents[j], contents[i]];
      }
      for (let i = 0; i < filledSlots.length; i++) {
        filledSlots[i].content = contents[i];
      }
      const updatedTimeline = {
        ...memory.timeline,
        slots: [...memory.slots].sort((a, b) => a.slot_index - b.slot_index),
      };
      return res.json({ success: true, timeline: updatedTimeline });
    }

    const { data: timeline } = await supabase
      .from('timelines')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!timeline) {
      return res.status(404).json({ error: 'No hay timeline activo' });
    }

    const { data: filledSlots } = await supabase
      .from('slots')
      .select('*')
      .eq('timeline_id', timeline.id)
      .eq('status', 'filled')
      .order('slot_index', { ascending: true });

    if (!filledSlots || filledSlots.length < 2) {
      return res.status(400).json({ error: 'Necesitas al menos 2 publicaciones para mezclar' });
    }

    const contents = filledSlots.map(s => s.content);
    for (let i = contents.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [contents[i], contents[j]] = [contents[j], contents[i]];
    }
    for (let i = 0; i < filledSlots.length; i++) {
      await supabase
        .from('slots')
        .update({ content: contents[i] })
        .eq('id', filledSlots[i].id);
    }

    const { data: updatedTimeline } = await supabase
      .from('timelines')
      .select('*, slots(*)')
      .eq('id', timeline.id)
      .single();
    updatedTimeline.slots.sort((a, b) => a.slot_index - b.slot_index);
    res.json({ success: true, timeline: updatedTimeline });
  } catch (error) {
    console.error('Error al mezclar:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== PUBLISHED TWEETS (para pestaña de Publicados) =====
app.get('/api/published', async (req, res) => {
  try {
    // Obtener todos los slots publicados
    const { data: publishedSlots, error: queryError } = await supabase
      .from('slots')
      .select('*')
      .eq('status', 'published')
      .not('tweet_id', 'is', null)
      .order('published_at', { ascending: false })
      .limit(50); // Últimos 50 publicados

    console.log(`📊 Query published slots: ${publishedSlots?.length || 0} encontrados`);
    if (queryError) {
      console.error('Error en query de published:', queryError);
    }

    if (!publishedSlots || publishedSlots.length === 0) {
      // Debug: contar cuántos hay en total
      const { count } = await supabase
        .from('slots')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published');

      console.log(`📊 Total slots con status=published: ${count}`);

      return res.json({
        success: true,
        published: []
      });
    }

    // Obtener métricas de Twitter para cada tweet
    const tweetIds = publishedSlots.map(s => s.tweet_id);
    const client = getTwitterClient();

    try {
      if (!client) throw new Error('Twitter client not configured');
      const tweets = await client.readOnly.v2.tweets(tweetIds, {
        'tweet.fields': ['public_metrics', 'created_at']
      });

      // Mapear métricas con slots
      const publishedWithMetrics = publishedSlots.map(slot => {
        const tweetData = tweets.data?.find(t => t.id === slot.tweet_id);
        return {
          id: slot.id,
          content: slot.content,
          scheduled_time: slot.scheduled_time,
          published_at: slot.published_at,
          tweet_id: slot.tweet_id,
          tweet_url: `https://twitter.com/user/status/${slot.tweet_id}`,
          metrics: tweetData?.public_metrics || {
            retweet_count: 0,
            reply_count: 0,
            like_count: 0,
            quote_count: 0,
            impression_count: 0
          }
        };
      });

      res.json({
        success: true,
        published: publishedWithMetrics,
        total: publishedWithMetrics.length
      });
    } catch (twitterError) {
      console.error('Error al obtener métricas de Twitter:', twitterError);
      // Si falla Twitter, devolver sin métricas
      const publishedBasic = publishedSlots.map(slot => ({
        id: slot.id,
        content: slot.content,
        scheduled_time: slot.scheduled_time,
        published_at: slot.published_at,
        tweet_id: slot.tweet_id,
        tweet_url: `https://twitter.com/user/status/${slot.tweet_id}`,
        metrics: null
      }));

      res.json({
        success: true,
        published: publishedBasic,
        total: publishedBasic.length,
        note: 'Métricas no disponibles temporalmente'
      });
    }
  } catch (error) {
    console.error('Error al obtener tweets publicados:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== DEBUG ENDPOINT (temporal) =====
app.get('/api/debug/slots', async (req, res) => {
  try {
    const { data: allSlots } = await supabase
      .from('slots')
      .select('id, status, content, tweet_id, published_at, scheduled_time')
      .order('scheduled_time', { ascending: false })
      .limit(20);

    const statusCount = {
      empty: 0,
      filled: 0,
      published: 0,
      failed: 0
    };

    allSlots?.forEach(s => {
      statusCount[s.status] = (statusCount[s.status] || 0) + 1;
    });

    res.json({
      success: true,
      totalSlots: allSlots?.length || 0,
      statusCount,
      recent20: allSlots?.map(s => ({
        id: s.id,
        status: s.status,
        content: s.content?.substring(0, 50),
        tweet_id: s.tweet_id,
        published_at: s.published_at,
        scheduled_time: s.scheduled_time
      }))
    });
  } catch (error) {
    console.error('Error en debug:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== ANALYTICS DASHBOARD =====
app.get('/api/analytics', async (req, res) => {
  try {
    // Obtener todos los slots publicados con tweet_id
    const { data: publishedSlots } = await supabase
      .from('slots')
      .select('*')
      .eq('status', 'published')
      .not('tweet_id', 'is', null)
      .order('published_at', { ascending: false });

    if (!publishedSlots || publishedSlots.length === 0) {
      return res.json({
        success: true,
        analytics: {
          totalTweets: 0,
          message: 'No hay tweets publicados aún'
        }
      });
    }

    // Obtener métricas de Twitter API para cada tweet
    const tweetIds = publishedSlots.map(s => s.tweet_id);
    const client = getTwitterClient();
    const tweets = client
      ? await client.readOnly.v2.tweets(tweetIds, {
          'tweet.fields': ['public_metrics', 'created_at', 'author_id'],
        })
      : { data: [] };

    // Mapear métricas con slots
    const tweetsWithMetrics = publishedSlots.map(slot => {
      const tweetData = tweets.data.find(t => t.id === slot.tweet_id);
      return {
        ...slot,
        metrics: tweetData?.public_metrics || null,
        created_at: tweetData?.created_at || slot.published_at
      };
    }).filter(t => t.metrics !== null);

    // ===== ANÁLISIS AVANZADO =====

    // Calcular engagement rate para cada tweet
    const tweetsWithEngagement = tweetsWithMetrics.map(tweet => {
      const metrics = tweet.metrics;
      const engagements = metrics.retweet_count + metrics.reply_count + metrics.like_count;
      const engagementRate = metrics.impression_count > 0
        ? (engagements / metrics.impression_count) * 100
        : 0;

      return {
        ...tweet,
        engagementRate,
        totalEngagements: engagements
      };
    });

    // Ordenar por engagement rate
    const sortedByEngagement = [...tweetsWithEngagement].sort((a, b) => b.engagementRate - a.engagementRate);

    // Top & Worst tweets
    const bestTweet = sortedByEngagement[0];
    const worstTweet = sortedByEngagement[sortedByEngagement.length - 1];

    // Análisis por horario
    const hourlyPerformance = {};
    tweetsWithEngagement.forEach(tweet => {
      const hour = new Date(tweet.scheduled_time).getHours();
      if (!hourlyPerformance[hour]) {
        hourlyPerformance[hour] = {
          count: 0,
          totalEngagement: 0,
          totalImpressions: 0
        };
      }
      hourlyPerformance[hour].count++;
      hourlyPerformance[hour].totalEngagement += tweet.totalEngagements;
      hourlyPerformance[hour].totalImpressions += tweet.metrics.impression_count;
    });

    // Calcular engagement rate promedio por hora
    const hourlyStats = Object.entries(hourlyPerformance).map(([hour, stats]) => ({
      hour: parseInt(hour),
      avgEngagementRate: (stats.totalEngagement / stats.totalImpressions) * 100,
      count: stats.count
    })).sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

    const bestHour = hourlyStats[0];
    const worstHour = hourlyStats[hourlyStats.length - 1];

    // Filtros temporales
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const todayTweets = tweetsWithEngagement.filter(t => new Date(t.published_at) >= today);
    const weekTweets = tweetsWithEngagement.filter(t => new Date(t.published_at) >= weekAgo);
    const monthTweets = tweetsWithEngagement.filter(t => new Date(t.published_at) >= monthAgo);

    // Calcular promedios
    const calculateAvg = (tweets) => {
      if (tweets.length === 0) return null;
      const total = tweets.reduce((acc, t) => ({
        engagements: acc.engagements + t.totalEngagements,
        impressions: acc.impressions + t.metrics.impression_count,
        likes: acc.likes + t.metrics.like_count,
        retweets: acc.retweets + t.metrics.retweet_count,
        replies: acc.replies + t.metrics.reply_count
      }), { engagements: 0, impressions: 0, likes: 0, retweets: 0, replies: 0 });

      return {
        count: tweets.length,
        avgEngagementRate: (total.engagements / total.impressions) * 100,
        totalImpressions: total.impressions,
        totalLikes: total.likes,
        totalRetweets: total.retweets,
        totalReplies: total.replies,
        totalEngagements: total.engagements
      };
    };

    const todayStats = calculateAvg(todayTweets);
    const weekStats = calculateAvg(weekTweets);
    const monthStats = calculateAvg(monthTweets);

    // Análisis de contenido (palabras más efectivas)
    const wordPerformance = {};
    tweetsWithEngagement.forEach(tweet => {
      const words = tweet.content.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      words.forEach(word => {
        if (!wordPerformance[word]) {
          wordPerformance[word] = {
            count: 0,
            totalEngagement: 0
          };
        }
        wordPerformance[word].count++;
        wordPerformance[word].totalEngagement += tweet.engagementRate;
      });
    });

    const topWords = Object.entries(wordPerformance)
      .map(([word, stats]) => ({
        word,
        avgEngagement: stats.totalEngagement / stats.count,
        count: stats.count
      }))
      .filter(w => w.count >= 2)
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 10);

    // Respuesta final
    res.json({
      success: true,
      analytics: {
        overview: {
          totalTweets: tweetsWithEngagement.length,
          avgEngagementRate: weekStats?.avgEngagementRate || 0,
          totalImpressions: monthStats?.totalImpressions || 0,
          totalEngagements: monthStats?.totalEngagements || 0
        },
        bestPerformers: {
          tweet: {
            content: bestTweet.content.substring(0, 100),
            engagementRate: bestTweet.engagementRate.toFixed(2),
            likes: bestTweet.metrics.like_count,
            retweets: bestTweet.metrics.retweet_count,
            impressions: bestTweet.metrics.impression_count,
            publishedAt: bestTweet.published_at
          },
          hour: {
            hour: bestHour.hour,
            avgEngagementRate: bestHour.avgEngagementRate.toFixed(2),
            count: bestHour.count
          }
        },
        worstPerformers: {
          tweet: {
            content: worstTweet.content.substring(0, 100),
            engagementRate: worstTweet.engagementRate.toFixed(2),
            likes: worstTweet.metrics.like_count,
            retweets: worstTweet.metrics.retweet_count,
            impressions: worstTweet.metrics.impression_count,
            publishedAt: worstTweet.published_at
          },
          hour: {
            hour: worstHour.hour,
            avgEngagementRate: worstHour.avgEngagementRate.toFixed(2),
            count: worstHour.count
          }
        },
        timeframes: {
          today: todayStats,
          week: weekStats,
          month: monthStats
        },
        hourlyPerformance: hourlyStats,
        topWords,
        recentTweets: tweetsWithEngagement.slice(0, 10).map(t => ({
          content: t.content.substring(0, 100),
          engagementRate: t.engagementRate.toFixed(2),
          metrics: t.metrics,
          publishedAt: t.published_at
        }))
      }
    });

  } catch (error) {
    console.error('Error en analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== AUTO-PUBLISHER =====
async function checkAndPublishScheduledPosts() {
  try {
    const now = DateTime.utc();

    const { data: slots } = await supabase
      .from('slots')
      .select('*')
      .eq('status', 'filled')
      .lte('scheduled_time', now.toISO());

    if (!slots || slots.length === 0) return;

    console.log(`\n📤 Publicando ${slots.length} tweets...`);
    console.log(`⏰ Timestamp: ${now.toISO()}`);

    // Debug: Mostrar todos los slots que se van a publicar
    slots.forEach((s, idx) => {
      console.log(`  ${idx + 1}. Slot #${s.id} - "${s.content.substring(0, 40)}..."`);
    });

    for (const slot of slots) {
      let tweetId = null;
      let twitterSuccess = false;

      console.log(`\n--- SLOT #${slot.id} | Status: ${slot.status} | Scheduled: ${slot.scheduled_time} ---`);

      // Step 1: Try to publish to Twitter
      try {
        const client = getTwitterClient();
        if (!client) throw new Error('Twitter client not configured');
        console.log(`📤 Intentando publicar: "${slot.content.substring(0, 50)}..."`);
        const tweet = await client.readWrite.v2.tweet(slot.content);

        // Verificar que obtuvimos un tweet ID válido
        if (tweet && tweet.data && tweet.data.id) {
          tweetId = tweet.data.id;
          twitterSuccess = true;
          console.log(`✅ Publicado en Twitter (ID: ${tweetId})`);
        } else {
          // Twitter respondió pero sin ID válido
          console.error(`⚠️  Twitter respondió sin ID válido:`, JSON.stringify(tweet));
          throw new Error('Twitter no devolvió un ID de tweet válido');
        }
      } catch (twitterError) {
        console.error(`\n⚠️  ERROR EN SLOT #${slot.id}`);
        console.error(`Error code:`, twitterError.code);
        console.error(`Error mensaje:`, twitterError.message);

        // CRITICAL: Errores 403/429 pueden significar que el tweet SÍ se publicó
        // Verificar si el tweet realmente está en Twitter antes de marcarlo como fallido
        const errorCode = twitterError.code || twitterError.statusCode;
        if (errorCode === 403 || errorCode === 429 || twitterError.message?.includes('403') || twitterError.message?.includes('429')) {
          console.log(`\n🔍 Error 403/429 detectado. Verificando si el tweet se publicó de todos modos...`);

          try {
            // Esperar 3 segundos para dar tiempo a que Twitter procese
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Buscar el tweet en el timeline del usuario
            const client2 = getTwitterClient();
            if (!client2) throw new Error('Twitter client not configured');
            const userTweets = await client2.readOnly.v2.userTimeline('101048650', {
              max_results: 10,
              'tweet.fields': ['created_at', 'text']
            });

            // Buscar si alguno de los tweets recientes coincide con el contenido
            const matchingTweet = userTweets.data?.data?.find(t =>
              t.text === slot.content || t.text.includes(slot.content.substring(0, 100))
            );

            if (matchingTweet) {
              // ✅ EL TWEET SÍ SE PUBLICÓ! Marcarlo como exitoso
              tweetId = matchingTweet.id;
              twitterSuccess = true;
              console.log(`✅ RECUPERADO: Tweet SÍ se publicó a pesar del error (ID: ${tweetId})`);

              // Actualizar en DB como publicado
              await supabase
                .from('slots')
                .update({
                  status: 'published',
                  published_at: now.toISO(),
                  tweet_id: tweetId,
                  error_message: `Published despite ${errorCode} error (recovered)`
                })
                .eq('id', slot.id);

              console.log(`✅ Estado actualizado en DB como publicado`);
              continue; // Siguiente slot
            } else {
              console.log(`❌ Tweet NO encontrado en timeline. Error legítimo.`);
            }
          } catch (verifyError) {
            console.error(`⚠️  No se pudo verificar si el tweet se publicó:`, verifyError.message);
          }
        }

        // Si llegamos aquí, el error es legítimo - marcar como fallido
        try {
          await supabase
            .from('slots')
            .update({
              status: 'failed',
              error_message: `Twitter error ${errorCode || 'unknown'}: ${twitterError.message}`
            })
            .eq('id', slot.id);
          console.log(`❌ Slot marcado como fallido`);
        } catch (dbError) {
          console.error(`⚠️  No se pudo actualizar estado fallido en DB:`, dbError.message);
        }

        continue; // Skip to next slot
      }

      // Step 2: If we got here, Twitter succeeded - MUST mark as published
      if (twitterSuccess && tweetId) {
        try {
          await supabase
            .from('slots')
            .update({
              status: 'published',
              published_at: now.toISO(),
              tweet_id: tweetId
            })
            .eq('id', slot.id);

          console.log(`✅ Estado actualizado en DB`);
        } catch (dbError) {
          // Critical: Tweet is live but DB update failed
          console.error(`⚠️  CRÍTICO: Tweet publicado (${tweetId}) pero DB update falló:`, dbError.message);
          console.error(`⚠️  El tweet SÍ está publicado en Twitter pero el sistema no lo refleja`);

          // Try to mark as published anyway, even with partial info
          try {
            await supabase
              .from('slots')
              .update({
                status: 'published',
                published_at: now.toISO(),
                tweet_id: tweetId,
                error_message: `Published but DB error: ${dbError.message}`
              })
              .eq('id', slot.id);
          } catch (retryError) {
            console.error(`⚠️  Retry failed. Manual intervention needed for slot ${slot.id}, tweet ${tweetId}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error en auto-publisher:', error);
  }
}

// Verificar cada minuto
cron.schedule('* * * * *', checkAndPublishScheduledPosts);

// ===== CONFIGURATION MANAGEMENT =====

// Initialize default prompts on startup
async function initializeDefaultPrompts() {
  try {
    // Check if any prompts exist
    const { data: existingPrompts, error } = await supabase
      .from('prompts')
      .select('id')
      .limit(1);
    
    if (error) {
      console.error('Error checking existing prompts:', error);
      return;
    }
    
    // No default system prompt - users must configure their own prompts
  } catch (error) {
    console.error('Error initializing default prompts:', error);
  }
}

// Get current configuration
app.get('/api/config', async (req, res) => {
  try {
    const config = configManager.getAll();
    // Remove sensitive data from response
    const safeConfig = {
      ...config,
      llm: {
        ...config.llm,
        apiKey: config.llm.apiKey ? '***' : ''
      },
      api: {
        twitter: {
          apiKey: config.api.twitter.apiKey ? '***' : '',
          apiSecret: config.api.twitter.apiSecret ? '***' : '',
          accessToken: config.api.twitter.accessToken ? '***' : '',
          accessSecret: config.api.twitter.accessSecret ? '***' : ''
        },
        supabase: {
          url: config.api.supabase.url,
          anonKey: config.api.supabase.anonKey ? '***' : ''
        }
      }
    };
    res.json({ 
      success: true, 
      config: safeConfig,
      storage_type: useSupabase ? 'supabase' : 'local'
    });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update configuration
app.post('/api/config', async (req, res) => {
  try {
    const { path, value } = req.body;
    if (!path) {
      return res.status(400).json({ success: false, error: 'Path is required' });
    }
    
    configManager.set(path, value);
    res.json({ success: true, message: 'Configuration updated' });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check for unsaved changes (must come before /api/config/:section)
app.get('/api/config/status', async (req, res) => {
  try {
    const hasUnsavedChanges = configManager.hasUnsavedChanges();
    res.json({ success: true, hasUnsavedChanges });
  } catch (error) {
    console.error('Error checking config status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export configuration (must come before /api/config/:section)
app.get('/api/config/export', async (req, res) => {
  try {
    const configJson = await configManager.exportConfig();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="xschedule-config.json"');
    res.send(configJson);
  } catch (error) {
    console.error('Error exporting config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get configuration by section
app.get('/api/config/:section', async (req, res) => {
  try {
    const { section } = req.params;
    const config = configManager.get(section);
    
    if (config === undefined) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }
    
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error getting config section:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save prompt
app.post('/api/config/prompts', async (req, res) => {
  try {
    const promptData = req.body;
    
    // If this prompt should be active, deactivate all others first
    if (promptData.is_active) {
      const { error: deactivateError } = await supabase
        .from('prompts')
        .update({ is_active: false })
        .neq('id', promptData.id || '');
      
      if (deactivateError) {
        console.error('Error deactivating other prompts:', deactivateError);
      }
    }
    
    // Save to Supabase - use proper schema
    const promptRecord = {
      id: promptData.id,
      name: promptData.name,
      content: promptData.content,
      variables: promptData.variables || [],
      is_active: promptData.is_active || false,
      updated_at: new Date().toISOString()
    };
    
    // Only set created_at for new records
    if (!promptData.id) {
      promptRecord.created_at = new Date().toISOString();
    }
    
    const { data: prompt, error } = await supabase
      .from('prompts')
      .upsert(promptRecord)
      .select()
      .single();
    
    if (error) {
      console.error('Error saving prompt to Supabase:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    // If this prompt is active, update the local configuration
    if (promptData.is_active) {
      configManager.set('prompts.current', {
        id: prompt.id,
        name: prompt.name,
        content: prompt.content,
        variables: prompt.variables
      });
      console.log(`[CONFIG] Updated current prompt: ${prompt.name}`);
    }
    
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Error saving prompt:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get prompt history
app.get('/api/config/prompts/history', async (req, res) => {
  try {
    const history = configManager.getPromptHistory();
    res.json({ success: true, history });
  } catch (error) {
    console.error('Error getting prompt history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Load prompt from history
app.post('/api/config/prompts/history/:promptId', async (req, res) => {
  try {
    const { promptId } = req.params;
    const prompt = configManager.loadPromptFromHistory(promptId);
    
    if (!prompt) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }
    
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Error loading prompt from history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get prompt presets
app.get('/api/config/prompts/presets', async (req, res) => {
  try {
    const presets = configManager.getPromptPresets();
    res.json({ success: true, presets });
  } catch (error) {
    console.error('Error getting prompt presets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current prompt
app.get('/api/config/prompts/current', async (req, res) => {
  try {
    // Get the current prompt from configManager
    const currentPrompt = await configManager.getCurrentPrompt();
    res.json({ success: true, prompt: currentPrompt });
  } catch (error) {
    console.error('Error getting current prompt:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Set current prompt
app.post('/api/config/prompts/current/:promptId', async (req, res) => {
  try {
    const { promptId } = req.params;
    
    // First, deactivate all prompts
    const { error: deactivateError } = await supabase
      .from('prompts')
      .update({ is_active: false })
      .eq('is_active', true); // Only update currently active prompts
    
    if (deactivateError) {
      console.error('Error deactivating prompts:', deactivateError);
      return res.status(500).json({ success: false, error: deactivateError.message });
    }
    
    // Activate the selected prompt
    const { data: prompt, error: activateError } = await supabase
      .from('prompts')
      .update({ is_active: true })
      .eq('id', promptId)
      .select()
      .single();
    
    if (activateError) {
      console.error('Error activating prompt:', activateError);
      return res.status(500).json({ success: false, error: activateError.message });
    }
    
    if (!prompt) {
      return res.status(404).json({ success: false, error: 'Prompt not found' });
    }
    
    // Update local configuration
    configManager.set('prompts.current', {
      id: prompt.id,
      name: prompt.name,
      content: prompt.content,
      variables: prompt.variables
    });
    
    console.log(`[CONFIG] Set current prompt: ${prompt.name}`);
    
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Error setting current prompt:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all prompts
app.get('/api/config/prompts', async (req, res) => {
  try {
    if (!useSupabase) {
      // Fallback to local config
      const config = configManager.getAll();
      return res.json({ 
        success: true, 
        prompts: config.prompts || {},
        storage_type: 'local'
      });
    }
    
    const { data: prompts, error } = await supabase
      .from('prompts')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error('Error getting prompts from Supabase:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    // Convert array to object format for frontend compatibility
    const promptsObject = {};
    prompts.forEach(prompt => {
      promptsObject[prompt.id] = prompt;
    });
    
    res.json({ 
      success: true, 
      prompts: promptsObject,
      storage_type: 'supabase'
    });
  } catch (error) {
    console.error('Error getting prompts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add prompt preset
app.post('/api/config/prompts/presets', async (req, res) => {
  try {
    const presetData = req.body;
    const preset = configManager.addPromptPreset(presetData);
    res.json({ success: true, preset });
  } catch (error) {
    console.error('Error adding prompt preset:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove prompt preset
app.delete('/api/config/prompts/presets/:presetId', async (req, res) => {
  try {
    const { presetId } = req.params;
    const removed = configManager.removePromptPreset(presetId);
    
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Preset not found' });
    }
    
    res.json({ success: true, removed });
  } catch (error) {
    console.error('Error removing prompt preset:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete individual prompt
app.delete('/api/config/prompts/:promptId', async (req, res) => {
  try {
    const { promptId } = req.params;
    
    // Delete from Supabase
    const { error } = await supabase
      .from('prompts')
      .delete()
      .eq('id', promptId);
    
    if (error) {
      console.error('Error deleting prompt from Supabase:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
    res.json({ success: true, message: 'Prompt deleted successfully' });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import configuration
app.post('/api/config/import', async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ success: false, error: 'Config data is required' });
    }
    
    await configManager.importConfig(JSON.stringify(config));
    res.json({ success: true, message: 'Configuration imported successfully' });
  } catch (error) {
    console.error('Error importing config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// TEMPORARY: Create prompts table endpoint
app.post('/api/admin/create-prompts-table', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not available' });
    }

    console.log('Creating prompts table...');
    
    // Use the server's own Supabase connection to create the table
    // This will work because the server is already connected to Supabase
    try {
      // Try to query the prompts table first to see if it exists
      const { data: existingPrompts, error: checkError } = await supabase
        .from('prompts')
        .select('*')
        .limit(1);
      
      if (!checkError) {
        console.log('✅ Prompts table already exists!');
        return res.json({ success: true, message: 'Prompts table already exists' });
      }
      
      // If we get here, the table doesn't exist
      console.log('Table does not exist, attempting to create...');
      
      // Since we can't execute raw SQL, let's try to use the Supabase JS client
      // to create the table by using the underlying connection
      const { data: tableData, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'prompts');
      
      if (tableError) {
        console.error('Error checking table existence:', tableError);
        return res.status(500).json({ success: false, error: 'Cannot check table existence' });
      }
      
      if (tableData && tableData.length > 0) {
        console.log('Table exists in information_schema');
        return res.json({ success: true, message: 'Table exists in information_schema' });
      }
      
      // Table doesn't exist and we can't create it via API
      // We need to use the Supabase dashboard or SQL editor
      console.error('Cannot create table via API. Please use Supabase dashboard.');
      return res.status(500).json({ 
        success: false, 
        error: 'Cannot create table via API. Please use Supabase SQL editor with this SQL:\n\n' +
          'CREATE TABLE IF NOT EXISTS public.prompts (\n' +
          '  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n' +
          '  name TEXT NOT NULL,\n' +
          '  content TEXT NOT NULL,\n' +
          '  is_active BOOLEAN DEFAULT false,\n' +
          '  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),\n' +
          '  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),\n' +
          '  UNIQUE(name)\n' +
          ');\n\n' +
          'GRANT SELECT ON public.prompts TO anon;\n' +
          'GRANT ALL ON public.prompts TO authenticated;'
      });
      
    } catch (error) {
      console.error('Error in table creation attempt:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    
  } catch (error) {
    console.error('Unexpected error creating table:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// AI Generation proxy endpoint with prompt injection
app.post('/api/generate', async (req, res) => {
  try {
    const { mode, prompt, promptId, promptVariables } = req.body;
    
    // Get the appropriate prompt based on mode and configuration
    let finalPrompt = prompt;
    
    if (!finalPrompt) {
      // Try to get mode-specific prompt from Supabase first
      const modePrompt = await configManager.getPromptByMode(mode);
      if (modePrompt && modePrompt.content) {
        finalPrompt = modePrompt.content;
        console.log(`Using ${mode}-specific prompt from Supabase: ${modePrompt.name}`);
      } else {
        // Fallback to current configured prompt
        const currentPrompt = await configManager.getCurrentPrompt();
        if (currentPrompt && currentPrompt.content) {
          finalPrompt = currentPrompt.content;
        }
      }
    }
    
    // Replace variables in the prompt if promptVariables are provided
    if (finalPrompt && promptVariables && typeof promptVariables === 'object') {
      Object.keys(promptVariables).forEach(key => {
        const placeholder = `{${key}}`;
        const value = String(promptVariables[key]);
        // Escape special regex characters in the placeholder
        const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        finalPrompt = finalPrompt.replace(new RegExp(escapedPlaceholder, 'g'), value);
      });
      console.log(`Variables replaced in prompt: ${JSON.stringify(promptVariables)}`);
    }
    
    // Prepare the request for Marco Voice Engine
    const requestBody = {
      mode,
      prompt: finalPrompt || undefined // Only include if we have a prompt
    };
    
    // Log the prompt being used for debugging
    console.log(`AI Generation request - Mode: ${mode}, Prompt ID: ${promptId || 'default'}, Has custom prompt: ${!!finalPrompt}`);
    console.log(`Final prompt being sent to Marco Voice Engine: ${finalPrompt ? finalPrompt.substring(0, 100) + '...' : 'none'}`);
    
    // Forward to Marco Voice Engine
    const response = await fetch('https://marco-voice-engine.fly.dev/generate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'XSchedule-X/1.0'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Marco Voice Engine error:', errorData);
      return res.status(response.status).json({ 
        success: false, 
        error: `Marco Voice Engine error: ${errorData}` 
      });
    }
    
    const data = await response.json();
    
    // Log successful generation
    console.log(`AI Generation successful - Received ${data.variants?.length || 0} variants`);
    
    res.json(data);
    
  } catch (error) {
    console.error('AI Generation proxy error:', error);
    res.status(500).json({ 
      success: false, 
      error: `Generation error: ${error.message}` 
    });
  }
});

// Reset to defaults
app.post('/api/config/reset', async (req, res) => {
  try {
    await configManager.resetToDefaults();
    res.json({ success: true, message: 'Configuration reset to defaults' });
  } catch (error) {
    console.error('Error resetting config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 XSchedule-X corriendo en http://localhost:${PORT}`);
  console.log('📅 Sistema de publicación automática activo\n');
  
  // Initialize default prompts after server is running and Supabase is configured
  if (supabase) {
    initializeDefaultPrompts();
  } else {
    console.log('⚠️  Supabase no configurado - los prompts se almacenarán localmente');
  }
});
