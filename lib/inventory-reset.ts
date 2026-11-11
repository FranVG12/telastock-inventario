const INVENTORY_MOVEMENT_RESET_MARKER = 'telastock-inventory-movement-reset-v1';

const INVENTORY_MOVEMENT_STORAGE_KEYS = [
  'telastock-piece-movements-v1',
  'telastock-supply-movements-v1',
  'telastock-product-base-piece-movements-v1',
  'telastock-component-piece-movements-v1',
  'telastock-finished-garment-movements-v1',
  'telastock-fabric-rollo-movimientos-v1',
] as const;

const PRODUCTION_ORDERS_STORAGE_KEY = 'telastock-production-orders-v1';

/**
 * One-time local migration to start TelaStock with empty inventory ledgers.
 * Catalogs, patterns, products, textiles, roll records and purchase documents are kept.
 * Existing reserved/in-progress production orders return to draft so they do not reserve
 * stock that has just been cleared. Completed and cancelled orders remain as documents.
 */
export function resetLegacyInventoryMovementsOnce(): void {
  if (typeof window === 'undefined') return;

  const storage = window.localStorage;
  try {
    if (storage.getItem(INVENTORY_MOVEMENT_RESET_MARKER) === '1') return;

    const keys = [...INVENTORY_MOVEMENT_STORAGE_KEYS, PRODUCTION_ORDERS_STORAGE_KEY] as const;
    const previous = new Map<string, string | null>();
    keys.forEach((key) => previous.set(key, storage.getItem(key)));
    const previousMarker = storage.getItem(INVENTORY_MOVEMENT_RESET_MARKER);
    const resetAt = new Date().toISOString();

    try {
      INVENTORY_MOVEMENT_STORAGE_KEYS.forEach((key) => storage.setItem(key, '[]'));

      const storedOrders = previous.get(PRODUCTION_ORDERS_STORAGE_KEY);
      if (storedOrders !== null && storedOrders !== undefined) {
        const parsed: unknown = JSON.parse(storedOrders);
        if (!Array.isArray(parsed)) {
          throw new Error('El registro local de órdenes de producción no tiene un formato válido.');
        }
        const releasedOrders = parsed.map((order) => {
          if (!order || typeof order !== 'object' || Array.isArray(order)) return order;
          const record = order as Record<string, unknown>;
          if (record.status !== 'reservada' && record.status !== 'en_proceso') return order;
          return {
            ...record,
            status: 'borrador',
            reservedAt: null,
            startedAt: null,
            updatedAt: resetAt,
          };
        });
        storage.setItem(PRODUCTION_ORDERS_STORAGE_KEY, JSON.stringify(releasedOrders));
      }

      storage.setItem(INVENTORY_MOVEMENT_RESET_MARKER, '1');
    } catch (error) {
      previous.forEach((value, key) => {
        try {
          if (value === null) storage.removeItem(key);
          else storage.setItem(key, value);
        } catch {
          // Best-effort rollback; retain the original migration failure.
        }
      });
      try {
        if (previousMarker === null) storage.removeItem(INVENTORY_MOVEMENT_RESET_MARKER);
        else storage.setItem(INVENTORY_MOVEMENT_RESET_MARKER, previousMarker);
      } catch {
        // Best-effort rollback; retain the original migration failure.
      }
      throw error;
    }
  } catch (error) {
    throw new Error(
      'No se pudieron limpiar los movimientos antiguos del inventario. ' +
      (error instanceof Error ? error.message : 'Comprueba el almacenamiento del navegador.'),
    );
  }
}
