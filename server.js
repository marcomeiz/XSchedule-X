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

// Archivo para almacenar posts programados
const SCHEDULED_POSTS_FILE = 'scheduled-posts.json';

// Funciones de almacenamiento
async function loadScheduledPosts() {
  try {
    const data = await fs.readFile(SCHEDULED_POSTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function saveScheduledPosts(posts) {
  await fs.writeFile(SCHEDULED_POSTS_FILE, JSON.stringify(posts, null, 2));
}

// Endpoint para crear publicaciones programadas
app.post('/api/schedule', async (req, res) => {
  try {
    const { posts, interval, timezone, startTime } = req.body;

    if (!posts || !Array.isArray(posts) || posts.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una publicación' });
    }

    if (!interval || interval <= 0) {
      return res.status(400).json({ error: 'El intervalo debe ser mayor a 0' });
    }

    const scheduledPosts = await loadScheduledPosts();
    const startDate = startTime ? new Date(startTime) : new Date();

    // Crear posts programados con sus horarios
    const newPosts = posts.map((content, index) => {
      const scheduledTime = new Date(startDate.getTime() + (interval * index * 60 * 1000));
      return {
        id: Date.now() + index,
        content,
        scheduledTime: scheduledTime.toISOString(),
        timezone,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
    });

    scheduledPosts.push(...newPosts);
    await saveScheduledPosts(scheduledPosts);

    res.json({
      success: true,
      message: `${newPosts.length} publicaciones programadas correctamente`,
      posts: newPosts
    });
  } catch (error) {
    console.error('Error al programar publicaciones:', error);
    res.status(500).json({ error: 'Error al programar publicaciones' });
  }
});

// Endpoint para obtener publicaciones programadas
app.get('/api/scheduled', async (req, res) => {
  try {
    const posts = await loadScheduledPosts();
    res.json(posts);
  } catch (error) {
    console.error('Error al obtener publicaciones:', error);
    res.status(500).json({ error: 'Error al obtener publicaciones' });
  }
});

// Endpoint para eliminar una publicación programada
app.delete('/api/scheduled/:id', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    let posts = await loadScheduledPosts();
    posts = posts.filter(post => post.id !== postId);
    await saveScheduledPosts(posts);
    res.json({ success: true, message: 'Publicación eliminada' });
  } catch (error) {
    console.error('Error al eliminar publicación:', error);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
});

// Endpoint para verificar conexión con Twitter
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

// Función para publicar tweets programados
async function checkAndPublishScheduledPosts() {
  try {
    const posts = await loadScheduledPosts();
    const now = new Date();

    for (const post of posts) {
      if (post.status === 'pending') {
        const scheduledTime = new Date(post.scheduledTime);

        if (now >= scheduledTime) {
          try {
            console.log(`Publicando: "${post.content.substring(0, 50)}..."`);
            await rwClient.v2.tweet(post.content);
            post.status = 'published';
            post.publishedAt = now.toISOString();
            console.log('✓ Publicación exitosa');
          } catch (error) {
            console.error('✗ Error al publicar:', error);
            post.status = 'failed';
            post.error = error.message;
          }
        }
      }
    }

    await saveScheduledPosts(posts);
  } catch (error) {
    console.error('Error en checkAndPublishScheduledPosts:', error);
  }
}

// Verificar cada minuto si hay posts para publicar
cron.schedule('* * * * *', checkAndPublishScheduledPosts);

app.listen(PORT, () => {
  console.log(`\n🚀 XSchedule-X corriendo en http://localhost:${PORT}`);
  console.log('📅 Programador de tweets activo\n');
});
