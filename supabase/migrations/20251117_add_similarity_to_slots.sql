-- Agrega columna de similitud al judge en slots
-- Fecha: 2025-11-17
-- Autor: marcomeipersonal
-- Propósito: Persistir la similitud (0..1) calculada por el JUDGE

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'slots'
      AND column_name = 'similarity'
  ) THEN
    ALTER TABLE public.slots
      ADD COLUMN similarity NUMERIC;
  END IF;
END $$;

COMMENT ON COLUMN public.slots.similarity IS 'Similitud 0..1 usada por el JUDGE';
