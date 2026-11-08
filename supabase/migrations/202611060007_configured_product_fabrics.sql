-- Store the fabric chosen by each configured commercial product for every
-- fabric position declared by its base pattern. A reusable base pattern defines
-- positions only; the commercial product owns the textile selection.

alter table public.manufacturing_models
  add column if not exists secondary_fabric_slots integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.manufacturing_models'::regclass
      and conname = 'manufacturing_models_secondary_fabric_slots_check'
  ) then
    alter table public.manufacturing_models
      add constraint manufacturing_models_secondary_fabric_slots_check
      check (secondary_fabric_slots >= 0);
  end if;
end
$$;

create table if not exists public.configured_product_fabrics (
  id uuid primary key default gen_random_uuid(),
  product_model_id uuid not null
    references public.configured_product_models(id) on delete restrict,
  fabric_slot text not null
    check (fabric_slot = 'principal' or fabric_slot ~ '^secundaria_[1-9][0-9]*$'),
  textile_id uuid not null
    references public.telas(id_tela) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_model_id, fabric_slot)
);

create index if not exists configured_product_fabrics_textile_id_idx
  on public.configured_product_fabrics(textile_id);

create or replace function public.validate_configured_product_fabric_slot()
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

  select secondary_fabric_slots
    into v_secondary_slots
  from public.manufacturing_models
  where id = v_base_model_id;

  if new.fabric_slot = 'principal' then
    return new;
  end if;

  v_slot_index := substring(new.fabric_slot from '^secundaria_([0-9]+)$')::integer;
  if v_slot_index < 1 or v_slot_index > coalesce(v_secondary_slots, 0) then
    raise exception 'La posición % no está definida en el patrón base seleccionado.', new.fabric_slot;
  end if;

  return new;
end;
$$;

drop trigger if exists configured_product_fabrics_slot_guard
  on public.configured_product_fabrics;

create trigger configured_product_fabrics_slot_guard
before insert or update of product_model_id, fabric_slot
on public.configured_product_fabrics
for each row
execute function public.validate_configured_product_fabric_slot();

alter table public.configured_product_fabrics enable row level security;

comment on table public.configured_product_fabrics is
  'Relación normalizada entre modelo comercial, posición de tela del patrón base y tela elegida. Una misma posición de patrón puede usar una tela distinta en cada modelo comercial.';

comment on column public.manufacturing_models.secondary_fabric_slots is
  'Cantidad de posiciones de tela secundaria definidas por el patrón base. Cada modelo comercial asigna su propia tela a cada posición.';
