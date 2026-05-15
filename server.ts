import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import Database from 'better-sqlite3';
import multer from "multer";
import crypto from "node:crypto";

// SQLite Large Data Storage
console.log("SERVER: Starting initialization...");
const DB_PATH = path.resolve(process.cwd(), 'data', 'mass_inventory.db');
console.log("SERVER: Opening database at", DB_PATH);
const db = new Database(DB_PATH);
console.log("SERVER: Database opened.");

// Initialize SQLite Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS mass_inventory (
    id TEXT PRIMARY KEY,
    reference TEXT,
    intitule TEXT,
    direction TEXT,
    numBoite TEXT,
    localisation TEXT,
    dateDebut TEXT,
    dateFin TEXT,
    dossier TEXT,
    codeAgence TEXT,
    sin TEXT,
    police TEXT,
    adherant TEXT,
    dateDeclaration TEXT,
    typeSinistre TEXT,
    dateCloture TEXT,
    etatSinistre TEXT,
    paquet TEXT,
    ruleId TEXT,
    expiryDate TEXT,
    archivalStatus TEXT, -- 'Active', 'SemiActive', 'Expired'
    rawData TEXT,
    createdAt TEXT
  );
`);

// Migration: Add new columns if missing
const newCols = [
  'dossier', 'codeAgence', 'sin', 'police', 'adherant', 
  'dateDeclaration', 'typeSinistre', 'dateCloture', 
  'etatSinistre', 'paquet', 'ruleId', 'expiryDate', 'archivalStatus', 'rawData',
  'isEliminated'
];
newCols.forEach(col => {
  try {
    db.exec(`ALTER TABLE mass_inventory ADD COLUMN ${col} TEXT`);
  } catch (e) {
    // Column already exists
  }
});

db.exec(`
  CREATE TABLE IF NOT EXISTS archival_directory (
    id TEXT PRIMARY KEY,
    reference TEXT,
    title TEXT,
    direction TEXT,
    docType TEXT,
    activeYears INTEGER,
    semiActiveYears INTEGER,
    finalDisposition TEXT, -- 'EL', 'CP', 'ECH'
    support TEXT, -- 'Papier', 'Numérique', 'Hybride'
    retentionTrigger TEXT,
    isCritical INTEGER DEFAULT 0, -- 0 for false, 1 for true
    category TEXT,
    createdAt TEXT
  );
  CREATE TABLE IF NOT EXISTS elimination_steps (
    id TEXT PRIMARY KEY,
    requestId TEXT,
    step TEXT, -- 'Proposition', 'Verification', 'Validation', 'Final'
    status TEXT, -- 'Pending', 'Completed'
    actor TEXT,
    comment TEXT,
    updatedAt TEXT
  );
`);

// Migration: Add new columns to archival_directory
const archivalCols = ['docType', 'support', 'retentionTrigger', 'isCritical', 'category'];
archivalCols.forEach(col => {
  try {
    if (col === 'isCritical') {
      db.exec(`ALTER TABLE archival_directory ADD COLUMN ${col} INTEGER DEFAULT 0`);
    } else {
      db.exec(`ALTER TABLE archival_directory ADD COLUMN ${col} TEXT`);
    }
  } catch (e) {}
});

db.exec(`
  CREATE TABLE IF NOT EXISTS elimination_requests (
    id TEXT PRIMARY KEY,
    inventoryId TEXT,
    status TEXT, -- 'Pending', 'Approved', 'Rejected', 'Eliminated'
    requestedBy TEXT,
    approvedBy TEXT,
    eliminationDate TEXT,
    certificateFilename TEXT,
    createdAt TEXT
  );
  CREATE TABLE IF NOT EXISTS import_history (
    id TEXT PRIMARY KEY,
    filename TEXT,
    direction TEXT,
    itemsCount INTEGER,
    createdAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_mass_ref ON mass_inventory(reference);
  CREATE INDEX IF NOT EXISTS idx_mass_intitule ON mass_inventory(intitule);
  CREATE INDEX IF NOT EXISTS idx_mass_direction ON mass_inventory(direction);
  CREATE INDEX IF NOT EXISTS idx_mass_expiry ON mass_inventory(expiryDate);
  CREATE INDEX IF NOT EXISTS idx_mass_status ON mass_inventory(archivalStatus);
`);

// Prepared statements for performance
const insertMassItem = db.prepare(`
  INSERT INTO mass_inventory (
    id, reference, intitule, direction, numBoite, localisation, dateDebut, dateFin,
    dossier, codeAgence, sin, police, adherant, dateDeclaration, typeSinistre, dateCloture, etatSinistre, paquet,
    ruleId, expiryDate, archivalStatus, rawData,
    createdAt
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertImportHistory = db.prepare(`
  INSERT INTO import_history (id, filename, direction, itemsCount, createdAt)
  VALUES (?, ?, ?, ?, ?)
`);

const searchMassInventory = db.prepare(`
  SELECT * FROM mass_inventory 
  WHERE (reference LIKE ? OR intitule LIKE ? OR numBoite LIKE ? OR localisation LIKE ?)
  AND (direction = ? OR ? = 'all')
  LIMIT 50
`);

const countMassInventory = db.prepare(`SELECT COUNT(*) as count FROM mass_inventory`);

// --- Archival Engine Helpers ---
const getAllRules = () => db.prepare("SELECT * FROM archival_directory").all() as any[];

const calculateArchivalStatus = (item: any, rules: any[], overrideRuleIdOrObj?: any | null) => {
  const dateStr = item.dateFin || item.dateCloture || item.date_cloture || item.dateDebut || item.createdAt;
  if (!dateStr) return { ruleId: null, expiryDate: null, status: 'Active' };
  
  // Intelligent matching
  const itemDirection = String(item.direction || '').toLowerCase();
  const itemIntitule = String(item.intitule || item.dossier || '').toLowerCase();
  const itemDocType = String(item.typeSinistre || item.docType || '').toLowerCase();

  // Try to find the best matching rule
  let bestRule = null;
  
  // 0. Manual Override
  if (overrideRuleIdOrObj) {
    const idToFind = typeof overrideRuleIdOrObj === 'object' ? overrideRuleIdOrObj.id : overrideRuleIdOrObj;
    bestRule = rules.find(r => r.id === idToFind);
  }

  // 1. Precise reference match
  if (!bestRule && item.ruleId) {
    bestRule = rules.find(r => r.id === item.ruleId);
  }

  if (!bestRule && item.reference) {
    const ref = String(item.reference).replace(/[\s\.]/g, '').toUpperCase();
    bestRule = rules.find(r => String(r.reference).replace(/[\s\.]/g, '').toUpperCase() === ref);
  }

  // 2. Fuzzy matching by keywords if no reference match
  if (!bestRule) {
    bestRule = rules.find(r => {
      const ruleDir = String(r.direction).toLowerCase();
      const ruleTitle = String(r.title).toLowerCase();
      const ruleDocType = String(r.docType || '').toLowerCase();

      // Check direction match first
      if (itemDirection && !itemDirection.includes(ruleDir) && !ruleDir.includes(itemDirection)) return false;

      // Check keywords
      return itemIntitule.includes(ruleTitle) || ruleTitle.includes(itemIntitule) || 
             (itemDocType && (itemDocType.includes(ruleDocType) || ruleDocType.includes(itemDocType)));
    });
  }
  
  if (!bestRule) return { ruleId: null, expiryDate: null, status: 'Active' };

  let year = 0;
  if (dateStr.includes('/')) {
    year = parseInt(dateStr.split('/').pop() || '0');
  } else if (dateStr.includes('-')) {
    year = parseInt(dateStr.split('-').shift() || '0');
  } else {
    year = parseInt(dateStr);
  }

  if (isNaN(year) || year === 0) return { ruleId: bestRule.id, expiryDate: null, status: 'Active' };

  const active = bestRule.activeYears || 0;
  const semi = bestRule.semiActiveYears || 0;
  const expiryYear = year + active + semi;
  const currentYear = new Date().getFullYear();
  
  let status = 'Active';
  if (currentYear >= expiryYear) {
    status = 'Expired';
  } else if (currentYear >= (year + active)) {
    status = 'SemiActive';
  }

  return { ruleId: bestRule.id, expiryDate: String(expiryYear), status };
};

// File Storage Setup
const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads', 'mass_inventories');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, UPLOADS_DIR); },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `${timestamp}_${file.originalname}`);
  }
});
const upload = multer({ storage });

// Local JSON Database Helper
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const getFilePath = (collection: string) => path.join(DATA_DIR, `${collection}.json`);

const readData = (collection: string) => {
  const filePath = getFilePath(collection);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return [];
  }
};

const writeData = (collection: string, data: any) => {
  fs.writeFileSync(getFilePath(collection), JSON.stringify(data));
};

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-for-dev";

// Hardcoded users
const USERS = [
  { email: 'agent@flowix.pro', role: 'Agent', displayName: 'Agent MAE' },
  { email: 'archiviste@flowix.pro', role: 'Archivist', displayName: 'Archiviste MAE' },
  { email: 'demandeur@flowix.pro', role: 'Demandeur', displayName: 'Demandeur Distance' },
  { email: 'brahmiiheb2000@gmail.com', role: 'Admin', displayName: 'Administrateur' }
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.use(cookieParser());

  // --- Request Logger ---
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API REQUEST] ${req.method} ${req.url}`);
    }
    next();
  });

  // --- Auth Middleware ---
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.cookies.auth_token;
    if (!token) {
      console.warn("AUTH: No token found in cookies");
      return res.status(401).json({ error: "Non authentifié" });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (err) {
      console.error("AUTH: Token verification failed", err);
      res.status(401).json({ error: "Session invalide" });
    }
  };

  // --- Auth Routes ---
  app.post("/api/login", (req, res) => {
    const { email } = req.body;
    console.log("LOGIN BYPASS ATTEMPT:", { email });
    const user = USERS.find(u => u.email === email) || { 
      email, 
      role: 'Demandeur', 
      displayName: email.split('@')[0] 
    };
    
    console.log("LOGIN BYPASS SUCCESS for:", email);

    const token = jwt.sign({ 
      uid: user.email, 
      email: user.email, 
      role: user.role, 
      displayName: user.displayName 
    }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('auth_token', token, { 
      httpOnly: true, 
      secure: true, // Always secure for HTTPS iframe environment
      sameSite: 'none', // Needed for cross-site iframe context
      maxAge: 7 * 24 * 60 * 60 * 1000 
    });

    res.json({ user: { email: user.email, role: user.role, displayName: user.displayName } });
  });

  app.post("/api/logout", (req, res) => {
    res.clearCookie('auth_token', { sameSite: 'none', secure: true });
    res.json({ success: true });
  });

  app.get("/api/me", (req, res) => {
    const token = req.cookies.auth_token;
    console.log("ME CHECK - Token present:", !!token);
    
    if (!token) {
      // Auto-login as default guest if no token
      const defaultUser = USERS[0]; // Agent by default for demo
      const newToken = jwt.sign({ 
        uid: defaultUser.email, 
        email: defaultUser.email, 
        role: defaultUser.role, 
        displayName: defaultUser.displayName 
      }, JWT_SECRET, { expiresIn: '7d' });

      res.cookie('auth_token', newToken, { 
        httpOnly: true, 
        secure: true, 
        sameSite: 'none', 
        maxAge: 7 * 24 * 60 * 60 * 1000 
      });

      return res.json({ user: defaultUser });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      res.json({ user: decoded });
    } catch (err) {
      res.json({ user: null });
    }
  });

  // --- Data Routes (Local JSON Storage) ---
  
  // Sequential Counter Helper
  const getNextDemandNumber = () => {
    try {
      const year = new Date().getFullYear();
      let counters = readData('counters');
      if (!Array.isArray(counters)) counters = [];
      
      let yearCounter = counters.find((c: any) => c.year === year);
      if (!yearCounter) {
        yearCounter = { year, count: 0 };
        counters.push(yearCounter);
      }
      
      yearCounter.count += 1;
      writeData('counters', counters);
      
      const paddedNum = String(yearCounter.count).padStart(3, '0');
      return `${paddedNum}/${year}`;
    } catch (err) {
      console.error("Counter error:", err);
      return `ERR/${new Date().getFullYear()}`;
    }
  };

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: process.env.NODE_ENV });
  });

  // --- Mass Inventory Management (SQLite Powered) ---
  app.get("/api/mass-inventory/archival-stats", authenticate, (req, res) => {
    try {
      const stats = db.prepare(`
        SELECT archivalStatus as status, COUNT(*) as count 
        FROM mass_inventory 
        GROUP BY archivalStatus
      `).all() as any[];
      
      const result = {
        total: 0,
        active: 0,
        semiActive: 0,
        expired: 0,
        unlinked: 0
      };

      stats.forEach(s => {
        const count = s.count;
        result.total += count;
        if (s.status === 'Active') result.active = count;
        else if (s.status === 'SemiActive') result.semiActive = count;
        else if (s.status === 'Expired') result.expired = count;
        else if (!s.status) result.unlinked = count;
      });

      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/mass-inventory/stats", authenticate, (req, res) => {
    try {
      const row = db.prepare("SELECT COUNT(*) as count FROM mass_inventory").get() as any;
      res.json({ total: row ? row.count : 0 });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/mass-inventory/clear", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      db.prepare("DELETE FROM mass_inventory").run();
      db.prepare("DELETE FROM import_history").run();
      res.json({ success: true });
    } catch (err: any) { 
      console.error("Clear error:", err);
      res.status(500).json({ error: err.message }); 
    }
  });

  app.get("/api/mass-inventory/monitoring", authenticate, (req, res) => {
    try {
      const { status } = req.query;
      const query = status ? "SELECT * FROM mass_inventory WHERE archivalStatus = ? LIMIT 100" : "SELECT * FROM mass_inventory LIMIT 100";
      const results = status ? db.prepare(query).all(status) : db.prepare(query).all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/mass-inventory", authenticate, (req: any, res) => {
    try {
      const searchTerm = req.query.search ? `%${req.query.search}%` : null;
      const direction = req.query.direction || 'all';
      const showEliminated = req.query.showEliminated === 'true';

      const query = `
        SELECT * FROM mass_inventory 
        WHERE (
          ? IS NULL OR
          reference LIKE ? OR 
          intitule LIKE ? OR 
          dossier LIKE ? OR 
          numBoite LIKE ? OR 
          localisation LIKE ? OR 
          sin LIKE ? OR 
          police LIKE ? OR 
          adherant LIKE ?
        )
        AND (direction = ? OR ? = 'all')
        AND (? = 1 OR isEliminated IS NULL OR isEliminated = 0)
        ORDER BY createdAt DESC
        LIMIT 100
      `;

      const results = db.prepare(query).all(
        searchTerm,
        searchTerm, searchTerm, searchTerm, searchTerm, 
        searchTerm, searchTerm, searchTerm, searchTerm,
        direction, direction,
        showEliminated ? 1 : 0
      );
      
      res.json(results || []);
    } catch (err: any) { 
      console.error("Mass search error:", err);
      res.status(500).json({ error: err.message }); 
    }
  });

  app.post("/api/mass-inventory", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const item = req.body;
      const id = crypto.randomUUID();
      const rules = getAllRules();
      const createdAt = new Date().toISOString();
      const archival = calculateArchivalStatus(item, rules, item.ruleId);

      db.prepare(`
        INSERT INTO mass_inventory (
          id, reference, intitule, direction, numBoite, localisation, 
          dateDebut, dateFin, dossier, codeAgence, sin, police, 
          adherant, dateDeclaration, typeSinistre, dateCloture, 
          etatSinistre, paquet, ruleId, expiryDate, archivalStatus, 
          rawData, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, item.reference || '', item.intitule || '', item.direction || '', 
        item.numBoite || '', item.localisation || '', item.dateDebut || '', 
        item.dateFin || '', item.dossier || '', item.codeAgence || '', 
        item.sin || '', item.police || '', item.adherant || '', 
        item.dateDeclaration || '', item.typeSinistre || '', item.dateCloture || '', 
        item.etatSinistre || '', item.paquet || '', archival.ruleId, 
        archival.expiryDate, archival.status, JSON.stringify(item), createdAt
      );

      res.json({ success: true, id });
    } catch (err: any) {
      console.error("Create mass item error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/mass-inventory/import", authenticate, (req: any, res) => {
    const userRole = req.user.role;
    if (userRole !== 'Admin' && userRole !== 'Agent' && userRole !== 'Archivist') {
      return res.status(403).json({ error: "Interdit. Rôles autorisés: Admin, Agent, Archiviste." });
    }
    try {
      const { items, filename, direction, ruleId, isFinalBatch } = req.body;
      const createdAt = new Date().toISOString();
      const rules = getAllRules();
      
      const insertMany = db.transaction((rows) => {
        for (const item of rows) {
          const id = crypto.randomUUID();
          const archival = calculateArchivalStatus(item, rules, ruleId);

          insertMassItem.run(
            id, 
            String(item.reference || ''), 
            String(item.intitule || ''), 
            String(item.direction || ''), 
            String(item.numBoite || ''), 
            String(item.localisation || ''), 
            String(item.dateDebut || ''),
            String(item.dateFin || ''),
            String(item.dossier || ''),
            String(item.codeAgence || ''),
            String(item.sin || ''),
            String(item.police || ''),
            String(item.adherant || ''),
            String(item.dateDeclaration || ''),
            String(item.typeSinistre || ''),
            String(item.dateCloture || ''),
            String(item.etatSinistre || ''),
            String(item.paquet || ''),
            archival.ruleId,
            archival.expiryDate,
            archival.status,
            JSON.stringify(item),
            createdAt
          );
        }
        
        // Log history ONLY on the final batch with the TOTAL count
        if (filename && isFinalBatch) {
          const histId = crypto.randomUUID();
          const totalItemsImported = req.body.totalCount || rows.length;
          insertImportHistory.run(histId, filename, direction || 'Inconnu', totalItemsImported, createdAt);
        }
      });

      insertMany(items);
      res.json({ success: true, count: items.length });
    } catch (err: any) { 
      console.error("Import error:", err);
      res.status(500).json({ error: err.message }); 
    }
  });

  app.get("/api/mass-inventory/history", authenticate, (req, res) => {
    try {
      const history = db.prepare("SELECT * FROM import_history ORDER BY createdAt DESC").all();
      res.json(history);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/mass-inventory/:id/location", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { id } = req.params;
      const { localisation, numBoite } = req.body;
      
      const result = db.prepare("UPDATE mass_inventory SET localisation = ?, numBoite = ? WHERE id = ?").run(localisation, numBoite, id);
      
      if (result.changes === 0) {
        return res.status(404).json({ error: "Élément non trouvé" });
      }
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Update location/box error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  
  app.patch("/api/mass-inventory/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { id } = req.params;
      const updates = req.body;
      delete updates.id;
      delete updates.createdAt;
      
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      
      if (keys.length === 0) return res.json({ success: true });
      
      const setClause = keys.map(k => `${k} = ?`).join(', ');
      const query = `UPDATE mass_inventory SET ${setClause} WHERE id = ?`;
      
      const result = db.prepare(query).run(...values, id);
      
      if (result.changes === 0) {
        return res.status(404).json({ error: "Élément non trouvé" });
      }
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Update mass item error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/mass-inventory/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      db.prepare("DELETE FROM mass_inventory WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/elimination/analyze", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      const rules = getAllRules();
      const allItems = db.prepare("SELECT * FROM mass_inventory WHERE archivalStatus != 'Expired' OR archivalStatus IS NULL").all();
      
      let updatedCount = 0;
      const updateStmt = db.prepare("UPDATE mass_inventory SET archivalStatus = ?, ruleId = ?, expiryDate = ? WHERE id = ?");
      
      db.transaction(() => {
        for (const item of allItems) {
          const archival = calculateArchivalStatus(item, rules);
          if (archival.status !== item.archivalStatus || archival.ruleId !== item.ruleId) {
            updateStmt.run(archival.status, archival.ruleId, archival.expiryDate, item.id);
            updatedCount++;
          }
        }
      })();
      
      res.json({ success: true, updatedCount });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/elimination/propose-bulk", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      const { inventoryIds } = req.body;
      const createdAt = new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO elimination_requests (id, inventoryId, status, requestedBy, createdAt)
        VALUES (?, ?, 'Pending', ?, ?)
      `);
      
      db.transaction(() => {
        for (const invId of inventoryIds) {
          const id = "PROP-" + crypto.randomUUID().toUpperCase();
          insert.run(id, invId, req.user.email, createdAt);
        }
      })();
      
      res.json({ success: true, count: inventoryIds.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/elimination/download-bordereau/:id", authenticate, (req, res) => {
    // This would typically generate a real PDF. For now, we return data for frontend PDF generation.
    res.json({ message: "Utilisez le générateur PDF du frontend." });
  });

  app.get("/api/mass-inventory/download-file/:filename", authenticate, (req: any, res) => {
    const filename = req.params.filename;
    const filePath = path.join(UPLOADS_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Fichier non trouvé sur le stockage sécurisé" });
    }
    
    res.download(filePath, filename.split('_').slice(1).join('_')); // Remove timestamp prefix for user download
  });

  // --- Archival Directory ---
  // Seed initial rules if empty
  try {
    const countRow = db.prepare("SELECT COUNT(*) as count FROM archival_directory").get() as any;
    const count = countRow ? countRow.count : 0;
    if (count === 0) {
      const initialRulesPath = path.join(process.cwd(), 'src/data/initial_rules.json');
      if (fs.existsSync(initialRulesPath)) {
        const initialRules = JSON.parse(fs.readFileSync(initialRulesPath, 'utf8'));
        const insertDir = db.prepare(`
          INSERT INTO archival_directory (id, reference, title, direction, activeYears, semiActiveYears, finalDisposition, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        db.transaction(() => {
          for (const r of initialRules) {
            insertDir.run(crypto.randomUUID(), r.reference, r.title, r.direction, r.activeYears, r.semiActiveYears, r.finalDisposition, new Date().toISOString());
          }
        })();
        console.log("Archival directory seeded with initial rules.");
      }
    }
  } catch (e) {
    console.error("Failed to seed archival directory:", e);
  }

  app.get("/api/archival-directory", authenticate, (req, res) => {
    try {
      const results = db.prepare("SELECT * FROM archival_directory ORDER BY reference ASC").all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/archival-directory/clear", authenticate, (req: any, res) => {
    const role = req.user.role;
    if (role !== 'Admin' && role !== 'Agent' && role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      console.log("CLEARING ARCHIVAL DIRECTORY...");
      db.transaction(() => {
        db.prepare("DELETE FROM archival_directory").run();
        // Also reset any items that were linked to these rules
        db.prepare("UPDATE mass_inventory SET ruleId = NULL, archivalStatus = 'Active'").run();
      })();
      res.json({ success: true, message: "Calendrier vidé et statuts réinitialisés." });
    } catch (err: any) { 
      console.error("Clear archival directory error:", err);
      res.status(500).json({ error: err.message }); 
    }
  });

  app.delete("/api/elimination-requests/clear-all", authenticate, (req: any, res) => {
    const role = req.user.role;
    if (role !== 'Admin' && role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit. Seuls Admin et Archiviste peuvent vider l'historique d'élimination." });
    }
    try {
      db.prepare("DELETE FROM elimination_requests").run();
      res.json({ success: true, message: "Historique d'élimination vidé." });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/archival-directory/import", authenticate, (req: any, res) => {
    const userRole = req.user.role;
    if (userRole !== 'Admin' && userRole !== 'Agent' && userRole !== 'Archivist') {
      return res.status(403).json({ error: "Interdit. Rôles autorisés: Admin, Agent, Archiviste." });
    }
    try {
      const { entries } = req.body;
      const insert = db.prepare(`
        INSERT OR REPLACE INTO archival_directory (id, reference, title, direction, docType, activeYears, semiActiveYears, finalDisposition, support, retentionTrigger, isCritical, category, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const transaction = db.transaction((rows) => {
        for (const r of rows) {
          const id = r.id || crypto.randomUUID();
          insert.run(
            id, 
            r.reference, 
            r.title, 
            r.direction, 
            r.docType || '',
            r.activeYears || 0, 
            r.semiActiveYears || 0, 
            r.finalDisposition || 'EL', 
            r.support || 'Papier',
            r.retentionTrigger || '',
            r.isCritical ? 1 : 0,
            r.category || 'Général',
            new Date().toISOString()
          );
        }
      });
      transaction(entries);
      res.json({ success: true, count: entries.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // --- Elimination Management ---
  app.get("/api/elimination/stats", authenticate, (req, res) => {
    try {
      const stats = db.prepare(`
        SELECT status, COUNT(*) as count FROM elimination_requests GROUP BY status
      `).all();
      
      const statsObj = { pending: 0, approved: 0, rejected: 0 };
      stats.forEach((s: any) => {
        if (s.status === 'Pending') statsObj.pending = s.count;
        if (s.status === 'Approved') statsObj.approved = s.count;
        if (s.status === 'Rejected') statsObj.rejected = s.count;
      });
      
      res.json(statsObj);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/elimination/proposals", authenticate, (req: any, res) => {
    try {
      // Proposals are items with status 'Expired' that are already in elimination_requests with 'Pending' status
      const results = db.prepare(`
        SELECT er.id as requestId, mi.*, ad.title as ruleTitle, ad.finalDisposition, ad.reference as ruleRef
        FROM elimination_requests er
        JOIN mass_inventory mi ON er.inventoryId = mi.id
        LEFT JOIN archival_directory ad ON mi.ruleId = ad.id
        WHERE er.status = 'Pending'
        ORDER BY er.createdAt DESC
      `).all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/elimination/eligible", authenticate, (req: any, res) => {
    try {
      // Eligible items are Expired items NOT yet in any elimination_requests
      const results = db.prepare(`
        SELECT mi.*, ad.title as ruleTitle, ad.finalDisposition, ad.reference as ruleRef
        FROM mass_inventory mi
        LEFT JOIN archival_directory ad ON mi.ruleId = ad.id
        LEFT JOIN elimination_requests er ON mi.id = er.inventoryId
        WHERE mi.archivalStatus = 'Expired' 
        AND (er.id IS NULL)
        AND (mi.isEliminated IS NULL OR mi.isEliminated = 0)
        LIMIT 1000
      `).all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/elimination/validate-pv", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      const { requestIds } = req.body;
      const today = new Date().toISOString();
      
      const updateRequest = db.prepare(`
        UPDATE elimination_requests 
        SET status = 'Approved', approvedBy = ?, eliminationDate = ?
        WHERE id = ?
      `);
      
      const updateInventory = db.prepare(`
        UPDATE mass_inventory 
        SET isEliminated = 1, archivalStatus = 'Eliminated'
        WHERE id = (SELECT inventoryId FROM elimination_requests WHERE id = ?)
      `);

      db.transaction(() => {
        for (const rid of requestIds) {
          updateRequest.run(req.user.email, today, rid);
          updateInventory.run(rid);
        }
      })();

      res.json({ success: true, count: requestIds.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/elimination-requests/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      db.prepare("DELETE FROM elimination_requests WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/elimination/history", authenticate, (req: any, res) => {
    try {
      const results = db.prepare(`
        SELECT er.*, mi.reference, mi.intitule, mi.direction, mi.numBoite, mi.localisation
        FROM elimination_requests er
        JOIN mass_inventory mi ON er.inventoryId = mi.id
        WHERE er.status = 'Approved' OR er.status = 'Eliminated'
        ORDER BY er.eliminationDate DESC
      `).all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/archival-directory", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      const r = req.body;
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO archival_directory (id, reference, title, direction, docType, activeYears, semiActiveYears, finalDisposition, support, retentionTrigger, isCritical, category, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, r.reference, r.title, r.direction, r.docType, r.activeYears || 0, r.semiActiveYears || 0, r.finalDisposition, r.support, r.retentionTrigger, r.isCritical ? 1 : 0, r.category || 'Général', new Date().toISOString());
      res.json({ success: true, id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/archival-directory/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      const { id } = req.params;
      const r = req.body;
      db.prepare(`
        UPDATE archival_directory 
        SET reference = ?, title = ?, direction = ?, docType = ?, activeYears = ?, semiActiveYears = ?, finalDisposition = ?, support = ?, retentionTrigger = ?, isCritical = ?, category = ?
        WHERE id = ?
      `).run(r.reference, r.title, r.direction, r.docType, r.activeYears || 0, r.semiActiveYears || 0, r.finalDisposition, r.support, r.retentionTrigger, r.isCritical ? 1 : 0, r.category || 'Général', id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/archival-directory/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      db.prepare("DELETE FROM archival_directory WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/archival-directory/direction/clear", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      const { direction } = req.body;
      if (!direction) return res.status(400).json({ error: "Direction manquante" });
      db.prepare("DELETE FROM archival_directory WHERE direction = ?").run(direction);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // --- Elimination Management ---
  app.get("/api/elimination-requests", authenticate, (req, res) => {
    try {
      const results = db.prepare(`
        SELECT er.*, mi.reference, mi.intitule, mi.direction, mi.numBoite
        FROM elimination_requests er
        JOIN mass_inventory mi ON er.inventoryId = mi.id
        ORDER BY er.createdAt DESC
      `).all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/elimination-requests", authenticate, (req: any, res) => {
    try {
      const { inventoryIds } = req.body; // Array of IDs
      const createdAt = new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO elimination_requests (id, inventoryId, status, requestedBy, createdAt)
        VALUES (?, ?, 'Pending', ?, ?)
      `);
      
      const transaction = db.transaction((ids) => {
        for (const invId of ids) {
          const id = crypto.randomUUID();
          insert.run(id, invId, req.user.email, createdAt);
        }
      });
      transaction(inventoryIds);
      res.json({ success: true, count: inventoryIds.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/elimination-requests/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      const { status, approvedBy, eliminationDate, certificateFilename } = req.body;
      db.prepare(`
        UPDATE elimination_requests 
        SET status = ?, approvedBy = ?, eliminationDate = ?, certificateFilename = ?
        WHERE id = ?
      `).run(status, approvedBy || req.user.email, eliminationDate, certificateFilename, req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // --- Returns Management ---
  app.get("/api/returns/inventory", authenticate, (req: any, res) => {
    try { res.json(readData('returns_inventory')); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/returns/inventory/import", authenticate, (req: any, res) => {
    console.log(`IMPORT: User ${req.user.email} (${req.user.role}) is attempting to import items.`);
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      console.warn(`IMPORT: Denied for role ${req.user.role}`);
      return res.status(403).json({ error: "Interdit. Rôles autorisés: Admin, Agent, Archiviste." });
    }
    try {
      const { items } = req.body;
      const data = readData('returns_inventory');
      // Merge or overwrite logic - let's append but avoid duplicates by reference
      const existingRefs = new Set(data.map((i: any) => i.reference));
      const newItems = items.filter((i: any) => i.reference && !existingRefs.has(i.reference)).map((i: any) => ({
        ...i,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      }));
      const updated = [...data, ...newItems];
      writeData('returns_inventory', updated);
      res.json({ success: true, count: newItems.length });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/returns/history", authenticate, (req: any, res) => {
    try { res.json(readData('returns_history')); } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/returns/history", authenticate, (req: any, res) => {
    try {
      const data = readData('returns_history');
      const newEntry = {
        ...req.body,
        id: crypto.randomUUID(),
        returnedAt: new Date().toISOString()
      };
      data.push(newEntry);
      writeData('returns_history', data);
      res.json(newEntry);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/returns/history/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit. Rôles autorisés: Admin, Agent, Archiviste." });
    }
    try {
      const { id } = req.params;
      const data = readData('returns_history');
      const filtered = data.filter((h: any) => h.id !== id);
      writeData('returns_history', filtered);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Requests
  app.get("/api/requests", authenticate, (req: any, res) => {
    try {
      let data = readData('requests');
      
      if (req.user.role === 'Demandeur') {
        data = data.filter((r: any) => r.email === req.user.email);
      }

      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/requests", authenticate, (req: any, res) => {
    try {
      const data = readData('requests');
      const demandNumber = getNextDemandNumber();
      const newRequest = {
        ...req.body,
        id: crypto.randomUUID(),
        demandNumber, // This is the sequential reference like 001/2026
        agentId: req.user.uid,
        agentName: req.user.displayName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.push(newRequest);
      writeData('requests', data);

      // --- Link to Communication Management (Archives) ---
      try {
        const archives = readData('archives');
        // Column 1: REF / BOITE combines the document reference(s) and box
        const combinedRefs = Array.isArray(newRequest.references) && newRequest.references.length > 0 
          ? newRequest.references.join(', ') 
          : (newRequest.intitule || '-');
        const refBoite = [combinedRefs, newRequest.boite].filter(Boolean).join(' / ') || '-';

        const archiveEntry = {
          id: 'arc_' + newRequest.id,
          intitule: refBoite, // This goes to REF / BOITE column
          nomDemandeur: newRequest.nomDemandeur || newRequest.requesterName || newRequest.agentName || '-',
          dateCommunication: newRequest.createdAt,
          reference: demandNumber, // This goes to Référence column as requested (ex: 001/2026)
          dateRetour: '',
          requestId: newRequest.id,
          isImported: false,
          createdAt: new Date().toISOString()
        };
        archives.push(archiveEntry);
        writeData('archives', archives);
      } catch (arcErr) {
        console.error("Failed to auto-archive request:", arcErr);
      }

      res.json({ id: newRequest.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/requests/:id", authenticate, (req: any, res) => {
    try {
      const { id } = req.params;
      const data = readData('requests');
      const index = data.findIndex((r: any) => r.id === id);
      if (index === -1) return res.status(404).json({ error: "Non trouvé" });

      data[index] = {
        ...data[index],
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      writeData('requests', data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/requests/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: "Interdit" });
    try {
      let data = readData('requests');
      data = data.filter((r: any) => r.id !== req.params.id);
      writeData('requests', data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remote Requests
  app.post("/api/remote-requests", (req: any, res) => {
    try {
      const data = readData('remote_requests');
      const demandNumber = getNextDemandNumber();
      const newRequest = {
        ...req.body,
        id: crypto.randomUUID(),
        demandNumber,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.push(newRequest);
      writeData('remote_requests', data);

      // --- Link to Communication Management (Archives) ---
      try {
        const archives = readData('archives');
        const combinedRefs = Array.isArray(newRequest.references) && newRequest.references.length > 0 
          ? newRequest.references.join(', ') 
          : (newRequest.intitule || '-');
        const refBoite = [combinedRefs, newRequest.boite].filter(Boolean).join(' / ') || '-';
        
        const archiveEntry = {
          id: 'arc_' + newRequest.id,
          intitule: refBoite,
          nomDemandeur: newRequest.nom || newRequest.requesterName || newRequest.nomDemandeur || '-',
          dateCommunication: newRequest.createdAt,
          reference: demandNumber,
          dateRetour: '',
          requestId: newRequest.id,
          isImported: false,
          createdAt: new Date().toISOString()
        };
        archives.push(archiveEntry);
        writeData('archives', archives);
      } catch (arcErr) {
        console.error("Failed to auto-archive remote request:", arcErr);
      }

      res.json({ id: newRequest.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/remote-requests", authenticate, (req: any, res) => {
    try {
      let data = readData('remote_requests');
      if (req.user.role === 'Demandeur') {
        data = data.filter((r: any) => r.email === req.user.email);
      }
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/remote-requests/batch", authenticate, (req: any, res) => {
    try {
      const { items } = req.body;
      const data = readData('remote_requests');
      items.forEach((item: any) => {
        data.push({
          ...item,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
      writeData('remote_requests', data);
      res.json({ success: true, count: items.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/remote-requests/:id", authenticate, (req: any, res) => {
    try {
      const { id } = req.params;
      const data = readData('remote_requests');
      const index = data.findIndex((r: any) => r.id === id);
      if (index === -1) return res.status(404).json({ error: "Non trouvé" });

      data[index] = {
        ...data[index],
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      writeData('remote_requests', data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/remote-requests/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent') return res.status(403).json({ error: "Interdit" });
    try {
      let data = readData('remote_requests');
      data = data.filter((r: any) => r.id !== req.params.id);
      writeData('remote_requests', data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/transfer-requests", authenticate, (req: any, res) => {
    try {
      const data = readData('transfer_requests');
      const demandNumber = getNextDemandNumber();
      const newTransfer = {
        ...req.body,
        id: crypto.randomUUID(),
        demandNumber,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.push(newTransfer);
      writeData('transfer_requests', data);
      res.json({ id: newTransfer.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/transfer-requests", authenticate, (req: any, res) => {
    try {
      let data = readData('transfer_requests');
      if (req.user.role === 'Demandeur') {
        data = data.filter((r: any) => r.email === req.user.email);
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/transfer-requests/:id", authenticate, (req: any, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
      const data = readData('transfer_requests');
      const idx = data.findIndex((r: any) => r.id === id);
      if (idx === -1) return res.status(404).json({ error: "Non trouvé" });
      
      data[idx] = { ...data[idx], status, updatedAt: new Date().toISOString() };
      writeData('transfer_requests', data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/remote-requests/clear", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: "Interdit" });
    try {
      writeData('remote_requests', []);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Archives
  app.post("/api/archives/clear", authenticate, (req: any, res) => {
    const userRole = req.user.role;
    const userEmail = req.user.email;
    console.log(`[CLEAR ARCHIVES] Request by ${userEmail} (${userRole})`);
    
    // allow Admin, Agent, and Archivist
    const allowedRoles = ['Admin', 'Agent', 'Archivist'];
    if (!allowedRoles.includes(userRole)) {
      console.warn(`[CLEAR ARCHIVES] Denied for role: ${userRole}`);
      return res.status(403).json({ error: `Action interdite pour votre rôle (${userRole}).` });
    }

    try {
      writeData('archives', []);
      console.log("[CLEAR ARCHIVES] Success: File archives.json reset to []");
      res.json({ success: true, message: "Historique des archives vidé." });
    } catch (err: any) {
      console.error("[CLEAR ARCHIVES] Error:", err);
      res.status(500).json({ error: "Erreur lors de la suppression sur le serveur: " + err.message });
    }
  });

  app.patch("/api/archives/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { id } = req.params;
      const data = readData('archives');
      const index = data.findIndex((r: any) => r.id === id);
      if (index === -1) return res.status(404).json({ error: "Élément non trouvé" });

      data[index] = {
        ...data[index],
        ...req.body,
        updatedAt: new Date().toISOString(),
      };
      writeData('archives', data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/archives/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      let data = readData('archives');
      const initialCount = data.length;
      data = data.filter((r: any) => r.id !== req.params.id);
      if (data.length === initialCount) {
        return res.status(404).json({ error: "Élément non trouvé" });
      }
      writeData('archives', data);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/archives", authenticate, (req: any, res) => {
    try {
      const data = readData('archives');
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(data.slice(0, 15000));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/archives/batch", authenticate, (req: any, res) => {
    // Allow both Admin and Agent for easier import during migration
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent') return res.status(403).json({ error: "Refusé" });
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) return res.status(400).json({ error: "Format invalide" });
      
      const data = readData('archives');
      const newItems = items.map((item: any) => ({
        ...item,
        id: crypto.randomUUID(),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      
      writeData('archives', [...data, ...newItems]);
      res.json({ success: true, count: items.length });
    } catch (err: any) {
      console.error("Batch archive error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Notifications
  app.post("/api/send-email", (req: any, res) => {
    console.log("SIMULATED EMAIL SEND TO:", req.body.to, "SUBJECT:", req.body.subject);
    res.json({ success: true });
  });

  // --- Start Listening ---
  app.get("/api/statistics/full", authenticate, (req: any, res) => {
    const role = req.user?.role;
    if (role !== 'Admin' && role !== 'Agent' && role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }

    try {
      const requests = readData('requests');
      const remoteRequests = readData('remote_requests');
      const returnsHistory = readData('returns_history');
      const eliminations = db.prepare("SELECT createdAt FROM elimination_requests WHERE status = 'Eliminated'").all() as any[];
      const massImports = db.prepare("SELECT createdAt FROM mass_inventory").all() as any[];

      const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
      
      const getMonthIndex = (dateStr: string) => {
        if (!dateStr) return -1;
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? -1 : date.getMonth();
      };

      const monthlyData = months.map((month, index) => {
        // Communication signed
        const signedRequests = requests.filter((r: any) => 
          r.status === 'signed' && getMonthIndex(r.updatedAt || r.createdAt) === index
        ).length;
        const signedRemote = remoteRequests.filter((r: any) => 
          r.status === 'signed' && getMonthIndex(r.updatedAt || r.createdAt) === index
        ).length;

        // Mass Transfers (Imports)
        const imports = massImports.filter((m: any) => getMonthIndex(m.createdAt) === index).length;

        // Returns
        const returns = returnsHistory.filter((r: any) => getMonthIndex(r.returnedAt || r.createdAt) === index).length;

        // Eliminations
        const elims = eliminations.filter((e: any) => getMonthIndex(e.createdAt) === index).length;

        return {
          month,
          communications: signedRequests + signedRemote,
          transfers: imports,
          returns: returns,
          eliminations: elims
        };
      });

      res.json({
        monthly: monthlyData,
        totals: {
          communications: monthlyData.reduce((acc, curr) => acc + curr.communications, 0),
          transfers: monthlyData.reduce((acc, curr) => acc + curr.transfers, 0),
          returns: monthlyData.reduce((acc, curr) => acc + curr.returns, 0),
          eliminations: monthlyData.reduce((acc, curr) => acc + curr.eliminations, 0)
        }
      });
    } catch (err: any) {
      console.error("Stats error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // --- Automatic Archival Surveillance Task ---
    const runArchivalCheck = () => {
      console.log("[SURVEILLANCE] Starting daily archival status check...");
      try {
        const rules = getAllRules();
        const currentYear = new Date().getFullYear();
        
        // This transaction updates all items efficiently
        // For massive volumes, we use rule metadata to target updates
        db.transaction(() => {
          for (const rule of rules) {
            const activeThreshold = currentYear - rule.activeYears;
            const semiThreshold = currentYear - (rule.activeYears + rule.semiActiveYears);
            
            // Move to SemiActive
            db.prepare(`
              UPDATE mass_inventory 
              SET archivalStatus = 'SemiActive' 
              WHERE ruleId = ? 
                AND archivalStatus = 'Active'
                AND (
                  CASE 
                    WHEN dateCloture LIKE '%/%' THEN CAST(SUBSTR(dateCloture, -4) AS INTEGER)
                    WHEN dateCloture LIKE '%-%' THEN CAST(SUBSTR(dateCloture, 1, 4) AS INTEGER)
                    ELSE CAST(dateCloture AS INTEGER)
                  END
                ) <= ?
            `).run(rule.id, activeThreshold);

            // Move to Expired
            db.prepare(`
              UPDATE mass_inventory 
              SET archivalStatus = 'Expired' 
              WHERE ruleId = ? 
                AND archivalStatus IN ('Active', 'SemiActive')
                AND (
                  CASE 
                    WHEN dateCloture LIKE '%/%' THEN CAST(SUBSTR(dateCloture, -4) AS INTEGER)
                    WHEN dateCloture LIKE '%-%' THEN CAST(SUBSTR(dateCloture, 1, 4) AS INTEGER)
                    ELSE CAST(dateCloture AS INTEGER)
                  END
                ) <= ?
            `).run(rule.id, semiThreshold);
          }
        })();
        console.log("[SURVEILLANCE] Completed archival status check.");
      } catch (err) {
        console.error("[SURVEILLANCE] Error during daily check:", err);
      }
    };

    // Run once on startup
    setTimeout(runArchivalCheck, 5000);
    // Then every 24 hours
    setInterval(runArchivalCheck, 24 * 60 * 60 * 1000);
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware attached.");
    } catch (err) {
      console.error("Failed to start Vite:", err);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res, next) => {
        // If it looks like an API call and wasn't handled, let it fall through
        if (req.url.startsWith('/api')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.warn("Dist folder not found, skipping static serving");
    }
  }

  // Final 404 for API
  app.use('/api', (req: any, res: any) => {
    console.warn(`API NOT FOUND: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `API Route ${req.method} ${req.url} not found` });
  });

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[EXPRESS ERROR]", err);
    res.status(500).json({ error: "Erreur interne du serveur" });
  });
}

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer().catch(err => {
  console.error("[FATAL] Failed to start server:", err);
});
