import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Falta SUPABASE_URL o SUPABASE_KEY en el archivo .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/**
 * Proceso automático de Sincronización y Validación de Cartera al Corriente
 * 1. Identifica cuentas en asignacion_gestores con 0 días de mora que aún no tengan prefijo 'AL CORRIENTE - ' y las resguarda.
 * 2. Identifica cuentas con > 0 días de mora que tengan el prefijo y las reactiva para los gestores.
 * 3. Sincroniza a todos los avales correspondientes en asignacion_avales.
 */
export async function sincronizarCarteraAlCorriente() {
  console.log('🚀 Iniciando Sincronización Automática de Cartera...');

  try {
    // 1. Obtener todas las cuentas de asignacion_gestores
    let allAccounts: any[] = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('asignacion_gestores')
        .select('"NoCUENTA", "GESTOR ASIGNADO", "DIAS MORA"')
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        allAccounts = allAccounts.concat(data);
        from += batchSize;
        if (data.length < batchSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    console.log(`📊 Total cuentas analizadas: ${allAccounts.length}`);

    // Clasificar cuentas que requieren actualización
    const cuentasParaResguardar: string[] = [];
    const cuentasParaReactivar: string[] = [];
    const cuentasAlCorrienteSet = new Set<string>();

    for (const c of allAccounts) {
      const diasMora = Number(c['DIAS MORA']) || 0;
      const gestor = String(c['GESTOR ASIGNADO'] || '').trim();
      const numCuenta = String(c.NoCUENTA || '').trim();

      if (diasMora === 0) {
        cuentasAlCorrienteSet.add(numCuenta);
        if (!gestor.startsWith('AL CORRIENTE - ')) {
          cuentasParaResguardar.push(numCuenta);
        }
      } else {
        if (gestor.startsWith('AL CORRIENTE - ')) {
          cuentasParaReactivar.push(numCuenta);
        }
      }
    }

    console.log(`🔍 Cuentas con 0 días por resguardar: ${cuentasParaResguardar.length}`);
    console.log(`🔄 Cuentas con mora activa por reactivar: ${cuentasParaReactivar.length}`);

    // Aplicar resguardo a cuentas de 0 días
    for (const numCuenta of cuentasParaResguardar) {
      const c = allAccounts.find(x => x.NoCUENTA === numCuenta);
      const gestorLimpio = String(c['GESTOR ASIGNADO'] || '').trim();
      const nuevoGestor = `AL CORRIENTE - ${gestorLimpio}`;

      await supabase
        .from('asignacion_gestores')
        .update({ 'GESTOR ASIGNADO': nuevoGestor })
        .eq('NoCUENTA', numCuenta);
    }

    // Aplicar reactivación a cuentas con mora
    for (const numCuenta of cuentasParaReactivar) {
      const c = allAccounts.find(x => x.NoCUENTA === numCuenta);
      const gestorActual = String(c['GESTOR ASIGNADO'] || '').trim();
      const gestorLimpio = gestorActual.replace(/^AL CORRIENTE - /i, '').trim();

      await supabase
        .from('asignacion_gestores')
        .update({ 'GESTOR ASIGNADO': gestorLimpio })
        .eq('NoCUENTA', numCuenta);
    }

    // 2. Sincronizar avales en asignacion_avales
    let allAvales: any[] = [];
    from = 0;
    hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('asignacion_avales')
        .select('id, num_cuenta, gestor_asignado')
        .range(from, from + batchSize - 1);

      if (error) throw error;
      if (data && data.length > 0) {
        allAvales = allAvales.concat(data);
        from += batchSize;
        if (data.length < batchSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    console.log(`👥 Total avales analizados: ${allAvales.length}`);

    let avalesResguardados = 0;
    let avalesReactivados = 0;

    for (const a of allAvales) {
      const numCuenta = String(a.num_cuenta || '').trim();
      const gestor = String(a.gestor_asignado || '').trim();
      const cuentaEsAlCorriente = cuentasAlCorrienteSet.has(numCuenta);

      if (cuentaEsAlCorriente) {
        if (!gestor.startsWith('AL CORRIENTE - ')) {
          const nuevoGestor = `AL CORRIENTE - ${gestor}`;
          await supabase
            .from('asignacion_avales')
            .update({ gestor_asignado: nuevoGestor })
            .eq('id', a.id);
          avalesResguardados++;
        }
      } else {
        if (gestor.startsWith('AL CORRIENTE - ')) {
          const gestorLimpio = gestor.replace(/^AL CORRIENTE - /i, '').trim();
          await supabase
            .from('asignacion_avales')
            .update({ gestor_asignado: gestorLimpio })
            .eq('id', a.id);
          avalesReactivados++;
        }
      }
    }

    console.log(`🛡️ Avales resguardados: ${avalesResguardados}`);
    console.log(`🔄 Avales reactivados: ${avalesReactivados}`);
    console.log('✅ Sincronización completada exitosamente.');

    return {
      cuentasResguardadas: cuentasParaResguardar.length,
      cuentasReactivadas: cuentasParaReactivar.length,
      avalesResguardados,
      avalesReactivados
    };
  } catch (error: any) {
    console.error('❌ Error durante la sincronización:', error.message);
    throw error;
  }
}

if (require.main === module) {
  sincronizarCarteraAlCorriente().then(() => process.exit(0)).catch(() => process.exit(1));
}
