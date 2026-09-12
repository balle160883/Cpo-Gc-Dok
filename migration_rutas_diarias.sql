-- ==============================================================================
-- MIGRACIÓN: MÓDULO DE PLANIFICACIÓN DE RUTAS DIARIAS POR COLONIA
-- Permite a administradores (ej. Sergio Elizondo) programar qué colonias visita cada
-- gestor en días específicos a partir de sus cuentas asignadas en Supabase.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.planificacion_rutas_diarias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gestor_nombre TEXT NOT NULL,
    fecha DATE NOT NULL,
    colonia TEXT NOT NULL,
    total_cuentas INTEGER DEFAULT 0,
    asignado_por TEXT DEFAULT 'ELIZONDO CARDENAS SERGIO ARMANDO',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_gestor_fecha_colonia UNIQUE(gestor_nombre, fecha, colonia)
);

-- Índices de alto rendimiento para consultas por gestor y fecha
CREATE INDEX IF NOT EXISTS idx_rutas_gestor_fecha 
    ON public.planificacion_rutas_diarias (gestor_nombre, fecha);

CREATE INDEX IF NOT EXISTS idx_rutas_fecha 
    ON public.planificacion_rutas_diarias (fecha);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.planificacion_rutas_diarias ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso para API pública/autenticada y servicio
DROP POLICY IF EXISTS "Permitir lectura publica de rutas diarias" ON public.planificacion_rutas_diarias;
CREATE POLICY "Permitir lectura publica de rutas diarias" 
    ON public.planificacion_rutas_diarias 
    FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Permitir insercion de rutas diarias" ON public.planificacion_rutas_diarias;
CREATE POLICY "Permitir insercion de rutas diarias" 
    ON public.planificacion_rutas_diarias 
    FOR INSERT 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion de rutas diarias" ON public.planificacion_rutas_diarias;
CREATE POLICY "Permitir actualizacion de rutas diarias" 
    ON public.planificacion_rutas_diarias 
    FOR UPDATE 
    USING (true) 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir eliminacion de rutas diarias" ON public.planificacion_rutas_diarias;
CREATE POLICY "Permitir eliminacion de rutas diarias" 
    ON public.planificacion_rutas_diarias 
    FOR DELETE 
    USING (true);

-- Otorgar permisos a los roles de Supabase
GRANT ALL ON TABLE public.planificacion_rutas_diarias TO anon;
GRANT ALL ON TABLE public.planificacion_rutas_diarias TO authenticated;
GRANT ALL ON TABLE public.planificacion_rutas_diarias TO service_role;
