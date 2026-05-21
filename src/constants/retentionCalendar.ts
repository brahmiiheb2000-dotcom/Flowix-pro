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
    name: "Direction Commune",
    code: "COM-COMMUNE",
    rules: [
      { reference: "D.C. 01", title: "PV de réunion générale", active: "5", semiActive: "10", finalDisposition: "CP", support: "Papier", trigger: "Signature" }
    ]
  },
  {
    name: "Direction Equipements et Affaires Immobilières",
    code: "EQ-IMM",
    rules: [
      { reference: "E.A.I. 01", title: "Dossier d'acquisition immobilière", active: "10", semiActive: "20", finalDisposition: "CP", support: "Papier", trigger: "Achat" }
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
    name: "Direction Commerciale",
    code: "COM",
    rules: [
      { reference: "COM 01", title: "Remboursement de prime", active: "2", semiActive: "1", finalDisposition: "EL", support: "Hybride", trigger: "Clôture du contrat" },
      { reference: "COM 03", title: "Traités de nomination des agents généraux", active: "5", semiActive: "15", finalDisposition: "CP", support: "Papier", trigger: "Tant que le traité est en vigueur" },
      { reference: "COM 10", title: "Attestation de non sinistralité", active: "2", semiActive: "2", finalDisposition: "EL", support: "Papier", trigger: "Délivrance" },
    ]
  },
  {
    name: "Direction Audit Interne et Organisation",
    code: "AIO",
    rules: [
      { reference: "A.I.O. 01", title: "Mission d'audit", active: "5", semiActive: "15", finalDisposition: "ECH", support: "Hybride", trigger: "Fermeture du dossier" },
      { reference: "A.I.O. 02", title: "Suivi de mission d'audit", active: "5", semiActive: "15", finalDisposition: "ECH", support: "Hybride", trigger: "Fermeture du dossier" },
      { reference: "A.I.O. 11", title: "Manuel de procédures", active: "5", semiActive: "10", finalDisposition: "CP", support: "Papier", trigger: "Tant qu'utile" },
      { reference: "A.I.O. 13", title: "Organigramme", active: "5", semiActive: "10", finalDisposition: "CP", support: "Papier", trigger: "Tant qu'utile" },
    ]
  },
  {
    name: "Direction Régionale : Succursale",
    code: "REG-SUCC",
    rules: [
      { reference: "Succ. 01", title: "Contrat d'assurance/Avenant", active: "5", semiActive: "10", finalDisposition: "CP", support: "Hybride", trigger: "Tant que le contrat est en vigueur" }
    ]
  },
  {
    name: "Direction Technique",
    code: "TECH",
    rules: [
      { reference: "T. 01", title: "Contrats d'assurance (non vie)", active: "5", semiActive: "10", finalDisposition: "EL", support: "Hybride", trigger: "Tant que le contrat est en vigueur" },
      { reference: "T. 06", title: "Dossier Remboursement : Maladie", active: "3", semiActive: "3", finalDisposition: "EL", support: "Papier", trigger: "Tant que le contrat est en vigueur" },
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
      { reference: "S.I. 01", title: "Appel d'offres", active: "3", semiActive: "5", finalDisposition: "CP", support: "Hybride", trigger: "Un an après l'échéance de la garantie" },
      { reference: "S.I. 02", title: "Contrat de maintenance", active: "5", semiActive: "10", finalDisposition: "CP", support: "Papier", trigger: "Tant que le contrat est en vigueur" },
    ]
  },
  {
    name: "Direction Inspection et Recouvrement",
    code: "INSP-REC",
    rules: [
      { reference: "I.R. 01", title: "Rapport d'inspection périodique", active: "5", semiActive: "10", finalDisposition: "EL", support: "Papier", trigger: "Fin de contrôle" }
    ]
  },
  {
    name: "Direction Juridique",
    code: "JUR",
    rules: [
      { reference: "J. 01", title: "Contentieux général", active: "5", semiActive: "20", finalDisposition: "EL", support: "Hybride", trigger: "1 an après la clôture définitive" },
      { reference: "J. 05", title: "Contentieux du Patrimoine Immobilier", active: "5", semiActive: "20", finalDisposition: "CP", support: "Papier", trigger: "1 an après exécution du jugement" },
    ]
  },
  {
    name: "Direction Régionale",
    code: "REG",
    rules: [
      { reference: "D.R. 01", title: "Dossier de coordination agence", active: "5", semiActive: "10", finalDisposition: "EL", support: "Papier", trigger: "Rapport" }
    ]
  },
  {
    name: "Direction Ressources Humaines",
    code: "RH",
    rules: [
      { reference: "R.H. 01", title: "Dossier administratif du personnel", active: "5", semiActive: "30", finalDisposition: "CP", support: "Papier", trigger: "Jusqu'au départ définitif" },
      { reference: "R.H. 04", title: "Paie brute mensuelle", active: "5", semiActive: "5", finalDisposition: "EL", support: "Hybride", trigger: "Un an après le départ définitif" },
    ]
  },
  {
    name: "Direction Sinistres",
    code: "SIN",
    rules: [
      { reference: "S. 01", title: "Dossier sinistre automobile corporel", active: "10", semiActive: "15", finalDisposition: "CP", support: "Hybride", trigger: "Date de règlement" },
      { reference: "S. 02", title: "Dossier sinistre automobile matériel", active: "5", semiActive: "5", finalDisposition: "EL", support: "Hybride", trigger: "Date de règlement" }
    ]
  },
  {
    name: "Commissaire aux comptes",
    code: "CAC",
    rules: [
      { reference: "C.A.C. 01", title: "Rapport général d'audit légal", active: "10", semiActive: "10", finalDisposition: "CP", support: "Papier", trigger: "Dépôt légal" }
    ]
  }
];
