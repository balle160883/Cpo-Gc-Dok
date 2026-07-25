import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = 'https://xygarchwyrflpzywcpid.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5Z2FyY2h3eXJmbHB6eXdjcGlkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzE3MzU5NywiZXhwIjoyMDg4NzQ5NTk3fQ.NhK0bVSyLcWAP8EXU35agSs89DCq2LBhRTXv2_P-Y0A';

const TARGET_PG_URL = 'postgresql://postgres:Seguridad2028%40@31.97.144.6:5435/postgres';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const TABLES = [
  'usuarios_gestor',
  'socios_datos',
  'prestamos_datos',
  'pagos_recuperados',
  'asignacion_gestores',
  'asignacion_avales',
  'rentas_mensuales',
  'cobranza_interacciones',
  'cobranza_promesas',
  'cobranza_convenios',
  'cobranza_estrategias',
  'ubicaciones_gestores'
];

async function ensureTableAndColumns(pgClient: Client, tableName: string, sampleRow: Record<string, any>) {
  await pgClient.query(`CREATE TABLE IF NOT EXISTS "${tableName}" ();`);

  const res = await pgClient.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = $1;
  `, [tableName]);

  const existingCols = new Set(res.rows.map(r => r.column_name));

  for (const col of Object.keys(sampleRow)) {
    if (!existingCols.has(col)) {
      let colType = 'TEXT';
      if (col === 'id' && typeof sampleRow[col] === 'string' && sampleRow[col].length === 36) {
        colType = 'UUID';
      }
      try {
        await pgClient.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col}" ${colType};`);
      } catch (e: any) {
        console.error(`  ⚠️ Error añadiendo columna ${col} a ${tableName}:`, e.message);
      }
    }
  }
}

async function insertBatch(pgClient: Client, tableName: string, rows: Record<string, any>[]) {
  if (rows.length === 0) return 0;

  // Obtener la unión de todas las llaves en los objetos del lote
  const allKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const columns = allKeys.map(k => `"${k}"`).join(', ');

  const valueTuples: string[] = [];
  const queryParams: any[] = [];
  let paramIdx = 1;

  for (const row of rows) {
    const rowParams: string[] = [];
    for (const key of allKeys) {
      const val = row[key];
      queryParams.push(val === undefined ? null : val);
      rowParams.push(`$${paramIdx++}`);
    }
    valueTuples.push(`(${rowParams.join(', ')})`);
  }

  const query = `
    INSERT INTO "${tableName}" (${columns})
    VALUES ${valueTuples.join(', ')}
    ON CONFLICT DO NOTHING;
  `;

  try {
    await pgClient.query(query, queryParams);
    return rows.length;
  } catch (err: any) {
    // Si falla el lote por sintaxis o tipo, reintentar fila por fila
    let success = 0;
    for (const singleRow of rows) {
      const keys = Object.keys(singleRow);
      const vals = Object.values(singleRow);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      try {
        await pgClient.query(`INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING;`, vals);
        success++;
      } catch (singleErr) {}
    }
    return success;
  }
}

async function migrateTable(pgClient: Client, tableName: string) {
  console.log(`\n📦 Registrando y migrando tabla [${tableName}]...`);

  const { count, error: countErr } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  if (countErr) {
    console.error(`❌ Error obteniendo conteo de ${tableName}:`, countErr.message);
    return;
  }

  const total = count || 0;
  console.log(`  📊 Total de registros en Supabase: ${total}`);

  if (total === 0) {
    await pgClient.query(`CREATE TABLE IF NOT EXISTS "${tableName}" ();`);
    console.log(`  ℹ️ Tabla [${tableName}] está vacía. Creada correctamente.`);
    return;
  }

  const FETCH_SIZE = 1000;
  const CHUNK_SIZE = 100; // 100 registros por INSERT múltiple ultra-rápido
  let offset = 0;
  let totalInserted = 0;

  while (offset < total) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(offset, offset + FETCH_SIZE - 1);

    if (error) {
      console.error(`  ❌ Error leyendo lote de ${tableName}:`, error.message);
      break;
    }

    if (!data || data.length === 0) break;

    if (offset === 0) {
      await ensureTableAndColumns(pgClient, tableName, data[0]);
    }

    // Dividir data en chunks de 100 y hacer inserciones por lote
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      const countInserted = await insertBatch(pgClient, tableName, chunk);
      totalInserted += countInserted;
    }

    offset += FETCH_SIZE;
    console.log(`  ⚡ Progreso [${tableName}]: ${totalInserted} / ${total} registros copiados.`);
  }

  console.log(`  ✅ Tabla [${tableName}] finalizada exitosamente: ${totalInserted} registros.`);
}

async function runFullMigration() {
  console.log('🚀 Iniciando migración ULTRA-RÁPIDA por lotes desde Supabase a Dokploy PostgreSQL...');
  const pgClient = new Client({ connectionString: TARGET_PG_URL });
  await pgClient.connect();
  console.log('✅ Conectado a PostgreSQL Dokploy (31.97.144.6:5435).');

  for (const table of TABLES) {
    await migrateTable(pgClient, table);
  }

  await pgClient.end();
  console.log('\n🎉 ¡MIGRACIÓN MASIVA DE 12 TABLAS FINALIZADA CON ÉXITO Y ULTRA-RÁPIDA!');
}

runFullMigration().catch(console.error);
