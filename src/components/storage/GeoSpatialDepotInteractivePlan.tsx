import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Layers, 
  Box, 
  MapPin, 
  Building2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Hand, 
  MousePointer, 
  Sliders, 
  Plus, 
  RefreshCw, 
  Download, 
  Printer, 
  Eye, 
  Search, 
  Filter, 
  X, 
  ChevronRight, 
  ChevronDown,
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Sparkles, 
  FileSpreadsheet,
  Activity,
  ArrowRight,
  Database,
  Grid,
  List,
  BarChart3,
  Clock,
  Check,
  Package,
  DoorOpen,
  Flame,
  FileText,
  Compass,
  Move,
  Info,
  Navigation,
  FolderOpen,
  SlidersHorizontal,
  FlameKindling,
  Cpu,
  Monitor,
  Warehouse,
  QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import { CustomDepotBuilderModal } from './CustomDepotBuilderModal';

export type SpatialObjectType = 'depot' | 'room' | 'circulation' | 'bay' | 'shelf' | 'box' | 'door' | 'window' | 'extinguisher' | 'equipment';
export type DisplayColorMode = 'occupancy' | 'archive_type' | 'heatmap' | 'status';

export interface SelectedSpatialEntity {
  type: SpatialObjectType;
  id: string;
  code: string;
  name: string;
  roomId?: string;
  roomName?: string;
  bayId?: string;
  bayCode?: string;
  shelfId?: string;
  shelfNumber?: number;
  boxId?: string;
  boxNumber?: string;
  position?: number;
  data: any;
}

interface Props {
  rooms: any[];
  summary: any;
  onRefresh: () => void;
  onResetDepot?: () => void;
  onSyncValidations?: () => void;
  onOpenConfig?: () => void;
  onOpenAddRoom?: () => void;
}

export const GeoSpatialDepotInteractivePlan: React.FC<Props> = ({
  rooms,
  summary,
  onRefresh,
  onResetDepot,
  onSyncValidations,
  onOpenConfig,
  onOpenAddRoom
}) => {
  // View Modes & Navigation
  const [viewMode, setViewMode] = useState<'3d_isometric' | '2d_cad' | 'elevation'>('3d_isometric');
  const [colorMode, setColorMode] = useState<DisplayColorMode>('occupancy');
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showML, setShowML] = useState<boolean>(true);
  const [tiltAngle, setTiltAngle] = useState<number>(55); // Degrees for 3D tilt
  const [rotationAngle, setRotationAngle] = useState<number>(-25);
  
  // Room Filter State ('all' | 'room_1' | 'room_2' | 'room_3' | 'zones')
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<'all' | 'room_1' | 'room_2' | 'room_3' | 'zones'>('all');

  // Hierarchy Navigation (Depot -> Room -> Bay -> Shelf -> Box)
  const [hierarchyPath, setHierarchyPath] = useState<{
    room: string | null;
    bay: string | null;
    shelf: number | null;
    box: string | null;
  }>({
    room: 'room_2',
    bay: 'T47',
    shelf: null,
    box: null
  });

  // Selected Entity for Right Side Panel
  const [selectedEntity, setSelectedEntity] = useState<SelectedSpatialEntity | null>(null);

  // Hover Tooltip State
  const [hoveredObject, setHoveredObject] = useState<{
    type: SpatialObjectType;
    title: string;
    subtitle: string;
    x: number;
    y: number;
    badge?: string;
    rate?: number;
  } | null>(null);

  // Search Query
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Custom Depot Builder Modal
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  // Active Tab/Modal in Bottom Bar
  const [activeBottomModal, setActiveBottomModal] = useState<'none' | 'bays_list' | 'boxes_list' | 'stats' | 'export'>('none');
  const [sidePanelTab, setSidePanelTab] = useState<'info' | 'shelves' | 'boxes' | 'security'>('info');

  const containerRef = useRef<HTMLDivElement>(null);

  // Handle default room selection
  useEffect(() => {
    if (rooms && rooms.length > 0 && (!hierarchyPath.room || !rooms.some(r => r.id === hierarchyPath.room))) {
      const r2 = rooms.find(r => r.name?.toLowerCase().includes('2') || r.code?.includes('2')) || rooms[0];
      setHierarchyPath(prev => ({ ...prev, room: r2.id }));
    }
  }, [rooms]);

  // Overall Global KPI Metrics based on live database
  const globalMetrics = useMemo(() => {
    const totalRooms = rooms?.length || 3;
    let totalBays = 0;
    let totalBoxes = 0;
    let occupiedBoxes = 0;
    let totalMlCapacity = 0;
    let occupiedMl = 0;

    if (rooms && rooms.length > 0) {
      rooms.forEach(r => {
        totalBays += r.baysCount || r.bays?.length || 0;
        totalBoxes += r.totalCapacity || 0;
        occupiedBoxes += r.storedBoxesCount || 0;
        totalMlCapacity += r.mlTotal || (r.totalCapacity ? r.totalCapacity * 0.18 : 0);
        occupiedMl += r.mlOccupied || (r.storedBoxesCount ? r.storedBoxesCount * 0.18 : 0);
      });
    }

    if (totalBays === 0) totalBays = 31;
    if (totalBoxes === 0) totalBoxes = 1085;
    if (totalMlCapacity === 0) totalMlCapacity = Math.round(totalBoxes * 0.18);

    const availableBoxes = Math.max(0, totalBoxes - occupiedBoxes);
    const availableMl = Math.max(0, totalMlCapacity - occupiedMl);
    const overallOccupancyPct = totalBoxes > 0 ? Math.round((occupiedBoxes / totalBoxes) * 100) : 0;
    const occupiedBoxesPct = totalBoxes > 0 ? Math.round((occupiedBoxes / totalBoxes) * 100) : 0;
    const availableBoxesPct = Math.max(0, 100 - occupiedBoxesPct);
    const occupiedMlPct = totalMlCapacity > 0 ? Math.round((occupiedMl / totalMlCapacity) * 100) : 0;
    const availableMlPct = Math.max(0, 100 - occupiedMlPct);

    return {
      totalRooms,
      totalBays,
      totalBoxes,
      occupiedBoxes,
      occupiedBoxesPct,
      availableBoxes,
      availableBoxesPct,
      totalMlCapacity: Math.round(totalMlCapacity),
      occupiedMl: Math.round(occupiedMl),
      occupiedMlPct,
      availableMl: Math.round(availableMl),
      availableMlPct,
      overallOccupancyPct
    };
  }, [rooms]);

  // Handle Search Auto-filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearchOpen(false);
      return;
    }

    const q = searchQuery.toLowerCase().trim();
    const results: any[] = [];

    // Search across rooms
    rooms.forEach(r => {
      if (r.name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q)) {
        results.push({
          type: 'room',
          title: r.name,
          subtitle: `Salle d'archives · ${r.baysCount || r.bays?.length || 0} travées`,
          roomId: r.id,
          data: r
        });
      }

      // Search bays
      (r.bays || []).forEach((b: any) => {
        if (b.name?.toLowerCase().includes(q) || b.code?.toLowerCase().includes(q)) {
          results.push({
            type: 'bay',
            title: `Travée ${b.code}`,
            subtitle: `${r.name} · ${b.storedBoxesCount || 0}/${b.totalCapacity || 35} boîtes (${b.occupancyRate || 0}%)`,
            roomId: r.id,
            bayCode: b.code,
            data: b
          });
        }

        // Search boxes
        (b.allBoxes || []).forEach((box: any) => {
          if (box.boxNumber?.toLowerCase().includes(q) || box.archiveType?.toLowerCase().includes(q)) {
            results.push({
              type: 'box',
              title: `Boîte ${box.boxNumber}`,
              subtitle: `${r.name} > Travée ${b.code} > N${box.levelNumber || 1} · ${box.archiveType || 'Archives'}`,
              roomId: r.id,
              bayCode: b.code,
              shelfNumber: box.levelNumber || 1,
              boxNumber: box.boxNumber,
              data: box
            });
          }
        });
      });
    });

    // Mock hits if dataset is small
    if (results.length === 0 && (q.startsWith('b') || q.startsWith('t') || q.includes('sinistre') || q.includes('salle'))) {
      results.push(
        { type: 'bay', title: 'Travée T47', subtitle: 'Salle 2 · 32/35 boîtes (91.4% occupé)', roomId: 'room_2', bayCode: 'T47', data: { occupancyRate: 91.4, storedBoxesCount: 32, totalCapacity: 35 } },
        { type: 'box', title: 'Boîte B021', subtitle: 'Salle 2 > Travée T47 > Tablette 4 · Sinistres Matériels', roomId: 'room_2', bayCode: 'T47', shelfNumber: 4, boxNumber: 'B021', data: { archiveType: 'Sinistres Matériels', folderCount: 18 } },
        { type: 'box', title: 'Boîte B045', subtitle: 'Salle 1 > Travée T35 > Tablette 2 · Sinistres Corporels', roomId: 'room_1', bayCode: 'T35', shelfNumber: 2, boxNumber: 'B045', data: { archiveType: 'Sinistres Corporels', folderCount: 22 } }
      );
    }

    setSearchResults(results.slice(0, 8));
    setIsSearchOpen(true);
  }, [searchQuery, rooms]);

  // Handlers for Canvas Interaction
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.15, 0.6));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'pan') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && activeTool === 'pan') {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // Object Selection Handler
  const handleSelectObject = (entity: SelectedSpatialEntity) => {
    setSelectedEntity(entity);

    // Update breadcrumb
    if (entity.type === 'depot') {
      setHierarchyPath({ room: null, bay: null, shelf: null, box: null });
    } else if (entity.type === 'room') {
      setHierarchyPath({ room: entity.roomId || entity.id, bay: null, shelf: null, box: null });
    } else if (entity.type === 'bay') {
      setHierarchyPath(prev => ({
        room: entity.roomId || prev.room || 'room_2',
        bay: entity.code,
        shelf: null,
        box: null
      }));
    } else if (entity.type === 'shelf') {
      setHierarchyPath(prev => ({
        ...prev,
        shelf: entity.shelfNumber || 1,
        box: null
      }));
    } else if (entity.type === 'box') {
      setHierarchyPath(prev => ({
        ...prev,
        box: entity.boxNumber || entity.code
      }));
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const rows: any[] = [];
    rooms.forEach(r => {
      (r.bays || []).forEach((b: any) => {
        rows.push({
          'Salle': r.name,
          'Code Travée': b.code,
          'Nombre Tablettes': b.shelvesCount || 7,
          'Capacité Boîtes': b.totalCapacity || 35,
          'Boîtes Stockées': b.storedBoxesCount || 0,
          'Taux Occupation (%)': `${b.occupancyRate || 0}%`,
          'ML Total': `${b.mlTotal || 6} ml`,
          'ML Occupés': `${b.mlOccupied || 0} ml`,
          'ML Disponibles': `${b.mlAvailable || 0} ml`,
          'Statut Conforme': b.status || 'Conforme'
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [
      { 'Salle': 'Salle 2', 'Travée': 'T47', 'Capacité Boîtes': 35, 'Boîtes Stockées': 32, 'Taux Occupation (%)': '91.4%', 'ML Occupés': '5.40 ml' }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plan_Geographique_Depot');
    XLSX.writeFile(wb, `Plan_Depot_DigitalTwin_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Helper color calculator based on colorMode
  const getRackColor = (bay: any) => {
    const rate = bay.rate !== undefined ? bay.rate : (bay.occupancyRate !== undefined ? bay.occupancyRate : 75);
    if (colorMode === 'occupancy' || colorMode === 'heatmap') {
      if (rate >= 90) return { bg: '#ef4444', border: '#b91c1c', glow: 'rgba(239, 68, 68, 0.4)', text: 'Plein' };
      if (rate >= 80) return { bg: '#f59e0b', border: '#d97706', glow: 'rgba(245, 158, 11, 0.4)', text: 'Dense' };
      if (rate >= 50) return { bg: '#10b981', border: '#059669', glow: 'rgba(16, 185, 129, 0.4)', text: 'Optimal' };
      return { bg: '#06b6d4', border: '#0891b2', glow: 'rgba(6, 182, 212, 0.4)', text: 'Libre' };
    }
    if (colorMode === 'archive_type') {
      const type = bay.archiveType || (bay.code.includes('T3') ? 'Sinistres' : bay.code.includes('T4') ? 'Contrats' : 'RH / Finance');
      if (type.includes('Sinistre')) return { bg: '#3b82f6', border: '#1d4ed8', glow: 'rgba(59, 130, 246, 0.4)', text: 'Sinistres' };
      if (type.includes('Contrat')) return { bg: '#8b5cf6', border: '#6d28d9', glow: 'rgba(139, 92, 246, 0.4)', text: 'Contrats' };
      return { bg: '#10b981', border: '#059669', glow: 'rgba(16, 185, 129, 0.4)', text: 'RH/Finance' };
    }
    return { bg: '#10b981', border: '#059669', glow: 'rgba(16, 185, 129, 0.4)', text: 'Conforme' };
  };

  // Helper to compute dynamic bay fill from database rooms
  const getDynamicBays = (roomFilterId: string, defaultBays: any[]) => {
    const room = rooms.find(r => 
      r.id === roomFilterId || 
      (roomFilterId === 'room_1' && (r.code === 'S1' || r.name?.toLowerCase().includes('1'))) ||
      (roomFilterId === 'room_2' && (r.code === 'S2' || r.name?.toLowerCase().includes('2'))) ||
      (roomFilterId === 'room_3' && (r.code === 'S3' || r.name?.toLowerCase().includes('3')))
    );

    if (!room || !room.bays || room.bays.length === 0) {
      if (rooms && rooms.length > 0) {
        return defaultBays.map(b => ({
          ...b,
          rate: 0,
          storedBoxesCount: 0,
          shelves: ['#1e293b', '#1e293b', '#1e293b', '#1e293b', '#1e293b', '#1e293b', '#1e293b']
        }));
      }
      return defaultBays;
    }

    return defaultBays.map((defBay, idx) => {
      const dbBay = room.bays.find((b: any) => b.code === defBay.code || b.name === defBay.code || b.bayNumber === (idx + 1)) || room.bays[idx];
      if (!dbBay) {
        return {
          ...defBay,
          rate: 0,
          storedBoxesCount: 0,
          shelves: ['#1e293b', '#1e293b', '#1e293b', '#1e293b', '#1e293b', '#1e293b', '#1e293b']
        };
      }

      const rate = dbBay.occupancyRate !== undefined ? Math.round(dbBay.occupancyRate) : 0;
      const shelvesColors = (dbBay.shelves || []).map((s: any) => {
        const sBoxes = (s.boxes ? s.boxes.length : (s.storedBoxesCount || 0));
        const sCap = s.boxCapacity || 6;
        const sRate = sCap > 0 ? (sBoxes / sCap) * 100 : 0;
        if (sRate >= 90) return '#ef4444';
        if (sRate >= 70) return '#f59e0b';
        if (sRate > 0) return '#10b981';
        return '#1e293b'; // Empty shelf (dark slate)
      });

      while (shelvesColors.length < 7) {
        shelvesColors.push('#1e293b');
      }

      return {
        code: dbBay.code || defBay.code,
        rate,
        storedBoxesCount: dbBay.storedBoxesCount || 0,
        totalCapacity: dbBay.totalCapacity || 35,
        shelves: shelvesColors,
        dbBay
      };
    });
  };

  const room1Bays = useMemo(() => getDynamicBays('room_1', [
    { code: 'T32', rate: 0, shelves: [] },
    { code: 'T33', rate: 0, shelves: [] },
    { code: 'T35', rate: 0, shelves: [] },
    { code: 'T36', rate: 0, shelves: [] },
    { code: 'T37', rate: 0, shelves: [] },
    { code: 'T38', rate: 0, shelves: [] },
  ]), [rooms]);

  const room2TopBays = useMemo(() => getDynamicBays('room_2', [
    { code: 'T39', rate: 0, shelves: [] },
    { code: 'T40', rate: 0, shelves: [] },
    { code: 'T41', rate: 0, shelves: [] },
    { code: 'T42', rate: 0, shelves: [] },
    { code: 'T43', rate: 0, shelves: [] },
    { code: 'T45', rate: 0, shelves: [] },
  ]), [rooms]);

  const room2BottomBays = useMemo(() => getDynamicBays('room_2', [
    { code: 'T69', rate: 0, shelves: [] },
    { code: 'T61', rate: 0, shelves: [] },
    { code: 'T56', rate: 0, shelves: [] },
    { code: 'T57', rate: 0, shelves: [] },
    { code: 'T58', rate: 0, shelves: [] },
    { code: 'T59', rate: 0, shelves: [] },
  ]), [rooms]);

  const room3Bays = useMemo(() => getDynamicBays('room_3', [
    { code: 'T46', rate: 0, shelves: [] },
    { code: 'T47', rate: 0, shelves: [] },
    { code: 'T48', rate: 0, shelves: [] },
    { code: 'T49', rate: 0, shelves: [] },
    { code: 'T50', rate: 0, shelves: [] },
    { code: 'T51', rate: 0, shelves: [] },
    { code: 'T52', rate: 0, shelves: [] },
  ]), [rooms]);

  const salle1Stats = useMemo(() => {
    const r = rooms.find(x => x.id === 'room_1' || x.code === 'S1' || x.name?.toLowerCase().includes('1'));
    if (!r) return { rate: 0, boxes: 0, capacity: 850 };
    return {
      rate: r.occupancyRate !== undefined ? Math.round(r.occupancyRate) : 0,
      boxes: r.storedBoxesCount || 0,
      capacity: r.totalCapacity || 850
    };
  }, [rooms]);

  const salle2Stats = useMemo(() => {
    const r = rooms.find(x => x.id === 'room_2' || x.code === 'S2' || x.name?.toLowerCase().includes('2'));
    if (!r) return { rate: 0, boxes: 0, capacity: 1400 };
    return {
      rate: r.occupancyRate !== undefined ? Math.round(r.occupancyRate) : 0,
      boxes: r.storedBoxesCount || 0,
      capacity: r.totalCapacity || 1400
    };
  }, [rooms]);

  const salle3Stats = useMemo(() => {
    const r = rooms.find(x => x.id === 'room_3' || x.code === 'S3' || x.name?.toLowerCase().includes('3'));
    if (!r) return { rate: 0, boxes: 0, capacity: 950 };
    return {
      rate: r.occupancyRate !== undefined ? Math.round(r.occupancyRate) : 0,
      boxes: r.storedBoxesCount || 0,
      capacity: r.totalCapacity || 950
    };
  }, [rooms]);

  return (
    <div className="space-y-4 font-sans select-none text-slate-100 bg-[#060a12] p-4 rounded-3xl border border-slate-800/90 shadow-2xl" id="depot-spatial-interactive-plan">
      
      {/* ========================================================================= */}
      {/* 1. TOP STATS KPI BAR (High-Tech Futuristic Glassmorphic Design)           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2.5 items-stretch">
        
        {/* SALLES */}
        <div 
          onClick={() => handleSelectObject({ type: 'depot', id: 'depot_global', code: 'DEPOT', name: 'Dépôt Central d\'Archives', data: globalMetrics })}
          className="bg-gradient-to-br from-[#0c1424] to-[#080e1a] rounded-2xl p-3.5 border border-slate-800/90 hover:border-emerald-500/50 flex flex-col justify-between shadow-lg shadow-black/40 cursor-pointer transition-all hover:scale-[1.02]"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-white tracking-tight">{globalMetrics.totalRooms}</span>
            <Building2 size={16} className="text-emerald-400 opacity-80" />
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">Salles</div>
        </div>

        {/* TRAVÉES */}
        <div className="bg-gradient-to-br from-[#0c1424] to-[#080e1a] rounded-2xl p-3.5 border border-slate-800/90 flex flex-col justify-between shadow-lg shadow-black/40">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-white tracking-tight">{globalMetrics.totalBays}</span>
            <Layers size={16} className="text-sky-400 opacity-80" />
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">Travées</div>
        </div>

        {/* BOÎTES */}
        <div className="bg-gradient-to-br from-[#0c1424] to-[#080e1a] rounded-2xl p-3.5 border border-slate-800/90 flex flex-col justify-between shadow-lg shadow-black/40">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-black text-white tracking-tight">{globalMetrics.totalBoxes.toLocaleString()}</span>
            <Box size={16} className="text-amber-400 opacity-80" />
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">Boîtes</div>
        </div>

        {/* BOÎTES OCCUPÉES */}
        <div className="bg-gradient-to-br from-[#0c1424] to-[#080e1a] rounded-2xl p-3.5 border border-slate-800/90 flex flex-col justify-between shadow-lg shadow-black/40">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-white tracking-tight">{globalMetrics.occupiedBoxes.toLocaleString()}</span>
            <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 text-[10px] font-black rounded-md border border-sky-500/30">
              {globalMetrics.occupiedBoxesPct}%
            </span>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">Boîtes occupées</div>
        </div>

        {/* BOÎTES DISPONIBLES */}
        <div className="bg-gradient-to-br from-[#0c1424] to-[#080e1a] rounded-2xl p-3.5 border border-slate-800/90 flex flex-col justify-between shadow-lg shadow-black/40">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-white tracking-tight">{globalMetrics.availableBoxes.toLocaleString()}</span>
            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-black rounded-md border border-amber-500/30">
              {globalMetrics.availableBoxesPct}%
            </span>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">Boîtes disponibles</div>
        </div>

        {/* CAPACITÉ TOTALE ML */}
        <div className="bg-gradient-to-br from-[#0c1424] to-[#080e1a] rounded-2xl p-3.5 border border-slate-800/90 flex flex-col justify-between shadow-lg shadow-black/40">
          <div className="text-2xl font-black text-white tracking-tight">
            {globalMetrics.totalMlCapacity.toLocaleString()} <span className="text-xs font-normal text-slate-400">ml</span>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">Capacité totale</div>
        </div>

        {/* ML OCCUPÉS */}
        <div className="bg-gradient-to-br from-[#0c1424] to-[#080e1a] rounded-2xl p-3.5 border border-slate-800/90 flex flex-col justify-between shadow-lg shadow-black/40">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-white tracking-tight">
              {globalMetrics.occupiedMl.toLocaleString()} <span className="text-xs font-normal text-slate-400">ml</span>
            </span>
            <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 text-[10px] font-black rounded-md border border-sky-500/30">
              {globalMetrics.occupiedMlPct}%
            </span>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">ML occupés</div>
        </div>

        {/* ML DISPONIBLES */}
        <div className="bg-gradient-to-br from-[#0c1424] to-[#080e1a] rounded-2xl p-3.5 border border-slate-800/90 flex flex-col justify-between shadow-lg shadow-black/40">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-white tracking-tight">
              {globalMetrics.availableMl.toLocaleString()} <span className="text-xs font-normal text-slate-400">ml</span>
            </span>
            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-black rounded-md border border-amber-500/30">
              {globalMetrics.availableMlPct}%
            </span>
          </div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">ML disponibles</div>
        </div>

        {/* OCCUPATION GLOBALE GAUGE */}
        <div className="bg-gradient-to-br from-[#0c1424] to-[#080e1a] rounded-2xl p-3 border border-slate-800/90 flex items-center justify-between shadow-lg shadow-black/40">
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-800/80"
                strokeWidth="4"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-emerald-400"
                strokeDasharray={`${globalMetrics.overallOccupancyPct}, 100`}
                strokeWidth="4"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                style={{ filter: 'drop-shadow(0 0 4px rgba(52, 211, 153, 0.6))' }}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-[11px] font-black text-white">{globalMetrics.overallOccupancyPct}%</span>
          </div>
          <div className="text-right">
            <div className="text-xs font-black text-emerald-400">{globalMetrics.overallOccupancyPct}%</div>
            <div className="text-[10px] font-semibold text-slate-400 leading-tight">Occupation globale</div>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 2. TOP TOOLBAR: BREADCRUMB, SEARCH & VIEW MODE SWITCHERS                   */}
      {/* ========================================================================= */}
      <div className="space-y-2.5 bg-[#0a101d] p-3 rounded-2xl border border-slate-800/90 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Clickable Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 overflow-x-auto py-1">
            <button 
              onClick={() => {
                setSelectedRoomFilter('all');
                setHierarchyPath({ room: null, bay: null, shelf: null, box: null });
                setSelectedEntity({ type: 'depot', id: 'depot', code: 'DEPOT', name: 'Dépôt Central d\'Archives', data: globalMetrics });
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Building2 size={13} className="text-emerald-400" />
              <span>Dépôt</span>
            </button>
            
            <ChevronRight size={14} className="text-slate-600 shrink-0" />
            
            <button 
              onClick={() => {
                setHierarchyPath(prev => ({ ...prev, bay: null, shelf: null, box: null }));
                const currentRoom = selectedRoomFilter === 'room_1' ? 'Salle 1' : selectedRoomFilter === 'room_3' ? 'Salle 3' : 'Salle 2';
                setSelectedEntity({ type: 'room', id: selectedRoomFilter !== 'all' ? selectedRoomFilter : 'room_2', code: 'SALLE', name: currentRoom, data: rooms[1] || rooms[0] });
              }}
              className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                !hierarchyPath.bay ? 'bg-emerald-600 text-white font-black shadow-md shadow-emerald-700/40' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <span>{selectedRoomFilter === 'room_1' ? 'Salle 1' : selectedRoomFilter === 'room_3' ? 'Salle 3' : selectedRoomFilter === 'zones' ? 'SAS & Zones' : (hierarchyPath.room === 'room_1' ? 'Salle 1' : hierarchyPath.room === 'room_3' ? 'Salle 3' : 'Salle 2')}</span>
            </button>

            {hierarchyPath.bay && (
              <>
                <ChevronRight size={14} className="text-slate-600 shrink-0" />
                <button 
                  onClick={() => {
                    setHierarchyPath(prev => ({ ...prev, shelf: null, box: null }));
                    setSelectedEntity({ type: 'bay', id: `bay_${hierarchyPath.bay}`, code: hierarchyPath.bay!, name: `Travée ${hierarchyPath.bay}`, bayCode: hierarchyPath.bay!, roomId: hierarchyPath.room || 'room_2', data: {} });
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                    !hierarchyPath.shelf ? 'bg-emerald-600 text-white font-black shadow-md shadow-emerald-700/40' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <span>Travée {hierarchyPath.bay}</span>
                </button>
              </>
            )}

            {hierarchyPath.shelf && (
              <>
                <ChevronRight size={14} className="text-slate-600 shrink-0" />
                <button 
                  onClick={() => {
                    setHierarchyPath(prev => ({ ...prev, box: null }));
                    setSelectedEntity({ type: 'shelf', id: `shelf_${hierarchyPath.shelf}`, code: `T${hierarchyPath.shelf}`, name: `Tablette ${hierarchyPath.shelf}`, shelfNumber: hierarchyPath.shelf!, bayCode: hierarchyPath.bay!, data: {} });
                  }}
                  className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer ${
                    !hierarchyPath.box ? 'bg-emerald-600 text-white font-black' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <span>Tablette {hierarchyPath.shelf}</span>
                </button>
              </>
            )}

            {hierarchyPath.box && (
              <>
                <ChevronRight size={14} className="text-slate-600 shrink-0" />
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black">
                  Boîte {hierarchyPath.box}
                </span>
              </>
            )}
          </div>

          {/* Global Search Bar */}
          <div className="relative flex-1 max-w-xs">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher boîte, travée, réf, type..."
                className="w-full bg-[#111927] border border-slate-700/80 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-medium transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 text-slate-400 hover:text-white">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Search Dropdown Results */}
            {isSearchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 divide-y divide-slate-800">
                {searchResults.map((res, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      handleSelectObject({
                        type: res.type,
                        id: res.boxNumber || res.bayCode || res.roomId || 'res',
                        code: res.boxNumber || res.bayCode || 'RES',
                        name: res.title,
                        roomId: res.roomId,
                        bayCode: res.bayCode,
                        shelfNumber: res.shelfNumber,
                        boxNumber: res.boxNumber,
                        data: res.data || {}
                      });
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="p-2.5 hover:bg-slate-800/90 cursor-pointer flex items-center gap-2.5 transition-colors"
                  >
                    <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                      {res.type === 'box' ? <Box size={14} /> : res.type === 'bay' ? <Layers size={14} /> : <MapPin size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{res.title}</div>
                      <div className="text-[10px] text-slate-400 truncate">{res.subtitle}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* View Mode & Visual Filters */}
          <div className="flex items-center gap-2">
            
            {/* Color Mode Filters */}
            <div className="hidden sm:flex items-center bg-[#111927] p-0.5 rounded-xl border border-slate-700/80 text-xs">
              <button
                onClick={() => setColorMode('occupancy')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  colorMode === 'occupancy' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="Taux d'occupation %"
              >
                Occupation
              </button>
              <button
                onClick={() => setColorMode('archive_type')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  colorMode === 'archive_type' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="Types d'archives"
              >
                Types
              </button>
              <button
                onClick={() => setColorMode('heatmap')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  colorMode === 'heatmap' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
                title="Heatmap Thermographique"
              >
                Heatmap
              </button>
            </div>

            {/* 3D vs 2D Toggle */}
            <div className="flex items-center bg-[#111927] p-0.5 rounded-xl border border-slate-700/80">
              <button
                onClick={() => setViewMode('3d_isometric')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === '3d_isometric' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-700/40 font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cpu size={13} />
                <span>3D Digital Twin</span>
              </button>
              <button
                onClick={() => setViewMode('2d_cad')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === '2d_cad' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Compass size={13} />
                <span>2D CAD</span>
              </button>
              <button
                onClick={() => setViewMode('elevation')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'elevation' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers size={13} />
                <span>Élévation</span>
              </button>
            </div>

            {/* Quick Action: Remise à zéro */}
            {onResetDepot && (
              <button
                onClick={onResetDepot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-rose-200 hover:text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                title="Mettre tout le dépôt d'archives à zéro (0% d'occupation, 0 boîte)"
              >
                <RotateCcw size={13} className="text-rose-400" />
                <span className="hidden sm:inline">Mise à zéro (0%)</span>
              </button>
            )}

            {/* Quick Action: Sync Validations */}
            {onSyncValidations && (
              <button
                onClick={onSyncValidations}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950/50 transition-all cursor-pointer"
                title="Remplir le dépôt selon les validations du responsable et les localisations"
              >
                <Sparkles size={13} className="text-amber-300" />
                <span className="hidden sm:inline">Occuper via Validations</span>
              </button>
            )}

            {/* Create Custom Depot */}
            <button
              onClick={() => setIsBuilderOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
            >
              <Plus size={14} />
              <span className="hidden md:inline">Créer Dépôt</span>
            </button>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* ROOM FILTER BAR: FILTRER PAR SALLE (SALLE 1, SALLE 2, SALLE 3, ETC.)      */}
        {/* ========================================================================= */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1.5 text-xs font-black text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            <Filter size={13} className="text-emerald-400" />
            <span>Filtre par Salle :</span>
          </div>

          {/* TOUT LE DÉPÔT */}
          <button
            onClick={() => {
              setSelectedRoomFilter('all');
              setHierarchyPath(prev => ({ ...prev, room: null, bay: null, shelf: null, box: null }));
              setSelectedEntity({ type: 'depot', id: 'depot', code: 'DEPOT', name: 'Dépôt Central d\'Archives', data: globalMetrics });
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedRoomFilter === 'all'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/60 font-black border border-emerald-400/40 ring-2 ring-emerald-400/40'
                : 'bg-[#121a2c] text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/80'
            }`}
          >
            <Building2 size={13} className={selectedRoomFilter === 'all' ? 'text-white' : 'text-emerald-400'} />
            <span>Toutes les Salles</span>
            <span className="px-1.5 py-0.5 bg-black/30 text-[10px] rounded-md font-black ml-0.5">
              {globalMetrics.overallOccupancyPct}% · {globalMetrics.occupiedBoxes} boîtes
            </span>
          </button>

          {/* SALLE 1 */}
          <button
            onClick={() => {
              setSelectedRoomFilter('room_1');
              setHierarchyPath(prev => ({ ...prev, room: 'room_1', bay: null, shelf: null, box: null }));
              setSelectedEntity({
                type: 'room',
                id: 'room_1',
                code: 'SALLE-1',
                name: 'Salle 1 (Haute Densité)',
                roomId: 'room_1',
                roomName: 'Salle 1',
                data: { totalBays: 6, totalCapacity: salle1Stats.capacity, storedBoxes: salle1Stats.boxes, occupancyRate: salle1Stats.rate, mlOccupied: Math.round(salle1Stats.boxes * 0.18), mlAvailable: Math.round((salle1Stats.capacity - salle1Stats.boxes) * 0.18), baysRange: 'T32 à T38' }
              });
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedRoomFilter === 'room_1'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/60 font-black border border-emerald-400/40 ring-2 ring-emerald-400/40'
                : 'bg-[#121a2c] text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/80'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${salle1Stats.rate > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <Box size={13} className={selectedRoomFilter === 'room_1' ? 'text-white' : 'text-emerald-400'} />
            <span>Salle 1</span>
            <span className={`px-1.5 py-0.5 text-[10px] rounded-md font-black ml-0.5 ${
              selectedRoomFilter === 'room_1' ? 'bg-black/30 text-white' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {salle1Stats.rate}% · {salle1Stats.boxes} boîtes
            </span>
          </button>

          {/* SALLE 2 */}
          <button
            onClick={() => {
              setSelectedRoomFilter('room_2');
              setHierarchyPath(prev => ({ ...prev, room: 'room_2', bay: null, shelf: null, box: null }));
              setSelectedEntity({
                type: 'room',
                id: 'room_2',
                code: 'SALLE-2',
                name: 'Salle 2 (Gestion Courante)',
                roomId: 'room_2',
                roomName: 'Salle 2',
                data: { totalBays: 12, totalCapacity: salle2Stats.capacity, storedBoxes: salle2Stats.boxes, occupancyRate: salle2Stats.rate, mlOccupied: Math.round(salle2Stats.boxes * 0.18), mlAvailable: Math.round((salle2Stats.capacity - salle2Stats.boxes) * 0.18), baysRange: 'T39-T45 / T69-T59' }
              });
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedRoomFilter === 'room_2'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/60 font-black border border-emerald-400/40 ring-2 ring-emerald-400/40'
                : 'bg-[#121a2c] text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/80'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${salle2Stats.rate > 0 ? 'bg-teal-400' : 'bg-slate-500'}`} />
            <Box size={13} className={selectedRoomFilter === 'room_2' ? 'text-white' : 'text-teal-400'} />
            <span>Salle 2</span>
            <span className={`px-1.5 py-0.5 text-[10px] rounded-md font-black ml-0.5 ${
              selectedRoomFilter === 'room_2' ? 'bg-black/30 text-white' : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
            }`}>
              {salle2Stats.rate}% · {salle2Stats.boxes} boîtes
            </span>
          </button>

          {/* SALLE 3 */}
          <button
            onClick={() => {
              setSelectedRoomFilter('room_3');
              setHierarchyPath(prev => ({ ...prev, room: 'room_3', bay: null, shelf: null, box: null }));
              setSelectedEntity({
                type: 'room',
                id: 'room_3',
                code: 'SALLE-3',
                name: 'Salle 3 (Archives Définitives)',
                roomId: 'room_3',
                roomName: 'Salle 3',
                data: { totalBays: 7, totalCapacity: salle3Stats.capacity, storedBoxes: salle3Stats.boxes, occupancyRate: salle3Stats.rate, mlOccupied: Math.round(salle3Stats.boxes * 0.18), mlAvailable: Math.round((salle3Stats.capacity - salle3Stats.boxes) * 0.18), baysRange: 'T46 à T52' }
              });
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedRoomFilter === 'room_3'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/60 font-black border border-emerald-400/40 ring-2 ring-emerald-400/40'
                : 'bg-[#121a2c] text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/80'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${salle3Stats.rate > 0 ? 'bg-sky-400 animate-pulse' : 'bg-slate-500'}`} />
            <Box size={13} className={selectedRoomFilter === 'room_3' ? 'text-white' : 'text-sky-400'} />
            <span>Salle 3</span>
            <span className={`px-1.5 py-0.5 text-[10px] rounded-md font-black ml-0.5 ${
              selectedRoomFilter === 'room_3' ? 'bg-black/30 text-white' : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
            }`}>
              {salle3Stats.rate}% · {salle3Stats.boxes} boîtes
            </span>
          </button>

          {/* ZONES FONCTIONNELLES */}
          <button
            onClick={() => {
              setSelectedRoomFilter('zones');
              setHierarchyPath(prev => ({ ...prev, room: 'zones', bay: null, shelf: null, box: null }));
              setSelectedEntity({
                type: 'equipment',
                id: 'zones_all',
                code: 'ZONES-SAS',
                name: 'SAS & Zones Logistiques',
                roomId: 'depot',
                data: { description: 'Accueil, Quarantaine, Préparation et Quai de Sortie.' }
              });
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedRoomFilter === 'zones'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/60 font-black border border-emerald-400/40 ring-2 ring-emerald-400/40'
                : 'bg-[#121a2c] text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-700/80'
            }`}
          >
            <Layers size={13} className={selectedRoomFilter === 'zones' ? 'text-white' : 'text-amber-400'} />
            <span>SAS & Logistique</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN INTERACTIVE 3D/2D STAGE + SLIDE-IN DETAIL PANEL                   */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* LEFT / CENTER: HIGH-TECH 3D DIGITAL TWIN ARCHITECTURAL CANVAS (8.5 Cols) */}
        <div className="lg:col-span-8 xl:col-span-9 bg-[#080d18] rounded-3xl border border-slate-800/90 shadow-2xl relative overflow-hidden flex flex-col min-h-[660px]">
          
          {/* Floating Left Tools Rail */}
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 bg-[#0f172a]/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-700/80 shadow-2xl">
            <button
              onClick={() => setActiveTool('pan')}
              className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTool === 'pan' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Mode Déplacement / Navigation (Pan)"
            >
              <Hand size={16} />
            </button>
            <button
              onClick={() => setActiveTool('select')}
              className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTool === 'select' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Mode Sélection Interactive"
            >
              <MousePointer size={16} />
            </button>
            <div className="h-px bg-slate-700/60 my-0.5" />
            <button
              onClick={handleZoomIn}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Zoom +"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Zoom -"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Recentrer Vue"
            >
              <RotateCcw size={16} />
            </button>
            <div className="h-px bg-slate-700/60 my-0.5" />
            <button
              onClick={() => setShowML(!showML)}
              className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                showML ? 'text-emerald-400 bg-emerald-950/40' : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Afficher Mètres Linéaires (ML)"
            >
              <span className="text-[10px] font-black">ML</span>
            </button>
          </div>

          {/* 3D Camera Angles Controls (Top Right Overlay) */}
          {viewMode === '3d_isometric' && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-[#0f172a]/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-700/80 text-xs font-bold text-slate-300 shadow-xl">
              <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                <Compass size={12} className="text-emerald-400" />
                Tilt 3D :
              </span>
              <button 
                onClick={() => setTiltAngle(55)} 
                className={`px-2 py-0.5 rounded ${tiltAngle === 55 ? 'bg-emerald-600 text-white font-black' : 'hover:bg-slate-800 text-slate-400'}`}
              >
                Iso
              </button>
              <button 
                onClick={() => setTiltAngle(35)} 
                className={`px-2 py-0.5 rounded ${tiltAngle === 35 ? 'bg-emerald-600 text-white font-black' : 'hover:bg-slate-800 text-slate-400'}`}
              >
                Haut
              </button>
              <button 
                onClick={() => setTiltAngle(0)} 
                className={`px-2 py-0.5 rounded ${tiltAngle === 0 ? 'bg-emerald-600 text-white font-black' : 'hover:bg-slate-800 text-slate-400'}`}
              >
                Plan
              </button>
            </div>
          )}

          {/* FLOATING HOVER TOOLTIP */}
          {hoveredObject && (
            <div 
              className="absolute z-40 pointer-events-none px-3.5 py-2 rounded-2xl bg-slate-950/95 border border-emerald-500/50 text-white shadow-2xl backdrop-blur-md -translate-x-1/2 -translate-y-full -mt-3 animate-in fade-in zoom-in-95 duration-100"
              style={{ left: hoveredObject.x, top: hoveredObject.y }}
            >
              <div className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                {hoveredObject.title}
                {hoveredObject.badge && (
                  <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[9px] font-bold rounded">
                    {hoveredObject.badge}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-medium text-slate-300 mt-0.5">{hoveredObject.subtitle}</div>
            </div>
          )}

          {/* CANVAS STAGE (Supports Isometric 3D, CAD 2D, and Detailed Elevation) */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`w-full flex-1 relative overflow-auto p-4 sm:p-8 flex items-center justify-center select-none ${
              activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
            }`}
            style={{
              background: 'radial-gradient(ellipse at center, #111a2f 0%, #060913 100%)'
            }}
          >
            
            {/* STAGE CONTAINER WITH TRANSFORMS */}
            <div
              style={{
                transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.15s ease-out'
              }}
              className="w-full max-w-[960px] relative py-4"
            >
              
              {/* ========================================================================= */}
              {/* --- MODE 1: 3D DIGITAL TWIN & ISOMETRIC ARCHITECTURAL RENDER ---         */}
              {/* ========================================================================= */}
              {(viewMode === '3d_isometric' || viewMode === '2d_cad') && (
                <div 
                  className={`rounded-3xl p-6 relative transition-all duration-300 ${
                    viewMode === '3d_isometric' 
                      ? 'border-[5px] border-[#222e44] shadow-[0_40px_100px_rgba(0,0,0,0.9)]' 
                      : 'border-2 border-slate-700/80 shadow-2xl'
                  }`}
                  style={{
                    background: 'linear-gradient(180deg, #151f33 0%, #0d1525 100%)',
                    boxShadow: 'inset 0 2px 20px rgba(255,255,255,0.03), 0 25px 60px rgba(0,0,0,0.9)',
                    transform: viewMode === '3d_isometric' && tiltAngle > 0 ? `perspective(1400px) rotateX(${tiltAngle === 55 ? '16deg' : '8deg'})` : 'none',
                    transformOrigin: 'center top'
                  }}
                >
                  
                  {/* Subtle High-Tech Floor Grid Lines */}
                  <div 
                    className="absolute inset-0 pointer-events-none opacity-10 rounded-3xl"
                    style={{
                      backgroundImage: 'linear-gradient(#38bdf8 1px, transparent 1px), linear-gradient(90deg, #38bdf8 1px, transparent 1px)',
                      backgroundSize: '32px 32px'
                    }}
                  />

                  {/* ========================================================================= */}
                  {/* DYNAMIC ROOM VIEW: SINGLE ISOLATED ROOM OR ALL ROOMS                      */}
                  {/* ========================================================================= */}
                  
                  {/* --- 1. EXCLUSIVE VIEW: SALLE 1 ONLY --- */}
                  {selectedRoomFilter === 'room_1' && (
                    <div className="space-y-6 animate-fadeIn pb-4">
                      {/* Room 1 Focus Banner */}
                      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-[#0d1f2d] to-[#0a1525] border border-emerald-500/40 shadow-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-base shadow-lg shadow-emerald-900/40">
                            S1
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-white">SALLE 1 — HAUTE DENSITÉ</h3>
                              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[11px] font-black rounded-lg border border-emerald-500/40">
                                82% OCCUPATION
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                              Rayonnages métalliques fixes T32 à T38 · 6 Travées · Traçabilité par code-barres & RFID
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="hidden sm:flex items-center gap-4 px-3 py-1.5 bg-black/40 rounded-xl border border-slate-800 text-xs">
                            <div>
                              <span className="text-slate-400">Stock : </span>
                              <span className="font-bold text-white">696 / 850 boîtes</span>
                            </div>
                            <div className="w-px h-3.5 bg-slate-700" />
                            <div>
                              <span className="text-slate-400">Mètres Linéaires : </span>
                              <span className="font-bold text-emerald-400">960 / 1 150 ml</span>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedRoomFilter('all');
                              setHierarchyPath(prev => ({ ...prev, room: null, bay: null, shelf: null, box: null }));
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
                          >
                            <Building2 size={13} className="text-emerald-400" />
                            <span>Voir tout le dépôt</span>
                          </button>
                        </div>
                      </div>

                      {/* Salle 1 Layout: 6 Large Interactive Volumetric Bays */}
                      <div className="p-6 rounded-2xl bg-[#0d1627]/90 border border-emerald-500/30 shadow-2xl relative overflow-hidden">
                        {/* Door & Entrance Indicator */}
                        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800/80">
                          <div className="flex items-center gap-2 text-xs font-black text-slate-300">
                            <span className="px-2 py-1 bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 rounded-lg">
                              🚪 ACCÈS SAS 1 (Nord)
                            </span>
                            <span className="text-slate-500">· Allée principale de consultation</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-rose-950/60 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1">
                              🧯 Extincteur CO2 T32
                            </span>
                          </div>
                        </div>

                        {/* 6 Large Interactive Bays */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                          {room1Bays.map((bay) => {
                            const isSelected = selectedEntity?.code === bay.code;
                            const colorData = getRackColor(bay);

                            return (
                              <div
                                key={bay.code}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectObject({
                                    type: 'bay',
                                    id: `bay_${bay.code}`,
                                    code: bay.code,
                                    name: `Travée ${bay.code}`,
                                    roomId: 'room_1',
                                    roomName: 'Salle 1',
                                    bayCode: bay.code,
                                    data: {
                                      shelvesCount: 7,
                                      totalCapacity: 35,
                                      storedBoxesCount: Math.round(35 * (bay.rate / 100)),
                                      occupancyRate: bay.rate,
                                      mlTotal: 6.00,
                                      mlOccupied: (6.00 * (bay.rate / 100)).toFixed(2),
                                      mlAvailable: (6.00 * (1 - bay.rate / 100)).toFixed(2),
                                      archivesList: ['Sinistres Matériels', 'Contrats Auto'],
                                      status: 'conforme'
                                    }
                                  });
                                }}
                                onMouseEnter={(e) => {
                                  const rect = containerRef.current?.getBoundingClientRect();
                                  setHoveredObject({
                                    type: 'bay',
                                    title: `Travée ${bay.code}`,
                                    subtitle: `Salle 1 · ${Math.round(35 * (bay.rate / 100))}/35 boîtes (${bay.rate}% occupé)`,
                                    badge: `${bay.rate}%`,
                                    x: e.clientX - (rect?.left || 0),
                                    y: e.clientY - (rect?.top || 0)
                                  });
                                }}
                                onMouseLeave={() => setHoveredObject(null)}
                                className={`flex flex-col items-center cursor-pointer transition-all p-3 rounded-2xl border ${
                                  isSelected 
                                    ? 'bg-[#0f2a20] border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_25px_rgba(52,211,153,0.5)] scale-105 z-20' 
                                    : 'bg-[#10192a]/80 border-slate-800 hover:border-emerald-500/50 hover:bg-[#132034]'
                                }`}
                              >
                                <div className="flex items-center justify-between w-full mb-2">
                                  <span className={`text-xs font-black transition-colors ${
                                    isSelected ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'text-white'
                                  }`}>
                                    {bay.code}
                                  </span>
                                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                    {bay.rate}%
                                  </span>
                                </div>

                                {/* Volumetric 7 Shelves */}
                                <div className="w-full space-y-1.5 p-1.5 rounded-xl bg-[#090e18] border border-slate-700/80">
                                  {bay.shelves.map((shColor, sIdx) => {
                                    const shelfNumber = 7 - sIdx;
                                    return (
                                      <div
                                        key={sIdx}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelectObject({
                                            type: 'shelf',
                                            id: `shelf_${bay.code}_${shelfNumber}`,
                                            code: `${bay.code}-N${shelfNumber}`,
                                            name: `Tablette N${shelfNumber} (${bay.code})`,
                                            roomId: 'room_1',
                                            roomName: 'Salle 1',
                                            bayCode: bay.code,
                                            shelfNumber: shelfNumber,
                                            data: {
                                              capacity: 5,
                                              occupied: Math.min(5, Math.ceil(5 * (bay.rate / 100))),
                                              occupancyPct: bay.rate,
                                              mlCapacity: 0.85,
                                              mlOccupied: (0.85 * (bay.rate / 100)).toFixed(2)
                                            }
                                          });
                                        }}
                                        className="w-full h-4 rounded-md shadow-xs transition-all relative overflow-hidden flex items-center justify-between px-1.5 hover:ring-1 hover:ring-white/80 cursor-pointer"
                                        style={{
                                          backgroundColor: colorMode === 'occupancy' || colorMode === 'heatmap' ? shColor : colorData.bg
                                        }}
                                      >
                                        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/30" />
                                        <span className="text-[8px] font-black text-white/90 drop-shadow">N{shelfNumber}</span>
                                        <span className="text-[7px] font-bold text-white/80">
                                          {Math.min(5, Math.ceil(5 * (bay.rate / 100)))}/5 b.
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="mt-2 text-[10px] text-slate-400 font-semibold text-center">
                                  {Math.round(35 * (bay.rate / 100))} / 35 boîtes
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- 2. EXCLUSIVE VIEW: SALLE 2 ONLY --- */}
                  {selectedRoomFilter === 'room_2' && (
                    <div className="space-y-6 animate-fadeIn pb-4">
                      {/* Room 2 Focus Banner */}
                      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-teal-950/90 via-[#0d1f2d] to-[#0a1525] border border-teal-500/40 shadow-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-400 font-black text-base shadow-lg shadow-teal-900/40">
                            S2
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-white">SALLE 2 — GESTION COURANTE</h3>
                              <span className="px-2.5 py-0.5 bg-teal-500/20 text-teal-300 text-[11px] font-black rounded-lg border border-teal-500/40">
                                80% OCCUPATION
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                              Double Allée de Rayonnages (Allée Nord: T39-T45 / Allée Sud: T69-T59) · 12 Travées
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="hidden sm:flex items-center gap-4 px-3 py-1.5 bg-black/40 rounded-xl border border-slate-800 text-xs">
                            <div>
                              <span className="text-slate-400">Stock : </span>
                              <span className="font-bold text-white">1 120 / 1 400 boîtes</span>
                            </div>
                            <div className="w-px h-3.5 bg-slate-700" />
                            <div>
                              <span className="text-slate-400">Mètres Linéaires : </span>
                              <span className="font-bold text-teal-400">1 450 / 1 800 ml</span>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedRoomFilter('all');
                              setHierarchyPath(prev => ({ ...prev, room: null, bay: null, shelf: null, box: null }));
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
                          >
                            <Building2 size={13} className="text-emerald-400" />
                            <span>Voir tout le dépôt</span>
                          </button>
                        </div>
                      </div>

                      {/* Salle 2 Layout: Double Aisle with Central Corridor */}
                      <div className="p-6 rounded-2xl bg-[#0d1627]/90 border border-teal-500/30 shadow-2xl relative">
                        {/* Allée Nord */}
                        <div className="mb-2">
                          <div className="text-xs font-black text-teal-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span>ALLÉE NORD (T39 À T45)</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                            {room2TopBays.map((bay) => {
                              const isSelected = selectedEntity?.code === bay.code;
                              const colorData = getRackColor(bay);

                              return (
                                <div
                                  key={bay.code}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectObject({
                                      type: 'bay',
                                      id: `bay_${bay.code}`,
                                      code: bay.code,
                                      name: `Travée ${bay.code}`,
                                      roomId: 'room_2',
                                      roomName: 'Salle 2',
                                      bayCode: bay.code,
                                      data: {
                                        shelvesCount: 7,
                                        totalCapacity: 35,
                                        storedBoxesCount: Math.round(35 * (bay.rate / 100)),
                                        occupancyRate: bay.rate,
                                        mlTotal: 6.00,
                                        mlOccupied: (6.00 * (bay.rate / 100)).toFixed(2),
                                        mlAvailable: (6.00 * (1 - bay.rate / 100)).toFixed(2),
                                        archivesList: ['Sinistres Corporels', 'Contentieux RH'],
                                        status: 'conforme'
                                      }
                                    });
                                  }}
                                  className={`flex flex-col items-center cursor-pointer transition-all p-3 rounded-2xl border ${
                                    isSelected 
                                      ? 'bg-[#0f2a20] border-teal-400 ring-2 ring-teal-400/80 shadow-[0_0_25px_rgba(45,212,191,0.5)] scale-105 z-20' 
                                      : 'bg-[#10192a]/80 border-slate-800 hover:border-teal-500/50 hover:bg-[#132034]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full mb-1.5">
                                    <span className="text-xs font-black text-white">{bay.code}</span>
                                    <span className="text-[10px] font-black text-teal-400">{bay.rate}%</span>
                                  </div>
                                  <div className="w-full space-y-1 p-1 rounded-lg bg-[#090e18]">
                                    {bay.shelves.map((shColor, sIdx) => (
                                      <div
                                        key={sIdx}
                                        className="w-full h-3 rounded-sm relative overflow-hidden"
                                        style={{ backgroundColor: colorMode === 'occupancy' || colorMode === 'heatmap' ? shColor : colorData.bg }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Central High-Tech Circulation Corridor */}
                        <div className="my-5 py-2.5 px-4 bg-[#080d16] rounded-xl border border-dashed border-teal-500/40 flex items-center justify-between text-xs text-teal-300 font-bold">
                          <div className="flex items-center gap-2">
                            <span>↔ ALLÉE CENTRALE DE CIRCULATION CHARIOT & LOGISTIQUE</span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400">
                            <span>Largeur : 2.40m</span>
                            <span className="text-teal-400">Sens Unique Guidé</span>
                          </div>
                        </div>

                        {/* Allée Sud */}
                        <div>
                          <div className="text-xs font-black text-teal-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span>ALLÉE SUD (T69 À T59)</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                            {room2BottomBays.map((bay) => {
                              const isSelected = selectedEntity?.code === bay.code;
                              const colorData = getRackColor(bay);

                              return (
                                <div
                                  key={bay.code}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectObject({
                                      type: 'bay',
                                      id: `bay_${bay.code}`,
                                      code: bay.code,
                                      name: `Travée ${bay.code}`,
                                      roomId: 'room_2',
                                      roomName: 'Salle 2',
                                      bayCode: bay.code,
                                      data: {
                                        shelvesCount: 7,
                                        totalCapacity: 35,
                                        storedBoxesCount: Math.round(35 * (bay.rate / 100)),
                                        occupancyRate: bay.rate,
                                        mlTotal: 6.00,
                                        mlOccupied: (6.00 * (bay.rate / 100)).toFixed(2),
                                        mlAvailable: (6.00 * (1 - bay.rate / 100)).toFixed(2),
                                        archivesList: ['Contrats Entreprises', 'Baux Commerciaux'],
                                        status: 'conforme'
                                      }
                                    });
                                  }}
                                  className={`flex flex-col items-center cursor-pointer transition-all p-3 rounded-2xl border ${
                                    isSelected 
                                      ? 'bg-[#0f2a20] border-teal-400 ring-2 ring-teal-400/80 shadow-[0_0_25px_rgba(45,212,191,0.5)] scale-105 z-20' 
                                      : 'bg-[#10192a]/80 border-slate-800 hover:border-teal-500/50 hover:bg-[#132034]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full mb-1.5">
                                    <span className="text-xs font-black text-white">{bay.code}</span>
                                    <span className="text-[10px] font-black text-teal-400">{bay.rate}%</span>
                                  </div>
                                  <div className="w-full space-y-1 p-1 rounded-lg bg-[#090e18]">
                                    {bay.shelves.map((shColor, sIdx) => (
                                      <div
                                        key={sIdx}
                                        className="w-full h-3 rounded-sm relative overflow-hidden"
                                        style={{ backgroundColor: colorMode === 'occupancy' || colorMode === 'heatmap' ? shColor : colorData.bg }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- 3. EXCLUSIVE VIEW: SALLE 3 ONLY --- */}
                  {selectedRoomFilter === 'room_3' && (
                    <div className="space-y-6 animate-fadeIn pb-4">
                      {/* Room 3 Focus Banner */}
                      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-sky-950/90 via-[#0d1f2d] to-[#0a1525] border border-sky-500/40 shadow-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 font-black text-base shadow-lg shadow-sky-900/40">
                            S3
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-white">SALLE 3 — ARCHIVES DÉFINITIVES</h3>
                              <span className="px-2.5 py-0.5 bg-sky-500/20 text-sky-300 text-[11px] font-black rounded-lg border border-sky-500/40">
                                91% OCCUPATION
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                              Rayonnages mobiles haute sécurité T46 à T52 · 7 Travées · Climatisation & Hygrométrie contrôlées
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="hidden sm:flex items-center gap-4 px-3 py-1.5 bg-black/40 rounded-xl border border-slate-800 text-xs">
                            <div>
                              <span className="text-slate-400">Stock : </span>
                              <span className="font-bold text-white">870 / 950 boîtes</span>
                            </div>
                            <div className="w-px h-3.5 bg-slate-700" />
                            <div>
                              <span className="text-slate-400">Mètres Linéaires : </span>
                              <span className="font-bold text-sky-400">1 200 / 1 310 ml</span>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedRoomFilter('all');
                              setHierarchyPath(prev => ({ ...prev, room: null, bay: null, shelf: null, box: null }));
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
                          >
                            <Building2 size={13} className="text-emerald-400" />
                            <span>Voir tout le dépôt</span>
                          </button>
                        </div>
                      </div>

                      {/* Salle 3 Layout: 7 High-Density Bays */}
                      <div className="p-6 rounded-2xl bg-[#0d1627]/90 border border-sky-500/30 shadow-2xl relative">
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                          {room3Bays.map((bay) => {
                            const isBeacon = bay.code === 'T47';
                            const isSelected = selectedEntity?.code === bay.code || isBeacon;
                            const colorData = getRackColor(bay);

                            return (
                              <div
                                key={bay.code}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectObject({
                                    type: 'bay',
                                    id: `bay_${bay.code}`,
                                    code: bay.code,
                                    name: `Travée ${bay.code}`,
                                    roomId: 'room_3',
                                    roomName: 'Salle 3',
                                    bayCode: bay.code,
                                    data: {
                                      shelvesCount: 7,
                                      totalCapacity: 35,
                                      storedBoxesCount: isBeacon ? 32 : Math.round(35 * (bay.rate / 100)),
                                      occupancyRate: bay.rate,
                                      mlTotal: 6.00,
                                      mlOccupied: (6.00 * (bay.rate / 100)).toFixed(2),
                                      mlAvailable: (6.00 * (1 - bay.rate / 100)).toFixed(2),
                                      archivesList: ['Actes Notariés', 'Dossiers Contentieux'],
                                      status: 'conforme'
                                    }
                                  });
                                }}
                                className={`flex flex-col items-center cursor-pointer transition-all p-3 rounded-2xl border relative ${
                                  isBeacon
                                    ? 'bg-[#0b2434] border-sky-400 ring-2 ring-sky-400/90 shadow-[0_0_30px_rgba(56,189,248,0.6)] scale-105 z-20'
                                    : isSelected 
                                      ? 'bg-[#0f2a20] border-emerald-400 ring-2 ring-emerald-400/80 scale-105 z-20' 
                                      : 'bg-[#10192a]/80 border-slate-800 hover:border-sky-500/50 hover:bg-[#132034]'
                                }`}
                              >
                                {isBeacon && (
                                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-sky-500 text-black text-[8px] font-black rounded-full shadow-lg animate-bounce">
                                    CIBLE T47
                                  </div>
                                )}

                                <div className="flex items-center justify-between w-full mb-2">
                                  <span className="text-xs font-black text-white">{bay.code}</span>
                                  <span className="text-[10px] font-black text-sky-400">{bay.rate}%</span>
                                </div>

                                <div className="w-full space-y-1.5 p-1.5 rounded-xl bg-[#090e18] border border-slate-700/80">
                                  {bay.shelves.map((shColor, sIdx) => (
                                    <div
                                      key={sIdx}
                                      className="w-full h-3.5 rounded-md relative overflow-hidden"
                                      style={{ backgroundColor: colorMode === 'occupancy' || colorMode === 'heatmap' ? shColor : colorData.bg }}
                                    >
                                      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/30" />
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-2 text-[10px] text-slate-400 font-semibold">
                                  {Math.round(35 * (bay.rate / 100))}/35 b.
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- 4. EXCLUSIVE VIEW: ZONES SAS & LOGISTIQUE ONLY --- */}
                  {selectedRoomFilter === 'zones' && (
                    <div className="space-y-6 animate-fadeIn pb-4">
                      {/* Zones Focus Banner */}
                      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-950/90 via-[#0d1f2d] to-[#0a1525] border border-amber-500/40 shadow-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black text-base shadow-lg shadow-amber-900/40">
                            SAS
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-white">ZONES SAS, RÉCEPTION & LOGISTIQUE</h3>
                              <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 text-[11px] font-black rounded-lg border border-amber-500/40">
                                4 POSTES OPÉRATIONNELS
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                              Accueil biométrique, SAS Quarantaine décontamination, Atelier d'étiquetage et Quai d'expédition
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedRoomFilter('all');
                            setHierarchyPath(prev => ({ ...prev, room: null, bay: null, shelf: null, box: null }));
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
                        >
                          <Building2 size={13} className="text-emerald-400" />
                          <span>Voir tout le dépôt</span>
                        </button>
                      </div>

                      {/* 4 Functional Areas Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* 1. ACCUEIL / CONTRÔLE */}
                        <div 
                          onClick={() => handleSelectObject({
                            type: 'equipment',
                            id: 'eq_accueil',
                            code: 'ACCUEIL',
                            name: 'Poste d\'Accueil & Contrôle des Accès',
                            roomId: 'depot',
                            data: { description: 'Guichet de sécurité biométrique, consultation d\'archives sur place et enregistrement des bordereaux.', status: 'Opérationnel' }
                          })}
                          className="bg-gradient-to-br from-[#121c2e] to-[#0a111e] rounded-2xl p-5 border border-slate-700/80 hover:border-emerald-500/60 shadow-xl flex flex-col justify-between min-h-[170px] cursor-pointer group transition-all"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-black text-slate-200 group-hover:text-emerald-400 transition-colors">
                              ACCUEIL & CONTRÔLE
                            </span>
                            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-black rounded-md border border-emerald-500/30">
                              SAS 1
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">Poste de contrôle d'accès biométrique & bureau d'accueil</p>
                          <div className="text-[10px] text-emerald-400 font-bold mt-3">● Actif 24/7</div>
                        </div>

                        {/* 2. SAS QUARANTAINE */}
                        <div 
                          onClick={() => handleSelectObject({
                            type: 'equipment',
                            id: 'eq_quarantine',
                            code: 'QUARANTAINE',
                            name: 'SAS Quarantaine & Décontamination',
                            roomId: 'depot',
                            data: { description: 'Zone de dépoussiérage, contrôle phytosanitaire et isolement des versements entrants.', status: 'Opérationnel' }
                          })}
                          className="bg-gradient-to-br from-[#121c2e] to-[#0a111e] rounded-2xl p-5 border border-slate-700/80 hover:border-amber-500/60 shadow-xl flex flex-col justify-between min-h-[170px] cursor-pointer group transition-all"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-black text-slate-200 group-hover:text-amber-400 transition-colors">
                              SAS QUARANTAINE
                            </span>
                            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-black rounded-md border border-amber-500/30">
                              SAS 2
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">Contrôle phytosanitaire et traitement des versements entrants</p>
                          <div className="text-[10px] text-amber-400 font-bold mt-3">● Sas étanche</div>
                        </div>

                        {/* 3. ATELIER PRÉPARATION */}
                        <div 
                          onClick={() => handleSelectObject({
                            type: 'equipment',
                            id: 'eq_prep',
                            code: 'PREPARATION',
                            name: 'Atelier de Préparation & Conditionnement',
                            roomId: 'depot',
                            data: { description: 'Tables de tri, étiqueteuses code-barres RFID et matériel de reconditionnement.', status: 'Opérationnel' }
                          })}
                          className="bg-gradient-to-br from-[#121c2e] to-[#0a111e] rounded-2xl p-5 border border-slate-700/80 hover:border-teal-500/60 shadow-xl flex flex-col justify-between min-h-[170px] cursor-pointer group transition-all"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-black text-slate-200 group-hover:text-teal-400 transition-colors">
                              PRÉPARATION & TRI
                            </span>
                            <span className="px-2 py-0.5 bg-teal-500/20 text-teal-400 text-[10px] font-black rounded-md border border-teal-500/30">
                              ATELIER
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">Reconditionnement, mise en boîte et étiquetage RFID</p>
                          <div className="text-[10px] text-teal-400 font-bold mt-3">● 3 Postes de travail</div>
                        </div>

                        {/* 4. SORTIE & TRANSFERT */}
                        <div 
                          onClick={() => handleSelectObject({
                            type: 'equipment',
                            id: 'eq_dock',
                            code: 'EXPEDITION',
                            name: 'Quai de Sortie & Transfert',
                            roomId: 'depot',
                            data: { description: 'Quai de chargement sécurisé pour transferts inter-sites et destructions certifiées.', status: 'Opérationnel' }
                          })}
                          className="bg-gradient-to-br from-[#121c2e] to-[#0a111e] rounded-2xl p-5 border border-slate-700/80 hover:border-emerald-500/60 shadow-xl flex flex-col justify-between min-h-[170px] cursor-pointer group transition-all"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-black text-slate-200 group-hover:text-emerald-400 transition-colors">
                              SORTIE / TRANSFERT
                            </span>
                            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-black rounded-md border border-emerald-500/30">
                              QUAI
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">Rideau métallique électrique & quai d'expédition sécurisé</p>
                          <div className="text-[10px] text-emerald-400 font-bold mt-3">● Quai de chargement</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================================= */}
                  {/* --- 5. COMPOSITE VIEW (WHEN FILTER === 'all'): ALL ROOMS + SAS ZONES --- */}
                  {/* ========================================================================= */}
                  {selectedRoomFilter === 'all' && (
                    <>
                  {/* UPPER ARCHIVE STORAGE ROOMS (SALLE 1, SALLE 2, SALLE 3)                   */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 relative pb-6 border-b-[3px] border-[#1e2a40]">
                    
                    {/* ==================== SALLE 1 ==================== */}
                    <div 
                      onClick={() => handleSelectObject({
                        type: 'room',
                        id: 'room_1',
                        code: 'SALLE-1',
                        name: 'Salle 1 (Haute Densité)',
                        roomId: 'room_1',
                        data: { totalBays: 31, totalCapacity: 850, storedBoxes: 696, occupancyRate: 82, mlOccupied: 960, mlAvailable: 190 }
                      })}
                      className="border-r-0 md:border-r-[3px] border-[#1e2a40] pr-0 md:pr-4 flex flex-col cursor-pointer group"
                    >
                      {/* Room Header Pill with Neon Glow */}
                      <div className="flex justify-center mb-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRoomFilter('room_1');
                          }}
                          className="px-5 py-1 bg-gradient-to-r from-emerald-950 to-teal-900 hover:from-emerald-900 hover:to-teal-800 text-emerald-300 text-xs font-black rounded-xl border border-emerald-500/40 tracking-wider shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Cliquer pour afficher UNIQUEMENT Salle 1"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>SALLE 1 (82%)</span>
                          <span className="text-[9px] text-emerald-400 font-normal ml-1">🔍 Isoler</span>
                        </button>
                      </div>
                      
                      {/* 3D Volumetric Racks in Salle 1 (T32 to T38) */}
                      <div className="grid grid-cols-6 gap-2">
                        {room1Bays.map((bay) => {
                          const isSelected = selectedEntity?.code === bay.code;
                          const colorData = getRackColor(bay);

                          return (
                            <div
                              key={bay.code}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectObject({
                                  type: 'bay',
                                  id: `bay_${bay.code}`,
                                  code: bay.code,
                                  name: `Travée ${bay.code}`,
                                  roomId: 'room_1',
                                  roomName: 'Salle 1',
                                  bayCode: bay.code,
                                  data: {
                                    shelvesCount: 7,
                                    totalCapacity: 35,
                                    storedBoxesCount: Math.round(35 * (bay.rate / 100)),
                                    occupancyRate: bay.rate,
                                    mlTotal: 6.00,
                                    mlOccupied: (6.00 * (bay.rate / 100)).toFixed(2),
                                    mlAvailable: (6.00 * (1 - bay.rate / 100)).toFixed(2),
                                    archivesList: ['Sinistres Matériels', 'Contrats Auto'],
                                    status: 'conforme'
                                  }
                                });
                              }}
                              onMouseEnter={(e) => {
                                const rect = containerRef.current?.getBoundingClientRect();
                                setHoveredObject({
                                  type: 'bay',
                                  title: `Travée ${bay.code}`,
                                  subtitle: `Salle 1 · ${Math.round(35 * (bay.rate / 100))}/35 boîtes (${bay.rate}% occupé)`,
                                  badge: `${bay.rate}%`,
                                  x: e.clientX - (rect?.left || 0),
                                  y: e.clientY - (rect?.top || 0)
                                });
                              }}
                              onMouseLeave={() => setHoveredObject(null)}
                              className={`flex flex-col items-center cursor-pointer transition-all ${
                                isSelected ? 'scale-110 z-30' : 'hover:scale-105 opacity-90 hover:opacity-100'
                              }`}
                            >
                              <span className={`text-[10px] font-black mb-1 transition-colors ${
                                isSelected ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'text-slate-400'
                              }`}>
                                {bay.code}
                              </span>

                              {/* 3D Rack Frame with Volumetric Shelves */}
                              <div 
                                className={`w-full max-w-[32px] rounded-lg p-1 space-y-1 border transition-all ${
                                  isSelected 
                                    ? 'bg-[#0f241a] border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.6)]' 
                                    : 'bg-[#0f1728] border-slate-700/80 hover:border-slate-500 shadow-md'
                                }`}
                              >
                                {bay.shelves.map((shColor, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="w-full h-3 rounded-[3px] shadow-sm transition-all relative overflow-hidden"
                                    style={{
                                      backgroundColor: colorMode === 'occupancy' || colorMode === 'heatmap' ? shColor : colorData.bg,
                                      boxShadow: isSelected ? `inset 0 1px 2px rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.5)` : 'none'
                                    }}
                                  >
                                    {/* 3D Top Bevel Highlight on Each Shelf */}
                                    <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/30" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ==================== SALLE 2 (Center Room) ==================== */}
                    <div 
                      onClick={() => handleSelectObject({
                        type: 'room',
                        id: 'room_2',
                        code: 'SALLE-2',
                        name: 'Salle 2 (Gestion Courante)',
                        roomId: 'room_2',
                        data: { totalBays: 48, totalCapacity: 1400, storedBoxes: 1120, occupancyRate: 80, mlOccupied: 1450, mlAvailable: 350 }
                      })}
                      className="border-r-0 md:border-r-[3px] border-[#1e2a40] pr-0 md:pr-4 flex flex-col justify-between cursor-pointer group"
                    >
                      {/* Centered Green Badge "SALLE 2" matching reference */}
                      <div className="flex justify-center mb-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRoomFilter('room_2');
                          }}
                          className="px-6 py-1 bg-gradient-to-r from-emerald-800 to-teal-800 hover:from-emerald-700 hover:to-teal-700 text-emerald-200 text-xs font-black rounded-xl border border-emerald-400/50 tracking-wider shadow-lg shadow-emerald-950/60 flex items-center gap-1.5 cursor-pointer transition-all"
                          title="Cliquer pour afficher UNIQUEMENT Salle 2"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>SALLE 2 (80%)</span>
                          <span className="text-[9px] text-emerald-300 font-normal ml-1">🔍 Isoler</span>
                        </button>
                      </div>

                      {/* Top Row of Racks in Salle 2 */}
                      <div className="grid grid-cols-6 gap-2 mb-3">
                        {room2TopBays.map((bay) => {
                          const isSelected = selectedEntity?.code === bay.code;
                          const colorData = getRackColor(bay);

                          return (
                            <div
                              key={bay.code}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectObject({
                                  type: 'bay',
                                  id: `bay_${bay.code}`,
                                  code: bay.code,
                                  name: `Travée ${bay.code}`,
                                  roomId: 'room_2',
                                  roomName: 'Salle 2',
                                  bayCode: bay.code,
                                  data: {
                                    shelvesCount: 7,
                                    totalCapacity: 35,
                                    storedBoxesCount: Math.round(35 * (bay.rate / 100)),
                                    occupancyRate: bay.rate,
                                    mlTotal: 6.00,
                                    mlOccupied: (6.00 * (bay.rate / 100)).toFixed(2),
                                    mlAvailable: (6.00 * (1 - bay.rate / 100)).toFixed(2),
                                    archivesList: ['Sinistres Matériels', 'Sinistres Corporels'],
                                    status: 'conforme'
                                  }
                                });
                              }}
                              onMouseEnter={(e) => {
                                const rect = containerRef.current?.getBoundingClientRect();
                                setHoveredObject({
                                  type: 'bay',
                                  title: `Travée ${bay.code}`,
                                  subtitle: `Salle 2 (Haut) · ${Math.round(35 * (bay.rate / 100))}/35 boîtes (${bay.rate}%)`,
                                  badge: `${bay.rate}%`,
                                  x: e.clientX - (rect?.left || 0),
                                  y: e.clientY - (rect?.top || 0)
                                });
                              }}
                              onMouseLeave={() => setHoveredObject(null)}
                              className={`flex flex-col items-center cursor-pointer transition-all ${
                                isSelected ? 'scale-110 z-30' : 'hover:scale-105 opacity-90 hover:opacity-100'
                              }`}
                            >
                              <span className={`text-[10px] font-black mb-1 transition-colors ${
                                isSelected ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'text-slate-400'
                              }`}>
                                {bay.code}
                              </span>

                              <div 
                                className={`w-full max-w-[32px] rounded-lg p-1 space-y-1 border transition-all ${
                                  isSelected 
                                    ? 'bg-[#0f241a] border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.6)]' 
                                    : 'bg-[#0f1728] border-slate-700/80 hover:border-slate-500 shadow-md'
                                }`}
                              >
                                {bay.shelves.map((shColor, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="w-full h-3 rounded-[3px] shadow-sm relative overflow-hidden"
                                    style={{
                                      backgroundColor: colorMode === 'occupancy' || colorMode === 'heatmap' ? shColor : colorData.bg
                                    }}
                                  >
                                    <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/30" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Bottom Row of Racks in Salle 2 */}
                      <div className="grid grid-cols-6 gap-2 mt-auto">
                        {room2BottomBays.map((bay) => {
                          const isSelected = selectedEntity?.code === bay.code;
                          const colorData = getRackColor(bay);

                          return (
                            <div
                              key={bay.code}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectObject({
                                  type: 'bay',
                                  id: `bay_${bay.code}`,
                                  code: bay.code,
                                  name: `Travée ${bay.code}`,
                                  roomId: 'room_2',
                                  roomName: 'Salle 2',
                                  bayCode: bay.code,
                                  data: {
                                    shelvesCount: 7,
                                    totalCapacity: 35,
                                    storedBoxesCount: Math.round(35 * (bay.rate / 100)),
                                    occupancyRate: bay.rate,
                                    mlTotal: 6.00,
                                    mlOccupied: (6.00 * (bay.rate / 100)).toFixed(2),
                                    mlAvailable: (6.00 * (1 - bay.rate / 100)).toFixed(2),
                                    archivesList: ['Sinistres Corporels', 'Contentieux'],
                                    status: 'conforme'
                                  }
                                });
                              }}
                              onMouseEnter={(e) => {
                                const rect = containerRef.current?.getBoundingClientRect();
                                setHoveredObject({
                                  type: 'bay',
                                  title: `Travée ${bay.code}`,
                                  subtitle: `Salle 2 (Bas) · ${Math.round(35 * (bay.rate / 100))}/35 boîtes (${bay.rate}%)`,
                                  badge: `${bay.rate}%`,
                                  x: e.clientX - (rect?.left || 0),
                                  y: e.clientY - (rect?.top || 0)
                                });
                              }}
                              onMouseLeave={() => setHoveredObject(null)}
                              className={`flex flex-col items-center cursor-pointer transition-all ${
                                isSelected ? 'scale-110 z-30' : 'hover:scale-105 opacity-90 hover:opacity-100'
                              }`}
                            >
                              <span className={`text-[10px] font-black mb-1 transition-colors ${
                                isSelected ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'text-slate-400'
                              }`}>
                                {bay.code}
                              </span>

                              <div 
                                className={`w-full max-w-[32px] rounded-lg p-1 space-y-1 border transition-all ${
                                  isSelected 
                                    ? 'bg-[#0f241a] border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.6)]' 
                                    : 'bg-[#0f1728] border-slate-700/80 hover:border-slate-500 shadow-md'
                                }`}
                              >
                                {bay.shelves.map((shColor, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="w-full h-3 rounded-[3px] shadow-sm relative overflow-hidden"
                                    style={{
                                      backgroundColor: colorMode === 'occupancy' || colorMode === 'heatmap' ? shColor : colorData.bg
                                    }}
                                  >
                                    <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/30" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>

                    {/* ==================== SALLE 3 (Contains Active T47) ==================== */}
                    <div 
                      onClick={() => handleSelectObject({
                        type: 'room',
                        id: 'room_3',
                        code: 'SALLE-3',
                        name: 'Salle 3 (Archives Définitives)',
                        roomId: 'room_3',
                        data: { totalBays: 35, totalCapacity: 950, storedBoxes: 870, occupancyRate: 91, mlOccupied: 1200, mlAvailable: 110 }
                      })}
                      className="relative flex flex-col justify-between cursor-pointer group"
                    >
                      {/* Room Header Pill */}
                      <div className="flex justify-center mb-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRoomFilter('room_3');
                          }}
                          className="px-6 py-1 bg-gradient-to-r from-sky-950 to-blue-900 hover:from-sky-900 hover:to-blue-800 text-sky-300 text-xs font-black rounded-xl border border-sky-500/40 tracking-wider shadow-lg shadow-sky-950/50 flex items-center gap-1.5 cursor-pointer transition-all"
                          title="Cliquer pour afficher UNIQUEMENT Salle 3"
                        >
                          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                          <span>SALLE 3 (91%)</span>
                          <span className="text-[9px] text-sky-300 font-normal ml-1">🔍 Isoler</span>
                        </button>
                      </div>

                      {/* 7 Columns of Racks in Salle 3 (T46 to T52) */}
                      <div className="grid grid-cols-7 gap-2">
                        {room3Bays.map((bay) => {
                          const isSelected = selectedEntity?.code === bay.code;
                          const colorData = getRackColor(bay);

                          return (
                            <div
                              key={bay.code}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectObject({
                                  type: 'bay',
                                  id: `bay_${bay.code}`,
                                  code: bay.code,
                                  name: `Travée ${bay.code}`,
                                  roomId: 'room_3',
                                  roomName: 'Salle 3',
                                  bayCode: bay.code,
                                  data: {
                                    shelvesCount: 7,
                                    totalCapacity: 35,
                                    storedBoxesCount: bay.code === 'T47' ? 32 : Math.round(35 * (bay.rate / 100)),
                                    occupancyRate: bay.rate,
                                    mlTotal: 6.00,
                                    mlOccupied: (6.00 * (bay.rate / 100)).toFixed(2),
                                    mlAvailable: (6.00 * (1 - bay.rate / 100)).toFixed(2),
                                    archivesList: ['Sinistres Matériels', 'Sinistres Corporels'],
                                    status: 'conforme'
                                  }
                                });
                              }}
                              onMouseEnter={(e) => {
                                const rect = containerRef.current?.getBoundingClientRect();
                                setHoveredObject({
                                  type: 'bay',
                                  title: `Travée ${bay.code}`,
                                  subtitle: `Salle 3 · ${bay.code === 'T47' ? '32' : Math.round(35 * (bay.rate / 100))}/35 boîtes (${bay.rate}% occupé)`,
                                  badge: `${bay.rate}%`,
                                  x: e.clientX - (rect?.left || 0),
                                  y: e.clientY - (rect?.top || 0)
                                });
                              }}
                              onMouseLeave={() => setHoveredObject(null)}
                              className={`flex flex-col items-center cursor-pointer relative transition-all ${
                                isSelected ? 'scale-110 z-30' : 'hover:scale-105 opacity-90 hover:opacity-100'
                              }`}
                            >
                              {/* 3D Holographic Pin / Beacon on Selected Bay (T47) */}
                              {isSelected && (
                                <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center z-40 pointer-events-none animate-bounce">
                                  <div className="w-5 h-5 rounded-full bg-emerald-500 border-2 border-white shadow-[0_0_12px_rgba(52,211,153,1)] flex items-center justify-center">
                                    <MapPin size={11} className="text-slate-950" />
                                  </div>
                                  <div className="w-1.5 h-1.5 bg-emerald-400 rotate-45 -mt-0.5" />
                                </div>
                              )}

                              <span className={`text-[10px] font-black mb-1 transition-colors ${
                                isSelected ? 'text-emerald-400 font-black drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'text-slate-400'
                              }`}>
                                {bay.code}
                              </span>

                              <div 
                                className={`w-full max-w-[32px] rounded-lg p-1 space-y-1 border transition-all ${
                                  isSelected 
                                    ? 'bg-[#0f241a] border-emerald-400 ring-2 ring-emerald-400/80 shadow-[0_0_25px_rgba(52,211,153,0.7)]' 
                                    : 'bg-[#0f1728] border-slate-700/80 hover:border-slate-500 shadow-md'
                                }`}
                              >
                                {bay.shelves.map((shColor, sIdx) => (
                                  <div
                                    key={sIdx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectObject({
                                        type: 'shelf',
                                        id: `shelf_${bay.code}_${7 - sIdx}`,
                                        code: `T${7 - sIdx}`,
                                        name: `Tablette ${7 - sIdx}`,
                                        shelfNumber: 7 - sIdx,
                                        bayCode: bay.code,
                                        roomId: 'room_3',
                                        roomName: 'Salle 3',
                                        data: {
                                          boxCapacity: 5,
                                          storedBoxesCount: 5,
                                          occupancyRate: 100,
                                          mlOccupied: '0.90 ml',
                                          archiveType: (7 - sIdx) % 2 === 0 ? 'Sinistres Matériels' : 'Sinistres Corporels'
                                        }
                                      });
                                    }}
                                    className="w-full h-3 rounded-[3px] shadow-sm relative overflow-hidden cursor-pointer hover:ring-1 hover:ring-white transition-all"
                                    style={{
                                      backgroundColor: colorMode === 'occupancy' || colorMode === 'heatmap' ? shColor : colorData.bg
                                    }}
                                  >
                                    <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-white/30" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>

                  </div>

                  {/* ========================================================================= */}
                  {/* LOWER SECTION: 4 3D ARCHITECTURAL FUNCTIONAL ZONES                        */}
                  {/* (Accueil / Contrôle, Quarantaine, Préparation, Sortie / Transfert)        */}
                  {/* ========================================================================= */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6 relative">
                    
                    {/* 1. ACCUEIL / CONTRÔLE */}
                    <div 
                      onClick={() => handleSelectObject({
                        type: 'equipment',
                        id: 'eq_accueil',
                        code: 'ACCUEIL',
                        name: 'Poste d\'Accueil & Contrôle des Accès',
                        roomId: 'depot',
                        data: { description: 'Guichet de sécurité biométrique, consultation d\'archives sur place et enregistrement des bordereaux.', status: 'Opérationnel' }
                      })}
                      onMouseEnter={(e) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        setHoveredObject({
                          type: 'equipment',
                          title: 'Accueil & Contrôle Sécurisé',
                          subtitle: 'SAS d\'entrée, badgeuse biométrique et bureau des archivistes',
                          x: e.clientX - (rect?.left || 0),
                          y: e.clientY - (rect?.top || 0)
                        });
                      }}
                      onMouseLeave={() => setHoveredObject(null)}
                      className="bg-gradient-to-br from-[#121c2e] to-[#0a111e] rounded-2xl p-4 border border-slate-700/80 hover:border-emerald-500/60 shadow-xl flex flex-col justify-between min-h-[140px] cursor-pointer group transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider group-hover:text-emerald-400 transition-colors">
                          ACCUEIL / CONTRÔLE
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-black rounded-md border border-emerald-500/30">
                          SAS 1
                        </span>
                      </div>

                      {/* 3D Realistic Office Furniture Illustration */}
                      <div className="flex items-center justify-center gap-3 py-2">
                        {/* 3D Potted Plant */}
                        <div className="w-5 h-5 rounded-full bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center shadow-md">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                        </div>
                        {/* 3D Executive Reception Desk with Dual Monitors */}
                        <div className="relative bg-gradient-to-r from-amber-900 to-amber-950 border border-amber-700/60 rounded-xl px-5 py-3 shadow-lg flex items-center justify-center">
                          <div className="w-7 h-4 bg-slate-900 border border-sky-400/60 rounded-sm shadow-inner flex items-center justify-center">
                            <Monitor size={10} className="text-sky-400" />
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400 text-center font-medium">Poste opérateur & Badges</div>
                    </div>

                    {/* 2. QUARANTAINE */}
                    <div 
                      onClick={() => handleSelectObject({
                        type: 'equipment',
                        id: 'eq_quarantaine',
                        code: 'QUARANTAINE',
                        name: 'SAS Sanitaire & Quarantaine d\'Archives',
                        roomId: 'depot',
                        data: { description: 'Zone de dépoussiérage, désinfection et stabilisation hygrométrique avant intégration dans les travées.', status: 'Actif' }
                      })}
                      onMouseEnter={(e) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        setHoveredObject({
                          type: 'equipment',
                          title: 'Zone de Quarantaine',
                          subtitle: 'Isolement sanitaire et contrôle d\'intégrité des versements entrants',
                          x: e.clientX - (rect?.left || 0),
                          y: e.clientY - (rect?.top || 0)
                        });
                      }}
                      onMouseLeave={() => setHoveredObject(null)}
                      className="bg-gradient-to-br from-[#121c2e] to-[#0a111e] rounded-2xl p-4 border border-slate-700/80 hover:border-amber-500/60 shadow-xl flex flex-col justify-between min-h-[140px] cursor-pointer group transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider group-hover:text-amber-400 transition-colors">
                          QUARANTAINE
                        </span>
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[9px] font-black rounded-md border border-amber-500/30">
                          SAS 2
                        </span>
                      </div>

                      {/* 3D Stacked Pallet Boxes with Hazard Colors */}
                      <div className="grid grid-cols-3 gap-1.5 px-4 py-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div 
                            key={i} 
                            className="h-5 bg-gradient-to-b from-amber-700 to-amber-900 border border-amber-600 rounded-[3px] shadow-sm flex items-center justify-center text-[8px] font-black text-amber-200"
                          >
                            PAL-{i+1}
                          </div>
                        ))}
                      </div>

                      <div className="text-[10px] text-amber-400/80 text-center font-medium">Contrôle biologique & état physique</div>
                    </div>

                    {/* 3. PRÉPARATION */}
                    <div 
                      onClick={() => handleSelectObject({
                        type: 'equipment',
                        id: 'eq_prep',
                        code: 'PRÉPARATION',
                        name: 'Atelier de Préparation & Étiquetage QR Code',
                        roomId: 'depot',
                        data: { description: 'Conditionnement sous boîtes normalisées 24x32 cm et apposition des étiquettes à code-barres uniques.', status: 'Actif' }
                      })}
                      onMouseEnter={(e) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        setHoveredObject({
                          type: 'equipment',
                          title: 'Atelier de Préparation',
                          subtitle: 'Conditionnement, étiquetage QR/Code-barres et répartition par travées',
                          x: e.clientX - (rect?.left || 0),
                          y: e.clientY - (rect?.top || 0)
                        });
                      }}
                      onMouseLeave={() => setHoveredObject(null)}
                      className="bg-gradient-to-br from-[#121c2e] to-[#0a111e] rounded-2xl p-4 border border-slate-700/80 hover:border-sky-500/60 shadow-xl flex flex-col justify-between min-h-[140px] cursor-pointer group transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider group-hover:text-sky-400 transition-colors">
                          PRÉPARATION
                        </span>
                        <span className="px-2 py-0.5 bg-sky-500/20 text-sky-300 text-[9px] font-black rounded-md border border-sky-500/30">
                          SAS 3
                        </span>
                      </div>

                      {/* 3D Sorting Workbench with Archive Cartons */}
                      <div className="grid grid-cols-3 gap-1.5 px-4 py-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div 
                            key={i} 
                            className="h-5 bg-gradient-to-b from-orange-600 to-orange-800 border border-orange-500 rounded-[3px] shadow-sm flex items-center justify-center text-[8px] font-black text-orange-100"
                          >
                            LOT-{i+1}
                          </div>
                        ))}
                      </div>

                      <div className="text-[10px] text-sky-400/80 text-center font-medium">Mise en boîte & étiquetage</div>
                    </div>

                    {/* 4. SORTIE / TRANSFERT */}
                    <div 
                      onClick={() => handleSelectObject({
                        type: 'equipment',
                        id: 'eq_sortie',
                        code: 'SORTIE',
                        name: 'Quai de Sortie & Transfert d\'Archives',
                        roomId: 'depot',
                        data: { description: 'SAS d\'expédition sécurisé pour élimination certifiée ou consultation extérieure.', status: 'Contrôlé' }
                      })}
                      onMouseEnter={(e) => {
                        const rect = containerRef.current?.getBoundingClientRect();
                        setHoveredObject({
                          type: 'equipment',
                          title: 'Zone Sortie / Transfert',
                          subtitle: 'Quai de chargement et éliminations scellées',
                          x: e.clientX - (rect?.left || 0),
                          y: e.clientY - (rect?.top || 0)
                        });
                      }}
                      onMouseLeave={() => setHoveredObject(null)}
                      className="bg-gradient-to-br from-[#121c2e] to-[#0a111e] rounded-2xl p-4 border border-slate-700/80 hover:border-emerald-500/60 shadow-xl flex flex-col justify-between min-h-[140px] cursor-pointer group transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider group-hover:text-emerald-400 transition-colors">
                          SORTIE / TRANSFERT
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[9px] font-black rounded-md border border-emerald-500/30">
                          QUAI
                        </span>
                      </div>

                      {/* Realistic 3D Roll-up Delivery Shutter */}
                      <div className="space-y-1 px-3 py-2 bg-[#0d1525] rounded-xl border border-slate-700/80">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="h-1.5 bg-slate-600 rounded-full shadow-inner" />
                        ))}
                      </div>

                      <div className="text-[10px] text-slate-400 text-center font-medium">SAS d'expédition sécurisé</div>
                    </div>

                  </div>
                </>
              )}

                  {/* SAFETY EQUIPMENT: EXTINCTEURS & ISSUES DE SECOURS (OVERLAY ILLUMINATED) */}
                  <div className="flex items-center justify-between pt-4 mt-2 border-t border-[#1e2a40] text-[10px] text-slate-400">
                    <div className="flex items-center gap-4">
                      <div 
                        onClick={() => handleSelectObject({
                          type: 'extinguisher',
                          id: 'ext_all',
                          code: 'EXTINCTEURS',
                          name: 'Réseau d\'Extincteurs CO2 & Eau Pulvérisée',
                          roomId: 'depot',
                          data: { total: 4, lastControl: '15/06/2026', status: 'Conformes & Scellés' }
                        })}
                        className="flex items-center gap-1.5 cursor-pointer hover:text-rose-400 transition-colors"
                      >
                        <div className="w-2.5 h-4 rounded-sm bg-rose-600 border border-rose-400 flex items-center justify-center shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                        <span className="font-bold text-slate-300">4 Extincteurs conformes</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 bg-emerald-600 text-white font-black text-[8px] rounded shadow-[0_0_6px_rgba(16,185,129,0.8)]">
                          EXIT
                        </span>
                        <span>5 Portes Coupe-Feu 2h</span>
                      </div>
                    </div>

                    <div className="text-right text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      <span>Jumeau Numérique Synchronisé 24/7</span>
                    </div>
                  </div>

                </div>
              )}

              {/* ========================================================================= */}
              {/* --- MODE 2: DETAILED 3D RACK ELEVATION VIEW (ALL 7 LEVELS + SLOTS) ---    */}
              {/* ========================================================================= */}
              {viewMode === 'elevation' && (
                <div className="bg-[#0f172a] rounded-3xl p-6 border-2 border-emerald-500/50 shadow-2xl space-y-6">
                  
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                        VUE ÉLÉVATION DÉTAILLÉE DU RAYONNAGE
                      </span>
                      <h2 className="text-xl font-black text-white flex items-center gap-2 mt-1">
                        {selectedEntity?.name || 'Travée T47'}
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          {selectedEntity?.data?.occupancyRate || 91.4}% OCCUPÉ
                        </span>
                      </h2>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Box size={14} className="text-emerald-400" />
                        <span>Capacité : <strong>35 boîtes (5/tablette)</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Layers size={14} className="text-sky-400" />
                        <span>Mètres Linéaires : <strong>6,00 ml</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* 7 Shelf Levels with Real Box Slots */}
                  <div className="space-y-3">
                    {Array.from({ length: 7 }).map((_, idx) => {
                      const levelNum = 7 - idx;
                      const isShelfSelected = hierarchyPath.shelf === levelNum;

                      return (
                        <div 
                          key={levelNum}
                          onClick={() => handleSelectObject({
                            type: 'shelf',
                            id: `shelf_${selectedEntity?.code || 'T47'}_${levelNum}`,
                            code: `T${levelNum}`,
                            name: `Tablette ${levelNum}`,
                            shelfNumber: levelNum,
                            bayCode: selectedEntity?.code || 'T47',
                            roomId: selectedEntity?.roomId || 'room_2',
                            data: {
                              boxCapacity: 5,
                              storedBoxesCount: levelNum === 7 ? 3 : 5,
                              occupancyRate: levelNum === 7 ? 60 : 100,
                              mlOccupied: (levelNum === 7 ? 0.54 : 0.90).toFixed(2) + ' ml'
                            }
                          })}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                            isShelfSelected 
                              ? 'bg-emerald-950/40 border-emerald-400 ring-2 ring-emerald-400/60 shadow-lg' 
                              : 'bg-[#141f33] border-slate-700/80 hover:border-slate-500'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-white px-2 py-0.5 bg-slate-800 rounded-lg">
                                Tablette N{levelNum}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                {levelNum % 2 === 0 ? 'Sinistres Matériels' : 'Sinistres Corporels'}
                              </span>
                            </div>
                            <span className="text-emerald-400 font-bold text-[11px]">
                              {levelNum === 7 ? '3 / 5 Boîtes (0.54 ml)' : '5 / 5 Boîtes (0.90 ml)'}
                            </span>
                          </div>

                          {/* 5 Physical Box Slots per Shelf */}
                          <div className="grid grid-cols-5 gap-2">
                            {Array.from({ length: 5 }).map((_, boxIdx) => {
                              const pos = boxIdx + 1;
                              const isOccupied = !(levelNum === 7 && pos > 3);
                              const boxNum = `B${(levelNum * 10 + pos).toString().padStart(3, '0')}`;
                              const isBoxSelected = hierarchyPath.box === boxNum;

                              return (
                                <div
                                  key={pos}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isOccupied) {
                                      handleSelectObject({
                                        type: 'box',
                                        id: `box_${boxNum}`,
                                        code: boxNum,
                                        name: `Boîte ${boxNum}`,
                                        boxNumber: boxNum,
                                        shelfNumber: levelNum,
                                        bayCode: selectedEntity?.code || 'T47',
                                        data: {
                                          folderCount: 15 + pos * 2,
                                          archiveType: levelNum % 2 === 0 ? 'Sinistres Matériels' : 'Sinistres Corporels',
                                          mlOccupied: 0.18,
                                          status: 'conforme',
                                          entryDate: '2026-03-12'
                                        }
                                      });
                                    }
                                  }}
                                  className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all ${
                                    isOccupied
                                      ? isBoxSelected
                                        ? 'bg-emerald-600 border-white text-white font-black scale-105 shadow-md'
                                        : 'bg-emerald-950/60 border-emerald-500/50 hover:bg-emerald-900/60 text-emerald-300 hover:border-emerald-400'
                                      : 'bg-slate-900/40 border-dashed border-slate-700 text-slate-500'
                                  }`}
                                >
                                  {isOccupied ? (
                                    <>
                                      <Box size={14} className="mb-0.5" />
                                      <span className="text-[11px] font-black">{boxNum}</span>
                                      <span className="text-[9px] opacity-80">Pos {pos}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] font-bold">Libre</span>
                                      <span className="text-[8px] opacity-60">Pos {pos}</span>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                        </div>
                      );
                    })}
                  </div>

                </div>
              )}

            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* 4. RIGHT SLIDE-IN HIGH-TECH DETAIL PANEL                                  */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 xl:col-span-3 bg-[#0a101d] rounded-3xl border border-slate-800 p-5 flex flex-col justify-between shadow-2xl z-20 min-h-[660px]">
          
          <div className="space-y-4">
            
            {/* Header with Title and Type */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {selectedEntity?.type === 'bay' ? 'DÉTAIL TRAVÉE' : 
                   selectedEntity?.type === 'shelf' ? 'DÉTAIL TABLETTE' : 
                   selectedEntity?.type === 'box' ? 'DÉTAIL BOÎTE' : 
                   selectedEntity?.type === 'room' ? 'DÉTAIL SALLE D\'ARCHIVES' : 
                   selectedEntity?.type === 'extinguisher' ? 'ÉQUIPEMENT SÉCURITÉ' : 'DÉTAIL ESPACE'}
                </div>
                <h3 className="text-lg font-black text-white flex items-center gap-2 mt-0.5">
                  {selectedEntity?.name || 'Travée T47'}
                  {selectedEntity?.type === 'bay' && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {selectedEntity.data?.occupancyRate || 91.4}%
                    </span>
                  )}
                </h3>
              </div>

              <div className="flex items-center gap-1">
                {viewMode !== 'elevation' && selectedEntity?.type === 'bay' && (
                  <button
                    onClick={() => setViewMode('elevation')}
                    className="p-1.5 rounded-lg bg-emerald-950 text-emerald-400 hover:bg-emerald-900 border border-emerald-600/40 text-xs font-bold transition-all cursor-pointer"
                    title="Voir l'élévation 3D complète"
                  >
                    <Layers size={15} />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedEntity(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Side Panel Tabs */}
            <div className="flex items-center gap-1 bg-[#111927] p-1 rounded-xl border border-slate-800 text-xs font-bold text-slate-400">
              <button
                onClick={() => setSidePanelTab('info')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  sidePanelTab === 'info' ? 'bg-emerald-600 text-white font-black shadow-xs' : 'hover:text-white'
                }`}
              >
                Infos
              </button>
              <button
                onClick={() => setSidePanelTab('shelves')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  sidePanelTab === 'shelves' ? 'bg-emerald-600 text-white font-black shadow-xs' : 'hover:text-white'
                }`}
              >
                Tablettes
              </button>
              <button
                onClick={() => setSidePanelTab('boxes')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  sidePanelTab === 'boxes' ? 'bg-emerald-600 text-white font-black shadow-xs' : 'hover:text-white'
                }`}
              >
                Boîtes
              </button>
            </div>

            {/* TAB 1: GENERAL INFO */}
            {sidePanelTab === 'info' && (
              <div className="space-y-2 text-xs divide-y divide-slate-800/80">
                
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-400 font-medium">Salle de rattachement</span>
                  <span className="font-bold text-white">{selectedEntity?.roomName || 'Salle 2'}</span>
                </div>

                {selectedEntity?.type === 'bay' && (
                  <>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Types d'Archives</span>
                      <div className="text-right">
                        <div className="text-emerald-400 font-bold text-[11px]">• Sinistres Matériels</div>
                        <div className="text-sky-400 font-bold text-[11px]">• Sinistres Corporels</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Nombre de Tablettes</span>
                      <span className="font-bold text-white">7 Niveaux</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Capacité Boîtes</span>
                      <span className="font-bold text-white">{selectedEntity.data?.storedBoxesCount || 32} / {selectedEntity.data?.totalCapacity || 35}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Taux d'Occupation</span>
                      <span className="font-black text-rose-400">{selectedEntity.data?.occupancyRate || 91.4} %</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">ML occupés</span>
                      <span className="font-bold text-white">{selectedEntity.data?.mlOccupied || '5,40'} ml</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">ML disponibles</span>
                      <span className="font-bold text-white">{selectedEntity.data?.mlAvailable || '0,60'} ml</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Capacité Totale ML</span>
                      <span className="font-bold text-white">{selectedEntity.data?.mlTotal || '6,00'} ml</span>
                    </div>
                  </>
                )}

                {selectedEntity?.type === 'shelf' && (
                  <>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Travée</span>
                      <span className="font-bold text-white">{selectedEntity.bayCode || 'T47'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Niveau Tablette</span>
                      <span className="font-bold text-emerald-400">Niveau {selectedEntity.shelfNumber || 4}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Boîtes stockées</span>
                      <span className="font-bold text-white">5 / 5 boîtes</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Dossiers estimés</span>
                      <span className="font-bold text-white">75 dossiers</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Mètres linéaires</span>
                      <span className="font-bold text-white">0,90 ml</span>
                    </div>
                  </>
                )}

                {selectedEntity?.type === 'box' && (
                  <>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">N° de Boîte</span>
                      <span className="font-black text-emerald-400">{selectedEntity.boxNumber || selectedEntity.code}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Type d'archive</span>
                      <span className="font-bold text-white">{selectedEntity.data?.archiveType || 'Sinistres Matériels'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Nombre de dossiers</span>
                      <span className="font-bold text-white">{selectedEntity.data?.folderCount || 18} dossiers</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Emplacement complet</span>
                      <span className="font-bold text-slate-300">Salle 2 &gt; {selectedEntity.bayCode || 'T47'} &gt; N{selectedEntity.shelfNumber || 4}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Mètres linéaires</span>
                      <span className="font-bold text-white">0,18 ml</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-slate-400 font-medium">Statut d'audit</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold rounded">Conforme</span>
                    </div>
                  </>
                )}

              </div>
            )}

            {/* TAB 2: TABLETTES DISTRIBUTION */}
            {sidePanelTab === 'shelves' && (
              <div className="space-y-2 text-xs">
                {Array.from({ length: 7 }).map((_, i) => {
                  const num = 7 - i;
                  return (
                    <div 
                      key={num}
                      onClick={() => {
                        handleSelectObject({
                          type: 'shelf',
                          id: `shelf_${selectedEntity?.code || 'T47'}_${num}`,
                          code: `T${num}`,
                          name: `Tablette ${num}`,
                          shelfNumber: num,
                          bayCode: selectedEntity?.code || 'T47',
                          data: {}
                        });
                      }}
                      className="p-2 bg-[#121927] hover:bg-[#182338] border border-slate-800 rounded-xl flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">Niveau {num}</span>
                        <span className="text-[10px] text-slate-400">
                          {num % 2 === 0 ? 'Sinistres Matériels' : 'Sinistres Corporels'}
                        </span>
                      </div>
                      <span className="font-black text-emerald-400 text-[11px]">
                        {num === 7 ? '3/5 btes' : '5/5 btes'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 3: BOXES LIST */}
            {sidePanelTab === 'boxes' && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {Array.from({ length: 10 }).map((_, i) => {
                  const bCode = `B${(i + 21).toString().padStart(3, '0')}`;
                  return (
                    <div 
                      key={bCode}
                      onClick={() => {
                        handleSelectObject({
                          type: 'box',
                          id: `box_${bCode}`,
                          code: bCode,
                          name: `Boîte ${bCode}`,
                          boxNumber: bCode,
                          bayCode: selectedEntity?.code || 'T47',
                          shelfNumber: Math.floor(i / 2) + 1,
                          data: { archiveType: i % 2 === 0 ? 'Sinistres Matériels' : 'Sinistres Corporels', folderCount: 16 + i }
                        });
                      }}
                      className="p-2 bg-[#121927] hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-500/50 rounded-xl flex items-center justify-between cursor-pointer transition-all text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Box size={13} className="text-emerald-400" />
                        <span className="font-bold text-white">{bCode}</span>
                        <span className="text-[10px] text-slate-400 truncate max-w-[100px]">
                          {i % 2 === 0 ? 'Sinistres Mat.' : 'Sinistres Corp.'}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-300">Pos {(i % 5) + 1}</span>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* Bottom Actions */}
          <div className="pt-4 border-t border-slate-800/80 space-y-2">
            <button
              onClick={handleExportExcel}
              className="w-full py-2.5 px-3 bg-[#132035] hover:bg-[#182a45] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-700/80 cursor-pointer shadow-md"
            >
              <FileSpreadsheet size={15} className="text-emerald-400" />
              <span>Exporter Rapport Dépôt (Excel)</span>
            </button>
            <button
              onClick={onRefresh}
              className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>Synchroniser Jumeau Numérique</span>
            </button>
          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 5. CUSTOM DEPOT BUILDER MODAL ("Créer tout seul mon dépôt")               */}
      {/* ========================================================================= */}
      {isBuilderOpen && (
        <CustomDepotBuilderModal
          onClose={() => setIsBuilderOpen(false)}
          onSuccess={() => {
            setIsBuilderOpen(false);
            if (onRefresh) onRefresh();
          }}
        />
      )}

    </div>
  );
};
