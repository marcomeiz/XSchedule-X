# XSchedule-X + Marco Voice Engine - Documentación Completa

## 🎯 Objetivo Principal

Integrar **marco-voice-engine** (generador de tweets con IA) con **XSchedule-X** (programador de tweets) para permitir generación automática de contenido con 2 modos:

- **✨ OPS Mode**: Tono profesional/operador (directo, práctico, sin fluff)
- **🔥 CHAOS Mode**: Tono feral/directo (sharp, observations, humor oscuro)

**Resultado final**: Desde XSchedule-X, hacer click en un botón → genera 2 variantes de tweets → seleccionar una → programar automáticamente.

---

## 📋 Tareas Completadas

### 1. Migración de Render a Fly.io (XSchedule-X)

**Problema**: Render free tier tiene cold starts que rompían los cron jobs de publicación.

**Solución**:
- ✅ Creado `Dockerfile` para XSchedule-X
- ✅ Creado `fly.toml` con `auto_stop_machines = 'off'`
- ✅ Migrado a Fly.io región `iad` (Virginia)
- ✅ Configurados secrets (Supabase, Twitter API)
- ✅ Desplegado exitosamente sin cold starts

**Archivos modificados**:
- `Dockerfile`
- `fly.toml`
- `.dockerignore`

---

### 2. Corrección de Errores de Publicación

**Problema**: Tweets mostraban error 403/429 pero se publicaban correctamente (false negatives).

**Solución**:
- ✅ Sistema de verificación post-error (server.js líneas 760-828)
- ✅ Espera 3s después de error → busca tweet en timeline
- ✅ Si encuentra el tweet → marca como publicado
- ✅ Si no → marca como fallido

**Archivos modificados**:
- `server.js` (líneas 760-828)

---

### 3. Protección de Slots del Pasado

**Problema**: Slots del pasado se podían limpiar y reutilizar, causando programación en tiempos pasados.

**Solución**:
- ✅ Filtro temporal en búsqueda de slots (server.js líneas 351-365)
  - Solo busca slots `.gte('scheduled_time', now.toISO())`
- ✅ Validación en DELETE endpoint (server.js líneas 415-421)
  - Bloquea limpieza de slots del pasado con error 403

**Archivos modificados**:
- `server.js` (líneas 351-365, 415-421)

---

### 4. Tab "Publicados" con Métricas en Tiempo Real

**Problema**: Tweets publicados no tenían visibilidad ni métricas.

**Solución**:
- ✅ Endpoint `/api/published` (server.js líneas 503-594)
  - Fetch de últimos 50 tweets publicados
  - Integración con Twitter API v2 para métricas
  - Likes, retweets, replies, impressions
- ✅ Frontend tab "Publicados" (index.html líneas 143-160)
- ✅ Función `loadPublished()` (app.js líneas 442-525)
- ✅ CSS glassmorphism (style.css líneas 1107-1212)

**Archivos modificados**:
- `server.js` (líneas 503-594)
- `public/index.html` (líneas 83-87, 143-160)
- `public/app.js` (líneas 271-306, 442-525)
- `public/style.css` (líneas 1107-1212)

---

### 5. Deploy de Marco Voice Engine API

**Arquitectura**: Servicio separado en Fly.io que expone marco-voice-engine como REST API.

**Componentes desplegados**:
- ✅ FastAPI wrapper (`api.py`)
- ✅ Auto-selección de topics aleatorios desde `topics.json`
- ✅ Generador modificado para producir exactamente 2 variantes (no 3-5)
- ✅ Dockerfile optimizado (Python 3.11 Alpine)
- ✅ `fly.toml` con timeouts aumentados (90s)
- ✅ Secrets configurados (OpenRouter API key, Supabase)

**Archivos creados**:
- `/tmp/00001bot/marco-voice-engine/api.py`
- `/tmp/00001bot/marco-voice-engine/Dockerfile`
- `/tmp/00001bot/marco-voice-engine/fly.toml`
- `/tmp/00001bot/marco-voice-engine/.dockerignore`
- `/tmp/00001bot/marco-voice-engine/DEPLOYMENT.md`

**Modificaciones al código original**:
- `src/marco_voice_engine/generator.py`:
  - Parámetro `n_variants` dinámico (default 2 en lugar de 3)
  - Prompts ajustados para 2 variantes

---

### 6. Caché de Embeddings en Supabase

**Problema**: Calcular embeddings en cada request tardaba 5-10 minutos y bloqueaba el servidor.

**Solución**:
- ✅ Tabla `goldset_embeddings` en Supabase con pgvector
- ✅ Endpoint `/admin/precompute` para calcular embeddings una vez
- ✅ Lectura de embeddings desde Supabase en requests normales
- ✅ Background thread executor para no bloquear event loop

**Schema Supabase**:
```sql
CREATE TABLE goldset_embeddings (
  id BIGSERIAL PRIMARY KEY,
  text TEXT NOT NULL UNIQUE,
  embedding vector(3072),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Archivos modificados**:
- `api.py` (función `precompute_embeddings`, líneas 104-172)
- `pyproject.toml` (agregada dependencia `supabase`)

---

### 7. Frontend - Botones AI y Modal

**Componentes creados**:
- ✅ Botones "✨ Generar OPS" y "🔥 Generar CHAOS" (index.html líneas 115-132)
- ✅ Modal glassmorphism para mostrar 2 variantes (index.html líneas 283-319)
- ✅ JavaScript: `generateAI(mode)` (app.js líneas 547-643)
- ✅ CSS con animaciones y hover effects (style.css líneas 1215-1493)

**Flujo de usuario**:
1. Click en botón → Modal aparece con "Loading..."
2. API genera 2 variantes → Modal muestra resultados con scores
3. Click "Programar este" → texto se carga en textarea
4. Click "Agregar" → se programa en siguiente slot disponible

**Archivos modificados**:
- `public/index.html` (líneas 115-132, 283-319)
- `public/app.js` (líneas 547-643)
- `public/style.css` (líneas 1215-1493)

---

## 🚧 Tareas Pendientes

### 1. **Completar Precompute de Embeddings** (EN PROGRESO)
- ⏳ Actualmente calculando 484 embeddings
- ⏳ ETA: 5-10 minutos
- ⏳ Logs muestran: "[PRECOMPUTE] Computing embeddings for 484 new entries..."

**Cuando termine**:
- Verificar: `[PRECOMPUTE] Done!` en logs
- Resultado esperado: `{"message":"Embeddings computed and cached","total_cached":484}`

---

### 2. **Testing de Generación de Tweets**

**Test básico**:
```bash
curl -X POST https://marco-voice-engine.fly.dev/generate \
  -H "Content-Type: application/json" \
  -d '{"mode": "ops"}'
```

**Resultado esperado** (10-20 segundos):
```json
{
  "topic": "Context switching steals weeks a year...",
  "variants": [
    {"text": "...", "score": 0.85},
    {"text": "...", "score": 0.82}
  ]
}
```

---

### 3. **Testing End-to-End desde Frontend**

**Pasos**:
1. Abrir XSchedule-X en navegador
2. Click en "✨ Generar OPS"
3. Verificar que modal carga
4. Verificar que muestra 2 variantes
5. Click "Programar este"
6. Verificar que texto se carga en textarea
7. Click "Agregar"
8. Verificar que se programa en slot correcto

---

### 4. **Optimizaciones Futuras** (Opcionales)

- [ ] Caché de embeddings en disco local (evita recalcular en cada restart)
- [ ] Guardar embeddings de topics.json también en Supabase
- [ ] Auto-detección de nuevos tweets en dataset.json → precompute incremental
- [ ] Rate limiting en `/generate` para proteger créditos OpenRouter
- [ ] Analytics: tracking de cuántos tweets AI vs manuales se publican
- [ ] A/B testing: métricas de tweets AI vs manuales

---

## 🏗️ Arquitectura Final

```
┌─────────────────────────────────────────────────────────────┐
│                         USUARIO                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │       XSchedule-X Frontend         │
        │     (Fly.io - xschedule-x)         │
        │                                     │
        │  - Timeline de slots horarios      │
        │  - Tab "Publicados" con métricas   │
        │  - Botones "Generar OPS/CHAOS"     │
        │  - Modal para seleccionar tweets   │
        └─────┬──────────────────────┬───────┘
              │                      │
              │                      │
         ┌────▼────┐          ┌──────▼──────┐
         │ Supabase│          │Marco Voice  │
         │         │          │Engine API   │
         │ Tablas: │          │(Fly.io)     │
         │ - slots │          │             │
         │ - tweets│◄─────────┤ Endpoints:  │
         │ - goldset│         │ /generate   │
         │   _embed │         │ /admin/     │
         │   dings  │         │  precompute │
         └─────────┘          └──────┬──────┘
                                     │
                                     │
                              ┌──────▼──────┐
                              │  OpenRouter │
                              │   API       │
                              │             │
                              │ - Embeddings│
                              │ - Claude    │
                              │   Sonnet    │
                              └─────────────┘
```

---

## 🔑 Secrets Configurados

### XSchedule-X (Fly.io)
```bash
SUPABASE_URL=https://lzzmfproweybcafbecnm.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
TWITTER_API_KEY=***
TWITTER_API_SECRET=***
TWITTER_ACCESS_TOKEN=***
TWITTER_ACCESS_SECRET=***
TWITTER_BEARER_TOKEN=***
ENCRYPTION_KEY=***
```

### Marco Voice Engine API (Fly.io)
```bash
OPENROUTER_API_KEY=sk-or-v1-a68f8a625ef4a263...
EMBEDDING_MODEL_NAME=openai/text-embedding-3-large
GENERATION_MODEL_PRIMARY=anthropic/claude-sonnet-4.5
GOLDSET_FILENAME=dataset.json
TOPICS_FILENAME=topics.json
SUPABASE_URL=https://lzzmfproweybcafbecnm.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📊 Métricas y Costos

### OpenRouter API Usage

**Embeddings** (una vez al hacer precompute):
- 484 tweets × ~20 tokens promedio × $0.00000013/token
- **Costo estimado**: ~$0.0013 (un centavo)

**Generación de tweets** (cada request):
- Topic embedding: ~50 tokens × $0.00000013 = $0.0000065
- Generación (Claude Sonnet 4.5): ~150 tokens input + 400 output
  - Input: $3/M tokens = $0.00045
  - Output: $15/M tokens = $0.006
- **Costo por generación**: ~$0.0065 (menos de 1 centavo)

**Con 2 variantes en lugar de 3-5**:
- Ahorro: ~40-60% en costos de generación
- Ejemplo: 100 generaciones/mes = $0.65 en lugar de $1.10

---

## 🚀 Deployments

### XSchedule-X
- **URL**: https://xschedule-x.fly.dev
- **Región**: iad (Virginia)
- **Memoria**: 256 MB
- **Estado**: ✅ Running 24/7 (no cold starts)

### Marco Voice Engine API
- **URL**: https://marco-voice-engine.fly.dev
- **Región**: cdg (Paris)
- **Memoria**: 1 GB
- **Estado**: ✅ Running 24/7

---

## 📝 Commits Realizados

### XSchedule-X Repository
1. `✨ Feat: Integrar generación de tweets con IA (marco-voice-engine)`
   - Botones OPS/CHAOS
   - Modal glassmorphism
   - Integración con API endpoint
   - Commit: `6ded2e0`

2. `📚 Docs: Agregar guía de integración AI completa`
   - Documentación exhaustiva
   - Troubleshooting
   - Commit: `eaf52f0`

3. Commits previos de migración y fixes...

---

## 🎓 Conceptos Técnicos Clave

### 1. **Embeddings**
Vectores numéricos (3072 dimensiones) que representan el "significado" de un texto. Tweets similares tienen embeddings cercanos.

### 2. **Goldset**
Conjunto de ejemplos (484 tweets) que definen el TONO/ESTILO a replicar. El sistema compara variantes generadas con estos ejemplos.

### 3. **Topics**
Lista de 53 temas sobre los que escribir (de topics.json). El sistema selecciona uno aleatorio.

### 4. **Judge System**
Filtra variantes generadas por:
- Similitud con goldset (score de embeddings)
- Longitud (40-220 caracteres)
- Sin emojis, sin hashtags
- Sin patrones de "LinkedIn coach"

### 5. **Background Thread Executor**
Ejecuta operaciones largas (generación, embeddings) en threads separados para no bloquear el servidor FastAPI.

---

## 🐛 Problemas Solucionados Durante Desarrollo

1. **Puerto incorrecto**: Fly.io esperaba 8080, app escuchaba 8000 ✅
2. **Máquinas dormidas**: `auto_stop_machines` causaba timeouts ✅
3. **Embeddings bloqueantes**: Movidos a background threads ✅
4. **Dataset mal parseado**: Extraer array `tweets` de JSON ✅
5. **Timeouts en requests largos**: Aumentados a 90s ✅
6. **Health checks fallando**: Conflicto entre `[http_service]` y `[[services]]` ✅
7. **Embeddings recalculados**: Implementado caché en Supabase ✅
8. **Supabase "vector type"**: Habilitada extensión pgvector ✅

---

## 📚 Recursos y Referencias

- **XSchedule-X Repo**: `/home/user/XSchedule-X`
- **Marco Voice Engine Repo**: `/tmp/00001bot/marco-voice-engine`
- **Fly.io Docs**: https://fly.io/docs
- **OpenRouter Docs**: https://openrouter.ai/docs
- **Supabase Docs**: https://supabase.com/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com

---

## ✅ Checklist Final

- [x] XSchedule-X migrado a Fly.io
- [x] Errores de publicación corregidos
- [x] Slots del pasado protegidos
- [x] Tab "Publicados" implementado
- [x] Marco Voice Engine desplegado en Fly.io
- [x] Generador modificado para 2 variantes
- [x] Caché de embeddings en Supabase
- [x] Tabla goldset_embeddings creada
- [x] Frontend con botones AI integrado
- [x] Modal glassmorphism completado
- [ ] **Precompute de 484 embeddings** (EN PROGRESO)
- [ ] Testing de generación de tweets
- [ ] Testing end-to-end desde frontend
- [ ] Validación de métricas y analytics

---

**Estado actual**: ⏳ Esperando finalización de precompute de embeddings (5-10 min)

**Próximo paso**: Probar endpoint `/generate` cuando termine el precompute.

---

*Documentación generada: 2025-11-13*
*Última actualización: En espera de precompute*
