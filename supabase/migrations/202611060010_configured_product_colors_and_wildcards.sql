-- TelaStock: posiciones de color por patrón/componente y asignaciones por modelo comercial.
-- Los moldes y componentes conservan referencias genéricas; cada modelo concreto resuelve
-- las posiciones a colores del catálogo y puede definir excepciones para piezas comodín.

alter table public.manufacturing_models
  add column if not exists secondary_color_slots integer not null default 0;

alter table public.manufacturing_models
  drop constraint if exists manufacturing_models_secondary_color_slots_check;
alter table public.manufacturing_models
  add constraint manufacturing_models_secondary_color_slots_check
  check (secondary_color_slots >= 0);

-- Base pattern pieces use named positions rather than a fixed commercial color.
alter table public.model_pieces
  add column if not exists color_slot text not null default 'ninguna';

update public.model_pieces
set color_slot = case when color_id is not null then 'principal' else 'ninguna' end
where color_slot is null or color_slot = 'ninguna' and color_id is not null;

alter table public.model_pieces
  drop constraint if exists model_pieces_color_slot_check;
alter table public.model_pieces
  add constraint model_pieces_color_slot_check
  check (
    color_slot in ('ninguna', 'cualquiera', 'principal')
    or color_slot ~ '^secundaria_[1-9][0-9]*$'
  );

-- The wildcard allows a base-pattern piece to leave textile choice to each product model.
alter table public.model_pieces
  drop constraint if exists model_pieces_fabric_slot_check;
alter table public.model_pieces
  add constraint model_pieces_fabric_slot_check
  check (
    fabric_slot in ('cualquiera', 'principal')
    or fabric_slot ~ '^secundaria_[1-9][0-9]*$'
  );

-- Reusable components store only positions. Legacy color IDs remain as compatibility
-- fallbacks for existing records; new entries use color_slot.
alter table public.component_pattern_pieces
  add column if not exists color_slot text not null default 'cualquiera';

update public.component_pattern_pieces
set color_slot = case when color_id is not null then 'principal' else 'cualquiera' end
where color_slot is null or color_slot = 'cualquiera' and color_id is not null;

alter table public.component_pattern_pieces
  drop constraint if exists component_pattern_pieces_color_slot_check;
alter table public.component_pattern_pieces
  add constraint component_pattern_pieces_color_slot_check
  check (
    color_slot in ('ninguna', 'cualquiera', 'principal')
    or color_slot ~ '^secundaria_[1-9][0-9]*$'
  );

alter table public.component_pattern_pieces
  drop constraint if exists component_pattern_pieces_fabric_slot_check;
alter table public.component_pattern_pieces
  add constraint component_pattern_pieces_fabric_slot_check
  check (
    fabric_slot in ('ninguna', 'cualquiera', 'principal')
    or fabric_slot ~ '^secundaria_[1-9][0-9]*$'
  );

-- Product-specific wildcard choices are stored separately from reusable pattern pieces.
alter table public.configured_product_models
  add column if not exists base_piece_overrides jsonb not null default '{}'::jsonb;
alter table public.configured_product_models
  drop constraint if exists configured_product_models_base_piece_overrides_object_check;
alter table public.configured_product_models
  add constraint configured_product_models_base_piece_overrides_object_check
  check (jsonb_typeof(base_piece_overrides) = 'object');

alter table public.configured_product_components
  add column if not exists piece_overrides jsonb not null default '{}'::jsonb;
alter table public.configured_product_components
  drop constraint if exists configured_product_components_piece_overrides_object_check;
alter table public.configured_product_components
  add constraint configured_product_components_piece_overrides_object_check
  check (jsonb_typeof(piece_overrides) = 'object');

create table if not exists public.configured_product_colors (
  id uuid primary key default gen_random_uuid(),
  product_model_id uuid not null
    references public.configured_product_models(id) on delete restrict,
  color_slot text not null
    check (color_slot = 'principal' or color_slot ~ '^secundaria_[1-9][0-9]*$'),
  color_id uuid not null
    references public.colores(id_color) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_model_id, color_slot)
);

create index if not exists configured_product_colors_color_id_idx
  on public.configured_product_colors(color_id);

create or replace function public.validate_configured_product_color_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_model_id uuid;
  v_secondary_slots integer;
  v_slot_index integer;
begin
  select base_model_id
    into v_base_model_id
  from public.configured_product_models
  where id = new.product_model_id;

  if v_base_model_id is null then
    raise exception 'El modelo comercial seleccionado no existe.';
  end if;

  select secondary_color_slots
    into v_secondary_slots
  from public.manufacturing_models
  where id = v_base_model_id;

  if new.color_slot = 'principal' then
    return new;
  end if;

  v_slot_index := substring(new.color_slot from '^secundaria_([1-9][0-9]*)$')::integer;
  if v_slot_index < 1 or v_slot_index > coalesce(v_secondary_slots, 0) then
    raise exception 'La posición de color % no está definida en el patrón base seleccionado.', new.color_slot;
  end if;

  return new;
end;
$$;

drop trigger if exists configured_product_colors_slot_guard
  on public.configured_product_colors;
create trigger configured_product_colors_slot_guard
before insert or update of product_model_id, color_slot
on public.configured_product_colors
for each row
execute function public.validate_configured_product_color_slot();

-- Make the fabric compatibility guard explicitly accept the wildcard position too.
create or replace function public.assert_component_fabric_slots_fit_product(
  p_product_model_id uuid,
  p_component_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $
declare
  v_secondary_slots integer;
  v_piece record;
  v_slot_index integer;
begin
  select mm.secondary_fabric_slots
    into v_secondary_slots
  from public.configured_product_models pm
  join public.manufacturing_models mm on mm.id = pm.base_model_id
  where pm.id = p_product_model_id;

  if not found then
    raise exception 'El modelo comercial o su patrón base no existe.';
  end if;

  for v_piece in
    select id, name, fabric_slot
    from public.component_pattern_pieces
    where component_id = p_component_id
  loop
    if v_piece.fabric_slot in ('ninguna', 'cualquiera', 'principal') then
      continue;
    end if;

    v_slot_index := substring(v_piece.fabric_slot from '^secundaria_([1-9][0-9]*)
  p_product_model_id uuid,
  p_component_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secondary_slots integer;
  v_piece record;
  v_slot_index integer;
begin
  select mm.secondary_color_slots
    into v_secondary_slots
  from public.configured_product_models pm
  join public.manufacturing_models mm on mm.id = pm.base_model_id
  where pm.id = p_product_model_id;

  if not found then
    raise exception 'El modelo comercial o su patrón base no existe.';
  end if;

  for v_piece in
    select id, name, color_slot
    from public.component_pattern_pieces
    where component_id = p_component_id
  loop
    if v_piece.color_slot in ('ninguna', 'cualquiera', 'principal') then
      continue;
    end if;

    v_slot_index := substring(v_piece.color_slot from '^secundaria_([1-9][0-9]*)$')::integer;
    if v_slot_index > coalesce(v_secondary_slots, 0) then
      raise exception
        'La pieza auxiliar "%" usa %, pero el patrón base del modelo no define esa posición de color.',
        v_piece.name, v_piece.color_slot;
    end if;
  end loop;
end;
$$;

create or replace function public.validate_configured_product_component_color_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_component_color_slots_fit_product(new.product_model_id, new.component_id);
  return new;
end;
$$;

drop trigger if exists configured_product_component_color_slot_guard
  on public.configured_product_components;
create trigger configured_product_component_color_slot_guard
before insert or update of product_model_id, component_id
on public.configured_product_components
for each row
execute function public.validate_configured_product_component_color_slots();

create or replace function public.validate_component_piece_color_slot_against_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  for v_product_id in
    select distinct product_model_id
    from public.configured_product_components
    where component_id = new.component_id
  loop
    perform public.assert_component_color_slots_fit_product(v_product_id, new.component_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists component_pattern_piece_color_slot_guard
  on public.component_pattern_pieces;
create trigger component_pattern_piece_color_slot_guard
after insert or update of component_id, color_slot
on public.component_pattern_pieces
for each row
execute function public.validate_component_piece_color_slot_against_products();

create or replace function public.validate_configured_product_base_pattern_color_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_component_id uuid;
begin
  for v_component_id in
    select component_id
    from public.configured_product_components
    where product_model_id = new.id
  loop
    perform public.assert_component_color_slots_fit_product(new.id, v_component_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists configured_product_base_pattern_color_slot_guard
  on public.configured_product_models;
create trigger configured_product_base_pattern_color_slot_guard
after update of base_model_id
on public.configured_product_models
for each row
execute function public.validate_configured_product_base_pattern_color_slots();

create or replace function public.validate_base_pattern_secondary_color_slot_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piece record;
  v_slot_index integer;
  v_product_id uuid;
  v_component_id uuid;
begin
  for v_piece in
    select id, name, color_slot
    from public.model_pieces
    where model_id = new.id
      and color_slot ~ '^secundaria_[1-9][0-9]*$'
  loop
    v_slot_index := substring(v_piece.color_slot from '^secundaria_([1-9][0-9]*)$')::integer;
    if v_slot_index > new.secondary_color_slots then
      raise exception 'El molde "%" usa %, pero el patrón solo define % colores secundarios.', v_piece.name, v_piece.color_slot, new.secondary_color_slots;
    end if;
  end loop;

  for v_product_id in
    select id from public.configured_product_models where base_model_id = new.id
  loop
    for v_component_id in
      select component_id from public.configured_product_components where product_model_id = v_product_id
    loop
      perform public.assert_component_color_slots_fit_product(v_product_id, v_component_id);
    end loop;
  end loop;
  return new;
end;
$$;

drop trigger if exists manufacturing_model_component_color_slot_guard
  on public.manufacturing_models;
create trigger manufacturing_model_component_color_slot_guard
after update of secondary_color_slots
on public.manufacturing_models
for each row
when (old.secondary_color_slots is distinct from new.secondary_color_slots)
execute function public.validate_base_pattern_secondary_color_slot_changes();

create or replace function public.validate_model_piece_color_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secondary_slots integer;
  v_slot_index integer;
begin
  select secondary_color_slots into v_secondary_slots
  from public.manufacturing_models where id = new.model_id;
  if not found then
    raise exception 'El patrón base no existe.';
  end if;
  if new.color_slot in ('ninguna', 'cualquiera', 'principal') then
    return new;
  end if;
  v_slot_index := substring(new.color_slot from '^secundaria_([1-9][0-9]*)$')::integer;
  if v_slot_index > coalesce(v_secondary_slots, 0) then
    raise exception 'El molde usa %, pero el patrón base no define esa posición de color.', new.color_slot;
  end if;
  return new;
end;
$$;

drop trigger if exists model_piece_color_slot_guard on public.model_pieces;
create trigger model_piece_color_slot_guard
before insert or update of model_id, color_slot
on public.model_pieces
for each row
execute function public.validate_model_piece_color_slot();

alter table public.configured_product_colors enable row level security;

comment on column public.manufacturing_models.secondary_color_slots is
  'Cantidad de posiciones de color secundario definidas en el patrón base.';
comment on column public.model_pieces.color_slot is
  'Referencia de color genérica del molde: ninguna, cualquiera, principal o secundaria_N. El modelo comercial resuelve el color real.';
comment on column public.component_pattern_pieces.color_slot is
  'Referencia de color genérica de la pieza del componente; el modelo comercial asigna el color concreto.';
comment on table public.configured_product_colors is
  'Color concreto seleccionado por un modelo comercial para cada posición de color de su patrón base.';
)::integer;
    if v_slot_index > coalesce(v_secondary_slots, 0) then
      raise exception
        'La pieza auxiliar "%" usa %, pero el patrón base del modelo no define esa posición.',
        v_piece.name, v_piece.fabric_slot;
    end if;
  end loop;
end;
$;

create or replace function public.assert_component_color_slots_fit_product(
  p_product_model_id uuid,
  p_component_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secondary_slots integer;
  v_piece record;
  v_slot_index integer;
begin
  select mm.secondary_color_slots
    into v_secondary_slots
  from public.configured_product_models pm
  join public.manufacturing_models mm on mm.id = pm.base_model_id
  where pm.id = p_product_model_id;

  if not found then
    raise exception 'El modelo comercial o su patrón base no existe.';
  end if;

  for v_piece in
    select id, name, color_slot
    from public.component_pattern_pieces
    where component_id = p_component_id
  loop
    if v_piece.color_slot in ('ninguna', 'cualquiera', 'principal') then
      continue;
    end if;

    v_slot_index := substring(v_piece.color_slot from '^secundaria_([1-9][0-9]*)$')::integer;
    if v_slot_index > coalesce(v_secondary_slots, 0) then
      raise exception
        'La pieza auxiliar "%" usa %, pero el patrón base del modelo no define esa posición de color.',
        v_piece.name, v_piece.color_slot;
    end if;
  end loop;
end;
$$;

create or replace function public.validate_configured_product_component_color_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_component_color_slots_fit_product(new.product_model_id, new.component_id);
  return new;
end;
$$;

drop trigger if exists configured_product_component_color_slot_guard
  on public.configured_product_components;
create trigger configured_product_component_color_slot_guard
before insert or update of product_model_id, component_id
on public.configured_product_components
for each row
execute function public.validate_configured_product_component_color_slots();

create or replace function public.validate_component_piece_color_slot_against_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
begin
  for v_product_id in
    select distinct product_model_id
    from public.configured_product_components
    where component_id = new.component_id
  loop
    perform public.assert_component_color_slots_fit_product(v_product_id, new.component_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists component_pattern_piece_color_slot_guard
  on public.component_pattern_pieces;
create trigger component_pattern_piece_color_slot_guard
after insert or update of component_id, color_slot
on public.component_pattern_pieces
for each row
execute function public.validate_component_piece_color_slot_against_products();

create or replace function public.validate_configured_product_base_pattern_color_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_component_id uuid;
begin
  for v_component_id in
    select component_id
    from public.configured_product_components
    where product_model_id = new.id
  loop
    perform public.assert_component_color_slots_fit_product(new.id, v_component_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists configured_product_base_pattern_color_slot_guard
  on public.configured_product_models;
create trigger configured_product_base_pattern_color_slot_guard
after update of base_model_id
on public.configured_product_models
for each row
execute function public.validate_configured_product_base_pattern_color_slots();

create or replace function public.validate_base_pattern_secondary_color_slot_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_piece record;
  v_slot_index integer;
  v_product_id uuid;
  v_component_id uuid;
begin
  for v_piece in
    select id, name, color_slot
    from public.model_pieces
    where model_id = new.id
      and color_slot ~ '^secundaria_[1-9][0-9]*$'
  loop
    v_slot_index := substring(v_piece.color_slot from '^secundaria_([1-9][0-9]*)$')::integer;
    if v_slot_index > new.secondary_color_slots then
      raise exception 'El molde "%" usa %, pero el patrón solo define % colores secundarios.', v_piece.name, v_piece.color_slot, new.secondary_color_slots;
    end if;
  end loop;

  for v_product_id in
    select id from public.configured_product_models where base_model_id = new.id
  loop
    for v_component_id in
      select component_id from public.configured_product_components where product_model_id = v_product_id
    loop
      perform public.assert_component_color_slots_fit_product(v_product_id, v_component_id);
    end loop;
  end loop;
  return new;
end;
$$;

drop trigger if exists manufacturing_model_component_color_slot_guard
  on public.manufacturing_models;
create trigger manufacturing_model_component_color_slot_guard
after update of secondary_color_slots
on public.manufacturing_models
for each row
when (old.secondary_color_slots is distinct from new.secondary_color_slots)
execute function public.validate_base_pattern_secondary_color_slot_changes();

create or replace function public.validate_model_piece_color_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secondary_slots integer;
  v_slot_index integer;
begin
  select secondary_color_slots into v_secondary_slots
  from public.manufacturing_models where id = new.model_id;
  if not found then
    raise exception 'El patrón base no existe.';
  end if;
  if new.color_slot in ('ninguna', 'cualquiera', 'principal') then
    return new;
  end if;
  v_slot_index := substring(new.color_slot from '^secundaria_([1-9][0-9]*)$')::integer;
  if v_slot_index > coalesce(v_secondary_slots, 0) then
    raise exception 'El molde usa %, pero el patrón base no define esa posición de color.', new.color_slot;
  end if;
  return new;
end;
$$;

drop trigger if exists model_piece_color_slot_guard on public.model_pieces;
create trigger model_piece_color_slot_guard
before insert or update of model_id, color_slot
on public.model_pieces
for each row
execute function public.validate_model_piece_color_slot();

alter table public.configured_product_colors enable row level security;

comment on column public.manufacturing_models.secondary_color_slots is
  'Cantidad de posiciones de color secundario definidas en el patrón base.';
comment on column public.model_pieces.color_slot is
  'Referencia de color genérica del molde: ninguna, cualquiera, principal o secundaria_N. El modelo comercial resuelve el color real.';
comment on column public.component_pattern_pieces.color_slot is
  'Referencia de color genérica de la pieza del componente; el modelo comercial asigna el color concreto.';
comment on table public.configured_product_colors is
  'Color concreto seleccionado por un modelo comercial para cada posición de color de su patrón base.';
