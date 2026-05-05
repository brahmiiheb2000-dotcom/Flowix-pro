import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Input } from '../UI';
import { Send, List, Clock, CheckCircle2, AlertCircle, FileText, Plus, Upload, FileSpreadsheet, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RemoteRequestForm } from '../RemoteRequestForm';
import { useAuth } from '../../App';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';

type View = 'history' | 'new' | 'list' | 'bulk';

export const DemandeurDashboard = () => {
  const { user, profile } = useAuth();
  const [activeView, setActiveView] = useState<View>('history');
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

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const data = await api.get('/api/remote-requests');
        setMyRequests(data);
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
          <h1 className="text-2xl font-bold text-slate-800">Mes Demandes</h1>
          <p className="text-slate-500 text-sm">Suivez l'état de vos demandes d'archives à distance</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-fit overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveView('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeView === 'history' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Historique
          </button>
          <button
            onClick={() => setActiveView('new')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeView === 'new' ? 'bg-green-600 text-white' : 'text-slate-500 hover:text-green-600'
            }`}
          >
            Nouvelle Demande
          </button>
          <button
            onClick={() => setActiveView('bulk')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeView === 'bulk' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:text-amber-500'
            }`}
          >
            <Hash size={14} />
            Import Références
          </button>
          <button
            onClick={() => setActiveView('list')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeView === 'list' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-blue-600'
            }`}
          >
            <Upload size={14} />
            Import Liste Excel
          </button>
        </div>
      </div>

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
                        <span className="text-xs text-slate-400">
                          ID: {req.id.slice(0, 8)} • Demandeur: <span className="font-semibold text-slate-600">{req.nom || req.requesterName || '-'}</span> • Envoyer le {req.createdAt?.toDate ? format(req.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : '...'}
                        </span>
                        {req.isBatchImport && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">BATCH</span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-800">
                        {req.motif || 'Demande sans motif'}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {req.references?.map((ref: string, i: number) => (
                          <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-mono">
                            #{ref}
                          </span>
                        ))}
                      </div>
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
          >
             <Card className="p-6 lg:p-0">
               <RemoteRequestForm onFinished={() => setActiveView('history')} isEmbedded />
             </Card>
          </motion.div>
        )}

        {activeView === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
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
          </motion.div>
        )}
        {activeView === 'bulk' && (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
