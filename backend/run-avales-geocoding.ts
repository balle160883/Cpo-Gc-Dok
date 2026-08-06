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
  console.log('=== INICIANDO GEOCODIFICACIÓN MASIVA DE ASIGNACION_AVALES ===');
  console.log(`Supabase URL: ${process.env.SUPABASE_URL}`);
  console.log(`Mapbox Token activo: ${MAPBOX_TOKEN ? 'SÍ' : 'NO'}`);

  let totalAvalesGeocoded = 0;
  let processedBatch = 0;

  let hasMore = true;

  while (hasMore) {
    const { data: avales, error } = await supabase
      .from('asignacion_avales')
      .select('id, domicilio_aval, colonia_aval, municipio_aval, estado_aval')
      .is('latitud', null)
      .limit(50);

    if (error) {
      console.error('Error al obtener avales pendientes:', error.message);
      break;
    }

    if (!avales || avales.length === 0) {
      console.log('✅ Todos los avales han sido geocodificados (0 pendientes).');
      hasMore = false;
      break;
    }

    processedBatch++;
    console.log(`[Lote #${processedBatch}] Procesando ${avales.length} avales pendientes... (Total geocodificados acumulados: ${totalAvalesGeocoded})`);

    for (const aval of avales) {
      const coords = await geocodeWithFallback(aval.domicilio_aval, aval.colonia_aval, aval.municipio_aval, aval.estado_aval);
      if (coords) {
        await supabase
          .from('asignacion_avales')
          .update({
            latitud: coords.lat,
            longitud: coords.lng,
          })
          .eq('id', aval.id);

        totalAvalesGeocoded++;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  console.log('🎉 ¡PROCESO DE GEOCODIFICACIÓN DE AVALES FINALIZADO!');
  console.log(`- Avales geocodificados en esta sesión: ${totalAvalesGeocoded}`);
}

main().catch((err) => console.error('Error fatal en avales:', err));
