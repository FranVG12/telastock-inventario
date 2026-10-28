/**
 * Dominio del inventario de piezas de fabricación.
 * Las reglas de fabricación y paridad viven aquí para que la UI no pueda
 * declarar fabricable una prenda cuando falta alguno de sus lados.
 */
export type SizeGroup = { id: string; name: string; description?: string };
export type Size = { id: string; groupId: string; label: string; sortOrder: number };
export type ManufacturingModel = { id: string; name: string; sizeGroupId: string; updatedAt?: string };
export type Laterality = 'simetrica' | 'izquierda' | 'derecha' | 'ninguna';
export type StockSide = 'izquierda' | 'derecha';
export type ModelPiece = {
  id: string;
  modelId: string;
  name: string;
  /** Cantidad física de piezas necesaria por prenda. Si es simétrica, debe ser par. */
  unitsPerGarment: number;
  laterality: Laterality;
  sortOrder: number;
  fabricType: string;
  color: string;
  archived?: boolean;
};
export type PieceMovement = {
  id: string;
  pieceId: string;
  sizeId: string;
  /** Entrada positiva, salida negativa o ajuste +/- . */
  delta: number;
  kind: 'entrada' | 'salida' | 'ajuste';
  /** En piezas simétricas identifica el lado. Sin lado = movimiento agregado histórico. */
  side?: StockSide;
  note: string;
  date: string;
};
export type PieceBalance = { pieceId: string; quantity: number };
export type SymmetricStock = {
  left: number;
  right: number;
  /** Cantidad de pares físicos completos disponibles, antes de dividir por pares requeridos por prenda. */
  parity: number;
  /** Piezas históricas cuyo lado no puede conocerse a partir de los datos antiguos. */
  unassigned: number;
  /** Existencias físicas totales, incluyendo piezas históricas sin lado asignado. */
  physicalTotal: number;
};
export type PieceShortage = {
  piece: ModelPiece;
  currentStock: number;
  requiredForTarget: number;
  currentCapacity: number;
  missing: number;
  symmetricStock?: SymmetricStock;
  missingLeft?: number;
  missingRight?: number;
  requiredPerSideForTarget?: number;
};

export function getPieceStock(movements: PieceMovement[], pieceId: string, sizeId: string): number {
  return movements
    .filter((movement) => movement.pieceId === pieceId && movement.sizeId === sizeId)
    .reduce((total, movement) => total + movement.delta, 0);
}

/**
 * Computes stock for a symmetric mold. Legacy movements have no side; their
 * complete physical pairs are represented neutrally on both sides, while an
 * odd leftover remains explicitly unassigned instead of inventing a side.
 * New movements always record left or right.
 */
export function getSymmetricStock(movements: PieceMovement[], pieceId: string, sizeId: string): SymmetricStock {
  const relevant = movements.filter((movement) => movement.pieceId === pieceId && movement.sizeId === sizeId);
  const legacyPhysical = Math.max(0, relevant
    .filter((movement) => !movement.side)
    .reduce((total, movement) => total + movement.delta, 0));
  const legacyPairs = Math.floor(legacyPhysical / 2);
  const leftLedger = relevant.filter((movement) => movement.side === 'izquierda').reduce((total, movement) => total + movement.delta, 0);
  const rightLedger = relevant.filter((movement) => movement.side === 'derecha').reduce((total, movement) => total + movement.delta, 0);
  const left = Math.max(0, legacyPairs + leftLedger);
  const right = Math.max(0, legacyPairs + rightLedger);
  const unassigned = legacyPhysical % 2;
  return { left, right, parity: Math.min(left, right), unassigned, physicalTotal: left + right + unassigned };
}

export function formatSymmetricStock(stock: SymmetricStock, compact = false): string {
  const count = stock.left === stock.right ? stock.left : `${stock.left}/${stock.right}`;
  if (stock.left !== stock.right) return String(count);
  if (compact) return `${count} par.`;
  return `${count} ${stock.left === 1 ? 'paridad' : 'paridades'}`;
}

export function getMovementSideLabel(movement: PieceMovement): string | undefined {
  if (movement.side === 'izquierda') return 'Lado izquierdo';
  if (movement.side === 'derecha') return 'Lado derecho';
  return undefined;
}

function requiredUnitsPerGarment(piece: ModelPiece): number {
  const units = piece.unitsPerGarment;
  if (!Number.isFinite(units) || !Number.isInteger(units) || units < 1) return Number.POSITIVE_INFINITY;
  // A symmetric mold is tracked as two separate sides. Odd physical requirements
  // cannot be distributed evenly between left and right, so they are invalid.
  if (piece.laterality === 'simetrica' && units % 2 !== 0) return Number.POSITIVE_INFINITY;
  return units;
}

export function getPieceCapacity(piece: ModelPiece, movements: PieceMovement[], sizeId: string): number {
  const required = requiredUnitsPerGarment(piece);
  if (!Number.isFinite(required)) return 0;
  if (piece.laterality === 'simetrica') {
    const stock = getSymmetricStock(movements, piece.id, sizeId);
    const requiredPerSide = required / 2;
    return Math.floor(Math.min(stock.left, stock.right) / requiredPerSide);
  }
  const stock = Math.max(0, getPieceStock(movements, piece.id, sizeId));
  return Math.floor(stock / required);
}

export function getCompleteUnits(pieces: ModelPiece[], movements: PieceMovement[], sizeId: string): number {
  if (pieces.length === 0) return 0;
  return Math.max(0, Math.min(...pieces.map((piece) => getPieceCapacity(piece, movements, sizeId))));
}

export function getPieceShortages(pieces: ModelPiece[], movements: PieceMovement[], sizeId: string, targetUnits?: number): PieceShortage[] {
  const completeUnits = getCompleteUnits(pieces, movements, sizeId);
  const target = Math.max(completeUnits + 1, Math.floor(targetUnits ?? completeUnits + 1));
  return pieces.map((piece) => {
    const rawStock = Math.max(0, getPieceStock(movements, piece.id, sizeId));
    const required = requiredUnitsPerGarment(piece);
    const validRequirement = Number.isFinite(required);
    const requiredForTarget = validRequirement ? target * required : target;
    const currentCapacity = getPieceCapacity(piece, movements, sizeId);
    if (piece.laterality === 'simetrica' && validRequirement) {
      const symmetricStock = getSymmetricStock(movements, piece.id, sizeId);
      const requiredPerSideForTarget = target * (required / 2);
      const missingLeft = Math.max(0, requiredPerSideForTarget - symmetricStock.left);
      const missingRight = Math.max(0, requiredPerSideForTarget - symmetricStock.right);
      return {
        piece,
        currentStock: symmetricStock.physicalTotal,
        requiredForTarget,
        currentCapacity,
        missing: missingLeft + missingRight,
        symmetricStock,
        missingLeft,
        missingRight,
        requiredPerSideForTarget,
      };
    }
    return {
      piece,
      currentStock: rawStock,
      requiredForTarget,
      currentCapacity,
      missing: Math.max(0, requiredForTarget - rawStock),
    };
  });
}

export function sizeHasStock(pieces: ModelPiece[], movements: PieceMovement[], sizeId: string): boolean {
  return pieces.some((piece) => getPieceStock(movements, piece.id, sizeId) > 0);
}

export function modelHasStock(modelPieces: ModelPiece[], movements: PieceMovement[]): boolean {
  const ids = new Set(modelPieces.map((piece) => piece.id));
  return movements.some((movement) => ids.has(movement.pieceId) && movement.delta !== 0) &&
    modelPieces.some((piece) => movements.some((movement) => movement.pieceId === piece.id && movement.delta > 0));
}

/** Highest capacity supported by any single mold, independent of the other molds. */
export function getMaximumTargetUnits(pieces: ModelPiece[], movements: PieceMovement[], sizeId: string): number {
  if (pieces.length === 0) return 0;
  return Math.max(...pieces.map((piece) => getPieceCapacity(piece, movements, sizeId)));
}

/** Validates stock balances before admin edits/deletions, including independent sides. */
export function hasNonNegativeBalances(movements: PieceMovement[], piece: ModelPiece, sizeId: string): boolean {
  const relevant = movements.filter((movement) => movement.pieceId === piece.id && movement.sizeId === sizeId);
  if (piece.laterality !== 'simetrica') {
    return relevant.reduce((total, movement) => total + movement.delta, 0) >= 0;
  }
  const legacy = relevant.filter((movement) => !movement.side).reduce((total, movement) => total + movement.delta, 0);
  if (legacy < 0) return false;
  const legacyPairs = Math.floor(legacy / 2);
  const left = legacyPairs + relevant.filter((movement) => movement.side === 'izquierda').reduce((total, movement) => total + movement.delta, 0);
  const right = legacyPairs + relevant.filter((movement) => movement.side === 'derecha').reduce((total, movement) => total + movement.delta, 0);
  return left >= 0 && right >= 0;
}
