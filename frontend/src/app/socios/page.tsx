"use client";

import { useEffect, useState } from "react";
import { User, Search, Filter, Plus, Loader2, X, Phone, MapPin, MessageSquare, Calendar, History, DollarSign, Clock, CheckCircle2, UserPlus } from "lucide-react";
import { fetchAsignaciones, fetchAllGestores, registrarInteraccion, fetchInteraccionesSocio, actualizarAsignacion } from "@/lib/api";
import { useRouter } from 'next/navigation';

export default function SociosPage() {
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gestores, setGestores] = useState<any[]>([]);
  const [selectedGestor, setSelectedGestor] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

  // Estados para Modales
  const [isGestionModalOpen, setIsGestionModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSocio, setSelectedSocio] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Formulario de Gestión
  const [gestionForm, setGestionForm] = useState({
    tipo_gestion: 'Visita',
    resultado: 'Contacto Exitoso',
    comentarios: '',
    fecha_gestion: new Date().toISOString().slice(0, 16)
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [assignForm, setAssignForm] = useState({
    gestorId: '',
    gestorName: '',
    targetType: 'Socio', // 'Socio', 'Aval 1', 'Aval 2'
    domicilio: '',
    noCuenta: ''
  });

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userInfo = localStorage.getItem('user_info');
    
    if (!token || !userInfo) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(userInfo);
    setUser(parsedUser);
    setIsAdmin(parsedUser.rol === 'admin');

    if (parsedUser.rol === 'admin') {
      fetchAllGestores().then(setGestores).catch(console.error);
    }
  }, [router]);

  useEffect(() => {
    if (!user) return;
    
    async function loadData() {
      setLoading(true);
      try {
        const effectiveGestor = isAdmin ? selectedGestor : (user.gestor);
        const data = await fetchAsignaciones(100, effectiveGestor);
        setAsignaciones(data);
      } catch (error) {
        console.error("Error loading assignments:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, selectedGestor, isAdmin]);

  const handleOpenDetail = async (socio: any) => {
    setSelectedSocio(socio);
    setIsDetailModalOpen(true);
    setLoadingHistory(true);
    try {
      const hist = await fetchInteraccionesSocio(socio['NoSOCIO']);
      setHistory(hist);
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSaveGestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSocio || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await registrarInteraccion({
        socio_id: selectedSocio['NoSOCIO'],
        num_cuenta: selectedSocio['NoCUENTA'],
        tipo_gestion: gestionForm.tipo_gestion,
        resultado: gestionForm.resultado,
        descripcion: gestionForm.comentarios,
        fecha_gestion: gestionForm.fecha_gestion
      });
      alert("Gestión guardada con éxito");
      setIsGestionModalOpen(false);
      setGestionForm({ ...gestionForm, comentarios: '' });
    } catch (error) {
      alert("Error al guardar la gestión");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAssign = (socio?: any) => {
    if (socio) {
      setSelectedSocio(socio);
      setAssignForm({
        gestorId: '',
        gestorName: socio['GESTOR ASIGNADO'] || '',
        targetType: 'Socio',
        domicilio: socio['DOMICILIO'] || '',
        noCuenta: socio['NoCUENTA']
      });
    } else {
      setSelectedSocio(null);
      setAssignForm({
        gestorId: '',
        gestorName: '',
        targetType: 'Socio',
        domicilio: '',
        noCuenta: ''
      });
    }
    setIsAssignModalOpen(true);
  };

  const handleSaveAsignacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.noCuenta || !assignForm.gestorName) {
      alert("Por favor seleccione un socio y un gestor");
      return;
    }

    try {
      await actualizarAsignacion(assignForm.noCuenta, {
        "GESTOR ASIGNADO": assignForm.gestorName,
        "DOMICILIO": assignForm.domicilio,
        "FECHA ASIGNACION": new Date().toLocaleDateString('es-MX')
      });
      alert("Asignación actualizada con éxito");
      setIsAssignModalOpen(false);
      // Recargar datos
      const data = await fetchAsignaciones(100, isAdmin ? selectedGestor : (user.gestor));
      setAsignaciones(data);
    } catch (error) {
      alert("Error al actualizar la asignación");
    }
  };

  const handleTargetChange = (type: string) => {
    if (!selectedSocio) return;
    let addr = '';
    if (type === 'Socio') addr = selectedSocio['DOMICILIO'] || '';
    if (type === 'Aval 1') addr = selectedSocio['DOMICILIO D.A.1'] || '';
    if (type === 'Aval 2') addr = selectedSocio['DOMICILIO D.A.2'] || '';
    
    setAssignForm({
      ...assignForm, 
      targetType: type,
      domicilio: addr
    });
  };

  const filteredAsignaciones = asignaciones.filter(asig => 
    asig['NOMBRE'].toLowerCase().includes(searchTerm.toLowerCase()) ||
    asig['NoSOCIO'].toString().includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Directorio de Socios</h1>
          <p className="text-slate-500 text-sm">Administración y seguimiento de la fuerza de cobranza.</p>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase ml-2">Gestor:</span>
              <select 
                value={selectedGestor}
                onChange={(e) => setSelectedGestor(e.target.value)}
                className="text-sm font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
              >
                <option value="">Todos</option>
                {gestores.map(g => <option key={g.gestor_id} value={g.gestor_name}>{g.gestor_name}</option>)}
              </select>
            </div>
          )}
          {isAdmin && (
            <button 
              onClick={() => handleOpenAssign()}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
            >
              <UserPlus size={18} />
              Nueva Asignación
            </button>
          )}
        </div>
      </div>

      <div className="card flex items-center gap-4 bg-white !p-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o número de socio..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div className="card overflow-hidden !p-0">
        {loading ? (
          <div className="p-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mb-4" size={40} />
            <p className="font-medium">Cargando base de datos...</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Socio</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Total</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Mora</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredAsignaciones.map((asig, i) => (
                <tr key={i} className="hover:bg-blue-50/30 transition-all group">
                  <td className="px-6 py-4">
                    <button onClick={() => handleOpenDetail(asig)} className="flex items-center gap-3 text-left">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                        <User size={18} />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors uppercase text-sm">{asig['NOMBRE']}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {asig['NoSOCIO']} • CUENTA: {asig['NoCUENTA']}</div>
                      </div>
                    </button>
                  </td>
                  <td className="px-6 py-4 font-black text-slate-700 text-sm">
                    ${asig['SALDO TOTAL']?.toLocaleString() || '0.00'}
                  </td>
                  <td className={`px-6 py-4 font-bold text-sm ${asig['DIAS MORA'] > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {asig['DIAS MORA']} d
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tight ${
                      asig['DIAS MORA'] > 90 ? 'bg-red-50 text-red-600 border border-red-100' : 
                      asig['DIAS MORA'] > 0 ? 'bg-orange-50 text-orange-600 border border-orange-100' : 
                      'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    }`}>
                      {asig['SITUACIÓN DEL CRÉDITO'] || 'VIGENTE'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {isAdmin && (
                        <button 
                          onClick={() => handleOpenAssign(asig)}
                          className="text-[10px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-tighter"
                        >
                          Asignar
                        </button>
                      )}
                      <button 
                        onClick={() => { setSelectedSocio(asig); setIsGestionModalOpen(true); }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-tighter"
                      >
                        Gestionar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de Nueva Asignación (Admin Only) */}
      {isAssignModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-blue-50/50">
              <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <UserPlus className="text-blue-600" size={20} />
                Programar Nueva Asignación
              </h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveAsignacion} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Paso 1: Seleccionar Socio</label>
                <select 
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                  value={assignForm.noCuenta}
                  onChange={(e) => {
                    const socio = asignaciones.find(a => a['NoCUENTA'] === e.target.value);
                    if (socio) handleOpenAssign(socio);
                  }}
                >
                  <option value="">Seleccione un socio de la lista...</option>
                  {asignaciones.map(a => (
                    <option key={a['NoCUENTA']} value={a['NoCUENTA']}>{a['NOMBRE']} ({a['NoSOCIO']})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Paso 2: Asignar Gestor</label>
                  <select 
                    required
                    value={assignForm.gestorName}
                    onChange={(e) => setAssignForm({...assignForm, gestorName: e.target.value})}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Elegir Gestor...</option>
                    {gestores.map(g => <option key={g.gestor_id} value={g.gestor_name}>{g.gestor_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Paso 3: Objetivo</label>
                  <select 
                    value={assignForm.targetType}
                    onChange={(e) => handleTargetChange(e.target.value)}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="Socio">Titular (Socio)</option>
                    <option value="Aval 1">Aval 1</option>
                    <option value="Aval 2">Aval 2</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Dirección de la Visita</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
                  <textarea 
                    required
                    value={assignForm.domicilio}
                    onChange={(e) => setAssignForm({...assignForm, domicilio: e.target.value})}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 min-h-[80px]"
                    placeholder="Escriba la dirección exacta para el gestor..."
                  />
                </div>
              </div>

              <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 flex gap-3 text-orange-700">
                <Clock size={18} className="shrink-0 mt-0.5" />
                <p className="text-[10px] font-medium leading-tight">
                  Esta acción actualizará la ruta del gestor en tiempo real. Asegúrese de que la dirección sea correcta para la geolocalización.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-[2] px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all font-mono tracking-tighter"
                >
                  Confirmar Asignación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Registro de Gestión (Ocultar botones si es Admin para evitar duplicidad, o mantenerlo) */}
      {isGestionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <MapPin className="text-blue-600" size={20} />
                Registrar Gestión
              </h3>
              <button onClick={() => setIsGestionModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveGestion} className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Socio Seleccionado</label>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 font-bold text-slate-800 text-sm">
                  {selectedSocio ? selectedSocio['NOMBRE'] : 'Seleccione un socio de la lista'}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Tipo de Gestión</label>
                  <select 
                    value={gestionForm.tipo_gestion}
                    onChange={(e) => setGestionForm({...gestionForm, tipo_gestion: e.target.value})}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="Visita">Visita Domiciliaria</option>
                    <option value="Llamada">Llamada</option>
                    <option value="Mensaje">Mensaje / WhatsApp</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Resultado</label>
                  <select 
                    value={gestionForm.resultado}
                    onChange={(e) => setGestionForm({...gestionForm, resultado: e.target.value})}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="Contacto Exitoso">Contacto Exitoso</option>
                    <option value="Ilocalizable">Ilocalizable</option>
                    <option value="Promesa de Pago">Promesa de Pago</option>
                    <option value="Negativa">Negativa</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Comentarios de Gestión</label>
                <textarea 
                  required
                  value={gestionForm.comentarios}
                  onChange={(e) => setGestionForm({...gestionForm, comentarios: e.target.value})}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 min-h-[100px]"
                  placeholder="Detalle los hallazgos de la visita..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsGestionModalOpen(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={!selectedSocio || isSubmitting}
                  className="flex-[2] px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 transition-all font-mono tracking-tighter"
                >
                  {isSubmitting ? "Guardando..." : "Guardar Gestión"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Detalle de Socio */}
      {isDetailModalOpen && selectedSocio && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-3xl shadow-2xl w-full max-w-4xl h-[90vh] md:h-auto md:max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200">
                  <User size={24} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl">{selectedSocio['NOMBRE']}</h3>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Socio ID: {selectedSocio['NoSOCIO']}</div>
                </div>
              </div>
              <button onClick={() => setIsDetailModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <DollarSign size={14} className="text-emerald-500" /> Saldo y Cartera
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-slate-500 font-bold">Saldo Total:</span>
                      <span className="text-lg font-black text-slate-900">${selectedSocio['SALDO TOTAL']?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-slate-500 font-bold">Capital Moroso:</span>
                      <span className="text-sm font-bold text-red-600">${selectedSocio['CAPITAL MOROSO']?.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Clock size={14} className="text-orange-500" /> Estado de Mora
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-slate-500 font-bold">Días en Mora:</span>
                      <span className="text-lg font-black text-red-600">{selectedSocio['DIAS MORA']} d</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 font-bold">Situación:</span>
                      <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[9px] font-black uppercase text-slate-700">{selectedSocio['SITUACIÓN DEL CRÉDITO']}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <User size={14} className="text-blue-500" /> Asignación
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-slate-500 font-bold">Gestor:</span>
                      <span className="text-sm font-bold text-slate-900">{selectedSocio['GESTOR ASIGNADO']}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-xs text-slate-500 font-bold">Cuenta:</span>
                      <span className="text-sm font-bold text-slate-600 font-mono">{selectedSocio['NoCUENTA']}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2 text-sm">
                  <History size={18} className="text-blue-600" />
                  Historial de Gestiones Recientes
                </h4>
                
                {loadingHistory ? (
                   <div className="flex items-center gap-2 text-slate-400 py-10 justify-center">
                     <Loader2 className="animate-spin" size={20} />
                     <span className="text-xs font-bold uppercase">Cargando historial...</span>
                   </div>
                ) : history.length === 0 ? (
                   <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                     <p className="text-xs font-bold text-slate-400 uppercase">No hay gestiones registradas para este socio.</p>
                   </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((h, i) => (
                      <div key={i} className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-blue-200 transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                              {h.tipo_gestion === 'Visita' ? <MapPin size={14} /> : h.tipo_gestion === 'Llamada' ? <Phone size={14} /> : <MessageSquare size={14} />}
                            </div>
                            <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{h.tipo_gestion} de Cobranza</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">{new Date(h.fecha_gestion).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-600 italic mb-3 leading-relaxed">"{h.descripcion}"</p>
                        <div className="flex items-center gap-3 border-t border-slate-50 pt-3">
                          <div className="flex items-center gap-1 text-[9px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-md">
                            <CheckCircle2 size={10} /> {h.resultado}
                          </div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase ml-auto">Gestor: {h.gestor_nombre || 'Sistema'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 sticky bottom-0">
               <button 
                onClick={() => { setIsDetailModalOpen(false); setIsGestionModalOpen(true); }}
                className="flex-1 bg-slate-900 text-white p-3 rounded-xl text-sm font-bold shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
               >
                 <Plus size={18} /> Registrar Nueva Visita
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
