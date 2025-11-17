-- Agrega columna de score del judge a la tabla slots
-- Fecha: 2025-11-17
-- Autor: marcomeipersonal
-- Propósito: Persistir la puntuación del JUDGE por slot para mostrar en UI y análisis

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'slots'
      AND column_name = 'quality_score'
  ) THEN
    ALTER TABLE public.slots
      ADD COLUMN quality_score NUMERIC;
  END IF;
END $$;

COMMENT ON COLUMN public.slots.quality_score IS 'Judge score porcentaje (0-100)';
