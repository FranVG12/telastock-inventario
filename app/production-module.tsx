'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getCompleteUnits, getPieceShortages, getPieceStock, getSymmetricStock, type PieceMovement as DomainPieceMovement, type ManufacturingModel, type ModelPiece, type Size, type SizeGroup } from '@/lib/inventory-domain';
import { FABRIC_STORAGE_KEYS, createGlobalColorQuickly, createTextileColorQuickly, createTextileQuickly, type RollMovement as FabricRollMovement } from '@/app/fabric-module';
import { componentFabricSlotLabel, isComponentFabricSlot, isComponentFabricSlotAvailableForModel, normalizeComponentFabricSlot, resolveComponentPieceTextileId, secondaryFabricSlotIndex, type ComponentFabricSlot } from '@/lib/component-fabric-slots';
import { componentColorSlotLabel, isComponentColorSlot, isComponentColorSlotAvailableForModel, normalizeComponentColorSlot, requiredProductColorSlots, resolveComponentPieceColorId, secondaryColorSlotIndex, type ComponentColorSlot } from '@/lib/component-color-slots';
import { mapSizeSpecificationRules, validateSizeSpecification, type SizeSpecification, type SizeSpecificationRule } from '@/lib/material-size-specifications';

export type ProductionView = 'inventario-piezas' | 'inventario-prendas' | 'insumos' | 'compras-avios' | 'componentes' | 'modelos-producto' | 'recetas' | 'planificacion' | 'ordenes';
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
  stockMode: 'none' | 'total' | 'talla';
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
  fabricSlot: ComponentFabricSlot;
  /** Legacy field from the old fixed-textile selector; normalized to null on load. */
  textileId?: string | null;
  /** Color position resolved by the commercial product; colorId remains a legacy fallback. */
  colorSlot?: ComponentColorSlot;
  colorId: string | null;
};

export type ProductBasePieceMovement = {
  id: string;
  productModelId: string;
  pieceId: string;
  sizeId: string;
  delta: number;
  kind: 'entrada' | 'salida' | 'ajuste';
  side?: 'izquierda' | 'derecha';
  note: string;
  date: string;
  /** Original pattern-only movement copied once into a commercial model. */
  sourceMovementId?: string;
  sourceProductionOrderId?: string | null;
};

export type ComponentPieceMovement = {
  id: string;
  productModelId?: string | null;
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

/**
 * Prototipo de existencias de prendas terminadas.
 * Se conserva como ledger independiente para poder ajustar sus reglas sin
 * modificar el inventario de piezas ni el modelo comercial.
 */
export type FinishedGarmentMovement = {
  id: string;
  productModelId: string;
  sizeId: string;
  delta: number;
  kind: 'conversion_piezas' | 'ajuste';
  note: string;
  date: string;
};

export type MaterialRequirement = {
  id: string;
  variantId: string;
  mode: 'fixed' | 'per_size';
  unit: StockUnit;
  fixedQuantity: number | null;
  bySize: Record<string, number>;
  wastePercent: number;
  /** Optional characteristic (e.g. Longitud, Ancho, Grosor) configured by talla on each commercial model. */
  specificationLabel?: string;
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
  materialSpecifications?: Record<string, SizeSpecification>;
  /** Per-product, per-piece textile/color choices for this component selection. */
  pieceOverrides?: Record<string, ProductPieceOverride>;
};

export type ProductCollection = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductFabricAssignment = {
  id: string;
  productModelId: string;
  fabricSlot: string;
  textileId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductColorAssignment = {
  id: string;
  productModelId: string;
  colorSlot: string;
  colorId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductPieceOverride = { textileId?: string | null; colorId?: string | null };
type ProductPieceOverrideField = 'textileId' | 'colorId';
type ProductInventoryPiece = ModelPiece & {
  scope: 'base' | 'component';
  sourcePieceId: string;
  selectionId: string | null;
  componentId: string | null;
  componentName: string;
  textileName: string;
  colorName: string;
};

type ProductMaterialPieceRow = {
  key: string;
  pieceId: string;
  scope: 'base' | 'component';
  selectionId: string;
  pieceName: string;
  groupName: string;
  fabricSlot: string;
  colorSlot: ComponentColorSlot;
  textileId: string | null;
  colorId: string | null;
  textileStatus: string;
  colorStatus: string;
  hasTextileOverride: boolean;
  hasColorOverride: boolean;
};

export type ConfiguredProductModel = {
  id: string;
  name: string;
  collectionId: string | null;
  baseModelId: string;
  description: string;
  components: ProductComponentSelection[];
  additionalMaterials: MaterialRequirement[];
  /** Model-specific textile/color overrides for individual base-pattern pieces. */
  basePieceOverrides?: Record<string, ProductPieceOverride>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductionOrderStatus = 'borrador' | 'reservada' | 'en_proceso' | 'completada' | 'cancelada';
export type ProductionOrderMaterial = {
  id: string; variantId: string; sizeId: string | null; quantity: number; unit: StockUnit;
  unitCost: number | null; lineCost: number | null;
  specificationLabel?: string | null; specificationValue?: string | null;
};
export type ProductionOrderPieceRequirement = { id: string; pieceId: string; sizeId: string; side: 'izquierda' | 'derecha' | null; quantity: number };
export type ProductionOrderComponentPieceRequirement = ProductionOrderPieceRequirement & { componentId: string; productModelId: string };
export type ProductionOrderRollAllocation = { id: string; variantId: string; rollId: string; unit: 'KG' | 'M'; quantity: number };
export type ProductionOrderActualConsumption = {
  materials: ProductionOrderMaterial[];
  rollAllocations: ProductionOrderRollAllocation[];
  materialCost: number | null;
  missingCostLines: number;
  recordedAt: string;
};
type ProductMaterialSpecDraft = { label: string; rules: Array<SizeSpecificationRule & { id: string }> };
type ProductionOrderCompletionDraft = {
  orderId: string;
  materialQuantities: Record<string, string>;
  rollQuantities: Record<string, string>;
};
export type ProductionOrder = {
  id: string; number: string; productModelId: string; productName: string; baseModelId: string;
  status: ProductionOrderStatus; quantities: Record<string, number>;
  materials: ProductionOrderMaterial[]; basePieces: ProductionOrderPieceRequirement[];
  componentPieces: ProductionOrderComponentPieceRequirement[]; rollAllocations: ProductionOrderRollAllocation[];
  estimatedMaterialCost: number | null; missingCostLines: number; note: string;
  createdAt: string; updatedAt: string; reservedAt?: string | null; startedAt?: string | null;
  completedAt?: string | null; cancelledAt?: string | null;
  actualConsumption?: ProductionOrderActualConsumption | null;
};

export type ProductionBackupData = {
  supplies: Supply[];
  variants: SupplyVariant[];
  supplyMovements: SupplyMovement[];
  supplyPurchases: SupplyPurchase[];
  supplyPurchaseDetails: SupplyPurchaseDetail[];
  productBasePieceMovements: ProductBasePieceMovement[];
  componentPieceMovements: ComponentPieceMovement[];
  finishedGarmentMovements: FinishedGarmentMovement[];
  productionOrders: ProductionOrder[];
  components: GarmentComponent[];
  familyRecipes: FamilyRecipe[];
  productCollections: ProductCollection[];
  productModels: ConfiguredProductModel[];
  productFabrics: ProductFabricAssignment[];
  productColors: ProductColorAssignment[];
};

export const PRODUCTION_STORAGE_KEYS = {
  version: 'telastock-production-schema-version',
  supplies: 'telastock-supplies-v1',
  variants: 'telastock-supply-variants-v1',
  supplyMovements: 'telastock-supply-movements-v1',
  supplyPurchases: 'telastock-supply-purchases-v1',
  supplyPurchaseDetails: 'telastock-supply-purchase-details-v1',
  productBasePieceMovements: 'telastock-product-base-piece-movements-v1',
  componentPieceMovements: 'telastock-component-piece-movements-v1',
  finishedGarmentMovements: 'telastock-finished-garment-movements-v1',
  productionOrders: 'telastock-production-orders-v1',
  components: 'telastock-garment-components-v1',
  familyRecipes: 'telastock-family-recipes-v1',
  productCollections: 'telastock-product-collections-v1',
  productModels: 'telastock-configured-product-models-v1',
  productFabrics: 'telastock-configured-product-fabrics-v1',
  productColors: 'telastock-configured-product-colors-v1',
} as const;

export function emptyProductionBackupData(): ProductionBackupData {
  return { supplies: [], variants: [], supplyMovements: [], supplyPurchases: [], supplyPurchaseDetails: [], productBasePieceMovements: [], componentPieceMovements: [], finishedGarmentMovements: [], productionOrders: [], components: [], familyRecipes: [], productCollections: [], productModels: [], productFabrics: [], productColors: [] };
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
  output.productionOrders = output.productionOrders.map((order) => ({
    ...order,
    componentPieces: order.componentPieces.map((line) => ({ ...line, productModelId: line.productModelId ?? order.productModelId })),
  }));
  output.componentPieceMovements = output.componentPieceMovements.map((movement) => {
    if (movement.productModelId) return movement;
    const sourceOrder = movement.sourceProductionOrderId
      ? output.productionOrders.find((order) => order.id === movement.sourceProductionOrderId)
      : undefined;
    if (sourceOrder) return { ...movement, productModelId: sourceOrder.productModelId };
    const compatibleProducts = output.productModels.filter((product) => product.components.some((selection) => selection.componentId === movement.componentId));
    return { ...movement, productModelId: compatibleProducts.length === 1 ? compatibleProducts[0].id : null };
  });
  output.components = output.components.map((component) => ({
    ...component,
    pieces: component.pieces.map((piece) => ({
      ...piece,
      fabricSlot: normalizeComponentFabricSlot(piece.fabricSlot, piece.textileId),
      textileId: null,
      colorSlot: normalizeComponentColorSlot(piece.colorSlot, piece.colorId),
      colorId: piece.colorId ?? null,
    })),
  }));
  const variantIds = new Set(output.variants.map((x) => x.id));
  const componentIds = new Set(output.components.map((x) => x.id));
  if (!output.productCollections.every((x) => typeof x.name === 'string' && x.name.trim() && typeof x.active === 'boolean' && typeof x.createdAt === 'string' && typeof x.updatedAt === 'string')) {
    throw new Error('Hay colecciones de prendas incompletas.');
  }
  const productCollectionIds = new Set(output.productCollections.map((x) => x.id));
  const collectionNames = output.productCollections.map((x) => x.name.trim().toLocaleLowerCase('es'));
  if (new Set(collectionNames).size !== collectionNames.length) throw new Error('Hay colecciones de prendas con nombres repetidos.');
  const allComponentPieces = output.components.flatMap((component) => Array.isArray(component.pieces) ? component.pieces.filter((piece) => piece && typeof piece === 'object').map((piece) => ({ componentId: component.id, piece })) : []);
  const componentPieceMap = new Map(allComponentPieces.map(({ componentId, piece }) => [piece.id, { componentId, piece }] as const));
  if (componentPieceMap.size !== allComponentPieces.length) throw new Error('Hay identificadores repetidos entre piezas auxiliares.');
  const purchaseIds = new Set(output.supplyPurchases.map((x) => x.id));
  const purchaseDetailIds = new Set(output.supplyPurchaseDetails.map((x) => x.id));
  const validMaterials = (items: MaterialRequirement[]) => Array.isArray(items) && items.every((x) =>
    variantIds.has(x.variantId) && ['fixed', 'per_size'].includes(x.mode) &&
    ['und', 'm', 'cm', 'g', 'kg', 'l', 'ml'].includes(x.unit) &&
    (x.mode === 'fixed' ? Number.isFinite(x.fixedQuantity) && (x.fixedQuantity ?? 0) >= 0 : x.bySize && typeof x.bySize === 'object') &&
    Number.isFinite(x.wastePercent) && x.wastePercent >= 0 &&
    (x.specificationLabel === undefined || typeof x.specificationLabel === 'string')
  );
  const validPieceOverrides = (value: unknown) => value === undefined || Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((entry) => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry) &&
      ((entry as { textileId?: unknown }).textileId === undefined || (entry as { textileId?: unknown }).textileId === null || typeof (entry as { textileId?: unknown }).textileId === 'string') &&
      ((entry as { colorId?: unknown }).colorId === undefined || (entry as { colorId?: unknown }).colorId === null || typeof (entry as { colorId?: unknown }).colorId === 'string'))));
  if (!output.variants.every((x) => {
    const supply = output.supplies.find((item) => item.id === x.supplyId);
    return Boolean(supply && x.name.trim() && (x.textileId === null || typeof x.textileId === 'string') &&
      (!x.textileId || supply.stockMode === 'total') &&
      (x.purchasePackQuantity === null || (Number.isFinite(x.purchasePackQuantity) && x.purchasePackQuantity > 0)));
  })) {
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
      Array.isArray(order.componentPieces) && order.componentPieces.every((line) => line.productModelId === order.productModelId && componentPieceMap.has(line.pieceId) && componentPieceMap.get(line.pieceId)?.componentId === line.componentId && output.productModels.some((product) => product.id === line.productModelId && product.components.some((selection) => selection.componentId === line.componentId)) && typeof line.sizeId === 'string' && Number.isInteger(line.quantity) && line.quantity > 0 && (line.side === null || line.side === 'izquierda' || line.side === 'derecha')) &&
      Array.isArray(order.rollAllocations) && order.rollAllocations.every((allocation) => variantIds.has(allocation.variantId) && typeof allocation.rollId === 'string' && ['KG','M'].includes(allocation.unit) && Number.isFinite(allocation.quantity) && allocation.quantity > 0) &&
      Number.isInteger(order.missingCostLines) && order.missingCostLines >= 0 &&
      (order.estimatedMaterialCost === null || Number.isFinite(order.estimatedMaterialCost) && order.estimatedMaterialCost >= 0) &&
      (order.actualConsumption == null || (
        Array.isArray(order.actualConsumption.materials) &&
        order.actualConsumption.materials.length === order.materials.length &&
        order.actualConsumption.materials.every((line) => {
          const planned = order.materials.find((item) => item.id === line.id);
          return Boolean(planned && variantIds.has(line.variantId) && line.variantId === planned.variantId &&
            line.sizeId === planned.sizeId && line.unit === planned.unit &&
            Number.isFinite(line.quantity) && line.quantity >= 0 && line.quantity <= planned.quantity + 0.00001 &&
            ['und','m','cm','g','kg','l','ml'].includes(line.unit) &&
            (line.lineCost === null || Number.isFinite(line.lineCost) && line.lineCost >= 0));
        }) &&
        Array.isArray(order.actualConsumption.rollAllocations) &&
        order.actualConsumption.rollAllocations.length === order.rollAllocations.length &&
        order.actualConsumption.rollAllocations.every((allocation) => {
          const reserved = order.rollAllocations.find((item) => item.id === allocation.id);
          return Boolean(reserved && variantIds.has(allocation.variantId) && allocation.variantId === reserved.variantId &&
            allocation.rollId === reserved.rollId && allocation.unit === reserved.unit &&
            Number.isFinite(allocation.quantity) && allocation.quantity >= 0 && allocation.quantity <= reserved.quantity + 0.00001 &&
            ['KG','M'].includes(allocation.unit));
        }) &&
        Number.isInteger(order.actualConsumption.missingCostLines) && order.actualConsumption.missingCostLines >= 0 &&
        (order.actualConsumption.materialCost === null || Number.isFinite(order.actualConsumption.materialCost) && order.actualConsumption.materialCost >= 0) &&
        typeof order.actualConsumption.recordedAt === 'string'
      ));
  })) throw new Error('Hay órdenes de producción con datos o relaciones inválidas.');
  if (!output.components.every((x) => typeof x.name === 'string' && x.name.trim() && typeof x.type === 'string' && x.type.trim() && Array.isArray(x.pieces) && x.pieces.every((p) => p && typeof p.id === 'string' && p.id.trim() && typeof p.name === 'string' && p.name.trim() && Number.isInteger(p.unitsPerGarment) && p.unitsPerGarment > 0 && ['ninguna', 'simetrica', 'izquierda', 'derecha'].includes(p.laterality) && (p.laterality !== 'simetrica' || p.unitsPerGarment % 2 === 0) && isComponentFabricSlot(p.fabricSlot) && isComponentColorSlot(p.colorSlot) && p.textileId === null && (p.colorId === null || typeof p.colorId === 'string')) && validMaterials(x.materials))) {
    throw new Error('Hay componentes con piezas o materiales inválidos.');
  }
  if (!output.productBasePieceMovements.every((movement) =>
    typeof movement.productModelId === 'string' && output.productModels.some((product) => product.id === movement.productModelId) &&
    typeof movement.pieceId === 'string' && movement.pieceId.length > 0 &&
    typeof movement.sizeId === 'string' && movement.sizeId.length > 0 &&
    Number.isInteger(movement.delta) && movement.delta !== 0 &&
    ['entrada', 'salida', 'ajuste'].includes(movement.kind) &&
    !((movement.kind === 'entrada' && movement.delta < 0) || (movement.kind === 'salida' && movement.delta > 0)) &&
    (movement.side === undefined || movement.side === 'izquierda' || movement.side === 'derecha') &&
    typeof movement.note === 'string' && typeof movement.date === 'string' &&
    (movement.sourceMovementId === undefined || typeof movement.sourceMovementId === 'string') &&
    (movement.sourceProductionOrderId == null || typeof movement.sourceProductionOrderId === 'string')
  )) throw new Error('Hay movimientos de moldes base sin modelo comercial o con datos inválidos.');
  if (!output.finishedGarmentMovements.every((movement) =>
    typeof movement.productModelId === 'string' && output.productModels.some((product) => product.id === movement.productModelId) &&
    typeof movement.sizeId === 'string' && movement.sizeId.length > 0 &&
    Number.isInteger(movement.delta) && movement.delta !== 0 &&
    ['conversion_piezas', 'ajuste'].includes(movement.kind) &&
    typeof movement.note === 'string' && typeof movement.date === 'string'
  )) throw new Error('Hay movimientos de prendas terminadas con datos inválidos o sin modelo comercial.');
  const finishedGarmentBalances = new Map<string, number>();
  output.finishedGarmentMovements.forEach((movement) => {
    const key = movement.productModelId + ':' + movement.sizeId;
    finishedGarmentBalances.set(key, (finishedGarmentBalances.get(key) ?? 0) + movement.delta);
  });
  if ([...finishedGarmentBalances.values()].some((balance) => balance < 0)) {
    throw new Error('El respaldo contiene existencias negativas de prendas terminadas.');
  }
  const baseMovementScopes = new Map<string, ProductBasePieceMovement[]>();
  output.productBasePieceMovements.forEach((movement) => {
    const key = movement.productModelId + ':' + movement.pieceId + ':' + movement.sizeId;
    baseMovementScopes.set(key, [...(baseMovementScopes.get(key) ?? []), movement]);
  });
  for (const movements of baseMovementScopes.values()) {
    const legacy = movements.filter((movement) => !movement.side).reduce((sum, movement) => sum + movement.delta, 0);
    const pairs = Math.floor(Math.max(0, legacy) / 2);
    const left = pairs + movements.filter((movement) => movement.side === 'izquierda').reduce((sum, movement) => sum + movement.delta, 0);
    const right = pairs + movements.filter((movement) => movement.side === 'derecha').reduce((sum, movement) => sum + movement.delta, 0);
    if (legacy < 0 || left < 0 || right < 0) throw new Error('El respaldo contiene stock negativo en moldes base de un modelo comercial.');
  }
  if (new Set(output.productBasePieceMovements.filter((movement) => movement.sourceMovementId).map((movement) => movement.sourceMovementId)).size !== output.productBasePieceMovements.filter((movement) => movement.sourceMovementId).length) {
    throw new Error('Hay movimientos antiguos del patrón asignados más de una vez a modelos comerciales.');
  }
  if (!output.componentPieceMovements.every((movement) => {
    const owner = componentPieceMap.get(movement.pieceId);
    return owner?.componentId === movement.componentId &&
      (movement.productModelId == null || output.productModels.some((product) => product.id === movement.productModelId && product.components.some((selection) => selection.componentId === movement.componentId))) &&
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
    const balanceScopes = new Map<string, ComponentPieceMovement[]>();
    rows.forEach((movement) => {
      const scope = (movement.productModelId ?? 'legacy-unassigned') + ':' + movement.sizeId;
      balanceScopes.set(scope, [...(balanceScopes.get(scope) ?? []), movement]);
    });
    for (const movements of balanceScopes.values()) {
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
  if (!output.productModels.every((x) => x.name.trim() && (x.collectionId === null || x.collectionId === undefined || productCollectionIds.has(x.collectionId)) && typeof x.baseModelId === 'string' && Array.isArray(x.components) && x.components.every((c) => componentIds.has(c.componentId) && Number.isFinite(c.quantity) && c.quantity > 0 && validPieceOverrides(c.pieceOverrides) && (c.materialSpecifications === undefined || (c.materialSpecifications && typeof c.materialSpecifications === 'object' && Object.entries(c.materialSpecifications).every(([materialId, spec]) => typeof materialId === 'string' && spec && typeof spec.label === 'string' && typeof spec.bySize === 'object' && validateSizeSpecification(spec, Object.keys(spec.bySize)) && Object.values(spec.bySize).every((value) => typeof value === 'string' && value.trim().length > 0))))) && validPieceOverrides(x.basePieceOverrides) && validMaterials(x.additionalMaterials))) {
    throw new Error('Hay modelos configurados con componentes o materiales inválidos.');
  }
  const productModelIds = new Set(output.productModels.map((product) => product.id));
  const productFabricKeys = output.productFabrics.map((assignment) => assignment.productModelId + ':' + assignment.fabricSlot);
  const productColorKeys = output.productColors.map((assignment) => assignment.productModelId + ':' + assignment.colorSlot);
  if (!output.productFabrics.every((assignment) => productModelIds.has(assignment.productModelId) && typeof assignment.fabricSlot === 'string' && assignment.fabricSlot.trim() && typeof assignment.textileId === 'string' && assignment.textileId.trim() && typeof assignment.createdAt === 'string' && typeof assignment.updatedAt === 'string') || new Set(productFabricKeys).size !== productFabricKeys.length) {
    throw new Error('Hay asignaciones de tela duplicadas o vinculadas a modelos inexistentes.');
  }
  if (!output.productColors.every((assignment) => productModelIds.has(assignment.productModelId) && typeof assignment.colorSlot === 'string' && assignment.colorSlot.trim() && typeof assignment.colorId === 'string' && assignment.colorId.trim() && typeof assignment.createdAt === 'string' && typeof assignment.updatedAt === 'string') || new Set(productColorKeys).size !== productColorKeys.length) {
    throw new Error('Hay asignaciones de color duplicadas o vinculadas a modelos inexistentes.');
  }
  if (!output.supplies.every((x) => x.name.trim() && ['none', 'total', 'talla'].includes(x.stockMode) && ['und', 'm', 'cm', 'g', 'kg', 'l', 'ml'].includes(x.baseUnit))) {
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
const componentTypes = ['Cuello', 'Bolsillo', 'Puño', 'Pretina', 'Tapetera', 'Cierre', 'Terminación', 'Otro'];
const productColorSlotsForConfiguredModel = (baseModelId: string, basePieces: ModelPiece[], components: GarmentComponent[]) =>
  requiredProductColorSlots([
    ...basePieces.filter((piece) => piece.modelId === baseModelId && !piece.archived),
    ...components.flatMap((component) => component.pieces),
  ]);
const productColorSlotLabel = (slot: string) => componentColorSlotLabel(slot);
const unitLabel: Record<StockUnit, string> = { und: 'unidades', m: 'm', cm: 'cm', g: 'g', kg: 'kg', l: 'l', ml: 'ml' };
const id = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'prod-' + Date.now() + '-' + Math.random().toString(36).slice(2);
const productFabricSlotsForBaseModel = (model: ManufacturingModel) => ['principal', ...Array.from({ length: Math.max(0, Math.floor(model.secondaryFabricSlots ?? 0)) }, (_, index) => 'secundaria_' + (index + 1))];
const productFabricSlotLabel = (slot: string) => {
  if (slot === 'principal') return 'Tela principal 1';
  const match = /^secundaria_(\d+)$/.exec(slot);
  return match ? 'Tela secundaria ' + Number(match[1]) : slot;
};
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

type TextileRow = { id: string; nombreTela: string; unidadVenta: 'KG' | 'M'; activo?: boolean };
type TextileColorRow = { id: string; idTela: string; idColor: string; hexadecimal?: string | null; cmykC?: number | null; cmykM?: number | null; cmykY?: number | null; cmykK?: number | null; activo: boolean; createdAt?: string; updatedAt?: string };
type ColorRow = { id: string; nombre: string };
type RollRow = { id: string; idTela: string; idTelaColor?: string | null; unidadIngreso?: 'KG' | 'M'; metros: number | null; pesoKg: number | null; estado: string; fechaIngreso?: string; updatedAt?: string; ubicacion?: string; idLote?: string };
type SupplierOption = { id: string; nombre: string; ruc?: string | null };
type TextileContext = { telas: TextileRow[]; rollos: RollRow[]; telaColores: TextileColorRow[]; colores: ColorRow[]; proveedores: SupplierOption[] };
type PurchaseLineDraft = { id: string; variantId: string; sizeId: string; quantity: string; unitPrice: string };
type QuickMaterialDraft = {
  existingSupplyId: string;
  supplyName: string;
  category: SupplyCategory;
  baseUnit: StockUnit;
  stockMode: 'none' | 'total' | 'talla';
  variantName: string;
};
type QuickMaterialCreated = { supply: Supply; variant: SupplyVariant };
type QuickTextileTarget = { kind: 'product'; slot: string } | { kind: 'existingProduct'; slot: string } | { kind: 'component'; pieceId: string } | { kind: 'variant' };
type QuickTextileDraft = { target: QuickTextileTarget; name: string; unit: 'KG' | 'M'; width: string; theoreticalYield: string; description: string };

function MaterialEditor({
  materials, onChange, variants, supplies, sizes, title, onCreateSupplyVariant, allowSizeSpecifications = false,
}: {
  materials: MaterialRequirement[];
  onChange: (items: MaterialRequirement[]) => void;
  variants: SupplyVariant[];
  supplies: Supply[];
  sizes: Size[];
  title: string;
  onCreateSupplyVariant: (draft: QuickMaterialDraft) => QuickMaterialCreated | null;
  allowSizeSpecifications?: boolean;
}) {
  const variantOptions = variants.filter((variant, index) => {
    const supply = supplies.find((item) => item.id === variant.supplyId);
    return supply?.stockMode !== 'none' || variants.findIndex((item) => item.supplyId === variant.supplyId && item.active) === index;
  }).map((variant) => ({
    variant,
    label: supplies.find((item) => item.id === variant.supplyId)?.stockMode === 'none'
      ? (supplies.find((item) => item.id === variant.supplyId)?.name ?? 'Insumo')
      : variantLabel(variant, variants, supplies),
  }));
  const [showQuickMaterial, setShowQuickMaterial] = useState(false);
  const [quickMaterialDraft, setQuickMaterialDraft] = useState<QuickMaterialDraft>({
    existingSupplyId: supplies.find((item) => item.active)?.id ?? '',
    supplyName: '', category: 'Otros avíos', baseUnit: 'und', stockMode: 'none', variantName: 'General',
  });
  function openQuickMaterial() {
    setQuickMaterialDraft({
      existingSupplyId: supplies.find((item) => item.active)?.id ?? '',
      supplyName: '', category: 'Otros avíos', baseUnit: 'und', stockMode: 'none', variantName: 'General',
    });
    setShowQuickMaterial((current) => !current);
  }
  function saveQuickMaterial() {
    const created = onCreateSupplyVariant(quickMaterialDraft);
    if (!created) return;
    onChange([...materials, {
      id: id(), variantId: created.variant.id, mode: 'fixed',
      unit: created.supply.baseUnit, fixedQuantity: 1, bySize: {}, wastePercent: 0,
    }]);
    setShowQuickMaterial(false);
  }
  function update(index: number, patch: Partial<MaterialRequirement>) {
    onChange(materials.map((item, i) => i === index ? { ...item, ...patch } : item));
  }
  function add() {
    const first = variants[0];
    if (!first) return;
    const supply = supplies.find((item) => item.id === first.supplyId);
    onChange([...materials, { id: id(), variantId: first.id, mode: 'fixed', unit: supply?.baseUnit ?? 'und', fixedQuantity: 1, bySize: {}, wastePercent: 0 }]);
  }
  return <div className="production-material-editor">
    <div className="production-subheading"><strong>{title}</strong><div className="production-material-actions"><button type="button" className="text-action" disabled={variants.length === 0} onClick={add}>＋ Agregar material</button><button type="button" className="text-action" onClick={openQuickMaterial}>＋ Crear insumo y variante</button></div></div>
    {showQuickMaterial && <div className="production-quick-material">
      <strong>Crear material para este consumo</strong>
      {supplies.filter((item) => item.active).length > 0 && <label className="field-label">Usar insumo existente
        <select className="large-input" value={quickMaterialDraft.existingSupplyId} onChange={(event) => setQuickMaterialDraft((current) => ({ ...current, existingSupplyId: event.target.value }))}>
          <option value="">＋ Crear un insumo nuevo</option>
          {supplies.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {unitLabel[item.baseUnit]}</option>)}
        </select>
      </label>}
      {!quickMaterialDraft.existingSupplyId && <>
        <label className="field-label">Nombre del insumo<input className="large-input" value={quickMaterialDraft.supplyName} onChange={(event) => setQuickMaterialDraft((current) => ({ ...current, supplyName: event.target.value }))} placeholder="Ej. Cinta elástica rígida" required /></label>
        <div className="production-form-grid">
          <label className="field-label">Categoría<select className="large-input" value={quickMaterialDraft.category} onChange={(event) => setQuickMaterialDraft((current) => ({ ...current, category: event.target.value as SupplyCategory }))}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="field-label">Unidad base<select className="large-input" value={quickMaterialDraft.baseUnit} onChange={(event) => setQuickMaterialDraft((current) => ({ ...current, baseUnit: event.target.value as StockUnit }))}>{units.map((unit) => <option key={unit} value={unit}>{unitLabel[unit]}</option>)}</select></label>
        </div>
      </>}
      <small>El insumo se crea sin inventario. Su medida o característica por talla se define después al crear cada modelo; no se crearán variantes de stock de 13 cm, 15 cm, etc.</small>
      <div className="production-quick-material-actions"><button type="button" className="button secondary" onClick={() => setShowQuickMaterial(false)}>Cancelar</button><button type="button" className="button primary" onClick={saveQuickMaterial}>Guardar y usar</button></div>
    </div>}
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
          {allowSizeSpecifications && <label className="field-label">Característica que variará por talla (opcional)
            <input className="large-input" value={material.specificationLabel ?? ''} onChange={(event) => update(index, { specificationLabel: event.target.value })} placeholder="Ej. Longitud, ancho, grosor" />
            <small>El valor concreto se asigna por grupos de tallas al crear el modelo comercial.</small>
          </label>}
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
  view, families, baseModels, baseModelsReady, basePieces, baseMovements, sizes, sizeGroups, onAddBaseMovements, onNavigate, onQuickCreateBaseModel,
}: {
  view: ProductionView;
  families: { value: string; label: string }[];
  baseModels: ManufacturingModel[];
  baseModelsReady: boolean;
  basePieces: ModelPiece[];
  baseMovements: DomainPieceMovement[];
  sizes: Size[];
  sizeGroups: SizeGroup[];
  onAddBaseMovements: (movements: DomainPieceMovement[]) => boolean;
  onNavigate: (view: ProductionView) => void;
  onQuickCreateBaseModel: (onCreated: (modelId: string) => void) => void;
}) {
  const [data, setData] = useState<ProductionBackupData>(emptyProductionBackupData);
  const [ready, setReady] = useState(false);
  const [storageSafe, setStorageSafe] = useState(true);
  const [notice, setNotice] = useState<{ text: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const [textileContext, setTextileContext] = useState<TextileContext>({ telas: [], rollos: [], telaColores: [], colores: [], proveedores: [] });
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [selectedStockProductModelId, setSelectedStockProductModelId] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState<'Con stock' | 'Vacío' | 'Todos'>('Con stock');
  const [inventoryIncludeEmptySizes, setInventoryIncludeEmptySizes] = useState(false);
  const [inventoryExpandedProducts, setInventoryExpandedProducts] = useState<string[]>([]);
  const [inventoryProductId, setInventoryProductId] = useState('');
  const [inventoryOperation, setInventoryOperation] = useState<'entrada' | 'salida'>('entrada');
  const [inventorySizeIds, setInventorySizeIds] = useState<string[]>([]);
  const [inventoryAmounts, setInventoryAmounts] = useState<Record<string, string>>({});
  const [inventoryEntryModes, setInventoryEntryModes] = useState<Record<string, 'paridad' | 'lados'>>({});
  const [inventoryNote, setInventoryNote] = useState('Ingreso de piezas');
  const [showProductInventoryForm, setShowProductInventoryForm] = useState(false);
  const [finishedInventorySearch, setFinishedInventorySearch] = useState('');
  const [finishedInventoryFilter, setFinishedInventoryFilter] = useState<'Con stock' | 'Vacío' | 'Todos'>('Con stock');
  const [selectedPieceConfigurationProductId, setSelectedPieceConfigurationProductId] = useState('');
  const [componentToAddInPieceConfiguration, setComponentToAddInPieceConfiguration] = useState('');
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
  const [stockMode, setStockMode] = useState<'none' | 'total' | 'talla'>('none');
  const [supplyDescription, setSupplyDescription] = useState('');
  const [supplyAttributes, setSupplyAttributes] = useState('');
  const [showSupplyForm, setShowSupplyForm] = useState(false);
  const [supplyReturnToPurchase, setSupplyReturnToPurchase] = useState(false);
  const [purchaseQuickSupplyId, setPurchaseQuickSupplyId] = useState('');
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
  const [returnToProductAfterComponentCreate, setReturnToProductAfterComponentCreate] = useState(false);
  const [recipeDraft, setRecipeDraft] = useState<FamilyRecipe | null>(null);
  const [productName, setProductName] = useState('');
  const [productCollectionId, setProductCollectionId] = useState('');
  const [showProductCollectionCreator, setShowProductCollectionCreator] = useState(false);
  const [newProductCollectionName, setNewProductCollectionName] = useState('');
  const [productBaseId, setProductBaseId] = useState('');
  const [productFabricAssignments, setProductFabricAssignments] = useState<Record<string, string>>({});
  const [productColorAssignments, setProductColorAssignments] = useState<Record<string, string>>({});
  const [productPieceOverrides, setProductPieceOverrides] = useState<Record<string, ProductPieceOverride>>({});
  const [editingProductFabricId, setEditingProductFabricId] = useState('');
  const [editingProductFabricAssignments, setEditingProductFabricAssignments] = useState<Record<string, string>>({});
  const [editingProductColorId, setEditingProductColorId] = useState('');
  const [editingProductColorAssignments, setEditingProductColorAssignments] = useState<Record<string, string>>({});
  const [quickProductColorSlot, setQuickProductColorSlot] = useState('');
  const [quickProductColorName, setQuickProductColorName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productComponentIds, setProductComponentIds] = useState<string[]>([]);
  const [productMaterialSpecsDraft, setProductMaterialSpecsDraft] = useState<Record<string, ProductMaterialSpecDraft>>({});
  const [selectedProductId, setSelectedProductId] = useState('');
  const [planCounts, setPlanCounts] = useState<Record<string, string>>({});
  const [orderNote, setOrderNote] = useState('');
  const [completionDraft, setCompletionDraft] = useState<ProductionOrderCompletionDraft | null>(null);
  const [quickTextileDraft, setQuickTextileDraft] = useState<QuickTextileDraft | null>(null);
  const [quickVariantColorTextileId, setQuickVariantColorTextileId] = useState('');
  const [quickVariantColorName, setQuickVariantColorName] = useState('');

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
    if (version > 11) { safe = false; warning = 'Los datos de insumos fueron creados con una versión más reciente. Se evita sobrescribirlos.'; }
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
    try {
      const validated = validateProductionBackupData(next);
      return { data: { ...validated, productModels: validated.productModels.map((product) => ({ ...product, collectionId: product.collectionId ?? null })) }, safe, warning };
    } catch { return { data: next, safe: false, warning: 'Las relaciones de insumos o componentes no son válidas. No se guardarán cambios.' }; }
  };

  useEffect(() => {
    const loaded = loadLocal();
    setData(loaded.data);
    setStorageSafe(loaded.safe);
    if (loaded.safe) localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '11');
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
    if (!ready || !storageSafe || !baseModelsReady) return;
    setData((current) => {
      let changed = false;
      const productModels = current.productModels.map((product) => {
        const legacy = product as ConfiguredProductModel & { family?: string };
        if (!Object.prototype.hasOwnProperty.call(legacy, 'family')) return product;
        const { family: _legacyFamily, ...normalized } = legacy;
        changed = true;
        return normalized;
      });
      return changed ? { ...current, productModels } : current;
    });
  }, [ready, storageSafe, baseModelsReady, baseModels]);

  useEffect(() => {
    if (!ready || !storageSafe) return;
    const keys = Object.keys(emptyProductionBackupData()) as (keyof ProductionBackupData)[];
    const previous = new Map<string, string | null>();
    try {
      keys.forEach((key) => previous.set(PRODUCTION_STORAGE_KEYS[key], localStorage.getItem(PRODUCTION_STORAGE_KEYS[key])));
      keys.forEach((key) => localStorage.setItem(PRODUCTION_STORAGE_KEYS[key], JSON.stringify(data[key])));
      localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '11');
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
    if (stockMode === 'none') {
      const generalVariant: SupplyVariant = { id: id(), supplyId: row.id, name: 'General', attributes: {}, textileId: null, textileColorId: null, purchasePackQuantity: null, purchasePackLabel: '', active: true };
      setData((current) => ({ ...current, supplies: [...current.supplies, row], variants: [...current.variants, generalVariant] }));
    } else {
      setData((current) => ({ ...current, supplies: [...current.supplies, row] }));
    }
    setSupplyName(''); setSupplyDescription(''); setSupplyAttributes(''); setShowSupplyForm(false);
    if (supplyReturnToPurchase) { openVariant(row.id); tell('Insumo creado. Ahora registra su variante con el mismo formulario de variantes.'); return; }
    if (stockMode !== 'none') { openVariant(row.id); tell('Insumo creado. Completa su primera variante en el mismo formulario que usarás después.'); return; }
    tell('Insumo registrado. Sus características por talla se definirán al crear cada modelo.');
  }
  function openQuickTextile(target: QuickTextileTarget) {
    const supply = target.kind === 'variant' ? supplies.find((item) => item.id === variantSupplyId) : undefined;
    const unit: 'KG' | 'M' = supply?.baseUnit === 'm' ? 'M' : 'KG';
    setQuickTextileDraft({ target, name: '', unit, width: '', theoreticalYield: '', description: '' });
  }

  function saveQuickTextile(event: FormEvent) {
    event.preventDefault();
    if (!quickTextileDraft) return;
    const width = numberOrNull(quickTextileDraft.width);
    const theoreticalYield = numberOrNull(quickTextileDraft.theoreticalYield);
    if (quickTextileDraft.width.trim() && (width === null || !Number.isFinite(width) || width <= 0)) return tell('El ancho debe ser un número mayor que cero o quedar vacío.', 'error');
    if (quickTextileDraft.theoreticalYield.trim() && (theoreticalYield === null || !Number.isFinite(theoreticalYield) || theoreticalYield <= 0)) return tell('El rendimiento teórico debe ser mayor que cero o quedar vacío.', 'error');
    try {
      const target = quickTextileDraft.target;
      if (target.kind === 'variant') {
        const supply = supplies.find((item) => item.id === variantSupplyId);
        const expectedUnit = supply?.baseUnit === 'm' ? 'M' : supply?.baseUnit === 'kg' ? 'KG' : null;
        if (!supply || !expectedUnit || quickTextileDraft.unit !== expectedUnit) return tell('La tela debe usar la misma unidad de inventario del insumo (metros o kilogramos).', 'error');
      }
      const textile = createTextileQuickly({
        name: quickTextileDraft.name, unit: quickTextileDraft.unit,
        width, theoreticalYield, description: quickTextileDraft.description,
      });
      refreshTextiles();
      if (target.kind === 'product') {
        const slot = target.slot;
        setProductFabricAssignments((current) => ({ ...current, [slot]: textile.id }));
      } else if (target.kind === 'existingProduct') {
        const slot = target.slot;
        setEditingProductFabricAssignments((current) => ({ ...current, [slot]: textile.id }));
      } else if (target.kind === 'variant') {
        setVariantTextileId(textile.id);
        setVariantTextileColorId('');
      } else {
        const pieceId = target.pieceId;
        setComponentDraft((current) => current ? {
          ...current,
          pieces: current.pieces.map((piece) => piece.id === pieceId ? { ...piece, textileId: textile.id } : piece),
        } : current);
      }
      setQuickTextileDraft(null);
      tell('Tela creada y seleccionada en el campo que estabas completando.');
    } catch (error) {
      tell(error instanceof Error ? error.message : 'No se pudo crear la tela.', 'error');
    }
  }

  function openQuickVariantColor() {
    if (!variantTextileId) return tell('Selecciona primero una tela.', 'error');
    setQuickVariantColorTextileId(variantTextileId);
    setQuickVariantColorName('');
  }

  function saveQuickVariantColor(event: FormEvent) {
    event.preventDefault();
    if (!quickVariantColorTextileId) return;
    try {
      const association = createTextileColorQuickly(quickVariantColorTextileId, quickVariantColorName);
      refreshTextiles();
      setVariantTextileColorId(association.id);
      setQuickVariantColorTextileId('');
      setQuickVariantColorName('');
      tell('Color creado y asociado a la tela seleccionada.');
    } catch (error) {
      tell(error instanceof Error ? error.message : 'No se pudo asociar el color a la tela.', 'error');
    }
  }

  function createSupplyVariantFromMaterial(draft: QuickMaterialDraft): QuickMaterialCreated | null {
    const existing = draft.existingSupplyId ? supplies.find((item) => item.id === draft.existingSupplyId && item.active) : undefined;
    if (draft.existingSupplyId && !existing) { tell('El insumo elegido ya no está disponible. Actualiza el formulario.', 'error'); return null; }
    const supplyName = draft.supplyName.trim();
    if (!existing && !supplyName) { tell('Escribe el nombre del nuevo insumo.', 'error'); return null; }
    if (!existing && supplies.some((item) => item.name.trim().toLocaleLowerCase('es') === supplyName.toLocaleLowerCase('es'))) {
      tell('Ese insumo ya existe. Selecciónalo en «Usar insumo existente».', 'error'); return null;
    }
    const supply = existing ?? {
      id: id(), name: supplyName, category: draft.category, baseUnit: draft.baseUnit,
      stockMode: 'none' as const, description: '', attributes: {}, active: true,
      createdAt: now(), updatedAt: now(),
    };
    const existingVariant = data.variants.find((item) => item.supplyId === supply.id && item.active);
    if (existingVariant) {
      tell(existing ? 'Insumo seleccionado.' : 'Insumo creado sin inventario.');
      return { supply, variant: existingVariant };
    }
    const variant: SupplyVariant = {
      id: id(), supplyId: supply.id, name: 'General', attributes: {},
      textileId: null, textileColorId: null, purchasePackQuantity: null,
      purchasePackLabel: '', active: true,
    };
    setData((current) => ({
      ...current,
      supplies: existing ? current.supplies : [...current.supplies, supply],
      variants: [...current.variants, variant],
    }));
    tell(existing ? 'Insumo listo para configurar por talla.' : 'Insumo creado sin inventario. Se añadirá a este componente.');
    return { supply, variant };
  }

  function openVariant(supplyId: string) {
    const targetSupply = supplies.find((item) => item.id === supplyId);
    if (targetSupply?.stockMode === 'none') return tell('Este insumo se configura por talla en cada modelo; no necesita variantes ni inventario.', 'info');
    setVariantSupplyId(supplyId); setVariantName(''); setVariantPackQuantity(''); setVariantPackLabel(''); setVariantAttributes('');
    setVariantTextileId(''); setVariantTextileColorId(''); setShowVariantForm(true);
  }
  function saveVariant(event: FormEvent) {
    event.preventDefault();
    const supply = supplies.find((x) => x.id === variantSupplyId);
    if (!supply || !variantName.trim()) return tell('Selecciona el insumo y escribe el nombre de la variante.', 'error');
    if (supply.stockMode === 'none') return tell('Este insumo no maneja variantes de inventario. Define su medida por talla al crear el modelo.', 'error');
    const packQuantity = numberOrNull(variantPackQuantity);
    if (variantPackQuantity.trim() && (packQuantity === null || !Number.isFinite(packQuantity) || packQuantity <= 0 || (supply.baseUnit === 'und' && !Number.isInteger(packQuantity)))) return tell(supply.baseUnit === 'und' ? 'La equivalencia para unidades debe ser un entero.' : 'La equivalencia del paquete debe ser mayor que cero.', 'error');
    if (variantTextileId && supply.stockMode === 'talla') return tell('Las telas vinculadas a rollos se controlan por rollo, no por talla. Selecciona control de existencias total.', 'error');
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
    setShowVariantForm(false);
    if (supplyReturnToPurchase) {
      setPurchaseLines((current) => current.map((line, index) => index === 0 && !line.variantId ? { ...line, variantId: row.id, sizeId: '' } : line));
      setSupplyReturnToPurchase(false);
      setShowPurchaseForm(true);
      onNavigate('compras-avios');
      tell('Variante creada y añadida a la compra que estabas preparando.');
      return;
    }
    tell('Variante registrada.');
  }
  function stockForVariant(variant: SupplyVariant, sizeId: string | null): number {
    const supply = supplies.find((x) => x.id === variant.supplyId);
    if (!supply || supply.stockMode === 'none') return 0;
    if (variant.textileId) {
      return textileContext.rollos.filter((roll) => roll.idTela === variant.textileId && (!variant.textileColorId || roll.idTelaColor === variant.textileColorId) && roll.estado === 'disponible')
        .reduce((sum, roll) => sum + (supply.baseUnit === 'm' ? (roll.metros ?? 0) : supply.baseUnit === 'kg' ? (roll.pesoKg ?? 0) : 0), 0);
    }
    return data.supplyMovements.filter((movement) => movement.variantId === variant.id && movement.sizeId === (supply.stockMode === 'talla' ? sizeId : null))
      .reduce((sum, movement) => sum + movement.delta, 0);
  }
  function componentPieceDomainLedger(productModelId: string, pieceId: string, sizeId: string): DomainPieceMovement[] {
    return data.componentPieceMovements.filter((movement) =>
      movement.productModelId === productModelId && movement.pieceId === pieceId && movement.sizeId === sizeId
    ).map((movement) => ({
      id: movement.id, pieceId: movement.pieceId, sizeId: movement.sizeId, delta: movement.delta,
      kind: movement.kind, side: movement.side, note: movement.note, date: movement.date,
    }));
  }
  function basePatternSizeOptions(baseModel: ManufacturingModel | undefined): Size[] {
    if (!baseModel) return [];
    const excludedSizeIds = new Set(baseModel.excludedSizeIds ?? []);
    return sizes.filter((size) => size.groupId === baseModel.sizeGroupId && !excludedSizeIds.has(size.id));
  }
  function productSizeOptions(product: ConfiguredProductModel): Size[] {
    return basePatternSizeOptions(baseModels.find((model) => model.id === product.baseModelId));
  }
  function componentPieceStockLabel(productModelId: string, piece: ComponentPiece, sizeId: string): string {
    const ledger = componentPieceDomainLedger(productModelId, piece.id, sizeId);
    if (piece.laterality === 'simetrica') {
      const stock = getSymmetricStock(ledger, piece.id, sizeId);
      return stock.left === stock.right ? format(stock.parity) + ' par.' : format(stock.left) + '/' + format(stock.right);
    }
    return format(getPieceStock(ledger, piece.id, sizeId));
  }
  function openComponentPieceMovement(productModelId: string, component: GarmentComponent, piece: ComponentPiece) {
    const product = data.productModels.find((item) => item.id === productModelId && item.active);
    setSelectedStockProductModelId(productModelId);
    setSelectedStockComponentId(component.id);
    setComponentStockPieceId(piece.id);
    setComponentStockSizeId(product ? productSizeOptions(product)[0]?.id ?? '' : '');
    setComponentStockKind('entrada');
    setComponentStockMode('paridad');
    setComponentStockSide('izquierda');
    setComponentStockQuantity('');
    setComponentStockNote('Ingreso de piezas auxiliares');
    setShowComponentPieceMovement(true);
  }
  function saveComponentPieceMovement(event: FormEvent) {
    event.preventDefault();
    const product = data.productModels.find((item) => item.id === selectedStockProductModelId && item.active);
    const baseModel = product ? baseModels.find((item) => item.id === product.baseModelId) : undefined;
    const selection = product?.components.find((item) => item.componentId === selectedStockComponentId);
    const component = selection ? data.components.find((item) => item.id === selection.componentId && item.active) : undefined;
    const piece = component?.pieces.find((item) => item.id === componentStockPieceId);
    const productSizes = product ? productSizeOptions(product) : [];
    const quantity = Number(componentStockQuantity);
    if (!product || !baseModel || !component || !piece) return tell('No se encontró el modelo, componente o pieza auxiliar seleccionada.', 'error');
    if (!componentStockSizeId || !productSizes.some((size) => size.id === componentStockSizeId)) return tell('Selecciona una talla válida de la tabla de tallas del patrón base.', 'error');
    if (!Number.isInteger(quantity) || quantity <= 0) return tell('La cantidad debe ser un entero mayor que cero.', 'error');
    const sign = componentStockKind === 'entrada' ? 1 : -1;
    const createdAt = now();
    const movements: ComponentPieceMovement[] = [];
    const createMovement = (side?: 'izquierda' | 'derecha') => movements.push({
      id: id(), productModelId: product.id, componentId: component.id, pieceId: piece.id, sizeId: componentStockSizeId,
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
    const ledger: DomainPieceMovement[] = candidate.filter((movement) =>
      movement.productModelId === product.id && movement.pieceId === piece.id && movement.sizeId === componentStockSizeId
    ).map((movement) => ({
      id: movement.id, pieceId: movement.pieceId, sizeId: movement.sizeId, delta: movement.delta,
      kind: movement.kind, side: movement.side, note: movement.note, date: movement.date,
    }));
    const productReservations = ordersHoldingStock.filter((order) => order.productModelId === product.id).flatMap((order) => order.componentPieces);
    if (piece.laterality === 'simetrica') {
      const legacy = ledger.filter((movement) => !movement.side).reduce((sum, movement) => sum + movement.delta, 0);
      const legacyPairs = Math.floor(Math.max(0, legacy) / 2);
      const left = legacyPairs + ledger.filter((movement) => movement.side === 'izquierda').reduce((sum, movement) => sum + movement.delta, 0);
      const right = legacyPairs + ledger.filter((movement) => movement.side === 'derecha').reduce((sum, movement) => sum + movement.delta, 0);
      const reservedLeft = reservedPieceQuantity(productReservations, piece.id, componentStockSizeId, 'izquierda');
      const reservedRight = reservedPieceQuantity(productReservations, piece.id, componentStockSizeId, 'derecha');
      if (legacy < 0 || left < reservedLeft || right < reservedRight) return tell('No puedes retirar ese stock: hay piezas reservadas para órdenes de este modelo.', 'error');
    } else {
      const reserved = reservedPieceQuantity(productReservations, piece.id, componentStockSizeId, null);
      if (getPieceStock(ledger, piece.id, componentStockSizeId) < reserved) return tell('No puedes retirar ese stock: hay piezas reservadas para órdenes de este modelo.', 'error');
    }
    setData((current) => ({ ...current, componentPieceMovements: [...current.componentPieceMovements, ...movements] }));
    setShowComponentPieceMovement(false);
    tell('Movimiento registrado en el inventario auxiliar de ' + product.name + '.');
  }

  function saveStock(event: FormEvent) {
    event.preventDefault();
    const variant = variantsBySupply.get(stockVariantId);
    const supply = variant ? supplies.find((x) => x.id === variant.supplyId) : undefined;
    const quantity = Number(stockQuantity);
    if (!variant || !supply || !Number.isFinite(quantity) || quantity <= 0 || (supply.baseUnit === 'und' && !Number.isInteger(quantity))) return tell('Selecciona una variante e ingresa una cantidad válida para su unidad de inventario.', 'error');
    if (supply.stockMode === 'none') return tell('Este insumo no controla inventario. Sus medidas se definen por talla dentro de cada modelo comercial.', 'info');
    if (variant.textileId) return tell('Esta variante utiliza el stock real de rollos. Registra sus entradas o consumos desde Inventario de rollos.', 'info');
    if (supply.stockMode === 'talla' && !stockSizeId) return tell('Selecciona la talla de este insumo.', 'error');
    const sizeId = supply.stockMode === 'talla' ? stockSizeId : null;
    const delta = stockDirection === 'entrada' ? quantity : -quantity;
    if (delta < 0 && stockForVariant(variant, sizeId) - reservedSupplyQuantity(variant.id, sizeId) < quantity) return tell('No puedes retirar esa cantidad: una parte del stock está reservada para órdenes de producción.', 'error');
    const movement: SupplyMovement = { id: id(), variantId: variant.id, sizeId, delta, kind: stockDirection, note: stockNote.trim(), date: now() };
    setData((current) => ({ ...current, supplyMovements: [...current.supplyMovements, movement] }));
    setShowStockForm(false); setStockQuantity(''); tell('Movimiento de insumo registrado.');
  }
  const purchasableVariants = variants.filter((variant) => !variant.textileId && supplies.some((supply) => supply.id === variant.supplyId && supply.active && supply.stockMode !== 'none'));
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
    const invalidFabricPiece = componentDraft.pieces.find((piece) => !isComponentFabricSlot(piece.fabricSlot));
    if (invalidFabricPiece) return tell('Selecciona una posición válida del patrón base para cada pieza auxiliar.', 'error');
    const invalidColorPiece = componentDraft.pieces.find((piece) => !isComponentColorSlot(normalizeComponentColorSlot(piece.colorSlot, piece.colorId)) || (piece.colorId && !textileContext.colores.some((color) => color.id === piece.colorId)));
    if (invalidColorPiece) return tell('Selecciona una posición de color válida para cada pieza auxiliar.', 'error');
    const removedStockedPiece = previous?.pieces.find((oldPiece) =>
      (data.componentPieceMovements.some((movement) => movement.pieceId === oldPiece.id) ||
        data.productionOrders.some((order) => order.componentPieces.some((line) => line.pieceId === oldPiece.id))) &&
      (!componentDraft.pieces.some((nextPiece) => nextPiece.id === oldPiece.id) ||
        componentDraft.pieces.find((nextPiece) => nextPiece.id === oldPiece.id)?.laterality !== oldPiece.laterality)
    );
    if (removedStockedPiece) return tell('No puedes quitar ni cambiar la lateralidad de "' + removedStockedPiece.name + '" porque ya tiene movimientos de inventario.', 'error');
    if (componentDraft.materials.some((x) => !variantsBySupply.has(x.variantId) || x.wastePercent < 0 || (x.mode === 'fixed' && (!Number.isFinite(x.fixedQuantity) || (x.fixedQuantity ?? -1) < 0)))) return tell('Revisa los materiales y sus consumos.', 'error');
    const row: GarmentComponent = {
      ...componentDraft,
      name: componentDraft.name.trim(),
      pieces: componentDraft.pieces.map((piece) => ({
        ...piece,
        fabricSlot: normalizeComponentFabricSlot(piece.fabricSlot, piece.textileId),
        colorSlot: normalizeComponentColorSlot(piece.colorSlot, piece.colorId),
        textileId: null,
      })),
      updatedAt: now(),
    };
    for (const product of data.productModels) {
      if (!product.components.some((selection) => selection.componentId === row.id)) continue;
      const basePattern = baseModels.find((model) => model.id === product.baseModelId);
      if (!basePattern) return tell('No se puede cambiar el componente: el modelo ' + product.name + ' no tiene un patrón base disponible.', 'error');
      const incompatiblePiece = row.pieces.find((piece) => !isComponentFabricSlotAvailableForModel(piece.fabricSlot, basePattern.secondaryFabricSlots ?? 0));
      if (incompatiblePiece) return tell('La pieza auxiliar "' + incompatiblePiece.name + '" usa ' + componentFabricSlotLabel(incompatiblePiece.fabricSlot) + ', pero el patrón base de "' + product.name + '" no tiene esa posición.', 'error');
      const incompatibleColorPiece = row.pieces.find((piece) => !isComponentColorSlotAvailableForModel(piece.colorSlot ?? 'cualquiera', basePattern.secondaryColorSlots ?? 0));
      if (incompatibleColorPiece) return tell('La pieza auxiliar "' + incompatibleColorPiece.name + '" usa ' + componentColorSlotLabel(incompatibleColorPiece.colorSlot ?? 'cualquiera') + ', pero el patrón base de "' + product.name + '" no tiene esa posición de color.', 'error');
    }
    const otherPieceIds = new Set(data.components.filter((component) => component.id !== row.id).flatMap((component) => component.pieces.map((piece) => piece.id)));
    const draftPieceIds = row.pieces.map((piece) => piece.id);
    if (new Set(draftPieceIds).size !== draftPieceIds.length || row.pieces.some((piece) => otherPieceIds.has(piece.id))) return tell('Cada pieza necesita un identificador propio. Vuelve a agregar la pieza duplicada.', 'error');
    setData((current) => ({ ...current, components: current.components.some((x) => x.id === row.id) ? current.components.map((x) => x.id === row.id ? row : x) : [...current.components, row] }));
    setComponentDraft(null);
    if (returnToProductAfterComponentCreate) {
      setProductComponentIds((current) => current.includes(row.id) ? current : [...current, row.id]);
      setReturnToProductAfterComponentCreate(false);
      onNavigate('modelos-producto');
      tell('Componente creado, añadido a la prenda y listo para continuar.');
      return;
    }
    tell('Componente guardado.');
  }
  function newComponent() {
    setComponentDraft({ id: id(), type: 'Cuello', name: '', description: '', imageUrl: '', active: true, pieces: [], materials: [], createdAt: now(), updatedAt: now() });
  }
  function createComponentFromProduct() {
    setReturnToProductAfterComponentCreate(true);
    newComponent();
    onNavigate('componentes');
  }
  function cancelComponentDraft() {
    setComponentDraft(null);
    if (returnToProductAfterComponentCreate) {
      setReturnToProductAfterComponentCreate(false);
      onNavigate('modelos-producto');
    }
  }
  function startSupplyCreationForPurchase() {
    setSupplyReturnToPurchase(true);
    setSupplyName(''); setSupplyCategory('Otros avíos'); setSupplyUnit('und'); setStockMode('total'); setSupplyDescription(''); setSupplyAttributes('');
    setShowSupplyForm(true);
    onNavigate('insumos');
  }
  function cancelSupplyCreation() {
    setShowSupplyForm(false);
    if (supplyReturnToPurchase) {
      setSupplyReturnToPurchase(false);
      setShowPurchaseForm(true);
      onNavigate('compras-avios');
    }
  }
  function cancelVariantCreation() {
    setShowVariantForm(false);
    if (supplyReturnToPurchase) {
      setSupplyReturnToPurchase(false);
      setShowPurchaseForm(true);
      onNavigate('compras-avios');
    }
  }
  function saveRecipe(event: FormEvent) {
    event.preventDefault();
    if (!recipeDraft || !recipeDraft.name.trim()) return tell('Escribe el nombre de la receta.', 'error');
    if (recipeDraft.materials.some((x) => !variantsBySupply.has(x.variantId))) return tell('Selecciona variantes válidas en todos los materiales.', 'error');
    const row = { ...recipeDraft, name: recipeDraft.name.trim(), updatedAt: now() };
    setData((current) => ({ ...current, familyRecipes: current.familyRecipes.some((x) => x.id === row.id) ? current.familyRecipes.map((x) => x.id === row.id ? row : x) : [...current.familyRecipes, row] }));
    setRecipeDraft(null); tell('Receta estándar guardada.');
  }
  function createProductCollection() {
    const cleanName = newProductCollectionName.trim();
    if (!cleanName) return tell('Escribe el nombre de la colección.', 'error');
    const existing = data.productCollections.find((item) => item.name.trim().toLocaleLowerCase('es') === cleanName.toLocaleLowerCase('es'));
    if (existing) {
      if (!existing.active) return tell('Ya existe una colección archivada con ese nombre. Recupera ese registro antes de reutilizarlo.', 'error');
      setProductCollectionId(existing.id);
      setShowProductCollectionCreator(false);
      setNewProductCollectionName('');
      return tell('La colección ya existía y quedó seleccionada.', 'info');
    }
    const timestamp = now();
    const collection: ProductCollection = { id: id(), name: cleanName, active: true, createdAt: timestamp, updatedAt: timestamp };
    setData((current) => ({ ...current, productCollections: [...current.productCollections, collection] }));
    setProductCollectionId(collection.id);
    setShowProductCollectionCreator(false);
    setNewProductCollectionName('');
    tell('Colección creada y seleccionada.');
  }

  function ensureProductTextileColorAssociation(textileId: string | null | undefined, colorId: string | null | undefined) {
    if (!textileId || !colorId) return;
    const rows = safeRead<TextileColorRow[]>(FABRIC_STORAGE_KEYS.telaColores, []);
    if (rows.some((row) => row.idTela === textileId && row.idColor === colorId)) return;
    const timestamp = now();
    const row: TextileColorRow = { id: id(), idTela: textileId, idColor: colorId, hexadecimal: null, cmykC: null, cmykM: null, cmykY: null, cmykK: null, activo: true, createdAt: timestamp, updatedAt: timestamp };
    const next = [...rows, row];
    localStorage.setItem(FABRIC_STORAGE_KEYS.telaColores, JSON.stringify(next));
    setTextileContext((current) => ({ ...current, telaColores: next }));
    window.dispatchEvent(new Event('telastock-fabric-data-updated'));
  }

  function saveProduct(event: FormEvent) {
    event.preventDefault();
    const selectedBaseModel = baseModels.find((x) => x.id === productBaseId);
    const selectedCollection = data.productCollections.find((x) => x.id === productCollectionId && x.active);
    if (!productName.trim() || !selectedBaseModel) return tell('Completa el nombre y selecciona un patrón base existente.', 'error');
    if (!selectedCollection) return tell('Selecciona una colección guardada o crea una nueva antes de guardar el modelo.', 'error');
    if (!selectedBaseModel.family) return tell('El patrón base no tiene familia asignada. Edítalo en Modelos antes de crear el modelo comercial.', 'error');
    if (data.productModels.some((x) => x.name.toLocaleLowerCase('es') === productName.trim().toLocaleLowerCase('es'))) return tell('Ya existe un modelo configurado con ese nombre.', 'error');

    const requiredFabricSlots = productFabricSlotsForBaseModel(selectedBaseModel);
    const selectedComponents = data.components.filter((component) => component.active && productComponentIds.includes(component.id));
    const requiredColorSlots = productColorSlotsForConfiguredModel(selectedBaseModel.id, basePieces, selectedComponents);
    const activeTextileIds = new Set(textileContext.telas.filter((textile) => textile.activo !== false).map((textile) => textile.id));
    const activeColorIds = new Set(textileContext.colores.map((color) => color.id));
    const missingSlots = requiredFabricSlots.filter((slot) => !activeTextileIds.has(productFabricAssignments[slot] ?? ''));
    if (missingSlots.length > 0) return tell('Asigna una tela del catálogo a: ' + missingSlots.map(productFabricSlotLabel).join(', ') + '.', 'error');
    const missingColorSlots = requiredColorSlots.filter((slot) => !activeColorIds.has(productColorAssignments[slot] ?? ''));
    if (missingColorSlots.length > 0) return tell('Asigna un color del catálogo a: ' + missingColorSlots.map(productColorSlotLabel).join(', ') + '.', 'error');

    const baseWildcardPieces = basePieces.filter((piece) => piece.modelId === selectedBaseModel.id && !piece.archived).filter((piece) =>
      (piece.fabricSlot ?? 'principal') === 'cualquiera' || (piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna')) === 'cualquiera'
    );
    const basePieceOverrides: Record<string, ProductPieceOverride> = {};
    for (const piece of baseWildcardPieces) {
      const key = 'base:' + piece.id;
      const selection = productPieceOverrides[key] ?? { textileId: null, colorId: null };
      const needsTextile = (piece.fabricSlot ?? 'principal') === 'cualquiera';
      const needsColor = (piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna')) === 'cualquiera';
      if (needsTextile && !activeTextileIds.has(selection.textileId ?? '')) return tell('El molde "' + piece.name + '" necesita una tela concreta porque está definido como Cualquier tela.', 'error');
      if (needsColor && !activeColorIds.has(selection.colorId ?? '')) return tell('El molde "' + piece.name + '" necesita un color concreto porque está definido como Cualquier color.', 'error');
      basePieceOverrides[piece.id] = { textileId: needsTextile ? selection.textileId : null, colorId: needsColor ? selection.colorId : null };
    }

    for (const component of selectedComponents) {
      const incompatiblePiece = component.pieces.find((piece) => !isComponentFabricSlotAvailableForModel(piece.fabricSlot, selectedBaseModel.secondaryFabricSlots ?? 0));
      if (incompatiblePiece) return tell('El componente "' + component.name + '" tiene la pieza "' + incompatiblePiece.name + '" vinculada a ' + componentFabricSlotLabel(incompatiblePiece.fabricSlot) + ', pero el patrón base "' + selectedBaseModel.name + '" no define esa posición. Añade esa tela secundaria al patrón base o cambia la posición de la pieza.', 'error');
      const incompatibleColorPiece = component.pieces.find((piece) => !isComponentColorSlotAvailableForModel(piece.colorSlot ?? (piece.colorId ? 'principal' : 'cualquiera'), selectedBaseModel.secondaryColorSlots ?? 0));
      if (incompatibleColorPiece) return tell('El componente "' + component.name + '" tiene la pieza "' + incompatibleColorPiece.name + '" vinculada a ' + componentColorSlotLabel(incompatibleColorPiece.colorSlot ?? 'cualquiera') + ', pero el patrón base "' + selectedBaseModel.name + '" no define esa posición de color.', 'error');
      for (const piece of component.pieces) {
        const fabricSlot = piece.fabricSlot;
        const colorSlot = piece.colorSlot ?? (piece.colorId ? 'principal' : 'cualquiera');
        const needsTextile = fabricSlot === 'cualquiera';
        const needsColor = colorSlot === 'cualquiera';
        if (!needsTextile && !needsColor) continue;
        const selection = productPieceOverrides[component.id + ':' + piece.id] ?? { textileId: null, colorId: null };
        if (needsTextile && !activeTextileIds.has(selection.textileId ?? '')) return tell(component.name + ' · ' + piece.name + ': selecciona la tela concreta para esta pieza comodín.', 'error');
        if (needsColor && !activeColorIds.has(selection.colorId ?? '')) return tell(component.name + ' · ' + piece.name + ': selecciona el color concreto para esta pieza comodín.', 'error');
      }
    }

    const productSizes = basePatternSizeOptions(selectedBaseModel);
    const componentSelections: ProductComponentSelection[] = [];
    for (const component of selectedComponents) {
      const materialSpecifications: Record<string, SizeSpecification> = {};
      const pieceOverrides: Record<string, ProductPieceOverride> = {};
      for (const piece of component.pieces) {
        const needsTextile = piece.fabricSlot === 'cualquiera';
        const colorSlot = piece.colorSlot ?? (piece.colorId ? 'principal' : 'cualquiera');
        const needsColor = colorSlot === 'cualquiera';
        if (needsTextile || needsColor) {
          const selection = productPieceOverrides[component.id + ':' + piece.id] ?? { textileId: null, colorId: null };
          pieceOverrides[piece.id] = { textileId: needsTextile ? selection.textileId : null, colorId: needsColor ? selection.colorId : null };
        }
      }
      for (const material of component.materials.filter((item) => item.specificationLabel?.trim())) {
        const draft = productMaterialSpecsDraft[material.id];
        if (!draft || !draft.label.trim()) return tell(component.name + ' · ' + variantLabel(variantsBySupply.get(material.variantId)!, data.variants, supplies) + ': indica el nombre de la característica por talla.', 'error');
        try {
          const mapped = mapSizeSpecificationRules(draft.rules, productSizes.map((size) => size.id));
          materialSpecifications[material.id] = { label: draft.label.trim(), bySize: mapped.bySize };
        } catch (error) {
          return tell(component.name + ' · ' + (supplies.find((supply) => supply.id === variantsBySupply.get(material.variantId)?.supplyId)?.name ?? 'Material') + ': ' + (error instanceof Error ? error.message : 'revisa sus grupos de tallas.'), 'error');
        }
      }
      componentSelections.push({
        id: id(), componentId: component.id, quantity: 1, location: '', variantOverrides: {},
        materialSpecifications, pieceOverrides,
      });
    }

    // Ensure every concrete textile/color pair used by this product has a textile-specific color variant.
    basePieces.filter((piece) => piece.modelId === selectedBaseModel.id && !piece.archived).forEach((piece) => {
      const fabricSlot = piece.fabricSlot ?? 'principal';
      const colorSlot = piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna');
      const override = basePieceOverrides[piece.id];
      const textileId = fabricSlot === 'cualquiera' ? override?.textileId : productFabricAssignments[fabricSlot];
      const colorId = colorSlot === 'cualquiera' ? override?.colorId : colorSlot === 'ninguna' ? null : productColorAssignments[colorSlot];
      ensureProductTextileColorAssociation(textileId, colorId);
    });
    selectedComponents.forEach((component) => component.pieces.forEach((piece) => {
      const slot = piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna');
      const override = productPieceOverrides[component.id + ':' + piece.id];
      const textileId = piece.fabricSlot === 'cualquiera' ? override?.textileId : piece.fabricSlot === 'ninguna' ? null : productFabricAssignments[piece.fabricSlot];
      const colorId = slot === 'cualquiera' ? override?.colorId : slot === 'ninguna' ? null : productColorAssignments[slot];
      ensureProductTextileColorAssociation(textileId, colorId);
    }));
    const timestamp = now();
    const row: ConfiguredProductModel = {
      id: id(), name: productName.trim(), collectionId: selectedCollection.id, baseModelId: productBaseId, description: productDescription.trim(),
      components: componentSelections,
      additionalMaterials: [], basePieceOverrides, active: true, createdAt: timestamp, updatedAt: timestamp,
    };
    const fabricRows: ProductFabricAssignment[] = requiredFabricSlots.map((fabricSlot) => ({
      id: id(), productModelId: row.id, fabricSlot, textileId: productFabricAssignments[fabricSlot], createdAt: timestamp, updatedAt: timestamp,
    }));
    const colorRows: ProductColorAssignment[] = requiredColorSlots.map((colorSlot) => ({
      id: id(), productModelId: row.id, colorSlot, colorId: productColorAssignments[colorSlot], createdAt: timestamp, updatedAt: timestamp,
    }));
    setData((current) => ({
      ...current,
      productModels: [...current.productModels, row],
      productFabrics: [...current.productFabrics, ...fabricRows],
      productColors: [...current.productColors, ...colorRows],
    }));
    setSelectedProductId(row.id); setSelectedStockProductModelId(row.id); setProductName(''); setProductCollectionId(''); setShowProductCollectionCreator(false); setNewProductCollectionName(''); setProductBaseId(''); setProductFabricAssignments({}); setProductColorAssignments({}); setProductPieceOverrides({}); setProductDescription(''); setProductComponentIds([]); setProductMaterialSpecsDraft({});
    tell('Modelo configurado guardado con sus telas y colores definitivos.');
  }

  function openProductFabricEditor(product: ConfiguredProductModel) {
    const base = baseModels.find((model) => model.id === product.baseModelId);
    if (!base) return tell('No se encontró el patrón base de este modelo.', 'error');
    const slots = productFabricSlotsForBaseModel(base);
    const selected = Object.fromEntries(slots.map((slot) => [
      slot,
      data.productFabrics.find((assignment) => assignment.productModelId === product.id && assignment.fabricSlot === slot)?.textileId ?? '',
    ]));
    setEditingProductFabricId(product.id);
    setEditingProductFabricAssignments(selected);
  }

  function saveProductFabricEditor(event: FormEvent) {
    event.preventDefault();
    const product = data.productModels.find((item) => item.id === editingProductFabricId && item.active);
    const base = product ? baseModels.find((model) => model.id === product.baseModelId) : undefined;
    if (!product || !base) return tell('No se encontró el modelo o su patrón base.', 'error');
    const slots = productFabricSlotsForBaseModel(base);
    const activeTextileIds = new Set(textileContext.telas.filter((textile) => textile.activo !== false).map((textile) => textile.id));
    const missingSlots = slots.filter((slot) => !activeTextileIds.has(editingProductFabricAssignments[slot] ?? ''));
    if (missingSlots.length > 0) return tell('Asigna una tela del catálogo a: ' + missingSlots.map(productFabricSlotLabel).join(', ') + '.', 'error');
    const timestamp = now();
    const rows: ProductFabricAssignment[] = slots.map((fabricSlot) => ({
      id: id(), productModelId: product.id, fabricSlot, textileId: editingProductFabricAssignments[fabricSlot], createdAt: timestamp, updatedAt: timestamp,
    }));
    setData((current) => ({
      ...current,
      productModels: current.productModels.map((item) => item.id === product.id ? { ...item, updatedAt: timestamp } : item),
      productFabrics: [...current.productFabrics.filter((item) => item.productModelId !== product.id), ...rows],
    }));
    setEditingProductFabricId('');
    setEditingProductFabricAssignments({});
    tell('Telas del modelo actualizadas.');
  }

  function addComponentToPieceConfiguration(productModelId: string, componentId: string) {
    const product = data.productModels.find((item) => item.id === productModelId && item.active);
    const base = product ? baseModels.find((item) => item.id === product.baseModelId) : undefined;
    const component = data.components.find((item) => item.id === componentId && item.active);
    if (!product || !base || !component) return tell('No se encontró el modelo o el componente seleccionado.', 'error');
    if (product.components.some((selection) => selection.componentId === component.id)) return tell('Este componente ya está asociado al modelo.', 'error');
    if (component.pieces.length === 0) return tell('Este componente todavía no tiene piezas auxiliares. Completa sus moldes en la biblioteca de componentes antes de incorporarlo.', 'error');
    const incompatibleFabricPiece = component.pieces.find((piece) => !isComponentFabricSlotAvailableForModel(piece.fabricSlot, base.secondaryFabricSlots ?? 0));
    if (incompatibleFabricPiece) return tell('La pieza «' + incompatibleFabricPiece.name + '» usa ' + componentFabricSlotLabel(incompatibleFabricPiece.fabricSlot) + ', una posición que no existe en el patrón base. Ajusta el patrón o el componente antes de incorporarlo.', 'error');
    const incompatibleColorPiece = component.pieces.find((piece) => !isComponentColorSlotAvailableForModel(piece.colorSlot ?? (piece.colorId ? 'principal' : 'cualquiera'), base.secondaryColorSlots ?? 0));
    if (incompatibleColorPiece) return tell('La pieza «' + incompatibleColorPiece.name + '» usa ' + componentColorSlotLabel(incompatibleColorPiece.colorSlot ?? 'cualquiera') + ', una posición que no existe en el patrón base.', 'error');
    const sizeSpecificMaterial = component.materials.find((material) => material.specificationLabel?.trim());
    if (sizeSpecificMaterial) return tell('Este componente requiere configurar «' + sizeSpecificMaterial.specificationLabel + '» por talla. Incorpóralo durante la configuración completa del modelo para definir esas medidas antes de producir.', 'error');
    const selection: ProductComponentSelection = {
      id: id(),
      componentId: component.id,
      quantity: 1,
      location: '',
      variantOverrides: {},
      materialSpecifications: {},
      pieceOverrides: {},
    };
    setData((current) => ({
      ...current,
      productModels: current.productModels.map((item) => item.id === product.id
        ? { ...item, components: [...item.components, selection], updatedAt: now() }
        : item),
    }));
    setComponentToAddInPieceConfiguration('');
    tell('Componente «' + component.name + '» añadido. Ahora puedes asignar la tela y el color de cada pieza en esta vista.');
  }

  function updateProductPieceOverride(
    productModelId: string,
    scope: 'base' | 'component',
    selectionId: string,
    pieceId: string,
    field: ProductPieceOverrideField,
    value: string | null | undefined,
  ) {
    setData((current) => ({
      ...current,
      productModels: current.productModels.map((product) => {
        if (product.id !== productModelId) return product;
        const updateRecord = (source: Record<string, ProductPieceOverride> | undefined) => {
          const next = { ...(source ?? {}) };
          const override = { ...(next[pieceId] ?? {}) };
          if (value === undefined) delete override[field];
          else override[field] = value;
          if (Object.keys(override).length > 0) next[pieceId] = override;
          else delete next[pieceId];
          return Object.keys(next).length > 0 ? next : undefined;
        };
        if (scope === 'base') {
          return {
            ...product,
            basePieceOverrides: updateRecord(product.basePieceOverrides),
            updatedAt: now(),
          };
        }
        return {
          ...product,
          components: product.components.map((selection) => selection.id === selectionId
            ? { ...selection, pieceOverrides: updateRecord(selection.pieceOverrides) }
            : selection),
          updatedAt: now(),
        };
      }),
    }));
  }

  function openProductColorEditor(product: ConfiguredProductModel) {
    const base = baseModels.find((model) => model.id === product.baseModelId);
    if (!base) return tell('No se encontró el patrón base de este modelo.', 'error');
    const productComponents = product.components.flatMap((selection) => {
      const component = data.components.find((item) => item.id === selection.componentId && item.active);
      return component ? [component] : [];
    });
    const slots = productColorSlotsForConfiguredModel(base.id, basePieces, productComponents);
    if (slots.length === 0) return tell('Este modelo no necesita posiciones de color compartidas. Los colores «Cualquier color» se asignaron por pieza.', 'info');
    const selected = Object.fromEntries(slots.map((slot) => [
      slot,
      data.productColors.find((assignment) => assignment.productModelId === product.id && assignment.colorSlot === slot)?.colorId ?? '',
    ]));
    setEditingProductColorId(product.id);
    setEditingProductColorAssignments(selected);
  }

  function saveProductColorEditor(event: FormEvent) {
    event.preventDefault();
    const product = data.productModels.find((item) => item.id === editingProductColorId && item.active);
    const base = product ? baseModels.find((model) => model.id === product.baseModelId) : undefined;
    if (!product || !base) return tell('No se encontró el modelo o su patrón base.', 'error');
    const productComponents = product.components.flatMap((selection) => {
      const component = data.components.find((item) => item.id === selection.componentId && item.active);
      return component ? [component] : [];
    });
    const slots = productColorSlotsForConfiguredModel(base.id, basePieces, productComponents);
    const activeColorIds = new Set(textileContext.colores.map((color) => color.id));
    const missing = slots.filter((slot) => !activeColorIds.has(editingProductColorAssignments[slot] ?? ''));
    if (missing.length > 0) return tell('Asigna un color del catálogo a: ' + missing.map(productColorSlotLabel).join(', ') + '.', 'error');
    const timestamp = now();
    const rows: ProductColorAssignment[] = slots.map((colorSlot) => ({
      id: id(), productModelId: product.id, colorSlot, colorId: editingProductColorAssignments[colorSlot], createdAt: timestamp, updatedAt: timestamp,
    }));
    const preservedUnusedRows = data.productColors.filter((item) => item.productModelId === product.id && !slots.includes(item.colorSlot));
    const basePiecesForProduct = basePieces.filter((piece) => piece.modelId === base.id && !piece.archived);
    basePiecesForProduct.forEach((piece) => {
      const colorSlot = piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna');
      const override = product.basePieceOverrides?.[piece.id];
      const textileId = piece.fabricSlot === 'cualquiera' ? override?.textileId : data.productFabrics.find((assignment) => assignment.productModelId === product.id && assignment.fabricSlot === (piece.fabricSlot ?? 'principal'))?.textileId;
      const colorId = colorSlot === 'cualquiera' ? override?.colorId : colorSlot === 'ninguna' ? null : editingProductColorAssignments[colorSlot];
      ensureProductTextileColorAssociation(textileId, colorId);
    });
    product.components.forEach((selection) => {
      const component = data.components.find((item) => item.id === selection.componentId);
      component?.pieces.forEach((piece) => {
        const colorSlot = piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna');
        const override = selection.pieceOverrides?.[piece.id];
        const textileId = piece.fabricSlot === 'cualquiera' ? override?.textileId : piece.fabricSlot === 'ninguna' ? null : data.productFabrics.find((assignment) => assignment.productModelId === product.id && assignment.fabricSlot === piece.fabricSlot)?.textileId;
        const colorId = colorSlot === 'cualquiera' ? override?.colorId : colorSlot === 'ninguna' ? null : editingProductColorAssignments[colorSlot];
        ensureProductTextileColorAssociation(textileId, colorId);
      });
    });
    setData((current) => ({
      ...current,
      productModels: current.productModels.map((item) => item.id === product.id ? { ...item, updatedAt: timestamp } : item),
      productColors: [...current.productColors.filter((item) => item.productModelId !== product.id), ...preservedUnusedRows, ...rows],
    }));
    setEditingProductColorId('');
    setEditingProductColorAssignments({});
    tell('Colores del modelo actualizados.');
  }

  function openQuickProductColor(slot: string, scope: 'new' | 'edit' = 'new') {
    setQuickProductColorSlot(scope + ':' + slot);
    setQuickProductColorName('');
  }

  function saveQuickProductColor(event: FormEvent) {
    event.preventDefault();
    if (!quickProductColorSlot) return;
    try {
      const color = createGlobalColorQuickly(quickProductColorName);
      refreshTextiles();
      const separator = quickProductColorSlot.indexOf(':');
      const scope = quickProductColorSlot.slice(0, separator);
      const slot = quickProductColorSlot.slice(separator + 1);
      if (scope === 'edit') setEditingProductColorAssignments((current) => ({ ...current, [slot]: color.id }));
      else setProductColorAssignments((current) => ({ ...current, [slot]: color.id }));
      setQuickProductColorSlot('');
      setQuickProductColorName('');
      tell('Color creado y asignado a la posición del modelo.');
    } catch (error) {
      tell(error instanceof Error ? error.message : 'No se pudo crear el color.', 'error');
    }
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
    setComponentDraft(component ? { ...component, pieces: component.pieces.map((x) => ({ ...x, fabricSlot: normalizeComponentFabricSlot(x.fabricSlot, x.textileId), colorSlot: normalizeComponentColorSlot(x.colorSlot, x.colorId), textileId: null, colorId: x.colorId ?? null })), materials: component.materials.map((x) => ({ ...x, bySize: { ...x.bySize } })) } : null);
  }

  const textileName = (textileId: string | null | undefined) => textileId ? textileContext.telas.find((x) => x.id === textileId)?.nombreTela ?? '' : 'Ninguna';
  const componentColorName = (colorId: string | null | undefined) => colorId ? textileContext.colores.find((x) => x.id === colorId)?.nombre ?? 'Color no disponible' : 'Sin color';
  const selectedProductBasePattern = baseModels.find((model) => model.id === productBaseId);
  const selectedProductFabricSlots = selectedProductBasePattern ? productFabricSlotsForBaseModel(selectedProductBasePattern) : [];
  const selectedProductComponents = data.components.filter((component) => component.active && productComponentIds.includes(component.id));
  const selectedProductColorSlots = selectedProductBasePattern ? productColorSlotsForConfiguredModel(selectedProductBasePattern.id, basePieces, selectedProductComponents) : [];
  const selectedProductBaseSizes = basePatternSizeOptions(selectedProductBasePattern);
  const selectedProductBaseWildcardPieces = selectedProductBasePattern ? basePieces.filter((piece) => piece.modelId === selectedProductBasePattern.id && !piece.archived && (piece.fabricSlot === 'cualquiera' || piece.colorSlot === 'cualquiera')) : [];
  const selectedProductComponentWildcardPieces = selectedProductComponents.flatMap((component) => component.pieces.filter((piece) => piece.fabricSlot === 'cualquiera' || (piece.colorSlot ?? (piece.colorId ? 'principal' : 'cualquiera')) === 'cualquiera').map((piece) => ({ component, piece })));
  const selectedProductMaterialRows = data.components.filter((component) => component.active && productComponentIds.includes(component.id)).flatMap((component) => component.materials.filter((material) => Boolean(material.specificationLabel?.trim())).map((material) => ({ component, material })));
  const activeTextiles = textileContext.telas.filter((textile) => textile.activo !== false).slice().sort((a, b) => a.nombreTela.localeCompare(b.nombreTela, 'es'));
  const editingFabricProduct = data.productModels.find((product) => product.id === editingProductFabricId);
  const editingFabricBasePattern = editingFabricProduct ? baseModels.find((model) => model.id === editingFabricProduct.baseModelId) : undefined;
  const editingFabricSlots = editingFabricBasePattern ? productFabricSlotsForBaseModel(editingFabricBasePattern) : [];
  const editingColorProduct = data.productModels.find((product) => product.id === editingProductColorId);
  const editingColorBasePattern = editingColorProduct ? baseModels.find((model) => model.id === editingColorProduct.baseModelId) : undefined;
  const editingColorComponents = editingColorProduct ? editingColorProduct.components.flatMap((selection) => {
    const component = data.components.find((item) => item.id === selection.componentId && item.active);
    return component ? [component] : [];
  }) : [];
  const editingColorSlots = editingColorBasePattern ? productColorSlotsForConfiguredModel(editingColorBasePattern.id, basePieces, editingColorComponents) : [];
  const textileColorOptions = textileContext.telaColores.filter((x) => x.idTela === variantTextileId && x.activo);
  const activeProduct = data.productModels.find((x) => x.id === selectedProductId && x.active);
  const selectedStockProductModel = data.productModels.find((x) => x.id === selectedStockProductModelId && x.active);
  const selectedStockProductSizes = selectedStockProductModel ? productSizeOptions(selectedStockProductModel) : [];
  const selectedStockComponent = selectedStockProductModel?.components.some((selection) => selection.componentId === selectedStockComponentId)
    ? data.components.find((component) => component.id === selectedStockComponentId && component.active)
    : undefined;
  const selectedComponentStockPiece = selectedStockComponent?.pieces.find((x) => x.id === componentStockPieceId);
  function getProductFabricableCapacity(product: ConfiguredProductModel, sizeId: string) {
    const baseModel = baseModels.find((item) => item.id === product.baseModelId);
    const baseModelPieces = basePieces.filter((piece) => piece.modelId === product.baseModelId && !piece.archived);
    const productReservations = ordersHoldingStock.filter((order) => order.productModelId === product.id);
    const reservedBase = productReservations.flatMap((order) => order.basePieces).filter((line) => line.sizeId === sizeId);
    const effectiveBaseLedger: DomainPieceMovement[] = [
      ...data.productBasePieceMovements.filter((movement) => movement.productModelId === product.id && movement.sizeId === sizeId),
      ...reservedBase.map((line) => ({ id: line.id, pieceId: line.pieceId, sizeId: line.sizeId, delta: -line.quantity, kind: 'salida' as const, side: line.side ?? undefined, note: 'Reserva de orden de producción', date: '' })),
    ];
    const baseCapacity = baseModel ? getCompleteUnits(baseModelPieces, effectiveBaseLedger, sizeId) : 0;
    let componentCapacity = Number.POSITIVE_INFINITY;
    let limitingComponent = '';
    product.components.forEach((selection) => {
      const component = data.components.find((item) => item.id === selection.componentId && item.active);
      if (!component || component.pieces.length === 0) return;
      let currentComponentCapacity = Number.POSITIVE_INFINITY;
      component.pieces.forEach((piece) => {
        const reserved = productReservations.flatMap((order) => order.componentPieces)
          .filter((line) => line.productModelId === product.id && line.pieceId === piece.id && line.sizeId === sizeId);
        const ledger: DomainPieceMovement[] = [
          ...componentPieceDomainLedger(product.id, piece.id, sizeId),
          ...reserved.map((line) => ({ id: line.id, pieceId: line.pieceId, sizeId: line.sizeId, delta: -line.quantity, kind: 'salida' as const, side: line.side ?? undefined, note: 'Reserva de orden de producción', date: '' })),
        ];
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
  const holdingStatuses: ProductionOrderStatus[] = ['reservada', 'en_proceso'];
  const ordersHoldingStock = data.productionOrders.filter((order) => holdingStatuses.includes(order.status));

  function productBasePieceDomainLedger(productModelId: string, pieceId: string, sizeId: string): DomainPieceMovement[] {
    return data.productBasePieceMovements.filter((movement) =>
      movement.productModelId === productModelId && movement.pieceId === pieceId && movement.sizeId === sizeId
    ).map((movement) => ({
      id: movement.id, pieceId: movement.pieceId, sizeId: movement.sizeId, delta: movement.delta,
      kind: movement.kind, side: movement.side, note: movement.note, date: movement.date,
    }));
  }

  function productInventoryPieces(product: ConfiguredProductModel): ProductInventoryPiece[] {
    const basePiecesForProduct = basePieces.filter((piece) => piece.modelId === product.baseModelId && !piece.archived);
    const baseRows: ProductInventoryPiece[] = basePiecesForProduct.map((piece) => {
      const override = product.basePieceOverrides?.[piece.id];
      const hasTextileOverride = Boolean(override && Object.prototype.hasOwnProperty.call(override, 'textileId'));
      const hasColorOverride = Boolean(override && Object.prototype.hasOwnProperty.call(override, 'colorId'));
      const fabricSlot = piece.fabricSlot ?? 'principal';
      const colorSlot = normalizeComponentColorSlot(piece.colorSlot, piece.colorId);
      const textileId = hasTextileOverride ? override?.textileId ?? null : fabricSlot === 'cualquiera' || fabricSlot === 'ninguna' ? null
        : data.productFabrics.find((assignment) => assignment.productModelId === product.id && assignment.fabricSlot === fabricSlot)?.textileId ?? null;
      const colorId = hasColorOverride ? override?.colorId ?? null : colorSlot === 'cualquiera' ? null
        : colorSlot === 'ninguna' ? piece.colorId ?? null : resolveComponentPieceColorId(product.id, colorSlot, data.productColors);
      const textile = textileId ? textileContext.telas.find((item) => item.id === textileId) : undefined;
      return {
        ...piece,
        scope: 'base',
        sourcePieceId: piece.id,
        selectionId: null,
        componentId: null,
        componentName: 'Molde base',
        textileName: textile?.nombreTela ?? (fabricSlot === 'ninguna' ? 'Sin tela definida' : 'Sin asignar'),
        colorName: colorId ? componentColorName(colorId) : (colorSlot === 'ninguna' ? 'Sin color' : 'Sin asignar'),
      };
    });
    const componentRows: ProductInventoryPiece[] = product.components.flatMap((selection) => {
      const component = data.components.find((item) => item.id === selection.componentId && item.active);
      if (!component) return [];
      return component.pieces.map((piece) => {
        const override = selection.pieceOverrides?.[piece.id];
        const hasTextileOverride = Boolean(override && Object.prototype.hasOwnProperty.call(override, 'textileId'));
        const hasColorOverride = Boolean(override && Object.prototype.hasOwnProperty.call(override, 'colorId'));
        const colorSlot = normalizeComponentColorSlot(piece.colorSlot, piece.colorId);
        const textileId = hasTextileOverride ? override?.textileId ?? null
          : piece.fabricSlot === 'ninguna' || piece.fabricSlot === 'cualquiera' ? null
          : resolveComponentPieceTextileId(product.id, piece.fabricSlot, data.productFabrics);
        const colorId = hasColorOverride ? override?.colorId ?? null : colorSlot === 'cualquiera' ? null
          : colorSlot === 'ninguna' ? piece.colorId : resolveComponentPieceColorId(product.id, colorSlot, data.productColors);
        const textile = textileId ? textileContext.telas.find((item) => item.id === textileId) : undefined;
        return {
          id: 'component:' + selection.id + ':' + piece.id,
          sourcePieceId: piece.id,
          selectionId: selection.id,
          modelId: product.baseModelId,
          name: piece.name,
          unitsPerGarment: piece.unitsPerGarment * selection.quantity,
          laterality: piece.laterality,
          sortOrder: 100000 + component.pieces.indexOf(piece),
          fabricSlot: piece.fabricSlot,
          colorSlot,
          colorId,
          fabricType: textile?.nombreTela ?? (piece.fabricSlot === 'ninguna' ? 'Sin tela definida' : 'Sin asignar'),
          color: colorId ? componentColorName(colorId) : (colorSlot === 'ninguna' ? 'Sin color' : 'Sin asignar'),
          scope: 'component' as const,
          componentId: component.id,
          componentName: component.name,
          textileName: textile?.nombreTela ?? (piece.fabricSlot === 'ninguna' ? 'Sin tela definida' : 'Sin asignar'),
          colorName: colorId ? componentColorName(colorId) : (colorSlot === 'ninguna' ? 'Sin color' : 'Sin asignar'),
        };
      });
    });
    return [...baseRows, ...componentRows];
  }

  function productPieceDomainLedger(productModelId: string, piece: ProductInventoryPiece, sizeId: string): DomainPieceMovement[] {
    if (piece.scope === 'base') return productBasePieceDomainLedger(productModelId, piece.sourcePieceId, sizeId);
    return data.componentPieceMovements.filter((movement) =>
      movement.productModelId === productModelId && movement.componentId === piece.componentId &&
      movement.pieceId === piece.sourcePieceId && movement.sizeId === sizeId
    ).map((movement) => ({
      id: movement.id, pieceId: piece.id, sizeId: movement.sizeId, delta: movement.delta,
      kind: movement.kind, side: movement.side, note: movement.note, date: movement.date,
    }));
  }

  function productInventoryDomainLedger(product: ConfiguredProductModel, pieces: ProductInventoryPiece[], sizeId: string): DomainPieceMovement[] {
    return pieces.flatMap((piece) => productPieceDomainLedger(product.id, piece, sizeId));
  }

  function productInventoryEffectiveLedger(product: ConfiguredProductModel, pieces: ProductInventoryPiece[], sizeId: string): DomainPieceMovement[] {
    const ledger = productInventoryDomainLedger(product, pieces, sizeId);
    const activeOrders = ordersHoldingStock.filter((order) => order.productModelId === product.id);
    for (const order of activeOrders) {
      for (const line of order.basePieces.filter((item) => item.sizeId === sizeId)) {
        ledger.push({ id: 'reserved:' + line.id, pieceId: line.pieceId, sizeId, delta: -line.quantity, kind: 'salida', side: line.side ?? undefined, note: 'Reserva de orden', date: '' });
      }
      for (const line of order.componentPieces.filter((item) => item.sizeId === sizeId)) {
        const selection = product.components.find((item) => item.componentId === line.componentId);
        const piece = pieces.find((item) => item.scope === 'component' && item.selectionId === selection?.id && item.sourcePieceId === line.pieceId);
        if (piece) ledger.push({ id: 'reserved:' + line.id, pieceId: piece.id, sizeId, delta: -line.quantity, kind: 'salida', side: line.side ?? undefined, note: 'Reserva de orden', date: '' });
      }
    }
    return ledger;
  }

  function unassignedLegacyBaseMovements(product: ConfiguredProductModel): DomainPieceMovement[] {
    const pieceIds = new Set(basePieces.filter((piece) => piece.modelId === product.baseModelId && !piece.archived).map((piece) => piece.id));
    const importedIds = new Set(data.productBasePieceMovements.map((movement) => movement.sourceMovementId).filter((value): value is string => Boolean(value)));
    const ordersById = new Map(data.productionOrders.map((order) => [order.id, order]));
    return baseMovements.filter((movement) => {
      if (!pieceIds.has(movement.pieceId) || importedIds.has(movement.id)) return false;
      // Historical order consumption already has a reliable commercial owner.
      // Never offer it to another product that merely reuses the same pattern.
      const sourceOrder = movement.sourceProductionOrderId ? ordersById.get(movement.sourceProductionOrderId) : undefined;
      return !sourceOrder || sourceOrder.productModelId === product.id;
    });
  }

  function importLegacyBaseStock(product: ConfiguredProductModel) {
    const legacy = unassignedLegacyBaseMovements(product);
    if (legacy.length === 0) return tell('No hay movimientos históricos pendientes de asignar para este modelo.', 'info');
    const linkedToOrders = legacy.filter((movement) => movement.sourceProductionOrderId && data.productionOrders.some((order) => order.id === movement.sourceProductionOrderId && order.productModelId === product.id)).length;
    const manualEntries = legacy.length - linkedToOrders;
    const baseName = baseModels.find((model) => model.id === product.baseModelId)?.name ?? 'Patrón base';
    const confirmed = window.confirm(
      'Se asignarán ' + legacy.length + ' movimientos históricos de «' + baseName + '» al modelo comercial «' + product.name + '».\n\n' +
      linkedToOrders + ' movimiento(s) se reconocen por sus órdenes de producción de este modelo. ' +
      manualEntries + ' movimiento(s) sin modelo de origen se asignarán manualmente al modelo seleccionado.\n\n' +
      'No se copiarán los movimientos asociados a órdenes de otros modelos. Los registros originales se conservarán y no se borrarán.\n\n¿Continuar?'
    );
    if (!confirmed) return;
    const imported: ProductBasePieceMovement[] = legacy.map((movement) => ({
      id: id(), productModelId: product.id, pieceId: movement.pieceId, sizeId: movement.sizeId,
      delta: movement.delta, kind: movement.kind, side: movement.side, note: movement.note,
      date: movement.date, sourceMovementId: movement.id, sourceProductionOrderId: movement.sourceProductionOrderId ?? null,
    }));
    setData((current) => ({
      ...current,
      productBasePieceMovements: [...current.productBasePieceMovements, ...imported],
    }));
    tell('Stock histórico asignado a ' + product.name + '. Los movimientos de órdenes de otros modelos permanecen separados.');
  }

  const activeInventoryProducts = data.productModels.filter((product) => product.active);
  const inventoryProductSummaries = activeInventoryProducts.map((product) => {
    const base = baseModels.find((model) => model.id === product.baseModelId);
    const productPieces = productInventoryPieces(product);
    const productSizes = productSizeOptions(product);
    const hasStock = productSizes.some((size) => productPieces.some((piece) =>
      getPieceStock(productPieceDomainLedger(product.id, piece, size.id), piece.id, size.id) > 0
    ));
    const complete = productSizes.reduce((sum, size) =>
      sum + getCompleteUnits(productPieces, productInventoryEffectiveLedger(product, productPieces, size.id), size.id), 0);
    const physical = productSizes.reduce((sum, size) => sum + productPieces.reduce((pieceSum, piece) => {
      const ledger = productPieceDomainLedger(product.id, piece, size.id);
      return pieceSum + (piece.laterality === 'simetrica'
        ? getSymmetricStock(ledger, piece.id, size.id).physicalTotal
        : Math.max(0, getPieceStock(ledger, piece.id, size.id)));
    }, 0), 0);
    return { product, base, productPieces, productSizes, hasStock, complete, physical };
  });
  const inventorySearchNormalized = inventorySearch.trim().toLocaleLowerCase('es');
  const filteredInventoryProducts = inventoryProductSummaries.filter(({ product, base, productPieces, productSizes, hasStock }) => {
    const searchText = [product.name, base?.name ?? '', ...productPieces.map((piece) => piece.name), ...productPieces.map((piece) => piece.textileName), ...productPieces.map((piece) => piece.colorName)].join(' ').toLocaleLowerCase('es');
    const matchesSearch = !inventorySearchNormalized || searchText.includes(inventorySearchNormalized);
    const matchesFilter = inventoryFilter === 'Todos' || (inventoryFilter === 'Con stock' ? hasStock : !hasStock);
    return matchesSearch && matchesFilter && productSizes.length >= 0;
  });
  const inventoryModelsWithStock = inventoryProductSummaries.filter((item) => item.hasStock).length;
  const inventoryPhysicalTotal = inventoryProductSummaries.reduce((sum, item) => sum + item.physical, 0);
  const inventoryCompleteUnits = inventoryProductSummaries.reduce((sum, item) => sum + item.complete, 0);

  function finishedGarmentStock(productModelId: string, sizeId: string): number {
    return Math.max(0, data.finishedGarmentMovements
      .filter((movement) => movement.productModelId === productModelId && movement.sizeId === sizeId)
      .reduce((sum, movement) => sum + movement.delta, 0));
  }

  const finishedInventorySummaries = activeInventoryProducts.map((product) => {
    const base = baseModels.find((model) => model.id === product.baseModelId);
    const collection = data.productCollections.find((item) => item.id === product.collectionId)?.name ?? 'Sin colección';
    const sizes = productSizeOptions(product).map((size) => ({ size, quantity: finishedGarmentStock(product.id, size.id) }));
    const sizesWithStock = sizes.filter((item) => item.quantity > 0);
    return { product, base, collection, sizesWithStock, total: sizesWithStock.reduce((sum, item) => sum + item.quantity, 0) };
  });
  const finishedInventorySearchNormalized = finishedInventorySearch.trim().toLocaleLowerCase('es');
  const filteredFinishedInventory = finishedInventorySummaries.filter((item) => {
    const matchesSearch = !finishedInventorySearchNormalized ||
      (item.product.name + ' ' + (item.base?.name ?? '') + ' ' + item.collection).toLocaleLowerCase('es').includes(finishedInventorySearchNormalized);
    const matchesFilter = finishedInventoryFilter === 'Todos' ||
      (finishedInventoryFilter === 'Con stock' ? item.total > 0 : item.total === 0);
    return matchesSearch && matchesFilter;
  });
  const finishedInventoryTotal = finishedInventorySummaries.reduce((sum, item) => sum + item.total, 0);
  const finishedInventoryModelsWithStock = finishedInventorySummaries.filter((item) => item.total > 0).length;
  const finishedInventorySizesWithStock = finishedInventorySummaries.reduce((sum, item) => sum + item.sizesWithStock.length, 0);

  function inventoryReservedPieceQuantity(productId: string, piece: ProductInventoryPiece, sizeId: string, side: 'izquierda' | 'derecha' | null): number {
    const productOrders = ordersHoldingStock.filter((order) => order.productModelId === productId);
    if (piece.scope === 'base') {
      return reservedPieceQuantity(productOrders.flatMap((order) => order.basePieces), piece.sourcePieceId, sizeId, side);
    }
    return reservedPieceQuantity(productOrders.flatMap((order) => order.componentPieces)
      .filter((line) => line.componentId === piece.componentId), piece.sourcePieceId, sizeId, side);
  }

  function inventoryStockLabel(productId: string, piece: ProductInventoryPiece, sizeId: string): string {
    const ledger = productPieceDomainLedger(productId, piece, sizeId);
    if (piece.laterality !== 'simetrica') return format(Math.max(0, getPieceStock(ledger, piece.id, sizeId)));
    const stock = getSymmetricStock(ledger, piece.id, sizeId);
    return stock.left === stock.right ? format(stock.parity) + ' par.' : format(stock.left) + '/' + format(stock.right);
  }

  function openProductInventoryForm(operation: 'entrada' | 'salida', productModelId?: string) {
    if (activeInventoryProducts.length === 0) {
      tell('Primero crea un modelo comercial a partir de un patrón base y sus componentes.', 'info');
      onNavigate('modelos-producto');
      return;
    }
    const selected = activeInventoryProducts.find((product) => product.id === productModelId) ?? activeInventoryProducts[0];
    setInventoryProductId(selected.id);
    setInventoryOperation(operation);
    setInventorySizeIds([]);
    setInventoryAmounts({});
    setInventoryEntryModes({});
    setInventoryNote(operation === 'entrada' ? 'Ingreso de piezas' : 'Retiro / merma');
    setShowProductInventoryForm(true);
  }

  function changeInventoryProduct(productId: string) {
    setInventoryProductId(productId);
    setInventorySizeIds([]);
    setInventoryAmounts({});
    setInventoryEntryModes({});
  }

  function toggleInventorySize(sizeId: string) {
    setInventorySizeIds((previous) => previous.includes(sizeId) ? previous.filter((value) => value !== sizeId) : [...previous, sizeId]);
  }

  function updateInventoryAmount(sizeId: string, pieceId: string, slot: 'paridad' | 'izquierda' | 'derecha' | undefined, value: string) {
    const key = slot ? sizeId + '::' + pieceId + '::' + slot : sizeId + '::' + pieceId;
    setInventoryAmounts((previous) => ({ ...previous, [key]: value }));
  }

  function readInventoryAmount(sizeId: string, pieceId: string, slot?: 'paridad' | 'izquierda' | 'derecha') {
    const key = slot ? sizeId + '::' + pieceId + '::' + slot : sizeId + '::' + pieceId;
    const raw = inventoryAmounts[key] ?? '';
    return raw.trim() === '' ? 0 : Number(raw);
  }

  function bumpInventoryAmount(sizeId: string, pieceId: string, slot: 'paridad' | 'izquierda' | 'derecha' | undefined, amount: number) {
    updateInventoryAmount(sizeId, pieceId, slot, String(Math.max(0, (readInventoryAmount(sizeId, pieceId, slot) || 0) + amount)));
  }

  function changeInventoryEntryMode(pieceId: string, mode: 'paridad' | 'lados') {
    setInventoryEntryModes((previous) => ({ ...previous, [pieceId]: mode }));
    setInventoryAmounts((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => key.split('::')[1] !== pieceId)));
  }

  function inventoryQuantityControl(sizeId: string, piece: ProductInventoryPiece, slot: 'paridad' | 'izquierda' | 'derecha' | undefined, label: string) {
    const key = slot ? sizeId + '::' + piece.id + '::' + slot : sizeId + '::' + piece.id;
    return <span className="quantity-control">
      <button type="button" aria-label={'Restar ' + label} onClick={() => bumpInventoryAmount(sizeId, piece.id, slot, -1)}>−</button>
      <input type="number" min="0" step="1" inputMode="numeric" value={inventoryAmounts[key] ?? ''} placeholder="0" onChange={(event) => updateInventoryAmount(sizeId, piece.id, slot, event.target.value)} aria-label={label} />
      <button type="button" aria-label={'Agregar ' + label} onClick={() => bumpInventoryAmount(sizeId, piece.id, slot, 1)}>＋</button>
    </span>;
  }

  function submitProductInventoryMovement(event: FormEvent) {
    event.preventDefault();
    const product = data.productModels.find((item) => item.id === inventoryProductId && item.active);
    if (!product) return tell('Selecciona un modelo comercial válido.', 'error');
    const productSizes = productSizeOptions(product);
    const selectedSizes = productSizes.filter((size) => inventorySizeIds.includes(size.id));
    if (selectedSizes.length === 0) return tell('Selecciona al menos una talla.', 'error');
    const productPieces = productInventoryPieces(product);
    const baseRows: ProductBasePieceMovement[] = [];
    const componentRows: ComponentPieceMovement[] = [];
    const note = inventoryNote.trim() || (inventoryOperation === 'entrada' ? 'Ingreso de piezas' : 'Retiro / merma');
    const timestamp = now();
    const sign = inventoryOperation === 'entrada' ? 1 : -1;
    const push = (piece: ProductInventoryPiece, sizeId: string, quantity: number, side?: 'izquierda' | 'derecha') => {
      if (quantity <= 0) return;
      const common = { id: id(), productModelId: product.id, pieceId: piece.sourcePieceId, sizeId, delta: sign * quantity, kind: inventoryOperation, side, note, date: timestamp };
      if (piece.scope === 'base') baseRows.push(common as ProductBasePieceMovement);
      else componentRows.push({ ...common, componentId: piece.componentId! } as ComponentPieceMovement);
    };
    const validAmount = (amount: number, piece: ProductInventoryPiece, sizeId: string, side?: string) => {
      if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
        tell('La cantidad de ' + piece.name + (side ? ' (' + side + ')' : '') + ' debe ser un entero igual o mayor que cero.', 'error');
        return false;
      }
      return true;
    };

    for (const size of selectedSizes) {
      for (const piece of productPieces) {
        const ledger = productPieceDomainLedger(product.id, piece, size.id);
        if (piece.laterality === 'simetrica') {
          const mode = inventoryEntryModes[piece.id] ?? 'paridad';
          const current = getSymmetricStock(ledger, piece.id, size.id);
          if (mode === 'paridad') {
            const quantity = readInventoryAmount(size.id, piece.id, 'paridad');
            if (!validAmount(quantity, piece, size.id)) return;
            const availableLeft = current.left - inventoryReservedPieceQuantity(product.id, piece, size.id, 'izquierda');
            const availableRight = current.right - inventoryReservedPieceQuantity(product.id, piece, size.id, 'derecha');
            if (inventoryOperation === 'salida' && quantity > Math.min(availableLeft, availableRight)) {
              tell('No puedes retirar ' + format(quantity) + ' paridades de ' + piece.name + ' en talla ' + size.label + ': quedan ' + format(Math.max(0, availableLeft)) + ' izquierdas y ' + format(Math.max(0, availableRight)) + ' derechas disponibles.', 'error');
              return;
            }
            push(piece, size.id, quantity, 'izquierda');
            push(piece, size.id, quantity, 'derecha');
          } else {
            const left = readInventoryAmount(size.id, piece.id, 'izquierda');
            const right = readInventoryAmount(size.id, piece.id, 'derecha');
            if (!validAmount(left, piece, size.id, 'izquierda') || !validAmount(right, piece, size.id, 'derecha')) return;
            const availableLeft = current.left - inventoryReservedPieceQuantity(product.id, piece, size.id, 'izquierda');
            const availableRight = current.right - inventoryReservedPieceQuantity(product.id, piece, size.id, 'derecha');
            if (inventoryOperation === 'salida' && left > availableLeft) { tell('No puedes retirar ' + format(left) + ' piezas izquierdas de ' + piece.name + ': disponibles ' + format(Math.max(0, availableLeft)) + '.', 'error'); return; }
            if (inventoryOperation === 'salida' && right > availableRight) { tell('No puedes retirar ' + format(right) + ' piezas derechas de ' + piece.name + ': disponibles ' + format(Math.max(0, availableRight)) + '.', 'error'); return; }
            push(piece, size.id, left, 'izquierda');
            push(piece, size.id, right, 'derecha');
          }
          continue;
        }
        const quantity = readInventoryAmount(size.id, piece.id);
        if (!validAmount(quantity, piece, size.id)) return;
        const current = Math.max(0, getPieceStock(ledger, piece.id, size.id));
        const reserved = inventoryReservedPieceQuantity(product.id, piece, size.id, null);
        if (inventoryOperation === 'salida' && quantity > current - reserved) {
          tell('No puedes retirar ' + format(quantity) + ' de ' + piece.name + ' en talla ' + size.label + ': disponibles ' + format(Math.max(0, current - reserved)) + '.', 'error');
          return;
        }
        push(piece, size.id, quantity);
      }
    }
    if (baseRows.length + componentRows.length === 0) return tell('Ingresa una cantidad mayor que cero en al menos una pieza.', 'error');
    setData((current) => ({
      ...current,
      productBasePieceMovements: [...current.productBasePieceMovements, ...baseRows],
      componentPieceMovements: [...current.componentPieceMovements, ...componentRows],
    }));
    setShowProductInventoryForm(false);
    setInventorySizeIds([]);
    setInventoryAmounts({});
    setInventoryEntryModes({});
    const physicalTotal = [...baseRows, ...componentRows].reduce((sum, movement) => sum + Math.abs(movement.delta), 0);
    tell((inventoryOperation === 'entrada' ? 'Stock registrado: ' : 'Stock retirado: ') + format(physicalTotal) + ' piezas físicas en ' + selectedSizes.length + ' talla(s).');
  }

  function convertPieceSetToFinishedGarment(product: ConfiguredProductModel, sizeId: string) {
    const productSizes = productSizeOptions(product);
    const size = productSizes.find((item) => item.id === sizeId);
    if (!size) return tell('La talla seleccionada ya no pertenece a este modelo.', 'error');
    const productPieces = productInventoryPieces(product);
    if (productPieces.length === 0) return tell('Este modelo no tiene piezas configuradas para convertir.', 'error');

    // Recalcular con las reservas de órdenes activas para no consumir piezas comprometidas.
    const availableUnits = getCompleteUnits(productPieces, productInventoryEffectiveLedger(product, productPieces, sizeId), sizeId);
    if (availableUnits < 1) return tell('No hay un juego completo de piezas disponible para la talla ' + size.label + '.', 'error');

    const physicalPiecesPerGarment = productPieces.reduce((sum, piece) => sum + piece.unitsPerGarment, 0);
    if (!window.confirm(
      'Convertir 1 unidad de «' + product.name + '» · talla ' + size.label + ' en prenda terminada.\n\n' +
      'Se descontarán ' + physicalPiecesPerGarment + ' piezas físicas del inventario de este modelo (moldes base y componentes auxiliares) y se sumará 1 prenda terminada.\n\n' +
      'Esta acción no crea una orden de producción ni registra consumos de tela o avíos.\n\n¿Continuar?'
    )) return;

    const baseRows: ProductBasePieceMovement[] = [];
    const componentRows: ComponentPieceMovement[] = [];
    const timestamp = now();
    const note = 'Conversión rápida a prenda terminada';
    for (const piece of productPieces) {
      if (!Number.isInteger(piece.unitsPerGarment) || piece.unitsPerGarment < 1 ||
          (piece.laterality === 'simetrica' && piece.unitsPerGarment % 2 !== 0)) {
        return tell('No se pudo convertir: la cantidad requerida de «' + piece.name + '» no es válida.', 'error');
      }
      const push = (quantity: number, side?: 'izquierda' | 'derecha') => {
        if (quantity <= 0) return;
        const common = {
          id: id(), productModelId: product.id, pieceId: piece.sourcePieceId, sizeId,
          delta: -quantity, kind: 'salida' as const, side, note, date: timestamp,
        };
        if (piece.scope === 'base') baseRows.push(common as ProductBasePieceMovement);
        else componentRows.push({ ...common, componentId: piece.componentId! } as ComponentPieceMovement);
      };
      if (piece.laterality === 'simetrica') {
        const perSide = piece.unitsPerGarment / 2;
        push(perSide, 'izquierda');
        push(perSide, 'derecha');
      } else {
        push(piece.unitsPerGarment);
      }
    }

    const finishedMovement: FinishedGarmentMovement = {
      id: id(), productModelId: product.id, sizeId, delta: 1,
      kind: 'conversion_piezas', note, date: timestamp,
    };
    setData((current) => ({
      ...current,
      productBasePieceMovements: [...current.productBasePieceMovements, ...baseRows],
      componentPieceMovements: [...current.componentPieceMovements, ...componentRows],
      finishedGarmentMovements: [...current.finishedGarmentMovements, finishedMovement],
    }));
    tell('Prenda terminada registrada: ' + product.name + ' · talla ' + size.label + '. Se descontó el juego completo de piezas.');
  }

  function exportProductInventoryCsv() {
    const rows = [['Modelo comercial', 'Patrón base', 'Tipo de pieza', 'Componente', 'Pieza', 'Grupo de tallas', 'Talla', 'Tela asignada', 'Color asignado', 'Stock físico', 'Izquierda', 'Derecha', 'Paridades', 'Piezas por prenda', 'Unidades fabricables']];
    for (const { product, base, productPieces, productSizes } of inventoryProductSummaries) {
      for (const size of productSizes) {
        const ledger = productInventoryDomainLedger(product, productPieces, size.id);
        const capacity = getCompleteUnits(productPieces, ledger, size.id);
        for (const piece of productPieces) {
          const pieceLedger = productPieceDomainLedger(product.id, piece, size.id);
          const symmetric = piece.laterality === 'simetrica' ? getSymmetricStock(pieceLedger, piece.id, size.id) : undefined;
          const raw = symmetric ? symmetric.physicalTotal : Math.max(0, getPieceStock(pieceLedger, piece.id, size.id));
          if (raw === 0) continue;
          rows.push([
            product.name, base?.name ?? '', piece.scope === 'base' ? 'Molde base' : 'Pieza auxiliar',
            piece.componentName, piece.name, sizeGroups.find((group) => group.id === base?.sizeGroupId)?.name ?? '',
            size.label, piece.textileName, piece.colorName, String(raw),
            symmetric ? String(symmetric.left) : '', symmetric ? String(symmetric.right) : '',
            symmetric ? String(symmetric.parity) : '', String(piece.unitsPerGarment), String(capacity),
          ]);
        }
      }
    }
    const csv = '\uFEFF' + rows.map((row) => row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'inventario-piezas-por-modelo.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const plan = useMemo(() => {
    type PlannedMaterial = MaterialRequirement & { productSpecification?: SizeSpecification };
    type PlannedRow = { bySize: Record<string, number>; missingSizes: string[]; specificationsBySize: Record<string, string[]> };
    if (!activeProduct) return { rows: [] as Array<{ variantId: string; total: number; bySize: Record<string, number>; missingSizes: string[]; specificationsBySize: Record<string, string[]>; available: number | null; shortage: number | null; packs: number | null }>, unresolved: [] as string[] };
    const requirements: PlannedMaterial[] = [];
    const multipliers = new Map<string, number>();
    const inheritedFamily = baseModels.find((model) => model.id === activeProduct.baseModelId)?.family ?? '';
    const recipes = inheritedFamily ? data.familyRecipes.filter((x) => x.active && x.family === inheritedFamily) : [];
    recipes.forEach((recipe) => recipe.materials.forEach((material) => { requirements.push(material); multipliers.set(material.id, 1); }));
    activeProduct.components.forEach((selected) => {
      const component = data.components.find((x) => x.id === selected.componentId && x.active);
      if (!component) return;
      component.materials.forEach((material) => {
        const copy: PlannedMaterial = {
          ...material,
          variantId: selected.variantOverrides[material.id] ?? material.variantId,
          productSpecification: selected.materialSpecifications?.[material.id],
        };
        requirements.push(copy); multipliers.set(copy.id, selected.quantity);
      });
    });
    activeProduct.additionalMaterials.forEach((material) => { requirements.push(material); multipliers.set(material.id, 1); });
    const grouped = new Map<string, PlannedRow>();
    const unresolved: string[] = [];
    const productSizes = productSizeOptions(activeProduct);
    for (const material of requirements) {
      const variant = variantsBySupply.get(material.variantId);
      const supply = variant ? supplies.find((x) => x.id === variant.supplyId) : undefined;
      if (!variant || !supply) { unresolved.push('Variante de insumo no disponible.'); continue; }
      const factor = conversionFactor(material.unit, supply.baseUnit);
      if (factor === null) { unresolved.push(supply.name + ': no se puede convertir ' + material.unit + ' a ' + supply.baseUnit + '.'); continue; }
      const row = grouped.get(variant.id) ?? { bySize: {}, missingSizes: [], specificationsBySize: {} };
      for (const size of productSizes) {
        const count = Number(planCounts[size.id] ?? 0);
        if (!Number.isFinite(count) || count < 0 || count === 0) continue;
        const consumption = material.mode === 'fixed' ? material.fixedQuantity : material.bySize[size.id];
        if (consumption === undefined || consumption === null || !Number.isFinite(consumption) || consumption < 0) {
          row.missingSizes.push(size.label + ' (consumo)');
          continue;
        }
        if (material.specificationLabel?.trim()) {
          const specification = material.productSpecification;
          const value = specification?.bySize?.[size.id]?.trim();
          if (!value) row.missingSizes.push(size.label + ' (falta ' + material.specificationLabel + ')');
          else {
            const entry = material.specificationLabel.trim() + ': ' + value;
            row.specificationsBySize[size.id] = [...(row.specificationsBySize[size.id] ?? []), entry];
          }
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
      let available: number | null = null;
      let shortage: number | null = null;
      if (supply.stockMode !== 'none') {
        available = 0;
        shortage = 0;
        if (variant.textileId) {
          const unit: 'M' | 'KG' = supply.baseUnit === 'm' ? 'M' : 'KG';
          const matchingRolls = textileContext.rollos.filter((roll) =>
            roll.idTela === variant.textileId && (!variant.textileColorId || roll.idTelaColor === variant.textileColorId) && roll.estado === 'disponible'
          );
          available = matchingRolls.reduce((sum, roll) => {
            const physical = unit === 'M' ? roll.metros ?? 0 : roll.pesoKg ?? 0;
            const reserved = ordersHoldingStock.reduce((totalReserved, order) =>
              totalReserved + order.rollAllocations.filter((allocation) => allocation.rollId === roll.id && allocation.unit === unit)
                .reduce((totalForRoll, allocation) => totalForRoll + allocation.quantity, 0), 0);
            return sum + Math.max(0, physical - reserved);
          }, 0);
          shortage = Math.max(0, total - available);
        } else if (supply.stockMode === 'total') {
          const reserved = reservedSupplyQuantity(variant.id, null);
          available = Math.max(0, stockForVariant(variant, null) - reserved);
          shortage = Math.max(0, total - available);
        } else {
          for (const [sizeId, needed] of Object.entries(value.bySize)) {
            const reserved = reservedSupplyQuantity(variant.id, sizeId);
            const stock = Math.max(0, stockForVariant(variant, sizeId) - reserved);
            available += stock;
            shortage += Math.max(0, needed - stock);
          }
        }
      }
      const packs = supply.stockMode !== 'none' && variant.purchasePackQuantity && shortage !== null
        ? Math.ceil(shortage / variant.purchasePackQuantity) : null;
      return {
        variantId, total, bySize: value.bySize,
        missingSizes: [...new Set(value.missingSizes)],
        specificationsBySize: value.specificationsBySize,
        available, shortage, packs,
      };
    });
    return { rows, unresolved };
  }, [activeProduct, data.familyRecipes, data.components, data.productionOrders, variantsBySupply, supplies, sizes, baseModels, basePieces, baseMovements, planCounts, textileContext, data.supplyMovements, stockForVariant, ordersHoldingStock, reservedSupplyQuantity]);


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
              auxiliary.push({ id: id(), productModelId: product.id, componentId: component.id, pieceId: piece.id, sizeId, side: 'izquierda', quantity: eachSide });
              auxiliary.push({ id: id(), productModelId: product.id, componentId: component.id, pieceId: piece.id, sizeId, side: 'derecha', quantity: eachSide });
            }
          } else if (required > 0) {
            auxiliary.push({ id: id(), productModelId: product.id, componentId: component.id, pieceId: piece.id, sizeId, side: null, quantity: required });
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
    const productSizes = productSizeOptions(activeProduct);
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
    try {
      for (const row of plan.rows) {
        const variant = variantsBySupply.get(row.variantId);
        const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
        if (!variant || !supply) return tell('Una variante de material dejó de estar disponible. Revisa la receta.', 'error');
        const cost = latestUnitCost(variant, supply.baseUnit);
        const addLine = (sizeId: string | null, quantity: number, specificationValue?: string) => {
          if (!(quantity > 0)) return;
          if (supply.baseUnit === 'und' && !Number.isInteger(quantity)) throw new Error(supply.name + ': el consumo configurado debe ser entero porque se controla por unidades.');
          orderMaterials.push({
            id: id(), variantId: variant.id, sizeId, quantity: Number(quantity.toFixed(variant.textileId ? 3 : 5)),
            unit: supply.baseUnit, unitCost: cost, lineCost: cost === null ? null : Number((quantity * cost).toFixed(2)),
            specificationLabel: specificationValue ? 'Características por talla' : null,
            specificationValue: specificationValue ?? null,
          });
        };
        const hasSizeSpecifications = Object.values(row.specificationsBySize).some((entries) => entries.length > 0);
        if (supply.stockMode === 'total' && !hasSizeSpecifications) {
          addLine(null, Object.values(row.bySize).reduce((sum, value) => sum + value, 0));
        } else {
          Object.entries(row.bySize).forEach(([sizeId, quantity]) => addLine(sizeId, quantity, row.specificationsBySize[sizeId]?.join(' · ')));
        }
      }
    } catch (error) {
      return tell(error instanceof Error ? error.message : 'Revisa las cantidades de materiales antes de crear la orden.', 'error');
    }
    let pieceRequirements: ReturnType<typeof makePieceRequirements>;
    try { pieceRequirements = makePieceRequirements(activeProduct, quantities); }
    catch (error) { return tell(error instanceof Error ? error.message : 'Revisa las piezas requeridas por el modelo.', 'error'); }
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
      localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '11');
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

  function currentBasePieceBalance(productModelId: string, pieceId: string, sizeId: string, side: 'izquierda' | 'derecha' | null): number {
    const piece = basePieces.find((item) => item.id === pieceId);
    if (!piece) return 0;
    const ledger = productBasePieceDomainLedger(productModelId, piece.id, sizeId);
    if (piece.laterality === 'simetrica') {
      const stock = getSymmetricStock(ledger, piece.id, sizeId);
      return side === 'derecha' ? stock.right : stock.left;
    }
    return getPieceStock(ledger, piece.id, sizeId);
  }

  function currentComponentPieceBalance(productModelId: string, pieceId: string, sizeId: string, side: 'izquierda' | 'derecha' | null): number {
    const piece = data.components.flatMap((component) => component.pieces).find((item) => item.id === pieceId);
    if (!piece) return 0;
    const ledger = componentPieceDomainLedger(productModelId, pieceId, sizeId);
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
      if (supply.stockMode === 'none') continue;
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
      const balance = currentBasePieceBalance(order.productModelId, line.pieceId, line.sizeId, line.side);
      const reserved = reservedPieceQuantity(otherOrders.filter((activeOrder) => activeOrder.productModelId === order.productModelId).flatMap((activeOrder) => activeOrder.basePieces), line.pieceId, line.sizeId, line.side);
      if (balance - reserved + 0.00001 < line.quantity) issues.push((piece?.name ?? 'Molde base') + ' · ' + (sizes.find((size) => size.id === line.sizeId)?.label ?? 'Talla') + ': faltan ' + format(line.quantity - Math.max(0, balance - reserved)) + ' piezas' + (line.side ? ' ' + line.side : ''));
    }
    for (const line of order.componentPieces) {
      const piece = data.components.find((component) => component.id === line.componentId)?.pieces.find((item) => item.id === line.pieceId);
      const balance = currentComponentPieceBalance(order.productModelId, line.pieceId, line.sizeId, line.side);
      const reserved = reservedPieceQuantity(otherOrders.filter((activeOrder) => activeOrder.productModelId === order.productModelId).flatMap((activeOrder) => activeOrder.componentPieces), line.pieceId, line.sizeId, line.side);
      if (balance - reserved + 0.00001 < line.quantity) issues.push((piece?.name ?? 'Pieza auxiliar') + ' · ' + (sizes.find((size) => size.id === line.sizeId)?.label ?? 'Talla') + ': faltan ' + format(line.quantity - Math.max(0, balance - reserved)) + ' piezas' + (line.side ? ' ' + line.side : ''));
    }
    if (issues.length > 0) return tell('No se reservó ' + order.number + '. ' + issues.join(' · '), 'error');
    const timestamp = now();
    const updated: ProductionOrder = { ...order, status: 'reservada', rollAllocations, reservedAt: timestamp, updatedAt: timestamp };
    if (persistProductionSnapshot({ ...data, productionOrders: data.productionOrders.map((item) => item.id === order.id ? updated : item) })) {
      tell(order.number + ': materiales y piezas reservados correctamente.');
    }
  }

  function startProductionOrder(orderId: string) {
    const order = data.productionOrders.find((item) => item.id === orderId);
    if (!order || order.status !== 'reservada') return tell('La orden debe estar reservada antes de iniciar.', 'error');
    const timestamp = now();
    if (persistProductionSnapshot({ ...data, productionOrders: data.productionOrders.map((item) => item.id === order.id ? { ...item, status: 'en_proceso', startedAt: timestamp, updatedAt: timestamp } : item) })) {
      tell(order.number + ' inició producción.');
    }
  }

  function cancelProductionOrder(orderId: string) {
    const order = data.productionOrders.find((item) => item.id === orderId);
    if (!order || (order.status !== 'borrador' && !holdingStatuses.includes(order.status))) return tell('Esta orden ya está cerrada y no se puede cancelar.', 'error');
    const prompt = order.status === 'borrador'
      ? '¿Descartar el borrador ' + order.number + '? No se ha reservado ni descontado inventario.'
      : '¿Cancelar ' + order.number + '? Se liberarán sus reservas y no se descontará inventario.';
    if (!window.confirm(prompt)) return;
    const timestamp = now();
    if (persistProductionSnapshot({ ...data, productionOrders: data.productionOrders.map((item) => item.id === order.id ? { ...item, status: 'cancelada', cancelledAt: timestamp, updatedAt: timestamp } : item) })) {
      tell(order.status === 'borrador' ? order.number + ' descartado.' : order.number + ' cancelada. El stock reservado volvió a estar disponible.');
    }
  }

  function openProductionOrderCompletion(orderId: string) {
    const order = data.productionOrders.find((item) => item.id === orderId);
    if (!order || order.status !== 'en_proceso') return tell('La orden debe estar en proceso antes de registrar su consumo real.', 'error');
    setCompletionDraft({
      orderId,
      materialQuantities: Object.fromEntries(order.materials.map((line) => [line.id, String(line.quantity)])),
      rollQuantities: Object.fromEntries(order.rollAllocations.map((allocation) => [allocation.id, String(allocation.quantity)])),
    });
  }

  function confirmProductionOrderCompletion(event: FormEvent) {
    event.preventDefault();
    if (!completionDraft) return;
    completeProductionOrder(completionDraft);
  }

  function completeProductionOrder(draft: ProductionOrderCompletionDraft) {
    const orderId = draft.orderId;
    const order = data.productionOrders.find((item) => item.id === orderId);
    if (!order || order.status !== 'en_proceso') return tell('La orden debe estar en proceso antes de completarla.', 'error');
    const issues: string[] = [];
    const otherOrders = data.productionOrders.filter((item) => item.id !== order.id && holdingStatuses.includes(item.status));
    const actualMaterials: ProductionOrderMaterial[] = order.materials.map((line) => {
      const raw = draft.materialQuantities[line.id] ?? String(line.quantity);
      const quantity = Number(raw);
      const supply = supplies.find((item) => item.id === variantsBySupply.get(line.variantId)?.supplyId);
      if (raw.trim() === '' || !Number.isFinite(quantity) || quantity < 0 || quantity > line.quantity + 0.00001) {
        issues.push((supply?.name ?? 'Material') + ': el consumo real debe estar entre cero y lo reservado.');
      }
      if (supply?.baseUnit === 'und' && !Number.isInteger(quantity)) {
        issues.push((supply.name) + ': el consumo real debe ser entero.');
      }
      return { ...line, quantity: Number.isFinite(quantity) ? quantity : 0, lineCost: line.unitCost === null ? null : Number((quantity * line.unitCost).toFixed(2)) };
    });
    const actualRollAllocations: ProductionOrderRollAllocation[] = order.rollAllocations.map((allocation) => {
      const raw = draft.rollQuantities[allocation.id] ?? String(allocation.quantity);
      const quantity = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(quantity) || quantity < 0 || quantity > allocation.quantity + 0.00001 || Math.abs(quantity - Number(quantity.toFixed(3))) > 0.000001) {
        issues.push('El consumo real del rollo ' + allocation.rollId + ' debe estar entre cero y la cantidad reservada, con precisión máxima de 0.001 ' + allocation.unit + '.');
      }
      return { ...allocation, quantity: Number.isFinite(quantity) ? Number(quantity.toFixed(5)) : 0 };
    });
    for (const line of actualMaterials) {
      const variant = variantsBySupply.get(line.variantId);
      const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
      if (!variant || !supply) { issues.push('Material ya no disponible: ' + line.variantId); continue; }
      if (supply.stockMode === 'none') continue;
      if (!variant.textileId) {
        const reservedByOthers = otherOrders.reduce((sum, activeOrder) => sum + activeOrder.materials.filter((item) => item.variantId === line.variantId && item.sizeId === line.sizeId).reduce((total, item) => total + item.quantity, 0), 0);
        const available = stockForVariant(variant, line.sizeId) - reservedByOthers;
        if (available + 0.00001 < line.quantity) issues.push(supply.name + ': el saldo físico cambió; faltan ' + format(line.quantity - Math.max(0, available)) + ' ' + unitLabel[supply.baseUnit]);
      }
    }
    for (const line of order.basePieces) {
      const piece = basePieces.find((item) => item.id === line.pieceId);
      const reserved = reservedPieceQuantity(otherOrders.filter((activeOrder) => activeOrder.productModelId === order.productModelId).flatMap((activeOrder) => activeOrder.basePieces), line.pieceId, line.sizeId, line.side);
      if (currentBasePieceBalance(order.productModelId, line.pieceId, line.sizeId, line.side) - reserved + 0.00001 < line.quantity) issues.push((piece?.name ?? 'Molde base') + ': el stock reservado ya no está disponible.');
    }
    for (const line of order.componentPieces) {
      const piece = data.components.find((component) => component.id === line.componentId)?.pieces.find((item) => item.id === line.pieceId);
      const reserved = reservedPieceQuantity(otherOrders.filter((activeOrder) => activeOrder.productModelId === order.productModelId).flatMap((activeOrder) => activeOrder.componentPieces), line.pieceId, line.sizeId, line.side);
      if (currentComponentPieceBalance(order.productModelId, line.pieceId, line.sizeId, line.side) - reserved + 0.00001 < line.quantity) issues.push((piece?.name ?? 'Pieza auxiliar') + ': el stock reservado ya no está disponible.');
    }
    const textileMaterials = new Map<string, number>();
    actualMaterials.forEach((line) => {
      if (variantsBySupply.get(line.variantId)?.textileId) textileMaterials.set(line.variantId, (textileMaterials.get(line.variantId) ?? 0) + line.quantity);
    });
    for (const [variantId, required] of textileMaterials) {
      const allocated = actualRollAllocations.filter((allocation) => allocation.variantId === variantId).reduce((sum, allocation) => sum + allocation.quantity, 0);
      if (Math.abs(allocated - required) > 0.0001) issues.push('El consumo real de tela debe coincidir con las cantidades reales asignadas a sus rollos.');
    }
    const fabricRaw = localStorage.getItem(FABRIC_STORAGE_KEYS.rollos);
    const movementRaw = localStorage.getItem(FABRIC_STORAGE_KEYS.rolloMovimientos);
    const previousFabricRolls: string | null = fabricRaw;
    const previousFabricMovements: string | null = movementRaw;
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
    actualRollAllocations.filter((allocation) => allocation.quantity > 0).forEach((allocation) => {
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

    const supplyMovements: SupplyMovement[] = actualMaterials.filter((line) => line.quantity > 0 && supplies.find((supply) => supply.id === variantsBySupply.get(line.variantId)?.supplyId)?.stockMode !== 'none' && !variantsBySupply.get(line.variantId)?.textileId).map((line) => ({
      id: id(), variantId: line.variantId, sizeId: line.sizeId, delta: -line.quantity, kind: 'salida',
      note: 'Consumo real de orden ' + order.number, date: timestamp, sourceProductionOrderId: order.id,
    }));
    const componentMovements: ComponentPieceMovement[] = order.componentPieces.map((line) => ({
      id: id(), productModelId: order.productModelId, componentId: line.componentId, pieceId: line.pieceId, sizeId: line.sizeId,
      side: line.side ?? undefined, delta: -line.quantity, kind: 'salida',
      note: 'Consumo de orden ' + order.number, date: timestamp, sourceProductionOrderId: order.id,
    }));
    const baseEntries: ProductBasePieceMovement[] = order.basePieces.map((line) => ({
      id: id(), productModelId: order.productModelId, pieceId: line.pieceId, sizeId: line.sizeId, side: line.side ?? undefined,
      delta: -line.quantity, kind: 'salida', note: 'Consumo de orden ' + order.number,
      date: timestamp, sourceProductionOrderId: order.id,
    }));

    const nextData: ProductionBackupData = {
      ...data,
      supplyMovements: [...data.supplyMovements, ...supplyMovements],
      productBasePieceMovements: [...data.productBasePieceMovements, ...baseEntries],
      componentPieceMovements: [...data.componentPieceMovements, ...componentMovements],
      productionOrders: data.productionOrders.map((item) => item.id === order.id ? {
        ...item, status: 'completada', completedAt: timestamp, updatedAt: timestamp,
        actualConsumption: {
          materials: actualMaterials,
          rollAllocations: actualRollAllocations,
          materialCost: actualMaterials.some((line) => line.quantity > 0 && line.unitCost === null)
            ? null
            : Number(actualMaterials.reduce((sum, line) => sum + (line.lineCost ?? 0), 0).toFixed(2)),
          missingCostLines: actualMaterials.filter((line) => line.quantity > 0 && line.unitCost === null).length,
          recordedAt: timestamp,
        },
      } : item),
    };

    const productionKeys = Object.keys(emptyProductionBackupData()) as (keyof ProductionBackupData)[];
    const previousProduction = new Map<string, string | null>();
    try {
      productionKeys.forEach((key) => previousProduction.set(PRODUCTION_STORAGE_KEYS[key], localStorage.getItem(PRODUCTION_STORAGE_KEYS[key])));
      productionKeys.forEach((key) => localStorage.setItem(PRODUCTION_STORAGE_KEYS[key], JSON.stringify(nextData[key])));
      localStorage.setItem(PRODUCTION_STORAGE_KEYS.version, '11');
      localStorage.setItem(FABRIC_STORAGE_KEYS.rollos, JSON.stringify(updatedRolls));
      localStorage.setItem(FABRIC_STORAGE_KEYS.rolloMovimientos, JSON.stringify(nextRollMovements));
      setData(nextData);
      setCompletionDraft(null);
      window.dispatchEvent(new Event('telastock-fabric-data-restored'));
      tell(order.number + ' completada. Se registró el consumo real confirmado, los materiales, rollos y piezas fueron descontados.');
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
    if (view === 'inventario-piezas') return <section className="panel production-panel product-model-inventory">
      <div className="panel-heading">
        <div><h2>Inventario por modelo comercial</h2><p>Cada modelo lleva su propio stock de moldes base y piezas auxiliares, con la tabla de tallas, telas y colores que realmente utiliza.</p></div>
        <span className="count-badge">{activeInventoryProducts.length} modelos</span>
      </div>
      <div className="production-card-actions inventory-model-actions">
        <button className="button secondary" onClick={() => onNavigate('inventario-prendas')}>✓ Ver prendas terminadas</button>
        <button className="button secondary" onClick={exportProductInventoryCsv}>↧ Exportar inventario</button>
        <button className="button secondary" disabled={activeInventoryProducts.length === 0} onClick={() => openProductInventoryForm('salida')}>− Retirar / merma</button>
        <button className="button primary" disabled={activeInventoryProducts.length === 0} onClick={() => openProductInventoryForm('entrada')}>＋ Registrar stock</button>
      </div>
      <div className="stats-grid piece-stats product-inventory-stats">
        <article className="stat-card"><div className="stat-top"><span>Modelos con stock</span><span className="stat-icon purple">▦</span></div><strong>{inventoryModelsWithStock}</strong><small>De {activeInventoryProducts.length} modelos registrados</small></article>
        <article className="stat-card"><div className="stat-top"><span>Piezas disponibles</span><span className="stat-icon blue">▤</span></div><strong>{format(inventoryPhysicalTotal)}</strong><small>Moldes y piezas auxiliares físicas</small></article>
        <article className="stat-card"><div className="stat-top"><span>Prendas fabricables</span><span className="stat-icon green">✓</span></div><strong>{format(inventoryCompleteUnits)}</strong><small>Por modelo y talla, descontando reservas</small></article>
      </div>
      {activeInventoryProducts.length === 0 && <div className="empty">
        <p>Primero crea un modelo comercial combinando un patrón base, sus telas y colores, y los componentes auxiliares que llevará la prenda.</p>
        <button className="button primary" onClick={() => onNavigate('modelos-producto')}>＋ Crear modelo comercial</button>
      </div>}
      {activeInventoryProducts.length > 0 && <>
        <div className="filters inventory-filters">
          <label className="search-box"><span aria-hidden="true">⌕</span><input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Buscar modelo, pieza o tela…" aria-label="Buscar modelo, pieza o tela" /></label>
          <div className="filter-segment" aria-label="Filtrar por stock">{(['Con stock', 'Vacío', 'Todos'] as const).map((filter) => <button key={filter} className={inventoryFilter === filter ? 'selected' : ''} onClick={() => setInventoryFilter(filter)}>{filter}</button>)}</div>
        </div>
        <label className="toggle-empty"><input type="checkbox" checked={inventoryIncludeEmptySizes} onChange={(event) => setInventoryIncludeEmptySizes(event.target.checked)} /><span>Mostrar también tallas vacías en cada modelo</span></label>
        <div className="model-list product-model-inventory-list">
          {filteredInventoryProducts.map(({ product, base, productPieces, productSizes, hasStock }) => {
            const expanded = inventoryExpandedProducts.includes(product.id);
            const collection = data.productCollections.find((item) => item.id === product.collectionId)?.name ?? 'Sin colección';
            const sizeGroup = sizeGroups.find((group) => group.id === base?.sizeGroupId)?.name ?? 'Grupo de tallas no disponible';
            const sizesWithStock = productSizes.filter((size) => productPieces.some((piece) =>
              getPieceStock(productPieceDomainLedger(product.id, piece, size.id), piece.id, size.id) > 0
            ));
            const visibleSizes = inventoryIncludeEmptySizes ? productSizes : sizesWithStock;
            const legacyMovements = unassignedLegacyBaseMovements(product);
            const fabrics = [...new Set(productPieces.map((piece) => piece.textileName).filter((name) => name && name !== 'Sin asignar' && name !== 'Sin tela definida'))];
            const colors = [...new Set(productPieces.map((piece) => piece.colorName).filter((name) => name && name !== 'Sin asignar' && name !== 'Sin color'))];
            return <article className={'model-card product-model-inventory-card ' + (expanded ? 'expanded' : '')} key={product.id}>
              <button className="model-card-trigger" onClick={() => setInventoryExpandedProducts((previous) => previous.includes(product.id) ? previous.filter((id) => id !== product.id) : [...previous, product.id])} aria-expanded={expanded}>
                <span className="model-symbol" aria-hidden="true">▧</span>
                <span className="model-main">
                  <strong>{product.name}</strong>
                  <small>{base?.name ?? 'Patrón no disponible'} · {collection} · {sizeGroup}</small>
                  <span className="model-tags"><span>{productPieces.length} piezas</span><span>{sizesWithStock.length} tallas con stock</span><span>{hasStock ? 'Con existencias' : 'Sin existencias'}</span></span>
                  <small className="inventory-product-material-summary">{fabrics.length ? 'Telas: ' + fabrics.join(' · ') : 'Telas sin asignar'}{colors.length ? ' · Colores: ' + colors.join(' · ') : ''}</small>
                </span>
                <span className={'chevron ' + (expanded ? 'up' : '')} aria-hidden="true">⌄</span>
              </button>
              {expanded && <div className="model-details product-model-inventory-details">
                <div className="production-card-actions inventory-model-actions">
                  <button className="button secondary" onClick={() => openProductInventoryForm('entrada', product.id)}>＋ Registrar stock</button>
                  <button className="button secondary" onClick={() => openProductInventoryForm('salida', product.id)}>− Retirar / merma</button>
                </div>
                {legacyMovements.length > 0 && <div className="notice info inventory-legacy-notice">
                  <span>Hay {legacyMovements.length} movimientos históricos del patrón base que todavía no pertenecen a un modelo comercial. Elige a qué modelo asignarlos; no se copiarán a los demás.</span>
                  <button type="button" className="button secondary" onClick={() => importLegacyBaseStock(product)}>Asignar stock antiguo a este modelo</button>
                </div>}
                {visibleSizes.length === 0 ? <div className="empty size-empty">Este modelo todavía no tiene piezas registradas en ninguna talla. <button className="text-action" onClick={() => openProductInventoryForm('entrada', product.id)}>Registrar stock</button></div> : <div className="size-list">
                  {visibleSizes.map((size) => {
                    const ledger = productInventoryEffectiveLedger(product, productPieces, size.id);
                    const complete = getCompleteUnits(productPieces, ledger, size.id);
                    const physicalTotal = productPieces.reduce((sum, piece) => {
                      const pieceLedger = productPieceDomainLedger(product.id, piece, size.id);
                      return sum + (piece.laterality === 'simetrica'
                        ? getSymmetricStock(pieceLedger, piece.id, size.id).physicalTotal
                        : Math.max(0, getPieceStock(pieceLedger, piece.id, size.id)));
                    }, 0);
                    const shortages = getPieceShortages(productPieces, ledger, size.id, complete + 1);
                    const baseRows = productPieces.filter((piece) => piece.scope === 'base');
                    const componentGroups = product.components.flatMap((selection) => {
                      const component = data.components.find((item) => item.id === selection.componentId);
                      if (!component) return [];
                      const rows = productPieces.filter((piece) => piece.scope === 'component' && piece.selectionId === selection.id);
                      return rows.length > 0 ? [{ selection, component, rows }] : [];
                    });
                    const renderPiece = (piece: ProductInventoryPiece) => {
                      const pieceLedger = productPieceDomainLedger(product.id, piece, size.id);
                      const stock = piece.laterality === 'simetrica' ? getSymmetricStock(pieceLedger, piece.id, size.id) : undefined;
                      const availableStock = piece.laterality === 'simetrica'
                        ? Math.max(0, Math.min(stock?.left ?? 0, stock?.right ?? 0) - Math.max(inventoryReservedPieceQuantity(product.id, piece, size.id, 'izquierda'), inventoryReservedPieceQuantity(product.id, piece, size.id, 'derecha')))
                        : Math.max(0, getPieceStock(pieceLedger, piece.id, size.id) - inventoryReservedPieceQuantity(product.id, piece, size.id, null));
                      const shortage = shortages.find((item) => item.piece.id === piece.id);
                      const missingText = shortage && shortage.missing > 0
                        ? shortage.symmetricStock
                          ? 'Faltan I:' + format(shortage.missingLeft ?? 0) + ' · D:' + format(shortage.missingRight ?? 0) + ' para otra prenda'
                          : 'Faltan ' + format(shortage.missing) + ' para otra prenda'
                        : 'Stock suficiente para la siguiente prenda';
                      return <article className="inventory-product-piece-row" key={piece.id}>
                        <div className="inventory-product-piece-main">
                          <strong>{piece.name}</strong>
                          <small>{piece.scope === 'base' ? 'Molde del patrón base' : piece.componentName}</small>
                        </div>
                        <div className="inventory-product-piece-materials">
                          <span><small>Tela</small><strong>{piece.textileName || 'Sin asignar'}</strong></span>
                          <span><small>Color</small><strong>{piece.colorName || 'Sin asignar'}</strong></span>
                          <span><small>Necesita por prenda</small><strong>{piece.unitsPerGarment} {piece.laterality === 'simetrica' ? 'piezas (' + piece.unitsPerGarment / 2 + ' por lado)' : 'piezas'}</strong></span>
                        </div>
                        <div className="inventory-product-piece-stock">
                          <strong>{piece.laterality === 'simetrica'
                            ? (stock?.left === stock?.right ? format(stock?.parity ?? 0) + ' par.' : format(stock?.left ?? 0) + '/' + format(stock?.right ?? 0))
                            : format(Math.max(0, getPieceStock(pieceLedger, piece.id, size.id)))}</strong>
                          <small>{availableStock > 0 ? format(availableStock) + ' disponibles tras reservas' : 'Sin saldo libre'}</small>
                          <small className={shortage && shortage.missing > 0 ? 'inventory-shortage' : 'inventory-stock-ok'}>{missingText}</small>
                        </div>
                      </article>;
                    };
                    return <div className="size-card product-inventory-size-card" key={size.id}>
                      <div className="size-card-main">
                        <div className="size-label-block"><span className="size-pill">{size.label}</span><span className="size-stock-note">{format(physicalTotal)} piezas físicas</span></div>
                        <div className="complete-count"><strong>{format(complete)}</strong><span>prendas fabricables</span></div>
                      </div>
                      <div className="completion-status-row"><span className={'completion-status ' + (complete > 0 ? 'ready' : physicalTotal > 0 ? 'partial' : 'empty-status')}><i />{complete > 0 ? 'Fabricable' : physicalTotal > 0 ? 'Incompleto' : 'Vacío'}</span></div>
                      <div className="finished-conversion-action">
                        <div><strong>{format(finishedGarmentStock(product.id, size.id))}</strong><small>prendas terminadas de esta talla</small></div>
                        <button type="button" className="button primary" disabled={complete < 1} onClick={() => convertPieceSetToFinishedGarment(product, size.id)}>⇢ Convertir 1 prenda</button>
                      </div>
                      {baseRows.length > 0 && <section className="inventory-product-piece-group"><h4>Moldes del patrón base <span>{baseRows.length}</span></h4>{baseRows.map(renderPiece)}</section>}
                      {componentGroups.map(({ selection, component, rows }) => <section className="inventory-product-piece-group" key={selection.id}><h4>{component.name} <span>{rows.length} piezas</span></h4>{rows.map(renderPiece)}</section>)}
                    </div>;
                  })}
                </div>}
              </div>}
            </article>;
          })}
          {filteredInventoryProducts.length === 0 && <div className="empty">No hay modelos que coincidan con la búsqueda o el filtro.</div>}
        </div>
      </>}
    </section>;

    if (view === 'inventario-prendas') return <section className="panel production-panel finished-garment-inventory">
      <div className="panel-heading">
        <div><h2>Inventario de prendas terminadas</h2><p>Vista rápida por modelo y talla. Este inventario es un prototipo: por ahora las existencias ingresan al convertir juegos completos de piezas.</p></div>
        <span className="count-badge">{finishedInventoryModelsWithStock} modelos con prendas</span>
      </div>
      <div className="production-card-actions inventory-model-actions">
        <button className="button secondary" onClick={() => onNavigate('inventario-piezas')}>▦ Ver inventario de piezas</button>
      </div>
      <div className="stats-grid piece-stats finished-garment-stats">
        <article className="stat-card"><div className="stat-top"><span>Prendas terminadas</span><span className="stat-icon green">✓</span></div><strong>{format(finishedInventoryTotal)}</strong><small>Unidades registradas por conversión</small></article>
        <article className="stat-card"><div className="stat-top"><span>Modelos disponibles</span><span className="stat-icon purple">▧</span></div><strong>{finishedInventoryModelsWithStock}</strong><small>De {activeInventoryProducts.length} modelos activos</small></article>
        <article className="stat-card"><div className="stat-top"><span>Tallas con prendas</span><span className="stat-icon blue">#</span></div><strong>{finishedInventorySizesWithStock}</strong><small>Combinaciones modelo y talla</small></article>
      </div>
      <div className="filters inventory-filters">
        <label className="search-box"><span aria-hidden="true">⌕</span><input value={finishedInventorySearch} onChange={(event) => setFinishedInventorySearch(event.target.value)} placeholder="Buscar modelo terminado…" aria-label="Buscar modelo terminado" /></label>
        <div className="filter-segment" aria-label="Filtrar prendas terminadas">{(['Con stock', 'Vacío', 'Todos'] as const).map((filter) => <button key={filter} className={finishedInventoryFilter === filter ? 'selected' : ''} onClick={() => setFinishedInventoryFilter(filter)}>{filter}</button>)}</div>
      </div>
      <div className="finished-garment-list">
        {filteredFinishedInventory.map(({ product, base, collection, sizesWithStock, total }) => <article className="finished-garment-card" key={product.id}>
          <div className="finished-garment-card-heading">
            <span className="model-symbol" aria-hidden="true">✓</span>
            <div className="finished-garment-card-title"><strong>{product.name}</strong><small>{base?.name ?? 'Patrón no disponible'} · {collection}</small></div>
            <div className="finished-garment-total"><strong>{format(total)}</strong><small>terminadas</small></div>
          </div>
          {sizesWithStock.length > 0
            ? <div className="finished-garment-size-grid">{sizesWithStock.map(({ size, quantity }) => <div className="finished-garment-size-chip" key={size.id}>
                <small>Talla</small><strong>{size.label}</strong><b>{format(quantity)}</b><small>unidades</small>
              </div>)}</div>
            : <div className="finished-garment-empty">Todavía no hay prendas terminadas registradas.</div>}
        </article>)}
        {filteredFinishedInventory.length === 0 && <div className="empty">No hay modelos que coincidan con la búsqueda o el filtro.</div>}
      </div>
      <div className="panel-footer"><span>Prototipo editable · sin precios ni ventas.</span><span>Las conversiones descuentan piezas y agregan prendas por talla.</span></div>
    </section>;

    if (view === 'insumos') return <section className="panel production-panel">
      <div className="panel-heading"><div><h2>Catálogo de avíos</h2><p>Registra cada tipo de material una sola vez. Sus medidas por talla se configuran en cada modelo.</p></div><button className="button primary" onClick={() => setShowSupplyForm((x) => !x)}>＋ Nuevo insumo</button></div>
      {showSupplyForm && <form className="production-form" onSubmit={saveSupply}>
        <div className="production-form-grid">
          <label className="field-label">Nombre<input className="large-input" value={supplyName} onChange={(e) => setSupplyName(e.target.value)} placeholder="Ej. Hilo de remalle" required /></label>
          <label className="field-label">Categoría<select className="large-input" value={supplyCategory} onChange={(e) => setSupplyCategory(e.target.value as SupplyCategory)}>{categories.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label">Unidad de inventario<select className="large-input" value={supplyUnit} onChange={(e) => setSupplyUnit(e.target.value as StockUnit)}>{units.map((x) => <option key={x} value={x}>{unitLabel[x]}</option>)}</select></label>
          <label className="field-label">Control de existencias<select className="large-input" value={stockMode} onChange={(e) => setStockMode(e.target.value as 'none' | 'total' | 'talla')}><option value="none">Sin inventario · definir por modelo</option><option value="total">Cantidad total</option><option value="talla">Separada por talla</option></select><small>Para cierres y cintas cuya medida depende de la talla, selecciona «Sin inventario».</small></label>
        </div>
        <label className="field-label">Descripción<textarea className="large-input" rows={2} value={supplyDescription} onChange={(e) => setSupplyDescription(e.target.value)} placeholder="Uso habitual, especificaciones…" /></label>
        <label className="field-label">Características adicionales<textarea className="large-input" rows={2} value={supplyAttributes} onChange={(e) => setSupplyAttributes(e.target.value)} placeholder={'Una por línea. Ejemplo:\nAncho: 3.5 cm\nMaterial: Poliéster\nRigidez: Rígida'} /></label>
        <div className="form-actions"><button type="button" className="button secondary" onClick={cancelSupplyCreation}>Cancelar</button><button className="button primary">Guardar insumo</button></div>
      </form>}
      {supplies.length === 0 && <div className="empty">Todavía no hay insumos. Registra el primero; sus características por talla se definen al crear el modelo.</div>}
      <div className="production-list">{supplies.filter((x) => x.active).map((supply) => {
        const ownVariants = data.variants.filter((x) => x.supplyId === supply.id && x.active);
        const ownVariantIds = new Set(ownVariants.map((variant) => variant.id));
        const hasHistory = data.supplyMovements.some((movement) => ownVariantIds.has(movement.variantId)) ||
          data.supplyPurchaseDetails.some((detail) => ownVariantIds.has(detail.variantId)) ||
          data.productionOrders.some((order) => order.materials.some((line) => ownVariantIds.has(line.variantId)));
        return <article className="production-card" key={supply.id}>
          <div className="production-card-heading"><div><strong>{supply.name}</strong><span>{supply.category} · {supply.stockMode === 'none' ? 'Sin inventario · medidas por modelo' : 'Stock en ' + unitLabel[supply.baseUnit] + ' · ' + (supply.stockMode === 'talla' ? 'Por talla' : 'Total')}</span></div>
            {supply.stockMode !== 'none' && <button className="button secondary" onClick={() => openVariant(supply.id)}>＋ Variante</button>}
          </div>
          {supply.description && <p className="production-muted">{supply.description}</p>}
          {Object.entries(supply.attributes).length > 0 && <div className="production-attributes">{Object.entries(supply.attributes).map(([key, value]) => <span key={key}>{key}: {value}</span>)}</div>}
          {supply.stockMode === 'none' && <div className="notice info">No se crean saldos ni variantes de inventario. La característica (longitud, ancho, grosor, etc.) se asigna por grupos de tallas al configurar cada modelo.</div>}
          {supply.stockMode !== 'none' && ownVariants.length === 0 && <small className="production-muted">Sin variantes registradas.</small>}
          {supply.stockMode !== 'none' && ownVariants.map((variant) => {
            const stock = supply.stockMode === 'total' ? stockForVariant(variant, null) : sizes.reduce((sum, size) => sum + stockForVariant(variant, size.id), 0);
            return <div className="production-variant" key={variant.id}>
              <div><strong>{variant.name}</strong><small>{variant.textileId ? 'Vinculado a tela: ' + textileName(variant.textileId) : variant.purchasePackQuantity ? 'Paquete: ' + format(variant.purchasePackQuantity) + ' ' + unitLabel[supply.baseUnit] + (variant.purchasePackLabel ? ' · ' + variant.purchasePackLabel : '') : 'Variante de inventario'}</small>{Object.entries(variant.attributes).map(([key, value]) => <small key={key}>{key}: {value}</small>)}</div>
              <div className="production-variant-stock"><strong>{format(stock)}</strong><small>{unitLabel[supply.baseUnit]}</small></div>
              {!variant.textileId && <button className="text-action" onClick={() => { setStockVariantId(variant.id); setStockSizeId(''); setStockQuantity(''); setShowStockForm(true); }}>Registrar stock</button>}
            </div>;
          })}
          {supply.stockMode !== 'none' && !hasHistory && <button type="button" className="text-action" onClick={() => {
            if (!window.confirm('¿Desactivar el inventario de este insumo? Se conservará el catálogo, pero dejará de solicitar existencias. Las medidas se configurarán en cada modelo.')) return;
            setData((current) => ({ ...current, supplies: current.supplies.map((item) => item.id === supply.id ? { ...item, stockMode: 'none', updatedAt: now() } : item) }));
            tell('Insumo convertido a configuración por modelo. No se eliminaron registros.');
          }}>Usar medidas por talla en los modelos</button>}
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
        {purchasableVariants.length === 0 && <div className="notice info production-empty-catalog"><span>Necesitas una variante de avío para registrar esta compra. Las telas se siguen comprando desde el módulo de rollos.</span><div className="production-empty-catalog-actions"><select className="large-input" value={purchaseQuickSupplyId} onChange={(event) => setPurchaseQuickSupplyId(event.target.value)}><option value="">Crear un insumo nuevo</option>{supplies.filter((item) => item.active && item.stockMode !== 'none').map((item) => <option key={item.id} value={item.id}>Agregar variante a: {item.name}</option>)}</select><button type="button" className="button secondary" onClick={() => { setSupplyReturnToPurchase(true); if (purchaseQuickSupplyId) { setShowPurchaseForm(true); openVariant(purchaseQuickSupplyId); } else startSupplyCreationForPurchase(); }}>{purchaseQuickSupplyId ? '＋ Crear variante y volver' : '＋ Crear insumo y variante'}</button></div></div>}
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
      {componentDraft && <form className="production-form pattern-editor-form pattern-editor-auxiliary" onSubmit={saveComponent}>
        <section className="pattern-editor-section">
          <div className="pattern-editor-section-heading">
            <div><strong>1. Datos del componente</strong><small>Identifica el elemento para reutilizarlo en distintos modelos.</small></div>
            <span className="pattern-editor-step">BÁSICO</span>
          </div>
          <div className="pattern-editor-basics-grid">
            <label className="field-label">Tipo de componente
              <select className="large-input" value={componentDraft.type} onChange={(e) => setComponentDraft({ ...componentDraft, type: e.target.value })}>{componentTypes.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className="field-label">Nombre
              <input className="large-input" value={componentDraft.name} onChange={(e) => setComponentDraft({ ...componentDraft, name: e.target.value })} placeholder="Ej. Cuello camisero clásico" required />
            </label>
            <label className="field-label">Fotografía de referencia <span className="pattern-editor-optional">Opcional · URL</span>
              <input className="large-input" value={componentDraft.imageUrl} onChange={(e) => setComponentDraft({ ...componentDraft, imageUrl: e.target.value })} placeholder="https://…" />
            </label>
            <label className="field-label">Descripción <span className="pattern-editor-optional">Opcional</span>
              <textarea className="large-input pattern-editor-textarea" rows={2} value={componentDraft.description} onChange={(e) => setComponentDraft({ ...componentDraft, description: e.target.value })} placeholder="Detalles para reconocer este componente…" />
            </label>
          </div>
        </section>

        <section className="pattern-editor-section">
          <div className="pattern-editor-section-heading">
            <div><strong>2. Piezas auxiliares</strong><small>Configura las piezas que forman este componente.</small></div>
            <span className="pattern-editor-count">{componentDraft.pieces.length} {componentDraft.pieces.length === 1 ? 'pieza' : 'piezas'}</span>
          </div>
          <div className="pattern-editor-piece-heading">
            <div><strong>Lista de piezas</strong><small>Tela y color se resolverán según el modelo comercial.</small></div>
            <button type="button" className="button secondary pattern-editor-add-button" onClick={() => setComponentDraft({ ...componentDraft, pieces: [...componentDraft.pieces, { id: id(), name: '', unitsPerGarment: 1, laterality: 'ninguna', fabricSlot: 'cualquiera', textileId: null, colorSlot: 'cualquiera', colorId: null }] })}>＋ Añadir pieza</button>
          </div>
          <div className="pattern-editor-piece-list">
            {componentDraft.pieces.map((piece, index) => {
              const secondaryIndex = secondaryFabricSlotIndex(piece.fabricSlot);
              const fabricKind = piece.fabricSlot === 'cualquiera' ? 'cualquiera' : piece.fabricSlot === 'principal' ? 'principal' : secondaryIndex > 0 ? 'secundaria' : 'ninguna';
              const colorSlot = normalizeComponentColorSlot(piece.colorSlot, piece.colorId);
              const colorIndex = secondaryColorSlotIndex(colorSlot);
              const colorKind = colorSlot === 'cualquiera' ? 'cualquiera' : colorSlot === 'principal' ? 'principal' : colorIndex > 0 ? 'secundaria' : 'ninguna';
              return <article className="pattern-editor-piece pattern-editor-aux-piece" key={piece.id}>
                <div className="pattern-editor-piece-top">
                  <div className="pattern-editor-piece-title"><span className="pattern-editor-piece-number">{String(index + 1).padStart(2, '0')}</span><div><strong>Pieza auxiliar {index + 1}</strong><small>Parte del componente</small></div></div>
                  <button type="button" className="remove-piece" onClick={() => setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.filter((x) => x.id !== piece.id) })}>Quitar pieza</button>
                </div>
                <div className="pattern-editor-piece-fields pattern-editor-aux-fields">
                  <label className="field-label">Nombre de pieza
                    <input className="large-input" value={piece.name} onChange={(e) => setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? { ...x, name: e.target.value } : x) })} placeholder="Ej. Pechera" required />
                  </label>
                  <label className="field-label">Posición de tela
                    <select className="large-input" value={fabricKind} onChange={(e) => {
                      const nextKind = e.target.value;
                      setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? {
                        ...x,
                        fabricSlot: (nextKind === 'principal' ? 'principal' : nextKind === 'cualquiera' ? 'cualquiera' : nextKind === 'secundaria' ? (secondaryFabricSlotIndex(x.fabricSlot) > 0 ? x.fabricSlot : 'secundaria_1') : 'ninguna') as ComponentFabricSlot,
                        textileId: null,
                      } : x) });
                    }}>
                      <option value="ninguna">Sin tela vinculada</option><option value="cualquiera">Cualquier tela</option><option value="principal">Tela principal 1</option><option value="secundaria">Tela secundaria</option>
                    </select>
                    {secondaryIndex > 0 && <span className="component-piece-secondary-index">
                      <span>N.º de tela secundaria</span>
                      <input className="large-input" type="number" min="1" step="1" aria-label="Número de tela secundaria" value={secondaryIndex} onChange={(e) => {
                        const slotIndex = Number(e.target.value);
                        if (!Number.isInteger(slotIndex) || slotIndex < 1) return;
                        setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? { ...x, fabricSlot: ('secundaria_' + slotIndex) as ComponentFabricSlot } : x) });
                      }} />
                    </span>}
                    <small>Una posición numerada hereda la tela del modelo. «Cualquier tela» permite decidirla en cada modelo.</small>
                  </label>
                  <label className="field-label">Posición de color
                    <select className="large-input" value={colorKind} onChange={(e) => {
                      const nextKind = e.target.value;
                      setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? {
                        ...x,
                        colorSlot: (nextKind === 'principal' ? 'principal' : nextKind === 'cualquiera' ? 'cualquiera' : nextKind === 'secundaria' ? (secondaryColorSlotIndex(normalizeComponentColorSlot(x.colorSlot, x.colorId)) > 0 ? normalizeComponentColorSlot(x.colorSlot, x.colorId) : 'secundaria_1') : 'ninguna') as ComponentColorSlot,
                      } : x) });
                    }}>
                      <option value="ninguna">Sin color vinculado</option><option value="cualquiera">Cualquier color</option><option value="principal">Color principal 1</option><option value="secundaria">Color secundario</option>
                    </select>
                    {colorIndex > 0 && <span className="component-piece-secondary-index">
                      <span>N.º de color secundario</span>
                      <input className="large-input" type="number" min="1" step="1" aria-label="Número de color secundario" value={colorIndex} onChange={(e) => {
                        const slotIndex = Number(e.target.value);
                        if (!Number.isInteger(slotIndex) || slotIndex < 1) return;
                        setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? { ...x, colorSlot: ('secundaria_' + slotIndex) as ComponentColorSlot } : x) });
                      }} />
                    </span>}
                    <small>Una posición numerada hereda el color del modelo; «Cualquier color» permite resolverlo al configurar cada modelo.</small>
                  </label>
                  <label className="field-label">Piezas por prenda
                    <input className="large-input" type="number" inputMode="numeric" min="1" step="1" value={piece.unitsPerGarment} onChange={(e) => setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? { ...x, unitsPerGarment: Number(e.target.value) } : x) })} />
                  </label>
                  <label className="field-label">Lateralidad
                    <select className="large-input" value={piece.laterality} onChange={(e) => setComponentDraft({ ...componentDraft, pieces: componentDraft.pieces.map((x, i) => i === index ? { ...x, laterality: e.target.value as ComponentPiece['laterality'] } : x) })}>
                      <option value="ninguna">Sin lado</option><option value="simetrica">Simétrica</option><option value="izquierda">Solo izquierda</option><option value="derecha">Solo derecha</option>
                    </select>
                  </label>
                </div>
              </article>;
            })}
            {componentDraft.pieces.length === 0 && <div className="pattern-editor-empty"><strong>Este componente aún no tiene piezas</strong><span>Añade una pieza para describir su construcción.</span><button type="button" className="button secondary" onClick={() => setComponentDraft({ ...componentDraft, pieces: [...componentDraft.pieces, { id: id(), name: '', unitsPerGarment: 1, laterality: 'ninguna', fabricSlot: 'cualquiera', textileId: null, colorSlot: 'cualquiera', colorId: null }] })}>＋ Añadir primera pieza</button></div>}
          </div>
        </section>

        <section className="pattern-editor-section pattern-editor-material-section">
          <div className="pattern-editor-section-heading"><div><strong>3. Materiales y consumos</strong><small>Define los avíos y materiales asociados a este componente.</small></div></div>
          <MaterialEditor materials={componentDraft.materials} onChange={(materials) => setComponentDraft({ ...componentDraft, materials })} variants={variants} supplies={supplies} sizes={sizes} title="Materiales y consumos del componente" onCreateSupplyVariant={createSupplyVariantFromMaterial} allowSizeSpecifications />
        </section>

        <div className="form-actions pattern-editor-actions"><button type="button" className="button secondary" onClick={cancelComponentDraft}>Cancelar</button><button className="button primary">Guardar componente</button></div>
      </form>}
      <div className="production-component-grid">
        {data.components.filter((x) => x.active).map((component) => <article className="production-card" key={component.id}>
          {component.imageUrl && <img className="production-component-image" src={component.imageUrl} alt="" />}
          <div className="production-card-heading"><div><strong>{component.name}</strong><span>{component.type} · {component.pieces.length} piezas de patronaje · {component.materials.length} materiales</span></div><button className="button secondary" onClick={() => openComponent(component)}>Editar</button></div>
          {component.description && <p className="production-muted">{component.description}</p>}
          <div className="production-attributes">{component.pieces.map((x) => <span key={x.id}>{x.name} ×{x.unitsPerGarment}{x.fabricSlot !== 'ninguna' ? ' · ' + componentFabricSlotLabel(x.fabricSlot) : ''}{' · ' + componentColorSlotLabel(x.colorSlot ?? (x.colorId ? 'principal' : 'cualquiera'))}</span>)}</div>
          <small className="production-muted">Molde auxiliar reutilizable. La tela y el color se concretan al configurar cada modelo; el control de existencias se incorporará en una etapa posterior.</small>
        </article>)}
      </div>
      {data.components.length === 0 && <div className="empty">Crea tu primer cuello, bolsillo o acabado reutilizable.</div>}
    </section>;

    if (view === 'modelos-producto' && selectedPieceConfigurationProductId) {
      const product = data.productModels.find((item) => item.id === selectedPieceConfigurationProductId && item.active);
      const base = product ? baseModels.find((item) => item.id === product.baseModelId) : undefined;
      if (!product || !base) return <section className="panel production-panel">
        <div className="panel-heading"><div><h2>Materiales por pieza</h2><p>No se encontró el modelo seleccionado.</p></div></div>
        <button className="button secondary" onClick={() => setSelectedPieceConfigurationProductId('')}>Volver a modelos</button>
      </section>;

      const assignedTextile = (slot: string) => {
        if (slot === 'ninguna' || slot === 'cualquiera') return null;
        return data.productFabrics.find((assignment) => assignment.productModelId === product.id && assignment.fabricSlot === slot)?.textileId ?? null;
      };
      const assignedColor = (slot: string) => {
        if (slot === 'ninguna' || slot === 'cualquiera') return null;
        return resolveComponentPieceColorId(product.id, slot, data.productColors);
      };
      const basePieceRows: ProductMaterialPieceRow[] = basePieces
        .filter((piece) => piece.modelId === base.id && !piece.archived)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((piece) => {
          const override = product.basePieceOverrides?.[piece.id];
          const fabricSlot = piece.fabricSlot ?? 'principal';
          const colorSlot = normalizeComponentColorSlot(piece.colorSlot, piece.colorId);
          const hasTextileOverride = Boolean(override && Object.prototype.hasOwnProperty.call(override, 'textileId'));
          const hasColorOverride = Boolean(override && Object.prototype.hasOwnProperty.call(override, 'colorId'));
          const defaultTextileId = assignedTextile(fabricSlot);
          const defaultColorId = assignedColor(colorSlot) ?? (colorSlot === 'ninguna' ? piece.colorId ?? null : null);
          return {
            key: 'base:' + piece.id,
            pieceId: piece.id,
            scope: 'base',
            selectionId: '',
            pieceName: piece.name,
            groupName: 'Molde del patrón base',
            fabricSlot,
            colorSlot,
            textileId: hasTextileOverride ? override?.textileId ?? null : defaultTextileId,
            colorId: hasColorOverride ? override?.colorId ?? null : defaultColorId,
            textileStatus: hasTextileOverride ? 'Personalizada para este modelo' : fabricSlot === 'cualquiera' ? 'Elegir para este modelo' : fabricSlot === 'ninguna' ? 'Sin posición definida' : 'Heredada · ' + componentFabricSlotLabel(fabricSlot),
            colorStatus: hasColorOverride ? 'Personalizada para este modelo' : colorSlot === 'cualquiera' ? 'Elegir para este modelo' : colorSlot === 'ninguna' ? 'Sin posición definida' : 'Heredado · ' + componentColorSlotLabel(colorSlot),
            hasTextileOverride,
            hasColorOverride,
          };
        });
      const linkedComponentIds = new Set(product.components.map((selection) => selection.componentId));
      const linkedComponentsWithoutPieces = product.components.flatMap((selection) => {
        const component = data.components.find((item) => item.id === selection.componentId);
        return component && component.pieces.length === 0 ? [{ selection, component }] : [];
      });
      const availableComponentsToAdd = data.components.filter((component) => component.active && !linkedComponentIds.has(component.id) && component.pieces.length > 0);
      const componentPieceGroups = product.components.flatMap((selection) => {
        const component = data.components.find((item) => item.id === selection.componentId);
        if (!component) return [];
        const rows: ProductMaterialPieceRow[] = component.pieces.map((piece) => {
          const override = selection.pieceOverrides?.[piece.id];
          const colorSlot = normalizeComponentColorSlot(piece.colorSlot, piece.colorId);
          const hasTextileOverride = Boolean(override && Object.prototype.hasOwnProperty.call(override, 'textileId'));
          const hasColorOverride = Boolean(override && Object.prototype.hasOwnProperty.call(override, 'colorId'));
          const defaultTextileId = resolveComponentPieceTextileId(product.id, piece.fabricSlot, data.productFabrics);
          const defaultColorId = assignedColor(colorSlot) ?? (colorSlot === 'ninguna' ? piece.colorId : null) ?? null;
          return {
            key: 'component:' + selection.id + ':' + piece.id,
            pieceId: piece.id,
            scope: 'component',
            selectionId: selection.id,
            pieceName: piece.name,
            groupName: component.name,
            fabricSlot: piece.fabricSlot,
            colorSlot,
            textileId: hasTextileOverride ? override?.textileId ?? null : defaultTextileId,
            colorId: hasColorOverride ? override?.colorId ?? null : defaultColorId,
            textileStatus: hasTextileOverride ? 'Personalizada para este modelo' : piece.fabricSlot === 'cualquiera' ? 'Elegir para este modelo' : piece.fabricSlot === 'ninguna' ? 'Sin posición definida' : 'Heredada · ' + componentFabricSlotLabel(piece.fabricSlot),
            colorStatus: hasColorOverride ? 'Personalizada para este modelo' : colorSlot === 'cualquiera' ? 'Elegir para este modelo' : colorSlot === 'ninguna' ? 'Sin posición definida' : 'Heredado · ' + componentColorSlotLabel(colorSlot),
            hasTextileOverride,
            hasColorOverride,
          };
        });
        return rows.length > 0 ? [{ selection, component, rows }] : [];
      });
      const totalPieces = basePieceRows.length + componentPieceGroups.reduce((sum, group) => sum + group.rows.length, 0);
      const renderMaterialPiece = (row: ProductMaterialPieceRow) => <article className="piece-material-card" key={row.key}>
        <div className="piece-material-card-heading">
          <div className="piece-material-icon"><span>◇</span></div>
          <div className="piece-material-card-title"><strong>{row.pieceName}</strong><small>{row.groupName}</small></div>
        </div>
        <div className="piece-material-fields">
          <label className="field-label">
            <span>Tela asignada</span>
            <select className="large-input" value={row.textileId ?? ''} onChange={(event) => updateProductPieceOverride(product.id, row.scope, row.selectionId, row.pieceId, 'textileId', event.target.value || null)}>
              <option value="">Sin tela asignada</option>
              {row.textileId && !activeTextiles.some((textile) => textile.id === row.textileId) && <option value={row.textileId}>{textileContext.telas.find((textile) => textile.id === row.textileId)?.nombreTela ?? 'Tela fuera del catálogo'} · inactiva</option>}
              {activeTextiles.map((textile) => <option value={textile.id} key={textile.id}>{textile.nombreTela}</option>)}
            </select>
            <small>{row.textileStatus}</small>
            {row.hasTextileOverride && <button type="button" className="piece-material-reset" onClick={() => updateProductPieceOverride(product.id, row.scope, row.selectionId, row.pieceId, 'textileId', undefined)}>Restablecer posición heredada</button>}
          </label>
          <label className="field-label">
            <span>Color asignado</span>
            <select className="large-input" value={row.colorId ?? ''} onChange={(event) => updateProductPieceOverride(product.id, row.scope, row.selectionId, row.pieceId, 'colorId', event.target.value || null)}>
              <option value="">Sin color asignado</option>
              {row.colorId && !textileContext.colores.some((color) => color.id === row.colorId) && <option value={row.colorId}>{componentColorName(row.colorId)} · no disponible</option>}
              {textileContext.colores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((color) => <option value={color.id} key={color.id}>{color.nombre}</option>)}
            </select>
            <small>{row.colorStatus}</small>
            {row.hasColorOverride && <button type="button" className="piece-material-reset" onClick={() => updateProductPieceOverride(product.id, row.scope, row.selectionId, row.pieceId, 'colorId', undefined)}>Restablecer posición heredada</button>}
          </label>
        </div>
      </article>;

      return <section className="panel production-panel piece-material-view">
        <div className="piece-material-view-header">
          <button type="button" className="button secondary piece-material-back" onClick={() => setSelectedPieceConfigurationProductId('')}>← Volver a modelos</button>
          <div className="eyebrow">CONFIGURACIÓN DEL MODELO</div>
          <h2>Materiales por pieza</h2>
          <p><strong>{product.name}</strong> · {base.name}</p>
          <span className="piece-material-help">Cambia la tela o el color de una pieza sin modificar el patrón base ni la biblioteca de componentes. Los cambios se guardan automáticamente en este modelo.</span>
          <div className="piece-material-summary"><span>{basePieceRows.length} moldes base</span><span>{componentPieceGroups.reduce((sum, group) => sum + group.rows.length, 0)} piezas auxiliares</span><span>{totalPieces} piezas en total</span></div>
        </div>
        {basePieceRows.length > 0 && <section className="piece-material-group">
          <div className="piece-material-group-heading"><h3>Moldes del patrón base</h3><span>{basePieceRows.length}</span></div>
          {basePieceRows.map(renderMaterialPiece)}
        </section>}
        <section className="piece-material-auxiliary-manager">
          <div className="piece-material-auxiliary-heading">
            <div><strong>Componentes auxiliares del modelo</strong><small>Agrega aquí un cuello, bolsillo, puño, pretina u otro componente de tu biblioteca.</small></div>
            <span>{componentPieceGroups.reduce((sum, group) => sum + group.rows.length, 0)} piezas</span>
          </div>
          {componentPieceGroups.length === 0 && <div className="piece-material-auxiliary-empty">
            <strong>Este modelo todavía no tiene piezas auxiliares.</strong>
            <span>Selecciona un componente de la biblioteca para incorporarlo. Sus piezas aparecerán debajo con sus asignaciones de tela y color.</span>
          </div>}
          {availableComponentsToAdd.length > 0 ? <div className="piece-material-add-component">
            <label className="field-label">Componente disponible
              <select className="large-input" value={componentToAddInPieceConfiguration} onChange={(event) => setComponentToAddInPieceConfiguration(event.target.value)}>
                <option value="">Seleccionar componente de la biblioteca</option>
                {availableComponentsToAdd.map((component) => {
                  const requiresSizeSpecification = component.materials.some((material) => material.specificationLabel?.trim());
                  return <option key={component.id} value={component.id} disabled={requiresSizeSpecification}>{component.name} · {component.pieces.length} {component.pieces.length === 1 ? 'pieza' : 'piezas'}{requiresSizeSpecification ? ' · requiere medidas por talla' : ''}</option>;
                })}
              </select>
            </label>
            <button type="button" className="button primary" disabled={!componentToAddInPieceConfiguration} onClick={() => addComponentToPieceConfiguration(product.id, componentToAddInPieceConfiguration)}>＋ Añadir al modelo</button>
          </div> : <div className="piece-material-no-components">
            {data.components.some((component) => component.active && !linkedComponentIds.has(component.id) && component.pieces.length > 0)
              ? 'Los componentes restantes requieren configurar medidas por talla antes de agregarlos desde esta vista.'
              : data.components.some((component) => component.active && !linkedComponentIds.has(component.id))
                ? 'Los componentes de la biblioteca todavía no tienen piezas auxiliares definidas.'
                : data.components.some((component) => component.active && linkedComponentIds.has(component.id))
                  ? 'Todos los componentes con piezas de la biblioteca ya están asociados a este modelo.'
                  : 'Todavía no hay componentes activos con piezas en la biblioteca.'}
            <button type="button" className="text-action" onClick={() => onNavigate('componentes')}>Abrir biblioteca de componentes</button>
          </div>}
        </section>
        {componentPieceGroups.map(({ selection, component, rows }) => <section className="piece-material-group piece-material-auxiliary-group" key={selection.id}>
          <div className="piece-material-group-heading"><h3>{component.name}</h3><span>{rows.length} piezas</span></div>
          {rows.map(renderMaterialPiece)}
        </section>)}
        {linkedComponentsWithoutPieces.map(({ selection, component }) => <section className="piece-material-group piece-material-auxiliary-group piece-material-missing-component" key={selection.id}>
          <div className="piece-material-group-heading"><h3>{component.name}</h3><span>Sin piezas</span></div>
          <div className="piece-material-auxiliary-empty">
            <strong>Este componente está asociado, pero su ficha no tiene piezas auxiliares.</strong>
            <span>Completa las piezas en la biblioteca de componentes. Al volver, aparecerán aquí para asignarles tela y color.</span>
            <button type="button" className="text-action" onClick={() => onNavigate('componentes')}>Abrir este componente en la biblioteca</button>
          </div>
        </section>)}
        {totalPieces === 0 && basePieceRows.length === 0 && linkedComponentsWithoutPieces.length === 0 && <div className="empty">Este modelo todavía no tiene moldes ni piezas auxiliares.</div>}
        <div className="piece-material-view-footer"><button type="button" className="button secondary" onClick={() => setSelectedPieceConfigurationProductId('')}>Volver a modelos</button></div>
      </section>;
    }

    if (view === 'modelos-producto') return <section className="panel production-panel">
      <div className="panel-heading"><div><h2>Crear modelo de prenda</h2><p>Selecciona un patrón base y agrega los componentes que distinguen el diseño.</p></div></div>
      <form className="production-form" onSubmit={saveProduct}>
        <div className="production-form-grid">
          <label className="field-label">Nombre comercial<input className="large-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Ej. Polo escolar cuello camisero" required /></label>
          <div className="field-label production-span-2"><span>Colección *</span><div className="production-collection-control"><select className="large-input" value={productCollectionId} onChange={(e) => setProductCollectionId(e.target.value)} required><option value="">Seleccionar colección guardada</option>{data.productCollections.filter((x) => x.active).slice().sort((a, b) => a.name.localeCompare(b.name, 'es')).map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select><button type="button" className="button secondary" onClick={() => setShowProductCollectionCreator((current) => !current)}>＋ Nueva colección</button></div>{showProductCollectionCreator && <div className="production-collection-create"><input className="large-input" value={newProductCollectionName} onChange={(e) => setNewProductCollectionName(e.target.value)} placeholder="Nombre de la nueva colección" aria-label="Nombre de la nueva colección" /><div className="production-collection-actions"><button type="button" className="button primary" onClick={createProductCollection}>Guardar colección</button><button type="button" className="button secondary" onClick={() => { setShowProductCollectionCreator(false); setNewProductCollectionName(''); }}>Cancelar</button></div></div>}{data.productCollections.filter((x) => x.active).length === 0 && !showProductCollectionCreator && <small>Primero crea una colección; después podrás reutilizarla en otros modelos.</small>}</div>
          <div className="product-base-pattern-field">
            <label className="field-label">Patrón base<select className="large-input" value={productBaseId} onChange={(e) => { setProductBaseId(e.target.value); setProductFabricAssignments({}); setProductColorAssignments({}); setProductPieceOverrides({}); }} required><option value="">Seleccionar patrón existente</option>{baseModels.map((x) => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
            <button type="button" className="text-action" onClick={() => onQuickCreateBaseModel((modelId) => { setProductBaseId(modelId); setProductFabricAssignments({}); setProductColorAssignments({}); setProductPieceOverrides({}); })}>＋ Crear patrón base</button>
            {baseModels.length === 0 && <small>No hay patrones disponibles. Crea uno aquí; al guardarlo aparecerá en esta lista.</small>}
          </div>
          <div className="product-inherited-size-tag"><span>Tallas habilitadas por el patrón</span><strong>{sizeGroups.find((group) => group.id === selectedProductBasePattern?.sizeGroupId)?.name ?? 'Selecciona un patrón base'}{selectedProductBasePattern ? ` · ${selectedProductBaseSizes.length} tallas` : ''}</strong></div>
        </div>
        {selectedProductBasePattern && <section className="product-fabric-assignment-section">
          <div className="production-subheading"><strong>Telas del modelo</strong><span className="production-muted">Asigna una tela a cada posición del patrón</span></div>
          <p className="production-muted">Estas telas se seleccionan del catálogo existente. El molde base conserva sus posiciones; cada modelo comercial puede usar telas diferentes.</p>
          {activeTextiles.length === 0 && <div className="notice info">No hay telas activas todavía. Usa «Crear tela y asignarla aquí» debajo de cada posición.</div>}
          <div className="product-fabric-slots">{selectedProductFabricSlots.map((slot) => <label className="field-label" key={slot}>
            <span>{productFabricSlotLabel(slot)}</span>
            <select className="large-input" value={productFabricAssignments[slot] ?? ''} disabled={activeTextiles.length === 0} onChange={(e) => setProductFabricAssignments((current) => ({ ...current, [slot]: e.target.value }))} required>
              <option value="">Seleccionar tela del catálogo</option>
              {activeTextiles.map((textile) => <option key={textile.id} value={textile.id}>{textile.nombreTela}</option>)}
            </select>
            <button type="button" className="text-action" onClick={() => openQuickTextile({ kind: 'product', slot })}>＋ Crear tela y asignarla aquí</button>
          </label>)}</div>
        </section>}
        {selectedProductBasePattern && selectedProductColorSlots.length > 0 && <section className="product-fabric-assignment-section">
          <div className="production-subheading"><strong>Colores del modelo</strong><span className="production-muted">Solo las posiciones que necesitan los moldes y componentes elegidos</span></div>
          <p className="production-muted">Asigna aquí cada color compartido una sola vez. Las piezas «Cualquier color» se configuran individualmente más abajo.</p>
          {textileContext.colores.length === 0 && <div className="notice info">No hay colores en el catálogo global. Crea el primero desde cualquiera de las posiciones.</div>}
          <div className="product-fabric-slots">{selectedProductColorSlots.map((slot) => <label className="field-label" key={slot}>
            <span>{productColorSlotLabel(slot)}</span>
            <select className="large-input" value={productColorAssignments[slot] ?? ''} disabled={textileContext.colores.length === 0} onChange={(e) => setProductColorAssignments((current) => ({ ...current, [slot]: e.target.value }))} required>
              <option value="">Seleccionar color del catálogo</option>
              {textileContext.colores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((color) => <option key={color.id} value={color.id}>{color.nombre}</option>)}
            </select>
            <button type="button" className="text-action" onClick={() => openQuickProductColor(slot)}>＋ Crear color y asignarlo aquí</button>
          </label>)}</div>
        </section>}
        {selectedProductBasePattern && selectedProductColorSlots.length === 0 && <div className="notice info">Los moldes y componentes seleccionados no requieren colores compartidos. Las piezas configuradas como «Cualquier color» se asignan individualmente.</div>}
        {selectedProductBaseWildcardPieces.length > 0 && <section className="product-fabric-assignment-section">
          <div className="production-subheading"><strong>Asignaciones de moldes comodín</strong><span className="production-muted">Solo para este modelo comercial</span></div>
          <p className="production-muted">Estos moldes del patrón se definieron como «Cualquier tela» o «Cualquier color». Selecciona aquí sus valores concretos sin modificar el patrón reutilizable.</p>
          {selectedProductBaseWildcardPieces.map((piece) => {
            const key = 'base:' + piece.id;
            const current = productPieceOverrides[key] ?? { textileId: null, colorId: null };
            const colorSlot = piece.colorSlot ?? (piece.colorId ? 'principal' : 'ninguna');
            return <article className="product-material-spec-card" key={piece.id}>
              <strong>{piece.name}</strong>
              {piece.fabricSlot === 'cualquiera' && <label className="field-label">Tela concreta
                <select className="large-input" value={current.textileId ?? ''} onChange={(event) => setProductPieceOverrides((state) => ({ ...state, [key]: { ...current, textileId: event.target.value || null } }))} required>
                  <option value="">Seleccionar tela</option>{activeTextiles.map((textile) => <option key={textile.id} value={textile.id}>{textile.nombreTela}</option>)}
                </select>
              </label>}
              {colorSlot === 'cualquiera' && <label className="field-label">Color concreto
                <select className="large-input" value={current.colorId ?? ''} onChange={(event) => setProductPieceOverrides((state) => ({ ...state, [key]: { ...current, colorId: event.target.value || null } }))} required>
                  <option value="">Seleccionar color</option>{textileContext.colores.map((color) => <option key={color.id} value={color.id}>{color.nombre}</option>)}
                </select>
              </label>}
            </article>;
          })}
        </section>}
        <label className="field-label">Descripción (opcional)<input className="large-input" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="Color, temporada, cliente…" /></label>
        <div className="production-subheading"><strong>Componentes y acabados</strong><span className="production-muted">Selecciona los que lleva esta prenda</span></div>
        {data.components.filter((x) => x.active).length === 0 && <div className="notice info"><span>Esta prenda todavía no tiene componentes. Puedes continuar sin ellos o crear uno ahora.</span><button type="button" className="button secondary" onClick={createComponentFromProduct}>＋ Crear componente y volver</button></div>}
        <div className="production-check-list">{data.components.filter((x) => x.active).map((component) => <label key={component.id}>
          <input type="checkbox" checked={productComponentIds.includes(component.id)} onChange={(event) => {
            const checked = event.target.checked;
            setProductComponentIds((current) => checked ? [...current, component.id] : current.filter((x) => x !== component.id));
            if (checked) setProductMaterialSpecsDraft((current) => {
              const next = { ...current };
              component.materials.filter((material) => material.specificationLabel?.trim()).forEach((material) => {
                next[material.id] = next[material.id] ?? { label: material.specificationLabel ?? 'Medida', rules: [{ id: id(), value: '', sizeIds: [] }] };
              });
              return next;
            });
          }} />
          <span><strong>{component.name}</strong><small>{component.type} · {component.materials.length} materiales asociados</small></span>
        </label>)}</div>
        {selectedProductComponentWildcardPieces.length > 0 && <section className="product-fabric-assignment-section">
          <div className="production-subheading"><strong>Asignaciones de componentes comodín</strong><span className="production-muted">Valores específicos de esta prenda</span></div>
          <p className="production-muted">Cuando una pieza de la biblioteca permite «Cualquier tela» o «Cualquier color», concreta aquí su material y color para este modelo.</p>
          {selectedProductComponentWildcardPieces.map(({ component, piece }) => {
            const key = component.id + ':' + piece.id;
            const current = productPieceOverrides[key] ?? { textileId: null, colorId: null };
            const colorSlot = piece.colorSlot ?? (piece.colorId ? 'principal' : 'cualquiera');
            return <article className="product-material-spec-card" key={key}>
              <strong>{component.name} · {piece.name}</strong>
              {piece.fabricSlot === 'cualquiera' && <label className="field-label">Tela concreta
                <select className="large-input" value={current.textileId ?? ''} onChange={(event) => setProductPieceOverrides((state) => ({ ...state, [key]: { ...current, textileId: event.target.value || null } }))} required>
                  <option value="">Seleccionar tela</option>{activeTextiles.map((textile) => <option key={textile.id} value={textile.id}>{textile.nombreTela}</option>)}
                </select>
              </label>}
              {colorSlot === 'cualquiera' && <label className="field-label">Color concreto
                <select className="large-input" value={current.colorId ?? ''} onChange={(event) => setProductPieceOverrides((state) => ({ ...state, [key]: { ...current, colorId: event.target.value || null } }))} required>
                  <option value="">Seleccionar color</option>{textileContext.colores.map((color) => <option key={color.id} value={color.id}>{color.nombre}</option>)}
                </select>
              </label>}
            </article>;
          })}
        </section>}
        {selectedProductMaterialRows.length > 0 && <section className="product-material-spec-section">
          <div className="production-subheading"><strong>Características de avíos por talla</strong><span className="production-muted">Se configuran para este modelo, no en el inventario.</span></div>
          <p className="production-muted">Agrupa las tallas que comparten una misma medida. Solo se mostrarán las tallas del patrón base «{selectedProductBasePattern?.name ?? 'seleccionado'}».</p>
          {selectedProductMaterialRows.map(({ component, material }) => {
            const draft = productMaterialSpecsDraft[material.id] ?? { label: material.specificationLabel ?? 'Medida', rules: [] };
            const assignedSizeIds = draft.rules.flatMap((rule) => rule.sizeIds);
            const missingLabels = selectedProductBaseSizes.filter((size) => !assignedSizeIds.includes(size.id)).map((size) => size.label);
            return <article className="product-material-spec-card" key={component.id + ':' + material.id}>
              <div><strong>{component.name} · {variantLabel(variantsBySupply.get(material.variantId) ?? { id: '', supplyId: '', name: 'Insumo', attributes: {}, textileId: null, textileColorId: null, purchasePackQuantity: null, purchasePackLabel: '', active: true }, data.variants, supplies)}</strong><small>Define la característica que cambia con la talla.</small></div>
              <label className="field-label">Nombre de la característica
                <input className="large-input" value={draft.label} onChange={(event) => setProductMaterialSpecsDraft((current) => ({ ...current, [material.id]: { ...draft, label: event.target.value } }))} placeholder="Longitud, ancho, grosor…" />
              </label>
              {draft.rules.map((rule, ruleIndex) => {
                const otherAssigned = new Set(draft.rules.filter((_, index) => index !== ruleIndex).flatMap((item) => item.sizeIds));
                return <div className="product-material-spec-rule" key={rule.id}>
                  <div className="production-form-grid">
                    <label className="field-label">Medida para este grupo
                      <input className="large-input" value={rule.value} onChange={(event) => setProductMaterialSpecsDraft((current) => ({ ...current, [material.id]: { ...draft, rules: draft.rules.map((item, index) => index === ruleIndex ? { ...item, value: event.target.value } : item) } }))} placeholder="Ej. 13 cm" />
                    </label>
                    <button type="button" className="text-action danger-action" onClick={() => setProductMaterialSpecsDraft((current) => ({ ...current, [material.id]: { ...draft, rules: draft.rules.filter((_, index) => index !== ruleIndex) } }))}>Quitar grupo</button>
                  </div>
                  <details className="product-material-spec-sizes">
                    <summary>Seleccionar tallas · {rule.sizeIds.length} seleccionadas</summary>
                    <div className="product-material-size-options">
                      {selectedProductBaseSizes.map((size) => <label key={size.id}>
                        <input type="checkbox" checked={rule.sizeIds.includes(size.id)} disabled={otherAssigned.has(size.id)} onChange={(event) => setProductMaterialSpecsDraft((current) => ({ ...current, [material.id]: { ...draft, rules: draft.rules.map((item, index) => index === ruleIndex ? { ...item, sizeIds: event.target.checked ? [...item.sizeIds, size.id] : item.sizeIds.filter((id) => id !== size.id) } : item) } }))} />
                        <span>{size.label}</span>
                      </label>)}
                    </div>
                  </details>
                </div>;
              })}
              <button type="button" className="text-action" onClick={() => setProductMaterialSpecsDraft((current) => ({ ...current, [material.id]: { ...draft, rules: [...draft.rules, { id: id(), value: '', sizeIds: [] }] } }))}>＋ Añadir grupo de tallas</button>
              {missingLabels.length > 0 && <small className="production-shortage">Falta asignar: {missingLabels.join(', ')}</small>}
              {missingLabels.length === 0 && <small className="production-ok">Todas las tallas del patrón tienen una medida asignada.</small>}
            </article>;
          })}
        </section>}
        <div className="form-actions"><button className="button primary" disabled={baseModels.length === 0}>Guardar modelo configurado</button></div>
      </form>
      <div className="production-subheading"><strong>Modelos configurados</strong><span className="count-badge">{data.productModels.filter((x) => x.active).length}</span></div>
      <div className="production-list">{data.productModels.filter((x) => x.active).map((product) => {
        const base = baseModels.find((x) => x.id === product.baseModelId);
        const familyLabel = families.find((x) => x.value === base?.family)?.label ?? (base?.family || 'Familia sin definir');
        const collectionName = data.productCollections.find((collection) => collection.id === product.collectionId)?.name ?? 'Sin colección';
        const productSizeGroup = sizeGroups.find((group) => group.id === base?.sizeGroupId);
        const productFabricRows = data.productFabrics.filter((assignment) => assignment.productModelId === product.id);
        const productFabricSummary = base ? productFabricSlotsForBaseModel(base).map((slot) => {
          const assignment = productFabricRows.find((item) => item.fabricSlot === slot);
          const textile = assignment ? textileContext.telas.find((item) => item.id === assignment.textileId) : undefined;
          return productFabricSlotLabel(slot) + ': ' + (textile?.nombreTela ?? 'Sin asignar');
        }).join(' · ') : 'Sin patrón base';
        const productColorRows = data.productColors.filter((assignment) => assignment.productModelId === product.id);
        const productComponentsForColors = product.components.flatMap((selection) => {
          const component = data.components.find((item) => item.id === selection.componentId && item.active);
          return component ? [component] : [];
        });
        const productColorSummary = base ? productColorSlotsForConfiguredModel(base.id, basePieces, productComponentsForColors).map((slot) => {
          const assignment = productColorRows.find((item) => item.colorSlot === slot);
          const color = assignment ? textileContext.colores.find((item) => item.id === assignment.colorId) : undefined;
          return productColorSlotLabel(slot) + ': ' + (color?.nombre ?? 'Sin asignar');
        }).join(' · ') : '';
        return <article className="production-card" key={product.id}>
          <div className="production-card-heading"><div><strong>{product.name}</strong><div className="production-model-meta"><span className="production-family-tag">{familyLabel}</span><span>Colección: {collectionName}</span><span>Patrón: {base?.name ?? 'No disponible'}</span><span>Tallas: {productSizeGroup?.name ?? 'No disponible'}</span></div><small className="production-product-fabric-summary">{productFabricSummary}</small><small className="production-product-fabric-summary">{productColorSummary}</small></div></div>
          <div className="production-attributes">{product.components.map((x) => <span key={x.id}>{data.components.find((c) => c.id === x.componentId)?.name ?? 'Componente archivado'} ×{x.quantity}</span>)}</div>
          <div className="production-card-actions">
            <button className="button secondary" onClick={() => openProductFabricEditor(product)}>Configurar telas</button>
            <button className="button secondary" onClick={() => openProductColorEditor(product)}>Configurar colores</button>
            <button className="button primary" onClick={() => setSelectedPieceConfigurationProductId(product.id)}>Ver piezas y materiales</button>
            <button className="text-action danger-action" onClick={() => deleteProduct(product)}>Archivar</button>
          </div>
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
        <MaterialEditor materials={recipeDraft.materials} onChange={(materials) => setRecipeDraft({ ...recipeDraft, materials })} variants={variants} supplies={supplies} sizes={sizes} title="Materiales generales de confección" onCreateSupplyVariant={createSupplyVariantFromMaterial} />
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
          const orderMaterialsToShow = order.actualConsumption?.materials ?? order.materials;
          const materialText = orderMaterialsToShow.map((line) => {
            const variant = variantsBySupply.get(line.variantId) ?? data.variants.find((item) => item.id === line.variantId);
            const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
            const size = sizes.find((item) => item.id === line.sizeId);
            const variantLabelText = supply?.stockMode === 'none' ? '' : ' ' + (variant?.name ?? '');
            const specificationText = line.specificationValue ? ' · ' + line.specificationValue : '';
            return (supply?.name ?? 'Material') + variantLabelText + ': ' + format(line.quantity) + ' ' + unitLabel[line.unit] + (size ? ' (' + size.label + ')' : '') + specificationText;
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
              {order.actualConsumption ? (
                order.actualConsumption.materialCost === null
                  ? <span>Consumo real registrado · costo pendiente en {order.actualConsumption.missingCostLines} líneas</span>
                  : <span>Consumo real valorizado: <strong>{money(order.actualConsumption.materialCost)}</strong></span>
              ) : order.estimatedMaterialCost === null
                ? <span>Costo estimado pendiente · {order.missingCostLines} materiales sin precio de compra</span>
                : <span>Estimado según últimos precios registrados: <strong>{money(order.estimatedMaterialCost)}</strong></span>}
            </div>
            <div className="production-order-actions">
              {order.status === 'borrador' && <button className="button primary" onClick={() => reserveProductionOrder(order.id)}>Verificar y reservar stock</button>}
              {order.status === 'reservada' && <button className="button primary" onClick={() => startProductionOrder(order.id)}>Iniciar producción</button>}
              {order.status === 'en_proceso' && <button className="button primary" onClick={() => openProductionOrderCompletion(order.id)}>Registrar consumo real y completar</button>}
              {(order.status === 'borrador' || holdingStatuses.includes(order.status)) && <button className="button secondary danger-action" onClick={() => cancelProductionOrder(order.id)}>{order.status === 'borrador' ? 'Descartar borrador' : 'Cancelar y liberar reserva'}</button>}
            </div>
          </article>;
        })}
        {data.productionOrders.length === 0 && <div className="empty"><p>Todavía no hay órdenes de producción.</p><button type="button" className="button secondary" onClick={() => onNavigate(data.productModels.some((product) => product.active) ? 'planificacion' : 'modelos-producto')}>{data.productModels.some((product) => product.active) ? '＋ Ir a Planificar' : '＋ Crear modelo de prenda'}</button></div>}
      </div>
      <p className="production-muted">Una orden en borrador no reserva stock. Las órdenes reservadas o en proceso apartan existencias; cancelar libera la reserva. Al completar, TelaStock registra salidas de insumos, rollos, moldes base y piezas auxiliares.</p>
    </section>;

    return <section className="panel production-panel">
      <div className="panel-heading"><div><h2>Planificación de materiales</h2><p>Indica cuántas prendas necesitas por talla. TelaStock calcula los consumos configurados.</p></div></div>
      <label className="field-label">Modelo de prenda<select className="large-input" value={selectedProductId} onChange={(e) => { setSelectedProductId(e.target.value); setPlanCounts({}); }}><option value="">Seleccionar modelo</option>{data.productModels.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      {activeProduct && (() => {
        const productSizes = productSizeOptions(activeProduct);
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
              const specificationSummary = Object.entries(row.specificationsBySize).map(([sizeId, labels]) =>
                (sizes.find((size) => size.id === sizeId)?.label ?? 'Talla') + ': ' + labels.join(' · ')
              );
              return <tr key={row.variantId}>
                <td><strong>{supply.name}</strong>{supply.stockMode !== 'none' && <small>{variant.name}</small>}
                  {specificationSummary.length > 0 && <small>{specificationSummary.join(' · ')}</small>}
                  {row.missingSizes.length > 0 && <em>Consumo o medida pendiente: {row.missingSizes.join(', ')}</em>}
                  {supply.stockMode === 'none' && <small className="production-muted">Sin inventario · se compra según las medidas del modelo</small>}
                </td>
                <td>{format(row.total)} {supply.baseUnit}</td>
                <td>{row.available === null ? 'No controlado' : format(row.available) + ' ' + supply.baseUnit}</td>
                <td className={row.shortage !== null && row.shortage > 0 || row.missingSizes.length > 0 ? 'production-shortage' : 'production-ok'}>{row.shortage === null ? '—' : format(row.shortage) + ' ' + supply.baseUnit}</td>
                <td>{row.packs === null ? (supply.stockMode === 'none' ? 'Según modelo' : row.shortage !== null && row.shortage > 0 ? 'Sin presentación' : '—') : row.packs + ' ' + (variant.purchasePackLabel || 'paquete(s)')}</td>
              </tr>;
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
      {!activeProduct && data.productModels.filter((x) => x.active).length === 0 && <div className="empty"><p>Primero crea un modelo configurado a partir de un patrón base.</p><button type="button" className="button secondary" onClick={() => onNavigate('modelos-producto')}>＋ Crear modelo de prenda</button></div>}
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
    {editingProductFabricId && editingFabricProduct && editingFabricBasePattern && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditingProductFabricId(''); setEditingProductFabricAssignments({}); } }}>
      <section className="modal production-modal product-fabrics-modal" role="dialog" aria-modal="true" aria-labelledby="product-fabrics-title">
        <div className="modal-heading">
          <div><h2 id="product-fabrics-title">Telas · {editingFabricProduct.name}</h2><p>Asigna la tela que corresponde a cada posición del patrón base.</p></div>
          <button className="icon-button" onClick={() => { setEditingProductFabricId(''); setEditingProductFabricAssignments({}); }}>×</button>
        </div>
        <form className="production-form" onSubmit={saveProductFabricEditor}>
          <div className="product-inherited-size-tag"><span>Tallas habilitadas por el patrón</span><strong>{sizeGroups.find((group) => group.id === editingFabricBasePattern.sizeGroupId)?.name ?? 'No disponible'} · {basePatternSizeOptions(editingFabricBasePattern).length} tallas</strong></div>
          <div className="product-fabric-slots">{editingFabricSlots.map((slot) => {
            const selectedTextileId = editingProductFabricAssignments[slot] ?? '';
            const archivedTextile = selectedTextileId ? textileContext.telas.find((textile) => textile.id === selectedTextileId && textile.activo === false) : undefined;
            return <label className="field-label" key={slot}>
              <span>{productFabricSlotLabel(slot)}</span>
              <select className="large-input" value={selectedTextileId} onChange={(event) => setEditingProductFabricAssignments((current) => ({ ...current, [slot]: event.target.value }))} required>
                <option value="">Seleccionar tela del catálogo</option>
                {activeTextiles.map((textile) => <option key={textile.id} value={textile.id}>{textile.nombreTela}</option>)}
                {archivedTextile && <option value={archivedTextile.id} disabled>{archivedTextile.nombreTela} · archivada</option>}
              </select>
              <button type="button" className="text-action" onClick={() => openQuickTextile({ kind: 'existingProduct', slot })}>＋ Crear tela y asignarla aquí</button>
            </label>;
          })}</div>
          {activeTextiles.length === 0 && <div className="notice info">No hay telas activas todavía. Crea una desde cualquiera de las posiciones y quedará seleccionada aquí.</div>}
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={() => { setEditingProductFabricId(''); setEditingProductFabricAssignments({}); }}>Cancelar</button>
            <button className="button primary" disabled={activeTextiles.length === 0}>Guardar telas</button>
          </div>
        </form>
      </section>
    </div>}
    {editingProductColorId && editingColorProduct && editingColorBasePattern && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditingProductColorId(''); setEditingProductColorAssignments({}); } }}>
      <section className="modal production-modal product-fabrics-modal" role="dialog" aria-modal="true" aria-labelledby="product-colors-title">
        <div className="modal-heading">
          <div><h2 id="product-colors-title">Colores · {editingColorProduct.name}</h2><p>Asigna los colores concretos que corresponden a las posiciones de este modelo.</p></div>
          <button className="icon-button" onClick={() => { setEditingProductColorId(''); setEditingProductColorAssignments({}); }}>×</button>
        </div>
        <form className="production-form" onSubmit={saveProductColorEditor}>
          <div className="product-fabric-slots">{editingColorSlots.map((slot) => {
            const selectedColorId = editingProductColorAssignments[slot] ?? '';
            return <label className="field-label" key={slot}>
              <span>{productColorSlotLabel(slot)}</span>
              <select className="large-input" value={selectedColorId} onChange={(event) => setEditingProductColorAssignments((current) => ({ ...current, [slot]: event.target.value }))} required>
                <option value="">Seleccionar color del catálogo</option>
                {textileContext.colores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((color) => <option key={color.id} value={color.id}>{color.nombre}</option>)}
              </select>
              <button type="button" className="text-action" onClick={() => openQuickProductColor(slot, 'edit')}>＋ Crear color y asignarlo aquí</button>
            </label>;
          })}</div>
          {textileContext.colores.length === 0 && <div className="notice info">No hay colores en el catálogo. Crea uno desde la primera posición.</div>}
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={() => { setEditingProductColorId(''); setEditingProductColorAssignments({}); }}>Cancelar</button>
            <button className="button primary" disabled={textileContext.colores.length === 0}>Guardar colores</button>
          </div>
        </form>
      </section>
    </div>}
    {quickProductColorSlot && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickProductColorSlot(''); }}>
      <section className="modal production-modal product-fabrics-modal" role="dialog" aria-modal="true" aria-labelledby="quick-product-color-title">
        <div className="modal-heading"><div><h2 id="quick-product-color-title">Nuevo color</h2><p>Se agregará al catálogo global y quedará asignado a {productColorSlotLabel(quickProductColorSlot.split(':').slice(1).join(':'))}.</p></div><button className="icon-button" onClick={() => setQuickProductColorSlot('')}>×</button></div>
        <form className="production-form" onSubmit={saveQuickProductColor}>
          <label className="field-label">Nombre del color *<input className="large-input" value={quickProductColorName} onChange={(event) => setQuickProductColorName(event.target.value)} placeholder="Ej. Azul noche" required autoFocus /></label>
          <div className="form-actions"><button type="button" className="button secondary" onClick={() => setQuickProductColorSlot('')}>Cancelar</button><button className="button primary">Crear y asignar</button></div>
        </form>
      </section>
    </div>}
    {quickTextileDraft && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickTextileDraft(null); }}>
      <section className="modal production-modal product-fabrics-modal" role="dialog" aria-modal="true" aria-labelledby="quick-textile-title">
        <div className="modal-heading"><div><h2 id="quick-textile-title">Nueva tela</h2><p>Se guardará en el catálogo general y quedará seleccionada donde la necesitas.</p></div><button className="icon-button" type="button" onClick={() => setQuickTextileDraft(null)}>×</button></div>
        <form className="production-form" onSubmit={saveQuickTextile}>
          <label className="field-label">Nombre de tela *<input className="large-input" value={quickTextileDraft.name} onChange={(event) => setQuickTextileDraft((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Ej. Polinam" required autoFocus /></label>
          <div className="production-form-grid">
            <label className="field-label">Unidad habitual<select className="large-input" value={quickTextileDraft.unit} disabled={quickTextileDraft.target.kind === 'variant'} onChange={(event) => setQuickTextileDraft((current) => current ? { ...current, unit: event.target.value as 'KG' | 'M', theoreticalYield: '' } : current)}><option value="KG">Kilogramos (KG)</option><option value="M">Metros (M)</option></select></label>
            <label className="field-label">Ancho nominal (m)<input className="large-input" type="number" min="0.001" step="0.001" value={quickTextileDraft.width} onChange={(event) => setQuickTextileDraft((current) => current ? { ...current, width: event.target.value } : current)} placeholder="Opcional" /></label>
          </div>
          <label className="field-label">Rendimiento teórico ({quickTextileDraft.unit === 'KG' ? 'm/kg' : 'kg/m'})<input className="large-input" type="number" min="0.000001" step="0.000001" value={quickTextileDraft.theoreticalYield} onChange={(event) => setQuickTextileDraft((current) => current ? { ...current, theoreticalYield: event.target.value } : current)} placeholder="Opcional" /></label>
          <label className="field-label">Descripción<input className="large-input" value={quickTextileDraft.description} onChange={(event) => setQuickTextileDraft((current) => current ? { ...current, description: event.target.value } : current)} placeholder="Composición, acabado o uso (opcional)" /></label>
          <div className="notice info">La tela se crea activa. Los colores se agregan después desde el catálogo, sin inventar variantes.</div>
          <div className="form-actions"><button type="button" className="button secondary" onClick={() => setQuickTextileDraft(null)}>Cancelar</button><button className="button primary">Crear y seleccionar</button></div>
        </form>
      </section>
    </div>}
    {quickVariantColorTextileId && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickVariantColorTextileId(''); }}>
      <section className="modal production-modal product-fabrics-modal" role="dialog" aria-modal="true" aria-labelledby="quick-variant-color-title">
        <div className="modal-heading"><div><h2 id="quick-variant-color-title">Color de tela</h2><p>{textileName(quickVariantColorTextileId)} · El color se asociará a esta tela y quedará seleccionado en la variante.</p></div><button className="icon-button" type="button" onClick={() => setQuickVariantColorTextileId('')}>×</button></div>
        <form className="production-form" onSubmit={saveQuickVariantColor}>
          <label className="field-label">Nombre del color *<input className="large-input" value={quickVariantColorName} onChange={(event) => setQuickVariantColorName(event.target.value)} placeholder="Ej. Azul noche" required autoFocus /></label>
          <small>Se reutilizará el color global si ya existe y se creará su asociación con esta tela.</small>
          <div className="form-actions"><button type="button" className="button secondary" onClick={() => setQuickVariantColorTextileId('')}>Cancelar</button><button className="button primary">Crear y seleccionar</button></div>
        </form>
      </section>
    </div>}
    {completionDraft && (() => {
      const order = data.productionOrders.find((item) => item.id === completionDraft.orderId);
      if (!order) return null;
      return <div className="modal-backdrop">
        <section className="modal production-modal production-completion-modal" role="dialog" aria-modal="true" aria-labelledby="production-completion-title">
          <div className="modal-heading">
            <div><h2 id="production-completion-title">Consumo real · {order.number}</h2><p>Confirma lo realmente utilizado. Los valores no pueden superar las cantidades reservadas.</p></div>
            <button className="icon-button" onClick={() => setCompletionDraft(null)}>×</button>
          </div>
          <form className="production-form" onSubmit={confirmProductionOrderCompletion}>
            <div className="production-subheading"><strong>Avíos y materiales</strong><span>{order.materials.length} líneas</span></div>
            {order.materials.map((line) => {
              const variant = variantsBySupply.get(line.variantId) ?? data.variants.find((item) => item.id === line.variantId);
              const supply = variant ? supplies.find((item) => item.id === variant.supplyId) : undefined;
              const size = sizes.find((item) => item.id === line.sizeId);
              return <label className="production-completion-line" key={line.id}>
                <span><strong>{supply?.name ?? 'Material'}{supply?.stockMode === 'none' ? '' : ' · ' + (variant?.name ?? 'Variante')}{size ? ' · ' + size.label : ''}</strong><small>{line.specificationValue ? line.specificationValue + ' · ' : ''}{supply?.stockMode === 'none' ? 'Consumo previsto' : 'Reservado'}: {format(line.quantity)} {unitLabel[line.unit]}</small></span>
                <input className="large-input" type="number" min="0" max={line.quantity} step={line.unit === 'und' ? 1 : 0.001}
                  value={completionDraft.materialQuantities[line.id] ?? String(line.quantity)}
                  onChange={(event) => setCompletionDraft((current) => current ? { ...current, materialQuantities: { ...current.materialQuantities, [line.id]: event.target.value } } : current)}
                  required />
              </label>;
            })}
            <div className="production-subheading"><strong>Consumo por rollo</strong><span>{order.rollAllocations.length} asignaciones</span></div>
            {order.rollAllocations.length === 0 && <p className="production-muted">Esta orden no requiere rollos textiles.</p>}
            {order.rollAllocations.map((allocation) => {
              const variant = variantsBySupply.get(allocation.variantId) ?? data.variants.find((item) => item.id === allocation.variantId);
              const roll = textileContext.rollos.find((item) => item.id === allocation.rollId);
              return <label className="production-completion-line" key={allocation.id}>
                <span><strong>{textileName(variant?.textileId ?? null) || 'Tela'} · {variant?.name ?? 'Variante'}</strong><small>Rollo {roll?.id ?? allocation.rollId} · Reservado: {format(allocation.quantity)} {allocation.unit}</small></span>
                <input className="large-input" type="number" min="0" max={allocation.quantity} step="0.001"
                  value={completionDraft.rollQuantities[allocation.id] ?? String(allocation.quantity)}
                  onChange={(event) => setCompletionDraft((current) => current ? { ...current, rollQuantities: { ...current.rollQuantities, [allocation.id]: event.target.value } } : current)}
                  required />
              </label>;
            })}
            <div className="notice info">TelaStock descontará las piezas del patrón base y los componentes según las cantidades necesarias para las prendas de esta orden. Los sobrantes de material que indiques quedarán disponibles nuevamente.</div>
            <div className="form-actions">
              <button type="button" className="button secondary" onClick={() => setCompletionDraft(null)}>Volver</button>
              <button className="button primary">Confirmar consumo y completar</button>
            </div>
          </form>
        </section>
      </div>;
    })()}
    {showVariantForm && <div className="modal-backdrop"><section className="modal production-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><h2>Nueva variante</h2><p>Registra color, ancho u otra característica.</p></div><button className="icon-button" onClick={cancelVariantCreation}>×</button></div>
      <form className="production-form" onSubmit={saveVariant}>
        <label className="field-label">Nombre de variante<input className="large-input" value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder="Ej. Negro · 3.5 cm" required /></label>
        <div className="production-form-grid"><label className="field-label">Cantidad por presentación<input className="large-input" type="number" min="0.001" step="0.001" value={variantPackQuantity} onChange={(e) => setVariantPackQuantity(e.target.value)} placeholder="Ej. 40" /></label><label className="field-label">Presentación<input className="large-input" value={variantPackLabel} onChange={(e) => setVariantPackLabel(e.target.value)} placeholder="Rollo, cono, docena…" /></label></div>
        <label className="field-label">Características de esta variante<textarea className="large-input" rows={3} value={variantAttributes} onChange={(e) => setVariantAttributes(e.target.value)} placeholder={'Una por línea. Ejemplo:\nColor: Negro\nAncho: 3.5 cm\nMaterial: Poliéster\nRigidez: Media'} /></label>
        <div className="production-link-textile">
          <strong>Vincular con una tela existente (opcional)</strong>
          <label className="field-label">Tela
            <select className="large-input" value={variantTextileId} onChange={(e) => { setVariantTextileId(e.target.value); setVariantTextileColorId(''); }}>
              <option value="">Sin vincular</option>
              {textileContext.telas.filter((textile) => textile.activo !== false || textile.id === variantTextileId).map((textile) => <option key={textile.id} value={textile.id}>{textile.nombreTela}{textile.activo === false ? ' · archivada' : ''}</option>)}
            </select>
            <button type="button" className="text-action" disabled={!supplies.find((item) => item.id === variantSupplyId) || supplies.find((item) => item.id === variantSupplyId)?.stockMode === 'talla' || !['m', 'kg'].includes(supplies.find((item) => item.id === variantSupplyId)?.baseUnit ?? '')} onClick={() => openQuickTextile({ kind: 'variant' })}>＋ Crear tela y vincular</button>
            <small>La unidad de la tela debe coincidir con la unidad de inventario de este insumo.</small>
          </label>
          {variantTextileId && <label className="field-label">Color de esa tela
            <select className="large-input" value={variantTextileColorId} onChange={(e) => setVariantTextileColorId(e.target.value)}>
              <option value="">Seleccionar color</option>
              {textileColorOptions.map((x) => <option key={x.id} value={x.id}>{textileContext.colores.find((c) => c.id === x.idColor)?.nombre ?? 'Color'}</option>)}
            </select>
            <button type="button" className="text-action" disabled={!textileContext.telas.some((textile) => textile.id === variantTextileId && textile.activo !== false)} onClick={openQuickVariantColor}>＋ Crear color para esta tela</button>
          </label>}
        </div>
        <div className="form-actions"><button type="button" className="button secondary" onClick={cancelVariantCreation}>Cancelar</button><button className="button primary">Guardar variante</button></div>
      </form></section></div>}
    {showProductInventoryForm && (() => {
      const product = data.productModels.find((item) => item.id === inventoryProductId && item.active);
      if (!product) return null;
      const productSizes = productSizeOptions(product);
      const productPieces = productInventoryPieces(product);
      const selectedSizeCount = inventorySizeIds.length;
      const allSelected = productSizes.length > 0 && selectedSizeCount === productSizes.length;
      const physicalToRegister = inventorySizeIds.reduce((sum, sizeId) => sum + productPieces.reduce((pieceSum, piece) => {
        if (piece.laterality === 'simetrica') {
          const mode = inventoryEntryModes[piece.id] ?? 'paridad';
          return pieceSum + (mode === 'paridad'
            ? 2 * Math.max(0, Number(inventoryAmounts[sizeId + '::' + piece.id + '::paridad']) || 0)
            : Math.max(0, Number(inventoryAmounts[sizeId + '::' + piece.id + '::izquierda']) || 0) + Math.max(0, Number(inventoryAmounts[sizeId + '::' + piece.id + '::derecha']) || 0));
        }
        return pieceSum + Math.max(0, Number(inventoryAmounts[sizeId + '::' + piece.id]) || 0);
      }, 0), 0);
      const renderInventoryEntryPiece = (piece: ProductInventoryPiece, sizeId: string) => {
        const ledger = productPieceDomainLedger(product.id, piece, sizeId);
        const stock = piece.laterality === 'simetrica' ? getSymmetricStock(ledger, piece.id, sizeId) : undefined;
        const current = piece.laterality === 'simetrica' ? inventoryStockLabel(product.id, piece, sizeId) : format(Math.max(0, getPieceStock(ledger, piece.id, sizeId)));
        const mode = inventoryEntryModes[piece.id] ?? 'paridad';
        return piece.laterality !== 'simetrica'
          ? <label className="piece-entry-row inventory-entry-piece" key={piece.id}>
              <span className="piece-entry-name"><strong>{piece.name}</strong><small>{piece.scope === 'base' ? 'Molde base' : piece.componentName} · {piece.textileName} · {piece.colorName} · Stock actual: {current}</small></span>
              {inventoryQuantityControl(sizeId, piece, undefined, (inventoryOperation === 'entrada' ? 'Ingresar' : 'Retirar') + ' ' + piece.name + ', talla ' + (productSizes.find((size) => size.id === sizeId)?.label ?? ''))}
            </label>
          : <div className="piece-entry-row symmetric-entry-row inventory-entry-piece" key={piece.id}>
              <div className="piece-entry-name">
                <strong>{piece.name}</strong>
                <small>{piece.scope === 'base' ? 'Molde base' : piece.componentName} · {piece.textileName} · {piece.colorName} · Stock actual: {current}</small>
                <div className="side-mode-toggle" role="group" aria-label={'Modo de registro de ' + piece.name}>
                  <button type="button" className={mode === 'paridad' ? 'active' : ''} onClick={() => changeInventoryEntryMode(piece.id, 'paridad')}>Paridad</button>
                  <button type="button" className={mode === 'lados' ? 'active' : ''} onClick={() => changeInventoryEntryMode(piece.id, 'lados')}>Por lado</button>
                </div>
                {stock?.unassigned ? <small className="inventory-shortage">{format(stock.unassigned)} pieza(s) histórica(s) sin lado identificado.</small> : null}
              </div>
              {mode === 'paridad'
                ? <div className="symmetric-quantity"><small>{inventoryOperation === 'entrada' ? 'Pares a ingresar' : 'Pares a retirar'}</small>{inventoryQuantityControl(sizeId, piece, 'paridad', 'paridad de ' + piece.name)}<span className="quantity-hint">1 paridad = 1 izquierda + 1 derecha</span></div>
                : <div className="symmetric-side-inputs">
                    <div className="symmetric-side-control"><small>Izquierda · hay {format(stock?.left ?? 0)}</small>{inventoryQuantityControl(sizeId, piece, 'izquierda', 'lado izquierdo de ' + piece.name)}</div>
                    <div className="symmetric-side-control"><small>Derecha · hay {format(stock?.right ?? 0)}</small>{inventoryQuantityControl(sizeId, piece, 'derecha', 'lado derecho de ' + piece.name)}</div>
                  </div>}
            </div>;
      };
      return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProductInventoryForm(false); }}>
        <section className="modal stock-modal product-inventory-stock-modal" role="dialog" aria-modal="true" aria-labelledby="product-inventory-stock-title">
          <div className="modal-heading">
            <div><div className="eyebrow">{inventoryOperation === 'entrada' ? 'ENTRADA DE STOCK' : 'SALIDA / MERMA'}</div><h2 id="product-inventory-stock-title">{inventoryOperation === 'entrada' ? 'Registrar stock del modelo' : 'Retirar stock del modelo'}</h2><p>Las cantidades se guardan en este modelo comercial, sin mezclarse con otras prendas que usen el mismo patrón.</p></div>
            <button className="icon-button" onClick={() => setShowProductInventoryForm(false)} aria-label="Cerrar">×</button>
          </div>
          <form className="production-form" onSubmit={submitProductInventoryMovement}>
            <label className="field-label">Modelo comercial
              <select className="large-input" value={product.id} onChange={(event) => changeInventoryProduct(event.target.value)}>
                {activeInventoryProducts.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
              <small>Patrón base: {baseModels.find((item) => item.id === product.baseModelId)?.name ?? 'No disponible'} · Tallas heredadas del patrón.</small>
            </label>
            <div className="form-section-heading"><div><strong>Tallas</strong><small>{selectedSizeCount === 0 ? 'Selecciona una o varias.' : selectedSizeCount + ' seleccionada(s)'}</small></div><button type="button" className="text-action" onClick={() => setInventorySizeIds(allSelected ? [] : productSizes.map((size) => size.id))}>{allSelected ? 'Quitar todas' : 'Seleccionar todas'}</button></div>
            <div className="size-check-grid">{productSizes.map((size) => {
              const hasStock = productPieces.some((piece) => getPieceStock(productPieceDomainLedger(product.id, piece, size.id), piece.id, size.id) > 0);
              return <label className={'size-check ' + (inventorySizeIds.includes(size.id) ? 'checked' : '')} key={size.id}>
                <input type="checkbox" checked={inventorySizeIds.includes(size.id)} onChange={() => toggleInventorySize(size.id)} />
                <span className="checkmark" aria-hidden="true">✓</span><strong>{size.label}</strong><small>{hasStock ? 'Tiene stock' : 'Vacía'}</small>
              </label>;
            })}</div>
            {selectedSizeCount > 0 && <div className="selected-sizes-inputs">
              <div className="form-section-heading compact-form-heading"><div><strong>Cantidad por pieza</strong><small>Se muestran moldes base y piezas auxiliares del modelo.</small></div></div>
              {inventorySizeIds.map((sizeId) => {
                const size = productSizes.find((item) => item.id === sizeId);
                const baseRows = productPieces.filter((piece) => piece.scope === 'base');
                const groups = product.components.flatMap((selection) => {
                  const component = data.components.find((item) => item.id === selection.componentId && item.active);
                  if (!component) return [];
                  const rows = productPieces.filter((piece) => piece.scope === 'component' && piece.selectionId === selection.id);
                  return rows.length > 0 ? [{ selection, component, rows }] : [];
                });
                return <section className="entry-size-card" key={sizeId}>
                  <div className="entry-size-title"><span className="size-pill">{size?.label}</span><span>{inventoryOperation === 'entrada' ? 'Stock a ingresar' : 'Stock a retirar'}</span></div>
                  {baseRows.length > 0 && <div className="inventory-entry-group"><strong>Moldes base</strong>{baseRows.map((piece) => renderInventoryEntryPiece(piece, sizeId))}</div>}
                  {groups.map(({ selection, component, rows }) => <div className="inventory-entry-group" key={selection.id}><strong>{component.name}</strong>{rows.map((piece) => renderInventoryEntryPiece(piece, sizeId))}</div>)}
                </section>;
              })}
            </div>}
            <label className="field-label stock-note-field">Observación del movimiento<input className="large-input" value={inventoryNote} onChange={(event) => setInventoryNote(event.target.value)} placeholder="Ej. Corte del lote 25/10" /></label>
            <div className="modal-sticky-actions"><span>{format(physicalToRegister)} piezas físicas {inventoryOperation === 'entrada' ? 'a ingresar' : 'a retirar'}</span><button type="button" className="button secondary" onClick={() => setShowProductInventoryForm(false)}>Cancelar</button><button className="button primary" disabled={selectedSizeCount === 0}>Confirmar movimiento</button></div>
          </form>
        </section>
      </div>;
    })()}
    {showComponentPieceMovement && selectedStockProductModel && selectedStockComponent && selectedComponentStockPiece && <div className="modal-backdrop">
      <section className="modal production-modal" role="dialog" aria-modal="true" aria-labelledby="component-piece-stock-title">
        <div className="modal-heading"><div><h2 id="component-piece-stock-title">Movimiento de pieza auxiliar</h2><p>{selectedStockProductModel.name} · {selectedStockComponent.name} · {selectedComponentStockPiece.name}</p></div><button className="icon-button" onClick={() => setShowComponentPieceMovement(false)}>×</button></div>
        <form className="production-form" onSubmit={saveComponentPieceMovement}>
          <label className="field-label">Operación<select className="large-input" value={componentStockKind} onChange={(event) => setComponentStockKind(event.target.value as 'entrada' | 'salida')}><option value="entrada">Entrada</option><option value="salida">Salida / merma</option></select></label>
          <label className="field-label">Talla<select className="large-input" value={componentStockSizeId} onChange={(event) => setComponentStockSizeId(event.target.value)} required><option value="">Seleccionar talla</option>{selectedStockProductSizes.map((size) => <option value={size.id} key={size.id}>{size.label}</option>)}</select><small>Solo tallas de la tabla heredada del patrón base.</small></label>
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
