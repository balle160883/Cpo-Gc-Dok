"use client";

import { useEffect, useState } from "react";
import { CreditCard, ArrowUpRight, ArrowDownRight, MoreHorizontal, Loader2, X, Phone, MapPin, User, Calendar, DollarSign, Info } from "lucide-react";
import { fetchAsignaciones, fetchGestoresLocations, fetchAllGestores } from "@/lib/api";

export default function CreditosPage() {
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGestor, setSelectedGestor] = useState<string>("");
  const [selectedAsig, setSelectedAsig] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gestores, setGestores] = useState<any[]>([]);

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
        const data = await fetchAsignaciones(100, selectedGestor);
        setAsignaciones(data);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedGestor]);

  const totalCartera = asignaciones.reduce((acc, curr) => acc + (curr['SALDO TOTAL'] || 0), 0);
  const totalVencido = asignaciones.filter(a => a['DIAS MORA'] > 0).reduce((acc, curr) => acc + (curr['SALDO TOTAL'] || 0), 0);
  
  return (
    <div className="space-y-6 relative min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cartera de Créditos</h1>
          <p className="text-slate-500 text-sm">Monitoreo detallado de cuentas asignadas.</p>
        </div>
        
        {isAdmin && (
          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase ml-2">Filtrar por Gestor:</span>
            <select 
              value={selectedGestor}
              onChange={(e) => setSelectedGestor(e.target.value)}
              className="text-sm font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
            >
              <option value="">Todos los Gestores</option>
              {gestores.map(g => (
                <option key={g.gestor_id} value={g.gestor_name}>{g.gestor_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card bg-blue-600 text-white border-none shadow-blue-200 shadow-xl">
          <div className="flex justify-between items-start">
            <CreditCard size={24} className="opacity-80" />
            <span className="text-[10px] uppercase font-bold tracking-wider bg-white/20 px-2 py-1 rounded">Cartera Total</span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold">${totalCartera.toLocaleString()}</div>
            <div className="text-blue-100 text-xs flex items-center gap-1 mt-1 font-medium">
              Sincronizado con Supabase
            </div>
          </div>
        </div>
        <div className="card border-slate-100 hover:border-blue-200 transition-colors">
          <div className="flex justify-between items-start text-slate-400">
            <div className="p-2 bg-slate-50 rounded-lg"><CreditCard size={20} className="text-slate-600" /></div>
            <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-500 px-2 py-1 rounded">Saldos Vigentes</span>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-slate-900">${(totalCartera - totalVencido).toLocaleString()}</div>
            <div className="text-emerald-500 text-xs font-bold flex items-center gap-1 mt-1">
              {totalCartera > 0 ? ((totalCartera - totalVencido) / totalCartera * 100).toFixed(1) : 0}% del total
            </div>
          </div>
        </div>
        <div className="card border-slate-100 hover:border-red-200 transition-colors">
          <div className="flex justify-between items-start text-slate-400">
            <div className="p-2 bg-red-50 rounded-lg"><CreditCard size={20} className="text-red-500" /></div>
            <span className="text-[10px] uppercase font-bold tracking-wider bg-red-50 px-2 py-1 rounded text-red-600">En Mora</span>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-slate-900">${totalVencido.toLocaleString()}</div>
            <div className="text-red-500 text-xs font-bold flex items-center gap-1 mt-1">
              {totalCartera > 0 ? (totalVencido / totalCartera * 100).toFixed(1) : 0}% ICV
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden border-slate-100 shadow-sm">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight">Análisis de Cuentas Críticas</h3>
          <div className="text-[10px] font-bold text-slate-400">CLIC EN FILA PARA VER DETALLES</div>
        </div>
        {loading ? (
             <div className="p-12 flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="animate-spin mb-2" size={32} />
                <p>Cargando saldos...</p>
             </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-finance">
              <thead className="bg-white border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">Socio</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">Cuenta</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">Capital Moroso</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">Saldo al Día</th>
                  <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">Días Mora</th>
                  <th className="px-6 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {asignaciones.map((asig, i) => (
                  <tr 
                    key={i} 
                    onClick={() => setSelectedAsig(asig)}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900 leading-tight">{asig['NOMBRE']}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">{asig['NoSOCIO']}</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-slate-600">{asig['NoCUENTA']}</td>
                    <td className="px-6 py-4 text-xs font-bold text-red-600">${asig['CAPITAL MOROSO']?.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-bold text-blue-700">${asig['SALDO AL DIA']?.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600 w-12">{asig['DIAS MORA']} d</span>
                        <div className="flex-1 min-w-[60px] bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className={`h-full ${asig['DIAS MORA'] > 90 ? 'bg-red-500' : asig['DIAS MORA'] > 30 ? 'bg-orange-400' : 'bg-emerald-400'}`} 
                               style={{ width: `${Math.min(asig['DIAS MORA'], 100)}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-blue-100 text-blue-600 p-1 rounded-full inline-block">
                        <ArrowUpRight size={14} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal / Slide-over */}
      {selectedAsig && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-300">
          <div 
            className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Detalles del Crédito</h2>
                <p className="text-xs text-slate-500 font-medium">Información completa para gestión de socio</p>
              </div>
              <button 
                onClick={() => setSelectedAsig(null)}
                className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-slate-600 transition-all border border-transparent hover:border-slate-200 shadow-sm"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Socio Info */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <User className="text-blue-600" size={18} />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Información del Socio</h3>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="text-xl font-black text-slate-900 mb-1">{selectedAsig['NOMBRE']}</div>
                  <div className="flex gap-4 text-sm font-bold">
                    <span className="text-blue-600">Socio: {selectedAsig['NoSOCIO']}</span>
                    <span className="text-slate-400">Cuenta: {selectedAsig['NoCUENTA']}</span>
                  </div>
                </div>
              </section>

              {/* Contact & Location */}
              <section className="grid grid-cols-1 gap-4">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><MapPin size={18} /></div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Domicilio</div>
                      <div className="text-sm font-semibold text-slate-700 leading-snug">{selectedAsig['DOMICILIO']}</div>
                      <div className="text-xs text-slate-500">{selectedAsig['COLONIA']}, {selectedAsig['MUNICIPIO']}, {selectedAsig['ESTADO']} CP {selectedAsig['C.P.']}</div>
                      {selectedAsig['CRUCES'] && <div className="text-xs italic text-slate-400 mt-1">Ref: {selectedAsig['CRUCES']}</div>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-50 rounded-lg text-green-600"><Phone size={18} /></div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Teléfonos</div>
                      <div className="text-sm font-bold text-slate-700">{selectedAsig['TELEFONOS']}</div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Financial Conditions */}
              <section className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex items-center gap-2 mb-6 opacity-60">
                  <DollarSign size={16} />
                  <h3 className="text-[10px] font-bold uppercase tracking-widest">Condiciones del Crédito</h3>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-4">
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Monto Aprobado</div>
                    <div className="text-xl font-bold">${selectedAsig['MONTO APROBADO']?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Producto</div>
                    <div className="text-sm font-bold text-blue-300">{selectedAsig['Producto']}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Plazos</div>
                    <div className="text-lg font-bold">{selectedAsig['PLAZOS']} {selectedAsig['FRECUENCIA PAGOS']}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Días Mora</div>
                    <div className="text-lg font-bold text-red-400">{selectedAsig['DIAS MORA']} Días</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Saldo al Día</div>
                    <div className="text-lg font-bold text-emerald-400">${selectedAsig['SALDO AL DIA']?.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Saldo Total</div>
                    <div className="text-lg font-bold text-blue-400">${selectedAsig['SALDO TOTAL']?.toLocaleString()}</div>
                  </div>
                  <div className="col-span-2 lg:col-span-1">
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Capital Moroso</div>
                    <div className="text-lg font-bold text-orange-400">${selectedAsig['CAPITAL MOROSO']?.toLocaleString()}</div>
                  </div>
                </div>
              </section>

              {/* Avales */}
              {(selectedAsig['NOMBRE D.A.1'] || selectedAsig['NOMBRE D.A.2']) && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Info className="text-orange-500" size={18} />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Información de Avales</h3>
                  </div>
                  <div className="space-y-4">
                    {selectedAsig['NOMBRE D.A.1'] && (
                      <div className="p-4 border border-slate-100 rounded-xl bg-orange-50/20">
                        <div className="text-[10px] font-bold text-orange-600 uppercase mb-1">Aval Primario</div>
                        <div className="font-bold text-slate-800 text-sm mb-1">{selectedAsig['NOMBRE D.A.1']}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                          <MapPin size={10} /> {selectedAsig['DOMICILIO D.A.1']}
                        </div>
                        <div className="text-xs text-slate-600 font-bold flex items-center gap-1">
                          <Phone size={10} /> {selectedAsig['TELÉFONOS D.A.1']}
                        </div>
                      </div>
                    )}
                    {selectedAsig['NOMBRE D.A.2'] && (
                      <div className="p-4 border border-slate-100 rounded-xl bg-slate-50/50">
                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Aval Secundario</div>
                        <div className="font-bold text-slate-800 text-sm mb-1">{selectedAsig['NOMBRE D.A.2']}</div>
                        <div className="text-xs text-slate-500">{selectedAsig['DOMICILIO D.A.2']}</div>
                        <div className="text-xs text-slate-600 font-bold">{selectedAsig['TELÉFONOS D.A.2']}</div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Footer / Actions */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50">
              <button 
                onClick={() => setSelectedAsig(null)}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
              >
                Cerrar Detalles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
