import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../App';
import { Button, Card, Input } from '../UI';
import { Search, Filter, Trash2, Edit2, CheckCircle, Clock, BarChart3, Users, FileStack, ExternalLink, TrendingUp, X, Save, Inbox, RotateCcw, RotateCw, CheckCircle2, XCircle, Building2, Eye, FileText, PencilLine, Download, FileSpreadsheet, Printer, Library, Plus, History, MapPin, ChevronRight, Bell, FileCheck, CheckCheck as CheckDouble, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isSameDay } from 'date-fns';
import { cn, toSafeDate } from '../../lib/utils';
import * as XLSX from 'xlsx';
import Barcode from 'react-barcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../../lib/api';
import { RETENTION_CALENDAR } from '../../constants/retentionCalendar';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

import { suggestRetentionRule, extractArchivalRulesFromPDF } from '../../services/archiveAIService';

import { CentralizedInventory } from './CentralizedInventory';

export const AdminDashboard = ({ initialTab = 'requests' }: { initialTab?: 'requests' | 'communication' | 'returns' | 'stats' | 'massInventory' | 'elimination' }) => {
  const { remoteRequests: sharedRemoteRequests, pendingRequests: sharedPendingRequests, lastUpdate: sharedLastUpdate } = useAuth();
  
  const [requests, setRequests] = useState<any[]>([]);
  const [remoteRequests, setRemoteRequests] = useState<any[]>([]);
  const [transferRequests, setTransferRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'requests' | 'communication' | 'returns' | 'stats' | 'massInventory' | 'elimination'>(initialTab);
  const [requestSubTab, setRequestSubTab] = useState<'all' | 'signed' | 'transfers'>('all');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [archivedComms, setArchivedComms] = useState<any[]>([]);
  const [returnSubTab, setReturnSubTab] = useState<'import' | 'search' | 'history' | 'inventory'>('search');
  const [returnInventory, setReturnInventory] = useState<any[]>([]);
  const [returnHistory, setReturnHistory] = useState<any[]>([]);
  const [returnSearchTerm, setReturnSearchTerm] = useState('');
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  
  // Mass Inventory States
  const [massInventory, setMassInventory] = useState<any[]>([]);
  const [massInventoryStats, setMassInventoryStats] = useState({ total: 0 });
  const [massSearchTerm, setMassSearchTerm] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<string>('all');
  const [importingDirection, setImportingDirection] = useState<string>('');
  const [importingRule, setImportingRule] = useState<any | null>(null);
  const [massSubTab, setMassSubTab] = useState<'view' | 'import' | 'history' | 'monitoring' | 'centralized'>('view');
  const [isSearchingLoc, setIsSearchingLoc] = useState(false);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [editedDetailItem, setEditedDetailItem] = useState<any>(null);
  const [archivalDirectory, setArchivalDirectory] = useState<any[]>([]);
  const [archivalMonitoringStats, setArchivalMonitoringStats] = useState({ total: 0, active: 0, semiActive: 0, expired: 0, unlinked: 0 });
  const [monitoringItems, setMonitoringItems] = useState<any[]>([]);
  const [monitoringStatus, setMonitoringStatus] = useState<string>('Expired');
  const [searchRule, setSearchRule] = useState("");
  const [showImportRulesModal, setShowImportRulesModal] = useState(false);
  const [fullStats, setFullStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [importPreviewData, setImportPreviewData] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [mappedItems, setMappedItems] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [uploadedServerFilename, setUploadedServerFilename] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<{row: number, error: string}[]>([]);

  // States for adding a missing DUA rule right during import validation
  const [isAddingImportRule, setIsAddingImportRule] = useState(false);
  const [newImportRule, setNewImportRule] = useState({
    reference: '',
    title: '',
    direction: '',
    docType: 'Dossier',
    activeYears: 5,
    semiActiveYears: 5,
    finalDisposition: 'EL',
    support: 'Papier',
    retentionTrigger: 'Chambre',
    category: 'Général',
    isCritical: false
  });

  const handleSaveImportRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newImportRule.reference || !newImportRule.title || !newImportRule.direction) {
      alert("Veuillez remplir les champs obligatoires (Code, Intitulé, Direction).");
      return;
    }
    try {
      const res = await api.post('/api/archival-directory', newImportRule);
      if (res && res.id) {
        alert("Règle de conservation ajoutée avec succès !");
        
        // Reload global rules directory
        await fetchArchivalDirectory();
        
        // Automatically select the rule we just created
        setImportingRule({
          id: res.id,
          reference: newImportRule.reference,
          title: newImportRule.title,
          direction: newImportRule.direction
        });

        // Close modal
        setIsAddingImportRule(false);
      } else {
        alert("Erreur lors de l'enregistrement de la règle.");
      }
    } catch (err: any) {
      alert("Erreur réseau: " + err.message);
    }
  };

  // Function to convert Excel serial dates or strings to JS Date strings (JJ/MM/AAAA)
  const formatExcelDate = (val: any) => {
    if (val === undefined || val === null || val === "") return "-";
    const strVal = String(val).trim();
    
    // 1. Handle Excel Serial Dates (numeric)
    if (/^\d{5}(\.\d+)?$/.test(strVal)) {
      const serial = parseFloat(strVal);
      try {
        const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
        if (!isNaN(date.getTime())) {
          return format(date, 'dd/MM/yyyy');
        }
      } catch (e) {
        return strVal;
      }
    }

    // 2. Handle standard string dates (JJ/MM/AAAA, AAAA-MM-JJ, etc.)
    // Try dd/mm/yyyy
    const ddmmRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/;
    const match = strVal.match(ddmmRegex);
    if (match) {
      let [_, d, m, y] = match;
      if (y.length === 2) y = parseInt(y) > 50 ? `19${y}` : `20${y}`;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }

    // 3. Fallback to native JS parser for ISO etc.
    try {
      const parsed = new Date(strVal);
      if (!isNaN(parsed.getTime())) {
        return format(parsed, 'dd/MM/yyyy');
      }
    } catch (e) {}
    
    return strVal;
  };

  const [eliminationStats, setEliminationStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [eligibleItems, setEligibleItems] = useState<any[]>([]);
  const [eliminationRequests, setEliminationRequests] = useState<any[]>([]);
  const [eliminationSubTab, setEliminationSubTab] = useState<'alerts' | 'proposal' | 'history' | 'calendar'>('alerts');
  const [isImportingRules, setIsImportingRules] = useState(false);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);
  const [isClearingDirectory, setIsClearingDirectory] = useState(false);
  const [selectedCalendarDir, setSelectedCalendarDir] = useState<string | null>(null);
  const [selectedForElimination, setSelectedForElimination] = useState<string[]>([]);
  const [historicSearch, setHistoricSearch] = useState('');
  const [isEditingRule, setIsEditingRule] = useState(false);
  const [editedRule, setEditedRule] = useState<any>(null);

  // Smart Calendar Intelligence States
  const [smartSearchQuery, setSmartSearchQuery] = useState('');
  const [simSelectedRuleId, setSimSelectedRuleId] = useState('');
  const [simClosureDate, setSimClosureDate] = useState(new Date().toISOString().split('T')[0]);

  const handleUpdateMassItem = async () => {
    if (!editedDetailItem) return;
    setIsSearchingLoc(true);
    try {
      if (editedDetailItem.id) {
        await api.patch(`/api/mass-inventory/${editedDetailItem.id}`, editedDetailItem);
        setMassInventory(prev => prev.map(item => 
          item.id === editedDetailItem.id ? { ...item, ...editedDetailItem } : item
        ));
        if (viewingRequest && viewingRequest.id === editedDetailItem.id) {
          setViewingRequest({ ...viewingRequest, ...editedDetailItem });
        }
        alert("Informations mises à jour avec succès.");
      } else {
        await api.post('/api/mass-inventory', editedDetailItem);
        alert("Nouveau dossier créé avec succès.");
        fetchData(); // Refresh list
      }
      setIsEditingDetail(false);
    } catch (err) {
      alert("Erreur lors de l'enregistrement.");
    } finally {
      setIsSearchingLoc(false);
    }
  };

  const fetchEliminationData = async () => {
    try {
      const [stats, eligible, requests] = await Promise.all([
        api.get('/api/elimination/stats'),
        api.get('/api/elimination/eligible'),
        api.get('/api/elimination-requests')
      ]);
      setEliminationStats(stats);
      setEligibleItems(eligible);
      setEliminationRequests(requests);
    } catch (err) { console.error(err); }
  };
  
  // Pre-index retention rules for faster lookup
  const ruleIndex = React.useMemo(() => {
    const index: Record<string, any> = {};
    RETENTION_CALENDAR.forEach(dir => {
      dir.rules.forEach(rule => {
        index[rule.reference] = rule;
      });
    });
    return index;
  }, []);

  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [validatedItemLabel, setValidatedItemLabel] = useState<any | null>(null);
  const labelRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [viewingRequest, setViewingRequest] = useState<any | null>(null);

  useEffect(() => {
    if (viewingRequest && viewingRequest.rawData) {
      setEditedDetailItem({ ...viewingRequest });
    } else {
      setEditedDetailItem(null);
    }
    setIsEditingDetail(false);
  }, [viewingRequest]);

  useEffect(() => {
    setRequests(sharedPendingRequests);
    setRemoteRequests(sharedRemoteRequests);
  }, [sharedPendingRequests, sharedRemoteRequests]);

  const fetchData = async () => {
    try {
      const [transfers, inv, hist, stats, elims] = await Promise.all([
        api.get('/api/transfer-requests'),
        api.get('/api/returns/inventory'),
        api.get('/api/returns/history'),
        api.get('/api/mass-inventory/stats'),
        api.get('/api/elimination-requests')
      ]);
      setTransferRequests(transfers);
      setReturnInventory(inv);
      setReturnHistory(hist);
      setMassInventoryStats(stats);
      setEliminationRequests(elims);
    } catch (err: any) {
      if (err.message !== 'Failed to fetch') {
        console.error("API Error in AdminDashboard (Main):", err);
      }
    }
  };

  const fetchArchives = async () => {
    if (activeTab === 'communication' || activeTab === 'returns') {
      try {
        const archives = await api.get('/api/archives');
        setArchivedComms(archives);
      } catch (err: any) {
        if (err.message !== 'Failed to fetch') {
          console.error("API Error in AdminDashboard (Archives):", err);
        }
      }
    }
  };

  const fetchArchivalDirectory = async () => {
    try {
      const data = await api.get('/api/archival-directory');
      setArchivalDirectory(data);
    } catch (err) { console.error(err); }
  };

  const handleSaveRule = async (rule: any) => {
    try {
      if (rule.id) {
        await api.patch(`/api/archival-directory/${rule.id}`, rule);
      } else {
        await api.post('/api/archival-directory', rule);
      }
      setIsEditingRule(false);
      setEditedRule(null);
      fetchArchivalDirectory();
      alert("Règle de conservation enregistrée avec succès.");
    } catch (err) {
      alert("Erreur lors de l'enregistrement de la règle.");
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Supprimer cette règle de conservation ?")) return;
    try {
      await api.delete(`/api/archival-directory/${id}`);
      fetchArchivalDirectory();
    } catch (err) {
      alert("Erreur lors de la suppression.");
    }
  };

  const handleDeleteDirection = async (direction: string) => {
    if (!confirm(`Supprimer TOUTES les règles de la direction "${direction}" ?`)) return;
    try {
      await api.post('/api/archival-directory/direction/clear', { direction });
      fetchArchivalDirectory();
      alert(`Règles de la direction "${direction}" supprimées.`);
    } catch (err) {
      alert("Erreur lors de la suppression de la direction.");
    }
  };

  const fetchArchivalMonitoring = async () => {
    try {
      const stats = await api.get('/api/mass-inventory/archival-stats');
      setArchivalMonitoringStats(stats);
      
      if (activeTab === 'massInventory' && massSubTab === 'monitoring') {
        const items = await api.get(`/api/mass-inventory/monitoring?status=${monitoringStatus}`);
        // Deduplicate locally to be safe
        const seen = new Set();
        const cleanItems = items.filter((i: any) => {
          if (!i.id || seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        });
        setMonitoringItems(cleanItems);
      }
    } catch (err) { console.error("Monitoring fetch error:", err); }
  };

  const fetchFullStats = async () => {
    setIsLoadingStats(true);
    try {
      const data = await api.get('/api/statistics/full');
      setFullStats(data);
    } catch (err) {
      console.error("Full stats fetch error:", err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    // 1. Fetch persistent lookup data only once on mount
    if (archivalDirectory.length === 0) {
      fetchArchivalDirectory();
    }
  }, []);

  useEffect(() => {
    // 2. Fetch tab-specific data - staggered to avoid 429
    const initFetch = async () => {
      try {
        await fetchData(); // Basic requests/returns info
        
        await new Promise(r => setTimeout(r, 500)); // Stagger

        if (activeTab === 'communication' || activeTab === 'returns') {
          await fetchArchives();
        }
        
        if (activeTab === 'massInventory' || activeTab === 'elimination') {
          await fetchArchivalMonitoring();
        }
        
        if (activeTab === 'elimination') {
          await fetchEliminationData();
        }

        if (activeTab === 'stats') {
          await fetchFullStats();
        }
      } catch (e) {
        console.error("Initial fetch staggered error:", e);
      }
    };

    initFetch();

    // Polling - more conservative
    const interval = setInterval(() => {
      fetchData();
      
      if (activeTab === 'communication' || activeTab === 'returns') {
        fetchArchives();
      }

      if (activeTab === 'massInventory' || activeTab === 'elimination') {
        fetchArchivalMonitoring();
      }

      if (activeTab === 'stats') {
        fetchFullStats();
      }
    }, 120000); // 2 minutes is plenty for polling since App handles core data

    return () => {
      clearInterval(interval);
    };
  }, [activeTab, sharedPendingRequests, sharedRemoteRequests]);

  const handleMassInventoryImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImporting(true);
    setImportStep('preview');

    // 1. Upload file to server for persistence (Secure Storage)
    let serverFilename = null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await api.post('/api/mass-inventory/upload-archive', formData);
      serverFilename = uploadRes.filename;
      setUploadedServerFilename(serverFilename);
    } catch (err) {
      console.error("Secure upload failed:", err);
      // We continue with preview but flag the secure storage issue if needed
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { 
          type: 'array',
          cellDates: false, // We handle dates ourselves for better control
          cellNF: false,
          cellText: false 
        });
        
        let jsonData: any[] = [];
        let headers: string[] = [];
        let sheetFound = false;
        
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          // Use { raw: true } to keep Excel serial numbers as numbers
          const dataFromSheet = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
          if (dataFromSheet.length > 0) {
            jsonData = dataFromSheet;
            headers = Object.keys(dataFromSheet[0]);
            sheetFound = true;
            break;
          }
        }

        if (!sheetFound || jsonData.length === 0) {
          alert('Fichier vide ou format non supporté.');
          setImportStep('upload');
          setImporting(false);
          return;
        }

        setImportHeaders(headers);
        setImportPreviewData(jsonData.slice(0, 15)); // Show 15 rows for preview

        const items = jsonData.map((row: any) => {
          // Mapper for primary search fields
          const findVal = (keys: string[]) => {
            for (const k of keys) {
              const exact = row[k];
              if (exact !== undefined && exact !== null && exact !== "") return String(exact).trim();
              const foundKey = Object.keys(row).find(rk => {
                const normalizedKey = rk.trim().toLowerCase().replace(/[\s_\-]/g, '');
                const normalizedMatch = k.toLowerCase().replace(/[\s_\-]/g, '');
                return normalizedKey === normalizedMatch;
              });
              if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== "") return String(row[foundKey]).trim();
            }
            return '';
          };

          // Basic extraction for Archival Engine indexing
          const dateClotureRaw = findVal(['date de cloture', 'date cloture', 'clôture', 'cloture', 'date fin', 'date_fin', 'fin']);
          const dateFin = formatExcelDate(dateClotureRaw);
          
          const ref = findVal(['réf', 'réference', 'reference', 'ref', 'c_refer']) || 'SANS_REF';
          const intitule = findVal(['intitulé', 'intitule', 'titre', 'désignation', 'designation', 'nom', 'objet', 'label']);

          // Create a cleaned row where all dates are converted (Intelligent conversion for start/end dates ONLY)
          const formattedRow: any = {};
          Object.entries(row).forEach(([k, v]) => {
            const lowerK = k.toLowerCase().replace(/[\s_\-]/g, '');
            // User requested conversion ONLY for "date début" and "date fin" related columns
            // This includes variations like "debut", "fin", "cloture"
            const isDateCol = lowerK.includes('debut') || lowerK.includes('fin') || lowerK.includes('cloture') || lowerK.includes('ouverture') || lowerK.includes('echeance');
            
            if (isDateCol) {
              formattedRow[k] = formatExcelDate(v);
            } else {
              formattedRow[k] = v;
            }
          });

          return {
            ...formattedRow, // Keep all dynamic fields
            id: self.crypto.randomUUID(),
            reference: ref,
            intitule: intitule || ref,
            direction: importingDirection,
            numBoite: findVal(['numéro boite', 'num boite', 'boite', 'boit', 'box', 'n_boite']),
            localisation: findVal(['localisation', 'emplacement', 'location', 'local', 'site']),
            dateDebut: formatExcelDate(findVal(['date debut', 'date début', 'debut', 'ouverture'])),
            dateFin: dateFin === '-' ? '' : dateFin,
            dateCloture: dateFin === '-' ? '' : dateFin,
            archivalStatus: 'SemiActive',
            dossier: findVal(['dossier', 'folder', 'n_dossier']),
            codeAgence: findVal(['code agence', 'agence', 'agency', 'code_agence']),
            sin: findVal(['sin', 'sinistre', 'claim', 'n_sinistre']),
            police: findVal(['police', 'policy', 'n_police', 'contrat']),
            adherant: findVal(['adhérant', 'adherent', 'member', 'nom_adherant', 'client']),
            dateDeclaration: findVal(['date declaration', 'declaration date', 'decla']),
            typeSinistre: findVal(['type sinistre', 'nature', 'produit', 'type']),
            etatSinistre: findVal(['etat sinistre', 'statut', 'status', 'etat']),
            paquet: findVal(['paquet', 'bundle', 'lot']),
            rawData: JSON.stringify(formattedRow) // Full original data in JSON
          };
        });

        setMappedItems(items);
        setImporting(false);
      } catch (err) {
        console.error("Import error:", err);
        alert("Erreur lors de la lecture du fichier. Assurez-vous qu'il s'agit d'un fichier Excel valide.");
        setImportStep('upload');
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const executeMassImport = async () => {
    if (mappedItems.length === 0) return;
    
    setImporting(true);
    setImportStep('importing');
    setImportProgress(0);

    try {
      const batchSize = 500;
      const totalBatches = Math.ceil(mappedItems.length / batchSize);
      let successCount = 0;

      for (let i = 0; i < totalBatches; i++) {
        const isFinalBatch = i === totalBatches - 1;
        const chunk = mappedItems.slice(i * batchSize, (i + 1) * batchSize);
        await api.post('/api/mass-inventory/import', { 
          items: chunk,
          filename: uploadedServerFilename || importFileName,
          direction: importingDirection,
          ruleId: importingRule,
          isFinalBatch,
          totalCount: mappedItems.length
        });
        successCount += chunk.length;
        setImportProgress(Math.round(((i + 1) / totalBatches) * 100));
      }

      alert(`Importation réussie : ${successCount} dossiers enregistrés et archivés dans le stockage sécurisé.`);
      setMassSubTab('view');
      setImportStep('upload');
      setImportPreviewData([]);
      setMappedItems([]);
      setUploadedServerFilename(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert(`Erreur lors de l'importation : ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const deleteMassItem = async (id: string) => {
    if (!confirm("Supprimer cet élément ?")) return;
    try {
      await api.delete(`/api/mass-inventory/${id}`);
      setMassInventory(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      alert("Erreur suppression");
    }
  };

  // Search for mass inventory
  useEffect(() => {
    if (activeTab !== 'massInventory' || massSubTab !== 'view') return;
    
    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await api.get(`/api/mass-inventory?search=${encodeURIComponent(massSearchTerm)}&direction=${encodeURIComponent(selectedDirection)}`);
        setMassInventory(results);
      } catch (err) {
        console.error("Search error:", err);
      }
    }, massSearchTerm ? 400 : 0); // No debounce for initial load or direction change only

    return () => clearTimeout(delayDebounceFn);
  }, [massSearchTerm, selectedDirection, activeTab, massSubTab]);

  const getRetentionRule = (item: any) => {
    // 1. Try exact reference match
    if (item.reference && ruleIndex[item.reference]) return ruleIndex[item.reference];
    
    // 2. Try partial match or heuristics
    const ruleByRef = Object.values(ruleIndex).find((r: any) => String(item.reference).includes(r.reference));
    if (ruleByRef) return ruleByRef;

    // 3. Direction fallback
    const directionData = RETENTION_CALENDAR.find(d => d.name === item.direction);
    return directionData?.rules[0] || null;
  };

  // Fetch history when history subtab is active
  useEffect(() => {
    if (activeTab === 'massInventory' && massSubTab === 'history') {
      api.get('/api/mass-inventory/history').then(setImportHistory).catch(console.error);
    }
  }, [activeTab, massSubTab]);

  const handleReturnInventoryImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportProgress(0);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Find the first sheet that is not empty
        let jsonData: any[] = [];
        let sheetFound = false;
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const dataFromSheet = XLSX.utils.sheet_to_json(sheet);
          if (dataFromSheet.length > 0) {
            jsonData = dataFromSheet;
            sheetFound = true;
            break;
          }
        }

        if (!sheetFound || jsonData.length === 0) {
          alert('Le fichier Excel est vide ou aucune feuille de données n\'a été trouvée.');
          return;
        }

        const items = jsonData.map((row: any) => {
          const findVal = (keys: string[]) => {
            for (const k of keys) {
              const exact = row[k];
              if (exact !== undefined) return String(exact).trim();
              const foundKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
              if (foundKey) return String(row[foundKey]).trim();
            }
            return '';
          };

          return {
            reference: findVal(['réference', 'reference', 'ref', 'c_refer']),
            numBoite: findVal(['num boite', 'boite', 'boit', 'num_boite']),
            localisation: findVal(['localisation', 'location', 'local', 'loc']),
          };
        }).filter(i => i.reference);

        // Send in batches of 200 (even safer)
        const batchSize = 200;
        const totalBatches = Math.ceil(items.length / batchSize);
        let successCount = 0;

        for (let i = 0; i < totalBatches; i++) {
          const start = i * batchSize;
          const end = Math.min(start + batchSize, items.length);
          const chunk = items.slice(start, end);
          
          try {
            await api.post('/api/returns/inventory/import', { items: chunk });
            successCount += chunk.length;
            setImportProgress(Math.round(((i + 1) / totalBatches) * 100));
          } catch (batchErr: any) {
            console.error(`Error in batch ${i}:`, batchErr);
            throw new Error(`Erreur au lot ${i+1}/${totalBatches}: ${batchErr.message}`);
          }
        }

        // Refresh
        const inv = await api.get('/api/returns/inventory');
        setReturnInventory(inv);
        alert(`${successCount} références importées avec succès.`);
      } catch (err: any) {
        console.error(err);
        alert("Erreur lors de l'importation: " + (err.response?.data?.error || err.message));
      } finally {
        setImporting(false);
        setImportProgress(0);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const performReturnSearch = () => {
    if (!returnSearchTerm) return;
    const found = returnInventory.find(i => 
      String(i.reference).toLowerCase() === returnSearchTerm.toLowerCase() ||
      String(i.numBoite).toLowerCase() === returnSearchTerm.toLowerCase()
    );
    setSearchResult(found || null);
    if (!found) alert("Référence non trouvée.");
  };

  const validatePhysicalReturn = async (item: any) => {
    try {
      const today = format(new Date(), 'dd/MM/yyyy');
      const todayTime = format(new Date(), 'dd/MM/yyyy HH:mm');
      const entry = {
        reference: item.reference,
        numBoite: item.numBoite,
        localisation: item.localisation,
        dateRetour: todayTime,
        barcodeData: `${item.numBoite}-${item.localisation}`
      };
      
      // 1. Record in History
      await api.post('/api/returns/history', entry);
      const hist = await api.get('/api/returns/history');
      setReturnHistory(hist);
      
      // 2. Synchronize with Communication Management
      const refToMatch = String(item.reference).trim().toLowerCase();
      
      // Update Agent Requests
      const agentMatches = requests.filter(r => 
        r.status === 'signed' && 
        (Array.isArray(r.references) ? r.references.some((ref: any) => String(ref).trim().toLowerCase() === refToMatch) : String(r.intitule).trim().toLowerCase() === refToMatch)
      );
      for (const r of agentMatches) {
        await api.patch(`/api/requests/${r.id}`, { status: 'returned', updatedAt: new Date().toISOString() });
      }
      if (agentMatches.length > 0) {
        setRequests(prev => prev.map(r => agentMatches.some(m => m.id === r.id) ? { ...r, status: 'returned' } : r));
      }

      // Update Remote Requests
      const remoteMatches = remoteRequests.filter(r => 
        r.status === 'Prêt / Communiqué' && 
        (Array.isArray(r.references) ? r.references.some((ref: any) => String(ref).trim().toLowerCase() === refToMatch) : String(r.intitule || r.motif).trim().toLowerCase() === refToMatch)
      );
      for (const r of remoteMatches) {
        await api.patch(`/api/remote-requests/${r.id}`, { status: 'Retourné', updatedAt: new Date().toISOString() });
      }
      if (remoteMatches.length > 0) {
        setRemoteRequests(prev => prev.map(r => remoteMatches.some(m => m.id === r.id) ? { ...r, status: 'Retourné' } : r));
      }

      // Update Archives
      const archiveMatches = archivedComms.filter(a => {
        if (a.dateRetour || a.status === 'Retourné') return false;
        const val = String(a.intitule || '').toLowerCase();
        return val.includes(refToMatch);
      });
      for (const a of archiveMatches) {
        await api.patch(`/api/archives/${a.id}`, { dateRetour: today, status: 'Retourné' });
      }
      if (archiveMatches.length > 0) {
        setArchivedComms(prev => prev.map(a => archiveMatches.some(m => m.id === a.id) ? { ...a, dateRetour: today, status: 'Retourné' } : a));
      }

      // Show label
      setValidatedItemLabel(entry);
      setSearchResult(null);
      setReturnSearchTerm('');
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la validation du retour et de la synchronisation.");
    }
  };

  const downloadLabel = async () => {
    if (!labelRef.current || !validatedItemLabel) return;
    try {
      const canvas = await html2canvas(labelRef.current, {
        scale: 3, // High quality for PDF
        backgroundColor: '#ffffff',
        useCORS: true
      });
      
      const imgData = canvas.toDataURL('image/png');
      
      // Dimensions: 52mm x 27mm
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [52, 27]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, 52, 27);
      pdf.save(`Etiquette_${validatedItemLabel.numBoite}_${validatedItemLabel.localisation.replace(/[/\\?%*:|"<>]/g, '-')}.pdf`);
    } catch (err) {
      console.error("Capture effort error:", err);
      alert("Erreur lors de la génération du PDF.");
    }
  };

  const printLabel = () => {
    window.print();
  };

  const deleteHistoryEntry = async (id: string) => {
    if (!confirm("Supprimer cette entrée de l'historique ?")) return;
    try {
      await api.delete(`/api/returns/history/${id}`);
      setReturnHistory(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      alert("Erreur lors de la suppression.");
    }
  };

  const downloadStoredFile = (filename: string) => {
    if (!filename) return;
    window.open(`/api/mass-inventory/download-file/${encodeURIComponent(filename)}`, '_blank');
  };

  const cleanRequests = React.useMemo(() => {
    const seen = new Set();
    return requests.filter(item => {
      const id = item.id || item.virtualId;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [requests]);

  const cleanRemoteRequests = React.useMemo(() => {
    const seen = new Set();
    return remoteRequests.filter(item => {
      const id = item.id || item.virtualId;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [remoteRequests]);

  const filteredRequests = React.useMemo(() => {
    let listToFilter = [];
    const dedup = (list: any[]) => {
      const seen = new Set();
      return list.filter(item => {
        const id = item.id || item.virtualId;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    };

    if (activeTab === 'requests') {
      let all = [];
      if (requestSubTab === 'transfers') {
        all = dedup(transferRequests);
      } else {
        all = dedup([...requests, ...remoteRequests]);
      }
      
      const archivedIds = new Set(archivedComms.filter(a => a.requestId).map(a => a.requestId));
      const active = all.filter(r => !archivedIds.has(r.id));

      if (requestSubTab === 'signed') {
        listToFilter = active.filter(r => r.status === 'signed' || r.status === 'Prêt / Communiqué');
      } else if (requestSubTab === 'transfers') {
        listToFilter = active;
      } else {
        listToFilter = active;
      }
      listToFilter.sort((a, b) => {
        const dateA = toSafeDate(a.createdAt)?.getTime() || 0;
        const dateB = toSafeDate(b.createdAt)?.getTime() || 0;
        return dateB - dateA;
      });
    } else if (activeTab === 'communication' || activeTab === 'returns') {
      const signedAgents = cleanRequests.filter((r: any) => r.status === 'signed');
      const communicatedRemote = cleanRemoteRequests.filter((r: any) => r.status === 'Prêt / Communiqué');
      
      const expandedLive: any[] = [];
      [...signedAgents, ...communicatedRemote].forEach(r => {
        const refs = Array.isArray(r.references) && r.references.length > 0 ? r.references : [r.intitule || '-'];
        refs.forEach((ref: string, idx: number) => {
          expandedLive.push({
            ...r,
            intitule: ref,
            virtualId: `live_${r.id}_${idx}`
          });
        });
      });

      const liveSourceIds = new Set([
        ...signedAgents.map((r: any) => r.id),
        ...communicatedRemote.map((r: any) => r.id)
      ]);

      const uniqueArchives = archivedComms.filter(a => !a.requestId || !liveSourceIds.has(a.requestId));
      
      const expandedArchives: any[] = [];
      uniqueArchives.forEach((a, aIdx) => {
        const val = String(a.intitule || '');
        const [refsPart, boitePart] = val.split(' / ');
        const individualRefs = refsPart.split(/[;,]/).map(s => s.trim()).filter(Boolean);
        
        if (individualRefs.length > 1) {
          individualRefs.forEach((ref, rIdx) => {
            expandedArchives.push({
              ...a,
              intitule: boitePart ? `${ref} / ${boitePart}` : ref,
              virtualId: `arc_exp_${a.id || aIdx}_${rIdx}`
            });
          });
        } else {
          expandedArchives.push({
            ...a,
            virtualId: a.id?.startsWith('arc_') ? a.id : `arc_${a.id || aIdx}`
          });
        }
      });
      
      listToFilter = [...expandedLive, ...expandedArchives];

      if (activeTab === 'returns') {
        listToFilter = listToFilter.filter(item => !item.dateRetour || item.dateRetour === '');
      }

      listToFilter.sort((a, b) => {
        const dateA = toSafeDate(a.updatedAt || a.createdAt)?.getTime() || 0;
        const dateB = toSafeDate(b.updatedAt || b.createdAt)?.getTime() || 0;
        return dateB - dateA;
      });
    }

    let result = listToFilter;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r => {
        const title = r.title || r.intitule || r.motif || '';
        const requester = r.requesterName || r.nomDemandeur || r.nom || '';
        const specificRef = String(r.intitule || '');
        return (
          String(title).toLowerCase().includes(term) ||
          String(requester).toLowerCase().includes(term) ||
          specificRef.toLowerCase().includes(term)
        );
      });
    }

    if (filterStatus !== 'all') {
      if (activeTab === 'communication' || activeTab === 'returns') {
        if (filterStatus === 'Retourné') {
          result = result.filter(r => r.status === 'Retourné' || !!r.dateRetour);
        } else if (filterStatus === 'En cours') {
          result = result.filter(r => r.status !== 'Retourné' && !r.dateRetour);
        }
      } else {
        result = result.filter(r => r.status === filterStatus);
      }
    }

    return result.slice(0, 500); 
  }, [searchTerm, filterStatus, requests, remoteRequests, archivedComms, activeTab, requestSubTab, cleanRequests, cleanRemoteRequests]);


  const stats = {
    total: requests.length,
    remote: remoteRequests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    signed: requests.filter(r => r.status === 'signed').length,
    today: requests.filter(r => {
      const date = toSafeDate(r.createdAt);
      return date && isSameDay(date, new Date());
    }).length
  };

  const archivalByDirection = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    archivalDirectory.forEach(rule => {
      const dirName = rule.direction || "Non spécifié";
      if (!groups[dirName]) groups[dirName] = [];
      groups[dirName].push(rule);
    });
    return Object.entries(groups).map(([name, rules]) => ({
      name,
      rules,
      code: name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 4)
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [archivalDirectory]);

  const handleClearDirectory = async () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer TOUTES les règles du calendrier de conservation ? Les dossiers liés perdront leur lien avec ces règles. Cette action est irréversible.")) return;
    
    setIsClearingDirectory(true);
    try {
      await api.post('/api/archival-directory/clear', {});
      setArchivalDirectory([]);
      await Promise.all([
        fetchArchivalDirectory(),
        fetchArchivalMonitoring()
      ]);
      alert("Le calendrier de conservation a été vidé et les statuts de dossiers ont été réinitialisés.");
    } catch (err: any) {
      console.error("Clear directory error:", err);
      alert(`Erreur lors de la suppression: ${err.message || "Erreur inconnue"}`);
    } finally {
      setIsClearingDirectory(false);
    }
  };

  const handleClearEliminationHistory = async () => {
    if (!confirm("Voulez-vous supprimer TOUTES les demandes d'élimination (en attente et archivées) ?")) return;
    
    try {
      await api.delete('/api/elimination-requests/clear-all');
      setEliminationRequests([]);
      setEligibleItems([]);
      await fetchEliminationData();
      alert("L'historique des éliminations a été vidé.");
    } catch (err: any) {
      alert("Erreur lors de la suppression de l'historique.");
    }
  };

  const handlePDFImportSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingRules(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        try {
          const rules = await extractArchivalRulesFromPDF(base64);
          if (rules && rules.length > 0) {
            await api.post('/api/archival-directory/import', { entries: rules });
            const data = await api.get('/api/archival-directory');
            setArchivalDirectory(data);
            alert(`${rules.length} règles extraites et importées avec succès.`);
          } else {
            alert("Aucune règle n'a pu être extraite du PDF.");
          }
        } catch (err) {
          console.error("Gemini PDF error:", err);
          alert("Erreur lors de l'analyse du PDF par l'IA.");
        } finally {
          setIsImportingRules(false);
          if (pdfInputRef.current) pdfInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("File reading error:", err);
      alert("Erreur lors de la lecture du fichier.");
      setIsImportingRules(false);
    }
  };

  const syncRetentionCalendar = async () => {
    try {
      const entries: any[] = [];
      RETENTION_CALENDAR.forEach(dir => {
        dir.rules.forEach(rule => {
          entries.push({
            reference: rule.reference,
            title: rule.title,
            direction: dir.name,
            activeYears: parseInt(rule.active) || 0,
            semiActiveYears: parseInt(rule.semiActive) || 0,
            finalDisposition: rule.finalDisposition
          });
        });
      });

      await api.post('/api/archival-directory/import', { entries });
      const data = await api.get('/api/archival-directory');
      setArchivalDirectory(data);
      alert(`${entries.length} règles de conservation ont été archivées avec succès.`);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la synchronisation du calendrier.");
    }
  };

  const handleExportCalendarPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const title = "CALENDRIER DE CONSERVATION DES ARCHIVES";
    const date = format(new Date(), 'dd/MM/yyyy HH:mm');
    
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text(title, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Généré le ${date}`, 14, 28);

    const tableData = archivalDirectory
      .filter(r => selectedCalendarDir === null || r.direction === selectedCalendarDir)
      .map(r => [
        r.reference,
        r.title,
        r.direction,
        r.category || 'Général',
        `${r.activeYears} ans`,
        `${r.semiActiveYears} ans`,
        r.finalDisposition === 'EL' ? 'Élimination' : r.finalDisposition === 'CP' ? 'Cons. Permanente' : 'Échantillonnage',
        r.isCritical ? 'OUI' : 'NON'
      ]);

    autoTable(doc, {
      startY: 35,
      head: [['Réf', 'Intitulé Documentaire', 'Direction', 'Catégorie', 'DUA', 'Semi-Actif', 'Sort Final', 'Critique']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 40 },
        3: { cellWidth: 25 },
        4: { cellWidth: 15 },
        5: { cellWidth: 15 },
        6: { cellWidth: 30 },
        7: { cellWidth: 15 }
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 7 && data.cell.raw === 'OUI') {
          doc.setTextColor(220, 38, 38);
        }
      }
    });

    doc.save(`calendrier_conservation_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleAIClassification = async (item: any) => {
    try {
      setIsImportingRules(true);
      const result = await suggestRetentionRule(item.intitule, item.direction, archivalDirectory);
      setIsImportingRules(false);

      if (result.match) {
        if (confirm(`Lien trouvé : ${result.reference} - ${result.title}\nConservation : ${result.retention}\nConfiance : ${Math.round(result.confidence * 100)}%\nVoulez-vous appliquer cette règle ?`)) {
          await api.patch(`/api/mass-inventory/${item.id}`, { reference: result.reference });
          setMassInventory(prev => prev.map(i => i.id === item.id ? { ...i, reference: result.reference } : i));
        }
      } else {
        alert("L'IA n'a pas pu identifier de règle précise pour ce dossier.");
      }
    } catch (error) {
      setIsImportingRules(false);
      console.error(error);
    }
  };

  const handleUpdateTransferStatus = async (reqId: string, newStatus: string) => {
    try {
      await api.patch(`/api/transfer-requests/${reqId}`, { status: newStatus });
      setTransferRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus } : r));
      alert("Statut de transfert mis à jour.");
    } catch (err) {
      alert("Erreur lors de la mise à jour.");
    }
  };

  const handleUpdateRemoteStatus = async (reqId: string, newStatus: string, email: string, name: string) => {
    try {
      await api.patch(`/api/remote-requests/${reqId}`, {
        status: newStatus,
        updatedBy: 'Administrator'
      });

      // Refresh data
      const remoteReqs = await api.get('/api/remote-requests');
      setRemoteRequests(remoteReqs);

      // Notification email simulation
      let message = "";
      if (newStatus === 'En cours') message = "Votre demande est en cours de traitement.";
      if (newStatus === 'Prêt / Communiqué') message = "Votre dossier est prêt et disponible.";
      if (newStatus === 'Refusé') message = "Votre dossier est malheureusement indisponible ou la demande a été refusée.";
      
      if (message) {
        await api.post('/api/send-email', { 
          to: email, 
          subject: `Mise à jour demande d'archives - ${newStatus}`, 
          html: `<p>Bonjour ${name},</p><p>${message}</p>` 
        });
      }
    } catch (err) {
      console.error(err);
      alert("Erreur mise à jour");
    }
  };

  const handleReturn = async (req: any) => {
    const today = format(new Date(), 'dd/MM/yyyy');
    const todayTime = format(new Date(), 'dd/MM/yyyy HH:mm');
    const originalId = req.id;
    const isArchive = req.virtualId?.includes('_arc_') || !req.status || req.isImported;
    const isRemote = remoteRequests.some(r => r.id === originalId);
    const isAgent = requests.some(r => r.id === originalId);

    try {
      // 1. Update Status in Communication
      if (isArchive) {
        await api.patch(`/api/archives/${originalId}`, { dateRetour: today, status: 'Retourné' });
        setArchivedComms(prev => prev.map(a => a.id === originalId ? { ...a, dateRetour: today, status: 'Retourné' } : a));
      } else if (isRemote) {
        await api.patch(`/api/remote-requests/${originalId}`, { status: 'Retourné', updatedAt: new Date().toISOString() });
        setRemoteRequests(prev => prev.map(r => r.id === originalId ? { ...r, status: 'Retourné' } : r));
      } else if (isAgent) {
        await api.patch(`/api/requests/${originalId}`, { status: 'returned', updatedAt: new Date().toISOString() });
        setRequests(prev => prev.map(r => r.id === originalId ? { ...r, status: 'returned' } : r));
      }

      // 2. Automatically Record in History if reference is found in inventory
      // Attempt to extract reference from intitule (can be 'REF' or 'REF / BOITE')
      const rawRef = String(req.intitule || req.motif || '').split(' / ')[0].trim().toLowerCase();
      const invItem = returnInventory.find(i => String(i.reference).trim().toLowerCase() === rawRef);
      
      if (invItem) {
        await api.post('/api/returns/history', {
          reference: invItem.reference,
          numBoite: invItem.numBoite,
          localisation: invItem.localisation,
          dateRetour: todayTime,
          barcodeData: `${invItem.numBoite}-${invItem.localisation}`
        });
        const hist = await api.get('/api/returns/history');
        setReturnHistory(hist);
      }

      alert("Retour validé avec succès.");
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la validation du retour.");
    }
  };

  const handleDelete = async (id: string) => {
    let endpoint = "";
    if (activeTab === 'requests') {
      const isAgent = requests.some(r => r.id === id);
      endpoint = isAgent ? '/api/requests' : '/api/remote-requests';
    } else if (activeTab === 'communication' || activeTab === 'returns') {
      const isArchive = archivedComms.some(c => c.id === id);
      if (isArchive) {
        endpoint = '/api/archives';
      } else {
        const isRemote = remoteRequests.some(r => r.id === id);
        endpoint = isRemote ? '/api/remote-requests' : '/api/requests';
      }
    }

    if (window.confirm('Etes-vous sûr de vouloir supprimer cette demande ?')) {
      try {
        await api.delete(`${endpoint}/${id}`);
        // Refresh local states
        if (endpoint === '/api/requests') {
          setRequests(prev => prev.filter(r => r.id !== id));
        } else if (endpoint === '/api/remote-requests') {
          setRemoteRequests(prev => prev.filter(r => r.id !== id));
        } else if (endpoint === '/api/archives') {
          setArchivedComms(prev => prev.filter(r => r.id !== id));
        }
      } catch (err: any) {
        alert("Erreur suppression: " + err.message);
      }
    }
  };

  const startEdit = (req: any) => {
    setEditingId(req.id);
    setEditForm({ ...req });
  };

  const handleUpdate = async () => {
    if (!editingId || !editForm) return;
    try {
      const { id, ...data } = editForm;
      await api.patch(`/api/requests/${editingId}`, data);
      setEditingId(null);
      setEditForm(null);
      
      // Refresh
      const reqs = await api.get('/api/requests');
      setRequests(reqs);
    } catch (err) {
      alert('La mise à jour a échoué');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportProgress(0);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const dataArray = event.target?.result;
        const workbook = XLSX.read(dataArray, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (!data || data.length === 0) {
          alert('Le fichier Excel est vide.');
          setImporting(false);
          return;
        }

        const shouldReplace = window.confirm(`Vous allez importer ${data.length} lignes. Voulez-vous TOUT REMPLACER l'historique actuel par ce fichier ?\n\n(OK = Tout effacer et remplacer, Annuler = Ajouter à la suite)`);

        if (shouldReplace) {
          await api.post('/api/archives/clear', {});
        }

        // Improved mapping to match user provided image headers
        const items = data.map(row => {
          const findVal = (keys: string[]) => {
            for (const k of keys) {
              const exact = row[k];
              if (exact !== undefined) return exact;
              // Check case-insensitive and trimmed
              const foundKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
              if (foundKey) return row[foundKey];
            }
            return undefined;
          };

          const parseDate = (val: any) => {
            if (!val) return null;
            if (val instanceof Date) return val.toISOString();
            if (typeof val === 'number') {
              try {
                const d = XLSX.SSF.parse_date_code(val);
                return new Date(d.y, d.m - 1, d.d).toISOString();
              } catch (e) {
                return null;
              }
            }
            if (typeof val === 'string') {
              const cleaned = val.trim();
              if (cleaned.includes('/')) {
                const parts = cleaned.split('/');
                if (parts.length === 3) {
                  // Assume DD/MM/YYYY
                  const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
                  if (!isNaN(d.getTime())) return d.toISOString();
                }
              }
              const d = new Date(cleaned);
              if (!isNaN(d.getTime())) return d.toISOString();
            }
            return null;
          };

          const dateDemandeVal = findVal(['date de la demande', 'Date demande', 'date_demande']);
          const createdAtStr = parseDate(dateDemandeVal) || new Date().toISOString();

          return {
            intitule: findVal(['REF / BOITE', 'REF/BOITE', 'Intitule', 'Titre', 'motif', 'Demande']) || 'Sans titre',
            nomDemandeur: findVal(['nom de demandeur', 'nom_de_demandeur', 'Demandeur', 'Nom', 'Nom Demandeur']) || 'Importé',
            email: findVal(['Email', 'email', 'Email Demandeur']) || '-',
            service: findVal(['Service', 'service']) || '-',
            reference: findVal(['Référence', 'Reference', 'References', 'references']) || '-',
            dateDemande: parseDate(dateDemandeVal),
            dateCommunication: parseDate(findVal(['date de communication', 'date_communication', 'Date Comm'])),
            dateRetour: String(findVal(['date de retour', 'date_retour', 'Retour']) || ''),
            status: findVal(['date de retour', 'date_retour', 'Retour']) ? 'Retourné' : 'Importé / Historique',
            isImported: true,
            createdAt: createdAtStr
          };
        });

        // Batch upload to handle large files (e.g. 11,000 lines)
        const batchSize = 200; // Smaller batches are safer for proxy/WAF limits
        const totalBatches = Math.ceil(items.length / batchSize);
        let successCount = 0;
        
        for (let i = 0; i < totalBatches; i++) {
          const start = i * batchSize;
          const end = Math.min(start + batchSize, items.length);
          const chunk = items.slice(start, end);
          
          try {
            await api.post('/api/archives/batch', { items: chunk });
            successCount += chunk.length;
            
            // Small delay to prevent server overload and give proxy time to breathe
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (err: any) {
            console.error(`Error importing batch ${i + 1}:`, err);
            // If it's a 403 or server error, wait a bit longer and try one more time
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              await api.post('/api/archives/batch', { items: chunk });
              successCount += chunk.length;
            } catch (innerErr) {
              if (!window.confirm(`Erreur au lot ${i + 1}. Voulez-vous continuer malgré tout?`)) {
                break;
              }
            }
          }
          
          const progress = Math.round(((i + 1) / totalBatches) * 100);
          setImportProgress(progress);
        }
        
        alert(`Importation terminée: ${successCount} éléments importés.`);
        
        // Refresh
        const archives = await api.get('/api/archives');
        setArchivedComms(archives);

        alert(`Importation réussie : ${data.length} lignes importées.`);
      } catch (err) {
        console.error('Import error:', err);
        alert('Erreur lors de l\'importation du fichier Excel.');
      } finally {
        setImporting(false);
        setImportProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportToExcel = () => {
    const dataToExport = filteredRequests.map(req => ({
      'ID': req.id,
      'Type': req.references ? 'Agent' : 'Distance',
      'Titre/Motif': req.title || req.intitule || req.motif,
      'Demandeur': req.requesterName || req.nomDemandeur || req.nom,
      'Email': req.requesterEmail || req.emailDemandeur || req.email,
      'Service': req.service || '-',
      'Références': Array.isArray(req.references) ? req.references.join(', ') : req.reference,
      'Date Création': toSafeDate(req.createdAt) ? format(toSafeDate(req.createdAt)!, 'dd/MM/yyyy HH:mm') : '-',
      'Dernière Mise à jour': toSafeDate(req.updatedAt) ? format(toSafeDate(req.updatedAt)!, 'dd/MM/yyyy HH:mm') : '-',
      'Statut': req.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Communications");
    
    // Set column widths
    const maxWidths = [
      { wch: 15 }, { wch: 10 }, { wch: 30 }, { wch: 25 }, { wch: 30 }, 
      { wch: 20 }, { wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 15 }
    ];
    worksheet['!cols'] = maxWidths;

    XLSX.writeFile(workbook, `Gestion_Communication_${format(new Date(), 'dd_MM_yyyy')}.xlsx`);
  };

  const handleRequestElimination = async () => {
    if (selectedForElimination.length === 0) return;
    if (!confirm(`Voulez-vous soumettre ces ${selectedForElimination.length} dossiers à la commission d'élimination ?`)) return;

    try {
      await api.post('/api/elimination-requests', { inventoryIds: selectedForElimination });
      alert("Demande d'élimination soumise avec succès.");
      setSelectedForElimination([]);
      const elims = await api.get('/api/elimination-requests');
      setEliminationRequests(elims);
    } catch (err) {
      alert("Erreur lors de la soumission de la demande.");
    }
  };

  const handleRunAnalysis = async () => {
    setIsSearchingLoc(true);
    try {
      const res = await api.post('/api/elimination/analyze', {});
      alert(`${res.updatedCount} dossiers ont été analysés et mis à jour selon le calendrier de conservation.`);
      fetchEliminationData();
    } catch (err) {
      alert("Erreur lors de l'analyse.");
    } finally {
      setIsSearchingLoc(false);
    }
  };

  const generateEliminationBordereau = (items: any[], type: 'Proposition' | 'PV') => {
    const doc = new jsPDF();
    const today = format(new Date(), 'dd/MM/yyyy');
    
    // Header
    doc.setFontSize(20);
    doc.text(`MAE - GESTION DES ARCHIVES`, 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`${type.toUpperCase()} D'ÉLIMINATION DES DOCUMENTS`, 105, 30, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Date de génération : ${today}`, 105, 38, { align: 'center' });
    
    doc.line(20, 45, 190, 45);
    
    // Summary
    doc.setFontSize(11);
    doc.text(`Nombre total de dossiers : ${items.length}`, 20, 55);
    doc.text(`Période concernée : Jusqu'à ${new Date().getFullYear()}`, 20, 62);
    
    // Group by Direction for summary
    const byDir: Record<string, number> = {};
    items.forEach(i => {
      byDir[i.direction] = (byDir[i.direction] || 0) + 1;
    });
    
    let y = 75;
    doc.setFontSize(12);
    doc.text("Répartition par Direction :", 20, y);
    y += 8;
    doc.setFontSize(10);
    Object.entries(byDir).forEach(([dir, count]) => {
      doc.text(`• ${dir} : ${count} dossier(s)`, 25, y);
      y += 6;
    });

    // Table of items
    const tableData = items.map(i => [
      i.reference || '-',
      i.intitule || '-',
      i.direction || '-',
      i.dateFin || '-',
      i.localisation || '-',
      i.numBoite || '-'
    ]);

    autoTable(doc, {
      startY: y + 10,
      head: [['Réf.', 'Intitulé', 'Direction', 'Date Fin', 'Loc.', 'Boîte']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38], textColor: 255 },
      styles: { fontSize: 8 },
      margin: { top: 20 }
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text("L'Archiviste", 40, finalY);
    doc.text("Le Responsable Hiérarchique", 130, finalY);
    
    doc.save(`${type}_Elimination_${today.replace(/\//g, '-')}.pdf`);
  };

  const handleBulkPropose = async () => {
    if (selectedForElimination.length === 0) {
      alert("Veuillez sélectionner au moins un dossier.");
      return;
    }
    try {
      await api.post('/api/elimination/propose-bulk', { inventoryIds: selectedForElimination });
      alert(`${selectedForElimination.length} alertes validées et déplacées vers Proposition Élimination.`);
      setSelectedForElimination([]);
      fetchEliminationData();
      setEliminationSubTab('proposal');
    } catch (err) {
      alert("Erreur lors de la soumission groupée.");
    }
  };

  const handleValidatePV = async () => {
    const pendingRequests = eliminationRequests.filter(r => r.status === 'Pending').map(r => r.id);
    if (pendingRequests.length === 0) return;
    
    if (!window.confirm(`Voulez-vous valider le PV d'élimination pour ${pendingRequests.length} documents ?\nLes documents seront archivés dans l'historique et ne seront plus affichés dans la base active.`)) return;

    try {
      await api.post('/api/elimination/validate-pv', { requestIds: pendingRequests });
      fetchEliminationData();
      setEliminationSubTab('history');
      alert("PV d'élimination validé avec succès.");
    } catch (err) {
      alert("Erreur lors de la validation du PV.");
    }
  };

  const handleRemoveFromPV = async (requestId: string) => {
    if (!window.confirm("Retirer ce document de la proposition d'élimination ?")) return;
    try {
      await api.delete(`/api/elimination-requests/${requestId}`);
      fetchEliminationData();
    } catch (err) {
      alert("Erreur lors du retrait du document.");
    }
  };

  const eligibleByDirection = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    eligibleItems.forEach(item => {
      const dir = item.direction || "AUTRES";
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(item);
    });
    return Object.entries(groups).map(([name, items]) => ({ name, items }));
  }, [eligibleItems]);

  return (
    <div className="space-y-8">
      <div className="flex p-1 bg-brand-secondary border border-slate-200 rounded-2xl shadow-sm w-full overflow-x-auto">
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all relative ${activeTab === 'requests' ? 'bg-brand-primary text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Inbox size={18} />
          Demandes reçues
          {(requests.filter(r => r.status === 'pending').length + remoteRequests.filter(r => r.status === 'En attente').length + transferRequests.filter(r => r.status === 'En attente').length) > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-accent text-white text-[10px] rounded-full flex items-center justify-center border-2 border-white animate-pulse">
              {requests.filter(r => r.status === 'pending').length + remoteRequests.filter(r => r.status === 'En attente').length + transferRequests.filter(r => r.status === 'En attente').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('communication')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'communication' ? 'bg-brand-primary text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <FileSpreadsheet size={18} />
          Gestion de communication
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'returns' ? 'bg-brand-primary text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <RotateCcw size={18} />
          Gestion des retours
        </button>
        <button
          onClick={() => setActiveTab('massInventory')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'massInventory' ? 'bg-brand-primary text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Library size={18} />
          Gestion des inventaires
        </button>
        <button
          onClick={() => setActiveTab('elimination')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'elimination' ? 'bg-brand-accent text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Trash2 size={18} />
          Gestion d'élimination
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'stats' ? 'bg-brand-primary text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <BarChart3 size={18} />
          Statistiques
        </button>
      </div>

      {activeTab === 'stats' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              label="Communications" 
              value={fullStats?.totals?.communications || 0} 
              icon={<Users size={24} className="text-brand-primary" />} 
              subLabel="Dossiers signés"
            />
            <StatCard 
              label="Transferts" 
              value={fullStats?.totals?.transfers || 0} 
              icon={<FileStack size={24} className="text-brand-accent" />} 
              subLabel="Dossiers importés"
            />
            <StatCard 
              label="Retours" 
              value={fullStats?.totals?.returns || 0} 
              icon={<RotateCcw size={24} className="text-brand-primary" />} 
              subLabel="Dossiers réintégrés"
            />
            <StatCard 
              label="Éliminations" 
              value={fullStats?.totals?.eliminations || 0} 
              icon={<Trash2 size={24} className="text-red-500" />} 
              subLabel="Dossiers détruits"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Volume d'Activité Mensuel</h3>
                  <p className="text-sm text-slate-500">Communications signées vs Transferts</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <BarChart3 className="text-slate-400" size={20} />
                </div>
              </div>
              
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fullStats?.monthly || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      cursor={{ fill: '#f8fafc' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar name="Communications" dataKey="communications" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar name="Transferts" dataKey="transfers" fill="#f97316" radius={[4, 4, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Flux de Vie des Archives</h3>
                  <p className="text-sm text-slate-500">Retours et Éliminations mensuels</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <TrendingUp className="text-slate-400" size={20} />
                </div>
              </div>
              
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fullStats?.monthly || []}>
                    <defs>
                      <linearGradient id="colorReturns" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorElims" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#94a3b8' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Area type="monotone" name="Retours" dataKey="returns" stroke="#22c55e" fillOpacity={1} fill="url(#colorReturns)" strokeWidth={3} />
                    <Area type="monotone" name="Éliminations" dataKey="eliminations" stroke="#ef4444" fillOpacity={1} fill="url(#colorElims)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-6 bg-slate-900 text-white border-none shadow-2xl flex flex-col justify-between overflow-hidden relative group">
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-2">Santé du Système</h3>
              <div className="flex items-center gap-2 text-brand-primary text-sm font-bold bg-brand-primary/10 w-fit px-3 py-1 rounded-full border border-brand-primary/20 mb-6">
                <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" />
                Tableau de bord synchronisé
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Moyenne signature</p>
                  <p className="text-3xl font-black">{Math.round((fullStats?.totals?.communications / 12) || 0)} / mois</p>
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Flux transferts</p>
                  <p className="text-3xl font-black">{Math.round((fullStats?.totals?.transfers / 12) || 0)} / mois</p>
                </div>
                <div>
                   <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Dernière mise à jour</p>
                   <p className="text-3xl font-black">{format(new Date(), 'HH:mm')}</p>
                </div>
                <div className="flex items-end">
                   <p className="text-slate-400 text-xs italic">
                     Données consolidées basées sur les archives numériques et physiques.
                   </p>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:scale-110 transition-transform duration-500">
              <BarChart3 size={200} />
            </div>
          </Card>
        </motion.div>
      )}

      {/* Import Progress Overlay */}
      <AnimatePresence>
        {importing && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center space-y-6"
            >
              <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto animate-pulse">
                <FileSpreadsheet size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-800">Importation en cours...</h3>
                <p className="text-slate-500 text-sm">Veuillez ne pas fermer cette fenêtre</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <motion.div 
                  className="bg-blue-600 h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${importProgress}%` }}
                />
              </div>
              <p className="text-brand-primary font-bold">{importProgress}% complété</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {activeTab === 'returns' && (
        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 mb-6">
          <div className="flex flex-wrap gap-2 mb-8 bg-slate-50 p-1.5 rounded-2xl w-fit">
            <button
              onClick={() => { setReturnSubTab('search'); setSearchResult(null); }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${returnSubTab === 'search' ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Search size={16} /> RECHERCHE
            </button>
            <button
              onClick={() => setReturnSubTab('import')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${returnSubTab === 'import' ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <FileSpreadsheet size={16} /> IMPORTATION
            </button>
            <button
              onClick={() => setReturnSubTab('history')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${returnSubTab === 'history' ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Clock size={16} /> HISTORIQUE
            </button>
            <button
              onClick={() => setReturnSubTab('inventory')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${returnSubTab === 'inventory' ? 'bg-white text-brand-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Inbox size={16} /> INVENTAIRE
            </button>
          </div>

          <AnimatePresence mode="wait">
            {returnSubTab === 'import' && (
              <motion.div
                key="import"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50"
              >
                <div className="bg-white p-4 rounded-full shadow-md mb-4">
                  <FileSpreadsheet size={32} className="text-brand-primary" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Importation de masse</h3>
                <p className="text-slate-500 text-sm mb-6 max-w-sm text-center">
                  Importez vos références depuis un fichier Excel contenant les colonnes : 
                  <span className="font-bold text-slate-700"> réference, num boite, localisation</span>.
                </p>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleReturnInventoryImport}
                  className="hidden"
                  id="return-import-file"
                />
                <label
                  htmlFor="return-import-file"
                  className="cursor-pointer bg-brand-primary text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-brand-primary/20 hover:opacity-90 transition-all flex items-center gap-2"
                >
                  <Download size={18} /> Sélectionner le fichier Excel
                </label>
                <p className="mt-4 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                  {returnInventory.length} références actuellement en inventaire
                </p>
              </motion.div>
            )}

            {returnSubTab === 'search' && (
              <motion.div
                key="search"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="max-w-2xl mx-auto flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <Input
                      placeholder="Scannez ou saisissez la référence..."
                      className="pl-12 py-6 text-lg rounded-2xl shadow-sm border-slate-200 focus:ring-brand-primary"
                      value={returnSearchTerm}
                      onChange={(e) => setReturnSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && performReturnSearch()}
                    />
                  </div>
                  <Button 
                    className="px-8 bg-brand-primary hover:opacity-90 rounded-2xl text-lg shadow-lg shadow-brand-primary/20"
                    onClick={performReturnSearch}
                  >
                    RECHERCHER
                  </Button>
                </div>

                {searchResult && !validatedItemLabel && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md mx-auto bg-slate-50 border border-slate-100 rounded-3xl p-8 text-center"
                  >
                    <div className="mb-6 p-1 bg-white rounded-lg shadow-sm inline-block relative overflow-hidden" style={{ width: '52mm', height: '27mm', boxSizing: 'border-box', padding: '4pt' }}>
                      <div className="absolute top-1 right-1 text-[6px] font-black text-slate-400">MAE</div>
                      <div className="flex flex-col items-center justify-center h-full">
                        <Barcode 
                          value={`${searchResult.numBoite.replace(/^SIN\.C-?/i, '').replace(/^\.+/, '')}-${searchResult.localisation.replace(/^\d{4}-?/i, '').replace(/^\.+/, '')}`} 
                          width={1.2}
                          height={30}
                          format="CODE128"
                          displayValue={false}
                          margin={0}
                        />
                        <div className="mt-2 text-[10pt] font-black text-slate-800 tracking-tighter uppercase leading-none mb-[3mm]">
                          {searchResult.numBoite.replace(/^SIN\.C-?/i, '').replace(/^\.+/, '')}-{searchResult.localisation.replace(/^\d{4}-?/i, '').replace(/^\.+/, '')}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-8">
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Boîte N°</span>
                        <span className="text-xl font-black text-slate-800">{searchResult.numBoite.replace(/^SIN\.C-?/i, '').replace(/^\.+/, '')}</span>
                      </div>
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Localisation</span>
                        <span className="text-xl font-black text-slate-800">{searchResult.localisation.replace(/^\d{4}-?/i, '').replace(/^\.+/, '')}</span>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-8">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Référence</span>
                      <span className="text-lg font-bold text-slate-700">{searchResult.reference}</span>
                    </div>

                    <Button 
                      className="w-full py-4 bg-brand-primary hover:opacity-90 rounded-2xl text-lg font-black shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2"
                      onClick={() => validatePhysicalReturn(searchResult)}
                    >
                      <RotateCcw size={20} />
                      VALIDER LE RETOUR
                    </Button>
                  </motion.div>
                )}

                {validatedItemLabel && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-xl mx-auto space-y-6"
                  >
                    <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-3xl p-6 text-center">
                      <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle2 size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-brand-primary">Retour validé avec succès !</h3>
                      <p className="text-brand-primary/80 text-sm">Vous pouvez maintenant imprimer ou télécharger l'étiquette.</p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-3xl p-10 flex flex-col items-center">
                      <div 
                        ref={labelRef} 
                        id="printable-label"
                        className="bg-white shadow-sm flex flex-col items-center relative"
                        style={{ 
                          width: '52mm', 
                          height: '27mm', 
                          boxSizing: 'border-box',
                          padding: '4pt'
                        }}
                      >
                        {/* Top corner text like the image */}
                        <div className="absolute top-1 right-1 text-[6pt] font-black tracking-tight">
                          MAE
                        </div>

                        <div className="flex-1 flex items-center justify-center w-full mt-2">
                          <Barcode 
                            value={`${validatedItemLabel.numBoite.replace(/^SIN\.C-?/i, '').replace(/^\.+/, '')}-${validatedItemLabel.localisation.replace(/^\d{4}-?/i, '').replace(/^\.+/, '')}`} 
                            width={1.4}
                            height={40}
                            format="CODE128"
                            margin={0}
                            displayValue={false}
                          />
                        </div>

                        <div className="w-full flex items-center justify-center pt-1 mb-[3mm]">
                          <span className="text-[14pt] font-black text-black tracking-tighter uppercase leading-none">
                            {validatedItemLabel.numBoite.replace(/^SIN\.C-?/i, '').replace(/^\.+/, '')}-{validatedItemLabel.localisation.replace(/^\d{4}-?/i, '').replace(/^\.+/, '')}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-3 mt-8 w-full print:hidden">
                        <Button 
                          className="flex-1 bg-slate-800 hover:bg-slate-900 rounded-2xl h-14 font-black flex items-center justify-center gap-2"
                          onClick={() => {
                            setValidatedItemLabel(null);
                            setReturnSearchTerm('');
                          }}
                        >
                          NOUVELLE RECHERCHE
                        </Button>
                        <Button 
                          variant="outline"
                          className="flex-1 border-slate-200 hover:bg-slate-50 rounded-2xl h-14 font-black flex items-center justify-center gap-2"
                          onClick={downloadLabel}
                        >
                          <Download size={20} /> TELECHARGER
                        </Button>
                        <Button 
                          className="flex-1 bg-brand-primary hover:opacity-90 rounded-2xl h-14 font-black flex items-center justify-center gap-2"
                          onClick={printLabel}
                        >
                          <Printer size={20} /> IMPRIMER
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {returnSubTab === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Référence</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Boîte N°</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Localisation</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Code-barre</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Date Retour</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {returnHistory.map((h: any) => (
                        <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-slate-700">{h.reference}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-600">{h.numBoite.replace(/^SIN\.C-?/i, '').replace(/^\.+/, '')}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-600">{h.localisation.replace(/^\d{4}-?/i, '').replace(/^\.+/, '')}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="inline-block bg-white p-1 rounded border border-slate-100">
                              <Barcode 
                                value={`${h.numBoite.replace(/^SIN\.C-?/i, '').replace(/^\.+/, '')}-${h.localisation.replace(/^\d{4}-?/i, '').replace(/^\.+/, '')}`} 
                                width={1.0}
                                height={25}
                                format="CODE128"
                                margin={0}
                                displayValue={false}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-500 text-center">{h.dateRetour}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1">
                              <button 
                                onClick={() => { setValidatedItemLabel(h); setReturnSubTab('search'); }}
                                className="p-2 text-slate-300 hover:text-brand-primary transition-colors"
                                title="Réimprimer l'étiquette"
                              >
                                <Printer size={16} />
                              </button>
                              <button 
                                onClick={() => deleteHistoryEntry(h.id)}
                                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {returnHistory.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">Aucun retour enregistré.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {returnSubTab === 'inventory' && (
              <motion.div
                key="inventory"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input 
                    placeholder="Filtrer l'inventaire (Référence, Boîte, Localisation...)" 
                    className="pl-12 py-3 border-slate-200 focus:ring-brand-primary rounded-2xl bg-slate-50/50"
                    value={inventorySearchTerm}
                    onChange={(e) => setInventorySearchTerm(e.target.value)}
                  />
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Référence</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Boîte N°</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Localisation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {returnInventory
                        .filter(i => {
                          if (!inventorySearchTerm) return true;
                          const term = inventorySearchTerm.toLowerCase();
                          return (
                            String(i.reference || '').toLowerCase().includes(term) ||
                            String(i.numBoite || '').toLowerCase().includes(term) ||
                            String(i.localisation || '').toLowerCase().includes(term)
                          );
                        })
                        .map((i: any) => (
                          <tr key={i.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold text-slate-700">{i.reference}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{i.numBoite.replace(/^SIN\.C-?/i, '').replace(/^\.+/, '')}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{i.localisation.replace(/^\d{4}-?/i, '').replace(/^\.+/, '')}</td>
                          </tr>
                        ))}
                      {returnInventory.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">L'inventaire est vide. Importez un fichier Excel.</td>
                        </tr>
                      )}
                      {returnInventory.length > 0 && returnInventory.filter(i => {
                        const term = inventorySearchTerm.toLowerCase();
                        return (
                          String(i.reference || '').toLowerCase().includes(term) ||
                          String(i.numBoite || '').toLowerCase().includes(term) ||
                          String(i.localisation || '').toLowerCase().includes(term)
                        );
                      }).length === 0 && inventorySearchTerm && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">Aucun résultat trouvé pour "{inventorySearchTerm}".</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {activeTab === 'massInventory' && (
        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 mb-6">
          <div className="flex flex-wrap gap-2 mb-8 bg-slate-50 p-1.5 rounded-2xl w-fit">
            <button
              onClick={() => setMassSubTab('view')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${massSubTab === 'view' ? 'bg-white text-brand-accent shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Library size={16} /> INVENTAIRE
            </button>
            <button
              onClick={() => setMassSubTab('import')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${massSubTab === 'import' ? 'bg-white text-brand-accent shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <FileSpreadsheet size={16} /> IMPORTATION
            </button>
            <button
              onClick={() => setMassSubTab('history')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${massSubTab === 'history' ? 'bg-white text-brand-accent shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <History size={16} /> SUIVI DES INVENTAIRES
            </button>
            <button
              onClick={() => setMassSubTab('monitoring')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${massSubTab === 'monitoring' ? 'bg-white text-brand-accent shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <TrendingUp size={16} /> SURVEILLANCE ARCHI.
            </button>
            <button
              onClick={() => setMassSubTab('centralized')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${massSubTab === 'centralized' ? 'bg-white text-brand-accent shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Library size={16} /> INVENTAIRE CENTRALISÉ
            </button>
          </div>

          <AnimatePresence mode="wait">
            {massSubTab === 'import' && (
              <motion.div
                key="mass-import"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {importStep === 'upload' && (
                  <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                    <div className="bg-white p-4 rounded-full shadow-md mb-4">
                      <FileSpreadsheet size={32} className="text-brand-accent" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Gestion des inventaires de masse</h3>
                    <p className="text-slate-500 text-sm mb-8 max-w-sm text-center">
                      Importation intelligente : l'application détecte automatiquement vos colonnes et préserve l'intégralité de vos données.
                    </p>

                    <div className="w-full max-w-sm space-y-4 mb-8">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">1. Destination (Direction)</label>
                        <select 
                          className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent shadow-sm"
                          value={importingDirection}
                          onChange={(e) => {
                            setImportingDirection(e.target.value);
                            setImportingRule(null);
                          }}
                        >
                          <option value="">Sélectionner une direction...</option>
                          {RETENTION_CALENDAR.map(d => (
                            <option key={d.code} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      {importingDirection && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-1"
                        >
                          <label className="text-[10px] font-bold text-slate-400 uppercase ml-2">2. Code du document (Obligatoire)</label>
                          <div className="flex gap-2">
                            <select 
                              className="flex-1 min-w-0 bg-white border-2 border-brand-accent/20 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent shadow-sm font-bold"
                              value={importingRule?.reference || ""}
                              onChange={(e) => {
                                // Try finding in dynamic database rules first
                                let foundRule = archivalDirectory.find(r => r.direction === importingDirection && r.reference === e.target.value);
                                if (!foundRule) {
                                  // Fallback to static calendar rules
                                  const dir = RETENTION_CALENDAR.find(d => d.name === importingDirection);
                                  const staticRule = dir?.rules.find(r => r.reference === e.target.value);
                                  if (staticRule) {
                                    foundRule = {
                                      id: staticRule.reference,
                                      reference: staticRule.reference,
                                      title: staticRule.title,
                                      direction: importingDirection
                                    };
                                  }
                                }
                                setImportingRule(foundRule || null);
                              }}
                            >
                              <option value="">Sélectionner le code documentaire...</option>
                              {/* 1. Dynamic database rules */}
                              {archivalDirectory.filter(r => r.direction === importingDirection).map(r => (
                                <option key={r.id || r.reference} value={r.reference}>
                                  {r.reference} - {r.title} (BDD)
                                </option>
                              ))}
                              {/* 2. Static calendar rules as fallback if not in BDD */}
                              {RETENTION_CALENDAR.find(d => d.name === importingDirection)?.rules
                                .filter(sr => !archivalDirectory.some(dr => dr.direction === importingDirection && dr.reference === sr.reference))
                                .map(sr => (
                                  <option key={sr.reference} value={sr.reference}>
                                    {sr.reference} - {sr.title} (Standard)
                                  </option>
                                ))
                              }
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                setNewImportRule({
                                  reference: '',
                                  title: '',
                                  direction: importingDirection,
                                  docType: 'Dossier',
                                  activeYears: 5,
                                  semiActiveYears: 5,
                                  finalDisposition: 'EL',
                                  support: 'Papier',
                                  retentionTrigger: 'Chambre',
                                  category: 'Général',
                                  isCritical: false
                                });
                                setIsAddingImportRule(true);
                              }}
                              className="w-12 h-12 bg-brand-accent/10 hover:bg-brand-accent text-brand-accent hover:text-white rounded-2xl flex items-center justify-center transition-all shrink-0 shadow-sm"
                              title="Ajouter une nouvelle règle de conservation pour cette direction"
                            >
                              <Plus size={18} strokeWidth={2.5} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </div>

                    {importingDirection && (
                      <>
                        <input
                          type="file"
                          accept=".xlsx, .xls"
                          onChange={handleMassInventoryImport}
                          className="hidden"
                          id="mass-import-file"
                        />
                        <label
                          htmlFor="mass-import-file"
                          className="cursor-pointer bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-black transition-all flex items-center gap-3 active:scale-95"
                        >
                          <Plus size={20} className="text-brand-accent" />
                          CHOISIR LE FICHIER EXCEL (.XLSX)
                        </label>
                      </>
                    )}
                  </div>
                )}

                {importStep === 'preview' && (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-brand-accent/10 text-brand-accent rounded-2xl flex items-center justify-center">
                          <FileSpreadsheet size={24} />
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-slate-800">{importFileName}</h3>
                          <p className="text-xs font-bold text-slate-400">
                            {mappedItems.length} lignes détectées • Direction: <span className="text-brand-accent uppercase">{importingDirection}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          onClick={() => setImportStep('upload')}
                          className="font-bold text-slate-500"
                        >
                          Annuler
                        </Button>
                        <Button 
                          onClick={executeMassImport}
                          className="bg-brand-accent text-white hover:opacity-90 px-8 font-black rounded-2xl shadow-lg shadow-brand-accent/20"
                        >
                          <Save size={18} className="mr-2" /> Valider et Importer
                        </Button>
                      </div>
                    </div>

                    <div className="bg-brand-accent/5 border border-brand-accent/10 p-4 rounded-2xl flex items-start gap-3">
                      <Clock className="text-brand-accent mt-1" size={18} />
                      <div className="text-xs text-brand-accent/80 space-y-1">
                        <p className="font-bold">Analyse automatique des colonnes effectuée.</p>
                        <p>L'application a identifié les colonnes clés (Réf, Date, etc.) mais conservera <strong>l'intégralité</strong> de vos colonnes originales en mémoire.</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-white">
                          <tr>
                            {importHeaders.map(h => (
                                <th key={h} className="px-4 py-4 font-black uppercase tracking-widest border-r border-white/5">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {importPreviewData.map((row, idx) => (
                            <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                              {importHeaders.map(h => (
                                <td key={h} className="px-4 py-3 text-slate-600 font-medium">
                                  {formatExcelDate(row[h])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {mappedItems.length > 10 && (
                        <div className="bg-slate-50 py-3 text-center text-[10px] font-bold text-slate-400 italic">
                          Affichage des 10 premières lignes sur {mappedItems.length} au total...
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {importStep === 'importing' && (
                  <div className="py-20 flex flex-col items-center justify-center text-center">
                    <div className="relative w-24 h-24 mb-6">
                       <svg className="w-full h-full transform -rotate-90">
                         <circle
                           cx="48"
                           cy="48"
                           r="40"
                           stroke="currentColor"
                           strokeWidth="8"
                           fill="transparent"
                           className="text-slate-100"
                         />
                         <circle
                           cx="48"
                           cy="48"
                           r="40"
                           stroke="currentColor"
                           strokeWidth="8"
                           fill="transparent"
                           strokeDasharray={251.2}
                           strokeDashoffset={251.2 - (251.2 * importProgress) / 100}
                           className="text-orange-500 transition-all duration-300"
                         />
                       </svg>
                       <div className="absolute inset-0 flex items-center justify-center text-xl font-black text-slate-800">
                         {importProgress}%
                       </div>
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">Sauvegarde en base de données...</h3>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto">
                      Veuillez patienter pendant l'indexation de vos documents. <br/>
                      Ne fermez pas cette page.
                    </p>
                  </div>
                )}
                
                    {importStep === 'upload' && (
                      <div className="flex flex-col items-center gap-6 pt-12">
                         <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center text-rose-600 mb-2">
                           <Trash2 size={40} />
                         </div>
                         <div className="text-center space-y-2">
                           <h4 className="text-lg font-bold text-slate-800">Remise à zéro du système</h4>
                           <p className="text-slate-500 text-sm max-w-md mx-auto">
                             Pour importer de nouveaux fichiers avec la nouvelle structure intelligente, vous devez d'abord vider l'historique et le stock actuel.
                           </p>
                         </div>
                         <Button 
                          variant="destructive"
                          className="bg-rose-600 hover:bg-rose-700 text-white h-12 px-10 rounded-2xl font-black text-xs tracking-widest uppercase transition-all shadow-xl shadow-rose-200 active:scale-95"
                          onClick={async () => {
                            if(confirm("DANGER : Cette action supprimera DÉFINITIVEMENT l'intégralité de l'inventaire de masse ainsi que tout l'historique d'import. Cette opération est irréversible. Continuer ?")) {
                              try {
                                await api.post('/api/mass-inventory/clear', {});
                                setMassInventory([]);
                                setImportPreviewData([]);
                                setMappedItems([]);
                                await fetchData();
                                await fetchArchivalMonitoring();
                                alert("Le système a été réinitialisé avec succès.");
                              } catch (err) {
                                alert("Erreur lors de la réinitialisation.");
                              }
                            }
                          }}
                        >
                          RÉINITIALISER TOUT LE STOCK
                        </Button>
                      </div>
                    )}
              </motion.div>
            )}

            {massSubTab === 'view' && (
              <motion.div
                key="mass-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Image-Style Search Section */}
                <div className="bg-white rounded-[2rem] border border-slate-200 p-10 shadow-sm space-y-8 max-w-5xl mx-auto">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-bold text-slate-800">Recherche documentaire</h2>
                    <p className="text-slate-500 text-sm">Tapez une référence, un numéro de dossier, un mot-clé ou un code documentaire</p>
                  </div>

                  <div className="relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-accent transition-colors" size={24} />
                    <input 
                      type="text"
                      placeholder="Ex: 2210..." 
                      className="w-full bg-white border border-slate-200 rounded-2xl pl-16 pr-8 py-5 text-xl font-medium focus:outline-none focus:ring-4 focus:ring-brand-accent/10 focus:border-slate-300 transition-all placeholder:text-slate-300"
                      value={massSearchTerm}
                      onChange={(e) => setMassSearchTerm(e.target.value)}
                    />
                  </div>

                  {/* Direction Filter Bar */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                      <Building2 size={16} className="text-slate-400" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtrer par Direction</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                       <select 
                         className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-base font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-brand-accent/10 focus:border-brand-accent transition-all cursor-pointer appearance-none shadow-sm"
                         value={selectedDirection}
                         onChange={(e) => setSelectedDirection(e.target.value)}
                         style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2364748b\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1.5rem center', backgroundSize: '1.5rem' }}
                       >
                         <option value="all">TOUTES LES DIRECTIONS</option>
                         {RETENTION_CALENDAR.map(dir => (
                           <option key={dir.name} value={dir.name}>
                             {dir.name.toUpperCase()}
                           </option>
                         ))}
                       </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex gap-4">
                      <button className="flex items-center gap-2 text-slate-700 font-bold hover:text-brand-accent transition-colors">
                        <Filter size={18} /> Filtres avancés
                      </button>
                      <button 
                        onClick={() => {
                          setEditedDetailItem({
                            reference: '',
                            intitule: '',
                            direction: '',
                            dateDebut: '',
                            dateFin: '',
                            numBoite: '',
                            localisation: '',
                            ruleId: null
                          });
                          setIsEditingDetail(true);
                        }}
                        className="flex items-center gap-2 text-brand-accent font-black hover:opacity-80 transition-colors bg-brand-accent/10 px-4 py-2 rounded-xl"
                      >
                        <Plus size={18} /> Nouveau dossier
                      </button>
                    </div>
                    <button 
                      onClick={() => {
                        setMassSearchTerm('');
                        setSelectedDirection('all');
                      }}
                      className="text-slate-700 font-bold hover:text-brand-accent transition-colors"
                    >
                      Réinitialiser
                    </button>
                  </div>
                </div>

                {/* Results Count */}
                {(massSearchTerm || selectedDirection !== 'all') && (
                   <div className="max-w-5xl mx-auto px-4">
                     <span className="text-xs font-bold text-slate-400 italic">
                       {massInventory.length} résultat(s) {selectedDirection !== 'all' && `pour la direction ${selectedDirection.replace('Direction ', '')}`}
                     </span>
                   </div>
                )}

                {/* Search Results Display (Image Style Cards) */}
                {!massSearchTerm && selectedDirection === 'all' && massInventory.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center opacity-40">
                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                      <Library size={48} className="text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">Prêt pour l'extraction</h3>
                  </div>
                ) : (
                  <div className="max-w-5xl mx-auto space-y-8 pb-32">
                    {massInventory.map((item: any) => {
                      const isSelected = selectedForElimination.includes(item.id);
                      let rawData: any = {};
                      try {
                        rawData = item.rawData ? JSON.parse(item.rawData) : {};
                      } catch (e) {
                        rawData = item; // Fallback
                      }

                      // We take all keys from rawData to display in the "table fiche"
                      const entries = Object.entries(rawData).filter(([k]) => {
                        const lowerK = k.toLowerCase();
                        return (
                          k !== 'id' && 
                          k !== 'createdAt' && 
                          k !== 'rawData' && 
                          k !== 'filename' &&
                          lowerK !== 'reference' && 
                          lowerK !== 'intitule' && 
                          lowerK !== 'direction' && 
                          lowerK !== 'datefin' && 
                          lowerK !== 'datecloture' &&
                          lowerK !== 'date_cloture' &&
                          lowerK !== 'date debut'
                        );
                      });

                      return (
                        <motion.div 
                          key={item.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "bg-white rounded-[2.5rem] border-2 transition-all p-10",
                            isSelected ? "border-brand-primary shadow-2xl" : "border-slate-100 shadow-sm"
                          )}
                        >
                          <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-5">
                               <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
                                 <FileText size={28} />
                               </div>
                               <div>
                                 <h4 className="text-2xl font-black text-slate-800 tracking-tight">{item.reference || "SANS RÉFÉRENCE"}</h4>
                                 <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{item.direction || 'DIRECTION'}</span>
                                    <span className={cn(
                                      "text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-wider",
                                      item.archivalStatus === 'Expired' ? "bg-rose-100 text-rose-600 border border-rose-200" : 
                                      item.archivalStatus === 'SemiActive' ? "bg-brand-accent/10 text-brand-accent border border-brand-accent/20" : "bg-brand-primary/10 text-brand-primary border border-brand-primary/20"
                                    )}>
                                      {item.archivalStatus === 'Expired' ? 'A ÉLIMINER' : 
                                       item.archivalStatus === 'SemiActive' ? 'SEMI-ACTIF' : 'ACTIF'}
                                    </span>
                                 </div>
                               </div>
                            </div>
                            <div className="flex items-center gap-6">
                              {item.expiryDate && (
                                <div className="text-right">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Date d'échéance</p>
                                  <p className="text-sm font-black text-slate-600">{item.expiryDate}</p>
                                </div>
                              )}
                              <input 
                                type="checkbox" 
                                className="rounded-xl border-slate-200 text-emerald-600 focus:ring-emerald-500 w-8 h-8 cursor-pointer shadow-sm"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedForElimination(prev => 
                                    prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                                  );
                                }}
                              />
                            </div>
                          </div>

                          {/* Professional Dynamic Table matching requested style */}
                          <div className="border border-slate-200 rounded-[2rem] overflow-hidden shadow-inner bg-slate-50/20">
                             {[
                               ['Intitulé', item.intitule],
                               ['Localisation', item.localisation],
                               ['Numéro de Boîte', item.numBoite],
                               ['Date d\'ouverture', item.dateDebut],
                               ['Date de clôture', item.dateCloture],
                               ...entries
                             ].map(([key, value], idx) => {
                               if (!value || value === '-') return null;
                               return (
                                 <div key={`${key}-${idx}`} className="grid grid-cols-12 border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-all duration-300">
                                   <div className="col-span-4 bg-slate-50/80 px-8 py-4 border-r border-slate-100 flex items-center">
                                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{key.replace(/_/g, ' ')}</span>
                                   </div>
                                   <div className="col-span-8 px-8 py-4 flex items-center">
                                     <span className="text-sm font-bold text-slate-700">{String(value)}</span>
                                   </div>
                                 </div>
                               );
                             })}
                          </div>

                          <div className="flex items-center justify-between mt-8 px-2">
                             <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                               <Clock size={14} className="text-slate-300" />
                               <span>Importé le {formatExcelDate(item.createdAt)}</span>
                               <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                               <span>Source: {item.filename || 'Import direct'}</span>
                             </div>
                             <div className="flex gap-3">
                               <button 
                                 onClick={() => setViewingRequest(item)}
                                 className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all font-bold text-xs"
                               >
                                 <Eye size={16}/> Détails
                               </button>
                               <button 
                                 onClick={() => deleteMassItem(item.id)}
                                 className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-bold text-xs"
                               >
                                 <Trash2 size={16}/> Supprimer
                               </button>
                             </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {massSubTab === 'monitoring' && (
              <motion.div
                key="mass-monitoring"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <h3 className="text-xl font-bold text-slate-800">
                      Suivi de l'Inventaire de Masse ({massInventoryStats.total.toLocaleString()})
                    </h3>
                    <p className="text-slate-500 text-sm">Analyse et pilotage du cycle de vie des dossiers.</p>
                  </div>
                  <Button 
                    variant="destructive"
                    className="bg-rose-600 hover:bg-rose-700 text-white font-black px-6 shadow-lg shadow-rose-100"
                    onClick={async () => {
                      if(confirm("ATTENTION : Cette action supprimera DÉFINITIVEMENT l'intégralité de l'inventaire de masse ainsi que tout l'historique d'import. Cette opération est irréversible. Continuer ?")) {
                        try {
                          await api.post('/api/mass-inventory/clear', {});
                          setMassInventory([]);
                          setImportPreviewData([]);
                          setMappedItems([]);
                          await fetchData();
                          await fetchArchivalMonitoring();
                          alert("Stock vidé avec succès.");
                        } catch (err) {
                          alert("Erreur lors de la suppression du stock.");
                        }
                      }
                    }}
                  >
                    <Trash2 size={16} className="mr-2" /> VIDER L'INTÉGRALITÉ DU STOCK
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className={cn(
                    "p-4 rounded-3xl border transition-all cursor-pointer",
                    monitoringStatus === 'Active' ? "bg-brand-primary/10 border-brand-primary/20 shadow-sm" : "bg-white border-slate-100"
                  )} onClick={() => setMonitoringStatus('Active')}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actifs</p>
                    <p className="text-2xl font-black text-brand-primary">{archivalMonitoringStats.active.toLocaleString()}</p>
                  </div>
                  <div className={cn(
                    "p-4 rounded-3xl border transition-all cursor-pointer",
                    monitoringStatus === 'SemiActive' ? "bg-brand-accent/10 border-brand-accent/20 shadow-sm" : "bg-white border-slate-100"
                  )} onClick={() => setMonitoringStatus('SemiActive')}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Semi-Actifs</p>
                    <p className="text-2xl font-black text-brand-accent">{archivalMonitoringStats.semiActive.toLocaleString()}</p>
                  </div>
                  <div className={cn(
                    "p-4 rounded-3xl border transition-all cursor-pointer",
                    monitoringStatus === 'Expired' ? "bg-rose-50 border-rose-200 shadow-sm" : "bg-white border-slate-100"
                  )} onClick={() => setMonitoringStatus('Expired')}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Échus (D.U.A dépassée)</p>
                    <p className="text-2xl font-black text-rose-600">{archivalMonitoringStats.expired.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-3xl bg-slate-900 text-white shadow-lg">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-60">Total Dossiers</p>
                    <p className="text-2xl font-black">{archivalMonitoringStats.total.toLocaleString()}</p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <Clock size={18} className="text-rose-500" />
                      Détails de la Cohorte : <span className="text-rose-600 font-black italic">{monitoringStatus === 'Expired' ? 'Échus' : monitoringStatus}</span>
                    </h3>
                    <Button 
                      className="bg-slate-900 text-white text-xs px-4"
                      onClick={() => {
                        if (monitoringStatus === 'Expired') {
                          setSelectedForElimination(monitoringItems.map(i => i.id));
                          setMassSubTab('view');
                        }
                      }}
                    >
                      <Download size={14} className="mr-2" /> Exporter Liste
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-bold text-slate-400 border-b border-slate-50 uppercase tracking-widest">
                          <th className="pb-3 px-2">Référence</th>
                          <th className="pb-3 px-2">Intitulé</th>
                          <th className="pb-3 px-2">Échéance</th>
                          <th className="pb-3 px-2 text-right">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monitoringItems.map(item => (
                          <tr key={item.id} className="border-b border-slate-50/50 hover:bg-slate-50/50 transition-colors">
                            <td className="py-2 px-2 text-sm font-black text-slate-700">{item.reference}</td>
                            <td className="py-2 px-2 text-xs text-slate-500 truncate max-w-[300px]">{item.intitule}</td>
                            <td className="py-2 px-2 text-sm font-bold text-rose-600">{item.expiryDate}</td>
                            <td className="py-2 px-2 text-right">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-black uppercase",
                                item.archivalStatus === 'Expired' ? "bg-rose-500 text-white" : "bg-emerald-500 text-white"
                              )}>
                                {item.archivalStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {massSubTab === 'history' && (
              <motion.div
                key="mass-history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-xl font-bold text-slate-800">
                      Historique des Imports ({massInventoryStats.total.toLocaleString()} dossiers au total)
                    </h3>
                    <p className="text-slate-500 text-sm">Suivi des fichiers Excel importés dans l'inventaire de masse.</p>
                  </div>
                  <Button 
                    variant="destructive"
                    className="bg-rose-600 hover:bg-rose-700 text-white h-10 px-6 rounded-xl font-bold transition-all shadow-lg shadow-rose-100 active:scale-95"
                    onClick={async () => {
                      if(confirm("ATTENTION : Cette action supprimera DÉFINITIVEMENT l'intégralité de l'inventaire de masse ainsi que tout l'historique d'import. Cette opération est irréversible. Continuer ?")) {
                        try {
                          await api.post('/api/mass-inventory/clear', {});
                          setMassInventory([]);
                          setImportPreviewData([]);
                          setMappedItems([]);
                          await fetchData();
                          await fetchArchivalMonitoring();
                          alert("Le système a été réinitialisé.");
                        } catch (err) {
                          alert("Erreur lors de l'opération.");
                        }
                      }
                    }}
                  >
                    <Trash2 size={16} className="mr-2" /> RÉINITIALISER TOUT
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date Import</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fichier</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Direction</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dossiers</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {importHistory.map((h: any) => (
                        <tr key={h.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-xs font-medium text-slate-500">
                            {new Date(h.createdAt).toLocaleString('fr-FR')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-sm font-bold text-slate-700 truncate max-w-[200px]" title={h.filename}>{h.filename}</span>
                              <button 
                                onClick={() => downloadStoredFile(h.filename)}
                                className="p-2 text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-all"
                                title="Télécharger le fichier original"
                              >
                                <Download size={16} />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold uppercase">
                              {h.direction}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-brand-accent">
                            {h.itemsCount?.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {importHistory.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                            Aucun import dans l'historique.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {massSubTab === 'centralized' && (
              <motion.div
                key="centralized-inventory"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="w-full h-full min-h-[850px] rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-white"
              >
                <CentralizedInventory />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      )}

      {activeTab === 'elimination' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 bg-white border-slate-100 shadow-sm rounded-3xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-accent/10 text-brand-accent rounded-2xl flex items-center justify-center">
                  <Clock size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">En Attente</p>
                  <p className="text-2xl font-black text-slate-800">{eliminationStats.pending}</p>
                </div>
              </div>
            </Card>
            <Card className="p-6 bg-white border-slate-100 shadow-sm rounded-3xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Approuvés</p>
                  <p className="text-2xl font-black text-slate-800">{eliminationStats.approved}</p>
                </div>
              </div>
            </Card>
            <Card className="p-6 bg-white border-slate-100 shadow-sm rounded-3xl">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
                  <XCircle size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rejetés</p>
                  <p className="text-2xl font-black text-slate-800">{eliminationStats.rejected}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 font-sans">
            <div className="flex flex-wrap gap-2 mb-8 bg-slate-50 p-1.5 rounded-2xl w-fit">
              <button 
                onClick={() => setEliminationSubTab('alerts')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${eliminationSubTab === 'alerts' ? 'bg-white text-red-600 shadow-md transform scale-105' : 'text-slate-400 hover:text-slate-600'}`}
              >
                ALERTE
              </button>
              <button 
                onClick={() => setEliminationSubTab('proposal')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${eliminationSubTab === 'proposal' ? 'bg-white text-brand-accent shadow-md transform scale-105' : 'text-slate-400 hover:text-slate-600'}`}
              >
                PROPOSITION ÉLIMINATION
              </button>
              <button 
                onClick={() => setEliminationSubTab('history')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${eliminationSubTab === 'history' ? 'bg-white text-brand-primary shadow-md transform scale-105' : 'text-slate-400 hover:text-slate-600'}`}
              >
                HISTORIQUE
              </button>
              <button 
                onClick={() => setEliminationSubTab('calendar')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${eliminationSubTab === 'calendar' ? 'bg-white text-brand-primary/80 shadow-md transform scale-105' : 'text-slate-400 hover:text-slate-600'}`}
              >
                CALENDRIER
              </button>
            </div>

            <AnimatePresence mode="wait">
              {eliminationSubTab === 'alerts' && (
                <motion.div
                  key="alerts-elim"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-2 gap-4">
                    <div>
                      <h3 className="text-xl font-black text-slate-800 tracking-tight text-red-600 flex items-center gap-2">
                        <Bell size={24} />
                        Alertes d'Élimination Annuelle
                      </h3>
                      <p className="text-slate-500 text-sm font-medium">Dossiers dont le délai de conservation est expiré, classés par direction.</p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <button 
                        onClick={handleRunAnalysis}
                        disabled={isSearchingLoc}
                        className="flex-1 md:flex-none px-6 py-3 bg-red-600 text-white rounded-2xl text-xs font-black hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                      >
                        {isSearchingLoc ? <RotateCw className="animate-spin" size={16} /> : <Search size={16} />}
                        LANCER L'ANALYSE
                      </button>
                    </div>
                  </div>

                  {eligibleItems.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {eligibleByDirection.map(group => (
                        <Card key={group.name} className="p-4 bg-white border-slate-100 shadow-sm border-l-4 border-l-red-500">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{group.name}</p>
                           <p className="text-xl font-black text-slate-800">{group.items.length} <span className="text-xs text-slate-400">Dossiers</span></p>
                        </Card>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded-lg border-slate-300 text-red-600 focus:ring-red-500"
                          checked={selectedForElimination.length === eligibleItems.length && eligibleItems.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedForElimination(eligibleItems.map(i => i.id));
                            else setSelectedForElimination([]);
                          }}
                        />
                        <span className="text-xs font-bold text-slate-600">Tout Sélectionner</span>
                      </div>
                      <span className="text-xs font-bold text-slate-400">|</span>
                      <span className="text-xs font-black text-slate-800">{selectedForElimination.length} sélectionné(s)</span>
                    </div>
                    <Button 
                      disabled={selectedForElimination.length === 0}
                      onClick={handleBulkPropose}
                      className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl px-6 py-2 text-[10px] font-black"
                    >
                      VALIDER LES ALERTES
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {eligibleByDirection.map(group => (
                      <div key={group.name} className="space-y-3">
                        <div className="flex items-center gap-3 px-2">
                          <Building2 size={16} className="text-red-600" />
                          <h4 className="font-black text-slate-800 text-xs tracking-widest uppercase">{group.name}</h4>
                          <span className="bg-red-50 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full">{group.items.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {group.items.map(item => (
                            <div key={item.id} className="bg-white border border-slate-100 rounded-3xl p-4 hover:shadow-md transition-all group flex items-start gap-4">
                               <input 
                                 type="checkbox" 
                                 className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-red-600 focus:ring-red-500"
                                 checked={selectedForElimination.includes(item.id)}
                                 onChange={(e) => {
                                   if (e.target.checked) setSelectedForElimination([...selectedForElimination, item.id]);
                                   else setSelectedForElimination(selectedForElimination.filter(id => id !== item.id));
                                 }}
                               />
                               <div className="flex-1 min-w-0">
                                 <div className="flex justify-between items-start mb-1">
                                   <p className="text-xs font-black text-slate-800 truncate">{item.intitule}</p>
                                   <span className="text-[9px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded uppercase">{item.reference}</span>
                                 </div>
                                 <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                    <p className="text-[10px] text-slate-400">Clôture: <span className="text-slate-700 font-bold">{item.dateFin}</span></p>
                                    <p className="text-[10px] text-slate-400">Sort Final: <span className="text-red-600 font-bold">{item.finalDisposition || 'EL'}</span></p>
                                    <p className="text-[10px] text-slate-400">Boîte: <span className="text-slate-700 font-bold">{item.numBoite || '-'}</span></p>
                                    <p className="text-[10px] text-slate-400">Emplacement: <span className="text-slate-700 font-bold">{item.localisation || '-'}</span></p>
                                 </div>
                               </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {eligibleItems.length === 0 && (
                      <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] p-24 flex flex-col items-center justify-center text-center">
                         <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-200 shadow-sm mb-6">
                           <Inbox size={40} />
                         </div>
                         <h3 className="text-xl font-bold text-slate-600 mb-2">Tout est à jour</h3>
                         <p className="text-slate-400 max-w-sm">Aucune nouvelle alerte d'élimination détectée.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

            {eliminationSubTab === 'proposal' && (
              <motion.div
                key="proposal-elim"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-2 gap-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight text-brand-accent flex items-center gap-2">
                      <FileCheck size={24} />
                      Proposition d'Élimination (PV)
                    </h3>
                    <p className="text-slate-500 text-sm font-medium">Consultez et validez le procès-verbal d'élimination groupé.</p>
                  </div>
                  <div className="flex gap-2 w-full md:w-auto">
                    <button 
                      onClick={() => generateEliminationBordereau(eliminationRequests.filter(r => r.status === 'Pending'), 'PV')}
                      disabled={eliminationRequests.filter(r => r.status === 'Pending').length === 0}
                      className="flex-1 md:flex-none px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-2xl text-xs font-black hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                    >
                      <Printer size={16} />
                      IMPRIMER PV
                    </button>
                    <button 
                      onClick={handleValidatePV}
                      disabled={eliminationRequests.filter(r => r.status === 'Pending').length === 0}
                      className="flex-1 md:flex-none px-6 py-3 bg-brand-accent text-white rounded-2xl text-xs font-black hover:opacity-90 transition-all shadow-lg shadow-brand-accent/20 flex items-center justify-center gap-2"
                    >
                      <CheckDouble size={16} />
                      VALIDER LE PV
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Référence</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Intitulé / Direction</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Boîte</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {eliminationRequests.filter(r => r.status === 'Pending').map((req: any) => (
                        <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-slate-900">{req.reference}</td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-slate-700">{req.intitule}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-black">{req.direction}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{req.numBoite || '-'}</td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => handleRemoveFromPV(req.id)}
                              className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                              title="Retirer du PV"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {eliminationRequests.filter(r => r.status === 'Pending').length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-20 text-center text-slate-400 italic">
                            Aucun document dans la proposition actuelle.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {eliminationSubTab === 'history' && (
              <motion.div
                key="elim-history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-2 gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                      <History className="text-brand-primary" size={24} />
                      Historique des Éliminations
                    </h3>
                    <p className="text-slate-500 text-sm">Consulation des dossiers officiellement éliminés.</p>
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      placeholder="Rechercher..."
                      value={historicSearch}
                      onChange={(e) => setHistoricSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-brand-primary outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-3xl border border-slate-100 shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date Élimination</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Dossier / Direction</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Référence</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Boîte</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Approuvé Par</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {eliminationRequests
                        .filter(r => (r.status === 'Approved' || r.status === 'Eliminated') && 
                          (r.intitule.toLowerCase().includes(historicSearch.toLowerCase()) || 
                           r.reference.toLowerCase().includes(historicSearch.toLowerCase()) ||
                           r.direction.toLowerCase().includes(historicSearch.toLowerCase())))
                        .map((req: any) => (
                        <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-xs font-bold text-slate-400">
                            {toSafeDate(req.eliminationDate || req.updatedAt || new Date()) ? format(toSafeDate(req.eliminationDate || req.updatedAt || new Date())!, 'dd/MM/yyyy') : '-'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-slate-700">{req.intitule}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 uppercase">{req.direction}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 text-center font-bold">{req.reference || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-600 text-center">{req.numBoite || '-'}</td>
                          <td className="px-6 py-4 text-right text-xs font-bold text-slate-500">
                            {req.approvedBy || 'Commission Centrale'}
                          </td>
                        </tr>
                      ))}
                      {eliminationRequests.filter(r => (r.status === 'Approved' || r.status === 'Eliminated')).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic">
                            L'historique est actuellement vide.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
            {eliminationSubTab === 'calendar' && (
              <motion.div
                key="calendar-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="bg-brand-secondary/30 rounded-3xl p-6 border border-brand-primary/10 flex flex-col md:flex-row gap-6 items-start justify-between">
                  <div className="space-y-1 max-w-2xl font-sans">
                    <h3 className="text-xl font-black text-brand-primary tracking-tight uppercase flex items-center gap-2">
                      <Library size={24} />
                      Référentiel des Délais de Conservation des Documents
                    </h3>
                    <p className="text-slate-500 text-xs font-semibold leading-relaxed">
                      Gérez la liste réglementaire des directions, des natures de documents et leurs durées d'utilité administrative (DUA). Ce calendrier est directement synchronisé avec l'onglet <strong className="text-brand-primary">Inventaire Centralisé</strong>. L'association d'une règle déclenchera automatiquement l'apparition d'alertes d'élimination une fois le délai dépassé.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={async () => {
                        if (confirm("Voulez-vous charger toutes les règles par défaut pour les 16 directions ? Cela va enrichir votre base de données avec les délais réglementaires standard d'archivage.")) {
                          try {
                            const rulesToImport: any[] = [];
                            RETENTION_CALENDAR.forEach(dir => {
                              dir.rules.forEach(r => {
                                rulesToImport.push({
                                  reference: r.reference,
                                  title: r.title,
                                  direction: dir.name,
                                  docType: r.docType || r.title,
                                  activeYears: parseInt(r.active) || 5,
                                  semiActiveYears: parseInt(r.semiActive) || 10,
                                  finalDisposition: r.finalDisposition || 'EL',
                                  support: r.support || 'Papier',
                                  retentionTrigger: r.trigger || "Clôture de l'exercice",
                                  isCritical: false,
                                  category: 'Général'
                                });
                              });
                            });
                            await api.post('/api/archival-directory/import', { entries: rulesToImport });
                            await fetchArchivalDirectory();
                            alert("Importation réussie de tous les types de documents répertoriés.");
                          } catch (err: any) {
                            alert("Erreur lors de l'import : " + err.message);
                          }
                        }
                      }}
                      variant="ghost"
                      className="border border-brand-primary/20 text-brand-primary rounded-xl font-bold text-[10px] tracking-wider uppercase bg-white py-2.5 px-4"
                    >
                      Charger Règles Standard
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          const res = await api.post('/api/elimination/analyze', {});
                          alert(`Analyse complète exécutée ! ${res.updatedCount || 0} dossier(s) audité(s) et mis à jour. Les alertes d'élimination ont été actualisées automatiquement.`);
                          await Promise.all([
                            api.get('/api/elimination/eligible').then(setEligibleItems),
                            fetchArchivalDirectory()
                          ]);
                        } catch (err: any) {
                          alert("Erreur lors de la mise à jour des alertes : " + err.message);
                        }
                      }}
                      className="bg-red-600 hover:bg-red-750 text-white rounded-xl font-black text-[10px] tracking-wider uppercase py-2.5 px-6 shadow-md shadow-red-200"
                      title="Recalcule instantanément l'éligibilité à l'élimination de tous les dossiers physiques et centralisés."
                    >
                      🔄 Recalculer les alertes
                    </Button>
                    <Button
                      onClick={() => {
                        setEditedRule({
                          direction: selectedCalendarDir || "Direction Commune",
                          reference: "",
                          title: "",
                          docType: "",
                          activeYears: 5,
                          semiActiveYears: 5,
                          finalDisposition: "EL",
                          support: "Papier",
                          retentionTrigger: "Clôture du dossier",
                          isCritical: false,
                          category: "Général"
                        });
                        setIsEditingRule(true);
                      }}
                      className="bg-brand-primary hover:opacity-90 text-white rounded-xl font-black text-[10px] tracking-widest uppercase py-2.5 px-6 shadow-md shadow-brand-primary/20"
                    >
                      <Plus size={14} className="inline mr-1" /> Nouveau Type
                    </Button>
                  </div>
                </div>

                {/* Section Assistant Calendrier Intelligent & Simulateur de Cycle de Vie */}
                <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 md:p-10 mb-8 border border-slate-800 shadow-2xl relative overflow-hidden font-sans">
                  {/* Background ambient accents */}
                  <div className="absolute top-0 right-0 w-80 h-80 bg-brand-primary/10 rounded-full blur-[100px] pointer-events-none" />
                  <div className="absolute -bottom-10 -left-10 w-96 h-96 bg-brand-accent/5 rounded-full blur-[120px] pointer-events-none" />

                  <div className="relative z-10">
                    <div className="flex items-center gap-3.5 mb-6">
                      <div className="w-12 h-12 bg-brand-primary/20 text-brand-primary rounded-2xl flex items-center justify-center border border-brand-primary/25">
                        <Sparkles size={24} className="text-brand-accent animate-pulse" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight leading-tight">Assistant DUA & Calendrier Intelligent</h3>
                        <p className="text-slate-400 text-xs font-semibold">Recommandations intelligentes, prédictions d'échéances et simulations de cycle de vie</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                      {/* Left: AI/Smart Match Recommendation */}
                      <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/5 flex flex-col justify-between">
                        <div>
                          <p className="text-[10px] font-black tracking-widest text-brand-accent uppercase mb-3">Recherche & Diagnostic de Règle</p>
                          <p className="text-xs text-slate-300 leading-relaxed mb-4">
                            Saisissez de simples mots-clés ci-dessous pour trouver ou diagnostiquer instantanément la DUA standard ou dynamique applicable.
                          </p>
                          
                          <div className="relative mb-4">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                              type="text"
                              value={smartSearchQuery}
                              onChange={(e) => setSmartSearchQuery(e.target.value)}
                              placeholder="Ex: Facture, Audit, PV, personnel, contrat..."
                              className="w-full bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-xs font-bold text-white focus:outline-none transition-all placeholder:text-slate-500"
                            />
                          </div>

                          {smartSearchQuery && (
                            <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                              {(() => {
                                const q = smartSearchQuery.toLowerCase().trim();
                                // Merge database rules + static ones for searching
                                const combined = [...archivalDirectory];
                                RETENTION_CALENDAR.forEach(dir => {
                                  dir.rules.forEach(rule => {
                                    if (!combined.some(r => r.reference === rule.reference)) {
                                      combined.push({
                                        id: `std-${rule.reference}`,
                                        reference: rule.reference,
                                        title: rule.title,
                                        direction: dir.name,
                                        activeYears: parseInt(rule.active) || 5,
                                        semiActiveYears: parseInt(rule.semiActive) || 5,
                                        finalDisposition: rule.finalDisposition || 'EL',
                                        support: rule.support || 'Papier',
                                        retentionTrigger: rule.trigger || 'Clôture de l\'exercice'
                                      });
                                    }
                                  });
                                });

                                const matches = combined.filter(r => 
                                  r.title?.toLowerCase().includes(q) || 
                                  r.reference?.toLowerCase().includes(q) ||
                                  r.direction?.toLowerCase().includes(q)
                                ).slice(0, 3);

                                if (matches.length === 0) {
                                  return (
                                    <p className="text-[10px] text-slate-500 italic font-bold">Aucune règle correspondante trouvée. Essayez un autre mot-clé.</p>
                                  );
                                }

                                return matches.map(r => (
                                  <button
                                    key={r.id || r.reference}
                                    onClick={() => {
                                      setSimSelectedRuleId(r.id || `std-${r.reference}`);
                                      setSmartSearchQuery('');
                                    }}
                                    className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors flex items-center justify-between group"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <p className="text-[10px] font-black text-brand-accent uppercase truncate tracking-wider">{r.reference} — {r.direction}</p>
                                      <p className="text-xs font-bold text-white group-hover:text-brand-accent transition-colors truncate">{r.title}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <span className="text-[9px] font-black bg-white/10 text-slate-300 px-2 py-0.5 rounded-md">
                                        {r.activeYears} ans DUA
                                      </span>
                                    </div>
                                  </button>
                                ));
                              })()}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          <span>Intelligence DUA Active</span>
                          <span className="flex items-center gap-1.5 text-brand-accent">
                            <span className="w-2 h-2 rounded-full bg-brand-accent animate-pulse" />
                      Algorithme d'Aide à l'Archiviste
                          </span>
                        </div>
                      </div>

                      {/* Right: Lifecycle Interactive Simulator */}
                      <div className="bg-white/5 backdrop-blur-md rounded-3xl p-6 border border-white/5 flex flex-col justify-between">
                        <div>
                          <p className="text-[10px] font-black tracking-widest text-brand-primary uppercase mb-3">Simulateur de Cycle de Vie Temporel</p>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="text-[9px] font-black uppercase text-slate-400 pl-1">1. Date de Clôture</label>
                              <input
                                type="date"
                                value={simClosureDate}
                                onChange={(e) => setSimClosureDate(e.target.value)}
                                className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-black uppercase text-slate-400 pl-1">2. Règle Applicative</label>
                              <select
                                value={simSelectedRuleId}
                                onChange={(e) => setSimSelectedRuleId(e.target.value)}
                                className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all mt-1 cursor-pointer"
                              >
                                <option value="" className="text-slate-800">-- Choisir règle --</option>
                                {(() => {
                                  const list = [...archivalDirectory];
                                  RETENTION_CALENDAR.forEach(dir => {
                                    dir.rules.forEach(rule => {
                                      if (!list.some(r => r.reference === rule.reference)) {
                                        list.push({
                                          id: `std-${rule.reference}`,
                                          reference: rule.reference,
                                          title: rule.title,
                                          activeYears: parseInt(rule.active) || 5,
                                          semiActiveYears: parseInt(rule.semiActive) || 5,
                                          finalDisposition: rule.finalDisposition || 'EL',
                                          support: rule.support || 'Papier',
                                          retentionTrigger: rule.trigger || 'Clôture'
                                        });
                                      }
                                    });
                                  });
                                  return list.map(r => (
                                    <option key={r.id || r.reference} value={r.id || `std-${r.reference}`} className="text-slate-800 font-semibold fs-11">
                                      {r.reference} — {r.title.substring(0, 35)}...
                                    </option>
                                  ));
                                })()}
                              </select>
                            </div>
                          </div>

                          {/* Simulation Result */}
                          {(() => {
                            const selectedId = simSelectedRuleId;
                            if (!selectedId) {
                              return (
                                <div className="h-28 flex items-center justify-center border border-dashed border-white/10 rounded-2xl text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                  Sélectionnez un dossier & une règle à simuler
                                </div>
                              );
                            }

                            // Retrieve details
                            const list = [...archivalDirectory];
                            RETENTION_CALENDAR.forEach(dir => {
                              dir.rules.forEach(rule => {
                                if (!list.some(r => r.reference === rule.reference)) {
                                  list.push({
                                    id: `std-${rule.reference}`,
                                    reference: rule.reference,
                                    title: rule.title,
                                    activeYears: parseInt(rule.active) || 5,
                                    semiActiveYears: parseInt(rule.semiActive) || 5,
                                    finalDisposition: rule.finalDisposition || 'EL',
                                    support: rule.support || 'Papier',
                                    retentionTrigger: rule.trigger || 'Clôture'
                                  });
                                }
                              });
                            });

                            const rule = list.find(r => r.id === selectedId || `std-${r.reference}` === selectedId);
                            if (!rule) return null;

                            // Calculate phases
                            const baseD = new Date(simClosureDate);
                            if (isNaN(baseD.getTime())) return null;

                            const activeYears = Number(rule.activeYears);
                            const semiActiveYears = Number(rule.semiActiveYears);

                            const curDate = new Date(); // relative to today
                            const activeEndDate = new Date(baseD.getFullYear() + activeYears, baseD.getMonth(), baseD.getDate());
                            const semiActiveEndDate = new Date(activeEndDate.getFullYear() + semiActiveYears, activeEndDate.getMonth(), activeEndDate.getDate());

                            let phase: 'active' | 'semiActive' | 'expired' = 'active';
                            if (curDate >= semiActiveEndDate) {
                              phase = 'expired';
                            } else if (curDate >= activeEndDate) {
                              phase = 'semiActive';
                            }

                            return (
                              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-slate-300 uppercase">État temporel aujourd'hui :</span>
                                  <span className={cn(
                                    "text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider border",
                                    phase === 'active' ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" :
                                    phase === 'semiActive' ? "bg-amber-500/15 text-amber-300 border-amber-500/20" :
                                    "bg-red-500/15 text-red-300 border-red-500/20 animate-pulse"
                                  )}>
                                    {phase === 'active' ? '🟢 Phase Active (Archives Courantes)' :
                                     phase === 'semiActive' ? '🟡 Phase Archives Intermédiaires' :
                                     '🔴 Archives Échues (Sort Final)'}
                                  </span>
                                </div>

                                {/* Flow Timeline bar */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[8px] font-black text-slate-500 uppercase tracking-widest pl-1">
                                    <span>Clôture ({format(baseD, 'yyyy')})</span>
                                    <span>Fin Active ({format(activeEndDate, 'yyyy')})</span>
                                    <span>Sort Final ({format(semiActiveEndDate, 'yyyy')})</span>
                                  </div>
                                  <div className="h-2 bg-white/10 rounded-full overflow-hidden flex">
                                    <div className={cn("h-full", phase === 'active' ? "bg-emerald-500 w-1/3" : "bg-slate-700 w-1/3 border-r border-slate-900")} />
                                    <div className={cn("h-full", phase === 'semiActive' ? "bg-amber-400 w-1/3" : (phase === 'expired' ? "bg-slate-700 w-1/3" : "bg-transparent w-1/3"))} />
                                    <div className={cn("h-full", phase === 'expired' ? "bg-red-500 w-1/3" : "bg-transparent w-1/3")} />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-slate-300">
                                  <p>• Trigger Conservation : <strong className="text-white">{rule.retentionTrigger || 'Clôture'}</strong></p>
                                  <p className="text-right">• Sort Final : <strong className="text-white uppercase">{rule.finalDisposition === 'EL' ? 'Élimination (EL)' : rule.finalDisposition === 'CP' ? 'Conservation Permanente (CP)' : 'Tri (ECH)'}</strong></p>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="text-[8px] text-slate-500 text-right font-bold uppercase tracking-wider pt-2 mt-2 border-t border-white/5">
                          Formule Standardisée DUA / SIAF
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-sans">
                  {/* Left: Directions List */}
                  <div className="lg:col-span-4 bg-white/80 backdrop-blur-md border border-slate-150 rounded-[2rem] p-4 max-h-[700px] overflow-y-auto custom-scrollbar shadow-sm">
                    <p className="text-[10px] font-black tracking-widest text-slate-400 uppercase p-3 border-b border-slate-100 mb-2 flex justify-between items-center">
                      <span>Directions Organisationnelles</span>
                      <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[9px]">
                        {RETENTION_CALENDAR.length} départements
                      </span>
                    </p>
                    <div className="space-y-1">
                      {RETENTION_CALENDAR.map((d: any) => {
                        const dbRulesCount = archivalDirectory.filter(r => r.direction === d.name).length;
                        const isSelected = selectedCalendarDir === d.name || (!selectedCalendarDir && d.name === "Direction Commune");
                        return (
                          <button
                            key={d.code}
                            onClick={() => setSelectedCalendarDir(d.name)}
                            className={cn(
                              "w-full text-left p-3.5 rounded-2xl flex items-center justify-between transition-all group",
                              isSelected 
                                ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/25 font-bold" 
                                : "hover:bg-brand-secondary/50 text-slate-700 font-bold"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                                isSelected ? "bg-white/20 border-white/25 text-white" : "bg-slate-50 border-slate-100 text-slate-400 group-hover:bg-white"
                              )}>
                                <Building2 size={16} />
                              </div>
                              <span className="text-xs truncate">{d.name}</span>
                            </div>
                            <span className={cn(
                              "text-[9px] font-black px-2 py-0.5 rounded-full",
                              isSelected ? "bg-white/30 text-white" : "bg-slate-100 text-slate-400"
                            )}>
                              {dbRulesCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Document Classification in selected Direction */}
                  <div className="lg:col-span-8 space-y-4">
                    {(() => {
                      const activeDirName = selectedCalendarDir || "Direction Commune";
                      const activeRules = archivalDirectory.filter(r => r.direction === activeDirName);

                      return (
                        <div className="bg-white rounded-[2rem] border border-slate-150 shadow-sm overflow-hidden flex flex-col">
                          {/* Direction header banner */}
                          <div className="bg-gradient-to-r from-brand-primary to-brand-primary/80 px-8 py-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                              <h4 className="text-lg font-black tracking-tight">{activeDirName}</h4>
                              <p className="text-[10px] uppercase font-black tracking-widest text-white/60">
                                {activeRules.length} Type(s) de document identifié(s) dans le calendrier actuel
                              </p>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <Button
                                onClick={() => {
                                  setEditedRule({
                                    direction: activeDirName,
                                    reference: "",
                                    title: "",
                                    docType: "",
                                    activeYears: 5,
                                    semiActiveYears: 5,
                                    finalDisposition: "EL",
                                    support: "Papier",
                                    retentionTrigger: "Signature",
                                    isCritical: false,
                                    category: "Général"
                                  });
                                  setIsEditingRule(true);
                                }}
                                className="bg-white text-brand-primary hover:bg-slate-150 rounded-xl font-bold text-xs py-2 px-4 shadow-sm transition-all flex items-center gap-1 shrink-0 border border-transparent"
                              >
                                <Plus size={14} /> Ajouter une règle DUA
                              </Button>
                              <Button
                                onClick={() => handleDeleteDirection(activeDirName)}
                                disabled={activeRules.length === 0}
                                variant="ghost"
                                className="text-white hover:bg-white/10 p-2.5 rounded-xl text-xs disabled:opacity-35 border-none bg-transparent font-semibold flex items-center gap-1 shrink-0"
                                title="Supprimer tous les documents de cette direction"
                              >
                                <Trash2 size={13} /> Vider Direction
                              </Button>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Référence</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type Documentaire / Procédure</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">DUA (Actif)</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center font-semibold">DUA (Semi-actif)</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Sort Final</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {activeRules.map((rule: any) => (
                                  <tr key={rule.id} className="hover:bg-slate-50/40 transition-colors">
                                    <td className="px-6 py-4">
                                      <span className="text-xs font-black text-slate-900 bg-brand-secondary/50 border border-brand-primary/10 px-2.5 py-1 rounded-lg">
                                        {rule.reference}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                        <span>{rule.title}</span>
                                        {rule.isCritical === 1 && (
                                          <span className="bg-red-50 text-red-600 border border-red-100 text-[8px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider animate-pulse">
                                            Probant
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[9px] text-slate-400 font-medium mt-0.5 uppercase tracking-wider">
                                        Trigger: {rule.retentionTrigger || "Inconnu"} • Support: {rule.support || "Papier"}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-center text-xs font-bold text-slate-650">
                                      {rule.activeYears} ans
                                    </td>
                                    <td className="px-6 py-4 text-center text-xs font-bold text-slate-400">
                                      {rule.semiActiveYears} ans
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                      <span className={cn(
                                        "text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border",
                                        rule.finalDisposition === 'EL' ? "bg-red-50 text-red-600 border-red-100" :
                                        rule.finalDisposition === 'CP' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                        "bg-amber-50 text-amber-600 border-amber-100"
                                      )}>
                                        {rule.finalDisposition === 'EL' ? 'Élimination' : rule.finalDisposition === 'CP' ? 'Conservation' : 'Tri / Échant.'}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <div className="flex justify-end gap-1.5">
                                        <button
                                          onClick={() => {
                                            setEditedRule(rule);
                                            setIsEditingRule(true);
                                          }}
                                          className="p-2 text-slate-400 hover:text-brand-primary hover:bg-brand-secondary rounded-lg transition-colors"
                                          title="Modifier cette règle"
                                        >
                                          <Edit2 size={13} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteRule(rule.id)}
                                          className="p-2 text-slate-450 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Supprimer cette règle"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {activeRules.length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-slate-450 font-medium">
                                      <div className="max-w-sm mx-auto space-y-2">
                                        <p className="text-sm font-black text-slate-700">Aucun document configuré</p>
                                        <p className="text-slate-405 text-xs text-balance">
                                          Il n'y a pas encore de types de documents saisis pour la direction <strong className="text-slate-650">{activeDirName}</strong>. Utilisez le bouton ci-dessous pour ajouter un premier type.
                                        </p>
                                        <Button
                                          onClick={() => {
                                            setEditedRule({
                                              direction: activeDirName,
                                              reference: "",
                                              title: "",
                                              docType: "",
                                              activeYears: 5,
                                              semiActiveYears: 5,
                                              finalDisposition: "EL",
                                              support: "Papier",
                                              retentionTrigger: "Signature",
                                              isCritical: false,
                                              category: "Général"
                                            });
                                            setIsEditingRule(true);
                                          }}
                                          variant="ghost" 
                                          className="mt-4 border border-brand-primary/20 hover:bg-brand-secondary text-brand-primary text-[10px] font-black uppercase rounded-lg py-2 px-4 inline-flex items-center gap-1.5"
                                        >
                                          <Plus size={12} /> Écrire un règlement de conservation
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    )}

      {/* Live Request Filters (Hide in returns sub-tabs context if needed, but keeping for continuity) */}
      {(activeTab !== 'returns' && activeTab !== 'stats') && (
        <>
          {activeTab === 'requests' && (
            <div className="flex gap-2 mb-6 bg-slate-50 p-1.5 rounded-2xl w-fit mx-auto md:mx-0">
              <button
                onClick={() => setRequestSubTab('all')}
                className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${requestSubTab === 'all' ? 'bg-white text-brand-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Toutes les demandes
              </button>
              <button
                onClick={() => setRequestSubTab('signed')}
                className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${requestSubTab === 'signed' ? 'bg-white text-brand-primary shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <CheckCircle2 size={16} /> Demande Signés
              </button>
              <button
                onClick={() => setRequestSubTab('transfers')}
                className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all relative ${requestSubTab === 'transfers' ? 'bg-white text-brand-accent shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <FileStack size={16} /> Transferts
                {transferRequests.filter(r => r.status === 'En attente').length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center">
                    {transferRequests.filter(r => r.status === 'En attente').length}
                  </span>
                )}
              </button>
            </div>
          )}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
            <div className="flex flex-wrap items-center gap-4 flex-1 w-full">
          {(activeTab === 'communication' || activeTab === 'returns') ? (
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setFilterStatus('all')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  filterStatus === 'all' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                TOUS
              </button>
              <button 
                onClick={() => setFilterStatus('En cours')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  filterStatus === 'En cours' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                EN COURS
              </button>
              <button 
                onClick={() => setFilterStatus('Retourné')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  filterStatus === 'Retourné' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                RETOURNÉS
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-gray-400" />
              <select 
                className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">Tous les Statuts</option>
                <optgroup label="Canal Agent">
                  <option value="pending">En attente</option>
                  <option value="signed">Signé</option>
                </optgroup>
                <optgroup label="Canal Distance">
                  <option value="En attente">En attente</option>
                  <option value="En cours">En cours</option>
                  <option value="Prêt / Communiqué">Prêt</option>
                  <option value="Refusé">Refusé</option>
                </optgroup>
              </select>
            </div>
          )}

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <Input 
              placeholder="Tapez ici pour rechercher (Réf, Demandeur, Type...)" 
              className="pl-12 border-slate-200 focus:ring-slate-400 rounded-2xl"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {(activeTab === 'communication' || activeTab === 'returns') && (
              <span className="absolute -bottom-4 right-0 text-[10px] text-green-600 font-bold bg-green-50 px-2 rounded-full border border-green-100">
                {filteredRequests.length} lignes affichées
              </span>
            )}
          </div>
          
          {activeTab === 'communication' && (
            <div className="flex gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImportExcel} 
                accept=".xlsx, .xls" 
                className="hidden" 
              />
              <Button 
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="bg-white border text-slate-700 border-slate-200 hover:bg-slate-50 rounded-2xl px-4 py-2 flex items-center gap-2 shrink-0 shadow-sm"
              >
                <FileSpreadsheet size={18} className="text-slate-500" />
                <span className="hidden sm:inline font-bold text-xs uppercase">Import</span>
              </Button>
              <Button 
                onClick={async () => {
                  const count = archivedComms.length;
                  if (window.confirm(`ATTENTION: Cette action va SUPPRIMER DÉFINITIVEMENT TOUT l'historique importé (${count} lignes). Les dossiers en cours de communication resteront. Voulez-vous continuer ?`)) {
                    try {
                      setImporting(true);
                      const response = await api.post('/api/archives/clear', {});
                      if (response.success) {
                        setArchivedComms([]);
                        alert('L\'historique importé a été vidé avec succès.');
                      } else {
                        alert('Erreur: ' + (response.error || 'Le serveur n\'a pas pu vider la liste.'));
                      }
                      setImporting(false);
                    } catch (err: any) {
                      setImporting(false);
                      console.error('Clear error:', err);
                      const errorMsg = err.response?.data?.error || err.message || 'Erreur inconnue';
                      alert(`Erreur lors de la suppression: ${errorMsg}`);
                    }
                  }
                }}
                disabled={importing}
                className={cn(
                  "bg-red-600 text-white hover:bg-red-700 rounded-2xl px-6 py-2 flex items-center gap-2 shrink-0 shadow-lg shadow-red-200 transition-all active:scale-95",
                  importing && "opacity-50 cursor-not-allowed animate-pulse"
                )}
              >
                <Trash2 size={18} />
                <span className="hidden sm:inline font-bold text-xs uppercase tracking-tighter">
                  {importing ? 'Suppression...' : 'Supprimer Tout (Archives)'}
                </span>
              </Button>
            </div>
          )}
          </div>
        </div>

        <Card className="overflow-hidden p-0 border-none shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              {(activeTab === 'communication' || activeTab === 'returns') ? (
                <tr>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">REF / BOITE</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">nom de demandeur</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">date de communication</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Référence</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">date de retour</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Statut</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">ACTION</th>
                </tr>
              ) : activeTab === 'requests' && requestSubTab === 'signed' ? (
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">ID / Référence</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Nom & Prénom</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Référence Demandée</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Date Signature</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Signature</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              ) : activeTab === 'requests' && requestSubTab === 'transfers' ? (
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">N° Demande</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Type / Direction</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Demandeur</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Volume (Boxes/Doss)</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Statut</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Demande</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Demandeur</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Références</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Statut</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
              {filteredRequests.map(req => {
                if (activeTab === 'communication' || activeTab === 'returns') {
                  const dateCommStr = req.dateCommunication;
                  const dateComm = dateCommStr ? new Date(dateCommStr) : null;
                  const dateRetStr = req.dateRetour;
                  
                  // Use demandNumber for 'Référence' column in live requests
                  // For archives it might already be in 'reference'
                  const reference = req.demandNumber || req.reference || '-';

                  // REF / BOITE logic
                  // req.intitule contains the single individual reference from the expansion logic
                  const parts = [req.intitule, req.boite].filter(Boolean);
                  const refBoite = parts.length > 0 ? parts.join(' / ') : '-';

                  // Specific highlights from the image
                  const highlightClass = req.highlightColor === 'orange' ? 'bg-[#f4b084] text-black' :
                                       req.highlightColor === 'purple' ? 'bg-[#7030a0] text-white' :
                                       req.highlightColor === 'green' ? 'bg-[#375623] text-white' : 
                                       'hover:bg-gray-50/50';

                  const borderClass = req.highlightColor ? 'border-black/10' : 'border-gray-100';
                  const textClass = req.highlightColor ? (req.highlightColor === 'orange' ? 'text-black' : 'text-white') : 'text-slate-600';

                  return (
                    <tr key={req.virtualId} className={cn("transition-colors border-b", highlightClass, borderClass)}>
                      <td className="px-6 py-3 font-bold border-r border-gray-100">{refBoite}</td>
                      <td className={cn("px-6 py-3 border-r border-gray-100", req.highlightColor ? textClass : "text-slate-600")}>{req.nomDemandeur || req.nom || '-'}</td>
                      <td className={cn("px-6 py-3 border-r border-gray-100", req.highlightColor ? textClass : "text-slate-600")}>
                        {dateComm && !isNaN(dateComm.getTime()) ? format(dateComm, 'dd/MM/yyyy') : (dateCommStr || '-')}
                      </td>
                      <td className={cn("px-6 py-3 border-r border-gray-100", req.highlightColor ? textClass : "text-slate-600")}>{reference}</td>
                      <td className={cn("px-6 py-3 border-r border-gray-100 italic font-medium", req.highlightColor ? textClass : "text-slate-400")}>
                        {req.type || 'Sinistre'}
                      </td>
                      <td className={cn("px-6 py-3 border-r border-gray-100 font-medium", req.highlightColor ? textClass : "text-slate-600")}>
                        {dateRetStr || '-'}
                      </td>
                      <td className="px-6 py-3 border-r border-gray-100">
                        {req.status === 'returned' || req.status === 'Retourné' || dateRetStr ? (
                          <div className="flex items-center gap-1">
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-lg text-[9px] font-black border border-green-200 uppercase tracking-tighter">
                              RETOURNÉ
                            </span>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-black border border-amber-200 uppercase tracking-tighter">
                            EN COURS
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => {
                              // Find the inventory item for this reference to get localisation if possible
                              const invItem = returnInventory.find(i => i.reference === req.intitule);
                              setValidatedItemLabel({
                                reference: req.intitule,
                                numBoite: req.boite || 'N/A',
                                localisation: invItem?.localisation || 'N/A',
                                barcodeData: `${req.boite || 'N/A'}-${invItem?.localisation || 'N/A'}`
                              });
                              setActiveTab('returns');
                              setReturnSubTab('search');
                            }}
                            className={cn("p-1.5 transition-colors", req.highlightColor ? "text-white/60 hover:text-white" : "text-slate-300 hover:text-green-600")}
                            title="Imprimer l'étiquette"
                          >
                            <Printer size={16} />
                          </button>
                          {activeTab === 'returns' && !dateRetStr && (
                            <button 
                              onClick={() => handleReturn(req)} 
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-sm",
                                req.highlightColor ? "bg-white/20 text-white hover:bg-white/30" : "bg-green-600 text-white hover:bg-green-700 shadow-green-100"
                              )}
                            >
                              <RotateCcw size={14} />
                              VALIDER RETOUR
                            </button>
                          )}
                          <button onClick={() => handleDelete(req.id)} className={cn("p-1.5 transition-colors", req.highlightColor ? "text-white/60 hover:text-white" : "text-slate-300 hover:text-red-500")}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                if (activeTab === 'requests' && requestSubTab === 'signed') {
                  const safeDate = toSafeDate(req.updatedAt || req.createdAt);
                  return (
                    <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">{req.demandNumber || req.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-gray-400 font-medium uppercase truncate max-w-[150px]">
                            {req.title || req.intitule || req.motif || 'Sans titre'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="font-bold text-gray-700 uppercase">{req.requesterName || req.nomDemandeur || req.nom}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-brand-primary">
                        {Array.isArray(req.references) ? req.references[0] : (req.reference || '-')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {safeDate ? format(safeDate, 'dd/MM/yyyy') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {(req.signatureURL || req.signatureUrl || req.signatureData) ? (
                          <div className="w-24 h-12 bg-slate-50 rounded border border-slate-100 flex items-center justify-center p-1 overflow-hidden">
                             <img 
                               src={req.signatureURL || req.signatureUrl || req.signatureData} 
                               alt="Signature" 
                               className="max-w-full max-h-full object-contain"
                               referrerPolicy="no-referrer"
                             />
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-bold uppercase italic">Numérique</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setViewingRequest(req)}
                            className="bg-brand-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-brand-primary/20 hover:opacity-90 transition-all flex items-center gap-2"
                          >
                            <FileText size={14} /> BORDEREAU
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (activeTab === 'requests' && requestSubTab === 'transfers') {
                  const safeDate = toSafeDate(req.createdAt);
                  return (
                    <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">{req.demandNumber || req.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-gray-400 font-medium uppercase">
                            {safeDate ? format(safeDate, 'dd/MM/yyyy HH:mm') : '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-700 uppercase">{req.documentType}</span>
                          <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 uppercase">
                            <Building2 size={10} /> {req.direction}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-700">{req.requester}</span>
                          <span className="text-xs text-gray-400">{req.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-600">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1" title="Boîtes"><FileStack size={14} className="text-orange-400" /> {req.boxes || 0}</span>
                          <span className="flex items-center gap-1" title="Dossiers"><FileText size={14} className="text-blue-400" /> {req.folders || 0}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider",
                          req.status === 'Traitée' || req.status === 'Validée' ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' :
                          req.status === 'En attente' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                          req.status === 'Rejetée' ? 'bg-red-50 text-red-600 border-red-100' :
                          'bg-slate-100 text-slate-500 border-slate-200'
                        )}>
                          {req.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {req.status === 'En attente' && (
                            <>
                              <button 
                                onClick={() => handleUpdateTransferStatus(req.id, 'Validée')}
                                className="p-1.5 text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-all"
                                title="Valider le transfert"
                              >
                                <CheckCircle size={18} />
                              </button>
                              <button 
                                onClick={() => handleUpdateTransferStatus(req.id, 'Rejetée')}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="Rejeter le transfert"
                              >
                                <XCircle size={18} />
                              </button>
                            </>
                          )}
                          {req.hasInventory && (
                             <button 
                               onClick={() => alert("L'inventaire est lié à cette demande.")}
                               className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                               title="Voir Inventaire"
                             >
                               <FileSpreadsheet size={18} />
                             </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 lowercase first-letter:uppercase">
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-900 truncate max-w-[150px]">{req.title || req.intitule || req.motif || 'Sans titre'}</span>
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-tight">
                        {req.references ? 'Agent' : req.isImported ? 'Archive' : 'Distance'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-700">{req.requesterName || req.nomDemandeur || req.nom}</span>
                      <span className="text-xs text-gray-400">{req.requesterEmail || req.emailDemandeur || req.email}</span>
                      {req.service && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Building2 size={10} /> {req.service}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(req.references) ? req.references : (req.reference ? [req.reference] : [])).slice(0, 2).map((ref: string, i: number) => (
                        <span key={i} className="text-[10px] bg-white border border-gray-100 px-2 py-0.5 rounded-full text-gray-500 shadow-sm">{ref}</span>
                      ))}
                      {(Array.isArray(req.references) ? req.references.length : (req.reference ? 1 : 0)) > 2 && 
                        <span className="text-[10px] text-gray-400">
                          +{(Array.isArray(req.references) ? req.references.length : 1) - 2}
                        </span>
                      }
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-gray-500 font-medium">
                        {toSafeDate(req.createdAt || req.dateSouhaitee) ? format(toSafeDate(req.createdAt || req.dateSouhaitee)!, 'dd/MM/yyyy') : '...'}
                      </p>
                      {req.priorite && (
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter",
                          req.priorite === 'Urgente' ? 'bg-red-50 text-red-600' : 'bg-brand-primary/10 text-brand-primary'
                        )}>
                          {req.priorite}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider",
                      req.status === 'signed' || req.status === 'Prêt / Communiqué' ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20' :
                      req.status === 'pending' || req.status === 'En attente' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      req.status === 'En cours' ? 'bg-brand-primary/20 text-brand-primary border-brand-primary/30' :
                      req.status === 'Refusé' ? 'bg-red-50 text-red-600 border-red-100' :
                      'bg-slate-100 text-slate-500 border-slate-200'
                    )}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                       {(req.status === 'signed' || req.status === 'Prêt / Communiqué') && (
                        <button 
                          onClick={() => setViewingRequest(req)}
                          className="p-2 text-brand-primary hover:bg-brand-primary/10 rounded-xl transition-all"
                          title="Voir le bordereau"
                        >
                          <Eye size={16} />
                        </button>
                      )}
                      {!req.references && !req.isImported ? (
                        <div className="flex items-center gap-1">
                           <button 
                             onClick={() => handleUpdateRemoteStatus(req.id, 'En cours', req.email, req.nom)}
                             className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                             title="En cours"
                           >
                             <RotateCcw size={16} />
                           </button>
                           <button 
                             onClick={() => handleUpdateRemoteStatus(req.id, 'Prêt / Communiqué', req.email, req.nom)}
                             className="p-1.5 text-slate-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-all"
                             title="Prêt"
                           >
                             <CheckCircle size={16} />
                           </button>
                           <button 
                             onClick={() => handleUpdateRemoteStatus(req.id, 'Refusé', req.email, req.nom)}
                             className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                             title="Refuser"
                           >
                             <XCircle size={16} />
                           </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(req)} className="p-2 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-xl transition-all">
                          <Edit2 size={16} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(req.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </Card>
      </>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editingId && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900">Modifier la demande</h2>
                <button onClick={() => setEditingId(null)} className="p-2 text-gray-400 hover:bg-white rounded-full">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Titre</label>
                  <Input 
                    value={editForm.title || editForm.intitule || editForm.motif} 
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nom du demandeur</label>
                  <Input 
                    value={editForm.requesterName || editForm.nom} 
                    onChange={(e) => setEditForm({ ...editForm, requesterName: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Email du demandeur</label>
                  <Input 
                    value={editForm.requesterEmail || editForm.email} 
                    onChange={(e) => setEditForm({ ...editForm, requesterEmail: e.target.value })} 
                  />
                </div>
              </div>
              <div className="p-6 bg-gray-50 border-t border-gray-100">
                <Button className="w-full" onClick={handleUpdate}>
                  <Save size={18} className="mr-2" /> Enregistrer les modifications
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Signed Bordereau Modal */}
      <AnimatePresence>
        {viewingRequest && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-brand-primary">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white">
                      <FileText size={20} />
                   </div>
                   <div>
                      <h2 className="text-xl font-bold text-white">Détails du Bordereau</h2>
                      <p className="text-white/60 text-xs uppercase tracking-widest">Demande #{viewingRequest.id?.slice(0, 8)}</p>
                   </div>
                </div>
                <button onClick={() => setViewingRequest(null)} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-all">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {viewingRequest.rawData ? (
                  /* Mass Inventory Detail View */
                  <div className="space-y-8">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Référence Dossier</p>
                        {isEditingDetail ? (
                          <Input 
                            className="h-10 text-xl font-bold uppercase tracking-tighter"
                            value={editedDetailItem.reference}
                            onChange={(e) => setEditedDetailItem({...editedDetailItem, reference: e.target.value})}
                          />
                        ) : (
                          <p className="text-slate-800 font-black text-3xl tracking-tighter uppercase">{viewingRequest.reference || "N/A"}</p>
                        )}
                      </div>
                      {!isEditingDetail && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-4"
                          onClick={() => setIsEditingDetail(true)}
                        >
                          Modifier
                        </Button>
                      )}
                      <div className="text-right space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Statut Archivistique</p>
                        <div className="flex justify-end pt-1">
                           {viewingRequest.archivalStatus === 'Expired' && <span className="bg-rose-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase">Échu ({viewingRequest.expiryDate})</span>}
                           {viewingRequest.archivalStatus === 'SemiActive' && <span className="bg-brand-accent text-white px-3 py-1 rounded-full text-[10px] font-black uppercase">Semi-Actif</span>}
                           {viewingRequest.archivalStatus === 'Active' && <span className="bg-brand-primary text-white px-3 py-1 rounded-full text-[10px] font-black uppercase">Actif</span>}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
                       <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Intitulé / Objet</p>
                          {isEditingDetail ? (
                            <textarea 
                              className="w-full bg-white border border-slate-200 rounded-xl p-2 text-sm font-bold text-slate-700 focus:ring-brand-accent min-h-[80px]"
                              value={editedDetailItem.intitule}
                              onChange={(e) => setEditedDetailItem({...editedDetailItem, intitule: e.target.value})}
                            />
                          ) : (
                            <p className="text-slate-700 font-bold text-sm leading-tight">{viewingRequest.intitule || "-"}</p>
                          )}
                       </div>
                       <div className="space-y-4">
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emplacement / Boite</p>
                            {isEditingDetail ? (
                              <div className="flex gap-2">
                                <Input 
                                  placeholder="Localisation"
                                  className="flex-1 h-10 text-sm font-bold"
                                  value={editedDetailItem.localisation}
                                  onChange={(e) => setEditedDetailItem({...editedDetailItem, localisation: e.target.value})}
                                />
                                <Input 
                                  placeholder="Boite"
                                  className="w-24 h-10 text-sm font-bold"
                                  value={editedDetailItem.numBoite}
                                  onChange={(e) => setEditedDetailItem({...editedDetailItem, numBoite: e.target.value})}
                                />
                              </div>
                            ) : (
                              <p className="text-slate-700 font-bold text-sm">{viewingRequest.localisation || "N/A"} (Boite: {viewingRequest.numBoite || "-"})</p>
                            )}
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Référence</p>
                            {isEditingDetail ? (
                              <Input 
                                className="h-10 text-sm font-bold"
                                value={editedDetailItem.reference}
                                onChange={(e) => setEditedDetailItem({...editedDetailItem, reference: e.target.value})}
                              />
                            ) : (
                              <p className="text-slate-700 font-bold text-sm">{viewingRequest.reference || "-"}</p>
                            )}
                          </div>
                       </div>
                       <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dates Clé</p>
                          {isEditingDetail ? (
                             <div className="space-y-2">
                               <div className="flex items-center gap-2">
                                 <span className="text-[9px] font-bold text-slate-400 w-16">Fin/Clôt.</span>
                                 <Input 
                                   className="h-8 text-xs font-bold"
                                   value={editedDetailItem.dateCloture || editedDetailItem.dateFin || ""}
                                   onChange={(e) => setEditedDetailItem({...editedDetailItem, dateCloture: e.target.value, dateFin: e.target.value})}
                                 />
                               </div>
                               <div className="flex items-center gap-2">
                                 <span className="text-[9px] font-bold text-slate-400 w-16">Début</span>
                                 <Input 
                                   className="h-8 text-xs font-bold"
                                   value={editedDetailItem.dateDebut || ""}
                                   onChange={(e) => setEditedDetailItem({...editedDetailItem, dateDebut: e.target.value})}
                                 />
                               </div>
                             </div>
                          ) : (
                            <p className="text-slate-700 font-bold text-sm">Fin/Clôture: {viewingRequest.dateCloture || viewingRequest.dateFin || "Inconnue"}</p>
                          )}
                       </div>
                       <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Source (Direction)</p>
                          {isEditingDetail ? (
                            <select 
                              className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-sm font-bold text-slate-700 focus:ring-orange-500"
                              value={editedDetailItem.direction}
                              onChange={(e) => setEditedDetailItem({...editedDetailItem, direction: e.target.value, ruleId: null})}
                            >
                              <option value="">Sélectionner une direction...</option>
                              {RETENTION_CALENDAR.map(dir => (
                                <option key={dir.name} value={dir.name}>{dir.name}</option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-slate-700 font-bold text-sm uppercase">{viewingRequest.direction || "Inconnue"}</p>
                          )}
                       </div>
                       <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Code Documentaire</p>
                          {isEditingDetail ? (
                            <select 
                              className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-sm font-bold text-slate-700 focus:ring-orange-500"
                              value={editedDetailItem.ruleId || ""}
                              onChange={(e) => setEditedDetailItem({...editedDetailItem, ruleId: e.target.value})}
                            >
                              <option value="">Sélectionner un code...</option>
                              {archivalDirectory
                                .filter(r => !editedDetailItem.direction || r.direction === editedDetailItem.direction)
                                .map(rule => (
                                  <option key={rule.id} value={rule.id}>{rule.reference} - {rule.title}</option>
                                ))
                              }
                            </select>
                          ) : (
                            <p className="text-slate-700 font-bold text-sm">
                              {archivalDirectory.find(r => r.id === viewingRequest.ruleId)?.reference || "Non lié"}
                            </p>
                          )}
                       </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-slate-100"></div>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Données Originales Excel</span>
                        <div className="h-px flex-1 bg-slate-100"></div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {(() => {
                           try {
                             const raw = JSON.parse(viewingRequest.rawData);
                             return Object.entries(raw).map(([key, value]) => {
                               if (!value || key === 'reference' || key === 'intitule') return null;
                               return (
                                 <div key={key} className="p-3 bg-white border border-slate-100 rounded-xl shadow-xs">
                                   <p className="text-[9px] font-bold text-slate-400 uppercase truncate" title={key}>{key}</p>
                                   <p className="text-[11px] font-black text-slate-700 truncate" title={String(value)}>{formatExcelDate(value)}</p>
                                 </div>
                               );
                             });
                           } catch (e) {
                             return <p className="text-slate-400 italic text-xs col-span-full">Données brutes non disponibles.</p>;
                           }
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Request Detail View (Default) */
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Intitulé / Motif</p>
                          <p className="text-slate-800 font-bold text-lg leading-tight">{viewingRequest.title || viewingRequest.intitule || viewingRequest.motif}</p>
                       </div>
                       <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Demandeur</p>
                          <p className="text-slate-800 font-bold">{viewingRequest.requesterName || viewingRequest.nom}</p>
                          <p className="text-slate-500 text-xs">{viewingRequest.requesterEmail || viewingRequest.email}</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                       <div className="space-y-4">
                          <div className="space-y-1">
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Références demandées</p>
                             <div className="flex flex-wrap gap-2 pt-2">
                               {(Array.isArray(viewingRequest.references) ? viewingRequest.references : [viewingRequest.reference]).map((ref: string, i: number) => (
                                 <span key={i} className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-sm font-bold border border-slate-200">
                                   {ref}
                                 </span>
                               ))}
                             </div>
                          </div>
                          
                          <div className="p-4 bg-brand-primary/10 border border-brand-primary/20 rounded-2xl flex items-start gap-3">
                             <CheckCircle2 className="text-brand-primary shrink-0" size={18} />
                             <div>
                                <p className="text-xs font-bold text-brand-primary uppercase tracking-tight">Statut Final</p>
                                <p className="text-brand-primary text-sm font-medium">Communiqué et signé le {toSafeDate(viewingRequest.updatedAt || viewingRequest.createdAt) ? format(toSafeDate(viewingRequest.updatedAt || viewingRequest.createdAt)!, 'dd/MM/yyyy à HH:mm') : '...'}</p>
                             </div>
                          </div>
                       </div>

                       <div className="space-y-1 text-center md:text-left">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Signature du demandeur</p>
                          <div className="border-2 border-slate-200 rounded-2xl p-4 bg-slate-50 flex items-center justify-center min-h-[150px]">
                             {(viewingRequest.signatureURL || viewingRequest.signatureUrl || viewingRequest.signatureData) ? (
                                <img 
                                  src={viewingRequest.signatureURL || viewingRequest.signatureUrl || viewingRequest.signatureData} 
                                  alt="Signature" 
                                  className="max-w-full max-h-[140px] object-contain mix-blend-multiply" 
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="text-slate-300 flex flex-col items-center gap-2">
                                   <PencilLine size={32} />
                                   <p className="text-xs font-bold italic">Aucune signature visuelle</p>
                                </div>
                             )}
                          </div>
                          <p className="text-[9px] text-slate-400 mt-2 text-center uppercase tracking-tighter">Signé électroniquement via Flowix Archives</p>
                       </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                {isEditingDetail ? (
                  <>
                    <Button 
                      variant="outline"
                      className="flex-1" 
                      onClick={() => setIsEditingDetail(false)}
                      disabled={isSearchingLoc}
                    >
                      Annuler
                    </Button>
                    <Button 
                      className="flex-1 bg-orange-600 hover:bg-orange-700" 
                      onClick={handleUpdateMassItem}
                      disabled={isSearchingLoc}
                    >
                      {isSearchingLoc ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <Save size={18} className="mr-2" /> Enregistrer
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      className="flex-1 bg-slate-800 hover:bg-slate-900" 
                      onClick={() => setViewingRequest(null)}
                    >
                      Fermer
                    </Button>
                    {viewingRequest.pdfUrl ? (
                      <Button 
                        className="flex-1 bg-green-600"
                        onClick={() => window.open(viewingRequest.pdfUrl, '_blank')}
                      >
                        Télécharger PDF
                      </Button>
                    ) : (
                      <Button 
                        className="flex-1 bg-blue-600"
                        onClick={() => {
                           const doc = new jsPDF();
                       
                       // Define colors
                       const greenColor: [number, number, number] = [76, 124, 56]; // Approximate MAE Green
                       const grayHeader: [number, number, number] = [180, 180, 180];
                       
                       // Header Banner
                       doc.setFillColor(greenColor[0], greenColor[1], greenColor[2]);
                       doc.rect(10, 10, 190, 20, 'F');
                       
                       doc.setTextColor(255, 255, 255);
                       doc.setFontSize(14);
                       doc.text("BORDEREAU DE COMMUNICATION ET DE PRET DE DOCUMENTS", 105, 22, { align: 'center' });

                       // Demandeur Table
                       const name = viewingRequest.requesterName || viewingRequest.nomDemandeur || viewingRequest.nom || "-";
                       const typeDoc = viewingRequest.typeDocument || viewingRequest.type || "-";
                       const email = viewingRequest.emailDemandeur || viewingRequest.email || "-";
                       const dateStr = format(new Date(), 'dd/MM/yyyy');

                       autoTable(doc, {
                         startY: 55,
                         head: [['DEMANDEUR', '', dateStr]],
                         body: [
                           ['Nom et Prénom', `: ${name}`, ''],
                           ['Type de document', `: ${typeDoc}`, ''],
                           ['Email', `: ${email}`, '']
                         ],
                         theme: 'grid',
                         headStyles: { 
                           fillColor: grayHeader, 
                           textColor: [0, 0, 0], 
                           fontStyle: 'bold',
                           halign: 'left'
                         },
                         columnStyles: {
                           0: { cellWidth: 40, fontStyle: 'bold' },
                           1: { cellWidth: 110 },
                           2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
                         },
                         styles: { fontSize: 9, cellPadding: 2 }
                       });

                       // Documents List Table
                       const docsList = [];
                       const refs = Array.isArray(viewingRequest.references) ? viewingRequest.references : [viewingRequest.reference];
                       const motif = viewingRequest.title || viewingRequest.intitule || viewingRequest.motif || "-";
                       
                       refs.filter(Boolean).forEach((ref, index) => {
                         docsList.push([
                           index + 1,
                           ref,
                           typeDoc,
                           dateStr,
                           '' // Date retour empty
                         ]);
                       });

                       autoTable(doc, {
                         startY: (doc as any).lastAutoTable.finalY + 15,
                         head: [['No', 'Intitule', 'Type Document', 'Date com', 'Date retour']],
                         body: docsList,
                         theme: 'grid',
                         headStyles: { 
                           fillColor: grayHeader, 
                           textColor: [0, 0, 0], 
                           fontStyle: 'normal',
                           halign: 'center'
                         },
                         columnStyles: {
                           0: { halign: 'center', cellWidth: 15, fontStyle: 'bold' },
                           1: { halign: 'center', cellWidth: 40 },
                           2: { halign: 'center', cellWidth: 45 },
                           3: { halign: 'center', cellWidth: 40, fontStyle: 'bold' },
                           4: { halign: 'center', cellWidth: 40 }
                         },
                         styles: { fontSize: 9, cellPadding: 3 }
                       });

                       // Signature Section
                       const finalY = (doc as any).lastAutoTable.finalY + 30;
                       doc.setTextColor(0, 0, 0);
                       doc.setFontSize(10);
                       doc.setFont("helvetica", "bold");
                       doc.text("Signature - Relais d'archives de l'unité", 20, finalY);
                       doc.text("émettrice", 20, finalY + 5);

                       const sig = viewingRequest.signatureURL || viewingRequest.signatureUrl || viewingRequest.signatureData;
                       if (sig) {
                         try {
                           const formatImg = sig.includes('jpeg') || sig.includes('jpg') ? 'JPEG' : 'PNG';
                           doc.addImage(sig, formatImg, 20, finalY + 10, 50, 25);
                         } catch (e) {
                           console.error("Signature image error:", e);
                         }
                       }

                       doc.save(`Bordereau_${viewingRequest.id.slice(0, 8)}.pdf`);
                    }}
                  >
                    Générer Bordereau PDF
                  </Button>
                )}
              </>
            )}
          </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rule Editing Modal */}
      <AnimatePresence>
        {isEditingRule && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-sans">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingRule(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center">
                      <Library size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                        {editedRule?.id ? 'Modifier la Règle' : 'Nouvelle Règle de Conservation'}
                      </h3>
                      <p className="text-xs font-bold text-slate-400">Configuration des délais et du sort final.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsEditingRule(false)}
                    className="w-10 h-10 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5 col-span-full">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Intitulé de la Série / Type Documentaire</label>
                    <Input 
                      value={editedRule?.title || ''}
                      onChange={(e) => setEditedRule({ ...editedRule, title: e.target.value })}
                      placeholder="Ex: Dossiers du Personnel, Factures Fournisseurs..."
                      className="h-12 border-slate-100 bg-slate-50/50 rounded-2xl font-bold focus:ring-orange-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Référence (Code)</label>
                    <Input 
                      value={editedRule?.reference || ''}
                      onChange={(e) => setEditedRule({ ...editedRule, reference: e.target.value })}
                      placeholder="Ex: R.H. 01"
                      className="h-12 border-slate-100 bg-slate-50/50 rounded-2xl font-bold focus:ring-orange-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Direction</label>
                    <select 
                      value={editedRule?.direction || ''}
                      onChange={(e) => setEditedRule({ ...editedRule, direction: e.target.value })}
                      className="w-full h-12 bg-slate-50/50 border border-slate-100 rounded-2xl px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="">Sélectionner...</option>
                      {RETENTION_CALENDAR.map(d => (
                        <option key={d.code} value={d.name}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Durée d'Utilité Administrative (DUA)</label>
                    <Input 
                      type="number"
                      value={editedRule?.activeYears || ''}
                      onChange={(e) => setEditedRule({ ...editedRule, activeYears: e.target.value })}
                      placeholder="Ans"
                      className="h-12 border-slate-100 bg-slate-50/50 rounded-2xl font-bold focus:ring-orange-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Délai Semi-Actif (Archives)</label>
                    <Input 
                      type="number"
                      value={editedRule?.semiActiveYears || ''}
                      onChange={(e) => setEditedRule({ ...editedRule, semiActiveYears: e.target.value })}
                      placeholder="Ans"
                      className="h-12 border-slate-100 bg-slate-50/50 rounded-2xl font-bold focus:ring-orange-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Sort Final</label>
                    <select 
                      value={editedRule?.finalDisposition || 'EL'}
                      onChange={(e) => setEditedRule({ ...editedRule, finalDisposition: e.target.value })}
                      className="w-full h-12 bg-slate-50/50 border border-slate-100 rounded-2xl px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="EL">EL (Élimination)</option>
                      <option value="CP">CP (Conservation Permanente)</option>
                      <option value="ECH">ECH (Échantillonnage)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Support</label>
                    <select 
                      value={editedRule?.support || 'Papier'}
                      onChange={(e) => setEditedRule({ ...editedRule, support: e.target.value })}
                      className="w-full h-12 bg-slate-50/50 border border-slate-100 rounded-2xl px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="Papier">Papier</option>
                      <option value="Numérique">Numérique</option>
                      <option value="Hybride">Hybride</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Catégorie</label>
                    <select 
                      value={editedRule?.category || 'Général'}
                      onChange={(e) => setEditedRule({ ...editedRule, category: e.target.value })}
                      className="w-full h-12 bg-slate-50/50 border border-slate-100 rounded-2xl px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="Général">Général</option>
                      <option value="Juridique">Juridique</option>
                      <option value="Financier">Financier</option>
                      <option value="RH">RH</option>
                      <option value="Technique">Technique</option>
                      <option value="Médical">Médical</option>
                      <option value="Commercial">Commercial</option>
                      <option value="Logistique">Logistique</option>
                    </select>
                  </div>

                  <div className="col-span-full pt-2">
                    <label className="flex items-center gap-3 cursor-pointer p-4 bg-red-50/50 rounded-2xl border border-red-100 hover:bg-red-50 transition-all">
                      <input 
                        type="checkbox"
                        checked={editedRule?.isCritical || false}
                        onChange={(e) => setEditedRule({ ...editedRule, isCritical: e.target.checked })}
                        className="w-5 h-5 rounded-lg border-red-300 text-red-600 focus:ring-red-500"
                      />
                      <div>
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Document Critique / Probant</p>
                        <p className="text-[10px] text-red-400 font-medium leading-none mt-0.5">Marque ce document comme ayant une importance vitale ou légale élevée.</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="pt-6 flex gap-3">
                  <Button 
                    onClick={() => setIsEditingRule(false)}
                    variant="ghost" 
                    className="flex-1 font-bold text-slate-400 py-3 rounded-2xl"
                  >
                    Annuler
                  </Button>
                  <Button 
                    onClick={() => handleSaveRule(editedRule)}
                    className="flex-[2] bg-slate-900 text-white hover:bg-slate-800 py-3 rounded-2xl font-black text-xs tracking-widest uppercase shadow-xl shadow-slate-200"
                  >
                    Confirmer l'Enregistrement
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Quick Import Rule */}
      <AnimatePresence>
        {isAddingImportRule && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden p-10 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-accent/10 text-brand-accent rounded-2xl flex items-center justify-center">
                    <Plus size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-tight">NOUVELLE RÈGLE DUA</h3>
                    <p className="text-slate-400 text-xs font-medium">Ajout direct pour l'import d'inventaire</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAddingImportRule(false)}
                  className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveImportRule} className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Direction</label>
                  <input 
                    type="text"
                    disabled
                    value={newImportRule.direction}
                    className="w-full bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-505 focus:outline-none font-sans"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Code / Réf (Obligatoire)</label>
                    <input 
                      type="text"
                      required
                      value={newImportRule.reference}
                      onChange={e => setNewImportRule({...newImportRule, reference: e.target.value})}
                      placeholder="Ex: REF-001"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Type Document</label>
                    <input 
                      type="text"
                      value={newImportRule.docType || ''}
                      onChange={e => setNewImportRule({...newImportRule, docType: e.target.value})}
                      placeholder="Ex: Factures"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Intitulé / Titre (Obligatoire)</label>
                  <input 
                    type="text"
                    required
                    value={newImportRule.title}
                    onChange={e => setNewImportRule({...newImportRule, title: e.target.value})}
                    placeholder="Ex: Dossiers comptables fiscaux"
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
                      value={newImportRule.activeYears}
                      onChange={e => setNewImportRule({...newImportRule, activeYears: parseInt(e.target.value) || 0})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">DUA Interm. (ans)</label>
                    <input 
                      type="number"
                      required
                      min="0"
                      value={newImportRule.semiActiveYears}
                      onChange={e => setNewImportRule({...newImportRule, semiActiveYears: parseInt(e.target.value) || 0})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-brand-primary transition-all font-sans"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Sort Final</label>
                    <select 
                      value={newImportRule.finalDisposition}
                      onChange={e => setNewImportRule({...newImportRule, finalDisposition: e.target.value})}
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
                      value={newImportRule.support}
                      onChange={e => setNewImportRule({...newImportRule, support: e.target.value})}
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
                    onClick={() => setIsAddingImportRule(false)}
                    className="flex-1 py-4 bg-slate-100 rounded-2xl text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all font-sans"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-brand-accent rounded-2xl text-white font-black uppercase text-xs shadow-xl shadow-brand-accent/20 hover:opacity-90 transition-all font-sans"
                  >
                    Confirmer
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

function StatCard({ label, value, icon, subLabel }: { label: string, value: number, icon: React.ReactNode, subLabel?: string }) {
  return (
    <Card className="p-6 flex items-start gap-4 hover:shadow-lg transition-shadow border-slate-100 group">
      <div className="p-3 rounded-2xl bg-slate-50 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-black text-slate-800">{value}</p>
        {subLabel && <p className="text-[10px] font-medium text-slate-400 mt-1">{subLabel}</p>}
      </div>
    </Card>
  );
}
