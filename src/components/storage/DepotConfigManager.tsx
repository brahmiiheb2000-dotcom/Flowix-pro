import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Layers, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  Check, 
  AlertTriangle, 
  RotateCcw, 
  History, 
  Hash, 
  Sliders, 
  Box, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  Search,
  RefreshCw,
  Info,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../lib/api';

interface Bay {
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
  mlTotal?: number;
  mlOccupied?: number;
  mlAvailable?: number;
  status: string;
  shelves?: any[];
}

interface Room {
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
  mlTotal?: number;
  mlOccupied?: number;
  mlAvailable?: number;
  status: string;
  bays: Bay[];
}

interface ConfigHistoryEntry {
  id: string;
  adminName: string;
  actionType: string;
  description: string;
  details?: string;
  createdAt: string;
}

interface Props {
  rooms: Room[];
  onRefresh: () => void;
  onSelectRoomForPlan?: (roomId: string) => void;
}

export const DepotConfigManager: React.FC<Props> = ({ rooms, onRefresh, onSelectRoomForPlan }) => {
  const triggerRefresh = () => {
    onRefresh();
    try {
      window.dispatchEvent(new CustomEvent('storage-depot-updated'));
    } catch (e) {}
  };

  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id || '');
  const [activeSubTab, setActiveSubTab] = useState<'rooms' | 'bays' | 'history'>('rooms');
  const [searchBayQuery, setSearchBayQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // History state
  const [historyList, setHistoryList] = useState<ConfigHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modal States
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [isEditRoomModalOpen, setIsEditRoomModalOpen] = useState<Room | null>(null);
  const [isAdjustBayCountModalOpen, setIsAdjustBayCountModalOpen] = useState<Room | null>(null);
  const [isEpisConfigModalOpen, setIsEpisConfigModalOpen] = useState(false);
  const [isAddBayModalOpen, setIsAddBayModalOpen] = useState(false);
  const [isEditBayModalOpen, setIsEditBayModalOpen] = useState<Bay | null>(null);
  const [isRenumberModalOpen, setIsRenumberModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState<{ type: 'room' | 'bay'; item: any } | null>(null);

  // Épis filter state
  const [selectedEpiFilter, setSelectedEpiFilter] = useState<string>('all');

  // Form States
  const [episConfigForm, setEpisConfigForm] = useState({
    roomId: rooms[0]?.id || 'room_salle_1',
    epis: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    baysPerEpi: 31,
    shelfCount: 7,
    shelfCapacity: 5,
    customEpiInput: '',
    numberingStyle: 'epi-travee'
  });

  const [newRoomForm, setNewRoomForm] = useState({
    name: '',
    code: 'S',
    building: 'Dépôt Central Principal',
    description: '',
    bayCount: 31,
    shelfCount: 7,
    shelfCapacity: 5
  });

  const [editRoomForm, setEditRoomForm] = useState({
    name: '',
    code: '',
    building: '',
    description: ''
  });

  const [adjustBayCountForm, setAdjustBayCountForm] = useState({
    targetBayCount: 31,
    shelfCount: 7,
    shelfCapacity: 5,
    numberingPrefix: 'T'
  });

  const [newBayForm, setNewBayForm] = useState({
    name: '',
    code: '',
    bayNumber: 1,
    description: '',
    shelfCount: 7,
    shelfCapacity: 5
  });

  const [editBayForm, setEditBayForm] = useState({
    name: '',
    code: '',
    bayNumber: 1,
    description: '',
    shelfCount: 7,
    shelfCapacity: 5
  });

  const [renumberForm, setRenumberForm] = useState({
    mode: 'room' as 'room' | 'global',
    prefix: 'T',
    padLength: 2
  });

  // Current active room
  const activeRoom = rooms.find(r => r.id === selectedRoomId) || rooms[0] || null;

  // Fetch History
  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.get('/api/storage/history');
      if (res?.history || res?.data?.history) {
        setHistoryList(res.history || res.data?.history || []);
      }
    } catch (err) {
      console.error("Error fetching storage config history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'history') {
      fetchHistory();
    }
  }, [activeSubTab]);

  useEffect(() => {
    if (rooms.length > 0 && (!selectedRoomId || !rooms.find(r => r.id === selectedRoomId))) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 6000);
  };

  // 1. ADD ROOM
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomForm.name.trim()) {
      showFeedback('error', 'Veuillez saisir le nom de la salle.');
      return;
    }

    try {
      setLoading(true);
      await api.post('/api/storage/rooms', {
        name: newRoomForm.name.trim(),
        code: newRoomForm.code.trim() || 'S',
        building: newRoomForm.building.trim(),
        description: newRoomForm.description.trim(),
        autoGenerateBays: true,
        bayCount: Number(newRoomForm.bayCount) || 31,
        shelfCount: Number(newRoomForm.shelfCount) || 7,
        shelfCapacity: Number(newRoomForm.shelfCapacity) || 5
      });

      showFeedback('success', `Salle « ${newRoomForm.name} » créée avec ${newRoomForm.bayCount} travées (${newRoomForm.shelfCount} niveaux/travée) !`);
      setIsAddRoomModalOpen(false);
      setNewRoomForm({
        name: '',
        code: `S${rooms.length + 1}`,
        building: 'Dépôt Central Principal',
        description: '',
        bayCount: 31,
        shelfCount: 7,
        shelfCapacity: 5
      });
      triggerRefresh();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || err.message || 'Erreur lors de la création de la salle.');
    } finally {
      setLoading(false);
    }
  };

  // 2. EDIT ROOM
  const handleOpenEditRoom = (room: Room) => {
    setIsEditRoomModalOpen(room);
    setEditRoomForm({
      name: room.name,
      code: room.code,
      building: room.building || '',
      description: room.description || ''
    });
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditRoomModalOpen) return;

    try {
      setLoading(true);
      await api.post('/api/storage/rooms', {
        id: isEditRoomModalOpen.id,
        name: editRoomForm.name.trim(),
        code: editRoomForm.code.trim(),
        building: editRoomForm.building.trim(),
        description: editRoomForm.description.trim()
      });

      showFeedback('success', `Salle « ${editRoomForm.name} » mise à jour avec succès !`);
      setIsEditRoomModalOpen(null);
      triggerRefresh();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || err.message || 'Erreur lors de la mise à jour.');
    } finally {
      setLoading(false);
    }
  };

  // 3. ADJUST BAY COUNT DYNAMICALLY
  const handleOpenAdjustBayCount = (room: Room) => {
    setIsAdjustBayCountModalOpen(room);
    setAdjustBayCountForm({
      targetBayCount: room.baysCount || 31,
      shelfCount: room.bays[0]?.shelvesCount || 7,
      shelfCapacity: room.bays[0]?.shelves?.[0]?.boxCapacity || 5,
      numberingPrefix: room.code ? `${room.code}-T` : 'T'
    });
  };

  const handleSaveAdjustBayCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdjustBayCountModalOpen) return;

    try {
      setLoading(true);
      const res = await api.post('/api/storage/batch-update-bays', {
        roomId: isAdjustBayCountModalOpen.id,
        targetBayCount: Number(adjustBayCountForm.targetBayCount),
        shelfCount: Number(adjustBayCountForm.shelfCount) || 7,
        shelfCapacity: Number(adjustBayCountForm.shelfCapacity) || 5,
        numberingPrefix: adjustBayCountForm.numberingPrefix || 'T'
      });

      showFeedback('success', res.message || res.data?.message || 'Nombre de travées mis à jour avec succès !');
      setIsAdjustBayCountModalOpen(null);
      triggerRefresh();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || err.message || 'Erreur lors de l’ajustement des travées.');
    } finally {
      setLoading(false);
    }
  };

  // 3b. OPEN EPIS CONFIGURATION MODAL
  const handleOpenEpisConfig = (room?: Room) => {
    const targetRoom = room || activeRoom || rooms[0];
    setEpisConfigForm({
      roomId: targetRoom?.id || 'room_salle_1',
      epis: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      baysPerEpi: 31,
      shelfCount: 7,
      shelfCapacity: 5,
      customEpiInput: '',
      numberingStyle: 'epi-travee'
    });
    setIsEpisConfigModalOpen(true);
  };

  const handleAddCustomEpi = () => {
    const raw = episConfigForm.customEpiInput.trim().toUpperCase();
    if (!raw) return;
    if (!episConfigForm.epis.includes(raw)) {
      setEpisConfigForm({
        ...episConfigForm,
        epis: [...episConfigForm.epis, raw],
        customEpiInput: ''
      });
    } else {
      setEpisConfigForm({ ...episConfigForm, customEpiInput: '' });
    }
  };

  const handleRemoveEpi = (epiToRemove: string) => {
    if (episConfigForm.epis.length <= 1) {
      showFeedback('error', 'Il faut au minimum 1 épi.');
      return;
    }
    setEpisConfigForm({
      ...episConfigForm,
      epis: episConfigForm.epis.filter(e => e !== epiToRemove)
    });
  };

  const handleSaveEpisConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (episConfigForm.epis.length === 0) {
      showFeedback('error', 'Veuillez définir au moins 1 épi.');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/api/storage/configure-epis', {
        roomId: episConfigForm.roomId,
        epis: episConfigForm.epis,
        baysPerEpi: Number(episConfigForm.baysPerEpi) || 31,
        shelfCount: Number(episConfigForm.shelfCount) || 7,
        shelfCapacity: Number(episConfigForm.shelfCapacity) || 5,
        numberingStyle: episConfigForm.numberingStyle
      });

      showFeedback('success', res.message || res.data?.message || 'Configuration des épis enregistrée avec succès !');
      setIsEpisConfigModalOpen(false);
      triggerRefresh();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || err.message || 'Erreur lors de la configuration des épis.');
    } finally {
      setLoading(false);
    }
  };

  // 3c. DIRECT PRESET FOR SALLE 1 (8 ÉPIS A-H × 31 TRAVÉES × 7 NIVEAUX)
  const handleApplySalle1Preset = async () => {
    try {
      setLoading(true);
      const res = await api.post('/api/storage/apply-salle1-preset', {});
      showFeedback('success', res.message || res.data?.message || 'Configuration Salle 1 appliquée : 8 Épis (A-H) × 31 Travées × 7 Tablettes !');
      triggerRefresh();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || err.message || 'Erreur lors de l’application du préréglage Salle 1.');
    } finally {
      setLoading(false);
    }
  };

  // 4. ADD SINGLE BAY
  const handleOpenAddBay = () => {
    if (!activeRoom) return;
    const nextNum = (activeRoom.bays?.length || 0) + 1;
    setNewBayForm({
      name: `Travée T${nextNum}`,
      code: `T${nextNum}`,
      bayNumber: nextNum,
      description: `Rayonnage ${activeRoom.name} - T${nextNum}`,
      shelfCount: 7,
      shelfCapacity: 5
    });
    setIsAddBayModalOpen(true);
  };

  const handleCreateBay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom) return;

    try {
      setLoading(true);
      await api.post('/api/storage/bays', {
        roomId: activeRoom.id,
        name: newBayForm.name.trim(),
        code: newBayForm.code.trim() || `T${newBayForm.bayNumber}`,
        bayNumber: Number(newBayForm.bayNumber) || 1,
        description: newBayForm.description.trim(),
        autoGenerateShelves: true,
        shelfCount: Number(newBayForm.shelfCount) || 7,
        shelfCapacity: Number(newBayForm.shelfCapacity) || 5
      });

      showFeedback('success', `Travée « ${newBayForm.name} » créée avec succès !`);
      setIsAddBayModalOpen(false);
      triggerRefresh();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || err.message || 'Erreur lors de l’ajout de la travée.');
    } finally {
      setLoading(false);
    }
  };

  // 5. EDIT SINGLE BAY
  const handleOpenEditBay = (bay: Bay) => {
    setIsEditBayModalOpen(bay);
    setEditBayForm({
      name: bay.name,
      code: bay.code,
      bayNumber: bay.bayNumber,
      description: bay.description || '',
      shelfCount: bay.shelvesCount || 7,
      shelfCapacity: bay.shelves?.[0]?.boxCapacity || 5
    });
  };

  const handleUpdateBay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditBayModalOpen || !activeRoom) return;

    try {
      setLoading(true);
      await api.post('/api/storage/bays', {
        id: isEditBayModalOpen.id,
        roomId: activeRoom.id,
        name: editBayForm.name.trim(),
        code: editBayForm.code.trim(),
        bayNumber: Number(editBayForm.bayNumber) || 1,
        description: editBayForm.description.trim()
      });

      showFeedback('success', `Travée « ${editBayForm.name} » mise à jour avec succès !`);
      setIsEditBayModalOpen(null);
      triggerRefresh();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || err.message || 'Erreur lors de la mise à jour.');
    } finally {
      setLoading(false);
    }
  };

  // 6. DELETE ROOM OR BAY (WITH SAFETY CHECK)
  const handleDeleteConfirm = async () => {
    if (!isDeleteConfirmModalOpen) return;
    const { type, item } = isDeleteConfirmModalOpen;

    try {
      setLoading(true);
      if (type === 'room') {
        const res = await api.delete(`/api/storage/rooms/${item.id}`);
        showFeedback('success', res.message || res.data?.message || `Salle « ${item.name} » supprimée.`);
      } else {
        const res = await api.delete(`/api/storage/bays/${item.id}`);
        showFeedback('success', res.message || res.data?.message || `Travée « ${item.name} » supprimée.`);
      }
      setIsDeleteConfirmModalOpen(null);
      triggerRefresh();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Impossible de supprimer cet élément.';
      showFeedback('error', errMsg);
    } finally {
      setLoading(false);
    }
  };

  // 7. RENUMBER BAYS
  const handleRenumberBays = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await api.post('/api/storage/renumber-bays', {
        roomId: renumberForm.mode === 'room' ? activeRoom?.id : undefined,
        mode: renumberForm.mode,
        prefix: renumberForm.prefix.trim() || 'T',
        padLength: Number(renumberForm.padLength) || 2
      });

      showFeedback('success', res.message || res.data?.message || 'Numérotation recalculée avec succès !');
      setIsRenumberModalOpen(false);
      triggerRefresh();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.error || err.message || 'Erreur lors de la renumérotation.');
    } finally {
      setLoading(false);
    }
  };

  // Extract unique epis in active room
  const availableEpis = React.useMemo(() => {
    if (!activeRoom) return [];
    const set = new Set<string>();
    (activeRoom.bays || []).forEach(b => {
      if ((b as any).epi) {
        set.add((b as any).epi);
      } else if (b.code && b.code.includes('-')) {
        set.add(b.code.split('-')[0]);
      }
    });
    return Array.from(set).sort();
  }, [activeRoom]);

  // Filter bays for active room
  const filteredBays = (activeRoom?.bays || []).filter(b => {
    if (selectedEpiFilter !== 'all') {
      const bayEpi = (b as any).epi || (b.code && b.code.includes('-') ? b.code.split('-')[0] : '');
      if (bayEpi !== selectedEpiFilter) return false;
    }
    if (!searchBayQuery.trim()) return true;
    const q = searchBayQuery.toLowerCase();
    return b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6" id="depot-configuration-manager">
      {/* Toast Feedback */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className={`p-4 rounded-2xl flex items-center justify-between gap-3 shadow-lg border ${
              feedback.type === 'success' 
                ? 'bg-emerald-950 text-emerald-200 border-emerald-500/30' 
                : 'bg-rose-950 text-rose-200 border-rose-500/30'
            }`}
          >
            <div className="flex items-center gap-3">
              {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
              <span className="text-sm font-semibold">{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="p-1 hover:bg-white/10 rounded-lg">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Sliders className="w-4 h-4" />
            <span>Paramètres Avancés & Contrôle Intégral</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">Configuration Dynamique du Dépôt d'Archives</h2>
          <p className="text-slate-400 text-xs mt-1">
            Gérez les salles, configurez les épis (A à H), ajustez les travées (31/épi) et tablettes (7/travée) avec intégrité absolue des boîtes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleOpenEpisConfig()}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
            title="Configurer les épis et travées (ex: Salle 1 A-H × 31 × 7)"
          >
            <Layers size={16} />
            <span>⚙️ Configurer Épis & Travées</span>
          </button>
          <button
            onClick={() => setIsAddRoomModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>Ajouter une Salle</span>
          </button>
          <button
            onClick={() => setIsRenumberModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
          >
            <Hash size={16} />
            <span>Numérotation Auto</span>
          </button>
          <button
            onClick={onRefresh}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-all cursor-pointer"
            title="Actualiser"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* QUICK PRESET CARD FOR SALLE 1 (ÉPIS A-H × 31 TRAVÉES × 7 TABLETTES) */}
      <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-indigo-950 border border-emerald-500/40 rounded-3xl p-5 shadow-xl text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-emerald-500 text-slate-950 text-[11px] font-black rounded-lg uppercase tracking-wider">
                Configuration Demandée
              </span>
              <span className="text-emerald-300 text-xs font-bold font-mono">
                Salle 1 : Épis A, B, C, D, E, F, G, H
              </span>
            </div>
            <h3 className="text-lg font-black text-white">
              Structure Salle 1 : 8 Épis (A–H) × 31 Travées/Épi × 7 Niveaux/Travée
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              Total : <strong className="text-emerald-400">248 travées</strong> (A-T01 à H-T31) • <strong className="text-emerald-400">1 736 tablettes/niveaux</strong> • Capacité totale : <strong className="text-emerald-400">8 680 boîtes</strong> (1 487,75 mètres linéaires).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleApplySalle1Preset}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-2xl shadow-lg shadow-emerald-500/30 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <CheckCircle2 size={16} className="text-slate-950" />
              <span>{loading ? 'Application...' : '⚡ Appliquer Configuration Salle 1 (248 Travées)'}</span>
            </button>
            <button
              onClick={() => handleOpenEpisConfig()}
              className="flex items-center gap-2 px-4 py-3 bg-slate-800/80 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl border border-slate-700 transition-all cursor-pointer"
            >
              <Sliders size={15} />
              <span>Personnaliser les Épis</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('rooms')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'rooms' 
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Building2 size={16} />
            <span>Salles d'Archivage ({rooms.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('bays')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'bays' 
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers size={16} />
            <span>Travées & Rayonnages</span>
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'history' 
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <History size={16} />
            <span>Historique de Configuration</span>
          </button>
        </div>

        {activeSubTab === 'bays' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Filtrer par salle :</span>
            <select
              value={selectedRoomId}
              onChange={(e) => {
                setSelectedRoomId(e.target.value);
                setSelectedEpiFilter('all');
              }}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.baysCount} travées)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* VIEW 1: ROOMS MANAGEMENT */}
      {activeSubTab === 'rooms' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Salle & Emplacement</th>
                    <th className="py-3.5 px-4 text-center">Épis / Structure</th>
                    <th className="py-3.5 px-4 text-center">Travées</th>
                    <th className="py-3.5 px-4 text-center">Capacité Boîtes</th>
                    <th className="py-3.5 px-4 text-center">Occupées</th>
                    <th className="py-3.5 px-4 text-center">Disponibles</th>
                    <th className="py-3.5 px-4 text-center">Mètres Linéaires</th>
                    <th className="py-3.5 px-4 text-center">Taux d'occupation</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rooms.map((room, rIdx) => {
                    const roomEpis = (room as any).epis || [];
                    return (
                    <tr key={room.id || `room-${rIdx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm shrink-0 border border-indigo-100">
                            {room.code || 'S'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 text-sm">{room.name}</div>
                            <div className="text-[11px] text-slate-500 font-medium">{room.building || 'Dépôt Central'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {roomEpis.length > 0 ? (
                          <div className="flex flex-wrap items-center justify-center gap-1 max-w-[200px] mx-auto">
                            {roomEpis.slice(0, 8).map((ep: any, epIdx: number) => {
                              const epiLabel = ep.code || ep.epi || `Epi-${epIdx + 1}`;
                              const bayCountVal = ep.baysCount || ep.bayCount || 0;
                              return (
                                <span key={ep.code || ep.epi || `epi-badge-${epIdx}`} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-black text-[10px] border border-indigo-100">
                                  {epiLabel} ({bayCountVal}T)
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Non divisé</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg font-black text-xs">
                          {room.baysCount} travées
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                        {room.totalCapacity.toLocaleString()} boîtes
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-bold">
                          {room.storedBoxesCount.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold">
                          {room.availableCapacity.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center text-slate-600 font-medium">
                        <span className="font-bold text-slate-800">{room.mlOccupied || Math.round(room.storedBoxesCount * 0.17)} ml</span>
                        <span className="text-slate-400 text-[10px]"> / {room.mlTotal || Math.round(room.totalCapacity * 0.17)} ml</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                room.occupancyRate >= 90 ? 'bg-rose-500' :
                                room.occupancyRate >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(100, room.occupancyRate)}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-800 text-[11px]">{room.occupancyRate}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEpisConfig(room)}
                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-black flex items-center gap-1 transition-all cursor-pointer border border-emerald-200"
                            title="Configurer les Épis (A-H) et travées pour cette salle"
                          >
                            <Layers size={13} />
                            <span>Épis & Travées</span>
                          </button>
                          <button
                            onClick={() => handleOpenAdjustBayCount(room)}
                            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                            title="Ajuster le nombre de travées (ex: 31 → 35, 40)"
                          >
                            <Sliders size={13} />
                            <span>Ajuster</span>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedRoomId(room.id);
                              setActiveSubTab('bays');
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                            title="Voir les travées de cette salle"
                          >
                            <Layers size={13} />
                            <span>Travées</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditRoom(room)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                            title="Modifier les détails de la salle"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => setIsDeleteConfirmModalOpen({ type: 'room', item: room })}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Supprimer la salle"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
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

      {/* VIEW 2: BAYS & SHELVES MANAGEMENT */}
      {activeSubTab === 'bays' && (
        <div className="space-y-4">
          {activeRoom && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-indigo-700 uppercase">Salle sélectionnée : {activeRoom.name}</div>
                  <div className="text-slate-600 text-xs mt-0.5">
                    {activeRoom.baysCount} travées au total • {activeRoom.totalCapacity} boîtes max • {activeRoom.storedBoxesCount} boîtes stockées ({activeRoom.occupancyRate}%)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Rechercher travée..."
                      value={searchBayQuery}
                      onChange={(e) => setSearchBayQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 w-44"
                    />
                  </div>
                  <button
                    onClick={() => handleOpenEpisConfig(activeRoom)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                  >
                    <Sliders size={14} />
                    <span>Config Épis</span>
                  </button>
                  <button
                    onClick={handleOpenAddBay}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Ajouter une Travée</span>
                  </button>
                </div>
              </div>

              {/* ÉPIS FILTER TABS */}
              {availableEpis.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-500 mr-1">Filtrer par Épi :</span>
                  <button
                    onClick={() => setSelectedEpiFilter('all')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedEpiFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Tous les épis ({activeRoom.baysCount})
                  </button>
                  {availableEpis.map((epiName, epiIdx) => {
                    const count = (activeRoom.bays || []).filter(b => (b as any).epi === epiName || b.code.startsWith(`${epiName}-`)).length;
                    return (
                      <button
                        key={`epi-filter-${epiName || epiIdx}`}
                        onClick={() => setSelectedEpiFilter(epiName)}
                        className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                          selectedEpiFilter === epiName
                            ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400/30'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Épi {epiName} <span className="text-[10px] font-normal opacity-80">({count}T)</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">N°</th>
                    <th className="py-3 px-4">Épi</th>
                    <th className="py-3 px-4">Code & Nom</th>
                    <th className="py-3 px-4 text-center">Niveaux / Tablettes</th>
                    <th className="py-3 px-4 text-center">Boîtes / Tablette</th>
                    <th className="py-3 px-4 text-center">Capacité Totale</th>
                    <th className="py-3 px-4 text-center">Mètres Linéaires</th>
                    <th className="py-3 px-4 text-center">Boîtes Stockées</th>
                    <th className="py-3 px-4 text-center">Taux</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBays.map((bay, bIdx) => {
                    const bayEpi = (bay as any).epi || (bay.code && bay.code.includes('-') ? bay.code.split('-')[0] : null);
                    return (
                    <tr key={bay.id || bay.code || `bay-${bIdx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-500">
                        #{bay.bayNumber}
                      </td>
                      <td className="py-3 px-4">
                        {bayEpi ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-black rounded-md text-[11px] border border-emerald-200">
                            Épi {bayEpi}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-900 text-white rounded font-black text-xs font-mono">
                            {bay.code}
                          </span>
                          <span className="font-bold text-slate-800">{bay.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 font-bold">
                          {bay.shelvesCount} tablettes
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-600 font-medium">
                        {bay.shelves?.[0]?.boxCapacity || 5} boîtes
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">
                        {bay.totalCapacity} boîtes
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-600">
                        {bay.mlTotal || Math.round(bay.totalCapacity * 0.1714 * 100) / 100} ml
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded font-black text-xs ${
                          bay.storedBoxesCount > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {bay.storedBoxesCount} / {bay.totalCapacity}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded font-black text-[11px] ${
                          bay.occupancyRate >= 90 ? 'bg-rose-100 text-rose-700' :
                          bay.occupancyRate >= 60 ? 'bg-amber-100 text-amber-800' :
                          bay.storedBoxesCount > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {bay.occupancyRate}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditBay(bay)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                            title="Modifier cette travée"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setIsDeleteConfirmModalOpen({ type: 'bay', item: bay })}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Supprimer cette travée"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {filteredBays.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                        Aucune travée trouvée dans cette sélection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: CONFIGURATION AUDIT HISTORY */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Journal des modifications de configuration</h3>
                <p className="text-slate-500 text-xs">Traces d'audit de toutes les modifications apportées à la structure du dépôt</p>
              </div>
              <button
                onClick={fetchHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <RefreshCw size={13} className={loadingHistory ? 'animate-spin' : ''} />
                <span>Actualiser l'historique</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {historyList.map((entry, hIdx) => (
                <div key={entry.id || `hist-${hIdx}`} className="p-4 hover:bg-slate-50 transition-colors flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                      <History size={16} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 text-xs">{entry.description}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                          {entry.actionType}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Par <strong className="text-slate-600">{entry.adminName}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono shrink-0">
                    {entry.createdAt ? new Date(entry.createdAt).toLocaleString('fr-FR') : 'Récemment'}
                  </div>
                </div>
              ))}
              {historyList.length === 0 && !loadingHistory && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Aucune modification de configuration enregistrée pour le moment.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD ROOM */}
      <AnimatePresence>
        {isAddRoomModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Ajouter une Nouvelle Salle</h3>
                    <p className="text-slate-400 text-xs">Configurez les dimensions et la structure de la salle</p>
                  </div>
                </div>
                <button onClick={() => setIsAddRoomModalOpen(false)} className="p-2 hover:bg-white/10 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nom de la Salle *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Salle 4, Salle Contentieux..."
                      value={newRoomForm.name}
                      onChange={(e) => setNewRoomForm({ ...newRoomForm, name: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Code Court *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: S4"
                      value={newRoomForm.code}
                      onChange={(e) => setNewRoomForm({ ...newRoomForm, code: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Bâtiment / Emplacement</label>
                    <input
                      type="text"
                      placeholder="Ex: Dépôt Central Bâtiment C"
                      value={newRoomForm.building}
                      onChange={(e) => setNewRoomForm({ ...newRoomForm, building: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 space-y-3">
                  <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <Sliders size={14} className="text-indigo-600" />
                    <span>Dimensions des Rayonnages & Niveaux</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Nombre de travées</label>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={newRoomForm.bayCount}
                        onChange={(e) => setNewRoomForm({ ...newRoomForm, bayCount: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-black text-indigo-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Niveaux / travée</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={newRoomForm.shelfCount}
                        onChange={(e) => setNewRoomForm({ ...newRoomForm, shelfCount: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Boîtes / niveau</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={newRoomForm.shelfCapacity}
                        onChange={(e) => setNewRoomForm({ ...newRoomForm, shelfCapacity: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-bold"
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-indigo-700 font-medium">
                    Capacité estimée : <strong>{newRoomForm.bayCount * newRoomForm.shelfCount * newRoomForm.shelfCapacity} boîtes</strong> (~{Math.round(newRoomForm.bayCount * newRoomForm.shelfCount * newRoomForm.shelfCapacity * 0.17)} ml)
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddRoomModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <Save size={14} />
                    <span>{loading ? 'Création en cours...' : 'Créer la Salle'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 1.5: CONFIGURE ÉPIS & TRAVÉES */}
      <AnimatePresence>
        {isEpisConfigModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white flex items-center justify-between border-b border-emerald-500/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/40">
                    <Layers size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Configuration des Épis & Travées</h3>
                    <p className="text-emerald-300 text-xs">Structuration physique des allées et rayonnages</p>
                  </div>
                </div>
                <button onClick={() => setIsEpisConfigModalOpen(false)} className="p-2 hover:bg-white/10 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEpisConfig} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {/* PRESET QUICK BUTTON */}
                <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200 flex items-center justify-between gap-3">
                  <div className="text-xs text-emerald-900">
                    <strong className="block font-bold">Préréglage Salle 1 standard</strong>
                    <span>8 Épis (A–H) × 31 Travées/Épi × 7 Tablettes</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEpisConfigForm({
                        roomId: rooms[0]?.id || 'room_salle_1',
                        epis: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
                        baysPerEpi: 31,
                        shelfCount: 7,
                        shelfCapacity: 5,
                        customEpiInput: '',
                        numberingStyle: 'epi-travee'
                      });
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shrink-0 cursor-pointer shadow-sm"
                  >
                    Remplir (Salle 1)
                  </button>
                </div>

                {/* TARGET ROOM */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Salle d'archivage cible *</label>
                  <select
                    value={episConfigForm.roomId}
                    onChange={(e) => setEpisConfigForm({ ...episConfigForm, roomId: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.baysCount} travées actuelles)
                      </option>
                    ))}
                  </select>
                </div>

                {/* EPIS LIST */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Épis à générer dans cette salle ({episConfigForm.epis.length} épis) *
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 p-3 bg-slate-50 border border-slate-200 rounded-2xl min-h-[52px]">
                    {episConfigForm.epis.map((epi, epIdx) => (
                      <span
                        key={`form-epi-${epi}-${epIdx}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white text-slate-800 border border-slate-300 rounded-xl font-black text-xs shadow-xs"
                      >
                        <span>Épi {epi}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveEpi(epi)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Add Custom Epi */}
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="Ajouter un épi (ex: I, J, K)..."
                      value={episConfigForm.customEpiInput}
                      onChange={(e) => setEpisConfigForm({ ...episConfigForm, customEpiInput: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomEpi();
                        }
                      }}
                      className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-xl uppercase font-bold"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomEpi}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                    >
                      + Ajouter Épi
                    </button>
                  </div>
                </div>

                {/* NUMBER OF BAYS & SHELVES */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Travées par Épi *</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={episConfigForm.baysPerEpi}
                      onChange={(e) => setEpisConfigForm({ ...episConfigForm, baysPerEpi: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-black text-emerald-700"
                    />
                    <div className="flex items-center gap-1 mt-1">
                      {[10, 20, 31, 50].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setEpisConfigForm({ ...episConfigForm, baysPerEpi: n })}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            episConfigForm.baysPerEpi === n ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tablettes / Travée *</label>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      required
                      value={episConfigForm.shelfCount}
                      onChange={(e) => setEpisConfigForm({ ...episConfigForm, shelfCount: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-black text-indigo-700"
                    />
                    <div className="flex items-center gap-1 mt-1">
                      {[5, 6, 7, 8].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setEpisConfigForm({ ...episConfigForm, shelfCount: n })}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            episConfigForm.shelfCount === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Boîtes / Tablette</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      required
                      value={episConfigForm.shelfCapacity}
                      onChange={(e) => setEpisConfigForm({ ...episConfigForm, shelfCapacity: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-black text-slate-800"
                    />
                    <div className="text-[10px] text-slate-400 mt-1">≈ 0.86 ml par tablette</div>
                  </div>
                </div>

                {/* LIVE RECAP SUMMARY */}
                {(() => {
                  const numEpis = episConfigForm.epis.length;
                  const totalBays = numEpis * Number(episConfigForm.baysPerEpi);
                  const totalShelves = totalBays * Number(episConfigForm.shelfCount);
                  const totalCapacity = totalShelves * Number(episConfigForm.shelfCapacity);
                  const totalMl = Math.round(totalCapacity * 0.1714 * 100) / 100;
                  return (
                    <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2 border border-slate-800">
                      <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                        Aperçu du calcul en temps réel :
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                        <div className="p-2 bg-white/5 rounded-xl">
                          <div className="text-lg font-black text-white">{numEpis}</div>
                          <div className="text-[10px] text-slate-400">Épis</div>
                        </div>
                        <div className="p-2 bg-white/5 rounded-xl">
                          <div className="text-lg font-black text-emerald-400">{totalBays}</div>
                          <div className="text-[10px] text-slate-400">Travées</div>
                        </div>
                        <div className="p-2 bg-white/5 rounded-xl">
                          <div className="text-lg font-black text-indigo-400">{totalShelves}</div>
                          <div className="text-[10px] text-slate-400">Tablettes</div>
                        </div>
                        <div className="p-2 bg-white/5 rounded-xl">
                          <div className="text-lg font-black text-amber-400">{totalCapacity}</div>
                          <div className="text-[10px] text-slate-400">Boîtes ({totalMl} ml)</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 pt-1">
                        Format généré : <code className="text-emerald-300 font-mono font-bold">A-T01, A-T02 ... A-T{episConfigForm.baysPerEpi}</code> jusqu'à <code className="text-emerald-300 font-mono font-bold">{episConfigForm.epis[episConfigForm.epis.length - 1] || 'H'}-T{episConfigForm.baysPerEpi}</code>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEpisConfigModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <Save size={14} />
                    <span>{loading ? 'Génération en cours...' : 'Enregistrer et Structurer les Épis'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: ADJUST BAY COUNT (ex: 31 -> 35 or 40) */}
      <AnimatePresence>
        {isAdjustBayCountModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
                    <Sliders size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Ajuster les Travées : {isAdjustBayCountModalOpen.name}</h3>
                    <p className="text-slate-400 text-xs">Modifier le nombre total de travées dynamiquement</p>
                  </div>
                </div>
                <button onClick={() => setIsAdjustBayCountModalOpen(null)} className="p-2 hover:bg-white/10 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveAdjustBayCount} className="p-6 space-y-4">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs text-slate-600">
                  Actuellement : <strong>{isAdjustBayCountModalOpen.baysCount} travées</strong> ({isAdjustBayCountModalOpen.storedBoxesCount} boîtes stockées).
                  {adjustBayCountForm.targetBayCount > isAdjustBayCountModalOpen.baysCount ? (
                    <span className="text-emerald-700 block mt-1 font-semibold">
                      + {adjustBayCountForm.targetBayCount - isAdjustBayCountModalOpen.baysCount} nouvelles travées vides seront ajoutées sans toucher aux boîtes existantes.
                    </span>
                  ) : adjustBayCountForm.targetBayCount < isAdjustBayCountModalOpen.baysCount ? (
                    <span className="text-rose-700 block mt-1 font-semibold">
                      Attention : Le système vérifiera que les {isAdjustBayCountModalOpen.baysCount - adjustBayCountForm.targetBayCount} travées retirées ne contiennent aucune boîte.
                    </span>
                  ) : null}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Cible de Travées *</label>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    required
                    value={adjustBayCountForm.targetBayCount}
                    onChange={(e) => setAdjustBayCountForm({ ...adjustBayCountForm, targetBayCount: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-black text-indigo-700"
                  />
                  <div className="text-[11px] text-slate-400 mt-1">Exemple : passer de 31 à 35 ou 40 travées</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Niveaux / nouvelle travée</label>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={adjustBayCountForm.shelfCount}
                      onChange={(e) => setAdjustBayCountForm({ ...adjustBayCountForm, shelfCount: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Boîtes / niveau</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={adjustBayCountForm.shelfCapacity}
                      onChange={(e) => setAdjustBayCountForm({ ...adjustBayCountForm, shelfCapacity: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAdjustBayCountModalOpen(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <Save size={14} />
                    <span>{loading ? 'Application...' : 'Appliquer la Nouvelle Capacité'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: EDIT ROOM INFO */}
      <AnimatePresence>
        {isEditRoomModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
                    <Edit3 size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Modifier la Salle</h3>
                    <p className="text-slate-400 text-xs">Renommer et mettre à jour les métadonnées</p>
                  </div>
                </div>
                <button onClick={() => setIsEditRoomModalOpen(null)} className="p-2 hover:bg-white/10 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUpdateRoom} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nom de la Salle *</label>
                  <input
                    type="text"
                    required
                    value={editRoomForm.name}
                    onChange={(e) => setEditRoomForm({ ...editRoomForm, name: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Code</label>
                    <input
                      type="text"
                      value={editRoomForm.code}
                      onChange={(e) => setEditRoomForm({ ...editRoomForm, code: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Bâtiment</label>
                    <input
                      type="text"
                      value={editRoomForm.building}
                      onChange={(e) => setEditRoomForm({ ...editRoomForm, building: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={editRoomForm.description}
                    onChange={(e) => setEditRoomForm({ ...editRoomForm, description: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditRoomModalOpen(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg cursor-pointer"
                  >
                    {loading ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: ADD SINGLE BAY */}
      <AnimatePresence>
        {isAddBayModalOpen && activeRoom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
                    <Plus size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Ajouter une Travée</h3>
                    <p className="text-slate-400 text-xs">Dans la salle : {activeRoom.name}</p>
                  </div>
                </div>
                <button onClick={() => setIsAddBayModalOpen(false)} className="p-2 hover:bg-white/10 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateBay} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nom de la travée *</label>
                    <input
                      type="text"
                      required
                      value={newBayForm.name}
                      onChange={(e) => setNewBayForm({ ...newBayForm, name: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Code Travée</label>
                    <input
                      type="text"
                      value={newBayForm.code}
                      onChange={(e) => setNewBayForm({ ...newBayForm, code: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Numéro d'ordre</label>
                    <input
                      type="number"
                      value={newBayForm.bayNumber}
                      onChange={(e) => setNewBayForm({ ...newBayForm, bayNumber: Number(e.target.value) })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Niveaux / étagères</label>
                    <input
                      type="number"
                      min="1"
                      max="15"
                      value={newBayForm.shelfCount}
                      onChange={(e) => setNewBayForm({ ...newBayForm, shelfCount: Number(e.target.value) })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Boîtes max / niveau</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={newBayForm.shelfCapacity}
                      onChange={(e) => setNewBayForm({ ...newBayForm, shelfCapacity: Number(e.target.value) })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddBayModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg cursor-pointer"
                  >
                    {loading ? 'Création...' : 'Créer la Travée'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5: EDIT SINGLE BAY */}
      <AnimatePresence>
        {isEditBayModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
                    <Edit3 size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Modifier la Travée {isEditBayModalOpen.code}</h3>
                    <p className="text-slate-400 text-xs">Renommer, changer le code ou l'ordre</p>
                  </div>
                </div>
                <button onClick={() => setIsEditBayModalOpen(null)} className="p-2 hover:bg-white/10 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUpdateBay} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nom de la travée *</label>
                    <input
                      type="text"
                      required
                      value={editBayForm.name}
                      onChange={(e) => setEditBayForm({ ...editBayForm, name: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Code Travée</label>
                    <input
                      type="text"
                      value={editBayForm.code}
                      onChange={(e) => setEditBayForm({ ...editBayForm, code: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Numéro d'ordre</label>
                    <input
                      type="number"
                      value={editBayForm.bayNumber}
                      onChange={(e) => setEditBayForm({ ...editBayForm, bayNumber: Number(e.target.value) })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditBayModalOpen(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg cursor-pointer"
                  >
                    {loading ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 6: AUTOMATIC RENUMBERING */}
      <AnimatePresence>
        {isRenumberModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white">
                    <Hash size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Numérotation Automatique</h3>
                    <p className="text-slate-400 text-xs">Recalculer les codes et étiquettes des travées</p>
                  </div>
                </div>
                <button onClick={() => setIsRenumberModalOpen(false)} className="p-2 hover:bg-white/10 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleRenumberBays} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mode de numérotation</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRenumberForm({ ...renumberForm, mode: 'room' })}
                      className={`p-3 rounded-xl text-xs font-bold border text-left transition-all ${
                        renumberForm.mode === 'room'
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-sm'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div>Par Salle ({activeRoom?.name || 'Salle courante'})</div>
                      <div className="text-[10px] text-slate-400 font-normal mt-0.5">T01..T31 pour chaque salle</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenumberForm({ ...renumberForm, mode: 'global' })}
                      className={`p-3 rounded-xl text-xs font-bold border text-left transition-all ${
                        renumberForm.mode === 'global'
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-sm'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div>Numérotation Globale</div>
                      <div className="text-[10px] text-slate-400 font-normal mt-0.5">T01..T93 à travers tout le dépôt</div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Préfixe de code</label>
                    <input
                      type="text"
                      value={renumberForm.prefix}
                      onChange={(e) => setRenumberForm({ ...renumberForm, prefix: e.target.value })}
                      placeholder="Ex: T, A-, RAY-"
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Format de zéros (padding)</label>
                    <select
                      value={renumberForm.padLength}
                      onChange={(e) => setRenumberForm({ ...renumberForm, padLength: Number(e.target.value) })}
                      className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl font-bold"
                    >
                      <option value={0}>1, 2, 3... (Sans zéro)</option>
                      <option value={2}>01, 02, 03... (2 chiffres)</option>
                      <option value={3}>001, 002, 003... (3 chiffres)</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
                  Aperçu du format généré : <strong className="text-indigo-700 font-mono font-black">{renumberForm.prefix}{renumberForm.padLength === 2 ? '01' : renumberForm.padLength === 3 ? '001' : '1'}</strong>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsRenumberModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <Save size={14} />
                    <span>{loading ? 'Calcul en cours...' : 'Recalculer les Codes'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 7: DELETE CONFIRMATION WITH BOX SAFETY CHECKS */}
      <AnimatePresence>
        {isDeleteConfirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-rose-200"
            >
              <div className="p-6 bg-rose-950 text-rose-100 flex items-center justify-between border-b border-rose-800/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-600 flex items-center justify-center text-white">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-base">Confirmer la Suppression</h3>
                    <p className="text-rose-300 text-xs">Vérification de sécurité d'intégrité des archives</p>
                  </div>
                </div>
                <button onClick={() => setIsDeleteConfirmModalOpen(null)} className="p-2 hover:bg-white/10 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-700 leading-relaxed">
                  Êtes-vous certain de vouloir supprimer définitivement {isDeleteConfirmModalOpen.type === 'room' ? 'la salle' : 'la travée'} :
                  <strong className="text-slate-900 block text-sm mt-1">« {isDeleteConfirmModalOpen.item.name} »</strong>
                </p>

                <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5">
                  <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Si cet emplacement contient des boîtes d'archives, la suppression sera strictement bloquée par mesure de sécurité pour éviter toute perte de données.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirmModalOpen(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteConfirm}
                    disabled={loading}
                    className="px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    <Trash2 size={14} />
                    <span>{loading ? 'Vérification...' : 'Confirmer la suppression'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
