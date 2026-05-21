import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, Card } from './UI';
import { Send, User, Mail, Phone, Building2, Hash, MessageSquare, Calendar, AlertCircle, CheckCircle2, Plus, Trash2, Upload, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useAuth } from '../App';
import { api } from '../lib/api';

interface RemoteRequestProps {
  onFinished?: () => void;
  isEmbedded?: boolean;
}

export const RemoteRequestForm = ({ onFinished, isEmbedded }: RemoteRequestProps) => {
  const { profile, user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nom: '',
    service: '',
    email: '',
    telephone: '',
    references: [''],
    motif: '',
    priorite: 'Normal',
    dateSouhaitee: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (profile || user) {
      setFormData(prev => ({
        ...prev,
        nom: profile?.displayName || user?.displayName || '',
        email: profile?.email || user?.email || '',
      }));
    }
  }, [profile, user]);

  const handleAddRef = () => setFormData({ ...formData, references: [...formData.references, ''] });
  const handleRemoveRef = (index: number) => {
    if (formData.references.length > 1) {
      setFormData({ ...formData, references: formData.references.filter((_, i) => i !== index) });
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportRefs = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const XLSX = await import('xlsx');
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        const extractedRefs = data
          .map(row => row[0]?.toString()?.trim())
          .filter(val => val && val !== '');

        if (extractedRefs.length > 0) {
          const currentRefs = formData.references.filter(r => r.trim() !== '');
          setFormData(prev => ({
            ...prev,
            references: [...new Set([...currentRefs, ...extractedRefs])]
          }));
        }
      } catch (err) {
        console.error("Error parsing excel:", err);
        alert("Erreur lors de l'importation de l'Excel");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const handleManualImport = () => {
    const input = prompt("Saisissez vos références séparées par une virgule ou un retour à la ligne :");
    if (input) {
      const newRefs = input.split(/[,\n]/).map(r => r.trim()).filter(r => r !== '');
      if (newRefs.length > 0) {
        const currentRefs = formData.references.filter(r => r.trim() !== '');
        setFormData(prev => ({ 
          ...prev, 
          references: [...new Set([...currentRefs, ...newRefs])] 
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validRefs = formData.references.filter(r => r.trim() !== '');
      await api.post('/api/remote-requests', {
        ...formData,
        references: validRefs,
        status: 'En attente',
        type: 'distance',
        uid: user?.uid || null
      });

      setSubmitted(true);
      if (onFinished) {
        setTimeout(onFinished, 3000);
      }
    } catch (err) {
      console.error(err);
      alert('Erreur lors de l\'envoi');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className={isEmbedded ? "p-12 text-center" : "min-h-screen bg-slate-50 flex items-center justify-center p-4"}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card className={`${isEmbedded ? 'border-none shadow-none' : 'max-w-md shadow-2xl'} w-full text-center p-12 space-y-6`}>
            <div className="w-20 h-20 bg-brand-secondary text-brand-primary rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-3xl font-bold text-slate-800">Demande Envoyée !</h2>
            <p className="text-slate-500">Votre demande a été transmise au service des archives. Redirection vers l'historique...</p>
            {!isEmbedded && (
              <Button className="w-full bg-brand-primary hover:opacity-90" onClick={() => window.location.reload()}>
                Nouvelle demande
              </Button>
            )}
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={isEmbedded ? "px-6 py-8" : profile ? "" : "min-h-screen bg-slate-50 py-12 px-4 shadow-sm"}>
      <div className={isEmbedded ? "" : profile ? "space-y-8" : "max-w-3xl mx-auto space-y-8"}>
        {!isEmbedded && !profile && (
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-brand-primary rounded-2xl text-white shadow-lg mb-4">
              <Send size={32} />
            </div>
            <h1 className="text-4xl font-extrabold text-slate-800">Demande d'Archives à Distance</h1>
            <p className="text-slate-500 text-lg">Veuillez remplir le formulaire ci-dessous pour demander un dossier.</p>
          </div>
        )}
        
        {profile && (
           <div className="flex items-center gap-4 mb-8">
             <div className="w-12 h-12 bg-brand-secondary text-brand-primary rounded-2xl flex items-center justify-center">
               <Send size={24} />
             </div>
             <div>
               <h1 className="text-2xl font-bold text-slate-800">Nouvelle Demande à Distance</h1>
               <p className="text-slate-500 text-sm">Remplissez les détails pour soumettre votre dossier</p>
             </div>
           </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="p-8 shadow-xl border-none">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Nom Complet *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input required placeholder="Ex: Jean Dupont" value={formData.nom} onChange={e => setFormData({ ...formData, nom: e.target.value })} className="pl-10 h-12" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Service / Département *</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input required placeholder="Ex: Ressources Humaines" value={formData.service} onChange={e => setFormData({ ...formData, service: e.target.value })} className="pl-10 h-12" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Email Professionnel</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input type="email" placeholder="email@entreprise.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="pl-10 h-12" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Téléphone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input placeholder="+216 -- --- ---" value={formData.telephone} onChange={e => setFormData({ ...formData, telephone: e.target.value })} className="pl-10 h-12" />
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700">Références demandées *</label>
                <div className="flex gap-2">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".xlsx,.xls" 
                    onChange={handleImportRefs} 
                  />
                  <div className="relative group">
                    <Button type="button" variant="ghost" size="sm" onClick={handleManualImport} className="h-9 px-3 text-brand-primary hover:text-brand-primary hover:bg-brand-secondary">
                      <Upload size={16} className="mr-1" /> Importer liste
                    </Button>
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -right-1 -top-1 bg-brand-primary text-white rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Importer depuis Excel"
                    >
                      <FileSpreadsheet size={10} />
                    </button>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={handleAddRef} className="h-9 px-3">
                    <Plus size={16} className="mr-1" /> Ajouter
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formData.references.map((ref, idx) => (
                  <div key={idx} className="flex gap-2">
                    <div className="relative flex-1">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <Input required placeholder="N° Référence" value={ref} onChange={e => {
                        const newRefs = [...formData.references];
                        newRefs[idx] = e.target.value;
                        setFormData({ ...formData, references: newRefs });
                      }} className="pl-9 h-11" />
                    </div>
                    {formData.references.length > 1 && (
                      <button type="button" onClick={() => handleRemoveRef(idx)} className="text-slate-400 hover:text-red-500">
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Priorité</label>
                <select 
                  className="w-full h-12 rounded-xl border border-slate-200 px-4 focus:ring-2 focus:ring-brand-primary outline-none"
                  value={formData.priorite}
                  onChange={e => setFormData({ ...formData, priorite: e.target.value })}
                >
                  <option>Basse</option>
                  <option>Normal</option>
                  <option>Urgente</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Date souhaitée</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <Input type="date" value={formData.dateSouhaitee} onChange={e => setFormData({ ...formData, dateSouhaitee: e.target.value })} className="pl-10 h-12" />
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-2">
              <label className="text-sm font-bold text-slate-700">Motif de la demande</label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-4 text-slate-400" size={18} />
                <textarea 
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-3 focus:ring-2 focus:ring-brand-primary outline-none text-sm"
                  placeholder="Justifiez votre demande ici..."
                  value={formData.motif}
                  onChange={e => setFormData({ ...formData, motif: e.target.value })}
                />
              </div>
            </div>

            <Button className="w-full h-14 text-lg font-bold mt-10 bg-brand-primary hover:opacity-90 shadow-lg shadow-brand-primary/20" isLoading={loading}>
              <Send className="mr-2" size={20} />
              Envoyer la demande
            </Button>
          </Card>
        </form>
      </div>
    </div>
  );
};
