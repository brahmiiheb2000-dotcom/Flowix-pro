import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, 
  Scan, 
  Package, 
  FileDown, 
  FileUp, 
  Trash2, 
  Edit2,
  CheckCircle2, 
  XCircle, 
  Plus, 
  Lock, 
  Unlock, 
  MapPin, 
  Settings,
  History,
  Archive,
  X,
  Database,
  Eye,
  FileCheck,
  List,
  Upload,
  RefreshCw,
  FileText,
  Mic,
  Camera,
  Check,
  Sparkles,
  CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { get, set, clear } from 'idb-keyval';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { Button } from '../UI';
import { Folder, Box, ManualEntry, Tab } from '../../types';

// --- CONSTANTS ---
const DEPOTS = ['S1', 'S2', 'S3'];
const EPIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
const TABLETTES = Array.from({ length: 300 }, (_, i) => String(i + 1));

// --- UTILS ---
const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

export const CentralizedInventory = () => {
  const [activeTab, setActiveTab] = useState<Tab>('pointage');
  const [folders, setFolders] = useState<Folder[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [archivalRules, setArchivalRules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [smartMode, setSmartMode] = useState(false);
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([]);

  // Stats
  const stats = useMemo(() => {
    let pointed = 0;
    let verified = 0;
    let pending = 0;

    for (let i = 0; i < folders.length; i++) {
      const s = folders[i].status;
      if (s === 'pointed') pointed++;
      else if (s === 'verified') verified++;
      else if (s === 'pending') pending++;
    }

    return {
      totalFolders: folders.length,
      pointed,
      verified,
      pending,
      boxesCount: boxes.length,
    };
  }, [folders, boxes]);

  // Initial Load
  useEffect(() => {
    const loadData = async () => {
      try {
        // First try indexedDB
        let storedFolders = await get('ci_folders_v2') || [];
        let storedBoxes = JSON.parse(localStorage.getItem('ci_boxes_v2') || '[]');
        const storedManual = await get('ci_manual_v2') || [];
        const lastTab = localStorage.getItem('ci_last_tab') as Tab;

        // Fetch from server as well
        try {
          const res = await fetch('/api/centralized-inventory');
          if (res.ok) {
            const serverData = await res.json();
            if (serverData.folders?.length > 0) {
              // Merge logic: server usually wins or we combine
              // For simplicity, if we have local data we keep it, but if local is empty we use server
              if (storedFolders.length === 0) {
                storedFolders = serverData.folders;
                storedBoxes = serverData.boxes;
              }
            }
          }
        } catch (serverErr) {
          console.error("Server fetch error:", serverErr);
        }

        // Fetch archival-rules
        await fetchArchivalRules();

        setFolders(storedFolders);
        setBoxes(storedBoxes);
        setManualEntries(storedManual);
        if (lastTab) setActiveTab(lastTab);
      } catch (err) {
        console.error("Storage error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const fetchArchivalRules = async () => {
    try {
      const rulesRes = await fetch('/api/archival-directory');
      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        setArchivalRules(rulesData);
      }
    } catch (rulesErr) {
      console.error("Rules fetch error:", rulesErr);
    }
  };

  // Save Data
  const saveTimeout = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (isLoading) return;
    
    // Debounce Save to prevent lag during rapid pointage
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      set('ci_folders_v2', folders).catch(err => console.error("IDB Save Error:", err));
    }, 1000);

    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [folders, isLoading]);

  useEffect(() => { if (!isLoading) localStorage.setItem('ci_boxes_v2', JSON.stringify(boxes)); }, [boxes, isLoading]);
  useEffect(() => { if (!isLoading) set('ci_manual_v2', manualEntries); }, [manualEntries, isLoading]);
  useEffect(() => { localStorage.setItem('ci_last_tab', activeTab); }, [activeTab]);

  return (
    <div className="flex flex-col h-full bg-brand-secondary text-slate-800 font-sans overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between bg-brand-primary z-10 sticky top-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/20">
            <Database size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white m-0 leading-none">Flowix <span className="text-brand-accent">Pro</span></h1>
            <p className="text-[9px] font-bold text-white/50 uppercase tracking-[0.2em] mt-1">Gestion d'Archivage Centralisée</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSmartMode(!smartMode)}
            className="px-5 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-2 transition-all"
          >
            <span>MODE INTELLIGENT: {smartMode ? 'ON' : 'OFF'}</span>
            <div className={cn("w-2 h-2 rounded-full", smartMode ? "bg-brand-accent shadow-[0_0_10px_#f97316]" : "bg-white/30")} />
          </button>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeTab === 'pointage' && (
            <PointageModule 
              key="p" 
              folders={folders} 
              setFolders={setFolders} 
              boxes={boxes.filter((b: Box) => b.isOpen)} 
              smartMode={smartMode}
              setSmartMode={setSmartMode}
              setBoxes={setBoxes}
            />
          )}
          {activeTab === 'boites' && (
            <BoitesModule 
              key="b" 
              boxes={boxes} 
              setBoxes={setBoxes}
              folders={folders} 
              setFolders={setFolders} 
            />
          )}
          {activeTab === 'inventaire' && (
            <InventaireModule 
              folders={folders} 
              boxes={boxes}
              setFolders={setFolders}
              archivalRules={archivalRules}
              onReloadRules={fetchArchivalRules}
            />
          )}
          {activeTab === 'localisation' && (
            <LocalisationModule 
              boxes={boxes} 
              setBoxes={setBoxes} 
              folders={folders}
              selectedBoxIds={selectedBoxIds}
              setSelectedBoxIds={setSelectedBoxIds}
            />
          )}
          {activeTab === 'import' && (
            <ImportModule 
              key="im" 
              folders={folders} 
              setFolders={setFolders} 
              setBoxes={setBoxes} 
            />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="h-20 bg-white border-t border-slate-200 px-6 flex items-center justify-center gap-3 pb-safe">
        <NavBtn active={activeTab === 'pointage'} icon={<Search size={22} />} label="Pointage" onClick={() => setActiveTab('pointage')} />
        <NavBtn active={activeTab === 'boites'} icon={<Package size={22} />} label="Boîtes" onClick={() => setActiveTab('boites')} />
        <NavBtn active={activeTab === 'localisation'} icon={<MapPin size={22} />} label="Localisation" onClick={() => setActiveTab('localisation')} />
        <NavBtn active={activeTab === 'inventaire'} icon={<List size={22} />} label="Inventaire" onClick={() => setActiveTab('inventaire')} />
        <NavBtn active={activeTab === 'import'} icon={<Upload size={22} />} label="Import" onClick={() => setActiveTab('import')} />
      </nav>
    </div>
  );
};

const StatSmall = ({ label, value, color }: any) => (
  <div className="flex flex-col items-center">
    <span className="text-[8px] font-black uppercase text-slate-400 tracking-tighter leading-none mb-0.5">{label}</span>
    <span className={cn("text-xs font-black", color)}>{value}</span>
  </div>
);

const NavBtn = ({ active, icon, label, onClick }: any) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center justify-center flex-1 h-14 rounded-2xl transition-all relative overflow-hidden",
      active ? "text-white" : "text-slate-400 hover:text-slate-600"
    )}
  >
    {active && <motion.div layoutId="nav-bg" className="absolute inset-0 bg-brand-primary -z-10" />}
    <div className={cn("transition-transform duration-300", active && "scale-110 -translate-y-0.5")}>
      {icon}
    </div>
    <span className={cn("text-[9px] font-black uppercase tracking-[0.15em] mt-1 transition-all", active ? "opacity-100" : "opacity-60")}>{label}</span>
  </button>
);

// --- MODULES ---

const PointageModule = ({ folders, setFolders, boxes, setBoxes, smartMode }: any) => {
  const [search, setSearch] = useState('');
  const [suggestedBox, setSuggestedBox] = useState<Box | null>(null);
  const [confirmModal, setConfirmModal] = useState<Folder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    let pointed = 0;
    for (let i = 0; i < folders.length; i++) {
      if (folders[i].status === 'pointed' || folders[i].status === 'verified') {
        pointed++;
      }
    }
    return {
      total: folders.length,
      pointed
    };
  }, [folders]);

  // Search match and suggestion memo
  const folderMap = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < folders.length; i++) {
      map.set(folders[i].reference.toUpperCase(), folders[i]);
    }
    return map;
  }, [folders]);

  const folder = useMemo(() => {
    const cleanRe = search.trim().toUpperCase();
    if (!cleanRe || cleanRe.length < 3) return null;
    return folderMap.get(cleanRe);
  }, [search, folderMap]);

  const liveMatchInfo = useMemo(() => {
    if (!folder) return null;

    let suggestion: Box | null = null;
    if (smartMode) {
      const dateStr = folder.dateCloture || '';
      const yearMatch = dateStr.match(/\d{4}/) || dateStr.match(/\/(\d{2})$/);
      let year = '';
      if (yearMatch) {
        year = yearMatch[0].length === 4 ? yearMatch[0] : `20${yearMatch[1]}`;
      }
      if (year) {
        suggestion = boxes.find((b: any) => b.number.includes(year) || b.title.includes(year)) || null;
      }
      if (!suggestion) {
        suggestion = boxes.find((b: any) => b.title.toLowerCase().includes('en cours')) || boxes[0] || null;
      }
    }

    return { folder, suggestion };
  }, [folder, smartMode, boxes]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Global key listener for Enter confirmation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && confirmModal) {
        e.preventDefault();
        validatePointage();
      }
      if (e.key === 'Escape' && confirmModal) {
        setConfirmModal(null);
        setSuggestedBox(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModal, suggestedBox]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (boxes.length === 0) {
      alert("BLOCAGE : Aucune boîte ouverte ! Veuillez ouvrir une boîte dans l'onglet Boîtes avant de commencer le pointage.");
      return;
    }
    if (!liveMatchInfo) return;

    if (smartMode && liveMatchInfo.suggestion) {
      setSuggestedBox(liveMatchInfo.suggestion);
      setConfirmModal(liveMatchInfo.folder);
    } else {
      setConfirmModal(liveMatchInfo.folder);
    }
  };

  const validatePointage = () => {
    if (!confirmModal || !suggestedBox) return;

    setFolders(folders.map((f: any) => 
      f.reference === confirmModal.reference 
        ? { ...f, status: 'pointed', boxNumber: suggestedBox.number, pointedAt: new Date().toISOString() } 
        : f
    ));

    setConfirmModal(null);
    setSuggestedBox(null);
    setSearch('');
    inputRef.current?.focus();
  };

  const handleReset = () => {
    if (window.confirm("Réinitialiser tous les pointages ?")) {
      setFolders(folders.map((f: any) => ({ 
        ...f, 
        status: 'pending', 
        boxNumber: '', 
        pointedAt: undefined, 
        verifiedAt: undefined 
      })));
    }
  };

  const handleExport = () => {
    const pointed = folders.filter((f: any) => f.status === 'pointed' || f.status === 'verified');
    if (pointed.length === 0) return alert("Aucun dossier pointé.");

    const wb = XLSX.utils.book_new();
    const data = pointed.map((f: any) => ({
      Référence: f.reference,
      'Date de Clôture': f.dateCloture,
      Boîte: f.boxNumber || 'N/A',
      Statut: f.status === 'verified' ? 'Vérifié' : 'Pointé',
      'Date Pointage': f.pointedAt ? format(new Date(f.pointedAt), 'dd/MM/yyyy HH:mm') : ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Pointage");
    XLSX.writeFile(wb, `Export_Pointage_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  return (
    <div className="h-full flex flex-col pt-12 px-12 bg-brand-secondary overflow-y-auto pb-40">
      <div className="max-w-7xl mx-auto w-full">
        {/* Stats & Actions Row */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-sm font-medium text-slate-400">Total : <span className="text-slate-900 font-black ml-1">{stats.total}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand-accent shadow-[0_0_8px_#f97316]" />
              <span className="text-sm font-medium text-slate-400">Pointés : <span className="text-brand-primary font-black ml-1">{stats.pointed}</span></span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-red-100 text-red-500 text-[11px] font-black uppercase tracking-widest hover:bg-red-50 transition-all"
            >
              <Trash2 size={16} /> Réinitialiser
            </button>
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-slate-100 text-slate-600 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              <FileDown size={16} /> Exporter
            </button>
          </div>
        </div>

        {/* Search Bar Container */}
        <div className="flex items-center gap-4 mb-20 w-full">
          <form onSubmit={handleSearch} className="flex-1 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={24} />
            </div>
            <input 
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-3xl pl-16 pr-14 py-6 text-2xl font-black text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-brand-primary transition-all shadow-xl shadow-slate-200"
              placeholder="Rechercher une référence..."
            />
            {search && (
              <button 
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={20} />
              </button>
            )}
          </form>

          <button className="w-20 h-20 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-brand-primary hover:bg-slate-50 transition-all shadow-sm">
            <Mic size={28} />
          </button>
          <button className="w-20 h-20 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 hover:text-brand-primary hover:bg-slate-50 transition-all shadow-sm">
            <Camera size={28} />
          </button>
        </div>

        {/* Result Area */}
        <div className="w-full min-h-[400px] bg-white border border-slate-200 rounded-[3rem] p-16 shadow-2xl shadow-slate-200/50 relative">
          <AnimatePresence mode="wait">
            {boxes.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                key="no-boxes"
                className="h-full flex flex-col items-center justify-center p-20 text-center"
              >
                <div className="w-24 h-24 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-8 animate-pulse">
                  <Lock size={48} />
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">AUCUNE BOÎTE OUVERTE</h3>
                <p className="text-slate-500 font-medium max-w-sm">Veuillez créer ou ouvrir une boîte dans l'onglet "Gestion des Boîtes" avant de commencer le pointage.</p>
              </motion.div>
            ) : !liveMatchInfo ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                key="ready"
                className="h-full flex flex-col items-center justify-center"
              >
                <div className="w-24 h-24 bg-brand-secondary rounded-full flex items-center justify-center text-brand-primary/20 mb-6">
                  <Scan size={48} />
                </div>
                <p className="text-slate-300 font-bold uppercase tracking-[0.2em] text-sm">Prêt à scanner</p>
              </motion.div>
            ) : (
              <motion.div 
                key={liveMatchInfo.folder.reference}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] block mb-2">RÉFÉRENCE DOSSIER</label>
                    <h2 className="text-4xl font-black text-slate-800 tracking-tight">{liveMatchInfo.folder.reference}</h2>
                  </div>
                  {smartMode && liveMatchInfo.suggestion && (
                    <div className="bg-brand-primary text-white p-6 rounded-3xl shadow-xl shadow-slate-200">
                      <p className="text-[10px] font-black opacity-80 uppercase tracking-widest mb-2">BOÎTE SUGGÉRÉE</p>
                      <p className="text-3xl font-black">{liveMatchInfo.suggestion.number}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] block mb-2">DATE DE CLÔTURE</label>
                  <h3 className="text-3xl font-black text-slate-700 tracking-tight">{liveMatchInfo.folder.dateCloture || ''}</h3>
                </div>

                <div className="pt-10 border-t border-slate-50">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6 italic opacity-80 underline underline-offset-4">
                    {smartMode ? "MODE INTELLIGENT : APPUYEZ SUR ENTRÉE POUR VALIDER" : "OU AFFECTER MANUELLEMENT :"}
                  </p>
                  <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                    {boxes.slice(0, 5).map((box: any) => (
                      <button 
                        key={box.id}
                        onClick={() => {
                          setFolders((prev: any) => prev.map((f: any) => 
                            f.reference === liveMatchInfo.folder.reference 
                              ? { ...f, status: 'pointed', boxNumber: box.number, pointedAt: new Date().toISOString() } 
                              : f
                          ));
                          setSearch('');
                          inputRef.current?.focus();
                        }}
                        className="px-10 py-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-xl hover:border-brand-primary transition-all text-sm font-black text-slate-700 flex items-center justify-center min-w-[120px] whitespace-nowrap"
                      >
                        {box.number}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Suggestion / Confirmation Modal (Optional now since UI changed, but keeping logic for smart mode if needed) */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden text-center p-10"
            >
              <div className="w-16 h-16 bg-brand-secondary text-brand-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
                <FileCheck size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">VALIDER LE POINTAGE</h3>
              <p className="text-slate-400 text-sm font-medium mb-8">
                Réf: <span className="text-slate-800 font-bold">{confirmModal.reference}</span>
              </p>

              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Assigner à</p>
                {suggestedBox ? (
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-black text-brand-primary">{suggestedBox.number}</span>
                    <span className="text-xs font-bold text-slate-500 uppercase">{suggestedBox.title}</span>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-slate-400">Boîte non définie</p>
                )}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => { setConfirmModal(null); setSuggestedBox(null); inputRef.current?.focus(); }}
                  className="flex-1 py-4 bg-slate-100 rounded-2xl text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all"
                >
                  Annuler
                </button>
                <button 
                  onClick={validatePointage}
                  className="flex-1 py-4 bg-brand-primary rounded-2xl text-white font-black uppercase text-xs shadow-xl shadow-slate-200 hover:opacity-90 transition-all"
                >
                  Confirmer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const BoitesModule = ({ boxes, setBoxes, folders, setFolders }: any) => {
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const [newBoxName, setNewBoxName] = useState('');
  const [verifInput, setVerifInput] = useState('');
  const [detailsPage, setDetailsPage] = useState(1);
  const detailsItemsPerPage = 20;

  const handleCreate = () => {
    if (!newBoxName.trim()) return;
    const box: Box = {
      id: generateId(),
      number: newBoxName.trim(),
      title: 'Boîte Archivage',
      isOpen: true,
      depot: '', travee: '', tablette: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setBoxes([...boxes, box]);
    setNewBoxName('');
  };

  const handleReset = () => {
    if (window.confirm("Réinitialiser toutes les boîtes ?")) {
      setBoxes([]);
      setFolders(folders.map((f: any) => ({ ...f, status: 'pending', boxNumber: '', pointedAt: undefined, verifiedAt: undefined })));
    }
  };

  const deleteBox = (id: string) => {
    if (window.confirm("Supprimer cette boîte ?")) {
      const box = boxes.find((b: any) => b.id === id);
      if (box) {
        setFolders(folders.map((f: any) => f.boxNumber === box.number ? { ...f, status: 'pending', boxNumber: '', pointedAt: undefined } : f));
      }
      setBoxes(boxes.filter((b: any) => b.id !== id));
    }
  };

  const boxFolders = useMemo(() => 
    selectedBox ? folders.filter((f: any) => f.boxNumber === selectedBox.number) : []
  , [selectedBox, folders]);

  const stats = useMemo(() => {
    if (!selectedBox) return { count: 0, verified: 0 };
    let count = 0;
    let verified = 0;
    for (let i = 0; i < folders.length; i++) {
        if (folders[i].boxNumber === selectedBox.number) {
            count++;
            if (folders[i].status === 'verified') verified++;
        }
    }
    return { count, verified };
  }, [selectedBox, folders]);

  const paginatedBoxFolders = useMemo(() => {
    const start = (detailsPage - 1) * detailsItemsPerPage;
    return boxFolders.slice(start, start + detailsItemsPerPage);
  }, [boxFolders, detailsPage]);

  const detailsTotalPages = Math.ceil(boxFolders.length / detailsItemsPerPage);

  const handleVerify = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!verifInput || !selectedBox) return;

    const match = boxFolders.find((f: any) => f.reference.endsWith(verifInput) || f.reference === verifInput);
    if (match) {
      setFolders(folders.map((f: any) => 
        f.reference === match.reference ? { ...f, status: 'verified', verifiedAt: new Date().toISOString() } : f
      ));
      setVerifInput('');
    } else {
      alert("Aucun dossier correspondant dans cette boîte.");
    }
  };

  const removeFolder = (ref: string) => {
    setFolders(folders.map((f: any) => 
      f.reference === ref ? { ...f, status: 'pending', boxNumber: '', pointedAt: undefined, verifiedAt: undefined } : f
    ));
  };

  return (
    <div className="h-full flex flex-col pt-12 px-12 bg-brand-secondary overflow-y-auto pb-40">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header & Search */}
        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm mb-12 relative overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-secondary text-brand-primary rounded-xl flex items-center justify-center">
                <Package size={24} />
              </div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Gestion des Boîtes</h2>
            </div>
            <button onClick={handleReset} className="flex items-center gap-2 text-red-500 text-[11px] font-black uppercase tracking-widest hover:text-red-700 transition-all">
              <Trash2 size={16} /> Réinitialiser
            </button>
          </div>

          <div className="flex gap-4">
            <input 
              value={newBoxName}
              onChange={e => setNewBoxName(e.target.value)}
              className="flex-1 bg-brand-secondary/50 border border-slate-100 rounded-2xl px-8 py-5 text-lg font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-brand-primary transition-all"
              placeholder="Nom de la nouvelle boîte (ex: 2025)"
            />
            <button 
              onClick={handleCreate}
              className="px-10 bg-brand-primary text-white rounded-2xl font-black uppercase text-sm shadow-xl shadow-slate-200 hover:opacity-90 transition-all flex items-center gap-2"
            >
              <Plus size={20} /> Créer
            </button>
          </div>
        </div>

        {/* Box List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {boxes.map((box: Box) => {
            const count = folders.filter((f: any) => f.boxNumber === box.number).length;
            return (
              <motion.div 
                key={box.id}
                className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm hover:shadow-xl hover:border-brand-primary transition-all group"
              >
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-3xl font-black text-brand-primary mb-1 leading-none">{box.number}</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1 font-mono tracking-tighter">{format(new Date(box.createdAt!), 'dd/MM/yyyy')}</p>
                  </div>
                  <div className="bg-brand-secondary border border-brand-primary/10 px-4 py-1.5 rounded-full">
                    <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">{count} dossiers</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-6 border-t border-brand-secondary">
                  <button onClick={() => { setDetailsPage(1); setSelectedBox(box); }} className="p-3 text-slate-400 hover:text-brand-primary hover:bg-brand-secondary rounded-xl transition-all">
                    <Eye size={22} />
                  </button>
                  <button onClick={() => setBoxes(boxes.map((b: any) => b.id === box.id ? { ...b, isOpen: !b.isOpen } : b))} className="p-3 text-slate-400 hover:text-brand-primary hover:bg-brand-secondary rounded-xl transition-all">
                    {box.isOpen ? <Unlock size={22} /> : <Lock size={22} />}
                  </button>
                  <button onClick={() => deleteBox(box.id)} className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                    <Trash2 size={22} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedBox && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-10 flex items-start justify-between">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-brand-secondary text-brand-primary rounded-2xl flex items-center justify-center border border-brand-primary/10">
                      <Package size={28} />
                    </div>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tight">Boîte : {selectedBox.number}</h3>
                  </div>
                  <div className="flex gap-3">
                    <div className="bg-brand-secondary px-4 py-1.5 rounded-full border border-brand-primary/10">
                      <span className="text-[11px] font-black text-brand-primary uppercase tracking-widest">{stats.count} dossiers</span>
                    </div>
                    <div className="bg-brand-primary/10 px-4 py-1.5 rounded-full">
                      <span className="text-[11px] font-black text-brand-primary uppercase tracking-widest">{stats.verified} vérifiés</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedBox(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-all">
                  <X size={32} />
                </button>
              </div>

              {/* Verification Input */}
              <div className="px-10 pb-10">
                <form onSubmit={handleVerify} className="flex gap-4">
                  <div className="flex-1 relative">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary">
                      <CheckCircle2 size={24} />
                    </div>
                    <input 
                      value={verifInput}
                      onChange={e => setVerifInput(e.target.value)}
                      className="w-full bg-brand-secondary/50 border border-slate-100 rounded-2xl pl-16 pr-6 py-6 text-xl font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-brand-primary transition-all"
                      placeholder="Vérification (3 derniers chiffres)..."
                    />
                  </div>
                  <button 
                    type="submit"
                    className="px-14 bg-brand-primary text-white rounded-2xl font-black uppercase text-sm shadow-xl shadow-slate-200 hover:opacity-90 transition-all font-sans"
                  >
                    Valider
                  </button>
                </form>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto px-10 pb-10">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest">Référence</th>
                      <th className="py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Date Clôture</th>
                      <th className="py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">Vérifié</th>
                      <th className="py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginatedBoxFolders.map((f: any) => (
                      <tr key={f.reference} className={cn("group transition-colors", f.status === 'verified' ? "bg-brand-primary/5" : "hover:bg-slate-50/50")}>
                        <td className="py-6">
                          <span className={cn("text-xl font-black", f.status === 'verified' ? "text-brand-primary" : "text-slate-800")}>
                            {f.reference}
                          </span>
                        </td>
                        <td className="py-6 text-center">
                          <span className="text-sm font-bold text-slate-500">{f.dateCloture || ''}</span>
                        </td>
                        <td className="py-6 flex justify-center">
                          <div className={cn(
                            "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all",
                            f.status === 'verified' ? "border-brand-primary bg-brand-primary text-white" : "border-slate-100 bg-white"
                          )}>
                            {f.status === 'verified' && <CheckCircle2 size={24} />}
                          </div>
                        </td>
                        <td className="py-6 text-right">
                          <button 
                            onClick={() => removeFolder(f.reference)}
                            className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 size={20} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Detail Modal Pagination */}
              {detailsTotalPages > 1 && (
                <div className="px-10 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Page {detailsPage} sur {detailsTotalPages}
                  </p>
                  <div className="flex gap-2">
                    <button 
                      disabled={detailsPage === 1}
                      onClick={() => setDetailsPage(p => Math.max(1, p - 1))}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-500 disabled:opacity-30"
                    >
                      Précédent
                    </button>
                    <button 
                      disabled={detailsPage === detailsTotalPages}
                      onClick={() => setDetailsPage(p => Math.min(detailsTotalPages, p + 1))}
                      className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const LocalisationModule = ({ boxes, setBoxes, folders, selectedBoxIds, setSelectedBoxIds }: any) => {
  const [locForm, setLocForm] = useState({ depot: 'S1', travee: 'A', tablette: '1' });
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const filteredBoxes = useMemo(() => {
    return boxes.filter((b: any) => 
      b.number.toLowerCase().includes(search.toLowerCase())
    );
  }, [boxes, search]);

  const totalPages = Math.ceil(filteredBoxes.length / itemsPerPage);
  const paginatedBoxes = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredBoxes.slice(start, start + itemsPerPage);
  }, [filteredBoxes, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const toggleSelect = (id: string) => {
    setSelectedBoxIds((prev: string[]) => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedBoxIds.length === filteredBoxes.length) {
      setSelectedBoxIds([]);
    } else {
      setSelectedBoxIds(filteredBoxes.map((b: any) => b.id));
    }
  };

  const applyLocalisation = () => {
    if (selectedBoxIds.length === 0) return alert("Sélectionnez au moins une boîte.");
    
    setBoxes(boxes.map((b: any) => 
      selectedBoxIds.includes(b.id) 
        ? { ...b, ...locForm, updatedAt: new Date().toISOString() } 
        : b
    ));
    
    alert(`Localisation appliquée à ${selectedBoxIds.length} boîtes.`);
    setSelectedBoxIds([]);
  };

  return (
    <div className="h-full flex flex-col p-8 bg-brand-secondary overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-brand-primary border-none m-0 tracking-tight uppercase">LOCALISATION DES BOÎTES</h2>
          <p className="text-slate-400 text-sm font-medium">Affectation des emplacements physiques</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 w-64 focus:outline-none focus:border-brand-primary transition-all"
              placeholder="Rechercher une boîte..."
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 overflow-hidden">
        {/* Selection Area */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col overflow-hidden">
          <div className="px-8 py-5 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button 
                onClick={selectAll}
                className={cn(
                  "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                  selectedBoxIds.length > 0 && selectedBoxIds.length === filteredBoxes.length 
                    ? "bg-brand-primary border-brand-primary text-white" 
                    : "border-slate-200 bg-white"
                )}
              >
                {selectedBoxIds.length > 0 && <Check size={14} />}
              </button>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {selectedBoxIds.length} sélectionnés sur {filteredBoxes.length}
              </span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paginatedBoxes.map((box: any) => (
                <div 
                  key={box.id}
                  onClick={() => toggleSelect(box.id)}
                  className={cn(
                    "p-5 rounded-2xl border-2 transition-all cursor-pointer relative group",
                    selectedBoxIds.includes(box.id) 
                      ? "border-brand-primary bg-brand-secondary" 
                      : "border-slate-50 bg-white hover:border-slate-200"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="text-lg font-black text-slate-800">{box.number}</h4>
                      <div className="flex items-center gap-2 mt-2">
                        <MapPin size={10} className="text-slate-400" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                          {box.depot ? `${box.depot} - ${box.travee} - T${box.tablette}` : "NON LOCALISÉ"}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                       <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const bf = folders.filter((f: any) => f.boxNumber === box.number);
                          const msg = bf.length > 0 
                            ? `Contenu de la boîte ${box.number} :\n\n` + bf.slice(0, 50).map((f: any) => `- ${f.reference} (${f.status})`).join('\n') + (bf.length > 50 ? '\n... et d\'autres' : '')
                            : `La boîte ${box.number} est vide.`;
                          alert(msg);
                        }}
                        className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-secondary rounded-lg transition-all"
                        title="Voir contenu"
                      >
                        <List size={16} />
                      </button>
                      {selectedBoxIds.includes(box.id) && (
                        <div className="w-6 h-6 bg-brand-primary text-white rounded-full flex items-center justify-center">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredBoxes.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 py-20">
                <Archive size={64} className="mb-4 opacity-20" />
                <p className="font-bold uppercase tracking-widest text-sm">Aucune boîte trouvée</p>
              </div>
            )}
          </div>
          
          {/* Loc Pagination */}
          {totalPages > 1 && (
            <div className="px-8 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Page {currentPage} / {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1 hover:bg-white rounded-lg disabled:opacity-20"><RefreshCw size={14} className="rotate-180" /></button>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1 hover:bg-white rounded-lg disabled:opacity-20"><RefreshCw size={14} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Action Panel */}
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-lg">
            <h3 className="text-lg font-black text-slate-900 mb-6 uppercase tracking-tight">Affectation de Masse</h3>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dépôt</label>
                <div className="grid grid-cols-3 gap-2">
                  {DEPOTS.map(d => (
                    <button 
                      key={d}
                      onClick={() => setLocForm({ ...locForm, depot: d })}
                      className={cn(
                        "py-3 rounded-xl text-xs font-black transition-all border-2",
                        locForm.depot === d ? "bg-brand-primary text-white border-brand-primary" : "bg-slate-50 text-slate-500 border-slate-50 hover:border-slate-200"
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Épie (Travée)</label>
                <div className="grid grid-cols-5 gap-2">
                  {EPIES.map(e => (
                    <button 
                      key={e}
                      onClick={() => setLocForm({ ...locForm, travee: e })}
                      className={cn(
                        "py-2 rounded-lg text-xs font-black transition-all border-2",
                        locForm.travee === e ? "bg-brand-primary text-white border-brand-primary" : "bg-slate-50 text-slate-500 border-slate-50 hover:border-slate-200"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tablette (1-300)</label>
                <select 
                  value={locForm.tablette}
                  onChange={e => setLocForm({ ...locForm, tablette: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-50 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-brand-primary transition-all custom-scrollbar"
                >
                  {TABLETTES.map(t => (
                    <option key={t} value={t}>Tablette {t}</option>
                  ))}
                </select>
              </div>

              <div className="pt-6">
                <button 
                  onClick={applyLocalisation}
                  disabled={selectedBoxIds.length === 0}
                  className={cn(
                    "w-full py-5 rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-3",
                    selectedBoxIds.length > 0 
                      ? "bg-slate-900 text-white shadow-slate-200 hover:bg-black" 
                      : "bg-slate-100 text-slate-300 cursor-not-allowed"
                  )}
                >
                  <MapPin size={20} /> Appliquer ({selectedBoxIds.length})
                </button>
              </div>
            </div>
          </div>

          <div className="bg-brand-primary rounded-[2.5rem] p-8 text-white shadow-xl shadow-brand-primary/20 relative overflow-hidden group">
            <div className="relative z-10">
              <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-4">Aide</h4>
              <p className="text-xs font-bold text-white/90 leading-relaxed shadow-sm">
                Appuyez sur une boîte pour la sélectionner, puis choisissez ses nouvelles coordonnées GPS de stockage à droite.
              </p>
            </div>
            <Search className="absolute -bottom-8 -right-8 text-white/10 group-hover:scale-110 transition-transform duration-700" size={140} />
          </div>
        </div>
      </div>
    </div>
  );
};

const InventaireModule = ({ folders, boxes, setFolders, archivalRules = [], onReloadRules }: any) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pointed' | 'verified'>('all');
  const itemsPerPage = 50;

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [massSelectedRuleId, setMassSelectedRuleId] = useState('');
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [addRuleTargetFolder, setAddRuleTargetFolder] = useState<any | null>(null);
  const [newRule, setNewRule] = useState({
    reference: '',
    title: '',
    direction: '',
    docType: 'Dossier',
    activeYears: 5,
    semiActiveYears: 5,
    finalDisposition: 'EL',
    support: 'Papier',
    retentionTrigger: "Chambre",
    category: 'Général',
    isCritical: false
  });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (addRuleTargetFolder && isAddingRule && !editingRuleId) {
      setNewRule({
        reference: '',
        title: addRuleTargetFolder.intitule || '',
        direction: addRuleTargetFolder.direction || '',
        docType: 'Dossier',
        activeYears: 5,
        semiActiveYears: 5,
        finalDisposition: 'EL',
        support: 'Papier',
        retentionTrigger: "Chambre",
        category: 'Général',
        isCritical: false
      });
    }
  }, [addRuleTargetFolder, isAddingRule, editingRuleId]);

  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette règle de conservation pour de bon ? Les dossiers qui y sont liés dans l'inventaire perdront leur lien.")) return;
    try {
      const res = await fetch(`/api/archival-directory/${ruleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setToast({ message: "Règle de conservation supprimée avec succès !", type: 'success' });
        if (onReloadRules) {
          await onReloadRules();
        }
        // Also clear out folders in active view that have this rule
        setFolders((prev: any[]) => prev.map((f: any) => {
          if (String(f.ruleId) === String(ruleId)) {
            return { ...f, ruleId: undefined, direction: undefined, intitule: undefined };
          }
          return f;
        }));
      } else {
        const err = await res.json();
        setToast({ message: "Erreur lors de la suppression: " + (err.error || res.statusText), type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: "Erreur réseau: " + err.message, type: 'error' });
    }
  };

  const handleEditRule = (ruleId: string) => {
    const matchedRule = archivalRules.find((r: any) => String(r.id) === String(ruleId));
    if (!matchedRule) return;
    setEditingRuleId(String(ruleId));
    setNewRule({
      reference: matchedRule.reference || '',
      title: matchedRule.title || '',
      direction: matchedRule.direction || '',
      docType: matchedRule.docType || 'Dossier',
      activeYears: matchedRule.activeYears || 5,
      semiActiveYears: matchedRule.semiActiveYears || 5,
      finalDisposition: matchedRule.finalDisposition || 'EL',
      support: matchedRule.support || 'Papier',
      retentionTrigger: matchedRule.retentionTrigger || 'Chambre',
      category: matchedRule.category || 'Général',
      isCritical: matchedRule.isCritical || false
    });
    setIsAddingRule(true);
  };

  const handleSaveQuickRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.reference || !newRule.title || !newRule.direction) {
      setToast({ message: "Veuillez remplir tous les champs obligatoires (Code, Intitulé, Direction).", type: 'error' });
      return;
    }
    try {
      const url = editingRuleId ? `/api/archival-directory/${editingRuleId}` : '/api/archival-directory';
      const method = editingRuleId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule)
      });
      if (res.ok) {
        const data = await res.json();
        
        if (editingRuleId) {
          setToast({ message: "Règle de conservation mise à jour avec succès !", type: 'success' });
          setFolders((prevFolders: any[]) => prevFolders.map((f: any) => {
            if (String(f.ruleId) === String(editingRuleId)) {
              return {
                ...f,
                direction: newRule.direction,
                intitule: newRule.title
              };
            }
            return f;
          }));
        } else {
          setToast({ message: "Règle de conservation ajoutée avec succès !", type: 'success' });
          // Automatically link this rule to the active folder
          if (addRuleTargetFolder) {
            setFolders((prevFolders: any[]) => prevFolders.map((f: any) => {
              if (f.reference === addRuleTargetFolder.reference) {
                return {
                  ...f,
                  ruleId: data.id,
                  direction: newRule.direction,
                  intitule: newRule.title
                };
              }
              return f;
            }));
          }
        }
        
        // Reload global rules
        if (onReloadRules) {
          await onReloadRules();
        }
        
        // Reset states
        setIsAddingRule(false);
        setEditingRuleId(null);
        setAddRuleTargetFolder(null);
      } else {
        const errData = await res.json();
        setToast({ message: "Erreur lors de l'enregistrement : " + (errData.error || res.statusText), type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: "Erreur réseau : " + err.message, type: 'error' });
    }
  };

  const handleRuleChange = (folderRef: string, ruleIdVal: string) => {
    const matchedRule = archivalRules.find((r: any) => String(r.id) === String(ruleIdVal));
    setFolders((prevFolders: any[]) => {
      return prevFolders.map((f: any) => {
        if (f.reference === folderRef) {
          return {
            ...f,
            ruleId: matchedRule ? matchedRule.id : undefined,
            direction: matchedRule ? matchedRule.direction : undefined,
            intitule: matchedRule ? matchedRule.title : undefined
          };
        }
        return f;
      });
    });
  };

  const handleApplyRuleToAll = () => {
    if (!massSelectedRuleId) {
      setToast({ message: "Veuillez d'abord sélectionner une règle DUA globale.", type: 'error' });
      return;
    }
    const matchedRule = archivalRules.find((r: any) => String(r.id) === String(massSelectedRuleId));
    if (!matchedRule) {
      setToast({ message: "Règle globale introuvable.", type: 'error' });
      return;
    }

    const pointedCount = folders.filter((f: any) => f.status === 'pointed').length;
    if (pointedCount === 0) {
      setFolders((prevFolders: any[]) => prevFolders.map((f: any) => ({
        ...f,
        ruleId: matchedRule.id,
        direction: matchedRule.direction,
        intitule: matchedRule.title
      })));
      setToast({ message: `Règle "${matchedRule.reference}" appliquée à tous les dossiers archivés !`, type: 'success' });
      return;
    }

    setFolders((prevFolders: any[]) => prevFolders.map((f: any) => {
      if (f.status === 'pointed') {
        return {
          ...f,
          ruleId: matchedRule.id,
          direction: matchedRule.direction,
          intitule: matchedRule.title
        };
      }
      return f;
    }));
    setToast({ message: `Règle "${matchedRule.reference}" appliquée aux ${pointedCount} dossiers pointés !`, type: 'success' });
  };

  const handleValidateAllPointed = () => {
    const pointedFolders = folders.filter((f: any) => f.status === 'pointed');
    if (pointedFolders.length === 0) {
      alert("Aucun dossier n'est actuellement au statut 'Pointé'.");
      return;
    }

    if (window.confirm(`Voulez-vous valider et marquer comme 'Stocké & Vérifié' les ${pointedFolders.length} dossiers actuellement au statut 'Pointé' ?`)) {
      setFolders((prevFolders: any[]) => prevFolders.map((f: any) => {
        if (f.status === 'pointed') {
          return {
            ...f,
            status: 'verified',
            verifiedAt: new Date().toISOString()
          };
        }
        return f;
      }));
      alert(`Les ${pointedFolders.length} dossiers pointés ont été validés et marqués comme vérifiés !`);
    }
  };

  const getBoxLoc = (boxNumber: string) => {
    const box = boxes.find((b: any) => b.number === boxNumber);
    if (!box || !box.depot) return 'Non localisé';
    return `${box.depot} - ${box.travee} - T${box.tablette}`;
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filteredFolders = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    
    // Apply filters
    let result = folders;
    
    if (statusFilter === 'pointed') {
      result = result.filter((f: any) => f.status === 'pointed');
    } else if (statusFilter === 'verified') {
      result = result.filter((f: any) => f.status === 'verified');
    }

    if (q) {
      result = result.filter((f: any) => {
        const refMatch = f.reference.toLowerCase().includes(q);
        const boxMatch = f.boxNumber && f.boxNumber.toLowerCase().includes(q);
        const statusMatch = (f.status === 'verified' && 'vérifié'.includes(q)) || 
                          (f.status === 'pointed' && 'pointé'.includes(q)) ||
                          (f.status === 'pending' && 'en attente'.includes(q));
        
        // Match location info
        let locMatch = false;
        if (f.boxNumber) {
          const loc = getBoxLoc(f.boxNumber).toLowerCase();
          locMatch = loc.includes(q);
        }
        
        return refMatch || boxMatch || locMatch || statusMatch;
      });
    }

    return result;
  }, [folders, debouncedSearch, boxes, statusFilter]);

  const totalPages = Math.ceil(filteredFolders.length / itemsPerPage);
  const paginatedFolders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredFolders.slice(start, start + itemsPerPage);
  }, [filteredFolders, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const exportInventory = () => {
    const wb = XLSX.utils.book_new();
    const data = filteredFolders.map((f: any) => ({
      Référence: f.reference,
      'Date Clôture': f.dateCloture,
      'Numéro Boîte': f.boxNumber || 'N/A',
      Localisation: f.boxNumber ? getBoxLoc(f.boxNumber) : 'Non affecté',
      Statut: f.status === 'verified' ? 'Vérifié' : (f.status === 'pointed' ? 'Pointé' : 'En attente')
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Inventaire");
    XLSX.writeFile(wb, `Inventaire_Global_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const finalizeInventory = async () => {
    const pointedCount = folders.filter((f: any) => f.status === 'pointed' || f.status === 'verified').length;
    const totalCount = folders.length;
    
    if (window.confirm(`Voulez-vous valider et clôturer cet inventaire ?\n\nProgression: ${pointedCount}/${totalCount} dossiers (${Math.round(pointedCount/totalCount*100)}%)\n\nLes données seront stockées définitivement dans la base de l'application.`)) {
      try {
        const res = await fetch('/api/centralized-inventory/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folders, boxes })
        });

        if (res.ok) {
          alert("Inventaire validé et stocké sur le serveur avec succès !");
        } else {
          const errData = await res.json();
          alert("Erreur lors du stockage : " + (errData.error || res.statusText));
        }
      } catch (err: any) {
        alert("Erreur de connexion : " + err.message);
      }
    }
  };

  return (
    <div className="h-full flex flex-col p-8 bg-brand-secondary overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-brand-primary border-none m-0 tracking-tight uppercase">INVENTAIRE GÉNÉRAL</h2>
          <p className="text-slate-400 text-sm font-medium">Base de données archiviste synchronisée</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200">
            <button 
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                statusFilter === 'all' ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20" : "text-slate-400 hover:text-brand-primary"
              )}
            >
              Tous
            </button>
            <button 
              onClick={() => setStatusFilter('pointed')}
              className={cn(
                "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                statusFilter === 'pointed' ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20" : "text-slate-400 hover:text-brand-primary"
              )}
            >
              Pointés
            </button>
            <button 
              onClick={() => setStatusFilter('verified')}
              className={cn(
                "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                statusFilter === 'verified' ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/20" : "text-slate-400 hover:text-brand-primary"
              )}
            >
              Validés
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 w-80 focus:outline-none focus:border-brand-primary shadow-sm transition-all"
              placeholder="Réf, Boîte, Loc ou Statut..."
            />
          </div>
          <button 
            onClick={finalizeInventory}
            className="flex items-center gap-2 px-6 py-3 bg-brand-accent text-white rounded-2xl text-xs font-black hover:opacity-90 transition-all shadow-xl shadow-brand-accent/20"
          >
            <FileCheck size={18} /> VALIDER INVENTAIRE
          </button>
          <button 
            onClick={exportInventory}
            className="flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-2xl text-xs font-black hover:opacity-90 transition-all shadow-xl shadow-brand-primary/20"
          >
            <FileDown size={18} /> {statusFilter !== 'all' ? `EXTRAIRE ${statusFilter === 'pointed' ? 'POINTÉS' : 'VALIDÉS'} (XLS)` : 'EXPORTER XLS'}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Section Actions de Masse & Harmonisation */}
        <div className="bg-slate-50/50 border-b border-slate-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans shadow-inner">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary">
              <Sparkles size={18} className="animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-950 uppercase tracking-tight">Outils d'Harmonisation de Masse</h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Configurez et validez votre inventaire en un clic</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* 1. Select Rule for All */}
            <div className="flex items-center gap-2 bg-white border border-slate-250 rounded-2xl px-3.5 py-2.5 shadow-sm max-w-sm">
              <select
                value={massSelectedRuleId}
                onChange={(e) => setMassSelectedRuleId(e.target.value)}
                className="bg-transparent text-xs font-extrabold text-slate-700 focus:outline-none cursor-pointer w-[200px]"
              >
                <option value="">-- Choisir Règle globale --</option>
                {Array.from(new Set(archivalRules.map((r: any) => r.direction))).filter(Boolean).map((dirName: any) => (
                  <optgroup key={dirName} label={dirName}>
                    {archivalRules.filter((r: any) => r.direction === dirName).map((rule: any) => (
                      <option key={rule.id} value={String(rule.id)}>
                        {rule.reference} - {rule.title} ({rule.activeYears} ans)
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyRuleToAll}
                className="bg-brand-primary hover:bg-brand-primary/95 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                title="Appliquer cette règle à tous les dossiers pointés de l'inventaire"
              >
                Appliquer Partout
              </button>
            </div>

            {/* divider */}
            <div className="hidden md:block w-px h-8 bg-slate-200" />

            {/* 2. Validate pointed */}
            <button
              type="button"
              onClick={handleValidateAllPointed}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-emerald-100 transition-all shrink-0"
              title="Valider l'intégralité des dossiers pointés et les marquer comme Stockés & Vérifiés"
            >
              <CheckSquare size={14} strokeWidth={2.5} />
              Valider les pointés ({folders.filter((f: any) => f.status === 'pointed').length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white z-10 shadow-sm font-sans">
              <tr className="bg-brand-secondary/50 border-b border-slate-100">
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Référence</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fin Clôture</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">N° Boîte</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Règles & DUA (Calendrier)</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Localisation Archivage</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-sans">
              {paginatedFolders.map((f: any, i: number) => (
                <tr key={i} className="hover:bg-brand-secondary/30 transition-colors group">
                  <td className="px-8 py-5">
                    <span className="text-sm font-black text-slate-800">{f.reference}</span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-sm font-bold text-slate-500">{f.dateCloture || '---'}</span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    {f.boxNumber ? (
                      <span className="px-3 py-1 bg-brand-secondary text-brand-primary rounded-lg text-[10px] font-black uppercase tracking-widest border border-brand-primary/10">
                        {f.boxNumber}
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-slate-300 italic uppercase">Libre</span>
                    )}
                  </td>
                  <td className="px-8 py-5 text-slate-800">
                    <div className="flex items-center gap-1.5 w-full max-w-[340px]">
                      <select
                        value={f.ruleId ? String(f.ruleId) : ""}
                        onChange={(e) => handleRuleChange(f.reference, e.target.value)}
                        className="flex-1 min-w-0 bg-slate-50/85 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary transition-all cursor-pointer"
                      >
                        <option value="">-- Choisir Règle DUA --</option>
                        {Array.from(new Set(archivalRules.map((r: any) => r.direction))).filter(Boolean).map((dirName: any) => (
                          <optgroup key={dirName} label={dirName}>
                            {archivalRules.filter((r: any) => r.direction === dirName).map((rule: any) => (
                              <option key={rule.id} value={String(rule.id)}>
                                {rule.reference} - {rule.title} ({rule.activeYears} ans DUA)
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      
                      {f.ruleId && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEditRule(f.ruleId)}
                            className="w-8 h-8 rounded-xl bg-amber-500/10 hover:bg-amber-550 text-amber-600 hover:text-white flex items-center justify-center transition-all shrink-0 shadow-sm"
                            title="Modifier cette règle de conservation"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(String(f.ruleId))}
                            className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-550 text-red-600 hover:text-white flex items-center justify-center transition-all shrink-0 shadow-sm"
                            title="Supprimer cette règle"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setAddRuleTargetFolder(f);
                          setIsAddingRule(true);
                        }}
                        className="w-8 h-8 rounded-xl bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-white flex items-center justify-center transition-all shrink-0 shadow-sm"
                        title="Ajouter une nouvelle règle de conservation (DUA)"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border",
                        f.boxNumber ? "bg-brand-secondary text-brand-primary border-brand-primary/10" : "bg-slate-50 text-slate-300 border-slate-100 shadow-inner"
                       )}>
                        <MapPin size={14} />
                      </div>
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest",
                        f.boxNumber ? "text-brand-primary" : "text-slate-300"
                      )}>
                        {f.boxNumber ? getBoxLoc(f.boxNumber) : 'Non localisé'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right flex-nowrap shrink-0">
                    <div className="flex justify-end">
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-[0.05em] px-3 py-1 rounded-full flex items-center gap-1.5",
                        f.status === 'verified' ? "bg-green-100 text-green-700 border border-green-200" :
                        f.status === 'pointed' ? "bg-brand-secondary text-brand-primary border border-brand-primary/10" :
                        "bg-slate-100 text-slate-400 border border-slate-200"
                      )}>
                        {f.status === 'verified' && <Check size={10} strokeWidth={4} />}
                        {f.status === 'verified' ? 'Stocké & Vérifié' : 
                         f.status === 'pointed' ? 'Pointé' : 'En Attente'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredFolders.length === 0 && (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-300 p-20">
              <Archive size={64} className="mb-4 opacity-20" />
              <p className="font-black uppercase tracking-widest text-sm">Aucun dossier trouvé</p>
            </div>
          )}
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-8 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Page {currentPage} sur {totalPages}
            </p>
            <div className="flex gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black text-slate-500 disabled:opacity-30 uppercase tracking-widest hover:bg-slate-100 transition-all"
              >
                Précédent
              </button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-4 py-2 bg-slate-900 border border-slate-900 rounded-xl text-[10px] font-black text-white disabled:opacity-30 uppercase tracking-widest hover:bg-black transition-all"
              >
                Suivant
              </button>
            </div>
          </div>
        )}

        <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Affichage de {filteredFolders.length} dossiers archivés
            </p>
            <div className="flex gap-4">
              <StatSmall label="VERIFIÉS" value={folders.filter((f: any) => f.status === 'verified').length} color="text-brand-primary" />
              <StatSmall label="NON-TRAITÉS" value={folders.filter((f: any) => f.status === 'pending').length} color="text-slate-400" />
            </div>
        </div>
      </div>

      {/* Modal Quick Add Rule */}
      <AnimatePresence>
        {isAddingRule && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden p-10 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center">
                    {editingRuleId ? <Edit2 size={22} /> : <Plus size={24} strokeWidth={2.5} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-tight uppercase">
                      {editingRuleId ? 'Modifier la Règle' : 'Nouvelle Règle DUA'}
                    </h3>
                    <p className="text-slate-400 text-xs font-medium">
                      {editingRuleId ? 'Mise à jour de la règle de conservation' : 'Ajout direct pour l\'inventaire en cours'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => { setIsAddingRule(false); setAddRuleTargetFolder(null); setEditingRuleId(null); }}
                  className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveQuickRule} className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Direction (Obligatoire)</label>
                  <input 
                    type="text"
                    required
                    value={newRule.direction}
                    onChange={e => setNewRule({...newRule, direction: e.target.value})}
                    placeholder="Ex: MAEE, SG, etc."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Code / Réf (Obligatoire)</label>
                    <input 
                      type="text"
                      required
                      value={newRule.reference}
                      onChange={e => setNewRule({...newRule, reference: e.target.value})}
                      placeholder="Ex: INF-01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Type Document</label>
                    <input 
                      type="text"
                      value={newRule.docType || ''}
                      onChange={e => setNewRule({...newRule, docType: e.target.value})}
                      placeholder="Ex: Dossiers"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Intitulé / Titre (Obligatoire)</label>
                  <input 
                    type="text"
                    required
                    value={newRule.title}
                    onChange={e => setNewRule({...newRule, title: e.target.value})}
                    placeholder="Ex: Dossiers de maintenance"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">DUA Courant (ans)</label>
                    <input 
                      type="number"
                      required
                      min="0"
                      value={newRule.activeYears}
                      onChange={e => setNewRule({...newRule, activeYears: parseInt(e.target.value) || 0})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">DUA Interm. (ans)</label>
                    <input 
                      type="number"
                      required
                      min="0"
                      value={newRule.semiActiveYears}
                      onChange={e => setNewRule({...newRule, semiActiveYears: parseInt(e.target.value) || 0})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Sort Final</label>
                    <select 
                      value={newRule.finalDisposition}
                      onChange={e => setNewRule({...newRule, finalDisposition: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    >
                      <option value="EL">Élimination (EL)</option>
                      <option value="CT">Conservation (CT)</option>
                      <option value="CR">Tri / Échantillonnage (CR)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Support de Conservation</label>
                    <select 
                      value={newRule.support}
                      onChange={e => setNewRule({...newRule, support: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    >
                      <option value="Papier">Papier</option>
                      <option value="Numerique">Numérique</option>
                      <option value="Hybride">Hybride</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 pt-6">
                  <button 
                    type="button"
                    onClick={() => { setIsAddingRule(false); setAddRuleTargetFolder(null); setEditingRuleId(null); }}
                    className="flex-1 py-4 bg-slate-100 rounded-2xl text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all font-sans"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-brand-primary rounded-2xl text-white font-black uppercase text-xs shadow-xl shadow-brand-primary/20 hover:opacity-90 transition-all font-sans"
                  >
                    {editingRuleId ? 'Enregistrer' : 'Confirmer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Alert */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={`fixed bottom-24 right-8 z-[100] px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-3 border font-sans text-xs font-black uppercase tracking-wider backdrop-blur-md ${
              toast.type === 'error' 
                ? 'bg-red-50 text-red-700 border-red-200' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {toast.type === 'error' ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ImportModule = ({ folders, setFolders, setBoxes }: any) => {
  const [resetModal, setResetModal] = useState(false);
  const [status, setStatus] = useState<{ loading: boolean, msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus({ loading: true, msg: 'Initialisation du moteur...' });

    try {
      // Use Web Worker - Vite specific way to ensure it works in all environments
      const worker = new Worker(new URL('../../workers/excel.worker.ts', import.meta.url), { type: 'module' });
      
      worker.onerror = (err) => {
        console.error("Worker generic error:", err);
        setStatus(null);
        alert("Erreur critique du worker. Le fichier est peut-être trop volumineux pour la mémoire disponible.");
      };

      worker.onmessage = (event) => {
        const { success, folders: newFolders, error } = event.data;
        if (success) {
          console.log("Worker success, received folders:", newFolders.length);
          setFolders(newFolders);
          setStatus(null);
          alert(`${newFolders.length} dossiers importés avec succès.`);
        } else {
          console.error("Worker returned failure:", error);
          alert("Erreur lors de l'analyse : " + error);
          setStatus(null);
        }
        worker.terminate();
      };

      setStatus({ loading: true, msg: 'Chargement du fichier (' + (file.size / (1024 * 1024)).toFixed(2) + ' MB)...' });
      worker.postMessage({ file });
    } catch (err) {
      console.error("Worker creation failed:", err);
      setStatus(null);
      alert("Impossible de démarrer le moteur d'importation.");
    }
  };

  const handleReset = (type: 'pointing' | 'all') => {
    if (type === 'pointing') {
      setFolders(folders.map((f: any) => ({ ...f, status: 'pending', boxNumber: '', pointedAt: undefined, verifiedAt: undefined })));
      alert("Pointages réinitialisés.");
    } else {
      setFolders([]);
      setBoxes([]);
      void clear();
      localStorage.removeItem('ci_boxes_v2');
      alert("Système entièrement vidé.");
    }
    setResetModal(false);
  };

  const exportPointed = () => {
    const pointed = folders.filter((f: any) => f.status === 'pointed' || f.status === 'verified');
    if (pointed.length === 0) return alert("Aucun dossier pointé.");

    const wb = XLSX.utils.book_new();
    const data = pointed.map((f: any) => ({
      Référence: f.reference,
      'Date de Clôture': f.dateCloture,
      Boîte: f.boxNumber || 'N/A',
      Statut: f.status === 'verified' ? 'Vérifié' : 'Pointé',
      'Date Pointage': f.pointedAt ? format(new Date(f.pointedAt), 'dd/MM/yyyy HH:mm') : ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Pointage");
    XLSX.writeFile(wb, `Export_Pointage_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  return (
    <div className="h-full flex flex-col p-6 items-center pt-20 bg-brand-secondary overflow-y-auto">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 items-start mb-20">
        
        <div className="space-y-8">
           <div className="space-y-2">
              <h2 className="text-3xl font-black text-brand-primary border-none m-0 tracking-tight uppercase">PARAMÈTRES & SOURCE</h2>
              <p className="text-slate-400 text-sm font-medium">Gestion du flux de données maître</p>
           </div>

           <div className="p-8 bg-white border border-slate-200 rounded-[2.5rem] shadow-sm relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 bg-brand-secondary text-brand-primary rounded-2xl flex items-center justify-center border border-brand-primary/10">
                     <FileText size={24} />
                   </div>
                   <div>
                     <h3 className="text-lg font-black text-slate-800">Exportation Données</h3>
                     <p className="text-xs font-medium text-slate-400">Générer les listes finales</p>
                   </div>
                </div>
                <button 
                  onClick={exportPointed}
                  className="w-full py-4 bg-brand-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-200 hover:opacity-90 transition-all font-sans"
                >
                  Exporter dossiers pointés
                </button>
              </div>
           </div>

           <div className="p-8 bg-red-50/50 border border-red-100 rounded-[2.5rem] relative overflow-hidden">
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                   <Trash2 size={20} />
                 </div>
                 <h4 className="text-xs font-black text-red-600 uppercase tracking-widest">Zone de Maintenance</h4>
              </div>
              <button 
                onClick={() => setResetModal(true)}
                className="w-full py-3 bg-white border border-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all"
              >
                Réinitialisation Globale
              </button>
           </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-[3rem] p-4 flex flex-col h-[400px] relative overflow-hidden">
             <div 
               className="w-full h-full rounded-[2.5rem] bg-brand-secondary/50 border border-brand-primary/10 flex flex-col items-center justify-center p-10 cursor-pointer hover:bg-brand-secondary transition-all group"
               onClick={() => fileRef.current?.click()}
             >
                {status?.loading ? (
                  <div className="flex flex-col items-center">
                    <RefreshCw className="text-brand-primary animate-spin mb-4" size={48} />
                    <p className="text-sm font-black text-brand-primary uppercase tracking-widest text-center">{status.msg}</p>
                  </div>
                ) : (
                  <>
                    <div className="w-20 h-20 bg-white rounded-3xl shadow-xl shadow-slate-200/50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                       <FileUp className="text-brand-primary" size={32} />
                    </div>
                    <p className="text-xl font-black text-slate-800 tracking-tight">IMPORTER EXCEL</p>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">{folders.length > 0 ? "Actualiser le fichier" : "Dépôt ou clic (.xlsx / .csv)"}</p>
                    <div className="mt-8 flex items-center gap-3">
                       <div className="flex -space-x-2">
                         <div className="w-8 h-8 rounded-full border-2 border-white bg-brand-primary flex items-center justify-center text-white"><CheckCircle2 size={14} /></div>
                         <div className="w-8 h-8 rounded-full border-2 border-white bg-brand-primary" />
                       </div>
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Détection Réf & Date auto</span>
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleImport} />
             </div>
          </div>

          <div className="p-8 bg-brand-primary rounded-[2.5rem] text-white shadow-xl shadow-brand-primary/20 relative overflow-hidden group">
             <div className="relative z-10">
                <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-2">Base de données</p>
                <div className="text-3xl font-black mb-1 text-white">{folders.length.toLocaleString()}</div>
                <p className="text-xs font-bold text-white/70">Dossiers chargés en mémoire</p>
             </div>
             <Database className="absolute -bottom-8 -right-8 text-white/10 group-hover:scale-110 transition-transform duration-700" size={160} />
          </div>
        </div>

        {/* Preview Table */}
        {folders.length > 0 && (
          <div className="md:col-span-2 bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm mt-8">
            <div className="px-10 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Aperçu du fichier (10 premières lignes)</h3>
              <span className="text-[10px] font-bold text-brand-primary bg-brand-secondary px-3 py-1 rounded-full uppercase border border-brand-primary/10">Données Importées</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-50">
                    <th className="px-10 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Référence</th>
                    <th className="px-10 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest">Date de Clôture</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {folders.slice(0, 10).map((f: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-10 py-5 text-sm font-black text-slate-800">{f.reference}</td>
                      <td className="px-10 py-5 text-sm font-bold text-slate-500">{f.dateCloture || <span className="opacity-20 italic">Non spécifiée</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Reset Modal */}
      <AnimatePresence>
        {resetModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 text-center">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl p-10">
               <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                 <RefreshCw size={32} />
               </div>
               <h3 className="text-xl font-black text-slate-900 mb-4 border-none m-0">RÉINITIALISATION</h3>
               <p className="text-sm font-medium text-slate-400 mb-8 leading-relaxed">Choisissez le niveau de nettoyage souhaité pour votre base de données locale.</p>
               
               <div className="space-y-3">
                 <button 
                   onClick={() => handleReset('pointing')}
                   className="w-full py-4 border-2 border-slate-100 rounded-2xl text-slate-700 text-xs font-black uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-all"
                 >
                   Vider uniquement le pointage
                 </button>
                 <button 
                   onClick={() => handleReset('all')}
                   className="w-full py-4 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-100 hover:bg-red-700 transition-all"
                 >
                   Tout supprimer (Total)
                 </button>
                 <button onClick={() => setResetModal(false)} className="w-full py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Fermer</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
