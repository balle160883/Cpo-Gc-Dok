import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

// Configuración de origen (Supabase Cloud)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xygarchwyrflpzywcpid.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5Z2FyY2h3eXJmbHB6eXdjcGlkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE3MzU5NywiZXhwIjoyMDg4NzQ5NTk3fQ.NhK0bVSyLcWAP8EXU35agSs89DCq2LBhRTXv2_P-Y0A';

// Configuración de destino (PostgreSQL Dokploy)
// Codificamos 'Seguridad2028@' como 'Seguridad2028%40' para evitar conflictos de parseo en la URL
const TARGET_PG_URL = process.env.TARGET_PG_URL || 'postgresql://postgres:Seguridad2028%40@cobranza-postgrescobranza-yd2dbt:5432/postgres';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('🚀 Iniciando migración de datos desde Supabase a PostgreSQL en Dokploy...');

  const pgClient = new Client({ connectionString: TARGET_PG_URL });
  await pgClient.connect();
  console.log('✅ Conectado a la base de datos PostgreSQL de Dokploy.');

  // Lista de tablas a migrar en orden de dependencia
  const tables = [
    'usuarios_gestor',
    'socios_datos',
    'prestamos_datos',
    'asignacion_gestores',
    'cobranza_interacciones',
    'cobranza_promesas',
    'cobranza_convenios',
    'ubicaciones_gestores'
  ];

  for (const table of tables) {
    try {
      console.log(`📦 Obteniendo datos de la tabla: ${table}...`);
      const { data, error } = await supabase.from(table).select('*');

      if (error) {
        console.error(`⚠️ Error al leer ${table} de Supabase:`, error.message);
        continue;
      }

      if (!data || data.length === 0) {
        console.log(`ℹ️ La tabla ${table} está vacía. Continuando...`);
        continue;
      }

      console.log(`📥 Insertando ${data.length} registros en ${table}...`);

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

        await pgClient.query(query, values);
      }

      console.log(`✅ Tabla ${table} migrada exitosamente.`);
    } catch (err: any) {
      console.error(`❌ Error procesando tabla ${table}:`, err.message);
    }
  }

  await pgClient.end();
  console.log('🎉 Migración completada con éxito.');
}

runMigration().catch(err => {
  console.error('❌ Error fatal en migración:', err);
});
