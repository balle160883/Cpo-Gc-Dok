"use client";

import { useEffect, useState } from "react";
import { BarChart3, Download, TrendingUp, PieChart, FileText, Loader2 } from "lucide-react";
import { fetchGestoresLocations, fetchAsignaciones, fetchRecuperacion, fetchInteracciones, fetchAllGestores } from "@/lib/api";
import * as XLSX from 'xlsx';

export default function ReportesPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [gestores, setGestores] = useState<any[]>([]);
  const [selectedGestor, setSelectedGestor] = useState<string>("");
  const [user, setUser] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Datos reales
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [recuperacion, setRecuperacion] = useState<any[]>([]);
  const [interacciones, setInteracciones] = useState<any[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);

  // 1. Hooks al inicio
  useEffect(() => {
    setIsMounted(true);
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      try {
        const parsed = JSON.parse(userInfo);
        setUser(parsed);
        setIsAdmin(parsed.rol === 'admin');
      } catch (e) {
        console.error("Error parsing user info:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAllGestores().then(setGestores).catch(console.error);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isMounted || !user) return;

    async function loadBI() {
      setLoading(true);
      try {
        const effectiveGestor = isAdmin ? selectedGestor : user.gestor;
        const [asig, recu, inte] = await Promise.all([
          fetchAsignaciones(200, effectiveGestor),
          fetchRecuperacion(effectiveGestor),
          fetchInteracciones(effectiveGestor)
        ]);
        setAsignaciones(asig);
        setRecuperacion(recu);
        setInteracciones(inte);
      } catch (error) {
        console.error("Error loading BI data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadBI();
  }, [isMounted, user, selectedGestor, isAdmin]);

  const safeFormatDate = (dateStr: any, isDateTime = false, fallback = 'N/A') => {
    if (!dateStr) return fallback;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return fallback;
    return isDateTime ? date.toLocaleString('es-MX') : date.toLocaleDateString('es-MX');
  };

  const getSujetoEfectivo = (item: any) => {
    const desc = item.descripcion || "";
    if (desc.startsWith('1-') || desc.startsWith('2-')) return 'Aval';
    if (desc.startsWith('0-')) return 'Socio';
    const rawSujeto = item.sujeto_tipo || 'Socio';
    if (rawSujeto.startsWith('Aval')) return 'Aval';
    return rawSujeto;
  };

  const handleExportExcel = () => {
    if (!interacciones || interacciones.length === 0) return;
    const dataToExport = interacciones.map(item => {
      const sujetoExcel = getSujetoEfectivo(item);
      const esAvalExcel = sujetoExcel.startsWith('Aval');
      return {
        'Fecha': safeFormatDate(item.fecha_gestion, true),
        'Tipo': item.tipo_gestion,
        'NoPrestamo': item.asignacion?.NoCUENTA || item.num_cuenta || 'N/A',
        'Socio ID': item.socio_id,
        'Nombre Socio': item.socios_datos?.nombre_completo || item.asignacion?.NOMBRE || '',
        'Nombre Aval': esAvalExcel ? (item.nombre_visitado || '') : '',
        'Nombre Visitado': item.nombre_visitado || item.socios_datos?.nombre_completo || item.asignacion?.NOMBRE || '',
        'Gestor': item.gestor_nombre || 'Sistema',
        'Sujeto Visitado': sujetoExcel,
        'Inicio Gestión': safeFormatDate(item.fecha_inicio_gestion, false),
        'Comentarios': item.descripcion || '',
        'Resultado': item.resultado || 'Exitoso'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Gestiones");
    const fileName = `Reporte_Gestiones_${selectedGestor || 'Todos'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // 2. Retornos condicionales
  if (!isMounted) return null;
  if (!user) return <div className="p-10 text-center font-bold text-slate-400">Cargando perfil...</div>;

  // 3. Procesamiento de KPIs Protegido
  const safeAsignaciones = Array.isArray(asignaciones) ? asignaciones : [];
  const safeRecuperacion = Array.isArray(recuperacion) ? recuperacion : [];
  
  // Distribución de Cartera
  const totalAsig = safeAsignaciones.length || 1;
  const dist = {
    corriente: (safeAsignaciones.filter(a => (Number(a?.['DIAS MORA']) || 0) === 0).length / totalAsig) * 100,
    temprana: (safeAsignaciones.filter(a => (Number(a?.['DIAS MORA']) || 0) > 0 && (Number(a?.['DIAS MORA']) || 0) <= 30).length / totalAsig) * 100,
    critica: (safeAsignaciones.filter(a => (Number(a?.['DIAS MORA']) || 0) > 30 && (Number(a?.['DIAS MORA']) || 0) <= 90).length / totalAsig) * 100,
    judicial: (safeAsignaciones.filter(a => (Number(a?.['DIAS MORA']) || 0) > 90).length / totalAsig) * 100
  };

  // Efectividad por Gestor (para Admin) o Global
  const gestoresStats = isAdmin && Array.isArray(gestores) ? gestores.map(g => {
    const gestorRecup = safeRecuperacion.filter(r => r.gestor_id === g.gestor_id).reduce((acc, curr) => acc + (Number(curr.abono_total) || 0), 0);
    // Simulación de meta basada en asignación si no hay meta explícita
    const efec = Math.min(Math.round((gestorRecup / 50000) * 100), 100); // 50k como meta base
    return { name: g.gestor_name, efec, color: g.color || 'bg-blue-500' };
  }).filter(g => g.efec > 0).slice(0, 4) : [
    { name: user.gestor, efec: Math.min(Math.round((safeRecuperacion.reduce((acc, curr) => acc + (Number(curr.abono_total) || 0), 0) / 50000) * 100), 100), color: 'bg-blue-600' }
  ];

  // Recuperación Semanal (Gráfico de barras)
  const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  const weeklyRecup = [0, 0, 0, 0, 0, 0, 0];
  safeRecuperacion.forEach(r => {
    const date = new Date(r.fecha_pago || Date.now());
    weeklyRecup[date.getDay()] += (Number(r.abono_total) || 0);
  });
  const maxRecup = Math.max(...weeklyRecup) || 1;
  const barHeights = weeklyRecup.map(v => (v / maxRecup) * 90 + 10); // Min 10% height

  try {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reportes y BI</h1>
            <p className="text-slate-500 text-sm">Análisis de rendimiento, KPIs de recuperación y productividad de gestores.</p>
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm mr-2">
                <span className="text-xs font-bold text-slate-400 uppercase ml-2">Analizar:</span>
                <select 
                  value={selectedGestor}
                  onChange={(e) => setSelectedGestor(e.target.value)}
                  className="text-sm font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                >
                  <option value="">Todo el Sistema</option>
                  {gestores.map(g => (
                    <option key={g.gestor_id} value={g.gestor_name}>{g.gestor_name}</option>
                  ))}
                </select>
              </div>
            )}
            <button 
              onClick={handleExportExcel}
              disabled={loading || interacciones.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold border border-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={18} />
              Exportar Datos
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center card">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={40} />
            <p className="text-slate-500 font-bold">Procesando métricas de Supabase...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800">Recuperación Semanal</h3>
                  <BarChart3 className="text-blue-600" size={20} />
                </div>
                <div className="h-48 bg-slate-50 rounded-lg flex items-end justify-between p-4 gap-2">
                  {barHeights.map((h, i) => (
                    <div key={i} className="w-full bg-blue-200 rounded-t-sm hover:bg-blue-600 transition-colors relative group" style={{ height: `${h}%` }}>
                       <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                         ${weeklyRecup[i].toLocaleString()}
                       </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-3 text-[10px] text-slate-400 font-bold uppercase">
                   {['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].map(d => <span key={d}>{d}</span>)}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800">Hallazgos de Campo</h3>
                  <PieChart className="text-emerald-600" size={20} />
                </div>
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                     <span className="text-xs font-medium text-slate-600">Cambios de Domicilio</span>
                     <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                       {interacciones.filter(i => i.resultado === 'cambio_domicilio').length}
                     </span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-xs font-medium text-slate-600">Recibieron Aviso</span>
                     <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                       {interacciones.filter(i => i.resultado === 'recibieron').length}
                     </span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-xs font-medium text-slate-600">Por Localizar</span>
                     <span className="text-xs font-bold bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                       {interacciones.filter(i => i.resultado === 'por_localizar').length}
                     </span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-xs font-medium text-slate-600">Promesas de Pago</span>
                     <span className="text-xs font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                       {interacciones.filter(i => i.resultado === 'promesa_pago').length}
                     </span>
                   </div>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800">Efectividad por Gestor</h3>
                  <PieChart className="text-blue-600" size={20} />
                </div>
                <div className="space-y-4">
                   {gestoresStats.length > 0 ? gestoresStats.map((g, i) => (
                     <div key={i} className="space-y-1">
                       <div className="flex justify-between text-xs font-medium">
                         <span>{g.name}</span>
                         <span className="text-slate-500">{g.efec}%</span>
                       </div>
                       <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                         <div className={`${g.color} h-full`} style={{ width: `${g.efec}%` }}></div>
                       </div>
                     </div>
                   )) : (
                     <div className="text-center py-10 text-slate-400 text-xs italic">No hay datos de recuperación registrados.</div>
                   )}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800">Distribución de Cartera</h3>
                  <TrendingUp className="text-blue-600" size={20} />
                </div>
                <div className="space-y-3">
                   <div className="flex items-center gap-3">
                     <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
                     <div className="flex-1 text-[11px] text-slate-600 font-medium">Corriente</div>
                     <div className="text-xs font-bold text-slate-900">{dist.corriente.toFixed(1)}%</div>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                     <div className="flex-1 text-[11px] text-slate-600 font-medium">1-30 días</div>
                     <div className="text-xs font-bold text-slate-900">{dist.temprana.toFixed(1)}%</div>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="w-2.5 h-2.5 rounded-full bg-orange-500"></div>
                     <div className="flex-1 text-[11px] text-slate-600 font-medium">31-90 días</div>
                     <div className="text-xs font-bold text-slate-900">{dist.critica.toFixed(1)}%</div>
                   </div>
                   <div className="flex items-center gap-3">
                     <div className="w-2.5 h-2.5 rounded-full bg-red-600"></div>
                     <div className="flex-1 text-[11px] text-slate-600 font-medium">Judicial</div>
                     <div className="text-xs font-bold text-slate-900">{dist.judicial.toFixed(1)}%</div>
                   </div>
                </div>
                <div className="mt-4 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2">
                   <div className="text-blue-600 bg-white p-1 rounded shadow-sm font-bold text-[9px]">AI</div>
                   <p className="text-[9px] text-blue-800 leading-tight">
                     Priorizar mora crítica ({(dist.critica).toFixed(0)}%).
                   </p>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-bold text-slate-800 mb-4">Interacciones Reales Recientes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {interacciones.length > 0 ? interacciones.slice(0, 4).map((inte, i) => (
                   <div key={i} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group">
                     <div className="flex items-center gap-3">
                       <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-white transition-colors">
                         <FileText size={18} className="text-slate-400 group-hover:text-blue-600" />
                       </div>
                       <div className="flex flex-col">
                         <span className="text-sm font-bold text-slate-700">{inte.descripcion || 'Sin descripción'}</span>
                         <span className="text-[10px] text-slate-400 uppercase font-bold">{inte.tipo_gestion} • {new Date(inte.fecha_gestion).toLocaleDateString()}</span>
                       </div>
                     </div>
                     <div className="text-[10px] font-black text-slate-300 group-hover:text-blue-600">FOLIO: {inte.id?.slice(0, 8)}</div>
                   </div>
                 )) : (
                   <div className="col-span-2 text-center py-10 text-slate-400 text-xs italic">No hay interacciones registradas recientemente.</div>
                 )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  } catch (err: any) {
    return <div className="p-10 card bg-red-50 text-red-700 font-bold">Error en Reportes: {err.message}</div>;
  }
}
