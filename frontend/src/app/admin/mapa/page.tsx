'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { fetchGestoresLocations } from '@/lib/api';
import { MapPin, User, Clock, Navigation } from 'lucide-react';

function getMapboxToken(): string {
  if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    return process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  }
  try {
    const b64 = 'cGsuZXlKMUlqb2laR3BpWWpFMk1EZzRNeUlzSW1FaU9pSmpiVzR6WTJvMGRUVXdPR2R4TW5GdlltSndaMnh6Ym5Vd0luMC5Zdjc0MDhqOXRBaWVhWC1ZQi12QXdn';
    if (typeof window !== 'undefined') {
      return atob(b64);
    }
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

const MAPBOX_TOKEN = getMapboxToken();

interface GestorLocation {
  id: string;
  gestor_id: string;
  latitud: number;
  longitud: number;
  timestamp: string;
  gestor_name: string;
}

export default function GestoresMapaPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [locations, setLocations] = useState<GestorLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    if (!MAPBOX_TOKEN) {
      setMapError('Token de Mapbox no configurado. Agrega NEXT_PUBLIC_MAPBOX_TOKEN en los Build-time Arguments de Dokploy.');
      setLoading(false);
      return;
    }

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11', // Estilo premium oscuro
        center: [-102.5528, 23.6345], // México central
        zoom: 5,
      });

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    } catch (e: any) {
      console.error('Error al inicializar Mapbox GL:', e);
      setMapError('Error al inicializar el mapa. Verifica tu token de Mapbox.');
      setLoading(false);
      return;
    }


    const updateLocations = async () => {
      try {
        const data = await fetchGestoresLocations();
        setLocations(data);
        
        if (data.length > 0 && map.current) {
          // Ajustar el mapa al primer gestor si es la primera vez
          if (loading) {
             map.current.flyTo({
               center: [data[0].longitud, data[0].latitud],
               zoom: 12
             });
          }

          // Actualizar/Crear marcadores
          data.forEach((loc: GestorLocation) => {
            const existingMarker = markers.current.get(loc.gestor_id);
            
            if (existingMarker) {
              existingMarker.setLngLat([loc.longitud, loc.latitud]);
            } else {
              // Crear un elemento personalizado para el marcador (premium look)
              const el = document.createElement('div');
              el.className = 'marker';
              el.style.width = '40px';
              el.style.height = '40px';
              el.style.borderRadius = '50%';
              el.style.backgroundColor = '#3b82f6'; // Blue-500
              el.style.border = '3px solid white';
              el.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.5)';
              el.style.display = 'flex';
              el.style.alignItems = 'center';
              el.style.justifyContent = 'center';
              el.style.cursor = 'pointer';
              el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';

              const popup = new mapboxgl.Popup({ offset: 25 })
                .setHTML(`
                  <div style="color: #1e293b; padding: 5px;">
                    <h3 style="font-weight: bold; margin-bottom: 5px;">${loc.gestor_name}</h3>
                    <p style="font-size: 12px; margin: 0;">Última conexión:</p>
                    <p style="font-size: 12px; color: #64748b;">${new Date(loc.timestamp).toLocaleString()}</p>
                  </div>
                `);

              const marker = new mapboxgl.Marker(el)
                .setLngLat([loc.longitud, loc.latitud])
                .setPopup(popup)
                .addTo(map.current!);
              
              markers.current.set(loc.gestor_id, marker);
            }
          });
        }
        setLoading(false);
      } catch (error) {
        console.error('Error updating locations:', error);
      }
    };

    updateLocations();
    const interval = setInterval(updateLocations, 30000); // Actualizar cada 30 segundos

    return () => {
      clearInterval(interval);
      map.current?.remove();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="text-blue-500" />
            Geolocalización de Gestores
          </h1>
          <p className="text-slate-500">Monitoreo en tiempo real del personal de campo</p>
        </div>
        <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border border-blue-100">
          <Navigation size={16} className="animate-pulse" />
          {locations.length} gestores activos ahora
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[700px]">
        {/* Panel lateral de lista */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-50 bg-slate-50/50">
            <h2 className="font-semibold text-slate-800">Lista de Gestores</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {loading ? (
              <div className="p-4 text-center text-slate-400">Cargando gestores...</div>
            ) : locations.length === 0 ? (
              <div className="p-4 text-center text-slate-400">No hay gestores con ubicación disponible.</div>
            ) : (
              locations.map((loc) => (
                <button
                  key={loc.gestor_id}
                  onClick={() => map.current?.flyTo({ center: [loc.longitud, loc.latitud], zoom: 15 })}
                  className="w-full p-3 rounded-xl hover:bg-slate-50 transition-colors text-left flex items-start gap-3 border border-transparent hover:border-slate-100"
                >
                  <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                    <User size={18} />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="font-medium text-slate-900 truncate">{loc.gestor_name}</p>
                    <div className="flex items-center gap-1.6 text-xs text-slate-500 mt-1">
                      <Clock size={12} />
                      {new Date(loc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Mapa */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden relative group">
          <div ref={mapContainer} className="w-full h-full" />
          
          {/* Badge flotante premium */}
          <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/20 shadow-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 z-10 pointer-events-none">
            Mapbox High-Precision Engine
          </div>
          
          {mapError && (
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-30 p-6">
              <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-md text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center font-bold text-xl">
                  !
                </div>
                <h3 className="font-semibold text-slate-800 text-lg">Configuración de Mapbox Requerida</h3>
                <p className="text-slate-600 text-sm">{mapError}</p>
              </div>
            </div>
          )}

          {loading && !mapError && (
            <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-sm flex items-center justify-center z-20">
              <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-slate-600 font-medium">Iniciando Sistema de Rastreo...</p>
              </div>
            </div>
          )}

        </div>
      </div>
      
      <style jsx global>{`
        .marker {
          transition: transform 0.2s ease-out;
        }
        .marker:hover {
          transform: scale(1.15);
        }
        .mapboxgl-popup-content {
          border-radius: 12px;
          padding: 10px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(0, 0, 0, 0.05);
        }
        .mapboxgl-popup-close-button {
          padding: 4px;
          right: 4px;
          top: 4px;
        }
      `}</style>
    </div>
  );
}
