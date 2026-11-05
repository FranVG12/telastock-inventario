'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

export type FabricView = 'telas' | 'rollos' | 'compras' | 'proveedores';
export type FabricUnit = 'KG' | 'M';
export type RollStatus = 'disponible' | 'reservado' | 'agotado' | 'defectuoso';

export type Textile = {
  id: string; nombreTela: string; unidadVenta: FabricUnit; anchoNominalM: number | null;
  descripcion: string; activo: boolean; createdAt: string; updatedAt: string;
};
export type FabricRoll = {
  id: string; idTela: string; unidadIngreso: FabricUnit; cantidadIngreso: number;
  pesoKg: number | null; metros: number | null; color: string; idLote: string;
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
export type FabricBackupData = {
  telas: Textile[]; rollos: FabricRoll[]; proveedores: Supplier[];
  proveedorTelefonos: SupplierPhone[]; proveedorCategorias: SupplierCategory[];
  compras: FabricPurchase[]; detalleCompra: PurchaseDetail[];
};
export const FABRIC_STORAGE_KEYS = {
  version: 'telastock-fabric-schema-version',
  telas: 'telastock-fabric-telas-v1',
  rollos: 'telastock-fabric-rollos-v1',
  proveedores: 'telastock-fabric-proveedores-v1',
  proveedorTelefonos: 'telastock-fabric-proveedor-telefonos-v1',
  proveedorCategorias: 'telastock-fabric-proveedor-categorias-v1',
  compras: 'telastock-fabric-compras-v1',
  detalleCompra: 'telastock-fabric-detalle-compra-v1',
} as const;

export function emptyFabricBackupData(): FabricBackupData {
  return { telas: [], rollos: [], proveedores: [], proveedorTelefonos: [], proveedorCategorias: [], compras: [], detalleCompra: [] };
}
export function validateFabricBackupData(value: unknown): FabricBackupData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El respaldo de telas está incompleto.');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(emptyFabricBackupData()) as (keyof FabricBackupData)[];
  const output = {} as FabricBackupData;
  for (const key of keys) {
    const rows = record[key];
    if (!Array.isArray(rows) || !rows.every((row) => row && typeof row === 'object' && !Array.isArray(row) && typeof (row as { id?: unknown }).id === 'string')) {
      throw new Error(\`El apartado de telas "\${key}" falta o contiene filas no válidas.\`);
    }
    const ids = rows.map((row) => (row as { id: string }).id);
    if (new Set(ids).size !== ids.length) throw new Error(\`Hay identificadores duplicados en "\${key}".\`);
    (output as unknown as Record<string, unknown>)[key] = rows;
  }
  const telaIds = new Set(output.telas.map((x) => x.id));
  const proveedorIds = new Set(output.proveedores.map((x) => x.id));
  const rolloIds = new Set(output.rollos.map((x) => x.id));
  const compraIds = new Set(output.compras.map((x) => x.id));
  if (!output.telas.every((x) => x.nombreTela.trim() && ['KG', 'M'].includes(x.unidadVenta) && (x.anchoNominalM === null || (Number.isFinite(x.anchoNominalM) && x.anchoNominalM > 0)))) throw new Error('Hay telas con información inválida.');
  if (!output.proveedorTelefonos.every((x) => proveedorIds.has(x.idProveedor) && x.numero.trim())) throw new Error('Hay teléfonos relacionados con proveedores inexistentes.');
  if (!output.proveedorCategorias.every((x) => proveedorIds.has(x.idProveedor) && x.categoria.trim())) throw new Error('Hay categorías relacionadas con proveedores inexistentes.');
  if (!output.rollos.every((x) => telaIds.has(x.idTela) && (x.idProveedor === null || proveedorIds.has(x.idProveedor)) && ['KG', 'M'].includes(x.unidadIngreso) && Number.isFinite(x.cantidadIngreso) && x.cantidadIngreso > 0 && ['disponible', 'reservado', 'agotado', 'defectuoso'].includes(x.estado) && (x.pesoKg === null || (Number.isFinite(x.pesoKg) && x.pesoKg >= 0)) && (x.metros === null || (Number.isFinite(x.metros) && x.metros >= 0)))) throw new Error('Hay rollos con tela, medición o proveedor inválido.');
  if (!output.compras.every((x) => x.idProveedor === null || proveedorIds.has(x.idProveedor))) throw new Error('Hay compras relacionadas con proveedores inexistentes.');
  if (!output.detalleCompra.every((x) => compraIds.has(x.idCompra) && rolloIds.has(x.idRollo) && Number.isFinite(x.cantidadComprada) && x.cantidadComprada > 0 && ['KG', 'M'].includes(x.unidadPrecio) && Number.isFinite(x.precioUnitario) && x.precioUnitario >= 0 && Math.abs(x.importeTotal - x.cantidadComprada * x.precioUnitario) < 0.011)) throw new Error('Hay detalles de compra con relaciones o importes inválidos.');
  if (new Set(output.detalleCompra.map((x) => x.idRollo)).size !== output.detalleCompra.length) throw new Error('Un rollo aparece en más de una línea de compra.');
  return output;
}

const today = () => {
  const date = new Date();
  return \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}-\${String(date.getDate()).padStart(2, '0')}\`;
};
const id = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : \`fabric-\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;
const nfmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
const nullableNumber = (value: string): number | null => value.trim() === '' ? null : Number(value);
const validQty = (value: number) => Number.isFinite(value) && value > 0;
const categories = ['Telas', 'Cierres', 'Bolsas', 'Elásticos', 'Hilos', 'Avíos', 'Sublimado', 'Otros'];
const statusLabel: Record<RollStatus, string> = { disponible: 'Disponible', reservado: 'Reservado', agotado: 'Agotado', defectuoso: 'Defectuoso' };
const csvCell = (value: unknown) => \`"\${String(value ?? '').replaceAll('"', '""')}"\`;
function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = '\\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\\r\\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function inputNumber(value: number | null) { return value === null ? '' : String(value); }

type TelaForm = { id: string | null; nombreTela: string; unidadVenta: FabricUnit; anchoNominalM: string; descripcion: string; activo: boolean };
type RolloForm = {
  id: string | null; idTela: string; unidadIngreso: FabricUnit; cantidadIngreso: string; fechaIngreso: string;
  color: string; pesoKg: string; metros: string; idLote: string; idProveedor: string;
  ubicacion: string; estado: RollStatus; nota: string;
};
type SupplierForm = { id: string | null; nombre: string; contacto: string; direccion: string; nota: string; telefonos: { id: string; numero: string; etiqueta: string }[]; categorias: string[] };
type PurchaseLineForm = { idRollo: string | null; idDetalle?: string | null; idTela: string; unidad: FabricUnit; cantidad: string; precio: string; color: string; pesoKg: string; metros: string; idLote: string };
type PurchaseForm = { id: string | null; idProveedor: string; fechaCompra: string; tipoComprobante: string; numeroComprobante: string; observacion: string; lines: PurchaseLineForm[] };

function blankTela(): TelaForm { return { id: null, nombreTela: '', unidadVenta: 'KG', anchoNominalM: '', descripcion: '', activo: true }; }
function blankRollo(telas: Textile[]): RolloForm { return { id: null, idTela: telas.find((x) => x.activo)?.id ?? '', unidadIngreso: telas.find((x) => x.activo)?.unidadVenta ?? 'KG', cantidadIngreso: '', fechaIngreso: today(), color: '', pesoKg: '', metros: '', idLote: '', idProveedor: '', ubicacion: '', estado: 'disponible', nota: '' }; }
function blankLine(telas: Textile[]): PurchaseLineForm { return { idRollo: null, idDetalle: null, idTela: telas.find((x) => x.activo)?.id ?? '', unidad: telas.find((x) => x.activo)?.unidadVenta ?? 'KG', cantidad: '', precio: '', color: '', pesoKg: '', metros: '', idLote: '' }; }
function blankPurchase(telas: Textile[]): PurchaseForm { return { id: null, idProveedor: '', fechaCompra: today(), tipoComprobante: 'Factura', numeroComprobante: '', observacion: '', lines: [blankLine(telas)] }; }

export function FabricModule({ view }: { view: FabricView }) {
  const [data, setData] = useState<FabricBackupData>(emptyFabricBackupData);
  const [ready, setReady] = useState(false);
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
  const [showMoreRollo, setShowMoreRollo] = useState(false);
  const [selectedRolloId, setSelectedRolloId] = useState<string | null>(null);
  const [telaForm, setTelaForm] = useState<TelaForm>(blankTela);
  const [rolloForm, setRolloForm] = useState<RolloForm>(() => blankRollo([]));
  const [supplierForm, setSupplierForm] = useState<SupplierForm>({ id: null, nombre: '', contacto: '', direccion: '', nota: '', telefonos: [{ id: id(), numero: '', etiqueta: 'Principal' }], categorias: ['Telas'] });
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>(() => blankPurchase([]));
  const [showInlineSupplier, setShowInlineSupplier] = useState(false);
  const [inlineSupplierName, setInlineSupplierName] = useState('');

  const persist = (next: FabricBackupData) => {
    setData(next);
    try {
      (Object.keys(FABRIC_STORAGE_KEYS) as (keyof typeof FABRIC_STORAGE_KEYS)[]).forEach((key) => {
        if (key === 'version') return;
        const field = key as keyof FabricBackupData;
        localStorage.setItem(FABRIC_STORAGE_KEYS[key], JSON.stringify(next[field]));
      });
      localStorage.setItem(FABRIC_STORAGE_KEYS.version, '1');
    } catch {
      setNotice({ text: 'No se pudo guardar. El almacenamiento del navegador podría estar lleno; exporta un respaldo y libera espacio.', kind: 'error' });
    }
  };
  const loadLocal = () => {
    const next = emptyFabricBackupData();
    (Object.keys(FABRIC_STORAGE_KEYS) as (keyof typeof FABRIC_STORAGE_KEYS)[]).forEach((key) => {
      if (key === 'version') return;
      const field = key as keyof FabricBackupData;
      try {
        const raw = localStorage.getItem(FABRIC_STORAGE_KEYS[key]);
        if (raw) (next as unknown as Record<string, unknown>)[field] = JSON.parse(raw);
      } catch { /* A corrupt key is not allowed to replace other valid local collections. */ }
    });
    return next;
  };
  useEffect(() => {
    const loaded = loadLocal();
    setData(loaded);
    localStorage.setItem(FABRIC_STORAGE_KEYS.version, '1');
    setReady(true);
    const refresh = () => setData(loadLocal());
    window.addEventListener('telastock-fabric-data-restored', refresh);
    return () => window.removeEventListener('telastock-fabric-data-restored', refresh);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      for (const [key, field] of [
        [FABRIC_STORAGE_KEYS.telas, 'telas'], [FABRIC_STORAGE_KEYS.rollos, 'rollos'],
        [FABRIC_STORAGE_KEYS.proveedores, 'proveedores'], [FABRIC_STORAGE_KEYS.proveedorTelefonos, 'proveedorTelefonos'],
        [FABRIC_STORAGE_KEYS.proveedorCategorias, 'proveedorCategorias'], [FABRIC_STORAGE_KEYS.compras, 'compras'],
        [FABRIC_STORAGE_KEYS.detalleCompra, 'detalleCompra'],
      ] as const) localStorage.setItem(key, JSON.stringify(data[field]));
    } catch { setNotice({ text: 'No se pudo guardar el inventario de telas en este navegador.', kind: 'error' }); }
  }, [data, ready]);

  const telaById = useMemo(() => new Map(data.telas.map((x) => [x.id, x])), [data.telas]);
  const supplierById = useMemo(() => new Map(data.proveedores.map((x) => [x.id, x])), [data.proveedores]);
  const rollById = useMemo(() => new Map(data.rollos.map((x) => [x.id, x])), [data.rollos]);
  const detailByPurchase = useMemo(() => {
    const map = new Map<string, PurchaseDetail[]>();
    data.detalleCompra.forEach((detail) => map.set(detail.idCompra, [...(map.get(detail.idCompra) ?? []), detail]));
    return map;
  }, [data.detalleCompra]);

  const tell = (text: string, kind: 'success' | 'error' | 'info' = 'success') => setNotice({ text, kind });
  const telaRows = useMemo(() => data.telas.filter((x) => !telaSearch || \`\${x.nombreTela} \${x.descripcion}\`.toLocaleLowerCase('es').includes(telaSearch.toLocaleLowerCase('es'))).sort((a,b) => a.nombreTela.localeCompare(b.nombreTela, 'es')), [data.telas, telaSearch]);
  const availableColors = useMemo(() => [...new Set(data.rollos.map((x) => x.color).filter(Boolean))].sort(), [data.rollos]);
  const rollRows = useMemo(() => data.rollos.filter((roll) => {
    const tela = telaById.get(roll.idTela)?.nombreTela ?? '';
    const supplier = roll.idProveedor ? supplierById.get(roll.idProveedor)?.nombre ?? '' : '';
    const text = \`\${tela} \${roll.color} \${roll.idLote} \${roll.ubicacion} \${supplier} \${roll.id}\`.toLocaleLowerCase('es');
    return (!rollSearch || text.includes(rollSearch.toLocaleLowerCase('es'))) &&
      (rollTelaFilter === 'all' || roll.idTela === rollTelaFilter) &&
      (rollStatusFilter === 'all' || roll.estado === rollStatusFilter) &&
      (rollSupplierFilter === 'all' || roll.idProveedor === rollSupplierFilter) &&
      (rollColorFilter === 'all' || roll.color === rollColorFilter);
  }).sort((a,b) => b.fechaIngreso.localeCompare(a.fechaIngreso)), [data.rollos, rollSearch, rollTelaFilter, rollStatusFilter, rollSupplierFilter, rollColorFilter, telaById, supplierById]);
  const purchaseRows = useMemo(() => data.compras.filter((x) => {
    const supplier = x.idProveedor ? supplierById.get(x.idProveedor)?.nombre ?? '' : '';
    const details = detailByPurchase.get(x.id) ?? [];
    const haystack = \`\${supplier} \${x.numeroComprobante} \${x.tipoComprobante} \${details.map((d) => \`\${telaById.get(rollById.get(d.idRollo)?.idTela ?? '')?.nombreTela ?? ''} \${d.idRollo}\`).join(' ')}\`.toLocaleLowerCase('es');
    return !purchaseSearch || haystack.includes(purchaseSearch.toLocaleLowerCase('es'));
  }).sort((a,b) => b.fechaCompra.localeCompare(a.fechaCompra)), [data.compras, data.detalleCompra, supplierById, detailByPurchase, telaById, rollById, purchaseSearch]);
  const supplierRows = useMemo(() => data.proveedores.filter((supplier) => {
    const phones = data.proveedorTelefonos.filter((x) => x.idProveedor === supplier.id).map((x) => x.numero).join(' ');
    const cats = data.proveedorCategorias.filter((x) => x.idProveedor === supplier.id).map((x) => x.categoria).join(' ');
    return (!supplierSearch || \`\${supplier.nombre} \${supplier.contacto} \${supplier.direccion} \${phones} \${cats}\`.toLocaleLowerCase('es').includes(supplierSearch.toLocaleLowerCase('es'))) &&
      (supplierCategoryFilter === 'all' || data.proveedorCategorias.some((x) => x.idProveedor === supplier.id && x.categoria === supplierCategoryFilter));
  }).sort((a,b) => a.nombre.localeCompare(b.nombre, 'es')), [data.proveedores, data.proveedorTelefonos, data.proveedorCategorias, supplierSearch, supplierCategoryFilter]);

  function openTela(tela?: Textile) {
    setTelaForm(tela ? { id: tela.id, nombreTela: tela.nombreTela, unidadVenta: tela.unidadVenta, anchoNominalM: inputNumber(tela.anchoNominalM), descripcion: tela.descripcion, activo: tela.activo } : blankTela());
    setShowTelaForm(true);
  }
  function saveTela(event: FormEvent) {
    event.preventDefault();
    const name = telaForm.nombreTela.trim();
    const width = nullableNumber(telaForm.anchoNominalM);
    if (!name) return tell('Escribe el nombre de la tela.', 'error');
    if (telaForm.anchoNominalM.trim() && (width === null || !Number.isFinite(width) || width <= 0)) return tell('El ancho debe ser un número mayor que cero o quedar vacío.', 'error');
    if (data.telas.some((x) => x.nombreTela.toLocaleLowerCase('es') === name.toLocaleLowerCase('es') && x.id !== telaForm.id)) return tell('Ya existe una tela con ese nombre.', 'error');
    const now = new Date().toISOString();
    const row: Textile = { id: telaForm.id ?? id(), nombreTela: name, unidadVenta: telaForm.unidadVenta, anchoNominalM: width, descripcion: telaForm.descripcion.trim(), activo: telaForm.activo, createdAt: telaForm.id ? (telaById.get(telaForm.id)?.createdAt ?? now) : now, updatedAt: now };
    persist({ ...data, telas: telaForm.id ? data.telas.map((x) => x.id === row.id ? row : x) : [...data.telas, row] });
    setShowTelaForm(false); tell(telaForm.id ? 'Tela actualizada. Los rollos y compras anteriores se conservaron.' : 'Tela creada y activada según el checklist.');
  }
  function toggleTela(tela: Textile) {
    persist({ ...data, telas: data.telas.map((x) => x.id === tela.id ? { ...x, activo: !x.activo, updatedAt: new Date().toISOString() } : x) });
    tell(tela.activo ? 'Tela desactivada. Su inventario e historial permanecen.' : 'Tela activada.');
  }
  function openRollo(roll?: FabricRoll) {
    setShowMoreRollo(false);
    const tela = roll ? telaById.get(roll.idTela) : data.telas.find((x) => x.activo);
    setRolloForm(roll ? {
      id: roll.id, idTela: roll.idTela, unidadIngreso: roll.unidadIngreso, cantidadIngreso: String(roll.cantidadIngreso), fechaIngreso: roll.fechaIngreso,
      color: roll.color, pesoKg: inputNumber(roll.pesoKg), metros: inputNumber(roll.metros), idLote: roll.idLote, idProveedor: roll.idProveedor ?? '',
      ubicacion: roll.ubicacion, estado: roll.estado, nota: roll.nota,
    } : { ...blankRollo(data.telas), idTela: tela?.id ?? '', unidadIngreso: tela?.unidadVenta ?? 'KG' });
    setShowRolloForm(true);
  }
  function saveRollo(event: FormEvent) {
    event.preventDefault();
    const tela = telaById.get(rolloForm.idTela);
    const quantity = Number(rolloForm.cantidadIngreso);
    const weightExtra = nullableNumber(rolloForm.pesoKg);
    const metresExtra = nullableNumber(rolloForm.metros);
    if (!tela) return tell('Selecciona una tela existente.', 'error');
    if (!validQty(quantity)) return tell('La cantidad ingresada debe ser mayor que cero.', 'error');
    if ([weightExtra, metresExtra].some((x) => x !== null && (!Number.isFinite(x) || x < 0))) return tell('Las mediciones reales deben ser positivas o quedar vacías; no uses cero para representar un dato desconocido.', 'error');
    if (rolloForm.idProveedor && !supplierById.has(rolloForm.idProveedor)) return tell('El proveedor seleccionado ya no existe.', 'error');
    const now = new Date().toISOString();
    const weight = rolloForm.unidadIngreso === 'KG' ? quantity : weightExtra;
    const metres = rolloForm.unidadIngreso === 'M' ? quantity : metresExtra;
    const row: FabricRoll = {
      id: rolloForm.id ?? id(), idTela: tela.id, unidadIngreso: rolloForm.unidadIngreso, cantidadIngreso: quantity,
      pesoKg: weight, metros, color: rolloForm.color.trim(), idLote: rolloForm.idLote.trim(), fechaIngreso: rolloForm.fechaIngreso,
      idProveedor: rolloForm.idProveedor || null, ubicacion: rolloForm.ubicacion.trim(), estado: rolloForm.estado, nota: rolloForm.nota.trim(),
      createdAt: rolloForm.id ? (rollById.get(rolloForm.id)?.createdAt ?? now) : now, updatedAt: now,
    };
    persist({ ...data, rollos: rolloForm.id ? data.rollos.map((x) => x.id === row.id ? row : x) : [...data.rollos, row] });
    setShowRolloForm(false); tell(rolloForm.id ? 'Rollo actualizado. Las compras históricas no se modificaron.' : 'Rollo registrado en el inventario.');
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
    persist({
      ...data,
      proveedores: supplierForm.id ? data.proveedores.map((x) => x.id === row.id ? row : x) : [...data.proveedores, row],
      proveedorTelefonos: [...data.proveedorTelefonos.filter((x) => x.idProveedor !== row.id), ...phoneRows],
      proveedorCategorias: [...data.proveedorCategorias.filter((x) => x.idProveedor !== row.id), ...categoryRows],
    });
    setShowSupplierForm(false); tell(supplierForm.id ? 'Proveedor actualizado.' : 'Proveedor registrado.');
  }

  function addPurchaseLine() { setPurchaseForm((x) => ({ ...x, lines: [...x.lines, blankLine(data.telas)] })); }
  function updatePurchaseLine(index: number, changes: Partial<PurchaseLineForm>) {
    setPurchaseForm((x) => ({ ...x, lines: x.lines.map((line, i) => i === index ? { ...line, ...changes } : line) }));
  }
  function openPurchase(purchase?: FabricPurchase) {
    if (!purchase) {
      setPurchaseForm(blankPurchase(data.telas));
    } else {
      const lines = (detailByPurchase.get(purchase.id) ?? []).map((detail) => {
        const roll = rollById.get(detail.idRollo);
        return { idRollo: detail.idRollo, idDetalle: detail.id, idTela: roll?.idTela ?? '', unidad: detail.unidadPrecio, cantidad: String(detail.cantidadComprada), precio: String(detail.precioUnitario), color: roll?.color ?? '', pesoKg: inputNumber(roll?.pesoKg ?? null), metros: inputNumber(roll?.metros ?? null), idLote: roll?.idLote ?? '' };
      });
      setPurchaseForm({ id: purchase.id, idProveedor: purchase.idProveedor ?? '', fechaCompra: purchase.fechaCompra, tipoComprobante: purchase.tipoComprobante, numeroComprobante: purchase.numeroComprobante, observacion: purchase.observacion, lines: lines.length ? lines : [blankLine(data.telas)] });
    }
    setShowPurchaseForm(true);
  }
  function savePurchase(event: FormEvent) {
    event.preventDefault();
    if (!purchaseForm.lines.length) return tell('Agrega al menos un rollo a la compra.', 'error');
    if (purchaseForm.idProveedor && !supplierById.has(purchaseForm.idProveedor)) return tell('Selecciona un proveedor válido.', 'error');
    const lines = purchaseForm.lines.map((line) => ({ ...line, quantity: Number(line.cantidad), price: Number(line.precio), tela: telaById.get(line.idTela) }));
    if (lines.some((x) => !x.tela || !validQty(x.quantity) || !Number.isFinite(x.price) || x.price < 0)) return tell('Cada línea necesita una tela, una cantidad mayor que cero y un precio unitario igual o mayor que cero.', 'error');
    if (lines.some((x) => [nullableNumber(x.pesoKg), nullableNumber(x.metros)].some((n) => n !== null && (!Number.isFinite(n) || n < 0)))) return tell('Una medición real es inválida. Deja el campo vacío cuando no conozcas la medida.', 'error');
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
    let details = [...data.detalleCompra];
    for (const line of lines) {
      if (line.idRollo) {
        const existing = details.find((x) => x.idRollo === line.idRollo);
        const roll = data.rollos.find((x) => x.id === line.idRollo);
        if (!existing || !roll || existing.idCompra !== purchaseId) return tell('La línea hace referencia a un rollo o detalle que no pertenece a esta compra.', 'error');
        if (existing.unidadPrecio !== line.unidad) return tell('La unidad de precio de una línea histórica no se puede cambiar; registra otra compra si fue adquirida en otra unidad.', 'error');
        details = details.map((x) => x.id === existing.id ? { ...x, cantidadComprada: line.quantity, precioUnitario: line.price, importeTotal: Number((line.quantity * line.price).toFixed(2)) } : x);
        // La cantidad comprada es histórica; la medición actual del rollo se conserva.
        // Solo se actualiza el dato de ingreso original del rollo.
        const updatedRoll = { ...roll, cantidadIngreso: line.quantity, updatedAt: now };
        if (roll.unidadIngreso === 'KG' && roll.pesoKg === existing.cantidadComprada) updatedRoll.pesoKg = line.quantity;
        if (roll.unidadIngreso === 'M' && roll.metros === existing.cantidadComprada) updatedRoll.metros = line.quantity;
        newRolls.push(updatedRoll);
        continue;
      }
      const tela = line.tela!;
      const rollId = id();
      const kgExtra = nullableNumber(line.pesoKg);
      const mExtra = nullableNumber(line.metros);
      newRolls.push({
        id: rollId, idTela: tela.id, unidadIngreso: line.unidad, cantidadIngreso: line.quantity,
        pesoKg: line.unidad === 'KG' ? line.quantity : kgExtra, metros: line.unidad === 'M' ? line.quantity : mExtra,
        color: line.color.trim(), idLote: line.idLote.trim(), fechaIngreso: purchaseForm.fechaCompra,
        idProveedor: purchaseForm.idProveedor || null, ubicacion: '', estado: 'disponible', nota: '',
        createdAt: now, updatedAt: now,
      });
      details.push({ id: id(), idCompra: purchaseId, idRollo: rollId, cantidadComprada: line.quantity, unidadPrecio: line.unidad, precioUnitario: line.price, importeTotal: Number((line.quantity * line.price).toFixed(2)) });
    }
    const purchaseRows = oldPurchase
      ? data.compras.map((x) => x.id === purchaseId ? purchase : x)
      : [...data.compras, purchase];
    const rollRows = [...data.rollos.filter((roll) => !newRolls.some((x) => x.id === roll.id)), ...newRolls];
    persist({ ...data, compras: purchaseRows, rollos: rollRows, detalleCompra: details });
    setShowPurchaseForm(false);
    tell(`${oldPurchase ? 'Compra actualizada' : 'Compra registrada'}: ${lines.length} rollos por ${money.format(details.filter((x) => x.idCompra === purchaseId).reduce((sum, x) => sum + x.importeTotal, 0))}.`);
  }
  function exportCurrentCsv() {
    if (view === 'telas') {
      downloadCsv('catalogo-telas.csv', [['id_tela','nombre_tela','unidad_venta','ancho_nominal_m','descripcion','activo'], ...data.telas.map((x) => [x.id,x.nombreTela,x.unidadVenta,x.anchoNominalM ?? '',x.descripcion,x.activo ? 'TRUE' : 'FALSE'])]);
    } else if (view === 'rollos') {
      downloadCsv('inventario-rollos.csv', [['id_rollo','id_tela','nombre_tela','unidad_ingreso','cantidad_ingresada','peso_kg_real','metros_reales','color','id_lote','fecha_ingreso','id_proveedor','estado','ubicacion','nota'], ...rollRows.map((x) => [x.id,x.idTela,telaById.get(x.idTela)?.nombreTela ?? '',x.unidadIngreso,x.cantidadIngreso,x.pesoKg ?? '',x.metros ?? '',x.color,x.idLote,x.fechaIngreso,x.idProveedor ?? '',x.estado,x.ubicacion,x.nota])]);
    } else if (view === 'compras') {
      downloadCsv('historial-compras-telas.csv', [['id_compra','id_proveedor','proveedor','fecha_compra','tipo_comprobante','numero_comprobante','id_detalle','id_rollo','id_tela','nombre_tela','cantidad_comprada','unidad_precio','precio_unitario','importe_total'], ...data.compras.flatMap((purchase) => (detailByPurchase.get(purchase.id) ?? []).map((detail) => {
        const roll = rollById.get(detail.idRollo);
        return [purchase.id,purchase.idProveedor ?? '',purchase.idProveedor ? supplierById.get(purchase.idProveedor)?.nombre ?? '' : '',purchase.fechaCompra,purchase.tipoComprobante,purchase.numeroComprobante,detail.id,detail.idRollo,roll?.idTela ?? '',roll ? telaById.get(roll.idTela)?.nombreTela ?? '' : '',detail.cantidadComprada,detail.unidadPrecio,detail.precioUnitario,detail.importeTotal];
      }))]);
    } else {
      downloadCsv('proveedores.csv', [['id_proveedor','nombre','contacto','telefonos','categorias','direccion','nota'], ...supplierRows.map((x) => [x.id,x.nombre,x.contacto,data.proveedorTelefonos.filter((p) => p.idProveedor === x.id).map((p) => p.numero).join(' | '),data.proveedorCategorias.filter((p) => p.idProveedor === x.id).map((p) => p.categoria).join(' | '),x.direccion,x.nota])]);
    }
  }

  const telaRollCount = (telaId: string) => data.rollos.filter((x) => x.idTela === telaId).length;
  const purchaseTotal = (purchaseId: string) => (detailByPurchase.get(purchaseId) ?? []).reduce((sum, x) => sum + x.importeTotal, 0);
  const rollPurchaseDetail = (rollId: string) => data.detalleCompra.find((x) => x.idRollo === rollId);
  const rollPurchase = (rollId: string) => { const detail = rollPurchaseDetail(rollId); return detail ? data.compras.find((x) => x.id === detail.idCompra) : undefined; };
  const selectedRoll = selectedRolloId ? rollById.get(selectedRolloId) : undefined;

  return <div className="fabric-module">
    {notice && <div className={\`notice \${notice.kind}\`} role="status"><span>{notice.text}</span><button onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button></div>}
    <div className="fabric-toolbar">
      <div className="fabric-search-wrap">
        {view === 'telas' && <label className="search-box"><span>⌕</span><input value={telaSearch} onChange={(e) => setTelaSearch(e.target.value)} placeholder="Buscar tela…" /></label>}
        {view === 'rollos' && <label className="search-box"><span>⌕</span><input value={rollSearch} onChange={(e) => setRollSearch(e.target.value)} placeholder="Buscar tela, color, lote o proveedor…" /></label>}
        {view === 'compras' && <label className="search-box"><span>⌕</span><input value={purchaseSearch} onChange={(e) => setPurchaseSearch(e.target.value)} placeholder="Buscar proveedor, comprobante o tela…" /></label>}
        {view === 'proveedores' && <label className="search-box"><span>⌕</span><input value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} placeholder="Buscar proveedor, teléfono o categoría…" /></label>}
      </div>
      <div className="fabric-toolbar-actions">
        <button className="button secondary" onClick={exportCurrentCsv}>↓ <span>CSV</span></button>
        {view === 'telas' && <button className="button primary" onClick={() => openTela()}>＋ <span>Nueva tela</span></button>}
        {view === 'rollos' && <button className="button primary" onClick={() => openRollo() } disabled={data.telas.filter((x) => x.activo).length === 0}>＋ <span>Nuevo rollo</span></button>}
        {view === 'compras' && <button className="button primary" onClick={() => openPurchase()} disabled={data.telas.filter((x) => x.activo).length === 0}>＋ <span>Nueva compra</span></button>}
        {view === 'proveedores' && <button className="button primary" onClick={() => openSupplier()}>＋ <span>Nuevo proveedor</span></button>}
      </div>
    </div>

    {view === 'telas' && <section className="panel">
      <div className="panel-heading"><div><h2>Catálogo de telas</h2><p>Tipos de tela, unidad habitual y ancho nominal. Desactivar no elimina rollos ni compras.</p></div><span className="count-badge">{data.telas.length} telas</span></div>
      <div className="fabric-table-wrap"><table className="fabric-table"><thead><tr><th>Tela</th><th>Unidad</th><th>Ancho</th><th>Rollos</th><th>Estado</th><th></th></tr></thead><tbody>
        {telaRows.map((tela) => <tr key={tela.id}><td><strong>{tela.nombreTela}</strong>{tela.descripcion && <small>{tela.descripcion}</small>}</td><td>{tela.unidadVenta}</td><td>{tela.anchoNominalM === null ? '—' : \`\${nfmt.format(tela.anchoNominalM)} m\`}</td><td>{telaRollCount(tela.id)}</td><td><span className={\`fabric-status \${tela.activo ? 'on' : 'off'}\`}>{tela.activo ? 'Activa' : 'Inactiva'}</span></td><td className="fabric-row-actions"><button className="text-action" onClick={() => openTela(tela)}>Editar</button><button className="text-action" onClick={() => toggleTela(tela)}>{tela.activo ? 'Desactivar' : 'Activar'}</button></td></tr>)}
        {telaRows.length === 0 && <tr><td colSpan={6}><div className="empty">No hay telas registradas. Crea el primer tipo de tela.</div></td></tr>}
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
        return <article className="fabric-roll-row" key={roll.id}><div className="fabric-roll-main"><strong>{tela?.nombreTela ?? 'Tela no disponible'}</strong><span>{roll.color || 'Color sin indicar'} · {roll.idLote || 'Sin lote'}</span><small>{roll.idProveedor ? supplierById.get(roll.idProveedor)?.nombre ?? 'Proveedor no disponible' : 'Sin proveedor'} · Ingreso {roll.fechaIngreso}</small></div><div className="fabric-roll-measures"><strong>{roll.metros === null ? '—' : \`\${nfmt.format(roll.metros)} m\`}</strong><span>{roll.pesoKg === null ? '—' : \`\${nfmt.format(roll.pesoKg)} kg\`}</span><small>Mediciones reales</small></div><span className={\`fabric-status \${roll.estado}\`}>{statusLabel[roll.estado]}</span><div className="fabric-row-actions"><button className="text-action" onClick={() => { setSelectedRolloId(roll.id); setShowRolloDetail(true); }}>Detalle</button><button className="text-action" onClick={() => openRollo(roll)}>Editar</button></div></article>;
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
        return <article className="fabric-supplier-row" key={supplier.id}><div><strong>{supplier.nombre}</strong><span>{supplier.contacto || 'Sin contacto'} · {supplier.direccion || 'Sin dirección'}</span><small>{phones.length ? phones.map((x) => \`\${x.etiqueta}: \${x.numero}\`).join(' · ') : 'Sin teléfonos'} </small><div className="fabric-category-tags">{cats.map((x) => <span key={x}>{x}</span>)}</div></div><button className="button secondary edit-model" onClick={() => openSupplier(supplier)}>Editar</button></article>;
      })}{supplierRows.length === 0 && <div className="empty">No hay proveedores registrados o no coinciden con el filtro.</div>}</div>
    </section>}

    {showTelaForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowTelaForm(false); }}><section className="modal fabric-form-modal" role="dialog" aria-modal="true" aria-labelledby="fabric-tela-title">
      <div className="modal-heading"><div><div className="eyebrow">CATÁLOGO DE INSUMOS</div><h2 id="fabric-tela-title">{telaForm.id ? 'Editar tela' : 'Nueva tela'}</h2><p>El catálogo define las características generales; no reescribe compras históricas.</p></div><button className="icon-button" onClick={() => setShowTelaForm(false)}>×</button></div>
      <form onSubmit={saveTela} className="fabric-form-grid">
        <label className="field-label fabric-span-2">Nombre de tela *<input className="large-input" required value={telaForm.nombreTela} onChange={(e) => setTelaForm((x) => ({ ...x, nombreTela: e.target.value }))} placeholder="Ej. Win sublimada" /></label>
        <label className="field-label">Unidad habitual *<select className="large-input" value={telaForm.unidadVenta} onChange={(e) => setTelaForm((x) => ({ ...x, unidadVenta: e.target.value as FabricUnit }))}><option value="KG">Kilogramos (KG)</option><option value="M">Metros (M)</option></select></label>
        <label className="field-label">Ancho nominal (m)<input className="large-input" type="number" step="0.001" min="0.001" value={telaForm.anchoNominalM} onChange={(e) => setTelaForm((x) => ({ ...x, anchoNominalM: e.target.value }))} placeholder="Ej. 1.80" /></label>
        <label className="field-label fabric-span-2">Descripción<textarea className="large-input fabric-textarea" value={telaForm.descripcion} onChange={(e) => setTelaForm((x) => ({ ...x, descripcion: e.target.value }))} placeholder="Composición, acabado o uso…" /></label>
        <label className="fabric-check"><input type="checkbox" checked={telaForm.activo} onChange={(e) => setTelaForm((x) => ({ ...x, activo: e.target.checked }))} /> Activo</label>
        <div className="form-actions fabric-span-2"><button type="button" className="button secondary" onClick={() => setShowTelaForm(false)}>Cancelar</button><button className="button primary" type="submit">Guardar tela</button></div>
      </form>
    </section></div>}

    {showRolloForm && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRolloForm(false); }}><section className="modal fabric-form-modal" role="dialog" aria-modal="true" aria-labelledby="fabric-roll-title">
      <div className="modal-heading"><div><div className="eyebrow">INVENTARIO FÍSICO</div><h2 id="fabric-roll-title">{rolloForm.id ? 'Editar rollo' : 'Registrar rollo'}</h2><p>El valor ingresado se guarda como medición real de la unidad elegida. No se estima la otra medida.</p></div><button className="icon-button" onClick={() => setShowRolloForm(false)}>×</button></div>
      <form onSubmit={saveRollo} className="fabric-form-grid">
        <label className="field-label fabric-span-2">Tela *<select className="large-input" required value={rolloForm.idTela} onChange={(e) => setRolloForm((x) => ({ ...x, idTela: e.target.value, unidadIngreso: telaById.get(e.target.value)?.unidadVenta ?? x.unidadIngreso }))}><option value="">Seleccionar tela</option>{data.telas.filter((x) => x.activo || x.id === rolloForm.idTela).map((x) => <option key={x.id} value={x.id}>{x.nombreTela}{x.activo ? '' : ' · Inactiva'}</option>)}</select></label>
        <label className="field-label">Unidad de ingreso *<select className="large-input" value={rolloForm.unidadIngreso} onChange={(e) => setRolloForm((x) => ({ ...x, unidadIngreso: e.target.value as FabricUnit }))}><option value="KG">Kilogramos (KG)</option><option value="M">Metros (M)</option></select></label>
        <label className="field-label">Cantidad ingresada *<input className="large-input" type="number" step="0.001" min="0.001" required value={rolloForm.cantidadIngreso} onChange={(e) => setRolloForm((x) => ({ ...x, cantidadIngreso: e.target.value }))} placeholder={rolloForm.unidadIngreso === 'KG' ? 'Ej. 20.5' : 'Ej. 45'} /></label>
        <label className="field-label">Fecha de ingreso *<input className="large-input" type="date" required value={rolloForm.fechaIngreso} onChange={(e) => setRolloForm((x) => ({ ...x, fechaIngreso: e.target.value }))} /></label>
        <label className="field-label">Color<input className="large-input" value={rolloForm.color} onChange={(e) => setRolloForm((x) => ({ ...x, color: e.target.value }))} placeholder="Ej. Negro" /></label>
        <details className="fabric-more fabric-span-2" open={showMoreRollo} onToggle={(e) => setShowMoreRollo((e.currentTarget as HTMLDetailsElement).open)}><summary>Ver más <span>Mediciones adicionales y trazabilidad</span></summary>
          <div className="fabric-form-grid nested"><label className="field-label">Peso real (KG)<input className="large-input" type="number" min="0" step="0.001" value={rolloForm.unidadIngreso === 'KG' ? rolloForm.cantidadIngreso : rolloForm.pesoKg} onChange={(e) => setRolloForm((x) => ({ ...x, pesoKg: e.target.value }))} disabled={rolloForm.unidadIngreso === 'KG'} placeholder="Vacío = desconocido" /></label>
          <label className="field-label">Metros reales (M)<input className="large-input" type="number" min="0" step="0.001" value={rolloForm.unidadIngreso === 'M' ? rolloForm.cantidadIngreso : rolloForm.metros} onChange={(e) => setRolloForm((x) => ({ ...x, metros: e.target.value }))} disabled={rolloForm.unidadIngreso === 'M'} placeholder="Vacío = desconocido" /></label>
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
      <div className="modal-heading"><div><div className="eyebrow">ADQUISICIÓN DE TELAS</div><h2 id="fabric-purchase-title">{purchaseForm.id ? 'Editar compra' : 'Nueva compra'}</h2><p>{purchaseForm.id ? 'Solo se modifica la cabecera; las cantidades y precios históricos se conservan.' : 'Registra una cabecera y añade uno o varios rollos como detalles.'}</p></div><button className="icon-button" onClick={() => setShowPurchaseForm(false)}>×</button></div>
      {purchaseForm.id ? <form onSubmit={savePurchase} className="fabric-purchase-form">
        <label className="field-label fabric-span-2">Proveedor<select className="large-input" value={purchaseForm.idProveedor} onChange={(e) => setPurchaseForm((x) => ({ ...x, idProveedor: e.target.value }))}><option value="">Sin proveedor</option>{data.proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
        <label className="field-label">Fecha<input className="large-input" type="date" required value={purchaseForm.fechaCompra} onChange={(e) => setPurchaseForm((x) => ({ ...x, fechaCompra: e.target.value }))} /></label>
        <label className="field-label">Comprobante<select className="large-input" value={purchaseForm.tipoComprobante} onChange={(e) => setPurchaseForm((x) => ({ ...x, tipoComprobante: e.target.value }))}>{['Factura','Boleta','Ticket','Guía','Sin comprobante','Otro'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="field-label fabric-span-2">Número<input className="large-input" value={purchaseForm.numeroComprobante} onChange={(e) => setPurchaseForm((x) => ({ ...x, numeroComprobante: e.target.value }))} /></label>
        <label className="field-label fabric-span-2">Observación<input className="large-input" value={purchaseForm.observacion} onChange={(e) => setPurchaseForm((x) => ({ ...x, observacion: e.target.value }))} /></label>
        <div className="fabric-purchase-lines-heading"><strong>Detalles de la compra</strong><button type="button" className="text-action" onClick={addPurchaseLine}>＋ Añadir rollo</button></div>
        <div className="fabric-purchase-edit-lines">{purchaseForm.lines.map((line, index) => <div className="fabric-purchase-input-line" key={line.idDetalle ?? `new-${index}`}>
          <div className="fabric-purchase-line-head"><strong>{line.idRollo ? `Rollo ${line.idRollo.slice(0,8)} · ${telaById.get(line.idTela)?.nombreTela ?? 'Tela'}` : `Nuevo rollo ${index + 1}`}</strong>{!line.idRollo && <button type="button" className="remove-piece" onClick={() => setPurchaseForm((x) => ({ ...x, lines: x.lines.filter((_,i) => i !== index) }))}>Quitar</button>}</div>
          {line.idRollo ? <div className="fabric-form-grid nested"><label className="field-label">Cantidad comprada<input className="large-input" type="number" min="0.001" step="0.001" value={line.cantidad} onChange={(e) => updatePurchaseLine(index, { cantidad: e.target.value })} /></label><label className="field-label">Unidad / precio por {line.unidad}<input className="large-input" value={line.precio} onChange={(e) => updatePurchaseLine(index, { precio: e.target.value })} /></label><div className="fabric-span-2 purchase-edit-line">Unidad original: {line.unidad}. La medición actual del rollo no se reemplaza al corregir la cantidad histórica.</div></div>
          : <div className="fabric-form-grid nested"><label className="field-label">Tela<select className="large-input" required value={line.idTela} onChange={(e) => updatePurchaseLine(index, { idTela: e.target.value, unidad: telaById.get(e.target.value)?.unidadVenta ?? line.unidad })}><option value="">Seleccionar</option>{data.telas.filter((x) => x.activo).map((x) => <option key={x.id} value={x.id}>{x.nombreTela}</option>)}</select></label><label className="field-label">Unidad<select className="large-input" value={line.unidad} onChange={(e) => updatePurchaseLine(index, { unidad: e.target.value as FabricUnit })}><option value="KG">KG</option><option value="M">M</option></select></label><label className="field-label">Cantidad<input className="large-input" type="number" min="0.001" step="0.001" value={line.cantidad} onChange={(e) => updatePurchaseLine(index, { cantidad: e.target.value })} /></label><label className="field-label">Precio por {line.unidad}<input className="large-input" type="number" min="0" step="0.01" value={line.precio} onChange={(e) => updatePurchaseLine(index, { precio: e.target.value })} /></label><label className="field-label">Color<input className="large-input" value={line.color} onChange={(e) => updatePurchaseLine(index, { color: e.target.value })} /></label><label className="field-label">Partida<input className="large-input" value={line.idLote} onChange={(e) => updatePurchaseLine(index, { idLote: e.target.value })} /></label></div>}
          <div className="fabric-line-total"><span>Importe de línea</span><strong>{money.format((Number(line.cantidad)||0)*(Number(line.precio)||0))}</strong></div>
        </div>)}</div>
        <div className="fabric-purchase-summary"><span>Total de la compra</span><strong>{money.format(purchaseForm.lines.reduce((sum,x)=>sum+(Number(x.cantidad)||0)*(Number(x.precio)||0),0))}</strong></div>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowPurchaseForm(false)}>Cancelar</button><button className="button primary">Guardar compra y detalles</button></div>
      </form> : <form onSubmit={savePurchase} className="fabric-purchase-form">
        <div className="fabric-form-grid">
          <div className="fabric-provider-inline fabric-span-2"><label className="field-label">Proveedor<select className="large-input" value={purchaseForm.idProveedor} onChange={(e) => setPurchaseForm((x) => ({ ...x, idProveedor: e.target.value }))}><option value="">Sin proveedor identificado</option>{data.proveedores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label><button type="button" className="button secondary" onClick={() => setShowInlineSupplier((x) => !x)}>＋ Proveedor</button></div>
          {showInlineSupplier && <div className="inline-supplier fabric-span-2"><input className="large-input" value={inlineSupplierName} onChange={(e) => setInlineSupplierName(e.target.value)} placeholder="Nombre comercial del nuevo proveedor" /><button type="button" className="button secondary" onClick={() => { const name = inlineSupplierName.trim(); if (!name) return tell('Escribe el nombre del proveedor.', 'error'); const supplier: Supplier = { id: id(), nombre: name, contacto: '', direccion: '', nota: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; persist({ ...data, proveedores: [...data.proveedores, supplier], proveedorCategorias: [...data.proveedorCategorias, { id: id(), idProveedor: supplier.id, categoria: 'Telas' }] }); setPurchaseForm((x) => ({ ...x, idProveedor: supplier.id })); setInlineSupplierName(''); setShowInlineSupplier(false); tell('Proveedor añadido sin salir de la compra. Completa sus teléfonos y rubros luego en Proveedores.'); }}>Guardar proveedor</button></div>}
          <label className="field-label">Fecha de compra<input className="large-input" type="date" required value={purchaseForm.fechaCompra} onChange={(e) => setPurchaseForm((x) => ({ ...x, fechaCompra: e.target.value }))} /></label>
          <label className="field-label">Comprobante<select className="large-input" value={purchaseForm.tipoComprobante} onChange={(e) => setPurchaseForm((x) => ({ ...x, tipoComprobante: e.target.value }))}>{['Factura','Boleta','Ticket','Guía','Sin comprobante','Otro'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="field-label fabric-span-2">Número de comprobante<input className="large-input" value={purchaseForm.numeroComprobante} onChange={(e) => setPurchaseForm((x) => ({ ...x, numeroComprobante: e.target.value }))} placeholder="Serie y número (opcional)" /></label>
          <label className="field-label fabric-span-2">Observación<input className="large-input" value={purchaseForm.observacion} onChange={(e) => setPurchaseForm((x) => ({ ...x, observacion: e.target.value }))} placeholder="Nota general de la compra" /></label>
        </div>
        <div className="fabric-purchase-lines-heading"><strong>Rollos de esta compra</strong><button type="button" className="text-action" onClick={addPurchaseLine}>＋ Añadir rollo</button></div>
        <div className="fabric-purchase-edit-lines">{purchaseForm.lines.map((line, index) => <div className="fabric-purchase-input-line" key={index}>
          <div className="fabric-purchase-line-head"><strong>Rollo {index + 1}</strong>{purchaseForm.lines.length > 1 && <button type="button" className="remove-piece" onClick={() => setPurchaseForm((x) => ({ ...x, lines: x.lines.filter((_,i) => i !== index) }))}>Quitar</button>}</div>
          <div className="fabric-form-grid nested"><label className="field-label">Tela<select className="large-input" required value={line.idTela} onChange={(e) => updatePurchaseLine(index, { idTela: e.target.value, unidad: telaById.get(e.target.value)?.unidadVenta ?? line.unidad })}><option value="">Seleccionar</option>{data.telas.filter((x) => x.activo).map((x) => <option key={x.id} value={x.id}>{x.nombreTela}</option>)}</select></label>
          <label className="field-label">Unidad<select className="large-input" value={line.unidad} onChange={(e) => updatePurchaseLine(index, { unidad: e.target.value as FabricUnit })}><option value="KG">KG</option><option value="M">M</option></select></label>
          <label className="field-label">Cantidad comprada *<input className="large-input" type="number" min="0.001" step="0.001" required value={line.cantidad} onChange={(e) => updatePurchaseLine(index, { cantidad: e.target.value })} /></label>
          <label className="field-label">Precio por {line.unidad} *<input className="large-input" type="number" min="0" step="0.01" required value={line.precio} onChange={(e) => updatePurchaseLine(index, { precio: e.target.value })} /></label>
          <label className="field-label">Color<input className="large-input" value={line.color} onChange={(e) => updatePurchaseLine(index, { color: e.target.value })} /></label>
          <div className="fabric-span-2 fabric-more-line"><details><summary>Medición adicional y lote</summary><div className="fabric-form-grid nested"><label className="field-label">Peso real (KG)<input className="large-input" type="number" min="0" step="0.001" value={line.unidad === 'KG' ? line.cantidad : line.pesoKg} onChange={(e) => updatePurchaseLine(index, { pesoKg: e.target.value })} disabled={line.unidad === 'KG'} placeholder="Vacío = desconocido" /></label><label className="field-label">Metros reales (M)<input className="large-input" type="number" min="0" step="0.001" value={line.unidad === 'M' ? line.cantidad : line.metros} onChange={(e) => updatePurchaseLine(index, { metros: e.target.value })} disabled={line.unidad === 'M'} placeholder="Vacío = desconocido" /></label><label className="field-label fabric-span-2">Partida / lote<input className="large-input" value={line.idLote} onChange={(e) => updatePurchaseLine(index, { idLote: e.target.value })} /></label></div></details></div>
          <div className="fabric-line-total fabric-span-2"><span>Importe de este rollo</span><strong>{money.format((Number(line.cantidad) || 0) * (Number(line.precio) || 0))}</strong></div></div>
        </div>)}</div>
        <div className="fabric-purchase-summary"><span>Total de la compra</span><strong>{money.format(purchaseForm.lines.reduce((sum, x) => sum + (Number(x.cantidad) || 0) * (Number(x.precio) || 0), 0))}</strong></div>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowPurchaseForm(false)}>Cancelar</button><button type="submit" className="button primary">Guardar compra y rollos</button></div>
      </form>}
    </section></div>}

    {showRolloDetail && selectedRoll && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRolloDetail(false); }}><section className="modal fabric-form-modal" role="dialog" aria-modal="true" aria-labelledby="roll-detail-title">
      <div className="modal-heading"><div><div className="eyebrow">FICHA DEL ROLLO</div><h2 id="roll-detail-title">{telaById.get(selectedRoll.idTela)?.nombreTela ?? 'Tela'} · {selectedRoll.color || 'Sin color'}</h2><p>Identificador {selectedRoll.id}</p></div><button className="icon-button" onClick={() => setShowRolloDetail(false)}>×</button></div>
      <div className="roll-detail-grid"><div><small>Metros reales</small><strong>{selectedRoll.metros === null ? 'No medidos' : \`\${nfmt.format(selectedRoll.metros)} m\`}</strong></div><div><small>Peso real</small><strong>{selectedRoll.pesoKg === null ? 'No medido' : \`\${nfmt.format(selectedRoll.pesoKg)} kg\`}</strong></div><div><small>Estado</small><strong>{statusLabel[selectedRoll.estado]}</strong></div><div><small>Ingreso</small><strong>{selectedRoll.fechaIngreso}</strong></div><div><small>Partida</small><strong>{selectedRoll.idLote || '—'}</strong></div><div><small>Ubicación</small><strong>{selectedRoll.ubicacion || '—'}</strong></div></div>
      {(() => { const detail = rollPurchaseDetail(selectedRoll.id); const purchase = detail ? data.compras.find((x) => x.id === detail.idCompra) : undefined; return <div className="roll-origin-panel"><strong>Compra de origen</strong>{detail && purchase ? <><span>{purchase.fechaCompra} · {purchase.tipoComprobante} {purchase.numeroComprobante}</span><span>{nfmt.format(detail.cantidadComprada)} {detail.unidadPrecio} × {money.format(detail.precioUnitario)} = <strong>{money.format(detail.importeTotal)}</strong></span><span>{purchase.idProveedor ? supplierById.get(purchase.idProveedor)?.nombre ?? 'Proveedor' : 'Proveedor no indicado'}</span></> : <span>Este rollo no está vinculado a una compra registrada.</span>}</div>; })()}
      <div className="form-actions"><button className="button secondary" onClick={() => { setShowRolloDetail(false); openRollo(selectedRoll); }}>Editar mediciones</button><button className="button primary" onClick={() => setShowRolloDetail(false)}>Cerrar</button></div>
    </section></div>}
  </div>;
}
