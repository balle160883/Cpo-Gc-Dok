"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Calendar, Phone, MapPin, CheckCircle2, Loader2, User, FileDown, Plus, X } from "lucide-react";
import { fetchInteracciones, fetchAllGestores, registrarInteraccion, fetchAsignaciones } from "@/lib/api";
import * as XLSX from 'xlsx';

type GestionType = 'Todas' | 'Llamada' | 'Visita' | 'Mensaje';

export default function GestionesPage() {
  const [interacciones, setInteracciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gestores, setGestores] = useState<any[]>([]);
  const [selectedGestor, setSelectedGestor] = useState<string>("");
  const [selectedType, setSelectedType] = useState<GestionType>('Todas');
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedSujeto, setSelectedSujeto] = useState<'Todos' | 'Socio' | 'Aval'>('Todos');
  const [selectedResultado, setSelectedResultado] = useState<string>("Todos");

  // Estados para Registro de Gestión (Llamada/Mensaje)
  const [isGestionModalOpen, setIsGestionModalOpen] = useState(false);
  const [asignacionesList, setAsignacionesList] = useState<any[]>([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(false);
  const [searchSocioTerm, setSearchSocioTerm] = useState("");
  const [selectedSocio, setSelectedSocio] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [gestionForm, setGestionForm] = useState({
    tipo_gestion: 'Llamada',
    resultado: 'Contacto Exitoso',
    comentarios: '',
    fecha_gestion: new Date().toISOString().slice(0, 16)
  });

  useEffect(() => {
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      const parsedUser = JSON.parse(userInfo);
      setUser(parsedUser);
      setIsAdmin(parsedUser.rol === 'admin');
    }
  }, []);

  // Cargar asignaciones para búsqueda de socios al abrir el modal
  useEffect(() => {
    if (isGestionModalOpen && user) {
      setLoadingAsignaciones(true);
      const effectiveGestor = isAdmin ? "" : user.gestor;
      fetchAsignaciones(300, effectiveGestor)
        .then(setAsignacionesList)
        .catch(console.error)
        .finally(() => setLoadingAsignaciones(false));
    }
  }, [isGestionModalOpen, user, isAdmin]);

  const filteredSocios = asignacionesList.filter(asig => {
    const term = searchSocioTerm.toLowerCase();
    const nombre = (asig.NOMBRE || "").toLowerCase();
    const cuenta = (asig.NoCUENTA || "").toLowerCase();
    const socioId = (asig.NoSOCIO || "").toLowerCase();
    return nombre.includes(term) || cuenta.includes(term) || socioId.includes(term);
  });

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
      
      // Limpiar formulario
      setGestionForm({
        tipo_gestion: 'Llamada',
        resultado: 'Contacto Exitoso',
        comentarios: '',
        fecha_gestion: new Date().toISOString().slice(0, 16)
      });
      setSelectedSocio(null);
      setSearchSocioTerm("");

      // Refrescar el historial de gestiones
      setLoading(true);
      const data = await fetchInteracciones(selectedGestor, startDate, endDate);
      setInteracciones(data);
    } catch (error) {
      console.error(error);
      alert("Error al guardar la gestión");
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchAllGestores().then(setGestores).catch(console.error);
    }
  }, [isAdmin]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const data = await fetchInteracciones(selectedGestor, startDate, endDate);
        setInteracciones(data);
      } catch (error) {
        console.error("Error loading interactions:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedGestor, startDate, endDate]);

  const safeFormatDate = (dateStr: any, isDateTime = false, fallback = 'N/A') => {
    if (!dateStr) return fallback;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return fallback;
    return isDateTime ? date.toLocaleString('es-MX') : date.toLocaleDateString('es-MX');
  };

  const handleExportExcel = () => {
    const dataToExport = filteredInteracciones.map(item => {
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
    
    // Generar nombre de archivo con fecha
    const fileName = `Gestiones_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Función auxiliar para determinar el sujeto real basado en el comentario o el campo de la DB
  const getSujetoEfectivo = (item: any) => {
    const desc = item.descripcion || "";
    if (desc.startsWith('1-') || desc.startsWith('2-')) return 'Aval';
    if (desc.startsWith('0-')) return 'Socio';
    const rawSujeto = item.sujeto_tipo || 'Socio';
    if (rawSujeto.startsWith('Aval')) return 'Aval';
    return rawSujeto;
  };

  // Deduplicación defensiva en el cliente por si existen duplicados históricos en la BD
  const deduplicatedInteracciones = interacciones.reduce((acc: any[], item: any) => {
    const itemDesc = (item.descripcion || '').trim().toLowerCase();
    const itemTime = new Date(item.fecha_gestion).getTime();
    
    const isDuplicate = acc.some(existing => {
      if (String(existing.socio_id).trim() !== String(item.socio_id).trim()) return false;
      const existingDesc = (existing.descripcion || '').trim().toLowerCase();
      const diffSeconds = Math.abs(new Date(existing.fecha_gestion).getTime() - itemTime) / 1000;
      
      const sameDesc = itemDesc.length > 0 && existingDesc === itemDesc && diffSeconds <= 86400;
      const sameWindow = diffSeconds <= 900;
      return sameDesc || sameWindow;
    });

    if (!isDuplicate) {
      acc.push(item);
    }
    return acc;
  }, []);

  // Filtrar interacciones por tipo y sujeto en el frontend
  const filteredInteracciones = deduplicatedInteracciones.filter(item => {
    const matchesType = selectedType === 'Todas' || item.tipo_gestion === selectedType;
    const sujetoEfectivo = getSujetoEfectivo(item);
    const matchesSujeto = selectedSujeto === 'Todos' || sujetoEfectivo === selectedSujeto;
    const matchesResultado = selectedResultado === 'Todos' || item.resultado === selectedResultado;
    return matchesType && matchesSujeto && matchesResultado;
  });


  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Llamada': return <Phone size={18} />;
      case 'Visita': return <MapPin size={18} />;
      case 'Mensaje': return <MessageSquare size={18} />;
      default: return <Calendar size={18} />;
    }
  };

  const tabs: {id: GestionType, label: string}[] = [
    { id: 'Todas', label: 'Todas' },
    { id: 'Llamada', label: 'Llamadas' },
    { id: 'Visita', label: 'Visitas' },
    { id: 'Mensaje', label: 'Mensajes' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historial de Gestiones</h1>
          <p className="text-slate-500 text-sm">Registro cronológico de actividades de cobranza y contacto.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
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
              <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Gestor:</span>
              <select 
                value={selectedGestor}
                onChange={(e) => setSelectedGestor(e.target.value)}
                className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
              >
                <option value="">Todos</option>
                {gestores.map(g => (
                  <option key={g.gestor_id} value={g.gestor_id}>{g.gestor_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Resultado:</span>
            <select 
              value={selectedResultado}
              onChange={(e) => setSelectedResultado(e.target.value)}
              className="text-xs font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer"
            >
              <option value="Todos">Todos</option>
              <option value="promesa_pago">Promesa de Pago</option>
              <option value="no_encontrado">No encontrado</option>
              <option value="ya_pago">Ya pagó</option>
              <option value="cambio_domicilio">Cambio domicilio</option>
              <option value="recibieron">Recibieron</option>
              <option value="por_localizar">Por localizar</option>
              <option value="reclamacion">Reclamación</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <button 
            onClick={() => setIsGestionModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md"
          >
            <Plus size={16} />
            Registrar Gestión
          </button>

          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md disabled:opacity-50"
            disabled={filteredInteracciones.length === 0}
          >
            <FileDown size={16} />
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="card !p-1 bg-slate-100/50">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedType(tab.id)}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                selectedType === tab.id 
                ? "bg-slate-900 text-white shadow-md" 
                : "text-slate-500 hover:text-slate-900 hover:bg-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="h-8 w-px bg-slate-200 mx-4" />
          {['Todos', 'Socio', 'Aval'].map((sujeto) => (
            <button
              key={sujeto}
              onClick={() => setSelectedSujeto(sujeto as any)}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                selectedSujeto === sujeto 
                ? "bg-blue-600 text-white shadow-md" 
                : "text-slate-500 hover:text-blue-600 hover:bg-white"
              }`}
            >
              {sujeto === 'Todos' ? 'Ambos Sujetos' : sujeto}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="animate-spin mb-4" size={40} />
          <p className="font-medium">Cargando historial de gestiones...</p>
        </div>
      ) : filteredInteracciones.length === 0 ? (
        <div className="py-20 text-center card bg-slate-50 border-dashed border-2">
          <MessageSquare className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500 font-medium">No se encontraron gestiones registradas para {selectedType.toLowerCase()}.</p>
        </div>
      ) : (
        <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
          {filteredInteracciones.map((item, i) => (
            <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-white group-[.is-active]:bg-blue-600 text-slate-400 group-[.is-active]:text-white shadow-lg shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 transition-transform group-hover:scale-110">
                {getTypeIcon(item.tipo_gestion)}
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] card !p-5 hover:border-blue-400 transition-all shadow-sm hover:shadow-md">
                <div className="flex items-center justify-between space-x-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      item.tipo_gestion === 'Llamada' ? 'bg-blue-400' : 
                      item.tipo_gestion === 'Visita' ? 'bg-emerald-400' : 'bg-purple-400'
                    }`}></span>
                    <div className="font-bold text-slate-900">{item.tipo_gestion} de Cobranza</div>
                  </div>
                  <time className="font-bold text-blue-600 text-[10px] bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {new Date(item.fecha_gestion).toLocaleString('es-MX', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </time>
                </div>
                <div className="text-slate-400 text-xs mb-4 font-bold uppercase tracking-tight flex flex-col gap-1">
                    <div className="flex items-center gap-4">
                      <div>Socio: <span className="text-slate-700">{item.socio_id}</span></div>
                      <div>Cuenta: <span className="text-slate-700">{item.asignacion?.NoCUENTA || item.num_cuenta || 'N/A'}</span></div>
                      {item.fecha_inicio_gestion && (
                        <div className="bg-slate-100 px-2 py-0.5 rounded text-[9px] text-slate-500 font-bold border border-slate-200">
                          INICIO GESTIÓN: {new Date(item.fecha_inicio_gestion).toLocaleDateString('es-MX')}
                        </div>
                      )}
                    </div>
                   {getSujetoEfectivo(item).startsWith('Aval') ? (
                     <div className="flex flex-col gap-1 mt-1 border-t border-slate-100 pt-1">
                        {(item.socios_datos?.nombre_completo || item.asignacion?.NOMBRE) && (
                          <div className="flex items-center gap-1.5">
                            <User size={13} className="text-slate-400" />
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Socio</span>
                            <span className="text-slate-700 font-bold text-xs tracking-normal capitalize">
                              {(item.socios_datos?.nombre_completo || item.asignacion.NOMBRE).toLowerCase()}
                            </span>
                          </div>
                        )}
                       {item.nombre_visitado && (
                         <div className="flex items-center gap-1.5">
                           <User size={13} className="text-blue-500" />
                           <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Aval</span>
                           <span className="text-slate-900 font-extrabold text-sm tracking-normal capitalize">
                             {item.nombre_visitado.toLowerCase()}
                           </span>
                         </div>
                       )}
                     </div>
                   ) : (
                     item.nombre_visitado && (
                       <div className="flex items-center gap-1.5 mt-1 border-t border-slate-100 pt-1">
                         <User size={14} className="text-blue-500" />
                         <span className="text-slate-900 font-extrabold text-sm tracking-normal capitalize">
                           {item.nombre_visitado.toLowerCase()}
                         </span>
                       </div>
                     )
                   )}
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-700 italic leading-relaxed">
                  <div className="flex items-center gap-2 mb-2 not-italic">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                      getSujetoEfectivo(item) === 'Socio' ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {getSujetoEfectivo(item)}
                    </span>
                  </div>
                  "{item.descripcion || 'Sin comentarios registrados.'}"
                </div>
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50/50 px-2 py-1 rounded-md border border-emerald-100 uppercase">
                    <CheckCircle2 size={12} /> {item.resultado || 'Exitoso'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1 ml-auto">
                    <User size={12} className="text-blue-400" /> <span className="text-slate-600">{item.gestor_nombre || 'Sistema'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal para Registrar Gestión (Llamada/Mensaje) */}
      {isGestionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <Phone className="text-blue-600" size={20} />
                Registrar Gestión (Llamada / Mensaje)
              </h3>
              <button 
                onClick={() => {
                  setIsGestionModalOpen(false);
                  setSelectedSocio(null);
                  setSearchSocioTerm("");
                }} 
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveGestion} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Buscador de Socio */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Buscar Socio / Aval
                </label>
                {selectedSocio ? (
                  <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 flex justify-between items-center">
                    <div>
                      <div className="font-extrabold text-blue-900 text-sm">{selectedSocio['NOMBRE']}</div>
                      <div className="text-[10px] text-blue-500 font-bold uppercase">
                        Socio: {selectedSocio['NoSOCIO']} • Cuenta: {selectedSocio['NoCUENTA']}
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setSelectedSocio(null)}
                      className="text-blue-400 hover:text-red-500 transition-colors font-bold text-xs"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input 
                      type="text"
                      placeholder="Escriba nombre, cuenta o ID del socio..."
                      value={searchSocioTerm}
                      onChange={(e) => setSearchSocioTerm(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                    />
                    
                    {/* Lista de sugerencias */}
                    {searchSocioTerm.trim().length > 0 && (
                      <div className="border border-slate-100 rounded-xl max-h-48 overflow-y-auto bg-white shadow-inner divide-y divide-slate-50">
                        {loadingAsignaciones ? (
                          <div className="p-4 text-center text-xs font-bold text-slate-400">Cargando socios...</div>
                        ) : filteredSocios.length === 0 ? (
                          <div className="p-4 text-center text-xs font-bold text-slate-400">No se encontraron coincidencias</div>
                        ) : (
                          filteredSocios.slice(0, 10).map((asig) => (
                            <button
                              key={asig.NoCUENTA}
                              type="button"
                              onClick={() => {
                                setSelectedSocio(asig);
                                setSearchSocioTerm("");
                              }}
                              className="w-full text-left p-3 hover:bg-slate-50/80 transition-all flex flex-col"
                            >
                              <span className="font-bold text-slate-800 text-sm">{asig.NOMBRE}</span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase">
                                Socio ID: {asig.NoSOCIO} • Cuenta: {asig.NoCUENTA}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Tipo de Gestión
                  </label>
                  <select 
                    value={gestionForm.tipo_gestion}
                    onChange={(e) => setGestionForm({...gestionForm, tipo_gestion: e.target.value})}
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="Llamada">Llamada</option>
                    <option value="Mensaje">Mensaje / WhatsApp</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Resultado
                  </label>
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Comentarios de Gestión
                </label>
                <textarea 
                  required
                  value={gestionForm.comentarios}
                  onChange={(e) => setGestionForm({...gestionForm, comentarios: e.target.value})}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 min-h-[100px]"
                  placeholder="Detalle la llamada o mensaje..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => {
                    setIsGestionModalOpen(false);
                    setSelectedSocio(null);
                    setSearchSocioTerm("");
                  }}
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
    </div>
  );
}
