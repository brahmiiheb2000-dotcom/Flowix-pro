import React, { useState, useEffect, useMemo } from 'react';
import { 
  Archive, 
  Layers, 
  MapPin, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  RefreshCw, 
  RotateCcw,
  CheckCircle, 
  AlertTriangle, 
  Building2, 
  Box, 
  Sparkles, 
  SlidersHorizontal, 
  Info, 
  ArrowRight, 
  Check, 
  X, 
  Printer, 
  Download, 
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet,
  Grid,
  List,
  Compass,
  BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../lib/api';
import * as XLSX from 'xlsx';
import { StorageWalkthroughAndAnalytics } from './StorageWalkthroughAndAnalytics';
import { RackSchematicView } from './RackSchematicView';
import { Depot3DPlanView } from './Depot3DPlanView';
import { GeoSpatialDepotInteractivePlan } from './GeoSpatialDepotInteractivePlan';
import { DepotConfigManager } from './DepotConfigManager';

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

interface UnallocatedBox {
  boxNumber: string;
  batchId: string;
  batchNumber?: string;
  inventoryRef?: string;
  inventoryName?: string;
  direction?: string;
  folderCount?: number;
  rawLocalisation?: string;
}

export const StorageDepotsManager: React.FC<{ onOpenPV?: (batch: any) => void }> = ({ onOpenPV }) => {
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<StorageRoom[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [unallocatedBoxes, setUnallocatedBoxes] = useState<UnallocatedBox[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [activeSubView, setActiveSubView] = useState<'plan_3d' | 'config' | 'schematic' | 'walkthrough_stats' | 'visual' | 'management'>('plan_3d');

  // Search & Filter
  const [searchBoxQuery, setSearchBoxQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [filterOccupancy, setFilterOccupancy] = useState<'all' | 'full' | 'available' | 'empty'>('all');

  // Modal / Drawer state
  const [selectedBoxDetails, setSelectedBoxDetails] = useState<any | null>(null);
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [isAddingBay, setIsAddingBay] = useState<string | null>(null); // roomId
  const [isAddingShelf, setIsAddingShelf] = useState<string | null>(null); // bayId
  const [isManualAllocating, setIsManualAllocating] = useState<StorageShelf | null>(null);
  const [isEditingRoom, setIsEditingRoom] = useState<StorageRoom | null>(null);

  // Forms
  const [newRoomForm, setNewRoomForm] = useState({
    name: '',
    code: 'S',
    building: 'Bâtiment Principal',
    description: '',
    autoGenerateBays: true,
    bayCount: 4,
    shelfCount: 5,
    shelfCapacity: 6
  });

  const [newBayForm, setNewBayForm] = useState({
    name: '',
    code: 'T',
    bayNumber: 1,
    description: '',
    autoGenerateShelves: true,
    shelfCount: 5,
    shelfCapacity: 6
  });

  const [newShelfForm, setNewShelfForm] = useState({
    name: '',
    code: 'N',
    shelfNumber: 1,
    boxCapacity: 6
  });

  const [allocateBoxForm, setAllocateBoxForm] = useState({
    boxNumber: '',
    batchId: '',
    direction: '',
    folderCount: 1,
    notes: ''
  });

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadStorageData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/storage/overview');
      if (res && res.rooms) {
        setRooms(res.rooms || []);
        setSummary({ ...(res.summary || {}), validatedBatches: res.validatedBatches || [] });
        setUnallocatedBoxes(res.unallocatedBoxes || []);

        if (res.rooms.length > 0 && (!selectedRoomId || !res.rooms.some((r: any) => r.id === selectedRoomId))) {
          setSelectedRoomId(res.rooms[0].id);
        }
      }
    } catch (err: any) {
      console.warn("Notice: chargement des données de stockage:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStorageData();

    const handleStorageEvent = () => {
      loadStorageData();
    };

    window.addEventListener('storage-depot-updated', handleStorageEvent);
    return () => {
      window.removeEventListener('storage-depot-updated', handleStorageEvent);
    };
  }, []);

  const selectedRoom = useMemo(() => {
    return rooms.find(r => r.id === selectedRoomId) || rooms[0] || null;
  }, [rooms, selectedRoomId]);

  // Handle Reset Depot (Clear all box allocations -> 0% empty depot)
  const handleResetDepotEmpty = async () => {
    if (!window.confirm("⚠️ Confirmation de remise à zéro du Dépôt :\n\nSouhaitez-vous libérer la totalité des emplacements de boîtes du dépôt d'archives pour obtenir un dépôt 100% VIDE (0%) ?\n\n(La structure des salles, travées et tablettes reste intacte. Le remplissage se fera automatiquement selon les inventaires et validations du Responsable)")) {
      return;
    }
    try {
      setLoading(true);
      const res = await api.post('/api/storage/reset-depot-empty', { resetBy: 'Responsable Archives' });
      showToast(res.message || "Dépôt d'archives remis à zéro (0% d'occupation). Prêt pour le remplissage selon validations.");
      window.dispatchEvent(new CustomEvent('storage-depot-updated'));
      await loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur lors de la remise à zéro du dépôt", "error");
    } finally {
      setLoading(false);
    }
  };

  // Handle Sync from Validations (Populate based on validated batches and declared locations)
  const handleSyncFromValidations = async () => {
    try {
      setLoading(true);
      const res = await api.post('/api/storage/sync-from-validations', { syncBy: 'Responsable Archives' });
      showToast(res.message || "Dépôt synchronisé avec succès selon les validations et localisations !");
      window.dispatchEvent(new CustomEvent('storage-depot-updated'));
      await loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur lors de la synchronisation", "error");
    } finally {
      setLoading(false);
    }
  };

  // Handle auto-allocation
  const handleAutoAllocate = async () => {
    try {
      setLoading(true);
      const res = await api.post('/api/storage/auto-allocate', {});
      showToast(res.message || "Attribution automatique effectuée avec succès !");
      window.dispatchEvent(new CustomEvent('storage-depot-updated'));
      await loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur lors de l'attribution automatique", "error");
    } finally {
      setLoading(false);
    }
  };

  // Handle Create Room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomForm.name.trim()) {
      showToast("Veuillez saisir le nom de la salle d'archives.", "error");
      return;
    }
    try {
      await api.post('/api/storage/rooms', newRoomForm);
      showToast("Salle d'archivage créée avec succès !");
      setIsAddingRoom(false);
      setNewRoomForm({
        name: '',
        code: 'S',
        building: 'Bâtiment Principal',
        description: '',
        autoGenerateBays: true,
        bayCount: 4,
        shelfCount: 5,
        shelfCapacity: 6
      });
      loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur de création de salle", "error");
    }
  };

  // Handle Create Bay
  const handleCreateBay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddingBay || !newBayForm.name.trim()) return;
    try {
      await api.post('/api/storage/bays', { ...newBayForm, roomId: isAddingBay });
      showToast("Travée ajoutée avec succès !");
      setIsAddingBay(null);
      setNewBayForm({
        name: '',
        code: 'T',
        bayNumber: 1,
        description: '',
        autoGenerateShelves: true,
        shelfCount: 5,
        shelfCapacity: 6
      });
      loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur de création de travée", "error");
    }
  };

  // Handle Create Shelf
  const handleCreateShelf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddingShelf || !selectedRoom || !newShelfForm.name.trim()) return;
    try {
      await api.post('/api/storage/shelves', {
        ...newShelfForm,
        bayId: isAddingShelf,
        roomId: selectedRoom.id
      });
      showToast("Tablette ajoutée avec succès !");
      setIsAddingShelf(null);
      setNewShelfForm({
        name: '',
        code: 'N',
        shelfNumber: 1,
        boxCapacity: 6
      });
      loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur de création de tablette", "error");
    }
  };

  // Handle Delete Room
  const handleDeleteRoom = async (roomId: string, roomName: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer la salle "${roomName}" et l'ensemble de ses travées et tablettes ?`)) return;
    try {
      await api.delete(`/api/storage/rooms/${roomId}`);
      showToast("Salle supprimée.");
      loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur de suppression", "error");
    }
  };

  // Handle Delete Bay
  const handleDeleteBay = async (bayId: string, bayName: string) => {
    if (!window.confirm(`Supprimer la travée "${bayName}" et ses tablettes associées ?`)) return;
    try {
      await api.delete(`/api/storage/bays/${bayId}`);
      showToast("Travée supprimée.");
      loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur de suppression", "error");
    }
  };

  // Handle Delete Shelf
  const handleDeleteShelf = async (shelfId: string, shelfName: string) => {
    if (!window.confirm(`Supprimer la tablette "${shelfName}" ?`)) return;
    try {
      await api.delete(`/api/storage/shelves/${shelfId}`);
      showToast("Tablette supprimée.");
      loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur de suppression", "error");
    }
  };

  // Handle Manual Allocate Box
  const handleAllocateBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManualAllocating || !allocateBoxForm.boxNumber.trim()) {
      showToast("Veuillez sélectionner ou entrer un numéro de boîte.", "error");
      return;
    }
    try {
      await api.post('/api/storage/allocate-box', {
        ...allocateBoxForm,
        shelfId: isManualAllocating.id
      });
      showToast(`Boîte ${allocateBoxForm.boxNumber} allouée sur la ${isManualAllocating.name} !`);
      setIsManualAllocating(null);
      setAllocateBoxForm({
        boxNumber: '',
        batchId: '',
        direction: '',
        folderCount: 1,
        notes: ''
      });
      loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur lors de l'affectation de la boîte", "error");
    }
  };

  // Handle Remove Box from Shelf
  const handleRemoveBox = async (allocId: string, boxNum: string) => {
    if (!window.confirm(`Désaffecter la boîte ${boxNum} de cette tablette ?`)) return;
    try {
      await api.delete(`/api/storage/allocate-box/${allocId}`);
      showToast(`Boîte ${boxNum} retirée de la tablette.`);
      setSelectedBoxDetails(null);
      loadStorageData();
    } catch (err: any) {
      showToast(err.message || "Erreur lors du retrait de la boîte", "error");
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    if (!rooms || rooms.length === 0) return;
    try {
      const rows: any[] = [];
      rooms.forEach(r => {
        r.bays?.forEach(b => {
          b.shelves?.forEach(s => {
            if (s.boxes && s.boxes.length > 0) {
              s.boxes.forEach(bx => {
                rows.push({
                  'Salle': r.name,
                  'Code Salle': r.code,
                  'Bâtiment': r.building || '-',
                  'Travée': b.name,
                  'Code Travée': b.code,
                  'Tablette': s.name,
                  'Code Tablette': s.code,
                  'N° Boîte': bx.boxNumber,
                  'Direction Versante': bx.direction || '-',
                  'Réf Inventaire': bx.inventoryRef || '-',
                  'Nombre Dossiers': bx.folderCount || 0,
                  'Date Stockage': bx.createdAt ? new Date(bx.createdAt).toLocaleDateString('fr-FR') : '-'
                });
              });
            } else {
              rows.push({
                'Salle': r.name,
                'Code Salle': r.code,
                'Bâtiment': r.building || '-',
                'Travée': b.name,
                'Code Travée': b.code,
                'Tablette': s.name,
                'Code Tablette': s.code,
                'N° Boîte': '(Tablette Disponible)',
                'Direction Versante': '-',
                'Réf Inventaire': '-',
                'Nombre Dossiers': 0,
                'Date Stockage': '-'
              });
            }
          });
        });
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plan_Stockage_Archives');
      XLSX.writeFile(wb, `Plan_Stockage_Depots_MAE_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast("Plan de stockage exporté avec succès !");
    } catch (e: any) {
      showToast("Erreur lors de l'export: " + e.message, "error");
    }
  };

  // Check matching box in search
  const isBoxMatched = (boxNum: string, dir?: string) => {
    if (!searchBoxQuery.trim()) return false;
    const q = searchBoxQuery.toLowerCase().trim();
    return boxNum.toLowerCase().includes(q) || (dir && dir.toLowerCase().includes(q));
  };

  return (
    <div className="space-y-6 w-full text-slate-800 animate-fadeIn font-sans">
      
      {/* Notification Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md text-xs font-bold border ${
              toast.type === 'success' ? 'bg-emerald-900/90 text-emerald-200 border-emerald-500/30' :
              toast.type === 'error' ? 'bg-rose-900/90 text-rose-200 border-rose-500/30' :
              'bg-indigo-900/90 text-indigo-200 border-indigo-500/30'
            }`}
          >
            {toast.type === 'success' && <Check size={16} className="text-emerald-400" />}
            {toast.type === 'error' && <AlertTriangle size={16} className="text-rose-400" />}
            {toast.type === 'info' && <Info size={16} className="text-indigo-400" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 lg:p-7 shadow-xl border border-indigo-500/20 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="space-y-1.5 z-10 max-w-2xl">
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-widest">
            <Archive size={16} className="text-indigo-400" />
            <span>Centre des Archives Intermédiaires Morneguia</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Stockage & Dépôts d'Archives Physiques
          </h2>
          <p className="text-xs sm:text-sm text-indigo-200 leading-relaxed">
            Cartographie intégrale des Salles, Travées et Tablettes en relation directe avec les inventaires validés par l'audit. Suivez l'occupation exacte et localisez les boîtes en temps réel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 z-10 shrink-0">
          <button
            onClick={() => setIsAddingRoom(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-950 transition-all cursor-pointer"
          >
            <Plus size={15} /> Nouvelle Salle
          </button>
          <button
            onClick={handleResetDepotEmpty}
            disabled={loading}
            className="px-3.5 py-2.5 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/30 hover:border-rose-400 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg transition-all cursor-pointer"
            title="Remettre le dépôt d'archives à 0% (videz les emplacements tout en conservant l'infrastructure physique)"
          >
            <RotateCcw size={14} className="text-rose-400" />
            <span>Mise à zéro (0%)</span>
          </button>
          <button
            onClick={handleSyncFromValidations}
            disabled={loading}
            className="px-4 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
            title="Remplir et synchroniser le dépôt selon les validations du responsable et les localisations déclarées"
          >
            <Sparkles size={15} className="text-amber-300" />
            <span>Occuper selon Validations</span>
          </button>
          <button
            onClick={handleAutoAllocate}
            disabled={loading || unallocatedBoxes.length === 0}
            className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
            title="Attribuer automatiquement toutes les boîtes validées non rangées"
          >
            <Box size={14} />
            <span>Ranger ({unallocatedBoxes.length})</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 border border-white/10 transition-all cursor-pointer"
            title="Exporter le plan de stockage Excel"
          >
            <FileSpreadsheet size={15} />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
          <button
            onClick={loadStorageData}
            disabled={loading}
            className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs transition-all cursor-pointer"
            title="Actualiser"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Global KPI Metrics Matrix */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          
          {/* Taux d'occupation global */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stockage Total Boîtes</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                summary.overallOccupancyRate > 90 ? 'bg-rose-100 text-rose-800' :
                summary.overallOccupancyRate > 70 ? 'bg-amber-100 text-amber-800' :
                'bg-emerald-100 text-emerald-800'
              }`}>
                {summary.overallOccupancyRate}% Occupé
              </span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-black text-slate-900">
                {summary.totalStoredBoxes} <span className="text-xs font-bold text-slate-400">/ {summary.totalCapacity} boîtes</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    summary.overallOccupancyRate > 90 ? 'bg-rose-500' :
                    summary.overallOccupancyRate > 70 ? 'bg-amber-500' :
                    'bg-emerald-500'
                  }`} 
                  style={{ width: `${Math.min(100, summary.overallOccupancyRate)}%` }} 
                />
              </div>
            </div>
            <span className="text-[10px] text-slate-500 font-bold">
              {summary.totalAvailablePlaces} place(s) disponible(s)
            </span>
          </div>

          {/* Salles d'archives */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Salles d'Archives</span>
              <Building2 size={15} className="text-indigo-500" />
            </div>
            <div className="my-1.5">
              <div className="text-2xl font-black text-indigo-950">
                {summary.totalRooms} <span className="text-xs font-bold text-slate-400">salles</span>
              </div>
              <div className="flex items-center gap-2 text-xs mt-1">
                <span className="text-indigo-700 font-bold">● {summary.loadedRooms} Chargée(s)</span>
                <span className="text-slate-400">·</span>
                <span className="text-emerald-700 font-bold">● {summary.availableRooms} Libre(s)</span>
              </div>
            </div>
            <span className="text-[10px] text-slate-400 font-medium truncate">
              Morneguia Dépôt Principal
            </span>
          </div>

          {/* Travées (Rayonnages) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Travées (Rayonnages)</span>
              <Layers size={15} className="text-blue-500" />
            </div>
            <div className="my-1.5">
              <div className="text-2xl font-black text-blue-950">
                {summary.totalBays} <span className="text-xs font-bold text-slate-400">travées</span>
              </div>
              <div className="flex items-center gap-2 text-xs mt-1">
                <span className="text-blue-700 font-bold">● {summary.loadedBays} Chargée(s)</span>
                <span className="text-slate-400">·</span>
                <span className="text-emerald-700 font-bold">● {summary.availableBays} Disponible(s)</span>
              </div>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              {summary.emptyBays} travée(s) 100% vide(s)
            </span>
          </div>

          {/* Tablettes (Niveaux) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tablettes (Niveaux)</span>
              <Box size={15} className="text-amber-500" />
            </div>
            <div className="my-1.5">
              <div className="text-2xl font-black text-amber-950">
                {summary.totalShelves} <span className="text-xs font-bold text-slate-400">tablettes</span>
              </div>
              <div className="flex items-center gap-2 text-xs mt-1">
                <span className="text-amber-700 font-bold">● {summary.loadedShelves} Avec boîtes</span>
                <span className="text-slate-400">·</span>
                <span className="text-emerald-700 font-bold">● {summary.availableShelves} Libres</span>
              </div>
            </div>
            <span className="text-[10px] text-rose-600 font-bold">
              {summary.fullShelves} tablette(s) saturée(s) (100%)
            </span>
          </div>

        </div>
      )}

      {/* Unallocated Boxes Warning Banner (if any) */}
      {unallocatedBoxes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-200/80 text-amber-900 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </div>
            <div>
              <p className="font-black text-amber-950">
                {unallocatedBoxes.length} boîte(s) validée(s) en attente de rangement physique sur les tablettes
              </p>
              <p className="text-amber-800 text-[11px] mt-0.5">
                Ces boîtes proviennent des lots d'inventaire validés par l'audit. Vous pouvez les attribuer en un clic ou manuellement.
              </p>
            </div>
          </div>
          <button
            onClick={handleAutoAllocate}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
          >
            <Sparkles size={14} /> Ranger automatiquement
          </button>
        </div>
      )}

      {/* Navigation Controls & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5">
        
        {/* Room Switcher Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {rooms.map(room => {
            const isSelected = room.id === selectedRoomId;
            return (
              <button
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                  isSelected 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Building2 size={14} className={isSelected ? 'text-indigo-400' : 'text-slate-400'} />
                <span>{room.name}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {room.occupancyRate}%
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input & View Mode */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchBoxQuery}
              onChange={e => setSearchBoxQuery(e.target.value)}
              placeholder="Chercher N° boîte, direction..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchBoxQuery && (
              <button onClick={() => setSearchBoxQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 overflow-x-auto max-w-full gap-1">
            <button
              onClick={() => setActiveSubView('plan_3d')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubView === 'plan_3d' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-700 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <Layers size={14} className={activeSubView === 'plan_3d' ? 'text-indigo-200' : 'text-indigo-600'} />
              <span>Plan 3D & 2D du Dépôt</span>
            </button>
            <button
              onClick={() => setActiveSubView('config')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubView === 'config' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-700 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <SlidersHorizontal size={14} className={activeSubView === 'config' ? 'text-indigo-300' : 'text-slate-600'} />
              <span>Configuration du Dépôt</span>
            </button>
            <button
              onClick={() => setActiveSubView('schematic')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubView === 'schematic' ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-900 hover:bg-white/80'
              }`}
            >
              <ShieldCheck size={14} className={activeSubView === 'schematic' ? 'text-emerald-200' : 'text-emerald-600'} />
              <span>Rayonnages & Boîtes</span>
            </button>
            <button
              onClick={() => setActiveSubView('walkthrough_stats')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubView === 'walkthrough_stats' ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-900 hover:bg-white/60'
              }`}
            >
              <Compass size={13} className={activeSubView === 'walkthrough_stats' ? 'text-indigo-200' : 'text-indigo-600'} />
              <span>Visite & Mètres Linéaires</span>
            </button>
            <button
              onClick={() => setActiveSubView('visual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeSubView === 'visual' ? 'bg-white text-indigo-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Grid size={13} /> <span>Grille</span>
            </button>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* --- SUBVIEW 0: GEOSPATIAL INTERACTIVE PLAN (2D/3D DIGITAL TWIN)        --- */}
      {/* ========================================================================= */}
      {activeSubView === 'plan_3d' && (
        <GeoSpatialDepotInteractivePlan
          rooms={rooms}
          summary={summary}
          onRefresh={loadStorageData}
          onResetDepot={handleResetDepotEmpty}
          onSyncValidations={handleSyncFromValidations}
          onOpenConfig={() => setActiveSubView('config')}
          onOpenAddRoom={() => setIsAddingRoom(true)}
        />
      )}

      {/* ========================================================================= */}
      {/* --- SUBVIEW CONFIG: DYNAMIC DEPOT CONFIGURATION MANAGER --- */}
      {/* ========================================================================= */}
      {activeSubView === 'config' && (
        <DepotConfigManager
          rooms={rooms}
          onRefresh={loadStorageData}
          onSelectRoomForPlan={(rId) => {
            setSelectedRoomId(rId);
            setActiveSubView('plan_3d');
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* --- SUBVIEW 1: SCHÉMA RAYONNAGE VALIDÉ & OCCUPATION (VERT) --- */}
      {/* ========================================================================= */}
      {activeSubView === 'schematic' && (
        <RackSchematicView
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          validatedBatches={summary?.validatedBatches || []}
          onOpenPV={onOpenPV}
          onAllocateQuick={(shelf) => {
            setIsManualAllocating(shelf);
            setAllocateBoxForm({
              boxNumber: '',
              batchId: '',
              direction: '',
              folderCount: 1,
              notes: ''
            });
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* --- SUBVIEW 2: VISUAL RACK & SHELVES RENDERING --- */}
      {/* ========================================================================= */}
      {activeSubView === 'visual' && selectedRoom && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Room Header Info */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-black uppercase bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-lg border border-indigo-400/30">
                  {selectedRoom.code}
                </span>
                <h3 className="text-base font-black text-white">{selectedRoom.name}</h3>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">{selectedRoom.building || 'Dépôt Principal'} · {selectedRoom.description || 'Stockage officiel certifié'}</p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono shrink-0">
              <div>
                <span className="text-slate-400 text-[10px] block uppercase">Capacité</span>
                <span className="font-bold text-white">{selectedRoom.storedBoxesCount} / {selectedRoom.totalCapacity} boîtes</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block uppercase">Taux d'occupation</span>
                <span className={`font-bold ${
                  selectedRoom.occupancyRate >= 90 ? 'text-rose-400' :
                  selectedRoom.occupancyRate >= 60 ? 'text-amber-400' : 'text-emerald-400'
                }`}>{selectedRoom.occupancyRate}%</span>
              </div>
              <button
                onClick={() => setIsAddingBay(selectedRoom.id)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus size={13} /> Ajouter Travée
              </button>
            </div>
          </div>

          {/* Bays Grid (Rayonnages Physiques) */}
          {selectedRoom.bays && selectedRoom.bays.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {selectedRoom.bays.map(bay => (
                <div key={bay.id} className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm flex flex-col justify-between space-y-4">
                  
                  {/* Bay Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl bg-indigo-900 text-white flex items-center justify-center font-mono font-black text-xs shadow-sm">
                        {bay.code || `T${bay.bayNumber}`}
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-slate-900">{bay.name}</h4>
                        <span className="text-[10px] font-bold text-slate-400 block">
                          {bay.shelvesCount} tablettes · {bay.storedBoxesCount} / {bay.totalCapacity} boîtes stockées
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        bay.occupancyRate >= 100 ? 'bg-rose-100 text-rose-800' :
                        bay.occupancyRate > 0 ? 'bg-blue-100 text-blue-800' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {bay.occupancyRate}%
                      </span>
                      <button
                        onClick={() => setIsAddingShelf(bay.id)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs transition-colors cursor-pointer"
                        title="Ajouter une tablette à cette travée"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Shelves Stack (Rack Visuel - Tablettes superposées du haut vers le bas) */}
                  <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border-2 border-slate-800 shadow-inner">
                    {bay.shelves && bay.shelves.length > 0 ? (
                      // Display top to bottom (highest shelf number on top, or reverse)
                      [...bay.shelves].reverse().map(shelf => {
                        const isFull = shelf.storedBoxesCount >= shelf.boxCapacity;
                        const hasPlaces = shelf.storedBoxesCount < shelf.boxCapacity;

                        return (
                          <div key={shelf.id} className="space-y-1.5">
                            
                            {/* Shelf Level Bar */}
                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono px-1">
                              <span className="font-bold text-slate-300">{shelf.name} ({shelf.code})</span>
                              <div className="flex items-center gap-2">
                                <span className={isFull ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                  {shelf.storedBoxesCount} / {shelf.boxCapacity} boîtes
                                </span>
                                {hasPlaces && (
                                  <button
                                    onClick={() => setIsManualAllocating(shelf)}
                                    className="px-1.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[9px] font-sans font-bold flex items-center gap-0.5 transition-all cursor-pointer"
                                    title="Ranger une boîte sur cette tablette"
                                  >
                                    <Plus size={10} /> Ranger
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Physical Shelf Rack Surface */}
                            <div className="bg-slate-900/90 border-b-4 border-indigo-400/80 p-2.5 rounded-xl flex items-center gap-2 min-h-[58px] overflow-x-auto">
                              {shelf.boxes && shelf.boxes.length > 0 ? (
                                shelf.boxes.map((box, bIdx) => {
                                  const isMatched = isBoxMatched(box.boxNumber, box.direction);
                                  return (
                                    <button
                                      key={box.id || bIdx}
                                      onClick={() => setSelectedBoxDetails({ ...box, shelf, bay, room: selectedRoom })}
                                      className={`px-2.5 py-1.5 rounded-xl border flex flex-col items-center justify-center shrink-0 transition-all cursor-pointer text-left ${
                                        isMatched 
                                          ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-300 scale-105 shadow-md' 
                                          : 'bg-gradient-to-br from-indigo-900 to-indigo-950 hover:from-indigo-800 hover:to-indigo-900 text-white border-indigo-500/40 shadow-xs'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1">
                                        <Box size={12} className={isMatched ? 'text-slate-950' : 'text-indigo-300'} />
                                        <span className="font-mono font-black text-xs tracking-tight">
                                          {box.boxNumber}
                                        </span>
                                      </div>
                                      <span className={`text-[8px] font-bold truncate max-w-[80px] ${
                                        isMatched ? 'text-slate-800' : 'text-indigo-300'
                                      }`}>
                                        {box.direction || 'Archives'}
                                      </span>
                                    </button>
                                  );
                                })
                              ) : (
                                <div className="text-[10px] text-slate-500 italic font-medium py-1.5 px-2 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500/40 animate-pulse" />
                                  Tablette vide · {shelf.boxCapacity} places disponibles
                                </div>
                              )}

                              {/* Available slots indicator */}
                              {Array.from({ length: Math.max(0, shelf.boxCapacity - (shelf.boxes?.length || 0)) }).map((_, slotIdx) => (
                                <div
                                  key={slotIdx}
                                  onClick={() => setIsManualAllocating(shelf)}
                                  className="w-12 h-10 border border-dashed border-slate-700 hover:border-indigo-400 rounded-xl flex items-center justify-center text-slate-600 hover:text-indigo-300 shrink-0 transition-colors cursor-pointer"
                                  title={`Emplacement libre #${slotIdx + 1}`}
                                >
                                  <Plus size={12} />
                                </div>
                              ))}
                            </div>

                          </div>
                        );
                      })
                    ) : (
                      <div className="p-6 text-center text-slate-500 text-xs">
                        Aucune tablette configurée dans cette travée.
                      </div>
                    )}
                  </div>

                  {/* Bay Footer */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium pt-1">
                    <span>Rayonnage Métallique Certifié</span>
                    <button
                      onClick={() => handleDeleteBay(bay.id, bay.name)}
                      className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                      title="Supprimer la travée"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <Layers size={36} className="mx-auto text-slate-400" />
              <h4 className="text-base font-black text-slate-800">Aucune travée configurée dans cette salle</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Commencez par ajouter une travée (rayonnage) avec ses tablettes pour ranger vos boîtes d'archives.
              </p>
              <button
                onClick={() => setIsAddingBay(selectedRoom.id)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                + Ajouter une Travée
              </button>
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* --- SUBVIEW 2: VISITE VIRTUELLE 3D & STATS INNOVANTES PAR DIRECTION --- */}
      {/* ========================================================================= */}
      {activeSubView === 'walkthrough_stats' && (
        <StorageWalkthroughAndAnalytics
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          onInspectBox={(box) => setSelectedBoxDetails(box)}
        />
      )}

      {/* ========================================================================= */}
      {/* --- SUBVIEW 3: MANAGEMENT & CONFIGURATION TABLE --- */}
      {/* ========================================================================= */}
      {activeSubView === 'management' && (
        <div className="space-y-6 animate-fadeIn">
          
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-black text-base text-slate-900">Structure Hiérarchique des Dépôts d'Archives</h3>
                <p className="text-xs text-slate-500 mt-0.5">Édition des Salles, Travées, Tablettes et capacités unitaires de boîtes.</p>
              </div>
              <button
                onClick={() => setIsAddingRoom(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all self-start sm:self-auto cursor-pointer"
              >
                <Plus size={14} /> Ajouter une Salle
              </button>
            </div>

            <div className="space-y-4">
              {rooms.map(r => (
                <div key={r.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3">
                  
                  {/* Room Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold bg-indigo-900 text-white text-xs px-2.5 py-1 rounded-lg">
                        {r.code}
                      </span>
                      <div>
                        <h4 className="font-black text-sm text-slate-900">{r.name}</h4>
                        <span className="text-[11px] text-slate-500">{r.building || 'Bâtiment'} · {r.baysCount} travées · {r.storedBoxesCount} / {r.totalCapacity} boîtes</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsAddingBay(r.id)}
                        className="px-2.5 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-900 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Plus size={12} /> Travée
                      </button>
                      <button
                        onClick={() => handleDeleteRoom(r.id, r.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Supprimer la salle"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Bays inside room */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-2 sm:pl-4">
                    {r.bays?.map(b => (
                      <div key={b.id} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-slate-800">{b.name} ({b.code})</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setIsAddingShelf(b.id)}
                              className="p-1 text-indigo-600 hover:bg-indigo-50 rounded"
                              title="Ajouter une tablette"
                            >
                              <Plus size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteBay(b.id, b.name)}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded"
                              title="Supprimer la travée"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Shelves list */}
                        <div className="space-y-1 text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                          {b.shelves?.map(s => (
                            <div key={s.id} className="flex items-center justify-between py-0.5">
                              <span>• {s.name} ({s.code})</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-slate-500 font-bold">{s.storedBoxesCount}/{s.boxCapacity} boîtes</span>
                                <button
                                  onClick={() => handleDeleteShelf(s.id, s.name)}
                                  className="text-slate-300 hover:text-rose-500"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* --- MODAL: BOX DETAILS & ASSIGNED INVENTORY --- */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {selectedBoxDetails && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 text-left"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-900 text-white flex items-center justify-center shadow-sm">
                    <Box size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900">
                      Boîte d'Archives : {selectedBoxDetails.boxNumber}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {selectedBoxDetails.direction || 'Direction'} · Stockage scellé
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedBoxDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Coordinates Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Salle d'Archivage</span>
                  <span className="font-black text-slate-800 mt-0.5 block">{selectedBoxDetails.room?.name || 'Salle 01'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Travée & Tablette</span>
                  <span className="font-black text-indigo-900 mt-0.5 block">
                    {selectedBoxDetails.bay?.name || 'Travée'} · {selectedBoxDetails.shelf?.name || 'Tablette'}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Dossiers Contenus</span>
                  <span className="font-black text-emerald-800 mt-0.5 block">
                    {selectedBoxDetails.folderCount || 1} dossier(s)
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-black uppercase text-slate-400 block">Sort Final Réglementaire</span>
                  <span className="font-bold text-amber-800 mt-0.5 block">Élimination après échéance</span>
                </div>
              </div>

              {selectedBoxDetails.inventoryRef && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs">
                  <span className="font-black text-indigo-950 block text-[10px] uppercase">Réf. Lot d'Inventaire :</span>
                  <p className="font-mono font-bold text-indigo-900 mt-0.5">{selectedBoxDetails.inventoryRef}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => handleRemoveBox(selectedBoxDetails.id, selectedBoxDetails.boxNumber)}
                  className="px-3.5 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} /> Retirer de la tablette
                </button>

                <button
                  onClick={() => setSelectedBoxDetails(null)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Fermer
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* --- MODAL: CREATE NEW ROOM --- */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isAddingRoom && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-left"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Building2 size={18} className="text-indigo-600" />
                  Nouvelle Salle d'Archivage
                </h3>
                <button onClick={() => setIsAddingRoom(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nom de la Salle :</label>
                  <input
                    type="text"
                    required
                    value={newRoomForm.name}
                    onChange={e => setNewRoomForm({ ...newRoomForm, name: e.target.value })}
                    placeholder="ex: Salle 03 — Morneguia Bâtiment C"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Code Salle :</label>
                    <input
                      type="text"
                      required
                      value={newRoomForm.code}
                      onChange={e => setNewRoomForm({ ...newRoomForm, code: e.target.value })}
                      placeholder="S3"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Bâtiment / Dépôt :</label>
                    <input
                      type="text"
                      value={newRoomForm.building}
                      onChange={e => setNewRoomForm({ ...newRoomForm, building: e.target.value })}
                      placeholder="Bâtiment C"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-2">
                  <label className="flex items-center gap-2 font-bold text-indigo-950">
                    <input
                      type="checkbox"
                      checked={newRoomForm.autoGenerateBays}
                      onChange={e => setNewRoomForm({ ...newRoomForm, autoGenerateBays: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    Générer automatiquement les travées et tablettes
                  </label>
                  
                  {newRoomForm.autoGenerateBays && (
                    <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Travées :</span>
                        <input
                          type="number"
                          min="1"
                          max="26"
                          value={newRoomForm.bayCount}
                          onChange={e => setNewRoomForm({ ...newRoomForm, bayCount: Number(e.target.value) })}
                          className="w-full bg-white border border-indigo-200 rounded-lg p-1.5 font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500 block">Tablettes / Travée :</span>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={newRoomForm.shelfCount}
                          onChange={e => setNewRoomForm({ ...newRoomForm, shelfCount: Number(e.target.value) })}
                          className="w-full bg-white border border-indigo-200 rounded-lg p-1.5 font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500 block">Boîtes / Tablette :</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={newRoomForm.shelfCapacity}
                          onChange={e => setNewRoomForm({ ...newRoomForm, shelfCapacity: Number(e.target.value) })}
                          className="w-full bg-white border border-indigo-200 rounded-lg p-1.5 font-bold"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingRoom(false)}
                    className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-bold"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    Créer la Salle
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* --- MODAL: CREATE NEW BAY --- */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isAddingBay && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-left"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Layers size={18} className="text-indigo-600" />
                  Ajouter une Travée (Rayonnage)
                </h3>
                <button onClick={() => setIsAddingBay(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateBay} className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nom de la Travée :</label>
                  <input
                    type="text"
                    required
                    value={newBayForm.name}
                    onChange={e => setNewBayForm({ ...newBayForm, name: e.target.value })}
                    placeholder="ex: Travée E"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Code Travée :</label>
                    <input
                      type="text"
                      required
                      value={newBayForm.code}
                      onChange={e => setNewBayForm({ ...newBayForm, code: e.target.value })}
                      placeholder="T5"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Numéro d'Ordre :</label>
                    <input
                      type="number"
                      min="1"
                      value={newBayForm.bayNumber}
                      onChange={e => setNewBayForm({ ...newBayForm, bayNumber: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-2">
                  <label className="flex items-center gap-2 font-bold text-indigo-950">
                    <input
                      type="checkbox"
                      checked={newBayForm.autoGenerateShelves}
                      onChange={e => setNewBayForm({ ...newBayForm, autoGenerateShelves: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    Générer les tablettes (niveaux)
                  </label>
                  {newBayForm.autoGenerateShelves && (
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Nombre de tablettes :</span>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={newBayForm.shelfCount}
                          onChange={e => setNewBayForm({ ...newBayForm, shelfCount: Number(e.target.value) })}
                          className="w-full bg-white border border-indigo-200 rounded-lg p-1.5 font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500 block">Boîtes par tablette :</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={newBayForm.shelfCapacity}
                          onChange={e => setNewBayForm({ ...newBayForm, shelfCapacity: Number(e.target.value) })}
                          className="w-full bg-white border border-indigo-200 rounded-lg p-1.5 font-bold"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingBay(null)}
                    className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-bold"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    Ajouter la Travée
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* --- MODAL: CREATE NEW SHELF --- */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isAddingShelf && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-left"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Box size={18} className="text-indigo-600" />
                  Ajouter une Tablette (Niveau)
                </h3>
                <button onClick={() => setIsAddingShelf(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateShelf} className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nom de la Tablette :</label>
                  <input
                    type="text"
                    required
                    value={newShelfForm.name}
                    onChange={e => setNewShelfForm({ ...newShelfForm, name: e.target.value })}
                    placeholder="ex: Tablette 6"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Code Niveau :</label>
                    <input
                      type="text"
                      required
                      value={newShelfForm.code}
                      onChange={e => setNewShelfForm({ ...newShelfForm, code: e.target.value })}
                      placeholder="N6"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Capacité en Boîtes :</label>
                    <input
                      type="number"
                      min="1"
                      max="25"
                      value={newShelfForm.boxCapacity}
                      onChange={e => setNewShelfForm({ ...newShelfForm, boxCapacity: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingShelf(null)}
                    className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-bold"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    Ajouter la Tablette
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* --- MODAL: MANUAL ALLOCATE BOX TO SHELF --- */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isManualAllocating && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-left"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                    <Box size={18} className="text-emerald-600" />
                    Ranger une Boîte sur {isManualAllocating.name}
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Capacité restante : {isManualAllocating.availableCapacity} place(s)
                  </span>
                </div>
                <button onClick={() => setIsManualAllocating(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              {/* Quick Select from unallocated boxes */}
              {unallocatedBoxes.length > 0 && (
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 text-xs">Sélectionner une boîte validée en attente :</label>
                  <select
                    onChange={e => {
                      const selected = unallocatedBoxes.find(b => b.boxNumber === e.target.value);
                      if (selected) {
                        setAllocateBoxForm({
                          boxNumber: selected.boxNumber,
                          batchId: selected.batchId,
                          direction: selected.direction || '',
                          folderCount: selected.folderCount || 1,
                          notes: ''
                        });
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    <option value="">-- Choisir une boîte --</option>
                    {unallocatedBoxes.map(b => (
                      <option key={`${b.batchId}_${b.boxNumber}`} value={b.boxNumber}>
                        📦 Boîte {b.boxNumber} ({b.direction || 'Direction'} · {b.folderCount || 0} dossiers)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <form onSubmit={handleAllocateBox} className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Numéro / Identifiant de la Boîte :</label>
                  <input
                    type="text"
                    required
                    value={allocateBoxForm.boxNumber}
                    onChange={e => setAllocateBoxForm({ ...allocateBoxForm, boxNumber: e.target.value })}
                    placeholder="ex: 104"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Direction Versante :</label>
                    <input
                      type="text"
                      value={allocateBoxForm.direction}
                      onChange={e => setAllocateBoxForm({ ...allocateBoxForm, direction: e.target.value })}
                      placeholder="Direction Sinistres"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700">Nombre de Dossiers :</label>
                    <input
                      type="number"
                      min="1"
                      value={allocateBoxForm.folderCount}
                      onChange={e => setAllocateBoxForm({ ...allocateBoxForm, folderCount: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsManualAllocating(null)}
                    className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl font-bold"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md cursor-pointer"
                  >
                    Confirmer le Rangement
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
