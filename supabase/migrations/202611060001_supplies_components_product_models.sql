-- TelaStock: insumos de confección, componentes reutilizables y modelos configurados.
-- Aditiva: no modifica el inventario de rollos ni el ledger de piezas cortadas.
create extension if not exists pgcrypto;

create table if not exists public.supply_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  base_unit text not null check (base_unit in ('und','m','cm','g','kg','l','ml')),
  stock_mode text not null default 'total' check (stock_mode in ('total','talla')),
  description text not null default '',
  attributes jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists supply_catalog_name_ci_uidx
  on public.supply_catalog (lower(trim(name)));

create table if not exists public.supply_variants (
  id uuid primary key default gen_random_uuid(),
  supply_id uuid not null references public.supply_catalog(id) on delete restrict,
  name text not null,
  attributes jsonb not null default '{}'::jsonb,
  textile_id uuid null references public.telas(id_tela) on delete restrict,
  textile_color_id uuid null references public.tela_colores(id_tela_color) on delete restrict,
  purchase_pack_quantity numeric(14,4) null check (purchase_pack_quantity is null or purchase_pack_quantity > 0),
  purchase_pack_label text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (supply_id, name),
  constraint supply_variant_textile_color_pair check (
    (textile_id is null and textile_color_id is null) or
    (textile_id is not null and textile_color_id is not null)
  )
);
create index if not exists supply_variants_supply_idx on public.supply_variants(supply_id, is_active);

create table if not exists public.supply_stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.supply_variants(id) on delete restrict,
  size_id uuid null references public.sizes(id) on delete restrict,
  delta_quantity numeric(14,4) not null check (delta_quantity <> 0),
  movement_type text not null check (movement_type in ('entrada','salida','ajuste')),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);
create index if not exists supply_movements_variant_size_date_idx
  on public.supply_stock_movements(variant_id, size_id, created_at desc);

create table if not exists public.garment_components (
  id uuid primary key default gen_random_uuid(),
  component_type text not null,
  name text not null,
  description text not null default '',
  image_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists garment_components_type_name_ci_uidx
  on public.garment_components(component_type, lower(trim(name)));

create table if not exists public.component_pattern_pieces (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.garment_components(id) on delete restrict,
  name text not null,
  units_per_garment integer not null default 1 check (units_per_garment > 0),
  laterality text not null default 'ninguna'
    check (laterality in ('ninguna','simetrica','izquierda','derecha')),
  fabric_slot text not null default 'principal',
  color_id uuid null references public.colores(id_color) on delete set null,
  sort_order integer not null default 0 check (sort_order >= 0)
);

create table if not exists public.component_material_requirements (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.garment_components(id) on delete restrict,
  variant_id uuid not null references public.supply_variants(id) on delete restrict,
  consumption_mode text not null check (consumption_mode in ('fixed','per_size')),
  consumption_unit text not null check (consumption_unit in ('und','m','cm','g','kg','l','ml')),
  fixed_quantity numeric(14,5) null check (fixed_quantity is null or fixed_quantity >= 0),
  quantity_by_size jsonb not null default '{}'::jsonb,
  waste_percent numeric(7,3) not null default 0 check (waste_percent >= 0),
  constraint component_material_quantity_mode check (
    (consumption_mode = 'fixed' and fixed_quantity is not null) or
    (consumption_mode = 'per_size' and fixed_quantity is null)
  )
);

create table if not exists public.family_recipes (
  id uuid primary key default gen_random_uuid(),
  garment_family text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists family_recipes_active_family_uidx
  on public.family_recipes(garment_family) where is_active;

create table if not exists public.family_recipe_materials (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.family_recipes(id) on delete restrict,
  variant_id uuid not null references public.supply_variants(id) on delete restrict,
  consumption_mode text not null check (consumption_mode in ('fixed','per_size')),
  consumption_unit text not null check (consumption_unit in ('und','m','cm','g','kg','l','ml')),
  fixed_quantity numeric(14,5) null check (fixed_quantity is null or fixed_quantity >= 0),
  quantity_by_size jsonb not null default '{}'::jsonb,
  waste_percent numeric(7,3) not null default 0 check (waste_percent >= 0),
  constraint family_material_quantity_mode check (
    (consumption_mode = 'fixed' and fixed_quantity is not null) or
    (consumption_mode = 'per_size' and fixed_quantity is null)
  )
);

create table if not exists public.configured_product_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  garment_family text not null,
  base_model_id uuid not null references public.manufacturing_models(id) on delete restrict,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists configured_product_models_name_ci_uidx
  on public.configured_product_models(lower(trim(name)));

create table if not exists public.configured_product_components (
  id uuid primary key default gen_random_uuid(),
  product_model_id uuid not null references public.configured_product_models(id) on delete restrict,
  component_id uuid not null references public.garment_components(id) on delete restrict,
  quantity numeric(10,3) not null default 1 check (quantity > 0),
  location text not null default '',
  variant_overrides jsonb not null default '{}'::jsonb
);
create table if not exists public.configured_product_materials (
  id uuid primary key default gen_random_uuid(),
  product_model_id uuid not null references public.configured_product_models(id) on delete restrict,
  variant_id uuid not null references public.supply_variants(id) on delete restrict,
  consumption_mode text not null check (consumption_mode in ('fixed','per_size')),
  consumption_unit text not null check (consumption_unit in ('und','m','cm','g','kg','l','ml')),
  fixed_quantity numeric(14,5) null check (fixed_quantity is null or fixed_quantity >= 0),
  quantity_by_size jsonb not null default '{}'::jsonb,
  waste_percent numeric(7,3) not null default 0 check (waste_percent >= 0),
  constraint product_material_quantity_mode check (
    (consumption_mode = 'fixed' and fixed_quantity is not null) or
    (consumption_mode = 'per_size' and fixed_quantity is null)
  )
);

-- Stock remains an append-only ledger. Fabric rolls and cut pattern-piece stock remain
-- independent inventories and are not silently converted into generic supply movements.
alter table public.supply_catalog enable row level security;
alter table public.supply_variants enable row level security;
alter table public.supply_stock_movements enable row level security;
alter table public.garment_components enable row level security;
alter table public.component_pattern_pieces enable row level security;
alter table public.component_material_requirements enable row level security;
alter table public.family_recipes enable row level security;
alter table public.family_recipe_materials enable row level security;
alter table public.configured_product_models enable row level security;
alter table public.configured_product_components enable row level security;
alter table public.configured_product_materials enable row level security;

comment on table public.supply_catalog is
  'Catálogo de avíos y consumibles distinto del inventario de rollos y de piezas cortadas.';
comment on table public.supply_stock_movements is
  'Ledger de entradas, salidas y ajustes de variantes de insumos; no almacena saldos editables.';
comment on table public.configured_product_models is
  'Configuración comercial de una prenda que referencia un patrón base sin apropiarse de su stock de piezas.';


-- Prevent concurrent withdrawals from taking an inventory balance below zero.
create or replace function public.validate_supply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mode text;
  v_balance numeric(18,4);
  v_lock_key bigint;
begin
  select s.stock_mode into v_mode
  from public.supply_variants v
  join public.supply_catalog s on s.id = v.supply_id
  where v.id = new.variant_id;

  if v_mode is null then
    raise exception 'La variante de insumo no existe.';
  end if;

  if (v_mode = 'total' and new.size_id is not null)
     or (v_mode = 'talla' and new.size_id is null) then
    raise exception 'La talla indicada no coincide con la modalidad de stock del insumo.';
  end if;

  if (new.movement_type = 'entrada' and new.delta_quantity <= 0)
     or (new.movement_type = 'salida' and new.delta_quantity >= 0) then
    raise exception 'El signo de la cantidad no coincide con el tipo de movimiento.';
  end if;

  v_lock_key := hashtextextended(new.variant_id::text || ':' || coalesce(new.size_id::text, 'total'), 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select coalesce(sum(delta_quantity), 0)
    into v_balance
  from public.supply_stock_movements
  where variant_id = new.variant_id
    and size_id is not distinct from new.size_id;

  if v_balance + new.delta_quantity < 0 then
    raise exception 'Stock insuficiente para registrar la salida.';
  end if;

  return new;
end;
$$;

drop trigger if exists supply_stock_movement_guard on public.supply_stock_movements;
create trigger supply_stock_movement_guard
before insert on public.supply_stock_movements
for each row execute function public.validate_supply_stock_movement();


-- Purchase documents for non-textile supplies. Textile rolls continue to use
-- public.compras/public.detalle_compra and their existing roll-specific workflow.
create table if not exists public.supply_purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid null references public.proveedores(id_proveedor) on delete set null,
  purchase_date date not null,
  document_type text not null default '',
  document_number text not null default '',
  note text not null default '',
  total numeric(14,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now()
);
create index if not exists supply_purchases_date_idx
  on public.supply_purchases(purchase_date desc, created_at desc);
create index if not exists supply_purchases_supplier_idx
  on public.supply_purchases(supplier_id, purchase_date desc);

create table if not exists public.supply_purchase_details (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.supply_purchases(id) on delete restrict,
  variant_id uuid not null references public.supply_variants(id) on delete restrict,
  size_id uuid null references public.sizes(id) on delete restrict,
  purchase_quantity numeric(14,5) not null check (purchase_quantity > 0),
  purchase_unit_label text not null,
  base_quantity_per_pack numeric(14,5) not null check (base_quantity_per_pack > 0),
  inventory_quantity numeric(14,5) generated always as
    (round(purchase_quantity * base_quantity_per_pack, 5)) stored,
  unit_price numeric(14,4) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as
    (round(purchase_quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now()
);
create index if not exists supply_purchase_details_purchase_idx
  on public.supply_purchase_details(purchase_id);
create index if not exists supply_purchase_details_variant_idx
  on public.supply_purchase_details(variant_id, size_id);

create or replace function public.validate_supply_purchase_detail()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_stock_mode text;
  v_textile_id uuid;
begin
  select s.stock_mode, v.textile_id
    into v_stock_mode, v_textile_id
  from public.supply_variants v
  join public.supply_catalog s on s.id = v.supply_id
  where v.id = new.variant_id;

  if v_stock_mode is null then
    raise exception 'La variante de avío no existe.';
  end if;
  if v_textile_id is not null then
    raise exception 'Las variantes vinculadas a tela se compran desde el inventario de rollos.';
  end if;
  if (v_stock_mode = 'total' and new.size_id is not null)
     or (v_stock_mode = 'talla' and new.size_id is null) then
    raise exception 'La talla del detalle no coincide con el control de stock del insumo.';
  end if;
  return new;
end;
$$;

drop trigger if exists supply_purchase_detail_guard on public.supply_purchase_details;
create trigger supply_purchase_detail_guard
before insert or update on public.supply_purchase_details
for each row execute function public.validate_supply_purchase_detail();

create or replace function public.refresh_supply_purchase_total()
returns trigger language plpgsql security definer set search_path = public as $
declare
  v_purchase_id uuid;
begin
  if tg_op = 'DELETE' then
    v_purchase_id := old.purchase_id;
  else
    v_purchase_id := new.purchase_id;
  end if;

  update public.supply_purchases p
  set total = coalesce((
    select sum(d.line_total) from public.supply_purchase_details d
    where d.purchase_id = v_purchase_id
  ), 0)
  where p.id = v_purchase_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$;

drop trigger if exists supply_purchase_total_after_detail on public.supply_purchase_details;
create trigger supply_purchase_total_after_detail
after insert or update or delete on public.supply_purchase_details
for each row execute function public.refresh_supply_purchase_total();

alter table public.supply_stock_movements
  add column if not exists source_purchase_detail_id uuid null
  references public.supply_purchase_details(id) on delete restrict;
create unique index if not exists supply_stock_movement_purchase_detail_uidx
  on public.supply_stock_movements(source_purchase_detail_id)
  where source_purchase_detail_id is not null;

-- A purchase detail can create exactly one positive stock entry for the same
-- variant, size and converted base quantity. The unique index prevents reposting.
create or replace function public.validate_supply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mode text;
  v_balance numeric(18,4);
  v_lock_key bigint;
  v_detail_variant uuid;
  v_detail_size uuid;
  v_detail_quantity numeric(14,5);
begin
  select s.stock_mode into v_mode
  from public.supply_variants v
  join public.supply_catalog s on s.id = v.supply_id
  where v.id = new.variant_id;

  if v_mode is null then
    raise exception 'La variante de insumo no existe.';
  end if;

  if (v_mode = 'total' and new.size_id is not null)
     or (v_mode = 'talla' and new.size_id is null) then
    raise exception 'La talla indicada no coincide con la modalidad de stock del insumo.';
  end if;

  if (new.movement_type = 'entrada' and new.delta_quantity <= 0)
     or (new.movement_type = 'salida' and new.delta_quantity >= 0) then
    raise exception 'El signo de la cantidad no coincide con el tipo de movimiento.';
  end if;

  if new.source_purchase_detail_id is not null then
    select d.variant_id, d.size_id, d.inventory_quantity
      into v_detail_variant, v_detail_size, v_detail_quantity
    from public.supply_purchase_details d
    where d.id = new.source_purchase_detail_id;
    if not found
       or new.movement_type <> 'entrada'
       or new.variant_id <> v_detail_variant
       or new.size_id is distinct from v_detail_size
       or new.delta_quantity <> v_detail_quantity then
      raise exception 'El movimiento no coincide con el detalle de compra asociado.';
    end if;
  end if;

  v_lock_key := hashtextextended(new.variant_id::text || ':' || coalesce(new.size_id::text, 'total'), 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select coalesce(sum(delta_quantity), 0)
    into v_balance
  from public.supply_stock_movements
  where variant_id = new.variant_id
    and size_id is not distinct from new.size_id;

  if v_balance + new.delta_quantity < 0 then
    raise exception 'Stock insuficiente para registrar la salida.';
  end if;

  return new;
end;
$$;

drop trigger if exists supply_stock_movement_guard on public.supply_stock_movements;
create trigger supply_stock_movement_guard
before insert on public.supply_stock_movements
for each row execute function public.validate_supply_stock_movement();

alter table public.supply_purchases enable row level security;
alter table public.supply_purchase_details enable row level security;

comment on table public.supply_purchases is
  'Comprobantes de compra de insumos y avíos. No incluye compras de rollos textiles.';
comment on table public.supply_purchase_details is
  'Líneas de compra con cantidad, precio histórico, presentación y equivalencia declarada en unidad base.';
comment on column public.supply_stock_movements.source_purchase_detail_id is
  'Detalle que originó la entrada de stock, si el movimiento proviene de una compra.';


-- Auxiliary pattern-piece stock is a separate ledger from base model_pieces.
-- Symmetric pieces are recorded by side; a parity entry posts one movement per side.
create table if not exists public.component_piece_stock_movements (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.garment_components(id) on delete restrict,
  component_piece_id uuid not null references public.component_pattern_pieces(id) on delete restrict,
  size_id uuid not null references public.sizes(id) on delete restrict,
  delta_quantity integer not null check (delta_quantity <> 0),
  movement_type text not null check (movement_type in ('entrada','salida','ajuste')),
  side text null check (side is null or side in ('izquierda','derecha')),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null
);
create index if not exists component_piece_movements_piece_size_date_idx
  on public.component_piece_stock_movements(component_piece_id, size_id, created_at desc);

create or replace function public.validate_component_piece_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_laterality text;
  v_owner_id uuid;
  v_balance bigint;
  v_lock_key bigint;
begin
  select p.laterality, p.component_id
    into v_laterality, v_owner_id
  from public.component_pattern_pieces p
  where p.id = new.component_piece_id;

  if v_laterality is null then
    raise exception 'La pieza auxiliar no existe.';
  end if;
  if v_owner_id <> new.component_id then
    raise exception 'La pieza no pertenece al componente indicado.';
  end if;
  if (v_laterality = 'simetrica' and new.side is null)
     or (v_laterality <> 'simetrica' and new.side is not null) then
    raise exception 'La lateralidad del movimiento no coincide con la pieza.';
  end if;
  if (new.movement_type = 'entrada' and new.delta_quantity <= 0)
     or (new.movement_type = 'salida' and new.delta_quantity >= 0) then
    raise exception 'El signo de la cantidad no coincide con el tipo de movimiento.';
  end if;

  v_lock_key := hashtextextended(
    new.component_piece_id::text || ':' || new.size_id::text || ':' || coalesce(new.side, 'unico'), 0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select coalesce(sum(m.delta_quantity), 0)
    into v_balance
  from public.component_piece_stock_movements m
  where m.component_piece_id = new.component_piece_id
    and m.size_id = new.size_id
    and m.side is not distinct from new.side;

  if v_balance + new.delta_quantity < 0 then
    raise exception 'Stock insuficiente para registrar la salida de la pieza auxiliar.';
  end if;
  return new;
end;
$$;

drop trigger if exists component_piece_stock_movement_guard on public.component_piece_stock_movements;
create trigger component_piece_stock_movement_guard
before insert on public.component_piece_stock_movements
for each row execute function public.validate_component_piece_stock_movement();

alter table public.component_piece_stock_movements enable row level security;
comment on table public.component_piece_stock_movements is
  'Ledger independiente de piezas auxiliares por componente, talla y lado; no se mezcla con el stock de patrones base.';
