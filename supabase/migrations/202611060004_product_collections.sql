-- Normalize reusable garment collections and link each commercial model
-- to one saved collection. The nullable FK preserves legacy product rows;
-- newly created rows are required to choose a collection in the application.

create table if not exists public.product_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_collections_name_ci_uidx
  on public.product_collections (lower(trim(name)));

alter table public.configured_product_models
  add column if not exists collection_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.configured_product_models'::regclass
      and conname = 'configured_product_models_collection_id_fkey'
  ) then
    alter table public.configured_product_models
      add constraint configured_product_models_collection_id_fkey
      foreign key (collection_id)
      references public.product_collections(id)
      on delete restrict;
  end if;
end
$$;

create index if not exists configured_product_models_collection_id_idx
  on public.configured_product_models(collection_id);

create or replace function public.validate_configured_product_model_collection()
returns trigger
language plpgsql
set search_path = public
as $
declare
  v_active boolean;
begin
  if new.collection_id is null then
    raise exception 'Selecciona una colección guardada antes de crear el modelo de prenda.';
  end if;

  select is_active into v_active
  from public.product_collections
  where id = new.collection_id;

  if coalesce(v_active, false) is not true then
    raise exception 'La colección seleccionada no existe o está archivada.';
  end if;

  return new;
end;
$;

drop trigger if exists configured_product_models_require_collection
  on public.configured_product_models;

create trigger configured_product_models_require_collection
before insert or update of collection_id
on public.configured_product_models
for each row
execute function public.validate_configured_product_model_collection();

alter table public.product_collections enable row level security;

comment on table public.product_collections is
  'Catálogo normalizado de colecciones reutilizables para agrupar modelos comerciales de prendas.';

comment on column public.configured_product_models.collection_id is
  'Colección seleccionada desde el catálogo product_collections; la familia sigue heredándose del patrón base.';
