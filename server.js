import express from 'express';
import { TwitterApi } from 'twitter-api-v2';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { supabase, getAuthenticatedClient } from './lib/supabase.js';
import { encryptTwitterCredentials, decryptTwitterCredentials } from './lib/encryption.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ===== MIDDLEWARE DE AUTENTICACIÓN =====
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    req.user = user;
    req.token = token;
    req.supabase = getAuthenticatedClient(token);
    next();
  } catch (error) {
    console.error('Error en auth middleware:', error);
    res.status(401).json({ error: 'No autorizado' });
  }
}

// ===== ENDPOINTS DE AUTENTICACIÓN =====

// Registro
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    res.json({
      success: true,
      session: data.session,
      user: data.user
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(400).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    res.json({
      success: true,
      session: data.session,
      user: data.user
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(400).json({ error: error.message });
  }
});

// Logout
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    await req.supabase.auth.signOut();
    res.json({ success: true });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(400).json({ error: error.message });
  }
});

// Obtener usuario actual
app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// ===== CREDENCIALES DE TWITTER =====

// Guardar credenciales de Twitter
app.post('/api/twitter/credentials', requireAuth, async (req, res) => {
  try {
    const { apiKey, apiSecret, accessToken, accessSecret } = req.body;

    // Encriptar credenciales
    const encrypted = encryptTwitterCredentials({
      apiKey,
      apiSecret,
      accessToken,
      accessSecret
    });

    // Insertar o actualizar en Supabase
    const { data, error } = await req.supabase
      .from('twitter_credentials')
      .upsert({
        user_id: req.user.id,
        ...encrypted
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error al guardar credenciales:', error);
    res.status(500).json({ error: 'Error al guardar credenciales' });
  }
});

// Verificar si el usuario tiene credenciales
app.get('/api/twitter/credentials/check', requireAuth, async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('twitter_credentials')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    res.json({ hasCredentials: !!data });
  } catch (error) {
    console.error('Error al verificar credenciales:', error);
    res.status(500).json({ error: 'Error al verificar credenciales' });
  }
});

// ===== ALGORITMO DE DISTRIBUCIÓN INTELIGENTE =====
function calculateOptimalSlots(totalSlots, workStart, workEnd, timezone, startDate) {
  const slots = [];

  const [startHour, startMinute] = workStart.split(':').map(Number);
  const [endHour, endMinute] = workEnd.split(':').map(Number);

  const workMinutesPerDay = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  const maxSlotsPerDay = Math.min(8, Math.floor(workMinutesPerDay / 60));
  const slotsPerDay = Math.min(maxSlotsPerDay, totalSlots);
  const totalDays = Math.ceil(totalSlots / slotsPerDay);
  const intervalMinutes = Math.floor(workMinutesPerDay / slotsPerDay);

  const start = new Date(startDate);
  start.setHours(startHour, startMinute, 0, 0);

  let currentDate = new Date(start);
  let slotsCreated = 0;

  for (let day = 0; day < totalDays && slotsCreated < totalSlots; day++) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(startHour, startMinute, 0, 0);
      continue;
    }

    const slotsForToday = Math.min(slotsPerDay, totalSlots - slotsCreated);

    for (let i = 0; i < slotsForToday; i++) {
      slots.push({
        slot_index: slotsCreated,
        scheduled_time: new Date(currentDate).toISOString(),
        status: 'empty',
        content: null
      });

      slotsCreated++;
      currentDate = new Date(currentDate.getTime() + intervalMinutes * 60 * 1000);

      if (currentDate.getHours() >= endHour) {
        break;
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(startHour, startMinute, 0, 0);
  }

  return slots;
}

// ===== ENDPOINTS DE TIMELINES =====

// Obtener todos los timelines del usuario
app.get('/api/timelines', requireAuth, async (req, res) => {
  try {
    const { data: timelines, error } = await req.supabase
      .from('timelines')
      .select('*, slots(*)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ timelines });
  } catch (error) {
    console.error('Error al obtener timelines:', error);
    res.status(500).json({ error: 'Error al obtener timelines' });
  }
});

// Obtener un timeline específico
app.get('/api/timelines/:id', requireAuth, async (req, res) => {
  try {
    const { data: timeline, error } = await req.supabase
      .from('timelines')
      .select('*, slots(*)')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error) throw error;

    if (!timeline) {
      return res.status(404).json({ error: 'Timeline no encontrado' });
    }

    // Ordenar slots por índice
    timeline.slots.sort((a, b) => a.slot_index - b.slot_index);

    res.json({ timeline });
  } catch (error) {
    console.error('Error al obtener timeline:', error);
    res.status(500).json({ error: 'Error al obtener timeline' });
  }
});

// Crear timeline
app.post('/api/timelines/create', requireAuth, async (req, res) => {
  try {
    const { name, totalSlots, workStart, workEnd, timezone, startDate } = req.body;

    // Crear timeline
    const { data: timeline, error: timelineError } = await req.supabase
      .from('timelines')
      .insert({
        user_id: req.user.id,
        name: name || 'Mi Timeline',
        total_slots: totalSlots,
        work_start: workStart,
        work_end: workEnd,
        timezone,
        start_date: startDate
      })
      .select()
      .single();

    if (timelineError) throw timelineError;

    // Calcular slots óptimos
    const slotsData = calculateOptimalSlots(
      totalSlots,
      workStart,
      workEnd,
      timezone,
      startDate
    );

    // Agregar timeline_id a cada slot
    const slotsToInsert = slotsData.map(slot => ({
      ...slot,
      timeline_id: timeline.id
    }));

    // Insertar slots
    const { data: slots, error: slotsError } = await req.supabase
      .from('slots')
      .insert(slotsToInsert)
      .select();

    if (slotsError) throw slotsError;

    timeline.slots = slots;

    res.json({
      success: true,
      timeline
    });
  } catch (error) {
    console.error('Error al crear timeline:', error);
    res.status(500).json({ error: 'Error al crear timeline' });
  }
});

// Agregar publicación al próximo slot
app.post('/api/timelines/:id/add-post', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    const timelineId = req.params.id;

    // Verificar que el timeline pertenece al usuario
    const { data: timeline, error: timelineError } = await req.supabase
      .from('timelines')
      .select('id')
      .eq('id', timelineId)
      .eq('user_id', req.user.id)
      .single();

    if (timelineError || !timeline) {
      return res.status(404).json({ error: 'Timeline no encontrado' });
    }

    // Encontrar próximo slot vacío
    const { data: emptySlot, error: slotError } = await req.supabase
      .from('slots')
      .select('*')
      .eq('timeline_id', timelineId)
      .eq('status', 'empty')
      .order('slot_index', { ascending: true })
      .limit(1)
      .single();

    if (slotError || !emptySlot) {
      return res.status(400).json({ error: 'No hay slots disponibles' });
    }

    // Actualizar slot
    const { data: updatedSlot, error: updateError } = await req.supabase
      .from('slots')
      .update({
        status: 'filled',
        content,
        filled_at: new Date().toISOString()
      })
      .eq('id', emptySlot.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Obtener timeline completo actualizado
    const { data: fullTimeline } = await req.supabase
      .from('timelines')
      .select('*, slots(*)')
      .eq('id', timelineId)
      .single();

    fullTimeline.slots.sort((a, b) => a.slot_index - b.slot_index);

    res.json({
      success: true,
      timeline: fullTimeline
    });
  } catch (error) {
    console.error('Error al agregar publicación:', error);
    res.status(500).json({ error: 'Error al agregar publicación' });
  }
});

// Eliminar publicación de un slot
app.delete('/api/timelines/:id/slots/:slotId', requireAuth, async (req, res) => {
  try {
    const { id: timelineId, slotId } = req.params;

    // Verificar que el slot pertenece al timeline del usuario
    const { data: slot, error: slotError } = await req.supabase
      .from('slots')
      .select('*, timelines!inner(user_id)')
      .eq('id', slotId)
      .eq('timeline_id', timelineId)
      .single();

    if (slotError || !slot || slot.timelines.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Slot no encontrado' });
    }

    // Vaciar el slot
    const { error: updateError } = await req.supabase
      .from('slots')
      .update({
        status: 'empty',
        content: null,
        filled_at: null
      })
      .eq('id', slotId);

    if (updateError) throw updateError;

    // Obtener timeline completo actualizado
    const { data: fullTimeline } = await req.supabase
      .from('timelines')
      .select('*, slots(*)')
      .eq('id', timelineId)
      .single();

    fullTimeline.slots.sort((a, b) => a.slot_index - b.slot_index);

    res.json({
      success: true,
      timeline: fullTimeline
    });
  } catch (error) {
    console.error('Error al eliminar publicación:', error);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
});

// Eliminar timeline
app.delete('/api/timelines/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar propiedad y eliminar (CASCADE eliminará los slots automáticamente)
    const { error } = await req.supabase
      .from('timelines')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar timeline:', error);
    res.status(500).json({ error: 'Error al eliminar timeline' });
  }
});

// ===== AUTO-PUBLISHER =====
async function checkAndPublishScheduledPosts() {
  try {
    const now = new Date();

    // Obtener todos los slots que están listos para publicar
    const { data: slots, error } = await supabase
      .from('slots')
      .select('*, timelines!inner(user_id)')
      .eq('status', 'filled')
      .lte('scheduled_time', now.toISOString());

    if (error) {
      console.error('Error al obtener slots:', error);
      return;
    }

    if (!slots || slots.length === 0) return;

    console.log(`📤 Procesando ${slots.length} publicaciones pendientes...`);

    for (const slot of slots) {
      try {
        const userId = slot.timelines.user_id;

        // Obtener credenciales del usuario
        const { data: credentials, error: credError } = await supabase
          .from('twitter_credentials')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (credError || !credentials) {
          console.error(`❌ Usuario ${userId} no tiene credenciales de Twitter`);
          await supabase
            .from('slots')
            .update({
              status: 'failed',
              error_message: 'No se encontraron credenciales de Twitter'
            })
            .eq('id', slot.id);
          continue;
        }

        // Desencriptar credenciales
        const decrypted = decryptTwitterCredentials(credentials);

        // Crear cliente de Twitter para este usuario
        const userTwitterClient = new TwitterApi({
          appKey: decrypted.apiKey,
          appSecret: decrypted.apiSecret,
          accessToken: decrypted.accessToken,
          accessSecret: decrypted.accessSecret
        });

        // Publicar tweet
        console.log(`📤 Publicando para usuario ${userId}: "${slot.content.substring(0, 50)}..."`);
        await userTwitterClient.readWrite.v2.tweet(slot.content);

        // Marcar como publicado
        await supabase
          .from('slots')
          .update({
            status: 'published',
            published_at: now.toISOString()
          })
          .eq('id', slot.id);

        console.log(`✅ Publicación exitosa`);
      } catch (error) {
        console.error(`❌ Error al publicar slot ${slot.id}:`, error.message);

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
    console.error('Error en checkAndPublishScheduledPosts:', error);
  }
}

// Verificar cada minuto
cron.schedule('* * * * *', checkAndPublishScheduledPosts);

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log(`\n🚀 XSchedule-X (Multi-user) corriendo en http://localhost:${PORT}`);
  console.log('📅 Sistema de publicación automática activo');
  console.log('🔒 Auth con Supabase habilitado');
  console.log('🗄️  Base de datos PostgreSQL persistente\n');
});
