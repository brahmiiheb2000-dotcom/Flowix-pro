import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

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

  app.use(express.json({ limit: '50mb' }));
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
        id: Math.random().toString(36).substring(2, 11),
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
        id: Math.random().toString(36).substring(2, 11),
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
        id: Math.random().toString(36).substring(2, 15),
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
        id: Math.random().toString(36).substring(2, 15),
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
          id: Math.random().toString(36).substring(2, 15),
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

  app.post("/api/remote-requests/clear", authenticate, (req: any, res) => {
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
        id: Math.random().toString(36).substring(2, 15),
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
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
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
