export interface RetentionRule {
  reference: string;
  title: string;
  active: string;
  semiActive: string;
  finalDisposition: 'EL' | 'ECH' | 'CP' | string;
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
      { reference: "A.I.O. 01", title: "Mission d'audit", active: "5 ans", semiActive: "15 ans", finalDisposition: "ECH" },
      { reference: "A.I.O. 02", title: "Suivi de mission d'audit", active: "5 ans", semiActive: "15 ans", finalDisposition: "ECH" },
      { reference: "A.I.O. 11", title: "Manuel de procédures", active: "(1)", semiActive: "10 ans", finalDisposition: "CP", observations: "(1) Tant qu'utile" },
      { reference: "A.I.O. 13", title: "Organigramme", active: "(1)", semiActive: "10 ans", finalDisposition: "CP", observations: "(1) Tant qu'utile" },
    ]
  },
  {
    name: "Direction Commerciale",
    code: "COM",
    rules: [
      { reference: "COM 01", title: "Remboursement de prime", active: "2 ans", semiActive: "1 ans", finalDisposition: "EL", observations: "Tant que le contrat est en vigueur" },
      { reference: "COM 03", title: "Traités de nomination des agents généraux", active: "(1)", semiActive: "--", finalDisposition: "CP", observations: "(1) Tant que le traité est en vigueur" },
      { reference: "COM 10", title: "Attestation de non sinistralité", active: "2 ans", semiActive: "2 ans", finalDisposition: "EL" },
      { reference: "Succ. 01", title: "Contrat d'assurance/Avenant", active: "X", semiActive: "10 ans", finalDisposition: "CP", observations: "Tant que le contrat est en vigueur" },
    ]
  },
  {
    name: "Direction Comptabilité",
    code: "COMPTA",
    rules: [
      { reference: "C. 01", title: "Journal de caisse des agences et des agents généraux", active: "2 ans", semiActive: "8 ans", finalDisposition: "EL" },
      { reference: "C. 08", title: "Approvisionnement", active: "3 ans", semiActive: "9 ans", finalDisposition: "EL" },
      { reference: "C. 13", title: "Déclaration Fiscale", active: "5 ans", semiActive: "10 ans", finalDisposition: "EL" },
      { reference: "C. 14", title: "Paie", active: "5 ans", semiActive: "7 ans", finalDisposition: "EL" },
    ]
  },
  {
    name: "Direction Contrôle de la Conformité",
    code: "CONF",
    rules: [
      { reference: "C.C 01", title: "Rapport hebdomadaire 'RAIS QYC'", active: "3 ans", semiActive: "5 ans", finalDisposition: "EL" },
      { reference: "C.C 05", title: "Dossier des PV du conseil d'administration", active: "10 ans", semiActive: "20 ans", finalDisposition: "CP" },
    ]
  },
  {
    name: "Direction Financière",
    code: "FIN",
    rules: [
      { reference: "P.F. 01", title: "Consultation pour placement", active: "3 ans", semiActive: "7 ans", finalDisposition: "EL" },
      { reference: "G.F. 01", title: "Règlement sinistre matériels", active: "2 ans", semiActive: "3 ans", finalDisposition: "EL" },
      { reference: "C.F. 01", title: "Budget prévisionnel", active: "2 ans", semiActive: "8 ans", finalDisposition: "EL" },
    ]
  },
  {
    name: "Direction Informatique",
    code: "IT",
    rules: [
      { reference: "S.I. 01", title: "Appel d'offres", active: "(1)", semiActive: "5 ans", finalDisposition: "CP", observations: "(1) Un an après l'échéance de la garantie" },
      { reference: "S.I. 02", title: "Contrat de maintenance", active: "(1)", semiActive: "10 ans", finalDisposition: "CP", observations: "(1) Tant que le contrat est en vigueur" },
    ]
  },
  {
    name: "Direction Juridique",
    code: "JUR",
    rules: [
      { reference: "J. 01", title: "Contentieux général", active: "(1)", semiActive: "20 ans", finalDisposition: "EL", observations: "(1) 1 an après la clôture définitive" },
      { reference: "J. 05", title: "Contentieux du Patrimoine Immobilier", active: "(1)", semiActive: "20 ans", finalDisposition: "CP", observations: "(1) 1 an après exécution du jugement" },
    ]
  },
  {
    name: "Direction Ressources Humaines",
    code: "RH",
    rules: [
      { reference: "R.H. 01", title: "Dossier administratif du personnel", active: "(1)", semiActive: "(2)", finalDisposition: "CP", observations: "(1) Jusqu'au départ définitif, (2) 15 ans après retraite" },
      { reference: "R.H. 04", title: "Paie", active: "(1)", semiActive: "5 ans", finalDisposition: "EL", observations: "(1) Un an après le départ définitif" },
    ]
  },
  {
    name: "Direction Technique",
    code: "TECH",
    rules: [
      { reference: "T. 01", title: "Contrats d'assurance (non vie)", active: "X", semiActive: "10 ans", finalDisposition: "EL", observations: "Tant que le contrat est en vigueur" },
      { reference: "T. 06", title: "Dossier Remboursement : Maladie", active: "(1)", semiActive: "3 ans", finalDisposition: "EL", observations: "(1) Tant que le contrat est en vigueur" },
    ]
  },
  {
    name: "Direction Inspection et Recouvrement",
    code: "INSP",
    rules: [
      { reference: "I. 01", title: "Inspection", active: "(1)", semiActive: "10 ans", finalDisposition: "EL", observations: "(1) Tant que les recommandations nécessitent suivi" },
      { reference: "R. 02", title: "Contentieux", active: "(1)", semiActive: "10 ans", finalDisposition: "EL", observations: "(1) 2 ans après règlement définitif" },
    ]
  },
  {
    name: "Direction Régionale",
    code: "REG",
    rules: [
      { reference: "D.R. 01", title: "Attestation d'assurances", active: "2 ans", semiActive: "8 ans", finalDisposition: "EL" },
      { reference: "D.R. 02", title: "Sinistre Auto", active: "X", semiActive: "5 ans", finalDisposition: "EL" },
    ]
  },
  {
    name: "Direction Sinistre Matériels",
    code: "SMA",
    rules: [
      { reference: "S.M.A. 01", title: "Sinistres Matériels Automobile", active: "(1)", semiActive: "10 ans", finalDisposition: "EL", observations: "(1) 2 ans après la clôture définitive" },
      { reference: "S.M.A. 02", title: "Recours Directe (RC) avec la Compagnie", active: "(1)", semiActive: "10 ans", finalDisposition: "EL", observations: "(1) 2 ans après la clôture définitive" },
    ]
  },
  {
    name: "Direction Sinistre Corporel",
    code: "SCA",
    rules: [
      { reference: "S.C.A. 01", title: "Sinistres Corporels", active: "(1)", semiActive: "20 ans", finalDisposition: "EL", observations: "(1) Jusqu'à la clôture définitive" },
      { reference: "S.C.A. 02", title: "Rente", active: "(1)", semiActive: "20 ans", finalDisposition: "EL", observations: "(1) Tant que le bénéficiaire répond aux conditions" },
    ]
  }
];
