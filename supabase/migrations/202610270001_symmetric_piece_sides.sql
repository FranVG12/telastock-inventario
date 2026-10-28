-- TelaStock: stock by left/right side for symmetric molds.
-- Legacy side-less movements remain auditable. Complete pairs in old aggregate
-- stock are counted neutrally on both sides; one odd leftover is marked unassigned.

alter table public.piece_stock_movements
  add column if not exists side text;

alter table public.piece_stock_movements
  drop constraint if exists piece_stock_movements_side_check;
alter table public.piece_stock_movements
  add constraint piece_stock_movements_side_check
  check (side is null or side in ('izquierda', 'derecha'));

create index if not exists piece_movements_piece_size_side_date_idx
  on public.piece_stock_movements(model_piece_id, size_id, side, created_at desc);

create or replace function public.validate_piece_movement_and_nonnegative_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_model_group uuid;
  v_size_group uuid;
  v_laterality text;
  v_current_balance bigint;
  v_legacy_balance bigint;
  v_left_balance bigint;
  v_right_balance bigint;
  v_lock_key bigint;
begin
  select m.size_group_id, p.laterality into v_model_group, v_laterality
  from public.model_pieces p
  join public.manufacturing_models m on m.id = p.model_id
  where p.id = new.model_piece_id;

  select s.size_group_id into v_size_group
  from public.sizes s where s.id = new.size_id;
  if v_model_group is null or v_size_group is null or v_model_group <> v_size_group then
    raise exception 'La talla no pertenece al grupo de tallas del modelo.';
  end if;

  v_lock_key := hashtextextended(new.model_piece_id::text || ':' || new.size_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  if v_laterality = 'simetrica' then
    select coalesce(sum(delta_quantity), 0) into v_legacy_balance
    from public.piece_stock_movements
    where model_piece_id = new.model_piece_id and size_id = new.size_id and side is null;

    -- Side-less inserts are only allowed to classify one odd historical piece,
    -- not to add new ambiguous stock. The net physical stock remains unchanged.
    if new.side is null then
      if new.delta_quantity = -1
         and mod(greatest(v_legacy_balance, 0), 2) = 1
         and new.note like 'Reclasificación de una unidad sin lado identificado%' 
         and v_legacy_balance + new.delta_quantity >= 0 then
        return new;
      end if;
      raise exception 'Para una pieza simétrica registra el lado izquierdo, derecho o una paridad.';
    end if;

    select coalesce(sum(delta_quantity), 0) into v_left_balance
    from public.piece_stock_movements
    where model_piece_id = new.model_piece_id and size_id = new.size_id and side = 'izquierda';
    select coalesce(sum(delta_quantity), 0) into v_right_balance
    from public.piece_stock_movements
    where model_piece_id = new.model_piece_id and size_id = new.size_id and side = 'derecha';

    v_legacy_balance := greatest(v_legacy_balance, 0);
    if new.side = 'izquierda' then
      v_current_balance := floor(v_legacy_balance::numeric / 2)::bigint + v_left_balance;
    else
      v_current_balance := floor(v_legacy_balance::numeric / 2)::bigint + v_right_balance;
    end if;
    if v_current_balance + new.delta_quantity < 0 then
      raise exception 'Stock insuficiente en el lado %.', new.side;
    end if;
  else
    if new.side is not null then
      raise exception 'Solo una pieza simétrica puede tener movimientos por lado.';
    end if;
    select coalesce(sum(delta_quantity), 0) into v_current_balance
    from public.piece_stock_movements
    where model_piece_id = new.model_piece_id and size_id = new.size_id;
    if v_current_balance + new.delta_quantity < 0 then
      raise exception 'Stock insuficiente para registrar este movimiento.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_piece_movement on public.piece_stock_movements;
create trigger trg_validate_piece_movement
before insert on public.piece_stock_movements
for each row execute function public.validate_piece_movement_and_nonnegative_stock();

-- Keep the original view columns in their original order and append side-aware fields.
create or replace view public.piece_stock_balances with (security_invoker = true) as
with movement_totals as (
  select
    model_piece_id,
    size_id,
    coalesce(sum(delta_quantity), 0)::bigint as total_stock,
    coalesce(sum(delta_quantity) filter (where side is null), 0)::bigint as legacy_stock,
    coalesce(sum(delta_quantity) filter (where side = 'izquierda'), 0)::bigint as explicit_left_stock,
    coalesce(sum(delta_quantity) filter (where side = 'derecha'), 0)::bigint as explicit_right_stock
  from public.piece_stock_movements
  group by model_piece_id, size_id
)
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
  coalesce(mt.total_stock, 0)::integer as stock_quantity,
  p.laterality,
  case when p.laterality = 'simetrica' then greatest(0, floor(greatest(coalesce(mt.legacy_stock, 0), 0)::numeric / 2)::bigint + coalesce(mt.explicit_left_stock, 0))::integer else null end as stock_left,
  case when p.laterality = 'simetrica' then greatest(0, floor(greatest(coalesce(mt.legacy_stock, 0), 0)::numeric / 2)::bigint + coalesce(mt.explicit_right_stock, 0))::integer else null end as stock_right,
  case when p.laterality = 'simetrica' then mod(greatest(coalesce(mt.legacy_stock, 0), 0), 2)::integer else 0 end as stock_unassigned
from public.model_pieces p
join public.manufacturing_models m on m.id = p.model_id
join public.sizes s on s.size_group_id = m.size_group_id
left join movement_totals mt on mt.model_piece_id = p.id and mt.size_id = s.id
where p.is_active and m.is_active;

create or replace view public.model_size_completion with (security_invoker = true) as
select
  model_id,
  model_name,
  size_group_id,
  size_id,
  size_label,
  size_sort_order,
  min(case
    when laterality = 'simetrica' and units_per_garment % 2 = 0
      then floor(least(stock_left, stock_right)::numeric / (units_per_garment / 2.0))
    when laterality = 'simetrica' then 0
    else floor(stock_quantity::numeric / units_per_garment)
  end)::integer as complete_units,
  bool_or(stock_quantity > 0) as has_piece_stock,
  sum(stock_quantity)::integer as total_piece_units,
  bool_or(laterality = 'simetrica') as has_symmetric_pieces,
  sum(coalesce(stock_left, 0))::integer as total_left_units,
  sum(coalesce(stock_right, 0))::integer as total_right_units,
  sum(stock_unassigned)::integer as total_unassigned_side_units
from public.piece_stock_balances
group by model_id, model_name, size_group_id, size_id, size_label, size_sort_order;
