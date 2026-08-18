import { api } from '../lib/api';

export interface CommunicationInfo {
  ref: string;
  isCommunicated: boolean;
  status: 'Communiqué' | 'Disponible' | 'Retourné';
  borrower?: string;
  dateComm?: string;
  dateRet?: string;
  source?: string;
  lastAction?: string;
}

export async function fetchActiveCommunicationsMap(): Promise<Map<string, CommunicationInfo>> {
  const map = new Map<string, CommunicationInfo>();
  try {
    const data = await api.get('/api/communications/active-map');
    if (data && typeof data === 'object') {
      Object.keys(data).forEach(refKey => {
        map.set(refKey.toUpperCase().trim(), data[refKey]);
      });
    }
  } catch (err) {
    console.warn("Could not fetch active communications map:", err);
  }
  return map;
}

export function parseFolderReferences(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.flatMap(v => parseFolderReferences(v));
  }
  const str = String(val).trim();
  if (!str) return [];
  const [refPart] = str.split(' / ');
  return refPart.split(/[;,]+/).map(s => s.trim()).filter(Boolean);
}

export function normalizeDossierRef(ref: string): string {
  return String(ref || '').trim().toUpperCase();
}
