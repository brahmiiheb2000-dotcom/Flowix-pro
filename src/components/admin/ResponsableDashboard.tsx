import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  CheckSquare, 
  Users, 
  Settings, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X, 
  Calendar, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  Barcode,
  Search,
  BookOpen,
  ArrowRight,
  Database,
  Download,
  Upload,
  Info,
  BarChart3,
  FileText,
  TrendingUp,
  ExternalLink,
  ArrowRightLeft,
  ShieldCheck,
  FileStack,
  CheckCircle,
  XCircle,
  Sparkles,
  Eye,
  Archive,
  Printer,
  Clock,
  MapPin,
  Layers,
  Filter,
  CalendarRange,
  Tag,
  SlidersHorizontal
} from 'lucide-react';
import { api } from '../../lib/api';
import { BordereauPreliminaireModal, ValidationTransfertModal, FicheAcceptationModal, TransferRequestItem, BordereauFinalInventaireModal, BordereauFinalEliminationModal, PVTransfertModal } from '../transfer/TransferDocsModals';

// Simple Alert Toast in French
interface AlertInfo {
  type: 'success' | 'error' | 'info';
  message: string;
}

export function ResponsableDashboard() {
  const [activeTab, setActiveTab] = useState<'audit' | 'transfers' | 'rules' | 'organigramme' | 'users' | 'barcodes' | 'backup' | 'search' | 'analytics'>('audit');
  const [toast, setToast] = useState<AlertInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfViewerFile, setPdfViewerFile] = useState<string | null>(null);
  const [pdfViewerTitle, setPdfViewerTitle] = useState<string>('');

  // Lists state
  const [pendingInventories, setPendingInventories] = useState<any[]>([]);
  const [eliminationRequests, setEliminationRequests] = useState<any[]>([]);
  const [transferRequests, setTransferRequests] = useState<any[]>([]);
  const [integrationBatches, setIntegrationBatches] = useState<any[]>([]);
  const [inspectingBatch, setInspectingBatch] = useState<any | null>(null);
  const [viewingBatchSlip, setViewingBatchSlip] = useState<any | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [organigramme, setOrganigramme] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [barcodeSettings, setBarcodeSettings] = useState<any[]>([]);

  // Search/Filters state for Integration Batches (Validation & Audit)
  const [integrationBatchSearch, setIntegrationBatchSearch] = useState('');
  const [integrationBatchStatusFilter, setIntegrationBatchStatusFilter] = useState<'all' | 'en_attente_audit' | 'valide' | 'rejete'>('all');
  const [integrationBatchDirectionFilter, setIntegrationBatchDirectionFilter] = useState('');

  // Search & Filter state for Folders inside the Inspection Modal
  const [inspectFolderSearch, setInspectFolderSearch] = useState('');
  const [inspectFolderSortFinal, setInspectFolderSortFinal] = useState<'all' | 'EL' | 'CP'>('all');
  const [inspectFolderSelectedBox, setInspectFolderSelectedBox] = useState<'all' | string>('all');

  // Modals state for transfer requests and final audit bordereaux
  const [validatingTransfer, setValidatingTransfer] = useState<TransferRequestItem | null>(null);
  const [viewingTransferPreliminaire, setViewingTransferPreliminaire] = useState<TransferRequestItem | null>(null);
  const [viewingTransferAcceptance, setViewingTransferAcceptance] = useState<TransferRequestItem | null>(null);
  const [viewingFinalInventoryBatch, setViewingFinalInventoryBatch] = useState<any[] | null>(null);
  const [viewingFinalEliminationBatch, setViewingFinalEliminationBatch] = useState<any[] | null>(null);

  // Search/Filters state (For pending validation tab)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDirection, setSelectedDirection] = useState('');

  // Global Search states
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSelectedDirection, setGlobalSelectedDirection] = useState('');
  const [showEliminatedArchives, setShowEliminatedArchives] = useState(false);
  const [globalInventoryResults, setGlobalInventoryResults] = useState<any[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);

  // Statistics states
  const [statsDirectionsData, setStatsDirectionsData] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Selected references for bulk validation
  const [selectedInventories, setSelectedInventories] = useState<string[]>([]);
  const [selectedEliminations, setSelectedEliminations] = useState<string[]>([]);

  // Editing items state
  const [editingItem, setEditingItem] = useState<any | null>(null);

  // New Rule Modal
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [newRule, setNewRule] = useState({
    reference: '',
    title: '',
    direction: '',
    docType: '',
    activeYears: 5,
    semiActiveYears: 10,
    finalDisposition: 'EL',
    support: 'Papier',
    retentionTrigger: 'Date de clôture',
    isCritical: 0,
    category: ''
  });

  // New User Form
  const [newUser, setNewUser] = useState({
    email: '',
    displayName: '',
    role: 'Agent'
  });

  // New Org Form
  const [newOrg, setNewOrg] = useState({
    name: '',
    code: '',
    description: ''
  });
  const [editingOrg, setEditingOrg] = useState<any | null>(null);

  // New Barcode Rule Form
  const [newBarcodeRule, setNewBarcodeRule] = useState({
    direction: '',
    prefix: ''
  });

  // Show dynamic toast helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // ----------------------------------------------------
  // --- FETCHING ACTIONS ---
  // ----------------------------------------------------

  const loadAllData = async () => {
    setLoading(true);
    try {
      // 1. Fetch pending inventories
      try {
        const massInv = await api.get('/api/mass-inventory');
        // Keep files/folders with pending status or general active review
        setPendingInventories(massInv.filter((item: any) => item.archivalStatus !== 'Eliminated'));
      } catch (e) {
        console.error("Failed to load inventories", e);
      }

      // 2. Fetch pending elimination requests
      try {
        const elims = await api.get('/api/elimination/pending-pv');
        setEliminationRequests(elims || []);
      } catch (e) {
        // Fallback or retry
        try {
          const allElim = await api.get('/api/elimination/requests');
          setEliminationRequests(allElim.filter((e: any) => e.status === 'Pending'));
        } catch (err) {
          console.error("Failed to load elimination requests", err);
        }
      }

      // 3. Fetch conservation rules
      try {
        const directory = await api.get('/api/archival-directory');
        setRules(directory || []);
      } catch (e) {
        console.error("Failed to load archival directory", e);
      }

      // 4. Fetch organigramme
      try {
        const orgs = await api.get('/api/organigramme');
        setOrganigramme(orgs || []);
      } catch (e) {
        console.error("Failed to load organigramme", e);
      }

      // 5. Fetch users
      try {
        const usrList = await api.get('/api/users');
        setUsers(usrList || []);
      } catch (e) {
        console.error("Failed to load users", e);
      }

      // 6. Fetch barcode prefix settings
      try {
        const prefixRules = await api.get('/api/barcode-settings');
        setBarcodeSettings(prefixRules || []);
      } catch (e) {
        console.error("Failed to load barcode settings", e);
      }

      // 7. Fetch transfer requests
      try {
        const transReqs = await api.get('/api/transfer-requests');
        setTransferRequests(transReqs || []);
      } catch (e) {
        console.error("Failed to load transfer requests", e);
      }

      // 8. Fetch integration batches (7-step integration workflow)
      try {
        const batches = await api.get('/api/inventory-integration/batches');
        setIntegrationBatches(batches || []);
      } catch (e) {
        console.error("Failed to load integration batches", e);
      }

    } catch (err: any) {
      showToast("Certaines données n'ont pas pu être chargées", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmTransferValidation = async (observations: string) => {
    if (!validatingTransfer) return;
    try {
      const patchData = {
        status: 'Validée',
        observations,
        acceptedBy: 'Responsable des Archives',
        acceptedAt: new Date().toISOString()
      };

      const res = await api.patch(`/api/transfer-requests/${validatingTransfer.id}`, patchData);

      const updatedItem: TransferRequestItem = res.item || {
        ...validatingTransfer,
        ...patchData
      };

      setTransferRequests(prev => prev.map(r => r.id === validatingTransfer.id ? { ...r, ...updatedItem } : r));
      setValidatingTransfer(null);
      setViewingTransferAcceptance(updatedItem);
      showToast("Demande de transfert acceptée et fiche d'acceptation générée !", "success");
    } catch (err) {
      console.error("Error validating transfer request:", err);
      showToast("Erreur lors de la validation du transfert", "error");
    }
  };

  const handleUpdateTransferStatus = async (reqId: string, newStatus: string) => {
    try {
      await api.patch(`/api/transfer-requests/${reqId}`, { status: newStatus });
      setTransferRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus } : r));
      showToast(`Statut mis à jour: ${newStatus}`, "info");
    } catch (err) {
      showToast("Erreur lors de la mise à jour", "error");
    }
  };

  const handleGlobalSearch = async () => {
    setGlobalSearchLoading(true);
    try {
      const qParams = new URLSearchParams({
        search: globalSearchQuery,
        direction: globalSelectedDirection || 'all',
        showEliminated: showEliminatedArchives ? 'true' : 'false'
      });
      const results = await api.get(`/api/mass-inventory?${qParams.toString()}`);
      setGlobalInventoryResults(results || []);
    } catch (err: any) {
      showToast("Erreur de recherche globale: " + err.message, "error");
    } finally {
      setGlobalSearchLoading(false);
    }
  };

  const handleLoadStats = async () => {
    setStatsLoading(true);
    try {
      const stats = await api.get('/api/responsable/stats-directions');
      setStatsDirectionsData(stats);
    } catch (err: any) {
      showToast("Erreur lors du calcul des statistiques: " + err.message, "error");
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'search') {
      handleGlobalSearch();
    } else if (activeTab === 'analytics') {
      handleLoadStats();
    }
  }, [activeTab, showEliminatedArchives]);

  useEffect(() => {
    loadAllData();
  }, []);

  // ----------------------------------------------------
  // --- USER CONTROLS ACTIONS ---
  // ----------------------------------------------------
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.displayName) {
      showToast("Veuillez remplir tous les champs utilisateur.", "error");
      return;
    }
    try {
      await api.post('/api/users', newUser);
      showToast(`Utilisateur ${newUser.displayName} enregistré avec succès !`);
      setNewUser({ email: '', displayName: '', role: 'Agent' });
      // reload
      const usrList = await api.get('/api/users');
      setUsers(usrList || []);
    } catch (err: any) {
      showToast(err.message || "Erreur de création", "error");
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (!window.confirm(`Supprimer l'accès pour ${email} ?`)) return;
    try {
      await api.delete(`/api/users/${encodeURIComponent(email)}`);
      showToast("Utilisateur supprimé de la base.");
      const usrList = await api.get('/api/users');
      setUsers(usrList || []);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // ----------------------------------------------------
  // --- ORGANIGRAMME ACTIONS ---
  // ----------------------------------------------------
  const handleAddOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrg.name || !newOrg.code) {
      showToast("Veuillez saisir le nom de la direction et le code.", "error");
      return;
    }
    try {
      await api.post('/api/organigramme', newOrg);
      showToast(`Direction ${newOrg.name} ajoutée à l'organigramme !`);
      setNewOrg({ name: '', code: '', description: '' });
      const orgs = await api.get('/api/organigramme');
      setOrganigramme(orgs || []);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;
    try {
      await api.patch(`/api/organigramme/${editingOrg.id}`, editingOrg);
      showToast("Organigramme mis à jour !");
      setEditingOrg(null);
      const orgs = await api.get('/api/organigramme');
      setOrganigramme(orgs || []);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleDeleteOrg = async (id: string) => {
    if (!window.confirm("Supprimer cette direction ?")) return;
    try {
      await api.delete(`/api/organigramme/${id}`);
      showToast("Direction supprimée.");
      const orgs = await api.get('/api/organigramme');
      setOrganigramme(orgs || []);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // ----------------------------------------------------
  // --- BARCODE PREFIX ACTIONS ---
  // ----------------------------------------------------
  const handleSaveBarcodePrefix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBarcodeRule.direction || !newBarcodeRule.prefix) {
      showToast("Veuillez renseigner la direction et le préfixe.", "error");
      return;
    }
    try {
      await api.post('/api/barcode-settings', newBarcodeRule);
      showToast(`Préfixe "${newBarcodeRule.prefix}" lié à ${newBarcodeRule.direction} !`);
      setNewBarcodeRule({ direction: '', prefix: '' });
      const prefixRules = await api.get('/api/barcode-settings');
      setBarcodeSettings(prefixRules || []);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleDeleteBarcodePrefix = async (direction: string) => {
    try {
      await api.post('/api/barcode-settings/delete', { direction });
      showToast("Préfixe supprimé !");
      const prefixRules = await api.get('/api/barcode-settings');
      setBarcodeSettings(prefixRules || []);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // ----------------------------------------------------
  // --- CONSERVATION RULES ACTIONS ---
  // ----------------------------------------------------
  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.reference || !newRule.title || !newRule.direction) {
      showToast("Champs requis manquants.", "error");
      return;
    }
    try {
      await api.post('/api/archival-rules', newRule);
      showToast(`Règle "${newRule.reference}" créée avec succès !`);
      setShowRuleModal(false);
      setNewRule({
        reference: '',
        title: '',
        direction: '',
        docType: '',
        activeYears: 5,
        semiActiveYears: 10,
        finalDisposition: 'EL',
        support: 'Papier',
        retentionTrigger: 'Date de clôture',
        isCritical: 0,
        category: ''
      });
      const directory = await api.get('/api/archival-directory');
      setRules(directory || []);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // Delete conservation rule
  const handleDeleteRule = async (id: string) => {
    if (!window.confirm("Supprimer cette règle de conservation définitivement ?")) return;
    try {
      await api.delete(`/api/archival-rules/${id}`);
      showToast("Règle de conservation supprimée.");
      const directory = await api.get('/api/archival-directory');
      setRules(directory || []);
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // ----------------------------------------------------
  // --- AUDIT VALIDATIONS & BULK ACTIONS ---
  // ----------------------------------------------------
  const handleBulkFinalizeInventories = async () => {
    if (selectedInventories.length === 0) {
      showToast("Aucun inventaire sélectionné.", "info");
      return;
    }
    try {
      const itemsToFinalize = pendingInventories.filter(i => selectedInventories.includes(i.reference));
      await api.post('/api/audit/finalize-inventory', { references: selectedInventories });
      showToast(`L'audit final de validation a été scellé pour ${selectedInventories.length} dossier(s) ! Bordereau final généré.`, "success");
      setViewingFinalInventoryBatch(itemsToFinalize.length > 0 ? itemsToFinalize : selectedInventories.map(ref => ({ reference: ref, intitule: 'Dossier Inventorié', direction: 'Service Versant' })));
      setSelectedInventories([]);
      loadAllData();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const handleBulkFinalizeEliminations = async () => {
    if (selectedEliminations.length === 0) {
      showToast("Aucune élimination sélectionnée.", "info");
      return;
    }
    try {
      const elimsToFinalize = eliminationRequests.filter(er => selectedEliminations.includes(er.id));
      await api.post('/api/elimination/validate-pv', { requestIds: selectedEliminations });
      showToast(`Élimination finale validée pour ${selectedEliminations.length} PV(s) ! Procès-verbal final généré.`, "success");
      setViewingFinalEliminationBatch(elimsToFinalize.length > 0 ? elimsToFinalize : selectedEliminations.map(id => ({ id, pvNumber: `PV-${id}`, reference: 'REF-ELIM', intitule: 'Dossier à éliminer' })));
      setSelectedEliminations([]);
      loadAllData();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // ----------------------------------------------------
  // --- INTEGRATION BATCH VALIDATION (WORKFLOW 7 ÉTAPES) ---
  // ----------------------------------------------------
  const handleValidateIntegrationBatch = async (batchId: string) => {
    try {
      const res = await api.post(`/api/inventory-integration/batches/${batchId}/validate`, {});
      showToast(res.message || "Lot validé avec succès et stockage scellé dans le centre d'archives !", "success");
      const target = integrationBatches.find(b => b.id === batchId);
      if (target) {
        setViewingBatchSlip({
          ...target,
          status: 'validé',
          validatedAt: new Date().toISOString(),
          validatedBy: 'Responsable Audit'
        });
      }
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Erreur lors de la validation du lot", "error");
    }
  };

  const handleRejectIntegrationBatch = async (batchId: string) => {
    const reason = window.prompt("Motif du rejet du lot d'inventaire :", "Dossiers non conformes aux règles de versement");
    if (!reason) return;
    try {
      await api.post(`/api/inventory-integration/batches/${batchId}/reject`, { reason });
      showToast("Lot d'inventaire rejeté.", "info");
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Erreur lors du rejet du lot", "error");
    }
  };

  // Helper function to format any date input strictly into DD/MM/YYYY format (e.g., 11/02/2026)
  const formatDateToDDMMYYYY = (val: any): string => {
    if (!val) return '-';
    
    if (typeof val === 'string') {
      const clean = val.trim();
      if (!clean || clean === '-' || clean === 'null' || clean === 'undefined') return '-';
      
      // Check if it's already in DD/MM/YYYY or DD-MM-YYYY format
      const ddmmyyyy = clean.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
      if (ddmmyyyy) {
        return `${ddmmyyyy[1].padStart(2, '0')}/${ddmmyyyy[2].padStart(2, '0')}/${ddmmyyyy[3]}`;
      }

      // Check if it's YYYY-MM-DD or YYYY/MM/DD format
      const yyyymmdd = clean.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
      if (yyyymmdd) {
        return `${yyyymmdd[3].padStart(2, '0')}/${yyyymmdd[2].padStart(2, '0')}/${yyyymmdd[1]}`;
      }

      // If it's a 4-digit year only
      if (/^\d{4}$/.test(clean)) {
        return `31/12/${clean}`;
      }
    }

    // Handle number (Excel serial date number)
    if (typeof val === 'number' && val > 1000 && val < 100000) {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      }
    }

    // Parse using Date constructor (handles ISO strings, full date strings like Tue Oct 16 2018...)
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      if (year >= 1900 && year <= 2100) {
        return `${day}/${month}/${year}`;
      }
    }

    // Fallback: extract 4-digit year if present
    const yearMatch = String(val).match(/\d{4}/);
    if (yearMatch) {
      return `31/12/${yearMatch[0]}`;
    }

    return String(val);
  };

  // Helper function to extract and format closure date strictly as DD/MM/YYYY
  const getClosureDateDisplay = (f: any) => {
    const rawDate = f.dateCloture || f.dateFin || f.year || f.dateDebut || '';
    return formatDateToDDMMYYYY(rawDate);
  };

  // Helper function to extract and format confirmed retention rules (Règle DUA Confirmée)
  const getConfirmedRuleDisplay = (f: any, batchRule?: any) => {
    const codeDua = f.codeDua || f.ruleId || batchRule?.reference || batchRule?.ruleId || (f.direction ? `DUA-${String(f.direction).slice(0, 4).toUpperCase()}` : 'DUA Standard');
    const titleDua = f.ruleTitle || batchRule?.title || (typeof batchRule === 'string' ? batchRule : 'Conservation légale');
    
    // Retention duration in years
    let duration = f.retentionYears || batchRule?.retentionYears;
    if (!duration && f.expiryDate && f.year) {
      const diff = parseInt(f.expiryDate) - parseInt(f.year);
      if (!isNaN(diff) && diff > 0) duration = diff;
    }
    if (!duration) duration = 5;

    // Calculate expiration / elimination date
    let expYear = f.expiryDate;
    if (!expYear && f.dateElimination) {
      expYear = String(f.dateElimination).match(/\d{4}/)?.[0];
    }
    if (!expYear) {
      const cYear = f.dateCloture ? String(f.dateCloture).match(/\d{4}/)?.[0] : (f.year || null);
      if (cYear && duration) {
        expYear = String(parseInt(cYear) + parseInt(duration));
      }
    }

    const sortFinal = f.finalDisposition || batchRule?.finalDisposition || f.sortFinal || 'EL';

    return {
      codeDua,
      titleDua,
      duration: `${duration} ans`,
      durationNum: duration,
      expiryYear: expYear ? `Échéance : ${expYear}` : 'Échéance calculée',
      expiryYearNum: expYear,
      expiryFullDate: f.dateElimination || (expYear ? `${expYear}-12-31` : null),
      disposition: sortFinal,
      isElimination: sortFinal === 'EL' || sortFinal === 'Élimination' || sortFinal === 'D' || sortFinal === 'Destruction'
    };
  };

  // ----------------------------------------------------
  // --- INVENTORY ITEM DIRECT EDIT (modifier les contenus) ---
  // ----------------------------------------------------
  const startEditItem = (item: any) => {
    setEditingItem({ ...item });
  };

  const handleSaveEditedItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await api.patch(`/api/mass-inventory/${editingItem.id}`, editingItem);
      showToast(`Contenu de l'inventaire ${editingItem.reference} modifié !`);
      setEditingItem(null);
      loadAllData();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // ----------------------------------------------------
  // --- COMPLETE BACKUP / RESTORE WORKFLOW ---
  // ----------------------------------------------------
  const handleBackupExport = async () => {
    try {
      const data = await api.get('/api/backup/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_integrale_mae_archives_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Base de données exportée avec succès !");
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("Êtes-vous sûr de vouloir IMPORTER et ÉCRASER toute la base de données actuelle ? Cette opération est irréversible !")) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        setLoading(true);
        const res = await api.post('/api/backup/restore', parsed);
        showToast(res.message || "Base de données importée et restaurée !");
        loadAllData();
      } catch (err: any) {
        showToast("Échec de l'importation. Format JSON invalide ou incompatible.", "error");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Header quick statistics
  const pendingAuditsCount = pendingInventories.filter(i => i.archivalStatus === 'pending' || !i.archivalStatus).length;
  const pendingEliminationsCount = eliminationRequests.length;

  // Filter pending items based on search/direction
  const filteredInventories = pendingInventories.filter(item => {
    const matchesSearch = 
      (item.reference || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.intitule || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.numBoite || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDirection = !selectedDirection || item.direction === selectedDirection;
    return matchesSearch && matchesDirection;
  });

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto pb-12" id="responsable-dashboard-container">
      
      {/* Toast Alert Notice */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 right-4 z-50 px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 backdrop-blur-md text-sm border font-medium ${
              toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
              toast.type === 'error' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' :
              'bg-blue-500/10 text-blue-600 border-blue-500/20'
            }`}
          >
            {toast.type === 'success' && <Check className="w-4 h-4 text-emerald-500 animate-bounce" />}
            {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Profile Title banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 lg:p-8 shadow-xl relative overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-700 via-slate-900 to-slate-950">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-blue-400 text-xs font-bold tracking-widest uppercase">
              <Shield className="w-4 h-4 text-blue-400 fill-blue-400/20" />
              <span>Console d'Audit de Sécurité Totale</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Session Responsable Audit</h1>
            <p className="text-slate-300 text-sm max-w-xl">
              Valider les inventaires et les éliminations, modifier les contenus, éditer l'organigramme et les préfixes ou importer l'intégralité de la base de données.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button 
              onClick={loadAllData} 
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold select-none transition-all cursor-pointer border border-white/5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualiser</span>
            </button>
            <div className="px-4 py-2 bg-blue-500/25 border border-blue-400/30 text-blue-200 rounded-xl text-xs font-semibold">
              Rôle : Contrôleur en Chef
            </div>
          </div>
        </div>

        {/* Matrix Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10">
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Audit Inventaires</p>
            <p className="text-xl md:text-2xl font-black text-white mt-1">{pendingAuditsCount} <span className="text-xs font-medium text-amber-400">à revoir</span></p>
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Éliminations Suspendues</p>
            <p className="text-xl md:text-2xl font-black text-rose-300 mt-1">{pendingEliminationsCount} <span className="text-xs font-medium text-rose-400">en attente</span></p>
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Directions Organisées</p>
            <p className="text-xl md:text-2xl font-black text-blue-300 mt-1">{organigramme.length}</p>
          </div>
          <div>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Règles Actives</p>
            <p className="text-xl md:text-2xl font-black text-emerald-300 mt-1">{rules.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Rail */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'audit' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          <span>Audit & Validations</span>
        </button>
        <button
          onClick={() => setActiveTab('transfers')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'transfers' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>Demandes de Transfert ({transferRequests.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'search' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Recherche Globale</span>
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'analytics' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Statistiques d'Archives</span>
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'rules' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Calendrier de Conservation</span>
        </button>
        <button
          onClick={() => setActiveTab('organigramme')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'organigramme' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Éditer l'Organigramme</span>
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'users' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Ajouter des Utilisateurs</span>
        </button>
        <button
          onClick={() => setActiveTab('barcodes')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'barcodes' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Barcode className="w-3.5 h-3.5" />
          <span>Barres Codes Boîtes</span>
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'backup' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Sauvegarde & Restauration Totale</span>
        </button>
      </div>

      {/* Main Container Layout */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm min-h-[450px]">
        
        {/* TAB 1: AUDIT & VALIDATIONS */}
        {activeTab === 'audit' && (
          <div className="space-y-8">

            {/* --- NOUVEAUX LOTS D'INTÉGRATION 7 ÉTAPES EN ATTENTE D'AUDIT & HISTORIQUE --- */}
            <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-xl border border-emerald-500/30 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
                    <Sparkles size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base font-black text-white">Lots d'Inventaires Intégrés (Workflow 7 Étapes)</h3>
                      <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {integrationBatches.filter(b => b.status === 'en_attente_audit').length} en attente
                      </span>
                      {integrationBatches.filter(b => b.status === 'validé').length > 0 && (
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          {integrationBatches.filter(b => b.status === 'validé').length} scellé(s)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Contrôle d'audit, inspection des dates extrêmes, règles de conservation et validation du stockage physique.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-start sm:self-auto">
                  <button
                    onClick={loadAllData}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border border-white/10"
                  >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualiser
                  </button>
                </div>
              </div>

              {/* BARRE DE RECHERCHE ET FILTRES DANS LES LOTS D'INVENTAIRES */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3.5 bg-black/30 rounded-2xl border border-white/10">
                {/* Search input */}
                <div className="md:col-span-6 relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
                  <input
                    type="text"
                    placeholder="Rechercher lot (ex: LOT-2026, Sinistre, nom archiviste, note...)"
                    value={integrationBatchSearch}
                    onChange={e => setIntegrationBatchSearch(e.target.value)}
                    className="w-full pl-10 pr-9 py-2.5 bg-white/10 text-white placeholder:text-slate-400 rounded-xl text-xs font-medium border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  />
                  {integrationBatchSearch && (
                    <button
                      onClick={() => setIntegrationBatchSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-white/10"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Direction Filter */}
                <div className="md:col-span-3">
                  <select
                    value={integrationBatchDirectionFilter}
                    onChange={e => setIntegrationBatchDirectionFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/10 text-white rounded-xl text-xs font-bold border border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="" className="bg-slate-900 text-white">Toutes les directions</option>
                    {Array.from(new Set(integrationBatches.map(b => b.direction).filter(Boolean))).map((dir: string) => (
                      <option key={dir} value={dir} className="bg-slate-900 text-white">{dir}</option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="md:col-span-3 flex items-center gap-1.5 overflow-x-auto">
                  <button
                    onClick={() => setIntegrationBatchStatusFilter('all')}
                    className={`flex-1 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all text-center whitespace-nowrap ${
                      integrationBatchStatusFilter === 'all'
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-900 font-black'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    Tous ({integrationBatches.length})
                  </button>
                  <button
                    onClick={() => setIntegrationBatchStatusFilter('en_attente_audit')}
                    className={`flex-1 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all text-center whitespace-nowrap ${
                      integrationBatchStatusFilter === 'en_attente_audit'
                        ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-950'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    En attente ({integrationBatches.filter(b => b.status === 'en_attente_audit').length})
                  </button>
                  <button
                    onClick={() => setIntegrationBatchStatusFilter('valide')}
                    className={`flex-1 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all text-center whitespace-nowrap ${
                      integrationBatchStatusFilter === 'valide'
                        ? 'bg-blue-600 text-white font-black shadow-md'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    Scellés ({integrationBatches.filter(b => b.status === 'validé').length})
                  </button>
                </div>
              </div>

              {/* RÉSULTAT DES LOTS FILTRÉS */}
              {(() => {
                const filtered = integrationBatches.filter(batch => {
                  if (integrationBatchStatusFilter !== 'all') {
                    if (integrationBatchStatusFilter === 'valide' && batch.status !== 'validé') return false;
                    if (integrationBatchStatusFilter === 'en_attente_audit' && batch.status !== 'en_attente_audit') return false;
                    if (integrationBatchStatusFilter === 'rejete' && batch.status !== 'rejeté') return false;
                  }
                  if (integrationBatchDirectionFilter && batch.direction !== integrationBatchDirectionFilter) {
                    return false;
                  }
                  if (integrationBatchSearch.trim()) {
                    const q = integrationBatchSearch.toLowerCase().trim();
                    const bNum = String(batch.batchNumber || '').toLowerCase();
                    const dir = String(batch.direction || '').toLowerCase();
                    const by = String(batch.importedBy || '').toLowerCase();
                    const notes = String(batch.notes || '').toLowerCase();
                    const ruleRef = String(batch.ruleApplied?.reference || batch.ruleApplied?.title || '').toLowerCase();
                    const match = bNum.includes(q) || dir.includes(q) || by.includes(q) || notes.includes(q) || ruleRef.includes(q);
                    if (!match) return false;
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-6 bg-white/5 rounded-2xl border border-white/5 text-center text-xs text-slate-400 font-medium">
                      {integrationBatches.length === 0 ? (
                        "Aucun lot d'inventaire enregistré pour le moment."
                      ) : (
                        `Aucun lot ne correspond à vos critères de recherche "${integrationBatchSearch || integrationBatchStatusFilter || integrationBatchDirectionFilter}".`
                      )}
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 gap-4">
                    {filtered.map(batch => {
                      const isPending = batch.status === 'en_attente_audit';
                      const isValidated = batch.status === 'validé';

                      return (
                        <div
                          key={batch.id}
                          className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all hover:bg-white/[0.13]"
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {batch.inventoryRef && (
                                <span className="font-mono font-black text-emerald-200 bg-emerald-900/80 px-2.5 py-0.5 rounded-lg border border-emerald-400/40 text-xs shadow-xs">
                                  Réf : {batch.inventoryRef}
                                </span>
                              )}
                              <span className="font-mono font-black text-white text-sm bg-white/10 px-2.5 py-0.5 rounded-lg border border-white/10">
                                {batch.batchNumber}
                              </span>
                              {batch.inventoryName && (
                                <span className="font-bold text-slate-200 text-xs bg-white/10 px-2.5 py-0.5 rounded-lg border border-white/10">
                                  {batch.inventoryName}
                                </span>
                              )}
                              <span className="text-xs font-bold text-emerald-300 bg-emerald-900/60 px-2.5 py-0.5 rounded-lg border border-emerald-500/30">
                                {batch.direction}
                              </span>
                              {isPending && (
                                <span className="text-[10px] font-black uppercase text-amber-300 bg-amber-950/70 px-2.5 py-0.5 rounded-md border border-amber-500/40 animate-pulse">
                                  ⏳ En attente validation Responsable Audit
                                </span>
                              )}
                              {isValidated && (
                                <span className="text-[10px] font-black uppercase text-blue-300 bg-blue-950/70 px-2.5 py-0.5 rounded-md border border-blue-500/40 flex items-center gap-1">
                                  <CheckCircle size={11} /> Validé & Scellé en centre d'archives
                                </span>
                              )}
                              {batch.status === 'rejeté' && (
                                <span className="text-[10px] font-black uppercase text-rose-300 bg-rose-950/70 px-2.5 py-0.5 rounded-md border border-rose-500/40">
                                  ❌ Rejeté
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-medium">
                              <span className="flex items-center gap-1.5">
                                <Archive size={13} className="text-emerald-400" />
                                <strong>{batch.boxesCount || batch.boxesData?.length || 0}</strong> boîte(s) conditionnée(s)
                              </span>
                              <span className="flex items-center gap-1.5">
                                <FileText size={13} className="text-emerald-400" />
                                <strong>{batch.foldersCount || batch.foldersData?.length || 0}</strong> dossier(s)
                              </span>
                              {batch.ruleApplied && (
                                <span className="flex items-center gap-1.5 text-emerald-200">
                                  <Shield size={13} className="text-emerald-400" />
                                  DUA : <strong>{batch.ruleApplied?.reference || batch.ruleApplied?.title || 'DUA confirmée'}</strong>
                                </span>
                              )}
                              <span>👤 Importé par : <strong className="text-white">{batch.importedBy || 'Archiviste'}</strong></span>
                              <span>📅 Date : <strong>{new Date(batch.importedAt).toLocaleDateString('fr-FR')}</strong></span>
                            </div>

                            {batch.notes && (
                              <div className="text-[11px] text-slate-300 italic bg-black/20 px-3 py-1.5 rounded-xl border border-white/5">
                                Note : {batch.notes}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                            <button
                              onClick={() => {
                                setInspectFolderSearch('');
                                setInspectFolderSortFinal('all');
                                setInspectFolderSelectedBox('all');
                                setInspectingBatch(batch);
                              }}
                              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all border border-white/10 shadow-sm"
                            >
                              <Eye size={14} className="text-emerald-400" /> Inspecter le Lot & Dates
                            </button>
                            
                            {isPending && (
                              <>
                                <button
                                  onClick={() => handleRejectIntegrationBatch(batch.id)}
                                  className="px-3.5 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all border border-rose-500/30"
                                >
                                  <X size={14} /> Rejeter
                                </button>
                                <button
                                  onClick={() => handleValidateIntegrationBatch(batch.id)}
                                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-emerald-950"
                                >
                                  <CheckSquare size={14} /> Valider & Confirmer le Stockage
                                </button>
                              </>
                            )}

                            {isValidated && (
                              <button
                                onClick={() => setViewingBatchSlip(batch)}
                                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
                                title="Consulter et imprimer le Procès-Verbal officiel de transfert"
                              >
                                <FileText size={14} /> Voir le PV de Transfert
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* --- VALIDATION DES INVENTAIRES UNITAIRES ET MASS INVENTORY EXISTANTS --- */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Contrôle Unitaire & Inventaire Général</h3>
                <p className="text-slate-500 text-xs">Passez en revue les inventaires individuels ou modifiez directement les contenus.</p>
              </div>

              {/* Barcode filter controls */}
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Rechercher par référence, titre..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs w-[200px] focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
                
                <select
                  value={selectedDirection}
                  onChange={e => setSelectedDirection(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">Tous les services</option>
                  {organigramme.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* List Table of pending items */}
            {filteredInventories.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50">
                <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-600 text-sm font-semibold">Aucun versement d'inventaires à valider.</p>
                <p className="text-slate-400 text-xs">Veuillez vérifier les filtres ou actualiser.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-100 rounded-xl">
                  <span className="text-xs text-slate-600 font-bold">
                    {selectedInventories.length} item(s) coché(s) pour validation finale.
                  </span>
                  
                  <button
                    onClick={handleBulkFinalizeInventories}
                    disabled={selectedInventories.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold disabled:opacity-50 select-none cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Appliquer la Validation Finale (Audit Réussi)</span>
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="p-3 w-10">
                          <input 
                            type="checkbox"
                            checked={selectedInventories.length === filteredInventories.length && filteredInventories.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedInventories(filteredInventories.map(i => i.reference));
                              } else {
                                setSelectedInventories([]);
                              }
                            }}
                            className="rounded"
                          />
                        </th>
                        <th className="p-3">Référence carton</th>
                        <th className="p-3">Intitulé / Contenu</th>
                        <th className="p-3">Direction</th>
                        <th className="p-3">Boîte de dépôt</th>
                        <th className="p-3 text-center">Dates extrêmes</th>
                        <th className="p-3">Statut Archival</th>
                        <th className="p-3 text-right">Outils d'Édition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventories.map(item => {
                        const isChecked = selectedInventories.includes(item.reference);
                        return (
                          <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="p-3">
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSelectedInventories(selectedInventories.filter(ref => ref !== item.reference));
                                  } else {
                                    setSelectedInventories([...selectedInventories, item.reference]);
                                  }
                                }}
                                className="rounded"
                              />
                            </td>
                            <td className="p-3 font-semibold text-slate-900">{item.reference}</td>
                            <td className="p-3">
                              <div className="space-y-0.5">
                                <p className="font-medium text-slate-800">{item.intitule || 'Sans titre'}</p>
                                <p className="text-[10px] text-slate-400">Carton : {item.numBoite || 'Non assigné'}</p>
                              </div>
                            </td>
                            <td className="p-3 text-slate-600">{item.direction}</td>
                            <td className="p-3 font-mono text-xs">{item.localisation || 'Étagère Non Définie'}</td>
                            <td className="p-3 text-center text-slate-500 font-mono">
                              {item.dateDebut || '?'} - {item.dateFin || '?'}
                            </td>
                            <td className="p-3">
                              {item.isCommunicated || item.communicationStatus === 'Communiqué' ? (
                                <div className="flex flex-col gap-1">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500 text-white shadow-sm border border-amber-600 animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                    Communiqué
                                  </span>
                                  {item.communicationBorrower && (
                                    <span className="text-[9px] font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 truncate max-w-[150px]" title={`Emprunté par ${item.communicationBorrower}`}>
                                      👤 {item.communicationBorrower}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  item.archivalStatus === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {item.archivalStatus || 'En attente d\'Audit'}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => startEditItem(item)}
                                className="inline-flex items-center gap-1.5 px-2 py-1 text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-md font-semibold text-[11px] cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Modifier</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-section: Pending Elimination requests */}
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Validation Finale des Éliminations (PV suspects)</h3>
              <p className="text-slate-500 text-xs mb-4">Ces demandes d'élimination de documents en fin de cycle requièrent l'œil de l'auditeur en chef.</p>
              
              {eliminationRequests.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50">
                  <Check className="w-6 h-6 text-emerald-500 mx-auto mb-1 animate-pulse" />
                  <p className="text-slate-500 text-xs font-semibold">Toutes les éliminations ont déjà été auditées et purgées.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-slate-100 rounded-xl">
                    <span className="text-xs text-slate-600 font-bold">
                      {selectedEliminations.length} demande(s) cochée(s) pour élimination définitive.
                    </span>
                    
                    <button
                      onClick={handleBulkFinalizeEliminations}
                      disabled={selectedEliminations.length === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 select-none cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirmer l'Élimination Électronique Finale</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                          <th className="p-3 w-10">
                            <input 
                              type="checkbox"
                              checked={selectedEliminations.length === eliminationRequests.length && eliminationRequests.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEliminations(eliminationRequests.map(r => r.id));
                                } else {
                                  setSelectedEliminations([]);
                                }
                              }}
                              className="rounded"
                            />
                          </th>
                          <th className="p-3">N° PV</th>
                          <th className="p-3">Référence dossier</th>
                          <th className="p-3">Intitulé</th>
                          <th className="p-3">Service Demandeur</th>
                          <th className="p-3">Disposition finale prévue</th>
                          <th className="p-3">Demandé par</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eliminationRequests.map(er => {
                          const isChecked = selectedEliminations.includes(er.id);
                          return (
                            <tr key={er.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="p-3">
                                <input 
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setSelectedEliminations(selectedEliminations.filter(id => id !== er.id));
                                    } else {
                                      setSelectedEliminations([...selectedEliminations, er.id]);
                                    }
                                  }}
                                  className="rounded"
                                />
                              </td>
                              <td className="p-3 font-mono text-[11px] text-slate-700 font-bold">{er.pvNumber || 'PV-DEMANDE-A1'}</td>
                              <td className="p-3 font-semibold text-slate-900">{er.reference}</td>
                              <td className="p-3 text-slate-800 font-medium">{er.intitule}</td>
                              <td className="p-3 text-slate-600">{er.direction}</td>
                              <td className="p-3">
                                <span className="text-xs bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded font-black">
                                  {er.finalDisposition || 'ELIMINATE'}
                                </span>
                              </td>
                              <td className="p-3 text-slate-500">{er.submittedBy || 'Archiviste'}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase tracking-wider animate-pulse">
                                  {er.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB: DEMANDES DE TRANSFERT */}
        {activeTab === 'transfers' && (
          <div className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm" id="responsable-transfers-tab">
            <div className="pb-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-brand-accent text-xs font-bold uppercase tracking-wider mb-1">
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Gestion des Bordereaux & Fiches d'Acceptation</span>
                </div>
                <h3 className="text-xl font-black text-slate-800">Suivi des Demandes de Transfert d'Archives</h3>
                <p className="text-slate-500 text-xs">Examinez les bordereaux d'envoi préliminaires soumis par les demandeurs, puis validez avec vos observations pour émettre la fiche d'acceptation officielle.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded-lg text-xs">
                  {transferRequests.filter(r => r.status === 'En attente').length} En attente
                </span>
                <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-lg text-xs">
                  {transferRequests.filter(r => r.status === 'Validée' || r.status === 'Acceptée').length} Validées
                </span>
              </div>
            </div>

            {transferRequests.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <ArrowRightLeft className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-semibold">Aucune demande de transfert enregistrée.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold">
                      <th className="p-3">N° Demande</th>
                      <th className="p-3">Direction / Service</th>
                      <th className="p-3">Type de documents</th>
                      <th className="p-3">Demandeur</th>
                      <th className="p-3">Volume</th>
                      <th className="p-3">Statut</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Documents & Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transferRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-800">
                          {req.demandNumber || req.id.slice(0, 8)}
                        </td>
                        <td className="p-3 font-semibold text-slate-700">
                          {req.direction || 'Direction non spécifiée'}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          {req.documentType || '-'}
                        </td>
                        <td className="p-3 text-slate-600">
                          {req.requester || req.nom || '-'}
                          {req.email && <div className="text-[10px] text-slate-400">{req.email}</div>}
                        </td>
                        <td className="p-3 text-slate-700 font-bold">
                          {req.boxes || 0} boîtes / {req.folders || 0} dossiers
                        </td>
                        <td className="p-3">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            req.status === 'Validée' || req.status === 'Acceptée' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            req.status === 'En attente' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 text-[11px]">
                          {req.createdAt ? new Date(req.createdAt).toLocaleDateString('fr-FR') : '-'}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setViewingTransferPreliminaire(req)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer"
                              title="Voir le Bordereau d'envoi préliminaire"
                            >
                              <FileText size={14} className="text-brand-accent" />
                              <span>Bordereau</span>
                            </button>

                            {(req.status === 'Validée' || req.status === 'Acceptée') && (
                              <button
                                onClick={() => setViewingTransferAcceptance(req)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                                title="Voir la Fiche d'Acceptation"
                              >
                                <ShieldCheck size={14} />
                                <span>Fiche Acceptation</span>
                              </button>
                            )}

                            {req.status === 'En attente' && (
                              <>
                                <button
                                  onClick={() => setValidatingTransfer(req)}
                                  className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-all cursor-pointer"
                                  title="Valider et saisir les observations"
                                >
                                  <CheckCircle size={16} />
                                </button>
                                <button
                                  onClick={() => handleUpdateTransferStatus(req.id, 'Rejetée')}
                                  className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg transition-all cursor-pointer"
                                  title="Rejeter"
                                >
                                  <XCircle size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: RECHERCHE GLOBALE D'ARCHIVES */}
        {activeTab === 'search' && (
          <div className="space-y-6" id="responsable-global-search-tab">
            <div className="pb-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Recherche Avancée d'Archives Stockées (Multi-Inventaires)</h3>
                <p className="text-slate-500 text-xs">Recherchez instantanément par directions, par références ou par intitulés parmi tous les dossiers d'archives (de masse et centralisés).</p>
              </div>
              <button
                onClick={handleGlobalSearch}
                disabled={globalSearchLoading}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 select-none cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${globalSearchLoading ? 'animate-spin' : ''}`} />
                <span>Recharger les résultats</span>
              </button>
            </div>

            {/* Moteur de recherche & filtres */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
                  <Search className="w-3 h-3 text-slate-500" />
                  <span>Saisir un terme / mot-clé</span>
                </label>
                <input
                  type="text"
                  placeholder="Référence, titre, adhérent, police, n° boîte..."
                  value={globalSearchQuery}
                  onChange={e => setGlobalSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleGlobalSearch(); }}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 focus:outline-none bg-white text-slate-800"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Filtrer par direction</label>
                <select
                  value={globalSelectedDirection}
                  onChange={e => setGlobalSelectedDirection(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 focus:outline-none bg-white font-medium text-slate-700"
                >
                  <option value="">Toutes les directions</option>
                  {organigramme.map(dir => (
                    <option key={dir.id} value={dir.name}>{dir.name}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3 flex items-center h-10">
                <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-700 select-none">
                  <input
                    type="checkbox"
                    checked={showEliminatedArchives}
                    onChange={e => setShowEliminatedArchives(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span>Visualiser les archives éliminées</span>
                </label>
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleGlobalSearch}
                  disabled={globalSearchLoading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 select-none cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Rechercher</span>
                </button>
              </div>
            </div>

            {/* Résultats de recherche */}
            {globalSearchLoading ? (
              <div className="text-center py-20">
                <RefreshCw className="w-10 h-10 text-slate-400 animate-spin mx-auto mb-4" />
                <p className="text-slate-500 text-sm">Extraction sécurisée des archives dans la base de données...</p>
              </div>
            ) : globalInventoryResults.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 text-sm font-semibold">Aucun enregistrement d'archive ne correspond à vos filtres.</p>
                <p className="text-slate-400 text-xs mt-1">Essayez d'élargir vos critères ou de recharger la recherche.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <span>{globalInventoryResults.length} archive(s) localisée(s) au total</span>
                  <span className="font-mono text-[10px]">SQLite Database</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="p-3">Source / Type</th>
                        <th className="p-3">Référence</th>
                        <th className="p-3">Intitulé / Contenu</th>
                        <th className="p-3 text-center">Scan PDF</th>
                        <th className="p-3">Direction</th>
                        <th className="p-3">Carton / Boîte</th>
                        <th className="p-3">Localisation</th>
                        <th className="p-3">Statut Conservation</th>
                        <th className="p-3 text-right">Date d'archivage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {globalInventoryResults.map((item, idx) => {
                        const isCentral = item.sourceType === 'centralized';
                        return (
                          <tr key={item.id || idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="p-3">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                                isCentral ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {isCentral ? 'Dossier Unitaire' : 'Versement en Masse'}
                              </span>
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-900">{item.reference}</td>
                            <td className="p-3">
                              <div className="space-y-0.5">
                                <p className="font-medium text-slate-800">{item.intitule || 'Sans intitulé principal'}</p>
                                {item.dossier && item.dossier !== item.reference && (
                                  <p className="text-[10px] text-slate-400">Dossier rattaché: {item.dossier}</p>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              {item.scanFile ? (
                                <button 
                                  onClick={() => {
                                    setPdfViewerFile(item.scanFile);
                                    setPdfViewerTitle(item.intitule || item.reference || "Scan Dossier");
                                  }}
                                  className="mx-auto flex items-center justify-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 rounded-lg px-2 py-1 text-[10px] font-extrabold tracking-tight uppercase cursor-pointer"
                                  title="Voir le Scan PDF de ce dossier"
                                >
                                  <FileText size={12} className="text-emerald-600 animate-pulse" />
                                  <span>Voir Scan</span>
                                </button>
                              ) : (
                                <span className="text-slate-400/70 text-[10px] italic">Aucun scan</span>
                              )}
                            </td>
                            <td className="p-3 text-slate-600 font-medium">{item.direction || '—'}</td>
                            <td className="p-3 font-mono font-semibold text-slate-700">{item.numBoite || item.boxNumber || '—'}</td>
                            <td className="p-3 text-slate-500 text-[11px]">{item.localisation || '—'}</td>
                            <td className="p-3">
                              {item.isEliminated === 1 || item.archivalStatus === 'Eliminated' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200 shadow-sm uppercase tracking-wider">
                                  Éliminé
                                </span>
                              ) : (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  item.archivalStatus === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                  item.archivalStatus === 'SemiActive' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                  item.archivalStatus === 'Expired' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                  'bg-slate-50 text-slate-700 border-slate-100'
                                }`}>
                                  {item.archivalStatus || (item.status === 'verified' ? 'Vérifié' : 'Archivé (Standard)')}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right text-slate-400 font-mono text-[11px]">
                              {item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-FR') : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: STATISTIQUES DECIMALES & VOLUMETRIE PAR DIRECTION */}
        {activeTab === 'analytics' && (
          <div className="space-y-6" id="responsable-stats-tab">
            <div className="pb-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Analyses Volumétriques par Direction</h3>
                <p className="text-slate-500 text-xs">Visualisez et suivez le nombre précis de dossiers, versements et de boîtes physiques d'archivage alloués à chaque direction.</p>
              </div>
              <button
                onClick={handleLoadStats}
                disabled={statsLoading}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 select-none cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
                <span>Actualiser les statistiques</span>
              </button>
            </div>

            {statsLoading || !statsDirectionsData ? (
              <div className="text-center py-20">
                <RefreshCw className="w-10 h-10 text-slate-400 animate-spin mx-auto mb-4" />
                <p className="text-slate-500 text-sm">Calcul de la volumétrie en cours...</p>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Cartes KPI Global */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-md relative overflow-hidden">
                    <div className="absolute right-3 top-3 w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
                      <Database className="w-6 h-6 text-blue-400" />
                    </div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Enregistrements</p>
                    <p className="text-3xl font-extrabold text-blue-300 mt-2">{statsDirectionsData.totals.grandTotalRecords}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Dossiers physiques cumulés dans l'app</p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-3 top-3 w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                      <Barcode className="w-6 h-6 text-emerald-600" />
                    </div>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider text-slate-400">Boîtes de stockage physiques</p>
                    <p className="text-3xl font-extrabold text-emerald-600 mt-2">{statsDirectionsData.totals.totalBoxes}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Cartons d'archives physiques distincts</p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-3 top-3 w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                      <FileText className="w-6 h-6 text-amber-600" />
                    </div>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider text-slate-400">Versements en Masse</p>
                    <p className="text-3xl font-extrabold text-amber-600 mt-2">{statsDirectionsData.totals.totalMass}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Total de versement par lots</p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute right-3 top-3 w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
                      <CheckSquare className="w-6 h-6 text-purple-600" />
                    </div>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider text-slate-400">Dossiers Unitaires</p>
                    <p className="text-3xl font-extrabold text-purple-600 mt-2">{statsDirectionsData.totals.totalCentral}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Enregistrements unitaires centralisés</p>
                  </div>
                </div>

                {/* Tableau principal par Direction */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-slate-500" />
                    <span>Répartition de l'Occupation et Volumétrie des Archives par Direction</span>
                  </h4>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                          <th className="p-4 w-1/3">Direction / Service Rattaché</th>
                          <th className="p-4 text-center">Versements (En Masse)</th>
                          <th className="p-4 text-center">Dossiers Unitaires (Centralisés)</th>
                          <th className="p-4 text-center">Boîtes de stockage (Cartons uniques)</th>
                          <th className="p-4 text-center">Total Enregistrements</th>
                          <th className="p-4 w-1/4">Proportion du Capital Archivé</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statsDirectionsData.directionStats.map((stat: any, idx: number) => {
                          const totalAll = statsDirectionsData.totals.grandTotalRecords || 1;
                          const percentage = Math.round((stat.totalFolders / totalAll) * 100);
                          
                          return (
                            <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                              <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded bg-blue-600"></div>
                                <span>{stat.direction}</span>
                              </td>
                              <td className="p-4 text-center font-semibold text-slate-600 bg-slate-50/20">{stat.massCount}</td>
                              <td className="p-4 text-center font-semibold text-slate-600">{stat.centralCount}</td>
                              <td className="p-4 text-center">
                                <span className="px-2.5 py-1 text-xs font-bold font-mono bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100">
                                  {stat.boxesCount}
                                </span>
                              </td>
                              <td className="p-4 text-center font-black text-slate-900 bg-slate-50/40 text-[13px]">{stat.totalFolders}</td>
                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-blue-600 rounded-full transition-all" 
                                      style={{ width: `${Math.max(percentage, 1)}%` }}
                                    ></div>
                                  </div>
                                  <span className="font-mono text-[11px] font-bold text-slate-500 w-8 text-right">{percentage}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section descriptive de responsabilité */}
                <div className="p-5 border border-blue-100 bg-blue-50/30 rounded-2xl flex gap-3 text-xs text-blue-800">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                  <div className="space-y-1">
                    <p className="font-bold">Interprétation de la Volumétrie des Archives :</p>
                    <p className="leading-relaxed">
                      Ces statistiques décisionnelles permettent au Responsable de piloter l'espace de stockage physique total au sein des rayonnages. Les directions ayant le plus fort pourcentage d'allocation peuvent être planifiées pour des campagnes d'épuration anticipées selon le calendrier légal de conservation.
                    </p>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* TAB 2: CALENDRIER DE CONSERVATION */}
        {activeTab === 'rules' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Calendrier & Règles de Conservation (Archivage Légal)</h3>
                <p className="text-slate-500 text-xs">Mettre à jour les années d'âge actif, semi-actif et les règles de destruction obligatoires.</p>
              </div>

              <button
                onClick={() => setShowRuleModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-950 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all select-none cursor-pointer"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>Ajouter une Nouvelle Règle</span>
              </button>
            </div>

            {/* List of active rules block */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-extrabold">
                    <th className="p-3">Trigramme Réf.</th>
                    <th className="p-3">Titre de la Règle / Catégorie</th>
                    <th className="p-3">Service liant</th>
                    <th className="p-3 text-center">Séjour Actif (Années)</th>
                    <th className="p-3 text-center">Séjour Semi-Actif (Années)</th>
                    <th className="p-3">Sort final</th>
                    <th className="p-3">Support requis</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-[11px] text-slate-800">{rule.reference}</td>
                      <td className="p-3">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900">{rule.title}</p>
                          {rule.docType && <p className="text-[10px] text-slate-400 font-medium">Type : {rule.docType}</p>}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">{rule.direction}</td>
                      <td className="p-3 text-center font-semibold text-slate-800">{rule.activeYears} ans</td>
                      <td className="p-3 text-center font-semibold text-slate-800">{rule.semiActiveYears} ans</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                          rule.finalDisposition === 'CP' ? 'bg-emerald-50 text-emerald-800 border-emerald-150' : 'bg-rose-50 text-rose-800 border-rose-150'
                        }`}>
                          {rule.finalDisposition === 'CP' ? 'Conservation Permanente (CP)' : 'Destruction / Élimination (EL)'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 border border-slate-200 font-medium text-slate-600">
                          {rule.support || 'Papier'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-md transition-all select-none cursor-pointer"
                          title="Supprimer la règle"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* TAB 3: ÉDITER L'ORGANIGRAMME */}
        {activeTab === 'organigramme' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Structure de l'Organigramme</h3>
              <p className="text-slate-500 text-xs">Ajuster ou modifier les directions et services de l'entreprise MAE.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Add form */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl h-fit">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-brand-primary" />
                  <span>Nouvelle Direction / Service</span>
                </h4>

                <form onSubmit={handleAddOrg} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Nom du service</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Direction Sinistre Corporel"
                      value={newOrg.name}
                      onChange={e => setNewOrg({...newOrg, name: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Code Trigramme</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. SIN-C"
                      value={newOrg.code}
                      onChange={e => setNewOrg({...newOrg, code: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Description</label>
                    <textarea 
                      placeholder="Courte description d'archivage..."
                      value={newOrg.description}
                      onChange={e => setNewOrg({...newOrg, description: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white h-20"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-bold transition-all shadow select-none cursor-pointer"
                  >
                    Ajouter au Catalogue
                  </button>
                </form>
              </div>

              {/* List grid */}
              <div className="md:col-span-2 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">Directions en vigueur ({organigramme.length})</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {organigramme.map(d => (
                    <div key={d.id} className="relative p-4 border border-slate-200 hover:border-slate-350 rounded-2xl bg-white shadow-sm flex flex-col justify-between group">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-black bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">
                            {d.code}
                          </span>
                        </div>
                        <h5 className="font-bold text-slate-900 text-xs pt-1">{d.name}</h5>
                        {d.description && <p className="text-[11px] text-slate-400 font-medium line-clamp-2">{d.description}</p>}
                      </div>

                      <div className="flex items-center justify-end gap-1.5 mt-3 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => setEditingOrg(d)}
                          className="p-1 text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded transition-all select-none cursor-pointer"
                          title="Modifier"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteOrg(d.id)}
                          className="p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded transition-all select-none cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Editing Org Modal Dialog */}
            <AnimatePresence>
              {editingOrg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl w-full max-w-md space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-extrabold text-slate-800 text-sm">Modifier la Direction</h4>
                      <button onClick={() => setEditingOrg(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleUpdateOrg} className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">Nom</label>
                        <input 
                          type="text"
                          required
                          value={editingOrg.name}
                          onChange={e => setEditingOrg({...editingOrg, name: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">Code</label>
                        <input 
                          type="text"
                          required
                          value={editingOrg.code}
                          onChange={e => setEditingOrg({...editingOrg, code: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-900 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">Description d'archives</label>
                        <textarea 
                          value={editingOrg.description || ''}
                          onChange={e => setEditingOrg({...editingOrg, description: e.target.value})}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-900 h-20"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button 
                          type="button" 
                          onClick={() => setEditingOrg(null)}
                          className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-xs"
                        >
                          Annuler
                        </button>
                        <button 
                          type="submit" 
                          className="px-4 py-1.5 bg-slate-900 border hover:bg-slate-850 text-white rounded-lg text-xs font-bold shadow"
                        >
                          Enregistrer les Modifications
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

          </div>
        )}

        {/* TAB 4: AJOUTER DES UTILISATEURS */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Gestion des Utilisateurs & Attribution des Rôles</h3>
              <p className="text-slate-500 text-xs">Créer des profils, habiliter ou supprimer les droits d'audit ou d'agent de transit.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Form container */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-brand-primary" />
                  <span>Nouveau Profil Utilisateur</span>
                </h4>

                <form onSubmit={handleAddUser} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Nom complet</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Mohamed Ben Ali"
                      value={newUser.displayName}
                      onChange={e => setNewUser({...newUser, displayName: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Adresse Email unique</label>
                    <input 
                      type="email"
                      required
                      placeholder="e.g. mohamed@flowix.pro"
                      value={newUser.email}
                      onChange={e => setNewUser({...newUser, email: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Rôle d'habilitation</label>
                    <select
                      value={newUser.role}
                      onChange={e => setNewUser({...newUser, role: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white"
                    >
                      <option value="Agent">Agent de transit (Saisie active)</option>
                      <option value="Archivist">Archiviste MAE (PV, règles locales)</option>
                      <option value="Demandeur">Dossier Demandeur (Consultation seulement)</option>
                      <option value="Admin">Administrateur Technique</option>
                      <option value="Responsable">Responsable Audit Totale (Auditeur)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow select-none cursor-pointer"
                  >
                    Habiliter le Profil
                  </button>
                </form>
              </div>

              {/* List grid */}
              <div className="md:col-span-2 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">Comptes configurés en base ({users.length})</h4>
                
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="p-3">Utilisateur</th>
                        <th className="p-3">Email de connexion</th>
                        <th className="p-3">Rôle Assigné</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.email} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-extrabold flex items-center justify-center text-xs">
                                {u.displayName.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="font-extrabold text-slate-800">{u.displayName}</span>
                            </div>
                          </td>
                          <td className="p-3 text-slate-600 font-mono text-xs">{u.email}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              u.role === 'Responsable' ? 'bg-indigo-100 text-indigo-800 border-indigo-200 font-black' :
                              u.role === 'Admin' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                              u.role === 'Archivist' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                              'bg-slate-100 text-slate-800 border-slate-200'
                            }`}>
                              {u.role === 'Responsable' ? 'Responsable d\'Audit' : u.role}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteUser(u.email)}
                              className="p-1 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-md transition-all inline-flex items-center gap-1 select-none cursor-pointer font-bold text-[11px]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Retirer</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 5: BARCODE CONFIGURATIONS BY DIRECTION */}
        {activeTab === 'barcodes' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Codes-barres Boîtes et Préfixes par Direction</h3>
              <p className="text-slate-500 text-xs">Définir des indicatifs spécifiques (trigrammes carton) par service pour l'impression finale des étiquettes.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Form */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl h-fit">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                  <Barcode className="w-4 h-4 text-brand-primary" />
                  <span>Associer un Code/Préfixe</span>
                </h4>

                <form onSubmit={handleSaveBarcodePrefix} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Direction de destination</label>
                    <select
                      value={newBarcodeRule.direction}
                      onChange={e => setNewBarcodeRule({...newBarcodeRule, direction: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white font-medium"
                      required
                    >
                      <option value="">Sélectionner une direction...</option>
                      {organigramme.map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Préfixe imprimable codes-barres</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. SIN-CORP. ou COM."
                      value={newBarcodeRule.prefix}
                      onChange={e => setNewBarcodeRule({...newBarcodeRule, prefix: e.target.value})}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400 block pt-1">Sert de tag initial pour les codes 128 des boîtes archivées.</span>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow select-none cursor-pointer"
                  >
                    Sauvegarder le Préfixe de Carton
                  </button>
                </form>
              </div>

              {/* Grid lists */}
              <div className="md:col-span-2 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">Règles enregistrées ({barcodeSettings.length})</h4>
                
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                        <th className="p-3">Direction</th>
                        <th className="p-3">Indicatif de boîte (Préfixe)</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barcodeSettings.map(rule => (
                        <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-800">{rule.direction}</td>
                          <td className="p-3">
                            <span className="font-mono text-xs text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded font-bold">
                              {rule.prefix}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteBarcodePrefix(rule.direction)}
                              className="p-1 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-md transition-all inline-flex items-center gap-1 select-none cursor-pointer font-bold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Supprimer</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 6: BACKUP & INTEGRAL DATABASE RESTORATION */}
        {activeTab === 'backup' && (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Sauvegarde & Restauration Intégrale de la Base de Données</h3>
              <p className="text-slate-500 text-xs">Faites un instantané de sécurité globale ou importez un versement total pour mettre à jour l'application en bloc.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Back up block */}
              <div className="border border-slate-200 rounded-2xl p-6 space-y-4 bg-slate-50 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Download className="w-5 h-5 text-blue-700" />
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-sm">Télécharger un Back-up Global</h4>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    Exporte toutes les tables SQLite de l'application (Dossiers, Boîtes de stockage, PV, Archivage légal, Habilitations, Préfixes) dans un versement JSON structuré et normalisé.
                  </p>
                </div>

                <div className="pt-4">
                  <button
                    onClick={handleBackupExport}
                    className="w-full py-2.5 bg-slate-900 border hover:bg-slate-850 text-white rounded-xl text-xs font-bold transition-all shadow flex items-center justify-center gap-2 select-none cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Sauvegarder & Exporter (Instantané JSON)</span>
                  </button>
                </div>
              </div>

              {/* Import Restore Database block */}
              <div className="border border-slate-200 rounded-2xl p-6 space-y-4 bg-slate-50 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-amber-700" />
                  </div>
                  <h4 className="font-extrabold text-slate-800 text-sm">Importer & Restaurer Toute la Base (Versement Total)</h4>
                  <p className="text-slate-505 text-xs text-slate-500 leading-relaxed">
                    Écrase et remplace instantanément la totalité des tables existantes avec les données contenues dans votre fichier JSON de sauvegarde d'audit.
                  </p>
                </div>

                <div className="relative pt-4">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    onChange={handleImportDatabase}
                    className="hidden"
                    id="db-backup-selector"
                  />
                  <label
                    htmlFor="db-backup-selector"
                    className="w-full py-2.5 bg-amber-500 border border-amber-600 hover:bg-amber-600 text-white rounded-xl text-xs font-black transition-all shadow flex items-center justify-center gap-2 select-none cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Importer Toute la Base de Données (Fichier JSON)</span>
                  </label>
                  <span className="text-[10px] text-red-500 block text-center pt-1.5 font-bold">⚠️ Écrase toutes les données en cours !</span>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* Editing inventory CONTENT popup modal (modifier les inventaires et les contenu) */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-blue-400" />
                    <span>Modifier de contenu du Dossier Carton : {editingItem.reference}</span>
                  </h3>
                  <p className="text-slate-400 text-[11px] pt-0.5">Corriger des informations de versement d'archives pour audit légal.</p>
                </div>
                
                <button onClick={() => setEditingItem(null)} className="p-1 text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditedItem} className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Intitulé Principal</label>
                    <input 
                      type="text"
                      required
                      value={editingItem.intitule || ''}
                      onChange={e => setEditingItem({ ...editingItem, intitule: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Direction de raccordement</label>
                    <select
                      value={editingItem.direction || ''}
                      onChange={e => setEditingItem({ ...editingItem, direction: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white"
                      required
                    >
                      {organigramme.map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">N° Boîte / Carton Suffixe</label>
                    <input 
                      type="text"
                      value={editingItem.numBoite || ''}
                      onChange={e => setEditingItem({ ...editingItem, numBoite: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Étagère / Localisation</label>
                    <input 
                      type="text"
                      value={editingItem.localisation || ''}
                      onChange={e => setEditingItem({ ...editingItem, localisation: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-950 block focus:outline-none bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Date Début Extrême</label>
                    <input 
                      type="text"
                      value={editingItem.dateDebut || ''}
                      onChange={e => setEditingItem({ ...editingItem, dateDebut: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Date Fin Extrême</label>
                    <input 
                      type="text"
                      value={editingItem.dateFin || ''}
                      onChange={e => setEditingItem({ ...editingItem, dateFin: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
                  <button 
                    type="button" 
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
                  >
                    Annuler
                  </button>
                  
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-slate-900 border hover:bg-slate-800 text-white font-bold rounded-xl shadow"
                  >
                    Mettre à jour l'inventaires
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Adding a custom new conservation rule Modal dialog */}
      <AnimatePresence>
        {showRuleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm">Ajouter une Règle d'Archivage</h4>
                </div>
                <button onClick={() => setShowRuleModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddRule} className="p-6 space-y-4 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Désignation Trigramme / Référence</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. FIN-FACT-PV1"
                    value={newRule.reference}
                    onChange={e => setNewRule({ ...newRule, reference: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Titre de la Règle / Catégorie</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Dossiers de Factures d'investissements et fiches de paie"
                    value={newRule.title}
                    onChange={e => setNewRule({ ...newRule, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Direction de raccordement</label>
                  <select
                    value={newRule.direction}
                    onChange={e => setNewRule({ ...newRule, direction: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    required
                  >
                    <option value="">Sélectionner...</option>
                    {organigramme.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Séjour Actif (Années)</label>
                    <input 
                      type="number"
                      required
                      min="0"
                      value={newRule.activeYears}
                      onChange={e => setNewRule({ ...newRule, activeYears: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Séjour Semi-Actif (Années)</label>
                    <input 
                      type="number"
                      required
                      min="0"
                      value={newRule.semiActiveYears}
                      onChange={e => setNewRule({ ...newRule, semiActiveYears: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Sort Final</label>
                    <select
                      value={newRule.finalDisposition}
                      onChange={e => setNewRule({ ...newRule, finalDisposition: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    >
                      <option value="EL">Élimination (EL)</option>
                      <option value="CP">Conservation Permanente (CP)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Support de Conservation</label>
                    <select
                      value={newRule.support}
                      onChange={e => setNewRule({ ...newRule, support: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    >
                      <option value="Papier">Papier d'origine</option>
                      <option value="Numérique">Numérique uniquement</option>
                      <option value="Hybride">Hybride (Papier + Numérique)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button 
                    type="button" 
                    onClick={() => setShowRuleModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-slate-900 border hover:bg-slate-800 text-white font-bold rounded-xl shadow"
                  >
                    Créer la Règle
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Scan PDF Modal / Overlay Sidebar */}
      <AnimatePresence>
        {pdfViewerFile && (() => {
          let cleanFileName = String(pdfViewerFile).trim();
          if (cleanFileName.startsWith('[') && cleanFileName.endsWith(']')) {
            try {
              const parsed = JSON.parse(cleanFileName);
              if (Array.isArray(parsed) && parsed.length > 0) cleanFileName = parsed[0];
            } catch (e) {}
          }
          cleanFileName = cleanFileName.replace(/^[\["']+|[\]"']+$/g, '').trim();
          const scanUrl = `/api/scans/${encodeURIComponent(cleanFileName)}`;
          const displayFileName = cleanFileName.substring(cleanFileName.indexOf('_') + 1) || cleanFileName;

          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-end">
              <motion.div
                initial={{ x: '100%', opacity: 0.9 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0.9 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bg-white h-full w-full max-w-4xl shadow-2xl flex flex-col border-l border-slate-200"
              >
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
                  <div className="space-y-0.5 min-w-0 pr-4">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900">Visionneuse de Document Officiel</span>
                    <p className="font-extrabold text-sm truncate text-slate-100 uppercase tracking-tight" title={pdfViewerTitle || displayFileName}>{pdfViewerTitle || displayFileName}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{displayFileName}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a 
                      href={scanUrl} 
                      download={displayFileName}
                      className="flex items-center gap-1 text-[10px] font-black bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg px-3 py-1.5 transition"
                      title="Télécharger le document"
                    >
                      <Download size={12} />
                      <span className="hidden sm:inline">TÉLÉCHARGER</span>
                    </a>
                    <a 
                      href={scanUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] font-black bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-1.5 transition"
                    >
                      <ExternalLink size={12} />
                      <span>PLEIN ÉCRAN</span>
                    </a>
                    <button 
                      onClick={() => {
                        setPdfViewerFile(null);
                        setPdfViewerTitle('');
                      }}
                      className="p-1.5 hover:bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 bg-slate-100 relative">
                  <iframe
                    src={`${scanUrl}#toolbar=1`}
                    className="w-full h-full border-0 bg-white"
                    title="Document original numérisé"
                  />
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Validation Modal for Responsable */}
      {validatingTransfer && (
        <ValidationTransfertModal
          request={validatingTransfer}
          onClose={() => setValidatingTransfer(null)}
          onConfirm={handleConfirmTransferValidation}
        />
      )}

      {/* Preliminary Dispatch Slip Modal */}
      {viewingTransferPreliminaire && (
        <BordereauPreliminaireModal
          request={viewingTransferPreliminaire}
          onClose={() => setViewingTransferPreliminaire(null)}
        />
      )}

      {/* Official Acceptance Sheet Modal */}
      {viewingTransferAcceptance && (
        <FicheAcceptationModal
          request={viewingTransferAcceptance}
          onClose={() => setViewingTransferAcceptance(null)}
        />
      )}

      {/* Final Transfer / Inventory Validation Bordereau Modal */}
      {viewingFinalInventoryBatch && (
        <BordereauFinalInventaireModal
          items={viewingFinalInventoryBatch}
          validatorName="Responsable d'Audit Archival"
          validatedAt={new Date()}
          onClose={() => setViewingFinalInventoryBatch(null)}
        />
      )}

      {/* Final Elimination / PV Destruction Validation Modal */}
      {viewingFinalEliminationBatch && (
        <BordereauFinalEliminationModal
          items={viewingFinalEliminationBatch}
          validatorName="Responsable d'Audit & Conservation"
          validatedAt={new Date()}
          onClose={() => setViewingFinalEliminationBatch(null)}
        />
      )}

      {/* --- MODAL INSPECTION DU LOT D'INTÉGRATION COMPLET (ÉTAPE 7) --- */}
      {inspectingBatch && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-950 px-2.5 py-0.5 rounded border border-emerald-900">
                    Détail du Lot d'Intégration
                  </span>
                  {inspectingBatch.inventoryRef && (
                    <span className="text-xs font-mono font-black text-emerald-300 bg-emerald-900/80 px-2.5 py-0.5 rounded border border-emerald-500/40">
                      Réf : {inspectingBatch.inventoryRef}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-extrabold mt-1">
                  {inspectingBatch.inventoryName || `Lot ${inspectingBatch.batchNumber}`} — {inspectingBatch.direction}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Code Lot : {inspectingBatch.batchNumber} • Vérification détaillée des {inspectingBatch.foldersCount || inspectingBatch.foldersData?.length || 0} dossiers et {inspectingBatch.boxesCount || inspectingBatch.boxesData?.length || 0} boîtes avant validation finale.
                </p>
              </div>
              <button
                onClick={() => setInspectingBatch(null)}
                className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Boîtes générées</p>
                  <p className="text-2xl font-black text-slate-800">{inspectingBatch.boxesCount || inspectingBatch.boxesData?.length || 0}</p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Dossiers intégrés</p>
                  <p className="text-2xl font-black text-slate-800">{inspectingBatch.foldersCount || inspectingBatch.foldersData?.length || 0}</p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Règle DUA</p>
                  <p className="text-xs font-bold text-emerald-700 truncate" title={inspectingBatch.ruleApplied?.title || inspectingBatch.ruleApplied?.reference || 'Règle standard'}>
                    {inspectingBatch.ruleApplied?.reference || 'DUA Associée'}
                  </p>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Statut</p>
                  <span className="inline-block mt-1 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    {inspectingBatch.status}
                  </span>
                </div>
              </div>

              {/* Table of Boxes */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Archive size={16} className="text-emerald-600" /> Boîtes d'Archives et Localisations
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="p-2.5">Code Boîte</th>
                        <th className="p-2.5">Code-Barres</th>
                        <th className="p-2.5">Emplacement Physique</th>
                        <th className="p-2.5">Type d'Archive</th>
                        <th className="p-2.5 text-center">Nombre Dossiers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(inspectingBatch.boxesData || []).map((b: any, idx: number) => {
                        const boxNum = b.boxNumber || b.number || `Boîte #${idx + 1}`;
                        
                        // Dynamically compute exact number of folders for this box
                        const folderCount = b.foldersCount ?? b.folderCount ?? (
                          Array.isArray(b.foldersList) && b.foldersList.length > 0
                            ? b.foldersList.length
                            : Array.isArray(b.folders) && b.folders.length > 0
                              ? b.folders.length
                              : (inspectingBatch.foldersData || []).filter((f: any) => {
                                  const fBox = f.boxNumber || f.numBoite || f.generatedBoxNumber;
                                  return String(fBox).trim() === String(boxNum).trim();
                                }).length
                        );

                        // Format full physical location
                        let locStr = b.localisation || b.location;
                        if (!locStr || locStr === 'Centre Archives Central') {
                          const parts: string[] = [];
                          if (b.batiment) parts.push(b.batiment);
                          if (b.depot && b.salle) parts.push(`${b.depot} / ${b.salle}`);
                          else if (b.depot) parts.push(b.depot);
                          else if (b.salle) parts.push(b.salle);

                          const coords: string[] = [];
                          if (b.rayon) coords.push(`Rayon ${b.rayon}`);
                          if (b.travee) coords.push(`Travée ${b.travee}`);
                          if (b.tablette) coords.push(`Étagère ${b.tablette}`);
                          if (b.niveau) coords.push(`Niveau ${b.niveau}`);

                          if (coords.length > 0) parts.push(coords.join(' - '));
                          if (parts.length > 0) locStr = parts.join(' • ');
                        }
                        if (!locStr) locStr = 'Centre Archives Central';

                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-2.5 font-bold font-mono text-emerald-800 bg-emerald-50/50 rounded">{boxNum}</td>
                            <td className="p-2.5 font-mono text-slate-600">{b.barcode || `BOX-${boxNum}-2026`}</td>
                            <td className="p-2.5 font-bold text-slate-700">{locStr}</td>
                            <td className="p-2.5 text-slate-600">{b.archiveType || inspectingBatch.direction}</td>
                            <td className="p-2.5 text-center">
                              <span className="inline-flex items-center justify-center font-mono font-black text-xs text-emerald-950 bg-emerald-100/90 px-3 py-1 rounded-lg border border-emerald-300">
                                {folderCount}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table of Folders with Search, Filters, Extreme Dates and Confirmed Retention Rules */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-emerald-600" />
                    <h4 className="text-sm font-black text-slate-800">
                      Liste Complète des Dossiers d'Inventaire
                    </h4>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {inspectingBatch.foldersData?.length || 0} dossiers
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                    <Clock size={13} className="text-slate-400" />
                    <span>Calcul des dates extrêmes selon la date de clôture & règles DUA</span>
                  </div>
                </div>

                {/* Search and Filters Bar for Dossiers */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  {/* Search query */}
                  <div className="sm:col-span-6 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filtrer par n° ordre, référence, intitulé, règle DUA, dates, boîte..."
                      value={inspectFolderSearch}
                      onChange={e => setInspectFolderSearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                    {inspectFolderSearch && (
                      <button
                        onClick={() => setInspectFolderSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Filter by Box */}
                  <div className="sm:col-span-3">
                    <select
                      value={inspectFolderSelectedBox}
                      onChange={e => setInspectFolderSelectedBox(e.target.value)}
                      className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="all">Toutes les boîtes ({inspectingBatch.boxesData?.length || 0})</option>
                      {(inspectingBatch.boxesData || []).map((b: any, bIdx: number) => {
                        const boxNum = b.boxNumber || b.number;
                        const count = b.foldersCount ?? b.folderCount ?? (
                          Array.isArray(b.foldersList) && b.foldersList.length > 0
                            ? b.foldersList.length
                            : (inspectingBatch.foldersData || []).filter((f: any) => String(f.boxNumber || f.numBoite || f.generatedBoxNumber).trim() === String(boxNum).trim()).length
                        );
                        return (
                          <option key={bIdx} value={boxNum}>
                            {boxNum} ({count} dos.)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Filter by Sort Final */}
                  <div className="sm:col-span-3 flex items-center gap-1">
                    <button
                      onClick={() => setInspectFolderSortFinal('all')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all text-center ${
                        inspectFolderSortFinal === 'all'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      Tous
                    </button>
                    <button
                      onClick={() => setInspectFolderSortFinal('EL')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all text-center ${
                        inspectFolderSortFinal === 'EL'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-white text-rose-700 hover:bg-rose-50 border border-slate-200'
                      }`}
                    >
                      Élim. (EL)
                    </button>
                    <button
                      onClick={() => setInspectFolderSortFinal('CP')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all text-center ${
                        inspectFolderSortFinal === 'CP'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-slate-200'
                      }`}
                    >
                      Cons. (CP)
                    </button>
                  </div>
                </div>

                {/* Filtered Dossiers List */}
                {(() => {
                  const allFolders = inspectingBatch.foldersData || [];

                  // Collect distinct raw Excel column keys across all folders
                  const rawExcelCols: string[] = Array.from(new Set<string>(
                    allFolders.flatMap((f: any) => f.rawRow && typeof f.rawRow === 'object' ? Object.keys(f.rawRow) : [])
                  )).filter(k => k && k !== 'undefined' && k !== 'null');

                  const filteredFolders = allFolders.filter((f: any, idx: number) => {
                    // Search query match
                    if (inspectFolderSearch.trim()) {
                      const q = inspectFolderSearch.toLowerCase().trim();
                      const numOrdre = String(idx + 1);
                      const boxNum = String(f.boxNumber || f.numBoite || '').toLowerCase();
                      const ref = String(f.reference || '').toLowerCase();
                      const intitule = String(f.intitule || f.titre || f.designation || '').toLowerCase();
                      const dua = String(f.codeDua || f.ruleId || '').toLowerCase();
                      const dCloture = String(f.dateCloture || f.dateFin || f.year || '').toLowerCase();
                      const dDebut = String(f.dateDebut || '').toLowerCase();
                      const sort = String(f.sortFinal || f.finalDisposition || '').toLowerCase();
                      const inRawRow = f.rawRow && typeof f.rawRow === 'object'
                        ? Object.values(f.rawRow).some(v => String(v).toLowerCase().includes(q))
                        : false;

                      const match = numOrdre.includes(q) || boxNum.includes(q) || ref.includes(q) || intitule.includes(q) || dua.includes(q) || dCloture.includes(q) || dDebut.includes(q) || sort.includes(q) || inRawRow;
                      if (!match) return false;
                    }

                    // Box filter
                    if (inspectFolderSelectedBox !== 'all') {
                      const boxNum = String(f.boxNumber || f.numBoite || '');
                      if (boxNum !== inspectFolderSelectedBox) return false;
                    }

                    // Sort final filter
                    if (inspectFolderSortFinal !== 'all') {
                      const sort = String(f.sortFinal || f.finalDisposition || 'EL').toUpperCase();
                      if (inspectFolderSortFinal === 'EL' && !sort.includes('EL') && !sort.includes('ÉLIM') && !sort.includes('D')) return false;
                      if (inspectFolderSortFinal === 'CP' && !sort.includes('CP') && !sort.includes('CONS') && !sort.includes('C')) return false;
                    }

                    return true;
                  });

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                        <div className="flex items-center gap-2">
                          <span>
                            Affichage de <strong className="text-slate-800 font-bold">{filteredFolders.length}</strong> sur <strong>{allFolders.length}</strong> ligne(s)
                          </span>
                          {rawExcelCols.length > 0 && (
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {rawExcelCols.length} colonne(s) Excel d'origine sans modification
                            </span>
                          )}
                        </div>
                        {(inspectFolderSearch || inspectFolderSelectedBox !== 'all' || inspectFolderSortFinal !== 'all') && (
                          <button
                            onClick={() => {
                              setInspectFolderSearch('');
                              setInspectFolderSelectedBox('all');
                              setInspectFolderSortFinal('all');
                            }}
                            className="text-emerald-600 hover:text-emerald-700 font-bold cursor-pointer hover:underline"
                          >
                            Réinitialiser les filtres
                          </button>
                        )}
                      </div>

                      <div className="overflow-x-auto max-h-80 rounded-xl border border-slate-200">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-bold sticky top-0 z-10">
                              <th className="p-3 w-12 text-center">N°</th>
                              
                              {/* Raw Excel Columns */}
                              {rawExcelCols.length > 0 ? (
                                rawExcelCols.map(colName => (
                                  <th key={colName} className="p-3 whitespace-nowrap text-slate-800 font-black">
                                    {colName}
                                  </th>
                                ))
                              ) : (
                                <>
                                  <th className="p-3">Boîte / Stockage</th>
                                  <th className="p-3">Référence Dossier</th>
                                  <th className="p-3">Date Début</th>
                                  <th className="p-3">Date Clôture</th>
                                  <th className="p-3">Intitulé / Objet</th>
                                </>
                              )}

                              {/* DUA & Sort final */}
                              <th className="p-3 text-center bg-emerald-50 text-emerald-950 font-black border-l border-emerald-200 whitespace-nowrap">
                                Règle Confirmée & DUA
                              </th>
                              <th className="p-3 text-center bg-emerald-50 text-emerald-950 font-black whitespace-nowrap">
                                Sort Final
                              </th>
                              {rawExcelCols.length > 0 && (
                                <th className="p-3 bg-emerald-50 text-emerald-950 font-black whitespace-nowrap">
                                  Boîte Assignée
                                </th>
                              )}
                              <th className="p-3 bg-emerald-50 text-emerald-950 font-black whitespace-nowrap">
                                Localisation
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {filteredFolders.length === 0 ? (
                              <tr>
                                <td colSpan={rawExcelCols.length > 0 ? rawExcelCols.length + 4 : 8} className="p-8 text-center text-slate-400 font-medium">
                                  Aucun dossier ne correspond à vos filtres de recherche.
                                </td>
                              </tr>
                            ) : (
                              filteredFolders.map((f: any, idx: number) => {
                                const closureDateDisplay = getClosureDateDisplay(f);
                                const ruleDisplay = getConfirmedRuleDisplay(f, inspectingBatch.ruleApplied);
                                const originalIdx = allFolders.indexOf(f);
                                const primaryRef = f.reference || f.intitule || f.titre || f.designation || `Dossier #${originalIdx >= 0 ? originalIdx + 1 : idx + 1}`;
                                const boxNum = f.boxNumber || f.numBoite || 'Non assignée';

                                return (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    {/* N° Ordre */}
                                    <td className="p-3 text-center font-mono font-bold text-slate-400">
                                      #{originalIdx >= 0 ? originalIdx + 1 : idx + 1}
                                    </td>

                                    {/* Raw Excel Cells */}
                                    {rawExcelCols.length > 0 ? (
                                      rawExcelCols.map(colName => {
                                        const rawVal = f.rawRow && f.rawRow[colName] !== undefined && f.rawRow[colName] !== null
                                          ? String(f.rawRow[colName])
                                          : (f[colName] !== undefined ? String(f[colName]) : '-');
                                        const isNumeric = /^\d+$/.test(rawVal.trim());
                                        
                                        return (
                                          <td key={colName} className="p-3 whitespace-nowrap font-medium text-slate-900">
                                            <span className={`font-mono ${isNumeric ? 'font-bold text-slate-950' : 'text-slate-800'}`}>
                                              {rawVal}
                                            </span>
                                          </td>
                                        );
                                      })
                                    ) : (
                                      <>
                                        <td className="p-3">
                                          <button
                                            onClick={() => setInspectFolderSelectedBox(f.boxNumber || f.numBoite)}
                                            title="Cliquer pour filtrer cette boîte"
                                            className="inline-flex items-center gap-1 font-mono font-black text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 text-[11px] w-fit cursor-pointer transition-colors"
                                          >
                                            <Archive size={11} className="text-emerald-600" />
                                            {boxNum}
                                          </button>
                                        </td>
                                        <td className="p-3 font-mono font-bold text-slate-900">
                                          {primaryRef}
                                        </td>
                                        <td className="p-3 font-mono text-slate-600">
                                          {f.dateDebut || '-'}
                                        </td>
                                        <td className="p-3 font-mono font-bold text-slate-800">
                                          {closureDateDisplay}
                                        </td>
                                        <td className="p-3 text-slate-600 max-w-xs truncate" title={f.intitule || primaryRef}>
                                          {f.intitule && f.intitule !== f.reference && f.intitule !== f.numBoite ? f.intitule : '-'}
                                        </td>
                                      </>
                                    )}

                                    {/* Règle Confirmée & DUA */}
                                    <td className="p-3 text-center border-l border-slate-200">
                                      <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
                                        <span className="font-mono font-black text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded text-xs border border-emerald-300">
                                          {ruleDisplay.codeDua}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                          {ruleDisplay.duration}
                                        </span>
                                      </div>
                                    </td>

                                    {/* Sort Final */}
                                    <td className="p-3 text-center">
                                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                        ruleDisplay.isElimination
                                          ? 'bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs'
                                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs'
                                      }`}>
                                        {ruleDisplay.isElimination ? 'Élimination (EL)' : 'Conservation (CP)'}
                                      </span>
                                    </td>

                                    {/* Boîte if rawExcelCols active */}
                                    {rawExcelCols.length > 0 && (
                                      <td className="p-3">
                                        <button
                                          onClick={() => setInspectFolderSelectedBox(f.boxNumber || f.numBoite)}
                                          title="Cliquer pour filtrer cette boîte"
                                          className="inline-flex items-center gap-1 font-mono font-black text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 text-[11px] w-fit cursor-pointer transition-colors"
                                        >
                                          <Archive size={11} className="text-emerald-600" />
                                          {boxNum}
                                        </button>
                                      </td>
                                    )}

                                    {/* Localisation */}
                                    <td className="p-3 text-[11px] text-slate-500 font-mono whitespace-nowrap">
                                      {f.localisation || 'Centre Archives Central'}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInspectingBatch(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Fermer l'Inspection
                </button>
                <button
                  onClick={() => {
                    const b = inspectingBatch;
                    setViewingBatchSlip(b);
                  }}
                  className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-xs"
                  title="Consulter et imprimer le Procès-Verbal officiel de transfert"
                >
                  <FileText size={14} /> Voir le PV de Transfert
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const b = inspectingBatch;
                    setInspectingBatch(null);
                    handleRejectIntegrationBatch(b.id);
                  }}
                  className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl text-xs font-bold transition-all"
                >
                  Rejeter le Lot
                </button>
                <button
                  onClick={() => {
                    const b = inspectingBatch;
                    setInspectingBatch(null);
                    handleValidateIntegrationBatch(b.id);
                  }}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-950 flex items-center gap-2"
                >
                  <CheckSquare size={14} /> Valider & Sceller Définitivement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL PROCÈS-VERBAL & BORDEREAU DE TRANSFERT D'ARCHIVES --- */}
      {viewingBatchSlip && (
        <PVTransfertModal
          batch={viewingBatchSlip}
          onClose={() => setViewingBatchSlip(null)}
          onValidate={handleValidateIntegrationBatch}
        />
      )}

    </div>
  );
}
