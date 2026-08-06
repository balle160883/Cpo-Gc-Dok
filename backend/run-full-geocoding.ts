import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const SERVICE_ROLE_KEY = process.env.SUPABASE_KEY || '';
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || '';
const supabase = createClient(process.env.SUPABASE_URL!, SERVICE_ROLE_KEY);

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const query = encodeURIComponent(address);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=mx`;
    const response = await fetch(url);
    const data = (await response.json()) as any;

    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
  } catch (e) {
    console.error(`Error geocodificando: ${address}`, e);
  }
  return null;
}

function cleanStreet(domicilio?: string): string {
  if (!domicilio) return '';
  return domicilio
    .replace(/#/g, '')
    .replace(/N\.?\s*INT\.?.*/i, '')
    .replace(/INT\.?.*/i, '')
    .replace(/SN/gi, '')
    .replace(/DOMICILIO CONOCIDO/gi, '')
    .replace(/CONOCIDO/gi, '')
    .trim();
}

async function geocodeWithFallback(domicilio?: string, colonia?: string, municipio?: string, estado?: string) {
  const street = cleanStreet(domicilio);
  const col = (colonia || '').trim();
  const mpo = (municipio || '').trim();
  const state = (estado || 'JALISCO').trim();

  // Intento 1: Dirección completa
  if (street) {
    const full = `${street}, ${col}, ${mpo}, ${state}, Mexico`;
    const res = await geocode(full);
    if (res) return res;
  }

  // Intento 2: Colonia, Municipio, Estado
  if (col) {
    const colSearch = `${col}, ${mpo}, ${state}, Mexico`;
    const res = await geocode(colSearch);
    if (res) return res;
  }

  // Intento 3: Municipio, Estado
  if (mpo) {
    const mpoSearch = `${mpo}, ${state}, Mexico`;
    const res = await geocode(mpoSearch);
    if (res) return res;
  }

  return null;
}

async function main() {
  console.log('=== INICIANDO GEOCODIFICACIÓN MASIVA DE ASIGNACION_GESTORES ===');
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
  console.log(`Mapbox Token activo: ${MAPBOX_TOKEN ? 'SÍ' : 'NO'}`);

  let totalSocioGeocoded = 0;
  let totalA1Geocoded = 0;
  let totalA2Geocoded = 0;
  let processedBatch = 0;

  let hasMore = true;

  while (hasMore) {
    // 1. Geocodificación de SOCIOS (LATITUD IS NULL)
    const { data: socios, error: errSocio } = await supabase
      .from('asignacion_gestores')
      .select('NoCUENTA, DOMICILIO, COLONIA, MUNICIPIO, ESTADO')
      .is('LATITUD', null)
      .limit(50);

    if (errSocio) {
      console.error('Error al obtener socios pendientes:', errSocio.message);
      break;
    }

    if (!socios || socios.length === 0) {
      console.log('✅ Todos los socios principales han sido geocodificados (0 pendientes).');
      hasMore = false;
      break;
    }

    processedBatch++;
    console.log(`[Lote #${processedBatch}] Procesando ${socios.length} socios principales pendientes... (Total geocodificados acumulados: ${totalSocioGeocoded})`);

    for (const socio of socios) {
      const coords = await geocodeWithFallback(socio.DOMICILIO, socio.COLONIA, socio.MUNICIPIO, socio.ESTADO);
      if (coords) {
        await supabase
          .from('asignacion_gestores')
          .update({
            LATITUD: coords.lat,
            LONGITUD: coords.lng,
          })
          .eq('NoCUENTA', socio.NoCUENTA);

        totalSocioGeocoded++;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  // 2. Geocodificación opcional de AVAL 1 (LATITUD_A1 IS NULL)
  console.log('=== GEOCODIFICANDO AVALES 1 PENDIENTES ===');
  let hasMoreA1 = true;
  while (hasMoreA1) {
    const { data: avales1, error: errA1 } = await supabase
      .from('asignacion_gestores')
      .select('NoCUENTA, "DOMICILIO D.A.1", "C.P. D.A.1", MUNICIPIO, ESTADO')
      .not('NOMBRE D.A.1', 'is', null)
      .is('LATITUD_A1', null)
      .limit(50);

    if (errA1 || !avales1 || avales1.length === 0) {
      hasMoreA1 = false;
      break;
    }

    for (const a1 of avales1) {
      const dom = (a1 as any)['DOMICILIO D.A.1'];
      const coords = await geocodeWithFallback(dom, '', a1.MUNICIPIO, a1.ESTADO);
      if (coords) {
        await supabase
          .from('asignacion_gestores')
          .update({
            LATITUD_A1: coords.lat,
            LONGITUD_A1: coords.lng,
          })
          .eq('NoCUENTA', a1.NoCUENTA);

        totalA1Geocoded++;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  console.log('🎉 ¡PROCESO DE GEOCODIFICACIÓN FINALIZADO!');
  console.log(`- Socios geocodificados en esta sesión: ${totalSocioGeocoded}`);
  console.log(`- Avales 1 geocodificados en esta sesión: ${totalA1Geocoded}`);
}

main().catch((err) => console.error('Error fatal:', err));
