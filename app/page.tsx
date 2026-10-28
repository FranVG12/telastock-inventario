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

type View = 'inventario' | 'modelos' | 'historial';
type StockFilter = 'Con stock' | 'Vacío' | 'Todos';
type SymmetricEntryMode = 'paridad' | 'lados';
type StockSlot = 'paridad' | StockSide;
type ModelFormPiece = { id: string; name: string; unitsPerGarment: string; laterality: Laterality; fabricType: string; color: string };
type ModelFormState = { editingId: string | null; name: string; sizeGroupId: string; pieces: ModelFormPiece[] };

const STORAGE = {
  groups: 'telastock-size-groups-v1',
  sizes: 'telastock-sizes-v1',
  models: 'telastock-manufacturing-models-v1',
  pieces: 'telastock-model-pieces-v1',
  movements: 'telastock-piece-movements-v1',
};
const nf = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
const fmt = (value: number) => nf.format(value);
const newId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankModelForm = (sizeGroupId: string): ModelFormState => ({
  editingId: null,
  name: '',
  sizeGroupId,
  pieces: [{ id: '', name: 'Pecho', unitsPerGarment: '1', laterality: 'ninguna', fabricType: 'Poliéster deportivo', color: 'Rojo' }],
});

export default function Home() {
  const [view, setView] = useState<View>('inventario');
  const [sizeGroups, setSizeGroups] = useState<SizeGroup[]>(demoSizeGroups);
  const [sizes, setSizes] = useState<Size[]>(demoSizes);
  const [models, setModels] = useState<ManufacturingModel[]>(demoModels);
  const [pieces, setPieces] = useState<ModelPiece[]>(demoPieces);
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
  const [sizeManagerGroupId, setSizeManagerGroupId] = useState(demoSizeGroups[0].id);
  const [newSizeLabel, setNewSizeLabel] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [modelForm, setModelForm] = useState<ModelFormState>(() => blankModelForm(demoSizeGroups[0].id));
  const [notice, setNotice] = useState<{ message: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [adminMode, setAdminMode] = useState(false);

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
      setModels(load(STORAGE.models, demoModels));
      // Backward-compatible migration for localStorage created before fabric/color fields existed.
      setPieces((load<ModelPiece[]>(STORAGE.pieces, demoPieces)).map((piece) => ({ ...piece, fabricType: piece.fabricType ?? 'Poliéster deportivo', color: piece.color ?? 'Sin especificar' }))); 
      setMovements(load(STORAGE.movements, demoMovements));
    } catch {
      setNotice({ message: 'No se pudo leer el almacenamiento del navegador. Se muestran los datos de demostración.', kind: 'info' });
    }
    setReady(true);
  }, []);

  // Persistencia provisional local para el MVP visual. Nunca se presenta como sincronizada.
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.groups, JSON.stringify(sizeGroups)); }, [sizeGroups, ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.sizes, JSON.stringify(sizes)); }, [sizes, ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.models, JSON.stringify(models)); }, [models, ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.pieces, JSON.stringify(pieces)); }, [pieces, ready]);
  useEffect(() => { if (ready) localStorage.setItem(STORAGE.movements, JSON.stringify(movements)); }, [movements, ready]);

  const groupById = useMemo(() => new Map(sizeGroups.map((group) => [group.id, group])), [sizeGroups]);
  const modelPieces = (modelId: string) => pieces.filter((piece) => piece.modelId === modelId && !piece.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const groupSizes = (groupId: string) => sizes.filter((size) => size.groupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder);
  const modelSizes = (model: ManufacturingModel) => groupSizes(model.sizeGroupId);
  const stockForPiece = (pieceId: string, sizeId: string) => getPieceStock(movements, pieceId, sizeId);
  const hasStockForSize = (model: ManufacturingModel, sizeId: string) => sizeHasStock(modelPieces(model.id), movements, sizeId);
  const modelHasAnyStock = (model: ManufacturingModel) => modelSizes(model).some((size) => hasStockForSize(model, size.id));
  const completeForSize = (model: ManufacturingModel, sizeId: string) => getCompleteUnits(modelPieces(model.id), movements, sizeId);
  const totalCurrentPieceStock = useMemo(() => pieces.reduce((sum, piece) => sum + sizes.filter((size) => size.groupId === models.find((m) => m.id === piece.modelId)?.sizeGroupId).reduce((sub, size) => sub + Math.max(0, getPieceStock(movements, piece.id, size.id)), 0), 0), [pieces, sizes, models, movements]);
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
            if (stockOperation === 'salida' && quantity > 0 && (quantity > current.left || quantity > current.right)) {
              setNoticeMessage(`No puedes retirar ${fmt(quantity)} paridades de ${piece.name}, talla ${sizes.find((item) => item.id === sizeId)?.label ?? '—'}: hay ${fmt(current.left)} izquierda y ${fmt(current.right)} derecha.`, 'error');
              return;
            }
            pushMovement(piece, sizeId, quantity, 'izquierda');
            pushMovement(piece, sizeId, quantity, 'derecha');
          } else {
            const leftQuantity = readAmount(sizeId, piece.id, 'izquierda');
            const rightQuantity = readAmount(sizeId, piece.id, 'derecha');
            if (!validateQuantity(leftQuantity, piece.name, sizeId, 'izquierda') || !validateQuantity(rightQuantity, piece.name, sizeId, 'derecha')) return;
            if (stockOperation === 'salida' && leftQuantity > current.left) {
              setNoticeMessage(`No puedes retirar ${fmt(leftQuantity)} piezas del lado izquierdo de ${piece.name}: solo hay ${fmt(current.left)}.`, 'error'); return;
            }
            if (stockOperation === 'salida' && rightQuantity > current.right) {
              setNoticeMessage(`No puedes retirar ${fmt(rightQuantity)} piezas del lado derecho de ${piece.name}: solo hay ${fmt(current.right)}.`, 'error'); return;
            }
            pushMovement(piece, sizeId, leftQuantity, 'izquierda');
            pushMovement(piece, sizeId, rightQuantity, 'derecha');
          }
          continue;
        }

        const quantity = readAmount(sizeId, piece.id);
        if (!validateQuantity(quantity, piece.name, sizeId)) return;
        if (stockOperation === 'salida' && quantity > stockForPiece(piece.id, sizeId)) {
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

  function openCreateModel() {
    setModelForm(blankModelForm(sizeGroups[0]?.id ?? ''));
    setShowModelForm(true);
  }

  function openEditModel(model: ManufacturingModel) {
    setModelForm({
      editingId: model.id,
      name: model.name,
      sizeGroupId: model.sizeGroupId,
      pieces: modelPieces(model.id).map((piece) => ({ id: piece.id, name: piece.name, unitsPerGarment: String(piece.unitsPerGarment), laterality: piece.laterality, fabricType: piece.fabricType ?? '', color: piece.color ?? '' })),
    });
    setShowModelForm(true);
  }

  // Important for future edits: a mold with movement history is archived, never hard-deleted.
  // Archived molds are excluded from the current pattern calculation but remain available to history.
  function saveModel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanName = modelForm.name.trim();
    const cleanPieces = modelForm.pieces.map((piece) => ({ ...piece, name: piece.name.trim(), fabricType: piece.fabricType.trim(), color: piece.color.trim(), units: Number(piece.unitsPerGarment) }));
    if (!cleanName) { setNoticeMessage('Escribe el nombre del modelo.', 'error'); return; }
    if (!modelForm.sizeGroupId) { setNoticeMessage('Selecciona un grupo de tallas.', 'error'); return; }
    if (cleanPieces.length === 0 || cleanPieces.some((piece) => !piece.name || !Number.isInteger(piece.units) || piece.units < 1)) {
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

    const previousPieces = modelForm.editingId ? modelPieces(modelForm.editingId) : [];
    const removedPieces = previousPieces.filter((oldPiece) => !cleanPieces.some((formPiece) => formPiece.id === oldPiece.id));
    // Never hard-delete a mold that has ledger rows: archive it from the active model instead.
    // This fixes the old save blocker while preserving historical movement references.
    const archivedRemovedIds = new Set(removedPieces.filter((piece) => movements.some((movement) => movement.pieceId === piece.id)).map((piece) => piece.id));
    if (modelForm.editingId) {
      const original = models.find((model) => model.id === modelForm.editingId);
      const hasMovementHistory = previousPieces.some((piece) => movements.some((movement) => movement.pieceId === piece.id));
      if (original && original.sizeGroupId !== modelForm.sizeGroupId && hasMovementHistory) {
        setNoticeMessage('No se puede cambiar el grupo de tallas después de registrar movimientos. Crea un nuevo modelo para conservar la trazabilidad.', 'error'); return;
      }
    }

    const modelId = modelForm.editingId ?? newId();
    const savedModel: ManufacturingModel = { id: modelId, name: cleanName, sizeGroupId: modelForm.sizeGroupId, updatedAt: new Date().toISOString() };
    const savedPieces: ModelPiece[] = cleanPieces.map((formPiece, index) => ({
      id: formPiece.id || newId(), modelId, name: formPiece.name, unitsPerGarment: formPiece.units,
      laterality: formPiece.laterality, fabricType: formPiece.fabricType || 'Sin especificar', color: formPiece.color || 'Sin especificar', sortOrder: index + 1, archived: false,
    }));
    setModels((previous) => modelForm.editingId ? previous.map((model) => model.id === modelId ? savedModel : model) : [...previous, savedModel]);
    setPieces((previous) => [...previous.filter((piece) => piece.modelId !== modelId || piece.archived || archivedRemovedIds.has(piece.id)).map((piece) => archivedRemovedIds.has(piece.id) ? { ...piece, archived: true } : piece), ...savedPieces]);
    setShowModelForm(false);
    setView('modelos');
    setNoticeMessage(modelForm.editingId ? 'Modelo actualizado.' : 'Modelo y moldes registrados.');
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

  function addSize() {
    const label = newSizeLabel.trim();
    if (!label || !sizeManagerGroupId) return;
    if (sizes.some((size) => size.groupId === sizeManagerGroupId && size.label.toLocaleLowerCase('es') === label.toLocaleLowerCase('es'))) {
      setNoticeMessage('Ya existe esa talla en el grupo seleccionado.', 'error'); return;
    }
    const sortOrder = Math.max(0, ...sizes.filter((size) => size.groupId === sizeManagerGroupId).map((size) => size.sortOrder)) + 1;
    setSizes((previous) => [...previous, { id: newId(), groupId: sizeManagerGroupId, label, sortOrder }]);
    setNewSizeLabel('');
    setNoticeMessage(`Talla ${label} creada.`);
  }

  function renameSize(sizeId: string, label: string) {
    const current = sizes.find((size) => size.id === sizeId);
    if (!current) return;
    const clean = label.trim().toLocaleLowerCase('es');
    if (clean && sizes.some((size) => size.id !== sizeId && size.groupId === current.groupId && size.label.trim().toLocaleLowerCase('es') === clean)) {
      setNoticeMessage('Ya existe una talla con ese nombre en este grupo.', 'error'); return;
    }
    setSizes((previous) => previous.map((size) => size.id === sizeId ? { ...size, label } : size));
  }

  function reorderSize(sizeId: string, direction: -1 | 1) {
    const ordered = groupSizes(sizeManagerGroupId);
    const index = ordered.findIndex((size) => size.id === sizeId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= ordered.length) return;
    const reordered = [...ordered];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    setSizes((previous) => previous.map((size) => {
      const position = reordered.findIndex((item) => item.id === size.id);
      return position >= 0 ? { ...size, sortOrder: position + 1 } : size;
    }));
  }

  function deleteSize(size: Size) {
    if (movements.some((movement) => movement.sizeId === size.id)) {
      setNoticeMessage(`No se puede borrar la talla ${size.label} porque tiene movimientos históricos. Renómbrala o déjala sin usar para conservar la trazabilidad.`, 'error'); return;
    }
    setSizes((previous) => previous.filter((item) => item.id !== size.id));
    setNoticeMessage(`Talla ${size.label} eliminada.`);
  }

  function addSizeGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    if (sizeGroups.some((group) => group.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
      setNoticeMessage('Ya existe un grupo con ese nombre.', 'error'); return;
    }
    const group = { id: newId(), name };
    setSizeGroups((previous) => [...previous, group]);
    setSizeManagerGroupId(group.id);
    setNewGroupName('');
    setNoticeMessage(`Grupo de tallas ${name} creado.`);
  }

  function exportConfiguration() {
    const payload = { schemaVersion: 2, exportedAt: new Date().toISOString(), sizeGroups, sizes, models, pieces: pieces.filter((piece) => !piece.archived) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'telastock-moldes-y-tallas.json'; anchor.click(); URL.revokeObjectURL(url);
  }

  // Configuration import merges master data by ID and intentionally leaves movement history untouched.
  async function importConfiguration(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { sizeGroups?: SizeGroup[]; sizes?: Size[]; models?: ManufacturingModel[]; pieces?: ModelPiece[] };
      if (!Array.isArray(parsed.sizeGroups) || !Array.isArray(parsed.sizes) || !Array.isArray(parsed.models) || !Array.isArray(parsed.pieces)) {
        throw new Error('El archivo debe contener sizeGroups, sizes, models y pieces.');
      }
      // Import is an upsert-by-ID of master data. Existing movements are not overwritten.
      const merge = <T extends { id: string }>(current: T[], incoming: T[]) => {
        const map = new Map(current.map((item) => [item.id, item]));
        incoming.forEach((item) => map.set(item.id, item));
        return [...map.values()];
      };
      setSizeGroups((current) => merge(current, parsed.sizeGroups!));
      setSizes((current) => merge(current, parsed.sizes!));
      setModels((current) => merge(current, parsed.models!));
      setPieces((current) => merge(current, parsed.pieces!.map((piece) => ({ ...piece, fabricType: piece.fabricType ?? 'Sin especificar', color: piece.color ?? 'Sin especificar', archived: false }))));
      setNoticeMessage('Configuración importada. Se combinaron los modelos, moldes y tallas por ID; el historial de movimientos existente se conservó.');
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
      const payload = {
        app: 'TelaStock',
        backupType: 'full',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        data: { sizeGroups, sizes, models, pieces, movements },
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
      setNoticeMessage('Respaldo completo descargado. Guárdalo en un lugar seguro; incluye modelos, moldes, tallas y todo el historial.');
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
      if (!isRecord(raw) || raw.app !== 'TelaStock' || raw.backupType !== 'full' || raw.schemaVersion !== 1 || !isRecord(raw.data)) {
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
      const importedSizes = getRows('sizes') as unknown as Size[];
      const importedModels = getRows('models') as unknown as ManufacturingModel[];
      const importedPieces = getRows('pieces') as unknown as ModelPiece[];
      const importedMovements = getRows('movements') as unknown as PieceMovement[];
      const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
      const groupIds = new Set(importedGroups.map((item) => item.id));
      const sizeIds = new Set(importedSizes.map((item) => item.id));
      const modelIds = new Set(importedModels.map((item) => item.id));
      const pieceIds = new Set(importedPieces.map((item) => item.id));

      if (!importedGroups.every((item) => hasText(item.name))) throw new Error('Hay grupos de tallas sin nombre.');
      if (!importedSizes.every((item) => hasText(item.label) && groupIds.has(item.groupId) && Number.isInteger(item.sortOrder))) throw new Error('Hay tallas incompletas o vinculadas a un grupo inexistente.');
      if (!importedModels.every((item) => hasText(item.name) && groupIds.has(item.sizeGroupId))) throw new Error('Hay modelos incompletos o vinculados a un grupo inexistente.');
      if (!importedPieces.every((item) =>
        hasText(item.name) &&
        modelIds.has(item.modelId) &&
        Number.isInteger(item.unitsPerGarment) &&
        item.unitsPerGarment > 0 &&
        ['simetrica', 'izquierda', 'derecha', 'ninguna'].includes(item.laterality) &&
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

      const confirmed = window.confirm(
        `Vas a restaurar ${importedModels.length} modelos, ${importedPieces.length} moldes y ${importedMovements.length} movimientos. Esto reemplazará todos los datos guardados actualmente en este navegador. Exporta un respaldo de lo actual antes de continuar si lo necesitas. ¿Continuar?`
      );
      if (!confirmed) return;

      setSizeGroups(importedGroups);
      setSizes(importedSizes);
      setModels(importedModels);
      setPieces(importedPieces.map((piece) => ({
        ...piece,
        fabricType: piece.fabricType ?? 'Sin especificar',
        color: piece.color ?? 'Sin especificar',
      })));
      setMovements(importedMovements);
      setExpandedModels(importedModels.slice(0, 1).map((model) => model.id));
      setSelectedModelId(importedModels[0]?.id ?? '');
      setSelectedSizeIds([]);
      setStockAmounts({});
      setStockEntryModes({});
      setShowBackupModal(false);
      setNoticeMessage(`Respaldo restaurado correctamente: ${importedModels.length} modelos y ${importedMovements.length} movimientos. Los datos se guardaron en este navegador.`);
    } catch (error) {
      setNoticeMessage(`No se pudo restaurar el respaldo: ${error instanceof Error ? error.message : 'archivo no válido'}`, 'error');
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  }

  function exportCsv() {
    const rows = [['Modelo', 'Grupo de tallas', 'Talla', 'Molde', 'Tipo de tela', 'Color', 'Piezas físicas en stock', 'Stock izquierdo', 'Stock derecho', 'Paridades completas', 'Piezas por prenda', 'Unidades fabricables', 'Faltante para siguiente unidad']];
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
            piece.fabricType ?? '',
            piece.color ?? '',
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

  // Correcciones administrativas del ledger antiguo. Se valida que ningún saldo quede negativo.
  function adminEditMovement(movement: PieceMovement) {
    if (!adminMode) return;
    const amountInput = window.prompt('Nueva cantidad del movimiento (positivo = entrada, negativo = salida):', String(movement.delta));
    if (amountInput === null) return;
    const nextDelta = Number(amountInput);
    if (!Number.isInteger(nextDelta) || nextDelta === 0) {
      setNoticeMessage('La cantidad debe ser un entero distinto de cero.', 'error'); return;
    }
    const nextNote = window.prompt('Motivo / observación corregida:', movement.note);
    if (nextNote === null) return;
    const candidate = movements.map((item) => item.id === movement.id ? { ...item, delta: nextDelta, kind: nextDelta > 0 ? 'entrada' as const : 'salida' as const, note: nextNote.trim() || 'Corrección administrativa' } : item);
    const affectedPiece = pieces.find((item) => item.id === movement.pieceId);
    if (!affectedPiece || !hasNonNegativeBalances(candidate, affectedPiece, movement.sizeId)) { setNoticeMessage('No se guardó: esta corrección dejaría el stock total o uno de los lados por debajo de cero.', 'error'); return; }
    setMovements(candidate);
    setNoticeMessage('Movimiento histórico corregido por administración.', 'success');
  }

  function adminDeleteMovement(movement: PieceMovement) {
    if (!adminMode) return;
    const piece = pieces.find((item) => item.id === movement.pieceId);
    const size = sizes.find((item) => item.id === movement.sizeId);
    if (!window.confirm(`¿Eliminar definitivamente este movimiento creado por error?\n${piece?.name ?? 'Molde'} · talla ${size?.label ?? '—'} · ${movement.delta > 0 ? '+' : ''}${movement.delta} piezas\nEl saldo se recalculará y esta acción no se puede deshacer.`)) return;
    const candidate = movements.filter((item) => item.id !== movement.id);
    if (!piece || !hasNonNegativeBalances(candidate, piece, movement.sizeId)) { setNoticeMessage('No se puede eliminar: el stock total o uno de los lados quedaría negativo. Corrige primero los movimientos relacionados.', 'error'); return; }
    setMovements(candidate);
    setNoticeMessage('Movimiento erróneo eliminado. El inventario se recalculó.', 'success');
  }

  const historyRows = useMemo(() => {
    const q = historySearch.trim().toLocaleLowerCase('es');
    return movements.filter((movement) => {
      const piece = pieces.find((item) => item.id === movement.pieceId);
      const model = piece ? models.find((item) => item.id === piece.modelId) : undefined;
      const size = sizes.find((item) => item.id === movement.sizeId);
      return !q || `${model?.name ?? ''} ${piece?.name ?? ''} ${size?.label ?? ''} ${movement.note}`.toLocaleLowerCase('es').includes(q);
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [movements, pieces, models, sizes, historySearch]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">T</div><div><strong>TelaStock</strong><span>GESTIÓN TEXTIL</span></div></div>
        <div className="side-label">FABRICACIÓN</div>
        <button className={`nav-item ${view === 'inventario' ? 'active' : ''}`} onClick={() => setView('inventario')}><span aria-hidden="true">▦</span> Inventario de piezas</button>
        <button className={`nav-item ${view === 'modelos' ? 'active' : ''}`} onClick={() => setView('modelos')}><span aria-hidden="true">◇</span> Modelos y moldes</button>
        <button className={`nav-item ${view === 'historial' ? 'active' : ''}`} onClick={() => setView('historial')}><span aria-hidden="true">↔</span> Historial</button>
        <div className="sidebar-bottom"><div className="avatar">P</div><div><strong>Usuario de prueba</strong><span>Administrador</span></div><span className="online-dot" /></div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="crumb">Fábrica / <strong>{view === 'inventario' ? 'Inventario de piezas' : view === 'modelos' ? 'Modelos y moldes' : 'Historial'}</strong></div>
          <div className="top-actions"><button className="backup-trigger" onClick={() => setShowBackupModal(true)} title="Importar o exportar todos los datos" aria-label="Importar o exportar todos los datos"><span aria-hidden="true">⇅</span><span className="backup-trigger-label">Respaldo</span></button><span className="local-pill"><i /> Prototipo local</span><button className="icon-button" title="Ayuda sobre cálculo" onClick={() => setNoticeMessage('Las unidades fabricables se calculan con el molde más limitante: todos los moldes requeridos deben alcanzar. Es una capacidad de fabricación con el stock actual, no una cantidad de prendas ya confeccionadas.', 'info')}>?</button></div>
        </header>

        <div className="mobile-nav" role="navigation" aria-label="Módulos">
          <button className={view === 'inventario' ? 'active' : ''} onClick={() => setView('inventario')}>Piezas</button>
          <button className={view === 'modelos' ? 'active' : ''} onClick={() => setView('modelos')}>Modelos</button>
          <button className={view === 'historial' ? 'active' : ''} onClick={() => setView('historial')}>Historial</button>
        </div>

        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow">INVENTARIO DE FABRICACIÓN</div><h1>{view === 'inventario' ? 'Piezas por talla' : view === 'modelos' ? 'Modelos de fabricación' : 'Movimientos de piezas'}</h1><p>{view === 'inventario' ? 'Consulta cuántas prendas puedes fabricar con el stock disponible de todos sus moldes.' : view === 'modelos' ? 'Define el patrón base, su grupo de tallas y cuántas piezas requiere cada prenda.' : 'Revisa las entradas registradas y el detalle de cada molde y talla.'}</p></div>
            <div className="heading-actions">
              {view === 'inventario' && <button className="button secondary" onClick={exportCsv}>↧ <span>Exportar</span></button>}
              {view === 'inventario' && <button className="button secondary" onClick={() => openStockForm('salida')}>− <span>Retirar / merma</span></button>}
              {view === 'inventario' && <button className="button primary" onClick={() => openStockForm('entrada')}>＋ <span>Registrar stock</span></button>}
              {view === 'modelos' && <><button className="button secondary" onClick={() => { setSizeManagerGroupId(sizeGroups[0]?.id ?? ''); setShowSizeManager(true); }}>↕ <span>Editar tallas</span></button><button className="button secondary" onClick={exportConfiguration}>↧ <span>Exportar moldes/tallas</span></button><button className="button secondary" onClick={() => importInputRef.current?.click()}>↥ <span>Importar</span></button><input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importConfiguration(event.target.files?.[0])} /><button className="button primary" onClick={openCreateModel}>＋ <span>Nuevo modelo</span></button></>}
              {view === 'historial' && <button className="button secondary" onClick={exportCsv}>↧ <span>Exportar inventario</span></button>}
            </div>
          </div>

          {notice && <div className={`notice ${notice.kind}`} role="status"><span>{notice.message}</span><button onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button></div>}

          {view === 'inventario' && <>
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

          {view === 'modelos' && <section className="panel models-panel">
            <div className="panel-heading"><div><h2>Patrones base</h2><p>La cantidad por prenda define cuántas unidades se pueden fabricar con el stock actual.</p></div><span className="count-badge">{models.length} modelos</span></div>
            <div className="model-management-list">{models.map((model) => {
              const modelPartList = modelPieces(model.id);
              const group = groupById.get(model.sizeGroupId);
              return <article className="managed-model" key={model.id}>
                <div className="managed-model-top"><span className="model-symbol" aria-hidden="true">◇</span><div className="managed-model-title"><strong>{model.name}</strong><span>{group?.name ?? 'Grupo no disponible'}</span></div><button className="button secondary edit-model" onClick={() => openEditModel(model)}>Editar</button></div>
                <div className="piece-chip-list">{modelPartList.map((piece) => <span className="piece-chip" key={piece.id}><span>{piece.name}</span><strong>×{piece.unitsPerGarment}</strong><small>{piece.fabricType} · {piece.color}</small>{piece.laterality === 'simetrica' && <small>espejo</small>}</span>)}</div>
                <div className="managed-model-bottom"><span>{modelPartList.length} moldes · {modelSizes(model).length} tallas disponibles</span><button className="text-action" onClick={() => openStockForm('entrada', model.id)}>Registrar stock →</button></div>
              </article>;
            })}</div>
            <div className="schema-note"><span>ⓘ</span><p><strong>Nota de diseño:</strong> el grupo de tallas se define una sola vez y cada modelo lo referencia. No se duplican las tallas en cada modelo. En un molde simétrico, ×2 significa una pieza izquierda y una derecha por prenda; el stock se puede ingresar por paridad o por lado. Si los moldes difieren físicamente, usa moldes distintos para izquierda y derecha.</p></div>
          </section>}

          {view === 'historial' && <section className="panel history-panel">
            <div className="panel-heading"><div><h2>Movimientos de inventario</h2><p>Consulta los registros anteriores. La edición y eliminación de errores están reservadas al administrador.</p></div><div className="history-heading-actions"><span className="count-badge">{historyRows.length} movimientos</span><button className={`button ${adminMode ? 'primary' : 'secondary'}`} onClick={() => setAdminMode((value) => !value)}>{adminMode ? '✓ Modo administrador activo' : '🔒 Administrar historial'}</button></div></div>
            {adminMode && <div className="notice info"><span><strong>Modo administrador:</strong> puedes editar cantidades y observaciones o eliminar movimientos registrados por error. Los cambios afectan el saldo y no se permiten saldos negativos. Este control es solo visual mientras no exista autenticación; no es una barrera de seguridad real.</span></div>}
            <div className="filters"><label className="search-box"><span aria-hidden="true">⌕</span><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Buscar modelo, talla o molde…" aria-label="Buscar movimientos" /></label></div>
            <div className="history-list">{historyRows.map((movement) => {
              const piece = pieces.find((item) => item.id === movement.pieceId);
              const model = piece ? models.find((item) => item.id === piece.modelId) : undefined;
              const size = sizes.find((item) => item.id === movement.sizeId);
              const sideLabel = piece?.laterality === 'simetrica' ? movement.side === 'izquierda' ? ' · Lado izquierdo' : movement.side === 'derecha' ? ' · Lado derecho' : ' · Histórico sin lado asignado' : '';
              return <article className="history-row" key={movement.id}><span className={`movement-icon ${movement.delta < 0 ? 'movement-out' : ''}`}>{movement.delta < 0 ? '−' : '＋'}</span><div className="history-main"><strong>{piece?.name ?? 'Molde archivado'}{sideLabel}</strong><span>{model?.name ?? 'Modelo archivado'} · Talla {size?.label ?? '—'}</span><small>{movement.kind.toLocaleUpperCase('es')} · {movement.note}</small></div><div className="history-amount"><strong>{movement.delta > 0 ? '+' : ''}{fmt(movement.delta)}</strong><span>{new Date(movement.date).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</span>{adminMode && <div className="history-admin-actions"><button className="text-action" onClick={() => adminEditMovement(movement)}>Editar</button><button className="text-action danger-action" onClick={() => adminDeleteMovement(movement)}>Eliminar</button></div>}</div></article>;
            })}{historyRows.length === 0 && <div className="empty">No se encontraron movimientos.</div>}</div>
            <div className="panel-footer"><span>Historial actual: almacenamiento del navegador.</span><span>Al conectar Supabase, cada movimiento tendrá fecha y usuario de origen.</span></div>
          </section>}

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

      {showModelForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowModelForm(false); }}>
        <section className="modal model-modal" role="dialog" aria-modal="true" aria-labelledby="model-modal-title">
          <div className="modal-heading"><div><div className="eyebrow">PATRÓN BASE</div><h2 id="model-modal-title">{modelForm.editingId ? 'Editar modelo' : 'Crear modelo de fabricación'}</h2><p>Define las piezas necesarias por prenda y si su stock requiere control de lateralidad.</p></div><button className="icon-button" onClick={() => setShowModelForm(false)} aria-label="Cerrar">×</button></div>
          <form onSubmit={saveModel} className="model-form">
            <label className="field-label">Nombre del modelo<input className="large-input" required value={modelForm.name} onChange={(event) => setModelForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Ej. Polo básico sublimado" /></label>
            <label className="field-label">Grupo de tallas<select className="large-input" required value={modelForm.sizeGroupId} onChange={(event) => setModelForm((prev) => ({ ...prev, sizeGroupId: event.target.value }))} disabled={Boolean(modelForm.editingId && modelForm.pieces.some((piece) => movements.some((movement) => movement.pieceId === piece.id)))}>{sizeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><small>Las tallas pertenecen al grupo y se reutilizan en los modelos.</small></label>
            <div className="form-section-heading"><div><strong>Moldes que componen una prenda</strong><small>En una pieza simétrica, la cantidad incluye ambos lados: 2 piezas = 1 izquierda + 1 derecha.</small></div><button type="button" className="text-action" onClick={() => setModelForm((prev) => ({ ...prev, pieces: [...prev.pieces, { id: '', name: '', unitsPerGarment: '1', laterality: 'ninguna', fabricType: 'Poliéster deportivo', color: 'Sin especificar' }] }))}>＋ Añadir molde</button></div>
            <div className="piece-editor-list">{modelForm.pieces.map((piece, index) => <div className="piece-editor" key={piece.id || `new-${index}`}><div className="piece-editor-top"><span>Molde {index + 1} · orden {index + 1}</span><div className="mold-order-actions"><button type="button" className="order-mold" disabled={index === 0} aria-label="Mover molde arriba" onClick={() => moveMold(index, -1)}>↑</button><button type="button" className="order-mold" disabled={index === modelForm.pieces.length - 1} aria-label="Mover molde abajo" onClick={() => moveMold(index, 1)}>↓</button>{modelForm.pieces.length > 1 && <button type="button" className="remove-piece" onClick={() => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.filter((_, pieceIndex) => pieceIndex !== index) }))}>Quitar</button>}</div></div><div className="piece-editor-fields mold-fields-row"><label className="field-label">Molde<input className="large-input" required value={piece.name} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => pieceIndex === index ? { ...item, name: event.target.value } : item) }))} placeholder="Pecho, cuello…" /></label><label className="field-label">Piezas/prenda<input className="large-input" required type="number" inputMode="numeric" min="1" step="1" value={piece.unitsPerGarment} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => pieceIndex === index ? { ...item, unitsPerGarment: event.target.value } : item) }))} /></label><label className="field-label">Lateralidad<select className="large-input" value={piece.laterality} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => { if (pieceIndex !== index) return item; const laterality = event.target.value as Laterality; const currentUnits = Number(item.unitsPerGarment); const unitsPerGarment = laterality === 'simetrica' && (!Number.isInteger(currentUnits) || currentUnits < 2 || currentUnits % 2 !== 0) ? String(Math.max(2, Math.ceil((currentUnits || 1) / 2) * 2)) : item.unitsPerGarment; return { ...item, laterality, unitsPerGarment }; }) }))}><option value="ninguna">Sin lado</option><option value="simetrica">Simétrica</option><option value="izquierda">Izquierda</option><option value="derecha">Derecha</option></select></label><label className="field-label">Tipo de tela<input className="large-input" value={piece.fabricType} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => pieceIndex === index ? { ...item, fabricType: event.target.value } : item) }))} placeholder="Poliéster, rib…" /></label><label className="field-label">Color<input className="large-input" value={piece.color} onChange={(event) => setModelForm((prev) => ({ ...prev, pieces: prev.pieces.map((item, pieceIndex) => pieceIndex === index ? { ...item, color: event.target.value } : item) }))} placeholder="Rojo, negro…" /></label></div></div>)}</div>
            <div className="symmetry-help"><strong>Cómo se cuenta la simetría:</strong> un par requiere 1 pieza izquierda y 1 derecha. El stock se registra por paridad de forma predeterminada; puedes cambiar a lados para registrar cantidades diferentes. En este molde, ×2 significa 1 pieza por lado.</div>
            <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowModelForm(false)}>Cancelar</button><button type="submit" className="button primary">{modelForm.editingId ? 'Guardar cambios' : 'Crear modelo'}</button></div>
          </form>
        </section>
      </div>}

      {showSizeManager && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSizeManager(false); }}>
        <section className="modal size-manager-modal" role="dialog" aria-modal="true" aria-labelledby="size-manager-title">
          <div className="modal-heading"><div><div className="eyebrow">CONFIGURACIÓN DE TALLAS</div><h2 id="size-manager-title">Editar grupos y tallas</h2><p>Las tallas se comparten entre modelos del mismo grupo. El orden aquí se usa en los selectores y en el inventario.</p></div><button className="icon-button" onClick={() => setShowSizeManager(false)} aria-label="Cerrar">×</button></div>
          <div className="size-manager-groups"><label className="field-label">Grupo de tallas<select className="large-input" value={sizeManagerGroupId} onChange={(event) => setSizeManagerGroupId(event.target.value)}>{sizeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="add-group-row"><input className="large-input" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Nuevo grupo: p. ej. Medias" /><button type="button" className="button secondary" onClick={addSizeGroup}>Crear grupo</button></div></div>
          <div className="add-size-row"><input className="large-input" value={newSizeLabel} onChange={(event) => setNewSizeLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSize(); } }} placeholder="Nueva talla: T4, S, M, 6 a 9 años…" /><button type="button" className="button primary" onClick={addSize}>＋ Agregar talla</button></div>
          <div className="size-manager-list">{groupSizes(sizeManagerGroupId).map((size, index) => <div className="size-manager-row" key={size.id}><span className="size-order">{index + 1}</span><input className="large-input" aria-label={`Nombre de talla ${size.label}`} value={size.label} onChange={(event) => renameSize(size.id, event.target.value)} /><div className="size-manager-actions"><button type="button" className="order-mold" disabled={index === 0} onClick={() => reorderSize(size.id, -1)} aria-label="Subir talla">↑</button><button type="button" className="order-mold" disabled={index === groupSizes(sizeManagerGroupId).length - 1} onClick={() => reorderSize(size.id, 1)} aria-label="Bajar talla">↓</button><button type="button" className="remove-piece" onClick={() => deleteSize(size)}>Eliminar</button></div></div>)}{groupSizes(sizeManagerGroupId).length === 0 && <div className="empty">Este grupo todavía no tiene tallas. Agrega la primera arriba.</div>}</div>
          <div className="symmetry-help">Si una talla ya tiene movimientos, no se elimina físicamente para no romper el historial. Puedes renombrarla o dejar de usarla. Los cambios de nombre y orden se guardan automáticamente en este prototipo.</div>
          <div className="form-actions"><button type="button" className="button primary" onClick={() => setShowSizeManager(false)}>Listo</button></div>
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
              <p>Descarga modelos, moldes, tallas, stock por lado y todo el historial en un solo archivo.</p>
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
