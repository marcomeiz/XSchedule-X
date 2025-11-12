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

## 🌐 Deploy en Render (Gratis)

### Opción 1: Deploy automático con render.yaml (Recomendado)

1. **Crea una cuenta en [Render](https://render.com)**

2. **Haz clic en "New +" → "Web Service"**

3. **Conecta tu repositorio de GitHub**

4. **Render detectará automáticamente el `render.yaml`**

5. **Configura las variables de entorno:**
   - `TWITTER_API_KEY` → Tu API Key
   - `TWITTER_API_SECRET` → Tu API Secret
   - `TWITTER_ACCESS_TOKEN` → Tu Access Token
   - `TWITTER_ACCESS_SECRET` → Tu Access Secret
   - `TWITTER_BEARER_TOKEN` → Tu Bearer Token

6. **Haz clic en "Create Web Service"**

7. **¡Listo!** Tu app estará disponible en `https://tu-app.onrender.com`

### Opción 2: Deploy manual

Si prefieres configurar manualmente:

1. En Render, selecciona tu repositorio
2. Configura:
   - **Name**: `xschedule-x`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
3. Agrega las variables de entorno (mismo paso 5 de arriba)
4. Deploy automático

### ⚠️ Importante sobre el plan gratuito de Render:

- El servicio se "duerme" después de 15 minutos de inactividad
- Cuando alguien visita la URL, se "despierta" (tarda ~30 segundos)
- **Solución**: Usa un servicio como [UptimeRobot](https://uptimerobot.com/) (gratis) para hacer ping cada 5 minutos y mantenerlo despierto

### 🚀 Alternativas gratuitas:

- **Railway.app**: 500 horas gratis/mes, muy fácil de usar
- **Fly.io**: 3 VMs gratis, excelente rendimiento
- **Heroku**: Requiere tarjeta de crédito para verificación

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
