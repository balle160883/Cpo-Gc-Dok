"use client";

import { useEffect, useState, useMemo } from "react";
import { HandCoins, CheckCircle, Clock, AlertTriangle, Loader2, User, FileDown, Calendar as CalendarIcon, ListFilter, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchPromesasPendientes, fetchAllGestores } from "@/lib/api";
import * as XLSX from 'xlsx';

export default function PromesasPage() {
  const [promesas, setPromesas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gestores, setGestores] = useState<any[]>([]);
  const [selectedGestor, setSelectedGestor] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [filterSemaforo, setFilterSemaforo] = useState<'all' | 'vencida' | 'hoy' | 'cumplida' | 'pendiente'>('all');
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(new Date());

  useEffect(() => {
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      const user = JSON.parse(userInfo);
      setIsAdmin(user.rol === 'admin');
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAllGestores().then(setGestores).catch(console.error);
    }
  }, [isAdmin]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const data = await fetchPromesasPendientes(selectedGestor, startDate, endDate);
        setPromesas(data);
      } catch (error) {
        console.error("Error loading promises:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedGestor, startDate, endDate]);

  const safeFormatDate = (dateStr: any, fallback = 'N/A') => {
    if (!dateStr) return fallback;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? fallback : date.toLocaleDateString('es-MX');
  };

  const handleExportExcel = () => {
    const dataToExport = promesas.map(p => ({
      'No. Socio': p.socio_id,
      'Cuenta': p.num_cuenta,
      'Socio Titular': p.prestamos_datos?.socios_datos?.nombre_completo || 'N/A',
      'Sujeto Visitado': p.nombre_visitado || p.prestamos_datos?.socios_datos?.nombre_completo || 'Socio Desconocido',
      'Tipo de Sujeto': p.sujeto_tipo || 'Socio',
      'Origen Promesa': p.is_informal ? 'Bitácora / Gestión' : 'Promesa Formal',
      'Monto': p.monto || 0,
      'Fecha Programada': safeFormatDate(p.fecha_pago),
      'Inicio Gestión': safeFormatDate(p.fecha_inicio_gestion),
      'Gestor': p.gestor_nombre || p.gestor_id,
      'Comentarios/Nota': p.descripcion || 'Sin comentarios registrados',
      'Estado': p.is_informal ? 'Pendiente' : p.estado,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Promesas");
    const fileName = `Promesas_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredPromesas = useMemo(() => {
    if (filterSemaforo === 'all') return promesas;
    return promesas.filter(p => (p.semaforo || p.estado) === filterSemaforo);
  }, [promesas, filterSemaforo]);

  const counts = useMemo(() => ({
    total: promesas.length,
    vencidas: promesas.filter(p => (p.semaforo || p.estado) === 'vencida').length,
    hoy: promesas.filter(p => (p.semaforo || p.estado) === 'hoy').length,
    cumplidas: promesas.filter(p => (p.semaforo || p.estado) === 'cumplida').length,
    pendientes: promesas.filter(p => !['vencida','hoy','cumplida'].includes(p.semaforo || p.estado)).length,
    montoTotal: promesas.reduce((sum, p) => sum + (p.monto || 0), 0)
  }), [promesas]);

  const calendarDays = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: any[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayPromesas = promesas.filter(p => {
        if (!p.fecha_pago) return false;
        return new Date(p.fecha_pago).toISOString().split('T')[0] === dateStr;
      });
      days.push({ day, dateStr, promesas: dayPromesas });
    }
    return days;
  }, [currentMonthDate, promesas]);

  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <HandCoins className="text-blue-600" />
            Calendario de Promesas de Pago
          </h1>
          <p className="text-slate-500 text-sm">Monitoreo con semáforo de estado de compromisos de pago en campo.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
            <button onClick={() => setViewMode('calendar')} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${viewMode === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
              <CalendarIcon size={14} /> Calendario
            </button>
            <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
              <ListFilter size={14} /> Lista
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Inicio:</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer" />
          </div>
          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Fin:</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer" />
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Gestor:</span>
              <select value={selectedGestor} onChange={(e) => setSelectedGestor(e.target.value)}
                className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer">
                <option value="">Todos</option>
                {gestores.map(g => <option key={g.gestor_id} value={g.gestor_name}>{g.gestor_name}</option>)}
              </select>
            </div>
          )}

          <button onClick={handleExportExcel} disabled={promesas.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50">
            <FileDown size={16} /> Excel
          </button>
        </div>
      </div>

      {/* Semáforo de Estado */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          { key: 'all', label: 'Todas', count: counts.total, sub: `$${counts.montoTotal.toLocaleString()}`, activeClass: 'bg-blue-600 text-white border-blue-700 shadow-lg shadow-blue-200', inactiveClass: 'bg-blue-50 text-blue-800 border-blue-100' },
          { key: 'vencida', label: '🔴 Vencidas', count: counts.vencidas, sub: 'Cobro Urgente', activeClass: 'bg-red-600 text-white border-red-700 shadow-lg shadow-red-200', inactiveClass: 'bg-red-50 text-red-700 border-red-100' },
          { key: 'hoy', label: '🟡 Cobrar Hoy', count: counts.hoy, sub: 'Compromisos Hoy', activeClass: 'bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-200', inactiveClass: 'bg-amber-50 text-amber-800 border-amber-100' },
          { key: 'cumplida', label: '🟢 Cumplidas', count: counts.cumplidas, sub: 'Pago Conciliado', activeClass: 'bg-emerald-600 text-white border-emerald-700 shadow-lg shadow-emerald-200', inactiveClass: 'bg-emerald-50 text-emerald-800 border-emerald-100' },
          { key: 'pendiente', label: '⚪ Futuras', count: counts.pendientes, sub: 'Próximos Días', activeClass: 'bg-slate-700 text-white border-slate-800 shadow-lg shadow-slate-200', inactiveClass: 'bg-slate-50 text-slate-700 border-slate-200' },
        ] as const).map(({ key, label, count, sub, activeClass, inactiveClass }) => (
          <button key={key} onClick={() => setFilterSemaforo(key)}
            className={`p-4 rounded-2xl border transition-all text-left ${filterSemaforo === key ? activeClass : inactiveClass + ' hover:opacity-90'}`}>
            <div className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">{label}</div>
            <div className="text-2xl font-black">{count}</div>
            <div className="text-xs font-bold opacity-90 mt-1">{sub}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card text-center p-4 border-blue-100 bg-blue-50/30">
          <div className="text-slate-400 text-[10px] uppercase font-bold mb-1 tracking-wider">Promesas Pendientes</div>
          <div className="text-3xl font-black text-slate-900">{promesas.length}</div>
          <div className="text-blue-600 text-xs font-bold mt-1">${totalMonto.toLocaleString()}</div>
        </div>
        <div className="card text-center p-4 border-red-100 bg-red-50/30">
          <div className="text-slate-400 text-[10px] uppercase font-bold mb-1 tracking-wider">Vencidas Hoy</div>
          <div className="text-3xl font-black text-red-600">{totalVencidas}</div>
          <div className="text-red-400 text-xs font-bold mt-1">Requiere atención</div>
        </div>
        <div className="card text-center p-4 border-emerald-100 bg-emerald-50/30">
          <div className="text-slate-400 text-[10px] uppercase font-bold mb-1 tracking-wider">Efectividad Global</div>
          <div className="text-3xl font-black text-emerald-600">--</div>
          <div className="text-emerald-500 text-xs font-bold mt-1">Sincronizado</div>
        </div>
      </div>

      {/* Vista Calendario Grid Mensual */}
      {viewMode === 'calendar' ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <CalendarIcon size={18} className="text-blue-600" />
              <h2 className="font-black text-slate-800 text-lg uppercase tracking-tight">
                {monthNames[currentMonthDate.getMonth()]} {currentMonthDate.getFullYear()}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1))}
                className="p-2 bg-white rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => setCurrentMonthDate(new Date())}
                className="px-3 py-1.5 bg-white text-slate-700 rounded-xl border border-slate-200 text-xs font-bold hover:bg-slate-50">
                Hoy
              </button>
              <button onClick={() => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1))}
                className="p-2 bg-white rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-100 text-center bg-slate-50/80 font-black text-[10px] text-slate-400 uppercase tracking-widest py-2.5">
            {["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d => <div key={d}>{d}</div>)}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 min-h-[480px]">
            {calendarDays.map((cell, idx) => {
              if (!cell) return <div key={idx} className="bg-slate-50/20 p-2 min-h-[80px]" />;
              const isToday = cell.dateStr === todayStr;
              return (
                <div key={idx} className={`p-2 min-h-[80px] transition-colors ${isToday ? 'bg-blue-50/30' : 'hover:bg-slate-50/40'}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700'}`}>
                      {cell.day}
                    </span>
                    {cell.promesas.length > 0 && (
                      <span className="text-[9px] font-black text-slate-400">{cell.promesas.length}p</span>
                    )}
                  </div>
                  <div className="space-y-1 overflow-y-auto max-h-[80px]">
                    {cell.promesas.map((p: any) => {
                      const sem = p.semaforo || p.estado;
                      const bg =
                        sem === 'cumplida' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                        sem === 'vencida' ? 'bg-red-100 text-red-800 border-red-200' :
                        sem === 'hoy' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                        'bg-slate-100 text-slate-700 border-slate-200';
                      return (
                        <div key={p.id} className={`p-1 rounded-md border text-[9px] truncate leading-tight ${bg}`}>
                          <div className="font-bold truncate">{p.nombre_visitado || p.prestamos_datos?.socios_datos?.nombre_completo || 'Socio'}</div>
                          <div className="flex justify-between text-[8px] opacity-90">
                            <span>${(p.monto || 0).toLocaleString()}</span>
                            <span className="uppercase font-extrabold">{sem}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Vista Lista */
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-tight">
              <HandCoins size={18} className="text-blue-600" />
              Compromisos de Pago ({filteredPromesas.length})
            </h3>
          </div>
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="animate-spin mb-4" size={40} />
              <p className="font-medium">Cargando agenda...</p>
            </div>
          ) : filteredPromesas.length === 0 ? (
            <div className="py-20 text-center">
              <Clock className="mx-auto text-slate-200 mb-4" size={48} />
              <p className="text-slate-500 font-medium">No hay promesas con este filtro.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredPromesas.map((p) => {
                const sem = p.semaforo || p.estado;
                const iconColor =
                  sem === 'cumplida' ? 'bg-emerald-100 text-emerald-600' :
                  sem === 'vencida' ? 'bg-red-100 text-red-600' :
                  sem === 'hoy' ? 'bg-amber-100 text-amber-600' :
                  'bg-blue-100 text-blue-600';
                const semLabel =
                  sem === 'cumplida' ? '🟢 Cumplida' :
                  sem === 'vencida' ? '🔴 Vencida' :
                  sem === 'hoy' ? '🟡 Vence Hoy' : '⚪ Futura';
                const semBadge =
                  sem === 'cumplida' ? 'bg-emerald-100 text-emerald-700' :
                  sem === 'vencida' ? 'bg-red-100 text-red-700' :
                  sem === 'hoy' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';
                return (
                  <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${iconColor}`}>
                        {sem === 'cumplida' ? <CheckCircle size={20} /> : sem === 'vencida' ? <AlertTriangle size={20} /> : <Clock size={20} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-bold text-slate-900">
                            {p.nombre_visitado || p.prestamos_datos?.socios_datos?.nombre_completo || 'Socio Desconocido'}
                          </div>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${(p.sujeto_tipo || 'Socio') === 'Socio' ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>
                            {p.sujeto_tipo || 'Socio'}
                          </span>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${semBadge}`}>{semLabel}</span>
                        </div>
                        <div className="text-xs text-slate-500 font-medium flex items-center gap-3 mt-1">
                          <span>Socio: <span className="text-slate-700 font-bold">{p.socio_id}</span></span>
                          <span>Cuenta: <span className="text-slate-700 font-bold">{p.num_cuenta}</span></span>
                          {isAdmin && <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-600 flex items-center gap-1"><User size={10} /> {p.gestor_nombre || p.gestor_id}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {p.descripcion && <div className="text-xs text-slate-600 italic mb-1 line-clamp-1">"{p.descripcion}"</div>}
                      <div className="font-black text-slate-900">${(p.monto || 0).toLocaleString()}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">FECHA: {safeFormatDate(p.fecha_pago)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
