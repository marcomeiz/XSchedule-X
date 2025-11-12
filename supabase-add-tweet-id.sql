-- Agregar columna tweet_id para guardar el ID de Twitter
ALTER TABLE slots
ADD COLUMN tweet_id TEXT;

-- Índice para búsquedas rápidas
CREATE INDEX idx_slots_tweet_id ON slots(tweet_id) WHERE tweet_id IS NOT NULL;

-- Comentario
COMMENT ON COLUMN slots.tweet_id IS 'ID del tweet en Twitter (para obtener métricas)';
