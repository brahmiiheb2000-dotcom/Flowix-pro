import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  CheckCircle2, 
  Clock, 
  Printer, 
  X, 
  Building2, 
  FileStack, 
  User, 
  Calendar, 
  ShieldCheck, 
  MessageSquare, 
  AlertCircle,
  Download,
  Send
} from 'lucide-react';
import { Button } from '../UI';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export interface TransferRequestItem {
  id: string;
  demandNumber?: string;
  direction: string;
  documentType: string;
  boxes: string | number;
  folders: string | number;
  requester: string;
  email?: string;
  status: 'En attente' | 'Validée' | 'Acceptée' | 'Rejetée' | string;
  createdAt: string | Date;
  updatedAt?: string | Date;
  hasInventory?: boolean;
  observations?: string;
  acceptedBy?: string;
  acceptedAt?: string | Date;
}

// -------------------------------------------------------------
// 1. Bordereau d'Envoi Préliminaire (Modal / Printable)
// -------------------------------------------------------------
interface BordereauPreliminaireProps {
  request: TransferRequestItem;
  onClose: () => void;
}

export const BordereauPreliminaireModal: React.FC<BordereauPreliminaireProps> = ({ request, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  const formattedDate = () => {
    try {
      const d = request.createdAt ? new Date(request.createdAt) : new Date();
      return format(d, "dd MMMM yyyy 'à' HH:mm", { locale: fr });
    } catch {
      return String(request.createdAt || 'N/A');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden my-8 print:shadow-none print:m-0 print:w-full print:max-w-none">
        
        {/* Header Bar - Hidden in print */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-accent/20 rounded-xl flex items-center justify-center text-brand-accent">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Bordereau d'Envoi Préliminaire</h3>
              <p className="text-xs text-slate-400">Demande de Transfert d'Archives #{request.demandNumber || request.id.slice(0, 8)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-brand-accent text-white hover:bg-brand-accent/90 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Printer size={14} /> Imprimer / PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Content Body */}
        <div id="printable-area" className="p-8 md:p-10 space-y-6 text-slate-800 bg-white">
          
          {/* Header section with badge */}
          <div className="border-b-2 border-slate-900 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                  RÉCÉPISSÉ PRÉLIMINAIRE
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  Statut : En attente de validation
                </span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                Bordereau d'Envoi Préliminaire
              </h1>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Service de Gestion des Archives Centrales
              </p>
            </div>
            <div className="text-left md:text-right bg-slate-50 p-3 rounded-xl border border-slate-200 min-w-[200px]">
              <p className="text-[10px] font-bold uppercase text-slate-400">N° de Bordereau</p>
              <p className="text-lg font-black font-mono text-slate-900">
                {request.demandNumber ? `DEM-${request.demandNumber}` : `DEM-${request.id.slice(0, 8)}`}
              </p>
              <p className="text-[10px] font-medium text-slate-500 mt-1">
                Date : {formattedDate()}
              </p>
            </div>
          </div>

          {/* Grid of details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Box 1: Demandeur */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                <User size={14} className="text-brand-accent" />
                1. Service Émetteur & Demandeur
              </h3>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Nom du demandeur : </span>
                  <span className="font-bold text-slate-800">{request.requester || 'Non renseigné'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Direction / Service : </span>
                  <span className="font-bold text-slate-800">{request.direction || 'Non spécifié'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Adresse email : </span>
                  <span className="font-mono text-slate-700">{request.email || 'Non disponible'}</span>
                </div>
              </div>
            </div>

            {/* Box 2: Détails du transfert */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                <FileStack size={14} className="text-brand-accent" />
                2. Caractéristiques du Versement
              </h3>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Type de documents : </span>
                  <span className="font-bold text-slate-800">{request.documentType || 'Archives générales'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Nombre de boîtes : </span>
                  <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">{request.boxes || 0} boîte(s)</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Nombre de dossiers : </span>
                  <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">{request.folders || 0} dossier(s)</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Inventaire détaillé joignant : </span>
                  <span className="font-bold text-slate-800">{request.hasInventory ? 'Oui (Fichier Excel rattaché)' : 'Non fourni'}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Legal / Notice section */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <AlertCircle size={14} className="text-amber-600 shrink-0" />
              Accusé de Dépôt Provisoire
            </p>
            <p className="text-[11px] leading-relaxed text-amber-800/90">
              Ce bordereau d'envoi préliminaire atteste de la soumission de la demande de transfert dans le système. 
              Il fait foi de dépôt temporaire en attente de l'examen et de la validation définitive par le Responsable des Archives. 
              Dès validation, une <strong>Fiche d'Acceptation de Transfert</strong> finale sera émise.
            </p>
          </div>

          {/* Signature Boxes */}
          <div className="pt-6 grid grid-cols-2 gap-8 border-t border-slate-200 text-xs">
            <div className="space-y-8">
              <p className="font-bold text-slate-700">Visa du Demandeur (Émetteur) :</p>
              <div className="h-16 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-slate-300 italic text-[11px]">
                Signature / Cachet Service
              </div>
              <p className="text-[10px] text-slate-400 text-center font-mono">{request.requester}</p>
            </div>
            <div className="space-y-8">
              <p className="font-bold text-slate-700">Accusé de Réception Archives :</p>
              <div className="h-16 border-2 border-dashed border-amber-200 bg-amber-50/30 rounded-lg flex items-center justify-center text-amber-700/60 font-medium text-[11px]">
                En attente de validation
              </div>
              <p className="text-[10px] text-slate-400 text-center font-mono">Service Central des Archives</p>
            </div>
          </div>

          {/* Footer note */}
          <div className="text-center pt-4 border-t border-slate-100 text-[10px] text-slate-400">
            Document généré automatiquement via la plateforme de gestion d'archives — {formattedDate()}
          </div>
        </div>

        {/* Action bar - Hidden in print */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3 print:hidden">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Fermer
          </Button>
          <Button onClick={handlePrint} className="bg-brand-accent hover:opacity-90 text-xs font-bold flex items-center gap-1.5">
            <Printer size={14} /> Imprimer Bordereau
          </Button>
        </div>

      </div>
    </div>
  );
};


// -------------------------------------------------------------
// 2. Modal de Validation par le Responsable avec Input Observations
// -------------------------------------------------------------
interface ValidationTransfertModalProps {
  request: TransferRequestItem;
  onClose: () => void;
  onConfirm: (observations: string) => Promise<void>;
}

export const ValidationTransfertModal: React.FC<ValidationTransfertModalProps> = ({ request, onClose, onConfirm }) => {
  const [observations, setObservations] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onConfirm(observations);
    } catch (err) {
      console.error("Validation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPrompt = (text: string) => {
    setObservations(prev => (prev ? `${prev} ${text}` : text));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
      >
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Validation du Transfert</h3>
              <p className="text-xs text-slate-400">Demande #{request.demandNumber || request.id.slice(0, 8)}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Summary Box */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Demandeur :</span>
              <span className="font-bold text-slate-800">{request.requester} ({request.direction})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Documents :</span>
              <span className="font-bold text-slate-800">{request.documentType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Volume :</span>
              <span className="font-bold text-slate-800">{request.boxes} boîte(s) • {request.folders} dossier(s)</span>
            </div>
          </div>

          {/* Observations input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare size={14} className="text-brand-accent" />
              Observations & Directives du Responsable des Archives
            </label>
            <textarea
              rows={4}
              className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:ring-2 focus:ring-brand-accent outline-none bg-slate-50/50"
              placeholder="Indiquez vos directives, l'emplacement réservé, les consignes d'étiquetage ou toute observation sur le lot..."
              value={observations}
              onChange={e => setObservations(e.target.value)}
              required
            />
          </div>

          {/* Quick Prompts */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Propositions rapides :</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickPrompt("Transfert conforme et accepté sans réserve.")}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md transition-colors font-medium"
              >
                + Conforme sans réserve
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt("Emplacement attribué : Rayonnage Central - Zone Transfert.")}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md transition-colors font-medium"
              >
                + Emplacement attribué
              </button>
              <button
                type="button"
                onClick={() => handleQuickPrompt("Veuillez vérifier la numérotation des boîtes avant acheminement.")}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded-md transition-colors font-medium"
              >
                + Vérifier numérotation
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={onClose} className="text-xs">
              Annuler
            </Button>
            <Button
              type="submit"
              isLoading={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/20"
            >
              <CheckCircle2 size={16} className="mr-1.5" />
              Confirmer & Générer Fiche d'Acceptation
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};


// -------------------------------------------------------------
// 3. Fiche d'Acceptation Officielles (Modal / Printable)
// -------------------------------------------------------------
interface FicheAcceptationProps {
  request: TransferRequestItem;
  onClose: () => void;
}

export const FicheAcceptationModal: React.FC<FicheAcceptationProps> = ({ request, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  const formattedDemandDate = () => {
    try {
      const d = request.createdAt ? new Date(request.createdAt) : new Date();
      return format(d, "dd/MM/yyyy HH:mm", { locale: fr });
    } catch {
      return String(request.createdAt || 'N/A');
    }
  };

  const formattedAcceptedDate = () => {
    try {
      const d = request.acceptedAt ? new Date(request.acceptedAt) : (request.updatedAt ? new Date(request.updatedAt) : new Date());
      return format(d, "dd MMMM yyyy 'à' HH:mm", { locale: fr });
    } catch {
      return String(request.acceptedAt || request.updatedAt || 'N/A');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden my-8 print:shadow-none print:m-0 print:w-full print:max-w-none">
        
        {/* Header Bar - Hidden in print */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Fiche d'Acceptation de Transfert</h3>
              <p className="text-xs text-slate-400">Réf : DEM-{request.demandNumber || request.id.slice(0, 8)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
            >
              <Printer size={14} /> Imprimer / PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Content Body */}
        <div id="printable-area" className="p-8 md:p-10 space-y-6 text-slate-800 bg-white">
          
          {/* Top Header */}
          <div className="border-b-2 border-emerald-600 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <CheckCircle2 size={12} /> DÉCISION : ACCEPTÉE & VALIDÉE
                </span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
                Fiche d'Acceptation de Transfert
              </h1>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Direction de la Conservation et du Patrimoine Archivistique
              </p>
            </div>
            <div className="text-left md:text-right bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 min-w-[210px]">
              <p className="text-[10px] font-bold uppercase text-emerald-700">Fiche N° Validation</p>
              <p className="text-lg font-black font-mono text-emerald-900">
                {request.demandNumber ? `VAL-${request.demandNumber}` : `VAL-${request.id.slice(0, 8)}`}
              </p>
              <p className="text-[10px] font-medium text-emerald-800 mt-1">
                Validé le : {formattedAcceptedDate()}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Box 1: Demandeur info */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                <User size={14} className="text-emerald-600" />
                Service Émetteur & Origine
              </h3>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Nom du demandeur : </span>
                  <span className="font-bold text-slate-800">{request.requester || 'Non renseigné'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Direction / Service : </span>
                  <span className="font-bold text-slate-800">{request.direction || 'Non spécifié'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Email : </span>
                  <span className="font-mono text-slate-700">{request.email || 'Non disponible'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Date de soumission : </span>
                  <span className="font-medium text-slate-700">{formattedDemandDate()}</span>
                </div>
              </div>
            </div>

            {/* Box 2: Transfer details */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                <FileStack size={14} className="text-emerald-600" />
                Caractéristiques du Lot Transféré
              </h3>
              <div className="space-y-1.5 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Intitulé / Nature : </span>
                  <span className="font-bold text-slate-800">{request.documentType || 'Documents d\'archives'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Volume accepté : </span>
                  <span className="font-bold text-emerald-900 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200">
                    {request.boxes || 0} boîte(s) • {request.folders || 0} dossier(s)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Inventaire détaillé : </span>
                  <span className="font-bold text-slate-800">{request.hasInventory ? 'Oui (Excel rattaché)' : 'Aucun'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Validé par : </span>
                  <span className="font-bold text-slate-800">{request.acceptedBy || 'Responsable des Archives'}</span>
                </div>
              </div>
            </div>

          </div>

          {/* CRITICAL SECTION: OBSERVATIONS DU RESPONSABLE */}
          <div className="bg-emerald-50/80 border-2 border-emerald-500/40 rounded-2xl p-5 space-y-2 shadow-sm">
            <h3 className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-2 border-b border-emerald-200/80 pb-2">
              <MessageSquare size={16} className="text-emerald-600" />
              Observations & Directives du Responsable des Archives
            </h3>
            <div className="text-xs text-slate-800 font-medium leading-relaxed bg-white p-4 rounded-xl border border-emerald-200 shadow-inner">
              {request.observations && request.observations.trim() ? (
                <p className="whitespace-pre-line text-slate-800 font-sans">{request.observations}</p>
              ) : (
                <p className="italic text-slate-400">Aucune observation spécifique formulée lors de la validation.</p>
              )}
            </div>
          </div>

          {/* Signatures & Stamp */}
          <div className="pt-6 grid grid-cols-2 gap-8 border-t border-slate-200 text-xs">
            <div className="space-y-8">
              <p className="font-bold text-slate-700">Visa du Responsable Émetteur :</p>
              <div className="h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 italic text-[11px]">
                {request.requester}
              </div>
            </div>
            <div className="space-y-8">
              <p className="font-bold text-slate-700">Visa & Cachet du Responsable des Archives :</p>
              <div className="h-20 border-2 border-emerald-300 bg-emerald-50/40 rounded-xl flex flex-col items-center justify-center text-emerald-800 font-bold text-xs p-2 relative overflow-hidden">
                <div className="absolute top-1 right-2 text-[9px] text-emerald-600/50 uppercase font-mono tracking-widest">
                  SEAL OF ACCEPTANCE
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <ShieldCheck size={18} />
                  <span>{request.acceptedBy || 'Responsable des Archives'}</span>
                </div>
                <span className="text-[10px] text-emerald-600 font-medium mt-1">Accepté le {formattedAcceptedDate()}</span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="text-center pt-4 border-t border-slate-100 text-[10px] text-slate-400">
            Fiche officielle d'acceptation enregistrée au registre central des transferts — Document à conserver avec le bordereau
          </div>

        </div>

        {/* Action bar - Hidden in print */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3 print:hidden">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Fermer
          </Button>
          <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md">
            <Printer size={14} /> Imprimer / Télécharger PDF
          </Button>
        </div>

      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 4. Bordereau Final de Transfert / Versement d'Inventaires (Validation Audit)
// -------------------------------------------------------------
export interface BordereauFinalInventaireProps {
  items: any[];
  validatorName?: string;
  validatedAt?: string | Date;
  onClose: () => void;
}

export const BordereauFinalInventaireModal: React.FC<BordereauFinalInventaireProps> = ({
  items,
  validatorName = 'Responsable Audit & Conservation',
  validatedAt = new Date(),
  onClose
}) => {
  const handlePrint = () => {
    window.print();
  };

  const formattedDate = () => {
    try {
      const d = new Date(validatedAt);
      return format(d, "dd MMMM yyyy 'à' HH:mm", { locale: fr });
    } catch {
      return String(validatedAt);
    }
  };

  const docNumber = `BFT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  // Calculate stats
  const totalItems = items.length;
  const uniqueBoxes = new Set(items.map(i => i.numBoite || i.reference || '1')).size;
  const directionsList = Array.from(new Set(items.map(i => i.direction).filter(Boolean))).join(', ') || 'Directions & Services Généraux';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-8 print:shadow-none print:m-0 print:w-full print:max-w-none">
        
        {/* Header Bar - Hidden in print */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 font-bold border border-emerald-500/30">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase rounded border border-emerald-500/30">
                  Validation Finale Réussie
                </span>
                <span className="text-slate-400 text-xs font-mono">{docNumber}</span>
              </div>
              <h3 className="font-black text-lg text-white">Bordereau Final de Transfert d'Inventaires</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer"
            >
              <Printer size={15} /> Imprimer / Exporter PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Content Body */}
        <div id="printable-area" className="p-8 md:p-12 space-y-6 text-slate-800 bg-white">
          
          {/* Official Document Banner Header */}
          <div className="border-b-2 border-slate-900 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-black text-xs flex items-center justify-center">
                  SA
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  RÉPUBLIQUE - DIRECTION CENTRALE DES ARCHIVES & DE L'AUDIT
                </span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                BORDEREAU FINAL DE TRANSFERT ET DE VERSEMENT
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Certificat Officiel d'Inclusion et de Scellé dans le Système Centralisé des Archives
              </p>
            </div>
            <div className="text-right bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
              <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Document Scellé & Validé</div>
              <div className="font-mono font-black text-sm text-emerald-900">{docNumber}</div>
              <div className="text-[11px] text-emerald-700 mt-1 font-medium">{formattedDate()}</div>
            </div>
          </div>

          {/* Validation Banner Notice */}
          <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <CheckCircle2 size={16} />
                <span>AUDIT ARCHIVAL CONFIRMÉ</span>
              </div>
              <p className="text-xs text-slate-300">
                Les <strong className="text-white font-mono">{totalItems} dossier(s)</strong> listés ci-dessous ont été soumis à la session d'audit, validés conformes et intégrés définitivement dans le fonds d'archives.
              </p>
            </div>
            <div className="text-right whitespace-nowrap">
              <span className="text-[10px] text-slate-400 block uppercase font-mono">Service Responsable</span>
              <span className="text-xs font-bold text-white">{directionsList}</span>
            </div>
          </div>

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Nombre Total de Dossiers</span>
              <span className="text-xl font-black text-slate-900 font-mono">{totalItems}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Boîtes & Cartons Concernés</span>
              <span className="text-xl font-black text-slate-900 font-mono">{uniqueBoxes}</span>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Statut Final</span>
              <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full uppercase inline-block">
                VERSÉ & SCELLÉ
              </span>
            </div>
          </div>

          {/* Inventory Content Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <FileStack size={14} className="text-slate-500" />
              Contenu Intégral des Inventaires Validés ({totalItems} éléments)
            </h3>
            
            <div className="overflow-x-auto rounded-xl border border-slate-300">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-[11px]">
                    <th className="p-2.5 border-b border-slate-700">N°</th>
                    <th className="p-2.5 border-b border-slate-700">Référence Carton</th>
                    <th className="p-2.5 border-b border-slate-700">Intitulé / Objet du Contenu</th>
                    <th className="p-2.5 border-b border-slate-700">Direction / Service</th>
                    <th className="p-2.5 border-b border-slate-700">Localisation</th>
                    <th className="p-2.5 border-b border-slate-700 text-center">Dates Extrêmes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5 font-mono text-[11px] text-slate-400 font-bold">{idx + 1}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{item.reference || '-'}</td>
                      <td className="p-2.5 text-slate-800 font-semibold">{item.intitule || item.title || 'Sans intitulé'}</td>
                      <td className="p-2.5 text-slate-600">{item.direction || 'Service Général'}</td>
                      <td className="p-2.5 font-mono text-slate-600">{item.localisation || item.numBoite || 'Rayon Central'}</td>
                      <td className="p-2.5 text-center font-mono text-slate-500 text-[11px]">
                        {item.dateDebut || '?'} - {item.dateFin || '?'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Official Signatures & Seal Section */}
          <div className="pt-6 grid grid-cols-3 gap-6 border-t-2 border-slate-900 text-xs">
            <div className="space-y-6">
              <p className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Le Service Versant :</p>
              <div className="h-24 border border-dashed border-slate-300 rounded-xl p-3 flex flex-col justify-between text-slate-400 italic text-[11px]">
                <span>Signature & Nom</span>
                <span className="text-[10px] text-slate-500 font-normal">{directionsList}</span>
              </div>
            </div>

            <div className="space-y-6">
              <p className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">L'Administrateur des Archives :</p>
              <div className="h-24 border border-dashed border-slate-300 rounded-xl p-3 flex flex-col justify-between text-slate-500 text-[11px]">
                <span>Visa de Dépôt</span>
                <span className="text-[10px] text-slate-600 font-bold">Conforme aux normes d'archivage</span>
              </div>
            </div>

            <div className="space-y-6">
              <p className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Validation Finale d'Audit :</p>
              <div className="h-24 border-2 border-emerald-500 bg-emerald-50/50 rounded-xl p-3 flex flex-col justify-between text-emerald-900 font-bold relative overflow-hidden shadow-inner">
                <div className="flex items-center gap-1.5 text-emerald-800">
                  <ShieldCheck size={18} />
                  <span className="text-[11px]">{validatorName}</span>
                </div>
                <div className="text-[10px] text-emerald-700 font-mono">
                  SCELLÉ ARCHIVAL LE {formattedDate()}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Notice */}
          <div className="text-center pt-4 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
            Bordereau officiel de transfert d'archives — Enregistré au registre central d'audit #{docNumber}
          </div>

        </div>

        {/* Action bar - Hidden in print */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3 print:hidden">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Fermer
          </Button>
          <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md">
            <Printer size={14} /> Imprimer / Télécharger PDF
          </Button>
        </div>

      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 5. Bordereau Final / Procès-Verbal d'Élimination (Validation Audit)
// -------------------------------------------------------------
export interface BordereauFinalEliminationProps {
  items: any[];
  validatorName?: string;
  validatedAt?: string | Date;
  onClose: () => void;
}

export const BordereauFinalEliminationModal: React.FC<BordereauFinalEliminationProps> = ({
  items,
  validatorName = 'Responsable Audit & Conservation',
  validatedAt = new Date(),
  onClose
}) => {
  const handlePrint = () => {
    window.print();
  };

  const formattedDate = () => {
    try {
      const d = new Date(validatedAt);
      return format(d, "dd MMMM yyyy 'à' HH:mm", { locale: fr });
    } catch {
      return String(validatedAt);
    }
  };

  const docNumber = `PV-ELIM-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const totalItems = items.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-8 print:shadow-none print:m-0 print:w-full print:max-w-none">
        
        {/* Header Bar - Hidden in print */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500/20 rounded-xl flex items-center justify-center text-rose-400 font-bold border border-rose-500/30">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 text-[10px] font-bold uppercase rounded border border-rose-500/30">
                  Procès-Verbal de Destruction Autorisée
                </span>
                <span className="text-slate-400 text-xs font-mono">{docNumber}</span>
              </div>
              <h3 className="font-black text-lg text-white">Bordereau Final & PV d'Élimination d'Archives</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer"
            >
              <Printer size={15} /> Imprimer / Exporter PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Content Body */}
        <div id="printable-area" className="p-8 md:p-12 space-y-6 text-slate-800 bg-white">
          
          {/* Header section with badge */}
          <div className="border-b-2 border-slate-900 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-rose-900 text-white font-black text-xs flex items-center justify-center">
                  PV
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  COMMISSION D'ÉLIMINATION & DE CONSERVATION DES ARCHIVES
                </span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                PROCÈS-VERBAL & BORDEREAU D'ÉLIMINATION DÉFINITIVE
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Autorisation Réglementaire de Destruction Sécurisée après Expiration de la DUA
              </p>
            </div>
            <div className="text-right bg-rose-50 p-3.5 rounded-xl border border-rose-200">
              <div className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">PV Officiel Scellé</div>
              <div className="font-mono font-black text-sm text-rose-900">{docNumber}</div>
              <div className="text-[11px] text-rose-700 mt-1 font-medium">{formattedDate()}</div>
            </div>
          </div>

          {/* Legal Notice */}
          <div className="bg-rose-950 text-white p-4 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
              <CheckCircle2 size={16} />
              <span>AUTORISATION LÉGALE ET AUDIT APPROUVÉS</span>
            </div>
            <p className="text-xs text-slate-300">
              Il est certifié que les <strong className="text-white font-mono">{totalItems} document(s)</strong> référencés ci-dessous ont atteint le terme de leur Durée d'Utilité Administrative (DUA) conformément au tableau de gestion et ont reçu le visa d'élimination définitive du Responsable d'Audit.
            </p>
          </div>

          {/* Table of eliminated items */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <FileStack size={14} className="text-slate-500" />
              Liste Détallée des Articles Inscrits à l'Élimination ({totalItems} éléments)
            </h3>
            
            <div className="overflow-x-auto rounded-xl border border-slate-300">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-[11px]">
                    <th className="p-2.5 border-b border-slate-700">N° PV</th>
                    <th className="p-2.5 border-b border-slate-700">Référence Dossier</th>
                    <th className="p-2.5 border-b border-slate-700">Intitulé / Contenu</th>
                    <th className="p-2.5 border-b border-slate-700">Service Origine</th>
                    <th className="p-2.5 border-b border-slate-700">Disposition</th>
                    <th className="p-2.5 border-b border-slate-700">Demandeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((er, idx) => (
                    <tr key={er.id || idx} className="hover:bg-rose-50/50 transition-colors">
                      <td className="p-2.5 font-mono text-[11px] text-rose-900 font-bold">{er.pvNumber || `PV-${idx + 1}`}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-900">{er.reference || '-'}</td>
                      <td className="p-2.5 text-slate-800 font-semibold">{er.intitule || 'Article sans titre'}</td>
                      <td className="p-2.5 text-slate-600">{er.direction || 'Direction'}</td>
                      <td className="p-2.5 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[10px]">
                        {er.finalDisposition || 'DESTRUCTION'}
                      </td>
                      <td className="p-2.5 text-slate-500">{er.submittedBy || er.requestedBy || 'Archiviste'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatures & Seal Section */}
          <div className="pt-6 grid grid-cols-2 gap-8 border-t-2 border-slate-900 text-xs">
            <div className="space-y-6">
              <p className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Visa du Président de la Commission :</p>
              <div className="h-24 border border-dashed border-slate-300 rounded-xl p-3 flex flex-col justify-between text-slate-400 italic text-[11px]">
                <span>Signature & Mentions Légales</span>
                <span className="text-[10px] text-slate-500 font-normal">Destruction Électronique & Physique Agrée</span>
              </div>
            </div>

            <div className="space-y-6">
              <p className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Responsable d'Audit & Validation Finale :</p>
              <div className="h-24 border-2 border-rose-500 bg-rose-50/50 rounded-xl p-3 flex flex-col justify-between text-rose-900 font-bold relative overflow-hidden shadow-inner">
                <div className="flex items-center gap-1.5 text-rose-800">
                  <ShieldCheck size={18} />
                  <span className="text-[11px]">{validatorName}</span>
                </div>
                <div className="text-[10px] text-rose-700 font-mono">
                  VISA DE PURGE DÉFINITIVE DU {formattedDate()}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Notice */}
          <div className="text-center pt-4 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
            Procès-verbal officiel d'élimination des archives — Acte scellé au registre d'audit #{docNumber}
          </div>

        </div>

        {/* Action bar - Hidden in print */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-3 print:hidden">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Fermer
          </Button>
          <Button onClick={handlePrint} className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md">
            <Printer size={14} /> Imprimer / Télécharger PDF
          </Button>
        </div>

      </div>
    </div>
  );
};

