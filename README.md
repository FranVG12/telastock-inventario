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
- `manufacturing_models`: patrón base, familia de prenda y grupo de tallas asignado. La familia se define aquí y es heredada por los modelos comerciales.
- `product_collections`: catálogo normalizado de colecciones reutilizables.
- `configured_product_models`: configuración comercial que referencia un patrón base y, opcionalmente para conservar registros antiguos, una colección mediante `collection_id`; no guarda una familia propia.
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
6. Cada molde referencia una ranura de material: principal o una de las ranuras secundarias ilimitadas que configure el modelo. El color base viene del catálogo global. La tela concreta y su fórmula HEX/CMYK se resolverán por producto al definir qué material ocupa cada ranura.
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


## Copia de seguridad local

En la cabecera de la aplicación, abre **Respaldo** para descargar o restaurar una copia completa.

- **Descargar respaldo** crea un archivo JSON con grupos de tallas, tallas, modelos, moldes, existencias representadas por todos sus movimientos, y el historial completo.
- **Restaurar una copia** valida que el archivo sea un respaldo completo compatible y pide confirmación antes de reemplazar los datos del navegador actual.
- Para trasladar tu inventario a otro equipo o navegador, descarga el archivo en el equipo original y restaura ese archivo en el otro.
- Guarda copias en una ubicación segura y realiza respaldos periódicos. El archivo contiene información de inventario e historial.
- Los datos siguen siendo locales al navegador; importar/exportar no activa sincronización entre personas o dispositivos.

El CSV disponible en Inventario sirve para consultar el stock en Excel; el JSON de respaldo es el que debes conservar para poder restaurar también la configuración y los movimientos.


## Módulo de telas, rollos, compras y proveedores

El módulo está integrado en la navegación principal mediante `app/fabric-module.tsx` y mantiene sus datos locales separados de los movimientos de piezas de confección.

- `telas`: catálogo maestro con unidad habitual, ancho nominal, rendimiento teórico y estado activo. El rendimiento se expresa como `m/kg` cuando la unidad de venta es KG y como `kg/m` cuando es M; nunca se copia a las mediciones reales de los rollos.
- `colores`: diccionario global de nombres de color.
- `telaColores`: relación entre tela y color; cada asociación conserva sus propios HEX y CMYK, por lo que el mismo nombre puede tener códigos distintos para materiales diferentes.
- `rollos`: una fila por rollo físico; las mediciones reales `pesoKg` y `metros` son independientes y pueden permanecer en `null`. El color se relaciona mediante `idTelaColor`.
- `rolloMovimientos`: historial de ingresos, consumos, ajustes y registro de mediciones.
- `proveedores`, `proveedorTelefonos`, `proveedorCategorias`: proveedor normalizado con RUC opcional de 11 dígitos, múltiples teléfonos y rubros.
- `compras` y `detalleCompra`: cabecera y líneas de compra; cada rollo puede tener una sola línea de origen y conserva su precio unitario histórico. En una línea de compra se pueden ingresar varias cantidades adicionales; cada cantidad crea su propio rollo y detalle, compartiendo proveedor, tela, color, unidad y precio.

La migración inicial es `supabase/migrations/202611040001_textile_rolls_purchases.sql`. La migración de rendimiento, colores y ranuras de moldes es `supabase/migrations/202611050001_textile_yield_and_normalized_colors.sql`. La migración `supabase/migrations/202611050002_supplier_ruc.sql` añade el RUC opcional de proveedores. Son aditivas, pero deben ejecutarse en orden. No se ejecutan automáticamente: Supabase no está conectado a esta versión local-first. Las tablas mantienen RLS habilitado sin políticas permisivas; antes de una futura conexión remota deben configurarse autenticación y políticas de acceso.

### Cantidades y mediciones

La cantidad de ingreso se registra en la unidad elegida (KG o M) y se copia únicamente a la medición real de esa misma unidad. La otra medición queda `null` salvo que el operador la conozca y la introduzca. No hay conversión estimada automática. El consumo requiere una medición real de la unidad elegida y nunca descuenta de una medida desconocida.

Al corregir una línea de compra, la cantidad y el precio se actualizan en el historial comercial; no se reescribe el saldo físico ni las mediciones reales del rollo. Los consumos y mediciones se registran en el historial del rollo.

### Colores, moldes y compras por lotes

- Los colores se registran sin salir del formulario de rollos o compras. El nombre se reutiliza del diccionario global; el HEX y los cuatro valores CMYK pertenecen a la combinación específica tela-color.
- El editor de moldes ofrece una tela principal y un botón para añadir tantas ranuras secundarias como requiera el modelo. Cada molde elige una de las ranuras disponibles. El color base se elige de la paleta central; los moldes heredan el color de referencia salvo que se sobrescriba individualmente.
- En compras, cada tarjeta representa un rollo físico. Al añadir otro rollo se repiten tela, color y precio, pero la cantidad queda vacía. El precio se propone desde la última compra del mismo proveedor, tela y unidad, y puede editarse.
- Los desplegables de color muestran todos los nombres globales; si el nombre aún no está asociado a la tela se crea la relación al seleccionarlo. Las opciones se ordenan por frecuencia de rollos de esa tela y después alfabéticamente.
- Al registrar varios rollos del mismo material, color y precio en una compra, escribe las cantidades adicionales separadas por comas (usa punto decimal, por ejemplo `15, 18.5, 22`). TelaStock crea un rollo y una línea de detalle por cantidad, con saldo físico individual y el mismo precio unitario histórico.

La migración SQL respalda los nombres antiguos de color de rollos y moldes antes de quitar los campos de texto libre. Los moldes antiguos quedan asignados por defecto a `principal`; los nombres de color se promueven al diccionario global y se vinculan por ID. Los códigos HEX/CMYK históricos desconocidos permanecen nulos. La migración `202611060008_component_piece_model_fabric_slots.sql` retira el vínculo fijo de tela de la pieza auxiliar y valida que cada ranura secundaria exista en el patrón base de todos los modelos que reutilizan el componente; está preparada, no ejecutada.

### Exportación y respaldo

- En Telas, Rollos, Compras y Proveedores, el botón CSV exporta la vista correspondiente.
- El respaldo JSON completo incluye las diez colecciones del módulo textil y las colecciones del inventario de piezas, incluidos el diccionario global de colores y sus variantes por tela. Es el formato recomendado para trasladar y restaurar los datos manteniendo identificadores y relaciones.
- La importación de respaldo reemplaza los datos locales después de validar las relaciones y pedir confirmación. Conserva primero una copia del estado actual si necesitas volver atrás.

### Revisión manual de datos antiguos

No existe una migración automática de compras antiguas porque el inventario previo estaba centrado en piezas de confección y no contenía rollos, precios históricos ni unidades de compra estructuradas. Los registros comerciales externos con pesos como `68.45/3`, fechas ambiguas o proveedor y dirección mezclados deben importarse solo después de confirmar su significado; no se convierten automáticamente ni se inventan mediciones. En CSV, las fechas ISO `AAAA-MM-DD` se aceptan directamente. Los formatos locales con barras o guiones solo se aceptan cuando día y mes se pueden distinguir sin ambigüedad; fechas como `04/05/2025` se rechazan y deben normalizarse manualmente a `AAAA-MM-DD`.

La equivalencia estimada KG↔M para una operación de corte todavía no está implementada: la aplicación actual solo muestra y descuenta mediciones reales. Cuando se implemente, deberá calcularse por tipo de tela y operación, etiquetarse como estimada y no escribirse en los campos reales del rollo.


La importación CSV de insumos acepta `AAAA-MM-DD` y formatos locales con barras o guiones solo cuando día y mes se distinguen sin ambigüedad; valores como `04/05/2025` se rechazan para evitar cambiar el día por el mes.

## Módulos de insumos y configuración de confección

La rama de trabajo feature/componentes-insumos incorpora un módulo local-first para organizar materiales y acabados:

- **Insumos y avíos:** catálogo por categoría, unidad base, modalidad de stock total o por talla, características adicionales y variantes comerciales (color, ancho, material, calibre, presentación, etc.).
- **Variantes y existencias:** el stock se registra mediante movimientos de entrada/salida. Las presentaciones comerciales guardan su equivalencia declarada; no se inventan conversiones entre unidades incompatibles.
- **Vinculación textil:** una variante puede referenciar una tela y un color ya existentes. Si se vincula a un rollo, el stock se consulta desde el inventario de rollos; el nuevo módulo no crea un saldo paralelo ni consume rollos automáticamente.
- **Componentes reutilizables:** biblioteca de cuellos, bolsillos, puños, pretinas, tapeteras y otros acabados, con piezas auxiliares, lateralidad y consumos de materiales. Cada pieza auxiliar referencia una posición de tela del patrón (`principal`, `secundaria_1..N`) o «ninguna»; no guarda una tela comercial fija. El color se mantiene enlazado al catálogo global por identificador. La biblioteca es solo una definición de molde: no tiene inventario ni movimientos de stock. Los datos antiguos con `textileId` fijo se normalizan a la posición `principal` (o conservan su posición válida existente) y dejan de almacenar una tela concreta en la biblioteca.
- **Modelos configurados:** una prenda comercial referencia un patrón base, elige una colección guardada, selecciona componentes y asigna una tela del catálogo a cada posición que define el patrón. La colección y las asignaciones de tela viven en relaciones normalizadas. La familia se hereda del patrón base y se muestra como etiqueta compacta; la tabla de tallas también se presenta como etiqueta pequeña, no como un campo editable. El inventario de piezas auxiliares se crea dentro de cada modelo comercial y usa únicamente la tabla de tallas del patrón base; los saldos no se comparten entre modelos aunque reutilicen el mismo componente.
- **Recetas estándar:** consumos compartidos por familia (polo, buzo y casaca), con consumo fijo o diferenciado por talla y porcentaje de desperdicio.
- **Asignación de telas por modelo:** al elegir un patrón base se muestran automáticamente sus posiciones `Tela principal 1` y `Tela secundaria 1..N`. El operador asigna una tela activa del catálogo existente a cada posición. Dos modelos que usan el mismo patrón pueden elegir telas diferentes; la definición del molde no se modifica.
- **Tela heredada en piezas auxiliares:** al crear un componente se selecciona si cada pieza usa «Tela principal 1», «Tela secundaria» y su número, o ninguna. Al asignar ese componente a un modelo comercial, la pieza resuelve la tela desde la relación `productFabrics` de ese modelo. Por ejemplo, una pieza vinculada a `principal` hereda Polialgodón si ese modelo asignó Polialgodón a `Tela principal 1`; otro modelo que reutilice el componente puede heredar una tela diferente. Si la posición secundaria indicada no existe en el patrón base, el guardado se rechaza. Cambiar la tela del modelo actualiza la referencia visible sin duplicar ni compartir inventarios.
- **Herencia de telas en piezas auxiliares:** la pieza puede usar `principal`, `secundaria_N` o `ninguna`. Para un modelo comercial, TelaStock resuelve el nombre de tela mediante `productFabrics` usando conjuntamente el ID del modelo y la posición; dos modelos que reutilizan el componente nunca comparten accidentalmente la tela asignada al otro. Se valida la compatibilidad al crear el modelo, editar el componente e importar un respaldo.
- **Creación contextual de catálogos:** cuando un selector está vacío, ofrece crear el registro sin abandonar el formulario. Se puede crear tela desde cada posición de tela del modelo, desde piezas auxiliares, rollos y compras; crear colores desde moldes y componentes; crear patrón base y grupo de tallas desde el constructor comercial; crear componentes desde un modelo; e insumos/variantes desde recetas, componentes y compras de avíos. Al guardar, el nuevo registro queda seleccionado en el campo de origen. Los pasos de configuración que requieren más datos regresan al formulario anterior y conservan lo que ya se había llenado. También se puede crear una tela y su color asociado desde la vinculación opcional de una variante de insumo, respetando la unidad y la modalidad de inventario compatibles.
- **Planificación:** estima materiales requeridos, disponibilidad y faltantes por variante, talla y presentación de compra. Es una simulación: no descuenta stock ni genera órdenes de compra.

### Separación de inventarios

1. **Rollos de tela:** inventario físico existente, con mediciones reales en KG o metros.
2. **Piezas cortadas:** inventario existente por molde, talla y lateralidad.
3. **Insumos y avíos:** ledger independiente por variante y, cuando corresponda, talla.

No se debe sumar KG con metros ni inferir metros a partir de KG sin un rendimiento/medición real autorizado. Los consumos sin equivalencia conocida deben configurarse con una unidad compatible.

### Respaldo y migración

El respaldo completo usa schemaVersion 10 e incluye insumos, variantes, movimientos, componentes, recetas, colecciones, modelos, asignaciones de telas e inventarios auxiliares por modelo. Se mantienen importables los respaldos completos de versiones anteriores. Las asignaciones de tela se validan contra el patrón base y el catálogo de telas.

La migración 202611060001_supplies_components_product_models.sql define el esquema relacional futuro. **No se ejecuta automáticamente** y no conecta la aplicación con Supabase. Las tablas nuevas mantienen RLS habilitado sin políticas permisivas, igual que el resto del esquema pendiente de configuración de autenticación y acceso.

### Compras de insumos y avíos

El módulo de compras de avíos permite registrar fecha, proveedor (reutiliza el catálogo existente), tipo y número de comprobante, observación y varios detalles por documento. Cada detalle conserva la variante, la talla cuando el insumo controla stock por talla, la cantidad comprada, la presentación, la equivalencia declarada a la unidad base, el precio histórico y el importe.

Al guardar un comprobante, TelaStock registra una entrada por cada detalle en el ledger de stock de avíos. Para una presentación configurada, por ejemplo una docena con equivalencia de 12 unidades, la compra de 3 docenas ingresa 36 unidades al inventario. Cuando no hay presentación configurada, la cantidad se compra directamente en la unidad base del insumo. No se convierten unidades incompatibles ni se estima equivalencia.

Las compras de telas permanecen en el módulo existente de rollos y no se duplican en compras de avíos. Las compras vinculadas a proveedor conservan su referencia aunque el proveedor luego deje de estar disponible en el catálogo local.

### Inventario auxiliar por modelo comercial

La biblioteca de componentes define moldes reutilizables (cuellos, bolsillos, puños, pretinas y otros acabados), sus piezas, lateralidad, tela, color y materiales. **No tiene inventario ni registra movimientos de existencias.**

El inventario de piezas auxiliares nace dentro de cada modelo comercial configurado, después de combinar un patrón base con los componentes que llevará la prenda. Cada saldo se identifica por modelo comercial + pieza auxiliar + talla + lado. Por eso, dos modelos que reutilicen el mismo cuello mantienen existencias independientes.

- La tabla de tallas se hereda del patrón base seleccionado. El inventario auxiliar solo muestra tallas de ese grupo.
- Las piezas normales se controlan por unidades físicas.
- Las piezas simétricas permiten registrar una cantidad en paridades (un lado izquierdo y uno derecho) o registrar un lado específico.
- Las entradas, salidas y mermas quedan asociadas al modelo comercial, no a la ficha reutilizable del componente.
- La planificación y las reservas consultan el inventario del modelo seleccionado; el stock de las piezas del patrón base permanece independiente.
- Los movimientos anteriores sin una relación inequívoca con un único modelo quedan sin asignar. No se duplican entre modelos compartidos; el operador debe registrar el saldo inicial correcto en cada modelo.

## Órdenes de producción y reservas

El módulo de órdenes conecta la planificación con el inventario sin crear saldos paralelos:

1. **Borrador:** se crea desde Planificar con un modelo configurado y cantidades enteras por talla. La orden guarda una foto del modelo, consumos de materiales, requerimientos de piezas del patrón base, piezas auxiliares y costos estimados.
2. **Reservada:** antes de reservar, TelaStock verifica los saldos actuales y descuenta de la disponibilidad las reservas de otras órdenes. Para telas asigna rollos físicos por unidad real (KG o M), priorizando los rollos más antiguos con la medición requerida disponible. No convierte KG a metros ni al revés.
3. **En proceso:** mantiene apartadas las existencias para que las salidas manuales no las consuman.
4. **Completada:** registra salidas con la referencia de la orden en avíos, piezas auxiliares, moldes base y rollos; en rollos conserva la medición complementaria como desconocida si no se vuelve a medir.
5. **Cancelada:** libera las reservas sin descontar existencias.

El costo mostrado es una estimación basada en el último precio de compra conocido por variante/unidad. Si faltan precios, la orden muestra el número de líneas sin costo y no presenta un total como si fuera completo. No incluye mano de obra ni servicios externos.

Las reservas son locales a este navegador, igual que el resto de los datos del prototipo. No proporcionan bloqueo entre dos dispositivos o usuarios. Antes de operar simultáneamente en varios equipos, se requiere migrar el flujo de reservar/completar a transacciones del backend. Las migraciones `202611060002_production_orders_and_reservations.sql`, `202611060006_product_scoped_component_piece_inventory.sql` y `202611060007_configured_product_fabrics.sql` preparan tablas, relaciones, referencias de movimientos, reservas aisladas por modelo y asignaciones de tela por posición del patrón; no se ejecutan ni conectan Supabase automáticamente.

El respaldo completo utiliza `schemaVersion: 9` e incluye órdenes, reservas, consumos reales, colecciones y movimientos auxiliares separados por modelo comercial. Los respaldos completos anteriores siguen siendo importables; los movimientos auxiliares ambiguos se conservan sin asignar en lugar de duplicar existencias.

Al completar una orden, el operador confirma las cantidades reales de cada avío y de cada rollo. Puede registrar un consumo menor al reservado, lo que libera la diferencia; no puede consumir más de lo que la orden tiene reservado. Para rollos, la cantidad real se registra con precisión de 0.001 KG o M y debe coincidir, por variante textil, con el consumo real indicado. Las piezas de molde base y auxiliares se descuentan de acuerdo con la cantidad de prendas y la receta de piezas guardada en la orden.
