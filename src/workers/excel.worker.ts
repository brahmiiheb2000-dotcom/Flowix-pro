
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
    
    const folders = [];
    for (let i = 0; i < jsonData.length; i++) {
      const item = jsonData[i];
      const keys = Object.keys(item);
      
      // Better Reference detection
      const refKey = keys.find(k => /ref|dossier|id/i.test(k)) || keys[0];
      const reference = String(item[refKey] || '').trim();
      
      // Better Date detection
      const dateKey = keys.find(k => /cloture|clôture|date|fin/i.test(k));
      let dateCloture = '';
      if (dateKey && item[dateKey]) {
        const val = item[dateKey];
        if (val instanceof Date) {
          dateCloture = val.toLocaleDateString('fr-FR');
        } else if (typeof val === 'number') {
          // Excel serial date
          const d = XLSX.utils.format_cell({ v: val, t: 'd' });
          dateCloture = d || String(val);
        } else {
          dateCloture = String(val);
        }
      }
      
      if (reference && reference.length > 1) {
        folders.push({
          reference: reference.toUpperCase(),
          dateCloture: dateCloture.trim(),
          status: 'pending'
        });
      }
    }
    
    self.postMessage({ success: true, folders });
  } catch (error) {
    console.error("Worker error:", error);
    self.postMessage({ success: false, error: String(error) });
  }
};
