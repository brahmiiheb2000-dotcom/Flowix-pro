
import * as XLSX from 'xlsx';

self.onmessage = async (e: MessageEvent) => {
  const { file } = e.data;
  
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: false, cellText: false });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Use a more efficient way to get JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 0, defval: '' }) as any[];
    
    if (jsonData.length === 0) {
      self.postMessage({ success: false, error: "Le fichier Excel est vide." });
      return;
    }

    const firstItem = jsonData[0];
    const keys = Object.keys(firstItem);

    // Identify mandatory columns based on the requested structure
    const intituleKey = keys.find(k => /intitul[eé]/i.test(k));
    const dateDebutKey = keys.find(k => /d[eé]but/i.test(k));
    const dateFinKey = keys.find(k => /fin|cloture|clôture/i.test(k));
    const boiteKey = keys.find(k => /boit[eé]/i.test(k));
    const localisationKey = keys.find(k => /localis/i.test(k));
    const sourceKey = keys.find(k => /source/i.test(k));
    const directionKey = keys.find(k => /direct|service/i.test(k));
    const reglesCCKey = keys.find(k => /r[eé]gles?\s*cc|regle\s*cc/i.test(k));

    // Validate that ALL mandatory columns are present or matched by tolerant regexes
    const missing = [];
    if (!intituleKey) missing.push("'intitule'");
    if (!dateDebutKey) missing.push("'date début'");
    if (!dateFinKey) missing.push("'date fin'");
    if (!boiteKey) missing.push("'numéro boite'");
    if (!localisationKey) missing.push("'Localisation'");
    if (!sourceKey) missing.push("'Source'");
    if (!directionKey) missing.push("'Direction'");
    if (!reglesCCKey) missing.push("'Règles CC'");

    if (missing.length > 0) {
      self.postMessage({ 
        success: false, 
        error: `Structure de fichier non conforme. Les colonnes suivantes sont absentes ou mal orthographiées : ${missing.join(', ')}. Veuillez vous assurer que ces 8 en-têtes sont présents.`
      });
      return;
    }

    const folders = [];
    for (let i = 0; i < jsonData.length; i++) {
      const item = jsonData[i];
      
      const getFormattedDate = (key: string | undefined) => {
        if (!key || !item[key]) return '';
        const val = item[key];
        if (val instanceof Date) {
          return val.toLocaleDateString('fr-FR');
        } else if (typeof val === 'number') {
          const d = XLSX.utils.format_cell({ v: val, t: 'd' });
          return d || String(val);
        }
        return String(val).trim();
      };

      const intituleVal = String(item[intituleKey!] || '').trim();
      const dateDebutVal = getFormattedDate(dateDebutKey);
      const dateFinVal = getFormattedDate(dateFinKey);
      const boiteVal = String(item[boiteKey!] || '').trim();
      const localisationVal = String(item[localisationKey!] || '').trim();
      const sourceVal = String(item[sourceKey!] || '').trim();
      const directionVal = String(item[directionKey!] || '').trim();
      const reglesCCVal = String(item[reglesCCKey!] || '').trim();
      
      // Use intitule value as the main unique reference (e.g. 216015597)
      if (intituleVal && intituleVal.length > 0) {
        folders.push({
          reference: intituleVal.toUpperCase(),
          intitule: intituleVal,
          dateDebut: dateDebutVal,
          dateCloture: dateFinVal, // date fin acts as closure date for conservation calculations
          boxNumber: boiteVal,
          localisation: localisationVal,
          source: sourceVal,
          direction: directionVal,
          codeDua: reglesCCVal,
          status: boiteVal ? 'pointed' : 'pending' as const
        });
      }
    }
    
    self.postMessage({ success: true, folders });
  } catch (error) {
    console.error("Worker error:", error);
    self.postMessage({ success: false, error: String(error) });
  }
};
