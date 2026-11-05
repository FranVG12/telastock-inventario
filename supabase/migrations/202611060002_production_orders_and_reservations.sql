-- TelaStock: production orders, stock reservations and auditable consumption.
-- Additive only. It does not execute itself or enable a remote client connection.

create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  product_model_id uuid not null references public.configured_product_models(id) on delete restrict,
  product_name_snapshot text not null,
  base_model_id uuid not null references public.manufacturing_models(id) on delete restrict,
  status text not null default 'borrador'
    check (status in ('borrador','reservada','en_proceso','completada','cancelada')),
  estimated_material_cost numeric(14,2) null check (estimated_material_cost is null or estimated_material_cost >= 0),
  missing_cost_lines integer not null default 0 check (missing_cost_lines >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reserved_at timestamptz null,
  started_at timestamptz null,
  completed_at timestamptz null,
  cancelled_at timestamptz null
);
create index if not exists production_orders_status_date_idx
  on public.production_orders(status, created_at desc);

create table if not exists public.production_order_sizes (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete restrict,
  size_id uuid not null references public.sizes(id) on delete restrict,
  garment_quantity integer not null check (garment_quantity > 0),
  unique (production_order_id, size_id)
);
create index if not exists production_order_sizes_size_idx
  on public.production_order_sizes(size_id, production_order_id);

create table if not exists public.production_order_materials (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete restrict,
  variant_id uuid not null references public.supply_variants(id) on delete restrict,
  size_id uuid null references public.sizes(id) on delete restrict,
  required_quantity numeric(14,5) not null check (required_quantity > 0),
  consumption_unit text not null check (consumption_unit in ('und','m','cm','g','kg','l','ml')),
  unit_cost_snapshot numeric(14,5) null check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  line_cost_snapshot numeric(14,2) null check (line_cost_snapshot is null or line_cost_snapshot >= 0),
  created_at timestamptz not null default now()
);
create index if not exists production_order_materials_order_idx
  on public.production_order_materials(production_order_id);
create index if not exists production_order_materials_reservation_idx
  on public.production_order_materials(variant_id, size_id, production_order_id);

create table if not exists public.production_order_base_piece_requirements (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete restrict,
  model_piece_id uuid not null references public.model_pieces(id) on delete restrict,
  size_id uuid not null references public.sizes(id) on delete restrict,
  side text null check (side is null or side in ('izquierda','derecha')),
  required_quantity integer not null check (required_quantity > 0),
  created_at timestamptz not null default now(),
  unique (production_order_id, model_piece_id, size_id, side)
);
create index if not exists production_order_base_piece_reservation_idx
  on public.production_order_base_piece_requirements(model_piece_id, size_id, side, production_order_id);

create table if not exists public.production_order_component_piece_requirements (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete restrict,
  component_id uuid not null references public.garment_components(id) on delete restrict,
  component_piece_id uuid not null references public.component_pattern_pieces(id) on delete restrict,
  size_id uuid not null references public.sizes(id) on delete restrict,
  side text null check (side is null or side in ('izquierda','derecha')),
  required_quantity integer not null check (required_quantity > 0),
  created_at timestamptz not null default now(),
  unique (production_order_id, component_piece_id, size_id, side)
);
create index if not exists production_order_component_piece_reservation_idx
  on public.production_order_component_piece_requirements(component_piece_id, size_id, side, production_order_id);

create table if not exists public.production_order_roll_allocations (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders(id) on delete restrict,
  variant_id uuid not null references public.supply_variants(id) on delete restrict,
  roll_id uuid not null references public.rollos(id_rollo) on delete restrict,
  unit text not null check (unit in ('KG','M')),
  reserved_quantity numeric(14,5) not null check (reserved_quantity > 0),
  created_at timestamptz not null default now(),
  unique (production_order_id, variant_id, roll_id, unit)
);
create index if not exists production_order_roll_reservation_idx
  on public.production_order_roll_allocations(roll_id, unit, production_order_id);

-- Check that size, mold, component and textile identities match the saved requirements.
create or replace function public.validate_production_order_requirement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_order_model uuid;
  v_piece_model uuid;
  v_piece_laterality text;
  v_order_status text;
  v_piece_component uuid;
  v_base_group uuid;
  v_size_group uuid;
begin
  select base_model_id, status into v_order_model, v_order_status
  from public.production_orders where id = new.production_order_id;
  if v_order_model is null then raise exception 'La orden de producción no existe.'; end if;
  select size_group_id into v_base_group from public.manufacturing_models where id = v_order_model;
  select size_group_id into v_size_group from public.sizes where id = new.size_id;
  if v_base_group is distinct from v_size_group then
    raise exception 'La talla no pertenece al grupo del patrón base de la orden.';
  end if;

  if tg_table_name = 'production_order_base_piece_requirements' then
    select model_id, laterality into v_piece_model, v_piece_laterality
    from public.model_pieces where id = new.model_piece_id;
    if v_piece_model is distinct from v_order_model then
      raise exception 'El molde base no pertenece al patrón de la orden.';
    end if;
  elsif tg_table_name = 'production_order_component_piece_requirements' then
    select component_id, laterality into v_piece_component, v_piece_laterality
    from public.component_pattern_pieces where id = new.component_piece_id;
    if v_piece_component is distinct from new.component_id then
      raise exception 'La pieza auxiliar no pertenece al componente indicado.';
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

drop trigger if exists production_order_base_piece_guard on public.production_order_base_piece_requirements;
create trigger production_order_base_piece_guard
before insert or update on public.production_order_base_piece_requirements
for each row execute function public.validate_production_order_requirement();

drop trigger if exists production_order_component_piece_guard on public.production_order_component_piece_requirements;
create trigger production_order_component_piece_guard
before insert or update on public.production_order_component_piece_requirements
for each row execute function public.validate_production_order_requirement();

create or replace function public.validate_production_order_roll_allocation()
returns trigger language plpgsql security definer set search_path = public as $
declare
  v_textile_id uuid;
  v_variant_color uuid;
  v_supply_unit text;
  v_roll_textile uuid;
  v_roll_color uuid;
  v_status text;
  v_physical numeric(14,5);
  v_reserved numeric(14,5);
begin
  select v.textile_id, v.textile_color_id, s.base_unit
    into v_textile_id, v_variant_color, v_supply_unit
  from public.supply_variants v
  join public.supply_catalog s on s.id = v.supply_id
  where v.id = new.variant_id;
  select id_tela, id_tela_color,
         case when new.unit = 'KG' then peso_kg else metros end
    into v_roll_textile, v_roll_color, v_physical
  from public.rollos where id_rollo = new.roll_id;
  select status into v_status from public.production_orders where id = new.production_order_id;

  if v_textile_id is null or v_textile_id is distinct from v_roll_textile then
    raise exception 'El rollo no pertenece a la tela vinculada a la variante.';
  end if;
  if v_variant_color is not null and v_variant_color is distinct from v_roll_color then
    raise exception 'El color del rollo no coincide con la variante textil reservada.';
  end if;
  if (new.unit = 'M' and v_supply_unit <> 'm') or (new.unit = 'KG' and v_supply_unit <> 'kg') then
    raise exception 'La unidad reservada no coincide con la unidad base de la variante.';
  end if;
  if v_status not in ('borrador','reservada','en_proceso') then
    raise exception 'No se pueden asignar rollos a una orden cerrada.';
  end if;
  if v_physical is null then
    raise exception 'El rollo no tiene una medición real en %.', new.unit;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.roll_id::text || ':' || new.unit, 0));
  select coalesce(sum(a.reserved_quantity),0) into v_reserved
  from public.production_order_roll_allocations a
  join public.production_orders o on o.id = a.production_order_id
  where a.roll_id = new.roll_id and a.unit = new.unit
    and o.status in ('reservada','en_proceso')
    and not (a.production_order_id = new.production_order_id
             and a.variant_id = new.variant_id);
  if v_physical - v_reserved + 0.00001 < new.reserved_quantity then
    raise exception 'La asignación supera la medición real disponible del rollo después de reservas.';
  end if;
  return new;
end;
$;

drop trigger if exists production_order_roll_allocation_guard on public.production_order_roll_allocations;
create trigger production_order_roll_allocation_guard
before insert or update on public.production_order_roll_allocations
for each row execute function public.validate_production_order_roll_allocation();

-- A source identifier makes every order-originated exit traceable to one order.
alter table public.supply_stock_movements
  add column if not exists source_production_order_id uuid null
  references public.production_orders(id) on delete restrict;
alter table public.component_piece_stock_movements
  add column if not exists source_production_order_id uuid null
  references public.production_orders(id) on delete restrict;
alter table public.piece_stock_movements
  add column if not exists source_production_order_id uuid null
  references public.production_orders(id) on delete restrict;
alter table public.rollo_movimientos
  add column if not exists source_production_order_id uuid null
  references public.production_orders(id) on delete restrict;

create unique index if not exists supply_order_consumption_once_uidx
  on public.supply_stock_movements(source_production_order_id, variant_id, coalesce(size_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where source_production_order_id is not null;
create unique index if not exists component_piece_order_consumption_once_uidx
  on public.component_piece_stock_movements(source_production_order_id, component_piece_id, size_id, coalesce(side, ''));
create unique index if not exists base_piece_order_consumption_once_uidx
  on public.piece_stock_movements(source_production_order_id, model_piece_id, size_id, coalesce(side, ''))
  where source_production_order_id is not null;
create unique index if not exists roll_order_consumption_once_uidx
  on public.rollo_movimientos(source_production_order_id, id_rollo, unidad)
  where source_production_order_id is not null and tipo = 'consumo';

-- An order is a reservation while its state is reserved or in progress.
-- Generic/manual exits must leave the quantity held by all such orders untouched.
create or replace function public.validate_supply_stock_with_reservations()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric(18,5);
  v_reserved numeric(18,5);
  v_order_status text;
begin
  if new.delta_quantity >= 0 then return new; end if;
  if new.source_production_order_id is not null then
    select status into v_order_status from public.production_orders where id = new.source_production_order_id;
    if v_order_status <> 'en_proceso' then
      raise exception 'El consumo de una orden solo se admite cuando está en proceso.';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.variant_id::text || ':' || coalesce(new.size_id::text,'total'),0));
  select coalesce(sum(delta_quantity),0) into v_balance
  from public.supply_stock_movements
  where variant_id = new.variant_id and size_id is not distinct from new.size_id;
  select coalesce(sum(m.required_quantity),0) into v_reserved
  from public.production_order_materials m
  join public.production_orders o on o.id = m.production_order_id
  where m.variant_id = new.variant_id and m.size_id is not distinct from new.size_id
    and o.status in ('reservada','en_proceso')
    and o.id is distinct from new.source_production_order_id;
  if v_balance + new.delta_quantity < v_reserved then
    raise exception 'La salida invadiría stock reservado por otra orden de producción.';
  end if;
  return new;
end;
$$;

drop trigger if exists supply_stock_reservation_guard on public.supply_stock_movements;
create trigger supply_stock_reservation_guard
before insert on public.supply_stock_movements
for each row execute function public.validate_supply_stock_with_reservations();

create or replace function public.validate_piece_stock_with_reservations()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_laterality text;
  v_balance numeric(18,5);
  v_reserved numeric(18,5);
  v_lock_key bigint;
  v_order_status text;
begin
  if new.delta_quantity >= 0 then return new; end if;
  if new.source_production_order_id is not null then
    select status into v_order_status from public.production_orders where id = new.source_production_order_id;
    if v_order_status <> 'en_proceso' then raise exception 'El consumo de una orden solo se admite cuando está en proceso.'; end if;
  end if;
  select laterality into v_laterality from public.model_pieces where id = new.model_piece_id;
  v_lock_key := hashtextextended(new.model_piece_id::text || ':' || new.size_id::text || ':' || coalesce(new.side,''),0);
  perform pg_advisory_xact_lock(v_lock_key);
  if v_laterality = 'simetrica' then
    if new.side is null then raise exception 'La salida de una pieza simétrica debe indicar el lado.'; end if;
    select floor(greatest(coalesce(sum(delta_quantity) filter (where side is null),0),0)::numeric / 2)
      + coalesce(sum(delta_quantity) filter (where side = new.side),0)
      into v_balance
    from public.piece_stock_movements
    where model_piece_id = new.model_piece_id and size_id = new.size_id;
  else
    select coalesce(sum(delta_quantity),0) into v_balance
    from public.piece_stock_movements
    where model_piece_id = new.model_piece_id and size_id = new.size_id;
  end if;
  select coalesce(sum(r.required_quantity),0) into v_reserved
  from public.production_order_base_piece_requirements r
  join public.production_orders o on o.id = r.production_order_id
  where r.model_piece_id = new.model_piece_id and r.size_id = new.size_id
    and r.side is not distinct from new.side
    and o.status in ('reservada','en_proceso')
    and o.id is distinct from new.source_production_order_id;
  if v_balance + new.delta_quantity < v_reserved then
    raise exception 'La salida invadiría piezas de molde reservadas por otra orden.';
  end if;
  return new;
end;
$$;

drop trigger if exists base_piece_stock_reservation_guard on public.piece_stock_movements;
create trigger base_piece_stock_reservation_guard
before insert on public.piece_stock_movements
for each row execute function public.validate_piece_stock_with_reservations();

create or replace function public.validate_component_piece_stock_with_reservations()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_laterality text;
  v_balance numeric(18,5);
  v_reserved numeric(18,5);
  v_lock_key bigint;
  v_order_status text;
begin
  if new.delta_quantity >= 0 then return new; end if;
  if new.source_production_order_id is not null then
    select status into v_order_status from public.production_orders where id = new.source_production_order_id;
    if v_order_status <> 'en_proceso' then raise exception 'El consumo de una orden solo se admite cuando está en proceso.'; end if;
  end if;
  select laterality into v_laterality from public.component_pattern_pieces where id = new.component_piece_id;
  v_lock_key := hashtextextended(new.component_piece_id::text || ':' || new.size_id::text || ':' || coalesce(new.side,''),0);
  perform pg_advisory_xact_lock(v_lock_key);
  if v_laterality = 'simetrica' then
    if new.side is null then raise exception 'La salida de una pieza auxiliar simétrica debe indicar el lado.'; end if;
    select floor(greatest(coalesce(sum(delta_quantity) filter (where side is null),0),0)::numeric / 2)
      + coalesce(sum(delta_quantity) filter (where side = new.side),0)
      into v_balance
    from public.component_piece_stock_movements
    where component_piece_id = new.component_piece_id and size_id = new.size_id;
  else
    select coalesce(sum(delta_quantity),0) into v_balance
    from public.component_piece_stock_movements
    where component_piece_id = new.component_piece_id and size_id = new.size_id;
  end if;
  select coalesce(sum(r.required_quantity),0) into v_reserved
  from public.production_order_component_piece_requirements r
  join public.production_orders o on o.id = r.production_order_id
  where r.component_piece_id = new.component_piece_id and r.size_id = new.size_id
    and r.side is not distinct from new.side
    and o.status in ('reservada','en_proceso')
    and o.id is distinct from new.source_production_order_id;
  if v_balance + new.delta_quantity < v_reserved then
    raise exception 'La salida invadiría piezas auxiliares reservadas por otra orden.';
  end if;
  return new;
end;
$$;

drop trigger if exists component_piece_stock_reservation_guard on public.component_piece_stock_movements;
create trigger component_piece_stock_reservation_guard
before insert on public.component_piece_stock_movements
for each row execute function public.validate_component_piece_stock_with_reservations();

create or replace function public.validate_roll_stock_with_reservations()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_balance numeric(14,5);
  v_reserved numeric(14,5);
  v_order_status text;
begin
  if new.tipo <> 'consumo' or new.delta >= 0 then return new; end if;
  if new.source_production_order_id is not null then
    select status into v_order_status from public.production_orders where id = new.source_production_order_id;
    if v_order_status <> 'en_proceso' then raise exception 'El consumo de un rollo requiere una orden en proceso.'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.id_rollo::text || ':' || new.unidad,0));
  select case when new.unidad = 'KG' then peso_kg else metros end into v_balance
  from public.rollos where id_rollo = new.id_rollo;
  if v_balance is null then raise exception 'No existe una medición real del rollo en %.', new.unidad; end if;
  select coalesce(sum(a.reserved_quantity),0) into v_reserved
  from public.production_order_roll_allocations a
  join public.production_orders o on o.id = a.production_order_id
  where a.roll_id = new.id_rollo and a.unit = new.unidad
    and o.status in ('reservada','en_proceso')
    and o.id is distinct from new.source_production_order_id;
  if v_balance + new.delta < v_reserved then
    raise exception 'El consumo invadiría cantidad real reservada del rollo.';
  end if;
  return new;
end;
$$;

drop trigger if exists roll_stock_reservation_guard on public.rollo_movimientos;
create trigger roll_stock_reservation_guard
before insert on public.rollo_movimientos
for each row execute function public.validate_roll_stock_with_reservations();

-- Restrict the lifecycle and preserve a single direction of travel.
create or replace function public.validate_production_order_transition()
returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if old.status = 'borrador' and new.status = 'reservada' then
    new.reserved_at := coalesce(new.reserved_at, now());
  elsif old.status = 'reservada' and new.status = 'en_proceso' then
    new.started_at := coalesce(new.started_at, now());
  elsif old.status = 'en_proceso' and new.status = 'completada' then
    new.completed_at := coalesce(new.completed_at, now());
  elsif old.status in ('reservada','en_proceso') and new.status = 'cancelada' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  else
    raise exception 'Transición de estado de orden no permitida: % -> %.', old.status, new.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists production_order_transition_guard on public.production_orders;
create trigger production_order_transition_guard
before update of status on public.production_orders
for each row execute function public.validate_production_order_transition();

-- The new order tables remain protected by RLS until authentication and policies
-- are intentionally configured for the deployed application.
alter table public.production_orders enable row level security;
alter table public.production_order_sizes enable row level security;
alter table public.production_order_materials enable row level security;
alter table public.production_order_base_piece_requirements enable row level security;
alter table public.production_order_component_piece_requirements enable row level security;
alter table public.production_order_roll_allocations enable row level security;

comment on table public.production_orders is
  'Orden de producción con foto de modelo, cantidades por talla, estado y costos estimados.';
comment on table public.production_order_materials is
  'Snapshot de consumos por variante, unidad, talla y último precio conocido; activo como reserva mientras la orden está reservada/en proceso.';
comment on table public.production_order_roll_allocations is
  'Asignación física FIFO de cantidades medidas de rollos a una orden; no hace conversiones KG/M.';
comment on column public.supply_stock_movements.source_production_order_id is
  'Orden que originó la salida de avío.';
comment on column public.component_piece_stock_movements.source_production_order_id is
  'Orden que originó la salida de piezas auxiliares.';
comment on column public.piece_stock_movements.source_production_order_id is
  'Orden que originó la salida de piezas del patrón base.';
comment on column public.rollo_movimientos.source_production_order_id is
  'Orden que originó el consumo real de tela de un rollo.';


-- Enforce the reservation check at the moment an order changes from draft to reserved.
-- Advisory locks serialize concurrent reservations for each inventory key.
create or replace function public.validate_production_order_reservation()
returns trigger language plpgsql security definer set search_path = public as $$
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
    select material.variant_id, material.size_id, sum(material.required_quantity) as required_quantity,
           variant.textile_id
    from public.production_order_materials material
    join public.supply_variants variant on variant.id = material.variant_id
    where material.production_order_id = new.id
    group by material.variant_id, material.size_id, variant.textile_id
  loop
    if r.textile_id is not null then
      select coalesce(sum(reserved_quantity),0) into v_reserved
      from public.production_order_roll_allocations
      where production_order_id = new.id and variant_id = r.variant_id;
      if abs(v_reserved - r.required_quantity) > 0.0001 then
        raise exception 'La asignación de rollos no coincide con el consumo de tela para la variante %.', r.variant_id;
      end if;
      continue;
    end if;
    perform pg_advisory_xact_lock(hashtextextended(r.variant_id::text || ':' || coalesce(r.size_id::text,'total'),0));
    select coalesce(sum(m.delta_quantity),0) into v_balance
    from public.supply_stock_movements m
    where m.variant_id = r.variant_id and m.size_id is not distinct from r.size_id;
    select coalesce(sum(other.required_quantity),0) into v_reserved
    from public.production_order_materials other
    join public.production_orders o on o.id = other.production_order_id
    where other.variant_id = r.variant_id and other.size_id is not distinct from r.size_id
      and o.status in ('reservada','en_proceso') and o.id <> new.id;
    if v_balance - v_reserved + 0.00001 < r.required_quantity then
      raise exception 'Stock insuficiente para reservar el material %. Faltan % unidades.',
        r.variant_id, r.required_quantity - greatest(0, v_balance - v_reserved);
    end if;
  end loop;

  for r in
    select model_piece_id, size_id, side, sum(required_quantity) as required_quantity
    from public.production_order_base_piece_requirements
    where production_order_id = new.id
    group by model_piece_id, size_id, side
  loop
    perform pg_advisory_xact_lock(hashtextextended(r.model_piece_id::text || ':' || r.size_id::text || ':' || coalesce(r.side,''),0));
    select laterality into v_laterality from public.model_pieces where id = r.model_piece_id;
    if v_laterality = 'simetrica' then
      select floor(greatest(coalesce(sum(delta_quantity) filter (where side is null),0),0)::numeric / 2)
        + coalesce(sum(delta_quantity) filter (where side = r.side),0)
        into v_side_balance
      from public.piece_stock_movements
      where model_piece_id = r.model_piece_id and size_id = r.size_id;
    else
      select coalesce(sum(delta_quantity),0) into v_side_balance
      from public.piece_stock_movements
      where model_piece_id = r.model_piece_id and size_id = r.size_id;
    end if;
    select coalesce(sum(other.required_quantity),0) into v_reserved
    from public.production_order_base_piece_requirements other
    join public.production_orders o on o.id = other.production_order_id
    where other.model_piece_id = r.model_piece_id and other.size_id = r.size_id
      and other.side is not distinct from r.side and o.status in ('reservada','en_proceso') and o.id <> new.id;
    if v_side_balance - v_reserved < r.required_quantity then
      raise exception 'Stock insuficiente para reservar la pieza de molde % talla % lado %.',
        r.model_piece_id, r.size_id, r.side;
    end if;
  end loop;

  for r in
    select component_piece_id, size_id, side, sum(required_quantity) as required_quantity
    from public.production_order_component_piece_requirements
    where production_order_id = new.id
    group by component_piece_id, size_id, side
  loop
    perform pg_advisory_xact_lock(hashtextextended(r.component_piece_id::text || ':' || r.size_id::text || ':' || coalesce(r.side,''),0));
    select laterality into v_laterality from public.component_pattern_pieces where id = r.component_piece_id;
    if v_laterality = 'simetrica' then
      select floor(greatest(coalesce(sum(delta_quantity) filter (where side is null),0),0)::numeric / 2)
        + coalesce(sum(delta_quantity) filter (where side = r.side),0)
        into v_side_balance
      from public.component_piece_stock_movements
      where component_piece_id = r.component_piece_id and size_id = r.size_id;
    else
      select coalesce(sum(delta_quantity),0) into v_side_balance
      from public.component_piece_stock_movements
      where component_piece_id = r.component_piece_id and size_id = r.size_id;
    end if;
    select coalesce(sum(other.required_quantity),0) into v_reserved
    from public.production_order_component_piece_requirements other
    join public.production_orders o on o.id = other.production_order_id
    where other.component_piece_id = r.component_piece_id and other.size_id = r.size_id
      and other.side is not distinct from r.side and o.status in ('reservada','en_proceso') and o.id <> new.id;
    if v_side_balance - v_reserved < r.required_quantity then
      raise exception 'Stock insuficiente para reservar la pieza auxiliar % talla % lado %.',
        r.component_piece_id, r.size_id, r.side;
    end if;
  end loop;

  for r in
    select variant_id, roll_id, unit, sum(reserved_quantity) as required_quantity
    from public.production_order_roll_allocations
    where production_order_id = new.id
    group by variant_id, roll_id, unit
  loop
    select case when r.unit = 'KG' then peso_kg else metros end
      into v_roll_quantity from public.rollos where id_rollo = r.roll_id;
    select coalesce(sum(other.reserved_quantity),0) into v_reserved
    from public.production_order_roll_allocations other
    join public.production_orders o on o.id = other.production_order_id
    where other.roll_id = r.roll_id and other.unit = r.unit
      and o.status in ('reservada','en_proceso') and o.id <> new.id;
    if v_roll_quantity is null or v_roll_quantity - v_reserved + 0.00001 < r.required_quantity then
      raise exception 'La medición física del rollo % no alcanza para completar la reserva.', r.roll_id;
    end if;
  end loop;

  new.reserved_at := coalesce(new.reserved_at, now());
  return new;
end;
$$;

drop trigger if exists production_order_reservation_guard on public.production_orders;
create trigger production_order_reservation_guard
before update of status on public.production_orders
for each row execute function public.validate_production_order_reservation();

create unique index if not exists production_order_base_piece_requirement_uidx
  on public.production_order_base_piece_requirements(production_order_id, model_piece_id, size_id, coalesce(side,''));
create unique index if not exists production_order_component_piece_requirement_uidx
  on public.production_order_component_piece_requirements(production_order_id, component_piece_id, size_id, coalesce(side,''));
