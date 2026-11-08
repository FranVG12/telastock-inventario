-- Avios may be catalog-only. Their per-size physical characteristics are
-- configured on each commercial product, not stored as stock-bearing variants.
alter table public.supply_catalog
  drop constraint if exists supply_catalog_stock_mode_check;

alter table public.supply_catalog
  add constraint supply_catalog_stock_mode_check
  check (stock_mode in ('none','total','talla'));

alter table public.supply_catalog
  alter column stock_mode set default 'none';

alter table public.component_material_requirements
  add column if not exists specification_label text null;

create table if not exists public.configured_product_component_material_size_specs (
  id uuid primary key default gen_random_uuid(),
  product_component_id uuid not null
    references public.configured_product_components(id) on delete restrict,
  material_requirement_id uuid not null
    references public.component_material_requirements(id) on delete restrict,
  size_id uuid not null
    references public.sizes(id) on delete restrict,
  specification_label text not null check (length(trim(specification_label)) > 0),
  specification_value text not null check (length(trim(specification_value)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_component_id, material_requirement_id, size_id)
);

create index if not exists product_component_material_size_specs_size_idx
  on public.configured_product_component_material_size_specs(size_id);

create or replace function public.validate_product_component_material_size_spec()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_component_id uuid;
  v_base_model_id uuid;
  v_size_group_id uuid;
  v_material_component_id uuid;
  v_expected_label text;
  v_size_group_for_row uuid;
begin
  select pc.component_id, pm.base_model_id
    into v_component_id, v_base_model_id
  from public.configured_product_components pc
  join public.configured_product_models pm on pm.id = pc.product_model_id
  where pc.id = new.product_component_id;

  if not found then
    raise exception 'La selección de componente del modelo no existe.';
  end if;

  select cmr.component_id, cmr.specification_label
    into v_material_component_id, v_expected_label
  from public.component_material_requirements cmr
  where cmr.id = new.material_requirement_id;

  if not found or v_material_component_id <> v_component_id then
    raise exception 'El material no pertenece al componente seleccionado en este modelo.';
  end if;

  if v_expected_label is null or length(trim(v_expected_label)) = 0 then
    raise exception 'El material no está configurado para recibir una característica por talla.';
  end if;

  select size_group_id into v_size_group_id
  from public.manufacturing_models
  where id = v_base_model_id;

  select group_id into v_size_group_for_row
  from public.sizes
  where id = new.size_id;

  if v_size_group_id is null or v_size_group_for_row is distinct from v_size_group_id then
    raise exception 'La talla no pertenece a la tabla heredada del patrón base del modelo.';
  end if;

  return new;
end;
$$;

drop trigger if exists product_component_material_size_spec_guard
  on public.configured_product_component_material_size_specs;

create trigger product_component_material_size_spec_guard
before insert or update
on public.configured_product_component_material_size_specs
for each row
execute function public.validate_product_component_material_size_spec();

alter table public.configured_product_component_material_size_specs enable row level security;

comment on column public.supply_catalog.stock_mode is
  'none: catálogo sin inventario, características y medidas definidas por modelo/talla; total/talla: inventario físico controlado.';
comment on column public.component_material_requirements.specification_label is
  'Nombre de la característica que se resolverá por talla en cada modelo comercial, por ejemplo Longitud, Ancho o Grosor.';
comment on table public.configured_product_component_material_size_specs is
  'Una fila por modelo/componente/material/talla. Conserva el valor exacto elegido para cada talla sin convertirlo en variante de inventario global.';
