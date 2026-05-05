import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App';
import { Button, Card, Input } from '../UI';
import { FileSignature, Camera, Check, ChevronRight, Clock, User, Mail, Tag, List, Trash2, X, Upload, PencilLine, Archive } from 'lucide-react';
import { SignaturePad } from '../SignaturePad';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toSafeDate } from '../../lib/utils';
import { format } from 'date-fns';
import { api } from '../../lib/api';

export const ArchivistDashboard = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [signatureType, setSignatureType] = useState<'digital' | 'photo'>('digital');
  const [photoSignature, setPhotoSignature] = useState<string | null>(null);
  const [digitalSignature, setDigitalSignature] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.get('/api/requests');
        // Filter pending locally if the API doesn't do it, 
        // though we should probably filter it on the server for security/perf
        setRequests(data.filter((r: any) => r.status === 'pending'));
      } catch (err) {
        console.error("Archivist requests API error:", err);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCapturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoSignature(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSign = async () => {
    if (!selectedRequest || !user) return;
    
    let signatureData = '';
    if (signatureType === 'digital') {
      if (!digitalSignature) {
        alert('Veuillez fournir une signature');
        return;
      }
      signatureData = digitalSignature;
    } else {
      if (!photoSignature) {
        alert('Veuillez télécharger une photo de la signature');
        return;
      }
      signatureData = photoSignature;
    }

    setIsLoading(true);
    try {
      // 1. Update via API
      const signedBy = user.displayName || user.email || 'Archiviste';
      await api.patch(`/api/requests/${selectedRequest.id}`, {
        status: 'signed',
        signatureURL: signatureData,
        signatureType,
        archivistId: user.uid,
        archivistName: signedBy
      });

      // 2. Local verification (PDF generation)
      const pdf = generatePDF(selectedRequest, signatureData);
      const pdfBase64 = pdf.output('datauristring').split(',')[1];

      // 3. Send Email via API
      const requesterEmail = selectedRequest.emailDemandeur || selectedRequest.requesterEmail;
      const adminEmail = 'brahmiiheb2000@gmail.com'; // Admin from request context
      
      const emailContent = `
        <h3>Validation de Demande d'Archives</h3>
        <p>La demande de communication d'archives suivante a été validée et signée :</p>
        <ul>
          <li><strong>Intitulé :</strong> ${selectedRequest.intitule || selectedRequest.title || 'N/A'}</li>
          <li><strong>Demandeur :</strong> ${selectedRequest.nomDemandeur || selectedRequest.requesterName}</li>
          <li><strong>Type :</strong> ${selectedRequest.typeDocument || selectedRequest.documentType}</li>
          <li><strong>Date de signature :</strong> ${format(new Date(), 'dd/MM/yyyy HH:mm')}</li>
        </ul>
        <p>Veuillez trouver ci-joint le bordereau de signature.</p>
      `;

      try {
        const emailRes = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: `${requesterEmail}, ${adminEmail}`,
            subject: `Bordereau de Signature - ${selectedRequest.intitule || selectedRequest.id}`,
            html: emailContent,
            attachments: [
              {
                filename: `bordereau_${selectedRequest.id}.pdf`,
                content: pdfBase64,
                contentType: 'application/pdf'
              }
            ]
          })
        });

        if (!emailRes.ok) {
          const errorData = await emailRes.json();
          console.warn("Email sending failed:", errorData.error);
        }
      } catch (emailErr) {
        console.error("Network error sending email:", emailErr);
      }

      // Download PDF for the archivist too
      pdf.save(`bordereau_${selectedRequest.id}.pdf`);

      setSelectedRequest(null);
      setPhotoSignature(null);
      setDigitalSignature(null);
      
      alert('Demande signée avec succès et bordereau envoyé par email !');
    } catch (err: any) {
      alert('Erreur lors du traitement : ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const generatePDF = (req: any, signature: string) => {
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
    const name = req.nomDemandeur || req.requesterName || "-";
    const typeDoc = req.typeDocument || req.documentType || "-";
    const email = req.emailDemandeur || req.requesterEmail || "-";
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
    const refs = req.references || (req.reference ? [req.reference] : []);
    
    refs.filter(Boolean).forEach((ref: string, index: number) => {
      docsList.push([
        index + 1,
        ref,
        typeDoc,
        dateStr,
        ''
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

    if (signature) {
      try {
        const formatImg = signature.includes('jpeg') || signature.includes('jpg') ? 'JPEG' : 'PNG';
        doc.addImage(signature, formatImg, 20, finalY + 10, 50, 25);
      } catch (e) {
        console.error("Signature image error:", e);
      }
    }
    
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(`Signé par l'archiviste : ${user?.displayName || user?.email}`, 20, finalY + 45);
    doc.text(`ID Transaction: ${req.id}`, 20, finalY + 50);
    
    return doc;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-500 rounded-2xl text-white shadow-lg shadow-green-100">
            <Archive size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              Demandes en attente
            </h1>
            <p className="text-slate-500 text-sm">Traitez et signez les demandes de communication d'archives</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {requests.map(req => (
            <motion.div
              key={req.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card 
                className={`cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 group overflow-hidden border-slate-100 ${selectedRequest?.id === req.id ? 'ring-2 ring-green-500 border-green-200 bg-green-50/30' : ''}`}
                onClick={() => setSelectedRequest(req)}
              >
                <div className="flex flex-col h-full gap-4 relative">
                  <div className="absolute top-0 right-0 p-4">
                    <ChevronRight size={20} className="text-slate-200 group-hover:text-green-500 transition-colors" />
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 px-2.5 py-1 rounded-lg">
                        {req.typeDocument || req.documentType}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-bold text-slate-800 text-lg leading-tight group-hover:text-green-700 transition-colors">
                        {req.intitule || req.title || 'Demande sans titre'}
                      </h3>
                      <p className="text-sm text-slate-500 flex items-center gap-2">
                        <User size={14} />
                        {req.nomDemandeur || req.requesterName}
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                       <div className="flex items-center gap-2">
                         <div className="p-2 bg-white rounded-lg border border-slate-100 text-slate-400">
                           <List size={16} />
                         </div>
                         <span className="text-xs font-bold text-slate-600">{(req.references?.length || req.references?.split(',').length || 1)} Références</span>
                       </div>
                       {req.boite && (
                         <div className="text-right">
                           <span className="text-[10px] uppercase font-bold text-slate-400 block">Boîte</span>
                           <span className="text-sm font-bold text-slate-700">{req.boite}</span>
                         </div>
                       )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-50 pt-3 mt-auto">
                    <div className="flex items-center gap-1.5 text-slate-400">
                       <Clock size={14} />
                       <span className="text-[11px] font-medium">
                         {toSafeDate(req.createdAt) ? format(toSafeDate(req.createdAt)!, 'dd MMM, HH:mm') : '...'}
                       </span>
                    </div>
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded uppercase tracking-wider">En attente</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {requests.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-32 bg-white rounded-3xl border-2 border-dashed border-slate-100">
            <div className="p-6 bg-slate-50 rounded-full text-slate-300 mb-6 group-hover:scale-110 transition-transform">
               <Check size={64} strokeWidth={1} />
            </div>
            <h3 className="font-bold text-slate-400 text-lg">Toutes les demandes ont été traitées</h3>
            <p className="text-slate-400 text-sm">Revenez plus tard pour de nouveaux dossiers</p>
          </div>
        )}
      </div>

      {/* Signature Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-50 text-green-600 rounded-xl">
                    <FileSignature size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Validation de la demande</h2>
                    <p className="text-sm text-slate-500">Signez pour clôturer le dossier archive</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setSelectedRequest(null); setPhotoSignature(null); }} 
                  className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                {/* Details Side */}
                <div className="lg:col-span-5 p-6 border-r border-slate-100 bg-slate-50/50 overflow-y-auto custom-scrollbar">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Informations Générales</h4>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                           <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Demandeur</p>
                           <p className="font-bold text-slate-800">{selectedRequest.nomDemandeur || selectedRequest.requesterName}</p>
                           <p className="text-xs text-slate-500">{selectedRequest.emailDemandeur || selectedRequest.requesterEmail || 'Pas d\'email fourni'}</p>
                        </div>
                        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                           <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Détails Document</p>
                           <p className="font-bold text-slate-800 leading-snug">{selectedRequest.intitule || selectedRequest.title || 'Archive Communication'}</p>
                           <p className="text-xs text-slate-500 mt-1">{selectedRequest.typeDocument || selectedRequest.documentType}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Liste des Références</h4>
                         <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">{(selectedRequest.references?.length || 1)} TOTAL</span>
                      </div>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedRequest.references?.map((r: string, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                            <div className="w-6 h-6 bg-slate-50 rounded flex items-center justify-center text-[10px] font-bold text-slate-400">{i+1}</div>
                            <span className="text-sm font-bold text-slate-700">{r}</span>
                          </div>
                        ))}
                        {(!selectedRequest.references || selectedRequest.references.length === 0) && (
                          <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                             <span className="text-sm font-bold text-slate-700">{selectedRequest.reference || 'Aucune référence'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signature Side */}
                <div className="lg:col-span-7 p-6 overflow-y-auto custom-scrollbar">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Méthode de Signature</h4>
                      <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-2xl">
                        <button
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${signatureType === 'digital' ? 'bg-white shadow-md text-slate-800' : 'text-slate-400'}`}
                          onClick={() => setSignatureType('digital')}
                        >
                          <PencilLine size={18} /> Dessiner
                        </button>
                        <button
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${signatureType === 'photo' ? 'bg-white shadow-md text-slate-800' : 'text-slate-400'}`}
                          onClick={() => setSignatureType('photo')}
                        >
                          <Upload size={18} /> Photo / Upload
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Espace Signature</h4>
                      <div className="border-2 border-dashed border-slate-200 rounded-3xl overflow-hidden bg-slate-50 relative min-h-[300px] flex items-center justify-center group">
                        {signatureType === 'digital' ? (
                          <div className="w-full h-full bg-white relative">
                            <SignaturePad 
                              onSave={(data) => setDigitalSignature(data)}
                              onClear={() => setDigitalSignature(null)}
                            />
                            <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none opacity-20">
                               <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Signature au doigt / souris</p>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8">
                            {photoSignature ? (
                              <div className="relative w-full max-w-sm">
                                <img src={photoSignature} alt="Signature capturée" className="max-h-[220px] mx-auto rounded-2xl shadow-xl border-4 border-white" />
                                <button 
                                  onClick={() => setPhotoSignature(null)}
                                  className="absolute -top-3 -right-3 bg-red-500 text-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="text-center space-y-4">
                                <div className="p-6 bg-white rounded-3xl shadow-xl text-green-500 mx-auto w-24 h-24 flex items-center justify-center">
                                    <Camera size={40} />
                                </div>
                                <div className="space-y-2">
                                  <p className="text-slate-800 font-bold">Capture de signature</p>
                                  <p className="text-xs text-slate-500 max-w-[200px] mx-auto">Prenez une photo de la signature papier ou téléchargez un fichier</p>
                                </div>
                                <Button 
                                  variant="secondary" 
                                  className="rounded-xl border-slate-200 bg-white shadow-sm font-bold text-slate-700 px-8"
                                  onClick={() => fileInputRef.current?.click()}
                                >
                                  Choisir un fichier
                                </Button>
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  ref={fileInputRef}
                                  onChange={handleCapturePhoto}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                <Button 
                   variant="secondary" 
                   className="flex-1 rounded-xl h-14 bg-white border-slate-200 text-slate-600 font-bold"
                   onClick={() => { setSelectedRequest(null); setPhotoSignature(null); }}
                >
                  Annuler
                </Button>
                <Button 
                   className="flex-[2] h-14 bg-[#005e35] hover:bg-[#004d2c] rounded-xl text-lg font-extrabold shadow-lg shadow-green-100" 
                   isLoading={isLoading} 
                   onClick={handleSign}
                >
                  Confirmer & Valider
                  <Check className="ml-3" size={24} strokeWidth={3} />
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
