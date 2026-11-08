export type ComponentColorSlot = 'ninguna' | 'cualquiera' | 'principal' | `secundaria_${number}`;

const SECONDARY_COLOR_SLOT_PATTERN = /^secundaria_([1-9][0-9]*)$/;

export function isComponentColorSlot(value: unknown): value is ComponentColorSlot {
  return value === 'ninguna' || value === 'cualquiera' || value === 'principal' ||
    (typeof value === 'string' && SECONDARY_COLOR_SLOT_PATTERN.test(value));
}

/** Older components stored a fixed global color ID. Keep that value as a legacy fallback,
 * while exposing it through the main color position for new model-level assignments.
 */
export function normalizeComponentColorSlot(value: unknown, legacyColorId?: unknown): ComponentColorSlot {
  if (isComponentColorSlot(value)) return value;
  return typeof legacyColorId === 'string' && legacyColorId.trim() ? 'principal' : 'ninguna';
}

export function secondaryColorSlotIndex(slot: string): number {
  const match = SECONDARY_COLOR_SLOT_PATTERN.exec(slot);
  return match ? Number(match[1]) : 0;
}

export function isComponentColorSlotAvailableForModel(slot: string, secondarySlotCount: number): boolean {
  if (slot === 'ninguna' || slot === 'cualquiera' || slot === 'principal') return true;
  const index = secondaryColorSlotIndex(slot);
  return index > 0 && index <= Math.max(0, Math.floor(secondarySlotCount));
}

export function componentColorSlotLabel(slot: string): string {
  if (slot === 'ninguna') return 'Sin color vinculado';
  if (slot === 'cualquiera') return 'Cualquier color';
  if (slot === 'principal') return 'Color principal 1';
  const index = secondaryColorSlotIndex(slot);
  return index > 0 ? 'Color secundario ' + index : 'Posición de color inválida';
}

export type ProductColorAssignmentLike = {
  productModelId: string;
  colorSlot: string;
  colorId: string;
};

/** A shared component resolves its color against the commercial model, never the library. */
export function resolveComponentPieceColorId(
  productModelId: string,
  colorSlot: string,
  assignments: ProductColorAssignmentLike[],
): string | null {
  if (!isComponentColorSlot(colorSlot) || colorSlot === 'ninguna' || colorSlot === 'cualquiera') return null;
  return assignments.find((assignment) =>
    assignment.productModelId === productModelId && assignment.colorSlot === colorSlot
  )?.colorId ?? null;
}

export type ProductColorSlotPieceLike = {
  colorSlot?: unknown;
  colorId?: unknown;
};

/**
 * Returns only the shared color positions actually used by a pattern and its
 * selected auxiliary components. "ninguna" and "cualquiera" are handled per
 * piece and must not force a shared product-level color assignment.
 */
export function requiredProductColorSlots(pieces: readonly ProductColorSlotPieceLike[]): string[] {
  const positions = new Set<string>();
  for (const piece of pieces) {
    const slot = normalizeComponentColorSlot(piece.colorSlot, piece.colorId);
    if (slot === 'principal' || secondaryColorSlotIndex(slot) > 0) positions.add(slot);
  }
  return [...positions].sort((left, right) => {
    if (left === 'principal') return right === 'principal' ? 0 : -1;
    if (right === 'principal') return 1;
    return secondaryColorSlotIndex(left) - secondaryColorSlotIndex(right);
  });
}
