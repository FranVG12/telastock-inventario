-- Auxiliary pattern pieces reference a fabric position on the base pattern.
-- The commercial product owns the concrete textile assignment in configured_product_fabrics.
-- Legacy textile_id values are no longer used; existing fabric_slot defaults to principal.

alter table public.component_pattern_pieces
  drop constraint if exists component_pattern_pieces_textile_id_fkey;

drop index if exists public.component_pattern_pieces_textile_id_idx;

alter table public.component_pattern_pieces
  drop column if exists textile_id;

do $$
begin
  if exists (
    select 1
    from public.component_pattern_pieces
    where fabric_slot is null
       or not (
         fabric_slot in ('ninguna', 'principal')
         or fabric_slot ~ '^secundaria_[1-9][0-9]*$'
       )
  ) then
    raise exception 'Hay piezas auxiliares con una posición de tela inválida. Corrige esos registros antes de continuar.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.component_pattern_pieces'::regclass
      and conname = 'component_pattern_pieces_fabric_slot_check'
  ) then
    alter table public.component_pattern_pieces
      add constraint component_pattern_pieces_fabric_slot_check
      check (
        fabric_slot in ('ninguna', 'principal')
        or fabric_slot ~ '^secundaria_[1-9][0-9]*$'
      );
  end if;
end
$$;

create or replace function public.assert_component_fabric_slots_fit_product(
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
    if v_piece.fabric_slot in ('ninguna', 'principal') then
      continue;
    end if;

    v_slot_index := substring(v_piece.fabric_slot from '^secundaria_([1-9][0-9]*)$')::integer;
    if v_slot_index > coalesce(v_secondary_slots, 0) then
      raise exception
        'La pieza auxiliar "%" usa %, pero el patrón base del modelo no define esa posición.',
        v_piece.name, v_piece.fabric_slot;
    end if;
  end loop;
end;
$$;

create or replace function public.validate_configured_product_component_fabric_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_component_fabric_slots_fit_product(new.product_model_id, new.component_id);
  return new;
end;
$$;

drop trigger if exists configured_product_component_fabric_slot_guard
  on public.configured_product_components;

create trigger configured_product_component_fabric_slot_guard
before insert or update of product_model_id, component_id
on public.configured_product_components
for each row
execute function public.validate_configured_product_component_fabric_slots();

create or replace function public.validate_component_piece_fabric_slot_against_products()
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
    perform public.assert_component_fabric_slots_fit_product(v_product_id, new.component_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists component_pattern_piece_fabric_slot_guard
  on public.component_pattern_pieces;

create trigger component_pattern_piece_fabric_slot_guard
after insert or update of component_id, fabric_slot
on public.component_pattern_pieces
for each row
execute function public.validate_component_piece_fabric_slot_against_products();

create or replace function public.validate_configured_product_base_pattern_fabric_slots()
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
    perform public.assert_component_fabric_slots_fit_product(new.id, v_component_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists configured_product_base_pattern_fabric_slot_guard
  on public.configured_product_models;

create trigger configured_product_base_pattern_fabric_slot_guard
after update of base_model_id
on public.configured_product_models
for each row
execute function public.validate_configured_product_base_pattern_fabric_slots();

create or replace function public.validate_base_pattern_secondary_fabric_slot_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_component_id uuid;
begin
  for v_product_id in
    select id
    from public.configured_product_models
    where base_model_id = new.id
  loop
    for v_component_id in
      select component_id
      from public.configured_product_components
      where product_model_id = v_product_id
    loop
      perform public.assert_component_fabric_slots_fit_product(v_product_id, v_component_id);
    end loop;
  end loop;
  return new;
end;
$$;

drop trigger if exists manufacturing_model_component_fabric_slot_guard
  on public.manufacturing_models;

create trigger manufacturing_model_component_fabric_slot_guard
after update of secondary_fabric_slots
on public.manufacturing_models
for each row
when (old.secondary_fabric_slots is distinct from new.secondary_fabric_slots)
execute function public.validate_base_pattern_secondary_fabric_slot_changes();

comment on column public.component_pattern_pieces.fabric_slot is
  'Posición de tela que consume la pieza auxiliar: ninguna, principal o secundaria_N. La tela concreta se resuelve desde configured_product_fabrics para cada modelo comercial.';
