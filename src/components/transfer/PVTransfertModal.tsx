import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import {
  FileText,
  Printer,
  X,
  Download,
  ShieldCheck,
  Building2,
  User,
  Calendar,
  Archive,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  CheckCircle,
  MapPin,
  Barcode as BarcodeIcon,
  Tag,
  Clock,
  Sparkles,
  Edit3,
  Check
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface PVTransfertBatchData {
  id: string;
  batchNumber: string;
  inventoryRef?: string;
  inventoryName?: string;
  direction: string;
  directionHead?: string;
  transferDate?: string;
  importedAt: string;
  importedBy?: string;
  status: string;
  foldersCount?: number;
  boxesCount?: number;
  foldersData?: any[];
  boxesData?: any[];
  ruleApplied?: any;
  validatedAt?: string;
  validatedBy?: string;
  notes?: string;
}

interface PVTransfertModalProps {
  batch: PVTransfertBatchData;
  onClose: () => void;
  onPrint?: () => void;
  onValidate?: (batchId: string) => void | Promise<void>;
  isValidating?: boolean;
}

export const PVTransfertModal: React.FC<PVTransfertModalProps> = ({ 
  batch, 
  onClose,
  onValidate,
  isValidating = false
}) => {
  const isValidated = batch.status === 'validé';
  // State for interactive features
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBoxFilter, setSelectedBoxFilter] = useState('all');
  const [selectedSortFilter, setSelectedSortFilter] = useState<'all' | 'EL' | 'CP'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(50); // 50 by default, can be set to 'all'
  const [isEditingDirectionHead, setIsEditingDirectionHead] = useState(false);
  const [customDirectionHead, setCustomDirectionHead] = useState<string>(
    batch.directionHead || `Responsable / Chef de la Direction ${batch.direction || ''}`
  );

  // Helper date formatter
  const formattedValidationDate = useMemo(() => {
    try {
      const d = batch.validatedAt ? new Date(batch.validatedAt) : (batch.importedAt ? new Date(batch.importedAt) : new Date());
      return format(d, "dd MMMM yyyy 'à' HH:mm", { locale: fr });
    } catch {
      return String(batch.validatedAt || batch.importedAt || 'N/A');
    }
  }, [batch.validatedAt, batch.importedAt]);

  const formattedTransferDate = useMemo(() => {
    if (!batch.transferDate && !batch.importedAt) return 'Non renseignée';
    try {
      const raw = batch.transferDate || batch.importedAt;
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return format(d, "dd MMMM yyyy", { locale: fr });
      }
      return String(raw);
    } catch {
      return String(batch.transferDate || batch.importedAt || '-');
    }
  }, [batch.transferDate, batch.importedAt]);

  const rawFolders = useMemo(() => {
    return Array.isArray(batch.foldersData) ? batch.foldersData : [];
  }, [batch.foldersData]);

  const rawBoxes = useMemo(() => {
    return Array.isArray(batch.boxesData) ? batch.boxesData : [];
  }, [batch.boxesData]);

  // Box map for quick location and barcode lookup
  const boxLookupMap = useMemo(() => {
    const map = new Map<string, any>();
    rawBoxes.forEach(b => {
      const num = String(b.number || b.boxNumber || b.id || '').trim();
      if (num) {
        map.set(num.toLowerCase(), b);
      }
    });
    return map;
  }, [rawBoxes]);

  // Helper to format closure date nicely as DD/MM/YYYY
  const formatClosureDate = (f: any): string => {
    const raw = f.dateCloture || f.dateFin || f.year || f.dateDebut || '';
    if (!raw) return '-';

    if (typeof raw === 'number' && raw > 1000 && raw < 100000) {
      const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
      }
    }

    const str = String(raw).trim();
    const dmyMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmyMatch) {
      return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`;
    }

    const ymdMatch = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (ymdMatch) {
      return `${ymdMatch[3].padStart(2, '0')}/${ymdMatch[2].padStart(2, '0')}/${ymdMatch[1]}`;
    }

    const yearMatch = str.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      return `31/12/${yearMatch[1]}`;
    }

    return str;
  };

  // Helper to calculate exact Date de Sort Final according to DUA duration and closure date
  const calculateSortFinalDate = (f: any, durationYears: number, isElimination: boolean): string => {
    // 1. If explicit date of elimination exists (f.dateElimination, f.expiryDate with format DD/MM/YYYY or YYYY-MM-DD)
    if (f.dateElimination) {
      const dmy = String(f.dateElimination).match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
      if (dmy) return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`;
      const ymd = String(f.dateElimination).match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
      if (ymd) return `${ymd[3].padStart(2, '0')}/${ymd[2].padStart(2, '0')}/${ymd[1]}`;
    }

    if (f.expiryDate) {
      const str = String(f.expiryDate).trim();
      const dmy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
      if (dmy) return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${dmy[3]}`;
      const ymd = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
      if (ymd) return `${ymd[3].padStart(2, '0')}/${ymd[2].padStart(2, '0')}/${ymd[1]}`;
      if (/^\d{4}$/.test(str)) {
        return `31/12/${str}`;
      }
    }

    // 2. Extract base year or full date from dateCloture, dateFin, year, or dateDebut
    const rawDate = f.dateCloture || f.dateFin || f.year || f.dateDebut || '';
    if (rawDate) {
      // If rawDate has day/month/year (e.g. 15/06/2018 or 2018-06-15)
      const dmy = String(rawDate).match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
      if (dmy) {
        const day = dmy[1].padStart(2, '0');
        const month = dmy[2].padStart(2, '0');
        const targetYear = parseInt(dmy[3]) + (durationYears || 5);
        return `${day}/${month}/${targetYear}`;
      }

      const ymd = String(rawDate).match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
      if (ymd) {
        const day = ymd[3].padStart(2, '0');
        const month = ymd[2].padStart(2, '0');
        const targetYear = parseInt(ymd[1]) + (durationYears || 5);
        return `${day}/${month}/${targetYear}`;
      }

      const yearOnly = String(rawDate).match(/\b(19\d{2}|20\d{2})\b/);
      if (yearOnly) {
        const targetYear = parseInt(yearOnly[1]) + (durationYears || 5);
        return `31/12/${targetYear}`;
      }
    }

    // 3. Fallback to transfer year / current year + duration
    const baseYear = new Date().getFullYear();
    return `31/12/${baseYear + (durationYears || 5)}`;
  };

  // Helper to check if a direction is Comptabilité / Finance / CTT
  const isComptabiliteDirection = (dirName?: string): boolean => {
    const d = String(dirName || batch.direction || '').toLowerCase().trim();
    return d.includes('comptab') || d.includes('finance') || d.includes('ctt');
  };

  const isBatchComptabilite = useMemo(() => {
    return isComptabiliteDirection(batch.direction);
  }, [batch.direction]);

  // Helper to resolve reference or code agence
  const resolveReferenceString = (f: any, idx?: number): string => {
    const isComptab = isComptabiliteDirection(f.direction);

    if (isComptab) {
      if (f.codeAgence && typeof f.codeAgence === 'string' && f.codeAgence.trim()) {
        return f.codeAgence.trim();
      }
      if (f.rawRow && typeof f.rawRow === 'object') {
        const keys = Object.keys(f.rawRow);
        const agKey = keys.find(k => /(?:code[\s_.-]?agence|agence[\s_.-]?ctt|code[\s_.-]?ctt|^agence$|^code$|^ctt$)/i.test(k));
        if (agKey && f.rawRow[agKey] !== undefined && f.rawRow[agKey] !== null && String(f.rawRow[agKey]).trim()) {
          return String(f.rawRow[agKey]).trim();
        }
      }
    }

    // Standard reference for Sinistre Matériel, Sinistre Corporel, etc.
    const primaryRef = f.reference || f.dossier || f.sin || f.police || f.numDossier;
    if (primaryRef && String(primaryRef).trim() && !String(primaryRef).startsWith('AUTO-REF-')) {
      return String(primaryRef).trim();
    }

    if (f.rawRow && typeof f.rawRow === 'object') {
      const keys = Object.keys(f.rawRow);
      const refKey = keys.find(k => /(?:dossier|sinistre|police|contrat|reference|ref|num)/i.test(k));
      if (refKey && f.rawRow[refKey] !== undefined && f.rawRow[refKey] !== null && String(f.rawRow[refKey]).trim()) {
        return String(f.rawRow[refKey]).trim();
      }
    }

    if (f.reference && String(f.reference).trim()) {
      return String(f.reference).trim();
    }

    return idx !== undefined ? `Dossier #${idx + 1}` : '-';
  };

  // Helper to resolve exact intitule / contenu from Excel (e.g. caisse 117)
  const resolveIntituleString = (f: any): string => {
    // 1. Direct explicit rawIntitule
    if (f.rawIntitule && typeof f.rawIntitule === 'string' && f.rawIntitule.trim()) {
      return f.rawIntitule.trim();
    }

    // 2. Check if rawRow exists and has any column with intitule, contenu, libelle, caisse, etc.
    if (f.rawRow && typeof f.rawRow === 'object') {
      const keys = Object.keys(f.rawRow);
      const titleKey = keys.find(k => /(?:intitul|contenu|libell|titre|objet|desig|caisse|journal|compte|detail|piece|nature|nom|assur|adher|benef)/i.test(k));
      if (titleKey && f.rawRow[titleKey] !== undefined && f.rawRow[titleKey] !== null && String(f.rawRow[titleKey]).trim()) {
        return String(f.rawRow[titleKey]).trim();
      }
    }

    // 3. Folder object intitule or other fields
    if (f.intitule && typeof f.intitule === 'string' && f.intitule.trim() && !f.intitule.startsWith('Dossier AUTO-REF-')) {
      return f.intitule.trim();
    }
    if (f.titre && typeof f.titre === 'string' && f.titre.trim()) return f.titre.trim();
    if (f.objet && typeof f.objet === 'string' && f.objet.trim()) return f.objet.trim();
    if (f.libelle && typeof f.libelle === 'string' && f.libelle.trim()) return f.libelle.trim();
    if (f.adherant && typeof f.adherant === 'string' && f.adherant.trim()) return f.adherant.trim();
    if (f.nom && typeof f.nom === 'string' && f.nom.trim()) return f.nom.trim();

    return f.intitule || '-';
  };

  // Helper to resolve precise physical location string for a folder (e.g. S1-B-208 exactly from Excel)
  const resolveLocationString = (f: any): string => {
    // 1. Direct explicit rawLocalisation (exact value from imported Excel file, e.g. "S1-B-208")
    if (f.rawLocalisation && typeof f.rawLocalisation === 'string' && f.rawLocalisation.trim() !== '') {
      return f.rawLocalisation.trim();
    }

    // 2. Check if rawRow exists and has any column with a location name or value
    if (f.rawRow && typeof f.rawRow === 'object') {
      const keys = Object.keys(f.rawRow);
      // Look for location header key
      const locKey = keys.find(k => /(?:localis|emplac|adresse|site|lieu|coord|stockage|box_loc|rangement|^loc$|^pos$|^position$)/i.test(k))
        || keys.find(k => /localis|emplac|adresse|site|lieu|coord|stockage/i.test(k));
      if (locKey && f.rawRow[locKey] !== undefined && f.rawRow[locKey] !== null) {
        const val = String(f.rawRow[locKey]).trim();
        if (val && val !== '-' && val !== 'undefined' && val !== 'null') {
          return val;
        }
      }

      // Check if any column in rawRow has a pattern like S1-B-208 or R1-T02
      for (const k of keys) {
        const val = String(f.rawRow[k] || '').trim();
        if (/^[A-Z0-9]{1,4}-[A-Z0-9]{1,4}(?:-[A-Z0-9]{1,6})?(?:-[A-Z0-9]{1,4})?$/i.test(val) &&
            !/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(val) &&
            !/^\d{4}-\d{2}-\d{2}$/.test(val) &&
            !/date|ref|sin|police|dossier|annee|year|tel|montant|prime/i.test(k)) {
          return val;
        }
      }
    }

    // 3. Direct folder localisation if set and not a generic boilerplate placeholder
    if (f.localisation && 
        typeof f.localisation === 'string' &&
        f.localisation.trim() !== '' &&
        f.localisation !== 'Centre Archives Central' && 
        f.localisation !== 'Dépôt Central • Rayonnage Standard' && 
        f.localisation !== 'Emplacement non défini') {
      return f.localisation.trim();
    }

    // 4. Try finding matching box from the batch's boxLookupMap
    const boxNum = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '').trim().toLowerCase();
    const matchedBox = boxLookupMap.get(boxNum);

    if (matchedBox) {
      if (matchedBox.rawLocalisation && typeof matchedBox.rawLocalisation === 'string' && matchedBox.rawLocalisation.trim() !== '') {
        return matchedBox.rawLocalisation.trim();
      }
      if (matchedBox.localisation && typeof matchedBox.localisation === 'string' && matchedBox.localisation.trim() !== '' && matchedBox.localisation !== 'Centre Archives Central') {
        return matchedBox.localisation.trim();
      }
      if (matchedBox.location && typeof matchedBox.location === 'string' && matchedBox.location.trim() !== '' && matchedBox.location !== 'Centre Archives Central') {
        return matchedBox.location.trim();
      }

      const parts: string[] = [];
      if (matchedBox.batiment) parts.push(matchedBox.batiment);
      if (matchedBox.depot && matchedBox.salle) parts.push(`${matchedBox.depot} / ${matchedBox.salle}`);
      else if (matchedBox.depot) parts.push(matchedBox.depot);
      else if (matchedBox.salle) parts.push(matchedBox.salle);

      const coords: string[] = [];
      if (matchedBox.rayon) coords.push(`Rayon ${matchedBox.rayon}`);
      if (matchedBox.travee) coords.push(`Travée ${matchedBox.travee}`);
      if (matchedBox.tablette) coords.push(`Étagère ${matchedBox.tablette}`);
      if (matchedBox.niveau) coords.push(`Niveau ${matchedBox.niveau}`);

      if (coords.length > 0) parts.push(coords.join(' - '));
      if (parts.length > 0) return parts.join(' • ');
    }

    // 5. If folder has location property
    if (f.location && typeof f.location === 'string' && f.location.trim() !== '' && f.location !== 'Centre Archives Central') {
      return f.location.trim();
    }

    return f.localisation || 'Emplacement non renseigné';
  };

  // Helper to resolve DUA code, calculated final sort date, and disposition
  const resolveDUAInfo = (f: any) => {
    const applied = batch.ruleApplied;
    const codeDua = f.codeDua || f.ruleId || applied?.reference || applied?.ruleId || (batch.direction ? `DUA-${batch.direction.slice(0, 4).toUpperCase()}` : 'DUA Standard');
    const titleDua = f.ruleTitle || applied?.title || (typeof applied === 'string' ? applied : 'Conservation légale');
    
    let duration = f.retentionYears || applied?.retentionYears || (applied?.activeYears || 0) + (applied?.semiActiveYears || 0);
    if (!duration) duration = 5;

    const sortFinal = f.finalDisposition || f.sortFinal || applied?.finalDisposition || 'EL';
    const isElimination = sortFinal === 'EL' || sortFinal === 'Élimination' || sortFinal === 'D' || sortFinal === 'Destruction';

    const dateSortFinal = calculateSortFinalDate(f, duration, isElimination);
    const sortFinalYear = dateSortFinal.match(/\d{4}/)?.[0] || String(new Date().getFullYear() + duration);

    return {
      codeDua,
      titleDua,
      duration: `${duration} ans`,
      durationNum: duration,
      expiryYear: sortFinalYear,
      dateSortFinal, // ex: '31/12/2031' ou '15/06/2031'
      sortFinal: isElimination ? 'Élimination (EL)' : 'Conservation Permanente (CP)',
      sortFinalDisplay: isElimination ? `Élimination au ${dateSortFinal}` : 'Conservation Permanente (CP)',
      isElimination
    };
  };

  // Filtered folders list
  const filteredFolders = useMemo(() => {
    return rawFolders.filter(f => {
      // Box filter
      if (selectedBoxFilter !== 'all') {
        const b = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '').trim();
        if (b !== selectedBoxFilter) return false;
      }

      // Sort final filter
      if (selectedSortFilter !== 'all') {
        const dua = resolveDUAInfo(f);
        if (selectedSortFilter === 'EL' && !dua.isElimination) return false;
        if (selectedSortFilter === 'CP' && dua.isElimination) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const ref = resolveReferenceString(f).toLowerCase();
        const title = resolveIntituleString(f).toLowerCase();
        const box = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '').toLowerCase();
        const loc = resolveLocationString(f).toLowerCase();
        const dua = String(f.codeDua || '').toLowerCase();

        if (!ref.includes(q) && !title.includes(q) && !box.includes(q) && !loc.includes(q) && !dua.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [rawFolders, selectedBoxFilter, selectedSortFilter, searchQuery, boxLookupMap, batch.ruleApplied, batch.direction]);

  // Pagination slice
  const displayedFolders = useMemo(() => {
    if (rowsPerPage === 0) return filteredFolders; // All rows
    const start = (currentPage - 1) * rowsPerPage;
    return filteredFolders.slice(start, start + rowsPerPage);
  }, [filteredFolders, currentPage, rowsPerPage]);

  const totalPages = rowsPerPage === 0 ? 1 : Math.ceil(filteredFolders.length / rowsPerPage);

  // Stats calculation
  const stats = useMemo(() => {
    let elimCount = 0;
    let consCount = 0;

    rawFolders.forEach(f => {
      const dua = resolveDUAInfo(f);
      if (dua.isElimination) elimCount++;
      else consCount++;
    });

    const uniqueBoxes = new Set(rawFolders.map(f => String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '').trim()).filter(Boolean));

    return {
      totalFolders: rawFolders.length,
      totalBoxes: rawBoxes.length || uniqueBoxes.size || 1,
      elimCount,
      consCount
    };
  }, [rawFolders, rawBoxes]);

  // Export full PV to Excel
  const handleExportExcel = () => {
    try {
      const refColName = isBatchComptabilite ? 'Code Agence' : 'Référence Dossier';
      const exportData = rawFolders.map((f, idx) => {
        const boxNum = f.boxNumber || f.numBoite || f.generatedBoxNumber || 'Non assignée';
        const boxObj = boxLookupMap.get(boxNum.toLowerCase());
        const barcode = boxObj?.barcode || f.barcode || `BOX-${boxNum}`;
        const primaryRef = resolveReferenceString(f, idx);
        const intitule = resolveIntituleString(f);
        const dateDebut = f.dateDebut || '-';
        const dateCloture = formatClosureDate(f);
        const dua = resolveDUAInfo(f);
        const location = resolveLocationString(f);

        return {
          'N° Ordre': idx + 1,
          'N° Boîte': boxNum,
          'Code-Barres Boîte': barcode,
          [refColName]: primaryRef,
          'Intitulé / Objet du Contenu': intitule,
          'Direction / Service': f.direction || batch.direction || '',
          'Date Début': dateDebut,
          'Date Clôture': dateCloture,
          'Code DUA': dua.codeDua,
          'Durée Conservation': dua.duration,
          'Date Sort Final (selon DUA)': dua.dateSortFinal,
          'Année Échéance': dua.expiryYear,
          'Localisation Physique Précise': location,
          'Sort Final': dua.sortFinal,
          'Date Transfert': batch.transferDate || batch.importedAt ? formattedTransferDate : '-'
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PV_Transfert_Inventaire');

      const cleanRef = (batch.inventoryRef || batch.batchNumber || 'PV_Transfert').replace(/[\/\\]/g, '_');
      const filename = `PV_Transfert_${cleanRef}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Erreur export Excel PV:', err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const pvRefNumber = batch.inventoryRef || batch.batchNumber || `PV-TRANSF-${new Date().getFullYear()}-${batch.id.slice(-6).toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden my-auto border border-slate-200 print:max-h-none print:h-auto print:border-none print:shadow-none print:rounded-none print:w-full print:max-w-none">
        
        {/* ========================================================================= */}
        {/* --- MODAL TOP CONTROL BAR (Hidden on Print) --- */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-500/30 print:hidden shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 shrink-0">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider rounded-full border border-emerald-500/40">
                  Procès-Verbal Officiel de Transfert & Versement
                </span>
                <span className="font-mono text-xs text-slate-300 font-bold bg-white/10 px-2 py-0.5 rounded-lg border border-white/10">
                  Réf : {pvRefNumber}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white mt-0.5 flex items-center gap-2">
                {batch.inventoryName || `Inventaire ${batch.direction || 'Direction'} ${new Date().getFullYear()}`}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-end sm:self-auto">
            {!isValidated && onValidate && (
              <button
                onClick={() => onValidate(batch.id)}
                disabled={isValidating}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
                title="Valider définitivement le lot et stocker dans le système d'archives"
              >
                <CheckCircle2 size={15} /> {isValidating ? "Validation en cours..." : "Valider & Confirmer le Stockage"}
              </button>
            )}
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 border border-white/15 transition-all cursor-pointer shadow-sm"
              title="Télécharger l'inventaire en fichier Excel"
            >
              <Download size={14} className="text-emerald-400" /> Exporter Excel
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
              title="Lancer l'impression officielle du Procès-Verbal"
            >
              <Printer size={15} /> Imprimer / PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              title="Fermer la fenêtre"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* --- MAIN PV CONTENT BODY (Printable Layout) --- */}
        {/* ========================================================================= */}
        <div id="printable-pv-transfert" className="p-6 sm:p-8 lg:p-10 overflow-y-auto space-y-6 flex-1 bg-white text-slate-800 print:p-6 print:overflow-visible">
          
          {/* Header Document Act */}
          <div className="border-b-2 border-emerald-900 pb-5 space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-900 text-white font-black text-xs flex items-center justify-center">
                    PV
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-emerald-900">
                    MAE ASSURANCES — SYSTÈME CENTRALISÉ DE GESTION DES ARCHIVES
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  PROCÈS-VERBAL & BORDEREAU DE TRANSFERT D'ARCHIVES
                </h1>
                <p className="text-xs text-slate-600 font-medium">
                  Acte officiel de versement définitif, scellement physique et transfert de responsabilité de conservation.
                </p>
              </div>

              <div className={`${isValidated ? 'bg-emerald-50 border-emerald-600/60' : 'bg-amber-50 border-amber-600/60'} border-2 rounded-2xl p-3.5 text-right space-y-0.5 min-w-[220px] shadow-xs`}>
                <div className={`text-[10px] font-black ${isValidated ? 'text-emerald-800' : 'text-amber-800'} uppercase tracking-wider`}>
                  STATUT DU VERSEMENT
                </div>
                <div className={`font-mono font-black text-sm ${isValidated ? 'text-emerald-950' : 'text-amber-950'} flex items-center justify-end gap-1`}>
                  {isValidated ? (
                    <>
                      <CheckCircle2 size={16} className="text-emerald-700" /> VALIDÉ & SCELLÉ
                    </>
                  ) : (
                    <>
                      <Clock size={16} className="text-amber-700" /> EN ATTENTE DE VALIDATION
                    </>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 font-medium">
                  {isValidated ? `Date : ${formattedValidationDate}` : `Date import : ${batch.importedAt ? new Date(batch.importedAt).toLocaleDateString('fr-FR') : '-'}`}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* --- METADATA HIGHLIGHTS GRID (Nom, Direction, Responsables, Nb Dossiers) --- */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 1. Nom & Réf Inventaire */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block flex items-center gap-1.5">
                <Tag size={12} className="text-emerald-700" /> Nom & Réf Inventaire
              </span>
              <div className="font-bold text-slate-900 text-sm leading-tight">
                {batch.inventoryName || `Inventaire ${batch.direction}`}
              </div>
              <div className="font-mono text-xs font-black text-emerald-800">
                {pvRefNumber}
              </div>
            </div>

            {/* 2. Direction & Responsable de Direction */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block flex items-center gap-1.5">
                <Building2 size={12} className="text-emerald-700" /> Direction Versante
              </span>
              <div className="font-black text-slate-900 text-sm">
                {batch.direction || 'Direction Générale'}
              </div>
              <div className="text-xs text-slate-600 font-medium flex items-center gap-1">
                <User size={12} className="text-slate-400 shrink-0" />
                {isEditingDirectionHead ? (
                  <div className="flex items-center gap-1 w-full">
                    <input
                      type="text"
                      value={customDirectionHead}
                      onChange={e => setCustomDirectionHead(e.target.value)}
                      className="text-xs font-bold px-1.5 py-0.5 border border-emerald-400 rounded bg-white w-full"
                    />
                    <button
                      onClick={() => setIsEditingDirectionHead(false)}
                      className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"
                    >
                      <Check size={12} />
                    </button>
                  </div>
                ) : (
                  <span className="truncate flex-1" title={customDirectionHead}>
                    {customDirectionHead}
                  </span>
                )}
                {!isEditingDirectionHead && (
                  <button
                    onClick={() => setIsEditingDirectionHead(true)}
                    className="text-slate-400 hover:text-slate-700 p-0.5 rounded print:hidden"
                    title="Modifier le nom du responsable"
                  >
                    <Edit3 size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* 3. Responsable Audit & Dates */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-emerald-700" /> Audit & Dates
              </span>
              <div className="font-bold text-slate-900 text-sm truncate" title={batch.validatedBy || 'Responsable Audit & Conformité'}>
                {batch.validatedBy || 'Responsable Audit & Conformité'}
              </div>
              <div className="text-xs text-slate-600 font-medium">
                Transfert : <strong className="text-emerald-900 font-mono font-bold">{formattedTransferDate}</strong>
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                Importé par : <strong className="text-slate-800">{batch.importedBy || 'Archiviste'}</strong>
              </div>
            </div>

            {/* 4. Nombre de Dossiers & Boîtes */}
            <div className="bg-emerald-950 text-white rounded-2xl p-4 space-y-1 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block flex items-center gap-1.5">
                <Archive size={12} className="text-emerald-400" /> Volume Versé
              </span>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-2xl font-black font-mono text-white">{stats.totalFolders}</span>
                  <span className="text-xs font-bold text-emerald-200 ml-1">dossiers</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black font-mono text-emerald-300">{stats.totalBoxes}</span>
                  <span className="text-[10px] font-bold text-emerald-200 ml-1">boîte(s)</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-emerald-300 pt-0.5 border-t border-emerald-800/80">
                <span>Conservation : <strong>{stats.consCount}</strong></span>
                <span>Élimination : <strong>{stats.elimCount}</strong></span>
              </div>
            </div>

          </div>

          {/* ========================================================================= */}
          {/* --- INTERACTIVE FILTERS & SEARCH BAR (Hidden on Print) --- */}
          {/* ========================================================================= */}
          <div className="bg-slate-100/90 rounded-2xl p-3.5 border border-slate-200 space-y-3 print:hidden">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              
              {/* Search input */}
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher par référence, titre, boîte, DUA, localisation..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-8 py-2 bg-white text-slate-800 placeholder:text-slate-400 rounded-xl text-xs font-medium border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-2xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Box filter */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedBoxFilter}
                  onChange={e => {
                    setSelectedBoxFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  <option value="all">Toutes les boîtes ({rawBoxes.length || 'Toutes'})</option>
                  {Array.from(new Set(rawFolders.map(f => String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '').trim()).filter(Boolean))).map(b => (
                    <option key={b} value={b}>Boîte {b}</option>
                  ))}
                </select>

                {/* Sort final filter */}
                <select
                  value={selectedSortFilter}
                  onChange={e => {
                    setSelectedSortFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  <option value="all">Tous sorts finals</option>
                  <option value="CP">Conservation (CP)</option>
                  <option value="EL">Élimination (EL)</option>
                </select>

                {/* Rows per page selector */}
                <select
                  value={rowsPerPage}
                  onChange={e => {
                    setRowsPerPage(parseInt(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                  <option value={0}>Tout afficher ({filteredFolders.length})</option>
                </select>
              </div>

            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-medium">
              <span>
                Affichage de <strong className="text-slate-900 font-bold">{displayedFolders.length}</strong> sur <strong>{filteredFolders.length}</strong> dossier(s) du procès-verbal
              </span>
              {(searchQuery || selectedBoxFilter !== 'all' || selectedSortFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedBoxFilter('all');
                    setSelectedSortFilter('all');
                    setCurrentPage(1);
                  }}
                  className="text-emerald-700 font-bold hover:underline cursor-pointer"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* --- TABLEAU BIEN ORGANISÉ : INVENTAIRE COMPLET AVEC DUA & LOCALISATION --- */}
          {/* ========================================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Layers size={14} className="text-emerald-700" />
                Tableau de l'Inventaire Complet des Dossiers ({rawFolders.length} dossiers au total)
              </h3>
              <span className="text-[11px] font-bold text-slate-400 font-mono hidden sm:inline-block">
                DUA & Localisations Scellées
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-300 shadow-2xs print:border-slate-800 print:rounded-none">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-[11px] print:bg-slate-900 print:text-white">
                    <th className="p-3 w-12 text-center border-b border-slate-700">N°</th>
                    <th className="p-3 border-b border-slate-700 whitespace-nowrap">Boîte / Stockage</th>
                    <th className="p-3 border-b border-slate-700 whitespace-nowrap">
                      {isBatchComptabilite ? 'Code Agence' : 'Référence Dossier'}
                    </th>
                    <th className="p-3 border-b border-slate-700">Intitulé / Contenu du Dossier</th>
                    <th className="p-3 border-b border-slate-700 text-center whitespace-nowrap">Dates Extrêmes</th>
                    <th className="p-3 border-b border-slate-700 text-center bg-slate-800 text-slate-200 whitespace-nowrap">
                      Code DUA
                    </th>
                    <th className="p-3 border-b border-slate-700 text-center bg-emerald-900 text-emerald-100 whitespace-nowrap">
                      Date Sort Final (selon DUA)
                    </th>
                    <th className="p-3 border-b border-slate-700 whitespace-nowrap">Localisation Physique</th>
                    <th className="p-3 border-b border-slate-700 text-center bg-emerald-950 text-emerald-200 whitespace-nowrap">
                      Sort Final
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {displayedFolders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                        Aucun dossier ne correspond à vos critères de recherche.
                      </td>
                    </tr>
                  ) : (
                    displayedFolders.map((folder: any, index: number) => {
                      const absoluteIndex = rowsPerPage === 0 ? index + 1 : (currentPage - 1) * rowsPerPage + index + 1;
                      const boxNum = folder.boxNumber || folder.numBoite || folder.generatedBoxNumber || 'Non assignée';
                      const primaryRef = resolveReferenceString(folder, absoluteIndex - 1);
                      const intitule = resolveIntituleString(folder);
                      const dateDebut = folder.dateDebut || '-';
                      const dateCloture = formatClosureDate(folder);
                      const dua = resolveDUAInfo(folder);
                      const location = resolveLocationString(folder);

                      return (
                        <tr key={folder.id || index} className="hover:bg-slate-50/80 transition-colors">
                          
                          {/* N° d'ordre */}
                          <td className="p-3 text-center font-mono font-bold text-slate-400 text-[11px]">
                            #{absoluteIndex}
                          </td>

                          {/* N° Boîte */}
                          <td className="p-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 font-mono font-black text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 text-xs">
                              <Archive size={11} className="text-emerald-700" />
                              {boxNum}
                            </span>
                          </td>

                          {/* Référence Dossier / Code Agence */}
                          <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {primaryRef}
                          </td>

                          {/* Intitulé / Contenu */}
                          <td className="p-3 text-slate-800 font-medium max-w-xs">
                            <span className="line-clamp-2" title={intitule}>
                              {intitule}
                            </span>
                          </td>

                          {/* Dates Extrêmes */}
                          <td className="p-3 text-center whitespace-nowrap font-mono text-[11px]">
                            <span className="text-slate-500">{dateDebut !== '-' ? dateDebut : ''}</span>
                            {dateDebut !== '-' && dateCloture !== '-' && <span className="text-slate-400 mx-1">→</span>}
                            <span className="font-bold text-slate-900">{dateCloture}</span>
                          </td>

                          {/* Code DUA */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 text-xs">
                                {dua.codeDua}
                              </span>
                              <span className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                Durée : {dua.duration}
                              </span>
                            </div>
                          </td>

                          {/* Date Sort Final (selon DUA) */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono font-black text-emerald-950 bg-emerald-50/90 px-2.5 py-1 rounded-lg border border-emerald-300 text-xs shadow-2xs">
                                {dua.dateSortFinal}
                              </span>
                              <span className="text-[9px] font-bold text-emerald-700 mt-0.5">
                                {dua.isElimination ? `Échéance ${dua.expiryYear}` : 'Conservation illimitée'}
                              </span>
                            </div>
                          </td>

                          {/* Localisation Physique */}
                          <td className="p-3 text-[11px] text-slate-600 font-medium">
                            <div className="flex items-center gap-1">
                              <MapPin size={11} className="text-emerald-600 shrink-0" />
                              <span className="truncate max-w-[200px]" title={location}>
                                {location}
                              </span>
                            </div>
                          </td>

                          {/* Sort Final */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                              dua.isElimination
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            }`}>
                              {dua.isElimination ? 'Élimination (EL)' : 'Conservation (CP)'}
                            </span>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls (Hidden on print) */}
            {rowsPerPage > 0 && totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 px-1 print:hidden">
                <span className="text-xs text-slate-500 font-medium">
                  Page <strong className="text-slate-800 font-bold">{currentPage}</strong> sur <strong>{totalPages}</strong>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-40 transition-all cursor-pointer"
                  >
                    Précédent
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-40 transition-all cursor-pointer"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* --- OFFICIAL SIGNATURES & VALIDATION SEALS --- */}
          {/* ========================================================================= */}
          <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-t-2 border-emerald-900 text-xs">
            
            {/* Signature Direction Versante */}
            <div className="border border-slate-300 rounded-2xl p-5 flex flex-col justify-between space-y-8 bg-slate-50/60">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                  POUR LE SERVICE & LA DIRECTION VERSANTE
                </span>
                <div className="font-bold text-slate-900 text-sm">
                  {customDirectionHead}
                </div>
                <p className="text-[11px] text-slate-500">
                  Certifie l'exactitude des inventaires transmis et donne accord pour le versement et l'application des règles DUA.
                </p>
              </div>

              <div className="pt-8 border-t border-dashed border-slate-300 flex items-center justify-between text-[11px] text-slate-500">
                <span>Date & Visa : ____________________</span>
                <span>Signature & Cachet</span>
              </div>
            </div>

            {/* Signature Responsable Audit & Archives */}
            <div className="border-2 border-emerald-600 rounded-2xl p-5 flex flex-col justify-between space-y-8 bg-emerald-50/40 relative overflow-hidden">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-700" />
                  LE RESPONSABLE D'AUDIT & CENTRE D'ARCHIVES
                </span>
                <div className="font-black text-emerald-950 text-sm">
                  {batch.validatedBy || 'Responsable Audit & Conformité'}
                </div>
                <p className="text-[11px] text-emerald-800/80">
                  Atteste la conformité des règles de conservation, le conditionnement en boîtes scellées et le stockage définitif.
                </p>
              </div>

              <div className="pt-4 border-t border-dashed border-emerald-300 flex items-center justify-between text-[11px] text-emerald-900 font-bold">
                <div>
                  <span>Validé le : </span>
                  <span className="font-mono text-slate-800">{new Date(batch.validatedAt || Date.now()).toLocaleDateString('fr-FR')}</span>
                </div>
                <div className="px-3 py-1 bg-emerald-700 text-white rounded-lg text-[10px] uppercase font-black tracking-wider flex items-center gap-1">
                  <CheckCircle size={12} /> Sceau Électronique Approuvé
                </div>
              </div>
            </div>

          </div>

          {/* Legal Footer Notice */}
          <div className="text-center pt-4 border-t border-slate-200 text-[10px] text-slate-400 font-mono">
            Document juridique certifié — Procès-Verbal de Versement et de Transfert d'Archives MAE #{pvRefNumber} — Conservation sécurisée
          </div>

        </div>

        {/* ========================================================================= */}
        {/* --- BOTTOM ACTION BAR (Hidden on Print) --- */}
        {/* ========================================================================= */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex items-center justify-between print:hidden shrink-0">
          <span className="text-xs text-slate-500 font-medium hidden sm:inline-block">
            Réf Lot : <strong className="text-slate-800 font-mono">{batch.batchNumber}</strong>
          </span>

          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Fermer
            </button>
            <button
              onClick={handlePrint}
              className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer transition-all"
            >
              <Printer size={15} /> Imprimer le PV de Transfert
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
