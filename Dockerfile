# Dockerfile optimizado para Fly.io
FROM node:20-alpine

# Crear directorio de trabajo
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar el resto de la aplicación
COPY . .

# Verificar que el fix de app.listen está presente
RUN grep "0.0.0.0" server-enhanced.js

# Exponer puerto
EXPOSE 3000

# Comando de inicio
CMD ["node", "server-enhanced.js"]
