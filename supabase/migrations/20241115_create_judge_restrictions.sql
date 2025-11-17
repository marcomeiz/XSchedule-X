-- Tabla de restricciones configurables del judge
CREATE TABLE IF NOT EXISTS judge_restrictions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Límites de longitud
    min_length INTEGER DEFAULT 40,
    max_length INTEGER DEFAULT 280,
    mode_length_limits JSONB DEFAULT '{"reply": [20, 220]}'::jsonb,
    
    -- Límites de similitud con goldset
    min_similarity DECIMAL(3,2) DEFAULT 0.35,
    max_similarity DECIMAL(3,2) DEFAULT 0.97,
    
    -- Límites de similitud para reply
    reply_min_context_similarity DECIMAL(3,2) DEFAULT 0.32,
    reply_max_context_similarity DECIMAL(3,2) DEFAULT 0.92,
    
    -- Listas prohibidas
    banned_substrings TEXT[] DEFAULT ARRAY[]::TEXT[],
    banned_prefixes TEXT[] DEFAULT ARRAY[]::TEXT[],
    reply_banned_hooks TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Configuración adicional
    ai_cop_threshold DECIMAL(3,2) DEFAULT 0.5,
    checklist_pattern VARCHAR(255) DEFAULT '^[[:space:]]*([[:digit:]]+\.|[-*])[[:space:]].*$',
    
    -- Estado y control
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_judge_restrictions_user_id ON judge_restrictions(user_id);
CREATE INDEX IF NOT EXISTS idx_judge_restrictions_active ON judge_restrictions(is_active);
CREATE INDEX IF NOT EXISTS idx_judge_restrictions_default ON judge_restrictions(is_default) WHERE is_default = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_judge_restrictions_default_per_user ON judge_restrictions(user_id) WHERE is_default = true;

-- Tabla de historial de restricciones (para auditoría)
CREATE TABLE IF NOT EXISTS judge_restrictions_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restriction_id UUID REFERENCES judge_restrictions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deleted'
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Función para actualizar timestamp
CREATE OR REPLACE FUNCTION update_judge_restrictions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS trigger_update_judge_restrictions_updated_at ON judge_restrictions;
CREATE TRIGGER trigger_update_judge_restrictions_updated_at
    BEFORE UPDATE ON judge_restrictions
    FOR EACH ROW
    EXECUTE FUNCTION update_judge_restrictions_updated_at();

-- Función para registrar historial
CREATE OR REPLACE FUNCTION log_judge_restrictions_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO judge_restrictions_history (restriction_id, user_id, action, old_values)
        VALUES (OLD.id, OLD.user_id, 'deleted', row_to_json(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO judge_restrictions_history (restriction_id, user_id, action, old_values, new_values)
        VALUES (OLD.id, OLD.user_id, 'updated', row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO judge_restrictions_history (restriction_id, user_id, action, new_values)
        VALUES (NEW.id, NEW.user_id, 'created', row_to_json(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger para historial
DROP TRIGGER IF EXISTS trigger_log_judge_restrictions_history ON judge_restrictions;
CREATE TRIGGER trigger_log_judge_restrictions_history
    AFTER INSERT OR UPDATE OR DELETE ON judge_restrictions
    FOR EACH ROW
    EXECUTE FUNCTION log_judge_restrictions_history();

-- Restricción por defecto para usuarios nuevos
CREATE OR REPLACE FUNCTION create_default_judge_restrictions()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO judge_restrictions (
        user_id,
        name,
        description,
        is_default,
        is_active
    ) VALUES (
        NEW.id,
        'Default Judge Configuration',
        'Default configuration for judge restrictions',
        true,
        true
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Nota: no se crea trigger sobre auth.users por restricciones de Supabase.

-- Permisos para roles de Supabase
GRANT SELECT, INSERT, UPDATE, DELETE ON judge_restrictions TO authenticated;
GRANT SELECT, INSERT ON judge_restrictions_history TO authenticated;

-- Permisos para funciones
GRANT EXECUTE ON FUNCTION update_judge_restrictions_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION log_judge_restrictions_history() TO authenticated;
GRANT EXECUTE ON FUNCTION create_default_judge_restrictions() TO postgres;
