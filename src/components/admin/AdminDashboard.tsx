import React, { useState, useEffect } from 'react';
import { Button, Card, Input } from '../UI';
import { Search, Filter, Trash2, Edit2, CheckCircle, Clock, BarChart3, Users, FileStack, TrendingUp, X, Save, Inbox, RotateCcw, CheckCircle2, XCircle, Building2, Eye, FileText, PencilLine, Download, FileSpreadsheet, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isSameDay } from 'date-fns';
import { cn, toSafeDate } from '../../lib/utils';
import * as XLSX from 'xlsx';
import Barcode from 'react-barcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../../lib/api';

export const AdminDashboard = ({ initialTab = 'requests' }: { initialTab?: 'requests' | 'communication' | 'returns' | 'stats' }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [remoteRequests, setRemoteRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'requests' | 'communication' | 'returns' | 'stats'>(initialTab);
  const [requestSubTab, setRequestSubTab] = useState<'all' | 'signed'>('all');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [archivedComms, setArchivedComms] = useState<any[]>([]);
  const [returnSubTab, setReturnSubTab] = useState<'import' | 'search' | 'history' | 'inventory'>('search');
  const [returnInventory, setReturnInventory] = useState<any[]>([]);
  const [returnHistory, setReturnHistory] = useState<any[]>([]);
  const [returnSearchTerm, setReturnSearchTerm] = useState('');
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [validatedItemLabel, setValidatedItemLabel] = useState<any | null>(null);
  const labelRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [filteredRequests, setFilteredRequests] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [viewingRequest, setViewingRequest] = useState<any | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reqs, remoteReqs, inv, hist] = await Promise.all([
          api.get('/api/requests'),
          api.get('/api/remote-requests'),
          api.get('/api/returns/inventory'),
          api.get('/api/returns/history')
        ]);
        setRequests(reqs);
        setRemoteRequests(remoteReqs);
        setReturnInventory(inv);
        setReturnHistory(hist);
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

    fetchData();
    fetchArchives();
    
    const interval = setInterval(fetchData, 30000); // 30s instead of 15s
    const archInterval = setInterval(fetchArchives, 60000); // Archives less frequently
    
    return () => {
      clearInterval(interval);
      clearInterval(archInterval);
    };
  }, [activeTab]);

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

  useEffect(() => {
    let listToFilter = [];
    if (activeTab === 'requests') {
      const all = [...requests, ...remoteRequests];
      if (requestSubTab === 'signed') {
        listToFilter = all.filter(r => r.status === 'signed' || r.status === 'Prêt / Communiqué');
      } else {
        listToFilter = all;
      }
      listToFilter = listToFilter.sort((a, b) => {
        const dateA = toSafeDate(a.createdAt)?.getTime() || 0;
        const dateB = toSafeDate(b.createdAt)?.getTime() || 0;
        return dateB - dateA;
      });
    } else if (activeTab === 'communication' || activeTab === 'returns') {
      // Merge all "signed" or "communicated" requests + imports
      const signedAgents = requests.filter(r => r.status === 'signed');
      const communicatedRemote = remoteRequests.filter(r => r.status === 'Prêt / Communiqué');
      
      // Expand live requests: one row per reference
      const expandedLive: any[] = [];
      [...signedAgents, ...communicatedRemote].forEach(r => {
        const refs = Array.isArray(r.references) && r.references.length > 0 ? r.references : [r.intitule || '-'];
        refs.forEach((ref, idx) => {
          expandedLive.push({
            ...r,
            intitule: ref, // For display logic later
            virtualId: `${r.id}_live_${idx}`
          });
        });
      });

      // Deduplicate archives vs live
      const liveSourceIds = new Set([
        ...signedAgents.map(r => r.id),
        ...communicatedRemote.map(r => r.id)
      ]);

      const uniqueArchives = archivedComms.filter(a => !a.requestId || !liveSourceIds.has(a.requestId));
      
      // Expand archives too if they have multiple refs in 'intitule' (common in imports)
      const expandedArchives: any[] = [];
      uniqueArchives.forEach((a, aIdx) => {
        // ... (rest of expansion logic remains the same)
        const val = String(a.intitule || '');
        const [refsPart, boitePart] = val.split(' / ');
        const individualRefs = refsPart.split(/[;,]/).map(s => s.trim()).filter(Boolean);
        
        if (individualRefs.length > 1) {
          individualRefs.forEach((ref, rIdx) => {
            expandedArchives.push({
              ...a,
              intitule: boitePart ? `${ref} / ${boitePart}` : ref,
              virtualId: `${a.id || aIdx}_arc_${rIdx}`
            });
          });
        } else {
          expandedArchives.push({
            ...a,
            virtualId: a.id || `arc_v_${aIdx}`
          });
        }
      });
      
      listToFilter = [...expandedLive, ...expandedArchives];

      // If in "returns" tab, filter for NOT returned yet
      if (activeTab === 'returns') {
        listToFilter = listToFilter.filter(item => !item.dateRetour || item.dateRetour === '');
      }

      listToFilter = listToFilter.sort((a, b) => {
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
        
        // For expanded rows, r.intitule holds the specific reference
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

    setFilteredRequests(result.slice(0, 15000)); // Increased limit for 11k lines
  }, [searchTerm, filterStatus, requests, remoteRequests, archivedComms, activeTab]);

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

  return (
    <div className="space-y-8">
      <div className="flex p-1 bg-white rounded-2xl shadow-sm border border-slate-100 w-full overflow-x-auto">
        <button
          onClick={() => setActiveTab('requests')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all relative ${activeTab === 'requests' ? 'bg-green-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Inbox size={18} />
          Demandes reçues
          {(requests.filter(r => r.status === 'pending').length + remoteRequests.filter(r => r.status === 'En attente').length) > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center border-2 border-white">
              {requests.filter(r => r.status === 'pending').length + remoteRequests.filter(r => r.status === 'En attente').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('communication')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'communication' ? 'bg-green-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <FileSpreadsheet size={18} />
          Gestion de communication
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'returns' ? 'bg-green-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <RotateCcw size={18} />
          Gestion des retours
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 min-w-fit flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'stats' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
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
            <StatCard label="Total Agent" value={stats.total} icon={<FileStack size={24} className="text-blue-500" />} />
            <StatCard label="A distance" value={stats.remote} icon={<Inbox size={24} className="text-teal-500" />} />
            <StatCard label="Signés (Agent)" value={stats.signed} icon={<CheckCircle size={24} className="text-green-500" />} />
            <StatCard label="Nouveaux Aujourd'hui" value={stats.today} icon={<TrendingUp size={24} className="text-purple-500" />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-6 col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Aperçu de l'Activité</h3>
                  <p className="text-sm text-slate-500 text-xs mt-1">Répartition des demandes par canal</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <BarChart3 className="text-slate-400" size={20} />
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                    <span>Agent</span>
                    <span>{Math.round((stats.total / (stats.total + stats.remote || 1)) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <motion.div 
                      className="bg-blue-500 h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(stats.total / (stats.total + stats.remote || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                    <span>Distance</span>
                    <span>{Math.round((stats.remote / (stats.total + stats.remote || 1)) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <motion.div 
                      className="bg-teal-500 h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(stats.remote / (stats.total + stats.remote || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="pt-4 grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl">
                     <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Taux de signature (Agent)</p>
                     <p className="text-2xl font-black text-slate-800">
                       {Math.round((stats.signed / (stats.total || 1)) * 100)}%
                     </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl">
                     <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Dossiers en attente</p>
                     <p className="text-2xl font-black text-slate-800">{stats.pending}</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-slate-900 text-white border-none shadow-2xl flex flex-col justify-between overflow-hidden relative group">
              <div className="relative z-10">
                <h3 className="text-lg font-bold mb-2">Statut Session</h3>
                <div className="flex items-center gap-2 text-green-400 text-sm font-bold bg-green-400/10 w-fit px-3 py-1 rounded-full border border-green-400/20 mb-6">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Live Administration
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Dossiers traités aujourd'hui</p>
                    <p className="text-3xl font-black">{stats.today}</p>
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Toutes les statistiques sont synchronisées en temps réel avec la base de données centrale Flowix.
                  </p>
                </div>
              </div>

              <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:scale-110 transition-transform duration-500">
                <BarChart3 size={200} />
              </div>

              <Button className="w-full mt-8 bg-indigo-600 hover:bg-indigo-700 font-bold border-none">
                Générer Rapport Complet
              </Button>
            </Card>
          </div>
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
              <p className="text-blue-600 font-bold">{importProgress}% complété</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {activeTab === 'returns' && (
        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 mb-6">
          <div className="flex flex-wrap gap-2 mb-8 bg-slate-50 p-1.5 rounded-2xl w-fit">
            <button
              onClick={() => { setReturnSubTab('search'); setSearchResult(null); }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${returnSubTab === 'search' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Search size={16} /> RECHERCHE
            </button>
            <button
              onClick={() => setReturnSubTab('import')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${returnSubTab === 'import' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <FileSpreadsheet size={16} /> IMPORTATION
            </button>
            <button
              onClick={() => setReturnSubTab('history')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${returnSubTab === 'history' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Clock size={16} /> HISTORIQUE
            </button>
            <button
              onClick={() => setReturnSubTab('inventory')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${returnSubTab === 'inventory' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
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
                  <FileSpreadsheet size={32} className="text-green-600" />
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
                  className="cursor-pointer bg-green-600 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-green-100 hover:bg-green-700 transition-all flex items-center gap-2"
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
                      className="pl-12 py-6 text-lg rounded-2xl shadow-sm border-slate-200 focus:ring-green-500"
                      value={returnSearchTerm}
                      onChange={(e) => setReturnSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && performReturnSearch()}
                    />
                  </div>
                  <Button 
                    className="px-8 bg-green-600 hover:bg-green-700 rounded-2xl text-lg shadow-lg shadow-green-100"
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
                    <div className="mb-6 p-4 bg-white rounded-2xl shadow-sm inline-block">
                      <Barcode 
                        value={`${searchResult.numBoite}-${searchResult.localisation}`} 
                        width={1.2}
                        height={40}
                        format="CODE128"
                        displayValue={false}
                        margin={0}
                      />
                      <div className="mt-2 text-[11px] font-black text-slate-600 font-sans uppercase">
                        {searchResult.numBoite} - {searchResult.localisation}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-8">
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Boîte N°</span>
                        <span className="text-xl font-black text-slate-800">{searchResult.numBoite}</span>
                      </div>
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Localisation</span>
                        <span className="text-xl font-black text-slate-800">{searchResult.localisation}</span>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-8">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Référence</span>
                      <span className="text-lg font-bold text-slate-700">{searchResult.reference}</span>
                    </div>

                    <Button 
                      className="w-full py-4 bg-green-600 hover:bg-green-700 rounded-2xl text-lg font-black shadow-lg shadow-green-100 flex items-center justify-center gap-2"
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
                    <div className="bg-green-50 border border-green-100 rounded-3xl p-6 text-center">
                      <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle2 size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-green-800">Retour validé avec succès !</h3>
                      <p className="text-green-600/80 text-sm">Vous pouvez maintenant imprimer ou télécharger l'étiquette.</p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-3xl p-10 flex flex-col items-center">
                      <div 
                        ref={labelRef} 
                        id="printable-label"
                        className="bg-white border border-slate-900 shadow-sm text-center flex flex-col items-center justify-center p-[4pt]"
                        style={{ 
                          width: '52mm', 
                          height: '27mm', 
                          boxSizing: 'border-box'
                        }}
                      >
                        <div className="w-full flex flex-col items-center mb-1">
                          <span className="text-[14pt] font-black text-white bg-slate-900 px-3 py-1 rounded inline-block mb-1">
                            {validatedItemLabel.numBoite}
                          </span>
                        </div>

                        <div className="flex-1 flex items-center justify-center w-full py-1">
                          <Barcode 
                            value={validatedItemLabel.barcodeData} 
                            width={2.0}
                            height={45}
                            format="CODE128"
                            margin={0}
                            displayValue={false}
                          />
                        </div>

                        <div className="w-full mt-1 border-t-2 border-slate-900 pt-1">
                          <p className="text-[12pt] font-black text-slate-900 leading-none truncate tracking-widest uppercase">
                            {validatedItemLabel.localisation}
                          </p>
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
                          className="flex-1 bg-green-600 hover:bg-green-700 rounded-2xl h-14 font-black flex items-center justify-center gap-2"
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
                          <td className="px-6 py-4 text-sm font-bold text-slate-600">{h.numBoite}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-600">{h.localisation}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="inline-block bg-white p-1 rounded border border-slate-100">
                              <Barcode 
                                value={h.barcodeData || `${h.numBoite}-${h.localisation}`} 
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
                                className="p-2 text-slate-300 hover:text-green-600 transition-colors"
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
                    className="pl-12 py-3 border-slate-200 focus:ring-green-500 rounded-2xl bg-slate-50/50"
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
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{i.numBoite}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{i.localisation}</td>
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

      {/* Live Request Filters (Hide in returns sub-tabs context if needed, but keeping for continuity) */}
      {(activeTab !== 'returns' && activeTab !== 'stats') && (
        <>
          {activeTab === 'requests' && (
            <div className="flex gap-2 mb-6 bg-slate-50 p-1.5 rounded-2xl w-fit mx-auto md:mx-0">
              <button
                onClick={() => setRequestSubTab('all')}
                className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${requestSubTab === 'all' ? 'bg-white text-green-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Toutes les demandes
              </button>
              <button
                onClick={() => setRequestSubTab('signed')}
                className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${requestSubTab === 'signed' ? 'bg-white text-green-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <CheckCircle2 size={16} /> Demande Signés
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
                    <tr key={req.virtualId || req.id} className={cn("transition-colors border-b", highlightClass, borderClass)}>
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
                      <td className="px-6 py-4 text-sm font-bold text-blue-600">
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
                            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2"
                          >
                            <FileText size={14} /> BORDEREAU
                          </button>
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
                          req.priorite === 'Urgente' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                        )}>
                          {req.priorite}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider",
                      req.status === 'signed' || req.status === 'Prêt / Communiqué' ? 'bg-green-50 text-green-700 border-green-100' :
                      req.status === 'pending' || req.status === 'En attente' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      req.status === 'En cours' ? 'bg-blue-50 text-blue-600 border-blue-100' :
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
                          className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
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
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-[#004d2c]">
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
                      
                      <div className="p-4 bg-green-50 border border-green-100 rounded-2xl flex items-start gap-3">
                         <CheckCircle className="text-green-500 shrink-0" size={18} />
                         <div>
                            <p className="text-xs font-bold text-green-800 uppercase tracking-tight">Statut Final</p>
                            <p className="text-green-700 text-sm font-medium">Communiqué et signé le {toSafeDate(viewingRequest.updatedAt || viewingRequest.createdAt) ? format(toSafeDate(viewingRequest.updatedAt || viewingRequest.createdAt)!, 'dd/MM/yyyy à HH:mm') : '...'}</p>
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

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
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
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

function StatCard({ label, value, icon }: { label: string, value: number, icon: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <div className="p-2 bg-gray-50 rounded-xl">{icon}</div>
        <span className="text-2xl font-bold text-gray-900">{value}</span>
      </div>
      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</span>
    </Card>
  );
}
