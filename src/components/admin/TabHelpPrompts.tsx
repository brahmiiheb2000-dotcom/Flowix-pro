import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Inbox, 
  FileSpreadsheet, 
  RotateCcw, 
  Library, 
  Trash2, 
  BarChart3, 
  HelpCircle, 
  CheckCircle, 
  Sparkles, 
  Info, 
  ChevronDown, 
  ChevronUp,
  FileText
} from 'lucide-react';

interface TabHelpPromptsProps {
  activeTab: string;
  interactive?: boolean;
}

export const TabHelpPrompts: React.FC<TabHelpPromptsProps> = ({ activeTab, interactive = false }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedLocalTab, setSelectedLocalTab] = useState<string>(activeTab);

  // Definir les prompts et guides pour chaque onglet
  const promptData: Record<string, {
    title: string;
    description: string;
    icon: React.ReactNode;
    steps: { text: string; subText?: string }[];
    tip: string;
    borderColor: string;
    badgeColor: string;
    iconColor: string;
    quickPrompt: string;
  }> = {
    requests: {
      title: "Gestion des Demandes Reçues (Physiques, Numériques & Transferts)",
      description: "Ce tableau de bord centralise toutes les demandes entrantes émises par les différentes directions de l'entreprise. Vous pouvez y gérer l'accès à distance (demandes de numérisation), les communications physiques et les nouvelles fiches de transfert.",
      icon: <Inbox size={22} />,
      borderColor: "border-indigo-150 bg-indigo-50/30",
      badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-200",
      iconColor: "text-indigo-600",
      quickPrompt: "Gérez instantanément les demandes d'accès d'un clic. Pour les dossiers physiques, utilisez directement les coordonnées de stockage indiquées en face du dossier pour aller le chercher en rayon.",
      steps: [
        { text: "Vérifier le statut", subText: "Regardez les demandes marquées 'En attente' sous les onglets 'Demande à distance', 'Physique' ou 'Transferts'." },
        { text: "Localiser sur l'étagère", subText: "Les coordonnées de stockage précises (Dépôt/Travée/Tablette/Boîte) s'affichent automatiquement sur la fiche pour un archivage ultra-rapide." },
        { text: "Valider ou Refuser", subText: "Cliquez sur 'Valider' pour générer un accord de sortie temporaire ou 'Refuser' en précisant le motif légal." }
      ],
      tip: "Action prioritaire : Traitez d'abord les demandes 'Urgentes' signalées dans la colonne priorité pour garantir des temps de réponse conformes au protocole."
    },
    communication: {
      title: "Gestion de Communication et Prêts Physiques",
      description: "Suivez le cycle de vie légal des dossiers physiques mis en communication. Ce module permet d'associer un dossier à un emprunteur, d'apposer une signature électronique sécurisée et de générer un bordereau officiel d'accompagnement.",
      icon: <FileSpreadsheet size={22} />,
      borderColor: "border-purple-150 bg-purple-50/30",
      badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
      iconColor: "text-purple-600",
      quickPrompt: "Associez les dossiers de l'inventaire à un bénéficiaire officiel, utilisez le Pad Signature pour la décharge, puis téléchargez le bordereau PDF de décharge signé.",
      steps: [
        { text: "Initier le prêt", subText: "Recherchez le dossier de l'inventaire et remplissez l'emprunteur (nom, direction, email)." },
        { text: "Signature Numérique", subText: "Faites signer l'emprunteur directement sur tablette ou écran tactile dans la zone dédiée." },
        { text: "Exporter le Bordereau PDF", subText: "Le document PDF officiel scellé avec la signature électronique est généré instantanément pour servir de preuve formelle." }
      ],
      tip: "Tout dossier sous statut 'En communication' restera bloqué et tracé. Son emprunteur en est responsable jusqu'à son enregistrement dans le sous-onglet 'Réintégration'."
    },
    returns: {
      title: "Réintégration de Dossiers Empruntés",
      description: "Ce module sécurise le retour des boîtes ou dossiers physiques précédemment sortis pour consultation. Il permet de réintégrer logiquement les dossiers dans la base de données et de mettre à jour leur nouvelle localisation.",
      icon: <RotateCcw size={22} />,
      borderColor: "border-amber-150 bg-amber-50/30",
      badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
      iconColor: "text-amber-600",
      quickPrompt: "Recherchez le dossier prêté par référence ou nom d'emprunteur. Cliquez sur 'Réintégrer', confirmez ou ajustez sa localisation physique finale dans l'entrepôt.",
      steps: [
        { text: "Recherche de l'emprunt", subText: "Faites une recherche rapide par nom d'emprunteur ou numéro de référence du dossier." },
        { text: "Vérification physique", subText: "Assurez-vous de l'intégrité physique du dossier retourné." },
        { text: "Valider le retour", subText: "Cliquez sur le bouton de réintégration rapide. Le statut du dossier repassera immédiatement à 'Disponible en rayon'." }
      ],
      tip: "Si le dossier est rangé dans un autre carton ou une autre travée, profitez-en pour réassigner sa localisation lors de la validation afin d'éviter toute perte d'inventaire."
    },
    massInventory: {
      title: "Gestion Complète des Inventaires & Scans des Dossiers",
      description: "La pierre angulaire de votre système. Consultez la totalité des dossiers archivés, effectuez des recherches multicritères multicibles, importez de nouveaux classements Excel et numérisez vos archives physiques sous forme de scans PDF associés.",
      icon: <Library size={22} />,
      borderColor: "border-emerald-150 bg-emerald-50/30",
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
      iconColor: "text-emerald-600",
      quickPrompt: "Visualisez tout l'inventaire. Utilisez le bouton '+ Scan PDF' en bout de ligne pour téléverser le document scanné. Cliquez ensuite sur 'Voir Scan' pour l'afficher instantanément sur le volet droit.",
      steps: [
        { text: "Recherche Intelligente", subText: "Saisissez n'importe quel mot-clé, adhérent, assuré, police ou référence pour filtrer à la volée." },
        { text: "Associer un Scan PDF 🟢 (Très Facile !)", subText: "Cliquez sur le bouton sghira '+ Scan PDF' à côté d'un dossier. Glissez-déposez le document scanné de l'original et validez." },
        { text: "Considérer le Scan d'un Clic 📄", subText: "Une fois le scan téléversé, visualisez-le instantanément aala jnaab (volet latéral haute définition) en cliquant sur le bouton vert 'Voir Scan'." }
      ],
      tip: "Fonctionnalité Phare : L'association des scans PDF permet de numériser progressivement votre fonds documentaire sans interrompre l'exploitation quotidienne des archives."
    },
    elimination: {
      title: "Élimination et Destruction d'Archives",
      description: "Pilotez la fin de vie légale de vos archives. Identifiez automatiquement les documents de l'inventaire ayant dépassé leur Durée d'Utilité Administrative (DUA) pour organiser une campagne d'élimination ou de destruction réglementaire.",
      icon: <Trash2 size={22} />,
      borderColor: "border-rose-150 bg-rose-50/30",
      badgeColor: "bg-rose-100 text-rose-800 border-rose-200",
      iconColor: "text-rose-600",
      quickPrompt: "Consultez les documents dont le délai de garde est échu. Créez des propositions d'élimination groupées et préparez le Procès-Verbal (PV) certifié de destruction.",
      steps: [
        { text: "Analyser l'éligibilité", subText: "Le système calcule les dates de clôture et les règles DUA pour vous lister les dossiers devant être détruits." },
        { text: "Générer la proposition", subText: "Regroupez les dossiers périmés dans un projet de PV d'élimination officiel." },
        { text: "Acter la destruction physique", subText: "Validez la destruction physique par broyage ou incinération en joignant le PV signé pour archivage juridique éternel." }
      ],
      tip: "Rappel Légal : Aucune élimination ne peut être effectuée sans l'aval formel du responsable d'entité et la signature conjointe du Procès-Verbal (PV) de destruction."
    },
    stats: {
      title: "Statistiques et Rapports Analytiques",
      description: "Visualisez la performance opérationnelle et l'utilisation de l'espace de stockage physique. Métriques de consultation, évolution des volumes par direction et taux de remplissage.",
      icon: <BarChart3 size={22} />,
      borderColor: "border-blue-150 bg-blue-50/30",
      badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
      iconColor: "text-blue-600",
      quickPrompt: "Analysez les taux de sollicitation par département, examinez les prévisions de saturation de l'entrepôt et optimisez vos campagnes de transfert d'archives.",
      steps: [
        { text: "Suivi des flux", subText: "Consultez le nombre d'entrées (versements) et de sorties (communications) sur l'année." },
        { text: "Saturation des dépôts", subText: "Visualisez les alertes d'espace restant par dépôt pour anticiper vos besoins fonciers." },
        { text: "Consommation par direction", subText: "Identifiez les directions les plus consommatrices d'espace pour ajuster vos facturations ou quotas internes." }
      ],
      tip: "Ces indicateurs sont mis à jour en temps réel à chaque validation d'entrée ou de sortie logique de notre centre d'archivage."
    },
    communication_suivi: {
      title: "Suivi des Communications",
      description: "Pilotez et contrôlez en temps réel l'ensemble des documents d'archives physiques actuellement sortis des rayons pour consultation ou prêt.",
      icon: <FileSpreadsheet size={22} />,
      borderColor: "border-purple-150 bg-purple-50/30",
      badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
      iconColor: "text-purple-600",
      quickPrompt: "Surveillez activement l'historique des prêts. Repérez immédiatement les dossiers hors rayon depuis trop longtemps grâce aux badges d'alerte, et relancez les emprunteurs d'un simple clic pour sécuriser vos fonds.",
      steps: [
        { text: "Identifier les Prêts Actifs", subText: "Parcourez la liste complète des communications physiques en cours de consultation." },
        { text: "Détecter les Retards", subText: "Le système calcule automatiquement la durée écoulée pour signaler tout dépassement de délai légal." },
        { text: "Relancer l'Emprunteur", subText: "Utilisez le bouton de relance rapide par email pré-rempli pour réclamer la réintégration en rayon." }
      ],
      tip: "Le suivi rigoureux réduit de 95% les pertes de dossiers d'archives au sein des administrations et grandes structures."
    },
    communication_processus: {
      title: "Processus de Communication",
      description: "Le circuit de validation officiel permettant d'autoriser et de tracer chaque mouvement de sortie d'un dossier physique.",
      icon: <Sparkles size={22} />,
      borderColor: "border-indigo-150 bg-indigo-50/30",
      badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-200",
      iconColor: "text-indigo-600",
      quickPrompt: "Gérez de bout en bout le flux d'approbation réglementaire : vérification des droits de l'emprunteur, prise de signature manuscrite dématérialisée, et génération automatique du bordereau PDF de décharge scellé.",
      steps: [
        { text: "Saisie de l'Emprunt", subText: "Enregistrez l'identité, la direction de rattachement et le motif réglementaire de la communication." },
        { text: "Signature Numérique", subText: "Recueillez la signature électronique de décharge directement sur l'écran tactile lors du retrait physique." },
        { text: "Génération du Bordereau", subText: "Téléchargez le Procès-Verbal de prêt au format PDF pour sceller juridiquement la responsabilité du demandeur." }
      ],
      tip: "La signature du bordereau de communication est une obligation légale transférant la garde juridique du document à l'emprunteur."
    },
    inventaire_centralise: {
      title: "Inventaire Centralisé",
      description: "La base de données unifiée hébergeant la totalité des références d'archives physiques et numériques de l'institution.",
      icon: <Library size={22} />,
      borderColor: "border-emerald-150 bg-emerald-50/30",
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
      iconColor: "text-emerald-600",
      quickPrompt: "Administrez le référentiel complet de vos archives. Vous pouvez y exécuter des imports massifs Excel, configurer les délais de conservation et activer la numérisation par scans PDF associés.",
      steps: [
        { text: "Importation Initiale", subText: "Chargez vos fichiers Excel pour verser instantanément des milliers de fiches de dossiers." },
        { text: "Scans PDF Intelligents", subText: "Associez vos documents numérisés d'un clic ou par détection automatique textuelle OCR." },
        { text: "Classification & Boîtage", subText: "Regroupez logiquement les dossiers sous leur code DUA réglementaire et attribuez-leur un numéro de boîte." }
      ],
      tip: "Un inventaire centralisé propre et sans doublons garantit un taux de localisation de 100% lors des demandes urgentes."
    }
  };

  // Sync state if activeTab changes
  React.useEffect(() => {
    if (!interactive) {
      setSelectedLocalTab(activeTab);
    }
  }, [activeTab, interactive]);

  const currentTabToUse = interactive ? selectedLocalTab : activeTab;
  const currentPrompt = promptData[currentTabToUse] || promptData['requests'];

  const guideTabs = [
    { key: 'requests', label: 'Demandes Reçues', icon: <Inbox size={15} /> },
    { key: 'communication', label: 'Communications & Prêts', icon: <FileSpreadsheet size={15} /> },
    { key: 'communication_suivi', label: 'Suivi des Comm.', icon: <FileSpreadsheet size={15} /> },
    { key: 'communication_processus', label: 'Processus Comm.', icon: <Sparkles size={15} /> },
    { key: 'inventaire_centralise', label: 'Inventaire Centralisé', icon: <Library size={15} /> },
    { key: 'massInventory', label: 'Scans & Travaux', icon: <Library size={15} /> },
    { key: 'returns', label: 'Réintégrations', icon: <RotateCcw size={15} /> },
    { key: 'elimination', label: 'Éliminations', icon: <Trash2 size={15} /> },
    { key: 'stats', label: 'Statistiques & Rapports', icon: <BarChart3 size={15} /> },
  ];

  if (!currentPrompt) return null;

  return (
    <div id="admin-tab-help-prompt-wrapper" className="mb-6">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-6 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl shadow-md border border-slate-700/50 cursor-pointer select-none group hover:shadow-lg transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="p-1 px-2.5 rounded-full bg-brand-primary/20 border border-brand-primary/40 text-brand-primary flex items-center gap-1.5 animate-pulse">
            <Sparkles size={14} />
            <span className="text-[10px] font-black tracking-widest uppercase">
              {interactive ? "Centre d'Assistance" : "Assistant Prompt & Guide"}
            </span>
          </div>
          <span className="font-extrabold text-xs tracking-tight text-slate-200 group-hover:text-white uppercase truncate max-w-sm md:max-w-xl">
            {interactive ? "Explorateur de tous les Guides & Prompts" : currentPrompt.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-bold hidden md:inline uppercase">
            {isOpen ? "Masquer le guide" : "Afficher l'assistance"}
          </span>
          {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className={`mt-3 p-6 rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden bg-white`}>
              {/* Decorative subtle background icon */}
              <div className="absolute right-6 top-6 opacity-[0.03] text-slate-900 pointer-events-none">
                {currentPrompt.icon}
              </div>

              <div className="space-y-5">
                {/* Interactive subtabs */}
                {interactive && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Sélectionnez l'onglet ou le processus à explorer :
                    </p>
                    <div className="bg-slate-50 p-2 rounded-2xl border border-slate-150 flex flex-wrap gap-1.5">
                      {guideTabs.map((t) => {
                        const isSelected = selectedLocalTab === t.key;
                        return (
                          <button
                            key={t.key}
                            onClick={() => setSelectedLocalTab(t.key)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                              isSelected 
                                ? 'bg-slate-900 text-white shadow-md' 
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                          >
                            {t.icon}
                            <span>{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Title & Description */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2">
                    <span className={`p-1.5 rounded-xl ${currentPrompt.borderColor} ${currentPrompt.iconColor}`}>
                      {currentPrompt.icon}
                    </span>
                    <h4 className="text-slate-800 font-extrabold text-sm tracking-tight uppercase">
                      Guide d'Exploitation : {currentPrompt.title}
                    </h4>
                  </div>
                  <p className="text-slate-500 text-xs leading-relaxed font-semibold">
                    {currentPrompt.description}
                  </p>
                </div>

                {/* Prompt Directives Box */}
                <div className="p-4 rounded-2xl bg-slate-900/95 text-slate-200 border border-slate-800 relative shadow-inner">
                  <div className="absolute top-3 right-4 px-2.5 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-[9px] text-brand-primary font-black uppercase tracking-wider">
                    Instructions &amp; Prompts Rapides
                  </div>
                  <div className="flex items-start gap-2.5 mt-1">
                    <Sparkles size={16} className="text-brand-primary shrink-0 mt-0.5 animate-bounce" />
                    <div className="space-y-1">
                      <p className="text-xs font-black text-white uppercase tracking-tight">Directives de l'onglet :</p>
                      <p className="text-slate-300 text-xs font-semibold leading-relaxed">
                        {currentPrompt.quickPrompt}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Grid Steps/Actions */}
                <div className="space-y-2.5">
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                    Étapes de traitement recommandées :
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {currentPrompt.steps.map((step, idx) => (
                      <div key={idx} className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex gap-3 relative hover:border-slate-200 transition-colors">
                        <span className="font-black text-xs text-brand-primary bg-brand-primary/10 w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-800 uppercase tracking-tight">{step.text}</p>
                          {step.subText && <p className="text-[10px] text-slate-500 leading-normal font-medium">{step.subText}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expert Corner */}
                <div className="pt-3 border-t border-slate-100 flex items-start gap-2 bg-emerald-50/20 p-3 rounded-2xl border border-emerald-100/30">
                  <Info size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-black text-emerald-800 uppercase tracking-wider">Coin de l'Expert Archiviste :</span>
                    <p className="text-slate-600 text-[11px] leading-relaxed font-semibold">
                      {currentPrompt.tip}
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
