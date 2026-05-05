import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App';
import { Button, Input, Card } from '../UI';
import { Plus, Trash2, Calendar, FileText, Send, User, Mail, Hash, Check, Clock, Layers, Archive, FileSpreadsheet, AlertCircle, Inbox, Tag, BadgeAlert, CheckCircle, XCircle, RotateCcw, Building2, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toSafeDate, cn } from '../../lib/utils';
import { api } from '../../lib/api';

export const AgentDashboard = ({ initialTab = 'new' }: { initialTab?: 'new' | 'remote' }) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [remoteRequests, setRemoteRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'new' | 'remote'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Form State matching screenshot
  const [formData, setFormData] = useState({
    intitule: '',
    references: [''], // Multiple references
    boite: '',
    nomDemandeur: 'iheb brahmi', // Default from screenshot example
    emailDemandeur: 'brahmiiheb2000@gmail.com', // Default from screenshot example
    dateCommunication: format(new Date(), 'yyyy-MM-dd'),
    dateManuelle: '',
    typeDocument: 'sinistre matériel'
  });

  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      try {
        const [reqs, remoteReqs] = await Promise.all([
          api.get('/api/requests'),
          api.get('/api/remote-requests')
        ]);
        setRequests(reqs);
        setRemoteRequests(remoteReqs);
      } catch (err) {
        console.error("API Error in AgentDashboard:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Polling every 10s
    return () => clearInterval(interval);
  }, [user]);

  const handleUpdateRemoteStatus = async (reqId: string, newStatus: string, email: string, name: string) => {
    try {
      await api.patch(`/api/remote-requests/${reqId}`, {
        status: newStatus,
        updatedBy: user.displayName || user.email
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
          subject: `Mise à jour de votre demande d'archives - ${newStatus}`,
          html: `<p>Bonjour ${name},</p><p>${message}</p>`
        });
      }
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la mise à jour");
    }
  };

  const handlePrint = (req: any) => {
    const doc = new jsPDF();
    const greenColor: [number, number, number] = [76, 124, 56]; 
    const grayHeader: [number, number, number] = [180, 180, 180];

    // Header Banner
    doc.setFillColor(greenColor[0], greenColor[1], greenColor[2]);
    doc.rect(10, 10, 190, 20, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("FICHE DE DEMANDE D'ARCHIVES A DISTANCE", 105, 22, { align: 'center' });

    // Client Info Table
    const dateStr = format(new Date(), 'dd/MM/yyyy');
    
    autoTable(doc, {
      startY: 40,
      head: [['INFORMATIONS DU DEMANDEUR', '', dateStr]],
      body: [
        ['Nom et Prénom', `: ${req.nom}`, ''],
        ['Email', `: ${req.email || '-'}`, ''],
        ['Service / Unité', `: ${req.service || '-'}`, ''],
        ['Priorité', `: ${req.priorite || '-'}`, ''],
        ['Motif', `: ${req.motif || 'Non spécifié'}`, '']
      ],
      theme: 'grid',
      headStyles: { 
        fillColor: grayHeader, 
        textColor: [0, 0, 0], 
        fontStyle: 'bold',
        halign: 'left'
      },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: 100 },
        2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
      },
      styles: { fontSize: 10, cellPadding: 3 }
    });

    // References Table
    const refs = Array.isArray(req.references) ? req.references : [req.references];
    const docsList = refs.map((ref: string, index: number) => [
      index + 1,
      ref,
      'Document d\'archive',
      req.status
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['No', 'Référence Demandée', 'Type', 'Statut Actuel']],
      body: docsList,
      theme: 'grid',
      headStyles: { 
        fillColor: grayHeader, 
        textColor: [0, 0, 0], 
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'center', cellWidth: 80 },
        2: { halign: 'center', cellWidth: 45 },
        3: { halign: 'center', cellWidth: 50 }
      },
      styles: { fontSize: 10, cellPadding: 3 }
    });

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Imprimé par: ${user?.displayName || user?.email} le ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, (doc as any).lastAutoTable.finalY + 20);
    doc.text(`ID Demande: ${req.id}`, 20, (doc as any).lastAutoTable.finalY + 25);

    doc.save(`Demande_${req.nom.replace(/\s+/g, '_')}_${req.id.slice(0, 5)}.pdf`);
  };

  const handleAddReference = () => {
    setFormData({
      ...formData,
      references: [...formData.references, '']
    });
  };

  const handleRemoveReference = (index: number) => {
    if (formData.references.length <= 1) return;
    const newRefs = formData.references.filter((_, i) => i !== index);
    setFormData({ ...formData, references: newRefs });
  };

  const handleReferenceChange = (index: number, value: string) => {
    const newRefs = [...formData.references];
    newRefs[index] = value;
    setFormData({ ...formData, references: newRefs });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        // Extract references from first column (assuming first col is reference)
        const extractedRefs = data
          .map(row => row[0]?.toString()?.trim())
          .filter(val => val && val !== '');

        if (extractedRefs.length > 0) {
          // If the first ref is empty, replace it, otherwise append
          const currentRefs = formData.references.filter(r => r.trim() !== '');
          setFormData({
            ...formData,
            references: [...new Set([...currentRefs, ...extractedRefs])]
          });
        }
      } catch (err) {
        console.error("Error parsing excel:", err);
      }
    };
    reader.readAsBinaryString(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Filter out empty references
    const validRefs = formData.references.filter(r => r.trim() !== '');
    if (validRefs.length === 0) {
      alert("Veuillez saisir au moins une référence.");
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/requests', {
        ...formData,
        references: validRefs,
        reference: validRefs[0], 
        status: 'pending'
      });
      setSuccess(true);
      setFormData({
        ...formData,
        intitule: '',
        references: [''],
        boite: '',
        dateManuelle: ''
      });
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-500 rounded-2xl text-white shadow-lg shadow-green-100">
            <Layers size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              Tableau de Bord Agent
            </h1>
            <p className="text-slate-500 text-sm">Gérez vos demandes de dossiers d'archives</p>
          </div>
        </div>

        <div className="flex p-1 bg-white rounded-2xl shadow-sm border border-slate-100">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'new' ? 'bg-green-600 text-white shadow-md shadow-green-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Plus size={18} />
            Ajouter un dossier
          </button>
          <button
            onClick={() => setActiveTab('remote')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all relative ${activeTab === 'remote' ? 'bg-green-600 text-white shadow-md shadow-green-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Inbox size={18} />
            Demandes Reçues
            {remoteRequests.filter(r => r.status === 'En attente').length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                {remoteRequests.filter(r => r.status === 'En attente').length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'new' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <Card className="p-0 overflow-hidden border-slate-100 shadow-xl shadow-slate-200/50">
            <div className="bg-[#004d2c] px-8 py-4 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <FileText className="text-white" size={24} />
                  <h2 className="text-white font-bold text-lg">Nouvelle Demande</h2>
               </div>
               <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl h-9 px-4 text-xs font-bold flex items-center gap-2 transition-all"
               >
                  <FileSpreadsheet size={16} />
                  Importer Excel
               </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              {/* Intitulé */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  Intitulé <span className="text-slate-400 font-normal">(optionnel)</span>
                </label>
                <Input
                  placeholder="Intitulé du document"
                  value={formData.intitule}
                  onChange={e => setFormData({ ...formData, intitule: e.target.value })}
                  className="bg-white border-slate-200 h-14"
                />
              </div>

              {/* Références Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Référence(s) *</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="file" 
                      accept=".xlsx,.xls" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleFileUpload} 
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-9 px-3 text-[11px] font-bold flex items-center gap-2 bg-green-50 text-green-700 border-green-100 hover:bg-green-100"
                    >
                      <FileSpreadsheet size={14} />
                      Importer Excel
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAddReference}
                      className="h-9 px-3 text-[11px] font-bold flex items-center gap-2"
                    >
                      <Plus size={14} />
                      Ajouter
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar p-1">
                  {formData.references.map((ref, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center gap-2"
                    >
                      <div className="relative flex-1">
                        <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <Input
                          required
                          placeholder="Ex: 100221223"
                          value={ref}
                          onChange={e => handleReferenceChange(idx, e.target.value)}
                          className="bg-white border-slate-200 h-12 pl-12"
                        />
                      </div>
                      {formData.references.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveReference(idx)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Boîte */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  Boîte <span className="text-slate-400 font-normal">(optionnel)</span>
                </label>
                <Input
                  placeholder="1500"
                  value={formData.boite}
                  onChange={e => setFormData({ ...formData, boite: e.target.value })}
                  className="bg-white border-slate-200 h-14"
                />
              </div>

              {/* Nom du demandeur */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Nom du demandeur *</label>
                <Input
                  required
                  placeholder="iheb brahmi"
                  value={formData.nomDemandeur}
                  onChange={e => setFormData({ ...formData, nomDemandeur: e.target.value })}
                  className="bg-white border-slate-200 h-14"
                />
              </div>

              {/* Email du demandeur */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  Email du demandeur <span className="text-slate-400 font-normal">(optionnel)</span>
                </label>
                <div className="relative">
                  <Input
                    type="email"
                    placeholder="brahmiiheb2000@gmail.com"
                    value={formData.emailDemandeur}
                    onChange={e => setFormData({ ...formData, emailDemandeur: e.target.value })}
                    className="bg-[#ebf3ff] border-[#d8e7ff] text-slate-700 h-14"
                  />
                </div>
              </div>

              {/* Date de communication */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700">Date de communication *</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  <Input
                    required
                    type="date"
                    value={formData.dateCommunication}
                    onChange={e => setFormData({ ...formData, dateCommunication: e.target.value })}
                    className="bg-white border-slate-200 pl-12 h-14"
                  />
                </div>
                <Input
                  placeholder="ou saisir: JJ/MM/AAAA"
                  value={formData.dateManuelle}
                  onChange={e => setFormData({ ...formData, dateManuelle: e.target.value })}
                  className="bg-white border-slate-200 h-14"
                />
              </div>

              {/* Type de document */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Type de document *</label>
                <div className="relative">
                   <select
                    required
                    className="w-full flex h-14 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-slate-700"
                    value={formData.typeDocument}
                    onChange={e => setFormData({ ...formData, typeDocument: e.target.value })}
                  >
                    <option value="sinistre matériel">sinistre matériel</option>
                    <option value="sinistre corporel">sinistre corporel</option>
                    <option value="comptabilité">comptabilité</option>
                    <option value="production">production</option>
                    <option value="archives des succursales">archives des succursales</option>
                    <option value="BS">BS</option>
                    <option value="autre">autre</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <Check size={16} className="rotate-90" />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Button 
                  className="w-full h-14 text-lg font-bold rounded-lg bg-[#005e35] hover:bg-[#004a29] text-white transition-all flex items-center justify-center gap-3 border-none"
                  isLoading={loading}
                  type="submit"
                >
                  {!loading && <Send size={20} />}
                  Soumettre la demande
                </Button>
              </div>

              <AnimatePresence>
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-4 bg-green-50 border border-green-100 rounded-xl flex items-center gap-3 text-green-700 text-sm font-medium"
                  >
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white shrink-0">
                      <Check size={16} />
                    </div>
                    Votre demande a été enregistrée avec succès.
                  </motion.div>
                )}
              </AnimatePresence>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Card className="p-6 border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Archive className="text-green-600" size={20} />
              Mes Demandes
            </h3>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {requests.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="text-slate-300" size={32} />
                  </div>
                  <p className="text-sm text-slate-400">Aucune demande soumise</p>
                </div>
              ) : (
                requests.map((request) => (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 rounded-2xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:shadow-lg transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded uppercase tracking-wider">
                             {(request.references?.[0] || request.reference).substring(0, 15)}...
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                            request.status === 'signed' ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {request.status}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-slate-800">{request.nomDemandeur}</p>
                        {request.references && request.references.length > 1 && (
                          <p className="text-[10px] text-slate-500">+{request.references.length - 1} autres refs</p>
                        )}
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Calendar size={12} />
                          {toSafeDate(request.createdAt) ? format(toSafeDate(request.createdAt)!, 'dd/MM/yyyy') : '...'}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-0 overflow-hidden border-slate-100 shadow-xl">
             <div className="bg-[#004d2c] px-8 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <Inbox className="text-white" size={24} />
                   <h2 className="text-white font-bold text-lg">Demandes à distance reçues</h2>
                </div>
                <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest bg-white/10 px-3 py-1 rounded-full">
                   {remoteRequests.length} dossiers au total
                </span>
             </div>
             
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead>
                   <tr className="bg-slate-50 border-b border-slate-100">
                     <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Demandeur</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Références</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date / Priorité</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Statut</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                   {remoteRequests.map((req) => (
                     <tr key={req.id} className="hover:bg-slate-50/50 transition-colors group">
                       <td className="px-6 py-4">
                         <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">
                             {req.nom.charAt(0)}
                           </div>
                           <div>
                             <p className="font-bold text-slate-800 text-sm">{req.nom}</p>
                             <p className="text-[10px] text-slate-400 flex items-center gap-1">
                               <Building2 size={10} /> {req.service}
                             </p>
                           </div>
                         </div>
                       </td>
                       <td className="px-6 py-4">
                         <div className="flex flex-wrap gap-1">
                           {(Array.isArray(req.references) ? req.references : [req.references]).map((ref: string, i: number) => (
                             <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium border border-slate-200">
                               {ref}
                             </span>
                           ))}
                         </div>
                       </td>
                       <td className="px-6 py-4">
                         <div className="space-y-1">
                           <p className="text-xs font-bold text-slate-700">{format(new Date(req.dateSouhaitee), 'dd/MM/yyyy')}</p>
                           <span className={cn(
                             "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter",
                             req.priorite === 'Urgente' ? 'bg-red-50 text-red-600 animate-pulse' : 
                             req.priorite === 'Basse' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'
                           )}>
                             {req.priorite}
                           </span>
                         </div>
                       </td>
                       <td className="px-6 py-4">
                         <span className={cn(
                           "text-[10px] font-bold px-2.5 py-1 rounded-full border",
                           req.status === 'En attente' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                           req.status === 'En cours' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                           req.status === 'Prêt / Communiqué' ? 'bg-green-50 text-green-600 border-green-100' :
                           req.status === 'Refusé' ? 'bg-red-50 text-red-600 border-red-100' :
                           'bg-slate-100 text-slate-500 border-slate-200'
                         )}>
                           {req.status}
                         </span>
                       </td>
                       <td className="px-6 py-4">
                         <div className="flex items-center gap-1">
                            <button 
                              onClick={() => handlePrint(req)}
                              className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Imprimer la demande"
                            >
                              <Printer size={16} />
                            </button>
                           <button 
                             onClick={() => handleUpdateRemoteStatus(req.id, 'En cours', req.email, req.nom)}
                             className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                             title="Passer en cours"
                           >
                             <RotateCcw size={16} />
                           </button>
                           <button 
                             onClick={() => handleUpdateRemoteStatus(req.id, 'Prêt / Communiqué', req.email, req.nom)}
                             className="p-1.5 text-slate-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-all"
                             title="Marquer comme prêt"
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
                       </td>
                     </tr>
                   ))}
                   {remoteRequests.length === 0 && (
                     <tr>
                       <td colSpan={5} className="py-20 text-center">
                         <div className="mx-auto w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
                           <Inbox size={32} />
                         </div>
                         <p className="text-slate-400 font-bold">Aucune demande à distance pour le moment</p>
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </Card>
        </div>
      )}
    </div>
  );
};
