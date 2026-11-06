export type SizeSpecificationRule = {
  id?: string;
  value: string;
  sizeIds: string[];
};

export type SizeSpecification = {
  label: string;
  bySize: Record<string, string>;
};

/** Converts compact user-authored talla groups into a normalized size -> value map. */
export function mapSizeSpecificationRules(
  rules: SizeSpecificationRule[],
  validSizeIds: string[],
): SizeSpecification {
  const valid = new Set(validSizeIds);
  const bySize: Record<string, string> = {};
  for (const rule of rules) {
    const value = rule.value.trim();
    if (!value || rule.sizeIds.length === 0) throw new Error('Cada grupo necesita una medida y al menos una talla.');
    for (const sizeId of rule.sizeIds) {
      if (!valid.has(sizeId)) throw new Error('Una regla contiene una talla que no pertenece al patrón base.');
      if (bySize[sizeId]) throw new Error('Una talla no puede pertenecer a dos grupos de medidas.');
      bySize[sizeId] = value;
    }
  }
  const missing = validSizeIds.filter((sizeId) => !bySize[sizeId]);
  if (missing.length > 0) throw new Error('Falta definir la medida para las tallas: ' + missing.join(', ') + '.');
  return { label: '', bySize };
}

export function describeSizeSpecification(
  specification: SizeSpecification | undefined,
  sizeId: string,
): string {
  if (!specification) return '';
  const value = specification.bySize[sizeId];
  return value ? specification.label + ': ' + value : '';
}

export function validateSizeSpecification(
  specification: SizeSpecification | undefined,
  validSizeIds: string[],
): boolean {
  if (!specification) return false;
  if (!specification.label.trim()) return false;
  const keys = Object.keys(specification.bySize);
  return keys.length === validSizeIds.length &&
    validSizeIds.every((sizeId) => typeof specification.bySize[sizeId] === 'string' && specification.bySize[sizeId].trim().length > 0) &&
    keys.every((sizeId) => validSizeIds.includes(sizeId));
}
