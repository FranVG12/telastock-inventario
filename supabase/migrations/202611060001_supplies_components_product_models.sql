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
