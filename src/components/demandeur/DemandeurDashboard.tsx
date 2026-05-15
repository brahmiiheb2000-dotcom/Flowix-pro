import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Input } from '../UI';
import { Send, List, Clock, CheckCircle2, AlertCircle, FileText, Plus, Upload, FileSpreadsheet, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RemoteRequestForm } from '../RemoteRequestForm';
import { useAuth } from '../../App';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';

type View = 'history' | 'new' | 'transfer' | 'list' | 'bulk';

export const DemandeurDashboard = () => {
  const { user, profile } = useAuth();
  const [activeView, setActiveView] = useState<View>('history');
  const [newSubView, setNewSubView] = useState<'form' | 'references' | 'excel'>('form');
  
  // Transfer request state
  const [transferData, setTransferData] = useState({
    requesterName: '',
    direction: '',
    docType: '',
    boxCount: '',
    folderCount: '',
    inventoryFile: null as File | null
  });

  useEffect(() => {
    if (profile?.displayName || user?.displayName) {
      setTransferData(prev => ({
        ...prev,
        requesterName: profile?.displayName || user?.displayName || ''
      }));
    }
  }, [profile, user]);
  const transferFileInputRef = useRef<HTMLInputElement>(null);

  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [bulkRefs, setBulkRefs] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBulkRefSubmit = async () => {
    if (!bulkRefs.trim()) return;
    const refs = bulkRefs.split(/[,\n]/).map(r => r.trim()).filter(r => r !== '');
    if (refs.length === 0) return;

    setImporting(true);
    try {
      await api.post('/api/remote-requests', {
        nom: profile?.displayName || user?.displayName || 'Demandeur',
        service: 'Non spécifié',
        email: user?.email || '',
        telephone: '-',
        references: refs,
        motif: 'Demande groupée (Importation)',
        priorite: 'Normal',
        dateSouhaitee: format(new Date(), 'yyyy-MM-dd'),
        status: 'En attente',
        type: 'distance',
        uid: user?.uid || null
      });
      alert(`Demande groupée avec ${refs.length} références envoyée !`);
      setBulkRefs('');
      setActiveView('history');
    } catch (err) {
      alert("Erreur lors de l'envoi");
    } finally {
      setImporting(false);
    }
  };

  const handleTransferSubmit = async () => {
    if (!transferData.direction || !transferData.docType) {
      alert("Veuillez remplir les champs obligatoires (Direction et Type de documents)");
      return;
    }

    setImporting(true);
    try {
      // Mocking submission or actually sending it to an API
      await api.post('/api/transfer-requests', {
        direction: transferData.direction,
        documentType: transferData.docType,
        boxes: transferData.boxCount,
        folders: transferData.folderCount,
        requester: transferData.requesterName || profile?.displayName || user?.displayName || 'Demandeur',
        email: user?.email,
        status: 'En attente',
        createdAt: new Date(),
        hasInventory: !!transferData.inventoryFile
      });

      alert("Demande de transfert envoyée avec succès !");
      setTransferData({
        requesterName: profile?.displayName || user?.displayName || '',
        direction: '',
        docType: '',
        boxCount: '',
        folderCount: '',
        inventoryFile: null
      });
      setActiveView('history');
    } catch (err) {
      console.error("Transfer submission error:", err);
      alert("Erreur lors de l'envoi de la demande de transfert");
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [remoteData, transferData] = await Promise.all([
          api.get('/api/remote-requests'),
          api.get('/api/transfer-requests')
        ]);
        
        // Add a type flag to distinguish
        const remote = remoteData.map((r: any) => ({ ...r, category: 'communication' }));
        const transfers = transferData.map((t: any) => ({ ...t, category: 'transfer' }));
        
        setMyRequests([...remote, ...transfers]);
      } catch (err) {
        console.error("API Error in DemandeurDashboard:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportProgress(0);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const dataArray = event.target?.result;
        const workbook = XLSX.read(dataArray, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (!data || data.length === 0) {
          alert('Le fichier Excel est vide.');
          return;
        }

        const items: any[] = [];

        data.forEach(row => {
          items.push({
            nom: profile?.displayName || user?.displayName || row.Demandeur || row.Nom || 'Demandeur Distance',
            service: row.Service || 'Non spécifié',
            email: user?.email || row.Email || '-',
            telephone: row.Telephone || row['Téléphone'] || '-',
            references: [row.Reference || row.reference || row.Ref || row.motif || 'Ligne Importée'],
            motif: row.Motif || row.motif || row.Description || 'Importation Groupée',
            priorite: row.Priorite || 'Normal',
            dateSouhaitee: format(new Date(), 'yyyy-MM-dd'),
            status: 'En attente',
            type: 'distance',
            uid: user?.uid || null,
            isBatchImport: true
          });
        });

        await api.post('/api/remote-requests/batch', { items });
        setImportProgress(100);

        alert(`Importation réussie : ${data.length} demandes envoyées.`);
        setActiveView('history');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'En attente': return 'text-amber-600 bg-amber-50';
      case 'En cours': return 'text-blue-600 bg-blue-50';
      case 'Prêt': return 'text-green-600 bg-green-50';
      case 'Rejeté': return 'text-red-600 bg-red-50';
      default: return 'text-slate-500 bg-slate-50';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Interface Demandeur</h1>
          <p className="text-slate-500 text-sm">Suivez l'état de vos demandes d'archives à distance</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-fit overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveView('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeView === 'history' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Clock size={14} />
            Historique
          </button>
          <button
            onClick={() => setActiveView('new')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeView === 'new' ? 'bg-green-600 text-white shadow-md' : 'text-slate-500 hover:text-green-600'
            }`}
          >
            <Plus size={14} />
            Nouvelle Demande de Communication
          </button>
          <button
            onClick={() => setActiveView('transfer')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeView === 'transfer' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-500 hover:text-amber-600'
            }`}
          >
            <Upload size={14} />
            Nouvelle Demande de Transfert
          </button>
        </div>
      </div>

      {activeView === 'new' && (
        <div className="flex bg-white/50 p-1 rounded-xl border border-slate-200 w-fit">
          <button
            onClick={() => setNewSubView('form')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
              newSubView === 'form' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Send size={12} />
            Formulaire
          </button>
          <button
            onClick={() => setNewSubView('references')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
              newSubView === 'references' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Hash size={12} />
            Import Références
          </button>
          <button
            onClick={() => setNewSubView('excel')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
              newSubView === 'excel' ? 'bg-white text-green-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <FileSpreadsheet size={12} />
            Import Excel
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeView === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 gap-4"
          >
            {myRequests.length === 0 ? (
              <Card className="p-12 text-center border-dashed border-2 flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center">
                  <FileText size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Aucune demande trouvée</h3>
                  <p className="text-slate-500 max-w-sm mx-auto">Vous n'avez pas encore soumis de demande d'archives à distance.</p>
                </div>
                <div className="flex gap-4">
                  <Button onClick={() => setActiveView('new')} className="bg-green-600 hover:bg-green-700">
                    Créer une demande
                  </Button>
                  <Button variant="secondary" onClick={() => setActiveView('list')}>
                    Importer une liste
                  </Button>
                </div>
              </Card>
            ) : (
              myRequests.map((req) => (
                <Card key={req.id} className="p-6 hover:shadow-md transition-shadow border-l-4 border-l-slate-200">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getStatusColor(req.status)}`}>
                          {req.status}
                        </span>
                        {req.category && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${req.category === 'transfer' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {req.category === 'transfer' ? 'Transfert' : 'Communication'}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          ID: {req.demandNumber || req.id.slice(0, 8)} • Demandeur: <span className="font-semibold text-slate-600">{req.nom || req.requesterName || req.requester || '-'}</span> • Envoyer le {req.createdAt?.toDate ? format(req.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : (req.createdAt ? format(new Date(req.createdAt), 'dd/MM/yyyy HH:mm') : '...')}
                        </span>
                        {req.isBatchImport && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">BATCH</span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-800">
                        {req.category === 'transfer' ? `Transfert: ${req.documentType}` : (req.motif || 'Demande sans motif')}
                      </h3>
                      {req.category === 'transfer' ? (
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-md text-xs font-bold">
                            Direction: {req.direction}
                          </span>
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs">
                            {req.boxes} boîtes • {req.folders} dossiers
                          </span>
                          {req.hasInventory && (
                            <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-xs flex items-center gap-1">
                              <FileSpreadsheet size={12} /> Avec Inventaire
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {req.references?.map((ref: string, i: number) => (
                            <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-mono">
                              #{ref}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {req.status === 'Prêt' && (
                        <div className="text-green-600 flex items-center gap-1 text-sm font-bold animate-pulse">
                          <CheckCircle2 size={16} />
                          Dossier disponible
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </motion.div>
        )}

        {activeView === 'new' && (
          <motion.div
            key="new"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-6"
          >
            {newSubView === 'form' && (
              <Card className="p-6 lg:p-0">
                <RemoteRequestForm onFinished={() => setActiveView('history')} isEmbedded />
              </Card>
            )}

            {newSubView === 'references' && (
              <Card className="p-8 max-w-2xl mx-auto space-y-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                    <Hash size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Importation Directe par Références</h2>
                    <p className="text-slate-500 text-sm">Copiez et collez vos références ici pour une demande groupée</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Liste des références</label>
                    <textarea 
                      rows={8}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:ring-2 focus:ring-amber-500 outline-none text-sm font-mono"
                      placeholder="Ex: 1092231, 9922331, 122331 ..."
                      value={bulkRefs}
                      onChange={e => setBulkRefs(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400">Séparez les références par une virgule, un espace ou un retour à la ligne.</p>
                  </div>

                  <Button 
                    className="w-full h-12 bg-amber-500 hover:bg-amber-600 font-bold text-white shadow-lg shadow-amber-100"
                    onClick={handleBulkRefSubmit}
                    isLoading={importing}
                  >
                    Envoyer cette liste de références
                  </Button>
                </div>
              </Card>
            )}

            {newSubView === 'excel' && (
              <Card className="p-12 text-center space-y-6">
                <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto">
                  <FileSpreadsheet size={40} />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h2 className="text-2xl font-bold text-slate-800">Importation de Liste Excel</h2>
                  <p className="text-slate-500">
                    Déposez un fichier Excel (.xlsx, .xls) contenant vos références pour envoyer plusieurs demandes en une seule fois.
                  </p>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <Input 
                    type="file" 
                    ref={fileInputRef}
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={handleImportExcel}
                  />
                  
                  {importing ? (
                    <div className="w-64 space-y-2">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${importProgress}%` }}
                          className="h-full bg-blue-500"
                        />
                      </div>
                      <p className="text-xs text-slate-400 font-bold uppercase">{importProgress}% Importation...</p>
                    </div>
                  ) : (
                    <Button 
                      className="bg-blue-600 hover:bg-blue-700 h-12 px-8 font-bold"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Sélectionner un fichier
                    </Button>
                  )}
                  
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl text-left text-xs text-slate-500 max-w-sm">
                    <p className="font-bold mb-2">Format attendu :</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Colonnes suggérées : <code className="bg-white px-1">Reference</code>, <code className="bg-white px-1">Motif</code></li>
                      <li>Utilisez <code className="bg-white px-1">Service</code> si différent du vôtre</li>
                    </ul>
                  </div>
                </div>
              </Card>
            )}
          </motion.div>
        )}
        {activeView === 'transfer' && (
          <motion.div
            key="transfer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="p-8 max-w-2xl mx-auto">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                  <Upload size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Nouvelle Demande de Transfert</h2>
                  <p className="text-slate-500 text-sm">Transférez vos archives vers le centre de conservation</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 col-span-full">
                  <label className="text-sm font-bold text-slate-700">Nom du demandeur</label>
                  <Input 
                    placeholder="Votre nom complet"
                    value={transferData.requesterName}
                    onChange={e => setTransferData({...transferData, requesterName: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Direction / Service</label>
                  <select 
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    value={transferData.direction}
                    onChange={e => setTransferData({...transferData, direction: e.target.value})}
                  >
                    <option value="">Sélectionner une direction</option>
                    <option value="DRH">Direction des Ressources Humaines</option>
                    <option value="DFIN">Direction Financière</option>
                    <option value="DSI">Direction des Systèmes d'Information</option>
                    <option value="DAJ">Direction des Affaires Juridiques</option>
                    <option value="DCOM">Direction de la Communication</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Types des documents</label>
                  <Input 
                    placeholder="Ex: Factures 2023, Dossiers du personnel..."
                    value={transferData.docType}
                    onChange={e => setTransferData({...transferData, docType: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Nombre de boites</label>
                  <Input 
                    type="number"
                    placeholder="0"
                    value={transferData.boxCount}
                    onChange={e => setTransferData({...transferData, boxCount: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Nombre des dossiers</label>
                  <Input 
                    type="number"
                    placeholder="0"
                    value={transferData.folderCount}
                    onChange={e => setTransferData({...transferData, folderCount: e.target.value})}
                  />
                </div>

                <div className="col-span-full border-2 border-dashed border-slate-200 rounded-xl p-6 text-center space-y-3 bg-slate-50/50">
                  <div className="w-10 h-10 bg-white shadow-sm rounded-full flex items-center justify-center mx-auto text-slate-400">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">Importation d'inventaire</p>
                    <p className="text-[10px] text-slate-400">Déposez votre fichier Excel d'inventaire détaillé ici</p>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={transferFileInputRef}
                    accept=".xlsx, .xls, .csv"
                    onChange={e => setTransferData({...transferData, inventoryFile: e.target.files?.[0] || null})}
                  />
                  {!transferData.inventoryFile ? (
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="text-xs"
                      onClick={() => transferFileInputRef.current?.click()}
                    >
                      Choisir un fichier
                    </Button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-green-600 bg-green-50 py-2 rounded-lg">
                      <CheckCircle2 size={14} />
                      {transferData.inventoryFile.name}
                      <button 
                        className="ml-2 text-slate-400 hover:text-red-500"
                        onClick={() => setTransferData({...transferData, inventoryFile: null})}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                <div className="col-span-full pt-4">
                  <Button 
                    className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-lg shadow-amber-100"
                    onClick={handleTransferSubmit}
                    isLoading={importing}
                  >
                    Soumettre la demande de transfert
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
