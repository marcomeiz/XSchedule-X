-- =====================================================
-- XSchedule-X - Schema Simple (Single-User)
-- Sin autenticación, sin user_id, solo persistencia
-- =====================================================

-- Eliminar tablas anteriores si existen
DROP TABLE IF EXISTS slots CASCADE;
DROP TABLE IF EXISTS timelines CASCADE;
DROP TABLE IF EXISTS twitter_credentials CASCADE;

-- Tabla de Timelines (solo habrá uno activo a la vez)
CREATE TABLE timelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Mi Timeline',
  total_slots INTEGER NOT NULL,
  interval_hours DECIMAL NOT NULL,
  work_start TIME NOT NULL DEFAULT '09:00:00',
  work_end TIME NOT NULL DEFAULT '18:00:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla de Slots
CREATE TABLE slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timeline_id UUID NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'empty' CHECK (status IN ('empty', 'filled', 'published', 'failed')),
  content TEXT,
  filled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_slots_timeline ON slots(timeline_id);
CREATE INDEX idx_slots_status ON slots(status);
CREATE INDEX idx_slots_scheduled ON slots(scheduled_time);
CREATE INDEX idx_slots_index ON slots(slot_index);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_timelines_updated_at
  BEFORE UPDATE ON timelines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_slots_updated_at
  BEFORE UPDATE ON slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentarios
COMMENT ON TABLE timelines IS 'Timeline de publicaciones (single-user, solo uno activo)';
COMMENT ON TABLE slots IS 'Slots individuales de publicaciones programadas';
