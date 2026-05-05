import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Logo } from './components/Logo';
import { LoginForm } from './components/auth/LoginForm';
import { AgentDashboard } from './components/agent/AgentDashboard';
import { ArchivistDashboard } from './components/archivist/ArchivistDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { DemandeurDashboard } from './components/demandeur/DemandeurDashboard';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, User as UserIcon, FileText, Clock, Layers, FileStack, BarChart3, RefreshCw, Inbox, Send, Bell, Check } from 'lucide-react';
import { Button } from './components/UI';
import { cn } from './lib/utils';
import { api } from './lib/api';

import { RemoteRequestForm } from './components/RemoteRequestForm';

type UserRole = 'Admin' | 'Agent' | 'Archivist' | 'Demandeur';

interface AuthContextType {
  user: any | null;
  role: UserRole | null;
  profile: any | null;
  loading: boolean;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  role: null, 
  profile: null, 
  loading: true,
  switchRole: () => {} 
});

export const useAuth = () => useContext(AuthContext);

interface SidebarLinkProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function SidebarLink({ icon, label, active, onClick }: SidebarLinkProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
        active 
          ? "bg-green-50 text-green-700 shadow-sm shadow-green-100" 
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      <span className={cn(active ? "text-green-600" : "text-slate-400")}>
        {icon}
      </span>
      {label}
    </button>
  );
}

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);

  const [remoteRequests, setRemoteRequests] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<'dashboard' | 'remote'>('dashboard');
  const [notification, setNotification] = useState<{message: string, type: 'info' | 'success'} | null>(null);

  const lastRemoteCount = useRef(0);
  const lastInternalCount = useRef(0);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const splashTimer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(splashTimer);
  }, []);

  // Initial Auth Check
  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const { user: backendUser } = await api.get('/api/me');
        if (!isMounted) return;

        if (backendUser) {
          setUser(backendUser);
          setRole(backendUser.role);
          setProfile(backendUser);
          
          // Initial data fetch
          if (['Admin', 'Agent', 'Archivist'].includes(backendUser.role)) {
            try {
              const [remoteData, internalData] = await Promise.all([
                api.get('/api/remote-requests'),
                api.get('/api/requests')
              ]);
              const remotes = remoteData.filter((r: any) => r.status === 'En attente');
              const internals = internalData.filter((r: any) => r.status === 'pending');
              setRemoteRequests(remotes);
              setPendingRequests(internals);
              lastRemoteCount.current = remotes.length;
              lastInternalCount.current = internals.length;
            } catch (e) {
              console.error("Initial badge fetch failed", e);
            }
          }
        }
      } catch (err) {
        console.error("Auth check failed", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkAuth();
    return () => { isMounted = false; };
  }, []); // Only once on mount

  // Polling for badges and notifications
  useEffect(() => {
    if (!user || !['Admin', 'Agent', 'Archivist'].includes(role || '')) return;

    let isMounted = true;
    const interval = setInterval(() => {
      Promise.all([
        api.get('/api/remote-requests'),
        api.get('/api/requests')
      ]).then(([remoteData, internalData]) => {
        if (!isMounted) return;
        
        const remotes = remoteData.filter((r: any) => r.status === 'En attente');
        const internals = internalData.filter((r: any) => r.status === 'pending');

        if (remotes.length > lastRemoteCount.current && (role === 'Agent' || role === 'Admin')) {
           setNotification({ 
             message: `Nouvelle demande reçue (${remotes.length - lastRemoteCount.current})`, 
             type: 'info' 
           });
        }
        
        if (internals.length > lastInternalCount.current && (role === 'Archivist' || role === 'Admin')) {
           setNotification({ 
             message: `Nouveau dossier à signer (${internals.length - lastInternalCount.current})`, 
             type: 'success' 
           });
        }

        setRemoteRequests(remotes);
        setPendingRequests(internals);
        lastRemoteCount.current = remotes.length;
        lastInternalCount.current = internals.length;
      }).catch(err => {
        if (err.message !== 'Failed to fetch') {
          console.error("Badge polling error", err);
        }
      });
    }, 20000); // 20s instead of 10s

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user?.email, role]); // Depend on stable values

  const switchRole = async (newRole: UserRole) => {
    // Session is handled by cookie, but we can update UI role if local state allows
    // In a real app we'd call an API to update the token or DB
    setRole(newRole);
  };

  const handleSignOut = async () => {
    try {
      await api.post('/api/logout', {});
      setUser(null);
      setRole(null);
      setProfile(null);
      window.location.reload(); // Hard reset
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  const pathname = window.location.pathname;

  if (pathname === '/demande-distance') {
    return <RemoteRequestForm />;
  }

  const remotePendingCount = remoteRequests.length;
  const internalPendingCount = pendingRequests.length;

  if (showSplash) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Logo size={48} className="scale-150" />
        </motion.div>
        <motion.div 
          className="mt-12 h-1 w-48 bg-gray-100 rounded-full overflow-hidden"
          initial={{ width: 0 }}
          animate={{ width: 192 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        >
          <motion.div 
            className="h-full bg-green-500"
            animate={{ x: [-192, 192] }}
            transition={{ repeat: Infinity, duration: 1 }}
          />
        </motion.div>
        <p className="mt-4 text-gray-400 font-medium tracking-widest text-xs uppercase">Enterprise Archive Solutions</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, role, profile, loading, switchRole }}>
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-green-100 selection:text-green-900">
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -50, x: '-50%' }}
              animate={{ opacity: 1, y: 20, x: '-50%' }}
              exit={{ opacity: 0, y: -50, x: '-50%' }}
              className={cn(
                "fixed top-4 left-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border min-w-[300px]",
                notification.type === 'success' ? "bg-green-600 text-white border-green-500" : "bg-blue-600 text-white border-blue-500"
              )}
            >
              <div className="bg-white/20 p-2 rounded-xl">
                {notification.type === 'success' ? <Check size={20} /> : <Bell size={20} />}
              </div>
              <p className="font-bold text-sm flex-1">{notification.message}</p>
              <button onClick={() => setNotification(null)} className="text-white/50 hover:text-white">
                <LogOut size={16} className="rotate-90" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-white to-slate-50"
            >
              <LoginForm />
            </motion.div>
          ) : (
            <div className="flex flex-col h-screen overflow-hidden">
              {/* Clean Top Header */}
              <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-30 shrink-0">
                <div className="flex items-center gap-8">
                  <Logo size={20} />
                  
                  <nav className="hidden md:flex items-center gap-1">
                    <button
                      onClick={() => setActiveView('dashboard')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                        activeView === 'dashboard' ? "bg-green-50 text-green-700" : "text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      Tableau de bord
                    </button>
                    {(role === 'Admin' || role === 'Agent') && (
                      <button
                        onClick={() => setActiveView('remote')}
                        className={cn(
                          "px-4 py-2 rounded-xl text-sm font-bold transition-all relative",
                          activeView === 'remote' ? "bg-green-50 text-green-700" : "text-slate-500 hover:bg-slate-50"
                        )}
                      >
                        Demandes Reçues
                        {remotePendingCount > 0 && (
                          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
                        )}
                      </button>
                    )}
                  </nav>
                </div>

                <div className="flex items-center gap-4">
                  {/* Role Switcher Popover simple */}
                  <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                    {(['Admin', 'Agent', 'Archivist', 'Demandeur'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => switchRole(r)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                          role === r 
                            ? "bg-white text-green-600 shadow-sm" 
                            : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        {r === 'Demandeur' ? 'Client' : r}
                      </button>
                    ))}
                  </div>

                  <div className="h-8 w-px bg-slate-200 mx-2" />

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block text-right">
                      <p className="text-xs font-bold text-slate-800 truncate max-w-[120px]">{profile?.displayName || user.email}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{role}</p>
                    </div>
                    <button 
                      onClick={handleSignOut}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <LogOut size={20} />
                    </button>
                  </div>
                </div>
              </header>

              {/* Main Workspace - Full Width */}
              <main className="flex-1 p-4 lg:p-6 overflow-y-auto custom-scrollbar bg-slate-50">
                <div className="w-full">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={role + activeView}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                    >
                      {role === 'Agent' && <AgentDashboard initialTab={activeView === 'remote' ? 'remote' : 'new'} />}
                      {role === 'Archivist' && <ArchivistDashboard />}
                      {role === 'Admin' && <AdminDashboard initialTab={activeView === 'remote' ? 'requests' : 'stats'} />}
                      {role === 'Demandeur' && <DemandeurDashboard />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </main>
            </div>
          )}
        </AnimatePresence>
      </div>
    </AuthContext.Provider>
  );
}
