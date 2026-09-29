"use client";

import { useEffect, useState } from "react";
import { useRouter } from 'next/navigation';
import { 
  Users, 
  TrendingDown, 
  Clock, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight,
  Loader2,
  X,
  History,
  TrendingUp,
  DollarSign
} from "lucide-react";
import { fetchAsignaciones, fetchRecuperacion, fetchAllGestores, fetchDashboardKpis } from "@/lib/api";

export default function DashboardPage() {
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [recuperacion, setRecuperacion] = useState<any[]>([]);
  const [kpis, setKpis] = useState<{
    totalCartera: number;
    totalVencido: number;
    casosEnMora: number;
    moraTemprana: number;
    totalCasos: number;
    montoRecuperado: number;
    cobrosValidados: number;
  }>({
    totalCartera: 0,
    totalVencido: 0,
    casosEnMora: 0,
    moraTemprana: 0,
    totalCasos: 0,
    montoRecuperado: 0,
    cobrosValidados: 0
  });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gestores, setGestores] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedGestor, setSelectedGestor] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedRecovery, setSelectedRecovery] = useState<any>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const router = useRouter();

  // 1. Todos los Hooks al inicio (Regla de Oro de React)
  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem('auth_token');
    const userInfo = localStorage.getItem('user_info');
    
    if (!token || !userInfo) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(userInfo);
      setUser(parsedUser);
      const admin = parsedUser.rol === 'admin';
      setIsAdmin(admin);

      if (admin) {
        fetchAllGestores().then(setGestores).catch(console.error);
      }
    } catch (e) {
      console.error("Error parsing user info:", e);
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    if (!user) return;

    async function loadData() {
      setLoading(true);
      try {
        const effectiveGestor = isAdmin ? selectedGestor : (user.gestor);
        // Cargar asignaciones, recuperación y KPIs consolidados en paralelo
        const [asigData, recupData, kpisData] = await Promise.all([
          fetchAsignaciones(50, effectiveGestor),
          fetchRecuperacion(effectiveGestor, startDate, endDate),
          fetchDashboardKpis(effectiveGestor, startDate, endDate).catch(err => {
            console.error("Error fetching KPIs:", err);
            return null;
          })
        ]);
        setAsignaciones(asigData);
        setRecuperacion(recupData);
        if (kpisData) {
          setKpis(kpisData);
        }
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, selectedGestor, isAdmin, startDate, endDate]);

  const [renderError, setRenderError] = useState<string | null>(null);

  // 2. Retornos condicionales DESPUÉS de los hooks
  if (!isMounted) return null;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-vh-100 bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  // Cálculos defensivos para evitar colapsos de cliente
  const safeAsignaciones = Array.isArray(asignaciones) ? asignaciones : [];
  const safeRecuperacion = Array.isArray(recuperacion) ? recuperacion : [];

  const displayCartera = kpis.totalCartera > 0 
    ? kpis.totalCartera 
    : safeAsignaciones.reduce((acc, curr) => acc + (Number(curr?.['SALDO TOTAL']) || 0), 0);

  const displayVencido = kpis.totalVencido > 0
    ? kpis.totalVencido
    : safeAsignaciones.filter(a => (Number(a?.['DIAS MORA']) || 0) > 0).reduce((acc, curr) => acc + (Number(curr?.['SALDO TOTAL']) || 0), 0);

  const displayCasosMora = kpis.casosEnMora > 0
    ? kpis.casosEnMora
    : safeAsignaciones.filter(a => (Number(a?.['DIAS MORA']) || 0) > 0).length;

  const displayMoraTemprana = kpis.moraTemprana > 0
    ? kpis.moraTemprana
    : safeAsignaciones.filter(a => (Number(a?.['DIAS MORA']) || 0) > 0 && (Number(a?.['DIAS MORA']) || 0) <= 30).length;

  const displayRecuperado = kpis.montoRecuperado > 0
    ? kpis.montoRecuperado
    : safeRecuperacion.reduce((acc, curr) => acc + (Number(curr?.['abono_total']) || 0), 0);

  const displayCobrosValidados = kpis.cobrosValidados > 0
    ? kpis.cobrosValidados
    : safeRecuperacion.length;
  
  // Agrupar recuperación por gestor para el ranking (Solo para Admin)
  const rankingGestores = isAdmin ? Object.values(
    safeRecuperacion.reduce((acc: any, curr: any) => {
      const gName = curr.gestor || 'Sin Asignar';
      if (!acc[gName]) {
        acc[gName] = { name: gName, total: 0, count: 0 };
      }
      acc[gName].total += (Number(curr.abono_total) || 0);
      acc[gName].count += 1;
      return acc;
    }, {})
  ).sort((a: any, b: any) => b.total - a.total) : [];

  // Capturamos errores de renderizado de forma proactiva
  try {
    return (
      <div className="space-y-6">
        {renderError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-bold">
            ⚠️ Error detectado: {renderError}
          </div>
        )}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard de Cobranza</h1>
            <p className="text-slate-500 font-medium text-sm lg:text-base">Panel SaaS de alto rendimiento para gestión de despachos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-3 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 border-r border-slate-100 pr-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase ml-2">Gestor:</span>
                  <select 
                    value={selectedGestor}
                    onChange={(e) => setSelectedGestor(e.target.value)}
                    className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
                  >
                    <option value="">Todos</option>
                    {Array.isArray(gestores) && gestores.map(g => (
                      <option key={g?.gestor_id || Math.random()} value={g?.gestor_name}>{g?.gestor_name || 'Sin nombre'}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Desde:</span>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="text-xs font-bold text-slate-700 focus:outline-none bg-slate-50 rounded-md p-1 px-2 border-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Hasta:</span>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="text-xs font-bold text-slate-700 focus:outline-none bg-slate-50 rounded-md p-1 px-2 border-none"
                    />
                  </div>
                </div>
              </div>
            )}
            {!isAdmin && (
              <div className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-900/20 uppercase tracking-wider">
                Gestor: {user?.gestor || 'Cargando...'}
              </div>
            )}
            <div className="hidden lg:flex items-center gap-2 text-[10px] font-black bg-emerald-50 text-emerald-700 px-3 py-2 rounded-full border border-emerald-100 uppercase tracking-widest">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              SISTEMA ACTIVO
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Cartera Total" 
            value={`$${(Number(displayCartera) || 0).toLocaleString()}`} 
            icon={<Users className="text-blue-600" />} 
            trend="Activos en gestión"
            trendUp={true}
          />
          <StatCard 
            title="Mora Total" 
            value={`$${(Number(displayVencido) || 0).toLocaleString()}`} 
            icon={<TrendingDown className="text-red-600" />} 
            trend="Saldo en riesgo"
            trendUp={false}
          />
          <StatCard 
            title="Casos en Mora" 
            value={displayCasosMora.toString()} 
            icon={<Clock className="text-orange-600" />} 
            trend={`${displayMoraTemprana} mora temprana`}
            trendUp={false}
          />
          <StatCard 
            title="Recuperación del Mes" 
            value={`$${(Number(displayRecuperado) || 0).toLocaleString()}`} 
            icon={<CheckCircle2 className="text-emerald-600" />} 
            trend={`${displayCobrosValidados} cobros validados`}
            trendUp={true}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card bg-white border-none shadow-xl rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50 bg-slate-50/50">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <History className="text-blue-600" size={20} />
                Recuperación Reciente
              </h3>
              <button 
                onClick={() => window.location.reload()}
                className="text-[10px] font-black text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-100"
              >
                Actualizar
              </button>
            </div>
            <div className="overflow-x-auto p-2">
              {loading ? (
                <div className="p-10 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="animate-spin mb-4" size={40} />
                  <p className="font-medium uppercase text-xs tracking-widest">Obteniendo datos...</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] border-b border-slate-50">
                      <th className="pb-3 px-4">Socio</th>
                      <th className="pb-3 px-4">Crédito</th>
                      <th className="pb-3 px-4">Monto Cobrado</th>
                      <th className="pb-3 px-4 text-center">Estatus</th>
                      <th className="pb-3 px-4 text-right">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {safeRecuperacion.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400 text-xs font-medium uppercase tracking-wider">
                          No se encontraron cobros validados en este periodo
                        </td>
                      </tr>
                    ) : (
                      safeRecuperacion.slice(0, 8).map((rec, i) => (
                        <tr key={i} className="hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => { setSelectedRecovery(rec); setIsDetailModalOpen(true); }}>
                          <td className="py-4 px-4">
                            <div className="font-black text-slate-700 group-hover:text-blue-700 transition-colors truncate max-w-[150px] uppercase text-[11px]">{rec?.nombre || 'Sin nombre'}</div>
                          </td>
                          <td className="py-4 px-4 text-[10px] font-mono font-bold text-slate-400">{rec?.num_credito || 'N/A'}</td>
                          <td className="py-4 px-4 font-black text-slate-900 text-sm">${(Number(rec?.abono_total) || 0).toLocaleString()}</td>
                          <td className="py-4 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase">
                              COBRADO
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                              {rec?.fecha_real ? new Date(rec.fecha_real).toLocaleDateString() : 'N/A'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card bg-slate-900 text-white border-none shadow-2xl shadow-slate-200 rounded-3xl overflow-hidden p-0">
            <div className="p-6 bg-gradient-to-br from-slate-800 to-slate-900 border-b border-white/5">
              <h3 className="text-xl font-black tracking-tight flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/40">
                  <TrendingUp size={20} />
                </div>
                Ranking por Gestor
              </h3>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-2">Monto Recuperado (Mes Actual)</p>
            </div>
            
            <div className="p-6 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar">
              {isAdmin ? (
                rankingGestores.length > 0 ? (
                  rankingGestores.map((gestor: any, idx) => (
                    <div key={idx} className="group cursor-default">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shadow-inner ${
                            idx === 0 ? 'bg-amber-400 text-amber-900' : 
                            idx === 1 ? 'bg-slate-300 text-slate-700' : 
                            idx === 2 ? 'bg-amber-600 text-amber-100' : 'bg-white/10 text-white/60'
                          }`}>
                            {idx + 1}
                          </div>
                          <span className="text-sm font-bold uppercase tracking-tight group-hover:text-blue-400 transition-colors">{gestor.name}</span>
                        </div>
                        <span className="text-sm font-black text-blue-400">${Number(gestor.total).toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ease-out ${
                            idx === 0 ? 'bg-blue-500' : 'bg-slate-600'
                          }`}
                          style={{ width: `${(gestor.total / ((rankingGestores[0] as any)?.total || 1)) * 100}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">{gestor.count} PAGOS COBRADOS</span>
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">
                          {(((gestor.total || 0) / (displayRecuperado || 1)) * 100).toFixed(1)}% DEL TOTAL
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center space-y-4">
                    <TrendingUp className="mx-auto text-white/10" size={48} />
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Sin datos de cobro este mes</p>
                  </div>
                )
              ) : (
                <div className="space-y-6">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-center">
                    <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">Tu Meta Personal</div>
                    <div className="text-3xl font-black mb-1">68%</div>
                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mb-2">
                      <div className="bg-blue-500 h-full w-[68%]"></div>
                    </div>
                    <p className="text-[9px] text-white/40 font-bold uppercase tracking-tight">Faltan $12,400 para el bono</p>
                  </div>
                  <div className="space-y-4">
                    <QuickAction title="Sincronizar Datos" desc="Actualizar con el CORE" color="bg-blue-600" />
                    <QuickAction title="Notificar Socios" desc="Enviar recordatorios" color="bg-emerald-600" />
                    <QuickAction title="Agenda Diaria" desc="Ver mis visitas" color="bg-orange-600" />
                  </div>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="p-4 bg-white/5 border-t border-white/5 text-center">
                <button 
                  onClick={() => router.push('/reportes')}
                  className="text-[9px] font-black text-blue-400 hover:text-blue-300 uppercase tracking-widest flex items-center justify-center gap-2 mx-auto"
                >
                  Ver Reporte Detallado
                  <ArrowUpRight size={12} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal de Detalle de Recuperación */}
        {isDetailModalOpen && selectedRecovery && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50">
                <h3 className="font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <TrendingUp className="text-emerald-600" size={20} />
                  Detalle de Recuperación
                </h3>
                <button onClick={() => setIsDetailModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <DollarSign size={32} strokeWidth={3} />
                  </div>
                  <h4 className="text-xl font-black text-slate-900 uppercase mb-1">{selectedRecovery.nombre}</h4>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Socio ID: {selectedRecovery.numero_socio}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Monto Recuperado</div>
                    <div className="text-lg font-black text-emerald-600">${Number(selectedRecovery.abono_total).toLocaleString()}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Fecha de Pago</div>
                    <div className="text-sm font-bold text-slate-700">{new Date(selectedRecovery.fecha_real).toLocaleDateString()}</div>
                  </div>
                </div>

                <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 flex flex-col items-center">
                   <div className="text-[10px] font-black text-blue-600 uppercase mb-1">Referencia de Crédito</div>
                   <div className="text-lg font-black text-blue-900 font-mono tracking-tighter">{selectedRecovery.num_credito}</div>
                </div>

                {isAdmin && (
                  <div className="p-4 bg-slate-900 rounded-2xl border border-slate-700 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                      {selectedRecovery.gestor?.charAt(0) || 'G'}
                    </div>
                    <div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gestor Responsable</div>
                      <div className="text-sm font-bold text-white uppercase">{selectedRecovery.gestor || 'No asignado'}</div>
                    </div>
                  </div>
                )}

                <div className="bg-slate-900 p-4 rounded-xl text-center">
                   <p className="text-[10px] text-slate-400 font-medium italic">"Esta información refleja el capital moroso recuperado y validado en el sistema core."</p>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                <button 
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-8 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-lg hover:shadow-slate-300 transition-all uppercase"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } catch (err: any) {
    return (
      <div className="p-8 bg-red-50 border-2 border-red-200 rounded-3xl m-8">
        <h2 className="text-2xl font-black text-red-900 mb-4">Error Crítico de Renderizado</h2>
        <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <p className="text-red-600 font-mono text-xs break-all whitespace-pre-wrap">
            {err?.stack || err?.message || 'Error desconocido'}
          </p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-900/20 active:scale-95 transition-transform"
        >
          Reintentar Carga
        </button>
      </div>
    );
  }
}

function StatCard({ title, value, icon, trend, trendUp }: any) {
  return (
    <div className="card hover:shadow-xl transition-all duration-300 border-slate-100 group p-4 lg:p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 lg:p-3 rounded-2xl bg-slate-50 group-hover:bg-blue-50 transition-colors shadow-sm">
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[9px] lg:text-[10px] font-bold px-2 py-1 rounded-full ${
          trendUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
        }`}>
          {trendUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          {trend}
        </div>
      </div>
      <div>
        <div className="text-slate-400 text-[9px] lg:text-[10.5px] uppercase font-bold tracking-widest mb-1">{title}</div>
        <div className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tighter">{value}</div>
      </div>
    </div>
  );
}

function QuickAction({ title, desc, color }: any) {
  return (
    <button className="w-full text-left group">
      <div className="flex items-center gap-4 transition-transform active:scale-95">
        <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center font-bold text-lg shadow-lg`}>
          {title.charAt(0)}
        </div>
        <div>
          <div className="font-bold text-sm tracking-tight">{title}</div>
          <div className="text-white/40 text-[10px] font-medium leading-tight">{desc}</div>
        </div>
      </div>
    </button>
  );
}
