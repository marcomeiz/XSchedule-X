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
function calculateSlots(postsPerDayTarget, intervalHours, workStart, workEnd, timezone) {
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
  // Total de slots a crear = postsPerDayTarget (ahora se interpreta como total deseado)
  // Pero como el usuario dijo "hasta que me canse", vamos a generar para 30 días hacia adelante
  const daysToSchedule = 30;
  let daysScheduled = 0;

  while (daysScheduled < daysToSchedule) {
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
    const { totalSlots, intervalHours, workStart, workEnd, timezone } = req.body;

    // PRESERVAR publicaciones del timeline anterior
    let existingPosts = [];
    const { data: oldTimeline } = await supabase
      .from('timelines')
      .select('id')
      .limit(1)
      .single();

    if (oldTimeline) {
      // Obtener slots llenos ANTES de borrar
      const { data: filledSlots } = await supabase
        .from('slots')
        .select('content, filled_at')
        .eq('timeline_id', oldTimeline.id)
        .eq('status', 'filled')
        .order('slot_index', { ascending: true });

      if (filledSlots && filledSlots.length > 0) {
        existingPosts = filledSlots.map(s => s.content);
        console.log(`📦 Preservando ${existingPosts.length} publicaciones...`);
      }

      // Ahora sí, borrar timeline anterior
      await supabase.from('timelines').delete().eq('id', oldTimeline.id);
    }

    // Crear nuevo timeline
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

    // Calcular slots
    const slotsData = calculateSlots(
      totalSlots,
      intervalHours,
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

    const { data: slots, error: slotsError } = await supabase
      .from('slots')
      .insert(slotsToInsert)
      .select();

    if (slotsError) throw slotsError;

    timeline.slots = slots.sort((a, b) => a.slot_index - b.slot_index);

    const message = existingPosts.length > 0
      ? `Timeline actualizado. ${existingPosts.length} publicaciones preservadas ✅`
      : 'Timeline creado exitosamente';

    res.json({
      success: true,
      timeline,
      message,
      preservedCount: existingPosts.length
    });
  } catch (error) {
    console.error('Error al crear timeline:', error);
    res.status(500).json({ error: error.message });
  }
});

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

    // Obtener el slot para saber a qué timeline pertenece
    const { data: slot } = await supabase
      .from('slots')
      .select('timeline_id')
      .eq('id', slotId)
      .single();

    if (!slot) {
      return res.status(404).json({ error: 'Slot no encontrado' });
    }

    // Vaciar el slot
    await supabase
      .from('slots')
      .update({
        status: 'empty',
        content: null,
        filled_at: null
      })
      .eq('id', slotId);

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

    console.log(`📤 Publicando ${slots.length} tweets...`);

    for (const slot of slots) {
      try {
        console.log(`📤 "${slot.content.substring(0, 50)}..."`);
        const tweet = await twitterClient.readWrite.v2.tweet(slot.content);

        await supabase
          .from('slots')
          .update({
            status: 'published',
            published_at: now.toISO(),
            tweet_id: tweet.data.id
          })
          .eq('id', slot.id);

        console.log(`✅ Publicado (ID: ${tweet.data.id})`);
      } catch (error) {
        console.error(`❌ Error:`, error.message);

        await supabase
          .from('slots')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', slot.id);
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
