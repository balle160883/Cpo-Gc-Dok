import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = 'https://xygarchwyrflpzywcpid.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5Z2FyY2h3eXJmbHB6eXdjcGlkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE3MzU5NywiZXhwIjoyMDg4NzQ5NTk3fQ.NhK0bVSyLcWAP8EXU35agSs89DCq2LBhRTXv2_P-Y0A';

const TARGET_PG_URL = 'postgresql://postgres:Seguridad2028%40@31.97.144.6:5435/postgres';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "usuarios_gestor" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email" TEXT,
    "password_hash" TEXT,
    "gestor" TEXT,
    "rol" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "socios_datos" (
    "socio_id" BIGINT PRIMARY KEY,
    "friendly_code" TEXT,
    "nombre_completo" TEXT,
    "domicilio" TEXT,
    "telefono" TEXT,
    "data_json" JSONB,
    "sincronizado_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "prestamos_datos" (
    "prestamo_id" BIGINT PRIMARY KEY,
    "socio_id" BIGINT REFERENCES socios_datos(socio_id),
    "num_cuenta" TEXT,
    "estado" TEXT,
    "monto_original" NUMERIC,
    "saldo_total" NUMERIC,
    "saldo_capital" NUMERIC,
    "saldo_interes" NUMERIC,
    "saldo_mora" NUMERIC,
    "sincronizado_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "pagos_recuperados" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "fecha" TIMESTAMP WITH TIME ZONE,
    "fecha_real" TIMESTAMP WITH TIME ZONE,
    "num_credito" TEXT,
    "numero_socio" TEXT,
    "nombre" TEXT,
    "abono_total" NUMERIC,
    "abono_capital" NUMERIC,
    "descripcion" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "asignacion_gestores" (
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
    "PLAZOS" INTEGER,
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
    "DIAS MORA" INTEGER,
    "CUOTAS ATRASADAS" INTEGER,
    "LATITUD" NUMERIC,
    "LONGITUD" NUMERIC
);

CREATE TABLE IF NOT EXISTS "cobranza_interacciones" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "socio_id" BIGINT,
    "prestamo_id" BIGINT,
    "gestor_id" UUID,
    "fecha_gestion" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "tipo_contacto" TEXT,
    "resultado" TEXT NOT NULL,
    "descripcion" TEXT,
    "latitud" NUMERIC,
    "longitud" NUMERIC,
    "evidencia_url" TEXT,
    "sujeto_tipo" TEXT DEFAULT 'Socio',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "cobranza_promesas" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "prestamo_id" BIGINT,
    "interaccion_id" UUID,
    "monto_prometido" NUMERIC(15, 2) NOT NULL,
    "fecha_promesa" DATE NOT NULL,
    "estado" TEXT DEFAULT 'pendiente',
    "notificado_whatsapp" BOOLEAN DEFAULT FALSE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "cobranza_convenios" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "prestamo_id" BIGINT,
    "socio_id" BIGINT,
    "monto_total_convenio" NUMERIC(15, 2) NOT NULL,
    "parcialidades" INTEGER NOT NULL,
    "periodo_pagos" TEXT,
    "fecha_inicio" DATE NOT NULL,
    "estado" TEXT DEFAULT 'activo',
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "ubicaciones_gestores" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "gestor_id" UUID,
    "latitud" NUMERIC NOT NULL,
    "longitud" NUMERIC NOT NULL,
    "timestamp" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;

async function ensureColumnsExist(pgClient: Client, tableName: string, firstRow: Record<string, any>) {
  const res = await pgClient.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = $1;
  `, [tableName]);

  const existingCols = new Set(res.rows.map(r => r.column_name));

  for (const col of Object.keys(firstRow)) {
    if (!existingCols.has(col)) {
      console.log(`  ➕ Añadiendo columna faltante "${col}" a la tabla [${tableName}]...`);
      try {
        await pgClient.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`);
      } catch (e: any) {
        console.error(`  ⚠️ Error al añadir columna ${col}:`, e.message);
      }
    }
  }
}

async function main() {
  console.log('🚀 Conectando a PostgreSQL Dokploy en 31.97.144.6:5435...');
  const pgClient = new Client({ connectionString: TARGET_PG_URL });
  await pgClient.connect();
  console.log('✅ Conexión a Dokploy PostgreSQL exitosa.');

  console.log('🛠️ Creando esquema de tablas inicial...');
  await pgClient.query(SCHEMA_SQL);
  console.log('✅ Esquema inicial listo.');

  const tables = [
    'usuarios_gestor',
    'socios_datos',
    'prestamos_datos',
    'pagos_recuperados',
    'asignacion_gestores',
    'cobranza_interacciones',
    'cobranza_promesas',
    'cobranza_convenios',
    'ubicaciones_gestores'
  ];

  for (const table of tables) {
    try {
      console.log(`\n📦 Leyendo tabla [${table}] desde Supabase...`);
      const { data, error } = await supabase.from(table).select('*');

      if (error) {
        console.warn(`  ⚠️ Error al leer ${table}:`, error.message);
        continue;
      }

      if (!data || data.length === 0) {
        console.log(`  ℹ️ Tabla ${table} vacía.`);
        continue;
      }

      // Asegurar que todas las columnas existan en la tabla destino
      await ensureColumnsExist(pgClient, table, data[0]);

      console.log(`  📥 Migrando ${data.length} registros a PostgreSQL Dokploy...`);
      let insertedCount = 0;

      for (const row of data) {
        const keys = Object.keys(row);
        const values = Object.values(row);

        const columns = keys.map(k => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

        const query = `
          INSERT INTO "${table}" (${columns})
          VALUES (${placeholders})
          ON CONFLICT DO NOTHING;
        `;

        try {
          await pgClient.query(query, values);
          insertedCount++;
        } catch (insertErr: any) {
          console.error(`  ❌ Error al insertar en ${table}:`, insertErr.message);
        }
      }

      console.log(`  ✅ Tabla [${table}] migrada: ${insertedCount}/${data.length} registros.`);
    } catch (err: any) {
      console.error(`  ❌ Error en tabla ${table}:`, err.message);
    }
  }

  await pgClient.end();
  console.log('\n🎉 MIGRACIÓN AUTOMÁTICA FINALIZADA EXITOSAMENTE.');
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
