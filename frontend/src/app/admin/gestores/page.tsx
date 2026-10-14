'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Edit3, 
  Trash2, 
  ShieldCheck, 
  Mail, 
  Lock, 
  KeyRound, 
  UserCheck, 
  Briefcase, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Loader2, 
  FileSpreadsheet, 
  RefreshCw,
  PhoneCall,
  UserCog
} from 'lucide-react';
import { 
  fetchAdminGestores, 
  createAdminGestor, 
  updateAdminGestor, 
  deleteAdminGestor 
} from '@/lib/api';

interface GestorUser {
  id: string;
  email: string;
  gestor: string;
  rol: string;
  created_at: string;
  cuentas_asignadas: number;
  total_gestiones: number;
}

export default function AdminGestoresPage() {
  const [gestores, setGestores] = useState<GestorUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('todos');
  
  // Feedback alerts
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Current session user
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Modal Crear / Editar
  const [showFormModal, setShowFormModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState('gestor');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal Eliminar
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingGestor, setDeletingGestor] = useState<GestorUser | null>(null);
  const [reassignOption, setReassignOption] = useState<'unassign' | 'reassign'>('unassign');
  const [targetReassignGestor, setTargetReassignGestor] = useState<string>('');
  const [deleting, setDeleting] = useState(false);

  // Comprobar autenticación y rol de acceso
  useEffect(() => {
    const rawUserInfo = localStorage.getItem('user_info');
    if (rawUserInfo) {
      try {
        const user = JSON.parse(rawUserInfo);
        setCurrentUser(user);
        const email = (user.email || '').trim().toLowerCase();
        const role = (user.rol || '').trim().toLowerCase();
        const gestor = (user.gestor || '').toUpperCase();

        const hasAccess = 
          email === 'ing.ballesteros16@gmail.com' ||
          role === 'admin' ||
          role === 'superadmin' ||
          gestor === 'ADMINISTRADOR GLOBAL' ||
          gestor === 'SUPERADMIN';

        setIsAuthorized(hasAccess);
      } catch (e) {
        console.error('Error al analizar usuario:', e);
      }
    }
  }, []);

  // Cargar gestores
  const loadGestores = async () => {
    setLoading(true);
    try {
      const data = await fetchAdminGestores();
      setGestores(data || []);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al cargar la lista de gestores.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      loadGestores();
    }
  }, [isAuthorized]);

  // Temporizador para limpiar feedback
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Métricas calculadas
  const metrics = useMemo(() => {
    const total = gestores.length;
    const activosConCuentas = gestores.filter(g => (g.cuentas_asignadas || 0) > 0).length;
    const totalCuentas = gestores.reduce((sum, g) => sum + (Number(g.cuentas_asignadas) || 0), 0);
    const totalGestiones = gestores.reduce((sum, g) => sum + (Number(g.total_gestiones) || 0), 0);
    return { total, activosConCuentas, totalCuentas, totalGestiones };
  }, [gestores]);

  // Verificar si el usuario en sesión es Administrador Principal o Superadmin
  const isMasterOrSuper = useMemo(() => {
    const email = (currentUser?.email || '').trim().toLowerCase();
    const role = (currentUser?.rol || '').trim().toLowerCase();
    const gestor = (currentUser?.gestor || '').toUpperCase();
    return (
      email === 'ing.ballesteros16@gmail.com' ||
      role === 'superadmin' ||
      gestor === 'SUPERADMIN'
    );
  }, [currentUser]);

  // Determinar si una cuenta objetivo está protegida contra edición de administradores regulares
  const isTargetProtected = (target: GestorUser) => {
    const email = (target.email || '').trim().toLowerCase();
    const role = (target.rol || '').trim().toLowerCase();
    return (
      email === 'ing.ballesteros16@gmail.com' ||
      email === 'superadmin@vesta-track.cloud' ||
      role === 'superadmin'
    );
  };

  // Filtro de búsqueda y rol
  const filteredGestores = useMemo(() => {
    return gestores.filter(g => {
      const matchSearch = 
        g.gestor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        g.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchRole = 
        selectedRoleFilter === 'todos' || 
        g.rol?.toLowerCase() === selectedRoleFilter.toLowerCase();

      return matchSearch && matchRole;
    });
  }, [gestores, searchTerm, selectedRoleFilter]);

  // Abrir modal de creación
  const handleOpenCreate = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormName('');
    setFormEmail('');
    setFormRole('gestor');
    setFormPassword('');
    setShowFormModal(true);
  };

  // Abrir modal de edición
  const handleOpenEdit = (gestor: GestorUser) => {
    if (!isMasterOrSuper && isTargetProtected(gestor)) {
      setFeedback({
        type: 'error',
        message: 'No tienes autorización para editar al Administrador Principal o cuentas Superadmin.'
      });
      return;
    }
    setIsEditing(true);
    setEditingId(gestor.id);
    setFormName(gestor.gestor || '');
    setFormEmail(gestor.email || '');
    setFormRole(gestor.rol || 'gestor');
    setFormPassword('');
    setShowFormModal(true);
  };

  // Guardar (Crear o Actualizar)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      setFeedback({ type: 'error', message: 'Nombre y correo son requeridos.' });
      return;
    }

    if (!isEditing && !formPassword.trim()) {
      setFeedback({ type: 'error', message: 'La contraseña es requerida para nuevos gestores.' });
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing && editingId) {
        await updateAdminGestor(editingId, {
          gestor: formName.trim().toUpperCase(),
          email: formEmail.trim().toLowerCase(),
          rol: formRole,
          password: formPassword.trim() || undefined,
        });
        setFeedback({
          type: 'success',
          message: `Gestor "${formName.toUpperCase()}" actualizado correctamente.`
        });
      } else {
        await createAdminGestor({
          gestor: formName.trim().toUpperCase(),
          email: formEmail.trim().toLowerCase(),
          rol: formRole,
          password: formPassword.trim(),
        });
        setFeedback({
          type: 'success',
          message: `Gestor "${formName.toUpperCase()}" registrado con éxito.`
        });
      }
      setShowFormModal(false);
      await loadGestores();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al procesar la operación.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Abrir modal de eliminación
  const handleOpenDelete = (gestor: GestorUser) => {
    if (gestor.email?.toLowerCase() === 'ing.ballesteros16@gmail.com') {
      setFeedback({ type: 'error', message: 'No se puede eliminar la cuenta principal de administración.' });
      return;
    }
    if (!isMasterOrSuper && isTargetProtected(gestor)) {
      setFeedback({
        type: 'error',
        message: 'No tienes autorización para eliminar al Administrador Principal o cuentas Superadmin.'
      });
      return;
    }
    if (currentUser?.email && gestor.email?.toLowerCase() === currentUser.email.toLowerCase()) {
      setFeedback({ type: 'error', message: 'No puedes eliminar tu propia cuenta en sesión.' });
      return;
    }

    setDeletingGestor(gestor);
    // Preseleccionar otro gestor de campo si existe
    const available = gestores.find(g => g.id !== gestor.id && g.rol === 'gestor');
    setTargetReassignGestor(available ? available.gestor : '');

    // Si es un admin normal y el gestor tiene cuentas asignadas, obligatoriamente 'reassign'
    if (!isMasterOrSuper && (gestor.cuentas_asignadas || 0) > 0) {
      setReassignOption('reassign');
    } else {
      setReassignOption('unassign');
    }

    setShowDeleteModal(true);
  };

  // Confirmar eliminación
  const handleConfirmDelete = async () => {
    if (!deletingGestor) return;

    // Validación obligatoria para rol admin si el gestor tiene cuentas
    if (!isMasterOrSuper && (deletingGestor.cuentas_asignadas || 0) > 0) {
      if (!targetReassignGestor || targetReassignGestor.trim() === '') {
        setFeedback({
          type: 'error',
          message: 'Como Administrador, es obligatorio seleccionar un gestor activo para transferirle la cartera.'
        });
        return;
      }
    }

    setDeleting(true);
    try {
      const reassignTo = reassignOption === 'reassign' ? targetReassignGestor : 'unassign';
      const res = await deleteAdminGestor(deletingGestor.id, reassignTo);
      setFeedback({
        type: 'success',
        message: res.message || `Gestor "${deletingGestor.gestor}" eliminado correctamente.`
      });
      setShowDeleteModal(false);
      setDeletingGestor(null);
      await loadGestores();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error al eliminar gestor.'
      });
    } finally {
      setDeleting(false);
    }
  };

  // Formato de badge de rol
  const getRoleBadge = (rol: string) => {
    switch (rol?.toLowerCase()) {
      case 'superadmin':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Superadmin
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Administrador
          </span>
        );
      case 'telefonista':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Telefonista
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Gestor de Campo
          </span>
        );
    }
  };

  // Si no está autorizado
  if (!isAuthorized && currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 max-w-md text-center shadow-2xl">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Acceso Restringido</h2>
          <p className="text-slate-400 text-sm mb-6">
            Este módulo de administración de gestores está reservado para el administrador{' '}
            <span className="text-blue-400 font-medium">ing.ballesteros16@gmail.com</span> y roles autorizados.
          </p>
          <a
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-all"
          >
            Volver al Inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 lg:p-10 space-y-8">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20">
              <UserCog className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-white">
                Administración de Gestores
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Alta, edición, contraseñas y asignación de cartera de crédito.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadGestores}
            disabled={loading}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border border-slate-700 disabled:opacity-50"
            title="Refrescar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
          
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/20 transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Gestor</span>
          </button>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border animate-in fade-in slide-in-from-top-2 duration-300 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/60 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-400" />
            )}
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Gestores Registrados
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{metrics.total}</span>
            <span className="text-xs text-slate-400 font-medium">usuarios</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Con Cartera Activa
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{metrics.activosConCuentas}</span>
            <span className="text-xs text-emerald-400 font-medium">con asignaciones</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Cuentas Asignadas
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {metrics.totalCuentas.toLocaleString()}
            </span>
            <span className="text-xs text-purple-400 font-medium">en campo</span>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Gestiones Acumuladas
            </span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">
              {metrics.totalGestiones.toLocaleString()}
            </span>
            <span className="text-xs text-cyan-400 font-medium">interacciones</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        {/* Input de Búsqueda */}
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
          />
        </div>

        {/* Pestañas de Roles */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 w-full md:w-auto overflow-x-auto">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'gestor', label: 'Gestores' },
            { id: 'admin', label: 'Administradores' },
            { id: 'telefonista', label: 'Telefonistas' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedRoleFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                selectedRoleFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Gestores */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-400">Cargando catálogo de gestores...</p>
          </div>
        ) : filteredGestores.length === 0 ? (
          <div className="text-center py-16 px-4">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-300">No se encontraron gestores</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchTerm
                ? 'No hay registros que coincidan con la búsqueda.'
                : 'Aún no hay gestores dados de alta con los filtros seleccionados.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-xs uppercase font-bold text-slate-400 tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-4">Gestor / Nombre</th>
                  <th scope="col" className="px-6 py-4">Correo Electrónico</th>
                  <th scope="col" className="px-6 py-4">Rol</th>
                  <th scope="col" className="px-6 py-4 text-center">Cuentas Asignadas</th>
                  <th scope="col" className="px-6 py-4 text-center">Gestiones</th>
                  <th scope="col" className="px-6 py-4">Fecha de Alta</th>
                  <th scope="col" className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredGestores.map((gestor) => {
                  const isProtected = gestor.email?.toLowerCase() === 'ing.ballesteros16@gmail.com';
                  const isSuper = gestor.rol?.toLowerCase() === 'superadmin' || gestor.email?.toLowerCase() === 'superadmin@vesta-track.cloud';
                  const isProtectedAccount = isTargetProtected(gestor);
                  const isMe = currentUser?.email && gestor.email?.toLowerCase() === currentUser.email.toLowerCase();

                  const canEdit = isMasterOrSuper || !isProtectedAccount;
                  const canDelete = 
                    gestor.email?.toLowerCase() !== 'ing.ballesteros16@gmail.com' && 
                    !isMe && 
                    (isMasterOrSuper || !isProtectedAccount);

                  return (
                    <tr
                      key={gestor.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Nombre y Avatar */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                            {gestor.gestor
                              ? gestor.gestor.slice(0, 2).toUpperCase()
                              : 'GE'}
                          </div>
                          <div>
                            <span className="font-bold text-white block">
                              {gestor.gestor || 'Sin nombre'}
                            </span>
                            {isProtected && (
                              <span className="text-[10px] text-blue-400 font-semibold tracking-wide">
                                Administrador Principal
                              </span>
                            )}
                            {isSuper && (
                              <span className="text-[10px] text-amber-400 font-semibold tracking-wide">
                                Cuenta de Sistema
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Correo */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-mono text-xs">{gestor.email}</span>
                        </div>
                      </td>

                      {/* Rol */}
                      <td className="px-6 py-4">
                        {getRoleBadge(gestor.rol)}
                      </td>

                      {/* Cuentas Asignadas */}
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
                            gestor.cuentas_asignadas > 0
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {gestor.cuentas_asignadas.toLocaleString()}
                        </span>
                      </td>

                      {/* Gestiones */}
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800/80 text-slate-300">
                          {gestor.total_gestiones.toLocaleString()}
                        </span>
                      </td>

                      {/* Fecha */}
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {gestor.created_at
                          ? new Date(gestor.created_at).toLocaleDateString('es-MX', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })
                          : '—'}
                      </td>

                      {/* Acciones */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canEdit ? (
                            <button
                              onClick={() => handleOpenEdit(gestor)}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-blue-600/20 text-slate-300 hover:text-blue-400 transition-colors"
                              title="Editar datos o contraseña"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span
                              className="p-2 rounded-lg bg-slate-800/40 text-slate-600 cursor-not-allowed"
                              title="Cuenta protegida: No editable por Administradores"
                            >
                              <Lock className="w-4 h-4" />
                            </span>
                          )}

                          {canDelete ? (
                            <button
                              onClick={() => handleOpenDelete(gestor)}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-red-600/20 text-slate-300 hover:text-red-400 transition-colors"
                              title="Eliminar gestor"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span
                              className="p-2 text-slate-600 cursor-not-allowed"
                              title={
                                isProtected
                                  ? 'Cuenta protegida (Administrador Principal)'
                                  : isSuper
                                  ? 'Cuenta protegida (Superadmin)'
                                  : 'No puedes eliminar tu propia cuenta en sesión'
                              }
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Crear o Editar Gestor */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-600/10 text-blue-400">
                  {isEditing ? <Edit3 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {isEditing ? 'Editar Datos del Gestor' : 'Registrar Nuevo Gestor'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isEditing
                      ? 'Actualiza el nombre, correo, rol o cambia la contraseña.'
                      : 'Crea una nueva cuenta de acceso a la plataforma y app móvil.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
              {/* Nombre Completo */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nombre Completo del Gestor
                </label>
                <input
                  type="text"
                  required
                  placeholder="EJ. CARVAJAL MEDINA ALDO"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 uppercase transition-all"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Se recomienda en mayúsculas para coincidir exactamente con la cartera de créditos.
                </p>
              </div>

              {/* Correo Electrónico */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Correo Electrónico (Usuario de Login)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    placeholder="gestor@empresa.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value.toLowerCase())}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  />
                </div>
              </div>

              {/* Rol */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Rol en el Sistema
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                >
                  <option value="gestor">Gestor de Campo (App Móvil y Web)</option>
                  <option value="admin">Administrador (Control Total Web)</option>
                  <option value="telefonista">Telefonista (Cobranza Telefónica)</option>
                </select>
              </div>

              {/* Contraseña */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  {isEditing ? 'Nueva Contraseña (Opcional)' : 'Contraseña de Acceso'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required={!isEditing}
                    placeholder={isEditing ? 'Dejar en blanco para mantener la actual' : 'Ej. Gestor2026@'}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  />
                </div>
                {isEditing && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Solo llena este campo si deseas restablecer la contraseña del gestor.
                  </p>
                )}
              </div>

              {/* Botones de Acción */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isEditing ? 'Guardar Cambios' : 'Crear Gestor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Eliminar Gestor con Reasignación Segura */}
      {showDeleteModal && deletingGestor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Eliminar Gestor</h3>
                <p className="text-xs text-slate-400">
                  Esta acción eliminará la cuenta del usuario de la base de datos.
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-300">
                ¿Estás seguro de que deseas eliminar a{' '}
                <span className="font-bold text-white">{deletingGestor.gestor}</span> ({deletingGestor.email})?
              </p>

              {/* Alerta de Cuentas Asignadas */}
              {deletingGestor.cuentas_asignadas > 0 ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>Este gestor tiene {deletingGestor.cuentas_asignadas} cuentas asignadas activas</span>
                  </div>

                  {!isMasterOrSuper ? (
                    // Obligatorio para rol Admin regular
                    <div className="space-y-3 pt-1">
                      <div className="p-3 bg-slate-950/80 rounded-xl border border-amber-500/30 text-xs text-amber-300">
                        <p className="font-bold mb-1 flex items-center gap-1.5">
                          <span>⚠️ Requisito de Administrador:</span>
                        </p>
                        <p className="text-slate-300">
                          Para evitar cartera desatendida, es <strong>obligatorio</strong> reasignar todas las cuentas de este gestor a otro gestor activo antes de poder eliminarlo.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                          Reasignar cartera a otro gestor:
                        </label>
                        <select
                          value={targetReassignGestor}
                          onChange={(e) => setTargetReassignGestor(e.target.value)}
                          className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="">-- Selecciona el gestor receptor --</option>
                          {gestores
                            .filter((g) => g.id !== deletingGestor.id && g.rol === 'gestor')
                            .map((g) => (
                              <option key={g.id} value={g.gestor}>
                                {g.gestor} ({g.cuentas_asignadas} cuentas actuales)
                              </option>
                            ))}
                        </select>
                        {!targetReassignGestor && (
                          <p className="text-[11px] text-red-400 font-semibold mt-1.5">
                            * Debes seleccionar un gestor para habilitar la eliminación.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Opciones para Administrador Principal / Superadmin
                    <div className="space-y-3">
                      <p className="text-xs text-slate-300">
                        Elige qué deseas hacer con sus cuentas asignadas para no dejar cartera desatendida:
                      </p>

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="reassign_opt"
                            checked={reassignOption === 'unassign'}
                            onChange={() => setReassignOption('unassign')}
                            className="text-blue-600 focus:ring-0"
                          />
                          <span>Dejar cuentas en estado <strong>&quot;SIN ASIGNAR&quot;</strong></span>
                        </label>

                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="reassign_opt"
                            checked={reassignOption === 'reassign'}
                            onChange={() => setReassignOption('reassign')}
                            className="text-blue-600 focus:ring-0"
                          />
                          <span>Reasignar cartera a otro gestor activo:</span>
                        </label>
                      </div>

                      {reassignOption === 'reassign' && (
                        <select
                          value={targetReassignGestor}
                          onChange={(e) => setTargetReassignGestor(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          {gestores
                            .filter((g) => g.id !== deletingGestor.id)
                            .map((g) => (
                              <option key={g.id} value={g.gestor}>
                                {g.gestor} ({g.cuentas_asignadas} cuentas actuales)
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Este gestor no tiene cuentas activas asignadas actualmente.
                </p>
              )}

              {/* Botones */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={
                    deleting ||
                    (!isMasterOrSuper && (deletingGestor.cuentas_asignadas || 0) > 0 && (!targetReassignGestor || targetReassignGestor.trim() === ''))
                  }
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-all shadow-lg shadow-red-500/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Confirmar Eliminación</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
