-- Give every auxiliary pattern piece an optional direct link to the
-- existing textile catalog. The color_id column already references the
-- shared global colors table; keep that relation and do not copy color names.

alter table public.component_pattern_pieces
  add column if not exists textile_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.component_pattern_pieces'::regclass
      and conname = 'component_pattern_pieces_textile_id_fkey'
  ) then
    alter table public.component_pattern_pieces
      add constraint component_pattern_pieces_textile_id_fkey
      foreign key (textile_id)
      references public.telas(id_tela)
      on delete restrict;
  end if;
end
$$;

create index if not exists component_pattern_pieces_textile_id_idx
  on public.component_pattern_pieces(textile_id);

comment on column public.component_pattern_pieces.textile_id is
  'Tela opcional tomada del catálogo public.telas; null significa que la pieza no tiene tela asignada.';

comment on column public.component_pattern_pieces.color_id is
  'Color opcional referenciado por ID al catálogo global public.colores.';
