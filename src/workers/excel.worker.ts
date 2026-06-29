
import * as XLSX from 'xlsx';

self.onmessage = async (e: MessageEvent) => {
  const { file } = e.data;
  
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { 
      type: 'array', 
      cellDates: true, 
      cellNF: false, 
      cellText: false,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      dense: true
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Use an efficient way to get JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 0, defval: '' }) as any[];
    
    if (jsonData.length === 0) {
      self.postMessage({ success: false, error: "Le fichier Excel est vide." });
      return;
    }

    const firstItem = jsonData[0];
    const keys = Object.keys(firstItem);

    // Identify optional columns or find best matches
    const intituleKey = keys.find(k => /intitul|ref|num|id|code/i.test(k)) || keys[0];
    const dateDebutKey = keys.find(k => /d[eé]but/i.test(k));
    const dateFinKey = keys.find(k => /fin|cloture|clôture/i.test(k));
    const boiteKey = keys.find(k => /boit[eé]/i.test(k));
    const localisationKey = keys.find(k => /localis|site/i.test(k));
    const sourceKey = keys.find(k => /source/i.test(k));
    const directionKey = keys.find(k => /direct|service/i.test(k));
    const reglesCCKey = keys.find(k => /r[eé]gles?\s*cc|regle\s*cc/i.test(k));

    const getFormattedDate = (item: any, key: string | undefined) => {
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

    const folders = [];
    for (let i = 0; i < jsonData.length; i++) {
      const item = jsonData[i];
      
      const intituleVal = intituleKey ? String(item[intituleKey] || '').trim() : '';
      const dateDebutVal = dateDebutKey ? getFormattedDate(item, dateDebutKey) : '';
      const dateFinVal = dateFinKey ? getFormattedDate(item, dateFinKey) : '';
      const boiteVal = boiteKey ? String(item[boiteKey] || '').trim() : '';
      const localisationVal = localisationKey ? String(item[localisationKey] || '').trim() : '';
      const sourceVal = sourceKey ? String(item[sourceKey] || '').trim() : '';
      const directionVal = directionKey ? String(item[directionKey] || '').trim() : '';
      const reglesCCVal = reglesCCKey ? String(item[reglesCCKey] || '').trim() : '';
      
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

    // Now write to local IndexedDB temp_source_db
    const openRequest = indexedDB.open('temp_source_db', 1);

    openRequest.onupgradeneeded = function(e: any) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('folders')) {
        db.createObjectStore('folders', { keyPath: 'reference' });
      }
    };

    openRequest.onsuccess = function(e: any) {
      const db = e.target.result;
      
      // First, clear existing temporary working inventory
      const clearTx = db.transaction('folders', 'readwrite');
      const clearStore = clearTx.objectStore('folders');
      const clearRequest = clearStore.clear();

      clearRequest.onsuccess = function() {
        // Start bulk inserting in chunks
        const chunkSize = 25000;
        let index = 0;

        function insertNextChunk() {
          if (index >= folders.length) {
            self.postMessage({ success: true, count: folders.length });
            return;
          }

          const end = Math.min(index + chunkSize, folders.length);
          const tx = db.transaction('folders', 'readwrite');
          const store = tx.objectStore('folders');

          for (let k = index; k < end; k++) {
            store.put(folders[k]);
          }

          tx.oncomplete = function() {
            index = end;
            const percentage = Math.round((index / folders.length) * 100);
            self.postMessage({ 
              success: false, 
              progress: index, 
              total: folders.length, 
              msg: `Enregistrement temporaire : ${index.toLocaleString()} / ${folders.length.toLocaleString()} dossiers (${percentage}%) ...` 
            });
            setTimeout(insertNextChunk, 0);
          };

          tx.onerror = function(err: any) {
            console.error("IndexedDB write transaction error:", err);
            self.postMessage({ success: false, error: "Erreur d'écriture dans la base IndexedDB temporaire." });
          };
        }

        insertNextChunk();
      };

      clearRequest.onerror = function(err: any) {
        console.error("IndexedDB clear error:", err);
        self.postMessage({ success: false, error: "Impossible de réinitialiser la base IndexedDB temporaire." });
      };
    };

    openRequest.onerror = function(err: any) {
      console.error("IndexedDB open error:", err);
      self.postMessage({ success: false, error: "Impossible d'accéder à la base IndexedDB temporaire locale." });
    };

  } catch (error) {
    console.error("Worker error:", error);
    self.postMessage({ success: false, error: String(error) });
  }
};

