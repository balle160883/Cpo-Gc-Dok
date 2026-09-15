-- ==============================================================================
-- AUTOMATIZACIÓN TOTAL: RESGUARDO DE CUENTAS Y AVALES AL CORRIENTE
-- ==============================================================================
-- Este script crea funciones y disparadores (triggers) en PostgreSQL / Supabase
-- para garantizar que:
-- 1. Toda cuenta en asignacion_gestores con 0 días de mora se resguarde en automático
--    anteponiendo 'AL CORRIENTE - ' a su gestor asignado (ocultándola del APK).
-- 2. Si un socio cae en mora (> 0 días), automáticamente recupera el gestor limpio
--    para que reaparezca de inmediato en la app móvil del gestor.
-- 3. Todos los avales en asignacion_avales se mantengan 100% sincronizados con el
--    estatus de la cuenta de forma bidireccional.
-- ==============================================================================

-- 1. FUNCIÓN PARA ASIGNACION_GESTORES (BEFORE INSERT OR UPDATE)
CREATE OR REPLACE FUNCTION trg_fn_gestores_al_corriente()
RETURNS TRIGGER AS $$
BEGIN
  -- Si no hay gestor asignado, continuar sin modificar
  IF NEW."GESTOR ASIGNADO" IS NULL OR TRIM(NEW."GESTOR ASIGNADO") = '' THEN
    RETURN NEW;
  END IF;

  -- CASO A: Crédito con 0 DÍAS DE MORA (o null / sin mora) -> Resguardar
  IF COALESCE(NEW."DIAS MORA", 0) = 0 THEN
    IF NOT (NEW."GESTOR ASIGNADO" ILIKE 'AL CORRIENTE - %') THEN
      NEW."GESTOR ASIGNADO" := 'AL CORRIENTE - ' || TRIM(NEW."GESTOR ASIGNADO");
    END IF;
  
  -- CASO B: Crédito con MORA ACTIVA (> 0 días) -> Restaurar gestor para visita
  ELSE
    IF NEW."GESTOR ASIGNADO" ILIKE 'AL CORRIENTE - %' THEN
      NEW."GESTOR ASIGNADO" := TRIM(SUBSTRING(NEW."GESTOR ASIGNADO" FROM 16));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear Trigger en asignacion_gestores
DROP TRIGGER IF EXISTS trigger_gestores_al_corriente ON public.asignacion_gestores;
CREATE TRIGGER trigger_gestores_al_corriente
BEFORE INSERT OR UPDATE OF "DIAS MORA", "GESTOR ASIGNADO"
ON public.asignacion_gestores
FOR EACH ROW
EXECUTE FUNCTION trg_fn_gestores_al_corriente();


-- 2. FUNCIÓN PARA PROPAGAR ESTATUS A AVALES (AFTER INSERT OR UPDATE EN ASIGNACION_GESTORES)
CREATE OR REPLACE FUNCTION trg_fn_sync_avales_al_corriente()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la cuenta quedó marcada como AL CORRIENTE, asegurar que sus avales también lo estén
  IF NEW."GESTOR ASIGNADO" ILIKE 'AL CORRIENTE - %' THEN
    UPDATE public.asignacion_avales
    SET gestor_asignado = 'AL CORRIENTE - ' || REGEXP_REPLACE(gestor_asignado, '^AL CORRIENTE - ', '', 'i')
    WHERE num_cuenta = NEW."NoCUENTA"
      AND NOT (gestor_asignado ILIKE 'AL CORRIENTE - %');

  -- Si la cuenta tiene MORA ACTIVA, asegurar que sus avales tengan el gestor limpio para visita
  ELSE
    UPDATE public.asignacion_avales
    SET gestor_asignado = REGEXP_REPLACE(gestor_asignado, '^AL CORRIENTE - ', '', 'i')
    WHERE num_cuenta = NEW."NoCUENTA"
      AND (gestor_asignado ILIKE 'AL CORRIENTE - %');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear Trigger de sincronización de avales
DROP TRIGGER IF EXISTS trigger_sync_avales_al_corriente ON public.asignacion_gestores;
CREATE TRIGGER trigger_sync_avales_al_corriente
AFTER INSERT OR UPDATE OF "DIAS MORA", "GESTOR ASIGNADO"
ON public.asignacion_gestores
FOR EACH ROW
EXECUTE FUNCTION trg_fn_sync_avales_al_corriente();


-- 3. FUNCIÓN PARA NUEVOS AVALES EN ASIGNACION_AVALES (BEFORE INSERT OR UPDATE)
CREATE OR REPLACE FUNCTION trg_fn_avales_insert_check()
RETURNS TRIGGER AS $$
DECLARE
  v_cuenta_al_corriente BOOLEAN := FALSE;
  v_gestor_cuenta TEXT;
BEGIN
  IF NEW.num_cuenta IS NULL THEN
    RETURN NEW;
  END IF;

  -- Consultar estatus de la cuenta titular en asignacion_gestores
  SELECT 
    (COALESCE("DIAS MORA", 0) = 0 OR "GESTOR ASIGNADO" ILIKE 'AL CORRIENTE - %'),
    "GESTOR ASIGNADO"
  INTO v_cuenta_al_corriente, v_gestor_cuenta
  FROM public.asignacion_gestores
  WHERE "NoCUENTA" = NEW.num_cuenta
  LIMIT 1;

  IF FOUND THEN
    -- Si la cuenta titular está al corriente y el aval no tiene el prefijo, aplicárselo
    IF v_cuenta_al_corriente THEN
      IF NOT (NEW.gestor_asignado ILIKE 'AL CORRIENTE - %') THEN
        NEW.gestor_asignado := 'AL CORRIENTE - ' || TRIM(COALESCE(NEW.gestor_asignado, ''));
      END IF;
    -- Si la cuenta titular tiene mora activa y el aval tiene el prefijo, limpiárselo
    ELSE
      IF NEW.gestor_asignado ILIKE 'AL CORRIENTE - %' THEN
        NEW.gestor_asignado := TRIM(SUBSTRING(NEW.gestor_asignado FROM 16));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear Trigger en asignacion_avales
DROP TRIGGER IF EXISTS trigger_avales_insert_check ON public.asignacion_avales;
CREATE TRIGGER trigger_avales_insert_check
BEFORE INSERT OR UPDATE OF "gestor_asignado", "num_cuenta"
ON public.asignacion_avales
FOR EACH ROW
EXECUTE FUNCTION trg_fn_avales_insert_check();
