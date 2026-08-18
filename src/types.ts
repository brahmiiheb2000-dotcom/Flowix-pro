
export interface Folder {
  reference: string;
  boxNumber?: string;
  status: 'pointed' | 'verified' | 'pending';
  pointedAt?: string;
  verifiedAt?: string;
  isManual?: boolean;
  year?: string;
  docCode?: string;
  retentionYears?: number;
  metadata?: any;
  dateCloture?: string;
  ruleId?: number | string;
  direction?: string;
  intitule?: string;
  dateDebut?: string;
  localisation?: string;
  source?: string;
  codeDua?: string;
  category?: string;
  expiryDate?: string;
  archivalStatus?: string;
  isCommunicated?: boolean;
  communicationStatus?: string;
  communicationBorrower?: string;
  communicationDate?: string;
}

export interface Box {
  id: string;
  number: string;
  title: string;
  isOpen: boolean;
  depot: string;
  travee: string;
  tablette: string;
  observations?: string;
  direction?: string;
  clotureText?: string;
  clotureDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManualEntry {
  id: string;
  boxNumber: string;
  title: string;
  dateStart: string;
  dateEnd: string;
  localisation: string;
  observations?: string;
  createdAt: string;
}

export interface InventoryItem extends ManualEntry {
  // Can be extended if needed
}

export type Tab = 'pointage' | 'boites' | 'inventaire' | 'import' | 'localisation';
