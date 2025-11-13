import express from 'express';
import { TwitterApi } from 'twitter-api-v2';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client (sin auth, single-user)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Twitter client
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET
});

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
    const { data: timeline } = await supabase
      .from('timelines')
      .select('*, slots(*)')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!timeline) {
      return res.json({ timeline: null });
    }

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
    const { content } = req.body;

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

    // Encontrar próximo slot vacío
    const { data: emptySlot } = await supabase
      .from('slots')
      .select('*')
      .eq('timeline_id', timeline.id)
      .eq('status', 'empty')
      .order('slot_index', { ascending: true })
      .limit(1)
      .single();

    if (!emptySlot) {
      return res.status(400).json({ error: 'No hay slots disponibles' });
    }

    // Actualizar slot
    await supabase
      .from('slots')
      .update({
        status: 'filled',
        content,
        filled_at: new Date().toISOString()
      })
      .eq('id', emptySlot.id);

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

    // Obtener el slot para verificar su estado
    const { data: slot } = await supabase
      .from('slots')
      .select('timeline_id, status')
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

    // Obtener todos los slots llenos
    const { data: filledSlots } = await supabase
      .from('slots')
      .select('*')
      .eq('timeline_id', timeline.id)
      .eq('status', 'filled')
      .order('slot_index', { ascending: true });

    if (!filledSlots || filledSlots.length < 2) {
      return res.status(400).json({ error: 'Necesitas al menos 2 publicaciones para mezclar' });
    }

    // Extraer contenidos
    const contents = filledSlots.map(s => s.content);

    // Shuffle Fisher-Yates
    for (let i = contents.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [contents[i], contents[j]] = [contents[j], contents[i]];
    }

    // Actualizar cada slot con el contenido mezclado
    for (let i = 0; i < filledSlots.length; i++) {
      await supabase
        .from('slots')
        .update({ content: contents[i] })
        .eq('id', filledSlots[i].id);
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
    console.error('Error al mezclar:', error);
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

    // Twitter API v2: obtener tweets con métricas
    const tweets = await twitterClient.readOnly.v2.tweets(tweetIds, {
      'tweet.fields': ['public_metrics', 'created_at', 'author_id'],
    });

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
    const now = DateTime.utc(); // Usar UTC para comparaciones

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
        console.log(`📤 Intentando publicar: "${slot.content.substring(0, 50)}..."`);
        const tweet = await twitterClient.readWrite.v2.tweet(slot.content);

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
            const userTweets = await twitterClient.readOnly.v2.userTimeline('101048650', {
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

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log(`\n🚀 XSchedule-X corriendo en http://localhost:${PORT}`);
  console.log('📅 Sistema de publicación automática activo\n');
});
