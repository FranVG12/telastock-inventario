export type ComponentFabricSlot = 'ninguna' | 'cualquiera' | 'principal' | `secundaria_${number}`;

const SECONDARY_FABRIC_SLOT_PATTERN = /^secundaria_([1-9][0-9]*)$/;

export function isComponentFabricSlot(value: unknown): value is ComponentFabricSlot {
  return value === 'ninguna' || value === 'cualquiera' || value === 'principal' ||
    (typeof value === 'string' && SECONDARY_FABRIC_SLOT_PATTERN.test(value));
}

/** Old component records may contain a fixed textileId. Map those to the
 * previously defaulted main-fabric slot, then ignore the fixed textile link.
 */
export function normalizeComponentFabricSlot(value: unknown, legacyTextileId?: unknown): ComponentFabricSlot {
  if (isComponentFabricSlot(value)) return value;
  return typeof legacyTextileId === 'string' && legacyTextileId.trim() ? 'principal' : 'ninguna';
}

export function secondaryFabricSlotIndex(slot?: string): number {
  const match = SECONDARY_FABRIC_SLOT_PATTERN.exec(slot ?? '');
  return match ? Number(match[1]) : 0;
}

export function isComponentFabricSlotAvailableForModel(slot: string, secondarySlotCount: number): boolean {
  if (slot === 'ninguna' || slot === 'cualquiera' || slot === 'principal') return true;
  const index = secondaryFabricSlotIndex(slot);
  return index > 0 && index <= Math.max(0, Math.floor(secondarySlotCount));
}

export function componentFabricSlotLabel(slot: string): string {
  if (slot === 'ninguna') return 'Sin tela vinculada';
  if (slot === 'cualquiera') return 'Cualquier tela';
  if (slot === 'principal') return 'Tela principal 1';
  const index = secondaryFabricSlotIndex(slot);
  return index > 0 ? 'Tela secundaria ' + index : 'Posición de tela inválida';
}

export type ProductFabricAssignmentLike = {
  productModelId: string;
  fabricSlot: string;
  textileId: string;
};

/** Resolve by both product model and slot so shared components never inherit
 * another product's textile assignment.
 */
export function resolveComponentPieceTextileId(
  productModelId: string,
  fabricSlot: string,
  assignments: ProductFabricAssignmentLike[],
): string | null {
  if (!isComponentFabricSlot(fabricSlot) || fabricSlot === 'ninguna' || fabricSlot === 'cualquiera') return null;
  return assignments.find((assignment) =>
    assignment.productModelId === productModelId && assignment.fabricSlot === fabricSlot
  )?.textileId ?? null;
}
