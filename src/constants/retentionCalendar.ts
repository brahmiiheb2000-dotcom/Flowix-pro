export interface RetentionRule {
  reference: string;
  title: string;
  docType?: string;
  active: string;
  semiActive: string;
  finalDisposition: 'EL' | 'ECH' | 'CP' | string;
  support?: string;
  trigger?: string;
  observations?: string;
}

export interface DirectionRetention {
  name: string;
  code: string;
  rules: RetentionRule[];
}

export const RETENTION_CALENDAR: DirectionRetention[] = [
  {
    name: "Direction Audit Interne et Organisation",
    code: "AIO",
    rules: [
      { reference: "A.I.O. 01", title: "Mission d'audit", active: "5", semiActive: "15", finalDisposition: "ECH", support: "Hybride", trigger: "Fermeture du dossier" },
      { reference: "A.I.O. 02", title: "Suivi de mission d'audit", active: "5", semiActive: "15", finalDisposition: "ECH", support: "Hybride", trigger: "Fermeture du dossier" },
      { reference: "A.I.O. 11", title: "Manuel de procédures", active: "(1)", semiActive: "10", finalDisposition: "CP", support: "Papier", trigger: "(1) Tant qu'utile" },
      { reference: "A.I.O. 13", title: "Organigramme", active: "(1)", semiActive: "10", finalDisposition: "CP", support: "Papier", trigger: "(1) Tant qu'utile" },
    ]
  },
  {
    name: "Direction Commerciale",
    code: "COM",
    rules: [
      { reference: "COM 01", title: "Remboursement de prime", active: "2", semiActive: "1", finalDisposition: "EL", support: "Hybride", trigger: "Clôture du contrat" },
      { reference: "COM 03", title: "Traités de nomination des agents généraux", active: "(1)", semiActive: "--", finalDisposition: "CP", support: "Papier", trigger: "(1) Tant que le traité est en vigueur" },
      { reference: "COM 10", title: "Attestation de non sinistralité", active: "2", semiActive: "2", finalDisposition: "EL", support: "Papier", trigger: "Délivrance" },
      { reference: "Succ. 01", title: "Contrat d'assurance/Avenant", active: "X", semiActive: "10", finalDisposition: "CP", support: "Hybride", trigger: "Tant que le contrat est en vigueur" },
    ]
  },
  {
    name: "Direction Comptabilité",
    code: "COMPTA",
    rules: [
      { reference: "C. 01", title: "Journal de caisse des agences", active: "2", semiActive: "8", finalDisposition: "EL", support: "Papier", trigger: "Clôture de l'exercice" },
      { reference: "C. 08", title: "Approvisionnement", active: "3", semiActive: "9", finalDisposition: "EL", support: "Papier", trigger: "Clôture de l'exercice" },
      { reference: "C. 13", title: "Déclaration Fiscale", active: "5", semiActive: "10", finalDisposition: "EL", support: "Papier", trigger: "Année de déclaration" },
      { reference: "C. 14", title: "Paie", active: "5", semiActive: "7", finalDisposition: "EL", support: "Papier", trigger: "Fin d'année" },
    ]
  },
  {
    name: "Direction Contrôle de la Conformité",
    code: "CONF",
    rules: [
      { reference: "C.C 01", title: "Rapport hebdomadaire 'RAIS QYC'", active: "3", semiActive: "5", finalDisposition: "EL", support: "Numérique", trigger: "Production" },
      { reference: "C.C 05", title: "Dossier des PV du conseil d'administration", active: "10", semiActive: "20", finalDisposition: "CP", support: "Papier", trigger: "Date du PV" },
    ]
  },
  {
    name: "Direction Financière",
    code: "FIN",
    rules: [
      { reference: "P.F. 01", title: "Consultation pour placement", active: "3", semiActive: "7", finalDisposition: "EL", support: "Hybride", trigger: "Clôture de l'opération" },
      { reference: "G.F. 01", title: "Règlement sinistre matériels", active: "2", semiActive: "3", finalDisposition: "EL", support: "Hybride", trigger: "Paiement" },
      { reference: "C.F. 01", title: "Budget prévisionnel", active: "2", semiActive: "8", finalDisposition: "EL", support: "Papier", trigger: "Exercice concerné" },
    ]
  },
  {
    name: "Direction Informatique",
    code: "IT",
    rules: [
      { reference: "S.I. 01", title: "Appel d'offres", active: "(1)", semiActive: "5", finalDisposition: "CP", support: "Hybride", trigger: "(1) Un an après l'échéance de la garantie" },
      { reference: "S.I. 02", title: "Contrat de maintenance", active: "(1)", semiActive: "10", finalDisposition: "CP", support: "Papier", trigger: "(1) Tant que le contrat est en vigueur" },
    ]
  },
  {
    name: "Direction Juridique",
    code: "JUR",
    rules: [
      { reference: "J. 01", title: "Contentieux général", active: "(1)", semiActive: "20", finalDisposition: "EL", support: "Hybride", trigger: "(1) 1 an après la clôture définitive" },
      { reference: "J. 05", title: "Contentieux du Patrimoine Immobilier", active: "(1)", semiActive: "20", finalDisposition: "CP", support: "Papier", trigger: "(1) 1 an après exécution du jugement" },
    ]
  },
  {
    name: "Direction Ressources Humaines",
    code: "RH",
    rules: [
      { reference: "R.H. 01", title: "Dossier administratif du personnel", active: "(1)", semiActive: "(2)", finalDisposition: "CP", support: "Papier", trigger: "(1) Jusqu'au départ définitif" },
      { reference: "R.H. 04", title: "Paie", active: "(1)", semiActive: "5", finalDisposition: "EL", support: "Hybride", trigger: "(1) Un an après le départ définitif" },
    ]
  },
  {
    name: "Direction Technique",
    code: "TECH",
    rules: [
      { reference: "T. 01", title: "Contrats d'assurance (non vie)", active: "X", semiActive: "10", finalDisposition: "EL", support: "Hybride", trigger: "Tant que le contrat est en vigueur" },
      { reference: "T. 06", title: "Dossier Remboursement : Maladie", active: "(1)", semiActive: "3", finalDisposition: "EL", support: "Papier", trigger: "(1) Tant que le contrat est en vigueur" },
    ]
  }
];
