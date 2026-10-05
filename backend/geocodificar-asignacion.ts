import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Cargar variables de entorno del backend
dotenv.config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_KEY || '';
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Error: Falta configurar SUPABASE_URL o SUPABASE_KEY en el archivo backend/.env');
  process.exit(1);
}

if (!MAPBOX_TOKEN) {
  console.error('❌ Error: Falta configurar MAPBOX_ACCESS_TOKEN en el archivo backend/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Limpieza de caracteres y abreviaciones comunes en direcciones mexicanas
function limpiarDomicilio(domicilio?: string): string {
  if (!domicilio) return '';
  return domicilio
    .replace(/#/g, '')
    .replace(/N\.?\s*INT\.?.*/i, '')
    .replace(/INT\.?.*/i, '')
    .replace(/SN\b/gi, '')
    .replace(/S\/N\b/gi, '')
    .replace(/DOMICILIO CONOCIDO/gi, '')
    .replace(/CONOCIDO/gi, '')
    .trim();
}

// Consulta a la API de Geocodificación de Mapbox
async function geocodificarQuery(queryTexto: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const encoded = encodeURIComponent(queryTexto);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=mx`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as any;
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
  } catch (err) {
    // Si falla la petición se maneja silenciosamente para el fallback
  }
  return null;
}

// Estrategia con cascada (fallback) para maximizar la tasa de éxito
async function obtenerCoordenadas(domicilio?: string, colonia?: string, municipio?: string, estado?: string) {
  const calle = limpiarDomicilio(domicilio);
  const col = (colonia || '').trim();
  const mpo = (municipio || '').trim();
  const edo = (estado || 'JALISCO').trim();

  // 1. Intento con Dirección Completa (Calle + Colonia + Municipio + Estado)
  if (calle && calle.length > 2) {
    const queryCompleta = `${calle}, ${col ? col + ', ' : ''}${mpo}, ${edo}, Mexico`;
    const res = await geocodificarQuery(queryCompleta);
    if (res) return { coords: res, precision: 'DIRECCIÓN EXACTA' };
  }

  // 2. Fallback: Colonia + Municipio + Estado
  if (col && col.length > 2) {
    const queryColonia = `${col}, ${mpo}, ${edo}, Mexico`;
    const res = await geocodificarQuery(queryColonia);
    if (res) return { coords: res, precision: 'COLONIA' };
  }

  // 3. Fallback: Municipio + Estado
  if (mpo && mpo.length > 2) {
    const queryMpo = `${mpo}, ${edo}, Mexico`;
    const res = await geocodificarQuery(queryMpo);
    if (res) return { coords: res, precision: 'MUNICIPIO' };
  }

  return null;
}

async function procesarSocio(socio: any) {
  const resultado = await obtenerCoordenadas(socio.DOMICILIO, socio.COLONIA, socio.MUNICIPIO, socio.ESTADO);
  if (resultado && resultado.coords) {
    const { error } = await supabase
      .from('asignacion_gestores')
      .update({
        LATITUD: resultado.coords.lat,
        LONGITUD: resultado.coords.lng,
      })
      .eq('NoCUENTA', socio.NoCUENTA);

    if (!error) {
      return { exito: true, precision: resultado.precision };
    }
  }
  return { exito: false };
}

// Función principal con procesamiento por lotes concurrentes controlados
export async function iniciarGeocodificacion(limiteMaximo: number = 0) {
  console.log('===========================================================');
  console.log('🗺️  INICIANDO GEOCODIFICACIÓN DE ASIGNACION_GESTORES');
  console.log(`🔌 Conexión Supabase: ${SUPABASE_URL}`);
  console.log('===========================================================\n');

  // Contar socios pendientes
  const { count: pendientesInicial } = await supabase
    .from('asignacion_gestores')
    .select('*', { count: 'exact', head: true })
    .is('LATITUD', null);

  console.log(`📋 Total de socios pendientes sin LATITUD/LONGITUD: ${pendientesInicial}`);

  if (!pendientesInicial || pendientesInicial === 0) {
    console.log('✅ ¡Todos los socios de la tabla ya tienen coordenadas asignadas!');
    return;
  }

  let totalActualizados = 0;
  let totalFallidos = 0;
  let loteNum = 1;
  const BATCH_SIZE = 50;
  const CONCURRENCY = 6; // Peticiones simultáneas a Mapbox

  while (true) {
    const { data: socios, error } = await supabase
      .from('asignacion_gestores')
      .select('NoCUENTA, NOMBRE, DOMICILIO, COLONIA, MUNICIPIO, ESTADO')
      .is('LATITUD', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error('❌ Error al obtener lote de Supabase:', error.message);
      break;
    }

    if (!socios || socios.length === 0) {
      console.log('\n✅ No hay más registros pendientes por procesar.');
      break;
    }

    console.log(`\n⏳ [Lote #${loteNum}] Procesando bloque de ${socios.length} registros...`);

    // Procesar en chunks de concurrencia controlada
    for (let i = 0; i < socios.length; i += CONCURRENCY) {
      const chunk = socios.slice(i, i + CONCURRENCY);
      const resultados = await Promise.all(chunk.map((socio) => procesarSocio(socio)));

      for (const res of resultados) {
        if (res.exito) {
          totalActualizados++;
        } else {
          totalFallidos++;
        }
      }

      // Pequeña pausa para respetar los límites de la API de Mapbox
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    console.log(`✔️ Lote #${loteNum} completado. Total acumulado geocodificado: ${totalActualizados} socios.`);
    loteNum++;

    if (limiteMaximo > 0 && totalActualizados >= limiteMaximo) {
      console.log(`⏹️ Límite solicitado (${limiteMaximo}) alcanzado.`);
      break;
    }
  }

  console.log('\n===========================================================');
  console.log('🎉 RESUMEN DE LA GEOCODIFICACIÓN:');
  console.log(`   - Socios actualizados con Lat/Lng en Supabase: ${totalActualizados}`);
  console.log(`   - Sin coincidencia o incompletos: ${totalFallidos}`);
  console.log('===========================================================');
}

// Ejecutar si se llama directamente por CLI
if (require.main === module) {
  iniciarGeocodificacion().catch((err) => {
    console.error('Error en el proceso de geocodificación:', err);
  });
}
