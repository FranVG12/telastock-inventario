-- Rendimiento teórico por tipo de tela y catálogo normalizado de colores.
-- Migración aditiva: los colores históricos se promueven a entidades/relaciones antes de
-- retirar los campos de texto libre. No genera mediciones de peso o metraje en los rollos.
create extension if not exists pgcrypto;

-- El rendimiento se interpreta a partir de unidad_venta:
-- KG => metros por kilogramo (m/kg); M => kilogramos por metro (kg/m).
alter table public.telas
  add column if not exists rendimiento_teorico numeric(12,6) null;
alter table public.telas
  drop constraint if exists telas_rendimiento_teorico_check;
alter table public.telas
  add constraint telas_rendimiento_teorico_check
  check (rendimiento_teorico is null or rendimiento_teorico > 0);
comment on column public.telas.rendimiento_teorico is
  'Rendimiento teórico: m/kg cuando unidad_venta=KG; kg/m cuando unidad_venta=M. No es una medición real de un rollo.';

-- Diccionario global de nombres. El código cromático pertenece a la relación con cada tela,
-- no al diccionario global, porque una tela puede imprimir el mismo nombre con otra fórmula.
create table if not exists public.colores (
  id_color uuid primary key default gen_random_uuid(),
  nombre_color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists colores_nombre_ci_uidx
  on public.colores (lower(trim(nombre_color)));

create table if not exists public.tela_colores (
  id_tela_color uuid primary key default gen_random_uuid(),
  id_tela uuid not null references public.telas(id_tela) on delete restrict,
  id_color uuid not null references public.colores(id_color) on delete restrict,
  hexadecimal text null check (hexadecimal is null or hexadecimal ~ '^#[0-9A-Fa-f]{6}$'),
  cmyk_c numeric(5,2) null check (cmyk_c is null or cmyk_c between 0 and 100),
  cmyk_m numeric(5,2) null check (cmyk_m is null or cmyk_m between 0 and 100),
  cmyk_y numeric(5,2) null check (cmyk_y is null or cmyk_y between 0 and 100),
  cmyk_k numeric(5,2) null check (cmyk_k is null or cmyk_k between 0 and 100),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id_tela, id_color),
  constraint tela_colores_cmyk_all_or_none check (
    (cmyk_c is null and cmyk_m is null and cmyk_y is null and cmyk_k is null)
    or
    (cmyk_c is not null and cmyk_m is not null and cmyk_y is not null and cmyk_k is not null)
  )
);
create index if not exists tela_colores_tela_activo_idx
  on public.tela_colores (id_tela, activo);

-- 1. Promote all distinct legacy names from both the roll and mold catalogs.
insert into public.colores (nombre_color)
select distinct trim(source.nombre_color)
from (
  select color as nombre_color from public.rollos
  union all
  select color as nombre_color from public.model_pieces
) as source
where nullif(trim(source.nombre_color), '') is not null
  and not exists (
    select 1 from public.colores c
    where lower(trim(c.nombre_color)) = lower(trim(source.nombre_color))
  );

-- 2. Create a per-textile color variant for each legacy roll color.
-- Historical HEX/CMYK values are unknown, so they intentionally remain NULL.
insert into public.tela_colores (id_tela, id_color)
select distinct r.id_tela, c.id_color
from public.rollos r
join public.colores c
  on lower(trim(c.nombre_color)) = lower(trim(r.color))
where nullif(trim(r.color), '') is not null
  and not exists (
    select 1 from public.tela_colores tc
    where tc.id_tela = r.id_tela and tc.id_color = c.id_color
  );

-- 3. Link each physical roll to its normalized textile/color variant.
alter table public.rollos add column if not exists id_tela_color uuid null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rollos_id_tela_color_fkey'
      and conrelid = 'public.rollos'::regclass
  ) then
    alter table public.rollos
      add constraint rollos_id_tela_color_fkey
      foreign key (id_tela_color) references public.tela_colores(id_tela_color)
      on delete restrict;
  end if;
end $$;

update public.rollos r
set id_tela_color = tc.id_tela_color
from public.tela_colores tc
join public.colores c on c.id_color = tc.id_color
where tc.id_tela = r.id_tela
  and lower(trim(c.nombre_color)) = lower(trim(r.color))
  and nullif(trim(r.color), '') is not null
  and r.id_tela_color is null;

-- 4. A model owns one principal slot and any number of numbered secondary slots.
alter table public.manufacturing_models
  add column if not exists secondary_fabric_slots integer not null default 0;
alter table public.manufacturing_models
  drop constraint if exists manufacturing_models_secondary_fabric_slots_check;
alter table public.manufacturing_models
  add constraint manufacturing_models_secondary_fabric_slots_check
  check (secondary_fabric_slots >= 0);

alter table public.model_pieces
  add column if not exists fabric_slot text not null default 'principal';
alter table public.model_pieces
  add column if not exists color_id uuid null;
alter table public.model_pieces
  add column if not exists color_override boolean not null default true;

alter table public.model_pieces
  drop constraint if exists model_pieces_fabric_slot_check;
alter table public.model_pieces
  add constraint model_pieces_fabric_slot_check
  check (fabric_slot = 'principal' or fabric_slot ~ '^secundaria_[1-9][0-9]*
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: principal o secundaria_N, con N >= 1 y sin límite fijo.';
);

-- Backfill the model's configured count from any legacy mold using a secondary slot.
update public.manufacturing_models m
set secondary_fabric_slots = greatest(
  m.secondary_fabric_slots,
  coalesce((
    select max((regexp_match(p.fabric_slot, '^secundaria_([0-9]+)

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
))[1]::integer)
    from public.model_pieces p
    where p.model_id = m.id and p.fabric_slot ~ '^secundaria_[1-9][0-9]*

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';

  ), 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: principal o secundaria_N, con N >= 1 y sin límite fijo.';
);

-- Backfill the model's configured count from any legacy mold using a secondary slot.
update public.manufacturing_models m
set secondary_fabric_slots = greatest(
  m.secondary_fabric_slots,
  coalesce((
    select max((regexp_match(p.fabric_slot, '^secundaria_([0-9]+)

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
))[1]::integer)
    from public.model_pieces p
    where p.model_id = m.id and p.fabric_slot ~ '^secundaria_[1-9][0-9]*

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';

  ), 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
);

-- Preserve legacy models that already used numbered secondary slots.
update public.manufacturing_models m
set secondary_fabric_slots = greatest(
  m.secondary_fabric_slots,
  coalesce((
    select max((regexp_match(p.fabric_slot, '^secundaria_([1-9][0-9]*)
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: principal o secundaria_N, con N >= 1 y sin límite fijo.';
);

-- Backfill the model's configured count from any legacy mold using a secondary slot.
update public.manufacturing_models m
set secondary_fabric_slots = greatest(
  m.secondary_fabric_slots,
  coalesce((
    select max((regexp_match(p.fabric_slot, '^secundaria_([0-9]+)

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
))[1]::integer)
    from public.model_pieces p
    where p.model_id = m.id and p.fabric_slot ~ '^secundaria_[1-9][0-9]*

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';

  ), 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: principal o secundaria_N, con N >= 1 y sin límite fijo.';
);

-- Backfill the model's configured count from any legacy mold using a secondary slot.
update public.manufacturing_models m
set secondary_fabric_slots = greatest(
  m.secondary_fabric_slots,
  coalesce((
    select max((regexp_match(p.fabric_slot, '^secundaria_([0-9]+)

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
))[1]::integer)
    from public.model_pieces p
    where p.model_id = m.id and p.fabric_slot ~ '^secundaria_[1-9][0-9]*

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';

  ), 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
))[1]::integer)
    from public.model_pieces p
    where p.model_id = m.id
      and p.fabric_slot ~ '^secundaria_[1-9][0-9]*
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: principal o secundaria_N, con N >= 1 y sin límite fijo.';
);

-- Backfill the model's configured count from any legacy mold using a secondary slot.
update public.manufacturing_models m
set secondary_fabric_slots = greatest(
  m.secondary_fabric_slots,
  coalesce((
    select max((regexp_match(p.fabric_slot, '^secundaria_([0-9]+)

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
))[1]::integer)
    from public.model_pieces p
    where p.model_id = m.id and p.fabric_slot ~ '^secundaria_[1-9][0-9]*

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';

  ), 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: principal o secundaria_N, con N >= 1 y sin límite fijo.';
);

-- Backfill the model's configured count from any legacy mold using a secondary slot.
update public.manufacturing_models m
set secondary_fabric_slots = greatest(
  m.secondary_fabric_slots,
  coalesce((
    select max((regexp_match(p.fabric_slot, '^secundaria_([0-9]+)

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
))[1]::integer)
    from public.model_pieces p
    where p.model_id = m.id and p.fabric_slot ~ '^secundaria_[1-9][0-9]*

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';

  ), 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';

  ), 0)
);

do $
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: principal o secundaria_N, con N >= 1 y sin límite fijo.';
);

-- Backfill the model's configured count from any legacy mold using a secondary slot.
update public.manufacturing_models m
set secondary_fabric_slots = greatest(
  m.secondary_fabric_slots,
  coalesce((
    select max((regexp_match(p.fabric_slot, '^secundaria_([0-9]+)

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
))[1]::integer)
    from public.model_pieces p
    where p.model_id = m.id and p.fabric_slot ~ '^secundaria_[1-9][0-9]*

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';

  ), 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: principal o secundaria_N, con N >= 1 y sin límite fijo.';
);

-- Backfill the model's configured count from any legacy mold using a secondary slot.
update public.manufacturing_models m
set secondary_fabric_slots = greatest(
  m.secondary_fabric_slots,
  coalesce((
    select max((regexp_match(p.fabric_slot, '^secundaria_([0-9]+)

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
))[1]::integer)
    from public.model_pieces p
    where p.model_id = m.id and p.fabric_slot ~ '^secundaria_[1-9][0-9]*

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';

  ), 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'model_pieces_color_id_fkey'
      and conrelid = 'public.model_pieces'::regclass
  ) then
    alter table public.model_pieces
      add constraint model_pieces_color_id_fkey
      foreign key (color_id) references public.colores(id_color)
      on delete set null;
  end if;
end $$;

update public.model_pieces p
set color_id = c.id_color
from public.colores c
where lower(trim(c.nombre_color)) = lower(trim(p.color))
  and nullif(trim(p.color), '') is not null
  and p.color_id is null;

-- The normalized references replace free-text source fields. All existing names were
-- backfilled above; future mold slot labels are derived from fabric_slot in the app.
alter table public.rollos drop column if exists color;
alter table public.model_pieces drop column if exists color;
alter table public.model_pieces drop column if exists fabric_type;

create index if not exists rollos_tela_color_idx on public.rollos (id_tela, id_tela_color);
create index if not exists model_pieces_fabric_slot_idx on public.model_pieces (model_id, fabric_slot);
create index if not exists model_pieces_color_id_idx on public.model_pieces (color_id);

-- Security remains closed by default like the other inventory tables. Define authenticated
-- owner/organization policies before enabling a remote browser-connected database.
alter table public.colores enable row level security;
alter table public.tela_colores enable row level security;

comment on table public.colores is
  'Diccionario global de nombres de color reutilizables entre materiales.';
comment on table public.tela_colores is
  'Código digital HEX y fórmula CMYK de un nombre de color para una tela específica.';
comment on column public.model_pieces.fabric_slot is
  'Ranura de material de un molde: tela principal o tela secundaria 1, 2 o 3.';
