-- Move garment family ownership from the commercial product configuration
-- to the reusable base manufacturing pattern. Existing family values are
-- migrated only when every product using a pattern agrees on one family.

alter table public.manufacturing_models
  add column if not exists garment_family text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.manufacturing_models'::regclass
      and conname = 'manufacturing_models_garment_family_check'
  ) then
    alter table public.manufacturing_models
      add constraint manufacturing_models_garment_family_check
      check (garment_family is null or garment_family in ('polo', 'buzo', 'casaca', 'otro'));
  end if;
end
$$;

with unambiguous_family as (
  select
    base_model_id,
    min(lower(trim(garment_family))) as garment_family
  from public.configured_product_models
  where nullif(trim(garment_family), '') is not null
  group by base_model_id
  having count(distinct lower(trim(garment_family))) = 1
)
update public.manufacturing_models as base_model
set garment_family = unambiguous_family.garment_family,
    updated_at = now()
from unambiguous_family
where base_model.id = unambiguous_family.base_model_id
  and base_model.garment_family is null;

alter table public.configured_product_models
  drop column if exists garment_family;

create or replace function public.validate_configured_product_model_base_family()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_family text;
begin
  select garment_family
    into v_family
  from public.manufacturing_models
  where id = new.base_model_id;

  if v_family is null then
    raise exception 'El patrón base debe tener una familia asignada antes de configurar un modelo comercial.';
  end if;

  return new;
end;
$$;

drop trigger if exists configured_product_models_require_base_family
  on public.configured_product_models;

create trigger configured_product_models_require_base_family
before insert or update of base_model_id
on public.configured_product_models
for each row
execute function public.validate_configured_product_model_base_family();

comment on column public.manufacturing_models.garment_family is
  'Familia de la prenda definida por el patrón base y heredada por sus modelos comerciales.';
