import React, { useState } from 'react';
import { 
  Building2, 
  Layers, 
  Plus, 
  Trash2, 
  Save, 
  X, 
  Sparkles, 
  Sliders, 
  CheckCircle, 
  Box, 
  DoorOpen, 
  Flame, 
  Maximize2 
} from 'lucide-react';
import { api } from '../../lib/api';

interface CustomDepotBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingRooms: any[];
}

export const CustomDepotBuilderModal: React.FC<CustomDepotBuilderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingRooms
}) => {
  const [step, setStep] = useState<'room' | 'bays' | 'equipment'>('room');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [roomName, setRoomName] = useState('Nouvelle Salle d\'Archives');
  const [roomCode, setRoomCode] = useState(`SALLE-${existingRooms.length + 1}`);
  const [building, setBuilding] = useState('Bâtiment Central Archives');
  const [description, setDescription] = useState('Espace de stockage haute densité et sécurité');
  
  // Dimensions & Grid
  const [roomWidth, setRoomWidth] = useState(18); // meters
  const [roomLength, setRoomLength] = useState(12); // meters
  const [bayCount, setBayCount] = useState(12);
  const [shelvesPerBay, setShelvesPerBay] = useState(7);
  const [boxCapacityPerShelf, setBoxCapacityPerShelf] = useState(5);
  const [prefixBay, setPrefixBay] = useState('T');
  const [startingBayNum, setStartingBayNum] = useState(1);

  // Equipments to generate
  const [addDoors, setAddDoors] = useState(true);
  const [addExtinguishers, setAddExtinguishers] = useState(true);
  const [addVentilation, setAddVentilation] = useState(true);
  const [addQuarantineZone, setAddQuarantineZone] = useState(true);

  if (!isOpen) return null;

  const totalCalculatedCapacity = bayCount * shelvesPerBay * boxCapacityPerShelf;
  const totalCalculatedMl = Math.round(totalCalculatedCapacity * 0.1714 * 100) / 100;

  const handleCreateDepot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Create the Room
      const roomPayload = {
        name: roomName,
        code: roomCode,
        building,
        description,
        autoGenerateBays: true,
        bayCount: Number(bayCount),
        shelfCount: Number(shelvesPerBay),
        shelfCapacity: Number(boxCapacityPerShelf),
        prefix: prefixBay,
        startNumber: Number(startingBayNum),
        dimensions: {
          width: roomWidth,
          length: roomLength
        },
        equipments: {
          doors: addDoors ? 2 : 1,
          extinguishers: addExtinguishers ? 2 : 0,
          ventilation: addVentilation,
          quarantineZone: addQuarantineZone
        }
      };

      const res = await api.post('/api/storage/rooms', roomPayload);
      
      // Notify parent & trigger custom update
      try {
        window.dispatchEvent(new CustomEvent('storage-depot-updated'));
      } catch (e) {}

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Erreur lors de la création personnalisée du dépôt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 text-slate-100 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                Créateur de Dépôt d'Archives Sur-Mesure
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Autonome
                </span>
              </h2>
              <p className="text-xs text-slate-400">Configurez et générez votre propre salle, travées, tablettes et zones de circulation géoréférencées</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreateDepot} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Stepper / Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setStep('room')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                step === 'room' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              1. Identité & Bâtiment
            </button>
            <button
              type="button"
              onClick={() => setStep('bays')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                step === 'bays' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              2. Rayonnages & Tablettes
            </button>
            <button
              type="button"
              onClick={() => setStep('equipment')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                step === 'equipment' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              3. Équipements & Sécurité
            </button>
          </div>

          {/* STEP 1: ROOM IDENTITY */}
          {step === 'room' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Nom de la Salle</label>
                  <input
                    type="text"
                    required
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
                    placeholder="Ex: Salle des Archives Historiques"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Code Salle Unique (ID)</label>
                  <input
                    type="text"
                    required
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-mono text-emerald-400 focus:outline-none focus:border-emerald-500 font-bold"
                    placeholder="Ex: SALLE-03"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Bâtiment / Site</label>
                  <input
                    type="text"
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                    placeholder="Ex: Bâtiment Archives Nord"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Dimensions Sol (Largeur × Longueur en mètres)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="5"
                      max="100"
                      value={roomWidth}
                      onChange={(e) => setRoomWidth(Number(e.target.value))}
                      className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white text-center"
                      placeholder="Larg (m)"
                    />
                    <input
                      type="number"
                      min="5"
                      max="100"
                      value={roomLength}
                      onChange={(e) => setRoomLength(Number(e.target.value))}
                      className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white text-center"
                      placeholder="Long (m)"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Description & Observations de Conservation</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                  placeholder="Notes sur la climatisation, le contrôle hygrométrique, les accès autorisés..."
                />
              </div>
            </div>
          )}

          {/* STEP 2: BAYS & SHELVES */}
          {step === 'bays' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Nombre de Travées</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={bayCount}
                    onChange={(e) => setBayCount(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Tablettes par Travée</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={shelvesPerBay}
                    onChange={(e) => setShelvesPerBay(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Capacité par Tablette (Boîtes)</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={boxCapacityPerShelf}
                    onChange={(e) => setBoxCapacityPerShelf(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold text-center focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Préfixe Code Travée</label>
                  <input
                    type="text"
                    value={prefixBay}
                    onChange={(e) => setPrefixBay(e.target.value.toUpperCase())}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono text-center font-bold"
                    placeholder="Ex: T ou B"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Numéro de Départ Travée</label>
                  <input
                    type="number"
                    min="1"
                    value={startingBayNum}
                    onChange={(e) => setStartingBayNum(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white text-center font-bold"
                  />
                </div>
              </div>

              {/* Real-time calculated simulation badge */}
              <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-300">Capacité Globale Automatiquement Calculée :</div>
                  <div className="text-xl font-black text-white mt-0.5">
                    {totalCalculatedCapacity} Boîtes <span className="text-sm font-semibold text-emerald-400">({totalCalculatedMl} mètres linéaires)</span>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-400 font-mono">
                  {bayCount} travées × {shelvesPerBay} tab. × {boxCapacityPerShelf} boîtes
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: EQUIPMENT & SPATIAL ENVIRONMENT */}
          {step === 'equipment' && (
            <div className="space-y-4 animate-in fade-in">
              <p className="text-xs text-slate-400">
                Sélectionnez les éléments physiques et équipements de sécurité à positionner automatiquement avec leurs coordonnées interactives X/Y :
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-3 p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={addDoors}
                    onChange={(e) => setAddDoors(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-600"
                  />
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400"><DoorOpen size={16} /></div>
                    <div>
                      <div className="text-xs font-bold text-white">Portes d'accès sécurisées</div>
                      <div className="text-[10px] text-slate-400">Portes coupe-feu avec contrôle badge</div>
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={addExtinguishers}
                    onChange={(e) => setAddExtinguishers(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-600"
                  />
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400"><Flame size={16} /></div>
                    <div>
                      <div className="text-xs font-bold text-white">Extincteurs CO2 / Eau</div>
                      <div className="text-[10px] text-slate-400">Conformité incendie et contrôles annuels</div>
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={addQuarantineZone}
                    onChange={(e) => setAddQuarantineZone(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-600"
                  />
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400"><Box size={16} /></div>
                    <div>
                      <div className="text-xs font-bold text-white">Zone de Quarantaine & Préparation</div>
                      <div className="text-[10px] text-slate-400">Espace de décontamination & tri entrant</div>
                    </div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3.5 bg-slate-800/80 rounded-2xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={addVentilation}
                    onChange={(e) => setAddVentilation(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-600"
                  />
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400"><Sparkles size={16} /></div>
                    <div>
                      <div className="text-xs font-bold text-white">Sol & Allées de Circulation</div>
                      <div className="text-[10px] text-slate-400">Allées normées pour chariots porte-boîtes</div>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Annuler
            </button>

            <div className="flex items-center gap-2">
              {step !== 'room' && (
                <button
                  type="button"
                  onClick={() => setStep(step === 'equipment' ? 'bays' : 'room')}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  Précédent
                </button>
              )}
              {step !== 'equipment' ? (
                <button
                  type="button"
                  onClick={() => setStep(step === 'room' ? 'bays' : 'equipment')}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition-all"
                >
                  Suivant
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-600/40 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <Save size={16} />
                  <span>{loading ? 'Génération du Dépôt...' : 'Générer Mon Dépôt Numérique'}</span>
                </button>
              )}
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
