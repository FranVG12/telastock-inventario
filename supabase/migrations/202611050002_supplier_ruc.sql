-- TelaStock: RUC opcional para proveedores.
-- Permite mantener proveedores antiguos sin RUC y evita duplicar un RUC informado.

alter table public.proveedores
  add column if not exists ruc text null;

alter table public.proveedores
  drop constraint if exists proveedores_ruc_check;

alter table public.proveedores
  add constraint proveedores_ruc_check
  check (ruc is null or ruc ~ '^[0-9]{11}$');

create unique index if not exists proveedores_ruc_uidx
  on public.proveedores (ruc)
  where ruc is not null;

comment on column public.proveedores.ruc is
  'RUC peruano opcional del proveedor, compuesto por 11 dígitos.';
