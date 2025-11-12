import express from 'express';
import { TwitterApi } from 'twitter-api-v2';
import cron from 'node-cron';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Inicializar Twitter Client
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const rwClient = twitterClient.readWrite;

// Archivo para almacenar timeline
const TIMELINE_FILE = 'timeline.json';

// ===== FUNCIONES DE ALMACENAMIENTO =====
async function loadTimeline() {
  try {
    const data = await fs.readFile(TIMELINE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

async function saveTimeline(timeline) {
  await fs.writeFile(TIMELINE_FILE, JSON.stringify(timeline, null, 2));
}

// ===== ALGORITMO DE DISTRIBUCIÓN INTELIGENTE =====
function calculateOptimalSlots(totalSlots, workStart, workEnd, timezone, startDate) {
  const slots = [];

  // Parsear horas laborales (formato "HH:MM")
  const [startHour, startMinute] = workStart.split(':').map(Number);
  const [endHour, endMinute] = workEnd.split(':').map(Number);

  // Calcular minutos totales en el día laboral
  const workMinutesPerDay = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);

  // Calcular slots por día (máximo 8 para no saturar)
  const maxSlotsPerDay = Math.min(8, Math.floor(workMinutesPerDay / 60));
  const slotsPerDay = Math.min(maxSlotsPerDay, totalSlots);

  // Calcular días necesarios
  const totalDays = Math.ceil(totalSlots / slotsPerDay);

  // Calcular intervalo entre slots en minutos
  const intervalMinutes = Math.floor(workMinutesPerDay / slotsPerDay);

  // Fecha de inicio
  const start = new Date(startDate);
  start.setHours(startHour, startMinute, 0, 0);

  let currentDate = new Date(start);
  let slotsCreated = 0;

  // Horarios óptimos preferidos (en horas): 9am, 12pm, 3pm, 6pm
  const preferredHours = [9, 12, 15, 18];

  for (let day = 0; day < totalDays && slotsCreated < totalSlots; day++) {
    // Saltar fines de semana (opcional)
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(startHour, startMinute, 0, 0);
      continue;
    }

    const slotsForToday = Math.min(slotsPerDay, totalSlots - slotsCreated);

    for (let i = 0; i < slotsForToday; i++) {
      const slot = {
        scheduledTime: new Date(currentDate).toISOString(),
        status: 'empty', // empty, filled, published, failed
        content: null,
        createdAt: new Date().toISOString()
      };

      slots.push(slot);
      slotsCreated++;

      // Avanzar al siguiente slot
      currentDate = new Date(currentDate.getTime() + intervalMinutes * 60 * 1000);

      // Si pasamos la hora de fin, pasar al siguiente día
      if (currentDate.getHours() >= endHour) {
        break;
      }
    }

    // Preparar para el siguiente día
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(startHour, startMinute, 0, 0);
  }

  return slots;
}

// ===== ENDPOINTS =====

// Verificar conexión con Twitter
app.get('/api/verify', async (req, res) => {
  try {
    const me = await rwClient.v2.me();
    res.json({ success: true, user: me.data });
  } catch (error) {
    console.error('Error al verificar credenciales:', error);
    res.status(500).json({
      success: false,
      error: 'Error al verificar credenciales de Twitter',
      details: error.message
    });
  }
});

// Obtener timeline actual
app.get('/api/timeline/current', async (req, res) => {
  try {
    const timeline = await loadTimeline();

    if (timeline) {
      res.json({ timeline });
    } else {
      res.json({ timeline: null });
    }
  } catch (error) {
    console.error('Error al obtener timeline:', error);
    res.status(500).json({ error: 'Error al obtener timeline' });
  }
});

// Crear nuevo timeline
app.post('/api/timeline/create', async (req, res) => {
  try {
    const { totalSlots, workStart, workEnd, timezone, startDate } = req.body;

    if (!totalSlots || !workStart || !workEnd || !timezone) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    // Calcular slots óptimos
    const slots = calculateOptimalSlots(
      totalSlots,
      workStart,
      workEnd,
      timezone,
      startDate
    );

    const timeline = {
      id: Date.now().toString(),
      totalSlots,
      workStart,
      workEnd,
      timezone,
      startDate,
      slots,
      createdAt: new Date().toISOString()
    };

    await saveTimeline(timeline);

    res.json({
      success: true,
      timeline
    });
  } catch (error) {
    console.error('Error al crear timeline:', error);
    res.status(500).json({ error: 'Error al crear timeline' });
  }
});

// Agregar publicación al próximo slot disponible
app.post('/api/timeline/add-post', async (req, res) => {
  try {
    const { timelineId, content } = req.body;

    if (!timelineId || !content) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const timeline = await loadTimeline();

    console.log('📥 Add-post - Recibido timelineId:', timelineId, 'tipo:', typeof timelineId);
    console.log('📋 Timeline cargado - ID:', timeline?.id, 'tipo:', typeof timeline?.id);

    if (!timeline || timeline.id !== timelineId) {
      console.log('❌ IDs no coinciden o timeline null');
      return res.status(404).json({ error: 'Timeline no encontrado' });
    }

    // Encontrar próximo slot vacío
    const emptySlotIndex = timeline.slots.findIndex(slot => slot.status === 'empty');

    if (emptySlotIndex === -1) {
      return res.status(400).json({ error: 'No hay slots disponibles' });
    }

    // Llenar el slot
    timeline.slots[emptySlotIndex].status = 'filled';
    timeline.slots[emptySlotIndex].content = content;
    timeline.slots[emptySlotIndex].filledAt = new Date().toISOString();

    await saveTimeline(timeline);

    res.json({
      success: true,
      timeline
    });
  } catch (error) {
    console.error('Error al agregar publicación:', error);
    res.status(500).json({ error: 'Error al agregar publicación' });
  }
});

// Eliminar publicación de un slot
app.post('/api/timeline/remove-post', async (req, res) => {
  try {
    const { timelineId, slotIndex } = req.body;

    if (!timelineId || slotIndex === undefined) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const timeline = await loadTimeline();

    if (!timeline || timeline.id !== timelineId) {
      return res.status(404).json({ error: 'Timeline no encontrado' });
    }

    if (slotIndex < 0 || slotIndex >= timeline.slots.length) {
      return res.status(400).json({ error: 'Índice de slot inválido' });
    }

    // Vaciar el slot
    timeline.slots[slotIndex].status = 'empty';
    timeline.slots[slotIndex].content = null;
    delete timeline.slots[slotIndex].filledAt;

    await saveTimeline(timeline);

    res.json({
      success: true,
      timeline
    });
  } catch (error) {
    console.error('Error al eliminar publicación:', error);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
});

// Reiniciar timeline
app.post('/api/timeline/reset', async (req, res) => {
  try {
    const { timelineId } = req.body;

    const timeline = await loadTimeline();

    if (!timeline || timeline.id !== timelineId) {
      return res.status(404).json({ error: 'Timeline no encontrado' });
    }

    // Eliminar timeline
    await fs.unlink(TIMELINE_FILE).catch(() => {});

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error al reiniciar timeline:', error);
    res.status(500).json({ error: 'Error al reiniciar timeline' });
  }
});

// ===== PUBLICADOR AUTOMÁTICO =====
async function checkAndPublishScheduledPosts() {
  try {
    const timeline = await loadTimeline();

    if (!timeline) return;

    const now = new Date();
    let updated = false;

    for (const slot of timeline.slots) {
      if (slot.status === 'filled') {
        const scheduledTime = new Date(slot.scheduledTime);

        if (now >= scheduledTime) {
          try {
            console.log(`📤 Publicando: "${slot.content.substring(0, 50)}..."`);
            await rwClient.v2.tweet(slot.content);
            slot.status = 'published';
            slot.publishedAt = now.toISOString();
            updated = true;
            console.log('✅ Publicación exitosa');
          } catch (error) {
            console.error('❌ Error al publicar:', error.message);
            slot.status = 'failed';
            slot.error = error.message;
            updated = true;
          }
        }
      }
    }

    if (updated) {
      await saveTimeline(timeline);
    }
  } catch (error) {
    console.error('Error en checkAndPublishScheduledPosts:', error);
  }
}

// Verificar cada minuto si hay posts para publicar
cron.schedule('* * * * *', checkAndPublishScheduledPosts);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 XSchedule-X corriendo en http://localhost:${PORT}`);
  console.log('📅 Programador inteligente de tweets activo');
  console.log('⚡ Sistema de slots con horarios óptimos\n');
});
