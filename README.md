# TelaStock · Inventario de piezas de fabricación

Prototipo móvil-first para probar el inventario de piezas que componen modelos textiles (polo, casaca, buzo, medias) antes de conectar Supabase y publicar en Netlify.

## Qué incluye

- Inventario agrupado por modelo, con búsqueda y filtros **Con stock / Vacío / Todos**.
- Por defecto, al abrir un modelo se muestran únicamente tallas con piezas en stock. Se puede activar “Mostrar también tallas vacías”.
- Cálculo de unidades fabricables por talla: todos los moldes requeridos deben alcanzar; el molde más limitante fija la capacidad total.
- Detalle de faltantes para la siguiente unidad, capacidad actual de cada molde y una meta de producción que recalcula los faltantes. La interfaz distingue capacidad fabricable de prendas ya confeccionadas.
- Formulario rápido de ingreso de stock: primero selecciona el modelo, luego tallas con checklist o “Seleccionar todas”, y finalmente registra cantidades por molde y talla.
- Administración de modelos, grupos y tallas editables (crear, renombrar, ordenar y eliminar si no tienen historial).
- Cada molde guarda nombre, cantidad por prenda, lateralidad, tipo de tela y color (p. ej. pechera de poliéster rojo, cuello/puño de rib negro). Los moldes simétricos registran stock por paridad o por lado. Los campos de cada molde se muestran en una fila horizontal con desplazamiento en pantallas estrechas.
- Orden manual de moldes mediante flechas arriba/abajo.
- Importación/exportación JSON de grupos, tallas, modelos y moldes; la importación combina por ID y no reemplaza movimientos existentes.
- Historial de movimientos y exportación CSV del inventario.
- Retiro/merma/corrección negativa con motivo obligatorio recomendado; valida que no se retire más que el stock disponible y conserva el movimiento para auditoría.
- Datos de demostración; almacenamiento local del navegador para el prototipo.
- Esquema SQL normalizado de Supabase en `supabase/migrations/202610260001_inventory_pieces.sql`.

## Regla crítica de fabricación

Para un modelo y talla, la cantidad de unidades **fabricables con el stock actual** es:

`max(0, min(floor(max(0, stock_de_cada_molde) / cantidad_requerida_por_prenda)))`

Esto no significa que las prendas ya estén cosidas ni que exista una unidad adicional disponible. Es la cantidad que se podría fabricar si se usan conjuntamente las piezas de todos los moldes activos. Si cualquier molde requerido tiene capacidad 0 (no hay piezas suficientes para fabricar ni una unidad), el resultado general es 0.

Hay dos métricas que no deben confundirse:
- **Unidades fabricables con el stock actual:** el mínimo de las capacidades individuales de todos los moldes requeridos (`MIN`). Un solo molde sin stock suficiente bloquea la fabricación de una unidad.
- **Capacidad individual máxima / meta máxima respaldada por algún molde:** el máximo de las capacidades de los moldes calculadas uno por uno (`MAX`). Indica hasta cuántas unidades alcanza el molde mejor abastecido, no cuántas unidades pueden fabricarse ahora con el conjunto completo.

Ejemplo: una prenda requiere 1 delantero, 1 espalda y 2 mangas. Con stock de 1 delantero, 0 espaldas y 0 mangas, las capacidades individuales son 1, 0 y 0: unidades fabricables = 0 y capacidad individual máxima = 1. Al ingresar 1 espalda y 2 mangas, las capacidades pasan a 1, 1 y 1: se puede fabricar 1 unidad. Si el stock es 1 delantero, 4 espaldas y 2 mangas, las capacidades son 1, 4 y 1: se puede fabricar 1 unidad con el stock actual, mientras que la capacidad individual máxima es 4 porque ese molde de espalda alcanza para cuatro. El plan de producción identifica lo que falta para que todos los moldes alcancen la meta seleccionada. Si ningún molde tiene capacidad por encima de la producción actual, la interfaz sigue permitiendo planificar la siguiente unidad sin cambiar el indicador de capacidad individual máxima.

**La interfaz debe comunicar que se trata de capacidad fabricable, no de prendas ya confeccionadas, y conservar el criterio del molde más limitante.** Si una pieza es simétrica, `unitsPerGarment` sigue representando las piezas físicas necesarias por prenda y debe ser par (por ejemplo, mangas = 2). El stock se contabiliza con saldos independientes de izquierda y derecha; las piezas no simétricas de lateralidad izquierda/derecha siguen registrándose como moldes diferentes.

## Control de versiones con GitHub

El proyecto incluye `.gitignore` para excluir dependencias instaladas, compilaciones de Next.js, variables de entorno locales, logs y archivos temporales del sistema/editor. Se mantienen versionados `package.json`, el archivo de bloqueo de dependencias si se genera, el código de `app/` y `lib/`, y el SQL de `supabase/`.

Antes de publicar el repositorio, guarda las claves y contraseñas en `.env.local` (ignorado por Git) y no las subas a GitHub. Si más adelante necesitas variables de entorno, crea un `.env.example` con nombres de variables y valores de ejemplo no sensibles.

## Ejecutar localmente

Requisitos: Node.js 20.9 o superior.

```bash
npm install
npm run dev
```

Abre `http://localhost:3000` en el PC. Para probar desde Android, conecta PC y móvil a la misma Wi-Fi, inicia Next con el script incluido (`-H 0.0.0.0`) y visita `http://IP-LOCAL-DE-TU-PC:3000` desde Chrome. Si no conecta, revisa el firewall y la red Wi-Fi.

## Persistencia del prototipo

Este MVP todavía no realiza llamadas a Supabase: los datos se guardan por navegador usando `localStorage`, así que no se sincronizan entre PC y Android. El archivo SQL representa el esquema de destino normalizado; debe aplicarse a un proyecto Supabase después de configurar autenticación y políticas de acceso.

## Modelo de datos normalizado

- `size_groups`: conjunto de tallas (prendas, medias, etc.).
- `sizes`: talla y orden dentro del grupo.
- `manufacturing_models`: patrón base y grupo de tallas asignado.
- `model_pieces`: piezas/moldes requeridos por prenda, cantidad física y lateralidad.
- `piece_stock_movements`: ledger de movimientos con cantidad delta firmada; el saldo es una suma, no un campo editable duplicado.
- `piece_stock_balances` y `model_size_completion`: vistas para consultar saldos y capacidad fabricable por modelo/talla.

La migración incluye comprobación de correspondencia entre el grupo de tallas del modelo y la talla del movimiento, además de evitar stock negativo en movimientos concurrentes. Las vistas usan `security_invoker` y RLS queda habilitado sin políticas permisivas por defecto; antes de conectar la app se deben crear políticas RLS acordes al usuario/organización y configurar autenticación.

## Principios para futuras modificaciones con IA

1. No duplicar nombres o datos de grupos de tallas dentro de los modelos; referenciar por ID.
2. No modificar el saldo directamente: registrar movimientos.
3. Mantener cantidades físicas requeridas por prenda explícitas.
4. No borrar físicamente moldes con historial; archivarlos fuera de la composición activa para preservar trazabilidad y permitir guardar el modelo.
5. Registrar pérdidas, destrucción o correcciones con movimientos negativos auditables; nunca borrar el historial para corregir el saldo.
6. Cada molde conserva sus propiedades de tipo de tela y color, porque una prenda puede combinar materiales/colores distintos.
7. Mantener los filtros móviles y el formulario de ingreso corto: modelo → checklist de tallas → cantidades por molde.
8. Probar siempre los casos de pieza simétrica ×2, falta de un único molde y tallas de grupos distintos.

## Stock simétrico: paridad e inventario por lado

- Un molde con lateralidad **Simétrica** sigue indicando las piezas físicas que requiere una prenda. La cantidad debe ser par: `2` significa una unidad izquierda y una derecha por prenda; `4` significa dos por lado.
- Por defecto, el registro de stock muestra **Paridad**. Ingresar `1` paridad genera una entrada de una pieza izquierda y una derecha. La cantidad en el inventario se muestra como `N paridades` cuando ambos lados están equilibrados.
- Para cantidades diferentes, cambia a **Separar lados** e ingresa cada lado independientemente. Si hay 19 izquierdas y 17 derechas, se muestra `19/17` (izquierda/derecha); la capacidad de fabricación la limita el lado derecho, por lo que solo hay 17 pares utilizables.
- Las salidas por paridad descuentan una unidad de cada lado y no se permiten si cualquiera de los dos lados es insuficiente. Las salidas separadas validan cada lado por separado.
- Los datos históricos guardados antes de la función de lateralidad no indican qué lado era cada pieza. Los pares históricos completos se conservan como stock neutral y cualquier sobrante impar se muestra como **sin lado identificado**; en el formulario puede asignarse explícitamente al lado correcto sin cambiar la cantidad física total.
- El historial conserva el lado en cada movimiento. El CSV exportado incluye stock físico, izquierda, derecha, paridades, unidades fabricables y faltantes. La migración `202610270001_symmetric_piece_sides.sql` añade este soporte al esquema de Supabase.

## Ajustes de experiencia v8

- En el plan de producción se muestra una sola cifra resumen para las unidades fabricables; la meta queda indicada en la barra de objetivo para evitar duplicarla.
- Las tarjetas de moldes usan los indicadores compactos **Stock**, **Rinde** y **Meta**. El stock simétrico se presenta como `N par.` si está equilibrado o `izquierda/derecha` si no lo está.
- El formulario **Registrar stock** reduce etiquetas y espacios, y usa **Paridad** por defecto. Cada par suma una unidad izquierda y una derecha; **Por lado** queda disponible para cantidades diferentes.
- Al abrir un faltante para registrar stock, las piezas simétricas con faltantes equilibrados se precargan por paridad. Cuando el faltante izquierdo y derecho difiere, se activa el ingreso por lado para completar exactamente lo necesario.
