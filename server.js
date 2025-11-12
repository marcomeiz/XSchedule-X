import express from 'express';
import { TwitterApi } from 'twitter-api-v2';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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
function calculateSlots(totalSlots, intervalHours, workStart, workEnd, timezone) {
  const slots = [];
  const [startHour, startMinute] = workStart.split(':').map(Number);
  const [endHour, endMinute] = workEnd.split(':').map(Number);

  // Comenzar mañana a las workStart
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(startHour, startMinute, 0, 0);

  let currentDate = new Date(start);
  let slotsCreated = 0;

  while (slotsCreated < totalSlots) {
    // Saltar fines de semana
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(startHour, startMinute, 0, 0);
      continue;
    }

    // Crear slot
    slots.push({
      slot_index: slotsCreated,
      scheduled_time: new Date(currentDate).toISOString(),
      status: 'empty',
      content: null
    });

    slotsCreated++;

    // Avanzar por intervalo
    currentDate = new Date(currentDate.getTime() + intervalHours * 60 * 60 * 1000);

    // Si salimos del horario laboral, ir al día siguiente
    if (currentDate.getHours() >= endHour ||
        (currentDate.getHours() === endHour && currentDate.getMinutes() > endMinute)) {
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(startHour, startMinute, 0, 0);
    }
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

    // Borrar timeline anterior si existe
    const { data: oldTimeline } = await supabase
      .from('timelines')
      .select('id')
      .limit(1)
      .single();

    if (oldTimeline) {
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

    // Insertar slots
    const slotsToInsert = slotsData.map(slot => ({
      ...slot,
      timeline_id: timeline.id
    }));

    const { data: slots, error: slotsError } = await supabase
      .from('slots')
      .insert(slotsToInsert)
      .select();

    if (slotsError) throw slotsError;

    timeline.slots = slots.sort((a, b) => a.slot_index - b.slot_index);

    res.json({ success: true, timeline });
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

// ===== AUTO-PUBLISHER =====
async function checkAndPublishScheduledPosts() {
  try {
    const now = new Date();

    const { data: slots } = await supabase
      .from('slots')
      .select('*')
      .eq('status', 'filled')
      .lte('scheduled_time', now.toISOString());

    if (!slots || slots.length === 0) return;

    console.log(`📤 Publicando ${slots.length} tweets...`);

    for (const slot of slots) {
      try {
        console.log(`📤 "${slot.content.substring(0, 50)}..."`);
        await twitterClient.readWrite.v2.tweet(slot.content);

        await supabase
          .from('slots')
          .update({
            status: 'published',
            published_at: now.toISOString()
          })
          .eq('id', slot.id);

        console.log(`✅ Publicado`);
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
