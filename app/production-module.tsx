'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ManufacturingModel, Size } from '@/lib/inventory-domain';
import { FABRIC_STORAGE_KEYS } from '@/app/fabric-module';

export type ProductionView = 'insumos' | 'compras-avios' | 'componentes' | 'modelos-producto' | 'recetas' | 'planificacion';
export type StockUnit = 'und' | 'm' | 'cm' | 'g' | 'kg' | 'l' | 'ml';
export type SupplyCategory =
  | 'Hilos' | 'Botones y broches' | 'Cintas elásticas' | 'Cintas para vena'
  | 'Siesgos' | 'Entretelas' | 'Cierres' | 'Etiquetas' | 'Cuellos y puños'
  | 'Pretinas' | 'Pitas' | 'Bolsas y empaques' | 'Otros avíos';

export type Supply = {
  id: string;
  name: string;
  category: SupplyCategory;
  baseUnit: StockUnit;
  stockMode: 'total' | 'talla';
  description: string;
  attributes: Record<string, string>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SupplyVariant = {
  id: string;
  supplyId: string;
  name: string;
  attributes: Record<string, string>;
  textileId: string | null;
  textileColorId: string | null;
  purchasePackQuantity: number | null;
  purchasePackLabel: string;
  active: boolean;
};

export type SupplyMovement = {
  id: string;
  variantId: string;
  sizeId: string | null;
  delta: number;
  kind: 'entrada' | 'salida' | 'ajuste';
  note: string;
  date: string;
  sourcePurchaseDetailId?: string | null;
};

export type SupplyPurchase = {
  id: string;
  supplierId: string | null;
  date: string;
  documentType: string;
  documentNumber: string;
  note: string;
  total: number;
  createdAt: string;
};

export type SupplyPurchaseDetail = {
  id: string;
  purchaseId: string;
  variantId: string;
  sizeId: string | null;
  purchaseQuantity: number;
  purchaseUnitLabel: string;
  baseQuantityPerPack: number;
  inventoryQuantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ComponentPiece = {
  id: string;
  name: string;
  unitsPerGarment: number;
  laterality: 'ninguna' | 'simetrica' | 'izquierda' | 'derecha';
  fabricSlot: string;
  colorId: string | null;
};

export type MaterialRequirement = {
  id: string;
  variantId: string;
  mode: 'fixed' | 'per_size';
  unit: StockUnit;
  fixedQuantity: number | null;
  bySize: Record<string, number>;
  wastePercent: number;
};

export type GarmentComponent = {
  id: string;
  type: string;
  name: string;
  description: string;
  imageUrl: string;
  active: boolean;
  pieces: ComponentPiece[];
  materials: MaterialRequirement[];
  createdAt: string;
  updatedAt: string;
};

export type FamilyRecipe = {
  id: string;
  family: string;
  name: string;
  active: boolean;
  materials: MaterialRequirement[];
  updatedAt: string;
};

export type ProductComponentSelection = {
  id: string;
  componentId: string;
  quantity: number;
  location: string;
  variantOverrides: Record<string, string>;
};

export type ConfiguredProductModel = {
  id: string;
  name: string;
  family: string;
  baseModelId: string;
  description: string;
  components: ProductComponentSelection[];
  additionalMaterials: MaterialRequirement[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductionBackupData = {
  supplies: Supply[];
  variants: SupplyVariant[];
  supplyMovements: SupplyMovement[];
  supplyPurchases: SupplyPurchase[];
  supplyPurchaseDetails: SupplyPurchaseDetail[];
  components: GarmentComponent[];
  familyRecipes: FamilyRecipe[];
  productModels: ConfiguredProductModel[];
};

export const PRODUCTION_STORAGE_KEYS = {
  version: 'telastock-production-schema-version',
  supplies: 'telastock-supplies-v1',
  variants: 'telastock-supply-variants-v1',
  supplyMovements: 'telastock-supply-movements-v1',
  supplyPurchases: 'telastock-supply-purchases-v1',
  supplyPurchaseDetails: 'telastock-supply-purchase-details-v1',
  components: 'telastock-garment-components-v1',
  familyRecipes: 'telastock-family-recipes-v1',
  productModels: 'telastock-configured-product-models-v1',
} as const;

export function emptyProductionBackupData(): ProductionBackupData {
  return { supplies: [], variants: [], supplyMovements: [], supplyPurchases: [], supplyPurchaseDetails: [], components: [], familyRecipes: [], productModels: [] };
}

export function validateProductionBackupData(value: unknown): ProductionBackupData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El apartado de insumos y componentes está incompleto.');
  const record = value as Record<string, unknown>;
  const empty = emptyProductionBackupData();
  const output = {} as ProductionBackupData;
  for (const key of Object.keys(empty) as (keyof ProductionBackupData)[]) {
    const rows = record[key] === undefined ? [] : record[key];
    if (!Array.isArray(rows) || !rows.every((row) => row && typeof row === 'object' && !Array.isArray(row) && typeof (row as { id?: unknown }).id === 'string' && Boolean((row as { id: string }).id.trim()))) {
      throw new Error('El apartado "' + key + '" contiene datos no válidos.');
    }
    const ids = rows.map((row) => (row as { id: string }).id);
    if (new Set(ids).size !== ids.length) throw new Error('Hay identificadores duplicados en "' + key + '".');
    (output as unknown as Record<string, unknown>)[key] = rows;
  }
  const supplyIds = new Set(output.supplies.map((x) => x.id));
  const variantIds = new Set(output.variants.map((x) => x.id));
  const componentIds = new Set(output.components.map((x) => x.id));
  const purchaseIds = new Set(output.supplyPurchases.map((x) => x.id));
  const purchaseDetailIds = new Set(output.supplyPurchaseDetails.map((x) => x.id));
  const validMaterials = (items: MaterialRequirement[]) => Array.isArray(items) && items.every((x) =>
    variantIds.has(x.variantId) && ['fixed', 'per_size'].includes(x.mode) &&
    ['und', 'm', 'cm', 'g', 'kg', 'l', 'ml'].includes(x.unit) &&
    (x.mode === 'fixed' ? Number.isFinite(x.fixedQuantity) && (x.fixedQuantity ?? 0) >= 0 : x.bySize && typeof x.bySize === 'object') &&
    Number.isFinite(x.wastePercent) && x.wastePercent >= 0
  );
  if (!output.variants.every((x) => supplyIds.has(x.supplyId) && x.name.trim() && (x.textileId === null || typeof x.textileId === 'string') && (x.purchasePackQuantity === null || (Number.isFinite(x.purchasePackQuantity) && x.purchasePackQuantity > 0)))) {
    throw new Error('Hay variantes asociadas a insumos inexistentes o con datos inválidos.');
  }
  if (!output.supplyMovements.every((x) => variantIds.has(x.variantId) && (x.sizeId === null || typeof x.sizeId === 'string') && Number.isFinite(x.delta) && x.delta !== 0 && ['entrada', 'salida', 'ajuste'].includes(x.kind) && (x.sourcePurchaseDetailId == null || purchaseDetailIds.has(x.sourcePurchaseDetailId)))) {
    throw new Error('Hay movimientos de insumos inválidos.');
  }
  if (!output.supplyPurchases.every((x) => typeof x.date === 'string' && x.date.length > 0 && (x.supplierId === null || typeof x.supplierId === 'string') && Number.isFinite(x.total) && x.total >= 0)) {
    throw new Error('Hay encabezados de compra de avíos inválidos.');
  }
  if (!output.supplyPurchaseDetails.every((x) => purchaseIds.has(x.purchaseId) && variantIds.has(x.variantId) &&
    (x.sizeId === null || typeof x.sizeId === 'string') && Number.isFinite(x.purchaseQuantity) && x.purchaseQuantity > 0 &&
    Number.isFinite(x.baseQuantityPerPack) && x.baseQuantityPerPack > 0 && Number.isFinite(x.inventoryQuantity) && x.inventoryQuantity > 0 &&
    Number.isFinite(x.unitPrice) && x.unitPrice >= 0 && Number.isFinite(x.lineTotal) && x.lineTotal >= 0 &&
    Math.abs(x.lineTotal - x.purchaseQuantity * x.unitPrice) < 0.02)) {
    throw new Error('Hay detalles de compra de avíos inválidos.');
  }
  if (!output.components.every((x) => x.name.trim() && x.type.trim() && Array.isArray(x.pieces) && x.pieces.every((p) => p.name.trim() && Number.isInteger(p.unitsPerGarment) && p.unitsPerGarment > 0) && validMaterials(x.materials))) {
    throw new Error('Hay componentes con piezas o materiales inválidos.');
  }
  if (!output.familyRecipes.every((x) => x.family.trim() && x.name.trim() && validMaterials(x.materials))) {
    throw new Error('Hay recetas generales con materiales inválidos.');
  }
  if (!output.productModels.every((x) => x.name.trim() && typeof x.baseModelId === 'string' && Array.isArray(x.components) && x.components.every((c) => componentIds.has(c.componentId) && Number.isFinite(c.quantity) && c.quantity > 0) && validMaterials(x.additionalMaterials))) {
    throw new Error('Hay modelos configurados con componentes o materiales inválidos.');
  }
  if (!output.supplies.every((x) => x.name.trim() && ['total', 'talla'].includes(x.stockMode) && ['und', 'm', 'cm', 'g', 'kg', 'l', 'ml'].includes(x.baseUnit))) {
    throw new Error('Hay insumos con unidades o modalidad de inventario inválidas.');
  }
  return output;
}

const categories: SupplyCategory[] = [
  'Hilos', 'Botones y broches', 'Cintas elásticas', 'Cintas para vena', 'Siesgos',
  'Entretelas', 'Cierres', 'Etiquetas', 'Cuellos y puños', 'Pretinas', 'Pitas',
  'Bolsas y empaques', 'Otros avíos',
];
const units: StockUnit[] = ['und', 'm', 'cm', 'g', 'kg', 'l', 'ml'];
const families = [
  { value: 'polo', label: 'Polo' },
  { value: 'buzo', label: 'Buzo' },
  { value: 'casaca', label: 'Casaca' },
  { value: 'otro', label: 'Otro' },
];
const componentTypes = ['Cuello', 'Bolsillo', 'Puño', 'Pretina', 'Tapetera', 'Cierre', 'Terminación', 'Otro'];
const unitLabel: Record<StockUnit, string> = { und: 'unidades', m: 'm', cm: 'cm', g: 'g', kg: 'kg', l: 'l', ml: 'ml' };
const id = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'prod-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const now = () => new Date().toISOString();
const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value);
const format = (value: number) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 }).format(value);
const money = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const localDate = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const safeRead = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
};
const conversionFactor = (from: StockUnit, to: StockUnit): number | null => {
  if (from === to) return 1;
  const groups: Record<string, { base: StockUnit; factor: number }> = {
    m: { base: 'm', factor: 1 }, cm: { base: 'm', factor: 0.01 },
    kg: { base: 'kg', factor: 1 }, g: { base: 'kg', factor: 0.001 },
    l: { base: 'l', factor: 1 }, ml: { base: 'l', factor: 0.001 },
  };
  if (from === 'und' || to === 'und') return null;
  const a = groups[from]; const b = groups[to];
  if (!a || !b || a.base !== b.base) return null;
  return a.factor / b.factor;
};

type TextileRow = { id: string; nombreTela: string; unidadVenta: 'KG' | 'M' };
type TextileColorRow = { id: string; idTela: string; idColor: string; activo: boolean };
type ColorRow = { id: string; nombre: string };
type RollRow = { id: string; idTela: string; idTelaColor?: string | null; metros: number | null; pesoKg: number | null; estado: string };
type SupplierOption = { id: string; nombre: string; ruc?: string | null };
type TextileContext = { telas: TextileRow[]; rollos: RollRow[]; telaColores: TextileColorRow[]; colores: ColorRow[]; proveedores: SupplierOption[] };
type PurchaseLineDraft = { id: string; variantId: string; sizeId: string; quantity: string; unitPrice: string };

function MaterialEditor({
  materials, onChange, variants, sizes, title,
}: {
  materials: MaterialRequirement[];
  onChange: (items: MaterialRequirement[]) => void;
  variants: SupplyVariant[];
  sizes: Size[];
  title: string;
}) {
  const variantOptions = variants.map((variant) => ({ variant, label: variantLabel(variant, variants, undefined) }));
  function update(index: number, patch: Partial<MaterialRequirement>) {
    onChange(materials.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function add() {
    const first = variants[0];
    if (!first) return;
    onChange([...materials, { id: id(), variantId: first.id, mode: 'fixed', unit: 'und', fixedQuantity: 1, bySize: {}, wastePercent: 0 }]);
  }
  return <div className="production-material-editor">
    <div className="production-subheading"><strong>{title}</strong><button type="button" className="text-action" disabled={variants.length === 0} onClick={add}>＋ Agregar material</button></div>
    {materials.length === 0 && <p className="production-muted">Todavía no has agregado materiales.</p>}
    {materials.map((material, index) => {
      const variant = variants.find((x) => x.id === material.variantId);
      const supply = variant ? allSuppliesCache.get(variant.supplyId) : undefined;
      return <div className="production-material-row" key={material.id}>
        <div className="production-material-fields">
          <label className="field-label">Material
            <select className="large-input" value={material.variantId} onChange={(event) => update(index, { variantId: event.target.value, unit: allSuppliesCache.get(variants.find((x) => x.id === event.target.value)?.supplyId ?? '')?.baseUnit ?? 'und' })}>
              {variantOptions.map((option) => <option key={option.variant.id} value={option.variant.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="field-label">Unidad de consumo
            <select className="large-input" value={material.unit} onChange={(event) => update(index, { unit: event.target.value as StockUnit })}>
              {units.map((unit) => <option key={unit} value={unit}>{unitLabel[unit]}</option>)}
            </select>
          </label>
          <label className="field-label">Consumo
            <select className="large-input" value={material.mode} onChange={(event) => update(index, { mode: event.target.value as 'fixed' | 'per_size' })}>
              <option value="fixed">Igual por prenda</option>
              <option value="per_size">Según talla</option>
            </select>
          </label>
          {material.mode === 'fixed' && <label className="field-label">Cantidad por prenda
            <input className="large-input" type="number" min="0" step="0.001" value={material.fixedQuantity ?? ''} onChange={(event) => update(index, { fixedQuantity: numberOrNull(event.target.value) })} />
          </label>}
          <label className="field-label">Desperdicio %
            <input className="large-input" type="number" min="0" step="0.1" value={material.wastePercent} onChange={(event) => update(index, { wastePercent: Number(event.target.value) })} />
          </label>
        </div>
        {material.mode === 'per_size' && <div className="production-size-consumption">
          <strong>Consumo por talla</strong>
          <div className="production-size-grid">
            {sizes.map((size) => <label key={size.id}><span>{size.label}</span><input type="number" min="0" step="0.001" value={material.bySize[size.id] ?? ''} onChange={(event) => update(index, { bySize: { ...material.bySize, [size.id]: event.target.value === '' ? Number.NaN : Number(event.target.value) } })} /></label>)}
          </div>
          <small>Deja una talla vacía si todavía no conoces el consumo. No se interpretará como cero.</small>
        </div>}
        <div className="production-material-foot"><span>{variant ? (supply?.name ?? 'Insumo') + ' · ' + variant.name : 'Variante no disponible'}</span><button type="button" className="text-action danger-action" onClick={() => onChange(materials.filter((_, i) => i !== index))}>Quitar</button></div>
      </div>;
    })}
    {variants.length === 0 && <p className="production-muted">Primero registra un insumo y al menos una variante.</p>}
  </div>;
}

// MaterialEditor uses this read-only cache to render compact labels; it is refreshed on each module render.
const allSuppliesCache = new Map<string, Supply>();

function variantLabel(variant: SupplyVariant, variants: SupplyVariant[], supplies?: Supply[]) {
  const source = supplies ?? [...allSuppliesCache.values()];
  const supply = source.find((x) => x.id === variant.supplyId);
  return (supply?.name ?? 'Insumo') + ' · ' + variant.name;
}

export function ProductionModule({
  view, baseModels, sizes, onNavigate,
}: {
  view: ProductionView;
  baseModels: ManufacturingModel[];
  sizes: Size[];
  onNavigate: (view: ProductionView) => void;
}) {
  const [data, setData] = useState<ProductionBackupData>(emptyProductionBackupData);
  const [ready, setReady] = useState(false);
  const [storageSafe, setStorageSafe] = useState(true);
  const [notice, setNotice] = useState<{ text: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const [textileContext, setTextileContext] = useState<TextileContext>({ telas: [], rollos: [], telaColores: [], colores: [], proveedores: [] });
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState(localDate);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseDocumentType, setPurchaseDocumentType] = useState('Boleta');
  const [purchaseDocumentNumber, setPurchaseDocumentNumber] = useState('');
  const [purchaseNote, setPurchaseNote] = useState('');
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineDraft[]>([{ id: id(), variantId: '', sizeId: '', quantity: '1', unitPrice: '' }]);
  const [supplyName, setSupplyName] = useState('');
  const [supplyCategory, setSupplyCategory] = useState<SupplyCategory>('Hilos');
  const [supplyUnit, setSupplyUnit] = useState<StockUnit>('g');
  const [stockMode, setStockMode] = useState<'total' | 'talla'>('total');
  const [supplyDescription, setSupplyDescription] = useState('');
  const [supplyAttributes, setSupplyAttributes] = useState('');
  const [showSupplyForm, setShowSupplyForm] = useState(false);
  const [variantSupplyId, setVariantSupplyId] = useState('');
  const [variantName, setVariantName] = useState('');
  const [variantPackQuantity, setVariantPackQuantity] = useState('');
  const [variantPackLabel, setVariantPackLabel] = useState('');
  const [variantAttributes, setVariantAttributes] = useState('');
  const [variantTextileId, setVariantTextileId] = useState('');
  const [variantTextileColorId, setVariantTextileColorId] = useState('');
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [stockVariantId, setStockVariantId] = useState('');
  const [stockSizeId, setStockSizeId] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [stockNote, setStockNote] = useState('Ingreso de insumos');
  const [stockDirection, setStockDirection] = useState<'entrada' | 'salida'>('entrada');
  const [showStockForm, setShowStockForm] = useState(false);
  const [componentDraft, setComponentDraft] = useState<GarmentComponent | null>(null);
  const [recipeDraft, setRecipeDraft] = useState<FamilyRecipe | null>(null);
  const [productName, setProductName] = useState('');
  const [productFamily, setProductFamily] = useState('polo');
  const [productBaseId, setProductBaseId] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productComponentIds, setProductComponentIds] = useState<string[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [planCounts, setPlanCounts] = useState<Record<string, string>>({});

  const refreshTextiles = () => {
    const telas = safeRead<TextileRow[]>(FABRIC_STORAGE_KEYS.telas, []);
    const rollos = safeRead<RollRow[]>(FABRIC_STORAGE_KEYS.rollos, []);
    const telaColores = safeRead<TextileColorRow[]>(FABRIC_STORAGE_KEYS.telaColores, []);
    const colores = safeRead<ColorRow[]>(FABRIC_STORAGE_KEYS.colores, []);
    const proveedores = safeRead<SupplierOption[]>(FABRIC_STORAGE_KEYS.proveedores, []);
    setTextileContext({ telas, rollos, telaColores, colores, proveedores });
  };

  const loadLocal = () => {
    const empty = emptyProductionBackupData();
    const next = {} as ProductionBackupData;
    let safe = true;
    let warning = '';
    const version = Number(localStorage.getItem(PRODUCTION_STORAGE_KEYS.version) ?? '0');
    if (version > 1) { safe = false; warning = 'Los datos de insumos fueron creados con una versión más reciente. Se evita sobrescribirlos.'; }
    for (const key of Object.keys(empty) as (keyof ProductionBackupData)[]) {
      try {
        const raw = localStorage.getItem(PRODUCTION_STORAGE_KEYS[key]);
        (next as unknown as Record<string, unknown>)[key] = raw ? JSON.parse(raw) : [];
      } catch {
        safe = false;
        warning = 'Se detectó información local dañada en insumos o componentes. Restaura un respaldo válido antes de editar.';
        (next as unknown as Record<string, unknown>)[key] = [];
      }
    }
    try { return { data: validateProductionBackupData(next), safe, warning }; }
    catch { return { data: next, safe: false, warning: 'Las relaciones de insumos o componentes no son válidas. No se guardarán cambios.' }; }
  };

  useEffect(() => {
    const loaded = loadLocal();
    setData(loaded.data);
    setStorageSafe(loaded.safe);
    if (loaded.safe) localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '1');
    else setNotice({ text: loaded.warning, kind: 'error' });
    setReady(true);
    refreshTextiles();
    const restored = () => {
      const current = loadLocal();
      setData(current.data);
      setStorageSafe(current.safe);
      if (!current.safe) setNotice({ text: current.warning, kind: 'error' });
      refreshTextiles();
    };
    window.addEventListener('telastock-production-data-restored', restored);
    window.addEventListener('telastock-fabric-data-updated', refreshTextiles);
    window.addEventListener('telastock-fabric-data-restored', refreshTextiles);
    return () => {
      window.removeEventListener('telastock-production-data-restored', restored);
      window.removeEventListener('telastock-fabric-data-updated', refreshTextiles);
      window.removeEventListener('telastock-fabric-data-restored', refreshTextiles);
    };
  }, []);

  useEffect(() => {
    if (!ready || !storageSafe) return;
    const keys = Object.keys(emptyProductionBackupData()) as (keyof ProductionBackupData)[];
    const previous = new Map<string, string | null>();
    try {
      keys.forEach((key) => previous.set(PRODUCTION_STORAGE_KEYS[key], localStorage.getItem(PRODUCTION_STORAGE_KEYS[key])));
      keys.forEach((key) => localStorage.setItem(PRODUCTION_STORAGE_KEYS[key], JSON.stringify(data[key])));
      localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '1');
    } catch {
      previous.forEach((value, key) => {
        try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* rollback best effort */ }
      });
      setStorageSafe(false);
      setNotice({ text: 'No se guardaron los cambios. El almacenamiento del navegador está lleno o bloqueado.', kind: 'error' });
    }
  }, [data, ready, storageSafe]);

  const supplies = data.supplies;
  allSuppliesCache.clear();
  supplies.forEach((supply) => allSuppliesCache.set(supply.id, supply));
  const variants = useMemo(() => data.variants.filter((x) => x.active), [data.variants]);
  const variantsBySupply = useMemo(() => new Map(data.variants.map((x) => [x.id, x])), [data.variants]);

  function tell(text: string, kind: 'success' | 'error' | 'info' = 'success') { setNotice({ text, kind }); }
  function parseAttributes(value: string): Record<string, string> {
    return Object.fromEntries(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const at = line.indexOf(':');
      return at > 0 ? [line.slice(0, at).trim(), line.slice(at + 1).trim()] : ['nota', line];
    }));
  }
  function saveSupply(event: FormEvent) {
    event.preventDefault();
    const name = supplyName.trim();
    if (!name) return tell('Escribe el nombre del insumo.', 'error');
    if (data.supplies.some((x) => x.name.trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) return tell('Ya existe un insumo con ese nombre.', 'error');
    const row: Supply = { id: id(), name, category: supplyCategory, baseUnit: supplyUnit, stockMode, description: supplyDescription.trim(), attributes: parseAttributes(supplyAttributes), active: true, createdAt: now(), updatedAt: now() };
    setData((current) => ({ ...current, supplies: [...current.supplies, row] }));
    setSupplyName(''); setSupplyDescription(''); setSupplyAttributes(''); setShowSupplyForm(false);
    tell('Insumo registrado. Ahora agrega sus variantes comerciales.');
  }
  function openVariant(supplyId: string) {
    setVariantSupplyId(supplyId); setVariantName(''); setVariantPackQuantity(''); setVariantPackLabel(''); setVariantAttributes('');
    setVariantTextileId(''); setVariantTextileColorId(''); setShowVariantForm(true);
  }
  function saveVariant(event: FormEvent) {
    event.preventDefault();
    const supply = supplies.find((x) => x.id === variantSupplyId);
    if (!supply || !variantName.trim()) return tell('Selecciona el insumo y escribe el nombre de la variante.', 'error');
    const packQuantity = numberOrNull(variantPackQuantity);
    if (variantPackQuantity.trim() && (packQuantity === null || !Number.isFinite(packQuantity) || packQuantity <= 0)) return tell('La equivalencia del paquete debe ser mayor que cero.', 'error');
    if (variantTextileId && !variantTextileColorId) return tell('Selecciona también el color asociado a esa tela.', 'error');
    if (variantTextileId) {
      const textile = textileContext.telas.find((x) => x.id === variantTextileId);
      if (!textile || (textile.unidadVenta === 'M' ? 'm' : 'kg') !== supply.baseUnit) return tell('La unidad del insumo debe coincidir con la unidad de venta de la tela vinculada.', 'error');
      const color = textileContext.telaColores.find((x) => x.id === variantTextileColorId && x.idTela === variantTextileId);
      if (!color) return tell('El color no pertenece a la tela seleccionada.', 'error');
    }
    if (data.variants.some((x) => x.supplyId === variantSupplyId && x.name.toLocaleLowerCase('es') === variantName.trim().toLocaleLowerCase('es'))) return tell('Esa variante ya existe para el insumo.', 'error');
    const row: SupplyVariant = { id: id(), supplyId: variantSupplyId, name: variantName.trim(), attributes: parseAttributes(variantAttributes), textileId: variantTextileId || null, textileColorId: variantTextileColorId || null, purchasePackQuantity: packQuantity, purchasePackLabel: variantPackLabel.trim(), active: true };
    setData((current) => ({ ...current, variants: [...current.variants, row] }));
    setShowVariantForm(false); tell('Variante registrada.');
  }
  function stockForVariant(variant: SupplyVariant, sizeId: string | null): number {
    const supply = supplies.find((x) => x.id === variant.supplyId);
    if (!supply) return 0;
    if (variant.textileId) {
      return textileContext.rollos.filter((roll) => roll.idTela === variant.textileId && (!variant.textileColorId || roll.idTelaColor === variant.textileColorId) && roll.estado === 'disponible')
        .reduce((sum, roll) => sum + (supply.baseUnit === 'm' ? (roll.metros ?? 0) : supply.baseUnit === 'kg' ? (roll.pesoKg ?? 0) : 0), 0);
    }
    return data.supplyMovements.filter((movement) => movement.variantId === variant.id && movement.sizeId === (supply.stockMode === 'talla' ? sizeId : null))
      .reduce((sum, movement) => sum + movement.delta, 0);
  }
  function saveStock(event: FormEvent) {
    event.preventDefault();
    const variant = variantsBySupply.get(stockVariantId);
    const supply = variant ? supplies.find((x) => x.id === variant.supplyId) : undefined;
    const quantity = Number(stockQuantity);
    if (!variant || !supply || !Number.isFinite(quantity) || quantity <= 0) return tell('Selecciona una variante e ingresa una cantidad mayor que cero.', 'error');
    if (variant.textileId) return tell('Esta variante utiliza el stock real de rollos. Registra sus entradas o consumos desde Inventario de rollos.', 'info');
    if (supply.stockMode === 'talla' && !stockSizeId) return tell('Selecciona la talla de este insumo.', 'error');
    const sizeId = supply.stockMode === 'talla' ? stockSizeId : null;
    const delta = stockDirection === 'entrada' ? quantity : -quantity;
    if (delta < 0 && stockForVariant(variant, sizeId) < quantity) return tell('No puedes retirar más de lo disponible.', 'error');
    const movement: SupplyMovement = { id: id(), variantId: variant.id, sizeId, delta, kind: stockDirection, note: stockNote.trim(), date: now() };
    setData((current) => ({ ...current, supplyMovements: [...current.supplyMovements, movement] }));
    setShowStockForm(false); setStockQuantity(''); tell('Movimiento de insumo registrado.');
  }
  const purchasableVariants = variants.filter((variant) => !variant.textileId && supplies.some((supply) => supply.id === variant.supplyId && supply.active));
  const purchaseLineTotal = (line: PurchaseLineDraft) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    return Number.isFinite(quantity) && quantity > 0 && Number.isFinite(unitPrice) && unitPrice >= 0 ? quantity * unitPrice : 0;
  };
  const purchaseTotalDraft = purchaseLines.reduce((sum, line) => sum + purchaseLineTotal(line), 0);
  function addPurchaseLine() {
    setPurchaseLines((current) => [...current, { id: id(), variantId: '', sizeId: '', quantity: '1', unitPrice: '' }]);
  }
  function updatePurchaseLine(lineId: string, patch: Partial<PurchaseLineDraft>) {
    setPurchaseLines((current) => current.map((line) => line.id === lineId ? { ...line, ...patch } : line));
  }
  function saveSupplyPurchase(event: FormEvent) {
    event.preventDefault();
    if (!purchaseDate) return tell('Selecciona la fecha de compra.', 'error');
    if (purchaseSupplierId && !textileContext.proveedores.some((supplier) => supplier.id === purchaseSupplierId)) return tell('El proveedor seleccionado ya no está disponible. Actualiza el módulo de proveedores.', 'error');
    if (purchaseLines.length === 0) return tell('Agrega al menos un detalle de compra.', 'error');
    const documentNumber = purchaseDocumentNumber.trim();
    if (documentNumber && data.supplyPurchases.some((purchase) =>
      purchase.supplierId === (purchaseSupplierId || null) &&
      purchase.documentType === purchaseDocumentType &&
      purchase.documentNumber.trim().toLocaleLowerCase('es') === documentNumber.toLocaleLowerCase('es')
    )) return tell('Ya existe una compra con ese proveedor y número de comprobante.', 'error');

    const purchaseId = id();
    const createdAt = now();
    const prepared: Array<{ detail: SupplyPurchaseDetail; movement: SupplyMovement }> = [];
    for (const line of purchaseLines) {
      const variant = variantsBySupply.get(line.variantId);
      const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (!variant || !supply || variant.textileId) return tell('Cada línea debe seleccionar una variante de avío válida. Las telas se compran desde el módulo de rollos.', 'error');
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) return tell('Revisa las cantidades y precios de todos los detalles.', 'error');
      if (supply.stockMode === 'talla' && (!line.sizeId || !sizes.some((size) => size.id === line.sizeId))) return tell('Selecciona una talla para cada insumo que controla stock por talla.', 'error');
      const sizeId = supply.stockMode === 'talla' ? line.sizeId : null;
      const baseQuantityPerPack = variant.purchasePackQuantity ?? 1;
      const inventoryQuantity = Number((quantity * baseQuantityPerPack).toFixed(5));
      const purchaseUnitLabel = variant.purchasePackQuantity
        ? (variant.purchasePackLabel.trim() || 'paquete')
        : unitLabel[supply.baseUnit];
      const lineTotal = Number((quantity * unitPrice).toFixed(2));
      const detailId = id();
      const detail: SupplyPurchaseDetail = {
        id: detailId, purchaseId, variantId: variant.id, sizeId, purchaseQuantity: quantity,
        purchaseUnitLabel, baseQuantityPerPack, inventoryQuantity, unitPrice, lineTotal,
      };
      const movement: SupplyMovement = {
        id: id(), variantId: variant.id, sizeId, delta: inventoryQuantity, kind: 'entrada',
        note: 'Compra ' + purchaseDocumentType + (documentNumber ? ' ' + documentNumber : '') + (purchaseNote.trim() ? ' · ' + purchaseNote.trim() : ''),
        date: createdAt, sourcePurchaseDetailId: detailId,
      };
      prepared.push({ detail, movement });
    }
    const purchase: SupplyPurchase = {
      id: purchaseId, supplierId: purchaseSupplierId || null, date: purchaseDate,
      documentType: purchaseDocumentType, documentNumber, note: purchaseNote.trim(),
      total: Number(prepared.reduce((sum, item) => sum + item.detail.lineTotal, 0).toFixed(2)),
      createdAt,
    };
    setData((current) => ({
      ...current,
      supplyPurchases: [...current.supplyPurchases, purchase],
      supplyPurchaseDetails: [...current.supplyPurchaseDetails, ...prepared.map((item) => item.detail)],
      supplyMovements: [...current.supplyMovements, ...prepared.map((item) => item.movement)],
    }));
    setShowPurchaseForm(false);
    setPurchaseDate(localDate()); setPurchaseSupplierId(''); setPurchaseDocumentType('Boleta');
    setPurchaseDocumentNumber(''); setPurchaseNote('');
    setPurchaseLines([{ id: id(), variantId: '', sizeId: '', quantity: '1', unitPrice: '' }]);
    tell('Compra registrada. Sus cantidades ya fueron ingresadas al inventario de avíos.');
  }

  function saveComponent(event: FormEvent) {
    event.preventDefault();
    if (!componentDraft || !componentDraft.name.trim()) return tell('Escribe el nombre del componente.', 'error');
    if (componentDraft.pieces.some((x) => !x.name.trim() || !Number.isInteger(x.unitsPerGarment) || x.unitsPerGarment <= 0)) return tell('Revisa las piezas auxiliares y sus cantidades.', 'error');
    if (componentDraft.materials.some((x) => !variantsBySupply.has(x.variantId) || x.wastePercent < 0 || (x.mode === 'fixed' && (!Number.isFinite(x.fixedQuantity) || (x.fixedQuantity ?? -1) < 0)))) return tell('Revisa los materiales y sus consumos.', 'error');
    const row = { ...componentDraft, name: componentDraft.name.trim(), updatedAt: now() };
    setData((current) => ({ ...current, components: current.components.some((x) => x.id === row.id) ? current.components.map((x) => x.id === row.id ? row : x) : [...current.components, row] }));
    setComponentDraft(null); tell('Componente guardado.');
  }
  function newComponent() {
    setComponentDraft({ id: id(), type: 'Cuello', name: '', description: '', imageUrl: '', active: true, pieces: [], materials: [], createdAt: now(), updatedAt: now() });
  }
  function saveRecipe(event: FormEvent) {
    event.preventDefault();
    if (!recipeDraft || !recipeDraft.name.trim()) return tell('Escribe el nombre de la receta.', 'error');
    if (recipeDraft.materials.some((x) => !variantsBySupply.has(x.variantId))) return tell('Selecciona variantes válidas en todos los materiales.', 'error');
    const row = { ...recipeDraft, name: recipeDraft.name.trim(), updatedAt: now() };
    setData((current) => ({ ...current, familyRecipes: current.familyRecipes.some((x) => x.id === row.id) ? current.familyRecipes.map((x) => x.id === row.id ? row : x) : [...current.familyRecipes, row] }));
    setRecipeDraft(null); tell('Receta estándar guardada.');
  }
  function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!productName.trim() || !productBaseId || !baseModels.some((x) => x.id === productBaseId)) return tell('Completa el nombre y selecciona un patrón base existente.', 'error');
    if (data.productModels.some((x) => x.name.toLocaleLowerCase('es') === productName.trim().toLocaleLowerCase('es'))) return tell('Ya existe un modelo configurado con ese nombre.', 'error');
    const row: ConfiguredProductModel = {
      id: id(), name: productName.trim(), family: productFamily, baseModelId: productBaseId, description: productDescription.trim(),
      components: productComponentIds.map((componentId) => ({ id: id(), componentId, quantity: 1, location: '', variantOverrides: {} })),
      additionalMaterials: [], active: true, createdAt: now(), updatedAt: now(),
    };
    setData((current) => ({ ...current, productModels: [...current.productModels, row] }));
    setSelectedProductId(row.id); setProductName(''); setProductDescription(''); setProductComponentIds([]);
    tell('Modelo configurado guardado. Se conservó intacto el patrón base.');
  }
  function deleteProduct(product: ConfiguredProductModel) {
    if (!window.confirm('¿Archivar el modelo configurado "' + product.name + '"? No se eliminará el patrón base ni el historial de piezas.')) return;
    setData((current) => ({ ...current, productModels: current.productModels.map((x) => x.id === product.id ? { ...x, active: false, updatedAt: now() } : x) }));
    if (selectedProductId === product.id) setSelectedProductId('');
    tell('Modelo archivado.');
  }
  function openRecipe(family: string) {
    const existing = data.familyRecipes.find((x) => x.family === family && x.active);
    setRecipeDraft(existing ? { ...existing, materials: existing.materials.map((x) => ({ ...x, bySize: { ...x.bySize } })) } : { id: id(), family, name: 'Receta general de ' + (families.find((x) => x.value === family)?.label ?? family), active: true, materials: [], updatedAt: now() });
  }
  function openComponent(component?: GarmentComponent) {
    setComponentDraft(component ? { ...component, pieces: component.pieces.map((x) => ({ ...x })), materials: component.materials.map((x) => ({ ...x, bySize: { ...x.bySize } })) } : null);
  }

  const textileName = (textileId: string | null) => textileContext.telas.find((x) => x.id === textileId)?.nombreTela ?? '';
  const textileColorOptions = textileContext.telaColores.filter((x) => x.idTela === variantTextileId && x.activo);
  const activeProduct = data.productModels.find((x) => x.id === selectedProductId && x.active);
  const plan = useMemo(() => {
    if (!activeProduct) return { rows: [] as Array<{ variantId: string; total: number; bySize: Record<string, number>; missingSizes: string[]; available: number; shortage: number; packs: number | null }>, unresolved: [] as string[] };
    const requirements: MaterialRequirement[] = [];
    const multipliers = new Map<string, number>();
    const recipes = data.familyRecipes.filter((x) => x.active && x.family === activeProduct.family);
    recipes.forEach((recipe) => recipe.materials.forEach((material) => { requirements.push(material); multipliers.set(material.id, 1); }));
    activeProduct.components.forEach((selected) => {
      const component = data.components.find((x) => x.id === selected.componentId && x.active);
      if (!component) return;
      component.materials.forEach((material) => {
        const copy = { ...material, variantId: selected.variantOverrides[material.id] ?? material.variantId };
        requirements.push(copy); multipliers.set(copy.id, selected.quantity);
      });
    });
    activeProduct.additionalMaterials.forEach((material) => { requirements.push(material); multipliers.set(material.id, 1); });
    const grouped = new Map<string, { bySize: Record<string, number>; missingSizes: string[] }>();
    const unresolved: string[] = [];
    for (const material of requirements) {
      const variant = variantsBySupply.get(material.variantId);
      const supply = variant ? supplies.find((x) => x.id === variant.supplyId) : undefined;
      if (!variant || !supply) { unresolved.push('Variante de insumo no disponible.'); continue; }
      const factor = conversionFactor(material.unit, supply.baseUnit);
      if (factor === null) { unresolved.push(supply.name + ': no se puede convertir ' + material.unit + ' a ' + supply.baseUnit + '.'); continue; }
      const row = grouped.get(variant.id) ?? { bySize: {}, missingSizes: [] };
      for (const size of sizes.filter((x) => x.groupId === baseModels.find((m) => m.id === activeProduct.baseModelId)?.sizeGroupId)) {
        const count = Number(planCounts[size.id] ?? 0);
        if (!Number.isFinite(count) || count < 0) continue;
        if (count === 0) continue;
        const consumption = material.mode === 'fixed' ? material.fixedQuantity : material.bySize[size.id];
        if (consumption === undefined || consumption === null || !Number.isFinite(consumption) || consumption < 0) {
          row.missingSizes.push(size.label);
          continue;
        }
        const multiplier = multipliers.get(material.id) ?? 1;
        const amount = consumption * factor * count * multiplier * (1 + material.wastePercent / 100);
        row.bySize[size.id] = (row.bySize[size.id] ?? 0) + amount;
      }
      grouped.set(variant.id, row);
    }
    const rows = [...grouped.entries()].map(([variantId, value]) => {
      const variant = variantsBySupply.get(variantId)!;
      const supply = supplies.find((x) => x.id === variant.supplyId)!;
      const total = Object.values(value.bySize).reduce((sum, x) => sum + x, 0);
      let available = 0;
      let shortage = 0;
      if (variant.textileId) {
        available = stockForVariant(variant, null);
        shortage = Math.max(0, total - available);
      } else if (supply.stockMode === 'total') {
        available = stockForVariant(variant, null);
        shortage = Math.max(0, total - available);
      } else {
        for (const [sizeId, needed] of Object.entries(value.bySize)) {
          const stock = stockForVariant(variant, sizeId);
          available += stock;
          shortage += Math.max(0, needed - stock);
        }
      }
      const packs = variant.purchasePackQuantity ? Math.ceil(shortage / variant.purchasePackQuantity) : null;
      return { variantId, total, bySize: value.bySize, missingSizes: [...new Set(value.missingSizes)], available, shortage, packs };
    });
    return { rows, unresolved };
  }, [activeProduct, data.familyRecipes, data.components, variantsBySupply, supplies, sizes, baseModels, planCounts, textileContext, data.supplyMovements, stockForVariant]);

  const mainPanel = (() => {
    if (view === 'insumos') return <section className="panel production-panel">
      <div className="panel-heading"><div><h2>Catálogo de insumos</h2><p>Registra cada material una sola vez y agrega sus variantes.</p></div><button className="button primary" onClick={() => setShowSupplyForm((x) => !x)}>＋ Nuevo insumo</button></div>
      {showSupplyForm && <form className="production-form" onSubmit={saveSupply}>
        <div className="production-form-grid">
          <label className="field-label">Nombre<input className="large-input" value={supplyName} onChange={(e) => setSupplyName(e.target.value)} placeholder="Ej. Hilo de remalle" required /></label>
          <label className="field-label">Categoría<select className="large-input" value={supplyCategory} onChange={(e) => setSupplyCategory(e.target.value as SupplyCategory)}>{categories.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label">Unidad de inventario<select className="large-input" value={supplyUnit} onChange={(e) => setSupplyUnit(e.target.value as StockUnit)}>{units.map((x) => <option key={x} value={x}>{unitLabel[x]}</option>)}</select></label>
          <label className="field-label">Control de existencias<select className="large-input" value={stockMode} onChange={(e) => setStockMode(e.target.value as 'total' | 'talla')}><option value="total">Cantidad total</option><option value="talla">Separada por talla</option></select></label>
        </div>
        <label className="field-label">Descripción<textarea className="large-input" rows={2} value={supplyDescription} onChange={(e) => setSupplyDescription(e.target.value)} placeholder="Uso habitual, especificaciones…" /></label>
        <label className="field-label">Características adicionales<textarea className="large-input" rows={2} value={supplyAttributes} onChange={(e) => setSupplyAttributes(e.target.value)} placeholder={'Una por línea. Ejemplo:\nAncho: 3.5 cm\nMaterial: Poliéster\nRigidez: Rígida'} /></label>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowSupplyForm(false)}>Cancelar</button><button className="button primary">Guardar insumo</button></div>
      </form>}
      {supplies.length === 0 && <div className="empty">Todavía no hay insumos. Registra el primero para crear sus variantes.</div>}
      <div className="production-list">{supplies.filter((x) => x.active).map((supply) => {
        const ownVariants = data.variants.filter((x) => x.supplyId === supply.id && x.active);
        return <article className="production-card" key={supply.id}>
          <div className="production-card-heading"><div><strong>{supply.name}</strong><span>{supply.category} · Stock en {unitLabel[supply.baseUnit]} · {supply.stockMode === 'talla' ? 'Por talla' : 'Total'}</span></div><button className="button secondary" onClick={() => openVariant(supply.id)}>＋ Variante</button></div>
          {supply.description && <p className="production-muted">{supply.description}</p>}
          {Object.entries(supply.attributes).length > 0 && <div className="production-attributes">{Object.entries(supply.attributes).map(([key, value]) => <span key={key}>{key}: {value}</span>)}</div>}
          {ownVariants.length === 0 && <small className="production-muted">Sin variantes registradas.</small>}
          {ownVariants.map((variant) => {
            const stock = supply.stockMode === 'total' ? stockForVariant(variant, null) : sizes.reduce((sum, size) => sum + stockForVariant(variant, size.id), 0);
            return <div className="production-variant" key={variant.id}>
              <div><strong>{variant.name}</strong><small>{variant.textileId ? 'Vinculado a tela: ' + textileName(variant.textileId) : variant.purchasePackQuantity ? 'Paquete: ' + format(variant.purchasePackQuantity) + ' ' + unitLabel[supply.baseUnit] + (variant.purchasePackLabel ? ' · ' + variant.purchasePackLabel : '') : 'Variante de inventario'}</small>{Object.entries(variant.attributes).map(([key, value]) => <small key={key}>{key}: {value}</small>)}</div>
              <div className="production-variant-stock"><strong>{format(stock)}</strong><small>{unitLabel[supply.baseUnit]}</small></div>
              {!variant.textileId && <button className="text-action" onClick={() => { setStockVariantId(variant.id); setStockSizeId(''); setStockQuantity(''); setShowStockForm(true); }}>Registrar stock</button>}
            </div>;
          })}
        </article>;
      })}</div>
    </section>;

    if (view === 'componentes') return <section className="panel production-panel">
      <div className="panel-heading"><div><h2>Biblioteca de componentes</h2><p>Configura una vez los acabados que podrás reutilizar en distintos modelos.</p></div><button className="button primary" onClick={newComponent}>＋ Nuevo componente</button></div>
      {componentDraft && <form className="production-form" onSubmit={saveComponent}>
        <div className="production-form-grid">
          <label className="field-label">Tipo<select className="large-input" value={componentDraft.type} onChange={(e) => setComponentDraft({ ...componentDraft, type: e.target.value })}>{componentTypes.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label">Nombre<input className="large-input" value={componentDraft.name} onChange={(e) => setComponentDraft({ ...componentDraft, name: e.target.value })} placeholder="Ej. Cuello camisero clásico" required /></label>
        </div>
        <label className="field-label">Fotografía de referencia (URL opcional)<input className="large-input" value={componentDraft.imageUrl} onChange={(e) => setComponentDraft({ ...componentDraft, imageUrl: e.target.value })} placeholder="https://…" /></label>
        <label className="field-label">Descripción<textarea className="large-input" rows={2} value={componentDraft.description} onChange={(e) => setComponentDraft({ ...componentDraft, description: e.target.value })} /></label>
        <div className="production-subheading"><strong>Piezas auxiliares de patronaje</strong><button type="button" className="text-action" onClick={() => setComponentDraft({ ...componentDraft, pieces: [...componentDraft.pieces, { id: id(), name: '', unitsPerGarment: 1, laterality: 'ninguna', fabricSlot: 'principal', colorId: null }] })}>＋ Agregar pieza</button></div>
        {componentDraft.pieces.map((piece, index) => <div className="production-piece-row" key={piece.id}>
          <label className="field-label">Nombre de pieza<input className="large-input" value={piece.name} onChange={(e) => setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? { ...x, name: e.target.value } : x) })} placeholder="Ej. Pechera" /></label>
          <label className="field-label">Piezas por prenda<input className="large-input" type="number" min="1" step="1" value={piece.unitsPerGarment} onChange={(e) => setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? { ...x, unitsPerGarment: Number(e.target.value) } : x) })} /></label>
          <label className="field-label">Lateralidad<select className="large-input" value={piece.laterality} onChange={(e) => setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? { ...x, laterality: e.target.value as ComponentPiece['laterality'] } : x) })}><option value="ninguna">Sin lado</option><option value="simetrica">Simétrica</option><option value="izquierda">Izquierda</option><option value="derecha">Derecha</option></select></label>
          <button type="button" className="text-action danger-action" onClick={() => setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.filter((_, i) => i !== index) })}>Quitar</button>
        </div>)}
        <MaterialEditor materials={componentDraft.materials} onChange={(materials) => setComponentDraft({ ...componentDraft, materials })} variants={variants} sizes={sizes} title="Materiales y consumos del componente" />
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setComponentDraft(null)}>Cancelar</button><button className="button primary">Guardar componente</button></div>
      </form>}
      <div className="production-component-grid">
        {data.components.filter((x) => x.active).map((component) => <article className="production-card" key={component.id}>
          {component.imageUrl && <img className="production-component-image" src={component.imageUrl} alt="" />}
          <div className="production-card-heading"><div><strong>{component.name}</strong><span>{component.type} · {component.pieces.length} piezas · {component.materials.length} materiales</span></div><button className="button secondary" onClick={() => openComponent(component)}>Editar</button></div>
          {component.description && <p className="production-muted">{component.description}</p>}
          <div className="production-attributes">{component.pieces.map((x) => <span key={x.id}>{x.name} ×{x.unitsPerGarment}</span>)}</div>
        </article>)}
      </div>
      {data.components.length === 0 && <div className="empty">Crea tu primer cuello, bolsillo o acabado reutilizable.</div>}
    </section>;

    if (view === 'modelos-producto') return <section className="panel production-panel">
      <div className="panel-heading"><div><h2>Crear modelo de prenda</h2><p>Selecciona un patrón base y agrega los componentes que distinguen el diseño.</p></div></div>
      <form className="production-form" onSubmit={saveProduct}>
        <div className="production-form-grid">
          <label className="field-label">Nombre comercial<input className="large-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ej. Polo escolar cuello camisero" required /></label>
          <label className="field-label">Familia<select className="large-input" value={productFamily} onChange={(e) => setProductFamily(e.target.value)}>{families.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
          <label className="field-label">Patrón base<select className="large-input" value={productBaseId} onChange={(e) => setProductBaseId(e.target.value)} required><option value="">Seleccionar patrón existente</option>{baseModels.map((x) => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
        </div>
        <label className="field-label">Descripción (opcional)<input className="large-input" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="Color, temporada, cliente…" /></label>
        <div className="production-subheading"><strong>Componentes y acabados</strong><span className="production-muted">Selecciona los que lleva esta prenda</span></div>
        {data.components.filter((x) => x.active).length === 0 && <p className="production-muted">Primero registra componentes en la biblioteca.</p>}
        <div className="production-check-list">{data.components.filter((x) => x.active).map((component) => <label key={component.id}>
          <input type="checkbox" checked={productComponentIds.includes(component.id)} onChange={(e) => setProductComponentIds((current) => e.target.checked ? [...current, component.id] : current.filter((x) => x !== component.id))} />
          <span><strong>{component.name}</strong><small>{component.type} · {component.materials.length} materiales asociados</small></span>
        </label>)}</div>
        <div className="form-actions"><button className="button primary" disabled={baseModels.length === 0}>Guardar modelo configurado</button></div>
      </form>
      <div className="production-subheading"><strong>Modelos configurados</strong><span className="count-badge">{data.productModels.filter((x) => x.active).length}</span></div>
      <div className="production-list">{data.productModels.filter((x) => x.active).map((product) => {
        const base = baseModels.find((x) => x.id === product.baseModelId);
        return <article className="production-card" key={product.id}>
          <div className="production-card-heading"><div><strong>{product.name}</strong><span>{families.find((x) => x.value === product.family)?.label ?? product.family} · Patrón: {base?.name ?? 'No disponible'}</span></div><button className="text-action danger-action" onClick={() => deleteProduct(product)}>Archivar</button></div>
          <div className="production-attributes">{product.components.map((x) => <span key={x.id}>{data.components.find((c) => c.id === x.componentId)?.name ?? 'Componente archivado'} ×{x.quantity}</span>)}</div>
          <small className="production-muted">El patrón base y su inventario de piezas permanecen independientes.</small>
        </article>;
      })}</div>
    </section>;

    if (view === 'recetas') return <section className="panel production-panel">
      <div className="panel-heading"><div><h2>Recetas estándar de confección</h2><p>Los materiales habituales se incorporan automáticamente a los modelos de su familia.</p></div></div>
      <div className="production-family-grid">{families.filter((x) => x.value !== 'otro').map((family) => {
        const recipe = data.familyRecipes.find((x) => x.family === family.value && x.active);
        return <article className="production-card" key={family.value}>
          <div className="production-card-heading"><div><strong>{family.label}</strong><span>{recipe ? recipe.materials.length + ' materiales configurados' : 'Sin receta general'}</span></div><button className="button secondary" onClick={() => openRecipe(family.value)}>{recipe ? 'Editar receta' : 'Configurar'}</button></div>
          {recipe && <div className="production-attributes">{recipe.materials.map((material) => <span key={material.id}>{variantLabel(variantsBySupply.get(material.variantId) ?? { id: '', supplyId: '', name: 'Material', attributes: {}, textileId: null, textileColorId: null, purchasePackQuantity: null, purchasePackLabel: '', active: true }, data.variants, supplies)}</span>)}</div>}
        </article>;
      })}</div>
      {recipeDraft && <form className="production-form" onSubmit={saveRecipe}>
        <div className="production-subheading"><strong>{recipeDraft.name}</strong><span>{families.find((x) => x.value === recipeDraft.family)?.label}</span></div>
        <label className="field-label">Nombre de la receta<input className="large-input" value={recipeDraft.name} onChange={(e) => setRecipeDraft({ ...recipeDraft, name: e.target.value })} /></label>
        <MaterialEditor materials={recipeDraft.materials} onChange={(materials) => setRecipeDraft({ ...recipeDraft, materials })} variants={variants} sizes={sizes} title="Materiales generales de confección" />
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setRecipeDraft(null)}>Cancelar</button><button className="button primary">Guardar receta</button></div>
      </form>}
    </section>;

    return <section className="panel production-panel">
      <div className="panel-heading"><div><h2>Planificación de materiales</h2><p>Indica cuántas prendas necesitas por talla. TelaStock calcula los consumos configurados.</p></div></div>
      <label className="field-label">Modelo de prenda<select className="large-input" value={selectedProductId} onChange={(e) => { setSelectedProductId(e.target.value); setPlanCounts({}); }}><option value="">Seleccionar modelo</option>{data.productModels.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      {activeProduct && (() => {
        const groupId = baseModels.find((x) => x.id === activeProduct.baseModelId)?.sizeGroupId;
        const productSizes = sizes.filter((x) => x.groupId === groupId);
        return <>
          <div className="production-size-grid planning-counts">
            {productSizes.map((size) => <label key={size.id}><span>{size.label}</span><input type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={planCounts[size.id] ?? ''} onChange={(e) => setPlanCounts((current) => ({ ...current, [size.id]: e.target.value }))} /></label>)}
          </div>
          <div className="production-subheading"><strong>Materiales necesarios</strong><span>{format(plan.rows.length)} variantes</span></div>
          {plan.unresolved.length > 0 && <div className="notice error"><strong>Revisar configuración:</strong> {plan.unresolved.join(' ')}</div>}
          {plan.rows.length === 0 && <div className="empty">Agrega cantidades por talla y verifica que el modelo tenga componentes o una receta general configurada.</div>}
          <div className="production-table-wrap"><table className="production-table"><thead><tr><th>Material</th><th>Necesario</th><th>Disponible</th><th>Faltante</th><th>Comprar</th></tr></thead><tbody>
            {plan.rows.map((row) => {
              const variant = variantsBySupply.get(row.variantId)!;
              const supply = supplies.find((x) => x.id === variant.supplyId)!;
              return <tr key={row.variantId}><td><strong>{supply.name}</strong><small>{variant.name}</small>{row.missingSizes.length > 0 && <em>Consumo pendiente: {row.missingSizes.join(', ')}</em>}</td><td>{format(row.total)} {supply.baseUnit}</td><td>{format(row.available)} {supply.baseUnit}</td><td className={row.shortage > 0 || row.missingSizes.length > 0 ? 'production-shortage' : 'production-ok'}>{format(row.shortage)} {supply.baseUnit}</td><td>{row.packs === null ? (row.shortage > 0 ? 'Sin presentación' : '—') : row.packs + ' ' + (variant.purchasePackLabel || 'paquete(s)')}</td></tr>;
            })}
          </tbody></table></div>
          <p className="production-muted">La planificación es una estimación basada en las recetas guardadas y el stock visible. No descuenta existencias ni crea compras automáticamente. El consumo real debe registrarse en su módulo correspondiente.</p>
        </>;
      })()}
      {!activeProduct && data.productModels.filter((x) => x.active).length === 0 && <div className="empty">Primero crea un modelo configurado a partir de un patrón base.</div>}
    </section>;
  })();

  return <div className="production-module">
    <div className="production-tabs" role="tablist" aria-label="Gestión de producción">
      <button className={view === 'insumos' ? 'active' : ''} onClick={() => onNavigate('insumos')} role="tab" aria-selected={view === 'insumos'}>Insumos</button>
      <button className={view === 'componentes' ? 'active' : ''} onClick={() => onNavigate('componentes')} role="tab" aria-selected={view === 'componentes'}>Componentes</button>
      <button className={view === 'modelos-producto' ? 'active' : ''} onClick={() => onNavigate('modelos-producto')} role="tab" aria-selected={view === 'modelos-producto'}>Modelos</button>
      <button className={view === 'recetas' ? 'active' : ''} onClick={() => onNavigate('recetas')} role="tab" aria-selected={view === 'recetas'}>Recetas</button>
      <button className={view === 'planificacion' ? 'active' : ''} onClick={() => onNavigate('planificacion')} role="tab" aria-selected={view === 'planificacion'}>Planificar</button>
    </div>
    {notice && <div className={'notice ' + notice.kind}><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Cerrar">×</button></div>}
    {mainPanel}
    {showVariantForm && <div className="modal-backdrop"><section className="modal production-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><h2>Nueva variante</h2><p>Registra color, ancho u otra característica.</p></div><button className="icon-button" onClick={() => setShowVariantForm(false)}>×</button></div>
      <form className="production-form" onSubmit={saveVariant}>
        <label className="field-label">Nombre de variante<input className="large-input" value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder="Ej. Negro · 3.5 cm" required /></label>
        <div className="production-form-grid"><label className="field-label">Cantidad por presentación<input className="large-input" type="number" min="0.001" step="0.001" value={variantPackQuantity} onChange={(e) => setVariantPackQuantity(e.target.value)} placeholder="Ej. 40" /></label><label className="field-label">Presentación<input className="large-input" value={variantPackLabel} onChange={(e) => setVariantPackLabel(e.target.value)} placeholder="Rollo, cono, docena…" /></label></div>
        <label className="field-label">Características de esta variante<textarea className="large-input" rows={3} value={variantAttributes} onChange={(e) => setVariantAttributes(e.target.value)} placeholder={'Una por línea. Ejemplo:\nColor: Negro\nAncho: 3.5 cm\nMaterial: Poliéster\nRigidez: Media'} /></label>
        {textileContext.telas.length > 0 && <div className="production-link-textile"><strong>Vincular con una tela existente (opcional)</strong><label className="field-label">Tela<select className="large-input" value={variantTextileId} onChange={(e) => { setVariantTextileId(e.target.value); setVariantTextileColorId(''); }}><option value="">Sin vincular</option>{textileContext.telas.map((x) => <option key={x.id} value={x.id}>{x.nombreTela}</option>)}</select></label>
          {variantTextileId && <label className="field-label">Color de esa tela<select className="large-input" value={variantTextileColorId} onChange={(e) => setVariantTextileColorId(e.target.value)}><option value="">Seleccionar color</option>{textileColorOptions.map((x) => <option key={x.id} value={x.id}>{textileContext.colores.find((c) => c.id === x.idColor)?.nombre ?? 'Color'}</option>)}</select></label>}
        </div>}
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowVariantForm(false)}>Cancelar</button><button className="button primary">Guardar variante</button></div>
      </form></section></div>}
    {showStockForm && <div className="modal-backdrop"><section className="modal production-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><h2>Movimiento de stock</h2><p>Registra una entrada o salida de la variante.</p></div><button className="icon-button" onClick={() => setShowStockForm(false)}>×</button></div>
      <form className="production-form" onSubmit={saveStock}>
        <label className="field-label">Operación<select className="large-input" value={stockDirection} onChange={(e) => setStockDirection(e.target.value as 'entrada' | 'salida')}><option value="entrada">Entrada</option><option value="salida">Salida</option></select></label>
        {(() => { const variant = variantsBySupply.get(stockVariantId); const supply = variant ? supplies.find((x) => x.id === variant.supplyId) : undefined; return supply?.stockMode === 'talla' ? <label className="field-label">Talla<select className="large-input" value={stockSizeId} onChange={(e) => setStockSizeId(e.target.value)}><option value="">Seleccionar</option>{sizes.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label> : null; })()}
        <label className="field-label">Cantidad<input className="large-input" type="number" min="0.001" step="0.001" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} required /></label>
        <label className="field-label">Observación<input className="large-input" value={stockNote} onChange={(e) => setStockNote(e.target.value)} /></label>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowStockForm(false)}>Cancelar</button><button className="button primary">Guardar movimiento</button></div>
      </form></section></div>}
  </div>;
}
