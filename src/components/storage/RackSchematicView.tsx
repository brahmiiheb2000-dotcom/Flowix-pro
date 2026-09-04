import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  Box, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Filter, 
  Info, 
  Building2, 
  ShieldCheck, 
  UserCheck, 
  Calendar, 
  Maximize2, 
  Eye, 
  Plus, 
  FolderOpen, 
  Printer, 
  FileSpreadsheet, 
  ArrowRight, 
  Check, 
  X, 
  Tag, 
  Sliders, 
  Activity,
  Sparkles,
  ChevronRight,
  RotateCcw,
  Clock,
  FileText
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
  inventoryName?: string;
  batchInventoryRef?: string;
  batchInventoryName?: string;
  batchBatchNumber?: string;
  validatedBy?: string;
  validatedAt?: string;
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

interface ValidatedBatch {
  id: string;
  batchNumber?: string;
  inventoryRef?: string;
  inventoryName?: string;
  direction?: string;
  validatedAt?: string;
  validatedBy?: string;
  boxesCount?: number;
  foldersCount?: number;
}

interface Props {
  rooms: StorageRoom[];
  selectedRoomId: string;
  onSelectRoom: (id: string) => void;
  validatedBatches?: ValidatedBatch[];
  onOpenPV?: (batch: any) => void;
  onAllocateQuick?: (shelf: StorageShelf) => void;
}

export const RackSchematicView: React.FC<Props> = ({
  rooms,
  selectedRoomId,
  onSelectRoom,
  validatedBatches = [],
  onOpenPV,
  onAllocateQuick
}) => {
  // Current selections
  const [selectedBayId, setSelectedBayId] = useState<string>('');
  const [selectedShelfPart, setSelectedShelfPart] = useState<StorageShelf | null>(null);
  const [selectedBoxDetail, setSelectedBoxDetail] = useState<BoxAllocation | null>(null);
  const [selectedEmptySlot, setSelectedEmptySlot] = useState<{ shelf: StorageShelf; slotIndex: number } | null>(null);

  // Filters & display modes
  const [filterValidatedBatchId, setFilterValidatedBatchId] = useState<string>('all');
  const [filterOccupancyMode, setFilterOccupancyMode] = useState<'all' | 'occupied_only' | 'empty_only'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [schematicTheme, setSchematicTheme] = useState<'blueprint' | 'modern' | 'realistic'>('modern');
  const [focusedLevelNumber, setFocusedLevelNumber] = useState<number | null>(null);

  const selectedRoom = useMemo(() => {
    return rooms.find(r => r.id === selectedRoomId) || rooms[0] || null;
  }, [rooms, selectedRoomId]);

  // Set default bay when room changes
  const currentBays = useMemo(() => {
    return selectedRoom?.bays || [];
  }, [selectedRoom]);

  const activeBay = useMemo(() => {
    if (!currentBays.length) return null;
    const found = currentBays.find(b => b.id === selectedBayId);
    return found || currentBays[0];
  }, [currentBays, selectedBayId]);

  // If activeBay changes and selectedShelf is from another bay, reset selection
  const activeShelves = useMemo(() => {
    if (!activeBay?.shelves) return [];
    // Sort from Top level down to Bottom level (Niveau 5 down to 1) for physical racking view
    return [...activeBay.shelves].sort((a, b) => (b.shelfNumber || 0) - (a.shelfNumber || 0));
  }, [activeBay]);

  // Compute statistics for the active bay
  const bayStats = useMemo(() => {
    if (!activeBay) {
      return { totalBoxes: 0, totalCapacity: 0, occupancyPercent: 0, validatedBoxesCount: 0, emptySlotsCount: 0 };
    }
    let totalBoxes = 0;
    let totalCapacity = 0;
    let validatedBoxesCount = 0;

    activeBay.shelves?.forEach(s => {
      totalCapacity += (s.boxCapacity || 6);
      const bCount = s.boxes?.length || 0;
      totalBoxes += bCount;
      // All boxes stored from validated batches
      validatedBoxesCount += bCount;
    });

    const emptySlotsCount = Math.max(0, totalCapacity - totalBoxes);
    const occupancyPercent = totalCapacity > 0 ? Math.round((totalBoxes / totalCapacity) * 100) : 0;

    return {
      totalBoxes,
      totalCapacity,
      occupancyPercent,
      validatedBoxesCount,
      emptySlotsCount
    };
  }, [activeBay]);

  // Compute overall depot validated stats
  const depotValidatedStats = useMemo(() => {
    let totalBoxes = 0;
    let totalCapacity = 0;
    let validatedInventoriesCount = new Set<string>();

    rooms.forEach(r => {
      r.bays?.forEach(b => {
        b.shelves?.forEach(s => {
          totalCapacity += (s.boxCapacity || 6);
          s.boxes?.forEach(bx => {
            totalBoxes++;
            if (bx.inventoryRef || bx.batchInventoryRef) {
              validatedInventoriesCount.add(bx.inventoryRef || bx.batchInventoryRef || '');
            }
          });
        });
      });
    });

    return {
      totalBoxes,
      totalCapacity,
      emptyCapacity: Math.max(0, totalCapacity - totalBoxes),
      occupancyRate: totalCapacity > 0 ? Math.round((totalBoxes / totalCapacity) * 100) : 0,
      validatedInventoriesCount: validatedInventoriesCount.size || validatedBatches.length || 1
    };
  }, [rooms, validatedBatches]);

  // Handle clicking on a shelf row in the schematic
  const handleShelfClick = (shelf: StorageShelf) => {
    setSelectedShelfPart(shelf);
    setSelectedEmptySlot(null);
    if (shelf.boxes && shelf.boxes.length > 0) {
      setSelectedBoxDetail(shelf.boxes[0]);
    } else {
      setSelectedBoxDetail(null);
    }
  };

  // Handle clicking on a specific box in the schematic
  const handleBoxClick = (box: BoxAllocation, shelf: StorageShelf, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedShelfPart(shelf);
    setSelectedBoxDetail(box);
    setSelectedEmptySlot(null);
  };

  // Handle clicking on an empty slot
  const handleEmptySlotClick = (shelf: StorageShelf, slotIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedShelfPart(shelf);
    setSelectedEmptySlot({ shelf, slotIndex });
    setSelectedBoxDetail(null);
  };

  // Export rack schematic data to Excel
  const handleExportRackExcel = () => {
    if (!activeBay) return;
    try {
      const rows: any[] = [];
      activeBay.shelves.forEach(shelf => {
        if (shelf.boxes && shelf.boxes.length > 0) {
          shelf.boxes.forEach((box, idx) => {
            rows.push({
              'Salle / Dépôt': selectedRoom?.name,
              'Travée (Rayonnage)': activeBay.name,
              'Code Travée': activeBay.code,
              'Niveau / Tablette': shelf.name,
              'Code Tablette': shelf.code,
              'Position Slot': idx + 1,
              'Numéro Boîte': box.boxNumber,
              'Statut Validation': 'Validé par Responsable',
              'Responsable Validateur': box.validatedBy || 'Responsable Archivage Morneguia',
              'Date Validation': box.validatedAt || box.createdAt || 'N/A',
              'Inventaire Source': box.inventoryName || box.batchInventoryName || box.inventoryRef || 'Inventaire Validé',
              'Direction Versante': box.direction || 'Archives Générales',
              'Dossiers Contenus': box.folderCount || 1,
              'Remarques': box.notes || ''
            });
          });
        } else {
          rows.push({
            'Salle / Dépôt': selectedRoom?.name,
            'Travée (Rayonnage)': activeBay.name,
            'Code Travée': activeBay.code,
            'Niveau / Tablette': shelf.name,
            'Code Tablette': shelf.code,
            'Position Slot': 'Toutes positions',
            'Numéro Boîte': '(Vide)',
            'Statut Validation': 'Emplacement Libre Disponible',
            'Responsable Validateur': '-',
            'Date Validation': '-',
            'Inventaire Source': '-',
            'Direction Versante': '-',
            'Dossiers Contenus': 0,
            'Remarques': 'Prêt à accueillir des boîtes d\'inventaires validés'
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Rayonnage_${activeBay.code}`);
      XLSX.writeFile(wb, `Schema_Rayonnage_${activeBay.code}_Morneguia_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error("Export error", e);
    }
  };

  return (
    <div className="space-y-6 text-slate-800 animate-fadeIn font-sans">
      
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER & SUMMARY OF VALIDATED STORAGE OCCUPATION */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white rounded-3xl p-5 lg:p-6 shadow-2xl border-2 border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
        
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#05966915_1px,transparent_1px),linear-gradient(to_bottom,#05966915_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <ShieldCheck size={16} className="text-emerald-400" />
            <span>Schéma Technique Rayonnage · Inventaires Validés par Responsable</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            Cartographie & Plan de Rayonnage (Vert = Validé)
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Représentation schématique d'un rayonnage d'archivage à Morneguia. Les cases <strong className="text-emerald-400 font-bold">vertes</strong> représentent les boîtes stockées issues des <strong className="text-emerald-300 font-bold">inventaires validés par le responsable</strong>. Cliquez sur n'importe quelle partie du schéma pour afficher immédiatement les boîtes existantes et leurs détails.
          </p>
        </div>

        {/* Global Summary Badge Counters */}
        <div className="flex flex-wrap items-center gap-3 relative z-10 shrink-0">
          
          <div className="bg-emerald-950/80 border border-emerald-500/40 rounded-2xl px-4 py-2.5 shadow-lg flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <Box size={20} className="text-white" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider font-black text-emerald-300 block">
                Occupées (Validées)
              </span>
              <span className="text-xl font-black text-white font-mono">
                {depotValidatedStats.totalBoxes} <span className="text-xs font-bold text-emerald-400">boîtes</span>
              </span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl px-4 py-2.5 shadow-lg flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 border border-dashed border-slate-600 flex items-center justify-center">
              <Layers size={18} />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider font-black text-slate-400 block">
                Espaces Vides
              </span>
              <span className="text-xl font-black text-slate-200 font-mono">
                {depotValidatedStats.emptyCapacity} <span className="text-xs font-bold text-slate-400">places</span>
              </span>
            </div>
          </div>

        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. CONTROLS BAR: ROOM, RAYONNAGE / BAY SELECTOR & FILTERS */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Room & Rayonnage Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Depot / Room Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 px-3 py-2 rounded-xl text-xs font-bold shadow-2xs">
              <Building2 size={16} className="text-indigo-600 shrink-0" />
              <span className="text-slate-500 font-medium">Dépôt / Salle :</span>
              <select
                value={selectedRoomId}
                onChange={e => onSelectRoom(e.target.value)}
                className="bg-transparent font-black text-slate-900 focus:outline-none cursor-pointer"
              >
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code}) — {r.storedBoxesCount}/{r.totalCapacity} boîtes
                  </option>
                ))}
              </select>
            </div>

            {/* Bay / Rayonnage Selector */}
            {currentBays.length > 0 && (
              <div className="flex items-center gap-2 bg-emerald-50/80 border border-emerald-300 px-3 py-2 rounded-xl text-xs font-bold shadow-2xs">
                <Layers size={16} className="text-emerald-700 shrink-0" />
                <span className="text-emerald-900 font-medium">Rayonnage (Travée) :</span>
                <select
                  value={activeBay?.id || ''}
                  onChange={e => {
                    setSelectedBayId(e.target.value);
                    setSelectedShelfPart(null);
                    setSelectedBoxDetail(null);
                  }}
                  className="bg-transparent font-black text-emerald-950 focus:outline-none cursor-pointer"
                >
                  {currentBays.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code}) — {b.storedBoxesCount}/{b.totalCapacity} boîtes ({b.occupancyRate}%)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick Bay Switch Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {currentBays.map(b => (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelectedBayId(b.id);
                    setSelectedShelfPart(null);
                    setSelectedBoxDetail(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black transition-all cursor-pointer ${
                    activeBay?.id === b.id 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:bg-white'
                  }`}
                  title={`${b.name} (${b.storedBoxesCount}/${b.totalCapacity} boîtes)`}
                >
                  {b.code}
                </button>
              ))}
            </div>

          </div>

          {/* Filtering and Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Filter by Validated Batch / Inventory */}
            {validatedBatches.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl font-semibold">
                <Filter size={13} className="text-emerald-600" />
                <span className="text-slate-500">Inventaire :</span>
                <select
                  value={filterValidatedBatchId}
                  onChange={e => setFilterValidatedBatchId(e.target.value)}
                  className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer max-w-[140px] truncate"
                >
                  <option value="all">Tous inventaires validés</option>
                  {validatedBatches.map(vb => (
                    <option key={vb.id} value={vb.id}>
                      {vb.inventoryName || vb.batchNumber || vb.inventoryRef} ({vb.direction})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Occupancy Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setFilterOccupancyMode('all')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterOccupancyMode === 'all' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500'
                }`}
              >
                Tout le schéma
              </button>
              <button
                onClick={() => setFilterOccupancyMode('occupied_only')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  filterOccupancyMode === 'occupied_only' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Validées Vert
              </button>
              <button
                onClick={() => setFilterOccupancyMode('empty_only')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  filterOccupancyMode === 'empty_only' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-500'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-slate-300 border border-slate-400" />
                Espaces Vides
              </button>
            </div>

            {/* Export Excel Button */}
            <button
              onClick={handleExportRackExcel}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Exporter les données de ce rayonnage au format Excel"
            >
              <FileSpreadsheet size={13} />
              <span>Export Rayonnage</span>
            </button>

          </div>

        </div>

        {/* Active Rayonnage Summary Sub-bar */}
        {activeBay && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-emerald-600" />
                Rayonnage <strong className="text-emerald-950 font-black">{activeBay.name}</strong> ({activeBay.code})
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">
                {activeBay.shelves.length} niveaux de tablettes
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-emerald-700 font-bold">
                {bayStats.validatedBoxesCount} boîtes d'inventaires validées
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">
                {bayStats.emptySlotsCount} emplacements libres disponibles
              </span>
            </div>

            {/* Color Code Legend */}
            <div className="flex items-center gap-4 text-[11px] font-bold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-emerald-600 border border-emerald-500 shadow-2xs" />
                <span className="text-emerald-900">Case Verte = Boîte Inventaire Validé</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-slate-100 border-2 border-dashed border-slate-400" />
                <span className="text-slate-600">Case Pointillée = Espace Vide / Libre</span>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. MAIN INTERACTIVE RACKING SCHEMATIC & DETAIL DRAWER */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT / CENTER: ARCHITECTURAL SCHEMATIC OF RACKING UNIT (8 COLS) */}
        <div className="lg:col-span-8 space-y-4">
          
          <div className="bg-slate-900 text-white rounded-3xl p-5 lg:p-7 border-2 border-emerald-500/40 shadow-2xl relative overflow-hidden">
            
            {/* Architectural Blueprints Accent Lines */}
            <div className="absolute inset-0 bg-[radial-gradient(#10b98115_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

            {/* Schematic Header & Legend */}
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-mono font-black text-sm shadow-md">
                  {activeBay?.code || 'RAY'}
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    Schéma Industriel du Rayonnage : {activeBay?.name}
                  </h3>
                  <p className="text-[11px] text-emerald-300/90 font-mono">
                    Morneguia Archives · Structure Métallique Autoportante à Niveaux Multiples
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono font-black px-3 py-1 rounded-xl bg-emerald-950 border border-emerald-500 text-emerald-300">
                  {bayStats.occupancyPercent}% Occupé
                </span>
                <span className="text-[10px] text-slate-400 block mt-1">
                  {bayStats.totalBoxes}/{bayStats.totalCapacity} boîtes
                </span>
              </div>
            </div>

            {/* SCHEMATIC RACK BLUEPRINT CONTAINER */}
            <div className="relative border-4 border-slate-700 bg-slate-950/90 rounded-2xl p-4 sm:p-6 shadow-inner z-10">
              
              {/* Left Steel Upright Column (Poteau Métallique Gauche) */}
              <div className="absolute left-1 sm:left-2 top-0 bottom-0 w-3 sm:w-4 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-800 border-r border-slate-600 rounded-l flex flex-col justify-around items-center py-4 pointer-events-none opacity-80">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                ))}
              </div>

              {/* Right Steel Upright Column (Poteau Métallique Droit) */}
              <div className="absolute right-1 sm:right-2 top-0 bottom-0 w-3 sm:w-4 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-700 border-l border-slate-600 rounded-r flex flex-col justify-around items-center py-4 pointer-events-none opacity-80">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                ))}
              </div>

              {/* Shelves Vertical Stack (Du plus haut au plus bas) */}
              <div className="space-y-4 px-2 sm:px-4">
                {activeShelves.map((shelf, shelfIdx) => {
                  const capacity = shelf.boxCapacity || 6;
                  const boxes = shelf.boxes || [];
                  const isSelectedShelf = selectedShelfPart?.id === shelf.id;
                  const validatedCount = boxes.length;
                  const emptyCount = Math.max(0, capacity - validatedCount);
                  const isFull = validatedCount >= capacity;

                  // Filter matching check
                  const matchesBatchFilter = filterValidatedBatchId === 'all'
                    ? true
                    : boxes.some(b => b.batchId === filterValidatedBatchId);

                  return (
                    <div 
                      key={shelf.id} 
                      className={`relative rounded-xl transition-all duration-200 cursor-pointer ${
                        isSelectedShelf 
                          ? 'ring-2 ring-emerald-400 bg-emerald-950/40 p-2 shadow-lg shadow-emerald-950/50' 
                          : 'hover:bg-slate-900/80 p-2'
                      }`}
                      onClick={() => handleShelfClick(shelf)}
                    >
                      {/* Shelf Level Meta Header */}
                      <div className="flex items-center justify-between text-xs mb-1.5 px-1 font-mono">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-bold text-[11px]">
                            Niveau {shelf.shelfNumber || (activeShelves.length - shelfIdx)} ({shelf.code})
                          </span>
                          <span className="text-[11px] font-bold text-emerald-400">
                            {shelf.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-black font-mono px-2 py-0.2 rounded-md ${
                            isFull 
                              ? 'bg-rose-950 text-rose-300 border border-rose-800' 
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          }`}>
                            {validatedCount} / {capacity} Validées ({shelf.occupancyRate}%)
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({emptyCount} libre{emptyCount > 1 ? 's' : ''})
                          </span>
                        </div>
                      </div>

                      {/* PHYSICAL SHELF BEAM WITH INDIVIDUAL SLOTS / COMPARTMENTS */}
                      <div className="grid grid-cols-6 gap-2 sm:gap-2.5 p-2.5 rounded-xl bg-slate-900 border-2 border-slate-700 shadow-md">
                        
                        {/* Slots Array */}
                        {Array.from({ length: capacity }).map((_, slotIdx) => {
                          const box = boxes[slotIdx] || null;
                          const isOccupied = !!box;
                          const isSelectedBox = selectedBoxDetail?.id === box?.id && isOccupied;
                          const isSelectedEmpty = selectedEmptySlot?.shelf.id === shelf.id && selectedEmptySlot.slotIndex === slotIdx;

                          // Occupancy filter visibility
                          const isDimmed = (filterOccupancyMode === 'occupied_only' && !isOccupied) ||
                            (filterOccupancyMode === 'empty_only' && isOccupied) ||
                            (filterValidatedBatchId !== 'all' && isOccupied && box.batchId !== filterValidatedBatchId);

                          if (isOccupied) {
                            return (
                              <button
                                key={box.id || slotIdx}
                                onClick={(e) => handleBoxClick(box, shelf, e)}
                                className={`relative group p-2 rounded-xl text-left transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[76px] sm:min-h-[82px] border ${
                                  isDimmed ? 'opacity-20 grayscale' : 'opacity-100'
                                } ${
                                  isSelectedBox 
                                    ? 'bg-emerald-500 text-slate-950 border-white ring-4 ring-emerald-300 shadow-xl scale-105 z-20 font-black' 
                                    : 'bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white border-emerald-400/80 shadow-md'
                                }`}
                                title={`Boîte Validée #${box.boxNumber} - Cliquez pour détails`}
                              >
                                {/* Top Label with Checkmark */}
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center gap-1">
                                    <Box size={12} className={isSelectedBox ? 'text-slate-950' : 'text-emerald-100'} />
                                    <span className="font-mono font-black text-[11px] sm:text-xs tracking-tight">
                                      #{box.boxNumber}
                                    </span>
                                  </div>
                                  <CheckCircle2 size={12} className={isSelectedBox ? 'text-slate-950' : 'text-emerald-200'} />
                                </div>

                                {/* Direction and Folders */}
                                <div className="mt-1">
                                  <span className={`text-[9px] font-black truncate block ${
                                    isSelectedBox ? 'text-slate-900' : 'text-emerald-100'
                                  }`}>
                                    {box.direction || 'Archive'}
                                  </span>
                                  <span className={`text-[8px] font-mono block ${
                                    isSelectedBox ? 'text-slate-800' : 'text-emerald-200'
                                  }`}>
                                    {box.folderCount || 1} dos. scellé(s)
                                  </span>
                                </div>

                                {/* Validated Tag */}
                                <div className="mt-1 pt-1 border-t border-emerald-500/40 flex items-center justify-between text-[7px] font-bold uppercase tracking-wider">
                                  <span className={isSelectedBox ? 'text-slate-950 font-black' : 'text-emerald-200'}>
                                    Validé
                                  </span>
                                  <span className="font-mono">P{slotIdx + 1}</span>
                                </div>

                                {/* Quick Hover Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-40 w-48 p-2.5 bg-slate-950 text-white rounded-xl shadow-2xl border border-emerald-400 text-[10px] pointer-events-none">
                                  <div className="flex items-center gap-1 text-emerald-400 font-bold pb-1 border-b border-slate-800">
                                    <ShieldCheck size={13} />
                                    <span>Boîte Validée #{box.boxNumber}</span>
                                  </div>
                                  <p className="text-slate-300 mt-1">Dir: {box.direction}</p>
                                  <p className="text-slate-400 text-[9px]">Validé par: {box.validatedBy || 'Responsable'}</p>
                                  <p className="text-emerald-300 font-mono mt-0.5">{box.folderCount || 1} dossier(s) scellé(s)</p>
                                </div>
                              </button>
                            );
                          } else {
                            // EMPTY SLOT (ESPACE VIDE)
                            return (
                              <button
                                key={`empty_${slotIdx}`}
                                onClick={(e) => handleEmptySlotClick(shelf, slotIdx, e)}
                                className={`group p-2 rounded-xl text-center border-2 border-dashed transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[76px] sm:min-h-[82px] ${
                                  isDimmed ? 'opacity-20' : 'opacity-100'
                                } ${
                                  isSelectedEmpty
                                    ? 'bg-slate-800 border-emerald-400 text-emerald-300 ring-2 ring-emerald-400 shadow-md'
                                    : 'border-slate-700 bg-slate-950/40 hover:bg-slate-800/80 hover:border-emerald-500/70 text-slate-500 hover:text-emerald-300'
                                }`}
                                title="Emplacement Libre Disponible - Cliquez pour allouer"
                              >
                                <span className="w-5 h-5 rounded-full border border-slate-700 group-hover:border-emerald-400 flex items-center justify-center text-[10px] font-bold">
                                  +
                                </span>
                                <span className="text-[9px] font-bold mt-1">
                                  Espace Libre
                                </span>
                                <span className="text-[8px] font-mono text-slate-500">
                                  Slot #{slotIdx + 1}
                                </span>
                              </button>
                            );
                          }
                        })}

                      </div>

                      {/* Galvanized Horizontal Steel Beam (Lisse Porteuse) */}
                      <div className="h-2 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 rounded-b-md shadow-xs mt-0.5 border-t border-slate-800" />
                    </div>
                  );
                })}
              </div>

              {/* Warehouse Floor Rack Base Footer */}
              <div className="mt-6 pt-3 border-t-2 border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-2 bg-emerald-500 rounded-xs" />
                  <span>Montants fixés au sol selon normes archivage NF Z 40-350</span>
                </div>
                <div className="font-mono text-emerald-400 font-bold">
                  Charge max par tablette : 120 kg (6 boîtes standard)
                </div>
              </div>

            </div>

          </div>

        </div>

        {/* RIGHT: INTERACTIVE INSPECTION DRAWER & BOX DETAILS (4 COLS) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Main Inspector Panel */}
          <div className="bg-white rounded-3xl p-5 lg:p-6 border-2 border-slate-200 shadow-xl space-y-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <Eye size={16} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    Inspection de la Partie Sélectionnée
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Détail en temps réel des boîtes & espaces
                  </span>
                </div>
              </div>

              {selectedShelfPart && (
                <button
                  onClick={() => {
                    setSelectedShelfPart(null);
                    setSelectedBoxDetail(null);
                    setSelectedEmptySlot(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
                  title="Fermer l'inspection"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* CASE 1: SPECIFIC VALIDATED BOX CLICKED */}
            {selectedBoxDetail ? (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Box Badge Header */}
                <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white p-4 rounded-2xl shadow-md border border-emerald-600">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px] uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 size={11} /> Validé par Responsable
                    </span>
                    <span className="font-mono text-xs text-emerald-200 font-bold">
                      {selectedShelfPart?.code}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white text-emerald-900 flex items-center justify-center font-black shadow-md">
                      <Box size={24} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black font-mono tracking-tight text-white">
                        Boîte #{selectedBoxDetail.boxNumber}
                      </h4>
                      <p className="text-xs text-emerald-200 font-bold">
                        {selectedBoxDetail.direction || 'Direction Principale'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Validation Metadata List */}
                <div className="space-y-2.5 text-xs">
                  
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                    <UserCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] uppercase font-black text-slate-400 block">
                        Responsable de Validation
                      </span>
                      <span className="font-bold text-slate-900">
                        {selectedBoxDetail.validatedBy || 'Chef de Service / Responsable Archives Morneguia'}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                        Statut : Inventaire et scellés vérifiés conformes
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                    <Calendar size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] uppercase font-black text-slate-400 block">
                        Date de Validation & Intégration
                      </span>
                      <span className="font-mono font-bold text-slate-900">
                        {selectedBoxDetail.validatedAt 
                          ? new Date(selectedBoxDetail.validatedAt).toLocaleString('fr-FR')
                          : selectedBoxDetail.createdAt 
                            ? new Date(selectedBoxDetail.createdAt).toLocaleString('fr-FR')
                            : 'N/A (Certifié Morneguia)'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                    <FileText size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] uppercase font-black text-slate-400 block">
                        Inventaire / Lot Source Validé
                      </span>
                      <span className="font-bold text-slate-900 block">
                        {selectedBoxDetail.inventoryName || selectedBoxDetail.batchInventoryName || 'Inventaire Général Validé'}
                      </span>
                      {(selectedBoxDetail.inventoryRef || selectedBoxDetail.batchInventoryRef) && (
                        <span className="font-mono text-[10px] text-slate-500 block">
                          Réf: {selectedBoxDetail.inventoryRef || selectedBoxDetail.batchInventoryRef}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                    <FolderOpen size={16} className="text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] uppercase font-black text-slate-400 block">
                        Contenu Archivistique
                      </span>
                      <span className="font-mono font-black text-sm text-slate-900">
                        {selectedBoxDetail.folderCount || 1} dossier(s) physiques scellés
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                    <Building2 size={16} className="text-purple-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] uppercase font-black text-slate-400 block">
                        Localisation Spatiale Précise
                      </span>
                      <span className="font-bold text-slate-900">
                        {selectedRoom?.name} &gt; {activeBay?.name} &gt; {selectedShelfPart?.name}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Action button: Open PV if available */}
                {onOpenPV && selectedBoxDetail.batchId && (
                  <button
                    onClick={() => onOpenPV({ id: selectedBoxDetail.batchId })}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                  >
                    <FileText size={14} />
                    <span>Consulter le PV de Versement Associé</span>
                  </button>
                )}

              </div>
            ) : selectedEmptySlot ? (
              // CASE 2: EMPTY SLOT CLICKED
              <div className="space-y-4 animate-fadeIn">
                <div className="bg-slate-100 p-4 rounded-2xl border-2 border-dashed border-slate-300 text-center">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider inline-block mb-2">
                    Emplacement Libre
                  </span>
                  <h4 className="text-lg font-black text-slate-900">
                    Slot #{selectedEmptySlot.slotIndex + 1} Disponible
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Cet emplacement sur {selectedEmptySlot.shelf.name} ({selectedEmptySlot.shelf.code}) est libre et prêt à accueillir une boîte d'inventaire validé.
                  </p>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>Capacité disponible</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Capacité totale de cette tablette : {selectedEmptySlot.shelf.boxCapacity} boîtes.
                    Actuellement {selectedEmptySlot.shelf.storedBoxesCount} boîte(s) occupée(s).
                  </p>
                </div>

                {onAllocateQuick && (
                  <button
                    onClick={() => onAllocateQuick(selectedEmptySlot.shelf)}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Affecter une Boîte Validée sur cette Tablette</span>
                  </button>
                )}
              </div>
            ) : selectedShelfPart ? (
              // CASE 3: SHELF LEVEL CLICKED (SHOW ALL BOXES ON THIS SHELF)
              <div className="space-y-4 animate-fadeIn">
                <div className="bg-slate-900 text-white p-4 rounded-2xl">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-emerald-400 font-bold">{selectedShelfPart.code}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500 text-emerald-300 text-[10px] font-bold">
                      {selectedShelfPart.storedBoxesCount}/{selectedShelfPart.boxCapacity} Occupé
                    </span>
                  </div>
                  <h4 className="text-base font-black text-white mt-1">
                    {selectedShelfPart.name}
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    Niveau {selectedShelfPart.shelfNumber} — {selectedShelfPart.availableCapacity} place(s) libre(s)
                  </p>
                </div>

                {/* List of boxes on this shelf */}
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  <span className="text-[10px] uppercase font-black text-slate-400 block px-1">
                    Boîtes validées présentes sur ce niveau ({selectedShelfPart.boxes?.length || 0}) :
                  </span>

                  {selectedShelfPart.boxes && selectedShelfPart.boxes.length > 0 ? (
                    selectedShelfPart.boxes.map((b, idx) => (
                      <button
                        key={b.id || idx}
                        onClick={() => setSelectedBoxDetail(b)}
                        className="w-full p-2.5 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition-all flex items-center justify-between cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-mono font-black text-[10px]">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="font-mono font-black text-xs text-slate-900 group-hover:text-emerald-950 block">
                              Boîte #{b.boxNumber}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {b.direction} · {b.folderCount || 1} dos.
                            </span>
                          </div>
                        </div>

                        <ChevronRight size={14} className="text-slate-400 group-hover:text-emerald-600" />
                      </button>
                    ))
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-slate-400 text-xs">
                      Aucune boîte n'est encore stockée sur cette tablette.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // DEFAULT STATE: NO PART SELECTED
              <div className="p-8 text-center text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 mx-auto flex items-center justify-center">
                  <Eye size={22} />
                </div>
                <div>
                  <h4 className="font-black text-sm text-slate-700">
                    Cliquez sur une partie du schéma
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Cliquez sur une boîte verte pour inspecter sa validation, ou sur une tablette pour afficher toutes les boîtes existantes.
                  </p>
                </div>
              </div>
            )}

          </div>

          {/* Helper Card for Archive Validation Standards */}
          <div className="bg-emerald-50 border border-emerald-200/90 rounded-2xl p-4 text-xs text-emerald-950 space-y-2">
            <div className="flex items-center gap-2 font-black">
              <ShieldCheck size={16} className="text-emerald-700" />
              <span>Garantie de Traçabilité Morneguia</span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              Toutes les boîtes colorées en vert font l'objet d'un procès-verbal de versement audité et d'une validation numérique par le responsable de salle.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
};
