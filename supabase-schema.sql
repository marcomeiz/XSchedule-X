-- =====================================================
-- XSchedule-X - Multi-user Schema con Supabase
-- =====================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- TABLA: twitter_credentials
-- Almacena las credenciales de Twitter de cada usuario (encriptadas)
-- =====================================================
CREATE TABLE IF NOT EXISTS twitter_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  access_secret_encrypted TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id) -- Un usuario solo tiene un set de credenciales
);

-- =====================================================
-- TABLA: timelines
-- Almacena los timelines de cada usuario
-- =====================================================
CREATE TABLE IF NOT EXISTS timelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Mi Timeline',
  total_slots INTEGER NOT NULL CHECK (total_slots > 0 AND total_slots <= 50),
  work_start TIME NOT NULL,
  work_end TIME NOT NULL,
  timezone TEXT NOT NULL,
  start_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- TABLA: slots
-- Almacena los slots individuales de cada timeline
-- =====================================================
CREATE TABLE IF NOT EXISTS slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timeline_id UUID NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL, -- Posición en el timeline (0, 1, 2, ...)
  scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'empty' CHECK (status IN ('empty', 'filled', 'published', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  filled_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(timeline_id, slot_index) -- Cada slot tiene un índice único dentro de su timeline
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- Asegura que cada usuario solo vea sus propios datos
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE twitter_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- POLÍTICAS para twitter_credentials
-- =====================================================

-- Los usuarios solo pueden ver sus propias credenciales
CREATE POLICY "Users can view their own credentials"
  ON twitter_credentials
  FOR SELECT
  USING (auth.uid() = user_id);

-- Los usuarios solo pueden insertar sus propias credenciales
CREATE POLICY "Users can insert their own credentials"
  ON twitter_credentials
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Los usuarios solo pueden actualizar sus propias credenciales
CREATE POLICY "Users can update their own credentials"
  ON twitter_credentials
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Los usuarios solo pueden eliminar sus propias credenciales
CREATE POLICY "Users can delete their own credentials"
  ON twitter_credentials
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- POLÍTICAS para timelines
-- =====================================================

-- Los usuarios solo pueden ver sus propios timelines
CREATE POLICY "Users can view their own timelines"
  ON timelines
  FOR SELECT
  USING (auth.uid() = user_id);

-- Los usuarios solo pueden crear sus propios timelines
CREATE POLICY "Users can insert their own timelines"
  ON timelines
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Los usuarios solo pueden actualizar sus propios timelines
CREATE POLICY "Users can update their own timelines"
  ON timelines
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Los usuarios solo pueden eliminar sus propios timelines
CREATE POLICY "Users can delete their own timelines"
  ON timelines
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- POLÍTICAS para slots
-- =====================================================

-- Los usuarios solo pueden ver slots de sus propios timelines
CREATE POLICY "Users can view slots from their own timelines"
  ON slots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM timelines
      WHERE timelines.id = slots.timeline_id
      AND timelines.user_id = auth.uid()
    )
  );

-- Los usuarios solo pueden insertar slots en sus propios timelines
CREATE POLICY "Users can insert slots in their own timelines"
  ON slots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM timelines
      WHERE timelines.id = slots.timeline_id
      AND timelines.user_id = auth.uid()
    )
  );

-- Los usuarios solo pueden actualizar slots de sus propios timelines
CREATE POLICY "Users can update slots in their own timelines"
  ON slots
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM timelines
      WHERE timelines.id = slots.timeline_id
      AND timelines.user_id = auth.uid()
    )
  );

-- Los usuarios solo pueden eliminar slots de sus propios timelines
CREATE POLICY "Users can delete slots from their own timelines"
  ON slots
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM timelines
      WHERE timelines.id = slots.timeline_id
      AND timelines.user_id = auth.uid()
    )
  );

-- =====================================================
-- ÍNDICES para mejorar rendimiento
-- =====================================================

CREATE INDEX idx_twitter_credentials_user_id ON twitter_credentials(user_id);
CREATE INDEX idx_timelines_user_id ON timelines(user_id);
CREATE INDEX idx_slots_timeline_id ON slots(timeline_id);
CREATE INDEX idx_slots_status ON slots(status);
CREATE INDEX idx_slots_scheduled_time ON slots(scheduled_time);

-- =====================================================
-- FUNCIÓN: auto-actualizar updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para auto-actualizar updated_at
CREATE TRIGGER update_twitter_credentials_updated_at
  BEFORE UPDATE ON twitter_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timelines_updated_at
  BEFORE UPDATE ON timelines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMENTARIOS (documentación)
-- =====================================================

COMMENT ON TABLE twitter_credentials IS 'Almacena credenciales encriptadas de Twitter API para cada usuario';
COMMENT ON TABLE timelines IS 'Almacena configuraciones de timelines de publicación para cada usuario';
COMMENT ON TABLE slots IS 'Almacena los slots individuales (publicaciones programadas) de cada timeline';

COMMENT ON COLUMN twitter_credentials.api_key_encrypted IS 'Twitter API Key encriptada con pgcrypto';
COMMENT ON COLUMN slots.slot_index IS 'Índice del slot dentro del timeline (0-based)';
COMMENT ON COLUMN slots.status IS 'Estado del slot: empty, filled, published, failed';
