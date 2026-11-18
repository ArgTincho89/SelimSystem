# SelimSystem — Documento funcional

**Versión del producto:** 1.16.0
**Entorno productivo:** https://selimsystem.fly.dev
**Fecha del documento:** 17/11/2026

Este documento describe qué hace SelimSystem, cómo se usa cada pantalla y qué reglas de negocio aplica la aplicación. Está pensado para personas usuarias y responsables del negocio que necesitan entender el producto sin leer el código. Los detalles técnicos se limitan a la sección 16.

Todo lo descrito se verificó contra el código actual de la aplicación (versión 1.16.0). Cuando una capacidad existe solo en el servidor y no tiene pantalla, se indica de forma explícita.

---

## Índice

1. [Qué es SelimSystem](#1-qué-es-selimsystem)
2. [Conceptos clave](#2-conceptos-clave)
3. [Mapa de navegación](#3-mapa-de-navegación)
4. [Acceso: inicio de sesión y registro](#4-acceso-inicio-de-sesión-y-registro)
5. [Inicio](#5-inicio)
6. [Formulario de transacción](#6-formulario-de-transacción)
7. [Avisos](#7-avisos)
8. [Categorías](#8-categorías)
9. [Bienes](#9-bienes)
10. [Declaración de alquiler y cobros](#10-declaración-de-alquiler-y-cobros)
11. [Obligaciones](#11-obligaciones)
12. [Configuración](#12-configuración)
13. [Perfil y Logs](#13-perfil-y-logs)
14. [Reglas de negocio transversales](#14-reglas-de-negocio-transversales)
15. [Aplicación instalable (PWA) y uso sin conexión](#15-aplicación-instalable-pwa-y-uso-sin-conexión)
16. [Arquitectura (resumen técnico)](#16-arquitectura-resumen-técnico)
17. [Limitaciones conocidas](#17-limitaciones-conocidas)
18. [Glosario](#18-glosario)

---

## 1. Qué es SelimSystem

SelimSystem es una aplicación web de finanzas personales y patrimoniales, multiusuario, que se puede instalar en el teléfono o en la computadora. Permite:

- Registrar **gastos, ingresos, reembolsos y transferencias** en varias cuentas y monedas (ARS, EUR y USD).
- Organizar los movimientos por **categorías** y ver la analítica del mes (distribución de gastos, fijo vs variable, ingresos A/B, IVA).
- Administrar **bienes** (muebles e inmuebles), sus **titulares** y sus **obligaciones** (impuestos, servicios, seguros, etc.).
- **Declarar alquileres** de inmuebles con una o varias modalidades (contrato de locación, comodato y mutuo), cobrarlos y deshacer un cobro mal registrado.
- **Registrar pagos** de obligaciones con comprobante y consultar el **historial** de cada bien.
- Recibir **avisos** internos de vencimientos, cobros pendientes, comprobantes faltantes y saldo insuficiente.
- Consultar un **registro de actividad** (Logs) con todo lo que hizo cada persona usuaria.

Cada cuenta de usuario tiene sus datos totalmente separados de las demás.

---

## 2. Conceptos clave

| Concepto | Qué significa en SelimSystem |
|---|---|
| **Cuenta** | Lugar donde está el dinero (banco, efectivo, billetera). Tiene una moneda propia y un saldo independiente. |
| **Sub-cuenta** | Cuenta "hija" de otra cuenta, con su propia moneda. Solo hay un nivel (una sub-cuenta no puede tener sub-cuentas). |
| **Transacción** | Movimiento real: gasto, ingreso o reembolso, siempre asociado a una cuenta. |
| **Transferencia** | Paso de dinero entre dos cuentas propias. Cambia saldos, pero **no** es ingreso, gasto ni ahorro. |
| **Titular / Inquilino / Proveedor** | Personas u organizaciones que se cargan en Configuración y se usan en cuentas, bienes, alquileres y obligaciones. |
| **Bien** | Un mueble (automóvil) o un inmueble (departamento, casa, galpón, lote). |
| **Obligación** | Compromiso de pago recurrente o único (impuesto, servicio, seguro...). Genera **vencimientos**. |
| **Declaración de alquiler** | Registro de que un inmueble está alquilado, con sus modalidades, inquilinos y montos. Genera **meses de alquiler** a cobrar. |
| **Aviso** | Recordatorio interno de algo que requiere atención. No se envían correos ni notificaciones push. |

---

## 3. Mapa de navegación

### 3.1 Barra de navegación

Visible en todas las pantallas una vez iniciada la sesión:

| Botón | Pantalla | Para qué sirve |
|---|---|---|
| **Inicio** | Inicio | Resumen del mes, cuentas, transacciones y analítica. |
| **Avisos** | Centro de avisos | Todo lo que requiere atención. Muestra un contador con la cantidad de avisos (hasta "99+"). |
| **Bienes** | Bienes | Muebles e inmuebles, historial, ficha y alquileres. |
| **Obligaciones** | Obligaciones | Impuestos, servicios y otros compromisos con sus vencimientos y pagos. |
| **Perfil** | Perfil | Foto, datos de la cuenta, Logs, acciones de cuenta y cierre de sesión. |
| **Configuración** | Configuración | Cuentas, Avisos de saldo, Titular, Inquilino, Proveedor y Categorías. Muestra un indicador cuando hay avisos de saldo o de alquiler. |

### 3.2 Árbol de pantallas y ventanas

```
Iniciar sesión / Registrarse
 └─ Restablecer contraseña (desde el enlace del correo)

Inicio
 ├─ Detalle de Ingresos / Gastos / Ahorro (movimientos del mes)
 ├─ Tarjetas de cuentas → "Ver cuenta" (lleva a Configuración > Cuentas)
 ├─ Cuotas programadas → Contabilizar / Cancelar cuota
 ├─ Transacción → Ver cobro / Contabilizar ocurrencia / Editar / Eliminar | Omitir ocurrencia | Deshacer cobro
 ├─ Filtrar transacciones
 └─ "+" / "Nueva transacción" → Formulario de transacción (Gasto, Ingreso, Reembolso, Transferencia)

Avisos
 ├─ A cargo de titulares / A cargo de inquilinos (dos grupos, con filtro "Responsable")
 └─ Acciones por aviso: Registrar pago, Resolver, Adjuntar comprobante, Registrar cobro,
    Contabilizar cuota, Revertir pago con motivo (documentos pendientes), Ver obligación, Ver bien, Ver cuentas

Bienes
 ├─ + Nuevo bien
 ├─ Ver (solo lectura) → Ver declaración de alquiler
 ├─ Ver historial → año y mes → detalle del registro → visor de comprobante (con zoom) | Deshacer (con motivo)
 ├─ Ficha → ficha rediseñada (datos, obligaciones, tarjeta de alquiler, documentos y notas, economía)
 │   ├─ Ver alquiler → ventana del alquiler con pestañas: Resumen, Períodos, Contratos, Documentos, Notas
 │   ├─ Ver historial de alquileres → Ver (solo lectura) | Editar | Eliminar
 │   └─ Ver ficha mensual → ventana secundaria con tabla y filtros
 ├─ Editar → Eliminar (si no tiene movimientos asociados)
 └─ Declarar alquiler / Editar alquiler → Declaración de alquiler (→ Nueva obligación apilada)

Obligaciones
 ├─ + Nueva obligación
 └─ Por obligación: Registrar pago, Editar, Eliminar, Nota, Adjuntar documento, Ver notas y documentos
    Por vencimiento: Editar, Registrar pago, Revertir pago, Cancelar, Resolver, Adjuntar comprobante, Anular resolución

Perfil
 ├─ Logs (pantalla propia, con filtros y Deshacer)
 ├─ Acciones de cuenta → Cambiar email / Cambiar contraseña / Eliminar mi cuenta
 └─ Cerrar sesión

Configuración
 ├─ Cuentas (cuentas, sub-cuentas, conciliación, transferencias y conversiones)
 ├─ Avisos (preferencias de avisos de saldo y pronóstico)
 ├─ Titular
 ├─ Inquilino
 ├─ Proveedor
 └─ Categorías → Nueva / Editar / Agregar subcategoría / Eliminar
```

---

## 4. Acceso: inicio de sesión y registro

**Propósito:** entrar a la aplicación o crear una cuenta nueva.

### 4.1 Elementos de la pantalla

- **Selector de experiencia:** "Móvil" o "Escritorio". La elección se recuerda en el dispositivo. Si no se elige nada, se usa la experiencia **Escritorio**.
- Pestañas **Iniciar sesión** y **Registrarse**.
- Enlace **¿Olvidaste tu contraseña?**
- Botón **Limpiar caché y recargar**: borra la caché de la aplicación instalada y la recarga (útil si la versión parece desactualizada).
- **Versión** de la aplicación con un desplegable de novedades por versión.

### 4.2 Flujos

**Iniciar sesión**
1. Escribir el **nombre de usuario** (no el email) y la contraseña.
2. Pulsar **Iniciar sesión**. Si los datos no coinciden, se muestra "Credenciales inválidas" (sin indicar cuál dato falló).

**Registrarse**
1. Completar **Nombre** (será el nombre de usuario), **Email** y **Contraseña** (mínimo 6 caracteres).
2. Pulsar **Crear cuenta**. La sesión se inicia automáticamente.
3. Reglas: el nombre de usuario y el email deben ser únicos; el email debe tener formato válido. La cuenta nueva empieza sin categorías.

**Recuperar la contraseña**
1. Pulsar **¿Olvidaste tu contraseña?**, escribir el email y pulsar **Enviar enlace**.
2. Siempre se muestra "Si el email existe, recibirás un enlace" (no revela si la cuenta existe).
3. El enlace recibido por correo es válido durante **1 hora** y sirve una sola vez. Abre la pantalla para definir la nueva contraseña (mínimo 6 caracteres).

**Sesión:** dura 7 días y se renueva con el uso. Se conserva aunque el servidor se reinicie.

---

## 5. Inicio

**Propósito:** ver de un vistazo el mes elegido: cuánto entró, cuánto salió, cuánto se ahorró, los saldos de las cuentas, las transacciones y la analítica.

### 5.1 Experiencias Móvil y Escritorio

| Elemento | Móvil | Escritorio |
|---|---|---|
| Selector de mes | Arriba | En la barra de controles |
| Tarjetas Ingresos / Gastos / Ahorro | Sí | Sí, con íconos |
| Tarjetas de cuentas | Sí | Sí |
| Alta de transacción | Botón flotante **+** | Botón **Nueva transacción** |
| Transacciones y Analítica | Una columna | Dos paneles lado a lado |
| Favorito de analítica | No | Sí (ver 5.6) |

### 5.2 Selector de mes

Permite ir a meses anteriores y **futuros** (para ver lo programado). Al tocar el **nombre del mes** se abre un selector con los doce meses, que se ajusta al ancho de la pantalla sin cortar nombres ni desplazarse en horizontal; al tocar el **año**, una **lista desplegable de años con desplazamiento**, centrada en el año elegido (se conserva el mes elegido).

### 5.3 Tarjetas de métricas

- **Ingresos**, **Gastos** (gastos menos reembolsos) y **Ahorro** (ingresos menos gastos netos).
- Se muestran **por moneda, sin conversión**: si hay movimientos en ARS y EUR, la tarjeta muestra ambos importes separados por "/".
- El ahorro se colorea según el signo (positivo / negativo).
- Al pulsar una tarjeta se abre el **detalle del resumen económico**: la lista de movimientos reales del mes que forman esa cifra (fecha, concepto, tipo, importe y cuenta).

### 5.4 Cuentas

- Una tarjeta por cuenta activa con nombre, marca "Principal", moneda y saldo.
- El saldo solo se muestra si la cuenta está **conciliada**; si no, aparece "—" (Saldo sin conciliar). Ver 12.1.
- **Ver cuenta** lleva a Configuración > Cuentas.
- **Ocultar importes / Mostrar importes** (y el botón con forma de ojo): son dos preferencias independientes que se recuerdan en el dispositivo. El ojo de Inicio oculta con "••••••" las tarjetas de **Ingresos, Gastos y Ahorro** (y los importes de Inicio); el botón **Ocultar importes** de Configuración oculta solo los **saldos de las cuentas**. Uno no modifica al otro.

### 5.5 Transacciones del mes

- Agrupadas por día, con ícono y color según el tipo: gasto 💸, ingreso 💰, reembolso ↩️, transferencia ↔️.
- Debajo del título se ve la categoría (gastos), "Ingreso (A/B/Mixto)", "Reembolso" o, en transferencias, el estado ("Contabilizada" o "Programada") y las cuentas.
- **Filtrar / Filtro**: tipo (Gasto, Ingreso, Reembolso, Transferencia o conversión), cuenta, categoría (con subcategorías), clasificación (Fijo / Variable), texto, monto mínimo y máximo, y rango de fechas. Para filtrar por monto hay que elegir una cuenta (una sola moneda). Con filtros activos el botón muestra "Filtrando". **Limpiar** los quita.
- **Cuotas programadas (no incluidas en los totales):** si existen compras en cuotas, se listan las cuotas que vencen en el mes; al pulsar una se puede **Contabilizar cuota** (la convierte en gasto real) o **Cancelar cuota**.

**Al pulsar una transacción** se abre su detalle (título, categoría, Fijo/Variable, fecha, cuenta, importe y comentarios) con estas acciones:

| Acción | Cuándo aparece | Qué hace |
|---|---|---|
| **Ver** | Cobros de alquiler | Muestra el cobro completo del mes (todas sus modalidades). |
| **Contabilizar ocurrencia** | Ocurrencia de un gasto recurrente, con fecha de hoy o anterior, no contabilizada | La convierte en movimiento real. |
| **Editar** | Siempre | Abre el formulario precargado. |
| **Eliminar** | Transacciones comunes | Borra la transacción, salvo las excepciones de 14.6. |
| **Omitir ocurrencia** | Ocurrencias recurrentes no contabilizadas | Salta esa ocurrencia sin borrar la serie. |
| **Deshacer cobro** | Cobros de alquiler | Pide un **Motivo** obligatorio (hasta 500 caracteres). El mes vuelve a quedar pendiente de cobro. |

Las transferencias abren un detalle propio (importe enviado → recibido, débito total, tasa efectiva, comisión y nota) con el botón **Administrar transferencias** (lleva a Configuración > Cuentas).

### 5.6 Analítica

Se calcula en la **moneda principal de la aplicación** (ARS por defecto) para el mes elegido:

| Bloque | Contenido |
|---|---|
| **Distribución de gastos** | Gráfico de dona por categoría principal (las subcategorías suman en su categoría padre). |
| **Gastos por categoría** | Desplegable con barras por categoría y subcategoría y su porcentaje sobre el gasto neto. |
| **Fijo vs Variable** | Dona con el reparto de gastos fijos y variables y sus porcentajes. |
| **Ingresos A vs B** | Una dona por titular y moneda con el reparto A/B. |
| **IVA mensual por titular** | IVA del **mes elegido** en cuatro columnas: **Titular**, **Débito fiscal** (IVA de los ingresos A del titular), **Crédito fiscal** (IVA de los gastos facturados a ese titular) y **Saldo** = crédito fiscal − débito fiscal (negativo: IVA a pagar; positivo: saldo a favor). Una fila por titular (0 si no tuvo IVA ese mes); con varias monedas se muestran separadas por "·". Sigue al selector de mes. |

En la experiencia **Escritorio**, cada gráfico tiene una estrella (☆/★) para marcarlo como **favorito**; el favorito se muestra junto a las tarjetas de métricas. Solo puede haber un favorito, recordado en el dispositivo.

---

## 6. Formulario de transacción

**Propósito:** registrar o editar un gasto, ingreso, reembolso o transferencia. Se abre con **+** / **Nueva transacción** en Inicio, con **Nuevo movimiento en esta cuenta** en el detalle de una cuenta o con **Editar** en una transacción.

### 6.1 Tipos

| Tipo | Efecto | Campos propios |
|---|---|---|
| **Gasto** | Resta del saldo; suma a gastos. | Categoría (obligatoria), Clasificación Fijo/Variable (por defecto Variable), Recurrente, IVA (%) de la factura y **Factura a nombre de** (crédito fiscal). |
| **Ingreso** | Suma al saldo; suma a ingresos. | Clasificación A / B / Mixto (por defecto A), desglose Mixto, IVA (%). |
| **Reembolso** | Suma al saldo; **reduce** el gasto de su categoría. No es ingreso. | Categoría (obligatoria), Gasto de origen (opcional). |
| **Transferencia** | Solo mueve saldo entre cuentas. | Cuenta de salida, Cuenta de ingreso, Monto, Monto recibido, Fecha, Título, Nota. Solo en altas. |

### 6.2 Campos comunes (gasto, ingreso, reembolso)

- **Cuenta:** lista de cuentas activas con sus sub-cuentas. Por defecto, la cuenta principal. El importe se interpreta en la moneda de la cuenta; cambiar de cuenta **no convierte** el importe.
- **Medio de pago reutilizable:** lista de medios guardados, con botones **Crear medio reutilizable**, **Renombrar medio** y **Eliminar medio**. También admite una **etiqueta** de texto libre.
- **Atribución del movimiento:** permite indicar a qué bien, obligación, vencimiento, contrato o período de alquiler corresponde el importe (una o varias líneas, con opción "Asignación completa"). Es descriptivo: **no crea movimientos ni cambia los totales**. Alimenta el análisis económico del bien.
- **Título (opcional):** si se deja vacío en gastos y reembolsos, se usa el nombre de la categoría.
- **Monto:** formato monetario local (por ejemplo, "211.392,00"). Debe ser positivo.
- **Fecha:** por defecto, hoy.
- **Comentarios:** texto libre.

### 6.3 Reglas por tipo

**Gasto recurrente**
- Casilla **Recurrente** (solo gastos), con **Frecuencia**: Mensual, Bimensual, Trimestral, Semestral o Anual.
- **Fecha fin** opcional o **Indeterminado**.
- Cada mes la serie genera una **ocurrencia programada** el mismo día del mes. La ocurrencia figura como "Programada" y **no suma a los totales de Inicio hasta que se contabiliza** ("Contabilizar ocurrencia"). Solo se pueden contabilizar ocurrencias de hoy o fechas pasadas.
- Al editar una ocurrencia se elige **Aplicar cambios**: "Solo esta ocurrencia" o "Esta ocurrencia y las futuras".

**Ingreso A / B / Mixto**
- **A:** ingreso declarado (facturado). Admite **IVA (%)** entre 0 y 100.
- **B:** ingreso no declarado (en efectivo, sin facturar). No admite IVA.
- **Mixto:** se reparte en importe A + importe B, que deben sumar exactamente el monto total. Al escribir A, B se completa con el resto. El IVA aplica solo sobre la parte A.
- El IVA de un ingreso es **débito fiscal** del titular de la cuenta de destino.

**Gasto con factura (IVA)**
- Opcional: **IVA (%) de la factura** entre 0 y 100. El IVA se calcula sobre el monto del gasto (1.000.000 al 21% = 210.000) y es **crédito fiscal**.
- **Factura a nombre de:** titular que recibe el crédito fiscal. Por defecto, "Titular de la cuenta" (el titular de la cuenta con la que se paga).
- Sin IVA (vacío o 0) el gasto no afecta al IVA mensual.

**Compra en cuotas (tarjeta de crédito)**
- Aparece solo en gastos nuevos pagados con un medio reutilizable de tipo tarjeta de crédito.
- Campos: **Cantidad de cuotas** (2 a 120), **Día de vencimiento** (1 a 31) e **Interés %** opcional (0 a 1000).
- No registra ningún gasto al crearse: genera **cuotas programadas** que se contabilizan una por una (desde Inicio o desde Avisos). Solo admite atribución a un bien.

**Transferencia**
- Las cuentas de salida e ingreso deben ser distintas.
- Si las monedas son distintas, se pide el **Monto recibido** (no se consulta ninguna cotización).
- La fecha no puede ser futura. Se registra como contabilizada, sin comisión.
- No afecta ingresos, gastos ni ahorro; solo los saldos.

---

## 7. Avisos

**Propósito:** centro único con todo lo que requiere atención. Solo lee información y delega cada acción en el módulo correspondiente.

### 7.1 Elementos

- Título con la cantidad de avisos pendientes.
- **Filtros:** tipo de aviso, **Responsable** (titular o inquilino) y bien.
- Dos grupos principales, cada uno con su título y contador: **A cargo de titulares** y **A cargo de inquilinos**. Un grupo sin avisos muestra un mensaje ("No hay obligaciones a cargo del inquilino."). El grupo se identifica por el texto del título, no solo por el color.
- Dentro de cada grupo, los avisos se agrupan por tipo y se ordenan por fecha. Cada tarjeta muestra título, fecha (o "Vencido · fecha" en rojo) y un mensaje en lenguaje claro.
- Todo aviso tiene un responsable: son del **inquilino** los avisos de comprobantes pendientes de inquilinos, alquileres pendientes de cobro, contratos por vencer y ajustes de alquiler; el resto son del **titular**. Un aviso de documento pendiente sigue al responsable de su obligación.

### 7.2 Tipos de aviso

| Grupo | Cuándo aparece | Acciones |
|---|---|---|
| **Obligaciones vencidas** | Vencimiento impago con fecha pasada. | Registrar pago, Adjuntar comprobante, Ver obligación |
| **Próximos vencimientos** | Vencimiento impago dentro de los días de aviso de la obligación (por defecto 7). | Registrar pago, Adjuntar comprobante, Ver obligación |
| **Pagos parciales** | Vencimiento con un pago menor al importe. | Registrar pago, Adjuntar comprobante, Ver obligación |
| **Comprobantes pendientes de inquilinos** | La parte del inquilino no tiene resolución registrada. | Resolver, Adjuntar comprobante, Ver obligación |
| **Alquileres pendientes de cobro** | Mes de alquiler sin cobrar (vencido o dentro de los días de aviso de Configuración > Avisos, por defecto 5). | Registrar cobro, Ver bien |
| **Cheques por cobrar** | Cobro de alquiler con medio **Cheque** no marcado como cobrado, cuya fecha de cobro llega en 7 días o menos (o ya pasó). Indica bien, inquilino, período y importe. | Marcar como cobrado, Ver cobro, Ver bien |
| **Cuotas de tarjeta** | Cuota programada vencida o dentro de sus días de aviso (por defecto 5). | Contabilizar cuota, Ver transacciones |
| **Contratos por vencer** | Contrato de alquiler que vence en los próximos 30 días. | Ver bien |
| **Ajustes de alquiler** | Ajuste de alquiler en los próximos 30 días. | Ver bien |
| **Documentos pendientes** | Vencimiento pagado en los últimos 60 días sin comprobante adjunto. | Adjuntar comprobante, Revertir pago, Ver obligación |
| **Saldo insuficiente en cuentas** | El pronóstico de una cuenta conciliada indica que no alcanza para un pago próximo. | Ver cuentas |

Reglas generales: se consideran avisos hasta 90 días hacia adelante y se muestran como máximo 200. Los vencimientos cancelados o resueltos no generan avisos.

### 7.3 Flujos desde Avisos

- **Registrar pago:** abre el mismo formulario de pago de Obligaciones (ver 11.5).
- **Resolver:** abre el registro de resolución por el inquilino (ver 11.6).
- **Adjuntar comprobante:** permite elegir un archivo (PDF, PNG, JPG, WebP o texto) que queda vinculado al vencimiento.
- **Registrar cobro:** abre **Cobrar mes** solo para el mes seleccionado (ver 10.4).
- **Contabilizar cuota:** pide el importe (precargado con el previsto) y lo registra como gasto.
- **Revertir pago:** solo en avisos de documentos pendientes (ver 11.7).

---

## 8. Categorías

**Propósito:** administrar la clasificación propia de gastos y reembolsos. Se gestiona desde **Configuración > Categorías** (ya no hay un botón propio en la barra de navegación; la dirección anterior `/categories` redirige a esa sección).

- Lista jerárquica: categorías principales con sus subcategorías debajo y el contador de subcategorías.
- **+ Nueva:** nombre (obligatorio), **Categoría padre** opcional y **Color** (paleta de 12 colores).
- Botones por categoría: **Agregar subcategoría**, **Editar** (nombre, padre y color) y **Eliminar** (con confirmación).

**Reglas**
- Un solo nivel de jerarquía: no se pueden crear subcategorías de una subcategoría y una categoría no puede ser su propio padre.
- No se puede eliminar una categoría que tenga transacciones o comisiones de transferencias asociadas.
- Los ingresos no usan categoría.
- Las categorías también se usan en obligaciones y como categoría de gasto de los proveedores.

---

## 9. Bienes

**Propósito:** registrar el patrimonio (muebles e inmuebles), sus titulares, sus obligaciones y, en el caso de inmuebles, sus alquileres.

### 9.1 Lista de bienes

- **Avisos de alquiler** (si existen): accesos rápidos a alquileres pendientes y vencimientos de contratos.
- **Filtros:** cada campo tiene su etiqueta visible encima: **Buscar** (nombre o detalle), **Tipo de bien** (Mueble / Inmueble), **Titular legal**, **Estado**, **Uso** y **Ubicación**. Los buscadores de Obligaciones (Bien, Proveedor, Estado, Tipo, Desde, Hasta) y Avisos (Tipo de aviso, Responsable, Bien) también muestran etiquetas visibles.
- Cada bien muestra nombre, tipo, datos principales, estado y titulares, con estos botones:

| Botón | Qué hace |
|---|---|
| **Ver** | Abre el formulario del bien en modo solo lectura. En inmuebles alquilados ofrece **Ver declaración de alquiler**. |
| **Ver historial** | Historial tipado del bien por año y mes (ver 9.3). |
| **Ficha** | Ficha rediseñada del bien (ver 9.4). |
| **Editar** | Formulario editable. |
| **Ver alquiler** (inmuebles con alquiler vigente) | Abre la ventana del alquiler (ver 10.5). |
| **Declarar alquiler / Editar alquiler** (inmuebles) | Abre la declaración de alquiler (ver 10). |

### 9.2 Alta y edición de un bien

1. Pulsar **+ Nuevo bien** (o **Editar**).
2. Elegir la **Clasificación**: Mueble o Inmueble (no se puede cambiar después de crear el bien).
3. Cargar los **titulares**: elegir un titular de la lista (los creados en Configuración > Titular). Con **Agregar titular** se suman más; con dos o más titulares se pide el **porcentaje** de cada uno y el total debe sumar 100%.
4. Completar el **Título** (nombre visible del bien, obligatorio).
5. Completar los campos según la clasificación:

| Mueble | Inmueble |
|---|---|
| Tipo (Automóvil) | Tipo: Departamento, Casa, Galpón, Lote o un **tipo propio** (obligatorio). Con **Agregar tipo…** se crea uno nuevo (hasta 50 caracteres, sin repetir ninguno existente aunque cambien mayúsculas o acentos) y queda seleccionado. Los tipos propios no se renombran ni se eliminan, y los contratos de esos bienes usan el tipo "residencial". |
| Marca | Características |
| Dominio | Ubicación |
| KMs | Superficie cubierta (m²) y Superficie libre (m²), enteros ≥ 0 |
| Color | Identificación catastral (texto opcional, hasta 100 caracteres) |
| | Fecha de construcción (no futura); la **Antigüedad** se calcula sola en años, o en meses si es menor a un año |
| | **Obligaciones del bien**: lista de obligaciones asignadas, con su proveedor y número de cuenta/contrato, y un selector "A cargo de" (Titular / Inquilino; Inquilino solo si hay alquiler vigente). Botón **Nueva obligación**. |

6. Escribir **Notas** si se desea.
7. Pulsar **Crear bien**. Al editar, **Guardar cambios** muestra primero un aviso de confirmación ("Estás por modificar datos del bien...") con **Confirmar y guardar** o **Volver**. Al editar también aparece **Eliminar** (ver 9.5).

La condición de alquilado **no** se pide al crear el bien: se declara después (ver 10).

### 9.3 Ver historial (historial del bien)

1. Pulsar **Ver historial** en un bien.
2. Elegir el **Año** y, aparte, el **Mes** (o **Todo el año**). **Hoy** vuelve al mes actual. El listado se actualiza sin cerrar la ventana.
3. Cada fila de la tabla muestra fecha, concepto, tipo (obligación, alquiler, ajuste, evento o reversión), responsable (titular o inquilino), proveedor o inquilino, importe esperado, ejecutado, saldo, estado y acción. Cuando se ve un año, los registros se agrupan por mes. El estado se informa con texto e ícono, no solo con color (Pendiente, Vencido, Parcial, Pagado, Cobrado, Resuelto, Revertido, Cancelado).
4. **Ver detalle** abre el registro: tipo, fecha, concepto, bien, responsable, importes, estado, **pagos o cobros** (fecha, importe, cuenta, medio, título y notas), pagos revertidos, **comprobantes** y **notas**. Desde el detalle se puede **Registrar pago**, **Resolver**, **Registrar cobro**, **Adjuntar comprobante** y **Agregar nota**, según el estado del registro. Un único botón **Deshacer** sirve para revertir un pago, anular una resolución o deshacer un cobro: pide un **Motivo** obligatorio, que luego se ve en el detalle.
5. Al pulsar un comprobante se abre el **visor**: imágenes con **Alejar**, **Acercar** y **100%**; PDF y texto en un marco integrado; botones **Abrir** y **Descargar**. Los formatos no admitidos solo se pueden descargar.
6. Si no hay registros, aparece "No hay movimientos en este período.".

### 9.4 Ficha del bien

Ventana rediseñada con estos bloques:

- **Encabezado** con el nombre y los datos principales del bien, y accesos a **Editar**, **Ver historial**, **Ver ficha mensual** y **Eliminar** (ver 9.5).
- **Datos del bien** y notas.
- **Obligaciones del bien** con su responsable, próximo vencimiento y acciones (**Registrar pago**, **Resolver**).
- **Tarjeta de alquiler** (inmuebles): resumen del alquiler vigente con **Ver alquiler** (abre la ventana del alquiler, ver 10.5), **Ver historial de alquileres** y la declaración o edición del alquiler. Sin alquiler vigente muestra "Este inmueble no tiene un alquiler activo." con la acción para declararlo.
- **Documentos y notas del bien:** documentos (PDF, PNG, JPEG, WebP o texto; máximo 20 MiB) con filtros por nombre, tipo y fecha, **Ver**, **Descargar** y **Eliminar** (con confirmación); notas con fecha, título opcional, filtro por rango de fechas, orden, **Editar** y **Eliminar** (con confirmación).
- **Economía del bien:** ficha del bien (titulares vigentes, inquilino actual, alquiler cobrado este mes, costo de mantenimiento de los últimos 12 meses, pendientes), **gastos recuperables e importes pendientes** (**Registrar gasto recuperable** y **Registrar reintegro**), **análisis económico** por mes, año o rango (solo movimientos reales; lo pendiente se muestra aparte) y la **ficha mensual**.
- **Ficha mensual:** el botón **Ver ficha mensual** abre una ventana secundaria ancha (no se muestra dentro de la ficha). Permite elegir año o rango de meses (hasta 36; la pantalla lo indica) y filtrar por tipo (alquiler u obligación), responsable, estado, modalidad y texto o proveedor. La tabla tiene las columnas Período, Concepto, Responsable, Esperado, Ejecutado, Estado, Comprobante y Acción, con los importes por moneda sin conversión y los totales de lo visible. Las acciones son las de la pestaña Períodos. En el celular cada fila se muestra como tarjeta desplegable. Sin resultados: "No hay movimientos en este período.".
- **Historial de titularidad** (titular, porcentaje y período) y **historial de estados**.

### 9.5 Reglas de bienes

- Un bien debe tener al menos un titular; con varios titulares, cada porcentaje debe ser mayor que 0 y el total debe ser 100%.
- La titularidad se registra con fechas. Un mismo titular no puede tener dos períodos de titularidad que se solapen, y la suma de porcentajes de titulares simultáneos no puede superar el 100%.
- **Eliminar un bien** (desde la ficha o desde la edición) abre una confirmación de peligro y no envía nada hasta confirmar. Solo se puede eliminar un bien sin referencias: si tiene movimientos, obligaciones, alquileres, documentos, notas, gastos a recuperar o planes de cuotas, la aplicación lo rechaza y muestra el motivo ("No se puede eliminar el bien porque tiene ... asociados"). Al eliminarlo se borran también sus titularidades y su historial de estados. La eliminación queda registrada en Logs y no se puede deshacer.

---

## 10. Declaración de alquiler y cobros

**Propósito:** registrar que un inmueble está alquilado, con qué modalidades y montos, y cobrar cada mes.

### 10.1 Modalidades

Un mismo alquiler puede componerse de **una, dos o las tres** modalidades. El mes se considera cobrado solo cuando se cobran **todas** sus modalidades.

| Modalidad | Campos | IVA | Clasificación del cobro por defecto |
|---|---|---|---|
| **Contrato de locación** | Fecha de inicio, Fecha de finalización, Monto original, IVA (%), Moneda, Frecuencia de ajuste (meses), Criterio de ajuste | Sí: se suma al monto original ("Total con IVA") | **A** (declarado) |
| **Comodato** | Igual, sin IVA | No | **B** (sin facturar) |
| **Mutuo** | Igual, sin IVA | No | **B** (sin facturar) |

### 10.2 Declarar un alquiler (paso a paso)

1. En Bienes, pulsar **Declarar alquiler** en un inmueble (o desde su ficha).
2. Elegir uno o varios **Inquilinos** (los cargados en Configuración > Inquilino).
3. Marcar las **modalidades** con sus casillas; para cada una se abre su bloque de datos. Moneda por defecto: ARS. Al desmarcar una modalidad con datos se pide confirmación ("Descartar datos" / "Mantener").
4. En **Obligaciones del bien**, indicar para cada obligación si está **a cargo del Titular o del Inquilino**. Con **Nueva obligación** se abre el formulario de obligación encima de la declaración, sin perder lo cargado.
5. Escribir **Notas** compartidas.
6. Pulsar **Guardar**.

**Reglas**
- Se requiere al menos una modalidad, al menos un inquilino, y un monto original positivo y una fecha de inicio para cada modalidad.
- Los meses de alquiler son mensuales y vencen el **mismo día del mes que la fecha de inicio**.
- Un inmueble no puede tener dos alquileres con fechas superpuestas. Si ocurre, el error ofrece **Declarar la finalización del alquiler vigente**. Sí se puede declarar un alquiler nuevo que no se superponga (**Declarar nuevo alquiler**).
- Al **editar** la declaración se pide confirmación: los períodos sin cobrar se regeneran con los nuevos datos. Los períodos ya cobrados no se reescriben.
- Si se cierra la declaración sin guardar después de crear obligaciones desde ella, esas obligaciones quedan a cargo del propietario.

### 10.3 Finalizar un alquiler

- **Finalizar alquiler** pide la **Fecha de finalización** (por defecto, hoy). Puede ser anticipada.
- Finaliza todas las modalidades, cancela los períodos sin cobrar posteriores a la fecha y conserva los cobros registrados.
- Las fechas posteriores quedan libres para un alquiler nuevo. Las obligaciones a cargo del inquilino vuelven al propietario cuando el contrato termina.

### 10.4 Cobrar un mes ("Cobrar mes" / "Registrar cobro")

Se abre desde **Avisos** (Registrar cobro), desde los meses de alquiler o desde **Próximos vencimientos / Pagos atrasados** de la ficha. Cobra **solo el mes seleccionado**.

1. Para cada modalidad con saldo pendiente se muestra una línea con: **Importe** (precargado con el saldo pendiente), **Clasificación** (A declarado / B sin facturar; locación por defecto A y comodato/mutuo por defecto B), el IVA incluido si es A con IVA, **Fecha de cobro**, **Medio de cobro** y **Cuenta de destino** (de la misma moneda). Opcionalmente se adjunta el **Comprobante de pago**.
2. Pulsar **Registrar cobro**.
3. Cada línea se registra como un **ingreso real** en su cuenta. Todas las líneas del mes forman un único cobro.

**Pago parcial.** Si el importe es inferior al total pendiente, se pregunta si se trata de un pago parcial. **No** vuelve al formulario con los valores cargados; **Sí** registra el cobro y el período queda **Parcialmente cancelado**, mostrando el **saldo pendiente** en Períodos, en el historial del bien y en la ventana del alquiler. Los cobros siguientes se suman hasta cancelar el saldo; deshacer un cobro recalcula el estado.

**Cheque.** Con el medio de cobro **Cheque** se pide **Días** (obligatorio, de 1 a 365). La fecha de cobro del cheque es la fecha de cobro más esos días, y el ingreso se registra en esa fecha. Cuando faltan 7 días o menos (o la fecha ya pasó) y el cheque no está marcado como cobrado, aparece el aviso **Cheques por cobrar**, desde donde se puede **Marcar como cobrado** (se puede deshacer desde Logs, con motivo).

Desde la tarjeta de un contrato también existe **Registrar cobro** multi-período: se marcan uno o varios períodos, se reparte el importe total recibido y la parte no asignada queda visible.

### 10.5 Ventana del alquiler ("Ver alquiler")

Se abre desde la tarjeta de alquiler de la ficha (y desde los avisos de alquiler). Es una ventana ancha con un **encabezado fijo** y cinco pestañas (en el celular ocupa toda la pantalla y las pestañas se desplazan horizontalmente).

- **Encabezado:** estado del alquiler (Activo, Por vencer, Por comenzar o Finalizado, con texto e ícono), inquilinos, vigencia, monto mensual vigente por moneda, próximo cobro, próximo vencimiento y las acciones **Editar alquiler**, **Actualizar alquiler** y **Finalizar alquiler**.
- **Resumen:** una tarjeta por modalidad (estado, vigencia, monto original y vigente, clasificación, IVA, ajuste y próximo ajuste), el progreso de cobros (esperados, cobrados, parciales, vencidos, pendientes y cancelados) y las alertas del alquiler con su acción; las alertas de alquiler vencido se muestran en rojo y negrita.
- **Períodos:** una fila por mes con el vencimiento, una columna por modalidad, las obligaciones del titular y del inquilino de ese mes, el total por moneda, el estado consolidado y las acciones **Registrar cobro**, **Deshacer cobro** (con confirmación), **Cancelar período** (con confirmación; solo sin cobros) y **Ver detalle**. Filtros por año, mes, estado, tipo, responsable, modalidad, proveedor y texto. Las obligaciones del mes ofrecen **Registrar pago**, **Resolver**, **Anular resolución** y **Revertir pago**. Sin períodos que coincidan: "No hay períodos pendientes de cobro." u otro mensaje con **Limpiar filtros**.
- **Contratos:** una tarjeta por modalidad con su vigencia, importes, clasificación y ajuste; si el contrato tiene un documento adjunto, la tarjeta ofrece **Ver documento** (abre el visor) y **Descargar documento**. **Registrar cobro** no aparece aquí (queda en Resumen y Períodos). **Actualizar alquiler** registra un ajuste (importe manual, porcentaje o índice) eligiendo entre los próximos vencimientos y muestra antes una vista previa ("Desde <mes>, el alquiler pasa de X a Y. Se actualizarán N períodos futuros no cobrados."); los períodos ya cobrados no se modifican. **Finalizar contrato** termina solo esa modalidad (pide la fecha y una confirmación que lista los períodos que se cancelan); si el contrato ya estaba finalizado, el servidor responde "No se puede finalizar este contrato porque ya está finalizado.".
- **Documentos:** ver 10.8.
- **Notas:** ver 10.8.

Reglas:
- Un período con cobros no se puede cancelar ("No se puede cancelar este período porque tiene cobros registrados.") y un período ya cobrado no admite otro cobro ("No se puede registrar un cobro porque el período ya está cobrado.").
- Los importes se muestran por moneda, sin conversión.

### 10.6 Deshacer un cobro

Para corregir un cobro mal registrado (cuenta, clasificación o importe equivocados):

1. Pulsar **Deshacer cobro** (en el mes de alquiler o en la transacción de Inicio).
2. Completar el **Motivo** (obligatorio, hasta 500 caracteres) y confirmar.
3. Se eliminan juntos todos los ingresos del mes cobrado (todas las modalidades), sus asignaciones y comprobantes. El mes vuelve a figurar como **pendiente de cobro** en Avisos y se puede volver a cobrar correctamente.

**Reglas**
- Un cobro de alquiler **no se edita**: se deshace y se registra de nuevo.
- El motivo queda guardado en el historial del bien y en Logs. Sin motivo, el servidor rechaza el pedido ("Indicá el motivo (hasta 500 caracteres)").
- Si la cuenta estaba conciliada, la conciliación se reinicia y se avisa ("La conciliación de la cuenta quedó pendiente de revisar").
- Solo bloquea el deshacer un movimiento dependiente (por ejemplo, un reembolso o una conversión vinculados).

### 10.7 Histórico de alquileres, edición y eliminación

- **Ver historial de alquileres** (tarjeta de alquiler de la ficha) lista todos los alquileres del inmueble con su vigencia, inquilinos, modalidades y estado. **Ver** abre el alquiler en solo lectura (el vigente abre la ventana normal).
- Un alquiler **finalizado** puede **editarse** solo si no tiene cobros, documentos, notas ni obligaciones vinculadas; si las tiene, la pantalla lo explica.
- Un alquiler finalizado puede **eliminarse** con una confirmación fuerte que muestra el impacto (períodos, documentos, notas y obligaciones vinculadas). El servidor lo rechaza mientras el alquiler esté vigente ("Finalizá el alquiler antes de eliminarlo") o tenga cobros sin deshacer ("No se puede eliminar este alquiler porque tiene cobros registrados. Deshacé los cobros primero."). Al eliminar se borran sus períodos, contratos, notas y documentos exclusivos del alquiler; los demás documentos quedan desvinculados, las obligaciones vinculadas pasan a no tener contrato y queda un registro de auditoría. Los cobros ya deshechos se conservan.

### 10.8 Documentos y notas del alquiler

- **Documentos:** lista los documentos del alquiler, de sus contratos y de sus períodos, con fecha de carga y, si existe, quién los cargó. Se pueden cargar (a todo el alquiler o a una modalidad), **Ver**, **Descargar** y **Eliminar** (con confirmación; se borra el archivo y se quita de las resoluciones que lo listaban). Filtros por nombre, tipo y fecha. Vacío: "No hay documentos cargados." con la acción de cargar.
- **Notas:** con fecha, título opcional (hasta 120 caracteres) y texto, por ejemplo "16/11/2026 · Título de la nota". Se pueden crear, **Editar** y **Eliminar** (con confirmación), filtrar por rango de fechas y ordenar por fecha. Sin resultados: "No hay notas en este rango de fechas.".

---

## 11. Obligaciones

**Propósito:** administrar impuestos, servicios, seguros y otros compromisos, con sus vencimientos, pagos y comprobantes.

### 11.1 Lista

- Resumen "Avisos: N vencidas · M próximas".
- **Filtros:** bien, proveedor, estado (Pendientes, Parciales, Pagadas, Resueltas por inquilino, Vencidas), tipo y rango de fechas.
- Cada obligación se muestra como tarjeta con su nombre y estos datos (etiqueta en negrita):

| Etiqueta | Contenido |
|---|---|
| **Tipo** | Servicios, Seguro, Impuesto, Préstamo, Mantenimiento, Suscripción u Otro |
| **Inmueble** | Bien vinculado |
| **Proveedor** | Proveedor asignado |
| **Responsabilidad** | Propietario o Inquilino (u otra responsabilidad heredada) |
| **Cuenta** | Cuenta de pago, si se definió |
| **Identificador** | Cuenta Nº / Contrato Nº del servicio |
| **Monto estimado** | Importe y moneda |
| **Frecuencia** | Única vez, Mensual, Cada dos meses, Trimestral, Semestral o Anual |
| **Aviso** | Días de anticipación ("El mismo día", "7 días"...) |

### 11.2 Estados de un vencimiento

La tarjeta muestra todos los vencimientos impagos ya vencidos y el próximo pendiente.

| Estado | Cuándo | Cómo se ve |
|---|---|---|
| **Pendiente** | El vencimiento es del **mes en curso** y todavía no pasó el día de vencimiento (incluido). | **Naranja** |
| **Pendiente** | El vencimiento es de un mes posterior. | Gris |
| **Vencido** | Ya pasó el día de vencimiento sin pago completo. | **Rojo y en negrita** |
| **Pagado** | Pago completo, o resuelto por el inquilino. | Etiqueta de resuelto |
| **Cancelado** | Vencimiento cancelado. | Gris |

No existen los estados "Confirmar" ni "Previsto": una obligación asignada ya está confirmada; solo importa si está pendiente de pago.

Cada fila indica también "Pagado X/Y moneda" y, si la obligación es compartida, las porciones de propietario e inquilino.

### 11.3 Crear o editar una obligación

1. Pulsar **+ Nueva obligación** (o **Editar** en la tarjeta).
2. Completar:
   - **Nombre** (obligatorio) y **Tipo**.
   - **Bien** (opcional).
   - **Proveedor** (de Configuración > Proveedor). Al elegirlo, la **Categoría** se precarga con la categoría de gasto del proveedor.
   - **Cuenta o contrato** y **Número de cuenta o contrato**.
   - **Frecuencia**, **Primer vencimiento** (obligatorio) y **Último vencimiento** (opcional).
   - **Aviso**: El mismo día, 7, 15 o 30 días antes, o Personalizado (cantidad de días).
   - **Moneda** (ARS, EUR o USD) e **Importe estimado** (formato monetario).
   - **Categoría**.
   - **Responsable**: Titular o Inquilino. "Inquilino" solo está disponible si el bien tiene un contrato de alquiler activo.
   - **Notas**.
3. Pulsar **Crear obligación** / **Guardar cambios**.

**Reglas de edición**
- Si la obligación ya tiene pagos, los cambios requieren **Aplicar cambios desde** con una fecha futura; no se permiten cambios retroactivos ni sobre versiones anteriores.

### 11.4 Acciones

| Nivel | Acción | Efecto |
|---|---|---|
| Tarjeta | **Registrar pago** | Paga el vencimiento impago más antiguo que se muestra. |
| Tarjeta | **Editar** | Edita la obligación. Si ya tiene pagos pide una confirmación. |
| Tarjeta | **Eliminar** | Pide confirmación. La obligación deja de mostrarse y se cancelan sus vencimientos sin pagos ni resolución; el historial de pagos se conserva. |
| Tarjeta | **Nota**, **Adjuntar documento**, **Ver notas y documentos** | Notas y archivos de la obligación. |
| Tarjeta | **Movimientos atribuidos** | Transacciones atribuidas a la obligación. |
| Vencimiento | **Editar** | Cambia el importe real del vencimiento, solo para ese vencimiento o también para los futuros. |
| Vencimiento | **Registrar pago** | Ver 11.5. |
| Vencimiento | **Cancelar** | Solo si no tiene pagos ni resolución. |
| Vencimiento | **Resolver** / **Resolver (pagó el inquilino)** | Ver 11.6. |
| Vencimiento | **Adjuntar comprobante** | Disponible cuando hay pagos o una resolución. |
| Vencimiento | **Anular resolución** | Pide confirmación. El vencimiento vuelve a figurar como pendiente. |
| Vencimiento | **Revertir pago** | Anula un pago registrado (ver 11.7). Un botón por pago. |

### 11.5 Registrar pago (paso a paso)

1. Pulsar **Registrar pago** en la tarjeta, en un vencimiento, en Avisos o en la ficha del bien (**Pagar**).
2. El formulario aparece precargado:
   - **Importe pagado**: por defecto, el saldo pendiente del vencimiento.
   - **Cuenta**: agrupada en "Cuentas de los titulares" y "Otras cuentas", solo de la moneda de la obligación. Se sugiere, en este orden: la cuenta definida en el vencimiento o la obligación; si no, la cuenta del titular con mayor porcentaje del bien; si no, la primera cuenta de esa moneda (con una advertencia).
   - **Fecha de pago** (hoy; no puede ser futura), **Categoría**, **Medio de pago** (opcional), **Título** (opcional, precargado con el nombre), **Notas** (obligatorias, hasta 1000 caracteres) y **Comprobante** (opcional).
3. Pulsar **Registrar pago**.
4. Se crea un **gasto real** (clasificación Variable) en la cuenta elegida: descuenta el saldo y afecta los gastos y el ahorro del mes. El comprobante queda vinculado y se ve en el **historial del bien**.

**Reglas**
- Se permiten pagos parciales; el importe no puede superar lo pendiente.
- Sin notas, el servidor responde "Las notas son obligatorias".
- No se puede pagar un vencimiento cancelado, ya saldado o a cargo del inquilino ("Este pago está a cargo del inquilino. Usá Resolver").
- Se necesita al menos una cuenta activa en la moneda de la obligación.
- Si el pago se registra pero el comprobante falla, se avisa y se puede adjuntar después con **Adjuntar comprobante**.

### 11.6 Obligaciones a cargo del inquilino ("Resolver")

Cuando una obligación está a cargo del inquilino, el propietario no paga: el inquilino debe presentar el comprobante.

1. Mientras no se registre, aparece el aviso **Comprobantes pendientes de inquilinos**.
2. Pulsar **Resolver** e indicar: inquilino (se ofrecen los del contrato de la obligación o, si no tiene, los del alquiler vigente del bien, con el primero preseleccionado), importe pagado por el inquilino, período (AAAA-MM), fecha de resolución, comprobantes existentes o nuevos y **notas obligatorias** (hasta 2000 caracteres).
3. Pulsar **Registrar resolución**.

La resolución **no crea ningún movimiento**: no cambia saldos, ingresos, gastos ni ahorro. Queda constancia en el historial del bien. En obligaciones compartidas, la parte del propietario se paga con **Registrar pago** y la del inquilino se resuelve; el aviso del inquilino aparece cuando la parte del propietario ya está saldada.

### 11.7 Revertir un pago

Para corregir un pago registrado por error sin perder la trazabilidad.

1. Pulsar **Revertir pago** en el vencimiento (Obligaciones), en el detalle del registro del historial del bien, en las obligaciones de la pestaña Períodos del alquiler, en un aviso de **Documentos pendientes** o en el detalle de la transacción de Inicio.
2. Se abre una confirmación con la fecha, el importe, la cuenta, el medio de pago, la obligación, el vencimiento y el comprobante, un **Motivo** obligatorio (hasta 500 caracteres) y el texto: "Estás por revertir un pago registrado. Se anulará el gasto asociado y el vencimiento volverá a pendiente. Esta acción no se puede deshacer. ¿Querés continuar?". No se envía nada hasta confirmar.
3. Al confirmar, el gasto se elimina: el importe vuelve al saldo de la cuenta, bajan los gastos del mes, se recalcula el ahorro y el vencimiento vuelve a Pendiente, Vencido o Parcial (si quedan otros pagos).

**Reglas**
- Se revierte un pago por vez, solo de obligaciones a cargo del titular (las del inquilino se corrigen con **Anular resolución**, que también pide un motivo obligatorio).
- Un pago con movimientos dependientes (reembolso, normalización de transferencia, atribución de movimiento, gasto recuperable o recupero) no se puede revertir: "No se puede revertir este pago porque tiene movimientos dependientes.".
- Un pago ya revertido se rechaza ("Ese pago ya fue revertido") y repetir la solicitud original de pago no lo vuelve a crear ("Ese pago fue revertido; registrá uno nuevo").
- Si la cuenta estaba conciliada, la conciliación se reinicia y se avisa.
- El pago queda como registro **Revertido** en el historial del bien y en el detalle del período, con su motivo y su comprobante (los comprobantes se conservan). Queda un registro específico en Logs ("Revertiste un pago de la obligación ...") con el motivo.

---

## 12. Configuración

**Propósito:** preparar los datos base: cuentas, preferencias de avisos y las personas u organizaciones (titulares, inquilinos y proveedores). Tiene su propio botón **Ocultar importes / Mostrar importes** y seis secciones (Cuentas, Avisos, Titular, Inquilino, Proveedor y Categorías).

### 12.1 Cuentas

**Lista de cuentas:** cada cuenta muestra nombre, marca "Principal" o "Archivada", moneda, titular y saldo (si está conciliada). Las sub-cuentas aparecen indentadas con "↳".

| Acción | Detalle |
|---|---|
| **Agregar cuenta** | Nombre (hasta 80 caracteres), Moneda (ARS, EUR o USD), **Titular de la cuenta** y casilla **Cuenta principal**: si se marca, esa cuenta pasa a ser la principal y la anterior deja de serlo. |
| **Agregar sub-cuenta** | Igual, con moneda propia obligatoria. No puede ser principal. Solo se ofrece en cuentas de primer nivel activas. |
| **Ver movimientos** | Saldo, lista de movimientos de la cuenta y mínimo proyectado. Botón **Nuevo movimiento en esta cuenta**. |
| **Conciliar saldo / Editar conciliación** | Saldo al inicio de una **fecha de referencia** y selección de los movimientos históricos ya incluidos en ese saldo. Desde entonces el saldo se calcula solo. |
| **Editar** | Nombre, titular y moneda (la moneda solo si la cuenta no tiene movimientos ni conciliación). |
| **Hacer principal** | Pasa a ser la cuenta principal (solo cuentas de primer nivel). No se ofrece en la cuenta que ya es principal. |
| **Archivar** | No aplica a la principal; requiere archivar antes las sub-cuentas y no tener recurrencias ni movimientos programados. |
| **Eliminar** | Solo cuentas no principales, sin movimientos y sin sub-cuentas. |

**Reglas:** siempre debe existir exactamente una cuenta principal activa. Para desmarcar "Cuenta principal" al editar la principal hay que elegir en **Nueva cuenta principal** otra cuenta activa de primer nivel; si no hay ninguna elegible, la casilla queda marcada y deshabilitada con una ayuda. Al primer uso, el historial anterior quedó asociado a la cuenta principal en EUR.

**Transferencias y conversiones** (misma sección):
- **Nuevo movimiento entre cuentas:** cuenta de origen, cuenta de destino, importe enviado, importe realmente recibido (obligatorio si cambia la moneda), fecha, estado (**Contabilizada ahora** o **Programada (solo pronóstico)**), descripción, **comisión explícita** opcional con su categoría, e **ingresos a normalizar** (vincular un ingreso de otra moneda que se convierte).
- La tasa se obtiene de los importes reales enviados y recibidos; no se consulta cotización.
- La **comisión** se contabiliza **una sola vez como gasto**; el resto de la transferencia no es ingreso ni gasto.
- Cada transferencia se puede **Editar**, **Eliminar** y, si está programada, **Confirmar y contabilizar**. No se puede editar ni eliminar si tiene conversiones posteriores dependientes.

### 12.2 Avisos (de saldo)

- **Avisar con anticipación** (0 a 30 días; por defecto 5). También fija la anticipación de los avisos de alquiler.
- **Horizonte de pronóstico** (1 a 365 días; por defecto 30).
- **Revisión diaria en el servidor** (sí/no).
- Lista de **avisos de saldo activos** (cuenta, pago, fecha y cuánto falta; indica si una transferencia programada lo cubre) y el **pronóstico** por cuenta conciliada (mínimo del horizonte y próximo pago).
- Son avisos internos: no se envían correos ni notificaciones y no se ejecutan pagos.

### 12.3 Titular, Inquilino y Proveedor

Tres secciones con la misma estructura sobre un único registro de personas y organizaciones. Cada registro puede tener varios **roles**: Propietario (titular), Inquilino, Proveedor, Responsable de pago y Otro; cada sección muestra los registros con su rol.

| Tipo | Campos |
|---|---|
| **Persona** | Nombre y Apellido (obligatorios), DNI (solo números y puntos), Teléfono, Correo electrónico |
| **Organización** | Razón social (obligatoria), CUIL/CUIT, Teléfono, Correo electrónico, Dirección |
| **Ambos** | Roles (al menos uno), Notas generales |
| **Proveedor** | **Categoría de gasto**, obligatoria para organizaciones proveedoras; se precarga al crear obligaciones |

Acciones: **Agregar**, **Ver ficha** (datos, documentos y notas), **Editar** y **Eliminar**. No se puede eliminar un registro en uso en cuentas, bienes, contratos, obligaciones o documentos.

**Dónde se usan:** los titulares en cuentas y bienes; los inquilinos en declaraciones de alquiler; los proveedores en obligaciones.

Al crear un proveedor, el selector de categoría de gasto siempre se carga desde el servidor; si no hay categorías de gasto, se indica "Primero creá una categoría de gastos en Configuración → Categorías.".

### 12.4 Categorías

Sección con el contenido descrito en el capítulo 8 (alta, edición, subcategorías y baja).

---

## 13. Perfil y Logs

### 13.1 Perfil

- **Foto de perfil:** **Cambiar foto** (imagen de hasta 2 MB, se recorta cuadrada) y **Eliminar foto**. Sin foto se muestra la inicial del nombre. La foto se guarda en el servidor.
- **Datos de la cuenta:** usuario y email.
- **Apariencia:** **Modo oscuro** (predeterminado) o **Modo claro**. Se guarda en el dispositivo y se aplica al instante en toda la app.
- **Logs:** abre la pantalla de Logs.
- **Acciones de cuenta:**
  - **Cambiar email:** nuevo email y contraseña actual. El email no puede estar en uso.
  - **Cambiar contraseña:** actual, nueva (mínimo 6) y repetición.
  - **Eliminar mi cuenta:** hay que escribir **ELIMINAR**. Es irreversible y borra la cuenta y **todos** sus datos, incluidos los documentos.
- **Cerrar sesión**.

### 13.2 Logs

**Propósito:** consultar en lenguaje claro todo lo que hizo la persona usuaria.

- Por defecto se muestra **todo**, de lo más nuevo a lo más antiguo.
- Cada renglón tiene a la **izquierda la fecha y hora** y a la derecha la **descripción** de la acción (por ejemplo, "Creaste la subcuenta X de Y"; las acciones sobre obligaciones y cobros incluyen el bien, el importe, el vencimiento y, cuando existe, la cuota y el motivo). Si una acción falló, se agrega "· No se completó".
- **Buscar:** filtra por palabras, sin distinguir mayúsculas ni acentos.
- **Desde / Hasta:** rango de días opcional ("Desde" no puede ser posterior a "Hasta").
- **Filtros:** un panel permite filtrar por **Bien**, **Titular**, **Inquilino** y **Categoría** (se combinan, y el filtro se aplica en el servidor antes de paginar); **Limpiar filtros** los quita junto con la búsqueda y las fechas. Sin resultados se muestra un mensaje de lista vacía. Las entradas anteriores a 1.15.0 no tienen estos datos y no aparecen al filtrar.
- **Deshacer desde Logs:** los pagos, resoluciones y cobros de alquiler registrados ofrecen **Deshacer**, que pide el mismo **Motivo** obligatorio.
- Botón **← Perfil** para volver.
- Se registran todas las acciones de escritura (altas, ediciones, bajas, cobros, pagos, deshacer...). Se guardan solo el tipo de acción, la referencia y el mensaje, nunca contraseñas ni contenidos. Las entradas se conservan **12 meses**.

---

## 14. Reglas de negocio transversales

### 14.1 Cálculo del mes

| Concepto | Regla |
|---|---|
| **Ingresos** | Suma de ingresos contabilizados (incluye cobros de alquiler y reintegros). |
| **Gastos** | Gastos contabilizados menos reembolsos. Incluye pagos de obligaciones, cuotas contabilizadas y comisiones de transferencias. |
| **Ahorro** | Ingresos − gastos netos. Puede ser negativo. |
| **No cuentan** | Transferencias (salvo su comisión), ocurrencias recurrentes no contabilizadas, cuotas programadas, resoluciones de inquilinos, atribuciones y vencimientos pendientes. |

Los totales se calculan **por moneda**, sin conversión.

### 14.2 Reembolsos

Un reembolso reduce el gasto de su categoría y el gasto total; nunca suma a ingresos. Puede vincularse a su gasto de origen.

### 14.3 Clasificación A / B / Mixto e IVA

- **A** = ingreso declarado; **B** = ingreso no declarado (efectivo, sin factura); **Mixto** = A + B, que deben sumar el total.
- Solo la parte A admite IVA (0 a 100%) en ingresos: es débito fiscal. Los gastos con factura admiten IVA (0 a 100%): es crédito fiscal del titular de la factura.
- En alquileres: locación → A (con el IVA del contrato), comodato y mutuo → B; se puede cambiar línea por línea al cobrar.

### 14.4 Cuentas, sub-cuentas y monedas

- Monedas disponibles: ARS, EUR y USD. La moneda principal de la aplicación es ARS por defecto.
- Cada cuenta y sub-cuenta tiene su moneda y su saldo. Los movimientos heredan la moneda de su cuenta.
- El saldo de una cuenta solo se calcula después de conciliarla.

### 14.5 Responsabilidad de las obligaciones

| Responsable | Pago | Efecto en las finanzas |
|---|---|---|
| **Titular (propietario)** | **Registrar pago** desde una cuenta | Gasto real: baja el saldo y el ahorro. |
| **Inquilino** | **Resolver** con comprobante | Ninguno: solo constancia en el historial del bien. |

"Inquilino" requiere un contrato de alquiler activo. Cuando el alquiler termina, las obligaciones del inquilino vuelven al propietario (revisión diaria automática).

### 14.6 Movimientos que no se pueden modificar libremente

| Movimiento | Restricción |
|---|---|
| Pago de una obligación | No se puede editar ni eliminar. Se corrige con **Revertir pago** y se registra uno nuevo. |
| Cobro de alquiler | No se edita: se usa **Deshacer cobro**. |
| Movimiento con atribuciones o reintegros | No se puede cambiar su importe, tipo, cuenta o moneda, ni eliminar. |
| Ingreso que sostiene una conversión | Hay que revertir antes la conversión. |
| Ocurrencia recurrente contabilizada | No se puede omitir. |

### 14.7 Aislamiento entre usuarios

Todas las pantallas y datos (excepto el acceso) exigen sesión iniciada. Cada usuario solo ve y modifica sus propios datos, guardados en una carpeta propia en el servidor. Al eliminar la cuenta se borra esa carpeta completa.

### 14.8 Protección contra doble clic

Los botones y formularios que guardan datos se bloquean mientras la acción está en curso (se marcan como ocupados) y una escritura idéntica repetida en simultáneo se envía una sola vez; así un doble clic no duplica pagos, cobros ni altas. Las flechas de cambio de mes no se bloquean.

### 14.9 Formato de importes

Los campos de dinero muestran formato monetario local (por ejemplo, "211.392,00") y respetan los decimales de cada moneda.

---

## 15. Aplicación instalable (PWA) y uso sin conexión

- Se puede **instalar** desde el navegador como aplicación (nombre "SelimSystem", pantalla completa, orientación vertical, tema oscuro).
- La interfaz (pantallas, estilos e íconos) queda guardada en el dispositivo y abre **sin conexión**.
- Los **datos requieren conexión**: sin red, el servidor no responde y la aplicación informa "Sin conexión". No se guardan datos financieros en el dispositivo; solo preferencias (experiencia, ocultar importes, favorito, moneda y zona horaria).
- Al publicarse una versión nueva, la aplicación se actualiza y recarga sola. Si queda una versión vieja, se puede usar **Limpiar caché y recargar** en la pantalla de acceso.

---

## 16. Arquitectura (resumen técnico)

| Aspecto | Implementación |
|---|---|
| Servidor | Node.js con Express (código en `src/`): rutas en `src/routes`, reglas en `src/services`. |
| Cliente | Aplicación de una sola página en JavaScript sin frameworks (`public/`), navegación por `#/ruta`. |
| Datos | Archivos JSON por usuario (`<DATA_DIR>/<id-de-usuario>/`), con escritura atómica; documentos en una carpeta privada del usuario. |
| Sesiones | Cookie `httpOnly`, `SameSite=Lax`, 7 días, guardadas en disco (`sessions.json`). |
| Seguridad | Contraseñas con bcrypt, Helmet, CORS limitado al dominio de la aplicación, HTTPS forzado en producción. |
| Tareas programadas | Revisión de avisos de saldo cada 15 minutos; reasignación diaria de obligaciones de contratos terminados (00:10). |
| Despliegue | GitHub Actions al hacer push a `master`: pruebas unitarias → pruebas E2E → despliegue en Fly.io (`https://selimsystem.fly.dev`, volumen persistente `selimsystem_data`, chequeo `/health`). |
| Versión | Se lee del `package.json` desplegado y se expone en `/version.json`. |

---

## 17. Limitaciones conocidas

Todas verificadas en el código de la versión 1.15.0:

1. **Metas sin pantalla:** el servidor permite crear, listar y borrar metas (ahorro, límite por categoría y límite general), pero no existe ninguna pantalla para gestionarlas y su progreso no se muestra en Inicio.
2. **Sin pantallas de Resumen ni Estadísticas propias:** la analítica está integrada en Inicio. El ritmo de gasto (burn rate) y las tendencias multi-mes existen en el servidor, pero no tienen pantalla propia (el IVA mensual de Inicio sale del resumen del mes elegido).
3. **Compras en cuotas difíciles de iniciar:** solo aparecen con un medio de pago de tipo tarjeta de crédito, pero la pantalla crea los medios de pago reutilizables siempre con tipo "otro".
4. **Moneda principal fija desde la interfaz:** la analítica de Inicio usa la moneda principal (ARS por defecto) y no hay una opción en pantalla para cambiarla.
5. **Pagos de obligaciones inmutables:** no se pueden editar ni eliminar (Inicio muestra el botón "Eliminar", pero el servidor rechaza la acción y el mensaje remite a **Revertir pago**).
6. **Sin copia de seguridad automática:** existe una tarea semanal de respaldo en el código, pero no se activa al iniciar el servidor.
7. **Sin notificaciones externas:** los avisos son solo internos; el recordatorio diario por correo está implementado pero no se usa.
8. **Usuarios nuevos sin categorías:** existe una lista de categorías sugeridas, pero no se carga al registrarse.
9. **Datos solo con conexión:** sin red no se pueden ver ni registrar datos.
10. **Novedades del acceso desactualizadas:** el desplegable de versión muestra el número 1.15.0, pero su lista de novedades termina en 1.11.17.
11. **Texto heredado:** la declaración de alquiler sin inquilinos sugiere cargarlos "en Personas"; hoy se cargan en Configuración > Inquilino.
12. **Edición de vencimiento por texto:** al editar el importe de un vencimiento, el alcance se elige escribiendo "this" o "future" en un cuadro de texto.

---

## 18. Glosario

| Término | Definición |
|---|---|
| **A (ingreso)** | Ingreso declarado o facturado; puede llevar IVA. |
| **Ahorro** | Ingresos menos gastos netos del mes. |
| **Antigüedad** | Edad del inmueble calculada desde la fecha de construcción. |
| **Atribución** | Indicación de a qué bien, obligación o contrato corresponde un movimiento; no cambia totales. |
| **Aviso** | Recordatorio interno de algo que requiere atención. |
| **B (ingreso)** | Ingreso no declarado, en efectivo, sin factura ni IVA. |
| **Cobro** | Registro de lo cobrado por un mes de alquiler; genera ingresos reales. |
| **Comodato** | Modalidad de alquiler sin IVA, clasificada por defecto como B. |
| **Comprobante** | Archivo (PDF, imagen o texto) que respalda un pago o una resolución. |
| **Conciliar** | Fijar el saldo real de una cuenta en una fecha para que la aplicación calcule su saldo. |
| **Contabilizar** | Convertir algo programado (ocurrencia o cuota) en un movimiento real. |
| **Conversión** | Transferencia entre cuentas de distinta moneda. |
| **Cuenta principal** | Cuenta por defecto para los movimientos; debe haber exactamente una activa. |
| **Declaración de alquiler** | Registro de que un inmueble está alquilado, con modalidades e inquilinos. |
| **Deshacer cobro** | Anular un cobro de alquiler: el mes vuelve a pendiente de cobro. |
| **Fijo / Variable** | Clasificación de los gastos. |
| **Gasto neto** | Gastos menos reembolsos. |
| **Gasto recuperable** | Gasto que un tercero (por ejemplo, el inquilino) debe reintegrar. |
| **Inquilino** | Persona u organización que alquila un inmueble. |
| **IVA** | Impuesto al valor agregado. En ingresos A y en la locación es débito fiscal; en gastos con factura es crédito fiscal. |
| **Débito fiscal** | IVA generado por los ingresos A de un titular en el mes. |
| **Crédito fiscal** | IVA de los gastos facturados a un titular en el mes. |
| **Saldo de IVA** | Crédito fiscal − débito fiscal del titular en el mes. |
| **Locación (contrato de)** | Modalidad de alquiler declarada, con IVA opcional, clasificada por defecto como A. |
| **Mixto** | Ingreso dividido entre parte A y parte B. |
| **Modalidad** | Cada componente de un alquiler: locación, comodato o mutuo. |
| **Mutuo** | Modalidad de alquiler sin IVA, clasificada por defecto como B. |
| **Obligación** | Compromiso de pago (impuesto, servicio, etc.) que genera vencimientos. |
| **Ocurrencia** | Cada repetición de un gasto recurrente. |
| **Pendiente** | Vencimiento impago; en naranja si vence este mes. |
| **Proveedor** | Organización o persona que cobra una obligación; tiene una categoría de gasto. |
| **Reembolso** | Devolución de un gasto; reduce el gasto, no es ingreso. |
| **Resolver** | Registrar que el inquilino pagó una obligación a su cargo; no mueve dinero. |
| **Sub-cuenta** | Cuenta hija de otra cuenta, con moneda propia. |
| **Titular** | Dueño de una cuenta o de un bien; con varios titulares se indica el porcentaje. |
| **Transferencia** | Movimiento de dinero entre cuentas propias; solo afecta saldos. |
| **Vencido** | Vencimiento impago cuyo día ya pasó; se muestra en rojo y negrita. |
| **Vencimiento** | Fecha y monto concretos de pago de una obligación. |
