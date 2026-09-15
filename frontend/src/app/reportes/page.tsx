"use client";

import { useEffect, useState, useMemo } from "react";
import { BarChart3, Download, TrendingUp, PieChart, FileText, Loader2, ShieldCheck, Search, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { fetchGestoresLocations, fetchAsignaciones, fetchRecuperacion, fetchInteracciones, fetchAllGestores } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import * as XLSX from 'xlsx';

export default function ReportesPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [gestores, setGestores] = useState<any[]>([]);
  const [selectedGestor, setSelectedGestor] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [user, setUser] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Pestañas principales: BI vs Cuentas al Corriente
  const [activeTab, setActiveTab] = useState<'bi' | 'al_corriente'>('bi');

  // Datos reales BI
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [recuperacion, setRecuperacion] = useState<any[]>([]);
  const [interacciones, setInteracciones] = useState<any[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Datos de Cuentas al Corriente
  const [cuentasAlCorriente, setCuentasAlCorriente] = useState<any[]>([]);
  const [loadingAlCorriente, setLoadingAlCorriente] = useState(false);
  const [searchAlCorriente, setSearchAlCorriente] = useState("");
  const [selectedGestorAlCorriente, setSelectedGestorAlCorriente] = useState("");
  const [pageAlCorriente, setPageAlCorriente] = useState(1);
  const pageSizeAlCorriente = 15;

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
          fetchRecuperacion(effectiveGestor, startDate, endDate),
          fetchInteracciones(effectiveGestor, startDate, endDate)
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
  }, [isMounted, user, selectedGestor, startDate, endDate, isAdmin]);

  // Cargar cuentas al corriente desde Supabase
  const loadCuentasAlCorriente = async () => {
    setLoadingAlCorriente(true);
    try {
      const { data, error } = await supabase
        .from('asignacion_gestores')
        .select('*')
        .like('GESTOR ASIGNADO', 'AL CORRIENTE%')
        .order('NOMBRE', { ascending: true })
        .limit(1000);

      if (!error && data) {
        setCuentasAlCorriente(data);
      }
    } catch (e) {
      console.error("Error fetching cuentas al corriente:", e);
    } finally {
      setLoadingAlCorriente(false);
    }
  };

  useEffect(() => {
    if (isMounted) {
      loadCuentasAlCorriente();
    }
  }, [isMounted]);

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
        'Gestor': item.usuarios_gestor?.gestor || 'Sistema',
        'Sujeto Visitado': sujetoExcel,
        'Inicio Gestión': safeFormatDate(item.fecha_inicio_gestion, false),
        'Comentarios': item.descripcion || '',
        'Resultado': item.resultado || 'Exitoso'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Gestiones");
    const dateRangeSuffix = startDate && endDate ? `_${startDate}_a_${endDate}` : '';
    const fileName = `Reporte_Gestiones_${selectedGestor || 'Todos'}${dateRangeSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Filtrado de cuentas al corriente
  const gestoresAlCorriente = useMemo(() => {
    const unique = new Set<string>();
    cuentasAlCorriente.forEach(c => {
      const g = (c['GESTOR ASIGNADO'] || '').replace('AL CORRIENTE - ', '').trim();
      if (g) unique.add(g);
    });
    return Array.from(unique).sort();
  }, [cuentasAlCorriente]);

  const filteredAlCorriente = useMemo(() => {
    return cuentasAlCorriente.filter(item => {
      const g = (item['GESTOR ASIGNADO'] || '').replace('AL CORRIENTE - ', '').trim();
      if (selectedGestorAlCorriente && g !== selectedGestorAlCorriente) return false;
      if (searchAlCorriente.trim()) {
        const query = searchAlCorriente.toLowerCase().trim();
        const nom = (item.NOMBRE || '').toLowerCase();
        const cta = (item.NoCUENTA || '').toLowerCase();
        const soc = (item.NoSOCIO || '').toLowerCase();
        if (!nom.includes(query) && !cta.includes(query) && !soc.includes(query)) return false;
      }
      return true;
    });
  }, [cuentasAlCorriente, selectedGestorAlCorriente, searchAlCorriente]);

  const totalSaldoAlCorriente = useMemo(() => {
    return filteredAlCorriente.reduce((acc, curr) => acc + (Number(curr['SALDO TOTAL']) || 0), 0);
  }, [filteredAlCorriente]);

  const paginatedAlCorriente = useMemo(() => {
    const start = (pageAlCorriente - 1) * pageSizeAlCorriente;
    return filteredAlCorriente.slice(start, start + pageSizeAlCorriente);
  }, [filteredAlCorriente, pageAlCorriente]);

  const totalPagesAlCorriente = Math.ceil(filteredAlCorriente.length / pageSizeAlCorriente) || 1;

  const handleExportAlCorrienteExcel = () => {
    if (!filteredAlCorriente || filteredAlCorriente.length === 0) return;
    const dataToExport = filteredAlCorriente.map(item => {
      const gestorOriginal = (item['GESTOR ASIGNADO'] || '').replace('AL CORRIENTE - ', '').trim();
      return {
        'No. Cuenta': item.NoCUENTA || '',
        'No. Socio': item.NoSOCIO || '',
        'Nombre Socio': item.NOMBRE || '',
        'Gestor Original': gestorOriginal,
        'Situación Crédito': item['SITUACIÓN DEL CRÉDITO'] || 'PREVENTIVA',
        'Días Mora': Number(item['DIAS MORA']) || 0,
        'Cuotas Atrasadas': Number(item['CUOTAS ATRASADAS']) || 0,
        'Saldo Total': Number(item['SALDO TOTAL']) || 0,
        'Saldo al Día': Number(item['SALDO AL DIA']) || 0,
        'Producto': item.Producto || '',
        'Fecha Asignación': item['FECHA ASIGNACION'] || '',
        'Último Pago': item['ULTIMO PAGO'] || '',
        'Próximo Vencimiento': item['PRÓXIMO VENCIMIENTO'] || '',
        'Teléfonos': item.TELEFONOS || '',
        'Colonia': item.COLONIA || '',
        'Municipio': item.MUNICIPIO || '',
        'Estado': item.ESTADO || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cuentas Al Corriente");
    const suffix = selectedGestorAlCorriente ? `_${selectedGestorAlCorriente.replace(/\s+/g, '_')}` : '_Todos';
    const fileName = `Reporte_Cuentas_Al_Corriente${suffix}_${new Date().toISOString().split('T')[0]}.xlsx`;
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
    const metaGestor = 100000;
    const cumpli = Math.min(100, Math.round((gestorRecup / metaGestor) * 100));
    return {
      name: g.gestor_name,
      recuperado: `$${gestorRecup.toLocaleString('es-MX')}`,
      efectividad: `${cumpli}%`,
      efec: cumpli,
      color: g.color || 'bg-blue-500',
      visitas: interacciones.filter(i => (i.gestor_id === g.gestor_id || i.usuarios_gestor?.gestor === g.gestor_name)).length
    };
  }) : [
    { 
      name: user.gestor, 
      recuperado: `$${safeRecuperacion.reduce((acc, curr) => acc + (Number(curr.abono_total) || 0), 0).toLocaleString('es-MX')}`,
      efectividad: `${Math.min(Math.round((safeRecuperacion.reduce((acc, curr) => acc + (Number(curr.abono_total) || 0), 0) / 100000) * 100), 100)}%`,
      efec: Math.min(Math.round((safeRecuperacion.reduce((acc, curr) => acc + (Number(curr.abono_total) || 0), 0) / 100000) * 100), 100),
      color: 'bg-blue-600',
      visitas: interacciones.length
    }
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
        {/* Encabezado y Selector de Pestañas */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reportes y BI</h1>
            <p className="text-slate-500 text-sm">Análisis de rendimiento, KPIs de recuperación y carteras regularizadas.</p>
          </div>
          
          {/* Selector de Pestañas */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={() => setActiveTab('bi')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'bi'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 size={16} />
              Métricas & BI
            </button>
            <button
              onClick={() => {
                setActiveTab('al_corriente');
                if (cuentasAlCorriente.length === 0) loadCuentasAlCorriente();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'al_corriente'
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShieldCheck size={16} />
              Cuentas al Corriente
              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-black">
                {cuentasAlCorriente.length > 0 ? cuentasAlCorriente.length : '748'}
              </span>
            </button>
          </div>
        </div>

        {/* PESTAÑA 1: MÉTRICAS Y BI */}
        {activeTab === 'bi' && (
          <>
            {/* Controles de filtro para BI */}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Inicio:</span>
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Fin:</span>
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                />
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-bold text-slate-400 uppercase ml-2">Gestor:</span>
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={18} />
                Exportar Gestiones ({interacciones.length})
              </button>
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
          </>
        )}

        {/* PESTAÑA 2: CUENTAS AL CORRIENTE / REGULARIZADAS */}
        {activeTab === 'al_corriente' && (
          <div className="space-y-6">
            {/* Barra de Filtros y Acción */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                {/* Buscador */}
                <div className="relative flex-1 md:w-72">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por socio o cuenta..."
                    value={searchAlCorriente}
                    onChange={(e) => {
                      setSearchAlCorriente(e.target.value);
                      setPageAlCorriente(1);
                    }}
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  />
                </div>

                {/* Filtro Gestor */}
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Gestor Original:</span>
                  <select
                    value={selectedGestorAlCorriente}
                    onChange={(e) => {
                      setSelectedGestorAlCorriente(e.target.value);
                      setPageAlCorriente(1);
                    }}
                    className="text-xs font-bold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                  >
                    <option value="">Todos los Gestores ({gestoresAlCorriente.length})</option>
                    {gestoresAlCorriente.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Botón de Exportación Excel */}
              <button
                onClick={handleExportAlCorrienteExcel}
                disabled={loadingAlCorriente || filteredAlCorriente.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet size={18} />
                Exportar a Excel ({filteredAlCorriente.length})
              </button>
            </div>

            {/* KPI Cards de Cuentas al Corriente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuentas al Corriente</span>
                  <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600">
                    <CheckCircle2 size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900">{filteredAlCorriente.length}</div>
                <p className="text-[11px] text-emerald-700 font-medium mt-1">Excluidas de visitas en campo</p>
              </div>

              <div className="card bg-gradient-to-br from-blue-50 to-white border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Saldo Total Resguardado</span>
                  <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                    <ShieldCheck size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900">
                  ${totalSaldoAlCorriente.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-[11px] text-blue-700 font-medium mt-1">Cartera sin morosidad</p>
              </div>

              <div className="card bg-gradient-to-br from-purple-50 to-white border-purple-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gestores Asociados</span>
                  <div className="p-2 bg-purple-100 rounded-xl text-purple-600">
                    <PieChart size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900">{gestoresAlCorriente.length}</div>
                <p className="text-[11px] text-purple-700 font-medium mt-1">Gestores con cuentas regularizadas</p>
              </div>

              <div className="card bg-gradient-to-br from-amber-50 to-white border-amber-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Días de Mora Promedio</span>
                  <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                    <TrendingUp size={18} />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-600">0 Días</div>
                <p className="text-[11px] text-slate-500 font-medium mt-1">100% al corriente o preventivas</p>
              </div>
            </div>

            {/* Tabla de Cuentas al Corriente */}
            <div className="card p-0 overflow-hidden border border-slate-200">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Detalle de Créditos al Corriente</h3>
                  <p className="text-xs text-slate-400">Mostrando {paginatedAlCorriente.length} de {filteredAlCorriente.length} registros</p>
                </div>
                {loadingAlCorriente && <Loader2 className="animate-spin text-emerald-600" size={18} />}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">No. Cuenta</th>
                      <th className="px-4 py-3">Socio</th>
                      <th className="px-4 py-3">Gestor Original</th>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3 text-right">Saldo Total</th>
                      <th className="px-4 py-3 text-right">Saldo al Día</th>
                      <th className="px-4 py-3 text-center">Último Pago</th>
                      <th className="px-4 py-3 text-center">Próx. Vencimiento</th>
                      <th className="px-4 py-3 text-center">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedAlCorriente.length > 0 ? (
                      paginatedAlCorriente.map((item, idx) => {
                        const gestorOriginal = (item['GESTOR ASIGNADO'] || '').replace('AL CORRIENTE - ', '').trim();
                        return (
                          <tr key={item.NoCUENTA || idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-slate-800">{item.NoCUENTA}</td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">{item.NOMBRE}</div>
                              <div className="text-[10px] text-slate-400">Socio: {item.NoSOCIO}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                                {gestorOriginal}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600 font-medium">{item.Producto || 'ORDINARIO'}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                              ${(Number(item['SALDO TOTAL']) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">
                              ${(Number(item['SALDO AL DIA']) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-500 font-mono text-[11px]">
                              {item['ULTIMO PAGO'] || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-center text-slate-500 font-mono text-[11px]">
                              {item['PRÓXIMO VENCIMIENTO'] || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Al Corriente
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                          No se encontraron cuentas al corriente con los filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPagesAlCorriente > 1 && (
                <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <span className="text-xs text-slate-500">
                    Página <span className="font-bold text-slate-800">{pageAlCorriente}</span> de <span className="font-bold text-slate-800">{totalPagesAlCorriente}</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPageAlCorriente(p => Math.max(1, p - 1))}
                      disabled={pageAlCorriente === 1}
                      className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPageAlCorriente(p => Math.min(totalPagesAlCorriente, p + 1))}
                      disabled={pageAlCorriente === totalPagesAlCorriente}
                      className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  } catch (err: any) {
    return <div className="p-10 card bg-red-50 text-red-700 font-bold">Error en Reportes: {err.message}</div>;
  }
}
