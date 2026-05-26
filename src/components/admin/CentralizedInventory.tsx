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
  CheckSquare,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { get, set, clear } from 'idb-keyval';
import { format } from 'date-fns';
import { cn } from '../../lib/utils';
import { Button } from '../UI';
import { Folder, Box, ManualEntry, Tab } from '../../types';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';

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

  // Helper Merge Functions
  const mergeFolders = (local: Folder[], server: any[]): Folder[] => {
    if (!server || server.length === 0) return local;
    if (!local || local.length === 0) return server.map(s => ({
      ...s,
      status: s.status || 'pending'
    })) as Folder[];

    const localMap = new Map<string, Folder>();
    for (const f of local) {
      if (f && f.reference) {
        localMap.set(f.reference, f);
      }
    }

    const merged: Folder[] = [];
    const handledRefs = new Set<string>();

    for (const s of server) {
      if (!s || !s.reference) continue;
      handledRefs.add(s.reference);

      const l = localMap.get(s.reference);
      if (!l) {
        merged.push({
          ...s,
          status: s.status || 'pending'
        });
      } else {
        // Status precedence: verified (3) > pointed (2) > pending (1)
        const getWeight = (st?: string) => {
          if (st === 'verified') return 3;
          if (st === 'pointed') return 2;
          return 1;
        };

        const weightL = getWeight(l.status);
        const weightS = getWeight(s.status);

        if (weightS > weightL) {
          merged.push({
            ...s,
            status: s.status || 'pending'
          });
        } else if (weightL > weightS) {
          merged.push(l);
        } else {
          // Equal weight, choose the one with rule helper fields if exists
          if (s.ruleId && !l.ruleId) {
            merged.push({
              ...s,
              status: s.status || 'pending'
            });
          } else {
            merged.push(l);
          }
        }
      }
    }

    // Add any local items not on server
    for (const l of local) {
      if (l && l.reference && !handledRefs.has(l.reference)) {
        merged.push(l);
      }
    }

    return merged;
  };

  const mergeBoxes = (local: Box[], server: any[]): Box[] => {
    if (!server || server.length === 0) return local;
    if (!local || local.length === 0) return server as Box[];

    const localMap = new Map<string, Box>();
    for (const b of local) {
      const key = b.id || b.number;
      if (key) {
        localMap.set(key, b);
      }
    }

    const merged: Box[] = [];
    const handledKeys = new Set<string>();

    for (const s of server) {
      const key = s.id || s.number;
      if (!key) continue;
      handledKeys.add(key);

      const l = localMap.get(key);
      if (!l) {
        merged.push(s as Box);
      } else {
        merged.push({
          ...l,
          ...s
        } as Box);
      }
    }

    // Add local boxes not on server
    for (const l of local) {
      const key = l.id || l.number;
      if (key && !handledKeys.has(key)) {
        merged.push(l);
      }
    }

    return merged;
  };

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
          const serverData = await api.get('/api/centralized-inventory');
          if (serverData && serverData.folders?.length > 0) {
            // Merge logic: server usually wins or we combine
            storedFolders = mergeFolders(storedFolders, serverData.folders);
            storedBoxes = mergeBoxes(storedBoxes, serverData.boxes);
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
      const rulesData = await api.get('/api/archival-directory');
      setArchivalRules(rulesData);
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
              archivalRules={archivalRules}
            />
          )}
          {activeTab === 'boites' && (
            <BoitesModule 
              key="b" 
              boxes={boxes} 
              setBoxes={setBoxes}
              folders={folders} 
              setFolders={setFolders} 
              archivalRules={archivalRules}
              setActiveTab={setActiveTab}
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
              setActiveTab={setActiveTab}
            />
          )}
          {activeTab === 'import' && (
            <ImportModule 
              key="im" 
              folders={folders} 
              setFolders={setFolders} 
              setBoxes={setBoxes} 
              archivalRules={archivalRules}
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

const PointageModule = ({ folders, setFolders, boxes, setBoxes, smartMode, archivalRules = [] }: any) => {
  const [search, setSearch] = useState('');
  const [suggestedBox, setSuggestedBox] = useState<Box | null>(null);
  const [confirmModal, setConfirmModal] = useState<Folder | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<string>('');
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const availableDirections = useMemo(() => {
    const dirs = new Set<string>();
    (folders || []).forEach((f: any) => {
      if (f.direction) {
        dirs.add(f.direction.trim());
      }
    });
    (archivalRules || []).forEach((r: any) => {
      if (r.direction) {
        dirs.add(r.direction.trim());
      }
    });
    return Array.from(dirs).filter(Boolean).sort();
  }, [folders, archivalRules]);

  const filteredRules = useMemo(() => {
    if (!selectedDirection) return [];
    return (archivalRules || []).filter((r: any) => r.direction === selectedDirection);
  }, [selectedDirection, archivalRules]);

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

    if (liveMatchInfo.folder.status === 'pointed' || liveMatchInfo.folder.status === 'verified') {
      alert(`⚠️ BLOCAGE : Le dossier avec la référence "${liveMatchInfo.folder.reference}" est DÉJÀ POINTÉ et affecté à la Boîte : "${liveMatchInfo.folder.boxNumber || 'N/A'}" !`);
      return;
    }

    if (smartMode && liveMatchInfo.suggestion) {
      setSuggestedBox(liveMatchInfo.suggestion);
      setConfirmModal(liveMatchInfo.folder);
    } else {
      setConfirmModal(liveMatchInfo.folder);
    }
  };

  const validatePointage = () => {
    if (!confirmModal || !suggestedBox) return;

    setFolders((prev: any) => prev.map((f: any) => {
      if (f.reference === confirmModal.reference) {
        const activeRule = archivalRules.find((ru: any) => String(ru.id) === String(selectedRuleId));
        let updatedFields: any = {};
        if (selectedDirection) {
          updatedFields.direction = selectedDirection;
        }
        if (activeRule) {
          const ruleActive = parseInt(String(activeRule.activeYears || 0));
          const ruleSemi = parseInt(String(activeRule.semiActiveYears || 0));
          const totalDua = ruleActive + ruleSemi;
          
          const dateStr = f.dateCloture || format(new Date(), 'dd/MM/yyyy');
          const yearMatch = dateStr.match(/\d{4}/) || dateStr.match(/\/(\d{2})$/);
          let year = new Date().getFullYear();
          if (yearMatch) {
            year = yearMatch[0].length === 4 ? parseInt(yearMatch[0]) : 2000 + parseInt(yearMatch[1]);
          }
          const expiryDate = `31/12/${year + totalDua}`;
          
          updatedFields.codeDua = activeRule.reference;
          updatedFields.ruleId = activeRule.id;
          updatedFields.category = activeRule.category || activeRule.docType || 'Autre';
          updatedFields.expiryDate = expiryDate;
          updatedFields.archivalStatus = 'Active';
        }
        return {
          ...f,
          ...updatedFields,
          status: 'pointed',
          boxNumber: suggestedBox.number,
          pointedAt: new Date().toISOString()
        };
      }
      return f;
    }));

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
        // We preserve direction & rules unless users explicitly clear them
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
      Direction: f.direction || 'N/A',
      'Règle CC/DUA': f.codeDua || 'N/A',
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
        <div className="flex items-center justify-between mb-8">
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
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-red-100 text-red-500 text-[11px] font-black uppercase tracking-widest hover:bg-red-50 transition-all cursor-pointer"
            >
              <Trash2 size={16} /> Réinitialiser
            </button>
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-slate-100 text-slate-600 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer"
            >
              <FileDown size={16} /> Exporter
            </button>
          </div>
        </div>

        {/* Direction & Document Type Selector */}
        <div className="bg-white border border-slate-200/80 rounded-[2rem] p-8 shadow-md mb-8 grid grid-cols-1 md:grid-cols-2 gap-6 relative overflow-hidden">
          {/* Accent decoration */}
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-brand-primary to-emerald-500" />
          
          {/* Direction selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
              <label className="text-xs font-black text-slate-600 uppercase tracking-widest font-sans">
                1. Direction / Service de Pointage
              </label>
            </div>
            <select
              value={selectedDirection}
              onChange={(e) => {
                setSelectedDirection(e.target.value);
                setSelectedRuleId(''); // reset rule when direction changes
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-brand-primary cursor-pointer transition-all h-12"
            >
              <option value="">🎯 Choix de la direction...</option>
              {availableDirections.map((dir: string) => (
                <option key={dir} value={dir}>
                  🏢 {dir}
                </option>
              ))}
            </select>
          </div>

          {/* Document type selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <label className="text-xs font-black text-slate-600 uppercase tracking-widest font-sans">
                2. Type de document correspondant
              </label>
            </div>
            <select
              value={selectedRuleId}
              onChange={(e) => setSelectedRuleId(e.target.value)}
              disabled={!selectedDirection}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-brand-primary cursor-pointer transition-all h-12 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">📄 Sélectionner le type de document...</option>
              {filteredRules.map((rule: any) => (
                <option key={rule.id} value={rule.id}>
                  {rule.reference} - {rule.title} ({rule.activeYears + rule.semiActiveYears} ans)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Current locked target indicator */}
        {selectedDirection && selectedRuleId && (
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4.5 mb-8 flex items-center justify-between text-emerald-800 text-xs font-bold font-sans">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>
                Mode de pointage actif : <span className="font-extrabold text-emerald-900">{selectedDirection}</span> / Règle :{" "}
                <span className="font-extrabold text-emerald-900">
                  {(() => {
                    const r = archivalRules.find((ru: any) => String(ru.id) === String(selectedRuleId));
                    return r ? `${r.reference} - ${r.title}` : selectedRuleId;
                  })()}
                </span>
              </span>
            </div>
            <button 
              onClick={() => {
                setSelectedDirection('');
                setSelectedRuleId('');
              }}
              className="text-emerald-500 hover:text-emerald-800 transition-colors uppercase font-black text-[10px] tracking-wider cursor-pointer"
            >
              Désactiver le filtre
            </button>
          </div>
        )}

        {/* Search Bar Container */}
        <div className="flex items-center gap-4 mb-12 w-full">
          <form onSubmit={handleSearch} className="flex-1 relative group">
            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={24} />
            </div>
            <input 
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-3xl pl-16 pr-14 py-6 text-2xl font-black text-slate-800 placeholder:text-slate-300 focus:outline-none focus:border-brand-primary transition-all shadow-xl shadow-slate-200/50"
              placeholder="Rechercher ou scanner une référence..."
            />
            {search && (
              <button 
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
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
            ) : !search.trim() ? (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                key="ready"
                className="h-full flex flex-col items-center justify-center py-24"
              >
                <div className="w-24 h-24 bg-brand-secondary rounded-full flex items-center justify-center text-brand-primary/20 mb-6 border border-slate-100 shadow-inner">
                  <Scan size={44} className="text-brand-primary/40 animate-pulse" />
                </div>
                <h3 className="text-sm font-black uppercase text-slate-400 tracking-[0.2em]">Prêt à scanner ou saisir une référence</h3>
                <p className="text-slate-550 font-semibold text-xs mt-2 max-w-sm text-center">
                  Saisissez un numéro de dossier ou scannez son code-barres dans la barre de saisie ci-dessus pour débuter le pointage.
                </p>
              </motion.div>
            ) : !liveMatchInfo ? (
              /* Reference typed, but not found in folders database */
              <motion.div 
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                key="not-found-create"
                className="h-full flex flex-col items-center justify-center text-center py-8"
              >
                <div className="w-20 h-20 bg-amber-50 text-amber-500 border border-amber-100 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
                  <Plus size={36} />
                </div>
                <div>
                  <span className="text-[9px] font-black text-amber-700 bg-amber-100/50 px-3 py-1.2 rounded-full uppercase tracking-widest font-sans inline-block mb-3">Nouvelle référence</span>
                  <h3 className="text-3xl font-black text-slate-800 tracking-tight">Référence: {search.toUpperCase()}</h3>
                  <p className="text-slate-400 text-sm font-semibold mt-2 max-w-lg mx-auto">
                    Ce dossier n'est pas répertorié dans la base centrale. Vous pouvez le créer et l'affecter à la volée.
                  </p>
                </div>

                {selectedDirection && selectedRuleId ? (
                  <div className="bg-slate-50 border border-slate-200/50 p-6 rounded-[2rem] max-w-xl w-full mt-8 space-y-4 shadow-inner">
                    <p className="text-slate-500 text-[10px] font-extrabold leading-relaxed uppercase tracking-widest block text-center">
                      🤖 Configuration automatique du dossier :
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                      <div className="bg-white p-4.5 rounded-2xl border border-slate-200/40">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Direction de service</span>
                        <span className="text-xs font-black text-slate-700 block truncate">{selectedDirection}</span>
                      </div>
                      <div className="bg-white p-4.5 rounded-2xl border border-slate-200/40">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Paramètres DUA (Règle)</span>
                        <span className="text-xs font-black text-emerald-600 block truncate">
                          {(() => {
                            const r = archivalRules.find((ru: any) => String(ru.id) === String(selectedRuleId));
                            return r ? `${r.reference} - ${r.title}` : selectedRuleId;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-55 border border-dashed border-amber-200 p-6 rounded-[2rem] max-w-md w-full mt-8 flex flex-col items-center">
                    <p className="text-amber-800 text-xs font-bold leading-relaxed text-center">
                      ⚠️ Pour pouvoir initialiser et pointer ce dossier à la volée, veuillez d'abord sélectionner une <strong className="font-black text-slate-800">Direction</strong> et un <strong className="font-black text-slate-800">Type de document</strong> en haut de votre écran.
                    </p>
                  </div>
                )}

                <div className="flex gap-4 w-full max-w-md mt-10">
                  <button 
                    type="button"
                    onClick={() => { setSearch(''); inputRef.current?.focus(); }}
                    className="flex-1 py-4.5 bg-slate-100 rounded-2xl text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all font-sans cursor-pointer"
                  >
                    Effacer
                  </button>
                  <button 
                    type="button"
                    disabled={!selectedDirection || !selectedRuleId}
                    onClick={() => {
                      const activeRule = archivalRules.find((ru: any) => String(ru.id) === String(selectedRuleId));
                      
                      // Calculate dates
                      let expiryDate = '';
                      const ruleActive = parseInt(String(activeRule?.activeYears || 0));
                      const ruleSemi = parseInt(String(activeRule?.semiActiveYears || 0));
                      const totalDua = ruleActive + ruleSemi;
                      
                      const d = new Date();
                      const year = d.getFullYear();
                      expiryDate = `31/12/${year + totalDua}`;
                      
                      const newFolder: Folder = {
                        reference: search.trim().toUpperCase(),
                        intitule: `Dossier ${search.trim()}`,
                        dateDebut: format(new Date(), 'dd/MM/yyyy'),
                        dateCloture: format(new Date(), 'dd/MM/yyyy'),
                        direction: selectedDirection,
                        codeDua: activeRule?.reference || 'DUA',
                        ruleId: selectedRuleId,
                        category: activeRule?.category || activeRule?.docType || 'Autre',
                        expiryDate,
                        archivalStatus: 'Active',
                        status: 'pointed',
                        boxNumber: boxes[0]?.number || 'Boîte',
                        pointedAt: new Date().toISOString()
                      };

                      setFolders((prev: any) => [...(prev || []), newFolder]);
                      setSearch('');
                      inputRef.current?.focus();
                    }}
                    className="flex-1 py-4.5 bg-brand-primary text-white rounded-2xl font-black uppercase text-xs hover:opacity-95 transition-all shadow-xl shadow-brand-primary/10 disabled:opacity-30 disabled:cursor-not-allowed font-sans cursor-pointer"
                  >
                    Créer & Affecter
                  </button>
                </div>
              </motion.div>
            ) : (liveMatchInfo.folder.status === 'pointed' || liveMatchInfo.folder.status === 'verified') ? (
              <motion.div
                key={`blocked-${liveMatchInfo.folder.reference}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center p-8 bg-rose-50 border border-rose-200 rounded-[2.5rem] text-center max-w-2xl mx-auto space-y-6 shadow-md"
              >
                <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center border-4 border-white shadow-lg shrink-0">
                  <Lock size={36} />
                </div>
                <div>
                  <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-4 py-1.5 rounded-full uppercase tracking-widest font-sans inline-block mb-3">Saisie Bloquée</span>
                  <h3 className="text-3xl font-black text-slate-800 tracking-tight">Dossier déjà Pointé / Archivé</h3>
                  <p className="text-slate-600 text-sm font-semibold mt-4 max-w-lg leading-relaxed">
                    Le dossier référencé <span className="font-mono bg-rose-100/60 px-2 py-0.5 rounded font-black text-slate-800 text-base">{liveMatchInfo.folder.reference}</span> est déjà enregistré au statut <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-xl font-bold uppercase text-[10px] font-sans tracking-wide border border-amber-200">{liveMatchInfo.folder.status === 'verified' ? 'Validé & Stocké' : 'Pointé'}</span>.
                  </p>
                </div>

                <div className="bg-white border border-rose-100 rounded-3xl p-6 w-full shadow-inner flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <div className="text-left font-sans">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Conteneur de destination</p>
                    <p className="text-xl font-black text-rose-600 mt-2 font-sans">📦 BOÎTE {liveMatchInfo.folder.boxNumber || 'N/A'}</p>
                    {liveMatchInfo.folder.direction && (
                      <p className="text-xs font-bold text-slate-500 mt-1.5">Direction : <span className="text-slate-700 font-extrabold">{liveMatchInfo.folder.direction}</span></p>
                    )}
                  </div>
                  <div className="text-left sm:text-right font-sans">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Code de calendrier (DUA)</p>
                    <p className="text-sm font-black text-slate-700 mt-2 font-mono">{liveMatchInfo.folder.codeDua || 'N/A'}</p>
                    {liveMatchInfo.folder.expiryDate && (
                      <p className="text-[11px] font-bold text-slate-500 mt-1.5">Fin de conservation : <span className="text-emerald-600 font-extrabold">{liveMatchInfo.folder.expiryDate}</span></p>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 w-full justify-center pt-2">
                  <button 
                    type="button"
                    onClick={() => { setSearch(''); inputRef.current?.focus(); }}
                    className="px-8 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-md shadow-rose-500/10 cursor-pointer"
                  >
                    Effacer & Retour
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key={liveMatchInfo.folder.reference}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-12"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div>
                    <span className="text-[9px] font-black text-brand-primary bg-brand-secondary/80 px-3 py-1.2 rounded-full uppercase tracking-widest mb-3 inline-block">Dossier Certifié</span>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] block mb-2 font-sans">RÉFÉRENCE DOSSIER</label>
                    <h2 className="text-4xl font-black text-slate-800 tracking-tight">{liveMatchInfo.folder.reference}</h2>
                    {liveMatchInfo.folder.dateCloture && (
                      <div className="mt-3">
                        <span className="px-3.5 py-1.5 bg-emerald-50 text-emerald-800 border-2 border-emerald-300 rounded-2xl text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 shadow-sm">
                          📅 Date Clôture Dossier : {liveMatchInfo.folder.dateCloture}
                        </span>
                      </div>
                    )}
                  </div>
                  {smartMode && liveMatchInfo.suggestion && (
                    <div className="bg-brand-primary text-white p-6 rounded-3xl shadow-xl shadow-slate-200">
                      <p className="text-[10px] font-black opacity-80 uppercase tracking-widest mb-1">BOÎTE SUGGÉRÉE</p>
                      <p className="text-3xl font-black">{liveMatchInfo.suggestion.number}</p>
                      {liveMatchInfo.suggestion.clotureText && (
                        <p className="text-sm font-black uppercase text-emerald-800 bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl mt-3 text-center tracking-wide shadow-none">
                          Réf : {liveMatchInfo.suggestion.clotureText}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100 animate-fade-in">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Intitulé original</label>
                    <span className="text-sm font-bold text-slate-700 block truncate">{liveMatchInfo.folder.intitule || "Non spécifié"}</span>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Direction de rattachement</label>
                    <span className="text-sm font-bold text-slate-75 block truncate">
                      {liveMatchInfo.folder.direction || (
                        <span className="text-red-500 italic opacity-60">Indéfinie</span>
                      )}
                    </span>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Règle CC / Code DUA</label>
                    <span className="text-sm font-bold text-slate-75 block truncate">
                      {liveMatchInfo.folder.codeDua || (
                        <span className="text-amber-600 italic opacity-60">Non assignée</span>
                      )}
                    </span>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Date de Clôture</label>
                    <span className="text-sm font-black text-emerald-700 block bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100 max-w-max">
                      {liveMatchInfo.folder.dateCloture || (
                        <span className="text-slate-450 font-bold italic opacity-60">Non spécifiée</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Overwrite notification indicator */}
                {(selectedDirection || selectedRuleId) && (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-[11px] font-semibold text-amber-800 uppercase tracking-wider relative flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    <span>
                      En validant, le dossier sélectionné écrasera sa direction et sa règle CC par le filtre actif de votre session.
                    </span>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] block mb-2 font-sans">AFFECTATION DU POINTAGE</label>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4 italic opacity-80 underline underline-offset-4">
                    {smartMode ? "MODE INTELLIGENT : APPUYEZ SUR ENTRÉE POUR VALIDER" : "SÉLECTIONNEZ UNE BOÎTE OUVERTE POUR TERMINER LE POINTAGE :"}
                  </p>
                  <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                    {boxes.map((box: any) => (
                      <button 
                        key={box.id}
                        onClick={() => {
                          setFolders((prev: any) => prev.map((f: any) => {
                            if (f.reference === liveMatchInfo.folder.reference) {
                              const activeRule = archivalRules.find((ru: any) => String(ru.id) === String(selectedRuleId));
                              let updatedFields: any = {};
                              if (selectedDirection) {
                                updatedFields.direction = selectedDirection;
                              }
                              if (activeRule) {
                                const ruleActive = parseInt(String(activeRule.activeYears || 0));
                                const ruleSemi = parseInt(String(activeRule.semiActiveYears || 0));
                                const totalDua = ruleActive + ruleSemi;
                                
                                const dateStr = f.dateCloture || format(new Date(), 'dd/MM/yyyy');
                                const yearMatch = dateStr.match(/\d{4}/) || dateStr.match(/\/(\d{2})$/);
                                let year = new Date().getFullYear();
                                if (yearMatch) {
                                  year = yearMatch[0].length === 4 ? parseInt(yearMatch[0]) : 2000 + parseInt(yearMatch[1]);
                                }
                                const expiryDate = `31/12/${year + totalDua}`;
                                
                                updatedFields.codeDua = activeRule.reference;
                                updatedFields.ruleId = activeRule.id;
                                updatedFields.category = activeRule.category || activeRule.docType || 'Autre';
                                updatedFields.expiryDate = expiryDate;
                                updatedFields.archivalStatus = 'Active';
                              }
                              return {
                                ...f,
                                ...updatedFields,
                                status: 'pointed',
                                boxNumber: box.number,
                                pointedAt: new Date().toISOString()
                              };
                            }
                            return f;
                          }));
                          setSearch('');
                          inputRef.current?.focus();
                        }}
                        className="px-8 py-4.5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-xl hover:border-brand-primary transition-all text-sm font-black text-slate-705 flex flex-col items-center justify-center min-w-[140px] whitespace-nowrap cursor-pointer gap-0.5"
                      >
                        <span className="flex items-center gap-1">📦 {box.number}</span>
                        {box.clotureText && (
                          <span className="text-xs font-black text-emerald-800 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-lg mt-1.5 font-mono uppercase tracking-tight">
                            Réf : {box.clotureText}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Suggestion / Confirmation Modal */}
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
              <h3 className="text-xl font-black text-slate-900 mb-2 font-sans">VALIDER LE POINTAGE</h3>
              <p className="text-slate-400 text-sm font-medium mb-8">
                Réf: <span className="text-slate-800 font-bold">{confirmModal.reference}</span>
              </p>

              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Assigner à</p>
                {suggestedBox ? (
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-black text-brand-primary">{suggestedBox.number}</span>
                    {suggestedBox.clotureText && (
                      <span className="text-sm font-black text-emerald-800 bg-emerald-100 border border-emerald-200 px-4 py-2 rounded-xl mt-2 font-mono uppercase tracking-tight">
                        Réf : {suggestedBox.clotureText}
                      </span>
                    )}
                    <span className="text-xs font-bold text-slate-500 uppercase mt-2">{suggestedBox.title}</span>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-slate-400">Boîte non définie</p>
                )}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => { setConfirmModal(null); setSuggestedBox(null); inputRef.current?.focus(); }}
                  className="flex-1 py-4 bg-slate-100 rounded-2xl text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all cursor-pointer font-sans"
                >
                  Annuler
                </button>
                <button 
                  onClick={validatePointage}
                  className="flex-1 py-4 bg-brand-primary rounded-2xl text-white font-black uppercase text-xs shadow-xl shadow-slate-250 hover:opacity-90 transition-all cursor-pointer font-sans"
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

const BoitesModule = ({ boxes, setBoxes, folders, setFolders, archivalRules = [], setActiveTab }: any) => {
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const [selectedDirection, setSelectedDirection] = useState('Sinistre Matériel');
  const [customDirection, setCustomDirection] = useState('');
  const [newBoxName, setNewBoxName] = useState('');
  const [clotureTextVal, setClotureTextVal] = useState('');
  const [clotureDateVal, setClotureDateVal] = useState('');
  const [verifInput, setVerifInput] = useState('');
  const [detailsPage, setDetailsPage] = useState(1);
  const [printBox, setPrintBox] = useState<Box | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const detailsItemsPerPage = 20;

  // Sync state with toast
  const triggerToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Compile list of directions
  const directionsList = useMemo(() => {
    const list = new Set<string>([
      "Sinistre Matériel",
      "Comptabilité",
      "Production",
      "Ressources Humaines"
    ]);
    (folders || []).forEach((f: any) => { if (f.direction) list.add(f.direction.trim()); });
    (archivalRules || []).forEach((r: any) => { if (r.direction) list.add(r.direction.trim()); });
    return Array.from(list).filter(Boolean).sort();
  }, [folders, archivalRules]);

  const activeDirection = useMemo(() => {
    if (selectedDirection === 'custom') return customDirection.trim();
    return selectedDirection;
  }, [selectedDirection, customDirection]);

  // Helper code-barres format / next number suggestion
  const getNextBoxNumber = useCallback((directionName: string, currentBoxes: Box[]) => {
    let prefix = "BOX";
    const dir = directionName.trim().toLowerCase();
    if (dir.includes("sinistre matériel") || dir.includes("sinistre")) {
      prefix = "SIN.M";
    } else if (dir.includes("comptabilité") || dir.includes("compta")) {
      prefix = "COMPTA";
    } else if (dir.includes("production") || dir.includes("prod")) {
      prefix = "PROD";
    } else if (dir.includes("ressources humaines") || dir.includes("rh")) {
      prefix = "RH";
    } else if (directionName.trim()) {
      const clean = directionName.trim().toUpperCase().replace(/[^A-Z\s]/g, '');
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length === 1) {
        prefix = words[0].substring(0, 6);
      } else if (words.length > 1) {
        prefix = words.map(w => w[0]).join('');
      }
    }

    // Find highest suffix count among matching box formats
    let maxNum = 0;
    const regex = new RegExp(`^${prefix}\\.(\\d+)$`, 'i');
    
    currentBoxes.forEach((b: Box) => {
      const match = b.number.trim().match(regex);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > maxNum) {
          maxNum = val;
        }
      }
    });

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(4, '0');
    return `${prefix}.${padded}`;
  }, []);

  // Sync / Save Boxes to Server
  const syncWithServer = async (updatedBoxes: Box[]) => {
    try {
      await api.post('/api/centralized-inventory/sync', { folders, boxes: updatedBoxes });
    } catch (err) {
      console.error("Failed to sync boxes to backend server:", err);
    }
  };

  // Autofill sequential number on direction change
  useEffect(() => {
    if (activeDirection) {
      const suggested = getNextBoxNumber(activeDirection, boxes);
      setNewBoxName(suggested);
    }
  }, [activeDirection, boxes, getNextBoxNumber]);

  // Validate duplicate
  const isDuplicate = useMemo(() => {
    const val = newBoxName.trim().toLowerCase();
    if (!val) return false;
    return boxes.some((b: Box) => b.number.trim().toLowerCase() === val);
  }, [newBoxName, boxes]);

  // Command to Continue Box formats
  const handleContinueSequence = () => {
    if (!activeDirection) return;
    const suggested = getNextBoxNumber(activeDirection, boxes);
    setNewBoxName(suggested);
    triggerToast(`Séquence calculée pour ${activeDirection} : ${suggested}`, 'success');
  };

  const handleCreate = async () => {
    if (!newBoxName.trim()) return;
    if (isDuplicate) {
      triggerToast("Cette boîte existe déjà ! Impossible de créer des doublons.", "error");
      return;
    }
    
    const box: Box = {
      id: generateId(),
      number: newBoxName.trim().toUpperCase(),
      title: activeDirection || 'Générale',
      isOpen: true,
      depot: '', travee: '', tablette: '',
      direction: activeDirection || 'Générale',
      clotureText: clotureTextVal.trim() || undefined,
      clotureDate: clotureDateVal.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const newBoxes = [...boxes, box];
    setBoxes(newBoxes);
    await syncWithServer(newBoxes);
    triggerToast(`Boîte ${box.number} créée avec succès !`, 'success');
    
    // Clear & compute next
    const nextSugg = getNextBoxNumber(activeDirection, newBoxes);
    setNewBoxName(nextSugg);
    setClotureTextVal('');
    setClotureDateVal('');
  };

  const handleReset = async () => {
    if (window.confirm("Réinitialiser toutes les boîtes ? Cette opération videra toutes les boîtes et réinitialisera l'archivage.")) {
      setBoxes([]);
      const clearedFolders = folders.map((f: any) => ({ ...f, status: 'pending', boxNumber: '', pointedAt: undefined, verifiedAt: undefined }));
      setFolders(clearedFolders);
      await syncWithServer([]);
      triggerToast("Toutes les boîtes ont été réinitialisées !", "warning");
    }
  };

  const deleteBox = async (id: string) => {
    if (window.confirm("Supprimer cette boîte ? Les dossiers affectés retourneront en statut Pointage en cours.")) {
      const box = boxes.find((b: any) => b.id === id);
      let updatedFolders = [...folders];
      if (box) {
        updatedFolders = folders.map((f: any) => f.boxNumber === box.number ? { ...f, status: 'pending', boxNumber: '', pointedAt: undefined } : f);
        setFolders(updatedFolders);
      }
      const newBoxes = boxes.filter((b: any) => b.id !== id);
      setBoxes(newBoxes);
      await syncWithServer(newBoxes);
      triggerToast("Boîte supprimée des archives.", "warning");
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

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!verifInput || !selectedBox) return;

    const match = boxFolders.find((f: any) => f.reference.endsWith(verifInput) || f.reference === verifInput);
    if (match) {
      const updatedFolders = folders.map((f: any) => 
        f.reference === match.reference ? { ...f, status: 'verified', verifiedAt: new Date().toISOString() } : f
      );
      setFolders(updatedFolders);
      await syncWithServer(boxes);
      setVerifInput('');
      triggerToast(`Dossier ${match.reference} vérifié avec succès !`, 'success');
    } else {
      triggerToast("Aucun dossier correspondant dans cette boîte.", 'error');
    }
  };

  const removeFolder = async (ref: string) => {
    const updatedFolders = folders.map((f: any) => 
      f.reference === ref ? { ...f, status: 'pending', boxNumber: '', pointedAt: undefined, verifiedAt: undefined } : f
    );
    setFolders(updatedFolders);
    await syncWithServer(boxes);
    triggerToast("Dossier retiré de la boîte.", 'warning');
  };

  // Handle Label physical printing
  const handlePrintLabel = (box: Box) => {
    setPrintBox(box);
  };

  const executePrinterWindow = () => {
    window.print();
  };

  return (
    <div className="h-full flex flex-col pt-12 px-12 bg-brand-secondary overflow-y-auto pb-40">
      <div className="max-w-7xl mx-auto w-full">
        
        {/* Toast notifications */}
        {toast && (
          <div className="fixed top-24 right-10 z-[100] bg-slate-900 border border-slate-800 text-white p-5 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
            <span className={cn(
              "w-2.5 h-2.5 rounded-full shrink-0",
              toast.type === 'success' ? "bg-emerald-500" : toast.type === 'warning' ? "bg-amber-400" : "bg-red-500"
            )} />
            <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
          </div>
        )}

        {/* Hidden Printable Sticker Component designed strictly for single-sticker label printers */}
        {printBox && (
          <div className="hidden print:block fixed inset-0 bg-white z-[99999] text-black p-4 font-mono w-[80mm] h-[50mm] flex flex-col justify-between border-4 border-black box-border">
            <div className="flex justify-between items-start border-b-2 border-black pb-1">
              <div>
                <h1 className="text-[12px] font-black tracking-tight leading-none uppercase">STICKER D'ARCHIVE</h1>
                <p className="text-[6px] font-bold mt-0.5 leading-none">SYSTEME CENTRALISE FLOWIX</p>
              </div>
              <div className="text-right">
                <p className="text-[7px] font-black leading-none uppercase">{printBox.direction || 'Générale'}</p>
                <p className="text-[5px] text-slate-500 mt-0.5 leading-none font-sans">Crée: {format(new Date(printBox.createdAt || new Date()), 'dd/MM/yyyy')}</p>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-between py-2">
              <div className="space-y-1">
                <span className="text-[5px] font-bold block uppercase text-slate-500">Numéro de boîte unique:</span>
                <span className="text-2xl font-black block leading-none tracking-tight">{printBox.number}</span>
                {printBox.clotureText && (
                  <span className="text-[10px] font-black block uppercase tracking-tight text-black border border-black px-1.5 py-0.5 mt-1 rounded bg-slate-50 max-w-max font-mono">
                    {printBox.clotureText}
                  </span>
                )}
                {printBox.clotureDate && (
                  <span className="text-[6px] font-bold block text-slate-700 mt-0.5 font-sans">
                    Clôture: {format(new Date(printBox.clotureDate), 'dd/MM/yyyy')}
                  </span>
                )}
                <span className="text-[6px] font-bold block bg-black text-white px-1 py-0.5 mt-1.5 rounded uppercase tracking-wider text-center font-sans">
                  Folders: {folders.filter((f: any) => f.boxNumber === printBox.number).length} dossiers
                </span>
              </div>
              
              {/* QR code printed sticker */}
              <div className="border border-black p-1 bg-white rounded flex items-center justify-center">
                <QRCodeSVG 
                  value={JSON.stringify({ 
                    box: printBox.number, 
                    dir: printBox.direction || 'Archives',
                    id: printBox.id,
                    count: folders.filter((f: any) => f.boxNumber === printBox.number).length
                  })}
                  size={42} 
                  level="M"
                  marginSize={0}
                />
              </div>
            </div>

            <div className="border-t-2 border-black pt-1 flex flex-col items-center justify-center">
              <Barcode 
                value={printBox.number} 
                width={1.2}
                height={26}
                format="CODE128"
                displayValue={false}
                margin={0}
              />
              <span className="text-[8px] font-black tracking-widest mt-0.5 leading-none">{printBox.number}</span>
            </div>
          </div>
        )}

        {/* Header & Configuration Area */}
        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm mb-12 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-brand-primary to-blue-500" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-brand-secondary text-brand-primary rounded-xl flex items-center justify-center border border-slate-100">
                <Package size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Gestion des Boîtes</h2>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Configuration des codes-barres et des conteneurs physiques</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleReset} 
                className="flex items-center gap-2 text-red-500 text-[11px] font-black uppercase tracking-widest hover:text-red-700 transition-all cursor-pointer"
              >
                <Trash2 size={16} /> Réinitialiser
              </button>
              
              <button
                onClick={() => {
                  triggerToast("Boîtes validées ! Redirection vers l'étape de Localisation...", "success");
                  setTimeout(() => {
                    setActiveTab?.('localisation');
                  }, 800);
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-emerald-600/10"
              >
                <CheckCircle2 size={16} /> Valider & Passer à la localisation
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
            
            {/* Direction sector */}
            <div className="lg:col-span-4 space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-sans">
                🏢 1. Direction / Service
              </label>
              <select
                value={selectedDirection}
                onChange={(e) => setSelectedDirection(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-brand-primary cursor-pointer transition-all h-[52px]"
              >
                {directionsList.map((dir) => (
                  <option key={dir} value={dir}>🏢 {dir}</option>
                ))}
                <option value="custom">✍️ Saisie Libre (Autre direction)</option>
              </select>
            </div>

            {/* If custom is selected, show input */}
            {selectedDirection === 'custom' && (
              <div className="lg:col-span-3 space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-sans">
                  Nom de la direction
                </label>
                <input 
                  type="text"
                  value={customDirection}
                  onChange={(e) => setCustomDirection(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 text-xs font-bold text-slate-705 focus:outline-none focus:border-brand-primary h-[52px]"
                  placeholder="Ex: Services Généraux"
                />
              </div>
            )}

            {/* Suffix/code input and Continue Option */}
            <div className={cn(
              "space-y-2 relative",
              selectedDirection === 'custom' ? "lg:col-span-5" : "lg:col-span-8"
            )}>
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-sans flex items-center gap-1.5">
                  🏷️ 2. Référence & Code unique
                </label>
                <button 
                  type="button"
                  onClick={handleContinueSequence}
                  className="text-brand-primary font-black uppercase text-[10px] tracking-wider flex items-center gap-1 hover:underline cursor-pointer"
                >
                  🔄 Continuer les boîtes existantes
                </button>
              </div>

              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input 
                    value={newBoxName}
                    onChange={e => setNewBoxName(e.target.value)}
                    className={cn(
                      "w-full bg-slate-50 border rounded-2xl px-5 py-4 text-sm font-black text-slate-700 focus:outline-none focus:border-brand-primary transition-all h-[52px]",
                      isDuplicate ? "border-red-400 bg-red-50 text-red-900" : "border-slate-200"
                    )}
                    placeholder="Format automatique (ex: SIN.M.0001)"
                  />
                  {isDuplicate && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500 text-[10px] font-extrabold font-mono uppercase tracking-widest bg-white px-2 py-1 rounded border border-red-200">
                      Doublon !
                    </span>
                  )}
                </div>

                <button 
                  onClick={handleCreate}
                  disabled={isDuplicate || !newBoxName.trim()}
                  className="px-6 h-[52px] bg-brand-primary text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-2xl font-black uppercase text-[11px] tracking-wider shadow-lg shadow-brand-primary/10 hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer font-sans shrink-0"
                >
                  <Plus size={16} /> Enregistrer
                </button>
              </div>
            </div>

          </div>

          {/* Optional Closing options row */}
          <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-sans flex items-center gap-1">
                🔒 Date de Clôture (Facultatif)
              </label>
              <input 
                type="date"
                value={clotureDateVal}
                onChange={e => setClotureDateVal(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-brand-primary h-[52px]"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-sans flex items-center gap-1">
                🏷️ Référence secondaire / Clôture sous la boîte (ex : 2025/001)
              </label>
              <input 
                type="text"
                value={clotureTextVal}
                onChange={e => setClotureTextVal(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-xs font-semibold text-slate-705 placeholder:text-slate-350 focus:outline-none focus:border-brand-primary h-[52px]"
                placeholder="Ex : 2025/001"
              />
            </div>
          </div>

          {isDuplicate && (
            <p className="text-red-600 text-[10px] font-bold uppercase tracking-widest mt-4 flex items-center gap-1.5 bg-red-50/50 p-2.5 rounded-xl border border-red-100">
              ⚠️ Ce numéro de boîte est déjà attribué. Veuillez cliquer sur "Continuer les boîtes existantes" ou changer le suffixe pour éviter les doublons.
            </p>
          )}
        </div>

        {/* Box List with nice visual metadata previews */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {boxes.map((box: Box) => {
            const count = folders.filter((f: any) => f.boxNumber === box.number).length;
            return (
              <motion.div 
                key={box.id}
                className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm hover:shadow-xl hover:border-brand-primary transition-all group relative overflow-hidden"
              >
                {/* Visual barcode background accent on cards */}
                <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
                  <Scan size={90} className="text-brand-primary" />
                </div>

                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-[8px] font-black text-brand-primary bg-brand-secondary/80 px-2.5 py-1 rounded-full uppercase tracking-widest inline-block mb-3 leading-none font-sans">
                      🏢 {box.direction || "Général"}
                    </span>
                    <h3 className="text-2xl font-black text-slate-800 leading-none tracking-tight">{box.number}</h3>
                    {box.clotureText && (
                      <p className="text-xs font-black text-brand-primary uppercase mt-1">
                        📦 Réf : {box.clotureText}
                      </p>
                    )}
                    {box.clotureDate && (
                      <p className="text-[10px] font-bold text-slate-600">
                        Clôture : {format(new Date(box.clotureDate), 'dd/MM/yyyy')}
                      </p>
                    )}
                    <p className="text-[10px] font-bold text-slate-400 mt-2 font-mono tracking-tighter">Créée : {format(new Date(box.createdAt!), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="bg-brand-secondary border border-brand-primary/10 px-4 py-1.5 rounded-full mb-2">
                      <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">{count} dossiers</span>
                    </div>
                  </div>
                </div>

                {/* Simulated physical sticker barcode preview directly on each container card */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center justify-between mt-4">
                  <div className="flex flex-col items-center flex-1 pr-4 border-r border-slate-200/55 text-center justify-center">
                    <Barcode 
                      value={box.number} 
                      width={0.8}
                      height={20}
                      format="CODE128"
                      displayValue={false}
                      margin={0}
                    />
                    <span className="text-[9px] font-semibold font-mono text-slate-505 tracking-wider mt-1.5">{box.number}</span>
                    {box.clotureText && (
                      <span className="text-[8px] font-bold text-slate-500 uppercase font-sans mt-0.5">({box.clotureText})</span>
                    )}
                  </div>
                  <div className="pl-4 shrink-0 flex items-center justify-center">
                    <QRCodeSVG 
                      value={JSON.stringify({ box: box.number, dir: box.direction || 'Général', count })}
                      size={28}
                      level="L"
                    />
                  </div>
                </div>

                {/* Actions grid */}
                <div className="flex items-center justify-end gap-1.5 pt-4 mt-4 border-t border-slate-100">
                  <button 
                    onClick={() => handlePrintLabel(box)} 
                    className="p-3 text-brand-primary hover:bg-brand-secondary rounded-xl transition-all flex items-center gap-1 cursor-pointer font-sans"
                    title="Imprimer l'étiquette physique"
                  >
                    <Sparkles size={16} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Imprimer</span>
                  </button>
                  <button 
                    onClick={() => { setDetailsPage(1); setSelectedBox(box); }} 
                    className="p-3 text-slate-400 hover:text-brand-primary hover:bg-brand-secondary rounded-xl transition-all cursor-pointer"
                    title="Voir les dossiers classés"
                  >
                    <Eye size={18} />
                  </button>
                  <button 
                    onClick={() => setBoxes(boxes.map((b: any) => b.id === box.id ? { ...b, isOpen: !b.isOpen } : b))} 
                    className="p-3 text-slate-400 hover:text-brand-primary hover:bg-brand-secondary rounded-xl transition-all cursor-pointer"
                    title={box.isOpen ? "Verrouiller la boîte" : "Ouvrir la boîte"}
                  >
                    {box.isOpen ? <Unlock size={18} /> : <Lock size={18} />}
                  </button>
                  <button 
                    onClick={() => deleteBox(box.id)} 
                    className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                    title="Supprimer la boîte d'archivage"
                  >
                    <Trash2 size={18} />
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
              <div className="p-10 flex items-start justify-between border-b border-slate-100">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-brand-secondary text-brand-primary rounded-2xl flex items-center justify-center border border-brand-primary/10">
                      <Package size={28} />
                    </div>
                    <div>
                      <h3 className="text-4xl font-black text-slate-900 tracking-tight">Boîte : {selectedBox.number}</h3>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Affectation : {selectedBox.direction || 'Général'}</p>
                    </div>
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
                <button onClick={() => setSelectedBox(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
                  <X size={32} />
                </button>
              </div>

              {/* Verification Input */}
              <div className="px-10 py-8 bg-slate-50/50 border-b border-slate-100">
                <form onSubmit={handleVerify} className="flex gap-4">
                  <div className="flex-1 relative">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-brand-primary">
                      <CheckCircle2 size={24} />
                    </div>
                    <input 
                      value={verifInput}
                      onChange={e => setVerifInput(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-2xl pl-16 pr-6 py-4.5 text-lg font-bold text-slate-700 placeholder:text-slate-350 focus:outline-none focus:border-brand-primary transition-all shadow-inner"
                      placeholder="Vérification (3 derniers chiffres)..."
                    />
                  </div>
                  <button 
                    type="submit"
                    className="px-14 bg-brand-primary text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-brand-primary/10 hover:opacity-90 transition-all font-sans cursor-pointer"
                  >
                    Valider
                  </button>
                </form>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto px-10 pb-10">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest font-sans">Référence</th>
                      <th className="py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center font-sans">Date Clôture</th>
                      <th className="py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center font-sans">Vérifié</th>
                      <th className="py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right font-sans">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
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
                            className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
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
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-500 disabled:opacity-30 cursor-pointer"
                    >
                      Précédent
                    </button>
                    <button 
                      disabled={detailsPage === detailsTotalPages}
                      onClick={() => setDetailsPage(p => Math.min(detailsTotalPages, p + 1))}
                      className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase cursor-pointer"
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

      {/* Pop-up sticker label printer preview modal */}
      <AnimatePresence>
        {printBox && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-6 print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] w-full max-w-xl p-10 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-brand-secondary text-brand-primary rounded-2xl flex items-center justify-center mx-auto mb-6 border border-brand-primary/10">
                <Sparkles size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 font-sans uppercase">Aperçu de l'étiquette</h3>
              <p className="text-slate-400 text-xs font-semibold max-w-sm mx-auto mb-8 leading-relaxed">
                Voici le sticker physique configuré pour la boîte <strong className="text-slate-800 font-extrabold">{printBox.number}</strong>. Vous pouvez l'imprimer directement via votre imprimante d'étiquettes standard.
              </p>

              {/* Physical sticker widget replica container inside browser */}
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 shadow-inner flex justify-center mb-8 relative">
                <div className="bg-white border-2 border-slate-300 p-6 rounded-2xl max-w-md w-full text-left font-mono text-xs text-black">
                  
                  <div className="flex justify-between items-start border-b border-black pb-2 mb-3">
                    <div>
                      <h4 className="font-sans font-black tracking-tight text-[11px] leading-tight uppercase">STICKER ARCHIVE</h4>
                      <p className="text-[8px] opacity-60 leading-none tracking-wider font-sans uppercase">FLOWIX CENTRALISE</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-800 uppercase block font-sans">
                        {printBox.direction || 'GÉNÉRAL'}
                      </span>
                      <span className="text-[7px] text-slate-500 block mt-1 font-sans font-medium">Créée: {format(new Date(printBox.createdAt || new Date()), 'dd/MM/yyyy')}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="space-y-1">
                      <span className="text-[7px] text-slate-400 uppercase font-sans font-extrabold block">Boîte unique:</span>
                      <span className="text-2xl font-black block leading-none tracking-tight">{printBox.number}</span>
                      {printBox.clotureText && (
                        <span className="text-[11px] font-black block uppercase tracking-tight text-slate-900 border border-slate-300 px-2 py-0.5 mt-1.5 rounded-lg bg-slate-100 w-max font-mono">
                          {printBox.clotureText}
                        </span>
                      )}
                      {printBox.clotureDate && (
                        <span className="text-[8px] font-bold block text-slate-600 mt-1 font-sans">
                          Clôture: {format(new Date(printBox.clotureDate), 'dd/MM/yyyy')}
                        </span>
                      )}
                      <span className="text-[7px] font-bold block text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 w-max font-sans uppercase mt-2">
                        Folders: {folders.filter((f: any) => f.boxNumber === printBox.number).length} dossiers clas.
                      </span>
                    </div>
                    <div className="border border-slate-200 p-1.5 rounded-lg bg-white shrink-0">
                      <QRCodeSVG 
                        value={JSON.stringify({ 
                          box: printBox.number, 
                          dir: printBox.direction || 'Général',
                          count: folders.filter((f: any) => f.boxNumber === printBox.number).length
                        })}
                        size={52} 
                        level="M"
                      />
                    </div>
                  </div>

                  <div className="border-t border-black pt-3 flex flex-col items-center">
                    <Barcode 
                      value={printBox.number} 
                      width={1.4}
                      height={32}
                      format="CODE128"
                      displayValue={false}
                      margin={0}
                    />
                    <span className="text-[10px] font-black tracking-widest mt-2">{printBox.number}</span>
                  </div>

                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setPrintBox(null)}
                  className="flex-1 py-4 bg-slate-100 rounded-2xl text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all cursor-pointer font-sans"
                >
                  Fermer
                </button>
                <button
                  onClick={executePrinterWindow}
                  className="flex-1 py-4 bg-brand-primary text-white rounded-2xl font-black uppercase text-xs hover:opacity-95 shadow-xl shadow-brand-primary/10 transition-all cursor-pointer flex items-center justify-center gap-2 font-sans"
                >
                  🖨️ Lancer l'impression
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

const LocalisationModule = ({ boxes, setBoxes, folders, selectedBoxIds, setSelectedBoxIds, setActiveTab }: any) => {
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-black text-brand-primary border-none m-0 tracking-tight uppercase">LOCALISATION DES BOÎTES</h2>
          <p className="text-slate-400 text-sm font-medium">Affectation des emplacements physiques</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-12 pr-6 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 w-full sm:w-64 focus:outline-none focus:border-brand-primary transition-all h-[46px]"
              placeholder="Rechercher une boîte..."
            />
          </div>
          
          <button
            onClick={() => {
              alert("🎉 Localisation entièrement validée avec succès ! Redirection vers l'inventaire global.");
              setActiveTab?.('inventaire');
            }}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 h-[46px]"
          >
            <CheckCircle2 size={16} /> Valider la localisation
          </button>
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
  const [activeSubTab, setActiveSubTab] = useState<'pointed' | 'recherche'>('pointed');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pointed' | 'verified'>('all');
  const [selectedDirection, setSelectedDirection] = useState<string>('all');
  const itemsPerPage = 50;

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [massSelectedRuleId, setMassSelectedRuleId] = useState('');
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationSource, setValidationSource] = useState('');

  const unlocalizedBoxes = useMemo(() => {
    const uniqueBoxes = Array.from(new Set(
      (folders || [])
        .filter((f: any) => (f.status === 'pointed' || f.status === 'verified') && f.boxNumber)
        .map((f: any) => f.boxNumber.trim())
    ));
    return uniqueBoxes.filter((num: string) => {
      const b = (boxes || []).find((x: any) => x.number === num);
      return !b || !b.depot;
    });
  }, [folders, boxes]);

  const availableDirections = useMemo(() => {
    const dirs = new Set<string>();
    (folders || []).forEach((f: any) => {
      if (f.direction) {
        dirs.add(f.direction.trim());
      }
    });
    (archivalRules || []).forEach((r: any) => {
      if (r.direction) {
        dirs.add(r.direction.trim());
      }
    });
    return Array.from(dirs).sort();
  }, [folders, archivalRules]);
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
      await api.delete(`/api/archival-directory/${ruleId}`);
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
    } catch (err: any) {
      setToast({ message: "Erreur lors de la suppression: " + err.message, type: 'error' });
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
      const data = editingRuleId ? await api.patch(url, newRule) : await api.post(url, newRule);
      
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
    } catch (err: any) {
      setToast({ message: "Erreur lors de l'enregistrement : " + err.message, type: 'error' });
    }
  };

  const handleRuleChange = (folderRef: string, ruleIdVal: string) => {
    const matchedRule = archivalRules.find((r: any) => String(r.id) === String(ruleIdVal));
    setFolders((prevFolders: any[]) => {
      return prevFolders.map((f: any) => {
        if (f.reference === folderRef) {
          let updatedFields: any = {};
          if (matchedRule) {
            const ruleActive = parseInt(String(matchedRule.activeYears || 0));
            const ruleSemi = parseInt(String(matchedRule.semiActiveYears || 0));
            const totalDua = ruleActive + ruleSemi;
            
            const dateStr = f.dateCloture || format(new Date(), 'dd/MM/yyyy');
            const yearMatch = dateStr.match(/\d{4}/) || dateStr.match(/\/(\d{2})$/);
            let year = new Date().getFullYear();
            if (yearMatch) {
              year = yearMatch[0].length === 4 ? parseInt(yearMatch[0]) : 2000 + parseInt(yearMatch[1]);
            }
            const expiryYear = year + totalDua;
            updatedFields.expiryDate = `31/12/${expiryYear}`;
            updatedFields.archivalStatus = new Date().getFullYear() >= expiryYear ? 'Expired' : 'Active';
            updatedFields.codeDua = matchedRule.reference;
            updatedFields.category = matchedRule.category || matchedRule.docType || 'Autre';
            updatedFields.ruleId = matchedRule.id;
            updatedFields.direction = matchedRule.direction;
            updatedFields.intitule = matchedRule.title;
          } else {
            updatedFields.ruleId = undefined;
            updatedFields.expiryDate = undefined;
            updatedFields.archivalStatus = undefined;
            updatedFields.codeDua = undefined;
            updatedFields.category = undefined;
          }
          return {
            ...f,
            ...updatedFields
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
      setFolders((prevFolders: any[]) => prevFolders.map((f: any) => {
        const ruleActive = parseInt(String(matchedRule.activeYears || 0));
        const ruleSemi = parseInt(String(matchedRule.semiActiveYears || 0));
        const totalDua = ruleActive + ruleSemi;
        
        const dateStr = f.dateCloture || format(new Date(), 'dd/MM/yyyy');
        const yearMatch = dateStr.match(/\d{4}/) || dateStr.match(/\/(\d{2})$/);
        let year = new Date().getFullYear();
        if (yearMatch) {
          year = yearMatch[0].length === 4 ? parseInt(yearMatch[0]) : 2000 + parseInt(yearMatch[1]);
        }
        const expiryYear = year + totalDua;
        
        return {
          ...f,
          ruleId: matchedRule.id,
          direction: matchedRule.direction,
          intitule: matchedRule.title,
          codeDua: matchedRule.reference,
          category: matchedRule.category || matchedRule.docType || 'Autre',
          expiryDate: `31/12/${expiryYear}`,
          archivalStatus: new Date().getFullYear() >= expiryYear ? 'Expired' : 'Active'
        };
      }));
      setToast({ message: `Règle "${matchedRule.reference}" appliquée à tous les dossiers archivés !`, type: 'success' });
      return;
    }

    setFolders((prevFolders: any[]) => prevFolders.map((f: any) => {
      if (f.status === 'pointed') {
        const ruleActive = parseInt(String(matchedRule.activeYears || 0));
        const ruleSemi = parseInt(String(matchedRule.semiActiveYears || 0));
        const totalDua = ruleActive + ruleSemi;
        
        const dateStr = f.dateCloture || format(new Date(), 'dd/MM/yyyy');
        const yearMatch = dateStr.match(/\d{4}/) || dateStr.match(/\/(\d{2})$/);
        let year = new Date().getFullYear();
        if (yearMatch) {
          year = yearMatch[0].length === 4 ? parseInt(yearMatch[0]) : 2000 + parseInt(yearMatch[1]);
        }
        const expiryYear = year + totalDua;

        return {
          ...f,
          ruleId: matchedRule.id,
          direction: matchedRule.direction,
          intitule: matchedRule.title,
          codeDua: matchedRule.reference,
          category: matchedRule.category || matchedRule.docType || 'Autre',
          expiryDate: `31/12/${expiryYear}`,
          archivalStatus: new Date().getFullYear() >= expiryYear ? 'Expired' : 'Active'
        };
      }
      return f;
    }));
    setToast({ message: `Règle "${matchedRule.reference}" appliquée aux ${pointedCount} dossiers pointés !`, type: 'success' });
  };

  const handleValidateAllPointed = async () => {
    const pointedFolders = folders.filter((f: any) => f.status === 'pointed');
    if (pointedFolders.length === 0) {
      setToast({ message: "Aucun dossier n'est actuellement au statut 'Pointé'.", type: 'error' });
      return;
    }

    if (window.confirm(`Voulez-vous valider et stocker définitivement ces ${pointedFolders.length} dossiers pointés dans la base de l'application ?`)) {
      try {
        const updatedTime = new Date().toISOString();
        const updatedFolders = folders.map((f: any) => {
          if (f.status === 'pointed') {
            return {
              ...f,
              status: 'verified' as const,
              verifiedAt: updatedTime
            };
          }
          return f;
        });

        await api.post('/api/centralized-inventory/sync', { folders: updatedFolders, boxes });
        setFolders(updatedFolders);
        await set('ci_folders_v2', updatedFolders);
        setToast({ 
          message: `${pointedFolders.length} dossiers validés et stockés définitivement sur le serveur !`, 
          type: 'success' 
        });
      } catch (err: any) {
        setToast({ message: "Erreur de connexion : " + err.message, type: 'error' });
      }
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
    let result = folders || [];
    
    if (activeSubTab === 'pointed') {
      result = result.filter((f: any) => f.status === 'pointed');
    } else {
      // In search sub-tab, show only verified/validated dossiers in inventory
      result = result.filter((f: any) => f.status === 'verified');
    }

    if (selectedDirection !== 'all') {
      result = result.filter((f: any) => f.direction === selectedDirection);
    }

    if (q) {
      // Check if user is searching for multiple terms spaced or comma separated
      const terms = q.split(/[\s,;]+/).filter(Boolean);
      if (terms.length > 1) {
        result = result.filter((f: any) => {
          return terms.some(term => {
            const refMatch = f.reference && f.reference.toLowerCase().includes(term);
            const boxMatch = f.boxNumber && f.boxNumber.toLowerCase().includes(term);
            const dirMatch = f.direction && f.direction.toLowerCase().includes(term);
            const intituleMatch = f.intitule && f.intitule.toLowerCase().includes(term);
            const codeDuaMatch = f.codeDua && f.codeDua.toLowerCase().includes(term);
            return refMatch || boxMatch || dirMatch || intituleMatch || codeDuaMatch;
          });
        });
      } else {
        const term = terms[0];
        result = result.filter((f: any) => {
          const refMatch = f.reference && f.reference.toLowerCase().includes(term);
          const boxMatch = f.boxNumber && f.boxNumber.toLowerCase().includes(term);
          const statusMatch = (f.status === 'verified' && 'vérifié'.includes(term)) || 
                            (f.status === 'pointed' && 'pointé'.includes(term)) ||
                            (f.status === 'pending' && 'en attente'.includes(term));
          
          const dirMatch = f.direction && f.direction.toLowerCase().includes(term);
          const intituleMatch = f.intitule && f.intitule.toLowerCase().includes(term);
          const codeDuaMatch = f.codeDua && f.codeDua.toLowerCase().includes(term);
          
          let ruleMatch = false;
          if (f.ruleId) {
            const rule = (archivalRules || []).find((r: any) => String(r.id) === String(f.ruleId));
            if (rule) {
              ruleMatch = (rule.reference && rule.reference.toLowerCase().includes(term)) ||
                          (rule.title && rule.title.toLowerCase().includes(term));
            }
          }

          // Match location info
          let locMatch = false;
          if (f.boxNumber) {
            const loc = getBoxLoc(f.boxNumber).toLowerCase();
            locMatch = loc.includes(term);
          }
          
          return refMatch || boxMatch || locMatch || statusMatch || dirMatch || intituleMatch || codeDuaMatch || ruleMatch;
        });
      }
    }

    return result;
  }, [folders, debouncedSearch, boxes, activeSubTab, selectedDirection, archivalRules]);

  const totalPages = Math.ceil(filteredFolders.length / itemsPerPage);
  const paginatedFolders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredFolders.slice(start, start + itemsPerPage);
  }, [filteredFolders, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedDirection, activeSubTab]);

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
    const pointedFolders = folders.filter((f: any) => f.status === 'pointed');
    const pointedCount = pointedFolders.length;
    
    if (pointedCount === 0) {
      setToast({ message: "Aucun dossier n'est actuellement au statut 'Pointé'.", type: 'error' });
      return;
    }

    setValidationSource('');
    setShowValidationModal(true);
  };

  const handleConfirmValidation = async (e: React.FormEvent) => {
    e.preventDefault();
    const pointedFolders = folders.filter((f: any) => f.status === 'pointed');
    const pointedCount = pointedFolders.length;
    
    if (pointedCount === 0) {
      setToast({ message: "Plus aucun dossier pointé à valider.", type: 'error' });
      setShowValidationModal(false);
      return;
    }

    const uniqueBoxNumbers = Array.from(new Set(pointedFolders.map((f: any) => String(f.boxNumber || '')).filter(Boolean)));
    const boxesCount = uniqueBoxNumbers.length;
    const boxesList = uniqueBoxNumbers.join(', ');

    try {
      const updatedTime = new Date().toISOString();
      const updatedFolders = folders.map((f: any) => {
        if (f.status === 'pointed') {
          return {
            ...f,
            status: 'verified' as const,
            verifiedAt: updatedTime
          };
        }
        return f;
      });

      // 1. Enregistrer dans l'historique de validation
      await api.post('/api/centralized-inventory/validation-history', {
        foldersCount: pointedCount,
        boxesCount: boxesCount,
        boxesList: boxesList,
        source: validationSource.trim()
      });

      // 2. Synchroniser les dossiers au statut 'verified'
      await api.post('/api/centralized-inventory/sync', { folders: updatedFolders, boxes });

      setFolders(updatedFolders);
      await set('ci_folders_v2', updatedFolders);
      setShowValidationModal(false);
      setToast({ 
        message: `Succès ! ${pointedCount} dossiers de la source "${validationSource}" sont maintenant validés et enregistrés.`,
        type: 'success' 
      });
    } catch (err: any) {
      setToast({ message: "Erreur de connexion : " + err.message, type: 'error' });
    }
  };

  return (
    <div className="h-full flex flex-col p-8 bg-brand-secondary overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-brand-primary border-none m-0 tracking-tight uppercase">
            {activeSubTab === 'pointed' ? "📋 Inventaire des Dossiers Pointés" : "🔍 Recherche de Dossiers"}
          </h2>
          <p className="text-slate-400 text-sm font-medium">
            {activeSubTab === 'pointed' 
              ? "Dossiers pointés à valider pour stockage définitif" 
              : "Recherche unitaire ou multiple parmi les dossiers archivés"}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Sub tabs selectors */}
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
            <button 
              onClick={() => {
                setActiveSubTab('pointed');
                setSearch('');
              }}
              className={cn(
                "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer",
                activeSubTab === 'pointed' ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20" : "text-slate-500 hover:text-brand-primary"
              )}
            >
              <CheckSquare size={13} strokeWidth={2.5} />
              Dossiers Pointés ({folders.filter((f: any) => f.status === 'pointed').length})
            </button>
            <button 
              type="button"
              onClick={() => {
                setActiveSubTab('recherche');
                setSearch('');
              }}
              className={cn(
                "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer",
                activeSubTab === 'recherche' ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20" : "text-slate-500 hover:text-brand-primary"
              )}
            >
              <Search size={13} strokeWidth={2.5} />
              Recherche ({folders.filter((f: any) => f.status === 'verified').length})
            </button>
          </div>

          <button 
            onClick={exportInventory}
            className="flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-2xl text-xs font-black hover:opacity-90 transition-all shadow-xl shadow-brand-primary/20 cursor-pointer"
          >
            <FileDown size={18} /> EXPORTER XLS
          </button>
        </div>
      </div>

      {/* Info Banner when in pointed mode */}
      {activeSubTab === 'pointed' && (
        <div className="mb-6 p-4 rounded-3xl bg-emerald-50 border border-emerald-100/70 text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            <Sparkles size={16} />
          </div>
          <div>
            Les dossiers pointés sont enregistrés provisoirement. Cliquez sur <span className="underline font-black">Valider Inventaire</span> pour les stocker définitivement dans l'application. 
            Une fois validés, ils seront sauvegardés et masqués de cette liste active.
          </div>
        </div>
      )}

      {/* Info Banner when in recherche mode */}
      {activeSubTab === 'recherche' && (
        <div className="mb-6 p-4 rounded-3xl bg-amber-50 border border-amber-100/70 text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
            <Search size={16} />
          </div>
          <div>
            Entrez une référence ou <span className="underline font-black">plusieurs références séparées par des virgules ou des espaces</span> pour faire une recherche multi-dossiers (Ex: <span className="font-mono bg-white/60 px-1 py-0.5 rounded">2026/001, 2026/015, D024</span>).
          </div>
        </div>
      )}

      {/* Warning Banner for Unlocalized Boxes */}
      {unlocalizedBoxes.length > 0 && (
        <div className="mb-6 p-4 rounded-3xl bg-rose-50 border border-rose-150 text-[11px] font-bold text-rose-800 uppercase tracking-wider flex items-start gap-3 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0 shadow-sm">
            <AlertTriangle size={16} />
          </div>
          <div>
            <span className="font-black text-rose-900 block mb-1">⚠️ BOÎTE(S) NON LOCALISÉE(S) DANS L'INVENTAIRE :</span>
            Les boîtes suivantes contiennent des dossiers pointés ou validés mais ne possèdent pas d'emplacement physique (travée/tablette) :{" "}
            <span className="font-mono bg-white border border-rose-250 inline-flex flex-wrap gap-1 px-2 py-0.5 rounded text-rose-900 font-black">
              {unlocalizedBoxes.join(', ')}
            </span>.
            <p className="mt-1 font-medium text-rose-700 normal-case">
              Allez dans l'onglet <strong className="font-black underline">Localisation</strong> pour définir leurs coordonnées de stockage définitif.
            </p>
          </div>
        </div>
      )}

      {/* Zone de Recherche Avancée et Filtrage */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-white p-5 rounded-[2rem] border border-slate-200/80 shadow-sm text-slate-800">
        <div className="md:col-span-2 relative">
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 font-sans">
            {activeSubTab === 'recherche' ? "Rechercher une ou plusieurs références" : "Filtrer dans la liste des pointés"}
          </label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-11 pr-5 py-2 w-full bg-slate-50 border border-slate-205 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all placeholder:text-slate-400 placeholder:font-normal h-10"
              placeholder={activeSubTab === 'recherche' 
                ? "Saisir une ou plusieurs références (séparées par des espaces ou virgules)..." 
                : "Rechercher par référence, valise, boîte, intitulé..."}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 font-sans">
            Filtrer par Direction
          </label>
          <select
            value={selectedDirection}
            onChange={e => setSelectedDirection(e.target.value)}
            className="w-full bg-slate-50 border border-slate-205 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-brand-primary cursor-pointer transition-all h-10"
          >
            <option value="all">Toutes les Directions ({folders.length})</option>
            {availableDirections.map((dir: string) => {
              const count = folders.filter((f: any) => f.direction === dir).length;
              return (
                <option key={dir} value={dir}>
                  {dir} ({count})
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex flex-col justify-end">
          {activeSubTab === 'pointed' ? (
            <button 
              onClick={finalizeInventory}
              className="flex items-center justify-center gap-2 w-full h-10 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase hover:bg-emerald-700 transition-all shadow-md hover:shadow-emerald-600/20 cursor-pointer"
            >
              <FileCheck size={16} /> VALIDER INVENTAIRE ({folders.filter((f: any) => f.status === 'pointed').length})
            </button>
          ) : (
            <div className="flex items-center justify-center bg-slate-50 border border-slate-200 text-[10px] font-black uppercase rounded-xl h-10 px-4 text-slate-550 select-none">
              🔍 {filteredFolders.length} résultats trouvés
            </div>
          )}
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
                      {(() => {
                        const loc = f.boxNumber ? getBoxLoc(f.boxNumber) : 'Non localisé';
                        const isNotLocalized = !f.boxNumber || loc === 'Non localisé';
                        return (
                          <>
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center border",
                              isNotLocalized ? "bg-red-100 text-red-600 border-red-200 shadow-inner" : "bg-emerald-50 text-emerald-800 border-emerald-100"
                            )}>
                              <MapPin size={14} />
                            </div>
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest",
                              isNotLocalized ? "text-red-600 font-extrabold" : "text-brand-primary"
                            )}>
                              {!f.boxNumber 
                                ? 'Non affecté' 
                                : loc === 'Non localisé' 
                                  ? `⚠️ Boîte ${f.boxNumber} non localisée` 
                                  : loc
                              }
                            </span>
                          </>
                        );
                      })()}
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
              Affichage de {filteredFolders.length} dossiers
            </p>
            <div className="flex gap-4">
              <StatSmall label="POINTÉS" value={folders.filter((f: any) => f.status === 'pointed').length} color="text-amber-600" />
              <StatSmall label="VALIDÉS & STOCKÉS" value={folders.filter((f: any) => f.status === 'verified').length} color="text-brand-primary" />
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

        {showValidationModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden p-10 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center">
                    <CheckSquare size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-tight uppercase">
                      Clôture de l'Inventaire
                    </h3>
                    <p className="text-slate-400 text-xs font-semibold">
                      Validation définitive des dossiers pointés
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowValidationModal(false)}
                  className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleConfirmValidation} className="space-y-6">
                <div className="p-4 bg-emerald-50 border border-emerald-100/50 rounded-2xl text-xs font-bold text-emerald-800 uppercase tracking-wider space-y-2">
                  <p className="font-black text-emerald-900 text-[13px]">📦 RÉCAPITULATIF DE L'INVENTAIRE :</p>
                  <div className="flex justify-between items-center py-1 border-b border-emerald-200/40">
                    <span>Nombre de dossiers :</span>
                    <span className="font-mono text-sm font-black text-emerald-950">
                      {folders.filter((f: any) => f.status === 'pointed').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-emerald-200/40">
                    <span>Nombre de boîtes :</span>
                    <span className="font-mono text-sm font-black text-emerald-950">
                      {Array.from(new Set(folders.filter((f: any) => f.status === 'pointed').map((f: any) => f.boxNumber).filter(Boolean))).length}
                    </span>
                  </div>
                  <div className="pt-1 text-[10px] normal-case text-emerald-700 font-medium">
                    Ces dossiers deviendront officiellement validés et stockés définitivement dans la base.
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                    Source / Service de provenance (Champs obligatoire)
                  </label>
                  <input 
                    type="text"
                    required
                    value={validationSource}
                    onChange={e => setValidationSource(e.target.value)}
                    placeholder="Saisissez vous-même la source de cet inventaire..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-all font-sans"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowValidationModal(false)}
                    className="flex-1 py-4 bg-slate-100 rounded-2xl text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all font-sans"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-emerald-600 rounded-2xl text-white font-black uppercase text-xs shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all font-sans"
                  >
                    Confirmer la Validation
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

const ImportModule = ({ folders, setFolders, setBoxes, archivalRules }: any) => {
  const [resetModal, setResetModal] = useState(false);
  const [importQueue, setImportQueue] = useState<{
    id: string;
    name: string;
    size: number;
    status: 'pending' | 'processing' | 'success' | 'error';
    msg: string;
    count: number;
    folders: any[];
  }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importDirection, setImportDirection] = useState<string>('auto');
  const [customDirection, setCustomDirection] = useState<string>('');

  const availableDirections = useMemo(() => {
    const dirs = new Set<string>();
    (folders || []).forEach((f: any) => {
      if (f.direction) {
        dirs.add(f.direction.trim());
      }
    });
    (archivalRules || []).forEach((r: any) => {
      if (r.direction) {
        dirs.add(r.direction.trim());
      }
    });
    return Array.from(dirs).sort();
  }, [folders, archivalRules]);

  const activeDirection = useMemo(() => {
    if (importDirection === 'auto') return 'auto';
    if (importDirection === 'custom') return customDirection.trim();
    return importDirection;
  }, [importDirection, customDirection]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'intitule',
      'date début',
      'date fin',
      'numéro boite',
      'Localisation',
      'Source',
      'Direction',
      'Règles CC'
    ];

    const wsData = [
      headers,
      [
        '216015597',
        '31/05/2016',
        '28/11/2018',
        '6194',
        'S1-B-133',
        'D.R.SAHEL 2025',
        'Sinistres Matériels auto',
        'S.M.A.01'
      ],
      [
        '185203301',
        '01/01/2018',
        '31/12/2021',
        '4032',
        'S2-A-045',
        'D.R.CENTRE 2026',
        'Ressources Humaines',
        'R.H.03'
      ]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 15 }, // intitule
      { wch: 12 }, // date début
      { wch: 12 }, // date fin
      { wch: 15 }, // numéro boite
      { wch: 15 }, // Localisation
      { wch: 20 }, // Source
      { wch: 30 }, // Direction
      { wch: 15 }  // Règles CC
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Modèle");
    XLSX.writeFile(wb, "modele_importation_dossiers.xlsx");
  };

  const mergeImportedFolders = (currentFolders: any[], newFolders: any[]) => {
    const foldersMap = new Map<string, any>();
    (currentFolders || []).forEach(f => {
      if (f && f.reference) {
        foldersMap.set(f.reference.trim().toUpperCase(), f);
      }
    });

    (newFolders || []).forEach(f => {
      if (f && f.reference) {
        const ref = f.reference.trim().toUpperCase();
        const existing = foldersMap.get(ref);
        if (existing) {
          const status = (existing.status === 'verified' || existing.status === 'pointed') ? existing.status : (f.status || 'pending');
          foldersMap.set(ref, {
            ...existing,
            ...f,
            status,
            boxNumber: existing.boxNumber || f.boxNumber || '',
            pointedAt: existing.pointedAt || f.pointedAt || undefined,
            verifiedAt: existing.verifiedAt || f.verifiedAt || undefined,
          });
        } else {
          foldersMap.set(ref, {
            ...f,
            reference: ref,
            status: f.status || 'pending'
          });
        }
      }
    });

    return Array.from(foldersMap.values());
  };

  const autoSaveReadyFolders = useCallback(async (allSuccessfulFolders: any[]) => {
    if (allSuccessfulFolders.length === 0) return;
    setIsSyncing(true);
    try {
      const merged = mergeImportedFolders(folders, allSuccessfulFolders);
      await api.post('/api/centralized-inventory/sync', { folders: merged, boxes: [] });
      setFolders(merged);
      await set('ci_folders_v2', merged);
    } catch (err) {
      console.error("Connection error during auto-sync:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [folders, setFolders]);

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    const newQueueEntries = files.map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: file.name,
      size: file.size,
      status: 'pending' as const,
      msg: 'En attente...',
      count: 0,
      folders: []
    }));

    setImportQueue(prev => [...prev, ...newQueueEntries]);

    const successfullyExtractedFolders: any[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const entryId = newQueueEntries[i].id;

      setImportQueue(prev => prev.map(item => item.id === entryId ? { ...item, status: 'processing', msg: 'Analyse en cours...' } : item));

      try {
        const foldersExtracted = await new Promise<any[]>((resolve, reject) => {
          const worker = new Worker(new URL('../../workers/excel.worker.ts', import.meta.url), { type: 'module' });
          worker.onerror = (err) => {
            console.error("Worker error during multi-import:", err);
            worker.terminate();
            reject(new Error("Format de fichier non supporté."));
          };
          worker.onmessage = (event) => {
            const { success, folders: newFolders, error } = event.data;
            worker.terminate();
            if (success) {
              resolve(newFolders);
            } else {
              reject(new Error(error || "Échec d'analyse."));
            }
          };
          worker.postMessage({ file });
        });

        const enriched = foldersExtracted.map((folder: any) => {
          const ruleRef = folder.codeDua || '';
          const matchedRule = (archivalRules || []).find((r: any) => {
            if (!r || !r.reference) return false;
            const rNormalized = r.reference.replace(/[\s\.]/g, '').toUpperCase();
            const fNormalized = ruleRef.replace(/[\s\.]/g, '').toUpperCase();
            return rNormalized === fNormalized;
          });

          // Determine direction
          let finalDirection = folder.direction || 'Indéfinie';
          if (activeDirection !== 'auto') {
            finalDirection = activeDirection || 'Indéfinie';
          } else if (matchedRule && matchedRule.direction) {
            finalDirection = matchedRule.direction;
          }

          if (matchedRule) {
            const ruleActive = parseInt(String(matchedRule.activeYears || 0));
            const ruleSemi = parseInt(String(matchedRule.semiActiveYears || 0));
            const folderDate = folder.dateCloture;
            
            let year = 0;
            if (folderDate.includes('/')) {
              year = parseInt(folderDate.split('/').pop() || '0');
            } else if (folderDate.includes('-')) {
              year = parseInt(folderDate.split('-').shift() || '0');
            } else {
              year = parseInt(folderDate);
            }

            let expiryDate = null;
            let archivalStatus = 'Active';
            if (!isNaN(year) && year > 0) {
              const expiryYear = year + ruleActive + ruleSemi;
              expiryDate = String(expiryYear);
              const currentYear = new Date().getFullYear();
              archivalStatus = currentYear >= expiryYear ? 'Expired' : 'Active';
            }

            return {
              ...folder,
              ruleId: matchedRule.id,
              direction: finalDirection,
              intitule: folder.intitule || matchedRule.title || `Dossier ${folder.reference}`,
              category: matchedRule.category || matchedRule.docType || 'Autre',
              expiryDate,
              archivalStatus
            };
          } else {
            return {
              ...folder,
              direction: finalDirection,
              intitule: folder.intitule || `Dossier ${folder.reference}`,
              category: 'Inconnue',
              archivalStatus: 'Active'
            };
          }
        });

        successfullyExtractedFolders.push(...enriched);

        setImportQueue(prev => prev.map(item => item.id === entryId ? { 
          ...item, 
          status: 'success', 
          msg: `${enriched.length} dossiers extraits`, 
          count: enriched.length,
          folders: enriched 
        } : item));

      } catch (err: any) {
        setImportQueue(prev => prev.map(item => item.id === entryId ? { 
          ...item, 
          status: 'error', 
          msg: err.message || "Erreur de format"
        } : item));
      }
    }

    if (successfullyExtractedFolders.length > 0) {
      await autoSaveReadyFolders(successfullyExtractedFolders);
    }
  }, [archivalRules, autoSaveReadyFolders, activeDirection]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void processFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files).filter((f: any) => 
        f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
      );
      if (filesArray.length === 0) {
        alert("Veuillez déposer uniquement des fichiers Excel (.xlsx, .xls) ou CSV (.csv).");
        return;
      }
      void processFiles(filesArray);
    }
  };

  const clearQueueItem = (id: string) => {
    setImportQueue(prev => prev.filter(item => item.id !== id));
  };

  const clearAllQueue = () => {
    setImportQueue([]);
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

  const parsedFoldersList = useMemo(() => {
    const list: any[] = [];
    importQueue.forEach(item => {
      if (item.status === 'success' && item.folders) {
        list.push(...item.folders);
      }
    });
    return list;
  }, [importQueue]);

  const statsReport = useMemo(() => {
    const directions: { [key: string]: number } = {};
    const categories: { [key: string]: number } = {};
    const duaCodes: { [key: string]: number } = {};
    let matchedCount = 0;

    parsedFoldersList.forEach(f => {
      const dir = f.direction || 'Indéfinie';
      directions[dir] = (directions[dir] || 0) + 1;

      const cat = f.category || 'Inconnue';
      categories[cat] = (categories[cat] || 0) + 1;

      const dua = f.codeDua || 'Inconnu';
      duaCodes[dua] = (duaCodes[dua] || 0) + 1;

      if (f.ruleId) matchedCount++;
    });

    const total = parsedFoldersList.length;
    const directionsArr = Object.entries(directions).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count);
    const categoriesArr = Object.entries(categories).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count);
    const duaCodesArr = Object.entries(duaCodes).map(([code, count]) => ({ code, count })).sort((a,b) => b.count - a.count);

    return {
      total,
      matched: matchedCount,
      unmatched: total - matchedCount,
      percentMatched: total ? Math.round((matchedCount / total) * 100) : 0,
      directions: directionsArr,
      categories: categoriesArr,
      duaCodes: duaCodesArr
    };
  }, [parsedFoldersList]);

  return (
    <div className="h-full flex flex-col p-6 bg-brand-secondary overflow-y-auto">
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-16 text-slate-800">
        
        {/* Process Flow Pipeline */}
        <div className="lg:col-span-12 bg-white border border-slate-200/80 rounded-[2.5rem] p-8 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                <Sparkles size={11} className="animate-spin duration-1000" />
                Pipeline d'ingestion intelligent
              </span>
              <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase m-0 flex items-center gap-2">
                Le cycle de vie de l'importation de masse
              </h2>
              <p className="text-slate-400 text-xs font-semibold leading-relaxed uppercase tracking-wider">
                Suivez les 6 étapes de traitement automatisé pour assurer la conformité absolue de votre archivage
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Traitement temps réel
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 relative">
            {/* Step 1 */}
            <div className="relative bg-slate-50/50 hover:bg-white hover:shadow-xl hover:shadow-slate-100 border border-slate-200/60 p-5 rounded-[2rem] transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center font-black text-sm group-hover:scale-105 transition-transform">
                    01
                  </div>
                  <FileUp className="text-brand-primary opacity-60" size={20} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-black text-slate-800 leading-snug">Importation Excel</h3>
                  <p className="text-slate-500 text-[11px] font-medium leading-relaxed">
                    Importation d’un ou plusieurs fichiers Excel contenant les dossiers et les métadonnées d’inventaire.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100/80 text-[10px] font-bold text-brand-primary flex items-center gap-1.5 uppercase">
                <Check className="text-emerald-500" size={13} />
                Vérification auto.
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative bg-slate-50/50 hover:bg-white hover:shadow-xl hover:shadow-slate-100 border border-slate-200/60 p-5 rounded-[2rem] transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center font-black text-sm group-hover:scale-105 transition-transform">
                    02
                  </div>
                  <FileCheck className="text-indigo-500 opacity-60" size={20} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-black text-slate-800 leading-snug">Choix du calendrier</h3>
                  <p className="text-slate-500 text-[11px] font-medium leading-relaxed">
                    Sélection du calendrier de conservation correspondant à la direction ou au type d’archives pour le classement DUA.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100/80 text-[10px] font-bold text-indigo-600 flex items-center gap-1.5 uppercase">
                <Check className="text-emerald-500" size={13} />
                Délais et sort final
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative bg-slate-50/50 hover:bg-white hover:shadow-xl hover:shadow-slate-100 border border-slate-200/60 p-5 rounded-[2rem] transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center font-black text-sm group-hover:scale-105 transition-transform">
                    03
                  </div>
                  <Database className="text-amber-500 opacity-60" size={20} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-black text-slate-800 leading-snug">Génération codes boîtes</h3>
                  <p className="text-slate-500 text-[11px] font-medium leading-relaxed">
                    Production automatique (ex: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-[10px]">Sin.M.001</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-[10px]">Compta.001</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-[10px]">Prod.001</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-[10px]">RH.001</code>) ou importation directe.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100/80 text-[10px] font-bold text-amber-600 flex items-center gap-1.5 uppercase">
                <Check className="text-emerald-500" size={13} />
                Double mode boîte
              </div>
            </div>

            {/* Step 4 */}
            <div className="relative bg-slate-50/50 hover:bg-white hover:shadow-xl hover:shadow-slate-100 border border-slate-200/60 p-5 rounded-[2rem] transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center font-black text-sm group-hover:scale-105 transition-transform">
                    04
                  </div>
                  <Scan className="text-emerald-500 opacity-60" size={20} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-black text-slate-800 leading-snug">Création codes-barres</h3>
                  <p className="text-slate-500 text-[11px] font-medium leading-relaxed">
                    Génération automatique de codes-barres uniques pour chaque boîte cible et planches d'étiquettes prêtes pour impression physique.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100/80 text-[10px] font-bold text-emerald-600 flex items-center gap-1.5 uppercase">
                <Check className="text-emerald-500" size={13} />
                Impression directe
              </div>
            </div>

            {/* Step 5 */}
            <div className="relative bg-slate-50/50 hover:bg-white hover:shadow-xl hover:shadow-slate-100 border border-slate-200/60 p-5 rounded-[2rem] transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center font-black text-sm group-hover:scale-105 transition-transform">
                    05
                  </div>
                  <CheckCircle2 className="text-teal-500 opacity-60" size={20} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-black text-slate-800 leading-snug">Validation de l’inventaire</h3>
                  <p className="text-slate-500 text-[11px] font-medium leading-relaxed">
                    Contrôle de classification et validation des dossiers consolidés avant enregistrement permanent consultable.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100/80 text-[10px] font-bold text-teal-600 flex items-center gap-1.5 uppercase">
                <Check className="text-emerald-500" size={13} />
                Stockage applicatif
              </div>
            </div>

            {/* Step 6 */}
            <div className="relative bg-slate-50/50 hover:bg-white hover:shadow-xl hover:shadow-slate-100 border border-slate-200/60 p-5 rounded-[2rem] transition-all flex flex-col justify-between group">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center font-black text-sm group-hover:scale-105 transition-transform">
                    06
                  </div>
                  <MapPin className="text-rose-500 opacity-60" size={20} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-black text-slate-800 leading-snug">Localisation & Stockage</h3>
                  <p className="text-slate-500 text-[11px] font-medium leading-relaxed">
                    Affectation des coordonnées physiques de rangement : Salle, Rayon, Travée, Étagère, Niveau pour confirmation finale.
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100/80 text-[10px] font-bold text-rose-600 flex items-center gap-1.5 uppercase">
                <Check className="text-emerald-500" size={13} />
                Positionnement physique
              </div>
            </div>
          </div>
        </div>

        {/* Left Column: Input and Files queue controls */}
        <div className="lg:col-span-7 space-y-6">
          <div className="space-y-1">
             <h2 className="text-2xl font-black text-brand-primary border-none m-0 tracking-tight uppercase flex items-center gap-3">
               <Database size={24} className="text-brand-primary" /> MANAGEMENT DES SOURCES
             </h2>
             <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Moteur d'importation multiple haute-performance</p>
          </div>

          {/* Direction selector */}
          <div className="bg-white border border-slate-200/80 rounded-[2rem] p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
              <label className="text-xs font-black text-slate-600 uppercase tracking-widest font-sans">
                Direction / Service cible
              </label>
            </div>
            
            <p className="text-slate-400 text-[11px] font-semibold leading-relaxed uppercase tracking-wider">
              Associer une direction par défaut ou forcer une direction pour tous les dossiers importés
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <select
                  value={importDirection}
                  onChange={(e) => setImportDirection(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-brand-primary cursor-pointer transition-all h-10"
                >
                  <option value="auto">📍 Détection automatique (fichiers/DUA)</option>
                  <option value="custom">✍️ Saisir une direction personnalisée...</option>
                  <option disabled className="text-slate-305 font-bold">--- Directions existantes ---</option>
                  {availableDirections.map((dir: string) => (
                    <option key={dir} value={dir}>
                      🏢 {dir}
                    </option>
                  ))}
                </select>
              </div>

              {importDirection === 'custom' && (
                <div className="relative">
                  <input
                    type="text"
                    value={customDirection}
                    onChange={(e) => setCustomDirection(e.target.value)}
                    placeholder="Saisir la direction..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 h-10 focus:outline-none focus:border-brand-primary transition-all font-sans"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Structure des colonnes attendues */}
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-[2rem] p-6 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="text-emerald-500" size={16} />
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest font-sans">Structure obligatoire du tableur (8 Colonnes)</h3>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm shrink-0 font-sans cursor-pointer self-start sm:self-center"
              >
                <FileDown size={14} />
                Télécharger le modèle Excel (.xlsx)
              </button>
            </div>
            <p className="text-slate-400 text-[10px] font-semibold leading-relaxed uppercase tracking-wider">
              Votre tableur excel doit toujours comporter exactement la structure de colonnes suivante :
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse bg-white rounded-xl overflow-hidden border border-slate-100 text-[10px] font-sans font-bold">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200">
                    <th className="px-3 py-2 text-slate-600 font-black border-r border-slate-200 font-sans">intitule</th>
                    <th className="px-3 py-2 text-slate-600 font-black border-r border-slate-200 font-sans">date début</th>
                    <th className="px-3 py-2 text-slate-600 font-black border-r border-slate-200 font-sans">date fin</th>
                    <th className="px-3 py-2 text-slate-600 font-black border-r border-slate-200 font-sans">numéro boite</th>
                    <th className="px-3 py-2 text-slate-600 font-black border-r border-slate-200 font-sans">Localisation</th>
                    <th className="px-3 py-2 text-slate-600 font-black border-r border-slate-200 font-sans">Source</th>
                    <th className="px-3 py-2 text-slate-600 font-black border-r border-slate-200 font-sans">Direction</th>
                    <th className="px-3 py-2 text-slate-600 font-black font-sans">Règles CC</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white text-slate-400">
                    <td className="px-3 py-2 border-r border-slate-100 text-slate-800 font-mono">216015597</td>
                    <td className="px-3 py-2 border-r border-slate-100">31/05/2016</td>
                    <td className="px-3 py-2 border-r border-slate-100">28/11/2018</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-slate-700 font-mono">6194</td>
                    <td className="px-3 py-2 border-r border-slate-100">S1-B-133</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-left truncate max-w-[100px]">D.R.SAHEL 2025</td>
                    <td className="px-3 py-2 border-r border-slate-100 text-left truncate max-w-[120px]">Sinistres Matériels auto</td>
                    <td className="px-3 py-2 font-mono text-brand-primary">S.M.A.01</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* DND Drag Zone */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-[2.5rem] p-10 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[220px] shadow-sm",
              isDragging 
                ? "bg-brand-primary/10 border-brand-primary scale-[0.98]" 
                : "bg-white border-slate-200 hover:border-brand-primary hover:bg-slate-50/50"
            )}
          >
            <div className="w-16 h-16 bg-brand-secondary text-brand-primary rounded-3xl flex items-center justify-center mb-4 border border-brand-primary/10">
              <FileUp size={28} />
            </div>
            <p className="text-base font-black text-slate-800">ZONE D'IMPORTATION MULTIPLE</p>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mt-1 text-center">
              Déposez plusieurs fichiers ou cliquez pour sélectionner (.xlsx, .xls, .csv)
            </p>
            <input 
              ref={fileRef} 
              type="file" 
              hidden 
              multiple 
              accept=".xlsx,.xls,.csv" 
              onChange={handleImport} 
            />
          </div>

          {/* Import Queue Monitor */}
          {importQueue.length > 0 && (
            <div className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
                  <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest">Fichiers en cours de traitement</h3>
                </div>
                <button 
                  onClick={clearAllQueue}
                  className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest font-sans transition-colors"
                >
                  Vider la file
                </button>
              </div>

              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {importQueue.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50/80 rounded-2xl border border-slate-100 font-sans">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex-shrink-0">
                        {item.status === 'success' && <CheckCircle2 className="text-emerald-500" size={18} />}
                        {item.status === 'error' && <XCircle className="text-red-500" size={18} />}
                        {item.status === 'processing' && <RefreshCw className="text-brand-primary animate-spin" size={18} />}
                        {item.status === 'pending' && <FileText className="text-slate-400" size={18} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-slate-700 truncate">{item.name}</div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
                          <span>{formatFileSize(item.size)}</span>
                          <span>•</span>
                          <span className={cn(
                            item.status === 'success' && "text-emerald-600",
                            item.status === 'error' && "text-red-500",
                            item.status === 'processing' && "text-brand-primary animate-pulse"
                          )}>
                            {item.msg}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); clearQueueItem(item.id); }}
                      className="p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all font-sans"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions Panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 bg-white border border-slate-200 rounded-[2rem] shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-2">
                  <FileText className="text-brand-primary" size={16} /> Rapport d'export
                </h3>
                <p className="text-slate-400 text-xs font-medium mb-4">Générer un tableur des éléments confirmés</p>
              </div>
              <button 
                onClick={exportPointed}
                className="w-full py-3.5 bg-brand-primary text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-brand-primary/10 hover:opacity-90 transition-all"
              >
                Exporter dossiers pointés
              </button>
            </div>

            <div className="p-6 bg-red-50/40 border border-red-100 rounded-[2rem] flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-black text-red-600 uppercase tracking-widest mb-1 flex items-center gap-2">
                  <Trash2 size={14} /> Zone de maintenance
                </h4>
                <p className="text-slate-400 text-[11px] font-medium mb-4">Vider ou initialiser le stockage maître</p>
              </div>
              <button 
                onClick={() => setResetModal(true)}
                className="w-full py-3 bg-white border border-red-200 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-red-50 transition-all shadow-sm"
              >
                Initialisation Complète
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Intelligent Analytics and Organization */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 bg-brand-primary rounded-[2.5rem] text-white shadow-xl shadow-brand-primary/25 relative overflow-hidden group">
             <div className="relative z-10 space-y-2">
                <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Base de données</p>
                <div className="text-4xl font-black">{folders.length.toLocaleString()}</div>
                <div className="flex items-center gap-2">
                  {isSyncing ? (
                    <span className="text-[10px] font-bold text-white/80 bg-white/10 px-2.5 py-1 rounded-full uppercase flex items-center gap-1.5 animate-pulse">
                      <RefreshCw className="animate-spin" size={10} /> Enregistrement automatique...
                    </span>
                  ) : (
                    <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase flex items-center gap-1.5">
                      <Check size={10} /> Synchronisé & Sécurisé
                    </span>
                  )}
                </div>
             </div>
             <Database className="absolute -bottom-10 -right-10 text-white/5 group-hover:scale-105 transition-transform duration-700" size={150} />
          </div>

          {/* Analysis Report */}
          <div className="p-6 bg-white border border-slate-200 rounded-[2.5rem] shadow-sm space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 bg-brand-secondary text-brand-primary rounded-xl flex items-center justify-center">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest font-sans">SYNTHÈSE DU PORTFOLIO</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Classification de la file en temps réel</p>
              </div>
            </div>

            {statsReport.total > 0 ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50/60 rounded-2xl border border-slate-100">
                    <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Dossiers Importés</span>
                    <span className="text-2xl font-black text-slate-700">{statsReport.total}</span>
                  </div>
                  <div className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100">
                    <span className="block text-[9px] font-black uppercase text-emerald-600 tracking-wider">Auto-Classés DUA</span>
                    <span className="text-2xl font-black text-emerald-700">{statsReport.matched}</span>
                    <span className="block text-[9px] font-bold text-emerald-600 mt-1 uppercase">Taux : {statsReport.percentMatched}%</span>
                  </div>
                </div>

                {/* Directions Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest font-sans">Organisés par Direction/Service</h4>
                  <div className="space-y-2">
                    {statsReport.directions.map((dir: any) => {
                      const share = Math.round((dir.count / statsReport.total) * 100);
                      return (
                        <div key={dir.name} className="space-y-1">
                          <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                            <span className="max-w-[200px] truncate">{dir.name}</span>
                            <span>{dir.count} dossiers ({share}%)</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-brand-primary h-full rounded-full transition-all duration-500" style={{ width: `${share}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Categories Breakdown */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest font-sans">Organisés par Catégorie Documentaire</h4>
                  <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                    {statsReport.categories.map((cat: any) => (
                      <div key={cat.name} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-xl text-xs border border-slate-100">
                        <span className="font-bold text-slate-600 truncate max-w-[220px]">{cat.name}</span>
                        <span className="font-black text-slate-400 bg-white border px-2 py-0.5 rounded-full text-[10px]">{cat.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Codes DUA Breakdown */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest font-sans">Codes DUA / Règles Détectés</h4>
                  <div className="flex flex-wrap gap-1.5 max-h-[130px] overflow-y-auto pr-1">
                    {statsReport.duaCodes.map((dua: any) => (
                      <div key={dua.code} className="text-[10px] font-sans font-bold bg-slate-50 border border-slate-100 text-slate-500 px-2.5 py-1 rounded-lg flex items-center gap-2">
                        <span className="font-mono text-slate-700">{dua.code}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                        <span>{dua.count}x</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 space-y-2">
                <Archive size={32} className="mx-auto text-slate-300 animate-bounce" />
                <p className="text-xs font-bold uppercase tracking-wider">Aucune donnée active</p>
                <p className="text-[10px] max-w-[220px] mx-auto text-slate-400 leading-normal">
                  Dès que vous importerez des fichiers d'inventaire, le diagnostic de classification s'affichera ici.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Full Preview of Extracted Folders */}
        {parsedFoldersList.length > 0 && (
          <div className="lg:col-span-12 bg-white rounded-[2.5rem] border border-slate-200/80 overflow-hidden shadow-sm mt-4 w-full">
            <div className="px-10 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest m-0 flex items-center gap-2">
                  <Database size={14} className="text-brand-primary" /> APERÇU CONSOLIDÉ DES ENREGISTREMENTS ({parsedFoldersList.length})
                </h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Aperçu en temps réel des 12 premières lignes</p>
              </div>
              <span className="text-[10px] font-black text-brand-primary bg-brand-secondary px-3 py-1 rounded-full uppercase border border-brand-primary/10">Synchronisation SQLite active</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/30">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Intitule (Réf)</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Date Début</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Date Fin</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Numéro Boite</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Localisation</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Source</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Direction</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Règles CC</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Statut Conservation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedFoldersList.slice(0, 12).map((f: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs font-black text-slate-800">{f.intitule || f.reference}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">{f.dateDebut || <span className="opacity-30 italic">-</span>}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">{f.dateCloture || <span className="opacity-30 italic">-</span>}</td>
                      <td className="px-6 py-4 text-xs font-black text-slate-600">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{f.boxNumber || <span className="opacity-30 italic">-</span>}</span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">{f.localisation || <span className="opacity-30 italic">-</span>}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-500 truncate max-w-[150px]">{f.source || <span className="opacity-30 italic">-</span>}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">{f.direction || <span className="opacity-40 italic text-red-500">Indéfinie</span>}</td>
                      <td className="px-6 py-4 text-xs font-mono font-bold text-slate-700 bg-slate-55">{f.codeDua || <span className="opacity-40 italic text-red-500">Introuvable</span>}</td>
                      <td className="px-6 py-4 text-xs">
                        {f.ruleId ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wide">Classé</span>
                            {f.expiryDate && (
                              <span className="text-[9px] font-mono font-bold text-slate-400">
                                Élimination {f.expiryDate}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md uppercase border border-amber-200/50">Règle inconnue</span>
                        )}
                      </td>
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
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl p-10 font-sans text-slate-800 font-bold">
               <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                 <RefreshCw size={32} />
               </div>
               <h3 className="text-xl font-black text-slate-900 mb-4 border-none m-0">RÉINITIALISATION</h3>
               <p className="text-sm font-medium text-slate-400 mb-8 leading-relaxed font-sans font-normal">Choisissez le niveau de nettoyage souhaité pour votre base de données locale.</p>
               
               <div className="space-y-3 font-sans">
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
