'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  getCompleteUnits,
  getPieceShortages,
  getPieceStock,
  getMaximumTargetUnits,
  getSymmetricStock,
  formatSymmetricStock,
  hasNonNegativeBalances,
  sizeHasStock,
  type Laterality,
  type StockSide,
  type ManufacturingModel,
  type ModelPiece,
  type PieceMovement,
  type Size,
  type SizeGroup,
} from '@/lib/inventory-domain';
import { demoModels, demoMovements, demoPieces, demoSizes, demoSizeGroups } from '@/lib/demo-data';
import { isComponentFabricSlot, isComponentFabricSlotAvailableForModel, secondaryFabricSlotIndex } from '@/lib/component-fabric-slots';
import { isComponentColorSlot, isComponentColorSlotAvailableForModel, secondaryColorSlotIndex } from '@/lib/component-color-slots';
import { validateSizeSpecification } from '@/lib/material-size-specifications';
import { FabricModule, FABRIC_STORAGE_KEYS, emptyFabricBackupData, validateFabricBackupData, type FabricView, type ColorDefinition } from '@/app/fabric-module';
import { ProductionModule, PRODUCTION_STORAGE_KEYS, emptyProductionBackupData, validateProductionBackupData, type ProductionView } from '@/app/production-module';

type View = 'inventario' | 'modelos' | 'historial' | FabricView | ProductionView;
type StockFilter = 'Con stock' | 'Vacío' | 'Todos';
type SymmetricEntryMode = 'paridad' | 'lados';
type StockSlot = 'paridad' | StockSide;
type FabricSlot = string;
type ModelFormPiece = { id: string; name: string; unitsPerGarment: string; laterality: Laterality; fabricSlot: FabricSlot; colorSlot: string; colorId: string; colorOverride: boolean; fabricType: string; color: string };
type ModelFormState = { editingId: string | null; name: string; sizeGroupId: string; family: string; excludedSizeIds: string[]; secondaryFabricSlots: number; secondaryColorSlots: number; pieces: ModelFormPiece[] };

const STORAGE = {
  groups: 'telastock-size-groups-v1',
  sizes: 'telastock-sizes-v1',
  models: 'telastock-manufacturing-models-v1',
  pieces: 'telastock-model-pieces-v1',
  movements: 'telastock-piece-movements-v1',
  families: 'telastock-pattern-families-v1',
};
type PatternFamily = { value: string; label: string };
const DEFAULT_PATTERN_FAMILIES: PatternFamily[] = [
  { value: 'polo', label: 'Polo' },
  { value: 'buzo', label: 'Buzo' },
  { value: 'casaca', label: 'Casaca' },
  { value: 'otro', label: 'Otro' },
];
const normalizePatternFamilies = (input: unknown, fallback: PatternFamily[] = DEFAULT_PATTERN_FAMILIES): PatternFamily[] => {
  if (!Array.isArray(input)) return fallback.map((item) => ({ ...item }));
  const result: PatternFamily[] = [];
  const values = new Set<string>();
  const labels = new Set<string>();
  input.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const value = typeof row.value === 'string' ? row.value.trim() : '';
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    const normalizedLabel = label.toLocaleLowerCase('es');
    if (!value || !label || values.has(value) || labels.has(normalizedLabel)) return;
    values.add(value);
    labels.add(normalizedLabel);
    result.push({ value, label });
  });
  return result.length > 0 ? result : fallback.map((item) => ({ ...item }));
};
const migrateBaseModelFamilies = (
  models: ManufacturingModel[],
  products: Array<{ baseModelId?: string; family?: string }>,
  availableFamilies: PatternFamily[] = DEFAULT_PATTERN_FAMILIES,
) => {
  const validValues = new Set(availableFamilies.map((item) => item.value));
  const byBaseModel = new Map<string, Set<string>>();
  products.forEach((product) => {
    const family = typeof product.family === 'string' ? product.family.trim() : '';
    if (!product.baseModelId || !validValues.has(family)) return;
    const values = byBaseModel.get(product.baseModelId) ?? new Set<string>();
    values.add(family);
    byBaseModel.set(product.baseModelId, values);
  });
  return models.map((model) => {
    if (typeof model.family === 'string' && validValues.has(model.family)) return model;
    const inferred = [...(byBaseModel.get(model.id) ?? [])];
    return { ...model, family: inferred.length === 1 ? inferred[0] : '' };
  });
};
const nf = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const fmt = (value: number) => nf.format(value);
const newId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fabricSlotLabel = (slot: FabricSlot) => {
  if (slot === 'cualquiera') return 'Cualquier tela';
  if (slot === 'principal') return 'Tela principal 1';
  const index = secondaryFabricSlotIndex(slot);
  return index > 0 ? `Tela secundaria ${index}` : slot;
};
const fabricSlotOptions = (secondaryCount: number): FabricSlot[] =>
  ['cualquiera', 'principal', ...Array.from({ length: secondaryCount }, (_, index) => `secundaria_${index + 1}`)];
const colorSlotLabel = (slot: string) => {
  if (slot === 'ninguna') return 'Sin color';
  if (slot === 'cualquiera') return 'Cualquier color';
  if (slot === 'principal') return 'Color principal 1';
  const index = secondaryColorSlotIndex(slot);
  return index > 0 ? `Color secundario ${index}` : 'Posición de color inválida';
};
const colorSlotOptions = (secondaryCount: number) => [
  'ninguna', 'cualquiera', 'principal', ...Array.from({ length: secondaryCount }, (_, index) => `secundaria_${index + 1}`),
];
const isValidFabricSlot = (slot: string, secondaryCount: number) => isComponentFabricSlotAvailableForModel(slot, secondaryCount);
const isValidColorSlot = (slot: string, secondaryCount: number) => isComponentColorSlotAvailableForModel(slot, secondaryCount);
const secondarySlotCountForModel = (model: ManufacturingModel, modelPieces: ModelPiece[]) =>
  Math.max(model.secondaryFabricSlots ?? 0, ...modelPieces.filter((piece) => piece.modelId === model.id).map((piece) => secondaryFabricSlotIndex(piece.fabricSlot)), 0);
const secondaryColorSlotCountForModel = (model: ManufacturingModel, modelPieces: ModelPiece[]) =>
  Math.max(model.secondaryColorSlots ?? 0, ...modelPieces.filter((piece) => piece.modelId === model.id).map((piece) => secondaryColorSlotIndex(piece.colorSlot)), 0);
const normalizeModelsWithSlots = (models: ManufacturingModel[], modelPieces: ModelPiece[]) =>
  models.map((model) => ({ ...model, secondaryFabricSlots: secondarySlotCountForModel(model, modelPieces), secondaryColorSlots: secondaryColorSlotCountForModel(model, modelPieces) }));
const normalizeExcludedModelSizes = (models: ManufacturingModel[], masterSizes: Size[]) =>
  models.map((model) => ({
    ...model,
    excludedSizeIds: Array.isArray(model.excludedSizeIds)
      ? model.excludedSizeIds.filter((sizeId) => typeof sizeId === 'string' && masterSizes.some((size) => size.id === sizeId && size.groupId === model.sizeGroupId))
      : [],
  }));
const blankModelForm = (sizeGroupId: string, colorId = ''): ModelFormState => ({
  editingId: null,
  name: '',
  sizeGroupId,
  family: '',
  excludedSizeIds: [],
  secondaryFabricSlots: 0,
  secondaryColorSlots: 0,
  pieces: [{ id: '', name: 'Pecho', unitsPerGarment: '1', laterality: 'ninguna', fabricSlot: 'principal', colorSlot: 'principal', colorId, colorOverride: false, fabricType: 'Tela principal 1', color: '' }],
});

export default function Home() {
  const [view, setView] = useState<View>('inventario');
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[]>(demoSizeGroups);
  const [sizes, setSizes] = useState<Size[]>(demoSizes);
  const [models, setModels] = useState<ManufacturingModel[]>(demoModels);
  const [families, setFamilies] = useState<PatternFamily[]>(DEFAULT_PATTERN_FAMILIES);
  const [pieces, setPieces] = useState<ModelPiece[]>(demoPieces);
  const [fabricColors, setFabricColors] = useState<ColorDefinition[]>([]);
  const [movements, setMovements] = useState<PieceMovement[]>(demoMovements);
  const [ready, setReady] = useState(false);

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('Con stock');
  const [includeEmptySizes, setIncludeEmptySizes] = useState(false);
  const [expandedModels, setExpandedModels] = useState<string[]>(['model-polo']);
  const [showStockForm, setShowStockForm] = useState(false);
  const [stockOperation, setStockOperation] = useState<'entrada' | 'salida'>('entrada');
  const [selectedModelId, setSelectedModelId] = useState('model-polo');
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>([]);
  const [stockAmounts, setStockAmounts] = useState<Record<string, string>>({});
  const [stockEntryModes, setStockEntryModes] = useState<Record<string, SymmetricEntryMode>>({});
  const [stockNote, setStockNote] = useState('Ingreso de piezas');
  const [missingTarget, setMissingTarget] = useState<{ modelId: string; sizeId: string; targetUnits?: number } | null>(null);
  const [showModelForm, setShowModelForm] = useState(false);
  const [showSizeManager, setShowSizeManager] = useState(false);
  const [showFamilyManager, setShowFamilyManager] = useState(false);
  const [draftFamilies, setDraftFamilies] = useState<PatternFamily[]>([]);
  const [newFamilyLabel, setNewFamilyLabel] = useState('');
  const [draftSizeGroups, setDraftSizeGroups] = useState<SizeGroup[]>([]);
  const [draftSizes, setDraftSizes] = useState<Size[]>([]);
  const [expandedPatternIds, setExpandedPatternIds] = useState<string[]>([]);
  const [patternSearch, setPatternSearch] = useState('');
  const [patternFamilyFilter, setPatternFamilyFilter] = useState('Todas');
  const [patternGroupFilter, setPatternGroupFilter] = useState('Todos');
  const [patternSort, setPatternSort] = useState<'az' | 'za' | 'recent' | 'pieces'>('az');
  const [returnToModelFormAfterSizeManager, setReturnToModelFormAfterSizeManager] = useState(false);
  const [sizeManagerGroupId, setSizeManagerGroupId] = useState(demoSizeGroups[0].id);
  const [newSizeLabel, setNewSizeLabel] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [modelForm, setModelForm] = useState<ModelFormState>(() => blankModelForm(demoSizeGroups[0].id));
  const [notice, setNotice] = useState<{ message: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const quickBaseModelCreatedCallbackRef = useRef<((modelId: string) => void) | null>(null);

  // Cargar datos una sola vez. Las claves propias de este módulo no pisan el inventario
  // genérico anterior de TelaStock. En la etapa Supabase, estas entidades pasan al repositorio remoto.
  useEffect(() => {
    try {
      const load = <T,>(key: string, fallback: T): T => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) as T : fallback;
      };
      setSizeGroups(load(STORAGE.groups, demoSizeGroups));
      setSizes(load(STORAGE.sizes, demoSizes));
      const storedFamilies = normalizePatternFamilies(load<unknown>(STORAGE.families, DEFAULT_PATTERN_FAMILIES));
      setFamilies(storedFamilies);
      const storedModels = load<ManufacturingModel[]>(STORAGE.models, demoModels);
      const legacyProductModels = load<Array<{ baseModelId?: string; family?: string }>>(PRODUCTION_STORAGE_KEYS.productModels, []);
      // A base pattern stores reusable textile/color positions, never concrete assignments.
      // Old demo/legacy color names are intentionally not promoted into the shared color catalog.
      const storedColors = load<ColorDefinition[]>(FABRIC_STORAGE_KEYS.colores, []);
      const storedPieces = load<ModelPiece[]>(STORAGE.pieces, demoPieces);
      setFabricColors(storedColors);
      const migratedPieces = storedPieces.map((piece) => ({
        ...piece,
        fabricType: fabricSlotLabel(piece.fabricSlot ?? 'principal'),
        fabricSlot: piece.fabricSlot ?? 'principal',
        color: 'Sin especificar',
        // Preserve the old position (e.g. principal 1) while removing the actual legacy color.
        colorSlot: piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna'),
        colorId: null,
        colorOverride: false,
      }));
      setPieces(migratedPieces);
      const migratedModels = normalizeExcludedModelSizes(normalizeModelsWithSlots(migrateBaseModelFamilies(storedModels, legacyProductModels, storedFamilies), migratedPieces), load<Size[]>(STORAGE.sizes, demoSizes));
      setModels(migratedModels);
      if (migratedModels.some((model) => !model.family)) setNotice({ message: 'Hay patrones base sin familia asignada. Edítalos en Modelos para que los modelos configurados hereden la familia correcta.', kind: 'info' });
      setMovements(load(STORAGE.movements, demoMovements));
    } catch {
      setNotice({ message: 'No se pudo leer el almacenamiento del navegador. Se muestran los datos de demostración.', kind: 'info' });
    }
    setReady(true);
    const refreshFabricColors = () => {
      try {
        const raw = localStorage.getItem(FABRIC_STORAGE_KEYS.colores);
        setFabricColors(raw ? JSON.parse(raw) as ColorDefinition[] : []);
      } catch { /* Keep the last valid palette visible if a local color record is being edited. */ }
    };
    window.addEventListener('telastock-fabric-data-updated', refreshFabricColors);
    window.addEventListener('telastock-fabric-data-restored', refreshFabricColors);
    return () => {
      window.removeEventListener('telastock-fabric-data-updated', refreshFabricColors);
      window.removeEventListener('telastock-fabric-data-restored', refreshFabricColors);
    };
  }, []);

  // Persistencia provisional local para el MVP visual. Nunca se presenta como sincronizada.
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.groups, JSON.stringify(sizeGroups)); }, [sizeGroups, ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.sizes, JSON.stringify(sizes)); }, [sizes, ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.models, JSON.stringify(models)); }, [models, ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.families, JSON.stringify(families)); }, [families, ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.pieces, JSON.stringify(pieces)); }, [pieces, ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.movements, JSON.stringify(movements)); }, [movements, ready]);

  const groupById = useMemo(() => new Map(sizeGroups.map((group) => [group.id, group])), [sizeGroups]);
  const fabricColorById = useMemo(() => new Map(fabricColors.map((color) => [color.id, color])), [fabricColors]);
  const modelPieces = (modelId: string) => pieces.filter((piece) => piece.modelId === modelId && !piece.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const groupSizes = (groupId: string) => sizes.filter((size) => size.groupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder);
  const managerGroupSizes = (groupId: string) => draftSizes.filter((size) => size.groupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder);
  const selectedManagerGroup = draftSizeGroups.find((group) => group.id === sizeManagerGroupId);
  const hasPendingSizeManagerChanges = JSON.stringify(draftSizeGroups) !== JSON.stringify(sizeGroups) || JSON.stringify(draftSizes) !== JSON.stringify(sizes);
  const hasPendingFamilyChanges = JSON.stringify(draftFamilies) !== JSON.stringify(families);
  const modelSizes = (model: ManufacturingModel) => {
    const excluded = new Set(model.excludedSizeIds ?? []);
    return groupSizes(model.sizeGroupId).filter((size) => !excluded.has(size.id));
  };
  const stockForPiece = (pieceId: string, sizeId: string) => getPieceStock(movements, pieceId, sizeId);
  const hasStockForSize = (model: ManufacturingModel, sizeId: string) => sizeHasStock(modelPieces(model.id), movements, sizeId);
  const modelHasAnyStock = (model: ManufacturingModel) => modelSizes(model).some((size) => hasStockForSize(model, size.id));
  const completeForSize = (model: ManufacturingModel, sizeId: string) => getCompleteUnits(modelPieces(model.id), movements, sizeId);
  const totalCurrentPieceStock = models.reduce((sum, model) => sum + modelPieces(model.id).reduce((pieceSum, piece) => pieceSum + modelSizes(model).reduce((sizeSum, size) => sizeSum + Math.max(0, getPieceStock(movements, piece.id, size.id)), 0), 0), 0);
  const modelCountWithStock = models.filter(modelHasAnyStock).length;
  const completeUnitsAll = models.reduce((grandTotal, model) => grandTotal + modelSizes(model).reduce((subtotal, size) => subtotal + completeForSize(model, size.id), 0), 0);

  const filteredModels = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('es');
    return models.filter((model) => {
      const groupName = groupById.get(model.sizeGroupId)?.name ?? '';
      const matchesSearch = !normalized || `${model.name} ${groupName} ${model.id}`.toLocaleLowerCase('es').includes(normalized);
      // El estado Vacío significa que ninguna pieza de ninguna talla tiene saldo disponible.
      const hasStock = modelSizes(model).some((size) => sizeHasStock(pieces.filter((piece) => piece.modelId === model.id), movements, size.id));
      const matchesState = stockFilter === 'Todos' || (stockFilter === 'Con stock' ? hasStock : !hasStock);
      return matchesSearch && matchesState;
    });
  // `modelSizes` is a stable helper over the current sizes array; include its underlying data.
  }, [models, search, stockFilter, groupById, sizes, pieces, movements]);

  const patternSearchNormalized = patternSearch.trim().toLocaleLowerCase('es');
  const filteredPatterns = models.filter((model) => {
    const family = model.family ?? '';
    const pieceNames = modelPieces(model.id).map((piece) => piece.name).join(' ');
    const groupName = groupById.get(model.sizeGroupId)?.name ?? '';
    const matchesSearch = !patternSearchNormalized || `${model.name} ${pieceNames} ${groupName}`.toLocaleLowerCase('es').includes(patternSearchNormalized);
    const matchesFamily = patternFamilyFilter === 'Todas' || family === patternFamilyFilter;
    const matchesGroup = patternGroupFilter === 'Todos' || model.sizeGroupId === patternGroupFilter;
    return matchesSearch && matchesFamily && matchesGroup;
  }).slice().sort((a, b) => {
    if (patternSort === 'za') return b.name.localeCompare(a.name, 'es', { sensitivity: 'base' });
    if (patternSort === 'recent') return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    if (patternSort === 'pieces') return modelPieces(b.id).length - modelPieces(a.id).length || a.name.localeCompare(b.name, 'es');
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
  const togglePatternExpanded = (modelId: string) => setExpandedPatternIds((current) => current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId]);
  const allPatternIdsExpanded = filteredPatterns.length > 0 && filteredPatterns.every((model) => expandedPatternIds.includes(model.id));
  const currentStockModel = models.find((model) => model.id === selectedModelId) ?? models[0];
  const currentModelPieces = currentStockModel ? modelPieces(currentStockModel.id) : [];
  const currentModelSizes = currentStockModel ? modelSizes(currentStockModel) : [];
  const readAmount = (sizeId: string, pieceId: string, slot?: StockSlot) => {
    const key = slot ? `${sizeId}::${pieceId}::${slot}` : `${sizeId}::${pieceId}`;
    const raw = stockAmounts[key];
    return raw === undefined || raw.trim() === '' ? 0 : Number(raw);
  };
  const safeAmountForSummary = (value: number) => Number.isInteger(value) && value > 0 ? value : 0;
  const selectedStockTotal = selectedSizeIds.reduce((total, sizeId) => total + currentModelPieces.reduce((pieceTotal, piece) => {
    if (piece.laterality === 'simetrica') {
      const mode = stockEntryModes[piece.id] ?? 'paridad';
      return pieceTotal + (mode === 'paridad'
        ? 2 * safeAmountForSummary(readAmount(sizeId, piece.id, 'paridad'))
        : safeAmountForSummary(readAmount(sizeId, piece.id, 'izquierda')) + safeAmountForSummary(readAmount(sizeId, piece.id, 'derecha')));
    }
    return pieceTotal + safeAmountForSummary(readAmount(sizeId, piece.id));
  }, 0), 0);

  const displayPieceStock = (piece: ModelPiece, sizeId: string, compact = false) => {
    if (piece.laterality !== 'simetrica') return fmt(Math.max(0, stockForPiece(piece.id, sizeId)));
    return formatSymmetricStock(getSymmetricStock(movements, piece.id, sizeId), compact);
  };

  const displayUnassignedNote = (piece: ModelPiece, sizeId: string) => {
    if (piece.laterality !== 'simetrica') return '';
    const unassigned = getSymmetricStock(movements, piece.id, sizeId).unassigned;
    return unassigned > 0 ? `${fmt(unassigned)} pieza(s) histórica(s) sin lado` : '';
  };

  function setNoticeMessage(message: string, kind: 'success' | 'error' | 'info' = 'success') {
    setNotice({ message, kind });
  }

  function toggleModel(modelId: string) {
    setExpandedModels((prev) => prev.includes(modelId) ? prev.filter((id) => id !== modelId) : [...prev, modelId]);
  }

  function openStockForm(operation: 'entrada' | 'salida' = 'entrada', modelId?: string) {
    setStockOperation(operation);
    if (models.length === 0) {
      setNoticeMessage('Primero registra un modelo de fabricación.', 'info');
      setView('modelos');
      return;
    }
    setSelectedModelId(modelId ?? models[0].id);
    setSelectedSizeIds([]);
    setStockAmounts({});
    setStockEntryModes({});
    setStockNote(operation === 'entrada' ? 'Ingreso de piezas' : 'Merma / corrección de stock');
    setShowStockForm(true);
  }

  function updateSelectedModel(modelId: string) {
    setSelectedModelId(modelId);
    setSelectedSizeIds([]);
    setStockAmounts({});
    setStockEntryModes({});
  }

  function toggleSelectedSize(sizeId: string) {
    setSelectedSizeIds((prev) => prev.includes(sizeId) ? prev.filter((id) => id !== sizeId) : [...prev, sizeId]);
  }

  function selectAllSizes() {
    if (selectedSizeIds.length === currentModelSizes.length) setSelectedSizeIds([]);
    else setSelectedSizeIds(currentModelSizes.map((size) => size.id));
  }

  function updateStockAmount(sizeId: string, pieceId: string, slot: StockSlot | undefined, nextValue: string) {
    const key = slot ? `${sizeId}::${pieceId}::${slot}` : `${sizeId}::${pieceId}`;
    setStockAmounts((previous) => ({ ...previous, [key]: nextValue }));
  }

  function bumpStockAmount(sizeId: string, pieceId: string, slot: StockSlot | undefined, amount: number) {
    const key = slot ? `${sizeId}::${pieceId}::${slot}` : `${sizeId}::${pieceId}`;
    setStockAmounts((previous) => ({ ...previous, [key]: String(Math.max(0, (Number(previous[key]) || 0) + amount)) }));
  }

  function changeSymmetricEntryMode(pieceId: string, mode: SymmetricEntryMode) {
    setStockEntryModes((previous) => ({ ...previous, [pieceId]: mode }));
    // Clear the hidden controls so switching modes cannot accidentally register both.
    setStockAmounts((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => key.split('::')[1] !== pieceId)));
  }

  function assignLegacyUnitToSide(piece: ModelPiece, sizeId: string, side: StockSide) {
    const symmetric = getSymmetricStock(movements, piece.id, sizeId);
    if (piece.laterality !== 'simetrica' || symmetric.unassigned <= 0) return;
    const date = new Date().toISOString();
    const note = `Reclasificación de pieza histórica al lado ${side === 'izquierda' ? 'izquierdo' : 'derecho'}`;
    // Neutral legacy stock decreases by one while the selected side increases by one.
    // The net physical quantity stays unchanged; only the side assignment becomes explicit.
    setMovements((previous) => [
      { id: newId(), pieceId: piece.id, sizeId, delta: 1, side, kind: 'ajuste', note, date },
      { id: newId(), pieceId: piece.id, sizeId, delta: -1, kind: 'ajuste', note: 'Reclasificación de una unidad sin lado identificado', date },
      ...previous,
    ]);
    setNoticeMessage(`Se asignó una pieza histórica de ${piece.name} al lado ${side === 'izquierda' ? 'izquierdo' : 'derecho'} sin alterar el stock físico total.`);
  }

  function validateQuantity(value: number, pieceName: string, sizeId: string, sideLabel?: string): boolean {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      setNoticeMessage(`La cantidad de ${pieceName}${sideLabel ? ` (${sideLabel})` : ''} debe ser un entero igual o mayor que cero.`, 'error');
      return false;
    }
    if (stockOperation === 'salida' && value > 0) {
      const piece = currentModelPieces.find((item) => item.name === pieceName);
      if (piece) {
        const available = piece.laterality === 'simetrica' && sideLabel
          ? getSymmetricStock(movements, piece.id, sizeId)[sideLabel === 'izquierda' ? 'left' : 'right']
          : stockForPiece(piece.id, sizeId);
        if (value > available) {
          const sizeLabel = sizes.find((item) => item.id === sizeId)?.label ?? '—';
          setNoticeMessage(`No puedes retirar ${value} de ${piece.name}${sideLabel ? ` (${sideLabel})` : ''}, talla ${sizeLabel}: solo hay ${fmt(available)} disponible.`, 'error');
          return false;
        }
      }
    }
    return true;
  }

  function renderQuantityControl(sizeId: string, piece: ModelPiece, slot: StockSlot | undefined, label: string) {
    const key = slot ? `${sizeId}::${piece.id}::${slot}` : `${sizeId}::${piece.id}`;
    return <span className="quantity-control"><button type="button" aria-label={`Restar una unidad de ${label} en ${piece.name}`} onClick={() => bumpStockAmount(sizeId, piece.id, slot, -1)}>−</button><input inputMode="numeric" type="number" min="0" step="1" value={stockAmounts[key] ?? ''} placeholder="0" onChange={(event) => updateStockAmount(sizeId, piece.id, slot, event.target.value)} aria-label={`${stockOperation === 'entrada' ? 'Cantidad a ingresar' : 'Cantidad a retirar'}: ${label} de ${piece.name}, talla ${sizes.find((item) => item.id === sizeId)?.label ?? '—'}`} /><button type="button" aria-label={`Agregar una unidad de ${label} en ${piece.name}`} onClick={() => bumpStockAmount(sizeId, piece.id, slot, 1)}>＋</button></span>;
  }

  // Symmetric molds use pairs by default. Each parity writes one left and one right movement.
  function reservedBasePieceQuantity(pieceId: string, sizeId: string, side: StockSide | null): number {
    try {
      const raw = localStorage.getItem('telastock-production-orders-v1');
      const orders = raw ? JSON.parse(raw) as Array<{ status?: string; basePieces?: Array<{ pieceId?: string; sizeId?: string; side?: StockSide | null; quantity?: number }> }> : [];
      if (!Array.isArray(orders)) return 0;
      return orders.filter((order) => order.status === 'reservada' || order.status === 'en_proceso').reduce((sum, order) =>
        sum + (Array.isArray(order.basePieces) ? order.basePieces.filter((line) =>
          line.pieceId === pieceId && line.sizeId === sizeId && (line.side ?? null) === side
        ).reduce((total, line) => total + (Number(line.quantity) || 0), 0) : 0), 0);
    } catch { return 0; }
  }

  function productionOrdersSnapshot(): Array<{
    status?: string;
    baseModelId?: string;
    quantities?: Record<string, number>;
    materials?: Array<{ sizeId?: string | null }>;
    basePieces?: Array<{ pieceId?: string; sizeId?: string }>;
    componentPieces?: Array<{ pieceId?: string; sizeId?: string }>;
  }> | null {
    try {
      const raw = localStorage.getItem('telastock-production-orders-v1');
      if (!raw) return [];
      const orders = JSON.parse(raw) as unknown;
      return Array.isArray(orders) ? orders as Array<{
        status?: string; baseModelId?: string; quantities?: Record<string, number>;
        materials?: Array<{ sizeId?: string | null }>;
        basePieces?: Array<{ pieceId?: string; sizeId?: string }>;
        componentPieces?: Array<{ pieceId?: string; sizeId?: string }>;
      }> : null;
    } catch { return null; }
  }

  function addStock(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!currentStockModel || selectedSizeIds.length === 0) {
      setNoticeMessage('Selecciona al menos una talla para continuar.', 'error');
      return;
    }
    const newMovements: PieceMovement[] = [];
    const note = stockNote.trim() || (stockOperation === 'entrada' ? 'Ingreso de piezas' : 'Merma / corrección de stock');
    const date = new Date().toISOString();
    const signed = (quantity: number) => stockOperation === 'entrada' ? quantity : -quantity;
    const pushMovement = (piece: ModelPiece, sizeId: string, quantity: number, side?: StockSide) => {
      if (quantity <= 0) return;
      newMovements.push({ id: newId(), pieceId: piece.id, sizeId, delta: signed(quantity), kind: stockOperation, ...(side ? { side } : {}), note, date });
    };

    for (const sizeId of selectedSizeIds) {
      for (const piece of currentModelPieces) {
        if (piece.laterality === 'simetrica') {
          const mode = stockEntryModes[piece.id] ?? 'paridad';
          const current = getSymmetricStock(movements, piece.id, sizeId);
          if (mode === 'paridad') {
            const quantity = readAmount(sizeId, piece.id, 'paridad');
            if (!validateQuantity(quantity, piece.name, sizeId)) return;
            if (stockOperation === 'salida' && quantity > 0 && (quantity > current.left - reservedBasePieceQuantity(piece.id, sizeId, 'izquierda') || quantity > current.right - reservedBasePieceQuantity(piece.id, sizeId, 'derecha'))) {
              setNoticeMessage(`No puedes retirar ${fmt(quantity)} paridades de ${piece.name}, talla ${sizes.find((item) => item.id === sizeId)?.label ?? '—'}: hay ${fmt(current.left)} izquierda y ${fmt(current.right)} derecha.`, 'error');
              return;
            }
            pushMovement(piece, sizeId, quantity, 'izquierda');
            pushMovement(piece, sizeId, quantity, 'derecha');
          } else {
            const leftQuantity = readAmount(sizeId, piece.id, 'izquierda');
            const rightQuantity = readAmount(sizeId, piece.id, 'derecha');
            if (!validateQuantity(leftQuantity, piece.name, sizeId, 'izquierda') || !validateQuantity(rightQuantity, piece.name, sizeId, 'derecha')) return;
            if (stockOperation === 'salida' && leftQuantity > current.left - reservedBasePieceQuantity(piece.id, sizeId, 'izquierda')) {
              setNoticeMessage(`No puedes retirar ${fmt(leftQuantity)} piezas del lado izquierdo de ${piece.name}: solo hay ${fmt(current.left)}.`, 'error'); return;
            }
            if (stockOperation === 'salida' && rightQuantity > current.right - reservedBasePieceQuantity(piece.id, sizeId, 'derecha')) {
              setNoticeMessage(`No puedes retirar ${fmt(rightQuantity)} piezas del lado derecho de ${piece.name}: solo hay ${fmt(current.right)}.`, 'error'); return;
            }
            pushMovement(piece, sizeId, leftQuantity, 'izquierda');
            pushMovement(piece, sizeId, rightQuantity, 'derecha');
          }
          continue;
        }

        const quantity = readAmount(sizeId, piece.id);
        if (!validateQuantity(quantity, piece.name, sizeId)) return;
        if (stockOperation === 'salida' && quantity > stockForPiece(piece.id, sizeId) - reservedBasePieceQuantity(piece.id, sizeId, null)) {
          setNoticeMessage(`No puedes retirar ${quantity} de ${piece.name} talla ${sizes.find((size) => size.id === sizeId)?.label}: solo hay ${stockForPiece(piece.id, sizeId)}.`, 'error');
          return;
        }
        pushMovement(piece, sizeId, quantity);
      }
    }
    if (newMovements.length === 0) {
      setNoticeMessage('Ingresa una cantidad mayor que cero en al menos un molde o lado.', 'error');
      return;
    }
    setMovements((previous) => [...newMovements, ...previous]);
    setShowStockForm(false);
    setView('inventario');
    setExpandedModels((previous) => previous.includes(currentStockModel.id) ? previous : [currentStockModel.id, ...previous]);
    const quantityTotal = newMovements.reduce((sum, movement) => sum + Math.abs(movement.delta), 0);
    setNoticeMessage(stockOperation === 'entrada' ? `Stock registrado: ${fmt(quantityTotal)} piezas físicas ingresadas en ${selectedSizeIds.length} talla(s).` : `Stock retirado: ${fmt(quantityTotal)} piezas físicas. El historial conserva el lado y el motivo indicado.`);
  }

  function openCreateModel(onCreated?: (modelId: string) => void) {
    quickBaseModelCreatedCallbackRef.current = onCreated ?? null;
    setModelForm(blankModelForm(sizeGroups[0]?.id ?? ''));
    setShowModelForm(true);
  }

  function closeModelForm() {
    setShowModelForm(false);
    quickBaseModelCreatedCallbackRef.current = null;
  }

  function openEditModel(model: ManufacturingModel) {
    setModelForm({
      editingId: model.id,
      name: model.name,
      sizeGroupId: model.sizeGroupId,
      family: model.family ?? '',
      excludedSizeIds: (model.excludedSizeIds ?? []).filter((sizeId) => sizes.some((size) => size.id === sizeId && size.groupId === model.sizeGroupId)),
      secondaryFabricSlots: secondarySlotCountForModel(model, pieces),
      secondaryColorSlots: secondaryColorSlotCountForModel(model, pieces),
      pieces: modelPieces(model.id).map((piece) => ({ id: piece.id, name: piece.name, unitsPerGarment: String(piece.unitsPerGarment), laterality: piece.laterality, fabricSlot: piece.fabricSlot ?? 'principal', colorSlot: piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna'), colorId: '', colorOverride: false, fabricType: fabricSlotLabel(piece.fabricSlot ?? 'principal'), color: 'Sin especificar' })),
    });
    setShowModelForm(true);
  }

  // Important for future edits: a mold with movement history is archived, never hard-deleted.
  // Archived molds are excluded from the current pattern calculation but remain available to history.
  function saveModel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanName = modelForm.name.trim();
    const cleanPieces = modelForm.pieces.map((piece) => ({ ...piece, name: piece.name.trim(), fabricType: fabricSlotLabel(piece.fabricSlot), color: 'Sin especificar', colorId: '', colorOverride: false, units: Number(piece.unitsPerGarment) }));
    if (!cleanName) { setNoticeMessage('Escribe el nombre del modelo.', 'error'); return; }
    if (!modelForm.sizeGroupId) { setNoticeMessage('Selecciona un grupo de tallas.', 'error'); return; }
    if (!families.some((family) => family.value === modelForm.family)) { setNoticeMessage('Selecciona la familia del patrón base.', 'error'); return; }
    if (groupSizes(modelForm.sizeGroupId).every((size) => modelForm.excludedSizeIds.includes(size.id))) { setNoticeMessage('Activa al menos una talla para este patrón.', 'error'); return; }
    if (cleanPieces.length === 0 || cleanPieces.some((piece) => !piece.name || !Number.isInteger(piece.units) || piece.units < 1 || !isValidFabricSlot(piece.fabricSlot, modelForm.secondaryFabricSlots) || !isValidColorSlot(piece.colorSlot, modelForm.secondaryColorSlots))) {
      setNoticeMessage('Cada molde debe tener nombre y una cantidad requerida entera mayor que cero.', 'error'); return;
    }
    if (cleanPieces.some((piece) => piece.laterality === 'simetrica' && piece.units % 2 !== 0)) {
      setNoticeMessage('Las piezas simétricas requieren una cantidad par por prenda (izquierda + derecha). Ejemplo: 2 = 1 por lado.', 'error'); return;
    }
    if (new Set(cleanPieces.map((piece) => piece.name.toLocaleLowerCase('es'))).size !== cleanPieces.length) {
      setNoticeMessage('Cada molde del mismo modelo debe tener un nombre distinto.', 'error'); return;
    }
    const duplicateName = models.some((model) => model.id !== modelForm.editingId && model.name.trim().toLocaleLowerCase('es') === cleanName.toLocaleLowerCase('es') && model.sizeGroupId === modelForm.sizeGroupId);
    if (duplicateName) { setNoticeMessage('Ya existe un modelo con ese nombre en el mismo grupo de tallas.', 'error'); return; }

    const productionOrders = productionOrdersSnapshot();
    if (!productionOrders) { setNoticeMessage('No se pudo verificar las órdenes de producción guardadas. Exporta un respaldo válido antes de modificar moldes.', 'error'); return; }
    const orderPieceIds = new Set(productionOrders.flatMap((order) => Array.isArray(order.basePieces) ? order.basePieces.map((line) => line.pieceId ?? '').filter(Boolean) : []));
    const previousPieces = modelForm.editingId ? modelPieces(modelForm.editingId) : [];
    const removedPieces = previousPieces.filter((oldPiece) => !cleanPieces.some((formPiece) => formPiece.id === oldPiece.id));
    // Preserve molds referenced by either the movement ledger or a production order snapshot.
    const archivedRemovedIds = new Set(removedPieces.filter((piece) =>
      movements.some((movement) => movement.pieceId === piece.id) || orderPieceIds.has(piece.id)
    ).map((piece) => piece.id));
    if (modelForm.editingId) {
      const original = models.find((model) => model.id === modelForm.editingId);
      const hasMovementHistory = previousPieces.some((piece) => movements.some((movement) => movement.pieceId === piece.id));
      const hasOrderHistory = productionOrders.some((order) => order.baseModelId === modelForm.editingId);
      if (original && original.sizeGroupId !== modelForm.sizeGroupId && (hasMovementHistory || hasOrderHistory)) {
        setNoticeMessage('No se puede cambiar el grupo de tallas después de registrar movimientos u órdenes. Crea un nuevo modelo para conservar la trazabilidad.', 'error'); return;
      }
    }

    const modelId = modelForm.editingId ?? newId();
    const validExcludedSizeIds = groupSizes(modelForm.sizeGroupId).filter((size) => modelForm.excludedSizeIds.includes(size.id)).map((size) => size.id);
    const savedModel: ManufacturingModel = { id: modelId, name: cleanName, sizeGroupId: modelForm.sizeGroupId, family: modelForm.family, excludedSizeIds: validExcludedSizeIds, secondaryFabricSlots: modelForm.secondaryFabricSlots, secondaryColorSlots: modelForm.secondaryColorSlots, updatedAt: new Date().toISOString() };
    const savedPieces: ModelPiece[] = cleanPieces.map((formPiece, index) => ({
      id: formPiece.id || newId(), modelId, name: formPiece.name, unitsPerGarment: formPiece.units,
      laterality: formPiece.laterality, fabricSlot: formPiece.fabricSlot, colorSlot: formPiece.colorSlot, colorId: null,
      fabricType: fabricSlotLabel(formPiece.fabricSlot), color: 'Sin especificar', colorOverride: false, sortOrder: index + 1, archived: false,
    }));
    setModels((previous) => modelForm.editingId ? previous.map((model) => model.id === modelId ? savedModel : model) : [...previous, savedModel]);
    setPieces((previous) => [...previous.filter((piece) => piece.modelId !== modelId || piece.archived || archivedRemovedIds.has(piece.id)).map((piece) => archivedRemovedIds.has(piece.id) ? { ...piece, archived: true } : piece), ...savedPieces]);
    setShowModelForm(false);
    const onQuickCreated = !modelForm.editingId ? quickBaseModelCreatedCallbackRef.current : null;
    quickBaseModelCreatedCallbackRef.current = null;
    if (onQuickCreated) {
      onQuickCreated(modelId);
      setView('modelos-producto');
      setNoticeMessage('Patrón base creado y seleccionado en el modelo comercial.');
    } else {
      setView('modelos');
      setNoticeMessage(modelForm.editingId ? 'Patrón actualizado.' : 'Patrón y moldes registrados.');
    }
  }

  function moveMold(index: number, direction: -1 | 1) {
    setModelForm((previous) => {
      const next = [...previous.pieces];
      const destination = index + direction;
      if (destination < 0 || destination >= next.length) return previous;
      [next[index], next[destination]] = [next[destination], next[index]];
      return { ...previous, pieces: next };
    });
  }

  function familyUsage(value: string) {
    const savedPatternCount = models.filter((model) => model.family === value).length;
    const editingModel = showModelForm && modelForm.editingId ? models.find((model) => model.id === modelForm.editingId) : undefined;
    const newDraftUsesFamily = showModelForm && modelForm.family === value && (!editingModel || editingModel.family !== value) ? 1 : 0;
    const patternCount = savedPatternCount + newDraftUsesFamily;
    let recipeCount = 0;
    try {
      const raw = localStorage.getItem(PRODUCTION_STORAGE_KEYS.familyRecipes);
      const recipes = raw ? JSON.parse(raw) as Array<{ family?: string }> : [];
      recipeCount = Array.isArray(recipes) ? recipes.filter((recipe) => recipe.family === value).length : 0;
    } catch { recipeCount = 0; }
    return { patternCount, recipeCount, total: patternCount + recipeCount };
  }

  function openFamilyManager() {
    setDraftFamilies(families.map((family) => ({ ...family })));
    setNewFamilyLabel('');
    setShowFamilyManager(true);
  }

  function addDraftFamily() {
    const label = newFamilyLabel.trim();
    if (!label) { setNoticeMessage('Escribe el nombre de la nueva familia.', 'error'); return; }
    if (draftFamilies.some((family) => family.label.trim().toLocaleLowerCase('es') === label.toLocaleLowerCase('es'))) {
      setNoticeMessage('Ya existe una familia con ese nombre.', 'error'); return;
    }
    setDraftFamilies((previous) => [...previous, { value: `family-${newId()}`, label }]);
    setNewFamilyLabel('');
  }

  function removeDraftFamily(value: string) {
    const family = draftFamilies.find((item) => item.value === value);
    if (!family) return;
    const usage = familyUsage(value);
    if (usage.total > 0) {
      setNoticeMessage(`No se puede eliminar «${family.label}»: está en uso por ${usage.patternCount} patrones y ${usage.recipeCount} recetas. Reasigna esos registros primero.`, 'error');
      return;
    }
    setDraftFamilies((previous) => previous.filter((item) => item.value !== value));
  }

  function cancelFamilyManager() {
    setShowFamilyManager(false);
    setDraftFamilies([]);
    setNewFamilyLabel('');
  }

  function applyFamilyManager() {
    if (draftFamilies.length === 0) { setNoticeMessage('Debe existir al menos una familia.', 'error'); return; }
    if (draftFamilies.some((family) => !family.label.trim())) { setNoticeMessage('Todas las familias deben tener un nombre.', 'error'); return; }
    const labels = draftFamilies.map((family) => family.label.trim().toLocaleLowerCase('es'));
    if (new Set(labels).size !== labels.length) { setNoticeMessage('Hay nombres de familia duplicados.', 'error'); return; }
    const values = draftFamilies.map((family) => family.value);
    if (new Set(values).size !== values.length) { setNoticeMessage('Hay identificadores de familia duplicados.', 'error'); return; }
    const valueSet = new Set(values);
    const removedInUse = families.find((family) => !valueSet.has(family.value) && familyUsage(family.value).total > 0);
    if (removedInUse) { setNoticeMessage(`No se puede eliminar «${removedInUse.label}» porque todavía está asociada a patrones o recetas.`, 'error'); return; }
    const nextFamilies = draftFamilies.map((family) => ({ ...family, label: family.label.trim() }));
    setFamilies(nextFamilies);
    if (!nextFamilies.some((family) => family.value === patternFamilyFilter)) setPatternFamilyFilter('Todas');
    setShowFamilyManager(false);
    setDraftFamilies([]);
    setNewFamilyLabel('');
    setNoticeMessage('Catálogo de familias actualizado.');
  }

  function beginSizeManager(groupId: string, returnToModelForm: boolean) {
    setDraftSizeGroups(sizeGroups.map((group) => ({ ...group })));
    setDraftSizes(sizes.map((size) => ({ ...size })));
    setReturnToModelFormAfterSizeManager(returnToModelForm);
    setSizeManagerGroupId(groupId || sizeGroups[0]?.id || '');
    setNewSizeLabel('');
    setNewGroupName('');
    setShowSizeManager(true);
  }

  function addSize() {
    const label = newSizeLabel.trim();
    if (!label || !sizeManagerGroupId) return;
    if (draftSizes.some((size) => size.groupId === sizeManagerGroupId && size.label.trim().toLocaleLowerCase('es') === label.toLocaleLowerCase('es'))) {
      setNoticeMessage('Ya existe esa talla en el grupo seleccionado.', 'error'); return;
    }
    const sortOrder = Math.max(0, ...managerGroupSizes(sizeManagerGroupId).map((size) => size.sortOrder)) + 1;
    setDraftSizes((previous) => [...previous, { id: newId(), groupId: sizeManagerGroupId, label, sortOrder }]);
    setNewSizeLabel('');
  }

  function reorderSize(sizeId: string, direction: -1 | 1) {
    const ordered = managerGroupSizes(sizeManagerGroupId);
    const index = ordered.findIndex((size) => size.id === sizeId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= ordered.length) return;
    const reordered = [...ordered];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    setDraftSizes((previous) => previous.map((size) => {
      const position = reordered.findIndex((item) => item.id === size.id);
      return position >= 0 ? { ...size, sortOrder: position + 1 } : size;
    }));
  }

  function deleteSize(size: Size) {
    const existsInSavedSizes = sizes.some((item) => item.id === size.id);
    if (existsInSavedSizes) {
      if (movements.some((movement) => movement.sizeId === size.id)) {
        setNoticeMessage(`No se puede borrar la talla ${size.label} porque tiene movimientos históricos. Renómbrala o déjala sin usar para conservar la trazabilidad.`, 'error'); return;
      }
      const orders = productionOrdersSnapshot();
      if (!orders) { setNoticeMessage('No se pudo verificar las órdenes guardadas. Exporta un respaldo válido antes de borrar tallas.', 'error'); return; }
      const referencedInProduction = orders.some((order) =>
        Boolean(order.quantities?.[size.id]) ||
        order.materials?.some((line) => line.sizeId === size.id) ||
        order.basePieces?.some((line) => line.sizeId === size.id) ||
        order.componentPieces?.some((line) => line.sizeId === size.id)
      );
      if (referencedInProduction) {
        setNoticeMessage(`No se puede borrar la talla ${size.label}: está referenciada por una orden de producción. Renómbrala o déjala sin usar para conservar la trazabilidad.`, 'error'); return;
      }
    }
    setDraftSizes((previous) => previous.filter((item) => item.id !== size.id));
  }

  function openSizeManagerFromModelForm() {
    beginSizeManager(modelForm.sizeGroupId || sizeGroups[0]?.id || '', true);
  }

  function cancelSizeManager() {
    setShowSizeManager(false);
    setDraftSizeGroups([]);
    setDraftSizes([]);
    setNewSizeLabel('');
    setNewGroupName('');
    setReturnToModelFormAfterSizeManager(false);
  }

  function applySizeManager() {
    const invalidGroup = draftSizeGroups.find((group) => !group.name.trim());
    if (invalidGroup) { setNoticeMessage('Todos los grupos deben tener un nombre.', 'error'); return; }
    const groupNames = draftSizeGroups.map((group) => group.name.trim().toLocaleLowerCase('es'));
    if (new Set(groupNames).size !== groupNames.length) { setNoticeMessage('Ya existe un grupo con ese nombre.', 'error'); return; }
    const invalidSize = draftSizes.find((size) => !size.label.trim());
    if (invalidSize) { setNoticeMessage('Todas las tallas deben tener un nombre.', 'error'); return; }
    for (const group of draftSizeGroups) {
      const labels = draftSizes.filter((size) => size.groupId === group.id).map((size) => size.label.trim().toLocaleLowerCase('es'));
      if (new Set(labels).size !== labels.length) { setNoticeMessage(`Hay nombres de talla duplicados en el grupo «${group.name}».`, 'error'); return; }
    }
    const removedIds = sizes.filter((size) => !draftSizes.some((draft) => draft.id === size.id)).map((size) => size.id);
    if (removedIds.some((sizeId) => movements.some((movement) => movement.sizeId === sizeId))) {
      setNoticeMessage('No se puede aplicar: una talla pendiente de eliminar tiene movimientos históricos.', 'error'); return;
    }
    if (removedIds.length > 0) {
      const orders = productionOrdersSnapshot();
      if (!orders) { setNoticeMessage('No se pudo verificar las órdenes guardadas. Exporta un respaldo válido antes de eliminar tallas.', 'error'); return; }
      const referencedSize = removedIds.find((sizeId) => orders.some((order) =>
        Boolean(order.quantities?.[sizeId]) ||
        order.materials?.some((line) => line.sizeId === sizeId) ||
        order.basePieces?.some((line) => line.sizeId === sizeId) ||
        order.componentPieces?.some((line) => line.sizeId === sizeId)
      ));
      if (referencedSize) { setNoticeMessage('No se puede aplicar: una talla pendiente de eliminar está referenciada por una orden.', 'error'); return; }
    }

    const nextGroups = draftSizeGroups.map((group) => ({ ...group, name: group.name.trim() }));
    const nextSizes = draftSizes.map((size) => ({ ...size, label: size.label.trim() }));
    const selectedGroupId = sizeManagerGroupId;
    setSizeGroups(nextGroups);
    setSizes(nextSizes);
    setShowSizeManager(false);
    if (returnToModelFormAfterSizeManager && nextGroups.some((group) => group.id === selectedGroupId)) {
      setModelForm((previous) => ({
        ...previous,
        sizeGroupId: selectedGroupId,
        excludedSizeIds: previous.excludedSizeIds.filter((sizeId) => nextSizes.some((size) => size.id === sizeId && size.groupId === selectedGroupId)),
      }));
    }
    setDraftSizeGroups([]);
    setDraftSizes([]);
    setNewSizeLabel('');
    setNewGroupName('');
    setReturnToModelFormAfterSizeManager(false);
    setNoticeMessage('Cambios de grupos y tallas guardados correctamente.');
  }

  function addSizeGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    if (draftSizeGroups.some((group) => group.name.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
      setNoticeMessage('Ya existe un grupo con ese nombre.', 'error'); return;
    }
    const group = { id: newId(), name };
    setDraftSizeGroups((previous) => [...previous, group]);
    setSizeManagerGroupId(group.id);
    setNewGroupName('');
  }

  function exportConfiguration() {
    const payload = { schemaVersion: 4, exportedAt: new Date().toISOString(), sizeGroups, sizes, families, models, pieces: pieces.filter((piece) => !piece.archived), colors: fabricColors };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'telastock-moldes-y-tallas.json'; anchor.click(); URL.revokeObjectURL(url);
  }

  // Configuration import merges master data by ID and intentionally leaves movement history untouched.
  async function importConfiguration(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { sizeGroups?: SizeGroup[]; sizes?: Size[]; families?: PatternFamily[]; models?: ManufacturingModel[]; pieces?: ModelPiece[]; colors?: ColorDefinition[] };
      if (!Array.isArray(parsed.sizeGroups) || !Array.isArray(parsed.sizes) || !Array.isArray(parsed.models) || !Array.isArray(parsed.pieces)) {
        throw new Error('El archivo debe contener sizeGroups, sizes, models y pieces.');
      }
      // Import is an upsert-by-ID of master data. Existing movements are not overwritten.
      const merge = <T extends { id: string }>(current: T[], incoming: T[]) => {
        const map = new Map(current.map((item) => [item.id, item]));
        incoming.forEach((item) => map.set(item.id, item));
        return [...map.values()];
      };
      const familyMap = new Map(families.map((family) => [family.value, family]));
      (parsed.families ?? []).forEach((family) => familyMap.set(family.value, family));
      const mergedFamilies = normalizePatternFamilies([...familyMap.values()]);
      setFamilies(mergedFamilies);
      const mergedColors = merge(fabricColors, parsed.colors ?? []);
      setFabricColors(mergedColors);
      localStorage.setItem(FABRIC_STORAGE_KEYS.colores, JSON.stringify(mergedColors));
      setSizeGroups((current) => merge(current, parsed.sizeGroups!));
      setSizes((current) => merge(current, parsed.sizes!));
      const incomingPieces = parsed.pieces!.map((piece) => {
        const resolvedColorId = piece.colorId ?? mergedColors.find((color) => color.nombre.toLocaleLowerCase('es') === (piece.color ?? '').toLocaleLowerCase('es'))?.id ?? null;
        return {
          ...piece,
          fabricSlot: piece.fabricSlot ?? 'principal',
          fabricType: fabricSlotLabel(piece.fabricSlot ?? 'principal'),
          color: resolvedColorId ? mergedColors.find((color) => color.id === resolvedColorId)?.nombre ?? piece.color ?? 'Sin especificar' : piece.color ?? 'Sin especificar',
          colorId: resolvedColorId,
          colorSlot: piece.colorSlot ?? (resolvedColorId ? 'principal' : 'ninguna'),
          colorOverride: piece.colorOverride ?? true,
          archived: false,
        };
      });
      const legacyProductModels = (() => {
        try {
          const raw = localStorage.getItem(PRODUCTION_STORAGE_KEYS.productModels);
          return raw ? JSON.parse(raw) as Array<{ baseModelId?: string; family?: string }> : [];
        } catch { return []; }
      })();
      setModels((current) => {
        const merged = merge(current, normalizeModelsWithSlots(parsed.models!, incomingPieces)).map((model) => ({
          ...model,
          family: model.family || current.find((item) => item.id === model.id)?.family || '',
          excludedSizeIds: Array.isArray(model.excludedSizeIds) ? model.excludedSizeIds.filter((sizeId) => typeof sizeId === 'string' && parsed.sizes!.some((size) => size.id === sizeId && size.groupId === model.sizeGroupId)) : [],
        }));
        return migrateBaseModelFamilies(merged, legacyProductModels, mergedFamilies);
      });
      setPieces((current) => merge(current, incomingPieces));
      window.dispatchEvent(new Event('telastock-fabric-data-updated'));
      setNoticeMessage('Configuración importada. Se combinaron familias, modelos, moldes, colores y tallas; el historial de movimientos existente se conservó.');
    } catch (error) {
      setNoticeMessage(`No se pudo importar el archivo: ${error instanceof Error ? error.message : 'formato no válido'}`, 'error');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  function exportFullBackup() {
    if (!ready) {
      setNoticeMessage('Espera a que termine de cargar el inventario antes de crear el respaldo.', 'info');
      return;
    }
    try {
      const fabricInventory = emptyFabricBackupData();
      const localCollections: [string, keyof typeof fabricInventory][] = [
        [FABRIC_STORAGE_KEYS.telas, 'telas'],
        [FABRIC_STORAGE_KEYS.rollos, 'rollos'],
        [FABRIC_STORAGE_KEYS.rolloMovimientos, 'rolloMovimientos'],
        [FABRIC_STORAGE_KEYS.proveedores, 'proveedores'],
        [FABRIC_STORAGE_KEYS.proveedorTelefonos, 'proveedorTelefonos'],
        [FABRIC_STORAGE_KEYS.proveedorCategorias, 'proveedorCategorias'],
        [FABRIC_STORAGE_KEYS.compras, 'compras'],
        [FABRIC_STORAGE_KEYS.detalleCompra, 'detalleCompra'],
        [FABRIC_STORAGE_KEYS.colores, 'colores'],
        [FABRIC_STORAGE_KEYS.telaColores, 'telaColores'],
      ];
      localCollections.forEach(([storageKey, field]) => {
        const raw = localStorage.getItem(storageKey);
        if (raw) (fabricInventory as unknown as Record<string, unknown>)[field] = JSON.parse(raw);
      });
      const payload = {
        app: 'TelaStock',
        backupType: 'full',
        schemaVersion: 14,
        exportedAt: new Date().toISOString(),
        data: {
          sizeGroups, sizes, families, models, pieces, movements, fabricInventory,
          production: Object.fromEntries((Object.keys(emptyProductionBackupData()) as (keyof ReturnType<typeof emptyProductionBackupData>)[]).map((key) => {
            const raw = localStorage.getItem(PRODUCTION_STORAGE_KEYS[key]);
            return [key, raw ? JSON.parse(raw) : []];
          })),
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `telastock-respaldo-completo-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNoticeMessage('Respaldo completo descargado: fabricación, telas, rollos, compras, proveedores y sus historiales. Guarda el archivo en un lugar seguro.');
    } catch {
      setNoticeMessage('No se pudo crear el respaldo. Comprueba que el navegador permita descargar archivos.', 'error');
    }
  }

  async function importFullBackup(file?: File) {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const isRecord = (value: unknown): value is Record<string, unknown> =>
        Boolean(value) && typeof value === 'object' && !Array.isArray(value);
      if (!isRecord(raw) || raw.app !== 'TelaStock' || raw.backupType !== 'full' || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(Number(raw.schemaVersion)) || !isRecord(raw.data)) {
        throw new Error('Este no es un respaldo completo de TelaStock compatible.');
      }
      const data = raw.data;
      const getRows = (key: string): Record<string, unknown>[] => {
        const value = data[key];
        if (!Array.isArray(value) || !value.every(isRecord)) {
          throw new Error(`El apartado "${key}" no existe o está dañado.`);
        }
        if (!value.every((row) => typeof row.id === 'string' && row.id.trim().length > 0)) {
          throw new Error(`Hay registros sin identificador válido en "${key}".`);
        }
        const ids = value.map((row) => row.id as string);
        if (new Set(ids).size !== ids.length) throw new Error(`Hay identificadores duplicados en "${key}".`);
        return value;
      };

      const importedGroups = getRows('sizeGroups') as unknown as SizeGroup[];
      const importedFamilies = normalizePatternFamilies(Array.isArray(data.families) && data.families.length > 0 ? data.families : DEFAULT_PATTERN_FAMILIES);
      const importedSizes = getRows('sizes') as unknown as Size[];
      const importedModelsRaw = getRows('models') as unknown as ManufacturingModel[];
      const importedPieces = getRows('pieces') as unknown as ModelPiece[];
      const normalizedImportedPieces = importedPieces.map((piece) => ({ ...piece, colorSlot: piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna'), colorId: null, color: 'Sin especificar', colorOverride: false }));
      const importedMovements = getRows('movements') as unknown as PieceMovement[];
      const importedFabric = Number(raw.schemaVersion) >= 2 ? validateFabricBackupData(data.fabricInventory) : emptyFabricBackupData();
      const importedProduction = Number(raw.schemaVersion) >= 4 ? validateProductionBackupData(data.production) : emptyProductionBackupData();
      const importedModels = normalizeModelsWithSlots(migrateBaseModelFamilies(importedModelsRaw, importedProduction.productModels, importedFamilies), normalizedImportedPieces).map((model) => ({
        ...model,
        excludedSizeIds: Array.isArray(model.excludedSizeIds) ? model.excludedSizeIds.filter((sizeId) => typeof sizeId === 'string' && importedSizes.some((size) => size.id === sizeId && size.groupId === model.sizeGroupId)) : [],
      }));
      const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
      const groupIds = new Set(importedGroups.map((item) => item.id));
      const sizeIds = new Set(importedSizes.map((item) => item.id));
      const modelIds = new Set(importedModels.map((item) => item.id));
      const pieceIds = new Set(normalizedImportedPieces.map((item) => item.id));
      const productMaterialSpecificationsValid = importedProduction.productModels.every((product) => {
        const base = importedModels.find((model) => model.id === product.baseModelId);
        if (!base) return false;
        const excludedSizeIds = new Set(base.excludedSizeIds ?? []);
        const validSizeIds = importedSizes.filter((size) => size.groupId === base.sizeGroupId && !excludedSizeIds.has(size.id)).map((size) => size.id);
        return product.components.every((selection) => {
          const component = importedProduction.components.find((item) => item.id === selection.componentId);
          if (!component) return false;
          const specifications = selection.materialSpecifications ?? {};
          const specificationMaterials = component.materials.filter((material) => material.specificationLabel?.trim());
          return specificationMaterials.every((material) => validateSizeSpecification(specifications[material.id], validSizeIds)) &&
            Object.keys(specifications).every((materialId) => component.materials.some((material) => material.id === materialId && Boolean(material.specificationLabel?.trim())));
        });
      });
      const productFabricLinksValid = importedProduction.productFabrics.every((assignment) => {
        const product = importedProduction.productModels.find((item) => item.id === assignment.productModelId);
        const baseModel = product ? importedModels.find((item) => item.id === product.baseModelId) : undefined;
        return Boolean(product && baseModel &&
          isComponentFabricSlot(assignment.fabricSlot) &&
          importedFabric.telas.some((textile) => textile.id === assignment.textileId));
      });
      const productColorLinksValid = importedProduction.productColors.every((assignment) => {
        const product = importedProduction.productModels.find((item) => item.id === assignment.productModelId);
        const baseModel = product ? importedModels.find((item) => item.id === product.baseModelId) : undefined;
        return Boolean(product && baseModel &&
          isComponentColorSlot(assignment.colorSlot) &&
          importedFabric.colores.some((color) => color.id === assignment.colorId));
      });
      const productionSizeLinksValid =
        importedProduction.supplyMovements.every((movement) => movement.sizeId === null || sizeIds.has(movement.sizeId)) &&
        importedProduction.supplyPurchaseDetails.every((detail) => detail.sizeId === null || sizeIds.has(detail.sizeId)) &&
        importedProduction.componentPieceMovements.every((movement) => sizeIds.has(movement.sizeId)) &&
        importedProduction.productionOrders.every((order) =>
          importedModels.some((model) => model.id === order.baseModelId) &&
          importedProduction.productModels.some((product) => product.id === order.productModelId) &&
          Object.entries(order.quantities).every(([sizeId, quantity]) => sizeIds.has(sizeId) && Number.isInteger(quantity) && quantity > 0) &&
          order.materials.every((line) => line.sizeId === null || sizeIds.has(line.sizeId)) &&
          order.basePieces.every((line) => sizeIds.has(line.sizeId) && pieceIds.has(line.pieceId)) &&
          order.componentPieces.every((line) => sizeIds.has(line.sizeId)) &&
          order.rollAllocations.every((allocation) => importedFabric.rollos.some((roll) => roll.id === allocation.rollId))
        );
      const componentPieceCatalogLinksValid = Number(raw.schemaVersion) < 8 || importedProduction.components.every((component) =>
        component.pieces.every((piece) =>
          piece.textileId === null &&
          (piece.colorId == null || importedFabric.colores.some((color) => color.id === piece.colorId))
        )
      );
      const productBasePatternsExist = importedProduction.productModels.every((product) =>
        importedModels.some((model) => model.id === product.baseModelId) &&
        product.components.every((selection) => importedProduction.components.some((component) => component.id === selection.componentId))
      );
      if (!productionSizeLinksValid || !componentPieceCatalogLinksValid || !productBasePatternsExist || !productMaterialSpecificationsValid || !productFabricLinksValid || !productColorLinksValid) throw new Error('Hay órdenes, movimientos, piezas auxiliares, patrones o telas de modelos vinculados a registros que no existen en este respaldo.');
      if (!importedGroups.every((item) => hasText(item.name))) throw new Error('Hay grupos de tallas sin nombre.');
      if (!importedSizes.every((item) => hasText(item.label) && groupIds.has(item.groupId) && Number.isInteger(item.sortOrder))) throw new Error('Hay tallas incompletas o vinculadas a un grupo inexistente.');
      if (!importedModels.every((item) => hasText(item.name) && groupIds.has(item.sizeGroupId))) throw new Error('Hay modelos incompletos o vinculados a un grupo inexistente.');
      if (!normalizedImportedPieces.every((item) =>
        hasText(item.name) &&
        modelIds.has(item.modelId) &&
        Number.isInteger(item.unitsPerGarment) &&
        item.unitsPerGarment > 0 &&
        ['simetrica', 'izquierda', 'derecha', 'ninguna'].includes(item.laterality) &&
        (item.fabricSlot === undefined || isValidFabricSlot(item.fabricSlot, (importedModels.find((model) => model.id === item.modelId)?.secondaryFabricSlots ?? Math.max(0, ...normalizedImportedPieces.filter((piece) => piece.modelId === item.modelId).map((piece) => secondaryFabricSlotIndex(piece.fabricSlot)))))) &&
        isValidColorSlot(item.colorSlot ?? 'ninguna', (importedModels.find((model) => model.id === item.modelId)?.secondaryColorSlots ?? Math.max(0, ...normalizedImportedPieces.filter((piece) => piece.modelId === item.modelId).map((piece) => secondaryColorSlotIndex(piece.colorSlot))))) &&
        (item.colorId == null || importedFabric.colores.some((color) => color.id === item.colorId)) &&
        (item.colorOverride === undefined || typeof item.colorOverride === 'boolean') &&
        Number.isInteger(item.sortOrder)
      )) throw new Error('Hay moldes incompletos o con datos de fabricación inválidos.');
      if (!importedMovements.every((item) =>
        pieceIds.has(item.pieceId) &&
        sizeIds.has(item.sizeId) &&
        Number.isInteger(item.delta) &&
        ['entrada', 'salida', 'ajuste'].includes(item.kind) &&
        hasText(item.date) &&
        typeof item.note === 'string' &&
        (item.side === undefined || item.side === 'izquierda' || item.side === 'derecha')
      )) throw new Error('Hay movimientos inválidos o vinculados a moldes/tallas inexistentes.');

      const legacyWarning = raw.schemaVersion === 1 ? '\\nEste respaldo antiguo no contiene datos de telas, rollos ni compras; al restaurarlo, esas colecciones quedarán vacías.' : '';
      const confirmed = window.confirm(
        `Vas a restaurar:
• ${importedFamilies.length} familias, ${importedGroups.length} grupos y ${importedSizes.length} tallas.
• ${importedModels.length} patrones y ${importedPieces.length} moldes base.
• ${importedProduction.productModels.length} modelos comerciales, ${importedProduction.components.length} componentes y ${importedProduction.productFabrics.length + importedProduction.productColors.length} asignaciones de tela/color.
• ${importedMovements.length + importedProduction.productBasePieceMovements.length + importedProduction.componentPieceMovements.length + importedProduction.finishedGarmentMovements.length} movimientos de piezas y prendas terminadas.
• ${importedFabric.telas.length} telas, ${importedFabric.rollos.length} rollos, ${importedFabric.compras.length} compras, ${importedFabric.proveedores.length} proveedores.
• ${importedProduction.supplies.length} insumos, ${importedProduction.variants.length} variantes, ${importedProduction.supplyPurchases.length} compras de avíos y ${importedProduction.productionOrders.length} órdenes.
Esto reemplazará los datos del navegador actual. Exporta un respaldo previo si necesitas conservarlos.${legacyWarning}
¿Continuar?`
      );
      if (!confirmed) return;

      setSizeGroups(importedGroups);
      setSizes(importedSizes);
      setFamilies(importedFamilies);
      setModels(importedModels);
      setPieces(normalizedImportedPieces.map((piece) => ({
        ...piece,
        fabricSlot: piece.fabricSlot ?? 'principal',
        colorSlot: piece.colorSlot ?? 'ninguna',
        fabricType: fabricSlotLabel(piece.fabricSlot ?? 'principal'),
        color: 'Sin especificar',
        colorId: null,
        colorOverride: false,
      })));
      setFabricColors(importedFabric.colores);
      setMovements(importedMovements);
      localStorage.setItem(FABRIC_STORAGE_KEYS.telas, JSON.stringify(importedFabric.telas));
      localStorage.setItem(FABRIC_STORAGE_KEYS.rollos, JSON.stringify(importedFabric.rollos));
      localStorage.setItem(FABRIC_STORAGE_KEYS.rolloMovimientos, JSON.stringify(importedFabric.rolloMovimientos));
      localStorage.setItem(FABRIC_STORAGE_KEYS.proveedores, JSON.stringify(importedFabric.proveedores));
      localStorage.setItem(FABRIC_STORAGE_KEYS.proveedorTelefonos, JSON.stringify(importedFabric.proveedorTelefonos));
      localStorage.setItem(FABRIC_STORAGE_KEYS.proveedorCategorias, JSON.stringify(importedFabric.proveedorCategorias));
      localStorage.setItem(FABRIC_STORAGE_KEYS.compras, JSON.stringify(importedFabric.compras));
      localStorage.setItem(FABRIC_STORAGE_KEYS.detalleCompra, JSON.stringify(importedFabric.detalleCompra));
      localStorage.setItem(FABRIC_STORAGE_KEYS.colores, JSON.stringify(importedFabric.colores));
      localStorage.setItem(FABRIC_STORAGE_KEYS.telaColores, JSON.stringify(importedFabric.telaColores));
      localStorage.setItem(FABRIC_STORAGE_KEYS.version, '2');
      (Object.keys(emptyProductionBackupData()) as (keyof ReturnType<typeof emptyProductionBackupData>)[]).forEach((key) => {
        localStorage.setItem(PRODUCTION_STORAGE_KEYS[key], JSON.stringify(importedProduction[key]));
      });
      localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '11');
      window.dispatchEvent(new Event('telastock-production-data-restored'));
      window.dispatchEvent(new Event('telastock-fabric-data-updated'));
      window.dispatchEvent(new Event('telastock-fabric-data-restored'));
      setExpandedModels(importedModels.slice(0, 1).map((model) => model.id));
      setSelectedModelId(importedModels[0]?.id ?? '');
      setSelectedSizeIds([]);
      setStockAmounts({});
      setStockEntryModes({});
      setShowBackupModal(false);
      setNoticeMessage(`Respaldo restaurado: ${importedModels.length} patrones, ${importedProduction.productModels.length} modelos comerciales, ${importedProduction.components.length} componentes, ${importedFabric.rollos.length} rollos, ${importedProduction.productionOrders.length} órdenes y todos sus historiales.`);
    } catch (error) {
      setNoticeMessage(`No se pudo restaurar el respaldo: ${error instanceof Error ? error.message : 'archivo no válido'}`, 'error');
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  }

  function exportCsv() {
    const rows = [['Modelo', 'Grupo de tallas', 'Talla', 'Molde', 'Ranura de tela', 'Color base', 'Piezas físicas en stock', 'Stock izquierdo', 'Stock derecho', 'Paridades completas', 'Piezas por prenda', 'Unidades fabricables', 'Faltante para siguiente unidad']];
    for (const model of models) {
      const parts = modelPieces(model.id);
      for (const size of modelSizes(model)) {
        const available = parts.some((piece) => stockForPiece(piece.id, size.id) > 0);
        if (!available) continue;
        const complete = completeForSize(model, size.id);
        const shortages = getPieceShortages(parts, movements, size.id, complete + 1);
        for (const piece of parts) {
          const current = Math.max(0, stockForPiece(piece.id, size.id));
          const shortage = shortages.find((item) => item.piece.id === piece.id);
          const symmetric = piece.laterality === 'simetrica' ? getSymmetricStock(movements, piece.id, size.id) : undefined;
          rows.push([
            model.name,
            groupById.get(model.sizeGroupId)?.name ?? '',
            size.label,
            piece.name,
            fabricSlotLabel(piece.fabricSlot ?? 'principal'),
            fabricColorById.get(piece.colorId ?? '')?.nombre ?? piece.color ?? '',
            String(current),
            symmetric ? String(symmetric.left) : '',
            symmetric ? String(symmetric.right) : '',
            symmetric ? String(symmetric.parity) : '',
            String(piece.unitsPerGarment),
            String(complete),
            String(shortage?.missing ?? 0),
          ]);
        }
      }
    }
    const csv = '\uFEFF' + rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'inventario-piezas-fabricacion.csv'; anchor.click(); URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">T</div><div><strong>TelaStock</strong><span>GESTIÓN TEXTIL</span></div></div>
        <div className="side-label">FABRICACIÓN</div>
        <button className={`nav-item ${view === 'inventario' ? 'active' : ''}`} onClick={() => setView('inventario')}><span aria-hidden="true">▦</span> Inventario de piezas</button>
        <button className={`nav-item ${view === 'inventario-prendas' ? 'active' : ''}`} onClick={() => setView('inventario-prendas')}><span aria-hidden="true">✓</span> Prendas terminadas</button>
        <button className={`nav-item ${view === 'modelos' ? 'active' : ''}`} onClick={() => setView('modelos')}><span aria-hidden="true">◇</span> Patrones</button>
        <button className={`nav-item ${view === 'historial' ? 'active' : ''}`} onClick={() => setView('historial')}><span aria-hidden="true">↔</span> Historial</button>
        <div className="side-label fabric-nav-label">INSUMOS</div>
        <button className={`nav-item ${view === 'telas' ? 'active' : ''}`} onClick={() => setView('telas')}><span aria-hidden="true">▤</span> Catálogo de telas</button>
        <button className={`nav-item ${view === 'rollos' ? 'active' : ''}`} onClick={() => setView('rollos')}><span aria-hidden="true">▥</span> Inventario de rollos</button>
        <button className={`nav-item ${view === 'compras' ? 'active' : ''}`} onClick={() => setView('compras')}><span aria-hidden="true">＋</span> Compras</button>
        <button className={`nav-item ${view === 'proveedores' ? 'active' : ''}`} onClick={() => setView('proveedores')}><span aria-hidden="true">♙</span> Proveedores</button>
        <div className="side-label fabric-nav-label">CONFECCIÓN</div>
        <button className={`nav-item ${view === 'insumos' ? 'active' : ''}`} onClick={() => setView('insumos')}>▧ Insumos y avíos</button>
        <button className={`nav-item ${view === 'compras-avios' ? 'active' : ''}`} onClick={() => setView('compras-avios')}>＋ Compras de avíos</button>
        <button className={`nav-item ${view === 'componentes' ? 'active' : ''}`} onClick={() => setView('componentes')}>◇ Componentes</button>
        <button className={`nav-item ${view === 'modelos-producto' ? 'active' : ''}`} onClick={() => setView('modelos-producto')}>▤ Modelos configurados</button>
        <button className={`nav-item ${view === 'recetas' ? 'active' : ''}`} onClick={() => setView('recetas')}>≋ Recetas</button>
        <button className={`nav-item ${view === 'planificacion' ? 'active' : ''}`} onClick={() => setView('planificacion')}>✓ Planificar</button>
        <button className={`nav-item ${view === 'ordenes' ? 'active' : ''}`} onClick={() => setView('ordenes')}>▣ Órdenes de producción</button>
        <div className="sidebar-bottom"><div className="avatar">P</div><div><strong>Usuario de prueba</strong><span>Administrador</span></div><span className="online-dot" /></div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="crumb">TelaStock / <strong>{view === 'inventario' ? 'Inventario de piezas' : view === 'inventario-prendas' ? 'Inventario de prendas terminadas' : view === 'modelos' ? 'Patrones base' : view === 'historial' ? 'Historial' : view === 'telas' ? 'Catálogo de telas' : view === 'rollos' ? 'Inventario de rollos' : view === 'compras' ? 'Compras de telas' : view === 'proveedores' ? 'Proveedores' : view === 'insumos' ? 'Insumos y avíos' : view === 'compras-avios' ? 'Compras de avíos' : view === 'componentes' ? 'Componentes' : view === 'modelos-producto' ? 'Modelos configurados' : view === 'recetas' ? 'Recetas' : view === 'ordenes' ? 'Órdenes de producción' : 'Planificación'}</strong></div>
          <div className="top-actions"><button className="backup-trigger" onClick={() => setShowBackupModal(true)} title="Importar o exportar todos los datos" aria-label="Importar o exportar todos los datos"><span aria-hidden="true">⇅</span><span className="backup-trigger-label">Respaldo</span></button><span className="local-pill"><i /> Prototipo local</span><button className="icon-button" title="Ayuda sobre cálculo" onClick={() => setNoticeMessage('Las unidades fabricables se calculan con el molde más limitante: todos los moldes requeridos deben alcanzar. Es una capacidad de fabricación con el stock actual, no una cantidad de prendas ya confeccionadas.', 'info')}>?</button></div>
        </header>

        <div className="mobile-nav fabric-mobile-nav" role="navigation" aria-label="Módulos">
          <button className={view === 'inventario' ? 'active' : ''} onClick={() => setView('inventario')}>Piezas</button>
          <button className={view === 'inventario-prendas' ? 'active' : ''} onClick={() => setView('inventario-prendas')}>Prendas</button>
          <button className={view === 'modelos' ? 'active' : ''} onClick={() => setView('modelos')}>Patrones</button>
          <button className={view === 'historial' ? 'active' : ''} onClick={() => setView('historial')}>Historial</button>
          <button className={view === 'telas' ? 'active' : ''} onClick={() => setView('telas')}>Telas</button>
          <button className={view === 'rollos' ? 'active' : ''} onClick={() => setView('rollos')}>Rollos</button>
          <button className={view === 'compras' ? 'active' : ''} onClick={() => setView('compras')}>Compras</button>
          <button className={view === 'proveedores' ? 'active' : ''} onClick={() => setView('proveedores')}>Proveedores</button>
          <button className={view === 'insumos' ? 'active' : ''} onClick={() => setView('insumos')}>Avíos</button>
          <button className={view === 'compras-avios' ? 'active' : ''} onClick={() => setView('compras-avios')}>Compras avíos</button>
          <button className={view === 'componentes' ? 'active' : ''} onClick={() => setView('componentes')}>Componentes</button>
          <button className={view === 'modelos-producto' ? 'active' : ''} onClick={() => setView('modelos-producto')}>Modelos</button>
          <button className={view === 'recetas' ? 'active' : ''} onClick={() => setView('recetas')}>Recetas</button>
          <button className={view === 'planificacion' ? 'active' : ''} onClick={() => setView('planificacion')}>Planificar</button>
          <button className={view === 'ordenes' ? 'active' : ''} onClick={() => setView('ordenes')}>Órdenes</button>
        </div>

        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow">{view === 'inventario-prendas' ? 'INVENTARIO DE PRENDAS TERMINADAS' : ['telas','rollos','compras','proveedores','insumos','compras-avios'].includes(view) ? 'INVENTARIO DE INSUMOS' : ['componentes','modelos-producto','recetas','planificacion','ordenes'].includes(view) ? 'CONFIGURACIÓN DE CONFECCIÓN' : 'INVENTARIO DE FABRICACIÓN'}</div><h1>{view === 'inventario' ? 'Inventario por modelo' : view === 'inventario-prendas' ? 'Prendas terminadas' : view === 'modelos' ? 'Patrones base' : view === 'historial' ? 'Movimientos de piezas' : view === 'telas' ? 'Catálogo de telas' : view === 'rollos' ? 'Inventario de rollos' : view === 'compras' ? 'Compras de telas' : view === 'proveedores' ? 'Proveedores' : view === 'insumos' ? 'Insumos y avíos' : view === 'compras-avios' ? 'Compras de avíos' : view === 'componentes' ? 'Biblioteca de componentes' : view === 'modelos-producto' ? 'Modelos configurados' : view === 'recetas' ? 'Recetas estándar' : view === 'ordenes' ? 'Órdenes de producción' : 'Planificación de materiales'}</h1><p>{view === 'inventario' ? 'Controla todas las piezas de cada modelo comercial: moldes base y componentes auxiliares, con sus telas, colores y tallas.' : view === 'inventario-prendas' ? 'Consulta rápidamente cuántas prendas terminadas tienes de cada modelo y talla.' : view === 'modelos' ? 'Define la estructura reutilizable de la prenda. Las telas y los colores concretos se asignan en cada modelo comercial.' : view === 'historial' ? 'Consulta las entradas y salidas que has registrado en cada modelo comercial.' : view === 'telas' ? 'Administra los tipos de tela, unidades habituales y características.' : view === 'rollos' ? 'Controla cada rollo físico y sus mediciones reales en KG y metros.' : view === 'compras' ? 'Registra compras por proveedor y conserva sus precios históricos.' : view === 'proveedores' ? 'Administra contactos, teléfonos y rubros de proveedores.' : view === 'insumos' ? 'Administra avíos, consumibles, variantes y existencias.' : view === 'compras-avios' ? 'Registra comprobantes, precios históricos e ingresos de avíos al inventario.' : view === 'componentes' ? 'Crea cuellos, bolsillos, puños y acabados reutilizables.' : view === 'modelos-producto' ? 'Combina patrones base con los acabados que lleva cada prenda.' : view === 'recetas' ? 'Define consumos habituales por familia de prenda.' : view === 'ordenes' ? 'Controla las reservas, el avance y el consumo real de cada orden.' : 'Calcula materiales necesarios por talla y faltantes de compra.'}</p></div>
            <div className="heading-actions">
              {false && view === 'inventario' && <button className="button secondary" onClick={exportCsv}>↧ <span>Exportar</span></button>}
              {false && view === 'inventario' && <button className="button secondary" onClick={() => openStockForm('salida')}>− <span>Retirar / merma</span></button>}
              {false && view === 'inventario' && <button className="button primary" onClick={() => openStockForm('entrada')}>＋ <span>Registrar stock</span></button>}
              {view === 'modelos' && <><button className="button secondary" onClick={openFamilyManager}>▦ <span>Familias</span></button><button className="button secondary" onClick={() => beginSizeManager(sizeGroups[0]?.id ?? '', false)}>↕ <span>Editar tallas</span></button><button className="button secondary" onClick={exportConfiguration}>↧ <span>Exportar moldes/tallas</span></button><button className="button secondary" onClick={() => importInputRef.current?.click()}>↥ <span>Importar</span></button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importConfiguration(event.target.files?.[0])} /><button className="button primary" onClick={() => openCreateModel()}>＋ <span>Nuevo patrón</span></button></>}
                </div>
          </div>

          {notice && <div className={`notice ${notice.kind}`} role="status"><span>{notice.message}</span><button onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button></div>}

          {false && view === 'inventario' && <>
            <div className="stats-grid piece-stats">
              <article className="stat-card"><div className="stat-top"><span>Modelos con stock</span><span className="stat-icon purple">▦</span></div><strong>{modelCountWithStock}</strong><small>De {models.length} modelos registrados</small></article>
              <article className="stat-card"><div className="stat-top"><span>Piezas disponibles</span><span className="stat-icon blue">▤</span></div><strong>{fmt(totalCurrentPieceStock)}</strong><small>Unidades físicas de moldes</small></article>
              <article className="stat-card"><div className="stat-top"><span>Unidades fabricables</span><span className="stat-icon green">✓</span></div><strong>{fmt(completeUnitsAll)}</strong><small>Con stock actual · total por tallas y modelos</small></article>
            </div>

            <section className="panel inventory-panel">
              <div className="panel-heading"><div><h2>Inventario por modelo</h2><p>Abre un modelo para ver únicamente las tallas que tienen piezas.</p></div><span className="count-badge">{filteredModels.length} modelos</span></div>
              <div className="filters inventory-filters">
                <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar modelo…" aria-label="Buscar por nombre de modelo" /></label>
                <div className="filter-segment" aria-label="Filtrar por stock">{(['Con stock', 'Vacío', 'Todos'] as StockFilter[]).map((filter) => <button key={filter} className={stockFilter === filter ? 'selected' : ''} onClick={() => setStockFilter(filter)}>{filter}</button>)}</div>
              </div>
              <label className="toggle-empty"><input type="checkbox" checked={includeEmptySizes} onChange={(event) => setIncludeEmptySizes(event.target.checked)} /><span>Mostrar también tallas vacías dentro del modelo abierto</span></label>

              <div className="model-list">
                {filteredModels.map((model) => {
                  const modelPartList = modelPieces(model.id);
                  const allSizes = modelSizes(model);
                  const sizesWithStock = allSizes.filter((size) => hasStockForSize(model, size.id));
                  const visibleSizes = includeEmptySizes ? allSizes : sizesWithStock;
                  const totalComplete = allSizes.reduce((sum, size) => sum + completeForSize(model, size.id), 0);
                  const expanded = expandedModels.includes(model.id);
                  const group = groupById.get(model.sizeGroupId);
                  return <article className={`model-card ${expanded ? 'expanded' : ''}`} key={model.id}>
                    <button className="model-card-trigger" onClick={() => toggleModel(model.id)} aria-expanded={expanded}>
                      <span className="model-symbol" aria-hidden="true">{model.name.toLocaleLowerCase('es').includes('polo') ? '◉' : model.name.toLocaleLowerCase('es').includes('casaca') ? '◇' : model.name.toLocaleLowerCase('es').includes('media') ? '◎' : '▧'}</span>
                      <span className="model-main"><strong>{model.name}</strong><small>{group?.name ?? 'Grupo no disponible'} · {modelPartList.length} moldes</small><span className="model-tags"><span>{sizesWithStock.length} tallas con stock</span><span>{fmt(totalComplete)} fabricables</span></span></span>
                      <span className={`chevron ${expanded ? 'up' : ''}`} aria-hidden="true">⌄</span>
                    </button>
                    {expanded && <div className="model-details">
                      {visibleSizes.length === 0 ? <div className="empty size-empty">{includeEmptySizes ? 'Este grupo de tallas no tiene opciones registradas.' : 'Todavía no hay piezas con stock para este modelo.'}<button className="text-action" onClick={() => openStockForm('entrada', model.id)}>Registrar stock</button></div> : <div className="size-list">{visibleSizes.map((size) => {
                        const sizeHasPieces = hasStockForSize(model, size.id);
                        const completeUnits = completeForSize(model, size.id);
                        const totalParts = modelPartList.reduce((sum, piece) => sum + Math.max(0, stockForPiece(piece.id, size.id)), 0);
                        const shortages = getPieceShortages(modelPartList, movements, size.id);
                        const totalMissing = shortages.reduce((sum, shortage) => sum + shortage.missing, 0);
                        return <div className={`size-card ${!sizeHasPieces ? 'without-stock' : ''}`} key={size.id}>
                          <div className="size-card-main">
                            <div className="size-label-block"><span className="size-pill">{size.label}</span><span className="size-stock-note">{sizeHasPieces ? `${fmt(totalParts)} piezas` : 'Sin stock'}</span></div>
                            <div className="complete-count"><strong>{fmt(completeUnits)}</strong><span>fabricables con stock</span></div>
                          </div>
                          <div className="size-card-actions"><span className={`completion-status ${completeUnits > 0 ? 'ready' : sizeHasPieces ? 'partial' : 'empty-status'}`}><i />{completeUnits > 0 ? 'Fabricable' : sizeHasPieces ? 'Incompleto' : 'Vacío'}</span><button className="button shortage-button" onClick={() => setMissingTarget({ modelId: model.id, sizeId: size.id, targetUnits: completeUnits + 1 })}>{`Faltan ${fmt(totalMissing)} ${totalMissing === 1 ? 'pieza' : 'piezas'}`} <span aria-hidden="true">→</span></button></div>
                        </div>;
                      })}</div>}
                      <div className="model-detail-footer"><span>Se requieren {modelPartList.map((piece) => `${piece.unitsPerGarment} ${piece.unitsPerGarment === 1 ? 'unidad' : 'unidades'} de ${piece.name}`).join(' · ')} por prenda.</span><button className="text-action" onClick={() => openStockForm('entrada', model.id)}>＋ Agregar piezas</button></div>
                    </div>}
                  </article>;
                })}
                {filteredModels.length === 0 && <div className="empty">No hay modelos que coincidan con este filtro. Prueba con “Todos” o registra un modelo nuevo.</div>}
              </div>
              <div className="panel-footer"><span>Se muestran {filteredModels.length} de {models.length} modelos.</span><span>El stock se guarda como movimientos, no como edición directa del saldo.</span></div>
            </section>
          </>}

          {view === 'modelos' && <section className="panel models-panel pattern-library-panel">
            <div className="panel-heading">
              <div><h2>Biblioteca de patrones</h2><p>Busca y filtra tus patrones. Abre una tarjeta solo cuando necesites consultar su composición.</p></div>
              <span className="count-badge">{filteredPatterns.length} de {models.length}</span>
            </div>

            <div className="pattern-library-toolbar">
              <label className="search-box pattern-library-search"><span aria-hidden="true">⌕</span><input value={patternSearch} onChange={(event) => setPatternSearch(event.target.value)} placeholder="Buscar patrón o molde…" aria-label="Buscar patrón por nombre o molde" /></label>
              <div className="pattern-library-filters">
                <label className="pattern-filter-field"><span>Familia</span><select className="large-input" value={patternFamilyFilter} onChange={(event) => setPatternFamilyFilter(event.target.value)}><option value="Todas">Todas las familias</option>{families.map((family) => <option key={family.value} value={family.value}>{family.label}</option>)}</select></label>
                <label className="pattern-filter-field"><span>Tabla de tallas</span><select className="large-input" value={patternGroupFilter} onChange={(event) => setPatternGroupFilter(event.target.value)}><option value="Todos">Todas las tablas</option>{sizeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                <label className="pattern-filter-field"><span>Ordenar</span><select className="large-input" value={patternSort} onChange={(event) => setPatternSort(event.target.value as typeof patternSort)}><option value="az">Nombre · A–Z</option><option value="za">Nombre · Z–A</option><option value="recent">Más recientes</option><option value="pieces">Más moldes</option></select></label>
              </div>
              <div className="pattern-library-toolbar-footer">
                <span>{filteredPatterns.length === 1 ? '1 patrón encontrado' : `${filteredPatterns.length} patrones encontrados`}</span>
                <button type="button" className="text-action" onClick={() => setExpandedPatternIds(allPatternIdsExpanded ? [] : filteredPatterns.map((model) => model.id))} disabled={filteredPatterns.length === 0}>{allPatternIdsExpanded ? 'Plegar todas' : 'Expandir todas'}</button>
              </div>
            </div>

            <div className="model-management-list pattern-library-list">
              {filteredPatterns.map((model) => {
                const modelPartList = modelPieces(model.id);
                const group = groupById.get(model.sizeGroupId);
                const family = families.find((item) => item.value === model.family);
                const garmentPieceCount = modelPartList.reduce((sum, piece) => sum + piece.unitsPerGarment, 0);
                const fabricPositions = [...new Set(modelPartList.map((piece) => fabricSlotLabel(piece.fabricSlot ?? 'principal')))];
                const colorPositions = [...new Set(modelPartList.map((piece) => colorSlotLabel(piece.colorSlot ?? 'ninguna')))];
                const expanded = expandedPatternIds.includes(model.id);
                const activeSizes = modelSizes(model);
                return <article className={`managed-model pattern-library-card ${expanded ? 'expanded' : 'collapsed'}`} key={model.id}>
                  <div className="pattern-library-card-header">
                    <span className="pattern-library-symbol" aria-hidden="true">◇</span>
                    <div className="pattern-library-title">
                      <strong>{model.name}</strong>
                      <div className="pattern-library-badges">
                        <span className="pattern-family-badge">{family?.label ?? 'Familia pendiente'}</span>
                        <span className="pattern-group-badge">{group?.name ?? 'Grupo no disponible'}</span>
                      </div>
                    </div>
                    <div className="pattern-library-card-actions">
                      <button type="button" className="pattern-library-toggle" onClick={() => togglePatternExpanded(model.id)} aria-expanded={expanded} aria-label={expanded ? 'Plegar detalles' : 'Expandir detalles'}><span>{expanded ? 'Menos' : 'Detalles'}</span><span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span></button>
                      <button className="button secondary edit-model pattern-library-edit" onClick={() => openEditModel(model)}>Editar</button>
                    </div>
                  </div>

                  <div className="pattern-library-quick-summary">
                    <span><strong>{modelPartList.length}</strong> moldes</span><i />
                    <span><strong>{fmt(garmentPieceCount)}</strong> piezas / prenda</span><i />
                    <span><strong>{activeSizes.length}</strong> tallas activas</span>
                  </div>

                  {expanded && <div className="pattern-library-details">
                    <div className="pattern-library-metrics" aria-label="Resumen del patrón">
                      <div><strong>{modelPartList.length}</strong><span>Moldes</span></div>
                      <div><strong>{fmt(garmentPieceCount)}</strong><span>Piezas / prenda</span></div>
                      <div><strong>{activeSizes.length}</strong><span>Tallas activas</span></div>
                    </div>

                    <div className="pattern-library-composition">
                      <div className="pattern-library-section-heading"><strong>Composición</strong><span>{modelPartList.length} {modelPartList.length === 1 ? 'parte' : 'partes'}</span></div>
                      {modelPartList.length > 0 ? <div className="pattern-library-piece-list">
                        {modelPartList.map((piece, index) => {
                          const lateralityLabel = piece.laterality === 'simetrica' ? 'Par simétrico' : piece.laterality === 'izquierda' ? 'Lado izquierdo' : piece.laterality === 'derecha' ? 'Lado derecho' : '';
                          return <div className="pattern-library-piece-row" key={piece.id}>
                            <span className="pattern-library-piece-index">{String(index + 1).padStart(2, '0')}</span>
                            <div className="pattern-library-piece-name"><strong>{piece.name}</strong>{lateralityLabel && <small>{lateralityLabel}</small>}</div>
                            <span className="pattern-library-piece-quantity">×{piece.unitsPerGarment}</span>
                          </div>;
                        })}
                      </div> : <div className="pattern-library-empty">Este patrón todavía no tiene moldes.</div>}
                    </div>

                    <div className="pattern-library-position-summary">
                      <span className="pattern-library-position-title">Posiciones configuradas</span>
                      <div className="pattern-library-position-tags">
                        {fabricPositions.map((position) => <span className="pattern-library-position-tag" key={`tela-${position}`}><small>Tela</small>{position}</span>)}
                        {colorPositions.map((position) => <span className="pattern-library-position-tag color-position" key={`color-${position}`}><small>Color</small>{position}</span>)}
                      </div>
                    </div>

                    {activeSizes.length < groupSizes(model.sizeGroupId).length && <div className="pattern-library-disabled-sizes"><strong>{activeSizes.length} de {groupSizes(model.sizeGroupId).length} tallas habilitadas</strong><small>Hay tallas de la tabla maestra desactivadas para este patrón.</small></div>}

                    <div className="pattern-library-assignment-note">
                      <span aria-hidden="true">i</span>
                      <div><strong>Configuración por modelo</strong><small>La tela y el color reales se eligen al crear cada modelo comercial. Este patrón solo conserva sus posiciones.</small></div>
                    </div>
                  </div>}
                </article>;
              })}
              {filteredPatterns.length === 0 && <div className="pattern-library-no-results"><strong>No encontramos patrones</strong><span>Prueba otro nombre o cambia los filtros seleccionados.</span><button type="button" className="text-action" onClick={() => { setPatternSearch(''); setPatternFamilyFilter('Todas'); setPatternGroupFilter('Todos'); setPatternSort('az'); }}>Limpiar filtros</button></div>}
            </div>
            <div className="schema-note"><span>ⓘ</span><p><strong>Cómo funciona la biblioteca:</strong> un patrón define sus piezas, cantidades, lateralidad y posiciones reutilizables. Las tallas activas determinan las variantes que estarán disponibles en los modelos comerciales.</p></div>
          </section>}
          {(['telas', 'rollos', 'compras', 'proveedores'] as View[]).includes(view) && <FabricModule view={view as FabricView} />}
          {(view === 'inventario' || view === 'inventario-prendas' || view === 'historial' || (['insumos', 'compras-avios', 'componentes', 'modelos-producto', 'recetas', 'planificacion', 'ordenes'] as View[]).includes(view)) && <ProductionModule view={view === 'inventario' ? 'inventario-piezas' : view === 'historial' ? 'historial-piezas' : view as ProductionView} families={families} baseModels={models} baseModelsReady={ready} basePieces={pieces} sizes={sizes} sizeGroups={sizeGroups} onNavigate={(next) => setView(next)} onQuickCreateBaseModel={openCreateModel} />}

          <div className="prototype-note"><span>ⓘ</span><div><strong>Prototipo de validación · datos de demostración</strong><p>Los registros se guardan en este navegador y no se sincronizan entre dispositivos todavía. El proyecto incluye una migración SQL normalizada para Supabase; antes de producción se deben configurar autenticación, políticas de acceso y pruebas de concurrencia.</p></div></div>
        </div>
      </section>

      {showStockForm && currentStockModel && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowStockForm(false); }}>
        <section className="modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="stock-modal-title">
          <div className="modal-heading"><div><div className="eyebrow">{stockOperation === 'entrada' ? 'ENTRADA DE STOCK' : 'SALIDA DE STOCK'}</div><h2 id="stock-modal-title">{stockOperation === 'entrada' ? 'Registrar stock' : 'Retirar stock'}</h2><p>{stockOperation === 'entrada' ? 'Indica las cantidades que ingresan.' : 'Indica las cantidades que salen. No se permite un saldo negativo.'}</p></div><button className="icon-button" onClick={() => setShowStockForm(false)} aria-label="Cerrar">×</button></div>
          <form onSubmit={addStock}>
            <label className="field-label">Modelo<select className="large-input" value={currentStockModel.id} onChange={(event) => updateSelectedModel(event.target.value)}>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
            <div className="form-section-heading"><div><strong>Tallas</strong><small>{selectedSizeIds.length === 0 ? 'Selecciona una o varias.' : `${selectedSizeIds.length} seleccionada(s)`}</small></div><button type="button" className="text-action" onClick={selectAllSizes}>{selectedSizeIds.length === currentModelSizes.length ? 'Quitar todas' : 'Seleccionar todas'}</button></div>
            <div className="size-check-grid">{currentModelSizes.map((size) => <label className={`size-check ${selectedSizeIds.includes(size.id) ? 'checked' : ''}`} key={size.id}><input type="checkbox" checked={selectedSizeIds.includes(size.id)} onChange={() => toggleSelectedSize(size.id)} /><span className="checkmark" aria-hidden="true">✓</span><strong>{size.label}</strong><small>{modelPieces(currentStockModel.id).reduce((sum, piece) => sum + stockForPiece(piece.id, size.id), 0) > 0 ? 'Tiene stock' : 'Vacía'}</small></label>)}</div>
            {selectedSizeIds.length > 0 && <div className="selected-sizes-inputs">
              <div className="form-section-heading compact-form-heading"><div><strong>Cantidad por molde</strong></div></div>
              {selectedSizeIds.map((sizeId) => {
                const size = currentModelSizes.find((item) => item.id === sizeId);
                return <section className="entry-size-card" key={sizeId}><div className="entry-size-title"><span className="size-pill">{size?.label}</span><span>{stockOperation === 'entrada' ? 'Stock a ingresar' : 'Stock a retirar'}</span></div>{currentModelPieces.map((piece) => {
                  if (piece.laterality !== 'simetrica') return <label className="piece-entry-row" key={piece.id}><span className="piece-entry-name"><strong>{piece.name}</strong><small>Stock actual: {fmt(Math.max(0, stockForPiece(piece.id, sizeId)))}</small></span>{renderQuantityControl(sizeId, piece, undefined, 'pieza')}</label>;
                  const mode = stockEntryModes[piece.id] ?? 'paridad';
                  const symmetric = getSymmetricStock(movements, piece.id, sizeId);
                  return <div className="piece-entry-row symmetric-entry-row" key={piece.id}><div className="piece-entry-name"><strong>{piece.name}</strong><small>Stock actual: {displayPieceStock(piece, sizeId, true)}{symmetric.unassigned > 0 ? ` · ${displayUnassignedNote(piece, sizeId)}` : ''}</small><div className="side-mode-toggle" role="group" aria-label={`Modo de registro de ${piece.name}`}><button type="button" className={mode === 'paridad' ? 'active' : ''} onClick={() => changeSymmetricEntryMode(piece.id, 'paridad')}>Paridad</button><button type="button" className={mode === 'lados' ? 'active' : ''} onClick={() => changeSymmetricEntryMode(piece.id, 'lados')}>Por lado</button></div>{symmetric.unassigned > 0 && <div className="legacy-assign"><small>{fmt(symmetric.unassigned)} pieza histórica sin lado identificado. Asígnala según el lado físico:</small><div><button type="button" onClick={() => assignLegacyUnitToSide(piece, sizeId, 'izquierda')}>← Izquierda</button><button type="button" onClick={() => assignLegacyUnitToSide(piece, sizeId, 'derecha')}>Derecha →</button></div></div>}</div>{mode === 'paridad' ? <div className="symmetric-quantity"><small>{stockOperation === 'entrada' ? 'Stock a ingresar' : 'Stock a retirar'}</small>{renderQuantityControl(sizeId, piece, 'paridad', 'paridad')}<span className="quantity-hint">1 paridad = 1 izq. + 1 der.</span></div> : <div className="symmetric-side-inputs"><div className="symmetric-side-control"><small>Izquierda · hay {fmt(symmetric.left)}</small>{renderQuantityControl(sizeId, piece, 'izquierda', 'lado izquierdo')}</div><div className="symmetric-side-control"><small>Derecha · hay {fmt(symmetric.right)}</small>{renderQuantityControl(sizeId, piece, 'derecha', 'lado derecho')}</div></div>}</div>;
                })}</section>;
              })}
            </div>}
            <label className="field-label stock-note-field">Observación del movimiento<input className="large-input" value={stockNote} onChange={(event) => setStockNote(event.target.value)} placeholder="Ej. Corte del lote 25/10" /></label>
            <div className="modal-sticky-actions"><span>{fmt(selectedStockTotal)} piezas {stockOperation === 'entrada' ? 'a ingresar' : 'a retirar'}</span><button type="button" className="button secondary" onClick={() => setShowStockForm(false)}>Cancelar</button><button type="submit" className="button primary" disabled={selectedStockTotal <= 0}>{stockOperation === 'entrada' ? 'Guardar ingreso' : 'Confirmar retiro'}</button></div>
          </form>
        </section>
      </div>}

      {showModelForm && <div className="modal-backdrop pattern-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModelForm(); }}>
        <section className="modal model-modal pattern-editor-modal" role="dialog" aria-modal="true" aria-labelledby="model-modal-title">
          <div className="modal-heading">
            <div>
              <div className="eyebrow">PATRÓN BASE</div>
              <h2 id="model-modal-title">{modelForm.editingId ? 'Editar patrón' : 'Crear patrón base'}</h2>
              <p>Configura los datos y las piezas que forman una prenda.</p>
            </div>
            <button className="icon-button" onClick={closeModelForm} aria-label="Cerrar">×</button>
          </div>

          <form onSubmit={saveModel} className="model-form pattern-editor-form">
            <section className="pattern-editor-section">
              <div className="pattern-editor-section-heading">
                <div><strong>1. Datos del patrón</strong><small>Identificación y tallaje que heredarán los modelos.</small></div>
                <span className="pattern-editor-step">BÁSICO</span>
              </div>
              <div className="pattern-editor-basics-grid">
                <label className="field-label pattern-editor-name-field">Nombre del patrón
                  <input className="large-input" required value={modelForm.name} onChange={(event) => setModelForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Ej. Polo básico sublimado" />
                </label>
                <label className="field-label">Familia del patrón
                  <select className="large-input" required value={modelForm.family} onChange={(event) => setModelForm((prev) => ({ ...prev, family: event.target.value }))}>
                    <option value="">Seleccionar familia</option>
                    {families.map((family) => <option key={family.value} value={family.value}>{family.label}</option>)}
                  </select>
                  <button type="button" className="text-action pattern-editor-inline-action" onClick={openFamilyManager}>＋ Administrar familias</button>
                  <small>La familia se hereda en los modelos comerciales.</small>
                </label>
                <label className="field-label">Grupo de tallas
                  <select className="large-input" required value={modelForm.sizeGroupId} onChange={(event) => setModelForm((prev) => ({ ...prev, sizeGroupId: event.target.value, excludedSizeIds: prev.excludedSizeIds.filter((sizeId) => sizes.some((size) => size.id === sizeId && size.groupId === event.target.value)) }))} disabled={Boolean(modelForm.editingId && modelForm.pieces.some((piece) => movements.some((movement) => movement.pieceId === piece.id)))}>
                    <option value="">Seleccionar grupo</option>
                    {sizeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                  <button type="button" className="text-action pattern-editor-inline-action" disabled={Boolean(modelForm.editingId && modelForm.pieces.some((piece) => movements.some((movement) => movement.pieceId === piece.id)))} onClick={openSizeManagerFromModelForm}>＋ Administrar tallas</button>
                  <small>Las tallas se reutilizan entre patrones del mismo grupo.</small>
                </label>
              </div>
            </section>

            <section className="pattern-editor-section pattern-size-selection">
              <div className="pattern-editor-section-heading">
                <div><strong>2. Tallas habilitadas</strong><small>Por defecto se incluyen todas las tallas de la tabla. Desactiva las que este patrón no confecciona.</small></div>
                <span className="pattern-editor-count">{groupSizes(modelForm.sizeGroupId).filter((size) => !modelForm.excludedSizeIds.includes(size.id)).length}/{groupSizes(modelForm.sizeGroupId).length}</span>
              </div>
              <div className="pattern-size-selection-actions">
                <span>{groupSizes(modelForm.sizeGroupId).filter((size) => !modelForm.excludedSizeIds.includes(size.id)).length} tallas activas</span>
                <button type="button" className="text-action" onClick={() => setModelForm((previous) => ({ ...previous, excludedSizeIds: [] }))}>Activar todas</button>
                <button type="button" className="text-action" onClick={() => setModelForm((previous) => ({ ...previous, excludedSizeIds: groupSizes(previous.sizeGroupId).slice(1).map((size) => size.id) }))} disabled={groupSizes(modelForm.sizeGroupId).length <= 1}>Dejar solo la primera</button>
              </div>
              {groupSizes(modelForm.sizeGroupId).length > 0 ? <div className="pattern-size-check-grid">
                {groupSizes(modelForm.sizeGroupId).map((size) => {
                  const active = !modelForm.excludedSizeIds.includes(size.id);
                  return <label className={`pattern-size-check ${active ? 'active' : ''}`} key={size.id}>
                    <input type="checkbox" checked={active} onChange={() => setModelForm((previous) => ({ ...previous, excludedSizeIds: active ? [...previous.excludedSizeIds, size.id] : previous.excludedSizeIds.filter((id) => id !== size.id) }))} />
                    <span>{size.label}</span>
                  </label>;
                })}
              </div> : <div className="pattern-editor-empty"><strong>Esta tabla no tiene tallas</strong><span>Agrega tallas desde «Administrar tallas» para poder usar el patrón.</span></div>}
              <small className="pattern-size-selection-help">Las tallas desactivadas no aparecerán en el modelo comercial, el registro de stock ni la planificación. No se borran de la tabla maestra ni se eliminan sus movimientos anteriores; puedes reactivarlas cuando lo necesites.</small>
            </section>

            <section className="pattern-editor-section">
              <div className="pattern-editor-section-heading">
                <div><strong>3. Piezas por prenda</strong><small>Define cuántas piezas requiere fabricar una unidad.</small></div>
                <span className="pattern-editor-count">{modelForm.pieces.length} {modelForm.pieces.length === 1 ? 'pieza' : 'piezas'}</span>
              </div>

              <div className="pattern-editor-settings-grid">
                <div className="pattern-editor-setting">
                  <div><strong>{modelForm.secondaryFabricSlots + 1} posiciones de tela</strong><small>Principal 1{modelForm.secondaryFabricSlots ? ' · ' + Array.from({ length: modelForm.secondaryFabricSlots }, (_, i) => `Sec. ${i + 1}`).join(' · ') : ''}</small></div>
                  <div className="pattern-editor-slot-stepper">
                    <button type="button" aria-label="Quitar última tela secundaria" title="Quitar última posición de tela" disabled={modelForm.secondaryFabricSlots <= 0 || modelForm.pieces.some((piece) => secondaryFabricSlotIndex(piece.fabricSlot) === modelForm.secondaryFabricSlots)} onClick={() => setModelForm((prev) => ({ ...prev, secondaryFabricSlots: Math.max(0, prev.secondaryFabricSlots - 1) }))}>−</button>
                    <button type="button" aria-label="Añadir tela secundaria" title="Añadir posición de tela" onClick={() => setModelForm((prev) => ({ ...prev, secondaryFabricSlots: prev.secondaryFabricSlots + 1 }))}>＋</button>
                  </div>
                </div>
                <div className="pattern-editor-setting">
                  <div><strong>{modelForm.secondaryColorSlots + 1} posiciones de color</strong><small>Principal 1{modelForm.secondaryColorSlots ? ' · ' + Array.from({ length: modelForm.secondaryColorSlots }, (_, i) => `Sec. ${i + 1}`).join(' · ') : ''}</small></div>
                  <div className="pattern-editor-slot-stepper">
                    <button type="button" aria-label="Quitar último color secundario" title="Quitar última posición de color" disabled={modelForm.secondaryColorSlots <= 0 || modelForm.pieces.some((piece) => secondaryColorSlotIndex(piece.colorSlot) === modelForm.secondaryColorSlots)} onClick={() => setModelForm((prev) => ({ ...prev, secondaryColorSlots: Math.max(0, prev.secondaryColorSlots - 1) }))}>−</button>
                    <button type="button" aria-label="Añadir color secundario" title="Añadir posición de color" onClick={() => setModelForm((prev) => ({ ...prev, secondaryColorSlots: prev.secondaryColorSlots + 1 }))}>＋</button>
                  </div>
                </div>
              </div>

              <div className="pattern-editor-piece-heading">
                <div><strong>Lista de moldes</strong><small>Orden de corte y configuración de cada pieza.</small></div>
                <button type="button" className="button secondary pattern-editor-add-button" onClick={() => setModelForm((prev) => ({ ...prev, pieces: [...prev.pieces, { id: '', name: '', unitsPerGarment: '1', laterality: 'ninguna', fabricSlot: 'principal', colorSlot: 'principal', colorId: '', colorOverride: false, fabricType: 'Tela principal 1', color: '' }] }))}>＋ Añadir molde</button>
              </div>

              <div className="piece-editor-list pattern-editor-piece-list">
                {modelForm.pieces.map((piece, index) => <article className="piece-editor pattern-editor-piece" key={piece.id || `new-${index}`}>
                  <div className="piece-editor-top pattern-editor-piece-top">
                    <div className="pattern-editor-piece-title"><span className="pattern-editor-piece-number">{String(index + 1).padStart(2, '0')}</span><div><strong>Molde {index + 1}</strong><small>Parte de la prenda</small></div></div>
                    <div className="mold-order-actions">
                      <button type="button" className="order-mold" disabled={index === 0} aria-label="Mover molde arriba" onClick={() => moveMold(index, -1)}>↑</button>
                      <button type="button" className="order-mold" disabled={index === modelForm.pieces.length - 1} aria-label="Mover molde abajo" onClick={() => moveMold(index, 1)}>↓</button>
                      {modelForm.pieces.length > 1 && <button type="button" className="remove-piece" onClick={() => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.filter((_, pieceIndex) => pieceIndex !== index) }))}>Quitar</button>}
                    </div>
                  </div>
                  <div className="piece-editor-fields mold-fields-row pattern-editor-piece-fields">
                    <label className="field-label">Nombre del molde
                      <input className="large-input" required value={piece.name} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => pieceIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="Ej. Delantero, manga…" />
                    </label>
                    <label className="field-label">Piezas por prenda
                      <input className="large-input" required type="number" inputMode="numeric" min="1" step="1" value={piece.unitsPerGarment} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => pieceIndex === index ? { ...item, unitsPerGarment: event.target.value } : item) }))} />
                    </label>
                    <label className="field-label">Lateralidad
                      <select className="large-input" value={piece.laterality} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => { if (pieceIndex !== index) return item; const laterality = event.target.value as Laterality; const currentUnits = Number(item.unitsPerGarment); const unitsPerGarment = laterality === 'simetrica' && (!Number.isInteger(currentUnits) || currentUnits < 2 || currentUnits % 2 !== 0) ? String(Math.max(2, Math.ceil((currentUnits || 1) / 2) * 2)) : item.unitsPerGarment; return { ...item, laterality, unitsPerGarment }; }) }))}>
                        <option value="ninguna">Sin lado</option><option value="simetrica">Simétrica (par)</option><option value="izquierda">Solo izquierda</option><option value="derecha">Solo derecha</option>
                      </select>
                    </label>
                    <label className="field-label">Posición de tela
                      <select className="large-input" value={piece.fabricSlot} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => pieceIndex === index ? { ...item, fabricSlot: event.target.value as FabricSlot, fabricType: fabricSlotLabel(event.target.value as FabricSlot) } : item) }))}>
                        {fabricSlotOptions(modelForm.secondaryFabricSlots).map((slot) => <option key={slot} value={slot}>{fabricSlotLabel(slot)}</option>)}
                      </select>
                      <small>«Cualquier tela» permite decidirla en cada modelo comercial.</small>
                    </label>
                    <label className="field-label">Posición de color
                      <select className="large-input" value={piece.colorSlot} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => pieceIndex === index ? { ...item, colorSlot: event.target.value } : item) }))}>
                        {colorSlotOptions(modelForm.secondaryColorSlots).map((slot) => <option key={slot} value={slot}>{colorSlotLabel(slot)}</option>)}
                      </select>
                      <small>El color definitivo se asigna al crear el modelo.</small>
                    </label>
                  </div>
                </article>)}
                {modelForm.pieces.length === 0 && <div className="pattern-editor-empty"><strong>Aún no hay moldes</strong><span>Añade la primera pieza para definir cómo se compone la prenda.</span><button type="button" className="button secondary" onClick={() => setModelForm((prev) => ({ ...prev, pieces: [...prev.pieces, { id: '', name: '', unitsPerGarment: '1', laterality: 'ninguna', fabricSlot: 'principal', colorSlot: 'principal', colorId: '', colorOverride: false, fabricType: 'Tela principal 1', color: '' }] }))}>＋ Añadir primer molde</button></div>}
              </div>
              <details className="pattern-editor-help">
                <summary>¿Cómo funciona la lateralidad simétrica?</summary>
                <p>Un par simétrico necesita una pieza izquierda y una derecha. Por eso, al elegir «Simétrica (par)», la cantidad por prenda debe ser par: ×2 representa una pieza por lado. El inventario puede registrar paridades o lados por separado.</p>
              </details>
            </section>

            <div className="form-actions pattern-editor-actions">
              <button type="button" className="button secondary" onClick={closeModelForm}>Cancelar</button>
              <button type="submit" className="button primary">{modelForm.editingId ? 'Guardar cambios' : 'Crear patrón'}</button>
            </div>
          </form>
        </section>
      </div>}

      {showFamilyManager && <div className="modal-backdrop family-manager-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelFamilyManager(); }}>
        <section className="modal family-manager-modal" role="dialog" aria-modal="true" aria-labelledby="family-manager-title">
          <div className="modal-heading">
            <div>
              <div className="eyebrow">BIBLIOTECA DE PATRONES</div>
              <h2 id="family-manager-title">Administrar familias</h2>
              <p>Crea y organiza categorías que agrupan patrones y sus modelos comerciales.</p>
            </div>
            <button className="icon-button" onClick={cancelFamilyManager} aria-label="Cerrar y descartar cambios">×</button>
          </div>

          <div className="family-manager-add">
            <label className="field-label">Nueva familia
              <input className="large-input" value={newFamilyLabel} onChange={(event) => setNewFamilyLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDraftFamily(); } }} placeholder="Ej. Medias, gorros, capas…" />
            </label>
            <button type="button" className="button primary" onClick={addDraftFamily}>＋ Agregar</button>
          </div>

          <div className="family-manager-list">
            <div className="family-manager-list-heading"><strong>Familias disponibles</strong><span>{draftFamilies.length} categorías</span></div>
            {draftFamilies.map((family) => {
              const usage = familyUsage(family.value);
              return <article className="family-manager-row" key={family.value}>
                <div className="family-manager-symbol" aria-hidden="true">◇</div>
                <div className="family-manager-row-content">
                  <label className="field-label">Nombre visible
                    <input className="large-input" value={family.label} onChange={(event) => setDraftFamilies((previous) => previous.map((item) => item.value === family.value ? { ...item, label: event.target.value } : item))} />
                  </label>
                  <small className={usage.total > 0 ? 'family-manager-usage is-used' : 'family-manager-usage'}>
                    {usage.total > 0
                      ? `En uso: ${usage.patternCount} patrones · ${usage.recipeCount} recetas`
                      : 'Sin patrones ni recetas asociadas'}
                  </small>
                </div>
                <button type="button" className="remove-piece family-manager-delete" disabled={usage.total > 0} onClick={() => removeDraftFamily(family.value)} title={usage.total > 0 ? 'Reasigna primero los patrones y recetas asociados' : 'Eliminar familia'}>Eliminar</button>
              </article>;
            })}
            {draftFamilies.length === 0 && <div className="pattern-editor-empty"><strong>No hay familias</strong><span>Agrega al menos una familia para clasificar tus patrones.</span></div>}
          </div>

          <div className={`size-manager-pending ${hasPendingFamilyChanges ? 'has-changes' : ''}`}>
            <span aria-hidden="true">{hasPendingFamilyChanges ? '●' : '○'}</span>
            <div><strong>{hasPendingFamilyChanges ? 'Cambios pendientes por aplicar' : 'Sin cambios pendientes'}</strong><small>{hasPendingFamilyChanges ? 'Los nombres y nuevas familias se guardarán al confirmar.' : 'Puedes renombrar familias sin perder sus vínculos.'}</small></div>
          </div>

          <div className="form-actions family-manager-footer">
            <button type="button" className="button secondary" onClick={cancelFamilyManager}>Cancelar</button>
            <button type="button" className="button primary" onClick={applyFamilyManager}>Guardar familias</button>
          </div>
        </section>
      </div>}

      {showSizeManager && <div className="modal-backdrop size-manager-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelSizeManager(); }}>
        <section className="modal size-manager-modal size-manager-transactional" role="dialog" aria-modal="true" aria-labelledby="size-manager-title">
          <div className="modal-heading">
            <div>
              <div className="eyebrow">CONFIGURACIÓN DE TALLAS</div>
              <h2 id="size-manager-title">Editar grupos y tallas</h2>
              <p>Los cambios se preparan aquí y solo se aplican cuando pulsas «Listo».</p>
            </div>
            <button className="icon-button" onClick={cancelSizeManager} aria-label="Cerrar y descartar cambios">×</button>
          </div>

          <div className="size-manager-groups">
            <label className="field-label">Grupo de tallas
              <select className="large-input" value={sizeManagerGroupId} onChange={(event) => setSizeManagerGroupId(event.target.value)}>
                {draftSizeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            {selectedManagerGroup && <label className="field-label size-group-name-editor">Nombre del grupo seleccionado
              <input className="large-input" value={selectedManagerGroup.name} onChange={(event) => setDraftSizeGroups((previous) => previous.map((group) => group.id === sizeManagerGroupId ? { ...group, name: event.target.value } : group))} placeholder="Ej. Tallas comerciales 4–XL" />
              <small>Renombrar no cambia el ID: los patrones y modelos asociados seguirán vinculados. Se aplicará al pulsar «Listo».</small>
            </label>}
            <div className="add-group-row">
              <input className="large-input" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Nuevo grupo: p. ej. Medias" aria-label="Nombre del nuevo grupo" />
              <button type="button" className="button secondary" onClick={addSizeGroup}>＋ Crear grupo</button>
            </div>
          </div>

          <div className="add-size-row">
            <input className="large-input" value={newSizeLabel} onChange={(event) => setNewSizeLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSize(); } }} placeholder="Nueva talla: T4, S, M, 6 a 9 años…" aria-label="Nombre de la nueva talla" />
            <button type="button" className="button primary" onClick={addSize}>＋ Agregar talla</button>
          </div>

          <div className="size-manager-list">
            {managerGroupSizes(sizeManagerGroupId).map((size, index) => <div className="size-manager-row" key={size.id}>
              <span className="size-order">{index + 1}</span>
              <label className="size-name-label">Nombre visible
                <input className="large-input" aria-label={`Nombre de talla ${size.label}`} title="El cambio queda pendiente hasta pulsar Listo." value={size.label} onChange={(event) => setDraftSizes((previous) => previous.map((item) => item.id === size.id ? { ...item, label: event.target.value } : item))} />
              </label>
              <div className="size-manager-actions">
                <button type="button" className="order-mold" disabled={index === 0} onClick={() => reorderSize(size.id, -1)} aria-label="Subir talla">↑</button>
                <button type="button" className="order-mold" disabled={index === managerGroupSizes(sizeManagerGroupId).length - 1} onClick={() => reorderSize(size.id, 1)} aria-label="Bajar talla">↓</button>
                <button type="button" className="remove-piece" onClick={() => deleteSize(size)}>Eliminar</button>
              </div>
            </div>)}
            {managerGroupSizes(sizeManagerGroupId).length === 0 && <div className="empty">Este grupo todavía no tiene tallas. Agrega la primera arriba.</div>}
          </div>

          <div className={`size-manager-pending ${hasPendingSizeManagerChanges ? 'has-changes' : ''}`}>
            <span aria-hidden="true">{hasPendingSizeManagerChanges ? '●' : '○'}</span>
            <div><strong>{hasPendingSizeManagerChanges ? 'Cambios pendientes por aplicar' : 'Sin cambios pendientes'}</strong><small>{hasPendingSizeManagerChanges ? 'Nada se modifica en el inventario hasta pulsar «Listo».' : 'Puedes editar nombres, agregar, eliminar u ordenar tallas.'}</small></div>
          </div>

          <div className="form-actions size-manager-footer">
            <button type="button" className="button secondary" onClick={cancelSizeManager}>Cancelar</button>
            <button type="button" className="button primary" onClick={applySizeManager}>Listo · aplicar cambios</button>
          </div>
        </section>
      </div>}
      {missingTarget && (() => {
        const model = models.find((item) => item.id === missingTarget.modelId);
        const size = sizes.find((item) => item.id === missingTarget.sizeId);
        if (!model || !size) return null;
        const parts = modelPieces(model.id);
        const completeUnits = getCompleteUnits(parts, movements, size.id);
        const maxTargetUnits = getMaximumTargetUnits(parts, movements, size.id);
        const nextUnitTarget = completeUnits + 1;
        const targetSliderMax = Math.max(nextUnitTarget, maxTargetUnits);
        const targetUnits = Math.max(nextUnitTarget, Math.min(missingTarget.targetUnits ?? nextUnitTarget, targetSliderMax));
        const shortages = getPieceShortages(parts, movements, size.id, targetUnits);
        const totalMissing = shortages.reduce((sum, shortage) => sum + shortage.missing, 0);
        const initialEntryModes = Object.fromEntries(shortages
          .filter((shortage) => shortage.piece.laterality === 'simetrica' && shortage.missing > 0)
          .map((shortage) => [shortage.piece.id, (shortage.missingLeft ?? 0) === (shortage.missingRight ?? 0) ? 'paridad' as SymmetricEntryMode : 'lados' as SymmetricEntryMode]));
        const initialAmounts = Object.fromEntries(shortages.flatMap((shortage) => {
          if (shortage.missing <= 0) return [];
          if (shortage.piece.laterality === 'simetrica') {
            const missingLeft = shortage.missingLeft ?? 0;
            const missingRight = shortage.missingRight ?? 0;
            if (missingLeft === missingRight) {
              return missingLeft > 0 ? [[`${size.id}::${shortage.piece.id}::paridad`, String(missingLeft)] as [string, string]] : [];
            }
            return [
              ...(missingLeft > 0 ? [[`${size.id}::${shortage.piece.id}::izquierda`, String(missingLeft)] as [string, string]] : []),
              ...(missingRight > 0 ? [[`${size.id}::${shortage.piece.id}::derecha`, String(missingRight)] as [string, string]] : []),
            ];
          }
          return [[`${size.id}::${shortage.piece.id}`, String(shortage.missing)] as [string, string]];
        }));
        return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMissingTarget(null); }}>
          <section className="modal shortage-modal" role="dialog" aria-modal="true" aria-labelledby="shortage-modal-title">
            <div className="modal-heading"><div><div className="eyebrow">PLAN DE PRODUCCIÓN</div><h2 id="shortage-modal-title">Faltantes · talla {size.label}</h2><p>{model.name}</p></div><button className="icon-button" onClick={() => setMissingTarget(null)} aria-label="Cerrar">×</button></div>
            <div className="target-summary"><div><strong>{fmt(completeUnits)}</strong><span>unidades fabricables con stock actual</span></div></div>
            <div className="target-slider-wrap"><div className="target-slider-labels"><span>Siguiente: {completeUnits + 1}</span><strong>Meta: {targetUnits}</strong><span>Máx.: {maxTargetUnits}</span></div><input aria-label="Cantidad objetivo de prendas" type="range" min={completeUnits + 1} max={targetSliderMax} step="1" value={targetUnits} onChange={(event) => setMissingTarget((previous) => previous ? { ...previous, targetUnits: Number(event.target.value) } : previous)} /><p>La capacidad depende del molde con menos stock. En moldes simétricos, cuenta el lado con menos piezas.</p></div>
            <p className="shortage-intro">Puedes fabricar <strong>{completeUnits}</strong> ahora. Para llegar a <strong>{targetUnits} prendas</strong> de talla <strong>{size.label}</strong>, todos los moldes deben alcanzar.</p>
            <div className="shortage-list" aria-label="Detalle de stock y faltantes por molde">{shortages.map((shortage) => {
              const { piece, currentStock, currentCapacity, requiredForTarget, missing } = shortage;
              const isSymmetric = piece.laterality === 'simetrica';
              const stockDisplay = isSymmetric && shortage.symmetricStock ? formatSymmetricStock(shortage.symmetricStock, true) : fmt(currentStock);
              const stockLabel = 'Stock';
              const metaDisplay = isSymmetric ? `${fmt(requiredForTarget / 2)} par.` : fmt(requiredForTarget);
              const metaLabel = 'Meta';
              const statusText = missing === 0 ? 'Suficiente' : isSymmetric ? `I:${fmt(shortage.missingLeft ?? 0)} · D:${fmt(shortage.missingRight ?? 0)}` : `Faltan ${fmt(missing)}`;
              const unassigned = shortage.symmetricStock?.unassigned ?? 0;
              return <div className={`shortage-row ${missing === 0 ? 'enough' : 'needs-stock'}`} key={piece.id}>
                <span className="shortage-check" aria-hidden="true">{missing === 0 ? '✓' : '!'}</span>
                <div className="shortage-piece">
                  <div className="shortage-piece-heading"><strong>{piece.name}</strong><span className={`shortage-value ${missing === 0 ? 'status-ok' : 'status-missing'}`}>{statusText}</span></div>
                  <div className="shortage-metrics"><span className="shortage-metric"><small>{stockLabel}</small><strong>{stockDisplay}</strong></span><span className="shortage-metric"><small>Rinde</small><strong>{fmt(currentCapacity)} <em>prendas</em></strong></span><span className="shortage-metric"><small>{metaLabel}</small><strong>{metaDisplay}</strong></span></div>
                  {unassigned > 0 && <small className="shortage-legacy-note">{fmt(unassigned)} pieza(s) histórica(s) todavía sin lado identificado.</small>}
                </div>
              </div>;
            })}</div>
            <div className="shortage-total"><span>Total de piezas por reponer para fabricar {fmt(targetUnits)} prendas</span><strong>{fmt(totalMissing)}</strong></div>
            <div className="form-actions"><button className="button secondary" onClick={() => setMissingTarget(null)}>Cerrar</button><button className="button primary" onClick={() => { setSelectedModelId(model.id); setSelectedSizeIds([size.id]); setStockAmounts(initialAmounts); setStockEntryModes(initialEntryModes); setStockOperation('entrada'); setStockNote(`Piezas faltantes para meta de ${targetUnits} prendas`); setMissingTarget(null); setShowStockForm(true); }}>Registrar piezas faltantes</button></div>
          </section>
        </div>;
      })()}


      {showBackupModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowBackupModal(false); }}>
        <section className="modal backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-modal-title">
          <div className="modal-heading"><div><div className="eyebrow">DATOS LOCALES</div><h2 id="backup-modal-title">Importar y exportar datos</h2><p>Haz una copia completa para guardar o trasladar tu inventario a otro navegador.</p></div><button className="icon-button" onClick={() => setShowBackupModal(false)} aria-label="Cerrar">×</button></div>
          <div className="backup-options">
            <article className="backup-option">
              <div className="backup-option-icon export">↓</div>
              <h3>Guardar una copia</h3>
              <p>Descarga fabricación, telas, rollos, compras, proveedores, mediciones y todo el historial en un solo archivo.</p>
              <button type="button" className="button primary" disabled={!ready} onClick={exportFullBackup}>Descargar respaldo</button>
            </article>
            <article className="backup-option">
              <div className="backup-option-icon import">↑</div>
              <h3>Restaurar una copia</h3>
              <p>Selecciona un archivo de respaldo completo de TelaStock para recuperar tus datos.</p>
              <button type="button" className="button secondary" disabled={!ready} onClick={() => backupInputRef.current?.click()}>Elegir archivo JSON</button>
              <input ref={backupInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importFullBackup(event.target.files?.[0])} />
            </article>
          </div>
          <div className="backup-warning"><strong>Importante:</strong> restaurar reemplaza los datos de este navegador. Si quieres conservar ambos inventarios, descarga una copia antes de restaurar.</div>
          <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowBackupModal(false)}>Cerrar</button></div>
        </section>
      </div>}

      <footer className="mobile-footer"><span>●</span> TelaStock · Inventario de fabricación</footer>
    </main>
  );
}
