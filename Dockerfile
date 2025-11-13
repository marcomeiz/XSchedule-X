# Dockerfile optimizado para Fly.io
FROM node:18-alpine

# Crear directorio de trabajo
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar el resto de la aplicación
COPY . .

# Exponer puerto (Fly.io usa 8080 por defecto internamente)
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]
