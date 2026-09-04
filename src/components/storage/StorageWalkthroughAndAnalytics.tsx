import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  Layers, 
  Box, 
  Compass, 
  Eye, 
  Sparkles, 
  ArrowRight, 
  ArrowLeft, 
  RotateCcw, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  BarChart3, 
  PieChart as PieIcon, 
  FileSpreadsheet, 
  Sliders, 
  Maximize2, 
  Info, 
  MapPin, 
  Search, 
  Activity, 
  Flame, 
  ShieldCheck, 
  ChevronRight,
  TrendingUp,
  Tag,
  FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface BoxAllocation {
  id: string;
  boxNumber: string;
  shelfId: string;
  bayId?: string;
  roomId?: string;
  batchId?: string;
  inventoryRef?: string;
  direction?: string;
  folderCount?: number;
  notes?: string;
  createdAt?: string;
}

interface StorageShelf {
  id: string;
  bayId: string;
  roomId: string;
  name: string;
  code: string;
  shelfNumber: number;
  boxCapacity: number;
  storedBoxesCount: number;
  availableCapacity: number;
  occupancyRate: number;
  status: 'pleine' | 'partielle' | 'disponible';
  boxes: BoxAllocation[];
}

interface StorageBay {
  id: string;
  roomId: string;
  name: string;
  code: string;
  bayNumber: number;
  description?: string;
  shelvesCount: number;
  totalCapacity: number;
  storedBoxesCount: number;
  availableCapacity: number;
  occupancyRate: number;
  status: 'pleine' | 'partielle' | 'disponible';
  shelves: StorageShelf[];
}

interface StorageRoom {
  id: string;
  name: string;
  code: string;
  building?: string;
  description?: string;
  baysCount: number;
  totalCapacity: number;
  storedBoxesCount: number;
  availableCapacity: number;
  occupancyRate: number;
  status: 'saturée' | 'occupée' | 'disponible';
  bays: StorageBay[];
}

interface Props {
  rooms: StorageRoom[];
  selectedRoomId: string;
  onSelectRoom: (id: string) => void;
  onInspectBox?: (box: any) => void;
}

// Palette of distinct vivid colors for directions
const DIRECTION_COLORS: { [key: string]: { bg: string; border: string; text: string; lightBg: string; hex: string } } = {
  'Sinistres': { bg: 'bg-amber-500', border: 'border-amber-400', text: 'text-amber-900', lightBg: 'bg-amber-50', hex: '#f59e0b' },
  'Sinistres Auto': { bg: 'bg-amber-600', border: 'border-amber-500', text: 'text-amber-950', lightBg: 'bg-amber-50', hex: '#d97706' },
  'Sinistres Corporels': { bg: 'bg-orange-500', border: 'border-orange-400', text: 'text-orange-950', lightBg: 'bg-orange-50', hex: '#f97316' },
  'Direction Financière': { bg: 'bg-blue-600', border: 'border-blue-400', text: 'text-blue-900', lightBg: 'bg-blue-50', hex: '#2563eb' },
  'Finance': { bg: 'bg-blue-500', border: 'border-blue-400', text: 'text-blue-900', lightBg: 'bg-blue-50', hex: '#3b82f6' },
  'Comptabilité': { bg: 'bg-cyan-600', border: 'border-cyan-400', text: 'text-cyan-900', lightBg: 'bg-cyan-50', hex: '#0891b2' },
  'Ressources Humaines': { bg: 'bg-emerald-600', border: 'border-emerald-400', text: 'text-emerald-950', lightBg: 'bg-emerald-50', hex: '#059669' },
  'RH': { bg: 'bg-emerald-500', border: 'border-emerald-400', text: 'text-emerald-950', lightBg: 'bg-emerald-50', hex: '#10b981' },
  'Direction Générale': { bg: 'bg-purple-600', border: 'border-purple-400', text: 'text-purple-950', lightBg: 'bg-purple-50', hex: '#9333ea' },
  'Contentieux': { bg: 'bg-rose-600', border: 'border-rose-400', text: 'text-rose-950', lightBg: 'bg-rose-50', hex: '#e11d48' },
  'Juridique': { bg: 'bg-red-600', border: 'border-red-400', text: 'text-red-950', lightBg: 'bg-red-50', hex: '#dc2626' },
  'Direction Médicale': { bg: 'bg-teal-600', border: 'border-teal-400', text: 'text-teal-950', lightBg: 'bg-teal-50', hex: '#0d9488' },
  'Production': { bg: 'bg-indigo-600', border: 'border-indigo-400', text: 'text-indigo-950', lightBg: 'bg-indigo-50', hex: '#4f46e5' },
  'Informatique': { bg: 'bg-sky-600', border: 'border-sky-400', text: 'text-sky-950', lightBg: 'bg-sky-50', hex: '#0284c7' },
  'Souscription': { bg: 'bg-violet-600', border: 'border-violet-400', text: 'text-violet-950', lightBg: 'bg-violet-50', hex: '#7c3aed' },
  'Default': { bg: 'bg-slate-700', border: 'border-slate-500', text: 'text-slate-900', lightBg: 'bg-slate-100', hex: '#475569' }
};

const getDirectionColor = (dirName?: string) => {
  if (!dirName) return DIRECTION_COLORS['Default'];
  const trimmed = dirName.trim();
  for (const key of Object.keys(DIRECTION_COLORS)) {
    if (trimmed.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(trimmed.toLowerCase())) {
      return DIRECTION_COLORS[key];
    }
  }
  return DIRECTION_COLORS['Default'];
};

export const StorageWalkthroughAndAnalytics: React.FC<Props> = ({
  rooms,
  selectedRoomId,
  onSelectRoom,
  onInspectBox
}) => {
  // Navigation & Sub-mode states
  const [activeTab, setActiveTab] = useState<'walkthrough' | 'directions_stats' | 'heatmap'>('walkthrough');
  const [selectedDirectionHighlight, setSelectedDirectionHighlight] = useState<string | null>(null);
  
  // 3D Walkthrough View controls
  const [walkAisleIndex, setWalkAisleIndex] = useState(0); // 0 = Aisle 1 (Bays 0 & 1), 1 = Aisle 2 (Bays 2 & 3)...
  const [walkCameraAngle, setWalkCameraAngle] = useState<'perspective' | 'left_rack' | 'right_rack' | 'top_down'>('perspective');
  const [walkZoomLevel, setWalkZoomLevel] = useState<'standard' | 'close_up'>('standard');
  const [highlightStatus, setHighlightStatus] = useState<'all' | 'full_only' | 'empty_only' | 'available_only'>('all');
  const [activeHoverShelf, setActiveHoverShelf] = useState<StorageShelf | null>(null);

  const selectedRoom = useMemo(() => {
    return rooms.find(r => r.id === selectedRoomId) || rooms[0] || null;
  }, [rooms, selectedRoomId]);

  // Aggregate Direction-Specific Analytics across all rooms or selected room
  const directionStats = useMemo(() => {
    const map = new Map<string, {
      direction: string;
      totalBoxes: number;
      totalFolders: number;
      shelvesSet: Set<string>;
      baysSet: Set<string>;
      roomsSet: Set<string>;
      allocations: BoxAllocation[];
      linearMeters: number;
    }>();

    let grandTotalBoxes = 0;
    let grandTotalFolders = 0;

    rooms.forEach(r => {
      r.bays?.forEach(b => {
        b.shelves?.forEach(s => {
          s.boxes?.forEach(bx => {
            const rawDir = bx.direction?.trim() || 'Archives Générales';
            grandTotalBoxes++;
            grandTotalFolders += (bx.folderCount || 1);

            if (!map.has(rawDir)) {
              map.set(rawDir, {
                direction: rawDir,
                totalBoxes: 0,
                totalFolders: 0,
                shelvesSet: new Set<string>(),
                baysSet: new Set<string>(),
                roomsSet: new Set<string>(),
                allocations: [],
                linearMeters: 0
              });
            }

            const item = map.get(rawDir)!;
            item.totalBoxes += 1;
            item.totalFolders += (bx.folderCount || 1);
            item.shelvesSet.add(s.id);
            item.baysSet.add(b.id);
            item.roomsSet.add(r.id);
            item.allocations.push({ ...bx, roomId: r.id, bayId: b.id });
          });
        });
      });
    });

    const totalStorageCapacity = rooms.reduce((acc, r) => acc + (r.totalCapacity || 0), 0);
    const totalShelvesInDepot = rooms.reduce((acc, r) => acc + r.bays.reduce((bAcc, b) => bAcc + b.shelves.length, 0), 0);

    const result = Array.from(map.values()).map(entry => {
      const color = getDirectionColor(entry.direction);
      const occupancyShare = grandTotalBoxes > 0 ? Math.round((entry.totalBoxes / grandTotalBoxes) * 100) : 0;
      const depotCapacityShare = totalStorageCapacity > 0 ? Math.round((entry.totalBoxes / totalStorageCapacity) * 100) : 0;
      const shelfCoveragePercent = totalShelvesInDepot > 0 ? Math.round((entry.shelvesSet.size / totalShelvesInDepot) * 100) : 0;
      // 1 standard archive box = ~0.125 linear meters (8 boxes per meter)
      const linearMeters = +(entry.totalBoxes * 0.125).toFixed(2);

      return {
        direction: entry.direction,
        totalBoxes: entry.totalBoxes,
        totalFolders: entry.totalFolders,
        shelvesCount: entry.shelvesSet.size,
        baysCount: entry.baysSet.size,
        roomsCount: entry.roomsSet.size,
        linearMeters,
        occupancyShare,
        depotCapacityShare,
        shelfCoveragePercent,
        color,
        allocations: entry.allocations
      };
    });

    // Sort descending by total boxes
    result.sort((a, b) => b.totalBoxes - a.totalBoxes);

    return {
      items: result,
      grandTotalBoxes,
      grandTotalFolders,
      totalStorageCapacity,
      totalShelvesInDepot
    };
  }, [rooms]);

  // Group bays into aisles (Allées : 2 travées par allée en vis-à-vis)
  const aisles = useMemo(() => {
    if (!selectedRoom || !selectedRoom.bays) return [];
    const bayList = selectedRoom.bays;
    const aisleGroups: { aisleNumber: number; leftBay: StorageBay; rightBay?: StorageBay }[] = [];
    
    for (let i = 0; i < bayList.length; i += 2) {
      aisleGroups.push({
        aisleNumber: Math.floor(i / 2) + 1,
        leftBay: bayList[i],
        rightBay: bayList[i + 1] || undefined
      });
    }
    return aisleGroups;
  }, [selectedRoom]);

  const currentAisle = useMemo(() => {
    if (aisles.length === 0) return null;
    const idx = Math.min(walkAisleIndex, aisles.length - 1);
    return aisles[idx] || aisles[0];
  }, [aisles, walkAisleIndex]);

  // Export Direction Statistics to Excel
  const handleExportStats = () => {
    try {
      const rows = directionStats.items.map(d => ({
        'Direction Versante': d.direction,
        'Nombre de Boîtes': d.totalBoxes,
        'Nombre de Dossiers': d.totalFolders,
        'Tablettes Occupées': d.shelvesCount,
        'Travées Impliquées': d.baysCount,
        'Salles Impliquées': d.roomsCount,
        'Mètres Linéaires (ml)': d.linearMeters,
        '% Part du Stockage': `${d.occupancyShare}%`,
        '% Capacité Totale Dépôt': `${d.depotCapacityShare}%`
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stats_Stockage_Directions');
      XLSX.writeFile(wb, `Statistiques_Stockage_Directions_Morneguia_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 text-slate-800 animate-fadeIn font-sans">
      
      {/* Dynamic Sub-header Navigation */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 lg:p-6 shadow-xl border border-indigo-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-black uppercase tracking-wider">
            <Compass size={16} className="text-indigo-400 animate-pulse" />
            <span>Digital Twin · Visite Spatiale & Statistiques par Direction</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Navigation Virtuelle & Cartographie d'Occupation
          </h2>
          <p className="text-xs text-indigo-200/90 max-w-2xl">
            Promenez-vous virtuellement dans les allées des dépôts de Morneguia. Visualisez en temps réel les rayonnages pleins, partiels et vides, et analysez l'occupation exacte par Direction versante.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-2xl border border-indigo-500/30 shrink-0">
          <button
            onClick={() => setActiveTab('walkthrough')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'walkthrough' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950' 
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Compass size={14} />
            <span>Visite Allées 3D</span>
          </button>

          <button
            onClick={() => setActiveTab('directions_stats')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'directions_stats' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950' 
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChart3 size={14} />
            <span>Stats par Direction</span>
            <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.2 rounded-md font-mono">
              {directionStats.items.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('heatmap')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'heatmap' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950' 
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Flame size={14} />
            <span>Plan Thermique</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* --- TAB 1: VISITE VIRTUELLE DES ALLÉES 3D (DIGITAL TWIN IMMERSIF) --- */}
      {/* ========================================================================= */}
      {activeTab === 'walkthrough' && (
        <div className="space-y-5 animate-fadeIn">
          
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Room & Aisle Selector */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <Building2 size={15} className="text-indigo-600" />
                <select
                  value={selectedRoomId}
                  onChange={e => onSelectRoom(e.target.value)}
                  className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
                >
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.occupancyRate}% occupé)
                    </option>
                  ))}
                </select>
              </div>

              {/* Aisle Stepper Buttons */}
              {aisles.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  <button
                    onClick={() => setWalkAisleIndex(prev => Math.max(0, prev - 1))}
                    disabled={walkAisleIndex === 0}
                    className="p-1.5 hover:bg-white text-slate-700 disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
                    title="Allée précédente"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <span className="font-mono font-bold px-2 text-slate-900">
                    Allée {currentAisle?.aisleNumber || 1} / {aisles.length}
                  </span>
                  <button
                    onClick={() => setWalkAisleIndex(prev => Math.min(aisles.length - 1, prev + 1))}
                    disabled={walkAisleIndex >= aisles.length - 1}
                    className="p-1.5 hover:bg-white text-slate-700 disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
                    title="Allée suivante"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Filter by Direction or Saturation */}
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Direction Spotlight Filter */}
              <div className="flex items-center gap-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <Filter size={13} className="text-indigo-600" />
                <span className="text-slate-500">Direction :</span>
                <select
                  value={selectedDirectionHighlight || ''}
                  onChange={e => setSelectedDirectionHighlight(e.target.value || null)}
                  className="bg-transparent font-bold text-indigo-950 focus:outline-none cursor-pointer max-w-[140px] truncate"
                >
                  <option value="">Toutes les directions</option>
                  {directionStats.items.map(d => (
                    <option key={d.direction} value={d.direction}>
                      {d.direction} ({d.totalBoxes} b.)
                    </option>
                  ))}
                </select>
                {selectedDirectionHighlight && (
                  <button
                    onClick={() => setSelectedDirectionHighlight(null)}
                    className="text-slate-400 hover:text-slate-700 text-xs ml-1"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                <button
                  onClick={() => setHighlightStatus('all')}
                  className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                    highlightStatus === 'all' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Tout
                </button>
                <button
                  onClick={() => setHighlightStatus('full_only')}
                  className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                    highlightStatus === 'full_only' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Saturé (100%)
                </button>
                <button
                  onClick={() => setHighlightStatus('available_only')}
                  className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                    highlightStatus === 'available_only' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Places Libres
                </button>
              </div>

            </div>

          </div>

          {/* 3D Immersive Warehouse Aisle Stage ("Walking inside the Archives") */}
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-2 border-indigo-900/50 shadow-2xl p-6 lg:p-8 min-h-[560px] flex flex-col justify-between">
            
            {/* Overhead Warehouse Lighting & Depth Ambience */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-black pointer-events-none" />
            
            {/* Ceiling Lights Fixtures */}
            <div className="flex items-center justify-around w-full opacity-70 mb-4 pointer-events-none">
              <div className="w-24 h-1.5 bg-cyan-200/60 rounded-full shadow-[0_0_15px_#38bdf8]" />
              <div className="w-24 h-1.5 bg-cyan-200/60 rounded-full shadow-[0_0_15px_#38bdf8]" />
              <div className="w-24 h-1.5 bg-cyan-200/60 rounded-full shadow-[0_0_15px_#38bdf8]" />
            </div>

            {/* Main Perspective Aisle Corridor */}
            {currentAisle ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 relative z-10">
                
                {/* LEFT RACK (Travée Gauche) */}
                <div className="space-y-3 bg-slate-950/80 p-5 rounded-2xl border-2 border-indigo-950 shadow-2xl backdrop-blur-md">
                  
                  {/* Rack Title Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-indigo-900/50">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center font-mono font-black text-xs shadow-md">
                        {currentAisle.leftBay.code || 'T-G'}
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-white">{currentAisle.leftBay.name} (Côté Gauche)</h4>
                        <span className="text-[10px] text-slate-400">
                          {currentAisle.leftBay.storedBoxesCount} / {currentAisle.leftBay.totalCapacity} boîtes stockées
                        </span>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      currentAisle.leftBay.occupancyRate >= 100 ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50' :
                      currentAisle.leftBay.occupancyRate > 0 ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' :
                      'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                    }`}>
                      {currentAisle.leftBay.occupancyRate}%
                    </span>
                  </div>

                  {/* Shelves Stack (Haut vers Bas) */}
                  <div className="space-y-2.5">
                    {[...currentAisle.leftBay.shelves].reverse().map(shelf => {
                      const isFull = shelf.storedBoxesCount >= shelf.boxCapacity;
                      const hasDirectionHighlight = selectedDirectionHighlight
                        ? shelf.boxes.some(b => b.direction === selectedDirectionHighlight)
                        : false;
                      const isDimmed = (selectedDirectionHighlight && !hasDirectionHighlight) ||
                        (highlightStatus === 'full_only' && !isFull) ||
                        (highlightStatus === 'available_only' && isFull);

                      return (
                        <div 
                          key={shelf.id} 
                          className={`transition-all duration-300 ${isDimmed ? 'opacity-25 grayscale' : 'opacity-100'}`}
                          onMouseEnter={() => setActiveHoverShelf(shelf)}
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1 px-1">
                            <span className="font-bold text-slate-300 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                              {shelf.name} ({shelf.code})
                            </span>
                            <span className={isFull ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                              {shelf.storedBoxesCount}/{shelf.boxCapacity} boîtes
                            </span>
                          </div>

                          {/* 3D Realistic Galvanized Shelf Rack Beam */}
                          <div className={`p-2 rounded-xl border flex items-center gap-1.5 min-h-[56px] overflow-x-auto relative shadow-inner ${
                            isFull 
                              ? 'bg-slate-900/95 border-rose-500/40' 
                              : 'bg-slate-900/90 border-indigo-500/30'
                          }`}>
                            {/* Boxes On Shelf */}
                            {shelf.boxes && shelf.boxes.length > 0 ? (
                              shelf.boxes.map((box, bIdx) => {
                                const dirColor = getDirectionColor(box.direction);
                                const isTargetDirection = selectedDirectionHighlight && box.direction === selectedDirectionHighlight;

                                return (
                                  <button
                                    key={box.id || bIdx}
                                    onClick={() => onInspectBox && onInspectBox(box)}
                                    className={`px-2.5 py-1.5 rounded-lg border text-left shrink-0 transition-all cursor-pointer relative group flex flex-col justify-between ${
                                      isTargetDirection 
                                        ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-300 scale-105 shadow-lg z-20' 
                                        : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-600 shadow-md'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1">
                                      <Box size={11} className={isTargetDirection ? 'text-slate-950' : 'text-amber-400'} />
                                      <span className="font-mono font-black text-[11px] tracking-tight">
                                        {box.boxNumber}
                                      </span>
                                    </div>
                                    <span className={`text-[8px] font-bold truncate max-w-[70px] ${
                                      isTargetDirection ? 'text-slate-950 font-black' : 'text-indigo-300'
                                    }`}>
                                      {box.direction || 'Archive'}
                                    </span>

                                    {/* Hover Tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30 w-44 p-2 bg-slate-950 text-white rounded-xl shadow-2xl border border-indigo-500/50 text-[10px] pointer-events-none">
                                      <p className="font-black text-amber-400">Boîte #{box.boxNumber}</p>
                                      <p className="text-slate-300">{box.direction}</p>
                                      <p className="text-emerald-400 font-mono mt-0.5">{box.folderCount || 1} dossier(s) scellé(s)</p>
                                    </div>
                                  </button>
                                );
                              })
                            ) : null}

                            {/* Free / Available Slot Indicators */}
                            {Array.from({ length: Math.max(0, shelf.boxCapacity - (shelf.boxes?.length || 0)) }).map((_, slotIdx) => (
                              <div
                                key={slotIdx}
                                className="w-11 h-9 border border-dashed border-emerald-500/40 bg-emerald-950/20 rounded-lg flex flex-col items-center justify-center text-emerald-400 shrink-0 text-[8px] font-bold"
                                title="Emplacement Libre Disponible"
                              >
                                <span>Libre</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>

                {/* RIGHT RACK (Travée Droite en Vis-à-Vis) */}
                {currentAisle.rightBay ? (
                  <div className="space-y-3 bg-slate-950/80 p-5 rounded-2xl border-2 border-indigo-950 shadow-2xl backdrop-blur-md">
                    
                    {/* Rack Title Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-indigo-900/50">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-mono font-black text-xs shadow-md">
                          {currentAisle.rightBay.code || 'T-D'}
                        </div>
                        <div>
                          <h4 className="font-black text-sm text-white">{currentAisle.rightBay.name} (Côté Droit)</h4>
                          <span className="text-[10px] text-slate-400">
                            {currentAisle.rightBay.storedBoxesCount} / {currentAisle.rightBay.totalCapacity} boîtes stockées
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        currentAisle.rightBay.occupancyRate >= 100 ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50' :
                        currentAisle.rightBay.occupancyRate > 0 ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' :
                        'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                      }`}>
                        {currentAisle.rightBay.occupancyRate}%
                      </span>
                    </div>

                    {/* Shelves Stack */}
                    <div className="space-y-2.5">
                      {[...currentAisle.rightBay.shelves].reverse().map(shelf => {
                        const isFull = shelf.storedBoxesCount >= shelf.boxCapacity;
                        const hasDirectionHighlight = selectedDirectionHighlight
                          ? shelf.boxes.some(b => b.direction === selectedDirectionHighlight)
                          : false;
                        const isDimmed = (selectedDirectionHighlight && !hasDirectionHighlight) ||
                          (highlightStatus === 'full_only' && !isFull) ||
                          (highlightStatus === 'available_only' && isFull);

                        return (
                          <div 
                            key={shelf.id} 
                            className={`transition-all duration-300 ${isDimmed ? 'opacity-25 grayscale' : 'opacity-100'}`}
                            onMouseEnter={() => setActiveHoverShelf(shelf)}
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1 px-1">
                              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                {shelf.name} ({shelf.code})
                              </span>
                              <span className={isFull ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                {shelf.storedBoxesCount}/{shelf.boxCapacity} boîtes
                              </span>
                            </div>

                            <div className={`p-2 rounded-xl border flex items-center gap-1.5 min-h-[56px] overflow-x-auto relative shadow-inner ${
                              isFull 
                                ? 'bg-slate-900/95 border-rose-500/40' 
                                : 'bg-slate-900/90 border-indigo-500/30'
                            }`}>
                              {shelf.boxes && shelf.boxes.length > 0 ? (
                                shelf.boxes.map((box, bIdx) => {
                                  const isTargetDirection = selectedDirectionHighlight && box.direction === selectedDirectionHighlight;

                                  return (
                                    <button
                                      key={box.id || bIdx}
                                      onClick={() => onInspectBox && onInspectBox(box)}
                                      className={`px-2.5 py-1.5 rounded-lg border text-left shrink-0 transition-all cursor-pointer relative group flex flex-col justify-between ${
                                        isTargetDirection 
                                          ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-300 scale-105 shadow-lg z-20' 
                                          : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-600 shadow-md'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1">
                                        <Box size={11} className={isTargetDirection ? 'text-slate-950' : 'text-amber-400'} />
                                        <span className="font-mono font-black text-[11px] tracking-tight">
                                          {box.boxNumber}
                                        </span>
                                      </div>
                                      <span className={`text-[8px] font-bold truncate max-w-[70px] ${
                                        isTargetDirection ? 'text-slate-950 font-black' : 'text-indigo-300'
                                      }`}>
                                        {box.direction || 'Archive'}
                                      </span>
                                    </button>
                                  );
                                })
                              ) : null}

                              {Array.from({ length: Math.max(0, shelf.boxCapacity - (shelf.boxes?.length || 0)) }).map((_, slotIdx) => (
                                <div
                                  key={slotIdx}
                                  className="w-11 h-9 border border-dashed border-emerald-500/40 bg-emerald-950/20 rounded-lg flex flex-col items-center justify-center text-emerald-400 shrink-0 text-[8px] font-bold"
                                  title="Emplacement Libre Disponible"
                                >
                                  <span>Libre</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                ) : (
                  <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
                    <span>Aucun rayonnage supplémentaire dans cette allée</span>
                  </div>
                )}

              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 text-xs">
                Aucune allée configurée dans cette salle.
              </div>
            )}

            {/* Warehouse Floor Guide & Navigation Stepper */}
            <div className="mt-8 pt-4 border-t border-indigo-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 relative z-10">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                  <span className="text-slate-300 font-bold">Emplacement Libre (Disponible)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm" />
                  <span className="text-slate-300 font-bold">Tablette Saturée (100%)</span>
                </div>
              </div>

              {/* Aisle Quick Jump */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-indigo-300">Aller à l'allée :</span>
                {aisles.map((a, idx) => (
                  <button
                    key={idx}
                    onClick={() => setWalkAisleIndex(idx)}
                    className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      walkAisleIndex === idx 
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950 ring-2 ring-indigo-400' 
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {a.aisleNumber}
                  </button>
                ))}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* --- TAB 2: ANALYTICAL BREAKDOWN BY DIRECTION (STATISTIQUES AVANCÉES) --- */}
      {/* ========================================================================= */}
      {activeTab === 'directions_stats' && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Top Summary Bar for Directions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400">Total Directions Actives</span>
                <Building2 size={15} className="text-indigo-500" />
              </div>
              <div className="my-2">
                <div className="text-2xl font-black text-slate-900">
                  {directionStats.items.length} <span className="text-xs font-bold text-slate-400">directions</span>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-bold">
                Versantes d'archives physiques
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400">Total Boîtes Stockées</span>
                <Box size={15} className="text-amber-500" />
              </div>
              <div className="my-2">
                <div className="text-2xl font-black text-slate-900">
                  {directionStats.grandTotalBoxes} <span className="text-xs font-bold text-slate-400">boîtes</span>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-bold">
                {directionStats.grandTotalFolders} dossiers d'archives répertoriés
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400">Métrage Linéaire Total (ml)</span>
                <Layers size={15} className="text-blue-500" />
              </div>
              <div className="my-2">
                <div className="text-2xl font-black text-slate-900">
                  {+(directionStats.grandTotalBoxes * 0.125).toFixed(1)} <span className="text-xs font-bold text-slate-400">ml</span>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-bold">
                Mètres linéaires d'étagères occupés
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400">Action & Rapport</span>
                <FileSpreadsheet size={15} className="text-emerald-500" />
              </div>
              <div className="my-2">
                <button
                  onClick={handleExportStats}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950 transition-all cursor-pointer"
                >
                  <FileSpreadsheet size={14} /> Exporter Rapport Excel
                </button>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                Données d'audit certifiées Morneguia
              </span>
            </div>

          </div>

          {/* Directions Granular Ranking Cards Table */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-base text-slate-900">
                  Répartition Détaillée du Stockage et Tablettes par Direction
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consultez pour chaque direction le nombre de boîtes, de dossiers, les tablettes occupées et le volume linéaire consommé.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">
                  {directionStats.items.length} direction(s) répertoriée(s)
                </span>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                    <th className="py-3 px-4">Direction Versante</th>
                    <th className="py-3 px-4 text-center">Boîtes Stockées</th>
                    <th className="py-3 px-4 text-center">Dossiers Contenus</th>
                    <th className="py-3 px-4 text-center">Tablettes Occupées</th>
                    <th className="py-3 px-4 text-center">Travées / Salles</th>
                    <th className="py-3 px-4 text-center">Métrage (ml)</th>
                    <th className="py-3 px-4 text-center">% Part du Dépôt</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {directionStats.items.map((item, idx) => {
                    const isHighlighted = selectedDirectionHighlight === item.direction;

                    return (
                      <tr 
                        key={item.direction}
                        className={`transition-colors ${
                          isHighlighted ? 'bg-amber-50/80 font-bold' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-lg bg-slate-900 text-white font-mono text-[10px] font-black flex items-center justify-center shrink-0">
                              #{idx + 1}
                            </span>
                            <div>
                              <span className="font-black text-slate-900 block text-xs">
                                {item.direction}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {item.roomsCount} salle(s) d'archivage
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className="font-mono font-black text-sm text-slate-900">
                            {item.totalBoxes}
                          </span>
                          <span className="text-[10px] text-slate-400 block">boîte(s)</span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className="font-mono font-bold text-slate-700">
                            {item.totalFolders}
                          </span>
                          <span className="text-[10px] text-slate-400 block">dossier(s)</span>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 font-black font-mono text-xs">
                            <Layers size={12} className="text-indigo-600" />
                            {item.shelvesCount} tablette(s)
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-center text-[11px] text-slate-500">
                          <span className="font-bold text-slate-700">{item.baysCount}</span> travée(s) · <span className="font-bold text-slate-700">{item.roomsCount}</span> salle(s)
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800">
                          {item.linearMeters} ml
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="w-28 mx-auto space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                              <span>{item.occupancyShare}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-indigo-600 h-full rounded-full" 
                                style={{ width: `${Math.min(100, item.occupancyShare)}%` }} 
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedDirectionHighlight(item.direction);
                              setActiveTab('walkthrough');
                            }}
                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-xl text-xs font-bold flex items-center gap-1 ml-auto transition-colors cursor-pointer"
                            title="Voir et illuminer dans les allées 3D"
                          >
                            <Eye size={13} />
                            <span>Explorer 3D</span>
                          </button>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* --- TAB 3: PLAN THERMIQUE & HEATMAP SPATIALE DU DÉPÔT --- */}
      {/* ========================================================================= */}
      {activeTab === 'heatmap' && selectedRoom && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Flame size={18} className="text-amber-500" />
                  Plan Thermique d'Occupation (Heatmap Spatiale) — {selectedRoom.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visualisez en un coup d'œil les rayonnages saturés (rouge), chargés (bleu/orange) et totalement disponibles (vert).
                </p>
              </div>

              {/* Thermal Legend */}
              <div className="flex items-center gap-3 text-[11px] font-bold">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-md bg-emerald-500" />
                  <span className="text-slate-600">0% (Vide)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-md bg-blue-500" />
                  <span className="text-slate-600">1 - 60%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-md bg-amber-500" />
                  <span className="text-slate-600">61 - 99%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-md bg-rose-600" />
                  <span className="text-slate-600">100% (Saturé)</span>
                </div>
              </div>
            </div>

            {/* Warehouse Floor Heatmap Grid */}
            <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-6">
              
              {/* Warehouse Entry & Safety Path Marker */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  🚪 Portes d'Accès Sécurisées / Entrée Dépôt
                </span>
                <span className="text-slate-500">Allée Centrale de Circulation</span>
                <span className="text-amber-400 font-bold">Zone d'Extraction & Audit</span>
              </div>

              {/* Bays Heatmap Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {selectedRoom.bays?.map(bay => (
                  <div 
                    key={bay.id} 
                    className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-xs text-white">
                        {bay.name} ({bay.code})
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                        bay.occupancyRate >= 100 ? 'bg-rose-500 text-white' :
                        bay.occupancyRate >= 60 ? 'bg-amber-500 text-slate-950' :
                        bay.occupancyRate > 0 ? 'bg-blue-500 text-white' :
                        'bg-emerald-500 text-slate-950'
                      }`}>
                        {bay.occupancyRate}%
                      </span>
                    </div>

                    {/* Shelves Thermal Heatmap Bars */}
                    <div className="space-y-1.5">
                      {[...bay.shelves].reverse().map(shelf => {
                        const rate = shelf.occupancyRate;
                        const isFull = rate >= 100;
                        const isEmpty = rate === 0;

                        return (
                          <div 
                            key={shelf.id}
                            className="flex items-center gap-2 text-[10px] font-mono"
                          >
                            <span className="text-slate-400 w-16 truncate">{shelf.code}</span>
                            <div className="flex-1 bg-slate-800 rounded-md h-3 overflow-hidden">
                              <div 
                                className={`h-full rounded-md transition-all ${
                                  isFull ? 'bg-rose-500' :
                                  rate >= 60 ? 'bg-amber-500' :
                                  rate > 0 ? 'bg-blue-500' :
                                  'bg-emerald-500/40'
                                }`}
                                style={{ width: `${Math.max(10, rate)}%` }}
                              />
                            </div>
                            <span className={`w-8 text-right font-bold ${
                              isFull ? 'text-rose-400' :
                              rate > 0 ? 'text-blue-400' :
                              'text-emerald-400'
                            }`}>
                              {shelf.storedBoxesCount}/{shelf.boxCapacity}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                ))}
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
};
