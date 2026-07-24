-- ============================================================================
-- PASO 1: EJECUTAR EN SUPABASE (SQL EDITOR)
-- ============================================================================
-- Crea la publicación para transmitir cambios de las tablas en tiempo real
CREATE PUBLICATION dokploy_sync FOR TABLE 
    asignacion_gestores, 
    usuarios_gestor, 
    cobranza_interacciones, 
    cobranza_promesas, 
    pagos_recuperados, 
    ubicaciones_gestores;

-- ============================================================================
-- PASO 2: EJECUTAR EN DOKPLOY POSTGRESQL (NUEVA BASE DE DATOS)
-- ============================================================================
-- Crear las tablas con las mismas estructuras en Dokploy PostgreSQL

CREATE TABLE IF NOT EXISTS usuarios_gestor (
    id SERIAL PRIMARY KEY,
    email TEXT,
    password_hash TEXT,
    gestor TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    rol TEXT
);

CREATE TABLE IF NOT EXISTS asignacion_gestores (
    "GESTOR ASIGNADO" TEXT,
    "No GESTOR ASIGNADO" TEXT,
    "FECHA ASIGNACION" TEXT,
    "NoSOCIO" TEXT,
    "NoCUENTA" TEXT PRIMARY KEY,
    "NOMBRE" TEXT,
    "DOMICILIO" TEXT,
    "CRUCES" TEXT,
    "C.P." TEXT,
    "COLONIA" TEXT,
    "MUNICIPIO" TEXT,
    "ESTADO" TEXT,
    "TELEFONOS" TEXT,
    "SITUACIÓN DEL CRÉDITO" TEXT,
    "INTERÉS" NUMERIC,
    "INTERÉS MORATORIO" NUMERIC,
    "PRINCIPAL" NUMERIC,
    "CAPITAL MOROSO" NUMERIC,
    "CAPITAL CASTIGADO" NUMERIC,
    "INTERÉS CASTIGADO" NUMERIC,
    "MORA CASTIGADO" NUMERIC,
    "CARGO SEGURO" NUMERIC,
    "CARGO COBRANZA" NUMERIC,
    "SALDO TOTAL" NUMERIC,
    "SALDO AL DIA" NUMERIC,
    "Producto" TEXT,
    "MONTO APROBADO" NUMERIC,
    "PLAZOS" TEXT,
    "FRECUENCIA PAGOS" TEXT,
    "PARTE SOCIAL" NUMERIC,
    "ABIN" NUMERIC,
    "AHORRO ADULTO" NUMERIC,
    "CUENTA CORRIENTE" NUMERIC,
    "AHORRO DEBITO" NUMERIC,
    "AVAL 1" TEXT,
    "NOMBRE D.A.1" TEXT,
    "DOMICILIO D.A.1" TEXT,
    "C.P. D.A.1" TEXT,
    "TELÉFONOS D.A.1" TEXT,
    "AVAL 2" TEXT,
    "NOMBRE D.A.2" TEXT,
    "DOMICILIO D.A.2" TEXT,
    "C.P. D.A.2" TEXT,
    "TELÉFONOS D.A.2" TEXT,
    "DIAS MORA" NUMERIC,
    "CUOTAS ATRASADAS" NUMERIC,
    "LATITUD" NUMERIC,
    "LONGITUD" NUMERIC,
    "LATITUD_A1" NUMERIC,
    "LONGITUD_A1" NUMERIC,
    "LATITUD_A2" NUMERIC,
    "LONGITUD_A2" NUMERIC,
    "ULTIMO PAGO" TEXT,
    "PRÓXIMO VENCIMIENTO" TEXT
);

CREATE TABLE IF NOT EXISTS cobranza_interacciones (
    id SERIAL PRIMARY KEY,
    socio_id TEXT,
    prestamo_id TEXT,
    gestor_id TEXT,
    fecha_gestion TIMESTAMP WITH TIME ZONE,
    tipo_contacto TEXT,
    resultado TEXT,
    descripcion TEXT,
    latitud NUMERIC,
    longitud NUMERIC,
    evidencia_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sujeto_tipo TEXT,
    num_cuenta TEXT,
    fecha_inicio_gestion TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS cobranza_promesas (
    id SERIAL PRIMARY KEY,
    prestamo_id TEXT,
    interaccion_id INT,
    monto_prometido NUMERIC,
    fecha_promesa TIMESTAMP WITH TIME ZONE,
    estado TEXT,
    notificado_whatsapp BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagos_recuperados (
    id SERIAL PRIMARY KEY,
    fecha DATE,
    fecha_real TIMESTAMP WITH TIME ZONE,
    num_credito TEXT,
    numero_socio TEXT,
    nombre TEXT,
    abono_total NUMERIC,
    abono_capital NUMERIC,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    gestor_asignado TEXT,
    no_gestor_asignado TEXT,
    fecha_asignacion TEXT,
    nosocio TEXT,
    nocuenta TEXT,
    situacion_del_credito TEXT,
    producto TEXT,
    saldo_total NUMERIC,
    dias_mora INT,
    domicilio TEXT,
    cruces TEXT,
    c_p TEXT,
    colonia TEXT,
    municipio TEXT,
    estado TEXT,
    telefonos TEXT,
    interes NUMERIC,
    interes_moratorio NUMERIC,
    principal NUMERIC,
    capital_moroso NUMERIC,
    capital_castigado NUMERIC,
    interes_castigado NUMERIC,
    mora_castigado NUMERIC,
    cargo_seguro NUMERIC,
    cargo_cobranza NUMERIC,
    saldo_al_dia NUMERIC,
    monto_aprobado NUMERIC,
    plazos TEXT,
    frecuencia_pagos TEXT,
    parte_social NUMERIC,
    abin NUMERIC,
    ahorro_adulto NUMERIC,
    cuenta_corriente NUMERIC,
    ahorro_debito NUMERIC,
    aval_1 TEXT,
    nombre_d_a_1 TEXT,
    domicilio_d_a_1 TEXT,
    c_p_d_a_1 TEXT,
    telefonos_d_a_1 TEXT,
    aval_2 TEXT,
    nombre_d_a_2 TEXT,
    domicilio_d_a_2 TEXT,
    c_p_d_a_2 TEXT,
    telefonos_d_a_2 TEXT,
    cuotas_atrasadas INT,
    "ULTIMO PAGO" TEXT,
    "PRÓXIMO VENCIMIENTO" TEXT
);

CREATE TABLE IF NOT EXISTS ubicaciones_gestores (
    id SERIAL PRIMARY KEY,
    gestor_id TEXT,
    latitud NUMERIC,
    longitud NUMERIC,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PASO 3: CREAR LA SUSCRIPCIÓN EN DOKPLOY POSTGRESQL TOWARDS SUPABASE
-- Sustituye TU_PASSWORD_DE_SUPABASE por tu contraseña real del usuario postgres en Supabase
-- ============================================================================
-- CREATE SUBSCRIPTION dokploy_sub
-- CONNECTION 'host=db.xygarchwyrflpzywcpid.supabase.co port=5432 dbname=postgres user=postgres.xygarchwyrflpzywcpid password=TU_PASSWORD_DE_SUPABASE sslmode=require'
-- PUBLICATION dokploy_sync;
