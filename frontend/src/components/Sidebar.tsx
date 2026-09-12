'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  MessageSquare, 
  CalendarCheck, 
  BarChart3,
  Map,
  LogOut,
  Archive,
  Upload,
  Route
} from 'lucide-react';
import { useEffect, useState } from 'react';

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean, onClose?: () => void }) {
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const userInfo = localStorage.getItem('user_info');
    if (userInfo) {
      try {
        const user = JSON.parse(userInfo);
        const userEmail = user.email?.trim().toLowerCase();
        
        const superRole = 
          user.rol?.toLowerCase() === 'superadmin' || 
          user.gestor?.toUpperCase() === 'SUPERADMIN';

        const isAdminUser = 
          user.rol?.toLowerCase() === 'admin' || 
          superRole ||
          userEmail === 'ing.ballesteros16@gmail.com' ||
          user.gestor?.toUpperCase() === 'ADMINISTRADOR GLOBAL' ||
          user.gestor?.toUpperCase() === 'SUPERADMIN';
        
        setIsAdmin(isAdminUser);
        setIsSuperAdmin(superRole);
      } catch (e) {
        console.error("Error parsing user info", e);
      }
    }
  }, [pathname]);

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
    { icon: Users, label: 'Socios', href: '/socios' },
    { icon: CreditCard, label: 'Créditos', href: '/creditos' },
    { icon: MessageSquare, label: 'Gestiones', href: '/gestiones' },
    { icon: CalendarCheck, label: 'Promesas', href: '/promesas' },
    { icon: BarChart3, label: 'Reportes', href: '/reportes' },
    { icon: Route, label: 'Rutas Diarias', href: '/admin/rutas', adminOnly: true },
    { icon: Archive, label: 'Histórico', href: '/historico', adminOnly: true },
    { icon: Upload, label: 'Importar Avales', href: '/admin/importar', adminOnly: true },
    { icon: CreditCard, label: 'Renta Mensual', href: '/admin/renta', superOnly: true },
  ];

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    window.location.href = '/login';
  };

  if (!isMounted || pathname === '/login') return null;

  try {
    return (
      <>
        {/* Overlay para móviles */}
        {isOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden"
            onClick={onClose}
          />
        )}

        <div className={`
          w-64 bg-slate-900 text-white h-screen fixed left-0 top-0 flex flex-col shadow-2xl z-40
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}>
          <div className="p-8 flex items-center justify-between">
            <h1 className="text-xl font-black tracking-tighter text-white">
              GC Cobranza
              <span className="block text-[10px] text-blue-400 font-bold tracking-widest uppercase mt-1">
                Fintech Edition
              </span>
            </h1>
            {/* Botón de cerrar para móvil */}
            <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
               <LogOut size={20} className="rotate-180" />
            </button>
          </div>
          
          <nav className="flex-1 mt-6 overflow-y-auto">
            {menuItems.map((item, index) => {
              if (item.adminOnly && !isAdmin) return null;
              if (item.superOnly && !isSuperAdmin) return null;
              
              return (
                <div key={item.href}>
                  <Link 
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center px-6 py-3 transition-colors gap-3 ${
                      pathname === item.href 
                        ? 'bg-blue-600/10 text-blue-400 border-r-4 border-blue-600' 
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon size={20} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                  
                  {index === 0 && isAdmin && (
                    <Link 
                      href="/admin/mapa"
                      onClick={onClose}
                      className={`flex items-center px-6 py-3 transition-colors gap-3 ${
                        pathname === '/admin/mapa' 
                          ? 'bg-blue-600/10 text-blue-400 border-r-4 border-blue-600' 
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Map size={20} />
                      <span className="font-medium">Mapa Gestores</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
          
          <div className="p-6 border-t border-slate-800">
            <button 
              onClick={logout}
              className="flex items-center text-slate-400 hover:text-white transition-colors gap-3 w-full"
            >
              <LogOut size={20} />
              <span className="font-medium">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </>
    );
  } catch (err) {
    console.error("Sidebar render error:", err);
    return null;
  }
}
