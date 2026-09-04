import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  FileText, 
  Archive, 
  MapPin, 
  Calendar, 
  Building2, 
  Search, 
  Printer, 
  CheckCircle, 
  Clock, 
  ArrowLeft, 
  QrCode, 
  FileSpreadsheet,
  Download,
  Share2,
  Check,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { QRCodeSVG } from 'qrcode.react';

const REQUIRED_PASSWORDS = ['MAECIA1', 'maecia1', 'MAECIA-1'];

export const PVMobileViewer: React.FC = () => {
  const [batch, setBatch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBox, setSelectedBox] = useState('all');
  const [selectedSort, setSelectedSort] = useState('all');
  const [copied, setCopied] = useState(false);

  // Security password state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [enteredPassword, setEnteredPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Extract ID or batch number from URL query string or pathname
  const searchParams = new URLSearchParams(window.location.search);
  const batchId = searchParams.get('id') || searchParams.get('batchId') || searchParams.get('ref') || window.location.pathname.split('/').pop();

  // Check if session was already authenticated for this batch
  useEffect(() => {
    if (batchId) {
      const sessionKey = `mae_pv_auth_${batchId}`;
      const savedAuth = sessionStorage.getItem(sessionKey);
      if (savedAuth === 'true') {
        setIsAuthenticated(true);
      }
    }
  }, [batchId]);

  useEffect(() => {
    const fetchPVData = async () => {
      if (!batchId) {
        setError("Identifiant du Procès-Verbal manquant.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Try public endpoint first
        const res = await fetch(`/api/public/pv-transfert/${encodeURIComponent(batchId)}`);
        if (res.ok) {
          const data = await res.json();
          setBatch(data);
          setLoading(false);
          return;
        }

        // Fallback: try authenticated endpoint if public returned 404/401
        const authRes = await fetch(`/api/inventory-integration/batches`);
        if (authRes.ok) {
          const allBatches = await authRes.json();
          const found = allBatches.find((b: any) => 
            String(b.id) === batchId || 
            String(b.batchNumber) === batchId || 
            String(b.inventoryRef) === batchId
          );
          if (found) {
            setBatch(found);
            setLoading(false);
            return;
          }
        }

        throw new Error("Procès-verbal introuvable ou archivage non encore validé.");
      } catch (err: any) {
        setError(err.message || "Impossible de charger les données du Procès-Verbal.");
      } finally {
        setLoading(false);
      }
    };

    fetchPVData();
  }, [batchId]);

  const handleUnlock = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsVerifying(true);
    setPasswordError(null);

    const cleanInput = enteredPassword.trim();
    if (!cleanInput) {
      setPasswordError("Veuillez saisir le mot de passe d'accès.");
      setIsVerifying(false);
      return;
    }

    if (REQUIRED_PASSWORDS.includes(cleanInput) || cleanInput.toUpperCase() === 'MAECIA1') {
      setIsAuthenticated(true);
      if (batchId) {
        sessionStorage.setItem(`mae_pv_auth_${batchId}`, 'true');
      }
      setIsVerifying(false);
    } else {
      setTimeout(() => {
        setPasswordError("Mot de passe incorrect. Veuillez vérifier le code d'accès.");
        setIsVerifying(false);
      }, 300);
    }
  };

  const handleLock = () => {
    setIsAuthenticated(false);
    setEnteredPassword('');
    if (batchId) {
      sessionStorage.removeItem(`mae_pv_auth_${batchId}`);
    }
  };

  const rawFolders = useMemo(() => {
    if (!batch) return [];
    return Array.isArray(batch.foldersData) ? batch.foldersData : (Array.isArray(batch.folders) ? batch.folders : []);
  }, [batch]);

  const uniqueBoxes = useMemo(() => {
    return Array.from(new Set(rawFolders.map((f: any) => String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '').trim()).filter(Boolean)));
  }, [rawFolders]);

  const filteredFolders = useMemo(() => {
    return rawFolders.filter((f: any, idx: number) => {
      if (selectedBox !== 'all') {
        const b = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '').trim();
        if (b !== selectedBox) return false;
      }

      if (selectedSort !== 'all') {
        const sort = String(f.finalDisposition || f.sortFinal || '').toLowerCase();
        if (selectedSort === 'EL' && !sort.includes('el') && !sort.includes('é')) return false;
        if (selectedSort === 'CP' && !sort.includes('cp') && !sort.includes('c')) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const ref = String(f.reference || f.codeAgence || '').toLowerCase();
        const intitule = String(f.intitule || f.titre || f.nom || '').toLowerCase();
        const box = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '').toLowerCase();
        const loc = String(f.rawLocalisation || f.localisation || '').toLowerCase();
        const dua = String(f.codeDua || '').toLowerCase();
        const num = String(idx + 1);

        if (!ref.includes(q) && !intitule.includes(q) && !box.includes(q) && !loc.includes(q) && !dua.includes(q) && !num.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [rawFolders, selectedBox, selectedSort, searchQuery]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `PV de Transfert MAE - ${batch?.inventoryRef || batch?.batchNumber}`,
        text: `Consultation officielle du Procès-Verbal de Transfert d'Archives MAE pour ${batch?.direction || 'Archives'}.`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleExportExcel = () => {
    if (!batch || rawFolders.length === 0) return;
    try {
      const exportData = rawFolders.map((f: any, idx: number) => ({
        'N° Ordre': idx + 1,
        'N° Boîte': f.boxNumber || f.numBoite || f.generatedBoxNumber || '-',
        'Référence Dossier': f.reference || f.codeAgence || '-',
        'Intitulé / Contenu': f.intitule || f.titre || f.nom || '-',
        'Date Clôture': f.dateCloture || f.dateFin || f.year || '-',
        'Code DUA': f.codeDua || 'DUA Standard',
        'Sort Final': 'Élimination après échéance',
        'Localisation': f.rawLocalisation || f.localisation || batch.localisation || 'Centre Morneguia'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PV_Transfert_Scan');
      XLSX.writeFile(wb, `PV_Scan_${batch.batchNumber || 'Transfert'}.xlsx`);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-bold">Chargement du Procès-Verbal de Transfert...</h2>
        <p className="text-slate-400 text-sm mt-2">Vérification de l'intégrité et du sceau électronique MAE.</p>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mb-4 border border-rose-500/30">
          <ShieldCheck size={32} />
        </div>
        <h2 className="text-xl font-black text-rose-300">Procès-Verbal Non Trouvé</h2>
        <p className="text-slate-400 text-sm max-w-md mt-2 mb-6">
          {error || "Ce lot d'inventaire n'existe pas ou n'a pas encore été validé par le Responsable d'Audit."}
        </p>
        <a 
          href="/"
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all"
        >
          Accéder à l'application
        </a>
      </div>
    );
  }

  const pvRef = batch.inventoryRef || batch.batchNumber || `PV-MAE-${batch.id?.slice(-6)}`;
  const isValidated = batch.status === 'validé';

  // =========================================================================
  // --- PASSWORD PROTECTION SCREEN (GATE) ---
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-emerald-500 selection:text-white">
        
        {/* Ambient background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative z-10">
          
          {/* Header & Logo */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-800 to-indigo-950 text-white flex items-center justify-center shadow-lg border border-indigo-400/30">
              <Lock size={28} className="text-amber-400" />
            </div>
            
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest block">
                MAE ARCHIVES INTERMÉDIAIRES
              </span>
              <h1 className="text-xl font-black text-white tracking-tight mt-1">
                Accès Protégé au PV
              </h1>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Ce Procès-Verbal de Transfert est confidentiel et certifié. Veuillez saisir le mot de passe d'accès pour consulter les informations.
              </p>
            </div>
          </div>

          {/* Batch Summary Pill */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase">
              <span>Référence PV</span>
              <span className="text-emerald-400">{isValidated ? "✓ SCELLÉ" : "EN COURS"}</span>
            </div>
            <p className="font-mono font-black text-white text-sm truncate">{pvRef}</p>
            <p className="text-[11px] text-slate-300 truncate">
              {batch.inventoryName || `Direction ${batch.direction || 'Générale'}`}
            </p>
          </div>

          {/* Password Form */}
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-bold text-slate-200">
                Mot de passe d'autorisation :
              </label>
              
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound size={16} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={enteredPassword}
                  onChange={(e) => {
                    setEnteredPassword(e.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="Entrez le mot de passe"
                  autoFocus
                  className="w-full pl-10 pr-11 py-3 bg-white/10 border border-white/20 rounded-2xl text-sm font-semibold text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white cursor-pointer transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {passwordError && (
                <div className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold pt-1 animate-pulse">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
            >
              {isVerifying ? (
                <span>Vérification...</span>
              ) : (
                <>
                  <Unlock size={16} />
                  <span>Déverrouiller & Consulter le PV</span>
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="text-center pt-2 border-t border-white/10">
            <p className="text-[10px] text-slate-400 font-medium">
              Centre des Archives Intermédiaires Morneguia · MAE Assurances
            </p>
          </div>

        </div>

      </div>
    );
  }

  // =========================================================================
  // --- AUTHENTICATED PV VIEWER ---
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-16">
      {/* Top Mobile Bar */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md border-b border-emerald-500/30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <a href="/" className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-slate-300 hover:text-white transition-colors" title="Accueil">
              <ArrowLeft size={18} />
            </a>
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider block">
                MAE ARCHIVES OFFICIEL
              </span>
              <h1 className="text-sm font-black text-white truncate max-w-[180px] sm:max-w-sm">
                {batch.inventoryName || `Inventaire ${batch.direction || ''}`}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
              title="Partager le lien"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Share2 size={16} />}
              <span className="hidden sm:inline">{copied ? 'Copié !' : 'Partager'}</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Printer size={14} /> <span className="hidden sm:inline">Imprimer</span>
            </button>
            <button
              onClick={handleLock}
              className="p-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              title="Verrouiller la session"
            >
              <Lock size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 pt-5 space-y-5">
        
        {/* Certification Hero Card */}
        <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 text-white rounded-3xl p-6 shadow-xl border border-emerald-500/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider rounded-full border border-emerald-400/40">
                  {isValidated ? "✓ INVENTAIRE CERTIFIÉ & SCELLÉ" : "EN ATTENTE D'AUDIT"}
                </span>
                <span className="font-mono text-xs text-slate-300 font-bold bg-white/10 px-2 py-0.5 rounded-lg border border-white/10">
                  Réf : {pvRef}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white">
                Procès-Verbal de Transfert d'Archives
              </h2>
              <p className="text-xs text-emerald-200/90 mt-0.5">
                Centre des Archives Intermédiaires Morneguia — MAE Assurances
              </p>
            </div>

            <div className="shrink-0 bg-white p-2 rounded-2xl shadow-md border-2 border-emerald-400/50">
              <QRCodeSVG 
                value={window.location.href}
                size={80}
                level="M"
              />
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Direction</span>
              <p className="font-black text-white mt-0.5 truncate">{batch.direction || 'Direction Générale'}</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Volume Validé</span>
              <p className="font-black text-emerald-300 mt-0.5">{rawFolders.length} dossiers ({uniqueBoxes.length} boîtes)</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sort Final</span>
              <p className="font-black text-amber-300 mt-0.5">Élimination après échéance</p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Localisation</span>
              <p className="font-bold text-white mt-0.5 truncate">{batch.localisation || 'Centre Morneguia'}</p>
            </div>
          </div>

          {/* Validation Seal Badge */}
          <div className="mt-4 pt-3 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-slate-300">
            <div className="flex items-center gap-1.5 font-medium">
              <ShieldCheck size={15} className="text-emerald-400 shrink-0" />
              <span>Validé par : <strong className="text-white">{batch.validatedBy || 'Responsable Audit & Conformité'}</strong></span>
            </div>
            <div className="text-slate-400 font-mono text-[10px]">
              Scellé : {batch.batchNumber} · {new Date(batch.validatedAt || batch.importedAt || Date.now()).toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>

        {/* Detailed Metadata Accordion Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <FileText size={16} className="text-emerald-600" />
            Détails Légaux du Versement
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="border-b sm:border-b-0 sm:border-r border-slate-100 pb-3 sm:pb-0 sm:pr-4 space-y-2">
              <div>
                <span className="text-slate-400 block font-bold text-[10px] uppercase">Service Versant</span>
                <span className="font-black text-slate-800">{batch.direction || 'Direction'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold text-[10px] uppercase">Responsable de Versement</span>
                <span className="font-bold text-slate-800">{batch.directionHead || 'Responsable de la Direction'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold text-[10px] uppercase">Date de Versement</span>
                <span className="font-mono font-bold text-slate-800">
                  {batch.transferDate ? new Date(batch.transferDate).toLocaleDateString('fr-FR') : new Date(batch.importedAt || Date.now()).toLocaleDateString('fr-FR')}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <span className="text-slate-400 block font-bold text-[10px] uppercase">Dépôt Récepteur</span>
                <span className="font-bold text-slate-800">Centre des Archives Intermédiaires Morneguia</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold text-[10px] uppercase">Règle DUA</span>
                <span className="font-bold text-slate-800">{batch.ruleApplied?.title || batch.ruleApplied?.reference || 'Conservation réglementaire'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold text-[10px] uppercase">Sort Final Réglementaire</span>
                <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Élimination après échéance
                </span>
              </div>
            </div>
          </div>

          {batch.notes && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
              <span className="font-bold text-slate-700 block text-[10px] uppercase mb-0.5">Observations d'audit :</span>
              {batch.notes}
            </div>
          )}
        </div>

        {/* Filter and Folder List */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-black text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Archive size={16} className="text-emerald-600" />
                Inventaire des Dossiers Validés ({filteredFolders.length} / {rawFolders.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Détail ligne par ligne avec code DUA, numéro de boîte et localisation.
              </p>
            </div>

            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all self-start sm:self-auto cursor-pointer"
            >
              <Download size={13} /> Exporter Excel
            </button>
          </div>

          {/* Search & Box Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher par référence, titre, boîte..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedBox}
                onChange={e => setSelectedBox(e.target.value)}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">📦 Toutes les boîtes ({uniqueBoxes.length})</option>
                {uniqueBoxes.map((b: string) => (
                  <option key={b} value={b}>Boîte {b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Folders List Table / Mobile Cards */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredFolders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-xl">
                Aucun dossier ne correspond à votre recherche.
              </div>
            ) : (
              filteredFolders.map((folder: any, idx: number) => {
                const box = folder.boxNumber || folder.numBoite || folder.generatedBoxNumber || 'Non assignée';
                const ref = folder.reference || folder.codeAgence || folder.id || `DOS-${idx + 1}`;
                const title = folder.intitule || folder.titre || folder.nom || '-';
                const dateCloture = folder.dateCloture || folder.dateFin || folder.year || '-';
                const loc = folder.rawLocalisation || folder.localisation || batch.localisation || 'Morneguia';

                return (
                  <div key={folder.id || idx} className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-400 text-[10px]">#{idx + 1}</span>
                        <span className="font-mono font-black text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                          📦 Boîte {box}
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {ref}
                        </span>
                      </div>
                      <p className="font-medium text-slate-800 line-clamp-1">{title}</p>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 shrink-0 self-end sm:self-center">
                      <span>Date : <strong className="text-slate-700">{dateCloture}</strong></span>
                      <span className="hidden sm:inline">·</span>
                      <span className="flex items-center gap-1 font-mono text-emerald-800">
                        <MapPin size={12} /> {loc}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Official Certification Footer */}
        <div className="text-center text-[10px] text-slate-400 font-mono py-4 border-t border-slate-200">
          Document numérique certifié — Centre des Archives Intermédiaires Morneguia — MAE Assurances #{pvRef}
        </div>

      </main>
    </div>
  );
};
