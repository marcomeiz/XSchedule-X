# XSchedule-X 🐦⏰

Aplicación minimalista y hermosa para programar publicaciones en X (Twitter).

## ✨ Características

- 📅 **Programa múltiples publicaciones** con intervalos personalizados
- 🌍 **Soporte de zonas horarias** para publicar en el momento perfecto
- 🎨 **Interfaz minimalista y hermosa** con diseño moderno
- ⚡ **Actualización en tiempo real** de publicaciones programadas
- 🔄 **Sistema automático** que publica tus tweets en el momento exacto
- 📱 **Diseño responsive** que funciona en cualquier dispositivo

## 🚀 Inicio rápido

### Requisitos previos

- Node.js 18 o superior
- Una cuenta de desarrollador de X (Twitter) con credenciales de API

### Instalación

1. Clona el repositorio:
```bash
git clone https://github.com/tu-usuario/XSchedule-X.git
cd XSchedule-X
```

2. Instala las dependencias:
```bash
npm install
```

3. Crea un archivo `.env` basado en `.env.example`:
```bash
cp .env.example .env
```

4. Edita el archivo `.env` con tus credenciales de Twitter:
```env
TWITTER_API_KEY=tu_api_key
TWITTER_API_SECRET=tu_api_secret
TWITTER_ACCESS_TOKEN=tu_access_token
TWITTER_ACCESS_SECRET=tu_access_secret
TWITTER_BEARER_TOKEN=tu_bearer_token
PORT=3000
```

### Obtener credenciales de Twitter

1. Ve a [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Crea una nueva aplicación o usa una existente
3. En la sección de "Keys and tokens", genera:
   - API Key and Secret
   - Access Token and Secret
   - Bearer Token
4. Asegúrate de que tu app tenga permisos de **Read and Write**

## 🎯 Uso

1. Inicia el servidor:
```bash
npm start
```

O para desarrollo con auto-reload:
```bash
npm run dev
```

2. Abre tu navegador en `http://localhost:3000`

3. Completa el formulario:
   - **¿Cuántas publicaciones?**: Número de tweets a programar
   - **Intervalo**: Tiempo en minutos entre cada publicación
   - **Zona horaria**: Tu zona horaria o la de tu audiencia objetivo
   - **Hora de inicio** (opcional): Si no se especifica, comienza inmediatamente
   - **Contenido**: Escribe el texto de cada publicación (máx. 280 caracteres)

4. Haz clic en "Programar publicaciones"

5. ¡Listo! Tus publicaciones se publicarán automáticamente en los horarios programados

## 🌐 Deploy en Fly.io (Gratis Forever)

### ✨ Por qué Fly.io?
- ✅ **Gratis para siempre** (3 VMs compartidas de 256MB)
- ✅ **NUNCA se duerme** - Perfecto para cron jobs
- ✅ **160GB de tráfico/mes gratis**
- ✅ Deploy super rápido con Docker

### 📋 Requisitos previos

1. **Instala Fly CLI**:
   ```bash
   # macOS/Linux
   curl -L https://fly.io/install.sh | sh

   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Crea una cuenta gratuita**:
   ```bash
   fly auth signup
   # O si ya tienes cuenta:
   fly auth login
   ```

### 🚀 Deploy paso a paso

1. **Clona y entra al proyecto** (si no lo hiciste ya):
   ```bash
   git clone https://github.com/tu-usuario/XSchedule-X.git
   cd XSchedule-X
   ```

2. **Lanza la app** (esto crea y configura todo automáticamente):
   ```bash
   fly launch --now
   ```

   Durante el proceso:
   - Te preguntará el nombre de la app → Presiona Enter para usar el sugerido o elige uno
   - ¿Copiar configuración del fly.toml? → **Sí** (y)
   - ¿Crear base de datos Postgres? → **No** (n) - Usas Supabase
   - ¿Crear base de datos Redis? → **No** (n)
   - ¿Desplegar ahora? → **No** (n) - Primero configuramos los secrets

3. **Configura las variables de entorno (secrets)**:
   ```bash
   fly secrets set TWITTER_API_KEY="tu_api_key"
   fly secrets set TWITTER_API_SECRET="tu_api_secret"
   fly secrets set TWITTER_ACCESS_TOKEN="tu_access_token"
   fly secrets set TWITTER_ACCESS_SECRET="tu_access_secret"
   fly secrets set TWITTER_BEARER_TOKEN="tu_bearer_token"
   fly secrets set SUPABASE_URL="tu_supabase_url"
   fly secrets set SUPABASE_ANON_KEY="tu_supabase_anon_key"
   ```

4. **Deploy final**:
   ```bash
   fly deploy
   ```

5. **¡Listo!** Tu app estará disponible en:
   ```bash
   fly open
   # O ve a: https://tu-app.fly.dev
   ```

### 🛠️ Comandos útiles

```bash
# Ver logs en tiempo real
fly logs

# Ver estado de la app
fly status

# Ver información de la app
fly info

# Abrir la app en el navegador
fly open

# SSH a la máquina (para debug)
fly ssh console

# Ver todas tus apps
fly apps list

# Destruir la app (si quieres empezar de cero)
fly apps destroy tu-app-name
```

### 🔧 Configuración avanzada

#### Cambiar región
Por defecto usa Miami (`mia`). Para cambiar región, edita `fly.toml`:
```toml
primary_region = "gru"  # São Paulo
# Otras regiones: iad=Virginia, lhr=Londres, cdg=París, syd=Sydney
```

Luego aplica cambios:
```bash
fly deploy
```

#### Escalar recursos (si necesitas más RAM)
```bash
# Ver configuración actual
fly scale show

# Aumentar RAM (nota: plan gratuito es 256MB)
fly scale memory 512  # Esto puede costar dinero
```

### ⚠️ Límites del plan gratuito
- **3 VMs compartidas** de 256MB cada una (suficiente para esta app)
- **160GB de transferencia/mes** (más que suficiente)
- **Sin tarjeta de crédito requerida** para empezar
- **La app NUNCA se duerme** (a diferencia de Render)

## 📂 Estructura del proyecto

```
XSchedule-X/
├── public/
│   ├── index.html      # Interfaz web
│   ├── style.css       # Estilos minimalistas
│   └── app.js          # Lógica del frontend
├── server.js           # Servidor Express y lógica de programación
├── .env                # Credenciales (no incluido en git)
├── .env.example        # Plantilla de credenciales
├── package.json        # Dependencias
└── scheduled-posts.json # Base de datos de posts programados (generado automáticamente)
```

## 🛠️ Tecnologías utilizadas

- **Backend**: Node.js, Express
- **Twitter API**: twitter-api-v2
- **Programación**: node-cron
- **Frontend**: HTML5, CSS3, JavaScript vanilla
- **Diseño**: Gradientes CSS modernos, animaciones fluidas

## 🔒 Seguridad

- Las credenciales se almacenan en variables de entorno (`.env`)
- El archivo `.env` está en `.gitignore` para evitar exponer credenciales
- Las publicaciones se almacenan localmente en `scheduled-posts.json`

## 📝 Notas

- El servidor verifica cada minuto si hay publicaciones para publicar
- Las publicaciones se guardan automáticamente y persisten entre reinicios
- Puedes eliminar publicaciones pendientes desde la interfaz
- Las publicaciones ya publicadas se mantienen en el historial

## 🐛 Solución de problemas

### "Error al verificar credenciales de Twitter"
- Verifica que tus credenciales en `.env` sean correctas
- Asegúrate de que tu app tenga permisos de "Read and Write"
- Regenera tus tokens si es necesario

### "Error al publicar"
- Verifica que no estés publicando contenido duplicado
- Twitter tiene límites de publicaciones por día
- Asegúrate de no exceder 280 caracteres

### El servidor no inicia
- Verifica que el puerto 3000 esté disponible
- Ejecuta `npm install` para asegurar que todas las dependencias estén instaladas

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue o pull request.

## 📄 Licencia

MIT

## 👤 Autor

Creado con ❤️ para hacer la programación de tweets simple y hermosa.
