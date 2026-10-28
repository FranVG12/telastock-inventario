import type { ManufacturingModel, ModelPiece, PieceMovement, Size, SizeGroup } from './inventory-domain';

export const demoSizeGroups: SizeGroup[] = [
  { id: 'group-prendas', name: 'Prendas · infantil y adulto', description: 'Tallas ordenadas para polos, casacas y buzos.' },
  { id: 'group-medias', name: 'Medias', description: 'Rangos de edad y adulto.' },
];

export const demoSizes: Size[] = [
  ...['T4', 'T6', 'T8', 'T10', 'T12', 'T14', 'T16', 'S', 'M', 'L', 'XL'].map((label, index) => ({ id: `size-prenda-${index + 1}`, groupId: 'group-prendas', label, sortOrder: index + 1 })),
  ...['6 a 9 años', '10 a 13 años', 'Adulto'].map((label, index) => ({ id: `size-media-${index + 1}`, groupId: 'group-medias', label, sortOrder: index + 1 })),
];

export const demoModels: ManufacturingModel[] = [
  { id: 'model-polo', name: 'Polo básico sublimado', sizeGroupId: 'group-prendas' },
  { id: 'model-casaca', name: 'Casaca deportiva', sizeGroupId: 'group-prendas' },
  { id: 'model-buzo', name: 'Pantalón de buzo', sizeGroupId: 'group-prendas' },
  { id: 'model-medias', name: 'Medias deportivas', sizeGroupId: 'group-medias' },
];

export const demoPieces: ModelPiece[] = [
  { id: 'piece-polo-pecho', modelId: 'model-polo', name: 'Pecho', unitsPerGarment: 1, laterality: 'ninguna', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 1 },
  { id: 'piece-polo-espalda', modelId: 'model-polo', name: 'Espalda', unitsPerGarment: 1, laterality: 'ninguna', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 2 },
  // El molde es simétrico, pero el stock se lleva por lados independientes.
  // unitsPerGarment=2 equivale a una manga izquierda y una derecha por prenda.
  { id: 'piece-polo-mangas', modelId: 'model-polo', name: 'Mangas (par simétrico)', unitsPerGarment: 2, laterality: 'simetrica', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 3 },

  { id: 'piece-casaca-del-i', modelId: 'model-casaca', name: 'Delantero izquierdo', unitsPerGarment: 1, laterality: 'izquierda', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 1 },
  { id: 'piece-casaca-del-d', modelId: 'model-casaca', name: 'Delantero derecho', unitsPerGarment: 1, laterality: 'derecha', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 2 },
  { id: 'piece-casaca-espalda', modelId: 'model-casaca', name: 'Espalda', unitsPerGarment: 1, laterality: 'ninguna', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 3 },
  { id: 'piece-casaca-mangas', modelId: 'model-casaca', name: 'Mangas (par simétrico)', unitsPerGarment: 2, laterality: 'simetrica', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 4 },
  { id: 'piece-casaca-cuello', modelId: 'model-casaca', name: 'Cuello', unitsPerGarment: 1, laterality: 'ninguna', fabricType: 'Rib', color: 'Negro', sortOrder: 5 },

  { id: 'piece-buzo-del-i', modelId: 'model-buzo', name: 'Pierna delantera izquierda', unitsPerGarment: 1, laterality: 'izquierda', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 1 },
  { id: 'piece-buzo-del-d', modelId: 'model-buzo', name: 'Pierna delantera derecha', unitsPerGarment: 1, laterality: 'derecha', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 2 },
  { id: 'piece-buzo-tras-i', modelId: 'model-buzo', name: 'Pierna posterior izquierda', unitsPerGarment: 1, laterality: 'izquierda', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 3 },
  { id: 'piece-buzo-tras-d', modelId: 'model-buzo', name: 'Pierna posterior derecha', unitsPerGarment: 1, laterality: 'derecha', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 4 },
  { id: 'piece-buzo-cintura', modelId: 'model-buzo', name: 'Pretina', unitsPerGarment: 1, laterality: 'ninguna', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 5 },

  { id: 'piece-medias-cana', modelId: 'model-medias', name: 'Caña', unitsPerGarment: 2, laterality: 'simetrica', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 1 },
  { id: 'piece-medias-pie', modelId: 'model-medias', name: 'Planta y talón', unitsPerGarment: 2, laterality: 'simetrica', fabricType: 'Poliéster deportivo', color: 'Rojo', sortOrder: 2 },
];

const stamp = '2026-10-25T09:00:00.000Z';
export const demoMovements: PieceMovement[] = [
  // Polo talla M: 10 pecho, 9 espalda, 9 mangas izquierdas y 8 derechas => 8 prendas completas.
  { id: 'mv-p1', pieceId: 'piece-polo-pecho', sizeId: 'size-prenda-9', delta: 10, kind: 'entrada', note: 'Stock inicial de demostración', date: stamp },
  { id: 'mv-p2', pieceId: 'piece-polo-espalda', sizeId: 'size-prenda-9', delta: 9, kind: 'entrada', note: 'Stock inicial de demostración', date: stamp },
  { id: 'mv-p3i', pieceId: 'piece-polo-mangas', sizeId: 'size-prenda-9', delta: 9, side: 'izquierda', kind: 'entrada', note: 'Stock inicial · lado izquierdo', date: stamp },
  { id: 'mv-p3d', pieceId: 'piece-polo-mangas', sizeId: 'size-prenda-9', delta: 8, side: 'derecha', kind: 'entrada', note: 'Stock inicial · lado derecho', date: stamp },
  // Polo talla L: 3 pecho, 4 espalda, 4 mangas izquierdas y 3 derechas => 3 prendas completas.
  { id: 'mv-p4', pieceId: 'piece-polo-pecho', sizeId: 'size-prenda-10', delta: 3, kind: 'entrada', note: 'Stock inicial de demostración', date: stamp },
  { id: 'mv-p5', pieceId: 'piece-polo-espalda', sizeId: 'size-prenda-10', delta: 4, kind: 'entrada', note: 'Stock inicial de demostración', date: stamp },
  { id: 'mv-p6i', pieceId: 'piece-polo-mangas', sizeId: 'size-prenda-10', delta: 4, side: 'izquierda', kind: 'entrada', note: 'Stock inicial · lado izquierdo', date: stamp },
  { id: 'mv-p6d', pieceId: 'piece-polo-mangas', sizeId: 'size-prenda-10', delta: 3, side: 'derecha', kind: 'entrada', note: 'Stock inicial · lado derecho', date: stamp },
  // Talla S en proceso: hay una manga izquierda, pero falta su lado derecho.
  { id: 'mv-p7', pieceId: 'piece-polo-pecho', sizeId: 'size-prenda-8', delta: 2, kind: 'entrada', note: 'Stock inicial de demostración', date: stamp },
  { id: 'mv-p8i', pieceId: 'piece-polo-mangas', sizeId: 'size-prenda-8', delta: 1, side: 'izquierda', kind: 'entrada', note: 'Stock inicial · lado izquierdo', date: stamp },
  // Casaca talla M.
  { id: 'mv-c1', pieceId: 'piece-casaca-del-i', sizeId: 'size-prenda-9', delta: 6, kind: 'entrada', note: 'Stock inicial de demostración', date: stamp },
  { id: 'mv-c2', pieceId: 'piece-casaca-del-d', sizeId: 'size-prenda-9', delta: 5, kind: 'entrada', note: 'Stock inicial de demostración', date: stamp },
  { id: 'mv-c3', pieceId: 'piece-casaca-espalda', sizeId: 'size-prenda-9', delta: 6, kind: 'entrada', note: 'Stock inicial de demostración', date: stamp },
  { id: 'mv-c4i', pieceId: 'piece-casaca-mangas', sizeId: 'size-prenda-9', delta: 5, side: 'izquierda', kind: 'entrada', note: 'Stock inicial · lado izquierdo', date: stamp },
  { id: 'mv-c4d', pieceId: 'piece-casaca-mangas', sizeId: 'size-prenda-9', delta: 5, side: 'derecha', kind: 'entrada', note: 'Stock inicial · lado derecho', date: stamp },
  { id: 'mv-c5', pieceId: 'piece-casaca-cuello', sizeId: 'size-prenda-9', delta: 5, kind: 'entrada', note: 'Stock inicial de demostración', date: stamp },
  // Medias adultas: se incluye un segundo grupo de tallas distinto.
  { id: 'mv-m1i', pieceId: 'piece-medias-cana', sizeId: 'size-media-3', delta: 10, side: 'izquierda', kind: 'entrada', note: 'Stock inicial · lado izquierdo', date: stamp },
  { id: 'mv-m1d', pieceId: 'piece-medias-cana', sizeId: 'size-media-3', delta: 10, side: 'derecha', kind: 'entrada', note: 'Stock inicial · lado derecho', date: stamp },
];
