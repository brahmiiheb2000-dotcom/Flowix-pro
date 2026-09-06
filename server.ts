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
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.resolve(DATA_DIR, 'mass_inventory.db');
console.log("SERVER: Opening database at", DB_PATH);

function initDatabase(dbPath: string): any {
  let database: any;
  try {
    database = new Database(dbPath);
    database.pragma('quick_check');
  } catch (err) {
    console.error("Warning: SQLite file invalid or corrupt. Recreating a fresh database...", err);
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch (unlinkErr) {
      console.error("Failed to delete corrupt database file:", unlinkErr);
    }
    database = new Database(dbPath);
  }
  return database;
}

const db = initDatabase(DB_PATH);
console.log("SERVER: Database opened successfully.");

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

  CREATE TABLE IF NOT EXISTS centralized_inventory (
    reference TEXT PRIMARY KEY,
    dateCloture TEXT,
    status TEXT, -- 'pending', 'pointed', 'verified'
    boxNumber TEXT,
    pointedAt TEXT,
    verifiedAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS centralized_boxes (
    id TEXT PRIMARY KEY,
    number TEXT,
    title TEXT,
    isOpen INTEGER DEFAULT 1,
    depot TEXT,
    travee TEXT,
    tablette TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS centralized_validation_history (
    id TEXT PRIMARY KEY,
    validationDate TEXT,
    foldersCount INTEGER,
    boxesCount INTEGER,
    boxesList TEXT,
    source TEXT
  );

  CREATE TABLE IF NOT EXISTS system_users (
    email TEXT PRIMARY KEY,
    role TEXT,
    displayName TEXT
  );

  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT,
    code TEXT,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS barcode_prefixes (
    id TEXT PRIMARY KEY,
    direction TEXT UNIQUE,
    prefix TEXT
  );

  CREATE TABLE IF NOT EXISTS integration_batches (
    id TEXT PRIMARY KEY,
    batchNumber TEXT,
    direction TEXT,
    importedAt TEXT,
    importedBy TEXT,
    status TEXT DEFAULT 'en_attente_audit', -- 'en_attente_audit', 'validé', 'rejeté'
    foldersCount INTEGER DEFAULT 0,
    boxesCount INTEGER DEFAULT 0,
    foldersData TEXT,
    boxesData TEXT,
    ruleApplied TEXT,
    validatedAt TEXT,
    validatedBy TEXT,
    rejectionReason TEXT,
    notes TEXT
  );
`);

// Migration for mass_inventory
const newCols = [
  'dossier', 'codeAgence', 'sin', 'police', 'adherant', 
  'dateDeclaration', 'typeSinistre', 'dateCloture', 
  'etatSinistre', 'paquet', 'ruleId', 'expiryDate', 'archivalStatus', 'rawData',
  'isEliminated', 'scanFile', 'batchId', 'batchNumber', 'inventoryRef', 'inventoryName', 'validatedBy', 'validatedAt'
];
newCols.forEach(col => {
  try {
    db.exec(`ALTER TABLE mass_inventory ADD COLUMN ${col} TEXT`);
  } catch (e) {
    // Column already exists
  }
});

// Migration for centralized_inventory
const centralizedCols = ['ruleId', 'expiryDate', 'archivalStatus', 'direction', 'intitule', 'isEliminated', 'scanFile', 'batchId', 'batchNumber', 'inventoryRef', 'inventoryName', 'validatedBy'];
centralizedCols.forEach(col => {
  try {
    db.exec(`ALTER TABLE centralized_inventory ADD COLUMN ${col} TEXT`);
  } catch (e) {
    // Column already exists
  }
});

// Migration for centralized_boxes
const centralizedBoxCols = [
  'batiment', 'salle', 'rayon', 'niveau', 'barcode', 'foldersCount',
  'dateRange', 'expiryYear', 'localisation', 'rawLocalisation', 'batchId', 'batchNumber', 'direction'
];
centralizedBoxCols.forEach(col => {
  try {
    db.exec(`ALTER TABLE centralized_boxes ADD COLUMN ${col} TEXT`);
  } catch (e) {
    // Column already exists
  }
});

// Migration for integration_batches (inventoryRef, inventoryName, directionHead, transferDate)
const batchNewCols = ['inventoryRef', 'inventoryName', 'directionHead', 'transferDate'];
batchNewCols.forEach(col => {
  try {
    db.exec(`ALTER TABLE integration_batches ADD COLUMN ${col} TEXT`);
  } catch (e) {
    // Column already exists
  }
});

// Storage Physical Architecture Tables (Salles, Travées, Tablettes & Allocations)
db.exec(`
  CREATE TABLE IF NOT EXISTS storage_rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    building TEXT,
    description TEXT,
    createdAt TEXT
  );
  CREATE TABLE IF NOT EXISTS storage_bays (
    id TEXT PRIMARY KEY,
    roomId TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    bayNumber INTEGER DEFAULT 1,
    description TEXT,
    createdAt TEXT
  );
  CREATE TABLE IF NOT EXISTS storage_shelves (
    id TEXT PRIMARY KEY,
    bayId TEXT NOT NULL,
    roomId TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    shelfNumber INTEGER DEFAULT 1,
    boxCapacity INTEGER DEFAULT 6,
    createdAt TEXT
  );
  CREATE TABLE IF NOT EXISTS storage_box_allocations (
    id TEXT PRIMARY KEY,
    boxNumber TEXT NOT NULL,
    shelfId TEXT NOT NULL,
    bayId TEXT,
    roomId TEXT,
    batchId TEXT,
    inventoryRef TEXT,
    direction TEXT,
    folderCount INTEGER DEFAULT 0,
    notes TEXT,
    createdAt TEXT
  );
  CREATE TABLE IF NOT EXISTS storage_config_history (
    id TEXT PRIMARY KEY,
    adminName TEXT NOT NULL,
    actionType TEXT NOT NULL,
    description TEXT NOT NULL,
    details TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_storage_bays_room ON storage_bays(roomId);
  CREATE INDEX IF NOT EXISTS idx_storage_shelves_bay ON storage_shelves(bayId);
  CREATE INDEX IF NOT EXISTS idx_storage_alloc_shelf ON storage_box_allocations(shelfId);
  CREATE INDEX IF NOT EXISTS idx_storage_alloc_box ON storage_box_allocations(boxNumber);
  CREATE INDEX IF NOT EXISTS idx_storage_hist_date ON storage_config_history(createdAt);
`);

// Migrations for Épis support in storage
try {
  db.exec(`ALTER TABLE storage_bays ADD COLUMN epi TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE storage_bays ADD COLUMN bayNumberInEpi INTEGER`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE storage_shelves ADD COLUMN epi TEXT`);
} catch (e) {}

// Auto-seed default storage depot (Salle 1 with 8 Épis A-H × 31 travées × 7 niveaux, Salle 2 & Salle 3) if empty or outdated
try {
  const roomCount = (db.prepare("SELECT COUNT(*) as count FROM storage_rooms").get() as any)?.count || 0;
  const salle1Bays = (db.prepare("SELECT COUNT(*) as count FROM storage_bays WHERE roomId = 'room_salle_1'").get() as any)?.count || 0;
  
  if (roomCount === 0 || (salle1Bays > 0 && salle1Bays < 200)) {
    const insertRoom = db.prepare("INSERT OR REPLACE INTO storage_rooms (id, name, code, building, description, createdAt) VALUES (?, ?, ?, ?, ?, ?)");
    const insertBay = db.prepare("INSERT OR REPLACE INTO storage_bays (id, roomId, name, code, bayNumber, epi, bayNumberInEpi, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertShelf = db.prepare("INSERT OR REPLACE INTO storage_shelves (id, bayId, roomId, name, code, shelfNumber, boxCapacity, epi, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertHist = db.prepare("INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt) VALUES (?, ?, ?, ?, ?, ?)");

    const now = new Date().toISOString();
    db.transaction(() => {
      // 1. Salle 1: 8 Épis (A, B, C, D, E, F, G, H) × 31 Travées = 248 Travées × 7 Tablettes
      insertRoom.run(
        'room_salle_1',
        'Salle 1',
        'S1',
        'Dépôt Central A',
        'Dépôt principal d\'archivage - 8 Épis (A, B, C, D, E, F, G, H), 31 travées/épi, 7 niveaux/travée',
        now
      );

      // Clean previous bays/shelves in Salle 1 if we're upgrading to 8 Épis
      db.prepare("DELETE FROM storage_shelves WHERE roomId = 'room_salle_1'").run();
      db.prepare("DELETE FROM storage_bays WHERE roomId = 'room_salle_1'").run();

      const episSalle1 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      let globalBayCounter = 1;

      for (const epiLetter of episSalle1) {
        for (let bInEpi = 1; bInEpi <= 31; bInEpi++) {
          const formattedBayNum = bInEpi.toString().padStart(2, '0');
          const bayCode = `${epiLetter}-T${formattedBayNum}`;
          const bayName = `Épi ${epiLetter} - Travée ${formattedBayNum}`;
          const bayId = `bay_salle_1_${epiLetter}_${bInEpi}`;

          insertBay.run(
            bayId,
            'room_salle_1',
            bayName,
            bayCode,
            globalBayCounter,
            epiLetter,
            bInEpi,
            `Rayonnage Épi ${epiLetter} - Travée ${formattedBayNum}`,
            now
          );

          for (let sIdx = 1; sIdx <= 7; sIdx++) {
            const shelfId = `shelf_${bayId}_${sIdx}`;
            const shelfName = `Niveau ${sIdx}`;
            const shelfCode = `${bayCode}-N${sIdx}`;

            insertShelf.run(
              shelfId,
              bayId,
              'room_salle_1',
              shelfName,
              shelfCode,
              sIdx,
              5,
              epiLetter,
              now
            );
          }
          globalBayCounter++;
        }
      }

      // 2. Ensure Salle 2 & Salle 3 exist
      const s2Exists = (db.prepare("SELECT COUNT(*) as count FROM storage_rooms WHERE id = 'room_salle_2'").get() as any)?.count || 0;
      if (s2Exists === 0) {
        insertRoom.run('room_salle_2', 'Salle 2', 'S2', 'Dépôt Central B', 'Dépôt d\'archivage - Sinistres Matériels et Corporels', now);
        for (let bIdx = 1; bIdx <= 31; bIdx++) {
          const bayCode = `T${bIdx}`;
          const bayId = `bay_room_salle_2_${bIdx}`;
          insertBay.run(bayId, 'room_salle_2', `Travée T${bIdx}`, bayCode, bIdx, 'A', bIdx, `Rayonnage Salle 2 - ${bayCode}`, now);
          for (let sIdx = 1; sIdx <= 7; sIdx++) {
            insertShelf.run(`shelf_${bayId}_${sIdx}`, bayId, 'room_salle_2', `Niveau ${sIdx}`, `${bayCode}-N${sIdx}`, sIdx, 5, 'A', now);
          }
        }
      }

      const s3Exists = (db.prepare("SELECT COUNT(*) as count FROM storage_rooms WHERE id = 'room_salle_3'").get() as any)?.count || 0;
      if (s3Exists === 0) {
        insertRoom.run('room_salle_3', 'Salle 3', 'S3', 'Dépôt Central C', 'Dépôt d\'archivage - Finances, RH et Contrats', now);
        for (let bIdx = 1; bIdx <= 31; bIdx++) {
          const bayCode = `T${bIdx}`;
          const bayId = `bay_room_salle_3_${bIdx}`;
          insertBay.run(bayId, 'room_salle_3', `Travée T${bIdx}`, bayCode, bIdx, 'A', bIdx, `Rayonnage Salle 3 - ${bayCode}`, now);
          for (let sIdx = 1; sIdx <= 7; sIdx++) {
            insertShelf.run(`shelf_${bayId}_${sIdx}`, bayId, 'room_salle_3', `Niveau ${sIdx}`, `${bayCode}-N${sIdx}`, sIdx, 5, 'A', now);
          }
        }
      }

      insertHist.run(
        `hist_init_${Date.now()}`,
        'Responsable Audit & Administration',
        'CONFIGURATION_SALLE_1_EPIS',
        'Configuration Salle 1 : 8 Épis (A, B, C, D, E, F, G, H) × 31 Travées × 7 Niveaux (248 travées, 1 736 tablettes)',
        JSON.stringify({ roomId: 'room_salle_1', epis: episSalle1, baysPerEpi: 31, shelvesPerBay: 7, shelfCapacity: 5 }),
        now
      );
    })();
    console.log("[STORAGE] Seeded Salle 1 with 8 Épis (A-H), 31 bays each, 7 levels/bay (248 bays, 1 736 shelves).");
  }
} catch (err) {
  console.error("[STORAGE] Error seeding default storage rooms:", err);
}

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

function getActiveCommunicationMap(): Map<string, any> {
  const requests = readData('requests') || [];
  const remoteRequests = readData('remote_requests') || [];
  const archives = readData('archives') || [];

  const commMap = new Map<string, any>();

  const isReturnedStatus = (status: any, dateRetour: any) => {
    if (dateRetour && String(dateRetour).trim()) return true;
    if (!status) return false;
    const s = String(status).toLowerCase().trim();
    return s === 'returned' || s === 'retourné' || s === 'rejoint' || s === 'cloturé' || s === 'clôturé';
  };

  const processRecord = (r: any, source: string) => {
    if (!r) return;
    const statusStr = String(r.status || '').toLowerCase().trim();
    const isRet = isReturnedStatus(r.status, r.dateRetour);

    const isComm = Boolean(
      r.dateCommunication || 
      r.dateRetour || 
      statusStr === 'signed' || 
      statusStr === 'prêt / communiqué' || 
      statusStr === 'prêté' ||
      statusStr === 'retourné' || 
      statusStr === 'returned' ||
      statusStr === 'en cours' ||
      statusStr === 'traité' ||
      statusStr === 'en cours de prêt' ||
      source === 'archives'
    );

    if (!isComm) return;

    let rawRefs: string[] = [];
    if (Array.isArray(r.references) && r.references.length > 0) {
      rawRefs = r.references;
    } else {
      const val = r.referenceDemandee || r.reference || r.intitule || r.motif || r.dossier || '';
      const [refPart] = String(val).split(' / ');
      rawRefs = refPart.split(/[;,]+/).map((s: string) => s.trim()).filter(Boolean);
    }

    const borrower = r.nomDemandeur || r.nom || r.requesterName || r.agentName || 'Demandeur';
    const dateComm = r.dateCommunication || r.createdAt || '';
    const dateRet = r.dateRetour || '';

    rawRefs.forEach(ref => {
      const cleanRef = String(ref).trim().toUpperCase();
      if (!cleanRef || cleanRef === '-' || cleanRef.length < 2) return;

      const existing = commMap.get(cleanRef);
      if (!isRet) {
        commMap.set(cleanRef, {
          ref: cleanRef,
          isCommunicated: true,
          status: 'Communiqué',
          borrower,
          dateComm,
          dateRet: '',
          rawStatus: r.status,
          source
        });
      } else if (!existing) {
        commMap.set(cleanRef, {
          ref: cleanRef,
          isCommunicated: false,
          status: 'Retourné',
          borrower,
          dateComm,
          dateRet,
          rawStatus: r.status,
          source
        });
      }
    });
  };

  requests.forEach((r: any) => processRecord(r, 'requests'));
  remoteRequests.forEach((r: any) => processRecord(r, 'remote_requests'));
  archives.forEach((r: any) => processRecord(r, 'archives'));

  return commMap;
}

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-for-dev";

// Hardcoded users
const USERS = [
  { email: 'agent@flowix.pro', role: 'Agent', displayName: 'Agent MAE' },
  { email: 'archiviste@flowix.pro', role: 'Archivist', displayName: 'Archiviste MAE' },
  { email: 'demandeur@flowix.pro', role: 'Demandeur', displayName: 'Demandeur Distance' },
  { email: 'brahmiiheb2000@gmail.com', role: 'Admin', displayName: 'Administrateur' },
  { email: 'responsable@flowix.pro', role: 'Responsable', displayName: 'Responsable Audit' }
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Seed system_users on startup
  try {
    const userCount = db.prepare("SELECT COUNT(*) as count FROM system_users").get() as any;
    if (userCount && userCount.count === 0) {
      const insertUser = db.prepare("INSERT INTO system_users (email, role, displayName) VALUES (?, ?, ?)");
      USERS.forEach(u => {
        insertUser.run(u.email, u.role, u.displayName);
      });
      console.log("system_users table seeded with default accounts.");
    }
  } catch (err) {
    console.error("Failed to seed system_users:", err);
  }

  // Seed departments on startup
  try {
    const depCount = db.prepare("SELECT COUNT(*) as count FROM departments").get() as any;
    if (depCount && depCount.count === 0) {
      const insertDep = db.prepare("INSERT INTO departments (id, name, code, description) VALUES (?, ?, ?, ?)");
      const initialDeps = [
        { name: "Direction Commune", code: "COM-COMMUNE", desc: "PV, assemblées et documents généraux" },
        { name: "Direction Equipements et Affaires Immobilières", code: "EQ-IMM", desc: "Gestion immobilière et équipements" },
        { name: "Direction Contrôle de la Conformité", code: "CONF", desc: "Rapports réglementaires et PV" },
        { name: "Direction Commerciale", code: "COM", desc: "Contrats, conventions et relations courtiers" },
        { name: "Direction Audit Interne et Organisation", code: "AIO", desc: "Missions d'audit et procédures" },
        { name: "Direction Finance et Comptabilité", code: "FIN", desc: "Comptabilité générale, factures et comptabilité auxiliaire" },
        { name: "Direction Sinistre Matériels", code: "SIN-M", desc: "Dossiers de sinistres matériels" },
        { name: "Direction Sinistre Corporel", code: "SIN-C", desc: "Dossiers de sinistres corporels" },
        { name: "Direction des Ressources Humaines", code: "DRH", desc: "Dossiers du personnel et paie" }
      ];
      db.transaction(() => {
        initialDeps.forEach((dep, idx) => {
          insertDep.run(`DEP_${idx + 1}`, dep.name, dep.code, dep.desc);
        });
      })();
      console.log("departments table seeded with organizational departments.");
    }
  } catch (err) {
    console.error("Failed to seed departments:", err);
  }

  // Seed barcode prefixes on startup
  try {
    const prefixCount = db.prepare("SELECT COUNT(*) as count FROM barcode_prefixes").get() as any;
    if (prefixCount && prefixCount.count === 0) {
      const insertPrefix = db.prepare("INSERT INTO barcode_prefixes (id, direction, prefix) VALUES (?, ?, ?)");
      const prefixes = [
        { dir: "Direction Sinistre Corporel", pre: "Sin.C." },
        { dir: "Direction Sinistre Matériels", pre: "Sin.M." },
        { dir: "Direction Finance et Comptabilité", pre: "Compta." },
        { dir: "Direction des Ressources Humaines", pre: "R.H." },
        { dir: "Direction Commerciale", pre: "Prod." },
        { dir: "Direction Contrôle de la Conformité", pre: "Tech." }
      ];
      db.transaction(() => {
        prefixes.forEach((p, idx) => {
          insertPrefix.run(`PRE_${idx + 1}`, p.dir, p.pre);
        });
      })();
      console.log("barcode_prefixes table seeded successfully.");
    }
  } catch (err) {
    console.error("Failed to seed barcode prefixes:", err);
  }

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.use(cookieParser());

  // Rewrite un-prefixed storage API calls to /api/storage for full backward compatibility
  app.use((req, res, next) => {
    if (req.url.startsWith('/storage/')) {
      req.url = '/api' + req.url;
    }
    next();
  });

  // --- Request Logger ---
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API REQUEST] ${req.method} ${req.url}`);
    }
    next();
  });

  // --- Auth Middleware ---
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.cookies?.auth_token || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : null) || req.query?.token;
    if (!token) {
      // Default to standard user in iframe or when cookies are partitioned/blocked
      const defaultUser = USERS[0] || { email: 'responsable@flowix.pro', role: 'Responsable', displayName: 'Responsable Audit' };
      req.user = {
        uid: defaultUser.email,
        email: defaultUser.email,
        role: defaultUser.role,
        displayName: defaultUser.displayName
      };
      return next();
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (err) {
      const defaultUser = USERS[0] || { email: 'responsable@flowix.pro', role: 'Responsable', displayName: 'Responsable Audit' };
      req.user = {
        uid: defaultUser.email,
        email: defaultUser.email,
        role: defaultUser.role,
        displayName: defaultUser.displayName
      };
      next();
    }
  };

  // --- Auth Routes ---
  app.post("/api/login", (req, res) => {
    const { email } = req.body;
    console.log("LOGIN BYPASS ATTEMPT:", { email });
    let user = USERS.find(u => u.email === email);
    if (!user) {
      try {
        const dbUser = db.prepare("SELECT * FROM system_users WHERE email = ?").get(email) as any;
        if (dbUser) {
          user = { email: dbUser.email, role: dbUser.role, displayName: dbUser.displayName };
        }
      } catch (err) {
        console.error("DB User lookup failed during login:", err);
      }
    }
    if (!user) {
      user = { 
        email, 
        role: 'Demandeur', 
        displayName: email.split('@')[0] 
      };
    }
    
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

    res.json({ success: true, token, user: { email: user.email, role: user.role, displayName: user.displayName } });
  });

  app.post("/api/switch-role", (req, res) => {
    const { role } = req.body;
    const token = req.cookies.auth_token;
    let email = 'responsable@flowix.pro';
    let displayName = 'Responsable Audit';

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        email = decoded.email || email;
        displayName = decoded.displayName || displayName;
      } catch (e) {}
    }

    if (role === 'Responsable') {
      displayName = 'Responsable Audit';
      email = 'responsable@flowix.pro';
    } else if (role === 'Admin') {
      displayName = 'Administrateur';
      email = 'brahmiiheb2000@gmail.com';
    } else if (role === 'Archivist') {
      displayName = 'Archiviste MAE';
      email = 'archiviste@flowix.pro';
    } else if (role === 'Agent') {
      displayName = 'Agent MAE';
      email = 'agent@flowix.pro';
    } else if (role === 'Demandeur') {
      displayName = 'Demandeur Distance';
      email = 'demandeur@flowix.pro';
    }

    const newToken = jwt.sign({ 
      uid: email, 
      email, 
      role: role || 'Responsable', 
      displayName 
    }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('auth_token', newToken, { 
      httpOnly: true, 
      secure: true, 
      sameSite: 'none', 
      maxAge: 7 * 24 * 60 * 60 * 1000 
    });

    res.json({ success: true, token: newToken, user: { email, role, displayName } });
  });

  app.post("/api/logout", (req, res) => {
    res.clearCookie('auth_token', { sameSite: 'none', secure: true });
    res.json({ success: true });
  });

  app.get("/api/me", (req, res) => {
    const token = req.cookies.auth_token || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : null);
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

      return res.json({ token: newToken, user: defaultUser });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      try {
        const dbUser = db.prepare("SELECT * FROM system_users WHERE email = ?").get(decoded.email) as any;
        if (dbUser) {
          decoded.role = dbUser.role;
          decoded.displayName = dbUser.displayName;
        }
      } catch (err) {}
      res.json({ token, user: decoded });
    } catch (err) {
      const defaultUser = USERS[0];
      res.json({ token: null, user: defaultUser });
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

  app.get("/api/responsable/stats-directions", authenticate, (req, res) => {
    try {
      const organigrammeRows = db.prepare("SELECT name FROM departments").all() as any[];
      const massDirectionsRows = db.prepare("SELECT DISTINCT direction FROM mass_inventory WHERE direction IS NOT NULL AND direction != ''").all() as any[];
      const centralDirectionsRows = db.prepare("SELECT DISTINCT direction FROM centralized_inventory WHERE direction IS NOT NULL AND direction != ''").all() as any[];

      const directionsSet = new Set<string>();
      organigrammeRows.forEach(r => { if (r.name) directionsSet.add(r.name.trim()); });
      massDirectionsRows.forEach(r => { if (r.direction) directionsSet.add(r.direction.trim()); });
      centralDirectionsRows.forEach(r => { if (r.direction) directionsSet.add(r.direction.trim()); });

      const uniqueDirections = Array.from(directionsSet).sort();

      const directionStats = uniqueDirections.map(dir => {
        const massCount = (db.prepare("SELECT COUNT(*) as count FROM mass_inventory WHERE TRIM(direction) = ?").get(dir) as any)?.count || 0;
        const centralCount = (db.prepare("SELECT COUNT(*) as count FROM centralized_inventory WHERE TRIM(direction) = ?").get(dir) as any)?.count || 0;
        const totalFolders = massCount + centralCount;

        const boxesCount = (db.prepare(`
          SELECT COUNT(DISTINCT box) as count FROM (
            SELECT numBoite as box FROM mass_inventory WHERE TRIM(direction) = ? AND numBoite IS NOT NULL AND numBoite != ''
            UNION
            SELECT boxNumber as box FROM centralized_inventory WHERE TRIM(direction) = ? AND boxNumber IS NOT NULL AND boxNumber != ''
          )
        `).get(dir, dir) as any)?.count || 0;

        return {
          direction: dir,
          massCount,
          centralCount,
          totalFolders,
          boxesCount
        };
      });

      const totalMass = (db.prepare("SELECT COUNT(*) as count FROM mass_inventory").get() as any)?.count || 0;
      const totalCentral = (db.prepare("SELECT COUNT(*) as count FROM centralized_inventory").get() as any)?.count || 0;
      const grandTotalRecords = totalMass + totalCentral;

      const totalBoxes = (db.prepare(`
        SELECT COUNT(DISTINCT box) as count FROM (
          SELECT numBoite as box FROM mass_inventory WHERE numBoite IS NOT NULL AND numBoite != ''
          UNION
          SELECT boxNumber as box FROM centralized_inventory WHERE boxNumber IS NOT NULL AND boxNumber != ''
        )
      `).get() as any)?.count || 0;

      res.json({
        directionStats,
        totals: {
          totalMass,
          totalCentral,
          grandTotalRecords,
          totalBoxes
        }
      });
    } catch (err: any) {
      console.error("Error fetching directions statistics:", err);
      res.status(500).json({ error: err.message });
    }
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
      const batchId = req.query.batchId || 'all';
      const validatedOnly = req.query.validatedOnly === 'true';
      const showEliminated = req.query.showEliminated === 'true';

      const query = `
        SELECT * FROM mass_inventory 
        WHERE (
          ? IS NULL OR
          reference LIKE ? OR 
          intitule LIKE ? OR 
          dossier LIKE ? OR 
          codeAgence LIKE ? OR
          numBoite LIKE ? OR 
          localisation LIKE ? OR 
          sin LIKE ? OR 
          police LIKE ? OR 
          adherant LIKE ? OR
          batchNumber LIKE ? OR
          inventoryRef LIKE ? OR
          inventoryName LIKE ? OR
          validatedBy LIKE ?
        )
        AND (direction = ? OR ? = 'all')
        AND (batchId = ? OR inventoryRef = ? OR ? = 'all')
        AND (? = 0 OR validatedBy IS NOT NULL OR batchId IS NOT NULL)
        AND (? = 1 OR isEliminated IS NULL OR isEliminated = 0)
        ORDER BY createdAt DESC
        LIMIT 250
      `;

      const results = db.prepare(query).all(
        searchTerm,
        searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, 
        searchTerm, searchTerm, searchTerm, searchTerm,
        searchTerm, searchTerm, searchTerm, searchTerm,
        direction, direction,
        batchId, batchId, batchId,
        validatedOnly ? 1 : 0,
        showEliminated ? 1 : 0
      );

      // Search also in centralized_inventory for both pointed and verified dossiers
      const centralQuery = `
        SELECT 
          'centralized_' || ci.reference AS id,
          ci.reference AS reference,
          ci.intitule AS intitule,
          ci.reference AS dossier,
          ci.boxNumber AS numBoite,
          (COALESCE(b.depot, '') || ' / T: ' || COALESCE(b.travee, '') || ' / Tab: ' || COALESCE(b.tablette, '')) AS localisation,
          ci.direction AS direction,
          ci.isEliminated AS isEliminated,
          ci.scanFile AS scanFile,
          COALESCE(ci.verifiedAt, ci.pointedAt, ci.updatedAt) AS createdAt,
          'centralized' AS sourceType,
          ci.status AS status,
          ci.archivalStatus AS archivalStatus,
          ci.expiryDate AS expiryDate,
          ci.batchId AS batchId,
          ci.batchNumber AS batchNumber,
          ci.inventoryRef AS inventoryRef,
          ci.inventoryName AS inventoryName,
          ci.validatedBy AS validatedBy
        FROM centralized_inventory ci
        LEFT JOIN centralized_boxes b ON ci.boxNumber = b.number
        WHERE (
          ? IS NULL OR
          ci.reference LIKE ? OR 
          ci.intitule LIKE ? OR 
          ci.boxNumber LIKE ? OR 
          COALESCE(b.depot, '') LIKE ? OR
          COALESCE(b.travee, '') LIKE ? OR
          COALESCE(b.tablette, '') LIKE ? OR
          ci.batchNumber LIKE ? OR
          ci.inventoryRef LIKE ? OR
          ci.inventoryName LIKE ? OR
          ci.validatedBy LIKE ?
        )
        AND (ci.status = 'pointed' OR ci.status = 'verified')
        AND (ci.direction = ? OR ? = 'all')
        AND (ci.batchId = ? OR ci.inventoryRef = ? OR ? = 'all')
        AND (? = 0 OR ci.status = 'verified' OR ci.validatedBy IS NOT NULL)
        AND (? = 1 OR ci.isEliminated IS NULL OR ci.isEliminated = 0)
        ORDER BY createdAt DESC
        LIMIT 250
      `;

      const centralResults = db.prepare(centralQuery).all(
        searchTerm,
        searchTerm, searchTerm, searchTerm, 
        searchTerm, searchTerm, searchTerm,
        searchTerm, searchTerm, searchTerm, searchTerm,
        direction, direction,
        batchId, batchId, batchId,
        validatedOnly ? 1 : 0,
        showEliminated ? 1 : 0
      );

      // Merge and deduplicate by reference
      const seen = new Set();
      const blended: any[] = [];
      const commMap = getActiveCommunicationMap();

      // Check if user search query matches communication status or borrower
      const searchRaw = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
      if (searchRaw) {
        commMap.forEach((info, ref) => {
          if (
            (searchRaw.includes('communi') && info.isCommunicated) ||
            (searchRaw.includes('pret') && info.isCommunicated) ||
            (searchRaw.includes('prêt') && info.isCommunicated) ||
            (searchRaw.includes('emprunt') && info.isCommunicated) ||
            (info.borrower && String(info.borrower).toLowerCase().includes(searchRaw))
          ) {
            // Find folder in centralized_inventory or mass_inventory by this ref
            const ci = db.prepare("SELECT 'centralized_' || reference AS id, reference, intitule, boxNumber AS numBoite, direction, 'centralized' AS sourceType, status FROM centralized_inventory WHERE UPPER(reference) = ? LIMIT 1").get(ref) as any;
            if (ci && !seen.has(ci.reference || ci.id)) {
              seen.add(ci.reference || ci.id);
              ci.isCommunicated = info.isCommunicated;
              ci.communicationStatus = info.isCommunicated ? 'Communiqué' : info.status;
              ci.communicationBorrower = info.borrower;
              ci.communicationDate = info.dateComm;
              blended.push(ci);
            }
          }
        });
      }

      for (const item of [...(results || []), ...(centralResults || [])]) {
        const key = item.reference || item.id;
        if (!seen.has(key)) {
          seen.add(key);
          const refKey = String(item.reference || '').trim().toUpperCase();
          const commInfo = commMap.get(refKey);
          if (commInfo && commInfo.isCommunicated) {
            item.isCommunicated = true;
            item.communicationStatus = 'Communiqué';
            item.communicationBorrower = commInfo.borrower;
            item.communicationDate = commInfo.dateComm;
          } else {
            item.isCommunicated = false;
            item.communicationStatus = commInfo ? commInfo.status : 'Disponible';
            item.communicationBorrower = commInfo?.borrower || '';
            item.communicationDate = commInfo?.dateComm || '';
          }
          blended.push(item);
        }
      }

      res.json(blended);
    } catch (err: any) { 
      console.error("Mass search error:", err);
      res.status(500).json({ error: err.message }); 
    }
  });

  app.get("/api/communications/active-map", authenticate, (req: any, res) => {
    try {
      const commMap = getActiveCommunicationMap();
      const obj: Record<string, any> = {};
      commMap.forEach((val, key) => {
        obj[key] = val;
      });
      res.json(obj);
    } catch (err: any) {
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

  app.post("/api/mass-inventory/upload-archive", authenticate, upload.single('file'), (req: any, res) => {
    const userRole = req.user.role;
    if (userRole !== 'Admin' && userRole !== 'Agent' && userRole !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier fourni" });
    }
    res.json({ success: true, filename: req.file.filename });
  });

  // Storage setup for Dossier Scan PDFs
  const SCANS_DIR = path.resolve(process.cwd(), 'data', 'uploads', 'dossier_scans');
  if (!fs.existsSync(SCANS_DIR)) {
    fs.mkdirSync(SCANS_DIR, { recursive: true });
  }

  const scanStorage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, SCANS_DIR); },
    filename: (req, file, cb) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const cleanOriginal = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, `${timestamp}_${cleanOriginal}`);
    }
  });
  const uploadScan = multer({ storage: scanStorage });

  app.post("/api/inventory/:id/upload-scan", authenticate, uploadScan.single('file'), (req: any, res) => {
    const userRole = req.user.role;
    if (userRole !== 'Admin' && userRole !== 'Agent' && userRole !== 'Archivist') {
      return res.status(403).json({ error: "Interdit. Action réservée aux administrateurs, agents ou archivistes." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier fourni" });
    }

    let itemId = String(req.params.id || '').trim();
    if (itemId.startsWith('centralized_')) {
      itemId = itemId.replace('centralized_', '');
    }

    try {
      const fileName = req.file.filename;
      let updated = false;

      // 1. Try mass_inventory by ID
      const massRowById = db.prepare("SELECT id, scanFile FROM mass_inventory WHERE id = ?").get(itemId) as any;
      if (massRowById) {
        let scans: string[] = [];
        try {
          scans = JSON.parse(massRowById.scanFile || '[]');
          if (!Array.isArray(scans)) scans = massRowById.scanFile ? [massRowById.scanFile] : [];
        } catch (e) {
          scans = massRowById.scanFile ? [massRowById.scanFile] : [];
        }
        if (!scans.includes(fileName)) scans.push(fileName);
        db.prepare("UPDATE mass_inventory SET scanFile = ? WHERE id = ?").run(JSON.stringify(scans), massRowById.id);
        updated = true;
      }

      // 2. Try mass_inventory by Reference or Dossier
      if (!updated) {
        const massRowsByRef = db.prepare("SELECT id, scanFile FROM mass_inventory WHERE reference = ? OR dossier = ?").all(itemId, itemId) as any[];
        if (massRowsByRef.length > 0) {
          for (const mRow of massRowsByRef) {
            let scans: string[] = [];
            try {
              scans = JSON.parse(mRow.scanFile || '[]');
              if (!Array.isArray(scans)) scans = mRow.scanFile ? [mRow.scanFile] : [];
            } catch (e) {
              scans = mRow.scanFile ? [mRow.scanFile] : [];
            }
            if (!scans.includes(fileName)) scans.push(fileName);
            db.prepare("UPDATE mass_inventory SET scanFile = ? WHERE id = ?").run(JSON.stringify(scans), mRow.id);
          }
          updated = true;
        }
      }

      // 3. Try centralized_inventory by Reference
      const centralRowByRef = db.prepare("SELECT reference, scanFile FROM centralized_inventory WHERE reference = ?").get(itemId) as any;
      if (centralRowByRef) {
        let scans: string[] = [];
        try {
          scans = JSON.parse(centralRowByRef.scanFile || '[]');
          if (!Array.isArray(scans)) scans = centralRowByRef.scanFile ? [centralRowByRef.scanFile] : [];
        } catch (e) {
          scans = centralRowByRef.scanFile ? [centralRowByRef.scanFile] : [];
        }
        if (!scans.includes(fileName)) scans.push(fileName);
        db.prepare("UPDATE centralized_inventory SET scanFile = ? WHERE reference = ?").run(JSON.stringify(scans), centralRowByRef.reference);
        updated = true;
      }

      // 4. Try centralized_inventory by id
      if (!updated) {
        const centralRowById = db.prepare("SELECT reference, scanFile FROM centralized_inventory WHERE id = ?").get(itemId) as any;
        if (centralRowById) {
          let scans: string[] = [];
          try {
            scans = JSON.parse(centralRowById.scanFile || '[]');
            if (!Array.isArray(scans)) scans = centralRowById.scanFile ? [centralRowById.scanFile] : [];
          } catch (e) {
            scans = centralRowById.scanFile ? [centralRowById.scanFile] : [];
          }
          if (!scans.includes(fileName)) scans.push(fileName);
          db.prepare("UPDATE centralized_inventory SET scanFile = ? WHERE reference = ?").run(JSON.stringify(scans), centralRowById.reference);
          updated = true;
        }
      }

      if (!updated) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(404).json({ error: "Dossier introuvable dans la base d'inventaire" });
      }

      res.json({ success: true, scanFile: fileName });
    } catch (err: any) {
      console.error("Error linking scan file:", err);
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      res.status(500).json({ error: err.message });
    }
  });

  // Helper to extract text from a PDF file using simple stream analysis
  function extractTextFromPdf(filePath: string): string {
    try {
      const buffer = fs.readFileSync(filePath);
      const text = buffer.toString('binary');
      
      // Extract parenthesized ASCII string blocks (Tj commands in PDFs)
      const matches = text.match(/\(([^)]*)\)/g) || [];
      const plainText = matches.map(m => {
        // Strip out parenthesized markers
        let inner = m.slice(1, -1);
        // Replace octal escapes or backslashed chars if needed, but simple string match is enough
        return inner.replace(/\\/g, '');
      }).join(' ');
      
      // Decode hexadecimal string blocks <...>
      const hexMatches = text.match(/<([a-fA-F0-9]{4,})>/g) || [];
      const hexDecoded = hexMatches.map(m => {
        try {
          return Buffer.from(m.slice(1, -1), 'hex').toString('utf-8');
        } catch (e) {
          return '';
        }
      }).join(' ');

      return plainText + ' ' + hexDecoded + ' ' + text;
    } catch (e) {
      console.error("Error reading PDF text:", e);
      return "";
    }
  }

  // Bulk PDF Import with automatic reference parsing and association
  app.post("/api/inventory/import-pdfs", authenticate, uploadScan.array('files'), (req: any, res) => {
    const userRole = req.user.role;
    if (userRole !== 'Admin' && userRole !== 'Agent' && userRole !== 'Archivist') {
      return res.status(403).json({ error: "Interdit. Action réservée aux administrateurs, agents ou archivistes." });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Aucun fichier fourni" });
    }

    try {
      // 1. Fetch all unique references from mass_inventory and centralized_inventory
      const massRefs = db.prepare("SELECT DISTINCT reference FROM mass_inventory WHERE reference IS NOT NULL AND reference != ''").all() as any[];
      const centralRefs = db.prepare("SELECT DISTINCT reference FROM centralized_inventory WHERE reference IS NOT NULL AND reference != ''").all() as any[];
      
      const allRefsSet = new Set<string>();
      massRefs.forEach(r => allRefsSet.add(r.reference));
      centralRefs.forEach(r => allRefsSet.add(r.reference));
      const allReferences = Array.from(allRefsSet);

      const uploadResults: any[] = [];

      // 2. Process each uploaded PDF
      for (const file of req.files) {
        const matchedReferences: string[] = [];
        const cleanFilename = file.originalname.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Extract PDF text for content matching
        const pdfText = extractTextFromPdf(file.path).toLowerCase();
        const cleanPdfText = pdfText.replace(/[^a-z0-9]/g, '');

        for (const ref of allReferences) {
          const cleanRef = ref.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (cleanRef.length < 3) continue; // Skip extremely short references to avoid false positives

          // A: Match on original filename
          const isNameMatch = file.originalname.toLowerCase().includes(ref.toLowerCase()) || 
                             cleanFilename.includes(cleanRef);

          // B: Match on PDF content
          const isContentMatch = pdfText.includes(ref.toLowerCase()) || 
                                cleanPdfText.includes(cleanRef);

          if (isNameMatch || isContentMatch) {
            matchedReferences.push(ref);
          }
        }

        // 3. If matches found, associate with all matched dossiers
        if (matchedReferences.length > 0) {
          for (const ref of matchedReferences) {
            // Update in centralized_inventory
            const centralRow = db.prepare("SELECT scanFile FROM centralized_inventory WHERE reference = ?").get(ref) as any;
            if (centralRow) {
              let centralScanFiles: string[] = [];
              if (centralRow.scanFile) {
                try {
                  centralScanFiles = JSON.parse(centralRow.scanFile);
                  if (!Array.isArray(centralScanFiles)) {
                    centralScanFiles = [centralRow.scanFile];
                  }
                } catch (e) {
                  centralScanFiles = [centralRow.scanFile];
                }
              }
              if (!centralScanFiles.includes(file.filename)) {
                centralScanFiles.push(file.filename);
              }
              db.prepare("UPDATE centralized_inventory SET scanFile = ? WHERE reference = ?")
                .run(JSON.stringify(centralScanFiles), ref);
            }

            // Update in mass_inventory
            const massRows = db.prepare("SELECT id, scanFile FROM mass_inventory WHERE reference = ?").all(ref) as any[];
            for (const mRow of massRows) {
              let massScanFiles: string[] = [];
              if (mRow.scanFile) {
                try {
                  massScanFiles = JSON.parse(mRow.scanFile);
                  if (!Array.isArray(massScanFiles)) {
                    massScanFiles = [mRow.scanFile];
                  }
                } catch (e) {
                  massScanFiles = [mRow.scanFile];
                }
              }
              if (!massScanFiles.includes(file.filename)) {
                massScanFiles.push(file.filename);
              }
              db.prepare("UPDATE mass_inventory SET scanFile = ? WHERE id = ?")
                .run(JSON.stringify(massScanFiles), mRow.id);
            }
          }
        }

        uploadResults.push({
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          matches: matchedReferences,
          status: matchedReferences.length > 0 ? 'associated' : 'unassociated'
        });
      }

      res.json({ success: true, results: uploadResults });
    } catch (err: any) {
      console.error("Bulk PDF Import Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get list of unassociated PDF scans
  app.get("/api/inventory/unassociated-pdfs", authenticate, (req: any, res) => {
    try {
      const uploadDir = path.resolve(process.cwd(), 'data', 'uploads', 'dossier_scans');
      if (!fs.existsSync(uploadDir)) {
        return res.json([]);
      }
      const files = fs.readdirSync(uploadDir).filter(f => f.toLowerCase().endsWith('.pdf'));

      const massRows = db.prepare("SELECT scanFile FROM mass_inventory WHERE scanFile IS NOT NULL").all() as any[];
      const centralRows = db.prepare("SELECT scanFile FROM centralized_inventory WHERE scanFile IS NOT NULL").all() as any[];
      
      const associatedFiles = new Set<string>();
      const addAssociated = (val: string) => {
        if (!val) return;
        try {
          if (val.trim().startsWith('[') && val.trim().endsWith(']')) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              parsed.forEach(f => associatedFiles.add(f));
              return;
            }
          }
        } catch (e) {}
        associatedFiles.add(val);
      };

      massRows.forEach(row => addAssociated(row.scanFile));
      centralRows.forEach(row => addAssociated(row.scanFile));

      const unassociatedList = files
        .filter(f => !associatedFiles.has(f))
        .map(filename => {
          const filePath = path.join(uploadDir, filename);
          const stats = fs.statSync(filePath);
          const parts = filename.split('_');
          const originalName = parts.length > 1 ? parts.slice(1).join('_') : filename;
          return {
            filename,
            originalName,
            size: stats.size,
            createdAt: stats.birthtime.toISOString()
          };
        });

      res.json(unassociatedList);
    } catch (err: any) {
      console.error("Unassociated PDFs Fetch Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Manually associate a PDF file with a dossier reference
  app.post("/api/inventory/associate-pdf", authenticate, (req: any, res) => {
    const userRole = req.user.role;
    if (userRole !== 'Admin' && userRole !== 'Agent' && userRole !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    const { filename, reference } = req.body;
    if (!filename || !reference) {
      return res.status(400).json({ error: "Nom de fichier et référence requis" });
    }
    try {
      let updatedCount = 0;

      // Update in centralized_inventory
      const centralRow = db.prepare("SELECT scanFile FROM centralized_inventory WHERE reference = ?").get(reference) as any;
      if (centralRow) {
        let centralScanFiles: string[] = [];
        if (centralRow.scanFile) {
          try {
            centralScanFiles = JSON.parse(centralRow.scanFile);
            if (!Array.isArray(centralScanFiles)) {
              centralScanFiles = [centralRow.scanFile];
            }
          } catch (e) {
            centralScanFiles = [centralRow.scanFile];
          }
        }
        if (!centralScanFiles.includes(filename)) {
          centralScanFiles.push(filename);
        }
        db.prepare("UPDATE centralized_inventory SET scanFile = ? WHERE reference = ?")
          .run(JSON.stringify(centralScanFiles), reference);
        updatedCount++;
      }

      // Update in mass_inventory
      const massRows = db.prepare("SELECT id, scanFile FROM mass_inventory WHERE reference = ?").all(reference) as any[];
      for (const mRow of massRows) {
        let massScanFiles: string[] = [];
        if (mRow.scanFile) {
          try {
            massScanFiles = JSON.parse(mRow.scanFile);
            if (!Array.isArray(massScanFiles)) {
              massScanFiles = [mRow.scanFile];
            }
          } catch (e) {
            massScanFiles = [mRow.scanFile];
          }
        }
        if (!massScanFiles.includes(filename)) {
          massScanFiles.push(filename);
        }
        db.prepare("UPDATE mass_inventory SET scanFile = ? WHERE id = ?")
          .run(JSON.stringify(massScanFiles), mRow.id);
        updatedCount++;
      }

      if (updatedCount === 0) {
        return res.status(404).json({ error: `Dossier avec la référence ${reference} introuvable` });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Manual Association Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Dissociate a PDF from a dossier reference
  app.post("/api/inventory/dissociate-pdf", authenticate, (req: any, res) => {
    const userRole = req.user.role;
    if (userRole !== 'Admin' && userRole !== 'Agent' && userRole !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    const { filename, reference } = req.body;
    if (!filename || !reference) {
      return res.status(400).json({ error: "Nom de fichier et référence requis" });
    }
    try {
      // Centralized
      const centralRow = db.prepare("SELECT scanFile FROM centralized_inventory WHERE reference = ?").get(reference) as any;
      if (centralRow && centralRow.scanFile) {
        let centralScanFiles: string[] = [];
        try {
          centralScanFiles = JSON.parse(centralRow.scanFile);
          if (!Array.isArray(centralScanFiles)) {
            centralScanFiles = [centralRow.scanFile];
          }
        } catch (e) {
          centralScanFiles = [centralRow.scanFile];
        }
        const updated = centralScanFiles.filter(f => f !== filename);
        const newVal = updated.length > 0 ? JSON.stringify(updated) : null;
        db.prepare("UPDATE centralized_inventory SET scanFile = ? WHERE reference = ?").run(newVal, reference);
      }

      // Mass
      const massRows = db.prepare("SELECT id, scanFile FROM mass_inventory WHERE reference = ?").all(reference) as any[];
      for (const mRow of massRows) {
        if (mRow.scanFile) {
          let massScanFiles: string[] = [];
          try {
            massScanFiles = JSON.parse(mRow.scanFile);
            if (!Array.isArray(massScanFiles)) {
              massScanFiles = [mRow.scanFile];
            }
          } catch (e) {
            massScanFiles = [mRow.scanFile];
          }
          const updated = massScanFiles.filter(f => f !== filename);
          const newVal = updated.length > 0 ? JSON.stringify(updated) : null;
          db.prepare("UPDATE mass_inventory SET scanFile = ? WHERE id = ?").run(newVal, mRow.id);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("PDF Dissociation Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete an unassociated PDF from the server entirely
  app.delete("/api/inventory/unassociated-pdfs/:filename", authenticate, (req: any, res) => {
    const userRole = req.user.role;
    if (userRole !== 'Admin' && userRole !== 'Agent' && userRole !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    const filename = req.params.filename;
    try {
      const safeFilename = path.basename(filename);
      const filePath = path.resolve(process.cwd(), 'data', 'uploads', 'dossier_scans', safeFilename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Unassociated PDF Deletion Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/scans/:filename", (req: any, res) => {
    try {
      let filename = req.params.filename || '';
      
      // Handle potential JSON string or encoded JSON
      try {
        if (filename.startsWith('[') || filename.startsWith('%5B') || filename.startsWith('%22') || filename.startsWith('"')) {
          const decoded = decodeURIComponent(filename);
          if (decoded.startsWith('[') && decoded.endsWith(']')) {
            const parsed = JSON.parse(decoded);
            if (Array.isArray(parsed) && parsed.length > 0) {
              filename = parsed[0];
            }
          }
        }
      } catch (e) {}

      filename = String(filename).replace(/^[\["']+|[\]"']+$/g, '').trim();
      const safeFilename = path.basename(filename);
      const filePath = path.resolve(process.cwd(), 'data', 'uploads', 'dossier_scans', safeFilename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Fichier scan introuvable: ${safeFilename}` });
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
      res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/inventory/:id/delete-scan", authenticate, (req: any, res) => {
    const userRole = req.user.role;
    if (userRole !== 'Admin' && userRole !== 'Agent' && userRole !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    let itemId = String(req.params.id || '').trim();
    if (itemId.startsWith('centralized_')) {
      itemId = itemId.replace('centralized_', '');
    }

    try {
      const specificFilename = req.query.filename || req.body?.filename;
      let filenamesToDelete: string[] = [];

      const massRows = db.prepare("SELECT id, scanFile FROM mass_inventory WHERE id = ? OR reference = ?").all(itemId, itemId) as any[];
      for (const mRow of massRows) {
        if (mRow.scanFile) {
          let scans: string[] = [];
          try {
            scans = JSON.parse(mRow.scanFile);
            if (!Array.isArray(scans)) scans = [mRow.scanFile];
          } catch (e) {
            scans = [mRow.scanFile];
          }
          if (specificFilename) {
            filenamesToDelete.push(specificFilename);
            scans = scans.filter(s => s !== specificFilename);
            db.prepare("UPDATE mass_inventory SET scanFile = ? WHERE id = ?").run(scans.length > 0 ? JSON.stringify(scans) : null, mRow.id);
          } else {
            filenamesToDelete.push(...scans);
            db.prepare("UPDATE mass_inventory SET scanFile = NULL WHERE id = ?").run(mRow.id);
          }
        }
      }

      const centralRows = db.prepare("SELECT reference, scanFile FROM centralized_inventory WHERE reference = ? OR id = ?").all(itemId, itemId) as any[];
      for (const cRow of centralRows) {
        if (cRow.scanFile) {
          let scans: string[] = [];
          try {
            scans = JSON.parse(cRow.scanFile);
            if (!Array.isArray(scans)) scans = [cRow.scanFile];
          } catch (e) {
            scans = [cRow.scanFile];
          }
          if (specificFilename) {
            filenamesToDelete.push(specificFilename);
            scans = scans.filter(s => s !== specificFilename);
            db.prepare("UPDATE centralized_inventory SET scanFile = ? WHERE reference = ?").run(scans.length > 0 ? JSON.stringify(scans) : null, cRow.reference);
          } else {
            filenamesToDelete.push(...scans);
            db.prepare("UPDATE centralized_inventory SET scanFile = NULL WHERE reference = ?").run(cRow.reference);
          }
        }
      }

      // Delete files from filesystem
      for (const fn of filenamesToDelete) {
        if (!fn) continue;
        const safeFn = path.basename(fn.replace(/^[\["']+|[\]"']+$/g, '').trim());
        const filePath = path.resolve(process.cwd(), 'data', 'uploads', 'dossier_scans', safeFn);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) {}
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting scan:", err);
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

  app.post("/api/mass-inventory/bulk-lookup", authenticate, (req: any, res) => {
    try {
      const { references } = req.body;
      if (!Array.isArray(references)) {
        return res.status(400).json({ error: "Le paramètre references doit être un tableau." });
      }

      const commMap = getActiveCommunicationMap();
      const results = [];

      const selectVerifiedStmt = db.prepare(`
        SELECT ci.*, 
               (COALESCE(b.depot, '') || ' / T: ' || COALESCE(b.travee, '') || ' / Tab: ' || COALESCE(b.tablette, '')) AS location 
        FROM centralized_inventory ci
        LEFT JOIN centralized_boxes b ON ci.boxNumber = b.number
        WHERE LOWER(TRIM(ci.reference)) = ? AND ci.status = 'verified'
        LIMIT 1
      `);

      const selectGeneralStmt = db.prepare(`
        SELECT ci.*, 
               (COALESCE(b.depot, '') || ' / T: ' || COALESCE(b.travee, '') || ' / Tab: ' || COALESCE(b.tablette, '')) AS location 
        FROM centralized_inventory ci
        LEFT JOIN centralized_boxes b ON ci.boxNumber = b.number
        WHERE LOWER(TRIM(ci.reference)) = ?
        LIMIT 1
      `);

      const selectMassStmt = db.prepare(`
        SELECT * FROM mass_inventory WHERE LOWER(TRIM(reference)) = ? LIMIT 1
      `);

      for (const rawRef of references) {
        const ref = String(rawRef).trim();
        if (!ref) continue;
        const refLower = ref.toLowerCase();
        const refUpper = ref.toUpperCase();
        const commInfo = commMap.get(refUpper);

        let foundItem: any = null;

        // 1. Search in validated database (centralized_inventory with status = 'verified')
        const verifiedRow = selectVerifiedStmt.get(refLower) as any;
        if (verifiedRow) {
          foundItem = {
            reference: verifiedRow.reference,
            intitule: verifiedRow.intitule || '',
            numBoite: verifiedRow.boxNumber || '',
            localisation: verifiedRow.location || '',
            direction: verifiedRow.direction || '',
            status: "Validé par responsable",
            validationStatus: "Validé par responsable",
            found: true
          };
        }

        // 2. Fallback to general centralized_inventory (including non-verified)
        if (!foundItem) {
          const generalRow = selectGeneralStmt.get(refLower) as any;
          if (generalRow) {
            foundItem = {
              reference: generalRow.reference,
              intitule: generalRow.intitule || '',
              numBoite: generalRow.boxNumber || '',
              localisation: generalRow.location || '',
              direction: generalRow.direction || '',
              status: generalRow.status === 'pointed' ? "Pointé (en attente)" : "En attente",
              validationStatus: generalRow.status === 'pointed' ? "Pointé (en attente)" : "En attente",
              found: true
            };
          }
        }

        // 3. Fallback to mass_inventory
        if (!foundItem) {
          const massRow = selectMassStmt.get(refLower) as any;
          if (massRow) {
            foundItem = {
              reference: massRow.reference,
              intitule: massRow.intitule || '',
              numBoite: massRow.numBoite || '',
              localisation: massRow.localisation || '',
              direction: massRow.direction || '',
              status: "Inventaire de masse",
              validationStatus: "Inventaire de masse",
              found: true
            };
          }
        }

        if (foundItem) {
          if (commInfo && commInfo.isCommunicated) {
            foundItem.isCommunicated = true;
            foundItem.communicationStatus = "Communiqué";
            foundItem.communicationBorrower = commInfo.borrower;
            foundItem.communicationDate = commInfo.dateComm;
            foundItem.borrower = commInfo.borrower;
            foundItem.dateCommunication = commInfo.dateComm;
          } else {
            foundItem.isCommunicated = false;
            foundItem.communicationStatus = commInfo ? commInfo.status : "Disponible";
            foundItem.communicationBorrower = commInfo?.borrower || '';
            foundItem.communicationDate = commInfo?.dateComm || '';
            foundItem.borrower = commInfo?.borrower;
            foundItem.dateCommunication = commInfo?.dateComm;
          }
          results.push(foundItem);
        } else {
          results.push({
            reference: ref,
            intitule: '',
            numBoite: '',
            localisation: '',
            direction: '',
            status: commInfo && commInfo.isCommunicated ? "Communiqué" : "Non trouvé",
            validationStatus: "Non trouvé",
            isCommunicated: commInfo ? commInfo.isCommunicated : false,
            communicationStatus: commInfo ? (commInfo.isCommunicated ? "Communiqué" : commInfo.status) : "Non trouvé",
            communicationBorrower: commInfo?.borrower || '',
            communicationDate: commInfo?.dateComm || '',
            borrower: commInfo?.borrower,
            dateCommunication: commInfo?.dateComm,
            found: false
          });
        }
      }

      res.json(results);
    } catch (err: any) {
      console.error("Bulk lookup error:", err);
      res.status(500).json({ error: err.message });
    }
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

      // Analyze verified folders in Centralized Inventory
      const allCentral = db.prepare("SELECT * FROM centralized_inventory WHERE status = 'verified' AND (archivalStatus != 'Expired' OR archivalStatus IS NULL)").all();
      const updateCentralStmt = db.prepare("UPDATE centralized_inventory SET archivalStatus = ?, expiryDate = ?, direction = ?, intitule = ? WHERE reference = ?");
      
      db.transaction(() => {
        for (const item of allCentral) {
          const archival = calculateArchivalStatus(item, rules);
          const matchedRule = rules.find(r => r.id === (archival.ruleId || item.ruleId));
          const dir = matchedRule ? matchedRule.direction : item.direction;
          const title = matchedRule ? matchedRule.title : item.intitule;
          if (archival.status !== item.archivalStatus || archival.expiryDate !== item.expiryDate || dir !== item.direction || title !== item.intitule) {
            updateCentralStmt.run(archival.status, archival.expiryDate, dir, title, item.reference);
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

  const getArchivalRules = (req: any, res: any) => {
    try {
      const results = db.prepare("SELECT * FROM archival_directory ORDER BY reference ASC").all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  };
  app.get("/api/archival-rules", authenticate, getArchivalRules);
  app.get("/api/archival-directory", authenticate, getArchivalRules);

  const clearArchivalRules = (req: any, res: any) => {
    const role = req.user.role;
    if (role !== 'Admin' && role !== 'Agent' && role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      console.log("CLEARING ARCHIVAL DIRECTORY/RULES...");
      db.transaction(() => {
        db.prepare("DELETE FROM archival_directory").run();
        // Also reset any items that were linked to these rules
        db.prepare("UPDATE mass_inventory SET ruleId = NULL, archivalStatus = 'Active'").run();
      })();
      res.json({ success: true, message: "Calendrier vidé et statuts réinitialisés." });
    } catch (err: any) { 
      console.error("Clear archival rules error:", err);
      res.status(500).json({ error: err.message }); 
    }
  };
  app.post("/api/archival-rules/clear", authenticate, clearArchivalRules);
  app.post("/api/archival-directory/clear", authenticate, clearArchivalRules);

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

  const importArchivalRules = (req: any, res: any) => {
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
  };
  app.post("/api/archival-rules/import", authenticate, importArchivalRules);
  app.post("/api/archival-directory/import", authenticate, importArchivalRules);

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
      // Proposals from both mass inventory and centralized inventory
      const results = db.prepare(`
        SELECT er.id as requestId, mi.id, mi.reference, mi.intitule, mi.direction, mi.numBoite, mi.localisation, mi.dateCloture, mi.archivalStatus, mi.ruleId, ad.title as ruleTitle, ad.finalDisposition, ad.reference as ruleRef, 'mass' as src
        FROM elimination_requests er
        JOIN mass_inventory mi ON er.inventoryId = mi.id
        LEFT JOIN archival_directory ad ON mi.ruleId = ad.id
        WHERE er.status = 'Pending'

        UNION ALL

        SELECT er.id as requestId, ci.reference as id, ci.reference, ci.intitule, ci.direction, ci.boxNumber as numBoite, (cb.depot || ' - ' || cb.travee || ' - T' || cb.tablette) as localisation, ci.dateCloture, ci.archivalStatus, ci.ruleId, ad.title as ruleTitle, ad.finalDisposition, ad.reference as ruleRef, 'central' as src
        FROM elimination_requests er
        JOIN centralized_inventory ci ON er.inventoryId = ci.reference
        LEFT JOIN centralized_boxes cb ON ci.boxNumber = cb.number
        LEFT JOIN archival_directory ad ON ci.ruleId = ad.id
        WHERE er.status = 'Pending'
        ORDER BY requestId DESC
      `).all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/elimination/eligible", authenticate, (req: any, res) => {
    try {
      // Eligible items are Expired items from both mass_inventory and verified centralized_inventory NOT yet in any elimination_requests
      const results = db.prepare(`
        SELECT mi.id, mi.reference, mi.intitule, mi.direction, mi.numBoite, mi.localisation, mi.dateCloture, mi.archivalStatus, mi.ruleId, ad.title as ruleTitle, ad.finalDisposition, ad.reference as ruleRef, 'mass' as src
        FROM mass_inventory mi
        LEFT JOIN archival_directory ad ON mi.ruleId = ad.id
        LEFT JOIN elimination_requests er ON mi.id = er.inventoryId
        WHERE mi.archivalStatus = 'Expired' 
        AND (er.id IS NULL)
        AND (mi.isEliminated IS NULL OR mi.isEliminated = 0)

        UNION ALL

        SELECT ci.reference as id, ci.reference, ci.intitule, ci.direction, ci.boxNumber as numBoite, (cb.depot || ' - ' || cb.travee || ' - T' || cb.tablette) as localisation, ci.dateCloture, ci.archivalStatus, ci.ruleId, ad.title as ruleTitle, ad.finalDisposition, ad.reference as ruleRef, 'central' as src
        FROM centralized_inventory ci
        LEFT JOIN archival_directory ad ON ci.ruleId = ad.id
        LEFT JOIN centralized_boxes cb ON ci.boxNumber = cb.number
        LEFT JOIN elimination_requests er ON ci.reference = er.inventoryId
        WHERE ci.archivalStatus = 'Expired'
        AND ci.status = 'verified'
        AND (er.id IS NULL)
        AND (ci.isEliminated IS NULL OR ci.isEliminated = 0)
        LIMIT 1000
      `).all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/elimination/pending-pv", authenticate, (req: any, res) => {
    try {
      const results = db.prepare(`
        SELECT er.id as id, er.id as requestId, mi.reference, mi.intitule, mi.direction, ad.finalDisposition, er.requestedBy as submittedBy, er.status, er.createdAt
        FROM elimination_requests er
        JOIN mass_inventory mi ON er.inventoryId = mi.id
        LEFT JOIN archival_directory ad ON mi.ruleId = ad.id
        WHERE er.status = 'Pending'

        UNION ALL

        SELECT er.id as id, er.id as requestId, ci.reference, ci.intitule, ci.direction, ad.finalDisposition, er.requestedBy as submittedBy, er.status, er.createdAt
        FROM elimination_requests er
        JOIN centralized_inventory ci ON er.inventoryId = ci.reference
        LEFT JOIN archival_directory ad ON ci.ruleId = ad.id
        WHERE er.status = 'Pending'
        
        ORDER BY id DESC
      `).all() as any[];

      const mapped = results.map((r, index) => ({
        ...r,
        pvNumber: `PV-2026-${String(index + 1).padStart(4, '0')}`
      }));

      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/elimination/requests", authenticate, (req: any, res) => {
    try {
      const results = db.prepare(`
        SELECT er.id as id, er.id as requestId, mi.reference, mi.intitule, mi.direction, ad.finalDisposition, er.requestedBy as submittedBy, er.status, er.createdAt
        FROM elimination_requests er
        JOIN mass_inventory mi ON er.inventoryId = mi.id
        LEFT JOIN archival_directory ad ON mi.ruleId = ad.id

        UNION ALL

        SELECT er.id as id, er.id as requestId, ci.reference, ci.intitule, ci.direction, ad.finalDisposition, er.requestedBy as submittedBy, er.status, er.createdAt
        FROM elimination_requests er
        JOIN centralized_inventory ci ON er.inventoryId = ci.reference
        LEFT JOIN archival_directory ad ON ci.ruleId = ad.id
        
        ORDER BY id DESC
      `).all() as any[];

      const mapped = results.map((r, index) => ({
        ...r,
        pvNumber: `PV-2026-${String(index + 1).padStart(4, '0')}`
      }));

      res.json(mapped);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/elimination/validate-pv", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Archivist' && req.user.role !== 'Responsable') return res.status(403).json({ error: "Interdit" });
    try {
      const { requestIds } = req.body;
      const today = new Date().toISOString();
      const approvedBy = req.user?.displayName || req.user?.email || 'Responsable';

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

      const updateCentral = db.prepare(`
        UPDATE centralized_inventory
        SET isEliminated = 1, archivalStatus = 'Eliminated'
        WHERE reference = (SELECT inventoryId FROM elimination_requests WHERE id = ?)
      `);

      // Find boxes associated with these elimination requests to free space
      const findEliminatedBoxes = db.prepare(`
        SELECT mi.numBoite as boxNumber
        FROM elimination_requests er
        JOIN mass_inventory mi ON er.inventoryId = mi.id
        WHERE er.id = ? AND mi.numBoite IS NOT NULL AND mi.numBoite != ''

        UNION

        SELECT ci.boxNumber as boxNumber
        FROM elimination_requests er
        JOIN centralized_inventory ci ON er.inventoryId = ci.reference
        WHERE er.id = ? AND ci.boxNumber IS NOT NULL AND ci.boxNumber != ''
      `);

      const freedBoxes: string[] = [];

      db.transaction(() => {
        for (const rid of requestIds) {
          try {
            const boxRows = findEliminatedBoxes.all(rid) as any[];
            for (const bRow of boxRows) {
              if (bRow.boxNumber) freedBoxes.push(bRow.boxNumber);
            }
          } catch (e) {}

          updateRequest.run(approvedBy, today, rid);
          updateInventory.run(rid);
          updateCentral.run(rid);
        }

        // Check each freed box: if no remaining active folders exist in that box, remove its allocation from storage shelves
        for (const boxNum of freedBoxes) {
          const remainingMass = db.prepare("SELECT COUNT(*) as c FROM mass_inventory WHERE numBoite = ? AND (isEliminated = 0 OR isEliminated IS NULL)").get(boxNum) as any;
          const remainingCentral = db.prepare("SELECT COUNT(*) as c FROM centralized_inventory WHERE boxNumber = ? AND (isEliminated = 0 OR isEliminated IS NULL)").get(boxNum) as any;
          
          if ((remainingMass?.c || 0) === 0 && (remainingCentral?.c || 0) === 0) {
            db.prepare("DELETE FROM storage_box_allocations WHERE boxNumber = ?").run(boxNum);
          }
        }

        // Record history log
        if (freedBoxes.length > 0) {
          try {
            db.prepare(`
              INSERT INTO storage_history (id, action, targetType, targetName, user, timestamp, details)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              `hist_${Date.now()}`,
              'ELIMINATION_VALIDEE',
              'BOITES_ELIMINEES',
              `${freedBoxes.length} boîte(s) traitée(s)`,
              approvedBy,
              today,
              `Élimination validée : libération automatique des tablettes pour ${freedBoxes.length} boîte(s) dans le plan 3D/2D.`
            );
          } catch (e) {}
        }
      })();

      res.json({ success: true, count: requestIds.length, freedBoxesCount: freedBoxes.length });
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
        SELECT er.*, mi.reference, mi.intitule, mi.direction, mi.numBoite, mi.localisation, 'mass' as src
        FROM elimination_requests er
        JOIN mass_inventory mi ON er.inventoryId = mi.id
        WHERE er.status = 'Approved' OR er.status = 'Eliminated'
        
        UNION ALL

        SELECT er.*, ci.reference, ci.intitule, ci.direction, ci.boxNumber as numBoite, (cb.depot || ' - ' || cb.travee || ' - T' || cb.tablette) as localisation, 'central' as src
        FROM elimination_requests er
        JOIN centralized_inventory ci ON er.inventoryId = ci.reference
        LEFT JOIN centralized_boxes cb ON ci.boxNumber = cb.number
        WHERE er.status = 'Approved' OR er.status = 'Eliminated'
        ORDER BY er.eliminationDate DESC
      `).all();
      res.json(results);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  const createArchivalRule = (req: any, res: any) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      const r = req.body;
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO archival_directory (id, reference, title, direction, docType, activeYears, semiActiveYears, finalDisposition, support, retentionTrigger, isCritical, category, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, r.reference, r.title, r.direction, r.docType, r.activeYears || 0, r.semiActiveYears || 0, r.finalDisposition, r.support, r.retentionTrigger, r.isCritical ? 1 : 0, r.category || 'Général', new Date().toISOString());
      res.json({ success: true, id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  };
  app.post("/api/archival-rules", authenticate, createArchivalRule);
  app.post("/api/archival-directory", authenticate, createArchivalRule);

  const updateArchivalRule = (req: any, res: any) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
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
  };
  app.patch("/api/archival-rules/:id", authenticate, updateArchivalRule);
  app.patch("/api/archival-directory/:id", authenticate, updateArchivalRule);

  const deleteArchivalRule = (req: any, res: any) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      db.prepare("DELETE FROM archival_directory WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  };
  app.delete("/api/archival-rules/:id", authenticate, deleteArchivalRule);
  app.delete("/api/archival-directory/:id", authenticate, deleteArchivalRule);

  const clearDirectionArchivalRules = (req: any, res: any) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') return res.status(403).json({ error: "Interdit" });
    try {
      const { direction } = req.body;
      if (!direction) return res.status(400).json({ error: "Direction manquante" });
      db.prepare("DELETE FROM archival_directory WHERE direction = ?").run(direction);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  };
  app.post("/api/archival-rules/direction/clear", authenticate, clearDirectionArchivalRules);
  app.post("/api/archival-directory/direction/clear", authenticate, clearDirectionArchivalRules);

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

  app.get("/api/returns/audit-search", authenticate, (req: any, res) => {
    try {
      const searchRaw = req.query.search ? String(req.query.search).trim() : '';
      const searchTerm = searchRaw ? `%${searchRaw}%` : null;
      const direction = req.query.direction || 'all';
      const statusFilter = req.query.status || 'all'; // 'all', 'communicated', 'available'

      const commMap = getActiveCommunicationMap();

      // Query verified items from centralized_inventory
      const centralQuery = `
        SELECT 
          'centralized_' || ci.reference AS id,
          ci.reference AS reference,
          ci.intitule AS intitule,
          ci.boxNumber AS numBoite,
          COALESCE(b.depot, '') AS depot,
          COALESCE(b.travee, '') AS travee,
          COALESCE(b.tablette, '') AS tablette,
          CASE 
            WHEN b.depot IS NOT NULL AND b.depot != '' THEN 
              (COALESCE(b.depot, '') || '-' || COALESCE(b.travee, '') || '-' || COALESCE(b.tablette, ''))
            ELSE (COALESCE(b.depot, '') || ' / T: ' || COALESCE(b.travee, '') || ' / Tab: ' || COALESCE(b.tablette, ''))
          END AS localisation,
          ci.direction AS direction,
          ci.batchId AS batchId,
          ci.batchNumber AS batchNumber,
          ci.inventoryRef AS inventoryRef,
          ci.inventoryName AS inventoryName,
          ci.validatedBy AS validatedBy,
          ci.status AS status,
          ci.archivalStatus AS archivalStatus,
          ci.expiryDate AS expiryDate,
          ci.scanFile AS scanFile,
          'centralized' AS sourceType
        FROM centralized_inventory ci
        LEFT JOIN centralized_boxes b ON ci.boxNumber = b.number
        WHERE (ci.status = 'verified' OR ci.validatedBy IS NOT NULL OR ci.batchId IN (SELECT id FROM integration_batches WHERE status = 'validé'))
        AND (ci.isEliminated IS NULL OR ci.isEliminated = 0)
        AND (? IS NULL OR 
             ci.reference LIKE ? OR 
             ci.intitule LIKE ? OR 
             ci.boxNumber LIKE ? OR 
             COALESCE(b.depot, '') LIKE ? OR 
             COALESCE(b.travee, '') LIKE ? OR 
             COALESCE(b.tablette, '') LIKE ? OR
             ci.batchNumber LIKE ? OR 
             ci.validatedBy LIKE ?)
        AND (ci.direction = ? OR ? = 'all')
        ORDER BY ci.updatedAt DESC
        LIMIT 300
      `;

      const centralItems = db.prepare(centralQuery).all(
        searchTerm,
        searchTerm, searchTerm, searchTerm,
        searchTerm, searchTerm, searchTerm,
        searchTerm, searchTerm,
        direction, direction
      );

      // Query verified items from mass_inventory
      const massQuery = `
        SELECT 
          id,
          reference,
          intitule,
          numBoite,
          localisation,
          direction,
          batchId,
          batchNumber,
          inventoryRef,
          inventoryName,
          validatedBy,
          archivalStatus,
          expiryDate,
          scanFile,
          'mass' AS sourceType
        FROM mass_inventory
        WHERE (validatedBy IS NOT NULL OR batchId IN (SELECT id FROM integration_batches WHERE status = 'validé'))
        AND (isEliminated IS NULL OR isEliminated = 0)
        AND (? IS NULL OR 
             reference LIKE ? OR 
             intitule LIKE ? OR 
             numBoite LIKE ? OR 
             localisation LIKE ? OR 
             batchNumber LIKE ? OR 
             validatedBy LIKE ? OR 
             sin LIKE ? OR 
             police LIKE ? OR 
             adherant LIKE ?)
        AND (direction = ? OR ? = 'all')
        ORDER BY createdAt DESC
        LIMIT 300
      `;

      const massItems = db.prepare(massQuery).all(
        searchTerm,
        searchTerm, searchTerm, searchTerm,
        searchTerm, searchTerm, searchTerm,
        searchTerm, searchTerm, searchTerm,
        direction, direction
      );

      // Deduplicate and decorate with communication status
      const seen = new Set<string>();
      const results: any[] = [];

      for (const item of [...(centralItems || []), ...(massItems || [])]) {
        const refKey = String(item.reference || '').trim().toUpperCase();
        if (!refKey || seen.has(refKey)) continue;
        seen.add(refKey);

        const commInfo = commMap.get(refKey);
        const isComm = Boolean(commInfo && commInfo.isCommunicated);

        item.isCommunicated = isComm;
        item.communicationStatus = isComm ? 'Communiqué' : (commInfo ? commInfo.status : 'Disponible');
        item.communicationBorrower = commInfo ? commInfo.borrower : '';
        item.communicationDate = commInfo ? commInfo.dateComm : '';

        // Status filter
        if (statusFilter === 'communicated' && !isComm) continue;
        if (statusFilter === 'available' && isComm) continue;

        results.push(item);
      }

      res.json(results);
    } catch (err: any) {
      console.error("Audit returns search error:", err);
      res.status(500).json({ error: err.message });
    }
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

  app.post("/api/returns/bulk-lookup", authenticate, (req: any, res) => {
    try {
      const { references } = req.body;
      if (!Array.isArray(references)) {
        return res.status(400).json({ error: "Le paramètre references doit être un tableau." });
      }

      const returnsInv = readData('returns_inventory') || [];
      const results = [];

      for (const rawRef of references) {
        const ref = String(rawRef).trim();
        if (!ref) continue;
        const refLower = ref.toLowerCase();

        let foundItem: any = null;

        // 1. Check returns_inventory
        const fromReturnInv = returnsInv.find((i: any) => i.reference && String(i.reference).trim().toLowerCase() === refLower);
        if (fromReturnInv) {
          foundItem = {
            reference: fromReturnInv.reference,
            numBoite: fromReturnInv.numBoite || '',
            localisation: fromReturnInv.localisation || '',
            intitule: fromReturnInv.intitule || '',
            source: "Importation Réintégration"
          };
        }

        // 2. Check mass_inventory
        if (!foundItem) {
          const fromMass = db.prepare("SELECT * FROM mass_inventory WHERE LOWER(TRIM(reference)) = ? LIMIT 1").get(refLower) as any;
          if (fromMass) {
            foundItem = {
              reference: fromMass.reference,
              numBoite: fromMass.numBoite || '',
              localisation: fromMass.localisation || '',
              intitule: fromMass.intitule || '',
              source: "Inventaire de Masse"
            };
          }
        }

        // 3. Check centralized_inventory
        if (!foundItem) {
          const fromCentral = db.prepare(`
            SELECT ci.*, (COALESCE(b.depot, '') || ' / T: ' || COALESCE(b.travee, '') || ' / Tab: ' || COALESCE(b.tablette, '')) AS location 
            FROM centralized_inventory ci
            LEFT JOIN centralized_boxes b ON ci.boxNumber = b.number
            WHERE LOWER(TRIM(ci.reference)) = ? LIMIT 1
          `).get(refLower) as any;
          if (fromCentral) {
            foundItem = {
              reference: fromCentral.reference,
              numBoite: fromCentral.boxNumber || '',
              localisation: fromCentral.location || '',
              intitule: fromCentral.intitule || '',
              source: "Inventaire Centralisé"
            };
          }
        }

        if (foundItem) {
          results.push({
            ...foundItem,
            found: true
          });
        } else {
          results.push({
            reference: ref,
            numBoite: "Non trouvé",
            localisation: "Non trouvé",
            intitule: "",
            found: false,
            source: "Inconnu"
          });
        }
      }

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/returns/bulk-validate", authenticate, (req: any, res) => {
    try {
      const { items } = req.body; // array of { reference, numBoite, localisation }
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "items doit être un tableau." });
      }

      const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const todayTime = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      // 1. Record in History
      const histData = readData('returns_history') || [];
      const newEntries = items.map((item: any) => ({
        id: crypto.randomUUID(),
        reference: item.reference,
        numBoite: item.numBoite,
        localisation: item.localisation,
        dateRetour: todayTime,
        barcodeData: `${item.numBoite}-${item.localisation}`,
        returnedAt: new Date().toISOString()
      }));
      
      const updatedHist = [...histData, ...newEntries];
      writeData('returns_history', updatedHist);

      // 2. Synchronize with requests (Agent Requests)
      const requestsData = readData('requests') || [];
      let requestsChanged = false;
      
      // 3. Synchronize with remote_requests
      const remoteRequestsData = readData('remote_requests') || [];
      let remoteRequestsChanged = false;

      // 4. Synchronize with archives
      const archivesData = readData('archives') || [];
      let archivesChanged = false;

      for (const item of items) {
        const refToMatch = String(item.reference).trim().toLowerCase();

        // Update Agent Requests
        requestsData.forEach((r: any) => {
          if (r.status === 'signed') {
            const hasRef = Array.isArray(r.references) 
              ? r.references.some((ref: any) => String(ref).trim().toLowerCase() === refToMatch) 
              : String(r.intitule).trim().toLowerCase() === refToMatch;
            if (hasRef) {
              r.status = 'returned';
              r.updatedAt = new Date().toISOString();
              requestsChanged = true;
            }
          }
        });

        // Update Remote Requests
        remoteRequestsData.forEach((r: any) => {
          if (r.status === 'Prêt / Communiqué') {
            const hasRef = Array.isArray(r.references) 
              ? r.references.some((ref: any) => String(ref).trim().toLowerCase() === refToMatch) 
              : String(r.intitule || r.motif).trim().toLowerCase() === refToMatch;
            if (hasRef) {
              r.status = 'Retourné';
              r.updatedAt = new Date().toISOString();
              remoteRequestsChanged = true;
            }
          }
        });

        // Update Archives
        archivesData.forEach((a: any) => {
          if (!a.dateRetour && a.status !== 'Retourné') {
            const val = String(a.intitule || '').toLowerCase();
            if (val.includes(refToMatch)) {
              a.dateRetour = today;
              a.status = 'Retourné';
              archivesChanged = true;
            }
          }
        });
      }

      if (requestsChanged) writeData('requests', requestsData);
      if (remoteRequestsChanged) writeData('remote_requests', remoteRequestsData);
      if (archivesChanged) writeData('archives', archivesData);

      res.json({ success: true, count: newEntries.length, entries: newEntries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Centralized Inventory Routes ---
  app.get("/api/centralized-inventory", authenticate, (req, res) => {
    try {
      const folders = db.prepare("SELECT * FROM centralized_inventory").all();
      const boxes = db.prepare("SELECT * FROM centralized_boxes").all();
      const commMap = getActiveCommunicationMap();

      const enrichedFolders = (folders as any[]).map(f => {
        const refKey = String(f.reference || '').trim().toUpperCase();
        const commInfo = commMap.get(refKey);
        return {
          ...f,
          isCommunicated: commInfo ? commInfo.isCommunicated : false,
          communicationStatus: commInfo ? (commInfo.isCommunicated ? 'Communiqué' : commInfo.status) : 'Disponible',
          communicationBorrower: commInfo?.borrower || '',
          communicationDate: commInfo?.dateComm || ''
        };
      });

      // Map isOpen from 0/1 to boolean
      const mappedBoxes = (boxes as any[]).map(b => ({ ...b, isOpen: !!b.isOpen }));
      res.json({ folders: enrichedFolders, boxes: mappedBoxes });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/centralized-inventory/sync", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { folders, boxes } = req.body;
      const updatedAt = new Date().toISOString();

      const syncTransaction = db.transaction(() => {
        // Clear old ones or perform UPSCERT
        // Here we'll do UPSERT for folders and boxes
        
        const insertFolder = db.prepare(`
          INSERT INTO centralized_inventory (
            reference, dateCloture, status, boxNumber, pointedAt, verifiedAt, updatedAt,
            ruleId, expiryDate, archivalStatus, direction, intitule, isEliminated
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(reference) DO UPDATE SET
            dateCloture = excluded.dateCloture,
            status = excluded.status,
            boxNumber = excluded.boxNumber,
            pointedAt = excluded.pointedAt,
            verifiedAt = excluded.verifiedAt,
            updatedAt = excluded.updatedAt,
            ruleId = excluded.ruleId,
            expiryDate = excluded.expiryDate,
            archivalStatus = excluded.archivalStatus,
            direction = excluded.direction,
            intitule = excluded.intitule,
            isEliminated = excluded.isEliminated
        `);

        const insertBox = db.prepare(`
          INSERT INTO centralized_boxes (id, number, title, isOpen, depot, travee, tablette, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            number = excluded.number,
            title = excluded.title,
            isOpen = excluded.isOpen,
            depot = excluded.depot,
            travee = excluded.travee,
            tablette = excluded.tablette,
            updatedAt = excluded.updatedAt
        `);

        const insertOrUpdateMassInventory = db.prepare(`
          INSERT INTO mass_inventory (
            id, reference, intitule, direction, numBoite, localisation, 
            dateDebut, dateFin, dossier, ruleId, expiryDate, archivalStatus, 
            rawData, createdAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            reference = excluded.reference,
            intitule = excluded.intitule,
            direction = excluded.direction,
            numBoite = excluded.numBoite,
            localisation = excluded.localisation,
            dateDebut = excluded.dateDebut,
            dateFin = excluded.dateFin,
            dossier = excluded.dossier,
            ruleId = excluded.ruleId,
            expiryDate = excluded.expiryDate,
            archivalStatus = excluded.archivalStatus,
            rawData = excluded.rawData
        `);

        if (Array.isArray(folders)) {
          for (const f of folders) {
            insertFolder.run(
              f.reference, 
              f.dateCloture || '', 
              f.status || 'pending', 
              f.boxNumber || '', 
              f.pointedAt || null, 
              f.verifiedAt || null, 
              updatedAt,
              f.ruleId || null,
              f.expiryDate || null,
              f.archivalStatus || 'Active',
              f.direction || null,
              f.intitule || null,
              f.isEliminated ? 1 : 0
            );

            // If verified (confirmed), insert/update it in the mass_inventory table too
            if (f.status === 'verified') {
              let boxLocalisation = '';
              if (f.boxNumber) {
                const boxRow = db.prepare("SELECT depot, travee, tablette FROM centralized_boxes WHERE number = ?").get(f.boxNumber) as any;
                if (boxRow && boxRow.depot) {
                  boxLocalisation = `${boxRow.depot} / T: ${boxRow.travee || ''} / Tab: ${boxRow.tablette || ''}`;
                }
              }
              const massId = `centralized_${f.reference}`;
              insertOrUpdateMassInventory.run(
                massId,
                f.reference,
                f.intitule || `Dossier ${f.reference}`,
                f.direction || '',
                f.boxNumber || '',
                boxLocalisation,
                f.dateDebut || f.dateCloture || '',
                f.dateCloture || '',
                f.reference,
                f.ruleId || null,
                f.expiryDate || null,
                f.archivalStatus || 'Active',
                JSON.stringify(f),
                f.verifiedAt || f.pointedAt || updatedAt
              );
            }
          }
        }

        if (Array.isArray(boxes)) {
          for (const b of boxes) {
            insertBox.run(b.id, b.number, b.title || '', b.isOpen ? 1 : 0, b.depot || '', b.travee || '', b.tablette || '', b.createdAt || updatedAt, updatedAt);
          }
        }
      });

      syncTransaction();
      res.json({ success: true });
    } catch (err: any) {
      console.error("Centralized sync error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/centralized-inventory/validation-history", authenticate, (req: any, res) => {
    try {
      const history = db.prepare("SELECT * FROM centralized_validation_history ORDER BY validationDate DESC").all();
      res.json(history);
    } catch (err: any) {
      console.error("Fetch validation history error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/centralized-inventory/validation-history", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { foldersCount, boxesCount, boxesList, source } = req.body;
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const validationDate = new Date().toISOString();

      db.prepare(`
        INSERT INTO centralized_validation_history (id, validationDate, foldersCount, boxesCount, boxesList, source)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, validationDate, foldersCount || 0, boxesCount || 0, boxesList || '', source || '');

      res.status(201).json({ success: true, id });
    } catch (err: any) {
      console.error("Save validation history error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/centralized-inventory/validation-history/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Admin' && req.user.role !== 'Agent' && req.user.role !== 'Archivist') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM centralized_validation_history WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete validation history error:", err);
      res.status(500).json({ error: err.message });
    }
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
      res.json({ id: newTransfer.id, transfer: newTransfer });
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
    try {
      const data = readData('transfer_requests');
      const idx = data.findIndex((r: any) => r.id === id);
      if (idx === -1) return res.status(404).json({ error: "Non trouvé" });
      
      data[idx] = { ...data[idx], ...req.body, updatedAt: new Date().toISOString() };
      writeData('transfer_requests', data);
      res.json({ success: true, item: data[idx] });
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

  // ==========================================
  // --- SESSION RESPONSABLE (AUDIT) ENDPOINTS ---
  // ==========================================

  // 1. Manage System Users
  app.get("/api/users", authenticate, (req: any, res) => {
    try {
      const users = db.prepare("SELECT * FROM system_users").all();
      res.json(users);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/users", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit. Rôle de Responsable d'Audit ou Admin requis." });
    }
    try {
      const { email, role, displayName } = req.body;
      if (!email || !role || !displayName) {
        return res.status(400).json({ error: "Champs manquants." });
      }
      db.prepare(`
        INSERT INTO system_users (email, role, displayName)
        VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET role=excluded.role, displayName=excluded.displayName
      `).run(email.trim().toLowerCase(), role, displayName.trim());
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/users/:email", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit. Rôle de Responsable d'Audit ou Admin requis." });
    }
    try {
      const { email } = req.params;
      db.prepare("DELETE FROM system_users WHERE email = ?").run(email.toLowerCase());
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // 2. Manage Organigramme / Departments
  app.get("/api/organigramme", authenticate, (req: any, res) => {
    try {
      const deps = db.prepare("SELECT * FROM departments").all();
      res.json(deps);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/organigramme", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit. Rôle de Responsable d'Audit ou Admin requis." });
    }
    try {
      const { name, code, description } = req.body;
      if (!name || !code) {
        return res.status(400).json({ error: "Champs manquants. Saisir le titre de la direction et son code trigramme." });
      }
      const id = `DEP_${Date.now()}`;
      db.prepare("INSERT INTO departments (id, name, code, description) VALUES (?, ?, ?, ?)")
        .run(id, name.trim(), code.trim().toUpperCase(), (description || '').trim());
      res.json({ success: true, id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/organigramme/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit. Rôle de Responsable d'Audit ou Admin requis." });
    }
    try {
      const { id } = req.params;
      const { name, code, description } = req.body;
      db.prepare(`
        UPDATE departments 
        SET name = COALESCE(?, name), code = COALESCE(?, code), description = COALESCE(?, description)
        WHERE id = ?
      `).run(name ? name.trim() : null, code ? code.trim().toUpperCase() : null, description ? description.trim() : null, id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/organigramme/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM departments WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // 3. Custom Box Barcode Prefix Rules
  app.get("/api/barcode-settings", authenticate, (req: any, res) => {
    try {
      const prefixes = db.prepare("SELECT * FROM barcode_prefixes").all();
      res.json(prefixes);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/barcode-settings", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { direction, prefix } = req.body;
      if (!direction || !prefix) return res.status(400).json({ error: "Saisir la direction et le préfixe." });

      const id = `PRE_${Date.now()}`;
      db.prepare(`
        INSERT INTO barcode_prefixes (id, direction, prefix)
        VALUES (?, ?, ?)
        ON CONFLICT(direction) DO UPDATE SET prefix = excluded.prefix
      `).run(id, direction.trim(), prefix.trim());
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/barcode-settings/delete", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { direction } = req.body;
      db.prepare("DELETE FROM barcode_prefixes WHERE direction = ?").run(direction);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // 4. Central Backup Export & Import (Restauration totale de la Base)
  app.get("/api/backup/export", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit. Responsable d'Audit ou Admin requis." });
    }
    try {
      const massInventory = db.prepare("SELECT * FROM mass_inventory").all();
      const centralizedInventory = db.prepare("SELECT * FROM centralized_inventory").all();
      const centralizedBoxes = db.prepare("SELECT * FROM centralized_boxes").all();
      const centralizedHistory = db.prepare("SELECT * FROM centralized_validation_history").all();
      const archivalDirectory = db.prepare("SELECT * FROM archival_directory").all();
      const eliminationRequests = db.prepare("SELECT * FROM elimination_requests").all();
      const systemUsers = db.prepare("SELECT * FROM system_users").all();
      const departments = db.prepare("SELECT * FROM departments").all();
      const barcodePrefixes = db.prepare("SELECT * FROM barcode_prefixes").all();

      res.json({
        mass_inventory: massInventory,
        centralized_inventory: centralizedInventory,
        centralized_boxes: centralizedBoxes,
        centralized_validation_history: centralizedHistory,
        archival_directory: archivalDirectory,
        elimination_requests: eliminationRequests,
        system_users: systemUsers,
        departments,
        barcode_prefixes: barcodePrefixes,
        exportedAt: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/backup/restore", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit. Responsable d'Audit ou Admin requis." });
    }
    try {
      const payload = req.body;
      if (!payload) return res.status(400).json({ error: "Données vides." });

      db.transaction(() => {
        // Tables list to replace
        if (payload.system_users && Array.isArray(payload.system_users)) {
          db.prepare("DELETE FROM system_users").run();
          const ins = db.prepare("INSERT INTO system_users (email, role, displayName) VALUES (?, ?, ?)");
          for (const u of payload.system_users) {
            ins.run(u.email, u.role, u.displayName);
          }
        }
        if (payload.departments && Array.isArray(payload.departments)) {
          db.prepare("DELETE FROM departments").run();
          const ins = db.prepare("INSERT INTO departments (id, name, code, description) VALUES (?, ?, ?, ?)");
          for (const d of payload.departments) {
            ins.run(d.id, d.name, d.code, d.description || '');
          }
        }
        if (payload.barcode_prefixes && Array.isArray(payload.barcode_prefixes)) {
          db.prepare("DELETE FROM barcode_prefixes").run();
          const ins = db.prepare("INSERT INTO barcode_prefixes (id, direction, prefix) VALUES (?, ?, ?)");
          for (const b of payload.barcode_prefixes) {
            ins.run(b.id, b.direction, b.prefix);
          }
        }
        if (payload.archival_directory && Array.isArray(payload.archival_directory)) {
          db.prepare("DELETE FROM archival_directory").run();
          const ins = db.prepare("INSERT INTO archival_directory (id, reference, title, direction, docType, activeYears, semiActiveYears, finalDisposition, support, retentionTrigger, isCritical, category, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          for (const r of payload.archival_directory) {
            ins.run(r.id, r.reference, r.title, r.direction, r.docType || '', r.activeYears || 0, r.semiActiveYears || 0, r.finalDisposition || 'EL', r.support || 'Papier', r.retentionTrigger || '', r.isCritical || 0, r.category || '', r.createdAt || new Date().toISOString());
          }
        }
        if (payload.centralized_boxes && Array.isArray(payload.centralized_boxes)) {
          db.prepare("DELETE FROM centralized_boxes").run();
          const ins = db.prepare("INSERT INTO centralized_boxes (id, number, title, isOpen, depot, travee, tablette, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
          for (const b of payload.centralized_boxes) {
            ins.run(b.id, b.number, b.title, b.isOpen ? 1 : 0, b.depot || '', b.travee || '', b.tablette || '', b.createdAt || new Date().toISOString(), b.updatedAt || new Date().toISOString());
          }
        }
        if (payload.centralized_inventory && Array.isArray(payload.centralized_inventory)) {
          db.prepare("DELETE FROM centralized_inventory").run();
          const ins = db.prepare("INSERT INTO centralized_inventory (reference, dateCloture, status, boxNumber, pointedAt, verifiedAt, updatedAt, ruleId, expiryDate, archivalStatus, direction, intitule, isEliminated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          for (const f of payload.centralized_inventory) {
            ins.run(f.reference, f.dateCloture || '', f.status || 'pending', f.boxNumber || '', f.pointedAt || '', f.verifiedAt || '', f.updatedAt || '', f.ruleId || '', f.expiryDate || '', f.archivalStatus || 'Active', f.direction || '', f.intitule || '', f.isEliminated || 0);
          }
        }
        if (payload.mass_inventory && Array.isArray(payload.mass_inventory)) {
          db.prepare("DELETE FROM mass_inventory").run();
          const ins = db.prepare("INSERT INTO mass_inventory (id, reference, intitule, direction, numBoite, localisation, dateDebut, dateFin, dossier, codeAgence, sin, police, adherant, dateDeclaration, typeSinistre, dateCloture, etatSinistre, paquet, ruleId, expiryDate, archivalStatus, rawData, createdAt, isEliminated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          for (const m of payload.mass_inventory) {
            ins.run(m.id, m.reference, m.intitule, m.direction, m.numBoite, m.localisation, m.dateDebut, m.dateFin, m.dossier, m.codeAgence, m.sin, m.police, m.adherant, m.dateDeclaration, m.typeSinistre, m.dateCloture, m.etatSinistre, m.paquet, m.ruleId, m.expiryDate, m.archivalStatus, m.rawData, m.createdAt || new Date().toISOString(), m.isEliminated || 0);
          }
        }
        if (payload.elimination_requests && Array.isArray(payload.elimination_requests)) {
          db.prepare("DELETE FROM elimination_requests").run();
          const ins = db.prepare("INSERT INTO elimination_requests (id, inventoryId, ruleId, reference, intitule, docType, direction, finalDisposition, retentionYears, activeYears, semiActiveYears, expiryDate, status, comment, submittedBy, approvedBy, submittedAt, approvedAt, eliminationDate, pvNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          for (const e of payload.elimination_requests) {
            ins.run(e.id, e.inventoryId, e.ruleId, e.reference, e.intitule, e.docType, e.direction, e.finalDisposition, e.retentionYears, e.activeYears, e.semiActiveYears, e.expiryDate, e.status, e.comment, e.submittedBy, e.approvedBy, e.submittedAt, e.approvedAt, e.eliminationDate, e.pvNumber);
          }
        }
      })();
      res.json({ success: true, message: "Restauration terminée avec succès !" });
    } catch (err: any) {
      console.error("Database restore error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Final Audit Validation locks
  app.post("/api/audit/finalize-inventory", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { references } = req.body;
      if (!references || !Array.isArray(references)) return res.status(400).json({ error: "Références manquantes." });

      const today = new Date().toISOString();
      db.transaction(() => {
        const updateCentral = db.prepare(`
          UPDATE centralized_inventory 
          SET status = 'verified', verifiedAt = ?, archivalStatus = 'Active'
          WHERE reference = ?
        `);
        const updateMass = db.prepare(`
          UPDATE mass_inventory 
          SET archivalStatus = 'Active'
          WHERE reference = ?
        `);
        for (const ref of references) {
          updateCentral.run(today, ref);
          updateMass.run(ref);
        }
      })();
      res.json({ success: true, count: references.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // --- INVENTORY INTEGRATION WIZARD ENDPOINTS ---
  // ==========================================
  
  // Public PV Transfert View endpoint (for QR Code scanning from mobile phones)
  app.get("/api/public/pv-transfert/:id", (req: any, res) => {
    try {
      const { id } = req.params;
      const batch = db.prepare(`
        SELECT * FROM integration_batches 
        WHERE id = ? OR batchNumber = ? OR inventoryRef = ?
      `).get(id, id, id);
      
      if (!batch) {
        // Try searching LIKE batchNumber or inventoryRef
        const fallback = db.prepare(`
          SELECT * FROM integration_batches 
          WHERE batchNumber LIKE ? OR inventoryRef LIKE ?
          LIMIT 1
        `).get(`%${id}%`, `%${id}%`);

        if (!fallback) {
          return res.status(404).json({ error: "Procès-verbal de transfert introuvable" });
        }
        
        let ruleObj = fallback.ruleApplied;
        try {
          if (typeof fallback.ruleApplied === 'string' && (fallback.ruleApplied.startsWith('{') || fallback.ruleApplied.startsWith('['))) {
            ruleObj = JSON.parse(fallback.ruleApplied);
          }
        } catch (e) {}

        return res.json({
          ...fallback,
          foldersData: fallback.foldersData ? JSON.parse(fallback.foldersData) : [],
          boxesData: fallback.boxesData ? JSON.parse(fallback.boxesData) : [],
          ruleApplied: ruleObj
        });
      }
      
      let ruleObj = batch.ruleApplied;
      try {
        if (typeof batch.ruleApplied === 'string' && (batch.ruleApplied.startsWith('{') || batch.ruleApplied.startsWith('['))) {
          ruleObj = JSON.parse(batch.ruleApplied);
        }
      } catch (e) {}

      res.json({
        ...batch,
        foldersData: batch.foldersData ? JSON.parse(batch.foldersData) : [],
        boxesData: batch.boxesData ? JSON.parse(batch.boxesData) : [],
        ruleApplied: ruleObj
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List all integration batches
  app.get("/api/inventory-integration/batches", authenticate, (req: any, res) => {
    try {
      const batches = db.prepare(`
        SELECT * FROM integration_batches 
        ORDER BY importedAt DESC
      `).all();
      
      const parsedBatches = batches.map((b: any) => {
        let ruleObj = b.ruleApplied;
        try {
          if (typeof b.ruleApplied === 'string' && (b.ruleApplied.startsWith('{') || b.ruleApplied.startsWith('['))) {
            ruleObj = JSON.parse(b.ruleApplied);
          }
        } catch (e) {}

        try {
          return {
            ...b,
            foldersData: b.foldersData ? JSON.parse(b.foldersData) : [],
            boxesData: b.boxesData ? JSON.parse(b.boxesData) : [],
            ruleApplied: ruleObj
          };
        } catch (e) {
          return {
            ...b,
            ruleApplied: ruleObj
          };
        }
      });
      res.json(parsedBatches);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get pending integration batches count
  app.get("/api/inventory-integration/pending-count", authenticate, (req: any, res) => {
    try {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM integration_batches 
        WHERE status = 'en_attente_audit'
      `).get() as any;
      res.json({ count: row ? row.count : 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Submit a new integration batch (Steps 1 to 6 completed, waiting for step 7 audit validation)
  app.post("/api/inventory-integration/submit-batch", authenticate, (req: any, res) => {
    try {
      const { 
        batchNumber,
        inventoryRef,
        inventoryName,
        direction, 
        directionHead,
        transferDate,
        folders, 
        boxes, 
        ruleApplied, 
        notes 
      } = req.body;

      if (!folders || !Array.isArray(folders) || folders.length === 0) {
        return res.status(400).json({ error: "Aucun dossier à intégrer dans ce lot." });
      }

      const id = `BATCH_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const bNum = batchNumber || `LOT-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      const invRef = inventoryRef || bNum;
      const invName = inventoryName || `${direction || 'Inventaire'} ${new Date().getFullYear()}`;
      const importedAt = transferDate ? new Date(transferDate).toISOString() : new Date().toISOString();
      const importedBy = req.user?.displayName || req.user?.email || 'Archiviste';

      db.prepare(`
        INSERT INTO integration_batches (
          id, batchNumber, direction, importedAt, importedBy, status,
          foldersCount, boxesCount, foldersData, boxesData, ruleApplied, notes,
          inventoryRef, inventoryName, directionHead, transferDate
        ) VALUES (?, ?, ?, ?, ?, 'en_attente_audit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        bNum,
        direction || 'Général',
        importedAt,
        importedBy,
        folders.length,
        boxes ? boxes.length : 0,
        JSON.stringify(folders),
        JSON.stringify(boxes || []),
        typeof ruleApplied === 'object' ? JSON.stringify(ruleApplied) : String(ruleApplied || ''),
        notes || '',
        invRef,
        invName,
        directionHead || '',
        transferDate || new Date().toISOString().slice(0, 10)
      );

      res.json({ 
        success: true, 
        id, 
        batchNumber: bNum,
        inventoryRef: invRef,
        inventoryName: invName,
        message: "Lot d'inventaire soumis avec succès pour validation finale par le Responsable Audit !" 
      });
    } catch (err: any) {
      console.error("Error submitting integration batch:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Final Audit Validation of an Integration Batch
  app.post("/api/inventory-integration/batches/:id/validate", authenticate, (req: any, res) => {
    try {
      const { id } = req.params;
      const batch = db.prepare("SELECT * FROM integration_batches WHERE id = ?").get(id) as any;
      if (!batch) {
        return res.status(404).json({ error: "Lot d'inventaire non trouvé." });
      }

      const folders = Array.isArray(batch.foldersData) 
        ? batch.foldersData 
        : (batch.foldersData ? JSON.parse(batch.foldersData) : []);
      const boxes = Array.isArray(batch.boxesData) 
        ? batch.boxesData 
        : (batch.boxesData ? JSON.parse(batch.boxesData) : []);
      const validatedAt = new Date().toISOString();
      const validatedBy = req.user?.displayName || req.user?.email || 'Responsable Audit';

      // Build a lookup map of boxes for location inheritance
      const boxLookup = new Map<string, any>();
      for (const b of boxes) {
        const bNum = String(b.number || b.boxNumber || b.generatedBoxNumber || '').trim().toLowerCase();
        if (bNum) boxLookup.set(bNum, b);
      }

      db.transaction(() => {
        // 1. Insert or update boxes into centralized_boxes
        const upsertBox = db.prepare(`
          INSERT INTO centralized_boxes (
            id, number, title, isOpen, depot, travee, tablette,
            batiment, salle, rayon, niveau, barcode, foldersCount,
            dateRange, expiryYear, localisation, rawLocalisation,
            batchId, batchNumber, direction, createdAt, updatedAt
          )
          VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            number = excluded.number,
            title = excluded.title,
            isOpen = 0,
            depot = excluded.depot,
            travee = excluded.travee,
            tablette = excluded.tablette,
            batiment = excluded.batiment,
            salle = excluded.salle,
            rayon = excluded.rayon,
            niveau = excluded.niveau,
            barcode = excluded.barcode,
            foldersCount = excluded.foldersCount,
            dateRange = excluded.dateRange,
            expiryYear = excluded.expiryYear,
            localisation = excluded.localisation,
            rawLocalisation = excluded.rawLocalisation,
            batchId = excluded.batchId,
            batchNumber = excluded.batchNumber,
            direction = excluded.direction,
            updatedAt = excluded.updatedAt
        `);

        for (let bIdx = 0; bIdx < boxes.length; bIdx++) {
          const box = boxes[bIdx];
          const boxNum = box.number || box.boxNumber || box.generatedBoxNumber || `Boîte #${bIdx + 1}`;
          const boxId = box.id || `box_${id}_${bIdx}_${boxNum.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const boxTitle = box.title || box.direction || batch.direction || 'Dossiers';
          const depot = box.depot || 'Dépôt Principal';
          const travee = box.travee || box.rayon || 'A';
          const tablette = box.tablette || box.etagere || '01';
          const batiment = box.batiment || '';
          const salle = box.salle || '';
          const rayon = box.rayon || '';
          const niveau = box.niveau || '';
          const barcode = box.barcode || '';
          const fCount = box.foldersCount || (Array.isArray(box.folders) ? box.folders.length : 0);
          const dateRange = box.dateRange || '';
          const expiryYear = box.expiryYear || '';
          const rawLoc = box.rawLocalisation || box.localisation || '';
          const loc = rawLoc || (depot ? `${depot} / T: ${travee} / Tab: ${tablette}` : '');

          upsertBox.run(
            boxId,
            boxNum,
            boxTitle,
            depot,
            travee,
            tablette,
            batiment,
            salle,
            rayon,
            niveau,
            barcode,
            fCount,
            dateRange,
            expiryYear,
            loc,
            rawLoc,
            id,
            batch.batchNumber || '',
            batch.direction || '',
            box.createdAt || validatedAt,
            validatedAt
          );
        }

        // 2. Insert or update folders into centralized_inventory
        const upsertCentralFolder = db.prepare(`
          INSERT INTO centralized_inventory (
            reference, dateCloture, status, boxNumber, pointedAt, verifiedAt, updatedAt,
            ruleId, expiryDate, archivalStatus, direction, intitule,
            batchId, batchNumber, inventoryRef, inventoryName, validatedBy
          ) VALUES (?, ?, 'verified', ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(reference) DO UPDATE SET
            dateCloture = excluded.dateCloture,
            status = 'verified',
            boxNumber = excluded.boxNumber,
            pointedAt = excluded.pointedAt,
            verifiedAt = excluded.verifiedAt,
            updatedAt = excluded.updatedAt,
            ruleId = excluded.ruleId,
            expiryDate = excluded.expiryDate,
            archivalStatus = 'Active',
            direction = excluded.direction,
            intitule = excluded.intitule,
            batchId = excluded.batchId,
            batchNumber = excluded.batchNumber,
            inventoryRef = excluded.inventoryRef,
            inventoryName = excluded.inventoryName,
            validatedBy = excluded.validatedBy
        `);

        // 3. Insert or update into mass_inventory for global search & consultations
        const upsertMassFolder = db.prepare(`
          INSERT INTO mass_inventory (
            id, reference, intitule, direction, numBoite, localisation,
            dateDebut, dateFin, dateCloture, dossier, codeAgence, sin, police, adherant,
            dateDeclaration, typeSinistre, etatSinistre, paquet,
            ruleId, expiryDate, archivalStatus, rawData,
            batchId, batchNumber, inventoryRef, inventoryName, validatedBy, validatedAt,
            createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            reference = excluded.reference,
            intitule = excluded.intitule,
            direction = excluded.direction,
            numBoite = excluded.numBoite,
            localisation = excluded.localisation,
            dateDebut = excluded.dateDebut,
            dateFin = excluded.dateFin,
            dateCloture = excluded.dateCloture,
            dossier = excluded.dossier,
            codeAgence = excluded.codeAgence,
            sin = excluded.sin,
            police = excluded.police,
            adherant = excluded.adherant,
            dateDeclaration = excluded.dateDeclaration,
            typeSinistre = excluded.typeSinistre,
            etatSinistre = excluded.etatSinistre,
            paquet = excluded.paquet,
            ruleId = excluded.ruleId,
            expiryDate = excluded.expiryDate,
            archivalStatus = 'Active',
            rawData = excluded.rawData,
            batchId = excluded.batchId,
            batchNumber = excluded.batchNumber,
            inventoryRef = excluded.inventoryRef,
            inventoryName = excluded.inventoryName,
            validatedBy = excluded.validatedBy,
            validatedAt = excluded.validatedAt
        `);

        for (let fIdx = 0; fIdx < folders.length; fIdx++) {
          const folder = folders[fIdx];
          const rawRow = folder.rawRow || {};
          
          // Resolve reference string
          let ref = folder.reference || folder.dossier || folder.sin || folder.police || folder.codeAgence || '';
          if (!ref && rawRow) {
            ref = rawRow['Code Agence'] || rawRow['Code agence'] || rawRow['N° Dossier'] || rawRow['Dossier'] || rawRow['N° Sinistre'] || rawRow['Sinistre'] || rawRow['Police'] || rawRow['Référence'] || '';
          }
          if (!ref) {
            ref = `DOS-${batch.batchNumber || 'LOT'}-${fIdx + 1}`;
          }

          // Resolve intitule string
          let intitule = folder.rawIntitule || folder.intitule || folder.titre || folder.objet || folder.libelle || folder.nom || folder.adherant || '';
          if (!intitule && rawRow) {
            intitule = rawRow['Intitulé'] || rawRow['Intitule'] || rawRow['Contenu'] || rawRow['Objet'] || rawRow['Libellé'] || rawRow['Libelle'] || rawRow['Titre'] || rawRow['Nom'] || '';
          }
          if (!intitule) {
            intitule = `Dossier ${ref}`;
          }

          const boxNum = folder.boxNumber || folder.numBoite || folder.generatedBoxNumber || 'Non assigné';
          
          // Resolve localisation: check folder first, then lookup from box
          let loc = folder.rawLocalisation || folder.localisation || folder.location || '';
          if (!loc && boxNum) {
            const bObj = boxLookup.get(String(boxNum).trim().toLowerCase());
            if (bObj) {
              loc = bObj.rawLocalisation || bObj.localisation || (bObj.depot ? `${bObj.depot} / T: ${bObj.travee || ''} / Tab: ${bObj.tablette || ''}` : '');
            }
          }

          const dateDebut = folder.dateDebut || folder.year || rawRow['Date Début'] || rawRow['Exercice'] || '';
          const dateCloture = folder.dateCloture || folder.dateFin || rawRow['Date Fin'] || rawRow['Date Clôture'] || rawRow['Clôture'] || '';
          const codeAgence = folder.codeAgence || folder.agence || rawRow['Code Agence'] || rawRow['Agence'] || '';
          const sin = folder.sin || folder.numSinistre || rawRow['N° Sinistre'] || rawRow['Sinistre'] || '';
          const police = folder.police || folder.numPolice || rawRow['N° Police'] || rawRow['Police'] || '';
          const adherant = folder.adherant || folder.nomAdherant || folder.client || rawRow['Adhérent'] || rawRow['Client'] || '';
          const dateDeclaration = folder.dateDeclaration || rawRow['Date Déclaration'] || '';
          const typeSinistre = folder.typeSinistre || folder.nature || rawRow['Type Sinistre'] || '';
          const etatSinistre = folder.etatSinistre || rawRow['Etat Sinistre'] || '';
          const paquet = folder.paquet || rawRow['Paquet'] || '';
          const codeDua = folder.codeDua || folder.ruleId || batch.ruleApplied?.reference || '';
          const expiryDate = folder.expiryDate || '';

          // 2. Upsert into centralized_inventory
          upsertCentralFolder.run(
            ref,
            dateCloture,
            boxNum,
            folder.pointedAt || validatedAt,
            validatedAt,
            validatedAt,
            codeDua,
            expiryDate,
            folder.direction || batch.direction,
            intitule,
            id,
            batch.batchNumber || '',
            batch.inventoryRef || '',
            batch.inventoryName || '',
            validatedBy
          );

          // 3. Upsert into mass_inventory
          const massId = folder.id ? `mass_${folder.id}` : `mass_${id}_${fIdx}_${ref.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          upsertMassFolder.run(
            massId,
            ref,
            intitule,
            folder.direction || batch.direction,
            boxNum,
            loc,
            dateDebut,
            dateCloture || dateDebut,
            dateCloture,
            folder.dossier || ref,
            codeAgence,
            sin,
            police,
            adherant,
            dateDeclaration,
            typeSinistre,
            etatSinistre,
            paquet,
            codeDua,
            expiryDate,
            folder.rawData ? (typeof folder.rawData === 'string' ? folder.rawData : JSON.stringify(folder.rawData)) : JSON.stringify(folder),
            id,
            batch.batchNumber || '',
            batch.inventoryRef || '',
            batch.inventoryName || '',
            validatedBy,
            validatedAt,
            validatedAt
          );
        }

        // 4. Record entry in validation history
        db.prepare(`
          INSERT INTO centralized_validation_history (
            id, validationDate, foldersCount, boxesCount, boxesList, source
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `VAL_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          validatedAt,
          folders.length,
          boxes.length,
          boxes.map((b: any) => b.number || b.boxNumber || b.generatedBoxNumber).filter(Boolean).join(', '),
          `Intégration Lot ${batch.batchNumber || id} (${batch.direction})`
        );

        // 5. Record entry in import_history for traceability
        try {
          db.prepare(`
            INSERT INTO import_history (id, filename, direction, itemsCount, createdAt)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            `imp_${id}`,
            `Lot ${batch.batchNumber || id} - ${batch.inventoryName || batch.direction}`,
            batch.direction || 'Général',
            folders.length,
            validatedAt
          );
        } catch (e) {
          // ignore if already present
        }

        // 6. Update batch status to 'validé'
        db.prepare(`
          UPDATE integration_batches 
          SET status = 'validé', validatedAt = ?, validatedBy = ?
          WHERE id = ?
        `).run(validatedAt, validatedBy, id);

        // 7. AUTOMATICALLY ALLOCATE VALIDATED BOXES IN STORAGE DEPOT (PLAN 3D & 2D)
        // Auto-allocate boxes from this validated batch into depot according to their locations
        try {
          const allShelves = db.prepare(`
            SELECT s.id, s.bayId, s.roomId, s.name, s.code, s.shelfNumber, s.boxCapacity, s.epi,
                   b.name as bayName, b.code as bayCode, b.bayNumber,
                   r.name as roomName, r.code as roomCode,
                   (SELECT COUNT(*) FROM storage_box_allocations a WHERE a.shelfId = s.id) as currentBoxes
            FROM storage_shelves s
            JOIN storage_bays b ON s.bayId = b.id
            JOIN storage_rooms r ON s.roomId = r.id
            ORDER BY r.id ASC, b.bayNumber ASC, s.shelfNumber ASC
          `).all() as any[];

          if (allShelves.length > 0) {
            const insertAlloc = db.prepare(`
              INSERT INTO storage_box_allocations (
                id, boxNumber, shelfId, bayId, roomId, batchId, inventoryRef, direction, folderCount, notes, createdAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            // Extract box numbers and locations
            const uniqueBoxesToPlace: any[] = [];
            if (boxes && boxes.length > 0) {
              for (const b of boxes) {
                const bNum = String(b.number || b.boxNumber || b.generatedBoxNumber || '').trim();
                if (bNum && !uniqueBoxesToPlace.some(x => x.boxNum === bNum)) {
                  uniqueBoxesToPlace.push({
                    boxNum: bNum,
                    rawLocalisation: b.rawLocalisation || b.localisation || b.location || b.emplacement || '',
                    salle: b.salle || b.depot || b.room || '',
                    travee: b.travee || b.bay || b.rayon || b.epi || '',
                    tablette: b.tablette || b.shelf || b.niveau || b.etagere || '',
                    folderCount: b.foldersCount || (Array.isArray(b.folders) ? b.folders.length : 0)
                  });
                }
              }
            } else if (folders && folders.length > 0) {
              const bMap = new Map<string, any>();
              for (const f of folders) {
                const bNum = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '1').trim();
                if (!bMap.has(bNum)) {
                  bMap.set(bNum, {
                    boxNum: bNum,
                    rawLocalisation: f.rawLocalisation || f.localisation || f.location || f.emplacement || '',
                    salle: f.salle || f.depot || f.room || '',
                    travee: f.travee || f.bay || f.rayon || f.epi || '',
                    tablette: f.tablette || f.shelf || f.niveau || f.etagere || '',
                    folderCount: 0
                  });
                }
                bMap.get(bNum).folderCount++;
              }
              for (const item of bMap.values()) {
                uniqueBoxesToPlace.push(item);
              }
            }

            let allocatedInDepotCount = 0;
            let matchedByLocCount = 0;

            for (const item of uniqueBoxesToPlace) {
              // Check if already allocated
              const existing = db.prepare("SELECT id FROM storage_box_allocations WHERE boxNumber = ? AND (batchId = ? OR batchId IS NULL)").get(item.boxNum, id);
              if (existing) continue;

              const targetShelf = findBestMatchingShelf({
                rawLocalisation: item.rawLocalisation,
                salle: item.salle,
                travee: item.travee,
                tablette: item.tablette
              }, allShelves);

              if (targetShelf) {
                const allocId = `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                insertAlloc.run(
                  allocId,
                  item.boxNum,
                  targetShelf.id,
                  targetShelf.bayId,
                  targetShelf.roomId,
                  id,
                  batch.inventoryRef || '',
                  batch.direction || '',
                  item.folderCount,
                  `Validation Responsable ${validatedBy} (Lot ${batch.batchNumber || id})`,
                  validatedAt
                );
                targetShelf.currentBoxes++;
                allocatedInDepotCount++;
                if (item.rawLocalisation || item.salle || item.travee || item.tablette) {
                  matchedByLocCount++;
                }
              }
            }

            // Log storage history
            if (allocatedInDepotCount > 0) {
              try {
                db.prepare(`
                  INSERT INTO storage_history (id, action, targetType, targetName, user, timestamp, details)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                  `hist_${Date.now()}`,
                  'INVENTAIRE_VALIDE_RANGEMENT',
                  'DEPOT_3D_2D',
                  `Lot ${batch.batchNumber || id}`,
                  validatedBy,
                  validatedAt,
                  `Validation inventaire : ${allocatedInDepotCount} boîte(s) positionnées dans le plan 3D / 2D (${matchedByLocCount} par localisation exacte).`
                );
              } catch (e) {}
            }
          }
        } catch (allocErr) {
          console.error("Auto allocation on batch validation error:", allocErr);
        }
      })();

      res.json({
        success: true,
        message: `Lot ${batch.batchNumber || id} validé avec succès ! ${folders.length} dossier(s) et ${boxes.length} boîte(s) ont été scellés et stockés définitivement dans l'application et le centre d'archives.`,
        foldersCount: folders.length,
        boxesCount: boxes.length
      });
    } catch (err: any) {
      console.error("Error validating integration batch:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Reject an Integration Batch
  app.post("/api/inventory-integration/batches/:id/reject", authenticate, (req: any, res) => {
    if (req.user.role !== 'Responsable' && req.user.role !== 'Admin') {
      return res.status(403).json({ error: "Interdit" });
    }
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const validatedAt = new Date().toISOString();
      const validatedBy = req.user?.displayName || req.user?.email || 'Responsable Audit';

      db.prepare(`
        UPDATE integration_batches 
        SET status = 'rejeté', rejectionReason = ?, validatedAt = ?, validatedBy = ?
        WHERE id = ?
      `).run(reason || 'Non conforme', validatedAt, validatedBy, id);

      res.json({ success: true, message: "Lot d'inventaire rejeté." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete an Integration Batch
  app.delete("/api/inventory-integration/batches/:id", authenticate, (req: any, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM integration_batches WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // --- STORAGE & DEPOTS API (SALLES, TRAVÉES, TABLETTES & BOÎTES) ---
  // =========================================================================

  // Helper: Get complete storage overview with metrics and allocations
  app.get("/api/storage/overview", authenticate, (req: any, res) => {
    try {
      const rooms = db.prepare("SELECT * FROM storage_rooms ORDER BY name ASC").all() as any[];
      const bays = db.prepare("SELECT * FROM storage_bays ORDER BY bayNumber ASC, name ASC").all() as any[];
      const shelves = db.prepare("SELECT * FROM storage_shelves ORDER BY shelfNumber ASC, name ASC").all() as any[];
      const allocations = db.prepare(`
        SELECT a.*, 
               b.inventoryRef as batchInventoryRef, 
               b.inventoryName as batchInventoryName,
               b.batchNumber as batchBatchNumber,
               b.validatedBy as validatedBy, 
               b.validatedAt as validatedAt,
               b.status as batchStatus
        FROM storage_box_allocations a
        LEFT JOIN integration_batches b ON a.batchId = b.id
        ORDER BY a.createdAt DESC
      `).all() as any[];

      // Also get all validated integration batches to detect any unallocated boxes
      const validatedBatches = db.prepare(`
        SELECT id, batchNumber, inventoryRef, inventoryName, direction, boxesData, foldersData, validatedAt, validatedBy
        FROM integration_batches
        WHERE status = 'validé'
      `).all() as any[];

      // Collect all validated boxes from batches & centralized_boxes
      const allKnownBoxes: any[] = [];
      const allocatedBoxSet = new Set(allocations.map(a => `${a.batchId || ''}_${a.boxNumber}`));

      for (const vb of validatedBatches) {
        let bData = [];
        let fData = [];
        try {
          bData = vb.boxesData ? JSON.parse(vb.boxesData) : [];
        } catch (e) {}
        try {
          fData = vb.foldersData ? JSON.parse(vb.foldersData) : [];
        } catch (e) {}

        // If batch has explicit boxes
        if (bData.length > 0) {
          for (const b of bData) {
            const bNum = String(b.number || b.boxNumber || b.generatedBoxNumber || '').trim();
            if (bNum) {
              allKnownBoxes.push({
                boxNumber: bNum,
                batchId: vb.id,
                batchNumber: vb.batchNumber,
                inventoryRef: vb.inventoryRef,
                inventoryName: vb.inventoryName,
                direction: vb.direction,
                folderCount: b.foldersCount || (Array.isArray(b.folders) ? b.folders.length : 0),
                rawLocalisation: b.rawLocalisation || b.localisation || '',
                isAllocated: allocatedBoxSet.has(`${vb.id}_${bNum}`) || allocations.some(a => a.boxNumber === bNum)
              });
            }
          }
        } else if (fData.length > 0) {
          // Derive boxes from folders
          const boxMap = new Map<string, number>();
          for (const f of fData) {
            const bNum = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '1').trim();
            boxMap.set(bNum, (boxMap.get(bNum) || 0) + 1);
          }
          for (const [bNum, count] of boxMap.entries()) {
            allKnownBoxes.push({
              boxNumber: bNum,
              batchId: vb.id,
              batchNumber: vb.batchNumber,
              inventoryRef: vb.inventoryRef,
              inventoryName: vb.inventoryName,
              direction: vb.direction,
              folderCount: count,
              rawLocalisation: vb.direction || '',
              isAllocated: allocatedBoxSet.has(`${vb.id}_${bNum}`) || allocations.some(a => a.boxNumber === bNum)
            });
          }
        }
      }

      // Group allocations by shelf
      const allocationsByShelf = new Map<string, any[]>();
      for (const a of allocations) {
        if (!allocationsByShelf.has(a.shelfId)) {
          allocationsByShelf.set(a.shelfId, []);
        }
        allocationsByShelf.get(a.shelfId)!.push(a);
      }

      // Build hierarchical structure with occupancy metrics & linear meters (ML)
      const ML_PER_BOX = 0.1714; // ~0.17 ml per standard box (35 boxes = 6.00 ml)
      let totalCapacity = 0;
      let totalStoredBoxes = allocations.length;
      let totalShelvesCount = shelves.length;
      let loadedShelvesCount = 0;
      let fullShelvesCount = 0;
      let emptyShelvesCount = 0;

      let totalBaysCount = bays.length;
      let loadedBaysCount = 0;
      let emptyBaysCount = 0;

      let totalRoomsCount = rooms.length;
      let loadedRoomsCount = 0;
      let emptyRoomsCount = 0;

      const structuredShelves = shelves.map(s => {
        const shelfAllocs = allocationsByShelf.get(s.id) || [];
        const boxCount = shelfAllocs.length;
        const capacity = s.boxCapacity || 5;
        totalCapacity += capacity;

        if (boxCount === 0) {
          emptyShelvesCount++;
        } else if (boxCount >= capacity) {
          fullShelvesCount++;
          loadedShelvesCount++;
        } else {
          loadedShelvesCount++;
        }

        const isFull = boxCount >= capacity;
        const isPartiallyLoaded = boxCount > 0 && boxCount < capacity;
        const occupancyRate = capacity > 0 ? Math.round((boxCount / capacity) * 1000) / 10 : 0;
        const mlOccupied = Math.round(boxCount * ML_PER_BOX * 100) / 100;
        const mlTotal = Math.round(capacity * ML_PER_BOX * 100) / 100;
        const mlAvailable = Math.round(Math.max(0, mlTotal - mlOccupied) * 100) / 100;

        // Enrich box objects with linear meter and audit archival info
        const enrichedBoxes = shelfAllocs.map((b, bIdx) => {
          const matchBatch = validatedBatches.find(vb => vb.id === b.batchId);
          const archiveType = b.inventoryRef?.includes('SIN-MAT') || b.notes?.includes('Matériels') ? 'Sinistres Matériels' :
            b.inventoryRef?.includes('SIN-CORP') || b.notes?.includes('Corporels') ? 'Sinistres Corporels' :
            b.direction ? `Archives ${b.direction}` : (b.inventoryRef || 'Archives Générales');

          return {
            ...b,
            levelNumber: s.shelfNumber,
            position: bIdx + 1,
            archiveType,
            mlOccupied: Math.round(ML_PER_BOX * 100) / 100,
            status: 'conforme',
            entryDate: b.createdAt ? b.createdAt.slice(0, 10) : '2026-08-20'
          };
        });

        return {
          ...s,
          boxCapacity: capacity,
          storedBoxesCount: boxCount,
          availableCapacity: Math.max(0, capacity - boxCount),
          occupancyRate,
          mlOccupied,
          mlTotal,
          mlAvailable,
          status: isFull ? 'pleine' : isPartiallyLoaded ? 'partielle' : 'disponible',
          boxes: enrichedBoxes
        };
      });

      const shelvesByBay = new Map<string, any[]>();
      for (const s of structuredShelves) {
        if (!shelvesByBay.has(s.bayId)) {
          shelvesByBay.set(s.bayId, []);
        }
        shelvesByBay.get(s.bayId)!.push(s);
      }

      const structuredBays = bays.map(b => {
        const bayShelves = (shelvesByBay.get(b.id) || []).sort((a, b) => a.shelfNumber - b.shelfNumber);
        const bayCapacity = bayShelves.reduce((acc, s) => acc + s.boxCapacity, 0);
        const bayStored = bayShelves.reduce((acc, s) => acc + s.storedBoxesCount, 0);
        const bayOccupancy = bayCapacity > 0 ? Math.round((bayStored / bayCapacity) * 1000) / 10 : 0;
        const bayMlTotal = Math.round(bayCapacity * ML_PER_BOX * 100) / 100;
        const bayMlOccupied = Math.round(bayStored * ML_PER_BOX * 100) / 100;
        const bayMlAvailable = Math.round(Math.max(0, bayMlTotal - bayMlOccupied) * 100) / 100;

        if (bayStored > 0) loadedBaysCount++;
        else emptyBaysCount++;

        // Collect all distinct box archives in this bay
        const allBayBoxes: any[] = [];
        const archiveTypeSet = new Set<string>();
        for (const sh of bayShelves) {
          for (const bx of sh.boxes) {
            allBayBoxes.push(bx);
            if (bx.archiveType) archiveTypeSet.add(bx.archiveType);
          }
        }

        const distinctArchives = Array.from(archiveTypeSet);
        if (distinctArchives.length === 0 && bayStored > 0) {
          distinctArchives.push('Sinistres Matériels', 'Sinistres Corporels');
        }

        const bayEpi = b.epi || (b.code && b.code.includes('-') ? b.code.split('-')[0] : 'A');
        const bayNumInEpi = b.bayNumberInEpi || b.bayNumber;

        return {
          ...b,
          epi: bayEpi,
          bayNumberInEpi: bayNumInEpi,
          shelvesCount: bayShelves.length,
          totalCapacity: bayCapacity,
          storedBoxesCount: bayStored,
          availableCapacity: Math.max(0, bayCapacity - bayStored),
          occupancyRate: bayOccupancy,
          mlTotal: bayMlTotal,
          mlOccupied: bayMlOccupied,
          mlAvailable: bayMlAvailable,
          archivesList: distinctArchives,
          allBoxes: allBayBoxes,
          status: bayOccupancy >= 100 ? 'pleine' : bayOccupancy >= 60 ? 'partielle' : bayStored > 0 ? 'disponible' : 'disponible',
          shelves: bayShelves
        };
      });

      const baysByRoom = new Map<string, any[]>();
      for (const b of structuredBays) {
        if (!baysByRoom.has(b.roomId)) {
          baysByRoom.set(b.roomId, []);
        }
        baysByRoom.get(b.roomId)!.push(b);
      }

      const structuredRooms = rooms.map(r => {
        const roomBays = (baysByRoom.get(r.id) || []).sort((a, b) => a.bayNumber - b.bayNumber);
        const roomCapacity = roomBays.reduce((acc, b) => acc + b.totalCapacity, 0);
        const roomStored = roomBays.reduce((acc, b) => acc + b.storedBoxesCount, 0);
        const roomOccupancy = roomCapacity > 0 ? Math.round((roomStored / roomCapacity) * 1000) / 10 : 0;
        const roomMlTotal = Math.round(roomCapacity * ML_PER_BOX * 100) / 100;
        const roomMlOccupied = Math.round(roomStored * ML_PER_BOX * 100) / 100;
        const roomMlAvailable = Math.round(Math.max(0, roomMlTotal - roomMlOccupied) * 100) / 100;

        if (roomStored > 0) loadedRoomsCount++;
        else emptyRoomsCount++;

        // Group bays by Épi within room
        const episMap = new Map<string, any[]>();
        for (const b of roomBays) {
          const epiKey = b.epi || (b.code && b.code.includes('-') ? b.code.split('-')[0] : 'A');
          if (!episMap.has(epiKey)) episMap.set(epiKey, []);
          episMap.get(epiKey)!.push(b);
        }

        const structuredEpis = Array.from(episMap.entries()).map(([epiCode, eBays]) => {
          const epiCapacity = eBays.reduce((acc, b) => acc + b.totalCapacity, 0);
          const epiStored = eBays.reduce((acc, b) => acc + b.storedBoxesCount, 0);
          const epiOccupancy = epiCapacity > 0 ? Math.round((epiStored / epiCapacity) * 1000) / 10 : 0;
          const epiMlTotal = Math.round(epiCapacity * ML_PER_BOX * 100) / 100;
          const epiMlOccupied = Math.round(epiStored * ML_PER_BOX * 100) / 100;
          const epiMlAvailable = Math.round(Math.max(0, epiMlTotal - epiMlOccupied) * 100) / 100;
          return {
            code: epiCode,
            name: `Épi ${epiCode}`,
            baysCount: eBays.length,
            totalCapacity: epiCapacity,
            storedBoxesCount: epiStored,
            availableCapacity: Math.max(0, epiCapacity - epiStored),
            occupancyRate: epiOccupancy,
            mlTotal: epiMlTotal,
            mlOccupied: epiMlOccupied,
            mlAvailable: epiMlAvailable,
            bays: eBays
          };
        });

        return {
          ...r,
          baysCount: roomBays.length,
          episCount: structuredEpis.length,
          totalCapacity: roomCapacity,
          storedBoxesCount: roomStored,
          availableCapacity: Math.max(0, roomCapacity - roomStored),
          occupancyRate: roomOccupancy,
          mlTotal: roomMlTotal,
          mlOccupied: roomMlOccupied,
          mlAvailable: roomMlAvailable,
          status: roomOccupancy >= 100 ? 'saturée' : roomStored > 0 ? 'occupée' : 'disponible',
          epis: structuredEpis,
          bays: roomBays
        };
      });

      const overallOccupancyRate = totalCapacity > 0 ? Math.round((totalStoredBoxes / totalCapacity) * 1000) / 10 : 0;
      const totalMlCapacity = Math.round(totalCapacity * ML_PER_BOX * 100) / 100;
      const totalMlOccupied = Math.round(totalStoredBoxes * ML_PER_BOX * 100) / 100;
      const totalMlAvailable = Math.round(Math.max(0, totalMlCapacity - totalMlOccupied) * 100) / 100;

      res.json({
        summary: {
          totalCapacity,
          totalStoredBoxes,
          totalAvailablePlaces: Math.max(0, totalCapacity - totalStoredBoxes),
          overallOccupancyRate,
          totalMlCapacity,
          totalMlOccupied,
          totalMlAvailable,
          
          // Rooms
          totalRooms: totalRoomsCount,
          loadedRooms: loadedRoomsCount,
          availableRooms: totalRoomsCount - loadedRoomsCount,
          emptyRooms: emptyRoomsCount,

          // Bays
          totalBays: totalBaysCount,
          loadedBays: loadedBaysCount,
          availableBays: totalBaysCount - loadedBaysCount,
          emptyBays: emptyBaysCount,

          // Shelves
          totalShelves: totalShelvesCount,
          loadedShelves: loadedShelvesCount,
          fullShelves: fullShelvesCount,
          availableShelves: totalShelvesCount - fullShelvesCount,
          emptyShelves: emptyShelvesCount
        },
        rooms: structuredRooms,
        unallocatedBoxes: allKnownBoxes.filter(b => !b.isAllocated),
        totalValidatedBoxesCount: allKnownBoxes.length,
        validatedBatches: validatedBatches.map(b => ({
          id: b.id,
          batchNumber: b.batchNumber,
          inventoryRef: b.inventoryRef,
          inventoryName: b.inventoryName,
          direction: b.direction,
          validatedAt: b.validatedAt,
          validatedBy: b.validatedBy,
          boxesCount: b.boxesCount,
          foldersCount: b.foldersCount
        }))
      });
    } catch (err: any) {
      console.error("[STORAGE OVERVIEW ERROR]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Create or update room
  app.post("/api/storage/rooms", authenticate, (req: any, res) => {
    try {
      const { id, name, code, building, description, autoGenerateBays, bayCount, shelfCount, shelfCapacity } = req.body;
      const roomId = id || `room_${Date.now()}`;
      const now = new Date().toISOString();
      const numBays = Math.max(1, Number(bayCount) || 31);
      const numShelves = Math.max(1, Number(shelfCount) || 7);
      const cap = Math.max(1, Number(shelfCapacity) || 5);

      const isNew = !id;
      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';

      db.transaction(() => {
        db.prepare(`
          INSERT INTO storage_rooms (id, name, code, building, description, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            code = excluded.code,
            building = excluded.building,
            description = excluded.description
        `).run(roomId, name, code || 'S', building || '', description || '', now);

        if (autoGenerateBays && numBays > 0 && isNew) {
          for (let i = 1; i <= numBays; i++) {
            const bayId = `bay_${roomId}_${i}`;
            const bayCode = `T${i}`;
            db.prepare(`
              INSERT OR REPLACE INTO storage_bays (id, roomId, name, code, bayNumber, description, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(bayId, roomId, `Travée ${bayCode}`, bayCode, i, `Rayonnage ${name} - ${bayCode}`, now);

            for (let s = 1; s <= numShelves; s++) {
              const shelfId = `shelf_${bayId}_${s}`;
              const shelfCode = `${bayCode}-N${s}`;
              db.prepare(`
                INSERT OR REPLACE INTO storage_shelves (id, bayId, roomId, name, code, shelfNumber, boxCapacity, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(shelfId, bayId, roomId, `Niveau ${s}`, shelfCode, s, cap, now);
            }
          }
        }

        db.prepare(`
          INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `hist_${Date.now()}`,
          adminName,
          isNew ? 'AJOUT_SALLE' : 'MODIFICATION_SALLE',
          isNew ? `Ajout de la salle : ${name} (${numBays} travées)` : `Modification de la salle : ${name}`,
          JSON.stringify({ roomId, name, bayCount: numBays, shelfCount: numShelves, shelfCapacity: cap }),
          now
        );
      })();

      res.json({ success: true, roomId, message: "Salle d'archivage enregistrée avec succès !" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Configure Épis for a Room (Supports A-H, custom number of bays per épi, custom shelves count)
  app.post("/api/storage/configure-epis", authenticate, (req: any, res) => {
    try {
      const { 
        roomId, 
        epis = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 
        baysPerEpi = 31, 
        shelfCount = 7, 
        shelfCapacity = 5,
        numberingStyle = 'epi-travee' // 'A-T01' | 'A-01' | 'T01'
      } = req.body;

      if (!roomId) {
        return res.status(400).json({ error: "Identifiant de la salle requis." });
      }

      const room = db.prepare("SELECT * FROM storage_rooms WHERE id = ?").get(roomId) as any;
      if (!room) {
        return res.status(404).json({ error: "Salle introuvable." });
      }

      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit & Administration';
      const now = new Date().toISOString();
      const cleanEpis = Array.isArray(epis) && epis.length > 0 
        ? epis.map(e => String(e).trim().toUpperCase()).filter(Boolean) 
        : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const numBaysPerEpi = Math.max(1, Number(baysPerEpi) || 31);
      const numShelves = Math.max(1, Number(shelfCount) || 7);
      const cap = Math.max(1, Number(shelfCapacity) || 5);

      db.transaction(() => {
        // Find existing boxes in this room to safely preserve/relocate if any
        const existingAllocations = db.prepare("SELECT * FROM storage_box_allocations WHERE roomId = ?").all(roomId) as any[];

        // Clear existing bays and shelves in this room
        db.prepare("DELETE FROM storage_shelves WHERE roomId = ?").run(roomId);
        db.prepare("DELETE FROM storage_bays WHERE roomId = ?").run(roomId);

        const insertBay = db.prepare(`
          INSERT INTO storage_bays (id, roomId, name, code, bayNumber, epi, bayNumberInEpi, description, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertShelf = db.prepare(`
          INSERT INTO storage_shelves (id, bayId, roomId, name, code, shelfNumber, boxCapacity, epi, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let globalBayCounter = 1;
        const createdShelvesList: any[] = [];

        for (const epiLetter of cleanEpis) {
          for (let bInEpi = 1; bInEpi <= numBaysPerEpi; bInEpi++) {
            const formattedBayNum = bInEpi.toString().padStart(2, '0');
            const bayCode = numberingStyle === 'A-01' ? `${epiLetter}-${formattedBayNum}` : `${epiLetter}-T${formattedBayNum}`;
            const bayName = `Épi ${epiLetter} - Travée ${formattedBayNum}`;
            const bayId = `bay_${roomId}_${epiLetter}_${bInEpi}_${Date.now()}`;

            insertBay.run(
              bayId,
              roomId,
              bayName,
              bayCode,
              globalBayCounter,
              epiLetter,
              bInEpi,
              `Rayonnage Épi ${epiLetter} (${room.name}) - Travée ${formattedBayNum}`,
              now
            );

            for (let sIdx = 1; sIdx <= numShelves; sIdx++) {
              const shelfId = `shelf_${bayId}_${sIdx}`;
              const shelfCode = `${bayCode}-N${sIdx}`;
              const shelfName = `Niveau ${sIdx}`;

              insertShelf.run(
                shelfId,
                bayId,
                roomId,
                shelfName,
                shelfCode,
                sIdx,
                cap,
                epiLetter,
                now
              );

              createdShelvesList.push({ id: shelfId, bayId, roomId, boxCapacity: cap, currentBoxes: 0 });
            }

            globalBayCounter++;
          }
        }

        // Re-allocate existing boxes back into the newly generated shelves
        if (existingAllocations.length > 0 && createdShelvesList.length > 0) {
          let shIdx = 0;
          const insertAlloc = db.prepare(`
            INSERT INTO storage_box_allocations (
              id, boxNumber, shelfId, bayId, roomId, batchId, inventoryRef, direction, folderCount, notes, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const alloc of existingAllocations) {
            while (shIdx < createdShelvesList.length && createdShelvesList[shIdx].currentBoxes >= createdShelvesList[shIdx].boxCapacity) {
              shIdx++;
            }
            if (shIdx >= createdShelvesList.length) break;

            const targetShelf = createdShelvesList[shIdx];
            const newAllocId = `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            insertAlloc.run(
              newAllocId,
              alloc.boxNumber,
              targetShelf.id,
              targetShelf.bayId,
              roomId,
              alloc.batchId || '',
              alloc.inventoryRef || '',
              alloc.direction || '',
              alloc.folderCount || 0,
              alloc.notes || '',
              now
            );
            targetShelf.currentBoxes++;
          }
        }

        const totalBays = cleanEpis.length * numBaysPerEpi;
        const totalShelves = totalBays * numShelves;
        const totalBoxCapacity = totalShelves * cap;

        db.prepare(`
          INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `hist_${Date.now()}`,
          adminName,
          'CONFIGURATION_EPIS',
          `${room.name} configurée avec ${cleanEpis.length} épis (${cleanEpis.join('-')}) × ${numBaysPerEpi} travées (${totalBays} travées, ${numShelves} niveaux/travée)`,
          JSON.stringify({ 
            roomId, 
            epis: cleanEpis, 
            baysPerEpi: numBaysPerEpi, 
            totalBays, 
            shelvesPerBay: numShelves, 
            shelfCapacity: cap, 
            totalCapacity: totalBoxCapacity 
          }),
          now
        );
      })();

      const totalBays = cleanEpis.length * numBaysPerEpi;
      const totalShelves = totalBays * numShelves;
      const totalBoxCapacity = totalShelves * cap;

      res.json({
        success: true,
        message: `${room.name} configurée avec succès : ${cleanEpis.length} épis (${cleanEpis.join(', ')}) × ${numBaysPerEpi} travées = ${totalBays} travées (${totalShelves} tablettes, capacité : ${totalBoxCapacity} boîtes) !`,
        totalBays,
        totalShelves,
        totalBoxCapacity
      });
    } catch (err: any) {
      console.error("Error configuring epis:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Quick Preset for Salle 1: 8 Épis A-H × 31 Travées × 7 Tablettes
  app.post("/api/storage/apply-salle1-preset", authenticate, (req: any, res) => {
    try {
      const room = db.prepare("SELECT * FROM storage_rooms WHERE id = 'room_salle_1' OR name LIKE '%Salle 1%'").get() as any;
      const roomId = room ? room.id : 'room_salle_1';
      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';
      const now = new Date().toISOString();

      const cleanEpis = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const numBaysPerEpi = 31;
      const numShelves = 7;
      const cap = 5;

      db.transaction(() => {
        // Ensure room exists
        db.prepare(`
          INSERT INTO storage_rooms (id, name, code, building, description, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = 'Salle 1',
            code = 'S1',
            description = 'Dépôt principal d''archivage - 8 Épis (A-H) × 31 travées × 7 tablettes'
        `).run(roomId, 'Salle 1', 'S1', 'Dépôt Central A', 'Dépôt principal d\'archivage - 8 Épis (A-H) × 31 travées × 7 tablettes', now);

        // Clear existing bays and shelves in Salle 1
        db.prepare("DELETE FROM storage_shelves WHERE roomId = ?").run(roomId);
        db.prepare("DELETE FROM storage_bays WHERE roomId = ?").run(roomId);

        const insertBay = db.prepare(`
          INSERT INTO storage_bays (id, roomId, name, code, bayNumber, epi, bayNumberInEpi, description, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertShelf = db.prepare(`
          INSERT INTO storage_shelves (id, bayId, roomId, name, code, shelfNumber, boxCapacity, epi, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let globalBayCounter = 1;

        for (const epiLetter of cleanEpis) {
          for (let bInEpi = 1; bInEpi <= numBaysPerEpi; bInEpi++) {
            const formattedBayNum = bInEpi.toString().padStart(2, '0');
            const bayCode = `${epiLetter}-T${formattedBayNum}`;
            const bayName = `Épi ${epiLetter} - Travée ${formattedBayNum}`;
            const bayId = `bay_${roomId}_${epiLetter}_${bInEpi}`;

            insertBay.run(
              bayId,
              roomId,
              bayName,
              bayCode,
              globalBayCounter,
              epiLetter,
              bInEpi,
              `Rayonnage Épi ${epiLetter} (Salle 1) - Travée ${formattedBayNum}`,
              now
            );

            for (let sIdx = 1; sIdx <= numShelves; sIdx++) {
              const shelfId = `shelf_${bayId}_${sIdx}`;
              const shelfCode = `${bayCode}-N${sIdx}`;
              const shelfName = `Niveau ${sIdx}`;

              insertShelf.run(
                shelfId,
                bayId,
                roomId,
                shelfName,
                shelfCode,
                sIdx,
                cap,
                epiLetter,
                now
              );
            }

            globalBayCounter++;
          }
        }

        db.prepare(`
          INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `hist_${Date.now()}`,
          adminName,
          'CONFIGURATION_SALLE_1_EPIS',
          'Salle 1 configurée : 8 Épis (A, B, C, D, E, F, G, H) × 31 travées × 7 niveaux (248 travées, 1 736 tablettes)',
          JSON.stringify({ roomId, epis: cleanEpis, baysPerEpi: 31, shelvesPerBay: 7, shelfCapacity: 5, totalBays: 248, totalCapacity: 8680 }),
          now
        );
      })();

      res.json({
        success: true,
        message: "Salle 1 configurée avec succès : 8 Épis (A à H) × 31 Travées = 248 Travées × 7 Tablettes (1 736 Niveaux, Capacité : 8 680 boîtes / 1 487.75 ml) !",
        totalBays: 248,
        totalShelves: 1736,
        totalBoxCapacity: 8680
      });
    } catch (err: any) {
      console.error("Error applying Salle 1 preset:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Batch update bay count for a room (allows increasing/decreasing bays with box safety check)
  app.post("/api/storage/batch-update-bays", authenticate, (req: any, res) => {
    try {
      const { roomId, targetBayCount, shelfCount = 7, shelfCapacity = 5, numberingPrefix = 'T' } = req.body;
      if (!roomId || !targetBayCount || Number(targetBayCount) < 1) {
        return res.status(400).json({ error: "Identifiant de salle et nombre de travées cible valides requis." });
      }

      const room = db.prepare("SELECT * FROM storage_rooms WHERE id = ?").get(roomId) as any;
      if (!room) {
        return res.status(404).json({ error: "Salle introuvable." });
      }

      const currentBays = db.prepare("SELECT * FROM storage_bays WHERE roomId = ? ORDER BY bayNumber ASC").all(roomId) as any[];
      const currentCount = currentBays.length;
      const targetCount = Number(targetBayCount);
      const now = new Date().toISOString();
      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';

      if (targetCount === currentCount) {
        return res.json({ success: true, message: `La salle possède déjà ${targetCount} travées.` });
      }

      db.transaction(() => {
        if (targetCount > currentCount) {
          // Add new empty bays from currentCount + 1 up to targetCount
          for (let i = currentCount + 1; i <= targetCount; i++) {
            const bayCode = `${numberingPrefix}${i}`;
            const bayId = `bay_${roomId}_${i}_${Date.now()}`;
            db.prepare(`
              INSERT INTO storage_bays (id, roomId, name, code, bayNumber, description, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(bayId, roomId, `Travée ${bayCode}`, bayCode, i, `Rayonnage ${room.name} - ${bayCode}`, now);

            for (let s = 1; s <= shelfCount; s++) {
              const shelfId = `shelf_${bayId}_${s}`;
              const shelfCode = `${bayCode}-N${s}`;
              db.prepare(`
                INSERT INTO storage_shelves (id, bayId, roomId, name, code, shelfNumber, boxCapacity, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(shelfId, bayId, roomId, `Niveau ${s}`, shelfCode, s, shelfCapacity, now);
            }
          }

          db.prepare(`
            INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            `hist_${Date.now()}`,
            adminName,
            'AJUSTEMENT_TRAVEES',
            `${room.name} : ${currentCount} → ${targetCount} travées (+${targetCount - currentCount} nouvelles travées vides)`,
            JSON.stringify({ roomId, previousCount: currentCount, newCount: targetCount }),
            now
          );
        } else {
          // Decreasing bay count: check if any bay to be removed contains boxes
          const baysToRemove = currentBays.slice(targetCount);
          for (const b of baysToRemove) {
            const boxCount = (db.prepare("SELECT COUNT(*) as count FROM storage_box_allocations WHERE bayId = ?").get(b.id) as any)?.count || 0;
            if (boxCount > 0) {
              throw new Error(`Cette travée contient des boîtes. Vous devez d’abord déplacer ou retirer les boîtes avant de pouvoir la supprimer. (Travée ${b.name})`);
            }
          }

          for (const b of baysToRemove) {
            db.prepare("DELETE FROM storage_shelves WHERE bayId = ?").run(b.id);
            db.prepare("DELETE FROM storage_bays WHERE id = ?").run(b.id);
          }

          db.prepare(`
            INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            `hist_${Date.now()}`,
            adminName,
            'REDUCTION_TRAVEES',
            `${room.name} : ${currentCount} → ${targetCount} travées (${currentCount - targetCount} travées vides supprimées)`,
            JSON.stringify({ roomId, previousCount: currentCount, newCount: targetCount }),
            now
          );
        }
      })();

      res.json({
        success: true,
        message: `${room.name} : Nombre de travées mis à jour de ${currentCount} à ${targetCount} travées avec succès !`
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Renumber bays automatically (Global or Room mode)
  app.post("/api/storage/renumber-bays", authenticate, (req: any, res) => {
    try {
      const { roomId, mode = 'room', prefix = 'T', padLength = 2 } = req.body;
      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';
      const now = new Date().toISOString();

      db.transaction(() => {
        if (mode === 'room' && roomId) {
          const room = db.prepare("SELECT * FROM storage_rooms WHERE id = ?").get(roomId) as any;
          const bays = db.prepare("SELECT * FROM storage_bays WHERE roomId = ? ORDER BY bayNumber ASC, id ASC").all(roomId) as any[];
          
          bays.forEach((b, idx) => {
            const num = idx + 1;
            const formattedNum = padLength > 0 ? num.toString().padStart(padLength, '0') : num.toString();
            const bayCode = `${prefix}${formattedNum}`;
            const bayName = `Travée ${bayCode}`;

            db.prepare("UPDATE storage_bays SET bayNumber = ?, name = ?, code = ? WHERE id = ?").run(num, bayName, bayCode, b.id);
            
            // Update shelves code
            const shelves = db.prepare("SELECT * FROM storage_shelves WHERE bayId = ? ORDER BY shelfNumber ASC").all(b.id) as any[];
            shelves.forEach((s) => {
              const shelfCode = `${bayCode}-N${s.shelfNumber}`;
              db.prepare("UPDATE storage_shelves SET code = ? WHERE id = ?").run(shelfCode, s.id);
            });
          });

          db.prepare(`
            INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            `hist_${Date.now()}`,
            adminName,
            'RENUMEROTATION_SALLE',
            `Numérotation recalculée pour ${room?.name || 'Salle'} (${bays.length} travées, format ${prefix}01)`,
            JSON.stringify({ roomId, prefix, count: bays.length }),
            now
          );
        } else {
          // Global numbering across all rooms
          const rooms = db.prepare("SELECT * FROM storage_rooms ORDER BY name ASC").all() as any[];
          let globalCounter = 1;
          for (const r of rooms) {
            const bays = db.prepare("SELECT * FROM storage_bays WHERE roomId = ? ORDER BY bayNumber ASC, id ASC").all(r.id) as any[];
            bays.forEach((b) => {
              const formattedNum = padLength > 0 ? globalCounter.toString().padStart(padLength, '0') : globalCounter.toString();
              const bayCode = `${prefix}${formattedNum}`;
              const bayName = `Travée ${bayCode}`;

              db.prepare("UPDATE storage_bays SET bayNumber = ?, name = ?, code = ? WHERE id = ?").run(globalCounter, bayName, bayCode, b.id);
              
              const shelves = db.prepare("SELECT * FROM storage_shelves WHERE bayId = ? ORDER BY shelfNumber ASC").all(b.id) as any[];
              shelves.forEach((s) => {
                const shelfCode = `${bayCode}-N${s.shelfNumber}`;
                db.prepare("UPDATE storage_shelves SET code = ? WHERE id = ?").run(shelfCode, s.id);
              });
              globalCounter++;
            });
          }

          db.prepare(`
            INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            `hist_${Date.now()}`,
            adminName,
            'RENUMEROTATION_GLOBALE',
            `Numérotation globale recalculée (${globalCounter - 1} travées au total, format ${prefix}01 → ${prefix}${globalCounter - 1})`,
            JSON.stringify({ totalBays: globalCounter - 1, prefix }),
            now
          );
        }
      })();

      res.json({ success: true, message: "Numérotation des travées recalculée avec succès !" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Configuration History
  app.get("/api/storage/history", authenticate, (req: any, res) => {
    try {
      const history = db.prepare("SELECT * FROM storage_config_history ORDER BY createdAt DESC LIMIT 100").all() as any[];
      res.json({ history });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add Configuration History Log
  app.post("/api/storage/history", authenticate, (req: any, res) => {
    try {
      const { description, actionType = 'MODIFICATION_CONFIG', details } = req.body;
      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        adminName,
        actionType,
        description || 'Modification de configuration du dépôt',
        typeof details === 'string' ? details : JSON.stringify(details || {}),
        now
      );

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Room with box safety check
  app.delete("/api/storage/rooms/:id", authenticate, (req: any, res) => {
    try {
      const { id } = req.params;
      const room = db.prepare("SELECT * FROM storage_rooms WHERE id = ?").get(id) as any;
      if (!room) return res.status(404).json({ error: "Salle introuvable." });

      const boxCount = (db.prepare("SELECT COUNT(*) as count FROM storage_box_allocations WHERE roomId = ?").get(id) as any)?.count || 0;
      if (boxCount > 0) {
        return res.status(400).json({
          error: `Cette salle contient ${boxCount} boîte(s) d'archives. Vous devez d’abord déplacer ou retirer les boîtes avant de pouvoir la supprimer.`
        });
      }

      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';
      const now = new Date().toISOString();

      db.transaction(() => {
        db.prepare("DELETE FROM storage_shelves WHERE roomId = ?").run(id);
        db.prepare("DELETE FROM storage_bays WHERE roomId = ?").run(id);
        db.prepare("DELETE FROM storage_rooms WHERE id = ?").run(id);

        db.prepare(`
          INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `hist_${Date.now()}`,
          adminName,
          'SUPPRESSION_SALLE',
          `Suppression de la salle : ${room.name}`,
          JSON.stringify({ roomId: id, name: room.name }),
          now
        );
      })();

      res.json({ success: true, message: `Salle « ${room.name} » et ses rayonnages supprimés.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create or update Bay
  app.post("/api/storage/bays", authenticate, (req: any, res) => {
    try {
      const { id, roomId, name, code, bayNumber, description, autoGenerateShelves, shelfCount = 7, shelfCapacity = 5 } = req.body;
      const bayId = id || `bay_${Date.now()}`;
      const now = new Date().toISOString();
      const numShelves = Math.max(1, Number(shelfCount) || 7);
      const cap = Math.max(1, Number(shelfCapacity) || 5);
      const isNew = !id;
      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';

      db.transaction(() => {
        db.prepare(`
          INSERT INTO storage_bays (id, roomId, name, code, bayNumber, description, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            code = excluded.code,
            bayNumber = excluded.bayNumber,
            description = excluded.description
        `).run(bayId, roomId, name, code || 'T', bayNumber || 1, description || '', now);

        if (autoGenerateShelves && isNew) {
          for (let s = 1; s <= numShelves; s++) {
            const shelfId = `shelf_${bayId}_${s}`;
            const shelfCode = `${code || 'T'}-N${s}`;
            db.prepare(`
              INSERT OR REPLACE INTO storage_shelves (id, bayId, roomId, name, code, shelfNumber, boxCapacity, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(shelfId, bayId, roomId, `Niveau ${s}`, shelfCode, s, cap, now);
          }
        }

        db.prepare(`
          INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `hist_${Date.now()}`,
          adminName,
          isNew ? 'AJOUT_TRAVEE' : 'MODIFICATION_TRAVEE',
          isNew ? `Ajout de la travée : ${name} (Capacité : ${numShelves * cap} boîtes)` : `Modification de la travée : ${name}`,
          JSON.stringify({ bayId, name, code, shelfCount: numShelves, shelfCapacity: cap }),
          now
        );
      })();

      res.json({ success: true, bayId, message: "Travée enregistrée avec succès !" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Bay with box safety check
  app.delete("/api/storage/bays/:id", authenticate, (req: any, res) => {
    try {
      const { id } = req.params;
      const bay = db.prepare("SELECT * FROM storage_bays WHERE id = ?").get(id) as any;
      if (!bay) return res.status(404).json({ error: "Travée introuvable." });

      const boxCount = (db.prepare("SELECT COUNT(*) as count FROM storage_box_allocations WHERE bayId = ?").get(id) as any)?.count || 0;
      if (boxCount > 0) {
        return res.status(400).json({
          error: "Cette travée contient des boîtes. Vous devez d’abord déplacer ou retirer les boîtes avant de pouvoir la supprimer."
        });
      }

      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';
      const now = new Date().toISOString();

      db.transaction(() => {
        db.prepare("DELETE FROM storage_shelves WHERE bayId = ?").run(id);
        db.prepare("DELETE FROM storage_bays WHERE id = ?").run(id);

        db.prepare(`
          INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `hist_${Date.now()}`,
          adminName,
          'SUPPRESSION_TRAVEE',
          `Suppression de la travée : ${bay.name}`,
          JSON.stringify({ bayId: id, name: bay.name }),
          now
        );
      })();

      res.json({ success: true, message: `Travée « ${bay.name} » supprimée avec succès.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Seed realistic reference depot boxes matching reference screenshot
  app.post("/api/storage/seed-reference-data", authenticate, (req: any, res) => {
    try {
      const rooms = db.prepare("SELECT * FROM storage_rooms ORDER BY name ASC").all() as any[];
      if (rooms.length === 0) {
        return res.status(400).json({ error: "Veuillez d'abord créer des salles." });
      }

      const now = new Date().toISOString();
      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';

      db.transaction(() => {
        // Clear previous allocations to achieve pristine alignment
        db.prepare("DELETE FROM storage_box_allocations").run();

        const insertAlloc = db.prepare(`
          INSERT INTO storage_box_allocations (
            id, boxNumber, shelfId, bayId, roomId, batchId, inventoryRef, direction, folderCount, notes, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let globalBoxIndex = 1;
        const allBays = db.prepare("SELECT * FROM storage_bays ORDER BY roomId ASC, bayNumber ASC").all() as any[];

        for (const bay of allBays) {
          const shelves = db.prepare("SELECT * FROM storage_shelves WHERE bayId = ? ORDER BY shelfNumber ASC").all(bay.id) as any[];
          const bayCapacity = shelves.reduce((acc, s) => acc + (s.boxCapacity || 5), 0);

          // Give realistic fill rate: e.g. T47 is ~91.4% (32/35), average across depot is ~78%
          let targetFillRatio = 0.78;
          if (bay.code === 'T47' || bay.name.includes('47')) {
            targetFillRatio = 32 / 35; // exactly 32 boxes
          } else if (bay.bayNumber % 4 === 0) {
            targetFillRatio = 0.95; // saturated
          } else if (bay.bayNumber % 5 === 0) {
            targetFillRatio = 0.65; // partial
          } else if (bay.bayNumber % 7 === 0) {
            targetFillRatio = 0.82;
          } else {
            targetFillRatio = 0.75 + ((bay.bayNumber * 7) % 20) / 100;
          }

          const targetBoxCount = Math.min(bayCapacity, Math.max(1, Math.round(bayCapacity * targetFillRatio)));
          let bayInserted = 0;

          for (const shelf of shelves) {
            const shelfCap = shelf.boxCapacity || 5;
            for (let pos = 1; pos <= shelfCap; pos++) {
              if (bayInserted >= targetBoxCount) break;

              const boxCode = `B${globalBoxIndex.toString().padStart(4, '0')}`;
              const archiveType = (globalBoxIndex % 2 === 0) ? 'Sinistres Matériels' : 'Sinistres Corporels';
              const direction = (globalBoxIndex % 3 === 0) ? 'Direction Sinistres & Prestations' : 'Direction Générale & Juridique';

              insertAlloc.run(
                `alloc_ref_${globalBoxIndex}`,
                boxCode,
                shelf.id,
                bay.id,
                bay.roomId,
                `batch_valid_${1 + (globalBoxIndex % 5)}`,
                `INV-2026-${archiveType.substring(0, 3).toUpperCase()}-${(globalBoxIndex % 20) + 1}`,
                direction,
                4 + (globalBoxIndex % 6),
                archiveType,
                now
              );

              globalBoxIndex++;
              bayInserted++;
            }
          }
        }

        db.prepare(`
          INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `hist_${Date.now()}`,
          adminName,
          'REINITIALISATION_DONNEES',
          `Initialisation des boîtes selon validation d'audit (${globalBoxIndex - 1} boîtes réparties, ~78% d'occupation)`,
          JSON.stringify({ totalBoxes: globalBoxIndex - 1 }),
          now
        );
      })();

      res.json({ success: true, message: "Données de démonstration et boîtes d'archives initialisées avec succès !" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create or update Shelf
  app.post("/api/storage/shelves", authenticate, (req: any, res) => {
    try {
      const { id, bayId, roomId, name, code, shelfNumber, boxCapacity } = req.body;
      const shelfId = id || `shelf_${Date.now()}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO storage_shelves (id, bayId, roomId, name, code, shelfNumber, boxCapacity, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          code = excluded.code,
          shelfNumber = excluded.shelfNumber,
          boxCapacity = excluded.boxCapacity
      `).run(shelfId, bayId, roomId, name, code || 'N', shelfNumber || 1, Number(boxCapacity) || 5, now);

      res.json({ success: true, shelfId, message: "Niveau/Tablette enregistrée avec succès !" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Shelf
  app.delete("/api/storage/shelves/:id", authenticate, (req: any, res) => {
    try {
      const { id } = req.params;
      const boxCount = (db.prepare("SELECT COUNT(*) as count FROM storage_box_allocations WHERE shelfId = ?").get(id) as any)?.count || 0;
      if (boxCount > 0) {
        return res.status(400).json({
          error: "Ce niveau contient des boîtes. Vous devez d'abord déplacer les boîtes avant de le supprimer."
        });
      }

      db.transaction(() => {
        db.prepare("DELETE FROM storage_box_allocations WHERE shelfId = ?").run(id);
        db.prepare("DELETE FROM storage_shelves WHERE id = ?").run(id);
      })();
      res.json({ success: true, message: "Niveau supprimé." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Allocate a box to a specific shelf
  app.post("/api/storage/allocate-box", authenticate, (req: any, res) => {
    try {
      const { boxNumber, shelfId, batchId, inventoryRef, direction, folderCount, notes } = req.body;
      if (!boxNumber || !shelfId) {
        return res.status(400).json({ error: "Numéro de boîte et identifiant de tablette requis." });
      }

      const shelf = db.prepare("SELECT * FROM storage_shelves WHERE id = ?").get(shelfId) as any;
      if (!shelf) {
        return res.status(404).json({ error: "Tablette introuvable." });
      }

      // Check shelf capacity
      const currentBoxCount = (db.prepare("SELECT COUNT(*) as count FROM storage_box_allocations WHERE shelfId = ?").get(shelfId) as any)?.count || 0;
      if (currentBoxCount >= (shelf.boxCapacity || 6)) {
        return res.status(400).json({ error: `La tablette ${shelf.name} est pleine (${shelf.boxCapacity} boîtes max).` });
      }

      const allocId = `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      // Check if box was already allocated elsewhere and move it
      db.prepare("DELETE FROM storage_box_allocations WHERE boxNumber = ? AND (batchId = ? OR batchId IS NULL)").run(boxNumber, batchId || null);

      db.prepare(`
        INSERT INTO storage_box_allocations (
          id, boxNumber, shelfId, bayId, roomId, batchId, inventoryRef, direction, folderCount, notes, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(allocId, String(boxNumber).trim(), shelfId, shelf.bayId, shelf.roomId, batchId || '', inventoryRef || '', direction || '', Number(folderCount) || 0, notes || '', now);

      res.json({ success: true, message: `Boîte ${boxNumber} rangée avec succès sur la ${shelf.name} !` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove box allocation from shelf
  app.delete("/api/storage/allocate-box/:id", authenticate, (req: any, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM storage_box_allocations WHERE id = ? OR boxNumber = ?").run(id, id);
      res.json({ success: true, message: "Boîte désaffectée de la tablette." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Helper function to find best matching shelf for a box based on physical location text or fallback
  function findBestMatchingShelf(box: any, allShelves: any[]): any | null {
    const rawLoc = String(box.rawLocalisation || box.localisation || box.location || box.emplacement || '').toUpperCase().trim();
    const roomHint = String(box.salle || box.depot || box.room || '').toUpperCase().trim();
    const traveeHint = String(box.travee || box.bay || box.rayon || box.epi || '').toUpperCase().trim();
    const tabletteHint = String(box.tablette || box.shelf || box.niveau || box.etagere || '').toUpperCase().trim();

    // 1. Exact shelf code match if present (e.g. S1-T05-N3, T47-N4, A-T01-N2)
    if (rawLoc || tabletteHint) {
      for (const s of allShelves) {
        if (s.currentBoxes >= s.boxCapacity) continue;
        const shelfCodeUpper = (s.code || '').toUpperCase();
        if (shelfCodeUpper && (rawLoc.includes(shelfCodeUpper) || (tabletteHint && shelfCodeUpper === tabletteHint))) {
          return s;
        }
      }
    }

    // 2. Parse room, bay, and shelf hints
    let targetRoomKeyword: string | null = null;
    if (roomHint) {
      if (roomHint.includes('1') || roomHint.includes('S1')) targetRoomKeyword = '1';
      else if (roomHint.includes('2') || roomHint.includes('S2')) targetRoomKeyword = '2';
      else if (roomHint.includes('3') || roomHint.includes('S3')) targetRoomKeyword = '3';
    } else if (rawLoc) {
      if (rawLoc.includes('SALLE 1') || rawLoc.includes('S1')) targetRoomKeyword = '1';
      else if (rawLoc.includes('SALLE 2') || rawLoc.includes('S2')) targetRoomKeyword = '2';
      else if (rawLoc.includes('SALLE 3') || rawLoc.includes('S3')) targetRoomKeyword = '3';
    }

    let targetShelfNum: number | null = null;
    const shelfMatch = (tabletteHint || rawLoc).match(/N(?:IVEAU)?\s*([1-7])|TAB(?:LETTE)?\s*([1-7])|ÉTAGÈRE\s*([1-7])|N([1-7])/i);
    if (shelfMatch) {
      targetShelfNum = parseInt(shelfMatch[1] || shelfMatch[2] || shelfMatch[3] || shelfMatch[4], 10);
    }

    // Check bay code matching (e.g. T47, T05, A-T01)
    let parsedBayCode: string | null = null;
    const bayCodeMatch = (traveeHint || rawLoc).match(/\b([A-H]-T[0-9]{2}|T[0-9]{1,3}|ÉPI\s*[A-H]|EPI\s*[A-H])\b/i);
    if (bayCodeMatch) {
      parsedBayCode = bayCodeMatch[1].replace(/\s+/g, '').toUpperCase();
    }

    // Search matching candidate shelves
    for (const s of allShelves) {
      if (s.currentBoxes >= s.boxCapacity) continue;

      if (targetRoomKeyword) {
        const rName = (s.roomName || '').toUpperCase();
        const rCode = (s.roomCode || '').toUpperCase();
        if (!rName.includes(targetRoomKeyword) && !rCode.includes(`S${targetRoomKeyword}`) && !rCode.includes(targetRoomKeyword)) {
          continue;
        }
      }

      if (parsedBayCode || traveeHint) {
        const bCode = (s.bayCode || '').toUpperCase();
        const bName = (s.bayName || '').toUpperCase();
        const bEpi = (s.epi || '').toUpperCase();
        const queryBay = (parsedBayCode || traveeHint).toUpperCase();

        const matchBay = bCode.includes(queryBay) || queryBay.includes(bCode) || bName.includes(queryBay) || (bEpi && queryBay.includes(bEpi));
        if (!matchBay) {
          continue;
        }
      }

      if (targetShelfNum !== null && s.shelfNumber !== targetShelfNum) {
        continue;
      }

      return s;
    }

    // 3. Fallback: match by room if specified
    if (targetRoomKeyword) {
      for (const s of allShelves) {
        if (s.currentBoxes >= s.boxCapacity) continue;
        const rName = (s.roomName || '').toUpperCase();
        const rCode = (s.roomCode || '').toUpperCase();
        if (rName.includes(targetRoomKeyword) || rCode.includes(`S${targetRoomKeyword}`) || rCode.includes(targetRoomKeyword)) {
          return s;
        }
      }
    }

    // 4. Fallback: next available shelf across all rooms
    for (const s of allShelves) {
      if (s.currentBoxes < s.boxCapacity) {
        return s;
      }
    }

    return null;
  }

  // Reset depot to completely empty (0% occupancy, 0 boxes)
  app.post("/api/storage/reset-depot-empty", authenticate, (req: any, res) => {
    try {
      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit & Stock';
      const now = new Date().toISOString();

      const previousCount = (db.prepare("SELECT COUNT(*) as count FROM storage_box_allocations").get() as any)?.count || 0;

      db.transaction(() => {
        // Clear all box allocations
        db.prepare("DELETE FROM storage_box_allocations").run();

        // Record in config history
        db.prepare(`
          INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `hist_${Date.now()}`,
          adminName,
          'REMISE_A_ZERO_DEPOT_VIDE',
          `Remise à zéro complète du dépôt d'archivage : ${previousCount} boîte(s) désaffectées. Le dépôt est désormais 100% vide (0% d'occupation, 0 boîte).`,
          JSON.stringify({ previousAllocatedBoxes: previousCount, newAllocatedBoxes: 0, status: 'VIDE' }),
          now
        );

        // Record in storage history
        try {
          db.prepare(`
            INSERT INTO storage_history (id, action, targetType, targetName, user, timestamp, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            `hist_${Date.now()}_audit`,
            'DEPOT_REMISE_A_ZERO',
            'DEPOT_GLOBAL',
            'Ensemble des Salles & Rayonnages',
            adminName,
            now,
            `Remise à zéro par le responsable : dépôt configuré en état vide (0 boîte, 0% d'occupation). Prêt pour le peuplement automatique selon les travaux validés.`
          );
        } catch (e) {}
      })();

      res.json({
        success: true,
        clearedBoxesCount: previousCount,
        message: `Dépôt remis à zéro avec succès ! Toutes les tablettes sont désormais vides (0% d'occupation, 0 boîte). Le dépôt se remplira automatiquement au fur et à mesure des validations des travaux et des localisations.`
      });
    } catch (err: any) {
      console.error("Error resetting depot:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Sync depot occupancy from all validated batches & box locations
  app.post("/api/storage/sync-from-validations", authenticate, (req: any, res) => {
    try {
      const adminName = req.user?.displayName || req.user?.email || 'Responsable Audit';
      const now = new Date().toISOString();

      // Retrieve all shelves in the system with their room & bay info
      const allShelves = db.prepare(`
        SELECT s.id, s.bayId, s.roomId, s.name, s.code, s.shelfNumber, s.boxCapacity, s.epi,
               b.name as bayName, b.code as bayCode, b.bayNumber,
               r.name as roomName, r.code as roomCode,
               (SELECT COUNT(*) FROM storage_box_allocations a WHERE a.shelfId = s.id) as currentBoxes
        FROM storage_shelves s
        JOIN storage_bays b ON s.bayId = b.id
        JOIN storage_rooms r ON s.roomId = r.id
        ORDER BY r.id ASC, b.bayNumber ASC, s.shelfNumber ASC
      `).all() as any[];

      if (allShelves.length === 0) {
        return res.status(400).json({ error: "Aucun rayonnage ou tablette configuré dans le dépôt." });
      }

      // Collect all validated batches
      const validatedBatches = db.prepare("SELECT * FROM integration_batches WHERE status = 'validé' ORDER BY validatedAt ASC").all() as any[];
      const existingAllocations = db.prepare("SELECT boxNumber, batchId FROM storage_box_allocations").all() as any[];
      const allocatedSet = new Set(existingAllocations.map(a => `${a.batchId || ''}_${String(a.boxNumber).trim()}`));

      let allocatedCount = 0;
      let matchedByLocationCount = 0;
      let matchedSequentiallyCount = 0;

      const insertAlloc = db.prepare(`
        INSERT INTO storage_box_allocations (
          id, boxNumber, shelfId, bayId, roomId, batchId, inventoryRef, direction, folderCount, notes, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (const vb of validatedBatches) {
          let bData = [];
          let fData = [];
          try { bData = vb.boxesData ? JSON.parse(vb.boxesData) : []; } catch (e) {}
          try { fData = vb.foldersData ? JSON.parse(vb.foldersData) : []; } catch (e) {}

          const boxesToPlace: any[] = [];

          if (bData.length > 0) {
            for (const b of bData) {
              const bNum = String(b.number || b.boxNumber || b.generatedBoxNumber || '').trim();
              if (bNum && !allocatedSet.has(`${vb.id}_${bNum}`)) {
                boxesToPlace.push({
                  boxNumber: bNum,
                  rawLocalisation: b.rawLocalisation || b.localisation || b.location || b.emplacement || '',
                  salle: b.salle || b.depot || b.room || '',
                  travee: b.travee || b.bay || b.rayon || b.epi || '',
                  tablette: b.tablette || b.shelf || b.niveau || b.etagere || '',
                  folderCount: b.foldersCount || (Array.isArray(b.folders) ? b.folders.length : 0),
                  notes: b.notes || `Validation Responsable : Lot ${vb.batchNumber || vb.id}`
                });
              }
            }
          } else if (fData.length > 0) {
            const bMap = new Map<string, any>();
            for (const f of fData) {
              const bNum = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '1').trim();
              if (!bMap.has(bNum)) {
                bMap.set(bNum, {
                  boxNumber: bNum,
                  rawLocalisation: f.rawLocalisation || f.localisation || f.location || f.emplacement || '',
                  salle: f.salle || f.depot || f.room || '',
                  travee: f.travee || f.bay || f.rayon || f.epi || '',
                  tablette: f.tablette || f.shelf || f.niveau || f.etagere || '',
                  folderCount: 0,
                  notes: `Validation Responsable : Dossiers ${vb.direction || ''}`
                });
              }
              bMap.get(bNum).folderCount++;
            }
            for (const item of bMap.values()) {
              if (!allocatedSet.has(`${vb.id}_${item.boxNumber}`)) {
                boxesToPlace.push(item);
              }
            }
          }

          for (const box of boxesToPlace) {
            const targetShelf = findBestMatchingShelf(box, allShelves);
            if (!targetShelf) continue;

            const allocId = `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            insertAlloc.run(
              allocId,
              box.boxNumber,
              targetShelf.id,
              targetShelf.bayId,
              targetShelf.roomId,
              vb.id,
              vb.inventoryRef || '',
              vb.direction || '',
              box.folderCount || 0,
              box.notes || `Validé par ${vb.validatedBy || adminName}`,
              now
            );

            targetShelf.currentBoxes++;
            allocatedSet.add(`${vb.id}_${box.boxNumber}`);
            allocatedCount++;

            if (box.rawLocalisation || box.salle || box.travee || box.tablette) {
              matchedByLocationCount++;
            } else {
              matchedSequentiallyCount++;
            }
          }
        }

        if (allocatedCount > 0) {
          db.prepare(`
            INSERT INTO storage_config_history (id, adminName, actionType, description, details, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            `hist_${Date.now()}`,
            adminName,
            'PEUPLEMENT_AUTO_VALIDATIONS',
            `Peuplement automatique du dépôt : ${allocatedCount} boîte(s) allouées selon les travaux et validations de lots du responsable (${matchedByLocationCount} par localisation exacte, ${matchedSequentiallyCount} séquentielles).`,
            JSON.stringify({ allocatedCount, matchedByLocationCount, matchedSequentiallyCount }),
            now
          );
        }
      })();

      res.json({
        success: true,
        allocatedCount,
        matchedByLocationCount,
        matchedSequentiallyCount,
        message: allocatedCount > 0
          ? `${allocatedCount} boîte(s) ont été positionnées avec succès dans le dépôt selon les validations du responsable et leurs localisations (${matchedByLocationCount} localisations précises respectées) !`
          : "Aucune nouvelle boîte validée en attente d'attribution."
      });
    } catch (err: any) {
      console.error("Error syncing validations into storage:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Auto-allocate all unassigned boxes across available shelves (incorporates location parsing)
  app.post("/api/storage/auto-allocate", authenticate, (req: any, res) => {
    try {
      const allShelves = db.prepare(`
        SELECT s.id, s.bayId, s.roomId, s.name, s.code, s.shelfNumber, s.boxCapacity, s.epi,
               b.name as bayName, b.code as bayCode, b.bayNumber,
               r.name as roomName, r.code as roomCode,
               (SELECT COUNT(*) FROM storage_box_allocations a WHERE a.shelfId = s.id) as currentBoxes
        FROM storage_shelves s
        JOIN storage_bays b ON s.bayId = b.id
        JOIN storage_rooms r ON s.roomId = r.id
        ORDER BY r.id ASC, b.bayNumber ASC, s.shelfNumber ASC
      `).all() as any[];

      if (allShelves.length === 0) {
        return res.status(400).json({ error: "Aucune tablette n'est configurée dans les dépôts d'archives." });
      }

      // Collect all validated batches
      const validatedBatches = db.prepare("SELECT * FROM integration_batches WHERE status = 'validé' ORDER BY validatedAt ASC").all() as any[];
      const existingAllocations = db.prepare("SELECT boxNumber, batchId FROM storage_box_allocations").all() as any[];
      const allocatedMap = new Set(existingAllocations.map(a => `${a.batchId || ''}_${String(a.boxNumber).trim()}`));

      const unallocatedBoxes: any[] = [];
      for (const vb of validatedBatches) {
        let bData = [];
        let fData = [];
        try { bData = vb.boxesData ? JSON.parse(vb.boxesData) : []; } catch (e) {}
        try { fData = vb.foldersData ? JSON.parse(vb.foldersData) : []; } catch (e) {}

        if (bData.length > 0) {
          for (const b of bData) {
            const bNum = String(b.number || b.boxNumber || b.generatedBoxNumber || '').trim();
            if (bNum && !allocatedMap.has(`${vb.id}_${bNum}`)) {
              unallocatedBoxes.push({
                boxNumber: bNum,
                batchId: vb.id,
                inventoryRef: vb.inventoryRef,
                direction: vb.direction,
                rawLocalisation: b.rawLocalisation || b.localisation || b.location || b.emplacement || '',
                salle: b.salle || b.depot || b.room || '',
                travee: b.travee || b.bay || b.rayon || b.epi || '',
                tablette: b.tablette || b.shelf || b.niveau || b.etagere || '',
                folderCount: b.foldersCount || (Array.isArray(b.folders) ? b.folders.length : 0)
              });
            }
          }
        } else if (fData.length > 0) {
          const boxCounts = new Map<string, any>();
          for (const f of fData) {
            const bNum = String(f.boxNumber || f.numBoite || f.generatedBoxNumber || '1').trim();
            if (!boxCounts.has(bNum)) {
              boxCounts.set(bNum, {
                boxNumber: bNum,
                batchId: vb.id,
                inventoryRef: vb.inventoryRef,
                direction: vb.direction,
                rawLocalisation: f.rawLocalisation || f.localisation || f.location || f.emplacement || '',
                salle: f.salle || f.depot || f.room || '',
                travee: f.travee || f.bay || f.rayon || f.epi || '',
                tablette: f.tablette || f.shelf || f.niveau || f.etagere || '',
                folderCount: 0
              });
            }
            boxCounts.get(bNum).folderCount++;
          }
          for (const [bNum, item] of boxCounts.entries()) {
            if (!allocatedMap.has(`${vb.id}_${bNum}`)) {
              unallocatedBoxes.push(item);
            }
          }
        }
      }

      if (unallocatedBoxes.length === 0) {
        return res.json({ success: true, count: 0, message: "Toutes les boîtes validées sont déjà réparties sur les tablettes." });
      }

      let allocatedCount = 0;
      let matchedByLocationCount = 0;
      const now = new Date().toISOString();
      const insertAlloc = db.prepare(`
        INSERT INTO storage_box_allocations (
          id, boxNumber, shelfId, bayId, roomId, batchId, inventoryRef, direction, folderCount, notes, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (const box of unallocatedBoxes) {
          const targetShelf = findBestMatchingShelf(box, allShelves);
          if (!targetShelf) continue;

          const allocId = `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          insertAlloc.run(
            allocId,
            box.boxNumber,
            targetShelf.id,
            targetShelf.bayId,
            targetShelf.roomId,
            box.batchId || '',
            box.inventoryRef || '',
            box.direction || '',
            box.folderCount || 0,
            'Attribution automatique inventaire audit',
            now
          );

          targetShelf.currentBoxes++;
          allocatedCount++;
          if (box.rawLocalisation || box.salle || box.travee || box.tablette) {
            matchedByLocationCount++;
          }
        }
      })();

      res.json({ 
        success: true, 
        count: allocatedCount, 
        matchedByLocationCount,
        message: `${allocatedCount} boîte(s) ont été réparties avec succès dans les rayonnages (${matchedByLocationCount} par localisation) !` 
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Re-seed or generate template depository
  app.post("/api/storage/generate-template", authenticate, (req: any, res) => {
    try {
      const { templateType } = req.body;
      const now = new Date().toISOString();

      db.transaction(() => {
        // Create standard Salle Morneguia if not exists
        const roomExists = db.prepare("SELECT COUNT(*) as count FROM storage_rooms WHERE id = 'room_morneguia_s1'").get() as any;
        if (!roomExists || roomExists.count === 0) {
          db.prepare(`
            INSERT INTO storage_rooms (id, name, code, building, description, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run('room_morneguia_s1', 'Salle 01 — Morneguia (Archives Intermédiaires)', 'S1', 'Bâtiment Principal A', 'Dépôt principal de stockage des archives intermédiaires validées.', now);

          const bays = ['Travée A', 'Travée B', 'Travée C', 'Travée D', 'Travée E', 'Travée F'];
          for (let bIdx = 0; bIdx < bays.length; bIdx++) {
            const bayName = bays[bIdx];
            const bayId = `bay_room_morneguia_s1_${bIdx + 1}`;
            const bayCode = `S1-T${bIdx + 1}`;
            db.prepare(`
              INSERT INTO storage_bays (id, roomId, name, code, bayNumber, description, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(bayId, 'room_morneguia_s1', bayName, bayCode, bIdx + 1, `Rayonnage ${bayName}`, now);

            for (let sIdx = 1; sIdx <= 5; sIdx++) {
              const shelfId = `shelf_${bayId}_${sIdx}`;
              const shelfCode = `${bayCode}-N${sIdx}`;
              db.prepare(`
                INSERT INTO storage_shelves (id, bayId, roomId, name, code, shelfNumber, boxCapacity, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(shelfId, bayId, 'room_morneguia_s1', `Tablette ${sIdx}`, shelfCode, sIdx, 6, now);
            }
          }
        }
      })();

      res.json({ success: true, message: "Structure standard de dépôt générée avec succès !" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // --- Automatic Archival Surveillance Task ---
    const runArchivalCheck = () => {
      console.log("[SURVEILLANCE] Starting daily archival status check...");
      try {
        const rules = getAllRules();
        const currentYear = new Date().getFullYear();
        
        db.transaction(() => {
          for (const rule of rules) {
            const activeThreshold = currentYear - rule.activeYears;
            const semiThreshold = currentYear - (rule.activeYears + rule.semiActiveYears);
            
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

    setTimeout(runArchivalCheck, 5000);
    setInterval(runArchivalCheck, 24 * 60 * 60 * 1000);
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
