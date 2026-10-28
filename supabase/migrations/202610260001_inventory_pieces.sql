-- TelaStock: esquema normalizado del inventario de piezas de fabricación.
-- Principios esenciales para futuras modificaciones con IA:
-- 1) Modelo, grupo de tallas, talla y molde son entidades independientes.
-- 2) Una fila de model_pieces representa un tipo de molde; units_per_garment
--    dice cuántas unidades físicas requiere una prenda (ej. mangas simétricas = 2).
-- 3) El stock no se edita directamente: se obtiene sumando el ledger de movimientos.
-- 4) Los faltantes se calculan para una meta de unidades configurable; la UI puede
--    seleccionar desde la siguiente unidad hasta la capacidad del molde más abastecido.
-- 5) Un molde con movimientos se archiva (is_active=false), no se borra físicamente.
-- 6) Salidas y mermas se registran como movimientos negativos auditables, nunca borrando el ledger.

create extension if not exists pgcrypto;

create table if not exists public.size_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.sizes (
  id uuid primary key default gen_random_uuid(),
  size_group_id uuid not null references public.size_groups(id) on delete restrict,
  label text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (size_group_id, label)
);

create table if not exists public.manufacturing_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  size_group_id uuid not null references public.size_groups(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists manufacturing_models_name_group_uq
  on public.manufacturing_models (lower(name), size_group_id);

create table if not exists public.model_pieces (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.manufacturing_models(id) on delete restrict,
  name text not null,
  units_per_garment integer not null default 1 check (units_per_garment > 0),
  laterality text not null default 'ninguna'
    check (laterality in ('simetrica', 'izquierda', 'derecha', 'ninguna')),
  fabric_type text not null default 'Sin especificar',
  color text not null default 'Sin especificar',
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.piece_stock_movements (
  id uuid primary key default gen_random_uuid(),
  model_piece_id uuid not null references public.model_pieces(id) on delete restrict,
  size_id uuid not null references public.sizes(id) on delete restrict,
  delta_quantity integer not null check (delta_quantity <> 0),
  movement_type text not null check (movement_type in ('entrada', 'salida', 'ajuste')),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint movement_direction_matches_type check (
    (movement_type = 'entrada' and delta_quantity > 0) or
    (movement_type = 'salida' and delta_quantity < 0) or
    (movement_type = 'ajuste' and delta_quantity <> 0)
  )
);

-- Safe upgrade path for projects that ran an earlier version of this migration.
alter table public.model_pieces add column if not exists fabric_type text not null default 'Sin especificar';
alter table public.model_pieces add column if not exists color text not null default 'Sin especificar';
-- Archived molds may be replaced by a new active mold with the same display name.
alter table public.model_pieces drop constraint if exists model_pieces_model_id_name_key;
create unique index if not exists model_pieces_active_name_uq on public.model_pieces (model_id, lower(name)) where is_active;

create index if not exists sizes_group_sort_idx on public.sizes(size_group_id, sort_order);
create index if not exists models_group_idx on public.manufacturing_models(size_group_id, is_active);
create index if not exists model_pieces_model_sort_idx on public.model_pieces(model_id, sort_order) where is_active;
create index if not exists piece_movements_piece_size_date_idx on public.piece_stock_movements(model_piece_id, size_id, created_at desc);

-- Un movimiento nunca debe asignar un molde a una talla de otro grupo.
create or replace function public.validate_piece_movement_and_nonnegative_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_model_group uuid;
  v_size_group uuid;
  v_current_balance bigint;
  v_lock_key bigint;
begin
  select m.size_group_id into v_model_group
  from public.model_pieces p join public.manufacturing_models m on m.id = p.model_id
  where p.id = new.model_piece_id;

  select s.size_group_id into v_size_group from public.sizes s where s.id = new.size_id;
  if v_model_group is null or v_size_group is null or v_model_group <> v_size_group then
    raise exception 'La talla no pertenece al grupo de tallas del modelo.';
  end if;

  -- Serializa movimientos del mismo molde+talla para evitar que dos salidas concurrentes
  -- dejen un stock negativo. La clave es determinista para el par pieza/talla.
  v_lock_key := hashtextextended(new.model_piece_id::text || ':' || new.size_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select coalesce(sum(delta_quantity), 0) into v_current_balance
  from public.piece_stock_movements
  where model_piece_id = new.model_piece_id and size_id = new.size_id;

  if v_current_balance + new.delta_quantity < 0 then
    raise exception 'Stock insuficiente para registrar este movimiento.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_piece_movement on public.piece_stock_movements;
create trigger trg_validate_piece_movement
before insert on public.piece_stock_movements
for each row execute function public.validate_piece_movement_and_nonnegative_stock();

-- Vista de saldos por molde y talla; el stock siempre deriva del ledger.
create or replace view public.piece_stock_balances with (security_invoker = true) as
select
  p.model_id,
  m.name as model_name,
  m.size_group_id,
  s.id as size_id,
  s.label as size_label,
  s.sort_order as size_sort_order,
  p.id as model_piece_id,
  p.name as piece_name,
  p.fabric_type,
  p.color,
  p.units_per_garment,
  coalesce(sum(mv.delta_quantity), 0)::integer as stock_quantity
from public.model_pieces p
join public.manufacturing_models m on m.id = p.model_id
join public.sizes s on s.size_group_id = m.size_group_id
left join public.piece_stock_movements mv
  on mv.model_piece_id = p.id and mv.size_id = s.id
where p.is_active and m.is_active
group by m.id, m.name, m.size_group_id, p.id, p.name, p.fabric_type, p.color, p.units_per_garment, s.id, s.label, s.sort_order;

-- Resumen de completitud por modelo+talla. Una manga simétrica con
-- units_per_garment=2 y stock 17 aporta floor(17/2)=8 prendas posibles.
create or replace view public.model_size_completion with (security_invoker = true) as
select
  model_id,
  model_name,
  size_group_id,
  size_id,
  size_label,
  size_sort_order,
  min(floor(stock_quantity::numeric / units_per_garment))::integer as complete_units,
  bool_or(stock_quantity > 0) as has_piece_stock,
  sum(stock_quantity)::integer as total_piece_units
from public.piece_stock_balances
group by model_id, model_name, size_group_id, size_id, size_label, size_sort_order;

-- Por defecto las tablas nuevas no se exponen públicamente. Al conectar Supabase Auth,
-- agrega políticas RLS restringidas al usuario/organización. No usar service_role en cliente.
alter table public.size_groups enable row level security;
alter table public.sizes enable row level security;
alter table public.manufacturing_models enable row level security;
alter table public.model_pieces enable row level security;
alter table public.piece_stock_movements enable row level security;
