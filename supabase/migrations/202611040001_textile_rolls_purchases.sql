-- Módulo de inventario de telas, rollos y compras.
-- Migración aditiva: no altera las tablas ni movimientos del inventario de piezas.
-- Las mediciones reales permanecen NULL cuando son desconocidas; no se convierten ni se rellenan.

create table if not exists public.telas (
  id_tela uuid primary key,
  nombre_tela text not null,
  unidad_venta text not null check (unidad_venta in ('KG','M')),
  ancho_nominal_m numeric(10,3) null check (ancho_nominal_m is null or ancho_nominal_m > 0),
  descripcion text not null default '',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists telas_nombre_ci_uidx on public.telas (lower(nombre_tela));

create table if not exists public.proveedores (
  id_proveedor uuid primary key,
  nombre text not null,
  contacto text not null default '',
  direccion text not null default '',
  nota text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists proveedores_nombre_idx on public.proveedores (lower(nombre));

create table if not exists public.proveedor_telefonos (
  id_telefono uuid primary key,
  id_proveedor uuid not null references public.proveedores(id_proveedor) on delete cascade,
  etiqueta text not null default 'Teléfono',
  numero text not null,
  unique (id_proveedor, numero)
);
create table if not exists public.proveedor_categorias (
  id_categoria uuid primary key,
  id_proveedor uuid not null references public.proveedores(id_proveedor) on delete cascade,
  categoria text not null,
  unique (id_proveedor, categoria)
);

create table if not exists public.rollos (
  id_rollo uuid primary key,
  id_tela uuid not null references public.telas(id_tela) on delete restrict,
  peso_kg numeric(12,3) null check (peso_kg is null or peso_kg >= 0),
  metros numeric(12,3) null check (metros is null or metros >= 0),
  unidad_ingreso text not null check (unidad_ingreso in ('KG','M')),
  cantidad_ingresada numeric(12,3) not null check (cantidad_ingresada > 0),
  color text not null default '',
  id_lote text not null default '',
  fecha_ingreso date not null,
  id_proveedor uuid null references public.proveedores(id_proveedor) on delete set null,
  ubicacion text not null default '',
  estado text not null default 'disponible' check (estado in ('disponible','reservado','agotado','defectuoso')),
  nota text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rollos_tela_fecha_idx on public.rollos (id_tela, fecha_ingreso desc);
create index if not exists rollos_estado_idx on public.rollos (estado);

create table if not exists public.compras (
  id_compra uuid primary key,
  id_proveedor uuid null references public.proveedores(id_proveedor) on delete set null,
  fecha_compra date not null,
  tipo_comprobante text not null default '',
  numero_comprobante text not null default '',
  observacion text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compras_fecha_idx on public.compras (fecha_compra desc);

create table if not exists public.detalle_compra (
  id_detalle uuid primary key,
  id_compra uuid not null references public.compras(id_compra) on delete restrict,
  id_rollo uuid not null unique references public.rollos(id_rollo) on delete restrict,
  cantidad_comprada numeric(12,3) not null check (cantidad_comprada > 0),
  unidad_precio text not null check (unidad_precio in ('KG','M')),
  precio_unitario numeric(14,4) not null check (precio_unitario >= 0),
  importe_total numeric(14,2) generated always as (round(cantidad_comprada * precio_unitario, 2)) stored
);
create index if not exists detalle_compra_compra_idx on public.detalle_compra (id_compra);

-- Los importes de compra se derivan exclusivamente de sus detalles.
create or replace view public.compras_totales as
select c.id_compra, coalesce(sum(d.importe_total), 0)::numeric(14,2) as importe_total
from public.compras c left join public.detalle_compra d using (id_compra)
group by c.id_compra;

-- RLS queda habilitado sin políticas permisivas. Cuando se conecte Supabase,
-- crear políticas por usuario/organización antes de utilizar desde el navegador.
alter table public.telas enable row level security;
alter table public.proveedores enable row level security;
alter table public.proveedor_telefonos enable row level security;
alter table public.proveedor_categorias enable row level security;
alter table public.rollos enable row level security;
alter table public.compras enable row level security;
alter table public.detalle_compra enable row level security;
