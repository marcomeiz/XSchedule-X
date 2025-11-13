# AI Integration Summary - XSchedule-X + Marco Voice Engine

## ✅ Completado

Se ha integrado exitosamente el generador de tweets con IA (marco-voice-engine) en XSchedule-X.

---

## 📦 Cambios Realizados

### 1. Marco Voice Engine API

**Ubicación**: `/tmp/00001bot/marco-voice-engine/`

#### Archivos Creados/Modificados:

- **`api.py`**: FastAPI wrapper con endpoint `/generate`
  - Selección automática de topics aleatorios desde `topics.json`
  - Generación de exactamente 2 variantes (no 3-5)
  - Modos: `ops` (profesional) y `chaos` (feral)

- **`src/marco_voice_engine/generator.py`**: Modificado
  - Cambiado default de 3 a 2 variantes
  - Parámetro `n_variants` dinámico en prompts y LLM calls
  - Reduce consumo de créditos de OpenRouter

- **`Dockerfile`**: Imagen Python 3.11 Alpine para Fly.io
- **`.dockerignore`**: Optimización de build
- **`fly.toml`**: Configuración Fly.io con `auto_stop_machines='off'`
- **`pyproject.toml`**: Agregadas dependencias `fastapi` y `uvicorn[standard]`
- **`DEPLOYMENT.md`**: Guía completa de deployment

---

### 2. XSchedule-X Frontend

**Branch**: `claude/migrate-away-from-render-011CV5VVmMDdjskUdibeZjiE`

#### Archivos Modificados:

- **`public/index.html`** (líneas 115-132):
  - Botones "✨ Generar OPS" y "🔥 Generar CHAOS"
  - Modal para mostrar variantes (líneas 283-319)

- **`public/style.css`** (líneas 1215-1493):
  - Estilos glassmorphism para botones AI
  - Modal con animaciones slide-up
  - Cards de variantes con hover effects
  - Responsive design

- **`public/app.js`** (líneas 547-643):
  - `generateAI(mode)`: Llamada al API
  - `selectVariant(text)`: Programar variante seleccionada
  - `closeAIModal()`: Cerrar modal
  - Endpoint configurable: línea 550

---

## 🚀 Próximos Pasos

### 1. Desplegar marco-voice-engine-api

```bash
cd /tmp/00001bot/marco-voice-engine

# Login a Fly.io
fly auth login

# Configurar secrets (REQUERIDO)
fly secrets set OPENROUTER_API_KEY="tu_api_key_aqui"
fly secrets set EMBEDDING_MODEL_NAME="openai/text-embedding-3-large"
fly secrets set GENERATION_MODEL_PRIMARY="anthropic/claude-sonnet-4.5"
fly secrets set GOLDSET_FILENAME="dataset.json"
fly secrets set TOPICS_FILENAME="topics.json"

# Deploy
fly launch --now --copy-config --name marco-voice-engine-api

# Verificar
fly status
curl https://marco-voice-engine-api.fly.dev/health
```

### 2. Actualizar Endpoint en XSchedule-X

Si el nombre de tu app Fly.io es diferente:

1. Edita `public/app.js` línea 550:
```javascript
const AI_API_URL = 'https://TU-APP-NAME.fly.dev';
```

2. Commit y push:
```bash
git add public/app.js
git commit -m "🔧 Config: Actualizar endpoint de marco-voice-engine-api"
git push
```

### 3. Desplegar XSchedule-X

Si ya está en Fly.io:
```bash
cd /home/user/XSchedule-X
fly deploy
```

Si aún no:
```bash
fly launch --now --copy-config --name xschedule-x
```

---

## 🎨 Cómo Funciona

1. **Usuario hace click en "✨ Generar OPS" o "🔥 Generar CHAOS"**
2. **Frontend llama a** `POST /generate` con `{"mode": "ops|chaos"}`
3. **API selecciona topic aleatorio** desde `topics.json`
4. **Genera 2 variantes** usando el modelo configurado
5. **Judge filtra por calidad** (similitud, longitud, reglas anti-coach)
6. **Modal muestra variantes** con score de calidad
7. **Usuario selecciona una** → se carga en textarea
8. **Click "Agregar"** → se programa en el siguiente slot disponible

---

## 💰 Ahorro de Créditos

**Antes**: 3-5 variantes por generación
**Ahora**: Exactamente 2 variantes

Esto reduce el consumo de OpenRouter aproximadamente **40-60%**.

---

## 📊 API Endpoints

### Health Check
```bash
GET https://marco-voice-engine-api.fly.dev/health
```

### Generar Variantes
```bash
POST https://marco-voice-engine-api.fly.dev/generate
Content-Type: application/json

{
  "mode": "ops"  # o "chaos"
}
```

**Response**:
```json
{
  "topic": "You don't need more time. You need mental architecture...",
  "variants": [
    {
      "text": "Context switching steals weeks. Batch everything or never hit flow.",
      "score": 0.85
    },
    {
      "text": "Your brain needs rules, not daily improvisation. Decision fatigue kills clarity.",
      "score": 0.82
    }
  ]
}
```

---

## 🔍 Troubleshooting

### API no responde
```bash
fly logs -a marco-voice-engine-api
```

### Verificar secrets
```bash
fly secrets list -a marco-voice-engine-api
```

### Frontend no conecta
1. Verificar CORS en `api.py` línea 25-32
2. Verificar URL en `app.js` línea 550
3. Check browser console: DevTools → Network

---

## 📝 Variables de Entorno Requeridas

**Marco Voice Engine API** (via `fly secrets set`):
- `OPENROUTER_API_KEY`: Tu API key de OpenRouter
- `EMBEDDING_MODEL_NAME`: Modelo de embeddings (default: `openai/text-embedding-3-large`)
- `GENERATION_MODEL_PRIMARY`: Modelo de generación (default: `anthropic/claude-sonnet-4.5`)
- `GOLDSET_FILENAME`: Nombre del archivo dataset (default: `dataset.json`)
- `TOPICS_FILENAME`: Nombre del archivo topics (default: `topics.json`)
- `VOICE_DATA_DIR`: Directorio de datos (ya set en fly.toml: `/app`)

**XSchedule-X** (sin cambios necesarios):
- Ya configurado en Fly.io

---

## 🎯 Features Implementadas

✅ Auto-selección de topics aleatorios
✅ Generación de exactamente 2 variantes
✅ Modo OPS (profesional/operador)
✅ Modo CHAOS (feral/directo)
✅ Modal glassmorphism con animaciones
✅ Score de calidad por variante
✅ Click para programar
✅ Manejo de errores con UI clara
✅ Loading states
✅ CORS configurado
✅ Health checks

---

## 📚 Archivos de Referencia

- **Deployment Guide**: `/tmp/00001bot/marco-voice-engine/DEPLOYMENT.md`
- **API Code**: `/tmp/00001bot/marco-voice-engine/api.py`
- **Fly Config**: `/tmp/00001bot/marco-voice-engine/fly.toml`
- **Frontend**: `/home/user/XSchedule-X/public/`

---

## 🔗 Commit Hash

XSchedule-X changes pushed to:
- Branch: `claude/migrate-away-from-render-011CV5VVmMDdjskUdibeZjiE`
- Commit: `6ded2e0`
- Message: "✨ Feat: Integrar generación de tweets con IA (marco-voice-engine)"

---

**¡Listo para deploy!** 🚀
