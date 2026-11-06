-- Auxiliary pattern-piece inventory belongs to a configured commercial product,
-- not to a reusable component definition.
--
-- Historical movements are backfilled from their source production order when
-- available. Otherwise they are assigned only if the component is referenced
-- by exactly one configured product model. Ambiguous historical balances stay
-- unassigned (NULL) rather than being duplicated across products.

alter table public.component_piece_stock_movements
  add column if not exists product_model_id uuid null;

alter table public.production_order_component_piece_requirements
  add column if not exists product_model_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.component_piece_stock_movements'::regclass
      and conname = 'component_piece_stock_movements_product_model_id_fkey'
  ) then
    alter table public.component_piece_stock_movements
      add constraint component_piece_stock_movements_product_model_id_fkey
      foreign key (product_model_id)
      references public.configured_product_models(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.production_order_component_piece_requirements'::regclass
      and conname = 'production_order_component_piece_requirements_product_model_id_fkey'
  ) then
    alter table public.production_order_component_piece_requirements
      add constraint production_order_component_piece_requirements_product_model_id_fkey
      foreign key (product_model_id)
      references public.configured_product_models(id)
      on delete restrict;
  end if;
end
$$;

-- Order-originated movements already identify the correct configured product.
update public.component_piece_stock_movements as movement
set product_model_id = production_order.product_model_id
from public.production_orders as production_order
where movement.source_production_order_id = production_order.id
  and movement.product_model_id is null;

-- A component-only movement can be assigned safely only when one product model
-- references that component. When it is shared, leave it unassigned for review.
with single_product_component as (
  select component_id, (array_agg(product_model_id order by product_model_id))[1] as product_model_id
  from public.configured_product_components
  group by component_id
  having count(distinct product_model_id) = 1
)
update public.component_piece_stock_movements as movement
set product_model_id = single_product_component.product_model_id
from single_product_component
where movement.component_id = single_product_component.component_id
  and movement.product_model_id is null;

-- Every production order has one configured product model, so its requirements
-- can be assigned without ambiguity.
update public.production_order_component_piece_requirements as requirement
set product_model_id = production_order.product_model_id
from public.production_orders as production_order
where requirement.production_order_id = production_order.id
  and requirement.product_model_id is null;

alter table public.production_order_component_piece_requirements
  alter column product_model_id set not null;

create index if not exists component_piece_movements_product_piece_size_idx
  on public.component_piece_stock_movements(product_model_id, component_piece_id, size_id, side, created_at desc);

create index if not exists production_order_component_piece_product_reservation_idx
  on public.production_order_component_piece_requirements(product_model_id, component_piece_id, size_id, side, production_order_id);

-- A new manual or production movement must always be scoped to a configured
-- product that actually selects this reusable component.
create or replace function public.validate_component_piece_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_laterality text;
  v_owner_id uuid;
  v_product_active boolean;
  v_order_product_id uuid;
  v_order_status text;
  v_balance numeric(18,5);
  v_lock_key bigint;
begin
  if new.product_model_id is null then
    raise exception 'Selecciona el modelo de prenda al que pertenece el inventario auxiliar.';
  end if;

  select p.laterality, p.component_id
    into v_laterality, v_owner_id
  from public.component_pattern_pieces p
  where p.id = new.component_piece_id;

  if v_laterality is null then
    raise exception 'La pieza auxiliar no existe.';
  end if;
  if v_owner_id is distinct from new.component_id then
    raise exception 'La pieza no pertenece al componente indicado.';
  end if;

  if new.source_production_order_id is not null then
    select product_model_id, status
      into v_order_product_id, v_order_status
    from public.production_orders
    where id = new.source_production_order_id;

    if v_order_product_id is distinct from new.product_model_id then
      raise exception 'El movimiento no pertenece al modelo de prenda de la orden.';
    end if;
  end if;

  select is_active into v_product_active
  from public.configured_product_models
  where id = new.product_model_id;

  -- An archived model cannot receive manual movements, but a production order
  -- already in progress may still need to post its confirmed consumption.
  if coalesce(v_product_active, false) is not true
     and (new.source_production_order_id is null or v_order_status <> 'en_proceso') then
    raise exception 'El modelo de prenda está archivado y no admite movimientos manuales.';
  end if;

  if not exists (
    select 1
    from public.configured_product_components selected
    where selected.product_model_id = new.product_model_id
      and selected.component_id = new.component_id
  ) then
    raise exception 'El componente no forma parte del modelo de prenda seleccionado.';
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
    new.product_model_id::text || ':' || new.component_piece_id::text || ':' ||
    new.size_id::text || ':' || coalesce(new.side, 'unico'), 0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  if v_laterality = 'simetrica' then
    select floor(greatest(coalesce(sum(m.delta_quantity) filter (where m.side is null), 0), 0)::numeric / 2)
           + coalesce(sum(m.delta_quantity) filter (where m.side = new.side), 0)
      into v_balance
    from public.component_piece_stock_movements m
    where m.product_model_id = new.product_model_id
      and m.component_piece_id = new.component_piece_id
      and m.size_id = new.size_id;
  else
    select coalesce(sum(m.delta_quantity), 0)
      into v_balance
    from public.component_piece_stock_movements m
    where m.product_model_id = new.product_model_id
      and m.component_piece_id = new.component_piece_id
      and m.size_id = new.size_id;
  end if;

  if v_balance + new.delta_quantity < 0 then
    raise exception 'Stock insuficiente en el inventario auxiliar de este modelo de prenda.';
  end if;

  return new;
end;
$$;

-- Production requirements must use the same product model as the order and
-- only reference components selected by that model. The existing base-piece
-- validation and inherited size-group check are retained.
create or replace function public.validate_production_order_requirement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_base_model uuid;
  v_order_product_model uuid;
  v_piece_model uuid;
  v_piece_laterality text;
  v_piece_component uuid;
  v_base_group uuid;
  v_size_group uuid;
begin
  select base_model_id, product_model_id
    into v_order_base_model, v_order_product_model
  from public.production_orders
  where id = new.production_order_id;

  if v_order_base_model is null then
    raise exception 'La orden de producción no existe.';
  end if;

  select size_group_id into v_base_group
  from public.manufacturing_models where id = v_order_base_model;

  select size_group_id into v_size_group
  from public.sizes where id = new.size_id;

  if v_base_group is distinct from v_size_group then
    raise exception 'La talla no pertenece al grupo del patrón base de la orden.';
  end if;

  if tg_table_name = 'production_order_base_piece_requirements' then
    select model_id, laterality
      into v_piece_model, v_piece_laterality
    from public.model_pieces where id = new.model_piece_id;

    if v_piece_model is distinct from v_order_base_model then
      raise exception 'El molde base no pertenece al patrón de la orden.';
    end if;

  elsif tg_table_name = 'production_order_component_piece_requirements' then
    if new.product_model_id is distinct from v_order_product_model then
      raise exception 'La reserva auxiliar debe pertenecer al modelo comercial de la orden.';
    end if;

    select component_id, laterality
      into v_piece_component, v_piece_laterality
    from public.component_pattern_pieces
    where id = new.component_piece_id;

    if v_piece_component is distinct from new.component_id then
      raise exception 'La pieza auxiliar no pertenece al componente indicado.';
    end if;

    if not exists (
      select 1
      from public.configured_product_components selected
      where selected.product_model_id = new.product_model_id
        and selected.component_id = new.component_id
    ) then
      raise exception 'El modelo comercial no selecciona el componente de esta pieza auxiliar.';
    end if;
  end if;

  if v_piece_laterality = 'simetrica' and new.side is null then
    raise exception 'Las piezas simétricas deben reservarse por lado.';
  elsif v_piece_laterality <> 'simetrica' and new.side is not null then
    raise exception 'Solo las piezas simétricas admiten reserva por lado.';
  end if;

  return new;
end;
$$;

-- The per-model stock ledger and reservation ledger use the exact same scope:
-- product model + component piece + size + side.
create or replace function public.validate_component_piece_stock_with_reservations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_laterality text;
  v_balance numeric(18,5);
  v_reserved numeric(18,5);
  v_lock_key bigint;
  v_order_status text;
begin
  if new.delta_quantity >= 0 then return new; end if;

  if new.product_model_id is null then
    raise exception 'La salida auxiliar requiere un modelo de prenda.';
  end if;

  if new.source_production_order_id is not null then
    select status into v_order_status
    from public.production_orders
    where id = new.source_production_order_id;

    if v_order_status <> 'en_proceso' then
      raise exception 'El consumo de una orden solo se admite cuando está en proceso.';
    end if;
  end if;

  select laterality into v_laterality
  from public.component_pattern_pieces
  where id = new.component_piece_id;

  v_lock_key := hashtextextended(
    new.product_model_id::text || ':' || new.component_piece_id::text || ':' ||
    new.size_id::text || ':' || coalesce(new.side, ''), 0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  if v_laterality = 'simetrica' then
    if new.side is null then
      raise exception 'La salida de una pieza auxiliar simétrica debe indicar el lado.';
    end if;

    select floor(greatest(coalesce(sum(delta_quantity) filter (where side is null), 0), 0)::numeric / 2)
           + coalesce(sum(delta_quantity) filter (where side = new.side), 0)
      into v_balance
    from public.component_piece_stock_movements
    where product_model_id = new.product_model_id
      and component_piece_id = new.component_piece_id
      and size_id = new.size_id;
  else
    select coalesce(sum(delta_quantity), 0)
      into v_balance
    from public.component_piece_stock_movements
    where product_model_id = new.product_model_id
      and component_piece_id = new.component_piece_id
      and size_id = new.size_id;
  end if;

  select coalesce(sum(requirement.required_quantity), 0)
    into v_reserved
  from public.production_order_component_piece_requirements requirement
  join public.production_orders production_order
    on production_order.id = requirement.production_order_id
  where requirement.product_model_id = new.product_model_id
    and requirement.component_piece_id = new.component_piece_id
    and requirement.size_id = new.size_id
    and requirement.side is not distinct from new.side
    and production_order.status in ('reservada', 'en_proceso')
    and production_order.id is distinct from new.source_production_order_id;

  if v_balance + new.delta_quantity < v_reserved then
    raise exception 'La salida invadiría piezas auxiliares reservadas por otra orden del mismo modelo.';
  end if;

  return new;
end;
$$;

-- A reservation is checked per configured product model, never by component
-- alone. Base pattern piece reservations remain shared by their base pattern.
create or replace function public.validate_production_order_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_balance numeric(18,5);
  v_reserved numeric(18,5);
  v_laterality text;
  v_side_balance numeric(18,5);
  v_roll_quantity numeric(14,5);
begin
  if old.status <> 'borrador' or new.status <> 'reservada' then return new; end if;

  for r in
    select material.variant_id, material.size_id,
           sum(material.required_quantity) as required_quantity,
           variant.textile_id
    from public.production_order_materials material
    join public.supply_variants variant on variant.id = material.variant_id
    where material.production_order_id = new.id
    group by material.variant_id, material.size_id, variant.textile_id
  loop
    if r.textile_id is not null then
      select coalesce(sum(reserved_quantity), 0)
        into v_reserved
      from public.production_order_roll_allocations
      where production_order_id = new.id and variant_id = r.variant_id;

      if abs(v_reserved - r.required_quantity) > 0.0001 then
        raise exception 'La asignación de rollos no coincide con el consumo de tela para la variante %.', r.variant_id;
      end if;
      continue;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(r.variant_id::text || ':' || coalesce(r.size_id::text, 'total'), 0)
    );

    select coalesce(sum(m.delta_quantity), 0)
      into v_balance
    from public.supply_stock_movements m
    where m.variant_id = r.variant_id
      and m.size_id is not distinct from r.size_id;

    select coalesce(sum(other.required_quantity), 0)
      into v_reserved
    from public.production_order_materials other
    join public.production_orders order_row on order_row.id = other.production_order_id
    where other.variant_id = r.variant_id
      and other.size_id is not distinct from r.size_id
      and order_row.status in ('reservada', 'en_proceso')
      and order_row.id <> new.id;

    if v_balance - v_reserved + 0.00001 < r.required_quantity then
      raise exception 'Stock insuficiente para reservar el material %. Faltan % unidades.',
        r.variant_id, r.required_quantity - greatest(0, v_balance - v_reserved);
    end if;
  end loop;

  for r in
    select model_piece_id, size_id, side,
           sum(required_quantity) as required_quantity
    from public.production_order_base_piece_requirements
    where production_order_id = new.id
    group by model_piece_id, size_id, side
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(r.model_piece_id::text || ':' || r.size_id::text || ':' || coalesce(r.side, ''), 0)
    );

    select laterality into v_laterality
    from public.model_pieces where id = r.model_piece_id;

    if v_laterality = 'simetrica' then
      select floor(greatest(coalesce(sum(delta_quantity) filter (where side is null), 0), 0)::numeric / 2)
             + coalesce(sum(delta_quantity) filter (where side = r.side), 0)
        into v_side_balance
      from public.piece_stock_movements
      where model_piece_id = r.model_piece_id and size_id = r.size_id;
    else
      select coalesce(sum(delta_quantity), 0)
        into v_side_balance
      from public.piece_stock_movements
      where model_piece_id = r.model_piece_id and size_id = r.size_id;
    end if;

    select coalesce(sum(other.required_quantity), 0)
      into v_reserved
    from public.production_order_base_piece_requirements other
    join public.production_orders order_row on order_row.id = other.production_order_id
    where other.model_piece_id = r.model_piece_id
      and other.size_id = r.size_id
      and other.side is not distinct from r.side
      and order_row.status in ('reservada', 'en_proceso')
      and order_row.id <> new.id;

    if v_side_balance - v_reserved < r.required_quantity then
      raise exception 'Stock insuficiente para reservar la pieza de molde % talla % lado %.',
        r.model_piece_id, r.size_id, r.side;
    end if;
  end loop;

  for r in
    select product_model_id, component_piece_id, size_id, side,
           sum(required_quantity) as required_quantity
    from public.production_order_component_piece_requirements
    where production_order_id = new.id
    group by product_model_id, component_piece_id, size_id, side
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        r.product_model_id::text || ':' || r.component_piece_id::text || ':' ||
        r.size_id::text || ':' || coalesce(r.side, ''), 0
      )
    );

    select laterality into v_laterality
    from public.component_pattern_pieces
    where id = r.component_piece_id;

    if v_laterality = 'simetrica' then
      select floor(greatest(coalesce(sum(delta_quantity) filter (where side is null), 0), 0)::numeric / 2)
             + coalesce(sum(delta_quantity) filter (where side = r.side), 0)
        into v_side_balance
      from public.component_piece_stock_movements
      where product_model_id = r.product_model_id
        and component_piece_id = r.component_piece_id
        and size_id = r.size_id;
    else
      select coalesce(sum(delta_quantity), 0)
        into v_side_balance
      from public.component_piece_stock_movements
      where product_model_id = r.product_model_id
        and component_piece_id = r.component_piece_id
        and size_id = r.size_id;
    end if;

    select coalesce(sum(other.required_quantity), 0)
      into v_reserved
    from public.production_order_component_piece_requirements other
    join public.production_orders order_row on order_row.id = other.production_order_id
    where other.product_model_id = r.product_model_id
      and other.component_piece_id = r.component_piece_id
      and other.size_id = r.size_id
      and other.side is not distinct from r.side
      and order_row.status in ('reservada', 'en_proceso')
      and order_row.id <> new.id;

    if v_side_balance - v_reserved < r.required_quantity then
      raise exception 'Stock insuficiente para la pieza auxiliar % del modelo % talla % lado %.',
        r.component_piece_id, r.product_model_id, r.size_id, r.side;
    end if;
  end loop;

  for r in
    select roll_id, unit, sum(reserved_quantity) as required_quantity
    from public.production_order_roll_allocations
    where production_order_id = new.id
    group by roll_id, unit
  loop
    select case when r.unit = 'KG' then peso_kg else metros end
      into v_roll_quantity
    from public.rollos where id_rollo = r.roll_id;

    select coalesce(sum(other.reserved_quantity), 0)
      into v_reserved
    from public.production_order_roll_allocations other
    join public.production_orders order_row on order_row.id = other.production_order_id
    where other.roll_id = r.roll_id
      and other.unit = r.unit
      and order_row.status in ('reservada', 'en_proceso')
      and order_row.id <> new.id;

    if v_roll_quantity is null or v_roll_quantity - v_reserved + 0.00001 < r.required_quantity then
      raise exception 'La medición física del rollo % no alcanza para completar la reserva.', r.roll_id;
    end if;
  end loop;

  new.reserved_at := coalesce(new.reserved_at, now());
  return new;
end;
$$;

comment on column public.component_piece_stock_movements.product_model_id is
  'Modelo comercial que posee este saldo auxiliar. Null se conserva solo para movimientos históricos ambiguos.';

comment on column public.production_order_component_piece_requirements.product_model_id is
  'Modelo comercial cuyo inventario auxiliar reserva esta pieza y talla.';

comment on table public.component_piece_stock_movements is
  'Ledger de piezas auxiliares separado por modelo comercial, pieza, talla y lateralidad; el componente de biblioteca no posee inventario.';

comment on column public.component_pattern_pieces.color_id is
  'Color opcional de la definición de pieza; no determina ni comparte inventario.';

comment on column public.component_pattern_pieces.textile_id is
  'Tela opcional de la definición de pieza; el stock real de tela sigue en el inventario de rollos.';
