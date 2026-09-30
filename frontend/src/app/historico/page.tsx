"use client";

import { useEffect, useState, useMemo } from "react";
import { 
  History, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  User, 
  TrendingUp, 
  Wallet, 
  ArrowUpRight,
  Loader2,
  FileText,
  ChevronRight
} from "lucide-react";
import { fetchRecuperacion, fetchAllGestores } from "@/lib/api";

export default function HistoricoPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Datos
  const [recuperaciones, setRecuperaciones] = useState<any[]>([]);
  const [gestoresList, setGestoresList] = useState<any[]>([]);
  
  // Filtros
  const [filterGestor, setFilterGestor] = useState<string>("");
  const [filterDateStart, setFilterDateStart] = useState<string>("");
  const [filterDateEnd, setFilterDateEnd] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  useEffect(() => {
    setIsMounted(true);
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      try {
        const parsed = JSON.parse(userInfo);
        setUser(parsed);
        setIsAdmin(parsed.rol === 'admin' || parsed.email === 'ing.ballesteros16@gmail.com');
      } catch (e) {
        console.error("Error parsing user info:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAllGestores()
        .then(setGestoresList)
        .catch(console.error);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isMounted || !user) return;

    async function loadData() {
      setLoading(true);
      try {
        // En esta pantalla, el admin puede ver TODO inicialmente, los gestores solo lo suyo
        const effectiveGestor = isAdmin ? undefined : user.gestor;
        const data = await fetchRecuperacion(effectiveGestor);
        setRecuperaciones(data);
      } catch (error) {
        console.error("Error loading recovery history:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isMounted, user, isAdmin]);

  // Lógica de filtrado en el cliente para máxima interactividad
  const filteredData = useMemo(() => {
    return recuperaciones.filter(item => {
      // Filtro por Gestor (Admin)
      if (isAdmin && filterGestor && item.gestor !== filterGestor) return false;
      
      // Filtro por Búsqueda (Socio o Crédito)
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchSocio = item.nombre?.toLowerCase().includes(search);
        const matchCredito = item.num_credito?.toLowerCase().includes(search);
        if (!matchSocio && !matchCredito) return false;
      }
      
      // Filtro por Fecha
      const itemDate = new Date(item.fecha_real);
      if (filterDateStart) {
        const start = new Date(filterDateStart);
        start.setHours(0, 0, 0, 0);
        if (itemDate < start) return false;
      }
      if (filterDateEnd) {
        const end = new Date(filterDateEnd);
        end.setHours(23, 59, 59, 999);
        if (itemDate > end) return false;
      }
      
      return true;
    });
  }, [recuperaciones, filterGestor, filterDateStart, filterDateEnd, searchTerm, isAdmin]);

  // Función para formatear fecha de forma robusta evitando el desfase de 6 PM
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return { date: '---', time: '' };
    
    try {
      // 1. Caso: Fecha simple YYYY-MM-DD (muy común en datos importados)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return { 
          date: dt.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }), 
          time: 'Registro Diario' 
        };
      }

      // 2. Caso: Fecha con tiempo pero posiblemente sin zona horaria (ej: 2026-03-14 00:00:00)
      // Si detectamos que la hora es exactamente 00:00:00, también lo tratamos como registro diario
      const dt = new Date(dateStr);
      if (isNaN(dt.getTime())) return { date: dateStr, time: '' };

      const isMidnight = dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0;
      
      // Si es medianoche UTC y la cadena original sugiere que es una fecha pura
      if (isMidnight && (dateStr.endsWith('00:00:00+00') || dateStr.endsWith('Z') || dateStr.length <= 19)) {
        // Para evitar el desfase de 6 PM, usamos los componentes UTC para mostrar el día "que dice el texto"
        return {
          date: `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`,
          time: 'Registro Diario'
        };
      }

      // 3. Caso: Fecha con tiempo real (Pagos, Interacciones)
      return {
        date: dt.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
      };
    } catch (e) {
      return { date: dateStr, time: '' };
    }
  };

  // KPIs calculados dinámicamente
  const stats = useMemo(() => {
    const total = filteredData.reduce((acc, curr) => acc + (Number(curr.abono_total) || 0), 0);
    const count = filteredData.length;
    const average = count > 0 ? total / count : 0;
    return { total, count, average };
  }, [filteredData]);

  const handleExport = () => {
    if (filteredData.length === 0) return;
    
    const headers = ["Fecha", "Socio", "Cuenta", "Gestor", "Monto", "Tipo"];
    const csvContent = [
      headers.join(","),
      ...filteredData.map(item => [
        formatDateTime(item.fecha_real).date,
        `"${item.nombre}"`,
        `"${item.num_credito}"`,
        `"${item.gestor}"`,
        item.abono_total,
        item.tipo || 'CARTERA'
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Historico_Recuperacion_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isMounted) return null;

  const getTypeBadge = (tipo: string) => {
    switch (tipo) {
      case 'PAGO_REAL':
        return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black border border-emerald-200">PAGO REAL</span>;
      case 'ARCHIVO':
        return <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-black border border-slate-200">CARTERA PASADA</span>;
      default:
        return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] font-black border border-blue-200">CARTERA ACTIVA</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white shadow-lg shadow-blue-200">
              <History size={24} />
            </div>
            Histórico de Recuperación
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Consulta el detalle histórico de la cartera recuperada por el equipo de cobranza.
          </p>
        </div>
        <button 
          onClick={handleExport}
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95"
        >
          <Download size={18} />
          Exportar Reporte
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={80} className="text-blue-600" />
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Recuperado</p>
          <h2 className="text-3xl font-black text-slate-900 mt-2">
            ${stats.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
          <div className="flex items-center gap-2 mt-4 text-emerald-600">
            <div className="p-1 bg-emerald-50 rounded-full">
              <TrendingUp size={14} />
            </div>
            <span className="text-xs font-bold">Consolidado en periodo</span>
          </div>
        </div>

        <div className="card relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <FileText size={80} className="text-blue-600" />
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Gestiones Totales</p>
          <h2 className="text-3xl font-black text-slate-900 mt-2">
            {stats.count}
          </h2>
          <div className="flex items-center gap-2 mt-4 text-blue-600">
            <div className="p-1 bg-blue-50 rounded-full">
              <ArrowUpRight size={14} />
            </div>
            <span className="text-xs font-bold">Operaciones auditadas</span>
          </div>
        </div>

        <div className="card relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <User size={80} className="text-blue-600" />
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Ticket Promedio</p>
          <h2 className="text-3xl font-black text-slate-900 mt-2">
            ${stats.average.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
          <div className="flex items-center gap-2 mt-4 text-indigo-600">
            <div className="p-1 bg-indigo-50 rounded-full">
              <TrendingUp size={14} />
            </div>
            <span className="text-xs font-bold">Por operación</span>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="card bg-slate-900 border-none shadow-2xl overflow-visible">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Buscar Socio / Cuenta</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                placeholder="Nombre o # Cuenta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-800 border-none rounded-lg py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Filtrar por Gestor</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <select 
                  value={filterGestor}
                  onChange={(e) => setFilterGestor(e.target.value)}
                  className="w-full bg-slate-800 border-none rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer"
                >
                  <option value="">Todos los gestores</option>
                  {gestoresList.map(g => (
                    <option key={g.gestor_id} value={g.gestor_name}>{g.gestor_name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Desde</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="date" 
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                className="w-full bg-slate-800 border-none rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="date" 
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                className="w-full bg-slate-800 border-none rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="card p-0 overflow-hidden border-none shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha y Hora</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Socio / Cliente</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Gestor Responsable</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="animate-spin text-blue-600" size={32} />
                      <span className="text-sm font-bold text-slate-500">Actualizando archivos históricos...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-slate-50 rounded-full text-slate-300">
                        <Search size={40} />
                      </div>
                      <span className="text-sm font-bold text-slate-400">No se encontraron registros con los filtros aplicados.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((item, idx) => {
                  const { date, time } = formatDateTime(item.fecha_real);
                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">{date}</span>
                          <span className={`text-[10px] font-bold uppercase ${time === 'Registro Diario' ? 'text-blue-500' : 'text-slate-400'}`}>
                            {time}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-[10px]">
                            {item.nombre?.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900 leading-none">{item.nombre}</span>
                            <span className="text-[10px] text-slate-400 mt-1 font-medium">Cuenta: {item.num_credito}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getTypeBadge(item.tipo)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${item.tipo === 'PAGO_REAL' ? 'bg-emerald-500' : 'bg-blue-400'}`}></div>
                          <span className="text-sm font-bold text-slate-600">{item.gestor}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-sm font-black ${item.tipo === 'PAGO_REAL' ? 'text-emerald-600' : 'text-blue-600'}`}>
                            ${Number(item.abono_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </span>
                          <div className="flex items-center gap-1 text-[8px] text-slate-400 font-bold uppercase tracking-tighter">
                            Abono Registrado
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer info */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Mostrando {filteredData.length} de {recuperaciones.length} registros totales
          </span>
          <div className="flex items-center gap-1 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-200">
             <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></div>
             <span className="text-[10px] font-black text-slate-600">Sincronizado con Dokploy</span>
          </div>
        </div>
      </div>
    </div>
  );
}
