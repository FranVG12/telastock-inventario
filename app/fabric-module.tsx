'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

export type FabricView = 'telas' | 'rollos' | 'compras' | 'proveedores';
export type FabricUnit = 'KG' | 'M';
export type RollStatus = 'disponible' | 'reservado' | 'agotado' | 'defectuoso';

export type Textile = {
  id: string; nombreTela: string; unidadVenta: FabricUnit; anchoNominalM: number | null;
  /** KG: metros por kilogramo. M: kilogramos por metro. Es un rendimiento teórico, nunca una medición real. */
  rendimientoTeorico: number | null;
  descripcion: string; activo: boolean; createdAt: string; updatedAt: string;
};
export type ColorDefinition = { id: string; nombre: string; createdAt?: string; updatedAt?: string };
export type TextileColor = {
  id: string; idTela: string; idColor: string;
  hexadecimal: string | null; cmykC: number | null; cmykM: number | null; cmykY: number | null; cmykK: number | null;
  activo: boolean; createdAt: string; updatedAt: string;
};
export type FabricRoll = {
  id: string; idTela: string; unidadIngreso: FabricUnit; cantidadIngreso: number;
  pesoKg: number | null; metros: number | null; color: string; idTelaColor?: string | null; idLote: string;
  fechaIngreso: string; idProveedor: string | null; ubicacion: string;
  estado: RollStatus; nota: string; createdAt: string; updatedAt: string;
};
export type Supplier = { id: string; nombre: string; contacto: string; direccion: string; nota: string; createdAt: string; updatedAt: string };
export type SupplierPhone = { id: string; idProveedor: string; numero: string; etiqueta: string };
export type SupplierCategory = { id: string; idProveedor: string; categoria: string };
export type FabricPurchase = {
  id: string; idProveedor: string | null; fechaCompra: string; tipoComprobante: string;
  numeroComprobante: string; observacion: string; createdAt: string; updatedAt: string;
};
export type PurchaseDetail = {
  id: string; idCompra: string; idRollo: string; cantidadComprada: number;
  unidadPrecio: FabricUnit; precioUnitario: number; importeTotal: number;
};
export type RollMovement = {
  id: string; idRollo: string; fecha: string; tipo: 'ingreso' | 'consumo' | 'ajuste' | 'medicion';
  unidad: FabricUnit; delta: number | null; cantidadAnterior: number | null; cantidadNueva: number | null; nota: string;
};
export type FabricBackupData = {
  telas: Textile[]; rollos: FabricRoll[]; rolloMovimientos: RollMovement[]; proveedores: Supplier[];
  proveedorTelefonos: SupplierPhone[]; proveedorCategorias: SupplierCategory[];
  compras: FabricPurchase[]; detalleCompra: PurchaseDetail[];
  colores: ColorDefinition[]; telaColores: TextileColor[];
};
export const FABRIC_STORAGE_KEYS = {
  version: 'telastock-fabric-schema-version',
  telas: 'telastock-fabric-telas-v1',
  rollos: 'telastock-fabric-rollos-v1',
  rolloMovimientos: 'telastock-fabric-rollo-movimientos-v1',
  proveedores: 'telastock-fabric-proveedores-v1',
  proveedorTelefonos: 'telastock-fabric-proveedor-telefonos-v1',
  proveedorCategorias: 'telastock-fabric-proveedor-categorias-v1',
  compras: 'telastock-fabric-compras-v1',
  detalleCompra: 'telastock-fabric-detalle-compra-v1',
  colores: 'telastock-fabric-colores-v2',
  telaColores: 'telastock-fabric-tela-colores-v2',
} as const;

export function emptyFabricBackupData(): FabricBackupData {
  return { telas: [], rollos: [], rolloMovimientos: [], proveedores: [], proveedorTelefonos: [], proveedorCategorias: [], compras: [], detalleCompra: [], colores: [], telaColores: [] };
}
export function validateFabricBackupData(value: unknown): FabricBackupData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El respaldo de telas está incompleto.');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(emptyFabricBackupData()) as (keyof FabricBackupData)[];
  const output = {} as FabricBackupData;
  for (const key of keys) {
    const rows = record[key];
    if ((key === 'rolloMovimientos' || key === 'colores' || key === 'telaColores') && rows === undefined) {
      (output as unknown as Record<string, unknown>)[key] = [];
      continue;
    }
    if (!Array.isArray(rows) || !rows.every((row) => row && typeof row === 'object' && !Array.isArray(row) && typeof (row as { id?: unknown }).id === 'string')) {
      throw new Error(`El apartado de telas "${key}" falta o contiene filas no válidas.`);
    }
    const ids = rows.map((row) => (row as { id: string }).id);
    if (new Set(ids).size !== ids.length) throw new Error(`Hay identificadores duplicados en "${key}".`);
    (output as unknown as Record<string, unknown>)[key] = rows;
  }
  const telaIds = new Set(output.telas.map((x) => x.id));
  const proveedorIds = new Set(output.proveedores.map((x) => x.id));
  const rolloIds = new Set(output.rollos.map((x) => x.id));
  const compraIds = new Set(output.compras.map((x) => x.id));
  const colorIds = new Set(output.colores.map((x) => x.id));
  const telaColorIds = new Set(output.telaColores.map((x) => x.id));
  if (!output.telas.every((x) => x.nombreTela.trim() && ['KG', 'M'].includes(x.unidadVenta) && (x.anchoNominalM === null || (Number.isFinite(x.anchoNominalM) && x.anchoNominalM > 0)) && ((x.rendimientoTeorico ?? null) === null || (Number.isFinite(x.rendimientoTeorico) && x.rendimientoTeorico! > 0)))) throw new Error('Hay telas con información inválida.');
  if (new Set(output.colores.map((x) => x.nombre.trim().toLocaleLowerCase('es'))).size !== output.colores.length || !output.colores.every((x) => x.nombre.trim())) throw new Error('El catálogo central de colores tiene nombres vacíos o duplicados.');
  if (!output.telaColores.every((x) => telaIds.has(x.idTela) && colorIds.has(x.idColor) && (x.hexadecimal === null || /^#[0-9A-Fa-f]{6}$/.test(x.hexadecimal)) && [x.cmykC,x.cmykM,x.cmykY,x.cmykK].every((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 100)) && ((x.cmykC === null && x.cmykM === null && x.cmykY === null && x.cmykK === null) || [x.cmykC,x.cmykM,x.cmykY,x.cmykK].every((v) => v !== null)))) throw new Error('Hay colores por tela con tela, nombre, HEX o CMYK inválido.');
  if (new Set(output.telaColores.map((x) => x.idTela + ':' + x.idColor)).size !== output.telaColores.length) throw new Error('Una tela tiene el mismo color asociado más de una vez.');
  if (!output.proveedorTelefonos.every((x) => proveedorIds.has(x.idProveedor) && x.numero.trim())) throw new Error('Hay teléfonos relacionados con proveedores inexistentes.');
  if (!output.proveedorCategorias.every((x) => proveedorIds.has(x.idProveedor) && x.categoria.trim())) throw new Error('Hay categorías relacionadas con proveedores inexistentes.');
  if (!output.rollos.every((x) => telaIds.has(x.idTela) && (x.idProveedor === null || proveedorIds.has(x.idProveedor)) && (x.idTelaColor == null || (telaColorIds.has(x.idTelaColor) && output.telaColores.some((tc) => tc.id === x.idTelaColor && tc.idTela === x.idTela))) && ['KG', 'M'].includes(x.unidadIngreso) && Number.isFinite(x.cantidadIngreso) && x.cantidadIngreso > 0 && ['disponible', 'reservado', 'agotado', 'defectuoso'].includes(x.estado) && (x.pesoKg === null || (Number.isFinite(x.pesoKg) && x.pesoKg >= 0)) && (x.metros === null || (Number.isFinite(x.metros) && x.metros >= 0)))) throw new Error('Hay rollos con tela, medición, color o proveedor inválido.');
  if (!output.compras.every((x) => x.idProveedor === null || proveedorIds.has(x.idProveedor))) throw new Error('Hay compras relacionadas con proveedores inexistentes.');
  if (!output.detalleCompra.every((x) => {
    const roll = output.rollos.find((r) => r.id === x.idRollo);
    return compraIds.has(x.idCompra) && rolloIds.has(x.idRollo) && Boolean(roll) && roll!.unidadIngreso === x.unidadPrecio && Number.isFinite(x.cantidadComprada) && x.cantidadComprada > 0 && ['KG', 'M'].includes(x.unidadPrecio) && Number.isFinite(x.precioUnitario) && x.precioUnitario >= 0 && Math.abs(x.importeTotal - x.cantidadComprada * x.precioUnitario) < 0.011;
  })) throw new Error('Hay detalles de compra con relaciones, unidades o importes inválidos.');
  const rollMovementIds = new Set(output.rollos.map((x) => x.id));
  if (!output.rolloMovimientos.every((x) => rollMovementIds.has(x.idRollo) && ['KG', 'M'].includes(x.unidad) && ['ingreso', 'consumo', 'ajuste', 'medicion'].includes(x.tipo) && (x.delta === null || Number.isFinite(x.delta)) && (x.cantidadAnterior === null || (Number.isFinite(x.cantidadAnterior) && x.cantidadAnterior >= 0)) && (x.cantidadNueva === null || (Number.isFinite(x.cantidadNueva) && x.cantidadNueva >= 0)) && typeof x.fecha === 'string' && typeof x.nota === 'string')) throw new Error('Hay movimientos de rollo inválidos o sin rollo relacionado.');
  if (new Set(output.detalleCompra.map((x) => x.idRollo)).size !== output.detalleCompra.length) throw new Error('Un rollo aparece en más de una línea de compra.');
  return output;
}

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const id = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `fabric-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const nfmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
const nullableNumber = (value: string): number | null => value.trim() === '' ? null : Number(value);
const validQty = (value: number) => Number.isFinite(value) && value > 0;
const categories = ['Telas', 'Cierres', 'Bolsas', 'Elásticos', 'Hilos', 'Avíos', 'Sublimado', 'Otros'];
const statusLabel: Record<RollStatus, string> = { disponible: 'Disponible', reservado: 'Reservado', agotado: 'Agotado', defectuoso: 'Defectuoso' };
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

function normalizeCsvHeader(value: string) {
  return value.replace(/^\uFEFF/, '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
function parseCsvTable(source: string) {
  const text = source.replace(/^\uFEFF/, '');
  let delimiter = ';';
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (line: string, candidate: string) => {
    let quoted = false;
    let total = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"' && line[i + 1] === '"') { i++; continue; }
      if (line[i] === '"') quoted = !quoted;
      else if (!quoted && line[i] === candidate) total++;
    }
    return total;
  };
  if (count(firstLine, ',') > count(firstLine, ';')) delimiter = ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('El CSV no contiene filas de datos.');
  const headers = rows[0].map(normalizeCsvHeader);
  if (new Set(headers).size !== headers.length) throw new Error('El CSV tiene encabezados repetidos.');
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}
function csvDate(value: string) {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return raw;
  }
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (local) {
    const first = Number(local[1]);
    const second = Number(local[2]);
    const year = Number(local[3]);
    if (first <= 12 && second <= 12) throw new Error('Fecha ambigua. Reemplázala por AAAA-MM-DD para evitar una interpretación incorrecta.');
    const day = first > 12 ? first : second;
    const month = first > 12 ? second : first;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  throw new Error('Fecha inválida. Usa AAAA-MM-DD o un formato local sin ambigüedad.');
}
function parseCsvNumber(value: string) {
  let normalized = value.trim().replace(/\s/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  } else if (normalized.includes(',')) normalized = normalized.replace(',', '.');
  return Number(normalized);
}
function parseCsvNullableNumber(value: string, field: string) {
  if (!value.trim()) return null;
  const number = parseCsvNumber(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(field + ' debe ser un número igual o mayor que cero, o estar vacío.');
  return number;
}
async function stableCsvId(seed: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return value.slice(0,8) + '-' + value.slice(8,12) + '-' + value.slice(12,16) + '-' + value.slice(16,20) + '-' + value.slice(20);
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function inputNumber(value: number | null) { return value === null ? '' : String(value); }

type TelaForm = { id: string | null; nombreTela: string; unidadVenta: FabricUnit; anchoNominalM: string; rendimientoTeorico: string; descripcion: string; activo: boolean };
type RolloForm = {
  id: string | null; idTela: string; idTelaColor: string; unidadIngreso: FabricUnit; cantidadIngreso: string; fechaIngreso: string;
  color: string; pesoKg: string; metros: string; idLote: string; idProveedor: string;
  ubicacion: string; estado: RollStatus; nota: string;
};
type SupplierForm = { id: string | null; nombre: string; contacto: string; direccion: string; nota: string; telefonos: { id: string; numero: string; etiqueta: string }[]; categorias: string[] };
type PurchaseLineForm = { idRollo: string | null; idDetalle?: string | null; idTela: string; idTelaColor: string; unidad: FabricUnit; cantidad: string; cantidadesAdicionales: string; precio: string; color: string; pesoKg: string; metros: string; idLote: string };
type PurchaseForm = { id: string | null; idProveedor: string; fechaCompra: string; tipoComprobante: string; numeroComprobante: string; observacion: string; lines: PurchaseLineForm[] };
type InlineColorTarget = 'tela' | 'rollo' | 'compra';
type InlineColorForm = { target: InlineColorTarget; telaId: string; lineIndex: number | null; idTelaColor: string | null; nombre: string; hexadecimal: string; cmykC: string; cmykM: string; cmykY: string; cmykK: string };

function migrateLegacyColorData(value: FabricBackupData): FabricBackupData {
  const colores = [...(value.colores ?? [])];
  const telaColores = [...(value.telaColores ?? [])];
  const colorByName = new Map(colores.map((x) => [x.nombre.trim().toLocaleLowerCase('es'), x]));
  const variantByPair = new Map(telaColores.map((x) => [x.idTela + ':' + x.idColor, x]));
  const now = new Date().toISOString();
  const ensureVariant = (idTela: string, name: string) => {
    const clean = name.trim();
    if (!clean) return null;
    let color = colorByName.get(clean.toLocaleLowerCase('es'));
    if (!color) {
      color = { id: id(), nombre: clean, createdAt: now, updatedAt: now };
      colores.push(color);
      colorByName.set(clean.toLocaleLowerCase('es'), color);
    }
    const key = idTela + ':' + color.id;
    let variant = variantByPair.get(key);
    if (!variant) {
      variant = { id: id(), idTela, idColor: color.id, hexadecimal: null, cmykC: null, cmykM: null, cmykY: null, cmykK: null, activo: true, createdAt: now, updatedAt: now };
      telaColores.push(variant);
      variantByPair.set(key, variant);
    }
    return variant;
  };
  const rollos = value.rollos.map((roll) => {
    const legacy = roll as FabricRoll & { idTelaColor?: string | null };
    const variant = legacy.idTelaColor ? telaColores.find((x) => x.id === legacy.idTelaColor && x.idTela === roll.idTela) : ensureVariant(roll.idTela, roll.color ?? '');
    const colorName = variant ? colorByName.get(variant.idColor)?.nombre ?? roll.color : roll.color;
    return { ...roll, idTelaColor: variant?.id ?? null, color: colorName ?? '' };
  });
  const telas = value.telas.map((tela) => ({ ...tela, rendimientoTeorico: tela.rendimientoTeorico ?? null }));
  return { ...value, telas, rollos, colores, telaColores };
}

function blankTela(): TelaForm { return { id: null, nombreTela: '', unidadVenta: 'KG', anchoNominalM: '', rendimientoTeorico: '', descripcion: '', activo: true }; }
function blankRollo(telas: Textile[], telaColores: TextileColor[] = [], colores: ColorDefinition[] = []): RolloForm {
  const tela = telas.find((x) => x.activo);
  const firstColor = telaColores.find((x) => x.idTela === tela?.id && x.activo);
  const colorName = colores.find((x) => x.id === firstColor?.idColor)?.nombre ?? '';
  return { id: null, idTela: tela?.id ?? '', idTelaColor: firstColor?.id ?? '', unidadIngreso: tela?.unidadVenta ?? 'KG', cantidadIngreso: '', fechaIngreso: today(), color: colorName, pesoKg: '', metros: '', idLote: '', idProveedor: '', ubicacion: '', estado: 'disponible', nota: '' };
}
function blankLine(telas: Textile[], telaColores: TextileColor[] = [], colores: ColorDefinition[] = []): PurchaseLineForm {
  const tela = telas.find((x) => x.activo);
  const firstColor = telaColores.find((x) => x.idTela === tela?.id && x.activo);
  return { idRollo: null, idDetalle: null, idTela: tela?.id ?? '', idTelaColor: firstColor?.id ?? '', unidad: tela?.unidadVenta ?? 'KG', cantidad: '', cantidadesAdicionales: '', precio: '', color: colores.find((x) => x.id === firstColor?.idColor)?.nombre ?? '', pesoKg: '', metros: '', idLote: '' };
}
function blankPurchase(telas: Textile[], telaColores: TextileColor[] = [], colores: ColorDefinition[] = []): PurchaseForm { return { id: null, idProveedor: '', fechaCompra: today(), tipoComprobante: 'Factura', numeroComprobante: '', observacion: '', lines: [blankLine(telas, telaColores, colores)] }; }

export function FabricModule({ view }: { view: FabricView }) {
  const [data, setData] = useState<FabricBackupData>(emptyFabricBackupData);
  const [ready, setReady] = useState(false);
  const [storageSafe, setStorageSafe] = useState(true);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const [telaSearch, setTelaSearch] = useState('');
  const [rollSearch, setRollSearch] = useState('');
  const [rollTelaFilter, setRollTelaFilter] = useState('all');
  const [rollStatusFilter, setRollStatusFilter] = useState('all');
  const [rollSupplierFilter, setRollSupplierFilter] = useState('all');
  const [rollColorFilter, setRollColorFilter] = useState('all');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierCategoryFilter, setSupplierCategoryFilter] = useState('all');
  const [showTelaForm, setShowTelaForm] = useState(false);
  const [showRolloForm, setShowRolloForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showRolloDetail, setShowRolloDetail] = useState(false);
  const [showRollMovement, setShowRollMovement] = useState(false);
  const [rollMovementForm, setRollMovementForm] = useState<{ unidad: FabricUnit; cantidad: string; medidaComplementaria: string; nota: string }>({ unidad: 'KG', cantidad: '', medidaComplementaria: '', nota: 'Consumo para corte' });
  const [showMoreRollo, setShowMoreRollo] = useState(false);
  const [selectedRolloId, setSelectedRolloId] = useState<string | null>(null);
  const [telaForm, setTelaForm] = useState<TelaForm>(blankTela);
  const [rolloForm, setRolloForm] = useState<RolloForm>(() => blankRollo([]));
  const [supplierForm, setSupplierForm] = useState<SupplierForm>({ id: null, nombre: '', contacto: '', direccion: '', nota: '', telefonos: [{ id: id(), numero: '', etiqueta: 'Principal' }], categorias: ['Telas'] });
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>(() => blankPurchase([]));
  const [showInlineSupplier, setShowInlineSupplier] = useState(false);
  const [inlineSupplierName, setInlineSupplierName] = useState('');
  const [inlineColorForm, setInlineColorForm] = useState<InlineColorForm | null>(null);

  const persist = (next: FabricBackupData): boolean => {
    if (!storageSafe) {
      setNotice({ text: 'No se guardaron cambios porque se detectó un respaldo local dañado. Restaura una copia JSON válida antes de continuar.', kind: 'error' });
      return false;
    }
    const collectionKeys = (Object.keys(FABRIC_STORAGE_KEYS) as (keyof typeof FABRIC_STORAGE_KEYS)[]).filter((key) => key !== 'version');
    const previous = new Map<string, string | null>();
    try {
      collectionKeys.forEach((key) => previous.set(FABRIC_STORAGE_KEYS[key], localStorage.getItem(FABRIC_STORAGE_KEYS[key])));
      collectionKeys.forEach((key) => {
        const field = key as keyof FabricBackupData;
        localStorage.setItem(FABRIC_STORAGE_KEYS[key], JSON.stringify(next[field]));
      });
      localStorage.setItem(FABRIC_STORAGE_KEYS.version, '2');
      setData(next);
      window.dispatchEvent(new Event('telastock-fabric-data-updated'));
      return true;
    } catch {
      previous.forEach((value, key) => {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch { /* Best-effort rollback; do not replace the original error. */ }
      });
      setStorageSafe(false);
      setNotice({ text: 'No se pudo guardar. El almacenamiento del navegador podría estar lleno o bloqueado; no se completó el cambio. Exporta una copia y revisa el espacio disponible.', kind: 'error' });
      return false;
    }
  };
    const loadLocal = () => {
    const next = emptyFabricBackupData();
    let safe = true;
    let warning = '';
    const storedVersion = Number(localStorage.getItem(FABRIC_STORAGE_KEYS.version) ?? '0');
    if (storedVersion > 2) {
      safe = false;
      warning = 'Este inventario fue creado con una versión más reciente de TelaStock. No se escribieron cambios para protegerlo.';
    }
    (Object.keys(FABRIC_STORAGE_KEYS) as (keyof typeof FABRIC_STORAGE_KEYS)[]).forEach((key) => {
      if (key === 'version') return;
      const field = key as keyof FabricBackupData;
      try {
        const raw = localStorage.getItem(FABRIC_STORAGE_KEYS[key]);
        if (raw) (next as unknown as Record<string, unknown>)[field] = JSON.parse(raw);
      } catch {
        safe = false;
        warning = 'Se encontró un apartado local dañado. No se sobrescribieron los datos; restaura un respaldo JSON válido.';
      }
    });
    try {
      return { data: validateFabricBackupData(migrateLegacyColorData(next)), safe, warning };
    } catch {
      return { data: next, safe: false, warning: 'Las relaciones del inventario de telas no son válidas. No se sobrescribieron los datos; restaura un respaldo JSON válido.' };
    }
  };
  useEffect(() => {
    const loaded = loadLocal();
    setData(loaded.data);
    setStorageSafe(loaded.safe);
    if (loaded.safe) localStorage.setItem(FABRIC_STORAGE_KEYS.version, '2');
    else setNotice({ text: loaded.warning, kind: 'error' });
    setReady(true);
    const refresh = () => {
      const restored = loadLocal();
      setData(restored.data);
      setStorageSafe(restored.safe);
      if (!restored.safe) setNotice({ text: restored.warning, kind: 'error' });
    };
    window.addEventListener('telastock-fabric-data-restored', refresh);
    return () => window.removeEventListener('telastock-fabric-data-restored', refresh);
  }, []);
  useEffect(() => {
    if (!ready || !storageSafe) return;
    try {
      for (const [key, field] of [
        [FABRIC_STORAGE_KEYS.telas, 'telas'], [FABRIC_STORAGE_KEYS.rollos, 'rollos'], [FABRIC_STORAGE_KEYS.rolloMovimientos, 'rolloMovimientos'],
        [FABRIC_STORAGE_KEYS.proveedores, 'proveedores'], [FABRIC_STORAGE_KEYS.proveedorTelefonos, 'proveedorTelefonos'],
        [FABRIC_STORAGE_KEYS.proveedorCategorias, 'proveedorCategorias'], [FABRIC_STORAGE_KEYS.compras, 'compras'],
        [FABRIC_STORAGE_KEYS.detalleCompra, 'detalleCompra'], [FABRIC_STORAGE_KEYS.colores, 'colores'], [FABRIC_STORAGE_KEYS.telaColores, 'telaColores'],
      ] as const) localStorage.setItem(key, JSON.stringify(data[field]));
    } catch {
      setStorageSafe(false);
      setNotice({ text: 'No se pudo guardar el inventario de telas en este navegador.', kind: 'error' });
    }
  }, [data, ready, storageSafe]);

    const telaById = useMemo(() => new Map(data.telas.map((x) => [x.id, x])), [data.telas]);
  const supplierById = useMemo(() => new Map(data.proveedores.map((x) => [x.id, x])), [data.proveedores]);
  const rollById = useMemo(() => new Map(data.rollos.map((x) => [x.id, x])), [data.rollos]);
  const colorById = useMemo(() => new Map(data.colores.map((x) => [x.id, x])), [data.colores]);
  const telaColorById = useMemo(() => new Map(data.telaColores.map((x) => [x.id, x])), [data.telaColores]);
  const colorNameForVariant = (variantId?: string | null, fallback = '') => {
    const variant = variantId ? telaColorById.get(variantId) : undefined;
    return variant ? colorById.get(variant.idColor)?.nombre ?? fallback : fallback;
  };
  const colorsForTela = (telaId: string) => data.telaColores.filter((x) => x.idTela === telaId && x.activo).map((variant) => ({ ...variant, color: colorById.get(variant.idColor) })).filter((x) => x.color).sort((a,b) => (a.color?.nombre ?? '').localeCompare(b.color?.nombre ?? '', 'es'));
  const detailByPurchase = useMemo(() => {
    const map = new Map<string, PurchaseDetail[]>();
    data.detalleCompra.forEach((detail) => map.set(detail.idCompra, [...(map.get(detail.idCompra) ?? []), detail]));
    return map;
  }, [data.detalleCompra]);

  const tell = (text: string, kind: 'success' | 'error' | 'info' = 'success') => setNotice({ text, kind });
  const telaRows = useMemo(() => data.telas.filter((x) => !telaSearch || `${x.nombreTela} ${x.descripcion}`.toLocaleLowerCase('es').includes(telaSearch.toLocaleLowerCase('es'))).sort((a,b) => a.nombreTela.localeCompare(b.nombreTela, 'es')), [data.telas, telaSearch]);
  const availableColors = useMemo(() => [...new Set(data.rollos.map((x) => x.color).filter(Boolean))].sort(), [data.rollos]);
  const rollRows = useMemo(() => data.rollos.filter((roll) => {
    const tela = telaById.get(roll.idTela)?.nombreTela ?? '';
    const supplier = roll.idProveedor ? supplierById.get(roll.idProveedor)?.nombre ?? '' : '';
    const text = `${tela} ${roll.color} ${roll.idLote} ${roll.ubicacion} ${supplier} ${roll.id}`.toLocaleLowerCase('es');
    return (!rollSearch || text.includes(rollSearch.toLocaleLowerCase('es'))) &&
      (rollTelaFilter === 'all' || roll.idTela === rollTelaFilter) &&
      (rollStatusFilter === 'all' || roll.estado === rollStatusFilter) &&
      (rollSupplierFilter === 'all' || roll.idProveedor === rollSupplierFilter) &&
      (rollColorFilter === 'all' || roll.color === rollColorFilter);
  }).sort((a,b) => b.fechaIngreso.localeCompare(a.fechaIngreso)), [data.rollos, rollSearch, rollTelaFilter, rollStatusFilter, rollSupplierFilter, rollColorFilter, telaById, supplierById]);
  const purchaseRows = useMemo(() => data.compras.filter((x) => {
    const supplier = x.idProveedor ? supplierById.get(x.idProveedor)?.nombre ?? '' : '';
    const details = detailByPurchase.get(x.id) ?? [];
    const haystack = `${supplier} ${x.numeroComprobante} ${x.tipoComprobante} ${details.map((d) => `${telaById.get(rollById.get(d.idRollo)?.idTela ?? '')?.nombreTela ?? ''} ${d.idRollo}`).join(' ')}`.toLocaleLowerCase('es');
    return !purchaseSearch || haystack.includes(purchaseSearch.toLocaleLowerCase('es'));
  }).sort((a,b) => b.fechaCompra.localeCompare(a.fechaCompra)), [data.compras, supplierById, detailByPurchase, telaById, rollById, purchaseSearch]);
  const supplierRows = useMemo(() => data.proveedores.filter((supplier) => {
    const phones = data.proveedorTelefonos.filter((x) => x.idProveedor === supplier.id).map((x) => x.numero).join(' ');
    const cats = data.proveedorCategorias.filter((x) => x.idProveedor === supplier.id).map((x) => x.categoria).join(' ');
    return (!supplierSearch || `${supplier.nombre} ${supplier.contacto} ${supplier.direccion} ${phones} ${cats}`.toLocaleLowerCase('es').includes(supplierSearch.toLocaleLowerCase('es'))) &&
      (supplierCategoryFilter === 'all' || data.proveedorCategorias.some((x) => x.idProveedor === supplier.id && x.categoria === supplierCategoryFilter));
  }).sort((a,b) => a.nombre.localeCompare(b.nombre, 'es')), [data.proveedores, data.proveedorTelefonos, data.proveedorCategorias, supplierSearch, supplierCategoryFilter]);

  function openTela(tela?: Textile) {
    setTelaForm(tela ? { id: tela.id, nombreTela: tela.nombreTela, unidadVenta: tela.unidadVenta, anchoNominalM: inputNumber(tela.anchoNominalM), rendimientoTeorico: inputNumber(tela.rendimientoTeorico ?? null), descripcion: tela.descripcion, activo: tela.activo } : blankTela());
    setShowTelaForm(true);
  }
  function saveTela(event: FormEvent) {
    event.preventDefault();
    const name = telaForm.nombreTela.trim();
    const width = nullableNumber(telaForm.anchoNominalM);
    const yieldValue = nullableNumber(telaForm.rendimientoTeorico);
    if (!name) return tell('Escribe el nombre de la tela.', 'error');
    if (telaForm.anchoNominalM.trim() && (width === null || !Number.isFinite(width) || width <= 0)) return tell('El ancho debe ser un número mayor que cero o quedar vacío.', 'error');
    if (telaForm.rendimientoTeorico.trim() && (yieldValue === null || !Number.isFinite(yieldValue) || yieldValue <= 0)) return tell('El rendimiento teórico debe ser un número mayor que cero o quedar vacío.', 'error');
    if (data.telas.some((x) => x.nombreTela.toLocaleLowerCase('es') === name.toLocaleLowerCase('es') && x.id !== telaForm.id)) return tell('Ya existe una tela con ese nombre.', 'error');
    const now = new Date().toISOString();
    const row: Textile = { id: telaForm.id ?? id(), nombreTela: name, unidadVenta: telaForm.unidadVenta, anchoNominalM: width, rendimientoTeorico: yieldValue, descripcion: telaForm.descripcion.trim(), activo: telaForm.activo, createdAt: telaForm.id ? (telaById.get(telaForm.id)?.createdAt ?? now) : now, updatedAt: now };
    if (!persist({ ...data, telas: telaForm.id ? data.telas.map((x) => x.id === row.id ? row : x) : [...data.telas, row] })) return;
    setShowTelaForm(false); tell(telaForm.id ? 'Tela actualizada. Los rollos y compras anteriores se conservaron.' : 'Tela creada y activada según el checklist.');
  }
  function toggleTela(tela: Textile) {
    if (!persist({ ...data, telas: data.telas.map((x) => x.id === tela.id ? { ...x, activo: !x.activo, updatedAt: new Date().toISOString() } : x) })) return;
    tell(tela.activo ? 'Tela desactivada. Su inventario e historial permanecen.' : 'Tela activada.');
  }

  function openInlineColor(target: InlineColorTarget, telaId: string, lineIndex: number | null = null, variantId?: string) {
    const variant = variantId ? telaColorById.get(variantId) : undefined;
    const color = variant ? colorById.get(variant.idColor) : undefined;
    setInlineColorForm({
      target, telaId, lineIndex, idTelaColor: variant?.id ?? null, nombre: color?.nombre ?? '',
      hexadecimal: variant?.hexadecimal ?? '',
      cmykC: inputNumber(variant?.cmykC ?? null), cmykM: inputNumber(variant?.cmykM ?? null),
      cmykY: inputNumber(variant?.cmykY ?? null), cmykK: inputNumber(variant?.cmykK ?? null),
    });
  }
  function saveInlineColor(event: FormEvent) {
    event.preventDefault();
    if (!inlineColorForm) return;
    const name = inlineColorForm.nombre.trim();
    if (!data.telas.some((x) => x.id === inlineColorForm.telaId)) return tell('Selecciona una tela válida para asociar este color.', 'error');
    if (!name) return tell('Escribe el nombre del color.', 'error');
    const rawHex = inlineColorForm.hexadecimal.trim();
    const expandedHex = /^#[0-9A-Fa-f]{3}$/.test(rawHex) ? '#' + rawHex.slice(1).split('').map((x) => x + x).join('') : rawHex;
    const hexadecimal = expandedHex ? expandedHex.toUpperCase() : null;
    if (hexadecimal && !/^#[0-9A-F]{6}$/.test(hexadecimal)) return tell('El HEX debe tener formato #RRGGBB, por ejemplo #1E5AA8.', 'error');
    const cmykRaw = [inlineColorForm.cmykC, inlineColorForm.cmykM, inlineColorForm.cmykY, inlineColorForm.cmykK];
    const cmyk = cmykRaw.map((x) => nullableNumber(x));
    if (cmyk.some((x) => x !== null && (!Number.isFinite(x) || x < 0 || x > 100))) return tell('Cada valor CMYK debe estar entre 0 y 100.', 'error');
    if (cmyk.some((x) => x !== null) && cmyk.some((x) => x === null)) return tell('Completa los cuatro valores CMYK o déjalos todos vacíos.', 'error');
    const now = new Date().toISOString();
    const currentVariant = inlineColorForm.idTelaColor ? telaColorById.get(inlineColorForm.idTelaColor) : undefined;
    const existingColor = currentVariant ? colorById.get(currentVariant.idColor) : data.colores.find((x) => x.nombre.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
    const color: ColorDefinition = existingColor ?? { id: id(), nombre: name, createdAt: now, updatedAt: now };
    const duplicate = data.telaColores.find((x) => x.idTela === inlineColorForm.telaId && x.idColor === color.id && x.id !== currentVariant?.id);
    if (duplicate && !currentVariant) {
      const updatedVariant: TextileColor = { ...duplicate, hexadecimal, cmykC: cmyk[0], cmykM: cmyk[1], cmykY: cmyk[2], cmykK: cmyk[3], activo: true, updatedAt: now };
      const next = { ...data, colores: existingColor ? data.colores : [...data.colores, color], telaColores: data.telaColores.map((x) => x.id === duplicate.id ? updatedVariant : x) };
      if (!persist(next)) return;
      if (inlineColorForm.target === 'rollo') setRolloForm((x) => ({ ...x, idTelaColor: updatedVariant.id, color: color.nombre }));
      if (inlineColorForm.target === 'compra' && inlineColorForm.lineIndex !== null) updatePurchaseLine(inlineColorForm.lineIndex, { idTelaColor: updatedVariant.id, color: color.nombre });
      setInlineColorForm(null);
      tell('Se actualizaron los códigos del color para esta tela.');
      return;
    }
    const variant: TextileColor = {
      id: currentVariant?.id ?? id(), idTela: inlineColorForm.telaId, idColor: color.id,
      hexadecimal, cmykC: cmyk[0], cmykM: cmyk[1], cmykY: cmyk[2], cmykK: cmyk[3],
      activo: true, createdAt: currentVariant?.createdAt ?? now, updatedAt: now,
    };
    const next = {
      ...data,
      colores: existingColor ? data.colores : [...data.colores, color],
      telaColores: currentVariant
        ? data.telaColores.map((x) => x.id === currentVariant.id ? variant : x)
        : [...data.telaColores, variant],
    };
    if (!persist(next)) return;
    if (inlineColorForm.target === 'rollo') setRolloForm((x) => ({ ...x, idTelaColor: variant.id, color: color.nombre }));
    if (inlineColorForm.target === 'compra' && inlineColorForm.lineIndex !== null) updatePurchaseLine(inlineColorForm.lineIndex, { idTelaColor: variant.id, color: color.nombre });
    setInlineColorForm(null);
    tell(currentVariant ? 'Códigos del color actualizados para esta tela.' : 'Color asociado a la tela y agregado al catálogo.');
  }
  function toggleTelaColor(variant: TextileColor) {
    if (!persist({ ...data, telaColores: data.telaColores.map((x) => x.id === variant.id ? { ...x, activo: !x.activo, updatedAt: new Date().toISOString() } : x) })) return;
    tell(variant.activo ? 'Color desactivado para esta tela. El historial de rollos se conserva.' : 'Color activado para esta tela.');
  }
  function openRollo(roll?: FabricRoll) {
    setShowMoreRollo(false);
    const tela = roll ? telaById.get(roll.idTela) : data.telas.find((x) => x.activo);
    const defaultRoll = blankRollo(data.telas, data.telaColores, data.colores);
    setRolloForm(roll ? {
      id: roll.id, idTela: roll.idTela, idTelaColor: roll.idTelaColor ?? data.telaColores.find((x) => x.idTela === roll.idTela && colorById.get(x.idColor)?.nombre === roll.color)?.id ?? '', unidadIngreso: roll.unidadIngreso, cantidadIngreso: String(roll.cantidadIngreso), fechaIngreso: roll.fechaIngreso,
      color: colorNameForVariant(roll.idTelaColor, roll.color), pesoKg: inputNumber(roll.pesoKg), metros: inputNumber(roll.metros), idLote: roll.idLote, idProveedor: roll.idProveedor ?? '',
      ubicacion: roll.ubicacion, estado: roll.estado, nota: roll.nota,
    } : { ...defaultRoll, idTela: tela?.id ?? '', unidadIngreso: tela?.unidadVenta ?? 'KG' });
    setShowRolloForm(true);
  }
  function saveRollo(event: FormEvent) {
    event.preventDefault();
    const tela = telaById.get(rolloForm.idTela);
    const quantity = Number(rolloForm.cantidadIngreso);
    const weightExtra = nullableNumber(rolloForm.pesoKg);
    const metresExtra = nullableNumber(rolloForm.metros);
    if (!tela) return tell('Selecciona una tela existente.', 'error');
    const selectedColor = rolloForm.idTelaColor ? telaColorById.get(rolloForm.idTelaColor) : undefined;
    if (rolloForm.idTelaColor && (!selectedColor || selectedColor.idTela !== tela.id || !selectedColor.activo)) return tell('El color seleccionado no pertenece a esta tela o está inactivo.', 'error');
    const colorName = selectedColor ? colorById.get(selectedColor.idColor)?.nombre ?? '' : '';
    const previousRoll = rolloForm.id ? rollById.get(rolloForm.id) : undefined;
    if (previousRoll && data.detalleCompra.some((detail) => detail.idRollo === previousRoll.id) && previousRoll.idTela !== tela.id) return tell('Este rollo ya pertenece a una compra histórica. No puedes cambiarle la tela; registra un rollo nuevo si hubo un error de origen.', 'error');
    if (previousRoll && previousRoll.unidadIngreso !== rolloForm.unidadIngreso) return tell('La unidad original de ingreso no se puede cambiar.', 'error');
    if (!validQty(quantity)) return tell('La cantidad ingresada debe ser mayor que cero.', 'error');
    if ([weightExtra, metresExtra].some((x) => x !== null && (!Number.isFinite(x) || x < 0))) return tell('Las mediciones reales deben ser positivas o quedar vacías; no uses cero para representar un dato desconocido.', 'error');
    if (rolloForm.idProveedor && !supplierById.has(rolloForm.idProveedor)) return tell('El proveedor seleccionado ya no existe.', 'error');
    const now = new Date().toISOString();
    // En edición se conserva separado el ingreso original del saldo medido actual.
    const weight = rolloForm.id ? weightExtra : rolloForm.unidadIngreso === 'KG' ? quantity : weightExtra;
    const metros = rolloForm.id ? metresExtra : rolloForm.unidadIngreso === 'M' ? quantity : metresExtra;
    const row: FabricRoll = {
      id: rolloForm.id ?? id(), idTela: tela.id, unidadIngreso: rolloForm.unidadIngreso, cantidadIngreso: quantity,
      pesoKg: weight, metros, color: colorName, idTelaColor: selectedColor?.id ?? null, idLote: rolloForm.idLote.trim(), fechaIngreso: rolloForm.fechaIngreso,
      idProveedor: rolloForm.idProveedor || null, ubicacion: rolloForm.ubicacion.trim(), estado: rolloForm.estado, nota: rolloForm.nota.trim(),
      createdAt: rolloForm.id ? (rollById.get(rolloForm.id)?.createdAt ?? now) : now, updatedAt: now,
    };
    const movementRows: RollMovement[] = [];
    const previous = rolloForm.id ? rollById.get(rolloForm.id) : undefined;
    const addMeasurement = (unit: FabricUnit, before: number | null, after: number | null) => {
      if (before === after) return;
      const bothKnown = before !== null && after !== null;
      movementRows.push({ id: id(), idRollo: row.id, fecha: now, tipo: bothKnown ? 'ajuste' : 'medicion', unidad: unit, delta: bothKnown ? Number((after! - before!).toFixed(3)) : null, cantidadAnterior: before, cantidadNueva: after, nota: bothKnown ? 'Corrección de medición real' : 'Registro o corrección de medición real' });
    };
    if (!previous) {
      movementRows.push({ id: id(), idRollo: row.id, fecha: now, tipo: 'ingreso', unidad: row.unidadIngreso, delta: quantity, cantidadAnterior: null, cantidadNueva: quantity, nota: 'Ingreso inicial del rollo' });
      if (row.unidadIngreso !== 'KG' && row.pesoKg !== null) addMeasurement('KG', null, row.pesoKg);
      if (row.unidadIngreso !== 'M' && row.metros !== null) addMeasurement('M', null, row.metros);
    } else {
      addMeasurement('KG', previous.pesoKg, row.pesoKg);
      addMeasurement('M', previous.metros, row.metros);
    }
    if (!persist({
      ...data,
      rollos: previous ? data.rollos.map((x) => x.id === row.id ? row : x) : [...data.rollos, row],
      rolloMovimientos: [...data.rolloMovimientos, ...movementRows],
    })) return;
    setShowRolloForm(false); tell(rolloForm.id ? 'Rollo actualizado. Las compras históricas no se modificaron.' : 'Rollo registrado en el inventario.');
  }

  function openRollMovement(roll: FabricRoll) {
    setRollMovementForm({ unidad: roll.unidadIngreso, cantidad: '', medidaComplementaria: '', nota: 'Consumo para corte' });
    setShowRollMovement(true);
  }
  function saveRollMovement(event: FormEvent) {
    event.preventDefault();
    const roll = selectedRoll;
    const quantity = Number(rollMovementForm.cantidad);
    if (!roll) return tell('No se encontró el rollo seleccionado.', 'error');
    if (!validQty(quantity)) return tell('La cantidad debe ser mayor que cero.', 'error');
    const current = rollMovementForm.unidad === 'KG' ? roll.pesoKg : roll.metros;
    if (current === null) return tell(`No hay una medición real en ${rollMovementForm.unidad} para este rollo. Registra primero esa medida; no se hará una conversión estimada.`, 'error');
    if (quantity > current) return tell(`No puedes retirar ${nfmt.format(quantity)} ${rollMovementForm.unidad}: solo hay ${nfmt.format(current)} disponible.`, 'error');
    const otherUnit: FabricUnit = rollMovementForm.unidad === 'KG' ? 'M' : 'KG';
    const otherCurrent = otherUnit === 'KG' ? roll.pesoKg : roll.metros;
    const otherEntered = nullableNumber(rollMovementForm.medidaComplementaria);
    if (otherEntered !== null && (!Number.isFinite(otherEntered) || otherEntered < 0)) return tell(`La nueva medición en ${otherUnit} debe ser un número igual o mayor que cero, o quedar vacía.`, 'error');
    const next = Number((current - quantity).toFixed(3));
    const now = new Date().toISOString();
    // Al consumir por una dimensión, la otra medición previa deja de representar el sobrante.
    // Se conserva solo si el operario registra expresamente una nueva medición real.
    const nextOther = rollMovementForm.medidaComplementaria.trim() === '' ? null : otherEntered;
    const updated: FabricRoll = {
      ...roll,
      pesoKg: rollMovementForm.unidad === 'KG' ? next : nextOther,
      metros: rollMovementForm.unidad === 'M' ? next : nextOther,
      estado: next === 0 && (nextOther === null || nextOther === 0) ? 'agotado' : roll.estado,
      updatedAt: now,
    };
    const movement: RollMovement = {
      id: id(), idRollo: roll.id, fecha: now, tipo: 'consumo', unidad: rollMovementForm.unidad,
      delta: -quantity, cantidadAnterior: current, cantidadNueva: next, nota: rollMovementForm.nota.trim() || 'Consumo de tela',
    };
    const measurementMovement: RollMovement | null = otherCurrent === nextOther ? null : {
      id: id(), idRollo: roll.id, fecha: now, tipo: 'medicion', unidad: otherUnit, delta: null,
      cantidadAnterior: otherCurrent, cantidadNueva: nextOther,
      nota: nextOther === null ? `Medición ${otherUnit} no disponible después del consumo; no se estimó el sobrante` : `Nueva medición real del sobrante en ${otherUnit}`,
    };
    if (!persist({
      ...data,
      rollos: data.rollos.map((x) => x.id === roll.id ? updated : x),
      rolloMovimientos: [...data.rolloMovimientos, movement, ...(measurementMovement ? [measurementMovement] : [])],
    })) return;
    setShowRollMovement(false);
    setRollMovementForm({ unidad: updated.unidadIngreso, cantidad: '', medidaComplementaria: '', nota: 'Consumo para corte' });
    tell(`Consumo registrado. Saldo real: ${nfmt.format(next)} ${movement.unidad}. La medición complementaria quedó ${nextOther === null ? 'sin determinar' : 'actualizada con el valor ingresado'}.`);
  }

  function openSupplier(supplier?: Supplier) {
    const phones = supplier ? data.proveedorTelefonos.filter((x) => x.idProveedor === supplier.id) : [];
    const supplierCats = supplier ? data.proveedorCategorias.filter((x) => x.idProveedor === supplier.id).map((x) => x.categoria) : ['Telas'];
    setSupplierForm(supplier ? { id: supplier.id, nombre: supplier.nombre, contacto: supplier.contacto, direccion: supplier.direccion, nota: supplier.nota, telefonos: phones.length ? phones.map((x) => ({ ...x })) : [{ id: id(), numero: '', etiqueta: 'Principal' }], categorias: supplierCats } : { id: null, nombre: '', contacto: '', direccion: '', nota: '', telefonos: [{ id: id(), numero: '', etiqueta: 'Principal' }], categorias: ['Telas'] });
    setShowSupplierForm(true);
  }
  function saveSupplier(event: FormEvent) {
    event.preventDefault();
    const name = supplierForm.nombre.trim();
    const phones = supplierForm.telefonos.filter((x) => x.numero.trim());
    if (!name) return tell('Escribe el nombre comercial del proveedor.', 'error');
    if (new Set(phones.map((x) => x.numero.replace(/\s+/g, '').toLowerCase())).size !== phones.length) return tell('Hay números telefónicos duplicados.', 'error');
    const now = new Date().toISOString();
    const row: Supplier = { id: supplierForm.id ?? id(), nombre: name, contacto: supplierForm.contacto.trim(), direccion: supplierForm.direccion.trim(), nota: supplierForm.nota.trim(), createdAt: supplierForm.id ? (supplierById.get(supplierForm.id)?.createdAt ?? now) : now, updatedAt: now };
    const phoneRows = phones.map((x) => ({ ...x, idProveedor: row.id, numero: x.numero.trim(), etiqueta: x.etiqueta.trim() || 'Teléfono' }));
    const categoryRows = supplierForm.categorias.map((categoria) => ({ id: id(), idProveedor: row.id, categoria }));
    if (!persist({
      ...data,
      proveedores: supplierForm.id ? data.proveedores.map((x) => x.id === row.id ? row : x) : [...data.proveedores, row],
      proveedorTelefonos: [...data.proveedorTelefonos.filter((x) => x.idProveedor !== row.id), ...phoneRows],
      proveedorCategorias: [...data.proveedorCategorias.filter((x) => x.idProveedor !== row.id), ...categoryRows],
    })) return;
    setShowSupplierForm(false); tell(supplierForm.id ? 'Proveedor actualizado.' : 'Proveedor registrado.');
  }

  function addPurchaseLine() { setPurchaseForm((x) => ({ ...x, lines: [...x.lines, blankLine(data.telas, data.telaColores, data.colores)] })); }
  function updatePurchaseLine(index: number, changes: Partial<PurchaseLineForm>) {
    setPurchaseForm((x) => ({ ...x, lines: x.lines.map((line, i) => i === index ? { ...line, ...changes } : line) }));
  }
  function openPurchase(purchase?: FabricPurchase) {
    if (!purchase) {
      setPurchaseForm(blankPurchase(data.telas, data.telaColores, data.colores));
    } else {
      const lines = (detailByPurchase.get(purchase.id) ?? []).map((detail) => {
        const roll = rollById.get(detail.idRollo);
        return { idRollo: detail.idRollo, idDetalle: detail.id, idTela: roll?.idTela ?? '', idTelaColor: roll?.idTelaColor ?? '', unidad: detail.unidadPrecio, cantidad: String(detail.cantidadComprada), cantidadesAdicionales: '', precio: String(detail.precioUnitario), color: colorNameForVariant(roll?.idTelaColor, roll?.color ?? ''), pesoKg: inputNumber(roll?.pesoKg ?? null), metros: inputNumber(roll?.metros ?? null), idLote: roll?.idLote ?? '' };
      });
      setPurchaseForm({ id: purchase.id, idProveedor: purchase.idProveedor ?? '', fechaCompra: purchase.fechaCompra, tipoComprobante: purchase.tipoComprobante, numeroComprobante: purchase.numeroComprobante, observacion: purchase.observacion, lines: lines.length ? lines : [blankLine(data.telas, data.telaColores, data.colores)] });
    }
    setShowPurchaseForm(true);
  }
  function savePurchase(event: FormEvent) {
    event.preventDefault();
    if (!purchaseForm.lines.length) return tell('Agrega al menos un rollo a la compra.', 'error');
    if (purchaseForm.idProveedor && !supplierById.has(purchaseForm.idProveedor)) return tell('Selecciona un proveedor válido.', 'error');
    const expandedLines: Array<PurchaseLineForm & { quantity: number; price: number; tela: Textile }> = [];
    for (const line of purchaseForm.lines) {
      const tela = telaById.get(line.idTela);
      const quantity = Number(line.cantidad);
      const price = Number(line.precio);
      const colorVariant = line.idTelaColor ? telaColorById.get(line.idTelaColor) : undefined;
      if (!tela || !validQty(quantity) || !line.precio.trim() || !Number.isFinite(price) || price < 0) return tell('Cada línea necesita una tela, cantidad mayor que cero y un precio unitario explícito (0 también es válido).', 'error');
      if (line.idTelaColor && (!colorVariant || colorVariant.idTela !== tela.id || !colorVariant.activo)) return tell('El color seleccionado no pertenece a la tela indicada o está inactivo.', 'error');
      if ([nullableNumber(line.pesoKg), nullableNumber(line.metros)].some((n) => n !== null && (!Number.isFinite(n) || n < 0))) return tell('Una medición real es inválida. Deja el campo vacío cuando no conozcas la medida.', 'error');
      if (line.idRollo && line.cantidadesAdicionales.trim()) return tell('Para agregar rollos adicionales a una compra existente, usa “Añadir rollo” y crea una nueva línea.', 'error');
      expandedLines.push({ ...line, quantity, price, tela });
      if (!line.idRollo && line.cantidadesAdicionales.trim()) {
        const extras = line.cantidadesAdicionales.split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean).map(Number);
        if (!extras.length || extras.some((x) => !validQty(x))) return tell('Las cantidades adicionales deben ser números mayores que cero, separados por coma.', 'error');
        extras.forEach((extraQuantity) => expandedLines.push({
          ...line, idRollo: null, idDetalle: null, quantity: extraQuantity, price, tela,
          pesoKg: '', metros: '', cantidadesAdicionales: '',
        }));
      }
    }
    const now = new Date().toISOString();
    const purchaseId = purchaseForm.id ?? id();
    const oldPurchase = purchaseForm.id ? data.compras.find((x) => x.id === purchaseForm.id) : undefined;
    if (purchaseForm.id && !oldPurchase) return tell('No se encontró la compra que intentas editar.', 'error');
    const purchase: FabricPurchase = {
      id: purchaseId, idProveedor: purchaseForm.idProveedor || null, fechaCompra: purchaseForm.fechaCompra,
      tipoComprobante: purchaseForm.tipoComprobante, numeroComprobante: purchaseForm.numeroComprobante.trim(),
      observacion: purchaseForm.observacion.trim(), createdAt: oldPurchase?.createdAt ?? now, updatedAt: now,
    };
    const newRolls: FabricRoll[] = [];
    const newRollMovements: RollMovement[] = [];
    let details = [...data.detalleCompra];
    for (const line of expandedLines) {
      if (line.idRollo) {
        const existing = details.find((x) => x.idRollo === line.idRollo);
        const roll = data.rollos.find((x) => x.id === line.idRollo);
        if (!existing || !roll || existing.idCompra !== purchaseId) return tell('La línea hace referencia a un rollo o detalle que no pertenece a esta compra.', 'error');
        if (existing.unidadPrecio !== line.unidad) return tell('La unidad de precio de una línea histórica no se puede cambiar; registra otra compra si fue adquirida en otra unidad.', 'error');
        details = details.map((x) => x.id === existing.id ? { ...x, cantidadComprada: line.quantity, precioUnitario: line.price, importeTotal: Number((line.quantity * line.price).toFixed(2)) } : x);
        if (roll.idProveedor !== (purchaseForm.idProveedor || null)) newRolls.push({ ...roll, idProveedor: purchaseForm.idProveedor || null, updatedAt: now });
        continue;
      }
      const tela = line.tela;
      const rollId = id();
      const kgExtra = nullableNumber(line.pesoKg);
      const mExtra = nullableNumber(line.metros);
      const selectedColor = line.idTelaColor ? telaColorById.get(line.idTelaColor) : undefined;
      const colorName = selectedColor ? colorById.get(selectedColor.idColor)?.nombre ?? '' : '';
      const createdRoll: FabricRoll = {
        id: rollId, idTela: tela.id, unidadIngreso: line.unidad, cantidadIngreso: line.quantity,
        pesoKg: line.unidad === 'KG' ? line.quantity : kgExtra, metros: line.unidad === 'M' ? line.quantity : mExtra,
        color: colorName, idTelaColor: selectedColor?.id ?? null, idLote: line.idLote.trim(), fechaIngreso: purchaseForm.fechaCompra,
        idProveedor: purchaseForm.idProveedor || null, ubicacion: '', estado: 'disponible', nota: '',
        createdAt: now, updatedAt: now,
      };
      newRolls.push(createdRoll);
      newRollMovements.push({ id: id(), idRollo: rollId, fecha: now, tipo: 'ingreso', unidad: line.unidad, delta: line.quantity, cantidadAnterior: null, cantidadNueva: line.quantity, nota: 'Ingreso de rollo por compra' });
      if (line.unidad === 'KG' && createdRoll.metros !== null) newRollMovements.push({ id: id(), idRollo: rollId, fecha: now, tipo: 'medicion', unidad: 'M', delta: null, cantidadAnterior: null, cantidadNueva: createdRoll.metros, nota: 'Metros reales informados al registrar la compra' });
      if (line.unidad === 'M' && createdRoll.pesoKg !== null) newRollMovements.push({ id: id(), idRollo: rollId, fecha: now, tipo: 'medicion', unidad: 'KG', delta: null, cantidadAnterior: null, cantidadNueva: createdRoll.pesoKg, nota: 'Peso real informado al registrar la compra' });
      details.push({ id: id(), idCompra: purchaseId, idRollo: rollId, cantidadComprada: line.quantity, unidadPrecio: line.unidad, precioUnitario: line.price, importeTotal: Number((line.quantity * line.price).toFixed(2)) });
    }
    const purchaseRows = oldPurchase
      ? data.compras.map((x) => x.id === purchaseId ? purchase : x)
      : [...data.compras, purchase];
    const rollRows = [...data.rollos.filter((roll) => !newRolls.some((x) => x.id === roll.id)), ...newRolls];
    if (!persist({ ...data, compras: purchaseRows, rollos: rollRows, detalleCompra: details, rolloMovimientos: [...data.rolloMovimientos, ...newRollMovements] })) return;
    setShowPurchaseForm(false);
    tell(`${oldPurchase ? 'Compra actualizada' : 'Compra registrada'}: ${expandedLines.length} rollos por ${money.format(details.filter((x) => x.idCompra === purchaseId).reduce((sum, x) => sum + x.importeTotal, 0))}.`);
  }

  async function importCsvFile(file?: File) {
    if (!file) return;
    try {
      if (!storageSafe) throw new Error('No se puede importar mientras el almacenamiento local esté dañado. Restaura primero un respaldo JSON válido.');
      const csvText = await file.text();
      const rows = parseCsvTable(csvText);
      const generatedRollIds = await Promise.all(rows.map((row, index) => stableCsvId(JSON.stringify(row) + ':' + (index + 2))));
      const field = (row: Record<string, string>, ...names: string[]) => {
        for (const name of names) {
          const value = row[normalizeCsvHeader(name)];
          if (value !== undefined) return value.trim();
        }
        return '';
      };
      const uniqueId = (value: string) => value.trim() || id();
      const resolveSupplier = (row: Record<string, string>) => {
        const supplierId = field(row, 'id_proveedor');
        const supplierName = field(row, 'proveedor', 'nombre_proveedor');
        const found = supplierId ? data.proveedores.find((x) => x.id === supplierId) : data.proveedores.find((x) => x.nombre.toLocaleLowerCase('es') === supplierName.toLocaleLowerCase('es'));
        if ((supplierId || supplierName) && !found) throw new Error('El proveedor "' + (supplierName || supplierId) + '" no existe. Importa primero el archivo de proveedores.');
        return found?.id ?? null;
      };
      let next: FabricBackupData = { ...data };
      let imported = 0;
      if (view === 'telas' && rows[0] && Object.prototype.hasOwnProperty.call(rows[0], 'id_tela_color')) {
        const colors = new Map(data.colores.map((x) => [x.id, x]));
        const variants = new Map(data.telaColores.map((x) => [x.id, x]));
        const colorByName = new Map(data.colores.map((x) => [x.nombre.toLocaleLowerCase('es'), x]));
        rows.forEach((row, index) => {
          try {
            const telaId = field(row, 'id_tela');
            if (!data.telas.some((x) => x.id === telaId)) throw new Error('La tela indicada no existe. Importa primero el catálogo de telas.');
            const name = field(row, 'nombre_color');
            if (!name) throw new Error('Falta nombre_color.');
            const rawHex = field(row, 'hexadecimal');
            const hex = rawHex ? rawHex.toUpperCase() : null;
            if (hex && !/^#[0-9A-F]{6}$/.test(hex)) throw new Error('hexadecimal debe tener formato #RRGGBB.');
            const cmyk = ['cmyk_c','cmyk_m','cmyk_y','cmyk_k'].map((key) => parseCsvNullableNumber(field(row, key), key));
            if (cmyk.some((x) => x !== null && (x > 100 || !Number.isFinite(x)))) throw new Error('Los valores CMYK deben estar entre 0 y 100.');
            if (cmyk.some((x) => x !== null) && cmyk.some((x) => x === null)) throw new Error('Completa los cuatro valores CMYK o déjalos todos vacíos.');
            const suppliedColorId = field(row, 'id_color');
            const existingColor = (suppliedColorId ? colors.get(suppliedColorId) : undefined) ?? colorByName.get(name.toLocaleLowerCase('es'));
            const color = existingColor ?? { id: uniqueId(suppliedColorId), nombre: name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            if (existingColor && existingColor.nombre.toLocaleLowerCase('es') !== name.toLocaleLowerCase('es')) throw new Error('id_color corresponde a otro nombre de color.');
            colors.set(color.id, color); colorByName.set(name.toLocaleLowerCase('es'), color);
            const variantId = field(row, 'id_tela_color', 'id') || id();
            const existingVariant = variants.get(variantId) ?? [...variants.values()].find((x) => x.idTela === telaId && x.idColor === color.id);
            const activeRaw = field(row, 'activo').toLocaleLowerCase('es');
            const active = !activeRaw ? true : ['true','1','si','sí','activo','yes'].includes(activeRaw);
            const variant: TextileColor = { id: existingVariant?.id ?? variantId, idTela: telaId, idColor: color.id, hexadecimal: hex, cmykC: cmyk[0], cmykM: cmyk[1], cmykY: cmyk[2], cmykK: cmyk[3], activo: active, createdAt: existingVariant?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
            variants.set(variant.id, variant); imported++;
          } catch (error) { throw new Error('Fila ' + (index + 2) + ': ' + (error instanceof Error ? error.message : 'color inválido')); }
        });
        next = { ...data, colores: [...colors.values()], telaColores: [...variants.values()] };
      } else if (view === 'telas') {
        const map = new Map(data.telas.map((x) => [x.id, x]));
        const byName = new Map(data.telas.map((x) => [x.nombreTela.toLocaleLowerCase('es'), x]));
        rows.forEach((row, index) => {
          try {
            const name = field(row, 'nombre_tela', 'nombre');
            const unit = field(row, 'unidad_venta', 'unidad').toUpperCase();
            if (!name) throw new Error('Falta nombre_tela.');
            if (unit !== 'KG' && unit !== 'M') throw new Error('unidad_venta debe ser KG o M.');
            const width = parseCsvNullableNumber(field(row, 'ancho_nominal_m'), 'ancho_nominal_m');
            const yieldValue = parseCsvNullableNumber(field(row, 'rendimiento_teorico'), 'rendimiento_teorico');
            if (width !== null && width <= 0) throw new Error('ancho_nominal_m debe ser mayor que cero.');
            if (yieldValue !== null && yieldValue <= 0) throw new Error('rendimiento_teorico debe ser mayor que cero.');
            const existing = map.get(field(row, 'id_tela', 'id')) ?? byName.get(name.toLocaleLowerCase('es'));
            const activeRaw = field(row, 'activo').toLocaleLowerCase('es');
            const active = !activeRaw ? true : ['true','1','si','sí','activo','yes'].includes(activeRaw);
            if (activeRaw && !['true','1','si','sí','activo','yes','false','0','no','inactivo'].includes(activeRaw)) throw new Error('activo debe ser TRUE/FALSE.');
            const now = new Date().toISOString();
            const item: Textile = { id: existing?.id ?? uniqueId(field(row, 'id_tela', 'id')), nombreTela: name, unidadVenta: unit, anchoNominalM: width, rendimientoTeorico: yieldValue, descripcion: field(row, 'descripcion'), activo: active, createdAt: existing?.createdAt ?? now, updatedAt: now };
            map.set(item.id, item); byName.set(name.toLocaleLowerCase('es'), item); imported++;
          } catch (error) { throw new Error('Fila ' + (index + 2) + ': ' + (error instanceof Error ? error.message : 'dato inválido')); }
        });
        next = { ...data, telas: [...map.values()] };
      } else if (view === 'proveedores') {
        const map = new Map(data.proveedores.map((x) => [x.id, x]));
        const phones = [...data.proveedorTelefonos];
        const cats = [...data.proveedorCategorias];
        rows.forEach((row, index) => {
          try {
            const name = field(row, 'nombre', 'nombre_comercial');
            if (!name) throw new Error('Falta nombre del proveedor.');
            const existing = map.get(field(row, 'id_proveedor', 'id')) ?? [...map.values()].find((x) => x.nombre.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
            const now = new Date().toISOString();
            const item: Supplier = { id: existing?.id ?? uniqueId(field(row, 'id_proveedor', 'id')), nombre: name, contacto: field(row, 'contacto'), direccion: field(row, 'direccion'), nota: field(row, 'nota'), createdAt: existing?.createdAt ?? now, updatedAt: now };
            map.set(item.id, item);
            const rawPhones = field(row, 'telefonos', 'telefono').split('|').map((x) => x.trim()).filter(Boolean);
            const parsedPhones = rawPhones.map((entry) => {
              const colon = entry.indexOf(':');
              return { id: id(), idProveedor: item.id, etiqueta: colon > 0 ? entry.slice(0, colon).trim() : 'Teléfono', numero: colon > 0 ? entry.slice(colon + 1).trim() : entry };
            });
            const rawCategories = field(row, 'categorias', 'rubros');
            const parsedCategories = rawCategories.split('|').map((x) => x.trim()).filter(Boolean);
            phones.splice(0, phones.length, ...phones.filter((x) => x.idProveedor !== item.id), ...parsedPhones);
            cats.splice(0, cats.length, ...cats.filter((x) => x.idProveedor !== item.id), ...parsedCategories.map((categoria) => ({ id: id(), idProveedor: item.id, categoria })));
            imported++;
          } catch (error) { throw new Error('Fila ' + (index + 2) + ': ' + (error instanceof Error ? error.message : 'dato inválido')); }
        });
        next = { ...data, proveedores: [...map.values()], proveedorTelefonos: phones, proveedorCategorias: cats };
      } else if (view === 'rollos') {
        const map = new Map(data.rollos.map((x) => [x.id, x]));
        const movements = [...data.rolloMovimientos];
        rows.forEach((row, index) => {
          try {
            const telaId = field(row, 'id_tela');
            const telaName = field(row, 'nombre_tela', 'tela');
            const tela = telaId ? data.telas.find((x) => x.id === telaId) : data.telas.find((x) => x.nombreTela.toLocaleLowerCase('es') === telaName.toLocaleLowerCase('es'));
            if (!tela) throw new Error('La tela indicada no existe. Importa primero el catálogo.');
            const unit = field(row, 'unidad_ingreso', 'unidad').toUpperCase();
            if (unit !== 'KG' && unit !== 'M') throw new Error('unidad_ingreso debe ser KG o M.');
            const quantity = Number(field(row, 'cantidad_ingresada', 'cantidad'));
            if (!validQty(quantity)) throw new Error('cantidad_ingresada debe ser mayor que cero.');
            const date = csvDate(field(row, 'fecha_ingreso', 'fecha'));
            const supplierId = resolveSupplier(row);
            const colorId = field(row, 'id_tela_color');
            const colorName = field(row, 'color');
            const colorVariant = colorId ? data.telaColores.find((x) => x.id === colorId && x.idTela === tela.id) : data.telaColores.find((x) => x.idTela === tela.id && colorById.get(x.idColor)?.nombre.toLocaleLowerCase('es') === colorName.toLocaleLowerCase('es'));
            if (colorId && !colorVariant) throw new Error('id_tela_color no pertenece a la tela seleccionada.');
            if (colorName && !colorVariant) throw new Error('El color "' + colorName + '" no está configurado para esta tela. Regístralo en el catálogo antes de importar.');
            const suppliedId = field(row, 'id_rollo', 'id');
            const idRollo = suppliedId || generatedRollIds[index];
            const existing = map.get(idRollo);
            if (existing && data.detalleCompra.some((detail) => detail.idRollo === existing.id) && (existing.idTela !== tela.id || existing.unidadIngreso !== unit)) throw new Error('No se puede cambiar la tela ni la unidad original de un rollo que ya tiene una compra asociada.');
            const kg = unit === 'KG' ? quantity : parseCsvNullableNumber(field(row, 'peso_kg_real', 'peso_kg'), 'peso_kg_real');
            const metros = unit === 'M' ? quantity : parseCsvNullableNumber(field(row, 'metros_reales', 'metros'), 'metros_reales');
            const stateRaw = (field(row, 'estado') || 'disponible').toLocaleLowerCase('es');
            if (!['disponible','reservado','agotado','defectuoso'].includes(stateRaw)) throw new Error('estado debe ser disponible, reservado, agotado o defectuoso.');
            const now = new Date().toISOString();
            const item: FabricRoll = { id: existing?.id ?? uniqueId(idRollo), idTela: tela.id, unidadIngreso: unit, cantidadIngreso: quantity, pesoKg: kg, metros, color: colorVariant ? colorById.get(colorVariant.idColor)?.nombre ?? colorName : colorName, idTelaColor: colorVariant?.id ?? null, idLote: field(row, 'id_lote', 'lote'), fechaIngreso: date, idProveedor: supplierId, ubicacion: field(row, 'ubicacion'), estado: stateRaw as RollStatus, nota: field(row, 'nota'), createdAt: existing?.createdAt ?? now, updatedAt: now };
            map.set(item.id, item);
            if (!existing) {
              movements.push({ id: id(), idRollo: item.id, fecha: now, tipo: 'ingreso', unidad: unit, delta: quantity, cantidadAnterior: null, cantidadNueva: quantity, nota: 'Ingreso importado desde CSV' });
              if (unit === 'KG' && metros !== null) movements.push({ id: id(), idRollo: item.id, fecha: now, tipo: 'medicion', unidad: 'M', delta: null, cantidadAnterior: null, cantidadNueva: metros, nota: 'Metros reales importados desde CSV' });
              if (unit === 'M' && kg !== null) movements.push({ id: id(), idRollo: item.id, fecha: now, tipo: 'medicion', unidad: 'KG', delta: null, cantidadAnterior: null, cantidadNueva: kg, nota: 'Peso real importado desde CSV' });
            } else {
              const changes: Array<{ unit: FabricUnit; before: number | null; after: number | null }> = [
                { unit: 'KG', before: existing.pesoKg, after: item.pesoKg },
                { unit: 'M', before: existing.metros, after: item.metros },
              ];
              changes.forEach(({ unit: measureUnit, before, after }) => {
                if (before === after) return;
                const bothKnown = before !== null && after !== null;
                movements.push({
                  id: id(), idRollo: item.id, fecha: now, tipo: bothKnown ? 'ajuste' : 'medicion',
                  unidad: measureUnit, delta: bothKnown ? Number((after! - before!).toFixed(3)) : null,
                  cantidadAnterior: before, cantidadNueva: after, nota: 'Medición real actualizada desde CSV',
                });
              });
            }
            imported++;
          } catch (error) { throw new Error('Fila ' + (index + 2) + ': ' + (error instanceof Error ? error.message : 'dato inválido')); }
        });
        next = { ...data, rollos: [...map.values()], rolloMovimientos: movements };
      } else if (view === 'compras') {
        const purchaseMap = new Map(data.compras.map((x) => [x.id, x]));
        const detailMap = new Map(data.detalleCompra.map((x) => [x.id, x]));
        const seenRolls = new Set<string>();
        rows.forEach((row, index) => {
          try {
            const purchaseId = field(row, 'id_compra');
            const rollId = field(row, 'id_rollo');
            if (!purchaseId || !rollId) throw new Error('Faltan id_compra o id_rollo. Importa rollos primero; las compras CSV exportadas ya contienen esos identificadores.');
            const roll = data.rollos.find((x) => x.id === rollId);
            if (!roll) throw new Error('No existe el rollo ' + rollId + '. Importa primero el inventario de rollos.');
            const sourceTelaId = field(row, 'id_tela');
            if (sourceTelaId && sourceTelaId !== roll.idTela) throw new Error('id_tela no coincide con la tela del rollo relacionado.');
            const supplierId = resolveSupplier(row);
            const sourceColorId = field(row, 'id_tela_color');
            if (sourceColorId && roll.idTelaColor !== sourceColorId) throw new Error('id_tela_color no coincide con el color asociado al rollo.');
            const importedColor = field(row, 'color');
            if (importedColor && importedColor.toLocaleLowerCase('es') !== roll.color.toLocaleLowerCase('es')) throw new Error('El color del CSV no coincide con el color del rollo relacionado.');
            const date = csvDate(field(row, 'fecha_compra'));
            const unit = field(row, 'unidad_precio').toUpperCase();
            if (unit !== 'KG' && unit !== 'M') throw new Error('unidad_precio debe ser KG o M.');
            if (unit !== roll.unidadIngreso) throw new Error('La unidad de precio debe coincidir con la unidad de ingreso del rollo.');
            const quantity = parseCsvNumber(field(row, 'cantidad_comprada'));
            const rawPrice = field(row, 'precio_unitario');
            if (!rawPrice) throw new Error('Falta precio_unitario; escribe 0 si la línea no tuvo costo.');
            const price = parseCsvNumber(rawPrice);
            if (!validQty(quantity) || !Number.isFinite(price) || price < 0) throw new Error('Cantidad o precio unitario inválido.');
            const expectedTotal = Number((quantity * price).toFixed(2));
            const providedTotal = field(row, 'importe_total');
            if (providedTotal) {
              const importedTotal = parseCsvNumber(providedTotal);
              if (!Number.isFinite(importedTotal) || Math.abs(importedTotal - expectedTotal) > 0.011) throw new Error('importe_total no coincide con cantidad_comprada × precio_unitario.');
            }
            if (seenRolls.has(rollId)) throw new Error('El rollo aparece más de una vez en este archivo.');
            seenRolls.add(rollId);
            const currentPurchase = purchaseMap.get(purchaseId);
            const currentDetail = [...detailMap.values()].find((x) => x.idRollo === rollId);
            if (currentDetail && currentDetail.idCompra !== purchaseId) throw new Error('El rollo ya pertenece a otra compra.');
            const now = new Date().toISOString();
            purchaseMap.set(purchaseId, { id: purchaseId, idProveedor: supplierId, fechaCompra: date, tipoComprobante: field(row, 'tipo_comprobante'), numeroComprobante: field(row, 'numero_comprobante'), observacion: field(row, 'observacion'), createdAt: currentPurchase?.createdAt ?? now, updatedAt: now });
            const detailId = field(row, 'id_detalle') || currentDetail?.id || id();
            const detailWithId = detailMap.get(detailId);
            if (detailWithId && detailWithId.idRollo !== rollId) throw new Error('id_detalle ya está asignado a otro rollo.');
            if (currentDetail && currentDetail.id !== detailId) detailMap.delete(currentDetail.id);
            detailMap.set(detailId, { id: detailId, idCompra: purchaseId, idRollo: rollId, cantidadComprada: quantity, unidadPrecio: unit, precioUnitario: price, importeTotal: expectedTotal });
            imported++;
          } catch (error) { throw new Error('Fila ' + (index + 2) + ': ' + (error instanceof Error ? error.message : 'dato inválido')); }
        });
        next = { ...data, compras: [...purchaseMap.values()], detalleCompra: [...detailMap.values()] };
      }
      if (!imported) throw new Error('No se encontraron filas válidas para importar.');
      if (!window.confirm('Se van a importar ' + imported + ' filas en ' + view + '. Los registros con el mismo ID se actualizarán; los demás se añadirán. ¿Continuar?')) return;
      if (!persist(next)) return;
      tell(imported + ' filas importadas correctamente. Las relaciones se conservaron y los importes de compra se recalcularon desde cantidad × precio.');
    } catch (error) {
      tell('No se pudo importar el CSV: ' + (error instanceof Error ? error.message : 'archivo no válido'), 'error');
    } finally {
      if (csvImportRef.current) csvImportRef.current.value = '';
    }
  }

  function exportCurrentCsv() {
    if (view === 'telas') {
      {
        downloadCsv('catalogo-telas.csv', [['id_tela','nombre_tela','unidad_venta','ancho_nominal_m','rendimiento_teorico','unidad_rendimiento','descripcion','activo'], ...data.telas.map((x) => [x.id,x.nombreTela,x.unidadVenta,x.anchoNominalM ?? '',x.rendimientoTeorico ?? '',x.unidadVenta === 'KG' ? 'M/KG' : 'KG/M',x.descripcion,x.activo ? 'TRUE' : 'FALSE'])]);
        downloadCsv('catalogo-colores-tela.csv', [['id_tela_color','id_tela','id_color','nombre_color','hexadecimal','cmyk_c','cmyk_m','cmyk_y','cmyk_k','activo'], ...data.telaColores.map((x) => [x.id,x.idTela,x.idColor,colorById.get(x.idColor)?.nombre ?? '',x.hexadecimal ?? '',x.cmykC ?? '',x.cmykM ?? '',x.cmykY ?? '',x.cmykK ?? '',x.activo ? 'TRUE' : 'FALSE'])]);
      }
    } else if (view === 'rollos') {
      downloadCsv('inventario-rollos.csv', [['id_rollo','id_tela','nombre_tela','unidad_ingreso','cantidad_ingresada','peso_kg_real','metros_reales','id_tela_color','color','id_lote','fecha_ingreso','id_proveedor','estado','ubicacion','nota'], ...rollRows.map((x) => [x.id,x.idTela,telaById.get(x.idTela)?.nombreTela ?? '',x.unidadIngreso,x.cantidadIngreso,x.pesoKg ?? '',x.metros ?? '',x.idTelaColor ?? '',colorNameForVariant(x.idTelaColor,x.color),x.idLote,x.fechaIngreso,x.idProveedor ?? '',x.estado,x.ubicacion,x.nota])]);
    } else if (view === 'compras') {
      downloadCsv('historial-compras-telas.csv', [['id_compra','id_proveedor','proveedor','fecha_compra','tipo_comprobante','numero_comprobante','id_detalle','id_rollo','id_tela','nombre_tela','id_tela_color','color','cantidad_comprada','unidad_precio','precio_unitario','importe_total'], ...data.compras.flatMap((purchase) => (detailByPurchase.get(purchase.id) ?? []).map((detail) => {
        const roll = rollById.get(detail.idRollo);
        return [purchase.id,purchase.idProveedor ?? '',purchase.idProveedor ? supplierById.get(purchase.idProveedor)?.nombre ?? '' : '',purchase.fechaCompra,purchase.tipoComprobante,purchase.numeroComprobante,detail.id,detail.idRollo,roll?.idTela ?? '',roll ? telaById.get(roll.idTela)?.nombreTela ?? '' : '',roll?.idTelaColor ?? '',colorNameForVariant(roll?.idTelaColor,roll?.color ?? ''),detail.cantidadComprada,detail.unidadPrecio,detail.precioUnitario,detail.importeTotal];
      }))]);
    } else {
      downloadCsv('proveedores.csv', [['id_proveedor','nombre','contacto','telefonos','categorias','direccion','nota'], ...supplierRows.map((x) => [x.id,x.nombre,x.contacto,data.proveedorTelefonos.filter((p) => p.idProveedor === x.id).map((p) => p.numero).join(' | '),data.proveedorCategorias.filter((p) => p.idProveedor === x.id).map((p) => p.categoria).join(' | '),x.direccion,x.nota])]);
    }
  }

  const telaRollCount = (telaId: string) => data.rollos.filter((x) => x.idTela === telaId).length;
  const purchaseTotal = (purchaseId: string) => (detailByPurchase.get(purchaseId) ?? []).reduce((sum, x) => sum + x.importeTotal, 0);
  const extraRollQuantities = (raw: string) => raw.split(/[;,\\s]+/).map((x) => x.trim()).filter(Boolean).map(Number).filter(validQty);
  const purchaseLineAmount = (line: PurchaseLineForm) => ((Number(line.cantidad) || 0) + extraRollQuantities(line.cantidadesAdicionales).reduce((sum, x) => sum + x, 0)) * (Number(line.precio) || 0);
  const rollPurchaseDetail = (rollId: string) => data.detalleCompra.find((x) => x.idRollo === rollId);
  const selectedRoll = selectedRolloId ? rollById.get(selectedRolloId) : undefined;

  return <div className="fabric-module">
    {notice && <div className={`notice ${notice.kind}`} role="status"><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button></div>}
    <div className="fabric-toolbar">
      <input ref={csvImportRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => void importCsvFile(event.target.files?.[0])} />
      <div className="fabric-search-wrap">
        {view === 'telas' && <label className="search-box"><span>⌕</span><input value={telaSearch} onChange={(e) => setTelaSearch(e.target.value)} placeholder="Buscar tela…" /></label>}
        {view === 'rollos' && <label className="search-box"><span>⌕</span><input value={rollSearch} onChange={(e) => setRollSearch(e.target.value)} placeholder="Buscar tela, color, lote o proveedor…" /></label>}
        {view === 'compras' && <label className="search-box"><span>⌕</span><input value={purchaseSearch} onChange={(e) => setPurchaseSearch(e.target.value)} placeholder="Buscar proveedor, comprobante o tela…" /></label>}
        {view === 'proveedores' && <label className="search-box"><span>⌕</span><input value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar proveedor, teléfono o categoría…" /></label>}
      </div>
      <div className="fabric-toolbar-actions">
        <button className="button secondary" onClick={() => csvImportRef.current?.click()}>↑ <span>Importar CSV</span></button>
        <button className="button secondary" onClick={exportCurrentCsv}>↓ <span>Exportar CSV</span></button>
        {view === 'telas' && <button className="button primary" onClick={() => openTela()}>＋ <span>Nueva tela</span></button>}
        {view === 'rollos' && <button className="button primary" onClick={() => openRollo() } disabled={data.telas.filter((x) => x.activo).length === 0}>＋ <span>Nuevo rollo</span></button>}
        {view === 'compras' && <button className="button primary" onClick={() => openPurchase()} disabled={data.telas.filter((x) => x.activo).length === 0}>＋ <span>Nueva compra</span></button>}
        {view === 'proveedores' && <button className="button primary" onClick={() => openSupplier()}>＋ <span>Nuevo proveedor</span></button>}
      </div>
    </div>

    {view === 'telas' && <section className="panel">
      <div className="panel-heading"><div><h2>Catálogo de telas</h2><p>Unidad habitual, ancho, rendimiento teórico y colores definidos para cada material.</p></div><span className="count-badge">{data.telas.length} telas</span></div>
      <div className="fabric-table-wrap"><table className="fabric-table"><thead><tr><th>Tela</th><th>Unidad</th><th>Ancho</th><th>Rendimiento</th><th>Colores</th><th>Rollos</th><th>Estado</th><th></th></tr></thead><tbody>
        {telaRows.map((tela) => <tr key={tela.id}><td><strong>{tela.nombreTela}</strong>{tela.descripcion && <small>{tela.descripcion}</small>}</td><td>{tela.unidadVenta}</td><td>{tela.anchoNominalM === null ? '—' : `${nfmt.format(tela.anchoNominalM)} m`}</td><td>{tela.rendimientoTeorico == null ? '—' : `${nfmt.format(tela.rendimientoTeorico)} ${tela.unidadVenta === 'KG' ? 'm/kg' : 'kg/m'}`}</td><td>{data.telaColores.filter((x) => x.idTela === tela.id && x.activo).length}</td><td>{telaRollCount(tela.id)}</td><td><span className={`fabric-status ${tela.activo ? 'on' : 'off'}`}>{tela.activo ? 'Activa' : 'Inactiva'}</span></td><td className="fabric-row-actions"><button className="text-action" onClick={() => openTela(tela)}>Editar</button><button className="text-action" onClick={() => toggleTela(tela)}>{tela.activo ? 'Desactivar' : 'Activar'}</button></td></tr>)}
        {telaRows.length === 0 && <tr><td colSpan={8}><div className="empty">No hay telas registradas. Crea el primer tipo de tela.</div></td></tr>}
      </tbody></table></div>
    </section>}

    {view === 'rollos' && <section className="panel">
      <div className="panel-heading"><div><h2>Inventario individual de rollos</h2><p>Cada fila representa un rollo físico. KG y metros solo aparecen cuando existe una medición real.</p></div><span className="count-badge">{rollRows.length} rollos</span></div>
      <div className="fabric-filters">
        <select className="large-input" value={rollTelaFilter} onChange={(e) => setRollTelaFilter(e.target.value)}><option value="all">Todas las telas</option>{data.telas.map((x) => <option key={x.id} value={x.id}>{x.nombreTela}</option>)}</select>
        <select className="large-input" value={rollColorFilter} onChange={(e) => setRollColorFilter(e.target.value)}><option value="all">Todos los colores</option>{availableColors.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select className="large-input" value={rollStatusFilter} onChange={(e) => setRollStatusFilter(e.target.value)}><option value="all">Todos los estados</option>{Object.entries(statusLabel).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="large-input" value={rollSupplierFilter} onChange={(e) => setRollSupplierFilter(e.target.value)}><option value="all">Todos los proveedores</option>{data.proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      </div>
      <div className="fabric-roll-list">{rollRows.map((roll) => {
        const tela = telaById.get(roll.idTela);
        return <article className="fabric-roll-row" key={roll.id}><div className="fabric-roll-main"><strong>{tela?.nombreTela ?? 'Tela no disponible'}</strong><span>{roll.color || 'Color sin indicar'} · {roll.idLote || 'Sin lote'}</span><small>{roll.idProveedor ? supplierById.get(roll.idProveedor)?.nombre ?? 'Proveedor no disponible' : 'Sin proveedor'} · Ingreso {roll.fechaIngreso}</small></div><div className="fabric-roll-measures"><strong>{roll.metros === null ? '—' : `${nfmt.format(roll.metros)} m`}</strong><span>{roll.pesoKg === null ? '—' : `${nfmt.format(roll.pesoKg)} kg`}</span><small>Mediciones reales</small></div><span className={`fabric-status ${roll.estado}`}>{statusLabel[roll.estado]}</span><div className="fabric-row-actions"><button className="text-action" onClick={() => { setSelectedRolloId(roll.id); setShowRolloDetail(true); }}>Detalle</button><button className="text-action" onClick={() => openRollo(roll)}>Editar</button></div></article>;
      })}{rollRows.length === 0 && <div className="empty">No se encontraron rollos. Registra un rollo o cambia los filtros.</div>}</div>
    </section>}

    {view === 'compras' && <section className="panel">
      <div className="panel-heading"><div><h2>Compras de telas</h2><p>Una compra puede contener varios rollos. El detalle conserva la cantidad y el precio unitario originales.</p></div><span className="count-badge">{purchaseRows.length} compras</span></div>
      <div className="fabric-purchase-list">{purchaseRows.map((purchase) => {
        const detail = detailByPurchase.get(purchase.id) ?? [];
        return <article className="fabric-purchase-card" key={purchase.id}><div className="fabric-purchase-head"><div><strong>{supplierById.get(purchase.idProveedor ?? '')?.nombre ?? 'Proveedor no indicado'}</strong><span>{purchase.fechaCompra} · {purchase.tipoComprobante || 'Sin comprobante'} {purchase.numeroComprobante}</span><small>{detail.length} rollos · {purchase.observacion || 'Sin observación'}</small></div><div className="fabric-purchase-total"><strong>{money.format(purchaseTotal(purchase.id))}</strong><button className="text-action" onClick={() => openPurchase(purchase)}>Editar cabecera</button></div></div><div className="fabric-purchase-details">{detail.map((line) => { const roll = rollById.get(line.idRollo); return <div key={line.id} className="fabric-purchase-line"><span>{roll ? telaById.get(roll.idTela)?.nombreTela ?? 'Tela' : 'Rollo no disponible'} · {roll?.color || 'Sin color'}</span><span>{nfmt.format(line.cantidadComprada)} {line.unidadPrecio} × {money.format(line.precioUnitario)}</span><strong>{money.format(line.importeTotal)}</strong><small>Rollo {line.idRollo.slice(0,8)}</small></div>; })}</div></article>;
      })}{purchaseRows.length === 0 && <div className="empty">Todavía no hay compras registradas. Usa «Nueva compra» para crear una cabecera y añadir varios rollos.</div>}</div>
      <div className="panel-footer"><span>Los precios e importes son históricos.</span><span>Editar la cabecera no altera los detalles de compra.</span></div>
    </section>}

    {view === 'proveedores' && <section className="panel">
      <div className="panel-heading"><div><h2>Proveedores</h2><p>Un proveedor puede tener varios teléfonos y varias categorías, guardadas en relaciones independientes.</p></div><span className="count-badge">{supplierRows.length} proveedores</span></div>
      <div className="fabric-filters supplier-filters"><select className="large-input" value={supplierCategoryFilter} onChange={(e) => setSupplierCategoryFilter(e.target.value)}><option value="all">Todos los rubros</option>{categories.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
      <div className="fabric-supplier-list">{supplierRows.map((supplier) => {
        const phones = data.proveedorTelefonos.filter((x) => x.idProveedor === supplier.id);
        const cats = data.proveedorCategorias.filter((x) => x.idProveedor === supplier.id).map((x) => x.categoria);
        return <article className="fabric-supplier-row" key={supplier.id}><div><strong>{supplier.nombre}</strong><span>{supplier.contacto || 'Sin contacto'} · {supplier.direccion || 'Sin dirección'}</span><small>{phones.length ? phones.map((x) => `${x.etiqueta}: ${x.numero}`).join(' · ') : 'Sin teléfonos'} </small><div className="fabric-category-tags">{cats.map((x) => <span key={x}>{x}</span>)}</div></div><button className="button secondary edit-model" onClick={() => openSupplier(supplier)}>Editar</button></article>;
      })}{supplierRows.length === 0 && <div className="empty">No hay proveedores registrados o no coinciden con el filtro.</div>}</div>
    </section>}

    {showTelaForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowTelaForm(false); }}><section className="modal fabric-form-modal" role="dialog" aria-modal="true" aria-labelledby="fabric-tela-title">
      <div className="modal-heading"><div><div className="eyebrow">CATÁLOGO DE INSUMOS</div><h2 id="fabric-tela-title">{telaForm.id ? 'Editar tela' : 'Nueva tela'}</h2><p>El catálogo define las características generales; no reescribe compras históricas.</p></div><button className="icon-button" onClick={() => setShowTelaForm(false)}>×</button></div>
      <form onSubmit={saveTela} className="fabric-form-grid">
        <label className="field-label fabric-span-2">Nombre de tela *<input className="large-input" required value={telaForm.nombreTela} onChange={(e) => setTelaForm((x) => ({ ...x, nombreTela: e.target.value }))} placeholder="Ej. Win sublimada" /></label>
        <label className="field-label">Unidad habitual *<select className="large-input" value={telaForm.unidadVenta} onChange={(e) => setTelaForm((x) => ({ ...x, unidadVenta: e.target.value as FabricUnit, rendimientoTeorico: '' }))}><option value="KG">Kilogramos (KG)</option><option value="M">Metros (M)</option></select></label>
        <label className="field-label">Ancho nominal (m)<input className="large-input" type="number" step="0.001" min="0.001" value={telaForm.anchoNominalM} onChange={(e) => setTelaForm((x) => ({ ...x, anchoNominalM: e.target.value }))} placeholder="Ej. 1.80" /></label>
        <label className="field-label fabric-span-2">Rendimiento teórico (${telaForm.unidadVenta === 'KG' ? 'm/kg' : 'kg/m'})<input className="large-input" type="number" min="0.000001" step="0.000001" value={telaForm.rendimientoTeorico} onChange={(e) => setTelaForm((x) => ({ ...x, rendimientoTeorico: e.target.value }))} placeholder={telaForm.unidadVenta === 'KG' ? 'Ej. 2.00 metros por kg' : 'Ej. 0.50 kg por metro'} /></label>
        <small className="fabric-form-hint fabric-span-2">Dato teórico para futuras estimaciones. No se copia a los metros ni al peso real de los rollos.</small>
        <label className="field-label fabric-span-2">Descripción<textarea className="large-input fabric-textarea" value={telaForm.descripcion} onChange={(e) => setTelaForm((x) => ({ ...x, descripcion: e.target.value }))} placeholder="Composición, acabado o uso…" /></label>
        <label className="fabric-check"><input type="checkbox" checked={telaForm.activo} onChange={(e) => setTelaForm((x) => ({ ...x, activo: e.target.checked }))} /> Activo</label>
        {telaForm.id && <div className="fabric-span-2"><div className="fabric-subheading"><strong>Colores disponibles para esta tela</strong><button type="button" className="text-action" onClick={() => openInlineColor('tela', telaForm.id!)}>＋ Añadir color</button></div><div className="fabric-category-tags">{data.telaColores.filter((x) => x.idTela === telaForm.id).map((variant) => <span key={variant.id} className={!variant.activo ? 'muted' : ''}><i className="fabric-color-swatch" style={{ backgroundColor: variant.hexadecimal ?? '#e5e7eb' }} />{colorNameForVariant(variant.id)}{!variant.activo ? ' · Inactivo' : ''}<button type="button" className="text-action" onClick={() => openInlineColor('tela', telaForm.id!, null, variant.id)}>Editar</button><button type="button" className="text-action" onClick={() => toggleTelaColor(variant)}>{variant.activo ? 'Desactivar' : 'Activar'}</button></span>)}</div></div>}
        {!telaForm.id && <small className="fabric-form-hint fabric-span-2">Guarda primero la tela; luego podrás registrar sus colores y códigos HEX/CMYK desde Editar.</small>}
        <div className="form-actions fabric-span-2"><button type="button" className="button secondary" onClick={() => setShowTelaForm(false)}>Cancelar</button><button className="button primary" type="submit">Guardar tela</button></div>
      </form>
    </section></div>}

    {showRolloForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRolloForm(false); }}><section className="modal fabric-form-modal" role="dialog" aria-modal="true" aria-labelledby="fabric-roll-title">
      <div className="modal-heading"><div><div className="eyebrow">INVENTARIO FÍSICO</div><h2 id="fabric-roll-title">{rolloForm.id ? 'Editar rollo' : 'Registrar rollo'}</h2><p>El valor ingresado se guarda como medición real de la unidad elegida. No se estima la otra medida.</p></div><button className="icon-button" onClick={() => setShowRolloForm(false)}>×</button></div>
      <form onSubmit={saveRollo} className="fabric-form-grid">
        <label className="field-label fabric-span-2">Tela *<select className="large-input" required value={rolloForm.idTela} onChange={(e) => setRolloForm((x) => ({ ...x, idTela: e.target.value, unidadIngreso: telaById.get(e.target.value)?.unidadVenta ?? x.unidadIngreso }))}><option value="">Seleccionar tela</option>{data.telas.filter((x) => x.activo || x.id === rolloForm.idTela).map((x) => <option key={x.id} value={x.id}>{x.nombreTela}{x.activo ? '' : ' · Inactiva'}</option>)}</select></label>
        <label className="field-label">Unidad de ingreso *<select className="large-input" value={rolloForm.unidadIngreso} disabled={Boolean(rolloForm.id)} onChange={(e) => setRolloForm((x) => ({ ...x, unidadIngreso: e.target.value as FabricUnit }))}><option value="KG">Kilogramos (KG)</option><option value="M">Metros (M)</option></select></label>
        <label className="field-label">{rolloForm.id ? 'Cantidad original ingresada' : 'Cantidad ingresada *'}<input className="large-input" type="number" step="0.001" min="0.001" required value={rolloForm.cantidadIngreso} disabled={Boolean(rolloForm.id)} onChange={(e) => setRolloForm((x) => ({ ...x, cantidadIngreso: e.target.value }))} placeholder={rolloForm.unidadIngreso === 'KG' ? 'Ej. 20.5' : 'Ej. 45'} /></label>
        <label className="field-label">Fecha de ingreso *<input className="large-input" type="date" required value={rolloForm.fechaIngreso} onChange={(e) => setRolloForm((x) => ({ ...x, fechaIngreso: e.target.value }))} /></label>
        <div className="field-label"><span>Color de esta tela</span><div className="fabric-provider-inline"><select className="large-input" value={rolloForm.idTelaColor} onChange={(e) => setRolloForm((x) => ({ ...x, idTelaColor: e.target.value, color: colorNameForVariant(e.target.value) }))}><option value="">Sin color asignado</option>{colorsForTela(rolloForm.idTela).map((x) => <option key={x.id} value={x.id}>{x.color?.nombre}{x.hexadecimal ? ' · ' + x.hexadecimal : ''}</option>)}</select><button type="button" className="button secondary" onClick={() => openInlineColor('rollo', rolloForm.idTela)} disabled={!rolloForm.idTela}>＋ Color</button></div></div>
        <details className="fabric-more fabric-span-2" open={showMoreRollo} onToggle={(e) => setShowMoreRollo((e.currentTarget as HTMLDetailsElement).open)}><summary>Ver más <span>Mediciones adicionales y trazabilidad</span></summary>
          <div className="fabric-form-grid nested"><label className="field-label">Peso real (KG)<input className="large-input" type="number" min="0" step="0.001" value={!rolloForm.id && rolloForm.unidadIngreso === 'KG' ? rolloForm.cantidadIngreso : rolloForm.pesoKg} onChange={(e) => setRolloForm((x) => ({ ...x, pesoKg: e.target.value }))} disabled={!rolloForm.id && rolloForm.unidadIngreso === 'KG'} placeholder="Vacío = desconocido" /></label>
          <label className="field-label">Metros reales (M)<input className="large-input" type="number" min="0" step="0.001" value={!rolloForm.id && rolloForm.unidadIngreso === 'M' ? rolloForm.cantidadIngreso : rolloForm.metros} onChange={(e) => setRolloForm((x) => ({ ...x, metros: e.target.value }))} disabled={!rolloForm.id && rolloForm.unidadIngreso === 'M'} placeholder="Vacío = desconocido" /></label>
          <label className="field-label">Partida / lote<input className="large-input" value={rolloForm.idLote} onChange={(e) => setRolloForm((x) => ({ ...x, idLote: e.target.value }))} /></label>
          <label className="field-label">Proveedor<select className="large-input" value={rolloForm.idProveedor} onChange={(e) => setRolloForm((x) => ({ ...x, idProveedor: e.target.value }))}><option value="">Sin proveedor</option>{data.proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
          <label className="field-label">Ubicación<input className="large-input" value={rolloForm.ubicacion} onChange={(e) => setRolloForm((x) => ({ ...x, ubicacion: e.target.value }))} placeholder="Ej. Estante A2" /></label>
          <label className="field-label">Estado<select className="large-input" value={rolloForm.estado} onChange={(e) => setRolloForm((x) => ({ ...x, estado: e.target.value as RollStatus }))}>{Object.entries(statusLabel).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field-label fabric-span-2">Nota<input className="large-input" value={rolloForm.nota} onChange={(e) => setRolloForm((x) => ({ ...x, nota: e.target.value }))} /></label></div>
        </details>
        <div className="fabric-form-hint fabric-span-2">Los valores en blanco significan «no medido». El sistema nunca convierte KG a metros ni metros a KG.</div>
        <div className="form-actions fabric-span-2"><button type="button" className="button secondary" onClick={() => setShowRolloForm(false)}>Cancelar</button><button type="submit" className="button primary">Guardar rollo</button></div>
      </form>
    </section></div>}

    {showSupplierForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSupplierForm(false); }}><section className="modal fabric-form-modal" role="dialog" aria-modal="true" aria-labelledby="fabric-supplier-title">
      <div className="modal-heading"><div><div className="eyebrow">DIRECTORIO COMERCIAL</div><h2 id="fabric-supplier-title">{supplierForm.id ? 'Editar proveedor' : 'Nuevo proveedor'}</h2><p>Los teléfonos y rubros se guardan como registros relacionados, no como listas dentro del proveedor.</p></div><button className="icon-button" onClick={() => setShowSupplierForm(false)}>×</button></div>
      <form onSubmit={saveSupplier} className="fabric-form-grid">
        <label className="field-label fabric-span-2">Nombre comercial *<input className="large-input" required value={supplierForm.nombre} onChange={(e) => setSupplierForm((x) => ({ ...x, nombre: e.target.value }))} /></label>
        <label className="field-label">Contacto<input className="large-input" value={supplierForm.contacto} onChange={(e) => setSupplierForm((x) => ({ ...x, contacto: e.target.value }))} /></label>
        <label className="field-label">Dirección / referencia<input className="large-input" value={supplierForm.direccion} onChange={(e) => setSupplierForm((x) => ({ ...x, direccion: e.target.value }))} /></label>
        <div className="fabric-span-2"><div className="fabric-subheading"><strong>Teléfonos</strong><button type="button" className="text-action" onClick={() => setSupplierForm((x) => ({ ...x, telefonos: [...x.telefonos, { id: id(), numero: '', etiqueta: 'Teléfono' }] }))}>＋ Añadir número</button></div>
          {supplierForm.telefonos.map((phone, index) => <div className="supplier-phone-row" key={phone.id}><input className="large-input" value={phone.etiqueta} onChange={(e) => setSupplierForm((x) => ({ ...x, telefonos: x.telefonos.map((p,i) => i === index ? { ...p, etiqueta: e.target.value } : p) }))} placeholder="Etiqueta" /><input className="large-input" value={phone.numero} onChange={(e) => setSupplierForm((x) => ({ ...x, telefonos: x.telefonos.map((p,i) => i === index ? { ...p, numero: e.target.value } : p) }))} placeholder="Número" /><button type="button" className="remove-piece" onClick={() => setSupplierForm((x) => ({ ...x, telefonos: x.telefonos.filter((_,i) => i !== index) }))}>Quitar</button></div>)}
        </div>
        <div className="fabric-span-2"><div className="fabric-subheading"><strong>Rubros que vende</strong><small>Selecciona todos los que correspondan.</small></div><div className="fabric-category-checks">{categories.map((cat) => <label key={cat}><input type="checkbox" checked={supplierForm.categorias.includes(cat)} onChange={(e) => setSupplierForm((x) => ({ ...x, categorias: e.target.checked ? [...x.categorias, cat] : x.categorias.filter((v) => v !== cat) }))} />{cat}</label>)}</div></div>
        <label className="field-label fabric-span-2">Nota<input className="large-input" value={supplierForm.nota} onChange={(e) => setSupplierForm((x) => ({ ...x, nota: e.target.value }))} /></label>
        <div className="form-actions fabric-span-2"><button type="button" className="button secondary" onClick={() => setShowSupplierForm(false)}>Cancelar</button><button className="button primary" type="submit">Guardar proveedor</button></div>
      </form>
    </section></div>}

    {showPurchaseForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowPurchaseForm(false); }}><section className="modal fabric-purchase-modal" role="dialog" aria-modal="true" aria-labelledby="fabric-purchase-title">
      <div className="modal-heading"><div><div className="eyebrow">ADQUISICIÓN DE TELAS</div><h2 id="fabric-purchase-title">{purchaseForm.id ? 'Editar compra' : 'Nueva compra'}</h2><p>{purchaseForm.id ? 'Puedes corregir la cabecera y los datos históricos de compra; el saldo físico y las mediciones reales de cada rollo no se alteran.' : 'Registra una cabecera y añade uno o varios rollos como detalles.'}</p></div><button className="icon-button" onClick={() => setShowPurchaseForm(false)}>×</button></div>
      {purchaseForm.id ? <form onSubmit={savePurchase} className="fabric-purchase-form">
        <label className="field-label fabric-span-2">Proveedor<select className="large-input" value={purchaseForm.idProveedor} onChange={(e) => setPurchaseForm((x) => ({ ...x, idProveedor: e.target.value }))}><option value="">Sin proveedor</option>{data.proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
        <label className="field-label">Fecha<input className="large-input" type="date" required value={purchaseForm.fechaCompra} onChange={(e) => setPurchaseForm((x) => ({ ...x, fechaCompra: e.target.value }))} /></label>
        <label className="field-label">Comprobante<select className="large-input" value={purchaseForm.tipoComprobante} onChange={(e) => setPurchaseForm((x) => ({ ...x, tipoComprobante: e.target.value }))}>{['Factura','Boleta','Ticket','Guía','Sin comprobante','Otro'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field-label fabric-span-2">Número<input className="large-input" value={purchaseForm.numeroComprobante} onChange={(e) => setPurchaseForm((x) => ({ ...x, numeroComprobante: e.target.value }))} /></label>
        <label className="field-label fabric-span-2">Observación<input className="large-input" value={purchaseForm.observacion} onChange={(e) => setPurchaseForm((x) => ({ ...x, observacion: e.target.value }))} /></label>
        <div className="fabric-purchase-lines-heading"><strong>Detalles de la compra</strong><button type="button" className="text-action" onClick={addPurchaseLine}>＋ Añadir rollo</button></div>
        <div className="fabric-purchase-edit-lines">{purchaseForm.lines.map((line, index) => <div className="fabric-purchase-input-line" key={line.idDetalle ?? `new-${index}`}>
          <div className="fabric-purchase-line-head"><strong>{line.idRollo ? `Rollo ${line.idRollo.slice(0,8)} · ${telaById.get(line.idTela)?.nombreTela ?? 'Tela'}` : `Nuevo rollo ${index + 1}`}</strong>{!line.idRollo && <button type="button" className="remove-piece" onClick={() => setPurchaseForm((x) => ({ ...x, lines: x.lines.filter((_,i) => i !== index) }))}>Quitar</button>}</div>
          {line.idRollo ? <div className="fabric-form-grid nested"><label className="field-label">Cantidad comprada<input className="large-input" type="number" min="0.001" step="0.001" value={line.cantidad} onChange={(e) => updatePurchaseLine(index, { cantidad: e.target.value })} /></label><label className="field-label">Precio por {line.unidad}<input className="large-input" type="number" min="0" step="0.0001" value={line.precio} onChange={(e) => updatePurchaseLine(index, { precio: e.target.value })} /></label><div className="fabric-span-2 purchase-edit-line">Unidad original: {line.unidad}. La cantidad y el precio corresponden al historial de compra; corregirlos no modifica el saldo físico medido del rollo.</div></div>
          : <div className="fabric-form-grid nested"><label className="field-label">Tela<select className="large-input" required value={line.idTela} onChange={(e) => { const telaId = e.target.value; const first = colorsForTela(telaId)[0]; updatePurchaseLine(index, { idTela: telaId, unidad: telaById.get(telaId)?.unidadVenta ?? line.unidad, idTelaColor: first?.id ?? '', color: first?.color?.nombre ?? '' }); }}><option value="">Seleccionar</option>{data.telas.filter((x) => x.activo).map((x) => <option key={x.id} value={x.id}>{x.nombreTela}</option>)}</select></label><label className="field-label">Unidad<select className="large-input" value={line.unidad} onChange={(e) => updatePurchaseLine(index, { unidad: e.target.value as FabricUnit })}><option value="KG">KG</option><option value="M">M</option></select></label><label className="field-label">Cantidad<input className="large-input" type="number" min="0.001" step="0.001" value={line.cantidad} onChange={(e) => updatePurchaseLine(index, { cantidad: e.target.value })} /></label><label className="field-label">Precio por {line.unidad}<input className="large-input" type="number" min="0" step="0.01" value={line.precio} onChange={(e) => updatePurchaseLine(index, { precio: e.target.value })} /></label><div className="field-label"><span>Color de esta tela</span><div className="fabric-provider-inline"><select className="large-input" value={line.idTelaColor} onChange={(e) => updatePurchaseLine(index, { idTelaColor: e.target.value, color: colorNameForVariant(e.target.value) })}><option value="">Sin color asignado</option>{colorsForTela(line.idTela).map((x) => <option key={x.id} value={x.id}>{x.color?.nombre}{x.hexadecimal ? ' · ' + x.hexadecimal : ''}</option>)}</select><button type="button" className="button secondary" onClick={() => openInlineColor('compra', line.idTela, index)} disabled={!line.idTela}>＋ Color</button></div></div><label className="field-label">Partida<input className="large-input" value={line.idLote} onChange={(e) => updatePurchaseLine(index, { idLote: e.target.value })} /></label><label className="field-label fabric-span-2">Cantidades de otros rollos del mismo color y precio (opcional)<input className="large-input" value={line.cantidadesAdicionales} onChange={(e) => updatePurchaseLine(index, { cantidadesAdicionales: e.target.value })} placeholder="Ej. 15, 18.5, 22" /><small>Se creará un rollo individual por cada cantidad. Todos compartirán proveedor, tela, color, unidad y precio, pero cada uno conservará su propio metraje o peso.</small></label><details className="fabric-more fabric-span-2"><summary>Mediciones reales adicionales</summary><div className="fabric-form-grid nested"><label className="field-label">Peso real (KG)<input className="large-input" type="number" min="0" step="0.001" value={line.unidad === 'KG' ? line.cantidad : line.pesoKg} onChange={(e) => updatePurchaseLine(index, { pesoKg: e.target.value })} disabled={line.unidad === 'KG'} placeholder="Vacío = desconocido" /></label><label className="field-label">Metros reales (M)<input className="large-input" type="number" min="0" step="0.001" value={line.unidad === 'M' ? line.cantidad : line.metros} onChange={(e) => updatePurchaseLine(index, { metros: e.target.value })} disabled={line.unidad === 'M'} placeholder="Vacío = desconocido" /></label></div></details></div>}
          <div className="fabric-line-total"><span>Importe de línea</span><strong>{money.format(purchaseLineAmount(line))}</strong></div>
        </div>)}</div>
        <div className="fabric-purchase-summary"><span>Total de la compra</span><strong>{money.format(purchaseForm.lines.reduce((sum,x)=>sum+purchaseLineAmount(x),0))}</strong></div>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowPurchaseForm(false)}>Cancelar</button><button className="button primary">Guardar compra y detalles</button></div>
      </form> : <form onSubmit={savePurchase} className="fabric-purchase-form">
        <div className="fabric-form-grid">
          <div className="fabric-provider-inline fabric-span-2"><label className="field-label">Proveedor<select className="large-input" value={purchaseForm.idProveedor} onChange={(e) => setPurchaseForm((x) => ({ ...x, idProveedor: e.target.value }))}><option value="">Sin proveedor identificado</option>{data.proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label><button type="button" className="button secondary" onClick={() => setShowInlineSupplier((x) => !x)}>＋ Proveedor</button></div>
          {showInlineSupplier && <div className="inline-supplier fabric-span-2"><input className="large-input" value={inlineSupplierName} onChange={(e) => setInlineSupplierName(e.target.value)} placeholder="Nombre comercial del nuevo proveedor" /><button type="button" className="button secondary" onClick={() => { const name = inlineSupplierName.trim(); if (!name) return tell('Escribe el nombre del proveedor.', 'error'); const supplier: Supplier = { id: id(), nombre: name, contacto: '', direccion: '', nota: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; if (!persist({ ...data, proveedores: [...data.proveedores, supplier], proveedorCategorias: [...data.proveedorCategorias, { id: id(), idProveedor: supplier.id, categoria: 'Telas' }] })) return; setPurchaseForm((x) => ({ ...x, idProveedor: supplier.id })); setInlineSupplierName(''); setShowInlineSupplier(false); tell('Proveedor añadido sin salir de la compra. Completa sus teléfonos y rubros luego en Proveedores.'); }}>Guardar proveedor</button></div>}
          <label className="field-label">Fecha de compra<input className="large-input" type="date" required value={purchaseForm.fechaCompra} onChange={(e) => setPurchaseForm((x) => ({ ...x, fechaCompra: e.target.value }))} /></label>
          <label className="field-label">Comprobante<select className="large-input" value={purchaseForm.tipoComprobante} onChange={(e) => setPurchaseForm((x) => ({ ...x, tipoComprobante: e.target.value }))}>{['Factura','Boleta','Ticket','Guía','Sin comprobante','Otro'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label fabric-span-2">Número de comprobante<input className="large-input" value={purchaseForm.numeroComprobante} onChange={(e) => setPurchaseForm((x) => ({ ...x, numeroComprobante: e.target.value }))} placeholder="Serie y número (opcional)" /></label>
          <label className="field-label fabric-span-2">Observación<input className="large-input" value={purchaseForm.observacion} onChange={(e) => setPurchaseForm((x) => ({ ...x, observacion: e.target.value }))} placeholder="Nota general de la compra" /></label>
        </div>
        <div className="fabric-purchase-lines-heading"><strong>Rollos de esta compra</strong><button type="button" className="text-action" onClick={addPurchaseLine}>＋ Añadir rollo</button></div>
        <div className="fabric-purchase-edit-lines">{purchaseForm.lines.map((line, index) => <div className="fabric-purchase-input-line" key={index}>
          <div className="fabric-purchase-line-head"><strong>Rollo {index + 1}</strong>{purchaseForm.lines.length > 1 && <button type="button" className="remove-piece" onClick={() => setPurchaseForm((x) => ({ ...x, lines: x.lines.filter((_,i) => i !== index) }))}>Quitar</button>}</div>
          <div className="fabric-form-grid nested"><label className="field-label">Tela<select className="large-input" required value={line.idTela} onChange={(e) => { const telaId = e.target.value; const first = colorsForTela(telaId)[0]; updatePurchaseLine(index, { idTela: telaId, unidad: telaById.get(telaId)?.unidadVenta ?? line.unidad, idTelaColor: first?.id ?? '', color: first?.color?.nombre ?? '' }); }}><option value="">Seleccionar</option>{data.telas.filter((x) => x.activo).map((x) => <option key={x.id} value={x.id}>{x.nombreTela}</option>)}</select></label>
          <label className="field-label">Unidad<select className="large-input" value={line.unidad} onChange={(e) => updatePurchaseLine(index, { unidad: e.target.value as FabricUnit })}><option value="KG">KG</option><option value="M">M</option></select></label>
          <label className="field-label">Cantidad comprada *<input className="large-input" type="number" min="0.001" step="0.001" required value={line.cantidad} onChange={(e) => updatePurchaseLine(index, { cantidad: e.target.value })} /></label>
          <label className="field-label">Precio por {line.unidad} *<input className="large-input" type="number" min="0" step="0.0001" required value={line.precio} onChange={(e) => updatePurchaseLine(index, { precio: e.target.value })} /></label>
          <div className="field-label"><span>Color de esta tela</span><div className="fabric-provider-inline"><select className="large-input" value={line.idTelaColor} onChange={(e) => updatePurchaseLine(index, { idTelaColor: e.target.value, color: colorNameForVariant(e.target.value) })}><option value="">Sin color asignado</option>{colorsForTela(line.idTela).map((x) => <option key={x.id} value={x.id}>{x.color?.nombre}{x.hexadecimal ? ' · ' + x.hexadecimal : ''}</option>)}</select><button type="button" className="button secondary" onClick={() => openInlineColor('compra', line.idTela, index)} disabled={!line.idTela}>＋ Color</button></div></div>
          <label className="field-label fabric-span-2">Cantidades de otros rollos del mismo color y precio (opcional)<input className="large-input" value={line.cantidadesAdicionales} onChange={(e) => updatePurchaseLine(index, { cantidadesAdicionales: e.target.value })} placeholder="Ej. 15, 18.5, 22" /><small>Cada cantidad crea un rollo independiente con el mismo proveedor, tela, color, unidad y precio unitario.</small></label><div className="fabric-span-2 fabric-more-line"><details><summary>Medición adicional y lote</summary><div className="fabric-form-grid nested"><label className="field-label">Peso real (KG)<input className="large-input" type="number" min="0" step="0.001" value={line.unidad === 'KG' ? line.cantidad : line.pesoKg} onChange={(e) => updatePurchaseLine(index, { pesoKg: e.target.value })} disabled={line.unidad === 'KG'} placeholder="Vacío = desconocido" /></label><label className="field-label">Metros reales (M)<input className="large-input" type="number" min="0" step="0.001" value={line.unidad === 'M' ? line.cantidad : line.metros} onChange={(e) => updatePurchaseLine(index, { metros: e.target.value })} disabled={line.unidad === 'M'} placeholder="Vacío = desconocido" /></label><label className="field-label fabric-span-2">Partida / lote<input className="large-input" value={line.idLote} onChange={(e) => updatePurchaseLine(index, { idLote: e.target.value })} /></label></div></details></div>
          <div className="fabric-line-total fabric-span-2"><span>Importe de este rollo</span><strong>{money.format(purchaseLineAmount(line))}</strong></div></div>
        </div>)}</div>
        <div className="fabric-purchase-summary"><span>Total de la compra</span><strong>{money.format(purchaseForm.lines.reduce((sum, x) => sum + purchaseLineAmount(x), 0))}</strong></div>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowPurchaseForm(false)}>Cancelar</button><button type="submit" className="button primary">Guardar compra y rollos</button></div>
      </form>}
    </section></div>}

    {showRolloDetail && selectedRoll && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRolloDetail(false); }}><section className="modal fabric-form-modal" role="dialog" aria-modal="true" aria-labelledby="roll-detail-title">
      <div className="modal-heading"><div><div className="eyebrow">FICHA DEL ROLLO</div><h2 id="roll-detail-title">{telaById.get(selectedRoll.idTela)?.nombreTela ?? 'Tela'} · {selectedRoll.color || 'Sin color'}</h2><p>Identificador {selectedRoll.id}</p></div><button className="icon-button" onClick={() => setShowRolloDetail(false)}>×</button></div>
      <div className="roll-detail-grid"><div><small>Metros reales</small><strong>{selectedRoll.metros === null ? 'No medidos' : `${nfmt.format(selectedRoll.metros)} m`}</strong></div><div><small>Peso real</small><strong>{selectedRoll.pesoKg === null ? 'No medido' : `${nfmt.format(selectedRoll.pesoKg)} kg`}</strong></div><div><small>Estado</small><strong>{statusLabel[selectedRoll.estado]}</strong></div><div><small>Ingreso</small><strong>{selectedRoll.fechaIngreso}</strong></div><div><small>Partida</small><strong>{selectedRoll.idLote || '—'}</strong></div><div><small>Ubicación</small><strong>{selectedRoll.ubicacion || '—'}</strong></div></div>
      {(() => { const detail = rollPurchaseDetail(selectedRoll.id); const purchase = detail ? data.compras.find((x) => x.id === detail.idCompra) : undefined; return <div className="roll-origin-panel"><strong>Compra de origen</strong>{detail && purchase ? <><span>{purchase.fechaCompra} · {purchase.tipoComprobante} {purchase.numeroComprobante}</span><span>{nfmt.format(detail.cantidadComprada)} {detail.unidadPrecio} × {money.format(detail.precioUnitario)} = <strong>{money.format(detail.importeTotal)}</strong></span><span>{purchase.idProveedor ? supplierById.get(purchase.idProveedor)?.nombre ?? 'Proveedor' : 'Proveedor no indicado'}</span></> : <span>Este rollo no está vinculado a una compra registrada.</span>}</div>; })()}
      <div className="roll-movement-history"><div className="fabric-subheading"><strong>Movimientos del rollo</strong><button className="text-action" onClick={() => openRollMovement(selectedRoll)}>Registrar consumo</button></div>{data.rolloMovimientos.filter((x) => x.idRollo === selectedRoll.id).sort((a,b) => b.fecha.localeCompare(a.fecha)).map((movement) => <div className="roll-movement-row" key={movement.id}><span>{movement.tipo.toLocaleUpperCase('es')} · {movement.unidad}</span><strong>{movement.delta === null ? (movement.cantidadNueva === null ? 'Medición retirada' : `Medición: ${nfmt.format(movement.cantidadNueva)}`) : `${movement.delta > 0 ? '+' : ''}${nfmt.format(movement.delta)}`}</strong><small>{movement.nota} · {new Date(movement.fecha).toLocaleString('es-PE')}</small></div>)}{data.rolloMovimientos.filter((x) => x.idRollo === selectedRoll.id).length === 0 && <small>Sin movimientos registrados.</small>}</div>
      {showRollMovement && <form className="roll-consumption-form" onSubmit={saveRollMovement}><strong>Registrar consumo del rollo</strong><label className="field-label">Medida real<select className="large-input" value={rollMovementForm.unidad} onChange={(e) => setRollMovementForm((x) => ({ ...x, unidad: e.target.value as FabricUnit, medidaComplementaria: '' }))}><option value="KG">KG · {selectedRoll.pesoKg === null ? 'No medido' : `${nfmt.format(selectedRoll.pesoKg)} disponibles`}</option><option value="M">M · {selectedRoll.metros === null ? 'No medido' : `${nfmt.format(selectedRoll.metros)} disponibles`}</option></select></label><label className="field-label">Cantidad a consumir<input className="large-input" type="number" step="0.001" min="0.001" required value={rollMovementForm.cantidad} onChange={(e) => setRollMovementForm((x) => ({ ...x, cantidad: e.target.value }))} /></label><label className="field-label">{rollMovementForm.unidad === 'KG' ? 'Metros reales restantes (opcional)' : 'Peso real restante (opcional)'}<input className="large-input" type="number" min="0" step="0.001" value={rollMovementForm.medidaComplementaria} onChange={(e) => setRollMovementForm((x) => ({ ...x, medidaComplementaria: e.target.value }))} placeholder="Deja vacío si no vas a medir" /><small>La otra medición anterior dejará de considerarse actual. No se calcula por conversión.</small></label><label className="field-label">Motivo<input className="large-input" value={rollMovementForm.nota} onChange={(e) => setRollMovementForm((x) => ({ ...x, nota: e.target.value }))} /></label><div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowRollMovement(false)}>Cancelar</button><button className="button primary">Guardar consumo</button></div></form>}
            <div className="form-actions"><button className="button secondary" onClick={() => { setShowRolloDetail(false); openRollo(selectedRoll); }}>Editar mediciones</button><button className="button primary" onClick={() => setShowRolloDetail(false)}>Cerrar</button></div>
    </section></div>}
  </div>;
}
