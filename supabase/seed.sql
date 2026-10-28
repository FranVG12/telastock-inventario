-- Datos maestros iniciales para reutilizar grupos de tallas entre modelos.
-- Es seguro ejecutarlo varias veces: usa los nombres como clave natural.
insert into public.size_groups (name, description)
values
  ('Prendas · infantil y adulto', 'Tallas ordenadas para polos, casacas y buzos.'),
  ('Medias', 'Rangos de edad y adulto.')
on conflict (name) do update set description = excluded.description;

insert into public.sizes (size_group_id, label, sort_order)
select g.id, v.label, v.sort_order
from public.size_groups g
join (values
  ('Prendas · infantil y adulto', 'T4', 1),
  ('Prendas · infantil y adulto', 'T6', 2),
  ('Prendas · infantil y adulto', 'T8', 3),
  ('Prendas · infantil y adulto', 'T10', 4),
  ('Prendas · infantil y adulto', 'T12', 5),
  ('Prendas · infantil y adulto', 'T14', 6),
  ('Prendas · infantil y adulto', 'T16', 7),
  ('Prendas · infantil y adulto', 'S', 8),
  ('Prendas · infantil y adulto', 'M', 9),
  ('Prendas · infantil y adulto', 'L', 10),
  ('Prendas · infantil y adulto', 'XL', 11),
  ('Medias', '6 a 9 años', 1),
  ('Medias', '10 a 13 años', 2),
  ('Medias', 'Adulto', 3)
) as v(group_name, label, sort_order) on v.group_name = g.name
on conflict (size_group_id, label) do update
set sort_order = excluded.sort_order;
