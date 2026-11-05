'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getCompleteUnits, getPieceStock, getSymmetricStock, type PieceMovement as DomainPieceMovement, type ManufacturingModel, type ModelPiece, type Size, type SizeGroup } from '@/lib/inventory-domain';
import { FABRIC_STORAGE_KEYS, type RollMovement as FabricRollMovement } from '@/app/fabric-module';

export type ProductionView = 'insumos' | 'compras-avios' | 'componentes' | 'modelos-producto' | 'recetas' | 'planificacion' | 'ordenes';
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
  sourceProductionOrderId?: string | null;
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

export type ComponentPieceMovement = {
  id: string;
  componentId: string;
  pieceId: string;
  sizeId: string;
  delta: number;
  kind: 'entrada' | 'salida' | 'ajuste';
  side?: 'izquierda' | 'derecha';
  note: string;
  date: string;
  sourceProductionOrderId?: string | null;
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

export type ProductionOrderStatus = 'borrador' | 'reservada' | 'en_proceso' | 'completada' | 'cancelada';
export type ProductionOrderMaterial = {
  id: string; variantId: string; sizeId: string | null; quantity: number; unit: StockUnit;
  unitCost: number | null; lineCost: number | null;
};
export type ProductionOrderPieceRequirement = { id: string; pieceId: string; sizeId: string; side: 'izquierda' | 'derecha' | null; quantity: number };
export type ProductionOrderComponentPieceRequirement = ProductionOrderPieceRequirement & { componentId: string };
export type ProductionOrderRollAllocation = { id: string; variantId: string; rollId: string; unit: 'KG' | 'M'; quantity: number };
export type ProductionOrder = {
  id: string; number: string; productModelId: string; productName: string; baseModelId: string;
  status: ProductionOrderStatus; quantities: Record<string, number>;
  materials: ProductionOrderMaterial[]; basePieces: ProductionOrderPieceRequirement[];
  componentPieces: ProductionOrderComponentPieceRequirement[]; rollAllocations: ProductionOrderRollAllocation[];
  estimatedMaterialCost: number | null; missingCostLines: number; note: string;
  createdAt: string; updatedAt: string; reservedAt?: string | null; startedAt?: string | null;
  completedAt?: string | null; cancelledAt?: string | null;
};

export type ProductionBackupData = {
  supplies: Supply[];
  variants: SupplyVariant[];
  supplyMovements: SupplyMovement[];
  supplyPurchases: SupplyPurchase[];
  supplyPurchaseDetails: SupplyPurchaseDetail[];
  componentPieceMovements: ComponentPieceMovement[];
  productionOrders: ProductionOrder[];
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
  componentPieceMovements: 'telastock-component-piece-movements-v1',
  productionOrders: 'telastock-production-orders-v1',
  components: 'telastock-garment-components-v1',
  familyRecipes: 'telastock-family-recipes-v1',
  productModels: 'telastock-configured-product-models-v1',
} as const;

export function emptyProductionBackupData(): ProductionBackupData {
  return { supplies: [], variants: [], supplyMovements: [], supplyPurchases: [], supplyPurchaseDetails: [], componentPieceMovements: [], productionOrders: [], components: [], familyRecipes: [], productModels: [] };
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
  const allComponentPieces = output.components.flatMap((component) => Array.isArray(component.pieces) ? component.pieces.filter((piece) => piece && typeof piece === 'object').map((piece) => ({ componentId: component.id, piece })) : []);
  const componentPieceMap = new Map(allComponentPieces.map(({ componentId, piece }) => [piece.id, { componentId, piece }] as const));
  if (componentPieceMap.size !== allComponentPieces.length) throw new Error('Hay identificadores repetidos entre piezas auxiliares.');
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
  if (!output.supplyPurchases.every((x) => typeof x.date === 'string' && x.date.length > 0 && (x.supplierId === null || typeof x.supplierId === 'string') && typeof x.documentType === 'string' && typeof x.documentNumber === 'string' && Number.isFinite(x.total) && x.total >= 0)) {
    throw new Error('Hay encabezados de compra de avíos inválidos.');
  }
  if (!output.supplyPurchaseDetails.every((x) => {
    const variant = output.variants.find((item) => item.id === x.variantId);
    const supply = variant ? output.supplies.find((item) => item.id === variant.supplyId) : undefined;
    return purchaseIds.has(x.purchaseId) && Boolean(variant && supply) && !variant?.textileId &&
      (supply?.stockMode === 'talla' ? typeof x.sizeId === 'string' && x.sizeId.length > 0 : x.sizeId === null) &&
      Number.isFinite(x.purchaseQuantity) && x.purchaseQuantity > 0 &&
      Number.isFinite(x.baseQuantityPerPack) && x.baseQuantityPerPack > 0 &&
      Number.isFinite(x.inventoryQuantity) && x.inventoryQuantity > 0 &&
      (supply?.baseUnit !== 'und' || Number.isInteger(x.purchaseQuantity) && Number.isInteger(x.inventoryQuantity)) &&
      Math.abs(x.inventoryQuantity - x.purchaseQuantity * x.baseQuantityPerPack) < 0.00001 &&
      typeof x.purchaseUnitLabel === 'string' && x.purchaseUnitLabel.trim().length > 0 &&
      Number.isFinite(x.unitPrice) && x.unitPrice >= 0 && Number.isFinite(x.lineTotal) && x.lineTotal >= 0 &&
      Math.abs(x.lineTotal - x.purchaseQuantity * x.unitPrice) < 0.02;
  })) {
    throw new Error('Hay detalles de compra de avíos inválidos.');
  }
  if (!output.supplyPurchases.every((purchase) => {
    const total = output.supplyPurchaseDetails.filter((detail) => detail.purchaseId === purchase.id).reduce((sum, detail) => sum + detail.lineTotal, 0);
    return Math.abs(total - purchase.total) < 0.02;
  })) throw new Error('El total de algún comprobante no coincide con sus detalles.');
  if (!output.supplyMovements.every((movement) => {
    if (!movement.sourcePurchaseDetailId) return true;
    const detail = output.supplyPurchaseDetails.find((item) => item.id === movement.sourcePurchaseDetailId);
    return Boolean(detail && movement.kind === 'entrada' && movement.variantId === detail.variantId &&
      movement.sizeId === detail.sizeId && Math.abs(movement.delta - detail.inventoryQuantity) < 0.00001);
  })) throw new Error('Hay movimientos de compra que no coinciden con su detalle.');
  if (!output.productionOrders.every((order) => {
    const statuses: ProductionOrderStatus[] = ['borrador', 'reservada', 'en_proceso', 'completada', 'cancelada'];
    return typeof order.number === 'string' && order.number.trim().length > 0 &&
      typeof order.productModelId === 'string' && typeof order.productName === 'string' &&
      typeof order.baseModelId === 'string' && statuses.includes(order.status) &&
      order.quantities && typeof order.quantities === 'object' &&
      Array.isArray(order.materials) && order.materials.every((line) =>
        variantIds.has(line.variantId) && (line.sizeId === null || typeof line.sizeId === 'string') &&
        Number.isFinite(line.quantity) && line.quantity > 0 && ['und','m','cm','g','kg','l','ml'].includes(line.unit) &&
        (line.unitCost === null || Number.isFinite(line.unitCost) && line.unitCost >= 0) &&
        (line.lineCost === null || Number.isFinite(line.lineCost) && line.lineCost >= 0)
      ) &&
      Array.isArray(order.basePieces) && order.basePieces.every((line) => typeof line.pieceId === 'string' && typeof line.sizeId === 'string' && Number.isInteger(line.quantity) && line.quantity > 0 && (line.side === null || line.side === 'izquierda' || line.side === 'derecha')) &&
      Array.isArray(order.componentPieces) && order.componentPieces.every((line) => componentPieceMap.has(line.pieceId) && componentPieceMap.get(line.pieceId)?.componentId === line.componentId && typeof line.sizeId === 'string' && Number.isInteger(line.quantity) && line.quantity > 0 && (line.side === null || line.side === 'izquierda' || line.side === 'derecha')) &&
      Array.isArray(order.rollAllocations) && order.rollAllocations.every((allocation) => variantIds.has(allocation.variantId) && typeof allocation.rollId === 'string' && ['KG','M'].includes(allocation.unit) && Number.isFinite(allocation.quantity) && allocation.quantity > 0) &&
      Number.isInteger(order.missingCostLines) && order.missingCostLines >= 0 &&
      (order.estimatedMaterialCost === null || Number.isFinite(order.estimatedMaterialCost) && order.estimatedMaterialCost >= 0);
  })) throw new Error('Hay órdenes de producción con datos o relaciones inválidas.');
  if (!output.components.every((x) => typeof x.name === 'string' && x.name.trim() && typeof x.type === 'string' && x.type.trim() && Array.isArray(x.pieces) && x.pieces.every((p) => p && typeof p.id === 'string' && p.id.trim() && typeof p.name === 'string' && p.name.trim() && Number.isInteger(p.unitsPerGarment) && p.unitsPerGarment > 0 && ['ninguna', 'simetrica', 'izquierda', 'derecha'].includes(p.laterality) && (p.laterality !== 'simetrica' || p.unitsPerGarment % 2 === 0)) && validMaterials(x.materials))) {
    throw new Error('Hay componentes con piezas o materiales inválidos.');
  }
  if (!output.componentPieceMovements.every((movement) => {
    const owner = componentPieceMap.get(movement.pieceId);
    return owner?.componentId === movement.componentId &&
      typeof movement.sizeId === 'string' && movement.sizeId.length > 0 &&
      Number.isInteger(movement.delta) && movement.delta !== 0 &&
      ['entrada', 'salida', 'ajuste'].includes(movement.kind) &&
      !((movement.kind === 'entrada' && movement.delta < 0) || (movement.kind === 'salida' && movement.delta > 0)) &&
      (movement.side === undefined || movement.side === 'izquierda' || movement.side === 'derecha') &&
      (owner.piece.laterality === 'simetrica' || movement.side === undefined) &&
      typeof movement.note === 'string' && typeof movement.date === 'string';
  })) throw new Error('Hay movimientos de piezas auxiliares inválidos o desvinculados de su componente.');
  for (const [pieceId, owner] of componentPieceMap) {
    const rows = output.componentPieceMovements.filter((movement) => movement.pieceId === pieceId);
    const bySize = new Map<string, ComponentPieceMovement[]>();
    rows.forEach((movement) => bySize.set(movement.sizeId, [...(bySize.get(movement.sizeId) ?? []), movement]));
    for (const movements of bySize.values()) {
      if (owner.piece.laterality === 'simetrica') {
        const legacy = movements.filter((movement) => !movement.side).reduce((sum, movement) => sum + movement.delta, 0);
        const pairs = Math.floor(Math.max(0, legacy) / 2);
        const left = pairs + movements.filter((movement) => movement.side === 'izquierda').reduce((sum, movement) => sum + movement.delta, 0);
        const right = pairs + movements.filter((movement) => movement.side === 'derecha').reduce((sum, movement) => sum + movement.delta, 0);
        if (legacy < 0 || left < 0 || right < 0) throw new Error('El respaldo contiene stock negativo en una pieza auxiliar simétrica.');
      } else if (movements.reduce((sum, movement) => sum + movement.delta, 0) < 0) {
        throw new Error('El respaldo contiene stock negativo en una pieza auxiliar.');
      }
    }
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
type RollRow = { id: string; idTela: string; idTelaColor?: string | null; unidadIngreso?: 'KG' | 'M'; metros: number | null; pesoKg: number | null; estado: string; fechaIngreso?: string; updatedAt?: string; ubicacion?: string; idLote?: string };
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
  view, baseModels, basePieces, baseMovements, sizes, sizeGroups, onAddBaseMovements, onNavigate,
}: {
  view: ProductionView;
  baseModels: ManufacturingModel[];
  basePieces: ModelPiece[];
  baseMovements: DomainPieceMovement[];
  sizes: Size[];
  sizeGroups: SizeGroup[];
  onAddBaseMovements: (movements: DomainPieceMovement[]) => boolean;
  onNavigate: (view: ProductionView) => void;
}) {
  const [data, setData] = useState<ProductionBackupData>(emptyProductionBackupData);
  const [ready, setReady] = useState(false);
  const [storageSafe, setStorageSafe] = useState(true);
  const [notice, setNotice] = useState<{ text: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const [textileContext, setTextileContext] = useState<TextileContext>({ telas: [], rollos: [], telaColores: [], colores: [], proveedores: [] });
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [selectedStockComponentId, setSelectedStockComponentId] = useState('');
  const [showComponentPieceMovement, setShowComponentPieceMovement] = useState(false);
  const [componentStockPieceId, setComponentStockPieceId] = useState('');
  const [componentStockSizeId, setComponentStockSizeId] = useState('');
  const [componentStockKind, setComponentStockKind] = useState<'entrada' | 'salida'>('entrada');
  const [componentStockMode, setComponentStockMode] = useState<'paridad' | 'lado'>('paridad');
  const [componentStockSide, setComponentStockSide] = useState<'izquierda' | 'derecha'>('izquierda');
  const [componentStockQuantity, setComponentStockQuantity] = useState('');
  const [componentStockNote, setComponentStockNote] = useState('Ingreso de piezas auxiliares');
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
  const [orderNote, setOrderNote] = useState('');

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
    if (version > 2) { safe = false; warning = 'Los datos de insumos fueron creados con una versión más reciente. Se evita sobrescribirlos.'; }
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
    if (loaded.safe) localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '2');
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
  const sizeDisplay = (size: Size) => size.label + ' · ' + (sizeGroups.find((group) => group.id === size.groupId)?.name ?? 'Grupo');


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
    if (variantPackQuantity.trim() && (packQuantity === null || !Number.isFinite(packQuantity) || packQuantity <= 0 || (supply.baseUnit === 'und' && !Number.isInteger(packQuantity)))) return tell(supply.baseUnit === 'und' ? 'La equivalencia para unidades debe ser un entero.' : 'La equivalencia del paquete debe ser mayor que cero.', 'error');
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
  function componentPieceDomainLedger(pieceId: string, sizeId: string): DomainPieceMovement[] {
    return data.componentPieceMovements.filter((movement) => movement.pieceId === pieceId && movement.sizeId === sizeId).map((movement) => ({
      id: movement.id, pieceId: movement.pieceId, sizeId: movement.sizeId, delta: movement.delta,
      kind: movement.kind, side: movement.side, note: movement.note, date: movement.date,
    }));
  }
  function componentPieceStockLabel(piece: ComponentPiece, sizeId: string): string {
    const ledger = componentPieceDomainLedger(piece.id, sizeId);
    if (piece.laterality === 'simetrica') {
      const stock = getSymmetricStock(ledger, piece.id, sizeId);
      return stock.left === stock.right ? format(stock.parity) + ' par.' : format(stock.left) + '/' + format(stock.right);
    }
    return format(getPieceStock(ledger, piece.id, sizeId));
  }
  function openComponentPieceMovement(component: GarmentComponent, piece: ComponentPiece) {
    setSelectedStockComponentId(component.id);
    setComponentStockPieceId(piece.id);
    setComponentStockSizeId(sizes[0]?.id ?? '');
    setComponentStockKind('entrada');
    setComponentStockMode('paridad');
    setComponentStockSide('izquierda');
    setComponentStockQuantity('');
    setComponentStockNote('Ingreso de piezas auxiliares');
    setShowComponentPieceMovement(true);
  }
  function saveComponentPieceMovement(event: FormEvent) {
    event.preventDefault();
    const component = data.components.find((item) => item.id === selectedStockComponentId);
    const piece = component?.pieces.find((item) => item.id === componentStockPieceId);
    const quantity = Number(componentStockQuantity);
    if (!component || !piece) return tell('No se encontró la pieza auxiliar seleccionada.', 'error');
    if (!componentStockSizeId || !sizes.some((size) => size.id === componentStockSizeId)) return tell('Selecciona una talla válida.', 'error');
    if (!Number.isInteger(quantity) || quantity <= 0) return tell('La cantidad debe ser un entero mayor que cero.', 'error');
    const sign = componentStockKind === 'entrada' ? 1 : -1;
    const createdAt = now();
    const movements: ComponentPieceMovement[] = [];
    const createMovement = (side?: 'izquierda' | 'derecha') => movements.push({
      id: id(), componentId: component.id, pieceId: piece.id, sizeId: componentStockSizeId,
      delta: sign * quantity, kind: componentStockKind, side, note: componentStockNote.trim(), date: createdAt,
    });
    if (piece.laterality === 'simetrica' && componentStockMode === 'paridad') {
      createMovement('izquierda');
      createMovement('derecha');
    } else if (piece.laterality === 'simetrica') {
      createMovement(componentStockSide);
    } else {
      createMovement();
    }
    const candidate = [...data.componentPieceMovements, ...movements];
    const ledger: DomainPieceMovement[] = candidate.filter((movement) => movement.pieceId === piece.id && movement.sizeId === componentStockSizeId).map((movement) => ({
      id: movement.id, pieceId: movement.pieceId, sizeId: movement.sizeId, delta: movement.delta,
      kind: movement.kind, side: movement.side, note: movement.note, date: movement.date,
    }));
    if (piece.laterality === 'simetrica') {
      const legacy = ledger.filter((movement) => !movement.side).reduce((sum, movement) => sum + movement.delta, 0);
      const legacyPairs = Math.floor(Math.max(0, legacy) / 2);
      const left = legacyPairs + ledger.filter((movement) => movement.side === 'izquierda').reduce((sum, movement) => sum + movement.delta, 0);
      const right = legacyPairs + ledger.filter((movement) => movement.side === 'derecha').reduce((sum, movement) => sum + movement.delta, 0);
      const reservedLeft = reservedPieceQuantity(ordersHoldingStock.flatMap((order) => order.componentPieces), piece.id, componentStockSizeId, 'izquierda');
      const reservedRight = reservedPieceQuantity(ordersHoldingStock.flatMap((order) => order.componentPieces), piece.id, componentStockSizeId, 'derecha');
      if (legacy < 0 || left < reservedLeft || right < reservedRight) return tell('No puedes retirar ese stock: hay piezas reservadas para órdenes de producción.', 'error');
    } else {
      const reserved = reservedPieceQuantity(ordersHoldingStock.flatMap((order) => order.componentPieces), piece.id, componentStockSizeId, null);
      if (getPieceStock(ledger, piece.id, componentStockSizeId) < reserved) return tell('No puedes retirar ese stock: hay piezas reservadas para órdenes de producción.', 'error');
    }
    setData((current) => ({ ...current, componentPieceMovements: [...current.componentPieceMovements, ...movements] }));
    setShowComponentPieceMovement(false);
    tell('Movimiento de inventario auxiliar registrado.');
  }

  function saveStock(event: FormEvent) {
    event.preventDefault();
    const variant = variantsBySupply.get(stockVariantId);
    const supply = variant ? supplies.find((x) => x.id === variant.supplyId) : undefined;
    const quantity = Number(stockQuantity);
    if (!variant || !supply || !Number.isFinite(quantity) || quantity <= 0 || (supply.baseUnit === 'und' && !Number.isInteger(quantity))) return tell('Selecciona una variante e ingresa una cantidad válida para su unidad de inventario.', 'error');
    if (variant.textileId) return tell('Esta variante utiliza el stock real de rollos. Registra sus entradas o consumos desde Inventario de rollos.', 'info');
    if (supply.stockMode === 'talla' && !stockSizeId) return tell('Selecciona la talla de este insumo.', 'error');
    const sizeId = supply.stockMode === 'talla' ? stockSizeId : null;
    const delta = stockDirection === 'entrada' ? quantity : -quantity;
    if (delta < 0 && stockForVariant(variant, sizeId) - reservedSupplyQuantity(variant.id, sizeId) < quantity) return tell('No puedes retirar esa cantidad: una parte del stock está reservada para órdenes de producción.', 'error');
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
      if (line.unitPrice.trim() === '' || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || (supply.baseUnit === 'und' && (!Number.isInteger(quantity) || !Number.isInteger(quantity * (variant.purchasePackQuantity ?? 1))))) return tell('Revisa las cantidades y precios. Los insumos controlados por unidades requieren cantidades enteras.', 'error');
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
    if (componentDraft.pieces.some((x) => !x.name.trim() || !Number.isInteger(x.unitsPerGarment) || x.unitsPerGarment <= 0 || (x.laterality === 'simetrica' && x.unitsPerGarment % 2 !== 0))) return tell('Revisa las piezas auxiliares. Una pieza simétrica requiere una cantidad par por prenda.', 'error');
    const previous = data.components.find((item) => item.id === componentDraft.id);
    const removedStockedPiece = previous?.pieces.find((oldPiece) =>
      data.componentPieceMovements.some((movement) => movement.pieceId === oldPiece.id) &&
      (!componentDraft.pieces.some((nextPiece) => nextPiece.id === oldPiece.id) ||
        componentDraft.pieces.find((nextPiece) => nextPiece.id === oldPiece.id)?.laterality !== oldPiece.laterality)
    );
    if (removedStockedPiece) return tell('No puedes quitar ni cambiar la lateralidad de "' + removedStockedPiece.name + '" porque ya tiene movimientos de inventario.', 'error');
    if (componentDraft.materials.some((x) => !variantsBySupply.has(x.variantId) || x.wastePercent < 0 || (x.mode === 'fixed' && (!Number.isFinite(x.fixedQuantity) || (x.fixedQuantity ?? -1) < 0)))) return tell('Revisa los materiales y sus consumos.', 'error');
    const row = { ...componentDraft, name: componentDraft.name.trim(), updatedAt: now() };
    const otherPieceIds = new Set(data.components.filter((component) => component.id !== row.id).flatMap((component) => component.pieces.map((piece) => piece.id)));
    const draftPieceIds = row.pieces.map((piece) => piece.id);
    if (new Set(draftPieceIds).size !== draftPieceIds.length || row.pieces.some((piece) => otherPieceIds.has(piece.id))) return tell('Cada pieza necesita un identificador propio. Vuelve a agregar la pieza duplicada.', 'error');
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
  const selectedStockComponent = data.components.find((x) => x.id === selectedStockComponentId && x.active);
  const selectedComponentStockPiece = selectedStockComponent?.pieces.find((x) => x.id === componentStockPieceId);
  function getProductFabricableCapacity(product: ConfiguredProductModel, sizeId: string) {
    const baseModel = baseModels.find((item) => item.id === product.baseModelId);
    const baseModelPieces = basePieces.filter((piece) => piece.modelId === product.baseModelId && !piece.archived);
    const baseCapacity = baseModel ? getCompleteUnits(baseModelPieces, baseMovements, sizeId) : 0;
    let componentCapacity = Number.POSITIVE_INFINITY;
    let limitingComponent = '';
    product.components.forEach((selection) => {
      const component = data.components.find((item) => item.id === selection.componentId && item.active);
      if (!component || component.pieces.length === 0) return;
      let currentComponentCapacity = Number.POSITIVE_INFINITY;
      component.pieces.forEach((piece) => {
        const ledger = componentPieceDomainLedger(piece.id, sizeId);
        const required = piece.unitsPerGarment * selection.quantity;
        const capacity = piece.laterality === 'simetrica'
          ? Math.floor(Math.min(getSymmetricStock(ledger, piece.id, sizeId).left, getSymmetricStock(ledger, piece.id, sizeId).right) / (required / 2))
          : Math.floor(Math.max(0, getPieceStock(ledger, piece.id, sizeId)) / required);
        if (capacity < currentComponentCapacity) currentComponentCapacity = capacity;
      });
      if (currentComponentCapacity < componentCapacity) {
        componentCapacity = currentComponentCapacity;
        limitingComponent = component.name;
      }
    });
    const boundedComponentCapacity = Number.isFinite(componentCapacity) ? componentCapacity : null;
    const fabricable = boundedComponentCapacity === null ? baseCapacity : Math.min(baseCapacity, boundedComponentCapacity);
    const limitingResource = boundedComponentCapacity === null || baseCapacity < boundedComponentCapacity
      ? 'Patrón base'
      : baseCapacity === boundedComponentCapacity ? 'Patrón y auxiliar' : limitingComponent;
    return { baseCapacity, componentCapacity: boundedComponentCapacity, fabricable, limitingComponent: limitingResource };
  }
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


  const holdingStatuses: ProductionOrderStatus[] = ['reservada', 'en_proceso'];
  const ordersHoldingStock = data.productionOrders.filter((order) => holdingStatuses.includes(order.status));
  const isUnitCostAvailable = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;

  function latestUnitCost(variant: SupplyVariant, unit: StockUnit): number | null {
    if (variant.textileId) {
      const fabricRolls = safeRead<Array<{ id: string; idTela: string; idTelaColor?: string | null }>>(FABRIC_STORAGE_KEYS.rollos, []);
      const fabricPurchases = safeRead<Array<{ id: string; fechaCompra: string; updatedAt?: string }>>(FABRIC_STORAGE_KEYS.compras, []);
      const fabricDetails = safeRead<Array<{ idCompra: string; idRollo: string; unidadPrecio: 'KG' | 'M'; precioUnitario: number }>>(FABRIC_STORAGE_KEYS.detalleCompra, []);
      const purchaseById = new Map(fabricPurchases.map((purchase) => [purchase.id, purchase]));
      const rollById = new Map(fabricRolls.map((roll) => [roll.id, roll]));
      const targetUnit = unit === 'm' ? 'M' : unit === 'kg' ? 'KG' : null;
      if (!targetUnit) return null;
      const candidates = fabricDetails.map((detail, index) => {
        const roll = rollById.get(detail.idRollo);
        const purchase = purchaseById.get(detail.idCompra);
        return { detail, roll, purchase, index };
      }).filter((item) => item.roll?.idTela === variant.textileId &&
        (!variant.textileColorId || item.roll.idTelaColor === variant.textileColorId) &&
        item.detail.unidadPrecio === targetUnit && Number.isFinite(item.detail.precioUnitario) && item.detail.precioUnitario >= 0
      ).sort((a, b) =>
        (b.purchase?.fechaCompra ?? '').localeCompare(a.purchase?.fechaCompra ?? '') ||
        (b.purchase?.updatedAt ?? '').localeCompare(a.purchase?.updatedAt ?? '') || b.index - a.index
      );
      return candidates[0]?.detail.precioUnitario ?? null;
    }
    const candidates = data.supplyPurchaseDetails.map((detail, index) => ({
      detail,
      purchase: data.supplyPurchases.find((purchase) => purchase.id === detail.purchaseId),
      index,
    })).filter((item) => item.detail.variantId === variant.id)
      .sort((a, b) =>
        (b.purchase?.date ?? '').localeCompare(a.purchase?.date ?? '') ||
        (b.purchase?.createdAt ?? '').localeCompare(a.purchase?.createdAt ?? '') || b.index - a.index
      );
    const detail = candidates[0]?.detail;
    return detail ? detail.unitPrice / detail.baseQuantityPerPack : null;
  }

  function makePieceRequirements(product: ConfiguredProductModel, quantities: Record<string, number>) {
    const base: ProductionOrderPieceRequirement[] = [];
    const auxiliary: ProductionOrderComponentPieceRequirement[] = [];
    const productBasePieces = basePieces.filter((piece) => piece.modelId === product.baseModelId && !piece.archived);
    for (const [sizeId, garmentCount] of Object.entries(quantities)) {
      for (const piece of productBasePieces) {
        if (piece.laterality === 'simetrica') {
          if (piece.unitsPerGarment % 2 !== 0) throw new Error('El molde base "' + piece.name + '" tiene una cantidad simétrica impar.');
          const eachSide = garmentCount * piece.unitsPerGarment / 2;
          if (eachSide > 0) {
            base.push({ id: id(), pieceId: piece.id, sizeId, side: 'izquierda', quantity: eachSide });
            base.push({ id: id(), pieceId: piece.id, sizeId, side: 'derecha', quantity: eachSide });
          }
        } else {
          const required = garmentCount * piece.unitsPerGarment;
          if (required > 0) base.push({ id: id(), pieceId: piece.id, sizeId, side: null, quantity: required });
        }
      }
      for (const selection of product.components) {
        const component = data.components.find((item) => item.id === selection.componentId && item.active);
        if (!component) throw new Error('Un componente del modelo ya no está disponible. Revisa el modelo antes de crear la orden.');
        for (const piece of component.pieces) {
          const perGarment = piece.unitsPerGarment * selection.quantity;
          const required = garmentCount * perGarment;
          if (!Number.isInteger(required)) throw new Error('La cantidad de "' + piece.name + '" no es un número entero de piezas por talla.');
          if (piece.laterality === 'simetrica') {
            if (!Number.isInteger(perGarment) || perGarment % 2 !== 0) throw new Error('La pieza simétrica "' + piece.name + '" necesita una cantidad par por prenda.');
            const eachSide = required / 2;
            if (eachSide > 0) {
              auxiliary.push({ id: id(), componentId: component.id, pieceId: piece.id, sizeId, side: 'izquierda', quantity: eachSide });
              auxiliary.push({ id: id(), componentId: component.id, pieceId: piece.id, sizeId, side: 'derecha', quantity: eachSide });
            }
          } else if (required > 0) {
            auxiliary.push({ id: id(), componentId: component.id, pieceId: piece.id, sizeId, side: null, quantity: required });
          }
        }
      }
    }
    return { base, auxiliary };
  }

  function createProductionOrderDraft() {
    if (!activeProduct) return tell('Selecciona un modelo configurado antes de crear una orden.', 'error');
    if (plan.unresolved.length > 0) return tell('No se puede crear la orden: hay materiales con unidades o variantes sin resolver.', 'error');
    if (plan.rows.some((row) => row.missingSizes.length > 0)) return tell('Completa los consumos por talla que faltan antes de crear la orden.', 'error');
    const groupId = baseModels.find((model) => model.id === activeProduct.baseModelId)?.sizeGroupId;
    const productSizes = sizes.filter((size) => size.groupId === groupId);
    const quantities: Record<string, number> = {};
    for (const size of productSizes) {
      const raw = planCounts[size.id] ?? '';
      if (raw.trim() === '') continue;
      const count = Number(raw);
      if (!Number.isInteger(count) || count < 0) return tell('Las cantidades de una orden deben ser números enteros iguales o mayores que cero.', 'error');
      if (count > 0) quantities[size.id] = count;
    }
    if (Object.keys(quantities).length === 0) return tell('Indica al menos una cantidad de prendas por talla.', 'error');

    const orderMaterials: ProductionOrderMaterial[] = [];
    for (const row of plan.rows) {
      const variant = variantsBySupply.get(row.variantId);
      const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
      if (!variant || !supply) return tell('Una variante de material dejó de estar disponible. Revisa la receta.', 'error');
      const cost = latestUnitCost(variant, supply.baseUnit);
      const addLine = (sizeId: string | null, quantity: number) => {
        if (!(quantity > 0)) return;
        orderMaterials.push({
          id: id(), variantId: variant.id, sizeId, quantity: Number(quantity.toFixed(5)),
          unit: supply.baseUnit, unitCost: cost, lineCost: cost === null ? null : Number((quantity * cost).toFixed(2)),
        });
      };
      if (supply.stockMode === 'total') {
        addLine(null, Object.values(row.bySize).reduce((sum, value) => sum + value, 0));
      } else {
        Object.entries(row.bySize).forEach(([sizeId, quantity]) => addLine(sizeId, quantity));
      }
    }
    const pieceRequirements = makePieceRequirements(activeProduct, quantities);
    const missingCostLines = orderMaterials.filter((line) => line.unitCost === null).length;
    const estimatedMaterialCost = missingCostLines > 0
      ? null
      : Number(orderMaterials.reduce((sum, line) => sum + (line.lineCost ?? 0), 0).toFixed(2));
    const dateCode = localDate().replaceAll('-', '');
    const todaysOrders = data.productionOrders.filter((order) => order.number.startsWith('OT-' + dateCode + '-')).length;
    const timestamp = now();
    const order: ProductionOrder = {
      id: id(), number: 'OT-' + dateCode + '-' + String(todaysOrders + 1).padStart(3, '0'),
      productModelId: activeProduct.id, productName: activeProduct.name, baseModelId: activeProduct.baseModelId,
      status: 'borrador', quantities, materials: orderMaterials,
      basePieces: pieceRequirements.base, componentPieces: pieceRequirements.auxiliary, rollAllocations: [],
      estimatedMaterialCost, missingCostLines, note: orderNote.trim(),
      createdAt: timestamp, updatedAt: timestamp,
    };
    const next = { ...data, productionOrders: [...data.productionOrders, order] };
    if (persistProductionSnapshot(next)) {
      setOrderNote('');
      onNavigate('ordenes');
      tell('Borrador ' + order.number + ' creado. Reserva los materiales y las piezas para iniciar la producción.');
    }
  }

  function persistProductionSnapshot(next: ProductionBackupData): boolean {
    const keys = Object.keys(emptyProductionBackupData()) as (keyof ProductionBackupData)[];
    const previous = new Map<string, string | null>();
    try {
      keys.forEach((key) => previous.set(PRODUCTION_STORAGE_KEYS[key], localStorage.getItem(PRODUCTION_STORAGE_KEYS[key])));
      keys.forEach((key) => localStorage.setItem(PRODUCTION_STORAGE_KEYS[key], JSON.stringify(next[key])));
      localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '2');
      setData(next);
      return true;
    } catch {
      previous.forEach((value, key) => {
        try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* rollback best effort */ }
      });
      tell('No se pudo guardar la orden. El navegador no permitió completar el respaldo local.', 'error');
      return false;
    }
  }

  function currentBasePieceBalance(pieceId: string, sizeId: string, side: 'izquierda' | 'derecha' | null): number {
    const piece = basePieces.find((item) => item.id === pieceId);
    if (!piece) return 0;
    if (piece.laterality === 'simetrica') {
      const stock = getSymmetricStock(baseMovements, piece.id, sizeId);
      return side === 'derecha' ? stock.right : stock.left;
    }
    return getPieceStock(baseMovements, piece.id, sizeId);
  }

  function currentComponentPieceBalance(pieceId: string, sizeId: string, side: 'izquierda' | 'derecha' | null): number {
    const piece = data.components.flatMap((component) => component.pieces).find((item) => item.id === pieceId);
    if (!piece) return 0;
    const ledger = componentPieceDomainLedger(pieceId, sizeId);
    if (piece.laterality === 'simetrica') {
      const stock = getSymmetricStock(ledger, pieceId, sizeId);
      return side === 'derecha' ? stock.right : stock.left;
    }
    return getPieceStock(ledger, pieceId, sizeId);
  }

  function reservedSupplyQuantity(variantId: string, sizeId: string | null, excludingOrderId?: string): number {
    return ordersHoldingStock.filter((order) => order.id !== excludingOrderId).reduce((sum, order) =>
      sum + order.materials.filter((line) => line.variantId === variantId && line.sizeId === sizeId && !variantsBySupply.get(line.variantId)?.textileId)
        .reduce((total, line) => total + line.quantity, 0), 0);
  }
  function reservedPieceQuantity(lines: Array<ProductionOrderPieceRequirement | ProductionOrderComponentPieceRequirement>, pieceId: string, sizeId: string, side: 'izquierda' | 'derecha' | null): number {
    return lines.filter((line) => line.pieceId === pieceId && line.sizeId === sizeId && line.side === side)
      .reduce((total, line) => total + line.quantity, 0);
  }

  function reserveProductionOrder(orderId: string) {
    const order = data.productionOrders.find((item) => item.id === orderId);
    if (!order || order.status !== 'borrador') return tell('Solo puedes reservar una orden en borrador.', 'error');
    const issues: string[] = [];
    const rollAllocations: ProductionOrderRollAllocation[] = [];
    const provisionalRolls = new Map<string, number>();
    const provisionalSupply = new Map<string, number>();
    const otherOrders = data.productionOrders.filter((item) => item.id !== order.id && holdingStatuses.includes(item.status));

    for (const line of order.materials) {
      const variant = variantsBySupply.get(line.variantId);
      const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
      if (!variant || !supply) { issues.push('Material no disponible en el catálogo.'); continue; }
      if (variant.textileId) {
        if (supply.baseUnit !== 'm' && supply.baseUnit !== 'kg') { issues.push(supply.name + ': la tela vinculada requiere unidad M o KG.'); continue; }
        const unit: 'M' | 'KG' = supply.baseUnit === 'm' ? 'M' : 'KG';
        const candidates = textileContext.rollos.filter((roll) =>
          roll.idTela === variant.textileId && (!variant.textileColorId || roll.idTelaColor === variant.textileColorId) && roll.estado === 'disponible'
        ).filter((roll) => (unit === 'M' ? roll.metros : roll.pesoKg) !== null)
          .sort((a, b) => (a.fechaIngreso ?? '').localeCompare(b.fechaIngreso ?? '') || a.id.localeCompare(b.id));
        let remaining = line.quantity;
        for (const roll of candidates) {
          const physical = unit === 'M' ? roll.metros ?? 0 : roll.pesoKg ?? 0;
          const key = roll.id + ':' + unit;
          const reservedByOthers = otherOrders.reduce((sum, activeOrder) => sum + activeOrder.rollAllocations.filter((allocation) => allocation.rollId === roll.id && allocation.unit === unit).reduce((total, allocation) => total + allocation.quantity, 0), 0);
          const available = Math.max(0, physical - reservedByOthers - (provisionalRolls.get(key) ?? 0));
          if (available <= 0) continue;
          const quantity = Math.min(remaining, available);
          if (quantity > 0) {
            rollAllocations.push({ id: id(), variantId: variant.id, rollId: roll.id, unit, quantity: Number(quantity.toFixed(5)) });
            provisionalRolls.set(key, (provisionalRolls.get(key) ?? 0) + quantity);
            remaining = Number((remaining - quantity).toFixed(5));
          }
          if (remaining <= 0.00001) break;
        }
        if (remaining > 0.00001) issues.push(supply.name + ' · ' + variant.name + ': faltan ' + format(remaining) + ' ' + unit);
      } else {
        const key = variant.id + ':' + (line.sizeId ?? 'total');
        const reservedByOthers = otherOrders.reduce((sum, activeOrder) =>
          sum + activeOrder.materials.filter((item) => item.variantId === variant.id && item.sizeId === line.sizeId)
            .reduce((total, item) => total + item.quantity, 0), 0);
        const alreadyAllocated = provisionalSupply.get(key) ?? 0;
        const available = stockForVariant(variant, line.sizeId) - reservedByOthers - alreadyAllocated;
        if (available + 0.00001 < line.quantity) issues.push(supply.name + ' · ' + variant.name + ': faltan ' + format(line.quantity - Math.max(0, available)) + ' ' + unitLabel[supply.baseUnit]);
        provisionalSupply.set(key, alreadyAllocated + line.quantity);
      }
    }
    for (const line of order.basePieces) {
      const piece = basePieces.find((item) => item.id === line.pieceId);
      const balance = currentBasePieceBalance(line.pieceId, line.sizeId, line.side);
      const reserved = reservedPieceQuantity(otherOrders.flatMap((activeOrder) => activeOrder.basePieces), line.pieceId, line.sizeId, line.side);
      if (balance - reserved + 0.00001 < line.quantity) issues.push((piece?.name ?? 'Molde base') + ' · ' + (sizes.find((size) => size.id === line.sizeId)?.label ?? 'Talla') + ': faltan ' + format(line.quantity - Math.max(0, balance - reserved)) + ' piezas' + (line.side ? ' ' + line.side : ''));
    }
    for (const line of order.componentPieces) {
      const piece = data.components.find((component) => component.id === line.componentId)?.pieces.find((item) => item.id === line.pieceId);
      const balance = currentComponentPieceBalance(line.pieceId, line.sizeId, line.side);
      const reserved = reservedPieceQuantity(otherOrders.flatMap((activeOrder) => activeOrder.componentPieces), line.pieceId, line.sizeId, line.side);
      if (balance - reserved + 0.00001 < line.quantity) issues.push((piece?.name ?? 'Pieza auxiliar') + ' · ' + (sizes.find((size) => size.id === line.sizeId)?.label ?? 'Talla') + ': faltan ' + format(line.quantity - Math.max(0, balance - reserved)) + ' piezas' + (line.side ? ' ' + line.side : ''));
    }
    if (issues.length > 0) return tell('No se reservó ' + order.number + '. ' + issues.join(' · '), 'error');
    const timestamp = now();
    const updated: ProductionOrder = { ...order, status: 'reservada', rollAllocations, reservedAt: timestamp, updatedAt: timestamp };
    persistProductionSnapshot({ ...data, productionOrders: data.productionOrders.map((item) => item.id === order.id ? updated : item) });
    tell(order.number + ': materiales y piezas reservados correctamente.');
  }

  function startProductionOrder(orderId: string) {
    const order = data.productionOrders.find((item) => item.id === orderId);
    if (!order || order.status !== 'reservada') return tell('La orden debe estar reservada antes de iniciar.', 'error');
    const timestamp = now();
    persistProductionSnapshot({ ...data, productionOrders: data.productionOrders.map((item) => item.id === order.id ? { ...item, status: 'en_proceso', startedAt: timestamp, updatedAt: timestamp } : item) });
  }

  function cancelProductionOrder(orderId: string) {
    const order = data.productionOrders.find((item) => item.id === orderId);
    if (!order || !holdingStatuses.includes(order.status)) return tell('Solo puedes cancelar una orden reservada o en proceso.', 'error');
    if (!window.confirm('¿Cancelar ' + order.number + '? Se liberarán sus reservas y no se descontará inventario.')) return;
    const timestamp = now();
    persistProductionSnapshot({ ...data, productionOrders: data.productionOrders.map((item) => item.id === order.id ? { ...item, status: 'cancelada', cancelledAt: timestamp, updatedAt: timestamp } : item) });
    tell(order.number + ' cancelada. El stock reservado volvió a estar disponible.');
  }

  function completeProductionOrder(orderId: string) {
    const order = data.productionOrders.find((item) => item.id === orderId);
    if (!order || order.status !== 'en_proceso') return tell('La orden debe estar en proceso antes de completarla.', 'error');
    const issues: string[] = [];
    const otherOrders = data.productionOrders.filter((item) => item.id !== order.id && holdingStatuses.includes(item.status));
    for (const line of order.materials) {
      const variant = variantsBySupply.get(line.variantId);
      const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
      if (!variant || !supply) { issues.push('Material ya no disponible: ' + line.variantId); continue; }
      if (!variant.textileId) {
        const reservedByOthers = otherOrders.reduce((sum, activeOrder) => sum + activeOrder.materials.filter((item) => item.variantId === line.variantId && item.sizeId === line.sizeId).reduce((total, item) => total + item.quantity, 0), 0);
        const available = stockForVariant(variant, line.sizeId) - reservedByOthers;
        if (available + 0.00001 < line.quantity) issues.push(supply.name + ': el saldo físico cambió; faltan ' + format(line.quantity - Math.max(0, available)) + ' ' + unitLabel[supply.baseUnit]);
      }
    }
    for (const line of order.basePieces) {
      const piece = basePieces.find((item) => item.id === line.pieceId);
      const reserved = reservedPieceQuantity(otherOrders.flatMap((activeOrder) => activeOrder.basePieces), line.pieceId, line.sizeId, line.side);
      if (currentBasePieceBalance(line.pieceId, line.sizeId, line.side) - reserved + 0.00001 < line.quantity) issues.push((piece?.name ?? 'Molde base') + ': el stock reservado ya no está disponible.');
    }
    for (const line of order.componentPieces) {
      const piece = data.components.find((component) => component.id === line.componentId)?.pieces.find((item) => item.id === line.pieceId);
      const reserved = reservedPieceQuantity(otherOrders.flatMap((activeOrder) => activeOrder.componentPieces), line.pieceId, line.sizeId, line.side);
      if (currentComponentPieceBalance(line.pieceId, line.sizeId, line.side) - reserved + 0.00001 < line.quantity) issues.push((piece?.name ?? 'Pieza auxiliar') + ': el stock reservado ya no está disponible.');
    }
    const textileMaterials = new Map<string, number>();
    order.materials.forEach((line) => {
      if (variantsBySupply.get(line.variantId)?.textileId) textileMaterials.set(line.variantId, (textileMaterials.get(line.variantId) ?? 0) + line.quantity);
    });
    for (const [variantId, required] of textileMaterials) {
      const allocated = order.rollAllocations.filter((allocation) => allocation.variantId === variantId).reduce((sum, allocation) => sum + allocation.quantity, 0);
      if (Math.abs(allocated - required) > 0.0001) issues.push('Las reservas físicas de tela no coinciden con el consumo de la orden.');
    }
    const fabricRaw = localStorage.getItem(FABRIC_STORAGE_KEYS.rollos);
    const movementRaw = localStorage.getItem(FABRIC_STORAGE_KEYS.rolloMovimientos);
    let previousFabricRolls: string | null = fabricRaw;
    let previousFabricMovements: string | null = movementRaw;
    let nextRolls: RollRow[] = [];
    let nextRollMovements: FabricRollMovement[] = [];
    try {
      nextRolls = fabricRaw ? JSON.parse(fabricRaw) as RollRow[] : [];
      nextRollMovements = movementRaw ? JSON.parse(movementRaw) as FabricRollMovement[] : [];
      if (!Array.isArray(nextRolls) || !Array.isArray(nextRollMovements)) throw new Error('El registro local de rollos o movimientos no es válido.');
    } catch (error) {
      return tell('No se puede completar la orden: ' + (error instanceof Error ? error.message : 'respaldo de rollos inválido'), 'error');
    }
    const aggregateAllocations = new Map<string, { rollId: string; variantId: string; unit: 'KG' | 'M'; quantity: number }>();
    order.rollAllocations.forEach((allocation) => {
      const key = allocation.rollId + ':' + allocation.unit;
      const current = aggregateAllocations.get(key);
      aggregateAllocations.set(key, { rollId: allocation.rollId, variantId: allocation.variantId, unit: allocation.unit, quantity: (current?.quantity ?? 0) + allocation.quantity });
    });
    const timestamp = now();
    for (const allocation of aggregateAllocations.values()) {
      const roll = nextRolls.find((item) => item.id === allocation.rollId);
      const current = roll ? (allocation.unit === 'KG' ? roll.pesoKg : roll.metros) : null;
      const reservedByOthers = otherOrders.reduce((sum, activeOrder) =>
        sum + activeOrder.rollAllocations.filter((item) => item.rollId === allocation.rollId && item.unit === allocation.unit)
          .reduce((total, item) => total + item.quantity, 0), 0);
      if (!roll || current === null || allocation.quantity > current - reservedByOthers + 0.00001) {
        issues.push('El rollo ' + allocation.rollId + ' ya no tiene la medición real reservada después de considerar otras órdenes.');
        continue;
      }
    }
    if (issues.length > 0) return tell('No se puede completar ' + order.number + ': ' + issues.join(' · '), 'error');

    const updatedRolls = nextRolls.map((roll) => {
      const allocation = aggregateAllocations.get(roll.id + ':M') ?? aggregateAllocations.get(roll.id + ':KG');
      if (!allocation) return roll;
      const current = allocation.unit === 'KG' ? roll.pesoKg : roll.metros;
      if (current === null) return roll;
      const next = Number((current - allocation.quantity).toFixed(3));
      const otherUnit: 'KG' | 'M' = allocation.unit === 'KG' ? 'M' : 'KG';
      const otherCurrent = otherUnit === 'KG' ? roll.pesoKg : roll.metros;
      if (otherCurrent !== null) nextRollMovements.push({
        id: id(), idRollo: roll.id, fecha: timestamp, tipo: 'medicion', unidad: otherUnit,
        delta: null, cantidadAnterior: otherCurrent, cantidadNueva: null,
        nota: 'Medición complementaria no disponible después del consumo de ' + order.number,
        sourceProductionOrderId: order.id,
      });
      nextRollMovements.push({
        id: id(), idRollo: roll.id, fecha: timestamp, tipo: 'consumo', unidad: allocation.unit,
        delta: -allocation.quantity, cantidadAnterior: current, cantidadNueva: next,
        nota: 'Consumo de orden ' + order.number, sourceProductionOrderId: order.id,
      });
      return {
        ...roll,
        pesoKg: allocation.unit === 'KG' ? next : null,
        metros: allocation.unit === 'M' ? next : null,
        estado: next === 0 ? 'agotado' : roll.estado,
        updatedAt: timestamp,
      };
    });

    const supplyMovements: SupplyMovement[] = order.materials.filter((line) => !variantsBySupply.get(line.variantId)?.textileId).map((line) => ({
      id: id(), variantId: line.variantId, sizeId: line.sizeId, delta: -line.quantity, kind: 'salida',
      note: 'Consumo de orden ' + order.number, date: timestamp, sourceProductionOrderId: order.id,
    }));
    const componentMovements: ComponentPieceMovement[] = order.componentPieces.map((line) => ({
      id: id(), componentId: line.componentId, pieceId: line.pieceId, sizeId: line.sizeId,
      side: line.side ?? undefined, delta: -line.quantity, kind: 'salida',
      note: 'Consumo de orden ' + order.number, date: timestamp, sourceProductionOrderId: order.id,
    }));
    const baseEntries: DomainPieceMovement[] = order.basePieces.map((line) => ({
      id: id(), pieceId: line.pieceId, sizeId: line.sizeId, side: line.side ?? undefined,
      delta: -line.quantity, kind: 'salida', note: 'Consumo de orden ' + order.number,
      date: timestamp, sourceProductionOrderId: order.id,
    }));

    const nextData: ProductionBackupData = {
      ...data,
      supplyMovements: [...data.supplyMovements, ...supplyMovements],
      componentPieceMovements: [...data.componentPieceMovements, ...componentMovements],
      productionOrders: data.productionOrders.map((item) => item.id === order.id ? {
        ...item, status: 'completada', completedAt: timestamp, updatedAt: timestamp,
      } : item),
    };

    const productionKeys = Object.keys(emptyProductionBackupData()) as (keyof ProductionBackupData)[];
    const previousProduction = new Map<string, string | null>();
    try {
      productionKeys.forEach((key) => previousProduction.set(PRODUCTION_STORAGE_KEYS[key], localStorage.getItem(PRODUCTION_STORAGE_KEYS[key])));
      productionKeys.forEach((key) => localStorage.setItem(PRODUCTION_STORAGE_KEYS[key], JSON.stringify(nextData[key])));
      localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '2');
      localStorage.setItem(FABRIC_STORAGE_KEYS.rollos, JSON.stringify(updatedRolls));
      localStorage.setItem(FABRIC_STORAGE_KEYS.rolloMovimientos, JSON.stringify(nextRollMovements));
      const nextBase = [...baseMovements, ...baseEntries];
      if (!onAddBaseMovements(nextBase)) throw new Error('No se pudo guardar el consumo de piezas del patrón base.');
      setData(nextData);
      window.dispatchEvent(new Event('telastock-fabric-data-restored'));
      tell(order.number + ' completada. Los materiales, rollos y piezas fueron descontados y el historial quedó registrado.');
    } catch (error) {
      previousProduction.forEach((value, key) => {
        try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* best effort rollback */ }
      });
      try { if (previousFabricRolls === null) localStorage.removeItem(FABRIC_STORAGE_KEYS.rollos); else localStorage.setItem(FABRIC_STORAGE_KEYS.rollos, previousFabricRolls); } catch { /* best effort rollback */ }
      try { if (previousFabricMovements === null) localStorage.removeItem(FABRIC_STORAGE_KEYS.rolloMovimientos); else localStorage.setItem(FABRIC_STORAGE_KEYS.rolloMovimientos, previousFabricMovements); } catch { /* best effort rollback */ }
      tell('No se pudo completar la orden. No se confirmó el movimiento: ' + (error instanceof Error ? error.message : 'error de almacenamiento'), 'error');
    }
  }

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

    if (view === 'compras-avios') return <section className="panel production-panel">
      <div className="panel-heading">
        <div><h2>Compras de avíos</h2><p>Registra comprobantes y agrega automáticamente las cantidades compradas al inventario.</p></div>
        <button className="button primary" onClick={() => setShowPurchaseForm((current) => !current)}>＋ Nueva compra</button>
      </div>
      {showPurchaseForm && <form className="production-form" onSubmit={saveSupplyPurchase}>
        <div className="production-form-grid">
          <label className="field-label">Fecha de compra<input className="large-input" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} required /></label>
          <label className="field-label">Proveedor (opcional)
            <select className="large-input" value={purchaseSupplierId} onChange={(event) => setPurchaseSupplierId(event.target.value)}>
              <option value="">Sin proveedor vinculado</option>
              {textileContext.proveedores.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.nombre}{supplier.ruc ? ' · RUC ' + supplier.ruc : ''}</option>)}
            </select>
          </label>
          <label className="field-label">Comprobante
            <select className="large-input" value={purchaseDocumentType} onChange={(event) => setPurchaseDocumentType(event.target.value)}>
              <option>Factura</option><option>Boleta</option><option>Ticket</option><option>Nota de venta</option><option>Otro</option>
            </select>
          </label>
          <label className="field-label">Número de comprobante<input className="large-input" value={purchaseDocumentNumber} onChange={(event) => setPurchaseDocumentNumber(event.target.value)} placeholder="Serie y correlativo (opcional)" /></label>
        </div>
        <div className="production-subheading"><strong>Detalle de compra</strong><button type="button" className="text-action" disabled={purchasableVariants.length === 0} onClick={addPurchaseLine}>＋ Agregar avío</button></div>
        {purchasableVariants.length === 0 && <div className="notice info">Primero registra un insumo y una variante que no esté vinculada a tela. Las telas se siguen comprando desde el módulo de rollos.</div>}
        {purchaseLines.map((line, index) => {
          const variant = variantsBySupply.get(line.variantId);
          const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
          const packFactor = variant?.purchasePackQuantity ?? 1;
          const purchaseUnit = variant?.purchasePackQuantity ? (variant.purchasePackLabel.trim() || 'paquete') : (supply ? unitLabel[supply.baseUnit] : 'unidad');
          const stockQuantity = Number(line.quantity) * packFactor;
          return <div className="production-purchase-line" key={line.id}>
            <div className="production-purchase-line-heading"><strong>Artículo {index + 1}</strong><button type="button" className="text-action danger-action" disabled={purchaseLines.length === 1} onClick={() => setPurchaseLines((current) => current.filter((item) => item.id !== line.id))}>Quitar</button></div>
            <label className="field-label">Insumo / variante
              <select className="large-input" value={line.variantId} onChange={(event) => updatePurchaseLine(line.id, { variantId: event.target.value, sizeId: '' })} required>
                <option value="">Seleccionar variante</option>
                {purchasableVariants.map((option) => {
                  const optionSupply = supplies.find((item) => item.id === option.supplyId);
                  return <option value={option.id} key={option.id}>{optionSupply?.name ?? 'Insumo'} · {option.name}</option>;
                })}
              </select>
            </label>
            {supply?.stockMode === 'talla' && <label className="field-label">Talla donde ingresará el stock
              <select className="large-input" value={line.sizeId} onChange={(event) => updatePurchaseLine(line.id, { sizeId: event.target.value })} required>
                <option value="">Seleccionar talla</option>
                {sizes.map((size) => <option value={size.id} key={size.id}>{sizeDisplay(size)}</option>)}
              </select>
            </label>}
            {variant && supply && <div className="production-purchase-meta">
              <span>Presentación de compra: <strong>{purchaseUnit}</strong></span>
              <span>Equivale a <strong>{format(packFactor)} {unitLabel[supply.baseUnit]}</strong> por {purchaseUnit}</span>
            </div>}
            <div className="production-form-grid">
              <label className="field-label">Cantidad ({purchaseUnit})
                <input className="large-input" type="number" min="0.001" step={supply?.baseUnit === "und" ? 1 : 0.001} value={line.quantity} onChange={(event) => updatePurchaseLine(line.id, { quantity: event.target.value })} required />
              </label>
              <label className="field-label">Precio por {purchaseUnit} (S/)
                <input className="large-input" type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updatePurchaseLine(line.id, { unitPrice: event.target.value })} required />
              </label>
            </div>
            <div className="production-purchase-line-total">
              <span>Ingreso a inventario: <strong>{variant && supply && Number.isFinite(stockQuantity) ? format(stockQuantity) + ' ' + unitLabel[supply.baseUnit] : '—'}</strong></span>
              <strong>{money(purchaseLineTotal(line))}</strong>
            </div>
          </div>;
        })}
        <label className="field-label">Observación (opcional)<textarea className="large-input" rows={2} value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} placeholder="Condición, lote o detalle de la compra…" /></label>
        <div className="production-purchase-total"><span>Total de compra</span><strong>{money(purchaseTotalDraft)}</strong></div>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowPurchaseForm(false)}>Cancelar</button><button className="button primary" disabled={purchasableVariants.length === 0}>Registrar compra e ingresar stock</button></div>
        <p className="production-muted">El precio queda guardado en este comprobante como dato histórico. La entrada al inventario usa la equivalencia de presentación declarada para cada variante; no convierte unidades de forma estimada.</p>
      </form>}
      <div className="production-subheading"><strong>Historial de compras</strong><span className="count-badge">{data.supplyPurchases.length} compras</span></div>
      <div className="production-list">
        {[...data.supplyPurchases].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).map((purchase) => {
          const details = data.supplyPurchaseDetails.filter((detail) => detail.purchaseId === purchase.id);
          const supplier = textileContext.proveedores.find((item) => item.id === purchase.supplierId);
          return <article className="production-card" key={purchase.id}>
            <div className="production-card-heading">
              <div><strong>{purchase.documentType}{purchase.documentNumber ? ' · ' + purchase.documentNumber : ''}</strong><span>{purchase.date} · {supplier?.nombre ?? (purchase.supplierId ? 'Proveedor no disponible' : 'Sin proveedor')}</span></div>
              <strong className="production-purchase-history-total">{money(purchase.total)}</strong>
            </div>
            {purchase.note && <p className="production-muted">{purchase.note}</p>}
            <div className="production-purchase-history-details">
              {details.map((detail) => {
                const variant = variantsBySupply.get(detail.variantId) ?? data.variants.find((item) => item.id === detail.variantId);
                const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
                const size = sizes.find((item) => item.id === detail.sizeId);
                return <div className="production-purchase-history-line" key={detail.id}>
                  <div><strong>{supply?.name ?? 'Insumo'} · {variant?.name ?? 'Variante'}</strong><small>{format(detail.purchaseQuantity)} {detail.purchaseUnitLabel} · {format(detail.inventoryQuantity)} {supply ? unitLabel[supply.baseUnit] : 'unid.'}{size ? ' · Talla ' + size.label : ''}</small></div>
                  <div><strong>{money(detail.lineTotal)}</strong><small>{money(detail.unitPrice)} / {detail.purchaseUnitLabel}</small></div>
                </div>;
              })}
              {details.length === 0 && <small className="production-muted">Compra sin detalles visibles.</small>}
            </div>
          </article>;
        })}
        {data.supplyPurchases.length === 0 && <div className="empty">Todavía no hay compras de avíos registradas.</div>}
      </div>
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
          <div className="production-card-heading"><div><strong>{component.name}</strong><span>{component.type} · {component.pieces.length} piezas · {component.materials.length} materiales</span></div><div className="production-card-actions"><button className="button secondary" disabled={component.pieces.length === 0} onClick={() => setSelectedStockComponentId(component.id)}>Inventario de piezas</button><button className="button secondary" onClick={() => openComponent(component)}>Editar</button></div></div>
          {component.description && <p className="production-muted">{component.description}</p>}
          <div className="production-attributes">{component.pieces.map((x) => <span key={x.id}>{x.name} ×{x.unitsPerGarment}</span>)}</div>
        </article>)}
      </div>
      {selectedStockComponent && <section className="production-component-stock">
        <div className="panel-heading">
          <div><h2>Inventario de piezas · {selectedStockComponent.name}</h2><p>Existencias independientes del inventario de moldes base.</p></div>
          <button className="text-action" onClick={() => setSelectedStockComponentId('')}>Cerrar</button>
        </div>
        {selectedStockComponent.pieces.map((piece) => <article className="production-component-stock-piece" key={piece.id}>
          <div className="production-component-stock-title">
            <div><strong>{piece.name}</strong><small>{piece.laterality === 'simetrica' ? 'Control por izquierda / derecha' : 'Control por unidades'} · {piece.unitsPerGarment} por prenda</small></div>
            <button className="button secondary" onClick={() => openComponentPieceMovement(selectedStockComponent, piece)}>Registrar movimiento</button>
          </div>
          <div className="production-component-stock-sizes">
            {sizes.map((size) => <div key={size.id}><span>{size.label}</span><small>{sizeGroups.find((group) => group.id === size.groupId)?.name ?? 'Grupo'}</small><strong>{componentPieceStockLabel(piece, size.id)}</strong></div>)}
          </div>
        </article>)}
        {selectedStockComponent.pieces.length === 0 && <div className="empty">Este componente todavía no tiene piezas de patronaje.</div>}
        <div className="production-subheading"><strong>Últimos movimientos</strong><span className="count-badge">{data.componentPieceMovements.filter((movement) => movement.componentId === selectedStockComponent.id).length}</span></div>
        <div className="production-component-movement-history">
          {[...data.componentPieceMovements].filter((movement) => movement.componentId === selectedStockComponent.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25).map((movement) => {
            const piece = selectedStockComponent.pieces.find((item) => item.id === movement.pieceId);
            const size = sizes.find((item) => item.id === movement.sizeId);
            const side = movement.side ? ' · ' + movement.side : '';
            return <div className="production-component-movement-row" key={movement.id}>
              <span className={'movement-icon ' + (movement.delta < 0 ? 'movement-out' : '')}>{movement.delta < 0 ? '−' : '＋'}</span>
              <div><strong>{piece?.name ?? 'Pieza auxiliar'}</strong><small>{size ? sizeDisplay(size) : 'Talla no disponible'}{side} · {movement.kind.toLocaleUpperCase('es')} · {movement.note}</small></div>
              <div><strong>{movement.delta > 0 ? '+' : ''}{format(movement.delta)}</strong><small>{new Date(movement.date).toLocaleDateString('es-PE')}</small></div>
            </div>;
          })}
          {data.componentPieceMovements.every((movement) => movement.componentId !== selectedStockComponent.id) && <small className="production-muted">Todavía no hay movimientos para este componente.</small>}
        </div>
      </section>}
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

    if (view === 'ordenes') return <section className="panel production-panel">
      <div className="panel-heading">
        <div><h2>Órdenes de producción</h2><p>Reserva existencias, inicia el trabajo y confirma los consumos al terminar cada orden.</p></div>
        <button className="button secondary" onClick={() => onNavigate('planificacion')}>＋ Nueva orden</button>
      </div>
      <div className="production-order-summary">
        {(['borrador','reservada','en_proceso','completada','cancelada'] as ProductionOrderStatus[]).map((status) => {
          const count = data.productionOrders.filter((order) => order.status === status).length;
          const labels: Record<ProductionOrderStatus,string> = { borrador:'Borradores', reservada:'Reservadas', en_proceso:'En proceso', completada:'Completadas', cancelada:'Canceladas' };
          return <div key={status}><strong>{count}</strong><small>{labels[status]}</small></div>;
        })}
      </div>
      <div className="production-list">
        {[...data.productionOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((order) => {
          const statusLabels: Record<ProductionOrderStatus,string> = { borrador:'Borrador', reservada:'Reservada', en_proceso:'En proceso', completada:'Completada', cancelada:'Cancelada' };
          const statusClass: Record<ProductionOrderStatus,string> = { borrador:'draft', reservada:'reserved', en_proceso:'progress', completada:'done', cancelada:'cancelled' };
          const quantityText = Object.entries(order.quantities).map(([sizeId, quantity]) => {
            const size = sizes.find((item) => item.id === sizeId);
            return (size?.label ?? 'Talla') + ': ' + quantity;
          }).join(' · ');
          const materialText = order.materials.map((line) => {
            const variant = variantsBySupply.get(line.variantId) ?? data.variants.find((item) => item.id === line.variantId);
            const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
            const size = sizes.find((item) => item.id === line.sizeId);
            return (supply?.name ?? 'Material') + ' ' + (variant?.name ?? '') + ': ' + format(line.quantity) + ' ' + unitLabel[line.unit] + (size ? ' (' + size.label + ')' : '');
          });
          return <article className="production-card production-order-card" key={order.id}>
            <div className="production-card-heading">
              <div><strong>{order.number} · {order.productName}</strong><span>{new Date(order.createdAt).toLocaleDateString('es-PE')} · {quantityText || 'Sin cantidades'} </span></div>
              <span className={'production-order-status ' + statusClass[order.status]}>{statusLabels[order.status]}</span>
            </div>
            {order.note && <p className="production-muted">{order.note}</p>}
            <div className="production-order-details">
              <div><strong>Materiales</strong><small>{materialText.length ? materialText.join(' · ') : 'Sin consumos de materiales configurados'}</small></div>
              <div><strong>Piezas de moldes</strong><small>{order.basePieces.length} requerimientos de patrón base · {order.componentPieces.length} de componentes</small></div>
              {order.rollAllocations.length > 0 && <div><strong>Rollos reservados</strong><small>{order.rollAllocations.length} asignaciones físicas · {order.rollAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0).toFixed(3)} unidades de medición</small></div>}
            </div>
            <div className="production-order-cost">
              {order.estimatedMaterialCost === null
                ? <span>Costo de materiales pendiente · {order.missingCostLines} materiales sin precio de compra</span>
                : <span>Materiales según últimos precios registrados: <strong>{money(order.estimatedMaterialCost)}</strong></span>}
            </div>
            <div className="production-order-actions">
              {order.status === 'borrador' && <button className="button primary" onClick={() => reserveProductionOrder(order.id)}>Verificar y reservar stock</button>}
              {order.status === 'reservada' && <button className="button primary" onClick={() => startProductionOrder(order.id)}>Iniciar producción</button>}
              {order.status === 'en_proceso' && <button className="button primary" onClick={() => { if (window.confirm('¿Confirmas que ' + order.number + ' terminó y que deben descontarse los materiales y piezas reservados?')) completeProductionOrder(order.id); }}>Completar y descontar</button>}
              {holdingStatuses.includes(order.status) && <button className="button secondary danger-action" onClick={() => cancelProductionOrder(order.id)}>Cancelar y liberar reserva</button>}
            </div>
          </article>;
        })}
        {data.productionOrders.length === 0 && <div className="empty">Todavía no hay órdenes. Crea un modelo configurado y calcula una producción desde Planificar.</div>}
      </div>
      <p className="production-muted">Una orden en borrador no reserva stock. Las órdenes reservadas o en proceso apartan existencias; cancelar libera la reserva. Al completar, TelaStock registra salidas de insumos, rollos, moldes base y piezas auxiliares.</p>
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
          <div className="production-subheading"><strong>Capacidad con stock actual</strong><span>Patrón base + componentes</span></div>
          <div className="production-table-wrap"><table className="production-table"><thead><tr><th>Talla</th><th>Patrón base</th><th>Auxiliares</th><th>Fabricables</th><th>Limitante</th></tr></thead><tbody>
            {productSizes.map((size) => {
              const capacity = getProductFabricableCapacity(activeProduct, size.id);
              return <tr key={size.id}><td><strong>{size.label}</strong></td><td>{format(capacity.baseCapacity)}</td><td>{capacity.componentCapacity === null ? '—' : format(capacity.componentCapacity)}</td><td className={capacity.fabricable > 0 ? 'production-ok' : 'production-shortage'}>{format(capacity.fabricable)}</td><td>{capacity.limitingComponent}</td></tr>;
            })}
          </tbody></table></div>
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
          <div className="production-order-create">
            <label className="field-label">Observación para la orden (opcional)
              <input className="large-input" value={orderNote} onChange={(event) => setOrderNote(event.target.value)} placeholder="Cliente, fecha de entrega o indicación de taller…" />
            </label>
            <button className="button primary" onClick={createProductionOrderDraft} disabled={!activeProduct || plan.unresolved.length > 0 || plan.rows.some((row) => row.missingSizes.length > 0) || !Object.values(planCounts).some((value) => Number(value) > 0)}>Crear borrador de producción</button>
            <p className="production-muted">El borrador guarda las cantidades y consumos calculados. Después podrás reservar el stock; solo al completar la orden se registrarán los descuentos.</p>
          </div>

        </>;
      })()}
      {!activeProduct && data.productModels.filter((x) => x.active).length === 0 && <div className="empty">Primero crea un modelo configurado a partir de un patrón base.</div>}
    </section>;
  })();

  return <div className="production-module">
    <div className="production-tabs" role="tablist" aria-label="Gestión de producción">
      <button className={view === 'insumos' ? 'active' : ''} onClick={() => onNavigate('insumos')} role="tab" aria-selected={view === 'insumos'}>Insumos</button>
      <button className={view === 'compras-avios' ? 'active' : ''} onClick={() => onNavigate('compras-avios')} role="tab" aria-selected={view === 'compras-avios'}>Compras</button>
      <button className={view === 'componentes' ? 'active' : ''} onClick={() => onNavigate('componentes')} role="tab" aria-selected={view === 'componentes'}>Componentes</button>
      <button className={view === 'modelos-producto' ? 'active' : ''} onClick={() => onNavigate('modelos-producto')} role="tab" aria-selected={view === 'modelos-producto'}>Modelos</button>
      <button className={view === 'recetas' ? 'active' : ''} onClick={() => onNavigate('recetas')} role="tab" aria-selected={view === 'recetas'}>Recetas</button>
      <button className={view === 'planificacion' ? 'active' : ''} onClick={() => onNavigate('planificacion')} role="tab" aria-selected={view === 'planificacion'}>Planificar</button>
      <button className={view === 'ordenes' ? 'active' : ''} onClick={() => onNavigate('ordenes')} role="tab" aria-selected={view === 'ordenes'}>Órdenes</button>
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
    {showComponentPieceMovement && selectedStockComponent && selectedComponentStockPiece && <div className="modal-backdrop">
      <section className="modal production-modal" role="dialog" aria-modal="true" aria-labelledby="component-piece-stock-title">
        <div className="modal-heading"><div><h2 id="component-piece-stock-title">Movimiento de pieza auxiliar</h2><p>{selectedStockComponent.name} · {selectedComponentStockPiece.name}</p></div><button className="icon-button" onClick={() => setShowComponentPieceMovement(false)}>×</button></div>
        <form className="production-form" onSubmit={saveComponentPieceMovement}>
          <label className="field-label">Operación<select className="large-input" value={componentStockKind} onChange={(event) => setComponentStockKind(event.target.value as 'entrada' | 'salida')}><option value="entrada">Entrada</option><option value="salida">Salida / merma</option></select></label>
          <label className="field-label">Talla<select className="large-input" value={componentStockSizeId} onChange={(event) => setComponentStockSizeId(event.target.value)} required><option value="">Seleccionar talla</option>{sizes.map((size) => <option value={size.id} key={size.id}>{size.label}</option>)}</select></label>
          {selectedComponentStockPiece.laterality === 'simetrica' && <>
            <label className="field-label">Forma de registrar
              <select className="large-input" value={componentStockMode} onChange={(event) => setComponentStockMode(event.target.value as 'paridad' | 'lado')}><option value="paridad">Por paridades (izquierda + derecha)</option><option value="lado">Por un solo lado</option></select>
            </label>
            {componentStockMode === 'lado' && <label className="field-label">Lado<select className="large-input" value={componentStockSide} onChange={(event) => setComponentStockSide(event.target.value as 'izquierda' | 'derecha')}><option value="izquierda">Izquierda</option><option value="derecha">Derecha</option></select></label>}
          </>}
          <label className="field-label">{selectedComponentStockPiece.laterality === 'simetrica' && componentStockMode === 'paridad' ? 'Cantidad de pares' : 'Cantidad de piezas'}
            <input className="large-input" type="number" min="1" step="1" inputMode="numeric" value={componentStockQuantity} onChange={(event) => setComponentStockQuantity(event.target.value)} required />
          </label>
          <label className="field-label">Observación<input className="large-input" value={componentStockNote} onChange={(event) => setComponentStockNote(event.target.value)} /></label>
          <div className="notice info">{selectedComponentStockPiece.laterality === 'simetrica' && componentStockMode === 'paridad' ? 'Una paridad registra una pieza izquierda y una derecha por cada unidad indicada.' : selectedComponentStockPiece.laterality === 'simetrica' ? 'El movimiento afecta únicamente al lado seleccionado.' : 'El movimiento se registra en unidades físicas de esta pieza.'}</div>
          <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowComponentPieceMovement(false)}>Cancelar</button><button className="button primary">Guardar movimiento</button></div>
        </form>
      </section>
    </div>}
    {showStockForm && <div className="modal-backdrop"><section className="modal production-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><h2>Movimiento de stock</h2><p>Registra una entrada o salida de la variante.</p></div><button className="icon-button" onClick={() => setShowStockForm(false)}>×</button></div>
      <form className="production-form" onSubmit={saveStock}>
        <label className="field-label">Operación<select className="large-input" value={stockDirection} onChange={(e) => setStockDirection(e.target.value as 'entrada' | 'salida')}><option value="entrada">Entrada</option><option value="salida">Salida</option></select></label>
        {(() => { const variant = variantsBySupply.get(stockVariantId); const supply = variant ? supplies.find((x) => x.id === variant.supplyId) : undefined; return supply?.stockMode === 'talla' ? <label className="field-label">Talla<select className="large-input" value={stockSizeId} onChange={(e) => setStockSizeId(e.target.value)}><option value="">Seleccionar</option>{sizes.map((x) => <option key={x.id} value={x.id}>{sizeDisplay(x)}</option>)}</select></label> : null; })()}
        <label className="field-label">Cantidad<input className="large-input" type="number" min="0.001" step={supplies.find((item) => item.id === variantsBySupply.get(stockVariantId)?.supplyId)?.baseUnit === "und" ? 1 : 0.001} value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} required /></label>
        <label className="field-label">Observación<input className="large-input" value={stockNote} onChange={(e) => setStockNote(e.target.value)} /></label>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowStockForm(false)}>Cancelar</button><button className="button primary">Guardar movimiento</button></div>
      </form></section></div>}
  </div>;
}
