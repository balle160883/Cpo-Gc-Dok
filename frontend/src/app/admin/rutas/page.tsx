'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAllGestores } from '@/lib/api';
import { 
  Calendar, 
  MapPin, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Search, 
  CheckSquare, 
  Square, 
  CalendarDays,
  Clock,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface ColoniaStat {
  nombre: string;
  totalCuentas: number;
  saldoTotal: number;
}

interface RutaProgramada {
  id: string;
  gestor_nombre: string;
  fecha: string;
  colonia: string;
  total_cuentas: number;
  asignado_por: string;
  created_at: string;
}

export default function PlanificadorRutasPage() {
  const [gestores, setGestores] = useState<string[]>([]);
  const [selectedGestor, setSelectedGestor] = useState<string>('');
  const [selectedFecha, setSelectedFecha] = useState<string>('');
  
  // Lista de colonias del gestor seleccionado
  const [colonias, setColonias] = useState<ColoniaStat[]>([]);
  const [selectedColonias, setSelectedColonias] = useState<string[]>([]);
  const [filterText, setFilterText] = useState<string>('');
  
  // Rutas ya asignadas
  const [rutasAsignadas, setRutasAsignadas] = useState<RutaProgramada[]>([]);
  
  // Estados de interfaz
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<string>('ELIZONDO CARDENAS SERGIO ARMANDO');

  // Inicializar fecha en hoy por defecto en formato YYYY-MM-DD
  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setSelectedFecha(`${yyyy}-${mm}-${dd}`);

    // Obtener usuario activo
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      try {
        const parsed = JSON.parse(userInfo);
        if (parsed.gestor) setCurrentUser(parsed.gestor);
        else if (parsed.email) setCurrentUser(parsed.email);
      } catch (e) {
        console.error(e);
      }
    }

    cargarGestores();
  }, []);

  // Cargar lista única de gestores con asignaciones activas
  const cargarGestores = async () => {
    setLoading(true);
    try {
      let uniqueGestores: string[] = [];

      // Intento 1: Usar la API oficial de gestores del backend
      try {
        const gestoresApi = await fetchAllGestores();
        if (Array.isArray(gestoresApi) && gestoresApi.length > 0) {
          uniqueGestores = gestoresApi
            .map((g: any) => (g.gestor_name || g.gestor || '').trim())
            .filter(Boolean);
        }
      } catch (apiErr) {
        console.warn('Fallo fetchAllGestores(), recurriendo a Supabase:', apiErr);
      }

      // Intento 2: Consultar directamente de asignacion_gestores de forma segura
      if (uniqueGestores.length === 0) {
        const { data, error } = await supabase
          .from('asignacion_gestores')
          .select('GESTOR ASIGNADO')
          .limit(1000);

        if (!error && data) {
          uniqueGestores = Array.from(
            new Set(
              data
                .map((row: any) => row['GESTOR ASIGNADO']?.trim())
                .filter(Boolean)
            )
          );
        }
      }

      // Intento 3: Consultar usuarios_gestor
      if (uniqueGestores.length === 0) {
        const { data: usrData } = await supabase
          .from('usuarios_gestor')
          .select('gestor');

        if (usrData) {
          uniqueGestores = Array.from(
            new Set(
              usrData
                .map((row: any) => row.gestor?.trim())
                .filter(Boolean)
            )
          );
        }
      }

      uniqueGestores.sort();

      if (uniqueGestores.length > 0) {
        setGestores(uniqueGestores);
        // Seleccionar por defecto a Jorge si existe, o al primer gestor
        const defaultGestor = uniqueGestores.find(g => g.includes('JORGE')) || uniqueGestores[0] || '';
        setSelectedGestor(defaultGestor);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: 'No se encontraron gestores en el sistema.' });
      }
    } catch (err: any) {
      console.error('Error al cargar gestores:', err);
      setMessage({ type: 'error', text: 'Error al conectar con la base de datos de asignaciones.' });
    } finally {
      setLoading(false);
    }
  };

  // Cargar colonias del gestor seleccionado y rutas ya programadas
  useEffect(() => {
    if (!selectedGestor) return;
    cargarColoniasDelGestor(selectedGestor);
    cargarRutasProgramadas(selectedGestor);
    setSelectedColonias([]);
  }, [selectedGestor]);

  const cargarColoniasDelGestor = async (gestor: string) => {
    try {
      // Hacemos la consulta limpia sin caracteres acentuados en los filtros de la URL
      const { data, error } = await supabase
        .from('asignacion_gestores')
        .select('COLONIA, "SALDO TOTAL", "SITUACIÓN DEL CRÉDITO"')
        .eq('GESTOR ASIGNADO', gestor);

      if (error) throw error;

      if (data) {
        const coloniaMap = new Map<string, { totalCuentas: number; saldoTotal: number }>();

        data.forEach((r: any) => {
          // Filtrar cuentas liquidadas de forma segura en memoria
          if (r['SITUACIÓN DEL CRÉDITO'] === 'LIQUIDADO') return;

          const col = (r.COLONIA || 'SIN COLONIA ESPECIFICADA').trim().toUpperCase();
          const saldo = Number(r['SALDO TOTAL']) || 0;

          if (!coloniaMap.has(col)) {
            coloniaMap.set(col, { totalCuentas: 0, saldoTotal: 0 });
          }

          const current = coloniaMap.get(col)!;
          current.totalCuentas += 1;
          current.saldoTotal += saldo;
        });

        const stats: ColoniaStat[] = Array.from(coloniaMap.entries()).map(([nombre, s]) => ({
          nombre,
          totalCuentas: s.totalCuentas,
          saldoTotal: s.saldoTotal
        })).sort((a, b) => b.totalCuentas - a.totalCuentas);

        setColonias(stats);
      }
    } catch (err: any) {
      console.error('Error cargando colonias del gestor:', err);
    }
  };

  const cargarRutasProgramadas = async (gestor: string) => {
    try {
      const { data, error } = await supabase
        .from('planificacion_rutas_diarias')
        .select('*')
        .eq('gestor_nombre', gestor)
        .order('fecha', { ascending: true });

      if (!error && data) {
        setRutasAsignadas(data);
      } else if (error && error.code === '42P01') {
        // La tabla aún no ha sido creada
        console.warn('La tabla planificacion_rutas_diarias aún no está creada en Supabase.');
      }
    } catch (err: any) {
      console.error('Error cargando rutas programadas:', err);
    }
  };

  // Filtrado de colonias por texto de búsqueda
  const coloniasFiltradas = useMemo(() => {
    if (!filterText.trim()) return colonias;
    const q = filterText.toLowerCase();
    return colonias.filter(c => c.nombre.toLowerCase().includes(q));
  }, [colonias, filterText]);

  // Manejo de selección de colonias
  const toggleColonia = (nombre: string) => {
    setSelectedColonias(prev => 
      prev.includes(nombre) 
        ? prev.filter(c => c !== nombre)
        : [...prev, nombre]
    );
  };

  const toggleSelectAll = () => {
    if (selectedColonias.length === coloniasFiltradas.length) {
      setSelectedColonias([]);
    } else {
      setSelectedColonias(coloniasFiltradas.map(c => c.nombre));
    }
  };

  // Accesos rápidos de fecha (Próximo lunes, mañana, etc.)
  const setQuickDate = (daysToAdd: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedFecha(`${yyyy}-${mm}-${dd}`);
  };

  const setProximoLunes = () => {
    const d = new Date();
    const day = d.getDay();
    // Días hasta el próximo lunes (si hoy es domingo = 1 día, si es lunes = 7 días, etc.)
    const diff = day === 0 ? 1 : (8 - day);
    d.setDate(d.getDate() + diff);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setSelectedFecha(`${yyyy}-${mm}-${dd}`);
  };

  // Guardar asignación de ruta
  const handleGuardarRuta = async () => {
    if (!selectedGestor) {
      setMessage({ type: 'error', text: 'Por favor selecciona un gestor.' });
      return;
    }
    if (!selectedFecha) {
      setMessage({ type: 'error', text: 'Por favor selecciona la fecha de la ruta.' });
      return;
    }
    if (selectedColonias.length === 0) {
      setMessage({ type: 'error', text: 'Selecciona al menos una colonia para asignar.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const recordsToInsert = selectedColonias.map(colName => {
        const colStat = colonias.find(c => c.nombre === colName);
        return {
          gestor_nombre: selectedGestor,
          fecha: selectedFecha,
          colonia: colName,
          total_cuentas: colStat ? colStat.totalCuentas : 0,
          asignado_por: currentUser
        };
      });

      const { data, error } = await supabase
        .from('planificacion_rutas_diarias')
        .upsert(recordsToInsert, { onConflict: 'gestor_nombre,fecha,colonia' });

      if (error) throw error;

      setMessage({ 
        type: 'success', 
        text: `¡Ruta guardada exitosamente! ${selectedColonias.length} colonia(s) asignadas para el día ${selectedFecha}.` 
      });

      setSelectedColonias([]);
      cargarRutasProgramadas(selectedGestor);
    } catch (err: any) {
      console.error('Error al guardar ruta diaria:', err);
      setMessage({ 
        type: 'error', 
        text: err.message || 'Error al guardar la ruta en Supabase. Asegúrate de haber ejecutado el script SQL de migración.' 
      });
    } finally {
      setSaving(false);
    }
  };

  // Eliminar una ruta programada
  const handleEliminarRuta = async (id: string) => {
    try {
      const { error } = await supabase
        .from('planificacion_rutas_diarias')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setRutasAsignadas(prev => prev.filter(r => r.id !== id));
      setMessage({ type: 'success', text: 'Ruta desasignada correctamente.' });
    } catch (err: any) {
      console.error('Error al eliminar ruta:', err);
      setMessage({ type: 'error', text: 'No se pudo eliminar la ruta seleccionada.' });
    }
  };

  // Agrupar rutas programadas por fecha
  const rutasAgrupadas = useMemo(() => {
    const map = new Map<string, RutaProgramada[]>();
    rutasAsignadas.forEach(r => {
      const f = r.fecha;
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rutasAsignadas]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in text-slate-100">
      
      {/* Encabezado Superior */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <CalendarDays className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                Planificador de Rutas Diarias
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Organiza y asigna las visitas por día y colonias específicas a los gestores en campo.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300">
          <User className="w-4 h-4 text-blue-400" />
          <span>Supervisor: <strong className="text-white">{currentUser}</strong></span>
        </div>
      </div>

      {/* Notificaciones y Mensajes */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium border ${
          message.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Grid Principal: Formulario de Asignación y Rutas Activas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Columna Izquierda: Configuración de la Ruta (8 columnas) */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              1. Seleccionar Gestor y Fecha
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Selector de Gestor */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Gestor de Cobranza
                </label>
                <div className="relative">
                  <select
                    value={selectedGestor}
                    onChange={(e) => setSelectedGestor(e.target.value)}
                    className="w-full bg-slate-800/90 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                    disabled={loading}
                  >
                    {gestores.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selector de Fecha */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Día de Visita Programada
                </label>
                <input
                  type="date"
                  value={selectedFecha}
                  onChange={(e) => setSelectedFecha(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                />
              </div>

            </div>

            {/* Accesos rápidos de fecha */}
            <div>
              <span className="text-xs text-slate-400 font-medium block mb-2">Accesos rápidos:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setQuickDate(0)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate(1)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition"
                >
                  Mañana
                </button>
                <button
                  type="button"
                  onClick={setProximoLunes}
                  className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold rounded-lg transition"
                >
                  📅 Próximo Lunes
                </button>
              </div>
            </div>

          </div>

          {/* Sección de Selección de Colonias */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-emerald-400" />
                  2. Colonias Asignadas en Supabase
                </h2>
                <p className="text-xs text-slate-400">
                  Total de colonias de {selectedGestor}: <strong className="text-slate-200">{colonias.length}</strong>
                </p>
              </div>

              {/* Barra de búsqueda de colonia */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar colonia..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Controles de Selección Masiva */}
            <div className="flex items-center justify-between py-2 border-y border-slate-800 text-xs text-slate-400">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-2 hover:text-white transition font-medium"
              >
                {selectedColonias.length === coloniasFiltradas.length && coloniasFiltradas.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-blue-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span>
                  {selectedColonias.length === coloniasFiltradas.length && coloniasFiltradas.length > 0 
                    ? 'Deseleccionar todas' 
                    : 'Seleccionar todas las mostradas'}
                </span>
              </button>

              <span>
                Seleccionadas: <strong className="text-blue-400 font-bold">{selectedColonias.length}</strong>
              </span>
            </div>

            {/* Lista Scrollable de Colonias */}
            <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {coloniasFiltradas.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No se encontraron colonias con ese nombre o el gestor no tiene cuentas activas.
                </div>
              ) : (
                coloniasFiltradas.map((col) => {
                  const isChecked = selectedColonias.includes(col.nombre);
                  return (
                    <div
                      key={col.nombre}
                      onClick={() => toggleColonia(col.nombre)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isChecked 
                          ? 'bg-blue-600/15 border-blue-500 text-white shadow-md' 
                          : 'bg-slate-800/40 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isChecked ? (
                          <CheckSquare className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-500 flex-shrink-0" />
                        )}
                        <div>
                          <span className="font-semibold text-sm block">{col.nombre}</span>
                          <span className="text-xs text-slate-400">
                            Saldo en mora: ${col.saldoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      <div className="px-2.5 py-1 bg-slate-800 rounded-lg text-xs font-bold text-blue-300 border border-slate-700">
                        {col.totalCuentas} {col.totalCuentas === 1 ? 'cuenta' : 'cuentas'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Botón de Asignar Ruta */}
            <div className="pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleGuardarRuta}
                disabled={saving || selectedColonias.length === 0}
                className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm shadow-lg transition-all ${
                  saving || selectedColonias.length === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20 active:scale-[0.99]'
                }`}
              >
                {saving ? (
                  <span>Guardando ruta en Supabase...</span>
                ) : (
                  <>
                    <span>Asignar {selectedColonias.length} colonia(s) para el {selectedFecha}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

        {/* Columna Derecha: Agenda de Rutas Programadas (5 columnas) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 sticky top-6">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-400" />
                  Rutas Agendadas
                </h2>
                <p className="text-xs text-slate-400">
                  Agenda de visitas activas de {selectedGestor}
                </p>
              </div>

              <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-300 text-xs font-bold rounded-lg border border-indigo-500/20">
                {rutasAsignadas.length} asignaciones
              </span>
            </div>

            {/* Listado de Rutas Agrupadas por Fecha */}
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
              {rutasAgrupadas.length === 0 ? (
                <div className="text-center py-12 px-4 border border-dashed border-slate-800 rounded-xl">
                  <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-400">No hay rutas programadas aún</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Selecciona una fecha y las colonias en el panel izquierdo para asignar la primera ruta.
                  </p>
                </div>
              ) : (
                rutasAgrupadas.map(([fecha, rutas]) => {
                  const dateObj = new Date(fecha + 'T00:00:00');
                  const formattedDate = dateObj.toLocaleDateString('es-MX', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  });

                  const totalCuentasDia = rutas.reduce((acc, r) => acc + (r.total_cuentas || 0), 0);

                  return (
                    <div key={fecha} className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                          <span className="text-xs font-bold uppercase tracking-wider text-blue-300 capitalize">
                            {formattedDate}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {totalCuentasDia} cuentas totales
                        </span>
                      </div>

                      <div className="space-y-2">
                        {rutas.map((ruta) => (
                          <div 
                            key={ruta.id} 
                            className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-semibold text-slate-200">{ruta.colonia}</span>
                              <span className="text-slate-500">({ruta.total_cuentas} ctas)</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleEliminarRuta(ruta.id)}
                              title="Desasignar colonia"
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                        Asignado por: {rutas[0]?.asignado_por || currentUser}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
