import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = 'https://xygarchwyrflpzywcpid.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5Z2FyY2h3eXJmbHB6eXdjcGlkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE3MzU5NywiZXhwIjoyMDg4NzQ5NTk3fQ.NhK0bVSyLcWAP8EXU35agSs89DCq2LBhRTXv2_P-Y0A';

const TARGET_PG_URL = 'postgresql://postgres:Seguridad2028%40@31.97.144.6:5435/postgres';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fixInteracciones() {
  console.log('🔧 Ajustando tipo de columnas en cobranza_interacciones a TEXT...');
  const pgClient = new Client({ connectionString: TARGET_PG_URL });
  await pgClient.connect();

  await pgClient.query(`
    ALTER TABLE "cobranza_interacciones" 
    ALTER COLUMN "socio_id" TYPE TEXT USING "socio_id"::TEXT,
    ALTER COLUMN "prestamo_id" TYPE TEXT USING "prestamo_id"::TEXT;
  `);

  console.log('✅ Columnas ajustadas a TEXT.');

  console.log('📥 Obteniendo registros de cobranza_interacciones desde Supabase...');
  const { data, error } = await supabase.from('cobranza_interacciones').select('*');

  if (error) {
    console.error('❌ Error leyendo Supabase:', error.message);
    await pgClient.end();
    return;
  }

  console.log(`📥 Re-migrando ${data.length} registros...`);
  let inserted = 0;

  for (const row of data) {
    const keys = Object.keys(row);
    const values = Object.values(row);

    const columns = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const query = `
      INSERT INTO "cobranza_interacciones" (${columns})
      VALUES (${placeholders})
      ON CONFLICT DO NOTHING;
    `;

    try {
      await pgClient.query(query, values);
      inserted++;
    } catch (e: any) {
      console.error('  ❌ Error fila:', e.message);
    }
  }

  console.log(`✅ Registro completo de cobranza_interacciones: ${inserted}/${data.length}`);
  await pgClient.end();
}

fixInteracciones().catch(console.error);
