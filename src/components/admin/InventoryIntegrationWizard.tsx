import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import Barcode from 'react-barcode';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Package,
  Barcode as BarcodeIcon,
  MapPin,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Printer,
  FileText,
  RefreshCw,
  Search,
  Eye,
  Sliders,
  CheckSquare,
  Clock,
  Layers,
  ChevronRight,
  AlertCircle,
  Building2,
  Calendar,
  X,
  ExternalLink,
  Plus,
  Download,
  Filter,
  QrCode
} from 'lucide-react';
import { api } from '../../lib/api';
import { PVTransfertModal } from '../transfer/PVTransfertModal';

interface ExcelFolderRow {
  id: string;
  reference: string;
  codeAgence?: string;
  intitule: string;
  rawIntitule?: string;
  numBoite?: string;
  dateDebut?: string;
  dateCloture?: string;
  year?: string;
  direction?: string;
  observation?: string;
  codeDua?: string;
  retentionYears?: number;
  expiryDate?: string;
  dateElimination?: string;
  finalDisposition?: string;
  generatedBoxNumber?: string;
  barcode?: string;
  localisation?: string;
  batiment?: string;
  depot?: string;
  salle?: string;
  rayon?: string;
  travee?: string;
  tablette?: string;
  niveau?: string;
  rawLocalisation?: string;
  hasExcelLocation?: boolean;
  status?: string;
  rawErrors?: string[];
  rawRow?: Record<string, any>;
}

interface GeneratedBox {
  id: string;
  number: string;
  prefix: string;
  direction: string;
  foldersCount: number;
  foldersList: string[];
  dateRange: string;
  expiryYear: string;
  barcode: string;
  batiment: string;
  depot: string;
  salle: string;
  rayon: string;
  travee: string;
  tablette: string;
  niveau: string;
  rawLocalisation?: string;
  locationSource?: 'excel' | 'bulk' | 'manual';
  hasExcelLocation?: boolean;
  createdAt: string;
}

// Intelligent parser for location data from Excel row
export const parseLocationData = (row: any) => {
  const keys = Object.keys(row);
  
  // 1. Check direct combined location key FIRST (exact Excel column like "Localisation", "Emplacement", "S1-B-208", etc.)
  const locKey = keys.find(k => /(?:localis|emplac|adresse|site|lieu|coord|stockage|box_loc|rangement|^loc$|^pos$|^position$)/i.test(k))
    || keys.find(k => /localis|emplac|adresse|site|lieu|coord|stockage/i.test(k));

  let rawLoc = locKey && row[locKey] !== undefined && row[locKey] !== null ? String(row[locKey]).trim() : '';

  // If no explicit location header, check if any column value matches standard location patterns (e.g. S1-B-208, A-102, R1-T2)
  if (!rawLoc) {
    for (const k of keys) {
      const val = String(row[k] || '').trim();
      if (/^[A-Z0-9]{1,4}-[A-Z0-9]{1,4}(?:-[A-Z0-9]{1,6})?(?:-[A-Z0-9]{1,4})?$/i.test(val) && 
          !/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(val) && 
          !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        if (!/date|ref|sin|police|dossier|annee|year|tel|montant|prime/i.test(k)) {
          rawLoc = val;
          break;
        }
      }
    }
  }

  // 2. Check granular keys
  const batKey = keys.find(k => k !== locKey && /b[aâ]timent|b[aâ]t|building|immeuble/i.test(k));
  const salleKey = keys.find(k => k !== locKey && /salle|local|magasin|piece|room/i.test(k));
  const depotKey = keys.find(k => k !== locKey && /d[eé]p[oô]t|entrepot|stock/i.test(k));
  const rayonKey = keys.find(k => k !== locKey && /rayon|rayonnage|rangee|rack|aisle/i.test(k));
  const traveeKey = keys.find(k => k !== locKey && /trav[eé]e|bay|colonne|section/i.test(k));
  const tabKey = keys.find(k => k !== locKey && /tablette|[eé]tag[eè]re|shelf|table/i.test(k));
  const nivKey = keys.find(k => k !== locKey && /niveau|pos|position|[eé]tage|level/i.test(k));
  
  let batiment = batKey && row[batKey] ? String(row[batKey]).trim() : '';
  let salle = salleKey && row[salleKey] ? String(row[salleKey]).trim() : '';
  let depot = depotKey && row[depotKey] ? String(row[depotKey]).trim() : '';
  let rayon = rayonKey && row[rayonKey] ? String(row[rayonKey]).trim() : '';
  let travee = traveeKey && row[traveeKey] ? String(row[traveeKey]).trim() : '';
  let tablette = tabKey && row[tabKey] ? String(row[tabKey]).trim() : '';
  let niveau = nivKey && row[nivKey] ? String(row[nivKey]).trim() : '';

  // If granular fields are missing, try extracting from rawLoc if it contains structured parts
  if (rawLoc) {
    if (!batiment) {
      const batMatch = rawLoc.match(/(?:b[aâ]timent|b[aâ]t\.?)\s*[:\-_]?\s*([A-Za-z0-9\s]+?)(?=[/\-,|]|$)/i);
      if (batMatch) batiment = batMatch[1].trim();
    }
    if (!salle && !depot) {
      const salleMatch = rawLoc.match(/(?:salle|d[eé]p[oô]t|local)\s*[:\-_]?\s*([A-Za-z0-9\s]+?)(?=[/\-,|]|$)/i);
      if (salleMatch) {
        if (/d[eé]p[oô]t/i.test(salleMatch[0])) depot = salleMatch[1].trim();
        else salle = salleMatch[1].trim();
      }
    }
    if (!rayon) {
      const rMatch = rawLoc.match(/(?:rayon|rayonnage|R)\s*[:\-_]?\s*([A-Za-z0-9]+)/i);
      if (rMatch) rayon = rMatch[1].trim().toUpperCase();
      if (rayon && !rayon.startsWith('R') && /^\d+$/.test(rayon)) rayon = `R${rayon.padStart(2, '0')}`;
    }
    if (!travee) {
      const tMatch = rawLoc.match(/(?:trav[eé]e|T)\s*[:\-_]?\s*([A-Za-z0-9]+)/i);
      if (tMatch) travee = tMatch[1].trim().toUpperCase();
      if (travee && !travee.startsWith('T') && /^\d+$/.test(travee)) travee = `T${travee}`;
    }
    if (!tablette) {
      const tabMatch = rawLoc.match(/(?:tablette|[eé]tag[eè]re|E|TAB)\s*[:\-_]?\s*([A-Za-z0-9]+)/i);
      if (tabMatch) tablette = tabMatch[1].trim();
    }
    if (!niveau) {
      const nivMatch = rawLoc.match(/(?:niveau|pos|position|N)\s*[:\-_]?\s*([A-Za-z0-9]+)/i);
      if (nivMatch) niveau = nivMatch[1].trim().toUpperCase();
      if (niveau && !niveau.startsWith('N') && /^\d+$/.test(niveau)) niveau = `N${niveau}`;
    }

    if (!rayon && !travee && !tablette) {
      const coordMatch = rawLoc.match(/([A-Z0-9]+)\s*[-/]\s*([A-Z0-9]+)(?:\s*[-/]\s*([A-Z0-9]+))?(?:\s*[-/]\s*([A-Z0-9]+))?/i);
      if (coordMatch) {
        if (coordMatch[1]) rayon = coordMatch[1];
        if (coordMatch[2]) travee = coordMatch[2];
        if (coordMatch[3]) tablette = coordMatch[3];
        if (coordMatch[4]) niveau = coordMatch[4];
      }
    }
  }

  const hasLocation = Boolean(rawLoc || batiment || salle || depot || rayon || travee || tablette || niveau);

  return {
    batiment,
    salle,
    depot,
    rayon,
    travee,
    tablette,
    niveau,
    rawLoc, // Exact imported string (e.g. "S1-B-208")
    hasLocation
  };
};

// Helper to format closure date as DD/MM/YYYY
export const getClosureDateDisplay = (f: any): string => {
  const raw = f.dateCloture || f.dateFin || f.date || f.year || '';
  if (!raw) return 'Non renseignée';
  
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
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${day}/${month}/${year}`;
  }

  const ymdMatch = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && !/^\d{4}$/.test(str)) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    if (year >= 1900 && year <= 2100) {
      return `${day}/${month}/${year}`;
    }
  }

  const yearOnlyMatch = str.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearOnlyMatch) {
    return `31/12/${yearOnlyMatch[1]}`;
  }

  return str;
};

const DEFAULT_PREFIX_BY_DIRECTION: Record<string, string> = {
  'Sinistre Matériel': 'Sin.M',
  'Sinistre Corporel': 'Sin.C',
  'Comptabilité': 'Compta',
  'Production': 'Prod',
  'Ressources Humaines': 'RH',
  'Juridique': 'Jur',
  'Recouvrement': 'Recouv',
  'Direction Générale': 'DG',
  'Informatique': 'IT',
  'Général': 'GEN'
};

export const InventoryIntegrationWizard: React.FC<{
  onIntegrationComplete?: () => void;
}> = ({ onIntegrationComplete }) => {
  // Step Navigation: 1 to 7
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Identification & Référencement de l'inventaire (ex: 001/2026, nom, direction, responsable, date)
  const currentYear = new Date().getFullYear();
  const [inventoryRef, setInventoryRef] = useState<string>(`001/${currentYear}`);
  const [inventoryName, setInventoryName] = useState<string>(`Inventaire Sinistre Matériel ${currentYear}`);
  const [directionHead, setDirectionHead] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Étape 1 : Fichier & Importation
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number }[]>([]);
  const [parsedRows, setParsedRows] = useState<ExcelFolderRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<{
    referenceCol: string;
    titleCol: string;
    boxCol: string;
    dateCol: string;
    directionCol: string;
  }>({
    referenceCol: '',
    titleCol: '',
    boxCol: '',
    dateCol: '',
    directionCol: ''
  });
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'warning'>('all');

  // Étape 2 : Calendrier de Conservation
  const [selectedDirection, setSelectedDirection] = useState<string>('Sinistre Matériel');
  const [archivalRules, setArchivalRules] = useState<any[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [customRetentionYears, setCustomRetentionYears] = useState<number>(5);
  const [customDisposition, setCustomDisposition] = useState<'EL' | 'CP' | 'ECH'>('EL');

  // Étape 3 : Génération Codes Boîtes
  const [boxMode, setBoxMode] = useState<'auto' | 'excel'>('auto');
  const [autoBoxPrefix, setAutoBoxPrefix] = useState<string>('Sin.M');
  const [startingBoxIndex, setStartingBoxIndex] = useState<number>(1);
  const [boxCapacity, setBoxCapacity] = useState<number>(20);
  const [generatedBoxes, setGeneratedBoxes] = useState<GeneratedBox[]>([]);

  // Étape 4 : Codes-barres & Étiquettes
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedBoxToPrint, setSelectedBoxToPrint] = useState<GeneratedBox | null>(null);

  // Modal d'affichage de toutes les lignes d'un lot d'inventaire
  const [inspectingBatchLines, setInspectingBatchLines] = useState<any | null>(null);
  const [batchLinesSearch, setBatchLinesSearch] = useState<string>('');
  const [batchLinesSelectedBox, setBatchLinesSelectedBox] = useState<string>('all');
  const [batchLinesSortFinal, setBatchLinesSortFinal] = useState<'all' | 'EL' | 'CP'>('all');
  const [batchLinesPage, setBatchLinesPage] = useState<number>(1);
  const [batchLinesRowsPerPage, setBatchLinesRowsPerPage] = useState<number>(100);

  // Étape 5 : Localisation & Stockage
  const [defaultLocation, setDefaultLocation] = useState({
    batiment: 'Bâtiment Principal',
    depot: 'Dépôt Principal',
    salle: 'Salle A',
    rayon: 'R01',
    travee: 'T1',
    tablette: '01',
    niveau: 'N1'
  });
  const [autoIncrementTablette, setAutoIncrementTablette] = useState<boolean>(true);
  const [boxLocationSearch, setBoxLocationSearch] = useState<string>('');
  const [boxLocationFilter, setBoxLocationFilter] = useState<'all' | 'excel' | 'bulk' | 'manual'>('all');
  const [editingBoxModal, setEditingBoxModal] = useState<GeneratedBox | null>(null);

  // Étape 6 : Validation de l'inventaire
  const [batchNotes, setBatchNotes] = useState('');
  const [submittedBatchId, setSubmittedBatchId] = useState<string | null>(null);

  // Étape 7 : Suivi et Session Responsable Audit
  const [existingBatches, setExistingBatches] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [viewingPVTransfertBatch, setViewingPVTransfertBatch] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Helper to format full location string cleanly
  const formatBoxLocationString = (b: { batiment?: string; depot?: string; salle?: string; rayon?: string; travee?: string; tablette?: string; niveau?: string }) => {
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
    return parts.join(' • ') || 'Emplacement non défini';
  };

  // Count detected excel locations
  const excelLocationsCount = useMemo(() => {
    return parsedRows.filter(r => r.hasExcelLocation).length;
  }, [parsedRows]);

  // Count boxes with extracted locations
  const boxesWithExcelLocationCount = useMemo(() => {
    return generatedBoxes.filter(b => b.hasExcelLocation).length;
  }, [generatedBoxes]);

  // Load Archival Rules & Batches on mount
  useEffect(() => {
    fetchArchivalRules();
    fetchExistingBatches();
  }, []);

  const fetchArchivalRules = async () => {
    try {
      const data = await api.get('/api/archival-directory');
      if (data && Array.isArray(data) && data.length > 0) {
        setArchivalRules(data);
      } else {
        // Fallback standard rules
        setArchivalRules([
          { id: 'R1', reference: 'SIN-MAT-01', title: 'Sinistres Matériels Clôturés', direction: 'Sinistre Matériel', activeYears: 3, semiActiveYears: 7, finalDisposition: 'EL', docType: 'Dossier Sinistre' },
          { id: 'R2', reference: 'SIN-CORP-01', title: 'Sinistres Corporels Graves', direction: 'Sinistre Corporel', activeYears: 5, semiActiveYears: 25, finalDisposition: 'CP', docType: 'Dossier Corporel' },
          { id: 'R3', reference: 'CPT-JRN-01', title: 'Journaux et Pièces Comptables', direction: 'Comptabilité', activeYears: 2, semiActiveYears: 8, finalDisposition: 'EL', docType: 'Pièces Comptables' },
          { id: 'R4', reference: 'RH-PAIE-01', title: 'Bulletins de Paie et Dossiers Employés', direction: 'Ressources Humaines', activeYears: 5, semiActiveYears: 45, finalDisposition: 'CP', docType: 'RH' },
          { id: 'R5', reference: 'PRD-CONTR-01', title: 'Contrats et Polices Production', direction: 'Production', activeYears: 5, semiActiveYears: 5, finalDisposition: 'EL', docType: 'Contrat' },
          { id: 'R6', reference: 'JUR-CTXT-01', title: 'Contentieux et Litiges Juridiques', direction: 'Juridique', activeYears: 5, semiActiveYears: 10, finalDisposition: 'CP', docType: 'Contentieux' }
        ]);
      }
    } catch (err) {
      console.error("Error loading rules:", err);
    }
  };

  const fetchExistingBatches = async () => {
    setLoadingBatches(true);
    try {
      const res = await api.get('/api/inventory-integration/batches');
      setExistingBatches(res || []);
    } catch (e) {
      console.error("Error loading batches:", e);
    } finally {
      setLoadingBatches(false);
    }
  };

  // Export batch lines to Excel
  const handleExportBatchLinesToExcel = (batch: any, foldersToExport: any[]) => {
    try {
      const data = foldersToExport.map((f, idx) => {
        const boxNum = f.boxNumber || f.numBoite || f.generatedBoxNumber || 'Non assignée';
        const closureDate = getClosureDateDisplay(f);
        const dua = f.codeDua || batch?.ruleApplied?.reference || batch?.ruleApplied?.ruleId || 'Standard';
        const sort = (f.finalDisposition === 'CP' || f.sortFinal === 'CP' || f.finalDisposition === 'C') ? 'Conservation (CP)' : 'Élimination (EL)';
        const loc = f.localisation || '';

        // If rawRow exists, export raw columns faithfully alongside DUA rule and Sort final
        if (f.rawRow && typeof f.rawRow === 'object' && Object.keys(f.rawRow).length > 0) {
          return {
            'N° Ordre': idx + 1,
            ...f.rawRow,
            'Règle DUA': dua,
            'Sort Final': sort,
            'Localisation Physique': loc
          };
        }

        const primaryRef = f.reference || f.intitule || f.titre || f.designation || `Dossier #${idx + 1}`;
        return {
          'N° Ordre': idx + 1,
          'Boîte / Stockage': boxNum,
          'Référence Dossier': primaryRef,
          'Date Début': f.dateDebut || '',
          'Date Clôture': closureDate,
          'Direction': f.direction || batch?.direction || '',
          'Règle DUA': dua,
          'Sort Final': sort,
          'Localisation Physique': loc
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Lignes d'Inventaire");
      
      const cleanRef = (batch.inventoryRef || batch.batchNumber || 'Lot').replace(/[\/\\]/g, '_');
      const fileName = `Inventaire_${cleanRef}_Lignes.xlsx`;
      XLSX.writeFile(wb, fileName);
      triggerToast("Fichier Excel exporté avec succès !", "success");
    } catch (err: any) {
      console.error("Export error:", err);
      triggerToast("Erreur lors de l'export Excel.", "error");
    }
  };

  // Synchronize box prefix when direction changes
  useEffect(() => {
    const pref = DEFAULT_PREFIX_BY_DIRECTION[selectedDirection] || selectedDirection.slice(0, 4);
    setAutoBoxPrefix(pref);
    // Find matching rule
    const matched = archivalRules.find(r => r.direction === selectedDirection);
    if (matched) {
      setSelectedRuleId(matched.id);
      const totalDur = (matched.activeYears || 0) + (matched.semiActiveYears || 0) || 5;
      setCustomRetentionYears(totalDur);
      setCustomDisposition(matched.finalDisposition || 'EL');
    }
  }, [selectedDirection, archivalRules]);

  // ----------------------------------------------------
  // --- ÉTAPE 1 : IMPORTATION FICHIER EXCEL ---
  // ----------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | DragEvent) => {
    const files = (e as any).target?.files || (e as any).dataTransfer?.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const filesInfo = [];
    const allRows: ExcelFolderRow[] = [];
    let detectedColsSet = new Set<string>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      filesInfo.push({ name: file.name, size: file.size });

      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as any[];

          jsonData.forEach((row, idx) => {
            Object.keys(row).forEach(k => detectedColsSet.add(k));

            // Intelligent heuristics to find columns without collision
            const keys = Object.keys(row);
            const isComptab = selectedDirection?.toLowerCase().includes('comptab') || selectedDirection?.toLowerCase().includes('finance');

            const boxKey = keys.find(k => /(?:^|[\s_.-])(?:boite|box|carton|paquet|colis|num_boite|n_boite)(?:$|[\s_.-])/i.test(k)) || keys.find(k => /boite|box|carton/i.test(k)) || '';
            
            // Look for Code Agence (used specifically in Comptabilité)
            const agenceKey = keys.find(k => k !== boxKey && /(?:code[\s_.-]?agence|agence[\s_.-]?ctt|code[\s_.-]?ctt|^agence$|^code$|^ctt$)/i.test(k)) || '';

            // Look for Reference key (Code Agence if Comptabilité, else standard reference/sinistre)
            const refKey = (isComptab && agenceKey)
              ? agenceKey
              : (keys.find(k => k !== boxKey && /(?:dossier|sinistre|police|contrat|adherent|reference|ref)(?:$|[\s_.-])/i.test(k)) 
                || (agenceKey || '')
                || keys.find(k => k !== boxKey && /dossier|sinistre|police|contrat|adherent|reference|ref/i.test(k))
                || keys.find(k => k !== boxKey && /(?:^|[\s_.-])(?:numero|num|code)(?:$|[\s_.-])/i.test(k))
                || keys.find(k => k !== boxKey && !/date|annee|exercice|direction|service|departement|localis|batiment|depot|salle|rayon|travee|tablette/i.test(k))
                || keys[0] || '');

            // Look for Intitulé / Contenu exact column (e.g. caisse 117, libellé, titre, etc.)
            const titleKey = keys.find(k => k !== boxKey && k !== refKey && /(?:intitul|contenu|libell|titre|objet|nom|adherant|assure|beneficiaire|police|description|designation|caisse|journal|compte|detail|piece)/i.test(k))
              || keys.find(k => k !== boxKey && k !== refKey && k !== agenceKey && !/date|annee|exercice|direction|service|departement|localis|batiment|depot|salle|rayon|travee|tablette/i.test(k))
              || '';
            
            // Look for start and closure dates
            const startKey = keys.find(k => /d[eé]but|ouv|cr[eé]at|start|survenance|emission|souscription/i.test(k)) || '';
            const closeKey = keys.find(k => /cl[oô]t|fin|ferm|end|echeance|reglement/i.test(k)) || '';
            const generalDateKey = keys.find(k => k !== startKey && k !== closeKey && /date|annee|exercice|an/i.test(k)) || '';
            const dirKey = keys.find(k => /direction|service|departement|branche/i.test(k)) || '';

            // Extract location info directly from row
            const parsedLoc = parseLocationData(row);

            const rawRef = String(row[refKey] || (agenceKey ? row[agenceKey] : '') || '').trim();
            const rawTitle = titleKey && row[titleKey] !== undefined && row[titleKey] !== null ? String(row[titleKey]).trim() : '';
            const codeAgenceVal = agenceKey && row[agenceKey] !== undefined ? String(row[agenceKey]).trim() : (isComptab ? rawRef : '');

            if (!rawRef && !rawTitle) return; // skip completely empty rows

            const rawErrors: string[] = [];
            if (!rawRef) rawErrors.push("Référence absente");

            const normalizeDateStr = (rawVal: any): string => {
              if (!rawVal) return '';
              if (typeof rawVal === 'number' && rawVal > 1000 && rawVal < 100000) {
                const d = new Date(Math.round((rawVal - 25569) * 86400 * 1000));
                if (!isNaN(d.getTime())) {
                  const day = String(d.getUTCDate()).padStart(2, '0');
                  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
                  const year = d.getUTCFullYear();
                  return `${day}/${month}/${year}`;
                }
              }
              const str = String(rawVal).trim();
              const d = new Date(str);
              if (!isNaN(d.getTime()) && !/^\d{4}$/.test(str)) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                if (year >= 1900 && year <= 2100) {
                  return `${day}/${month}/${year}`;
                }
              }
              return str;
            };

            let startVal = startKey && row[startKey] ? normalizeDateStr(row[startKey]) : '';
            let dateVal = (closeKey && row[closeKey] ? normalizeDateStr(row[closeKey]) : '') || (generalDateKey && row[generalDateKey] ? normalizeDateStr(row[generalDateKey]) : '');
            let closureYear = new Date().getFullYear();
            if (dateVal) {
              const yearMatch = dateVal.match(/\d{4}/);
              if (yearMatch) closureYear = parseInt(yearMatch[0]);
            } else if (startVal) {
              const startYearMatch = startVal.match(/\d{4}/);
              if (startYearMatch) closureYear = parseInt(startYearMatch[0]);
            }

            allRows.push({
              id: `row_${Date.now()}_${i}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
              rawRow: { ...row },
              reference: rawRef || `AUTO-REF-${allRows.length + 1}`,
              codeAgence: codeAgenceVal || undefined,
              intitule: rawTitle || (rawRef ? `Dossier ${rawRef}` : ''),
              rawIntitule: rawTitle || undefined,
              numBoite: boxKey && row[boxKey] ? String(row[boxKey]).trim() : undefined,
              dateDebut: startVal || `01/01/${closureYear}`,
              dateCloture: dateVal || `31/12/${closureYear}`,
              year: String(closureYear),
              direction: (dirKey && row[dirKey] ? String(row[dirKey]).trim() : selectedDirection) || selectedDirection,
              observation: row['Observation'] || row['Remarque'] || '',
              batiment: parsedLoc.batiment,
              depot: parsedLoc.depot,
              salle: parsedLoc.salle,
              rayon: parsedLoc.rayon,
              travee: parsedLoc.travee,
              tablette: parsedLoc.tablette,
              niveau: parsedLoc.niveau,
              rawLocalisation: parsedLoc.rawLoc,
              hasExcelLocation: parsedLoc.hasLocation,
              localisation: parsedLoc.rawLoc || (parsedLoc.hasLocation ? formatBoxLocationString(parsedLoc) : undefined),
              rawErrors
            });
          });
        });
      } catch (err) {
        console.error("Error reading file:", file.name, err);
        triggerToast(`Erreur lors de la lecture de ${file.name}`, 'error');
      }
    }

    setUploadedFiles(filesInfo);
    setParsedRows(allRows);
    setDetectedColumns(Array.from(detectedColsSet));
    setIsProcessing(false);

    if (allRows.length > 0) {
      const withLoc = allRows.filter(r => r.hasExcelLocation).length;
      if (withLoc > 0) {
        triggerToast(`${allRows.length} dossier(s) détecté(s) dont ${withLoc} avec coordonnées de localisation extraites !`, 'success');
      } else {
        triggerToast(`${allRows.length} dossier(s) détecté(s) dans ${filesInfo.length} fichier(s) !`, 'success');
      }
    } else {
      triggerToast("Aucun dossier valide trouvé dans le fichier.", 'error');
    }
  };

  // Filtered preview rows
  const previewRows = useMemo(() => {
    if (previewFilter === 'valid') return parsedRows.filter(r => (!r.rawErrors || r.rawErrors.length === 0));
    if (previewFilter === 'warning') return parsedRows.filter(r => (r.rawErrors && r.rawErrors.length > 0));
    return parsedRows;
  }, [parsedRows, previewFilter]);

  // ----------------------------------------------------
  // --- ÉTAPE 2 : APPLIQUER CALENDRIER DE CONSERVATION ---
  // ----------------------------------------------------
  const applyRetentionRules = () => {
    const matchedRule = archivalRules.find(r => r.id === selectedRuleId);
    const ruleCode = matchedRule ? matchedRule.reference : `DUA-${selectedDirection.slice(0, 4).toUpperCase()}`;
    const duration = customRetentionYears || (matchedRule ? (matchedRule.activeYears || 0) + (matchedRule.semiActiveYears || 0) : 5);
    const disp = customDisposition || (matchedRule ? matchedRule.finalDisposition : 'EL');

    const updated = parsedRows.map(row => {
      let cYear = new Date().getFullYear();
      if (row.dateCloture) {
        const m = String(row.dateCloture).match(/\d{4}/);
        if (m) cYear = parseInt(m[0]);
      } else if (row.year) {
        cYear = parseInt(row.year);
      }
      const expYear = cYear + duration;

      return {
        ...row,
        direction: selectedDirection,
        codeDua: ruleCode,
        retentionYears: duration,
        expiryDate: String(expYear),
        dateElimination: `${expYear}-12-31`,
        finalDisposition: disp
      };
    });

    setParsedRows(updated);
    triggerToast(`Règle ${ruleCode} (${duration} ans - Sort: ${disp}) appliquée aux ${updated.length} dossiers !`, 'success');
    setCurrentStep(3);
  };

  // ----------------------------------------------------
  // --- ÉTAPE 3 : GÉNÉRATION DES CODES BOÎTES ---
  // ----------------------------------------------------
  const generateBoxCodes = () => {
    if (parsedRows.length === 0) {
      triggerToast("Aucun dossier importé.", "error");
      return;
    }

    const boxesMap: Record<string, GeneratedBox> = {};
    const updatedRows: ExcelFolderRow[] = [];

    if (boxMode === 'auto') {
      // Automatic Mode: Sin.M.001, Sin.M.002 ...
      const prefix = autoBoxPrefix || 'BOX';
      const cap = Math.max(1, boxCapacity || 20);

      parsedRows.forEach((row, idx) => {
        const boxSeqNumber = startingBoxIndex + Math.floor(idx / cap);
        const formattedBoxCode = `${prefix}.${String(boxSeqNumber).padStart(3, '0')}`;
        const barcodeCode = `BOX-${formattedBoxCode}-${new Date().getFullYear()}`;

        if (!boxesMap[formattedBoxCode]) {
          // Check if row has extracted location
          const hasLoc = Boolean(row.hasExcelLocation || row.rawLocalisation);
          boxesMap[formattedBoxCode] = {
            id: `box_${formattedBoxCode}_${Date.now()}`,
            number: formattedBoxCode,
            prefix: prefix,
            direction: selectedDirection,
            foldersCount: 0,
            foldersList: [],
            dateRange: '',
            expiryYear: row.expiryDate || '',
            barcode: barcodeCode,
            rawLocalisation: row.rawLocalisation,
            batiment: row.batiment || defaultLocation.batiment,
            depot: row.depot || defaultLocation.depot,
            salle: row.salle || defaultLocation.salle,
            rayon: row.rayon || defaultLocation.rayon,
            travee: row.travee || defaultLocation.travee,
            tablette: row.tablette || defaultLocation.tablette,
            niveau: row.niveau || defaultLocation.niveau,
            locationSource: hasLoc ? 'excel' : 'bulk',
            hasExcelLocation: hasLoc,
            createdAt: new Date().toISOString()
          };
        } else if (!boxesMap[formattedBoxCode].hasExcelLocation && (row.hasExcelLocation || row.rawLocalisation)) {
          // Inherit excel location if earlier folder didn't have one
          boxesMap[formattedBoxCode].rawLocalisation = row.rawLocalisation || boxesMap[formattedBoxCode].rawLocalisation;
          boxesMap[formattedBoxCode].batiment = row.batiment || boxesMap[formattedBoxCode].batiment;
          boxesMap[formattedBoxCode].depot = row.depot || boxesMap[formattedBoxCode].depot;
          boxesMap[formattedBoxCode].salle = row.salle || boxesMap[formattedBoxCode].salle;
          boxesMap[formattedBoxCode].rayon = row.rayon || boxesMap[formattedBoxCode].rayon;
          boxesMap[formattedBoxCode].travee = row.travee || boxesMap[formattedBoxCode].travee;
          boxesMap[formattedBoxCode].tablette = row.tablette || boxesMap[formattedBoxCode].tablette;
          boxesMap[formattedBoxCode].niveau = row.niveau || boxesMap[formattedBoxCode].niveau;
          boxesMap[formattedBoxCode].hasExcelLocation = true;
          boxesMap[formattedBoxCode].locationSource = 'excel';
        }

        boxesMap[formattedBoxCode].foldersCount += 1;
        boxesMap[formattedBoxCode].foldersList.push(row.reference);
        if (!boxesMap[formattedBoxCode].expiryYear && row.expiryDate) {
          boxesMap[formattedBoxCode].expiryYear = row.expiryDate;
        }

        updatedRows.push({
          ...row,
          generatedBoxNumber: formattedBoxCode,
          numBoite: formattedBoxCode,
          barcode: barcodeCode
        });
      });
    } else {
      // Mode 2: Preserve existing box number from Excel
      parsedRows.forEach((row, idx) => {
        let boxCode = row.numBoite && row.numBoite.trim() !== '' ? row.numBoite.trim() : `BOITE-${String(Math.floor(idx / 20) + 1).padStart(3, '0')}`;
        const barcodeCode = `BOX-${boxCode.replace(/\s+/g, '_')}-${new Date().getFullYear()}`;

        if (!boxesMap[boxCode]) {
          const hasLoc = Boolean(row.hasExcelLocation || row.rawLocalisation);
          boxesMap[boxCode] = {
            id: `box_${boxCode}_${Date.now()}`,
            number: boxCode,
            prefix: 'EXCEL',
            direction: selectedDirection,
            foldersCount: 0,
            foldersList: [],
            dateRange: '',
            expiryYear: row.expiryDate || '',
            barcode: barcodeCode,
            rawLocalisation: row.rawLocalisation,
            batiment: row.batiment || defaultLocation.batiment,
            depot: row.depot || defaultLocation.depot,
            salle: row.salle || defaultLocation.salle,
            rayon: row.rayon || defaultLocation.rayon,
            travee: row.travee || defaultLocation.travee,
            tablette: row.tablette || defaultLocation.tablette,
            niveau: row.niveau || defaultLocation.niveau,
            locationSource: hasLoc ? 'excel' : 'bulk',
            hasExcelLocation: hasLoc,
            createdAt: new Date().toISOString()
          };
        } else if (!boxesMap[boxCode].hasExcelLocation && (row.hasExcelLocation || row.rawLocalisation)) {
          boxesMap[boxCode].rawLocalisation = row.rawLocalisation || boxesMap[boxCode].rawLocalisation;
          boxesMap[boxCode].batiment = row.batiment || boxesMap[boxCode].batiment;
          boxesMap[boxCode].depot = row.depot || boxesMap[boxCode].depot;
          boxesMap[boxCode].salle = row.salle || boxesMap[boxCode].salle;
          boxesMap[boxCode].rayon = row.rayon || boxesMap[boxCode].rayon;
          boxesMap[boxCode].travee = row.travee || boxesMap[boxCode].travee;
          boxesMap[boxCode].tablette = row.tablette || boxesMap[boxCode].tablette;
          boxesMap[boxCode].niveau = row.niveau || boxesMap[boxCode].niveau;
          boxesMap[boxCode].hasExcelLocation = true;
          boxesMap[boxCode].locationSource = 'excel';
        }

        boxesMap[boxCode].foldersCount += 1;
        boxesMap[boxCode].foldersList.push(row.reference);

        updatedRows.push({
          ...row,
          generatedBoxNumber: boxCode,
          numBoite: boxCode,
          barcode: barcodeCode
        });
      });
    }

    const boxList = Object.values(boxesMap);
    setGeneratedBoxes(boxList);
    setParsedRows(updatedRows);
    triggerToast(`${boxList.length} boîte(s) générée(s) avec succès !`, 'success');
    setCurrentStep(4);
  };

  // ----------------------------------------------------
  // --- ÉTAPE 5 : AFFECTATION DES EMPLACEMENTS ---
  // ----------------------------------------------------
  // 1. Apply extracted Excel locations directly to boxes
  const handleApplyExtractedExcelLocations = () => {
    let appliedCount = 0;
    const updatedBoxes = generatedBoxes.map(b => {
      // Find matching folder with excel location
      const matchingFolder = parsedRows.find(r => (r.numBoite === b.number || r.generatedBoxNumber === b.number) && (r.hasExcelLocation || r.rawLocalisation));
      if (matchingFolder) {
        appliedCount++;
        return {
          ...b,
          rawLocalisation: matchingFolder.rawLocalisation || b.rawLocalisation,
          batiment: matchingFolder.batiment || b.batiment,
          depot: matchingFolder.depot || b.depot,
          salle: matchingFolder.salle || b.salle,
          rayon: matchingFolder.rayon || b.rayon,
          travee: matchingFolder.travee || b.travee,
          tablette: matchingFolder.tablette || b.tablette,
          niveau: matchingFolder.niveau || b.niveau,
          locationSource: 'excel' as const,
          hasExcelLocation: true
        };
      }
      return b;
    });

    setGeneratedBoxes(updatedBoxes);

    // Synchronize parsedRows localisation string without erasing rawLocalisation
    const updatedRows = parsedRows.map(row => {
      if (row.rawLocalisation) {
        return row;
      }
      const box = updatedBoxes.find(b => b.number === row.numBoite || b.number === row.generatedBoxNumber);
      return {
        ...row,
        localisation: box ? (box.rawLocalisation || formatBoxLocationString(box)) : row.localisation
      };
    });

    setParsedRows(updatedRows);
    triggerToast(`✨ Localisations extraites du fichier Excel appliquées à ${appliedCount} boîte(s) !`, 'success');
  };

  // 2. Apply Bulk Location to all boxes
  const handleApplyBulkLocation = () => {
    const updatedBoxes = generatedBoxes.map((b, idx) => {
      // Auto-increment shelf / tablette position if enabled
      let tableteIndex = defaultLocation.tablette;
      if (autoIncrementTablette) {
        const baseTab = parseInt(defaultLocation.tablette.replace(/\D/g, '') || '1');
        const offset = Math.floor(idx / 10);
        tableteIndex = String(baseTab + offset).padStart(2, '0');
      }

      return {
        ...b,
        batiment: defaultLocation.batiment,
        depot: defaultLocation.depot,
        salle: defaultLocation.salle,
        rayon: defaultLocation.rayon,
        travee: defaultLocation.travee,
        tablette: tableteIndex,
        niveau: defaultLocation.niveau,
        locationSource: 'bulk' as const
      };
    });

    setGeneratedBoxes(updatedBoxes);

    // Update rows with full formatted location string while preserving rows that have Excel rawLocalisation
    const updatedRows = parsedRows.map(row => {
      if (row.rawLocalisation) {
        return row;
      }
      const box = updatedBoxes.find(b => b.number === row.numBoite || b.number === row.generatedBoxNumber);
      return {
        ...row,
        localisation: box ? formatBoxLocationString(box) : ''
      };
    });

    setParsedRows(updatedRows);
    triggerToast(`Emplacements physiques appliqués à l'ensemble du lot (${updatedBoxes.length} boîtes) !`, 'success');
  };

  // 3. Update single box location
  const handleSaveSingleBoxLocation = (updatedBox: GeneratedBox) => {
    const newBoxList = generatedBoxes.map(b => b.id === updatedBox.id ? { ...updatedBox, locationSource: 'manual' as const } : b);
    setGeneratedBoxes(newBoxList);

    // Synchronize parsed rows
    const locStr = formatBoxLocationString(updatedBox);
    const updatedRows = parsedRows.map(row => {
      if (row.numBoite === updatedBox.number || row.generatedBoxNumber === updatedBox.number) {
        return {
          ...row,
          localisation: locStr,
          batiment: updatedBox.batiment,
          depot: updatedBox.depot,
          salle: updatedBox.salle,
          rayon: updatedBox.rayon,
          travee: updatedBox.travee,
          tablette: updatedBox.tablette,
          niveau: updatedBox.niveau
        };
      }
      return row;
    });

    setParsedRows(updatedRows);
    setEditingBoxModal(null);
    triggerToast(`Emplacement de la boîte ${updatedBox.number} mis à jour avec succès !`, 'success');
  };

  // Filtered boxes for Step 5 table
  const filteredBoxesForLocation = useMemo(() => {
    return generatedBoxes.filter(box => {
      // Filter by search
      if (boxLocationSearch) {
        const q = boxLocationSearch.toLowerCase();
        const matchNum = box.number.toLowerCase().includes(q);
        const matchBarcode = box.barcode.toLowerCase().includes(q);
        const matchLoc = `${box.batiment} ${box.depot} ${box.salle} ${box.rayon} ${box.travee} ${box.tablette} ${box.niveau}`.toLowerCase().includes(q);
        if (!matchNum && !matchBarcode && !matchLoc) return false;
      }

      // Filter by source
      if (boxLocationFilter === 'excel') return box.locationSource === 'excel' || box.hasExcelLocation;
      if (boxLocationFilter === 'bulk') return box.locationSource === 'bulk';
      if (boxLocationFilter === 'manual') return box.locationSource === 'manual';

      return true;
    });
  }, [generatedBoxes, boxLocationSearch, boxLocationFilter]);

  // ----------------------------------------------------
  // --- ÉTAPE 6 : VALIDATION & SOUMISSION À L'AUDIT ---
  // ----------------------------------------------------
  const handleSubmitBatchForAudit = async () => {
    if (parsedRows.length === 0 || generatedBoxes.length === 0) {
      triggerToast("Données d'intégration incomplètes.", "error");
      return;
    }

    setIsProcessing(true);
    try {
      const cleanRefSlug = (inventoryRef || 'LOT').trim().replace(/[\/\s]/g, '-');
      const batchNumber = `LOT-${new Date().getFullYear()}-${selectedDirection.slice(0, 3).toUpperCase()}-${cleanRefSlug}-${String(Date.now()).slice(-4)}`;
      const payload = {
        batchNumber,
        inventoryRef: inventoryRef.trim() || `001/${new Date().getFullYear()}`,
        inventoryName: inventoryName.trim() || `Inventaire ${selectedDirection} ${new Date().getFullYear()}`,
        direction: selectedDirection,
        directionHead: directionHead.trim() || undefined,
        transferDate: transferDate || new Date().toISOString().slice(0, 10),
        folders: parsedRows.map(r => ({
          reference: r.reference,
          codeAgence: r.codeAgence,
          intitule: r.rawIntitule || r.intitule,
          rawIntitule: r.rawIntitule,
          numBoite: r.numBoite || r.generatedBoxNumber,
          boxNumber: r.numBoite || r.generatedBoxNumber,
          direction: r.direction || selectedDirection,
          dateDebut: r.dateDebut || (r.year ? `${r.year}-01-01` : '') || r.dateCloture,
          dateCloture: r.dateCloture || (r.year ? `${r.year}-12-31` : ''),
          dateFin: r.dateCloture || (r.year ? `${r.year}-12-31` : ''),
          year: r.year || (r.dateCloture ? String(r.dateCloture).match(/\d{4}/)?.[0] : ''),
          codeDua: r.codeDua || (selectedRuleId ? archivalRules.find(x => x.id === selectedRuleId)?.reference : `DUA-${selectedDirection.slice(0, 4).toUpperCase()}`),
          retentionYears: r.retentionYears || customRetentionYears || 5,
          expiryDate: r.expiryDate || (r.year ? String(parseInt(r.year) + (r.retentionYears || customRetentionYears || 5)) : ''),
          dateElimination: r.dateElimination || (r.expiryDate ? `${r.expiryDate}-12-31` : ''),
          finalDisposition: r.finalDisposition || customDisposition || 'EL',
          localisation: r.rawLocalisation || r.localisation || formatBoxLocationString(defaultLocation),
          rawLocalisation: r.rawLocalisation || undefined,
          barcode: r.barcode,
          observation: r.observation || '',
          rawRow: r.rawRow || undefined
        })),
        boxes: generatedBoxes.map(b => ({
          id: b.id,
          number: b.number,
          boxNumber: b.number,
          title: `${selectedDirection} - ${inventoryName || 'Lot'} (${inventoryRef || batchNumber})`,
          direction: b.direction,
          foldersCount: b.foldersCount,
          foldersList: b.foldersList,
          barcode: b.barcode,
          rawLocalisation: b.rawLocalisation || undefined,
          localisation: b.rawLocalisation || formatBoxLocationString(b),
          batiment: b.batiment,
          depot: b.depot,
          salle: b.salle,
          rayon: b.rayon,
          travee: b.travee,
          tablette: b.tablette,
          niveau: b.niveau
        })),
        ruleApplied: {
          direction: selectedDirection,
          ruleId: selectedRuleId,
          retentionYears: customRetentionYears,
          finalDisposition: customDisposition
        },
        notes: batchNotes
      };

      const res = await api.post('/api/inventory-integration/submit-batch', payload);
      setSubmittedBatchId(res.id || batchNumber);
      triggerToast(`Lot ${inventoryRef || batchNumber} soumis avec succès ! Notification envoyée à la session Responsable Audit.`, 'success');
      await fetchExistingBatches();
      setCurrentStep(7);
      if (onIntegrationComplete) onIntegrationComplete();
    } catch (err: any) {
      console.error("Submission error:", err);
      triggerToast(err.message || "Erreur de soumission du lot.", 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset wizard to start fresh
  const handleResetWizard = () => {
    setCurrentStep(1);
    setUploadedFiles([]);
    setParsedRows([]);
    setGeneratedBoxes([]);
    setBatchNotes('');
    setSubmittedBatchId(null);
    setInventoryRef(`001/${new Date().getFullYear()}`);
    setInventoryName(`Inventaire ${selectedDirection} ${new Date().getFullYear()}`);
    setDirectionHead('');
    setTransferDate(new Date().toISOString().slice(0, 10));
  };

  return (
    <div className="w-full space-y-6">
      {/* Toast Alert Notice */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 right-4 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md text-xs font-bold border ${
              toast.type === 'success' ? 'bg-emerald-900 text-white border-emerald-500/30' :
              toast.type === 'error' ? 'bg-rose-900 text-white border-rose-500/30' :
              'bg-blue-900 text-white border-blue-500/30'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
            {toast.type === 'error' && <AlertTriangle size={16} className="text-rose-400" />}
            {toast.type === 'info' && <Sparkles size={16} className="text-blue-400" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Header Card with Progress Bar */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 lg:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-black uppercase tracking-widest">
                <Sparkles size={16} /> MODULE OFFICIEL D'INTÉGRATION DES INVENTAIRES
              </div>
              <h2 className="text-xl md:text-2xl font-black tracking-tight text-white mt-1">
                Workflow d'Intégration & Numérotation en 7 Étapes
              </h2>
              <p className="text-slate-400 text-xs mt-1 max-w-2xl font-medium">
                Importation Excel, association du calendrier DUA, génération des codes boîtes standardisés, impression des codes-barres, affectation des rayonnages et validation finale par le Responsable Audit.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handleResetWizard}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border border-white/10"
              >
                <RefreshCw size={14} /> Nouveau lot
              </button>
              <button
                onClick={() => setCurrentStep(7)}
                className="px-4 py-2 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 border border-emerald-500/30"
              >
                <Eye size={14} /> Suivi des lots ({existingBatches.length})
              </button>
            </div>
          </div>

          {/* Stepper Navigation Indicator */}
          <div className="pt-4 border-t border-slate-800">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {[
                { step: 1, title: '1. Import Excel', icon: Upload },
                { step: 2, title: '2. Calendrier DUA', icon: Calendar },
                { step: 3, title: '3. Codes Boîtes', icon: Package },
                { step: 4, title: '4. Codes-Barres', icon: BarcodeIcon },
                { step: 5, title: '5. Stockage', icon: MapPin },
                { step: 6, title: '6. Validation', icon: CheckSquare },
                { step: 7, title: '7. Audit Final', icon: ShieldCheck }
              ].map(s => {
                const Icon = s.icon;
                const isActive = currentStep === s.step;
                const isPassed = currentStep > s.step;
                return (
                  <button
                    key={s.step}
                    onClick={() => {
                      // Allow jumping back to earlier steps or next if valid
                      if (s.step <= currentStep || (s.step === currentStep + 1 && parsedRows.length > 0)) {
                        setCurrentStep(s.step);
                      }
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md font-black'
                        : isPassed
                          ? 'bg-slate-800 text-emerald-300 border-emerald-500/20 font-bold'
                          : 'bg-slate-800/40 text-slate-500 border-transparent font-medium hover:text-slate-300'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                      isActive ? 'bg-white text-emerald-800' : isPassed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {isPassed ? <CheckCircle2 size={13} /> : s.step}
                    </div>
                    <span className="text-[11px] truncate tracking-tight">{s.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* --- ÉTAPE 1 : IMPORTATION DU FICHIER EXCEL --- */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <motion.div
          key="step-1"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full uppercase tracking-wider">
                ÉTAPE 1 SUR 7
              </span>
              <h3 className="text-lg font-black text-slate-800 mt-2 flex items-center gap-2">
                <FileSpreadsheet className="text-emerald-600" size={20} />
                Importation des Fichiers Excel & Contrôle Automatique
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sélectionnez un ou plusieurs fichiers Excel (.xlsx, .xls) ou CSV. L'application vérifie la conformité des colonnes et des données.
              </p>
            </div>

            {parsedRows.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                  {parsedRows.length} dossier(s) chargé(s)
                </span>
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer transition-all"
                >
                  Suivant : Calendrier DUA <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Identification de l'Inventaire (Direction, Responsable, Date, Référence 001/2026 & Nom) */}
          <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-slate-50 border border-emerald-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs shrink-0">
                <FileText size={16} />
              </div>
              <div>
                <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                  Identification, Direction & Paramètres de l'Inventaire
                </h4>
                <p className="text-[11px] text-emerald-800">
                  Renseignez la direction versante, le responsable, la date du transfert ainsi que la référence officielle.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Direction / Service Versant */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-700 uppercase flex items-center gap-1">
                  <span>Direction / Service Versant</span>
                  <span className="text-emerald-700 font-bold">*</span>
                </label>
                <select
                  value={selectedDirection}
                  onChange={e => {
                    const newDir = e.target.value;
                    setSelectedDirection(newDir);
                    const pref = DEFAULT_PREFIX_BY_DIRECTION[newDir] || 'GEN';
                    setAutoBoxPrefix(pref);
                    if (!inventoryName || inventoryName.startsWith('Inventaire ')) {
                      setInventoryName(`Inventaire ${newDir} ${currentYear}`);
                    }
                  }}
                  className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none shadow-xs"
                >
                  <option value="Sinistre Matériel">Sinistre Matériel</option>
                  <option value="Sinistre Corporel">Sinistre Corporel</option>
                  <option value="Comptabilité">Comptabilité & Finance</option>
                  <option value="Production">Production & Souscription</option>
                  <option value="Ressources Humaines">Ressources Humaines</option>
                  <option value="Juridique">Juridique & Contentieux</option>
                  <option value="Recouvrement">Recouvrement</option>
                  <option value="Direction Générale">Direction Générale</option>
                  <option value="Informatique">Informatique (DSI)</option>
                  <option value="Général">Général / Multi-Services</option>
                </select>
                <span className="text-[9px] text-slate-500 block">
                  Service émetteur du versement d'archives.
                </span>
              </div>

              {/* Responsable de Direction */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-700 uppercase flex items-center gap-1">
                  <span>Responsable de la Direction</span>
                  <span className="text-emerald-700 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={directionHead}
                  onChange={e => setDirectionHead(e.target.value)}
                  placeholder="Ex: M. Ahmed Ben Ali - Chef de Service"
                  className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none shadow-xs placeholder:text-slate-400"
                />
                <span className="text-[9px] text-slate-500 block">
                  Signataire et demandeur du PV de transfert.
                </span>
              </div>

              {/* Date du Transfert */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-700 uppercase flex items-center gap-1">
                  <span>Date du Transfert / Inventaire</span>
                  <span className="text-emerald-700 font-bold">*</span>
                </label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={e => setTransferDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none shadow-xs"
                />
                <span className="text-[9px] text-slate-500 block">
                  Date de réalisation et de prise en charge.
                </span>
              </div>

              {/* Référence d'inventaire */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-700 uppercase flex items-center gap-1">
                  <span>Référence d'Inventaire</span>
                  <span className="text-emerald-700 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={inventoryRef}
                  onChange={e => setInventoryRef(e.target.value)}
                  placeholder="Ex: 001/2026"
                  className="w-full bg-white border-2 border-emerald-300 focus:border-emerald-600 rounded-xl px-3.5 py-2 text-xs font-mono font-black text-slate-900 focus:outline-none shadow-xs"
                />
                <span className="text-[9px] text-slate-500 block">
                  Format standard : <strong className="text-emerald-800 font-mono">001/2026</strong>
                </span>
              </div>

              {/* Nom d'inventaire */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[10px] font-black text-slate-700 uppercase flex items-center gap-1">
                  <span>Nom / Intitulé de l'Inventaire</span>
                  <span className="text-emerald-700 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={inventoryName}
                  onChange={e => setInventoryName(e.target.value)}
                  placeholder="Ex: Inventaire Général Sinistres Matériels 2026"
                  className="w-full bg-white border border-slate-300 focus:border-emerald-600 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none shadow-xs"
                />
                <span className="text-[9px] text-slate-500 block">
                  Intitulé descriptif pour le suivi de l'audit et l'archivage légal.
                </span>
              </div>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              handleFileUpload(e as any);
            }}
            className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70 rounded-3xl p-8 lg:p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileUpload}
            />
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-700/20">
              <Upload size={28} />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-800">
                Glissez-déposez vos fichiers Excel ici ou cliquez pour parcourir
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Formats acceptés : Microsoft Excel (.xlsx, .xls), CSV UTF-8. Détection multi-feuilles automatique.
              </p>
            </div>
            {isProcessing && (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 animate-pulse">
                <RefreshCw size={14} className="animate-spin" /> Analyse et vérification automatique des lignes...
              </div>
            )}
          </div>

          {/* Detection & Data Quality Summary */}
          {parsedRows.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Fichiers Lus</span>
                  <span className="text-lg font-black text-slate-800 mt-1 block">
                    {uploadedFiles.map(f => f.name).join(', ')}
                  </span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">Lignes Détectées</span>
                  <span className="text-lg font-black text-emerald-800 mt-1 block font-mono">
                    {parsedRows.length} dossiers
                  </span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider block">Colonnes Reconnues</span>
                  <span className="text-xs font-bold text-blue-800 mt-1 block">
                    {detectedColumns.slice(0, 5).join(', ')} {detectedColumns.length > 5 ? `(+${detectedColumns.length - 5})` : ''}
                  </span>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Aperçu des 20 premières lignes vérifiées
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPreviewFilter('all')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${previewFilter === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
                    >
                      Tous ({parsedRows.length})
                    </button>
                    <button
                      onClick={() => setPreviewFilter('valid')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${previewFilter === 'valid' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}
                    >
                      Valides ({parsedRows.filter(r => !r.rawErrors?.length).length})
                    </button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-[10px] font-black text-slate-500 uppercase sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5">
                          {selectedDirection.toLowerCase().includes('comptab') || selectedDirection.toLowerCase().includes('ctt') ? 'Code Agence' : 'Réf. Dossier'}
                        </th>
                        <th className="px-4 py-2.5">Intitulé / Objet</th>
                        <th className="px-4 py-2.5">Boîte Origine</th>
                        <th className="px-4 py-2.5">Date / Exercice</th>
                        <th className="px-4 py-2.5">Direction</th>
                        <th className="px-4 py-2.5 text-center">Conformité</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {previewRows.slice(0, 20).map((row, idx) => (
                        <tr key={row.id || idx} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2 font-mono font-bold text-slate-800">
                            {row.codeAgence || row.reference}
                          </td>
                          <td className="px-4 py-2 text-slate-700 max-w-[250px] truncate" title={row.rawIntitule || row.intitule}>
                            {row.rawIntitule || row.intitule}
                          </td>
                          <td className="px-4 py-2 text-slate-500 font-mono">{row.numBoite || '-'}</td>
                          <td className="px-4 py-2 text-slate-600">{row.dateCloture || row.year || '-'}</td>
                          <td className="px-4 py-2 text-slate-600">{row.direction}</td>
                          <td className="px-4 py-2 text-center">
                            {row.rawErrors && row.rawErrors.length > 0 ? (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {row.rawErrors[0]}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1">
                                <CheckCircle2 size={11} /> OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* --- ÉTAPE 2 : CHOIX DU CALENDRIER DE CONSERVATION (DUA) --- */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <motion.div
          key="step-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full uppercase tracking-wider">
                ÉTAPE 2 SUR 7
              </span>
              <h3 className="text-lg font-black text-slate-800 mt-2 flex items-center gap-2">
                <Calendar className="text-emerald-600" size={20} />
                Choix du Calendrier de Conservation & Calcul des Délais DUA
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Associez les règles de conservation officielles de la direction pour calculer automatiquement la date d'échéance et le sort final.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all"
              >
                <ArrowLeft size={14} /> Précédent
              </button>
              <button
                onClick={applyRetentionRules}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer transition-all"
              >
                Appliquer & Suivant : Boîtes <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Direction and Rule Selection */}
            <div className="md:col-span-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                  1. Direction / Service Versant :
                </label>
                <select
                  value={selectedDirection}
                  onChange={e => setSelectedDirection(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Sinistre Matériel">Sinistre Matériel</option>
                  <option value="Sinistre Corporel">Sinistre Corporel</option>
                  <option value="Comptabilité">Comptabilité & Finance</option>
                  <option value="Production">Production & Souscription</option>
                  <option value="Ressources Humaines">Ressources Humaines</option>
                  <option value="Juridique">Juridique & Contentieux</option>
                  <option value="Recouvrement">Recouvrement</option>
                  <option value="Direction Générale">Direction Générale</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                  2. Règle DUA Associée :
                </label>
                <select
                  value={selectedRuleId}
                  onChange={e => {
                    setSelectedRuleId(e.target.value);
                    const r = archivalRules.find(rule => rule.id === e.target.value);
                    if (r) {
                      setCustomRetentionYears((r.activeYears || 0) + (r.semiActiveYears || 0) || 5);
                      setCustomDisposition(r.finalDisposition || 'EL');
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Sélectionner une règle --</option>
                  {archivalRules.map(rule => {
                    const dur = (rule.activeYears || 0) + (rule.semiActiveYears || 0) || 5;
                    return (
                      <option key={rule.id} value={rule.id}>
                        {rule.reference} : {rule.title} ({dur} ans - {rule.finalDisposition === 'EL' ? 'Élimination' : 'Conservation'})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Durée Totale DUA (Ans)</label>
                  <input
                    type="number"
                    value={customRetentionYears}
                    onChange={e => setCustomRetentionYears(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Sort Final</label>
                  <select
                    value={customDisposition}
                    onChange={e => setCustomDisposition(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-black text-slate-800"
                  >
                    <option value="EL">Élimination (EL)</option>
                    <option value="CP">Conservation Permanente (CP)</option>
                    <option value="ECH">Tri / Échantillonnage (ECH)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Live Calculation Info Card */}
            <div className="md:col-span-6 bg-slate-900 text-white rounded-3xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block">
                  SIMULATION D'ÉCHÉANCE ET RÈGLE DUA
                </span>
                <h4 className="text-xl font-black">
                  {archivalRules.find(r => r.id === selectedRuleId)?.title || `Règle de conservation : ${selectedDirection}`}
                </h4>
                <div className="space-y-2 text-xs text-slate-300 font-medium">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span>Durée de conservation active + semi-active :</span>
                    <span className="font-bold text-emerald-400 font-mono">{customRetentionYears} ans</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span>Formule de calcul :</span>
                    <span className="font-bold text-white font-mono">Date Clôture + {customRetentionYears} ans</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span>Sort final :</span>
                    <span className="font-bold text-amber-300">
                      {customDisposition === 'EL' ? 'Destruction / Élimination certifiée' : 'Versement définitif / Conservation'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-[11px] text-emerald-300 font-medium">
                Cette règle sera automatiquement appliquée à l'ensemble des <strong className="text-white">{parsedRows.length} dossier(s)</strong> lors du passage à l'étape suivante.
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* --- ÉTAPE 3 : GÉNÉRATION AUTOMATIQUE DES CODES BOÎTES --- */}
      {/* ========================================================================= */}
      {currentStep === 3 && (
        <motion.div
          key="step-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full uppercase tracking-wider">
                ÉTAPE 3 SUR 7
              </span>
              <h3 className="text-lg font-black text-slate-800 mt-2 flex items-center gap-2">
                <Package className="text-emerald-600" size={20} />
                Génération des Numéros & Codes Boîtes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Deux modes disponibles : Génération automatique selon le type d'archives ou conservation des numéros existants du fichier Excel.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all"
              >
                <ArrowLeft size={14} /> Précédent
              </button>
              <button
                onClick={generateBoxCodes}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer transition-all"
              >
                Générer & Suivant : Codes-Barres <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => setBoxMode('auto')}
              className={`p-6 rounded-3xl border-2 transition-all cursor-pointer space-y-3 ${
                boxMode === 'auto'
                  ? 'border-emerald-600 bg-emerald-50/50 shadow-md'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-sm text-slate-800">
                  <Sparkles size={18} className="text-emerald-600" />
                  Mode 1 : Génération Automatique Standardisée
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${boxMode === 'auto' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>
                  {boxMode === 'auto' && <CheckCircle2 size={12} />}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Génère automatiquement les codes boîtes avec les préfixes officiels du centre d'archives :
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono font-bold text-slate-700 pt-1">
                <div className="p-2 bg-white rounded-xl border border-slate-200">Sin.M.001 → Sinistre Matériel</div>
                <div className="p-2 bg-white rounded-xl border border-slate-200">Compta.001 → Comptabilité</div>
                <div className="p-2 bg-white rounded-xl border border-slate-200">Prod.001 → Production</div>
                <div className="p-2 bg-white rounded-xl border border-slate-200">RH.001 → RH</div>
              </div>
            </div>

            <div
              onClick={() => setBoxMode('excel')}
              className={`p-6 rounded-3xl border-2 transition-all cursor-pointer space-y-3 ${
                boxMode === 'excel'
                  ? 'border-emerald-600 bg-emerald-50/50 shadow-md'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-sm text-slate-800">
                  <FileSpreadsheet size={18} className="text-emerald-600" />
                  Mode 2 : Numéros Déjà Présents dans l'Excel
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${boxMode === 'excel' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>
                  {boxMode === 'excel' && <CheckCircle2 size={12} />}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Conserve les numéros de boîtes existants renseignés dans la colonne "Boîte / Carton" de votre fichier source Excel.
              </p>
              <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-600">
                Idéal si les boîtes physiques ont déjà été numérotées sur le terrain par le service versant.
              </div>
            </div>
          </div>

          {/* Automatic mode parameters */}
          {boxMode === 'auto' && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                Paramètres de Numérotation Automatique
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Préfixe de Boîte</label>
                  <input
                    type="text"
                    value={autoBoxPrefix}
                    onChange={e => setAutoBoxPrefix(e.target.value)}
                    placeholder="Ex: Sin.M, Compta, Prod, RH..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black font-mono text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Numéro de Début</label>
                  <input
                    type="number"
                    value={startingBoxIndex}
                    onChange={e => setStartingBoxIndex(parseInt(e.target.value) || 1)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black font-mono text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Capacité / Boîte (Dossiers)</label>
                  <input
                    type="number"
                    value={boxCapacity}
                    onChange={e => setBoxCapacity(parseInt(e.target.value) || 20)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black font-mono text-slate-800"
                  />
                </div>
              </div>
              <div className="text-xs font-bold text-emerald-800 bg-emerald-100/70 p-3 rounded-xl">
                Aperçu du premier code généré : <strong className="font-mono text-emerald-900">{autoBoxPrefix}.{String(startingBoxIndex).padStart(3, '0')}</strong> pour {Math.ceil(parsedRows.length / boxCapacity)} boîte(s) au total.
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* --- ÉTAPE 4 : CRÉATION DES CODES-BARRES & ÉTIQUETTES --- */}
      {/* ========================================================================= */}
      {currentStep === 4 && (
        <motion.div
          key="step-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full uppercase tracking-wider">
                ÉTAPE 4 SUR 7
              </span>
              <h3 className="text-lg font-black text-slate-800 mt-2 flex items-center gap-2">
                <BarcodeIcon className="text-emerald-600" size={20} />
                Génération des Codes-Barres Uniques & Impression des Étiquettes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Chaque boîte possède son code-barres unique et son étiquette prête à imprimer pour le centre d'archivage.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all"
              >
                <ArrowLeft size={14} /> Précédent
              </button>
              <button
                onClick={() => setIsPrintModalOpen(true)}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-sm"
              >
                <Printer size={14} /> Imprimer Toutes les Étiquettes ({generatedBoxes.length})
              </button>
              <button
                onClick={() => setCurrentStep(5)}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer transition-all"
              >
                Suivant : Localisation <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Barcode Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {generatedBoxes.map((box, idx) => (
              <div
                key={box.id || idx}
                className="bg-slate-50 hover:bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 transition-all shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black font-mono text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                    {box.number}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {box.foldersCount} dossiers
                  </span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 flex flex-col items-center justify-center">
                  <div className="overflow-hidden max-w-full">
                    <Barcode
                      value={box.barcode || `BOX-${box.number}`}
                      width={1.2}
                      height={36}
                      fontSize={10}
                      margin={2}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 mt-1">{box.barcode}</span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                  <span className="font-bold">{box.direction}</span>
                  <button
                    onClick={() => {
                      setSelectedBoxToPrint(box);
                      setIsPrintModalOpen(true);
                    }}
                    className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Printer size={12} /> Imprimer étiquette
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* --- ÉTAPE 5 : LOCALISATION ET STOCKAGE PHYSIQUE --- */}
      {/* ========================================================================= */}
      {currentStep === 5 && (
        <motion.div
          key="step-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full uppercase tracking-wider">
                ÉTAPE 5 SUR 7
              </span>
              <h3 className="text-lg font-black text-slate-800 mt-2 flex items-center gap-2">
                <MapPin className="text-emerald-600" size={20} />
                Localisation & Attribution des Coordonnées Physiques de Stockage
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Attribution des coordonnées physiques précises : <strong>Bâtiment</strong>, <strong>Salle / Dépôt</strong>, <strong>Rayonnage</strong>, <strong>Travée</strong> et <strong>Étagère / Niveau</strong>.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all"
              >
                <ArrowLeft size={14} /> Précédent
              </button>
              <button
                onClick={() => setCurrentStep(6)}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer transition-all"
              >
                Suivant : Contrôle & Validation <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Boîtes</span>
                <span className="text-base font-black font-mono text-slate-800">{generatedBoxes.length}</span>
              </div>
              <Package size={20} className="text-slate-400" />
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-emerald-700 uppercase block">Extraites d'Excel</span>
                <span className="text-base font-black font-mono text-emerald-800">{boxesWithExcelLocationCount}</span>
              </div>
              <Sparkles size={20} className="text-emerald-600" />
            </div>

            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-blue-700 uppercase block">Affectation Globale</span>
                <span className="text-base font-black font-mono text-blue-800">
                  {generatedBoxes.filter(b => b.locationSource === 'bulk').length}
                </span>
              </div>
              <Sliders size={20} className="text-blue-600" />
            </div>

            <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-purple-700 uppercase block">Modifiées Manuellement</span>
                <span className="text-base font-black font-mono text-purple-800">
                  {generatedBoxes.filter(b => b.locationSource === 'manual').length}
                </span>
              </div>
              <MapPin size={20} className="text-purple-600" />
            </div>
          </div>

          {/* Banner: Extraction directe depuis le fichier Excel importé */}
          {boxesWithExcelLocationCount > 0 && (
            <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-400/20 text-emerald-300 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <Sparkles size={11} /> Extraction Directe Excel
                  </span>
                  <span className="text-xs font-bold text-emerald-100">
                    {boxesWithExcelLocationCount} boîte(s) avec coordonnées détectées
                  </span>
                </div>
                <h4 className="text-sm font-black">
                  Des emplacements physiques ont été détectés directement dans votre fichier Excel importé
                </h4>
                <p className="text-xs text-emerald-200/80">
                  Cliquez sur le bouton ci-contre pour synchroniser immédiatement les bâtiments, dépôts, salles, rayonnages, travées et étagères extraits.
                </p>
              </div>

              <button
                onClick={handleApplyExtractedExcelLocations}
                className="px-4 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shrink-0 cursor-pointer transition-all shadow-md"
              >
                <Sparkles size={14} /> Appliquer les Localisations Excel
              </button>
            </div>
          )}

          {/* OPTION 1 : AFFECTATION GLOBALE */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Sliders size={14} className="text-slate-600" />
                  Option 1 : Affectation Globale par Lot (En Masse)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Définissez des coordonnées communes pour l'ensemble des boîtes de ce versement.
                </p>
              </div>

              <button
                onClick={handleApplyBulkLocation}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black cursor-pointer transition-all shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
              >
                <CheckSquare size={13} /> Appliquer à toutes les {generatedBoxes.length} boîtes
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase">Bâtiment</label>
                <input
                  type="text"
                  value={defaultLocation.batiment}
                  onChange={e => setDefaultLocation({ ...defaultLocation, batiment: e.target.value })}
                  placeholder="Ex: Bâtiment A"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase">Dépôt</label>
                <input
                  type="text"
                  value={defaultLocation.depot}
                  onChange={e => setDefaultLocation({ ...defaultLocation, depot: e.target.value })}
                  placeholder="Ex: Dépôt 1"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase">Salle</label>
                <input
                  type="text"
                  value={defaultLocation.salle}
                  onChange={e => setDefaultLocation({ ...defaultLocation, salle: e.target.value })}
                  placeholder="Ex: Salle A"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase">Rayonnage</label>
                <input
                  type="text"
                  value={defaultLocation.rayon}
                  onChange={e => setDefaultLocation({ ...defaultLocation, rayon: e.target.value })}
                  placeholder="Ex: R01"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase">Travée</label>
                <input
                  type="text"
                  value={defaultLocation.travee}
                  onChange={e => setDefaultLocation({ ...defaultLocation, travee: e.target.value })}
                  placeholder="Ex: T1"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase">Étagère / Tablette</label>
                <input
                  type="text"
                  value={defaultLocation.tablette}
                  onChange={e => setDefaultLocation({ ...defaultLocation, tablette: e.target.value })}
                  placeholder="Ex: 01"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-500 uppercase">Niveau / Pos.</label>
                <input
                  type="text"
                  value={defaultLocation.niveau}
                  onChange={e => setDefaultLocation({ ...defaultLocation, niveau: e.target.value })}
                  placeholder="Ex: N1"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="autoIncrement"
                checked={autoIncrementTablette}
                onChange={e => setAutoIncrementTablette(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-slate-300 cursor-pointer"
              />
              <label htmlFor="autoIncrement" className="text-xs font-medium text-slate-600 cursor-pointer select-none">
                Incrémenter automatiquement les étagères/tablettes (1 étagère toutes les 10 boîtes)
              </label>
            </div>
          </div>

          {/* OPTION 2 : GESTION & ÉDITION BOÎTE PAR BOÎTE */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <MapPin size={14} className="text-emerald-600" />
                  Option 2 : Affectation & Ajustement Boîte par Boîte
                </h4>
                <p className="text-[11px] text-slate-500">
                  Consultez les coordonnées attribuées et ajustez individuellement chaque boîte d'archives si besoin.
                </p>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={boxLocationSearch}
                    onChange={e => setBoxLocationSearch(e.target.value)}
                    placeholder="Filtrer boîte, code-barres, lieu..."
                    className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-emerald-500 w-52"
                  />
                  {boxLocationSearch && (
                    <button
                      onClick={() => setBoxLocationSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setBoxLocationFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all ${boxLocationFilter === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}
                  >
                    Toutes ({generatedBoxes.length})
                  </button>
                  <button
                    onClick={() => setBoxLocationFilter('excel')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all ${boxLocationFilter === 'excel' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500'}`}
                  >
                    Excel ({boxesWithExcelLocationCount})
                  </button>
                  <button
                    onClick={() => setBoxLocationFilter('bulk')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all ${boxLocationFilter === 'bulk' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}
                  >
                    Globale ({generatedBoxes.filter(b => b.locationSource === 'bulk').length})
                  </button>
                  <button
                    onClick={() => setBoxLocationFilter('manual')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all ${boxLocationFilter === 'manual' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-500'}`}
                  >
                    Manuelle ({generatedBoxes.filter(b => b.locationSource === 'manual').length})
                  </button>
                </div>
              </div>
            </div>

            {/* Boxes Locations Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-[10px] font-black text-slate-600 uppercase sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Code Boîte</th>
                      <th className="px-4 py-2.5">Code-Barres</th>
                      <th className="px-4 py-2.5">Bâtiment</th>
                      <th className="px-4 py-2.5">Dépôt / Salle</th>
                      <th className="px-4 py-2.5">Rayonnage & Travée</th>
                      <th className="px-4 py-2.5">Étagère & Niveau</th>
                      <th className="px-4 py-2.5 text-center">Origine Localisation</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredBoxesForLocation.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-slate-400 font-medium">
                          Aucune boîte ne correspond aux critères de filtre.
                        </td>
                      </tr>
                    ) : (
                      filteredBoxesForLocation.map((box, idx) => (
                        <tr key={box.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-2.5 font-mono font-bold text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <Package size={13} className="text-slate-400" />
                              <span>{box.number}</span>
                            </div>
                            <span className="text-[10px] font-normal text-slate-400 block ml-5">
                              {box.foldersCount} dossiers
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-500 text-[11px]">
                            {box.barcode}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">
                            {box.batiment || <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">
                            {box.depot && box.salle ? `${box.depot} / ${box.salle}` : (box.depot || box.salle || <span className="text-slate-300">-</span>)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 font-mono">
                            {box.rayon ? `Rayon ${box.rayon}` : ''} {box.travee ? `• Travée ${box.travee}` : ''}
                            {!box.rayon && !box.travee && <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 font-mono">
                            {box.tablette ? `Étagère ${box.tablette}` : ''} {box.niveau ? `• Niveau ${box.niveau}` : ''}
                            {!box.tablette && !box.niveau && <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {box.locationSource === 'excel' || box.hasExcelLocation ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 inline-flex items-center gap-1">
                                <Sparkles size={10} /> Extrait Excel
                              </span>
                            ) : box.locationSource === 'manual' ? (
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200 inline-flex items-center gap-1">
                                <MapPin size={10} /> Manuelle
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 inline-flex items-center gap-1">
                                <Sliders size={10} /> Globale
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => setEditingBoxModal(box)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all"
                            >
                              <MapPin size={11} className="text-emerald-700" />
                              Modifier
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* --- MODAL D'ÉDITION D'EMPLACEMENT BOÎTE PAR BOÎTE --- */}
      {/* ========================================================================= */}
      {editingBoxModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full uppercase">
                  Boîte {editingBoxModal.number}
                </span>
                <h3 className="text-base font-black text-slate-800 mt-1 flex items-center gap-2">
                  <MapPin className="text-emerald-600" size={18} />
                  Coordonnées Physiques de Stockage
                </h3>
              </div>
              <button
                onClick={() => setEditingBoxModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Bâtiment</label>
                  <input
                    type="text"
                    value={editingBoxModal.batiment || ''}
                    onChange={e => setEditingBoxModal({ ...editingBoxModal, batiment: e.target.value })}
                    placeholder="Ex: Bâtiment Principal"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Dépôt</label>
                  <input
                    type="text"
                    value={editingBoxModal.depot || ''}
                    onChange={e => setEditingBoxModal({ ...editingBoxModal, depot: e.target.value })}
                    placeholder="Ex: Dépôt 1"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Salle</label>
                  <input
                    type="text"
                    value={editingBoxModal.salle || ''}
                    onChange={e => setEditingBoxModal({ ...editingBoxModal, salle: e.target.value })}
                    placeholder="Ex: Salle A"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Rayonnage</label>
                  <input
                    type="text"
                    value={editingBoxModal.rayon || ''}
                    onChange={e => setEditingBoxModal({ ...editingBoxModal, rayon: e.target.value })}
                    placeholder="Ex: R01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Travée</label>
                  <input
                    type="text"
                    value={editingBoxModal.travee || ''}
                    onChange={e => setEditingBoxModal({ ...editingBoxModal, travee: e.target.value })}
                    placeholder="Ex: T1"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Étagère / Tablette</label>
                  <input
                    type="text"
                    value={editingBoxModal.tablette || ''}
                    onChange={e => setEditingBoxModal({ ...editingBoxModal, tablette: e.target.value })}
                    placeholder="Ex: 01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Niveau / Pos.</label>
                  <input
                    type="text"
                    value={editingBoxModal.niveau || ''}
                    onChange={e => setEditingBoxModal({ ...editingBoxModal, niveau: e.target.value })}
                    placeholder="Ex: N1"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Live Preview */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
                <span className="text-[9px] font-black text-emerald-800 uppercase block">Aperçu de la chaîne d'emplacement</span>
                <span className="text-xs font-bold font-mono text-emerald-950 mt-0.5 block">
                  {formatBoxLocationString(editingBoxModal)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setEditingBoxModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => handleSaveSingleBoxLocation(editingBoxModal)}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-md"
              >
                Enregistrer l'Emplacement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* --- ÉTAPE 6 : VALIDATION DE L'INVENTAIRE (PRÉ-SOUMISSION) --- */}
      {/* ========================================================================= */}
      {currentStep === 6 && (
        <motion.div
          key="step-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 lg:p-8 shadow-sm space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full uppercase tracking-wider">
                ÉTAPE 6 SUR 7
              </span>
              <h3 className="text-lg font-black text-slate-800 mt-2 flex items-center gap-2">
                <CheckSquare className="text-emerald-600" size={20} />
                Contrôle & Validation Préalable de l'Inventaire
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Vérification finale des indicateurs avant transmission pour validation définitive par le Responsable Audit.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentStep(5)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all"
              >
                <ArrowLeft size={14} /> Précédent
              </button>
              <button
                onClick={handleSubmitBatchForAudit}
                disabled={isProcessing}
                className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-emerald-900/10 cursor-pointer transition-all disabled:opacity-50"
              >
                {isProcessing ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={16} />}
                Soumettre pour Validation Finale (Audit)
              </button>
            </div>
          </div>

          {/* Checklist Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-800 uppercase tracking-wider">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Vérifications de Cohérence Validées
              </div>
              <ul className="space-y-2 text-xs font-medium text-emerald-900">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  <span><strong>{parsedRows.length}</strong> dossiers importés sans doublon critique.</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  <span><strong>{generatedBoxes.length}</strong> boîtes conditionnées et codifiées ({boxMode === 'auto' ? 'Automatique' : 'Excel'}).</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  <span>Règle DUA <strong>{selectedDirection}</strong> appliquée (Conservation : {customRetentionYears} ans).</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  <span>Codes-barres uniques générés pour chaque boîte.</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  <span>Emplacements physiques spécifiés (Dépôt / Salle / Rayon / Travée).</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
              <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                Notes et Commentaires pour le Responsable Audit :
              </label>
              <textarea
                value={batchNotes}
                onChange={e => setBatchNotes(e.target.value)}
                placeholder="Précisez ici les informations complémentaires, l'état physique des cartons, les dates extrêmes..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 h-28 resize-none"
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* --- ÉTAPE 7 : SUIVI & NOTIFICATION SESSION RESPONSABLE AUDIT --- */}
      {/* ========================================================================= */}
      {currentStep === 7 && (
        <motion.div
          key="step-7"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Success Banner */}
          <div className="bg-emerald-900 text-white rounded-3xl p-8 shadow-xl border border-emerald-700 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-black uppercase tracking-wider">
                <CheckCircle2 size={18} /> ÉTAPE 7 / 7 : LOT TRANSMIS AVEC SUCCÈS
              </div>
              <h3 className="text-2xl font-black text-white">
                Notification transmise à la Session Responsable Audit
              </h3>
              <p className="text-emerald-100 text-xs max-w-xl">
                Le lot d'inventaire a été soumis et attend la validation finale dans l'onglet <strong>Audit & Validations</strong> de la session Responsable. Une fois scellé, il sera définitivement intégré et consultable dans toute l'application.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                onClick={handleResetWizard}
                className="px-5 py-3 bg-white text-emerald-900 hover:bg-emerald-50 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg cursor-pointer transition-all flex items-center gap-2"
              >
                <Plus size={16} /> Intégrer un Autre Lot
              </button>
            </div>
          </div>

          {/* Batches Table List */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                  Historique des Lots d'Intégration d'Inventaire
                </h4>
                <p className="text-[11px] text-slate-400">
                  Suivez l'état d'avancement et la validation des lots par le Responsable Audit.
                </p>
              </div>
              <button
                onClick={fetchExistingBatches}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
                title="Actualiser"
              >
                <RefreshCw size={16} className={loadingBatches ? 'animate-spin' : ''} />
              </button>
            </div>

            {existingBatches.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-medium">
                Aucun lot d'intégration enregistré pour le moment.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {existingBatches.map((batch: any) => (
                  <div key={batch.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {batch.inventoryRef && (
                          <span className="font-mono font-black text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-lg border border-emerald-300 text-xs shadow-xs">
                            Réf : {batch.inventoryRef}
                          </span>
                        )}
                        <span className="font-mono font-black text-slate-800 text-sm">{batch.batchNumber}</span>
                        {batch.inventoryName && (
                          <span className="font-bold text-slate-700 text-xs bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                            {batch.inventoryName}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {batch.direction}
                        </span>
                        <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                          batch.status === 'validé'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : batch.status === 'rejeté'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                        }`}>
                          {batch.status === 'validé' ? '✅ Stockage Validé & Scellé' : batch.status === 'rejeté' ? '❌ Rejeté' : '⏳ En attente validation Audit'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-3 flex-wrap">
                        <span><strong>{batch.foldersCount || batch.foldersData?.length || 0}</strong> dossiers</span>
                        <span>•</span>
                        <span><strong>{batch.boxesCount || batch.boxesData?.length || 0}</strong> boîtes</span>
                        <span>•</span>
                        <span>Importé le {new Date(batch.importedAt).toLocaleDateString('fr-FR')} par {batch.importedBy || 'Archiviste'}</span>
                        {batch.validatedAt && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-700 font-bold">Validé le {new Date(batch.validatedAt).toLocaleDateString('fr-FR')} par {batch.validatedBy}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setViewingPVTransfertBatch(batch)}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                        title="Générer et imprimer la Fiche QR Code et le Procès-Verbal officiel de transfert"
                      >
                        <QrCode size={13} className="text-emerald-200" /> Générer Transfert (Fiche QR & PV)
                      </button>
                      <button
                        onClick={() => {
                          setInspectingBatchLines(batch);
                          setBatchLinesSearch('');
                          setBatchLinesSelectedBox('all');
                          setBatchLinesSortFinal('all');
                          setBatchLinesPage(1);
                        }}
                        className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                      >
                        <Eye size={13} className="text-emerald-700" /> Afficher les Lignes ({batch.foldersCount || batch.foldersData?.length || 0})
                      </button>
                      <button
                        onClick={() => {
                          const boxes = batch.boxesData || [];
                          if (boxes.length > 0) {
                            setGeneratedBoxes(boxes);
                            setIsPrintModalOpen(true);
                          } else {
                            triggerToast("Aucune boîte disponible à imprimer pour ce lot.", "info");
                          }
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Printer size={13} /> Étiquettes
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* --- MODAL D'IMPRESSION DES ÉTIQUETTES DE BOÎTES --- */}
      {/* ========================================================================= */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 lg:p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Printer className="text-emerald-600" size={20} />
                  Planche d'Étiquettes de Boîtes d'Archives
                </h3>
                <p className="text-xs text-slate-500">
                  Format standardisé MAE Archives avec code-barres de traçabilité, localisation et informations de versement.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg cursor-pointer transition-all"
                >
                  <Printer size={14} /> Lancer l'Impression
                </button>
                <button
                  onClick={() => {
                    setIsPrintModalOpen(false);
                    setSelectedBoxToPrint(null);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Printable Area */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4" id="printable-labels-area">
              {(selectedBoxToPrint ? [selectedBoxToPrint] : generatedBoxes).map((box, idx) => (
                <div
                  key={box.id || idx}
                  className="border-2 border-slate-800 rounded-2xl p-5 bg-white space-y-3 relative overflow-hidden shadow-sm page-break-inside-avoid"
                >
                  {/* Header Logo */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <span className="text-[10px] font-black tracking-widest uppercase text-slate-800 block">
                        MAE ARCHIVES
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 uppercase">
                        CONDITIONNEMENT & STOCKAGE
                      </span>
                    </div>
                    <span className="text-xs font-black font-mono bg-slate-900 text-white px-2 py-0.5 rounded">
                      {box.direction}
                    </span>
                  </div>

                  {/* Main Box Number */}
                  <div className="text-center py-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                      NUMÉRO DE BOÎTE
                    </span>
                    <span className="text-2xl font-black font-mono text-slate-900 tracking-tight">
                      {box.number}
                    </span>
                  </div>

                  {/* Barcode Center */}
                  <div className="flex flex-col items-center justify-center p-2 bg-slate-50 rounded-xl border border-slate-200">
                    <Barcode
                      value={box.barcode || `BOX-${box.number}`}
                      width={1.4}
                      height={42}
                      fontSize={11}
                      margin={2}
                    />
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-slate-800 pt-2 font-medium">
                    <div>
                      <span className="text-slate-400 block uppercase font-bold">Contenu</span>
                      <span className="font-bold text-slate-800">{box.foldersCount} dossiers</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-bold">Échéance DUA</span>
                      <span className="font-bold text-slate-800">{box.expiryYear ? `➔ ${box.expiryYear}` : '5 ans'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 block uppercase font-bold">Emplacement</span>
                      <span className="font-bold font-mono text-slate-800">
                        {box.depot} / {box.salle} / {box.rayon}-{box.travee}-{box.tablette}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* --- MODAL DE CONSULTATION DE TOUTES LES LIGNES D'UN LOT D'INVENTAIRE --- */}
      {/* ========================================================================= */}
      {inspectingBatchLines && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-6xl w-full p-6 lg:p-8 space-y-5 shadow-2xl max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 shrink-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {inspectingBatchLines.inventoryRef && (
                    <span className="text-xs font-mono font-black text-emerald-800 bg-emerald-100 px-3 py-1 rounded-lg border border-emerald-300 shadow-xs">
                      Réf : {inspectingBatchLines.inventoryRef}
                    </span>
                  )}
                  <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                    Lot : {inspectingBatchLines.batchNumber}
                  </span>
                  <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {inspectingBatchLines.direction}
                  </span>
                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                    inspectingBatchLines.status === 'validé'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : inspectingBatchLines.status === 'rejeté'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {inspectingBatchLines.status === 'validé' ? '✅ Stockage Validé' : inspectingBatchLines.status === 'rejeté' ? '❌ Rejeté' : '⏳ En attente validation'}
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet className="text-emerald-600" size={20} />
                  {inspectingBatchLines.inventoryName || `Inventaire ${inspectingBatchLines.direction}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consultation détaillée des <strong>{inspectingBatchLines.foldersCount || (inspectingBatchLines.foldersData?.length) || 0}</strong> dossiers répartis dans <strong>{inspectingBatchLines.boxesCount || (inspectingBatchLines.boxesData?.length) || 0}</strong> boîtes d'archives.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setViewingPVTransfertBatch(inspectingBatchLines)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
                  title="Générer et imprimer la Fiche QR Code et le Procès-Verbal officiel de transfert"
                >
                  <QrCode size={14} className="text-emerald-200" /> Générer Transfert (Fiche QR & PV)
                </button>
                <button
                  onClick={() => handleExportBatchLinesToExcel(inspectingBatchLines, inspectingBatchLines.foldersData || inspectingBatchLines.folders || [])}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
                >
                  <Download size={14} /> Exporter Excel
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Printer size={14} /> Imprimer
                </button>
                <button
                  onClick={() => setInspectingBatchLines(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            {(() => {
              const allFolders: any[] = inspectingBatchLines.foldersData || inspectingBatchLines.folders || [];
              const allBoxes: any[] = inspectingBatchLines.boxesData || inspectingBatchLines.boxes || [];

              // Collect distinct raw Excel column keys across all folders
              const rawExcelCols: string[] = Array.from(new Set<string>(
                allFolders.flatMap(f => f.rawRow && typeof f.rawRow === 'object' ? Object.keys(f.rawRow) : [])
              )).filter(k => k && k !== 'undefined' && k !== 'null');

              const uniqueBoxes = Array.from(new Set(allFolders.map(f => f.boxNumber || f.numBoite || f.generatedBoxNumber).filter(Boolean)));

              const filteredFolders = allFolders.filter((f, idx) => {
                // Search filter
                if (batchLinesSearch) {
                  const q = batchLinesSearch.toLowerCase().trim();
                  const numOrdre = String(idx + 1);
                  const boxNum = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '').toLowerCase();
                  const ref = String(f.reference || '').toLowerCase();
                  const intitule = String(f.intitule || f.titre || '').toLowerCase();
                  const dua = String(f.codeDua || '').toLowerCase();
                  const dCloture = String(getClosureDateDisplay(f)).toLowerCase();
                  const sort = String(f.finalDisposition || f.sortFinal || '').toLowerCase();
                  const loc = String(f.localisation || '').toLowerCase();
                  const inRawRow = f.rawRow && typeof f.rawRow === 'object'
                    ? Object.values(f.rawRow).some(v => String(v).toLowerCase().includes(q))
                    : false;

                  const match = numOrdre.includes(q) || boxNum.includes(q) || ref.includes(q) || intitule.includes(q) || dua.includes(q) || dCloture.includes(q) || sort.includes(q) || loc.includes(q) || inRawRow;
                  if (!match) return false;
                }

                // Box filter
                if (batchLinesSelectedBox !== 'all') {
                  const boxNum = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '');
                  if (boxNum !== batchLinesSelectedBox) return false;
                }

                // Sort filter
                if (batchLinesSortFinal !== 'all') {
                  const sort = String(f.finalDisposition || f.sortFinal || 'EL').toUpperCase();
                  if (batchLinesSortFinal === 'EL' && !sort.includes('EL') && !sort.includes('ÉLIM') && !sort.includes('D')) return false;
                  if (batchLinesSortFinal === 'CP' && !sort.includes('CP') && !sort.includes('CONS') && !sort.includes('C')) return false;
                }

                return true;
              });

              const totalPages = Math.max(1, Math.ceil(filteredFolders.length / (batchLinesRowsPerPage === -1 ? filteredFolders.length || 1 : batchLinesRowsPerPage)));
              const currentPage = Math.min(batchLinesPage, totalPages);
              const startIndex = batchLinesRowsPerPage === -1 ? 0 : (currentPage - 1) * batchLinesRowsPerPage;
              const paginatedFolders = batchLinesRowsPerPage === -1 ? filteredFolders : filteredFolders.slice(startIndex, startIndex + batchLinesRowsPerPage);

              return (
                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                  {/* Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 shrink-0">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input
                        type="text"
                        value={batchLinesSearch}
                        onChange={e => {
                          setBatchLinesSearch(e.target.value);
                          setBatchLinesPage(1);
                        }}
                        placeholder="Rechercher dans toutes les colonnes Excel..."
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Filter by Box */}
                    <div className="flex items-center gap-1.5">
                      <Package size={15} className="text-slate-400 shrink-0" />
                      <select
                        value={batchLinesSelectedBox}
                        onChange={e => {
                          setBatchLinesSelectedBox(e.target.value);
                          setBatchLinesPage(1);
                        }}
                        className="w-full py-2 px-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="all">📦 Toutes les boîtes ({uniqueBoxes.length})</option>
                        {uniqueBoxes.map((b: any) => (
                          <option key={b} value={b}>Boîte {b}</option>
                        ))}
                      </select>
                    </div>

                    {/* Filter by Sort Final */}
                    <div className="flex items-center gap-1.5">
                      <Filter size={15} className="text-slate-400 shrink-0" />
                      <select
                        value={batchLinesSortFinal}
                        onChange={e => {
                          setBatchLinesSortFinal(e.target.value as any);
                          setBatchLinesPage(1);
                        }}
                        className="w-full py-2 px-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="all">⚖️ Tous les sorts finaux</option>
                        <option value="EL">Élimination (EL)</option>
                        <option value="CP">Conservation Permanente (CP)</option>
                      </select>
                    </div>

                    {/* Rows per page */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Lignes / page :</span>
                      <select
                        value={batchLinesRowsPerPage}
                        onChange={e => {
                          setBatchLinesRowsPerPage(Number(e.target.value));
                          setBatchLinesPage(1);
                        }}
                        className="w-full py-2 px-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                        <option value={500}>500</option>
                        <option value={-1}>Tout afficher ({filteredFolders.length})</option>
                      </select>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div className="flex items-center justify-between text-xs text-slate-500 px-1 shrink-0">
                    <div className="flex items-center gap-2">
                      <span>
                        Affichage de <strong className="text-slate-800 font-bold">{filteredFolders.length}</strong> sur <strong>{allFolders.length}</strong> ligne(s)
                      </span>
                      {rawExcelCols.length > 0 && (
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {rawExcelCols.length} colonne(s) Excel d'origine préservées sans modification
                        </span>
                      )}
                    </div>
                    {(batchLinesSearch || batchLinesSelectedBox !== 'all' || batchLinesSortFinal !== 'all') && (
                      <button
                        onClick={() => {
                          setBatchLinesSearch('');
                          setBatchLinesSelectedBox('all');
                          setBatchLinesSortFinal('all');
                          setBatchLinesPage(1);
                        }}
                        className="text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer hover:underline text-xs"
                      >
                        Réinitialiser tous les filtres
                      </button>
                    )}
                  </div>

                  {/* Table */}
                  <div className="overflow-auto rounded-2xl border border-slate-200 flex-1 shadow-inner bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-bold sticky top-0 z-10">
                          <th className="p-3 w-12 text-center">N°</th>
                          
                          {/* Raw Excel Columns without modification */}
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

                          {/* Mandatory Archival Columns preserved & kept */}
                          <th className="p-3 text-center bg-emerald-50 text-emerald-950 font-black border-l border-emerald-200 whitespace-nowrap">
                            Règle DUA
                          </th>
                          <th className="p-3 text-center bg-emerald-50 text-emerald-950 font-black whitespace-nowrap">
                            Sort Final
                          </th>
                          {rawExcelCols.length > 0 && (
                            <th className="p-3 bg-emerald-50 text-emerald-950 font-black whitespace-nowrap">
                              Boîte / Stockage
                            </th>
                          )}
                          <th className="p-3 bg-emerald-50 text-emerald-950 font-black whitespace-nowrap">
                            Localisation Physique
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedFolders.length === 0 ? (
                          <tr>
                            <td colSpan={rawExcelCols.length > 0 ? rawExcelCols.length + 4 : 8} className="p-10 text-center text-slate-400 font-medium">
                              Aucun dossier ne correspond à vos filtres de recherche.
                            </td>
                          </tr>
                        ) : (
                          paginatedFolders.map((f: any, idx: number) => {
                            const globalIndex = startIndex + idx + 1;
                            const primaryRef = f.reference || f.intitule || f.titre || f.designation || `Dossier #${globalIndex}`;
                            const isNumericRef = /^\d+$/.test(String(primaryRef).trim());
                            const boxNum = f.boxNumber || f.numBoite || f.generatedBoxNumber || 'Non assignée';
                            const closureDate = getClosureDateDisplay(f);
                            const dua = f.codeDua || inspectingBatchLines.ruleApplied?.reference || inspectingBatchLines.ruleApplied?.ruleId || 'Standard';
                            const sort = f.finalDisposition || f.sortFinal || 'EL';

                            return (
                              <tr key={idx} className="hover:bg-emerald-50/40 transition-colors">
                                <td className="p-3 text-center font-mono font-bold text-slate-400">
                                  {globalIndex}
                                </td>

                                {/* Dynamic Raw Excel Cells rendered without modification */}
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
                                      <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        {boxNum}
                                      </span>
                                    </td>
                                    <td className="p-3 font-medium text-slate-900">
                                      <span className={`font-mono ${isNumericRef ? 'font-black text-emerald-950 bg-emerald-50/80 px-2 py-0.5 rounded border border-emerald-200 text-xs' : 'font-bold text-slate-900'}`}>
                                        {primaryRef}
                                      </span>
                                    </td>
                                    <td className="p-3 font-mono text-slate-600">
                                      {f.dateDebut || '-'}
                                    </td>
                                    <td className="p-3 font-mono font-bold text-slate-800">
                                      {closureDate}
                                    </td>
                                    <td className="p-3 text-slate-600 max-w-xs truncate" title={f.intitule || primaryRef}>
                                      {f.intitule && f.intitule !== f.reference && f.intitule !== f.numBoite ? f.intitule : '-'}
                                    </td>
                                  </>
                                )}

                                {/* Règle DUA */}
                                <td className="p-3 text-center border-l border-slate-200">
                                  <span className="font-mono font-black text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 text-xs">
                                    {dua}
                                  </span>
                                </td>

                                {/* Sort Final */}
                                <td className="p-3 text-center">
                                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                                    sort === 'CP' || sort === 'CONS' || sort === 'C'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}>
                                    {sort === 'CP' || sort === 'CONS' || sort === 'C' ? 'CP (Conservation)' : 'EL (Élimination)'}
                                  </span>
                                </td>

                                {/* Boîte if rawExcelCols active */}
                                {rawExcelCols.length > 0 && (
                                  <td className="p-3">
                                    <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                      {boxNum}
                                    </span>
                                  </td>
                                )}

                                {/* Localisation */}
                                <td className="p-3 text-[11px] text-slate-500 font-mono whitespace-nowrap">
                                  {f.localisation || formatBoxLocationString(inspectingBatchLines.boxesData?.find((b: any) => b.number === boxNum) || defaultLocation)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 shrink-0">
                      <span className="text-xs text-slate-500">
                        Page <strong className="text-slate-800 font-bold">{currentPage}</strong> sur <strong>{totalPages}</strong> ({filteredFolders.length} résultats)
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setBatchLinesPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage <= 1}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          &larr; Précédent
                        </button>

                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum = i + 1;
                            if (totalPages > 5 && currentPage > 3) {
                              pageNum = Math.min(totalPages - 4 + i, currentPage - 2 + i);
                            }
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setBatchLinesPage(pageNum)}
                                className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                  currentPage === pageNum
                                    ? 'bg-emerald-700 text-white shadow-xs'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          onClick={() => setBatchLinesPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage >= totalPages}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Suivant &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* --- MODAL PROCÈS-VERBAL DE TRANSFERT D'ARCHIVES --- */}
      {/* ========================================================================= */}
      {viewingPVTransfertBatch && (
        <PVTransfertModal
          batch={viewingPVTransfertBatch}
          onClose={() => setViewingPVTransfertBatch(null)}
        />
      )}
    </div>
  );
};
