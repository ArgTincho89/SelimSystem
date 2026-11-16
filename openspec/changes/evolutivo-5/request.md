# Evolutivo 5 — Original user request (verbatim, Spanish)

> Source of truth for this change. Do not paraphrase in specs without tracing back here. Branch: `evolutivo-5`.

# EVOLUTIVO SELIMSYSTEM — Rediseño de Bienes, Historial y Modal de Alquiler

## Contexto

SelimSystem es una aplicación web de finanzas personales y patrimoniales, multiusuario, basada en Node.js/Express en el servidor y una SPA en JavaScript sin frameworks en `public/`. Los datos se almacenan en archivos JSON por usuario y los documentos en una carpeta privada por usuario.

El objetivo de este evolutivo es reorganizar y mejorar la experiencia de:

1. La ficha de un bien inmueble.
2. El historial de un bien.
3. El modal de alquiler de un inmueble.
4. Los períodos mensuales de alquiler y obligaciones.
5. Los avisos, separando claramente obligaciones a cargo de titulares y a cargo de inquilinos.
6. La reversión de pagos de obligaciones registrados por error.

No se debe reescribir innecesariamente el modelo de datos ni romper la compatibilidad con los datos existentes. Priorizar cambios de UI/UX, reglas de presentación, agrupación de información y pequeñas extensiones de backend donde sean necesarias.

La aplicación debe seguir siendo responsive y utilizable tanto en móvil como en escritorio.

## Principios obligatorios

- No mezclar información de un **bien**, un **alquiler**, un **contrato/modalidad** y un **período mensual** en una misma sección sin jerarquía clara.
- Eliminar duplicaciones visuales: un mismo cobro, obligación o vencimiento no debe aparecer repetido en varias secciones del mismo modal.
- Mantener la separación entre:
  - **Bien / inmueble:** datos patrimoniales, titulares, obligaciones, documentos y notas.
  - **Alquiler:** declaración de que un inmueble está alquilado, con inquilinos, modalidades y vigencia.
  - **Contrato / modalidad:** locación, comodato o mutuo.
  - **Período mensual:** mes concreto de alquiler y sus obligaciones asociadas.
- Mantener importes por moneda, sin conversión automática.
- Mantener la distinción entre:
  - **Registrar pago:** obligación a cargo de titular; crea un gasto real y afecta saldo, gastos y ahorro.
  - **Resolver:** obligación a cargo de inquilino; registra constancia y comprobante, pero no crea movimientos ni afecta saldos.
  - **Registrar cobro:** cobro de alquiler; crea ingreso real.
  - **Deshacer cobro:** anula un cobro de alquiler completo y devuelve el período a pendiente.
- Mantener los logs de todas las acciones de escritura, incluyendo altas, ediciones, eliminaciones, cobros, deshacer cobros, pagos, reversiones de pago, resoluciones, ajustes de alquiler y finalización de alquileres.
- Toda acción destructiva o irreversible debe requerir confirmación explícita.
- Los textos, botones y estados deben ser claros para un usuario no técnico.

## Alcance general

Implementar los siguientes cambios:

1. Rediseñar el historial de bienes con selector separado de año y mes.
2. Rediseñar la ficha del inmueble.
3. Renombrar y reorganizar el acceso al alquiler.
4. Convertir el modal de alquiler en un modal ancho con pestañas.
5. Crear una vista unificada de períodos mensuales.
6. Reorganizar contratos y modalidades.
7. Mover o eliminar secciones que no pertenecen al alquiler.
8. Mejorar la ficha mensual como modal secundario.
9. Mejorar la actualización de alquiler.
10. Reorganizar la finalización y declaración de alquileres.
11. Crear histórico de alquileres por inmueble.
12. Mejorar documentos y notas.
13. Separar avisos por responsable: titular e inquilino.
14. Permitir revertir pagos de obligaciones.
15. Mejorar mensajes, estados vacíos, confirmaciones y accesibilidad.

---

# 1. Historial del bien

## Problema actual

Actualmente, el historial de un bien utiliza un selector único de mes. Esto dificulta navegar hacia meses o años anteriores.

## Cambios requeridos

Reemplazar el selector único de fecha por dos controles independientes:

- **Año**
- **Mes**

Reglas:

- El selector de año debe permitir elegir cualquier año disponible según los datos del bien.
- El selector de mes debe permitir elegir un mes concreto o la opción **“Todo el año”**.
- Agregar un botón **“Hoy”** que vuelva al mes actual.
- La vista por defecto debe ser el mes actual.
- No debe existir un límite artificial de 120 meses si los datos existentes lo requieren; si se mantiene un límite por performance, debe comunicarse claramente en la UI.
- Al cambiar año o mes, la vista debe actualizarse sin recargar toda la aplicación.

## Estructura del historial

El historial debe mostrar una línea de tiempo financiera y operativa del bien.

Debe incluir:

- Cobros de alquiler.
- Pagos de obligaciones a cargo de titulares.
- Resoluciones de obligaciones a cargo de inquilinos.
- Obligaciones pendientes.
- Obligaciones vencidas.
- Obligaciones parciales.
- Comprobantes asociados.
- Notas relevantes, si existen.
- Ajustes de alquiler, si corresponden al período.
- Eventos relevantes del alquiler: inicio, finalización, cancelación de período, reversión de pago o cobro.

## Formato de cada mes

Usar una tabla o lista compacta, no bloques enormes repetidos.

Cada fila debe mostrar como mínimo:

| Campo | Ejemplo |
|---|---|
| Fecha | 10/11/2026 |
| Concepto | Impuesto municipal |
| Tipo | Obligación / Cobro de alquiler / Ajuste |
| Responsable | Titular o Inquilino |
| Proveedor / inquilino | Municipalidad / Bella Paloma |
| Importe esperado | ARS 100.000 |
| Importe ejecutado | ARS 0 |
| Saldo | ARS 100.000 |
| Estado | Pendiente / Vencido / Pagado / Cobrado / Parcial / Revertido / Cancelado |
| Acción | Registrar pago / Resolver / Registrar cobro / Ver detalle |

Para cobros de alquiler con varias modalidades, mostrar el desglose:

```text
Alquiler noviembre 2026
Locación: ARS 11.797.500 · A
Comodato: ARS 3.000.000 · B
Total: ARS 14.797.500
Estado: Vencido
```

## Estados

Implementar y mostrar claramente estos estados:

- **Pendiente:** el vencimiento o cobro corresponde al período actual o futuro y aún no fue registrado.
- **Vencido:** la fecha ya pasó sin registro completo.
- **Parcial:** existe un registro parcial.
- **Pagado:** obligación a cargo de titular completamente pagada.
- **Cobrado:** alquiler completamente cobrado; todas las modalidades deben estar cobradas.
- **Resuelto:** obligación a cargo de inquilino con resolución registrada.
- **Revertido:** el pago o cobro fue anulado.
- **Cancelado:** período o vencimiento cancelado.

Colores sugeridos:

- Pendiente: gris o neutro.
- Próximo a vencer: ámbar.
- Vencido: rojo.
- Parcial: ámbar.
- Pagado / Cobrado / Resuelto: verde.
- Revertido: gris con etiqueta explícita.
- Cancelado: gris.

## Detalle de un registro

Al hacer clic en cualquier registro del historial, abrir un modal o panel lateral con:

- Tipo de registro.
- Fecha.
- Concepto.
- Bien asociado.
- Responsable.
- Proveedor o inquilino.
- Importe esperado.
- Importe pagado, cobrado o resuelto.
- Saldo pendiente.
- Estado.
- Cuenta utilizada, si corresponde.
- Medio de pago o cobro, si corresponde.
- Comprobantes.
- Notas.
- Historial de pagos o cobros parciales.
- Acciones disponibles según el estado.

Acciones posibles:

- **Registrar pago**, solo para obligaciones a cargo de titular.
- **Resolver**, solo para obligaciones a cargo de inquilino.
- **Registrar cobro**, para períodos de alquiler pendientes.
- **Deshacer cobro**, para períodos de alquiler cobrados.
- **Revertir pago**, para pagos de obligaciones a cargo de titular.
- **Adjuntar comprobante**.
- **Ver comprobante**.
- **Descargar comprobante**.
- **Agregar nota**, si corresponde.

---

# 2. Ficha del inmueble

## Objetivo

La ficha del inmueble debe ser un resumen claro del bien, no un contenedor de toda la gestión financiera y contractual.

Debe responder:

- ¿Qué es este bien?
- ¿Quién es su titular?
- ¿Qué obligaciones tiene?
- ¿Está alquilado?
- ¿Cuál es el próximo vencimiento relevante?
- ¿Dónde están los documentos y notas?

## Estructura recomendada

### Cabecera

Mostrar:

- Nombre del bien.
- Tipo.
- Ubicación.
- Estado: disponible, alquilado, etc.
- Titular vigente o titulares con porcentajes.
- Acciones principales.

Botones de cabecera:

- **Editar**
- **Ver historial**
- **Declarar alquiler**, solo si no existe alquiler vigente.
- **Ver alquiler**, si existe alquiler vigente.

### Datos del bien

Mantener:

- Clasificación.
- Tipo.
- Características.
- Ubicación.
- Superficie cubierta.
- Superficie libre.
- Identificación catastral.
- Fecha de construcción.
- Antigüedad.
- Titulares con porcentajes y vigencias.
- Notas generales del bien.

### Obligaciones

Mostrar una lista compacta con:

- Nombre de la obligación.
- Tipo.
- Proveedor.
- Responsable: titular o inquilino.
- Número de cuenta o contrato.
- Importe estimado.
- Moneda.
- Frecuencia.
- Próximo vencimiento.
- Estado del próximo vencimiento.

Acciones:

- **Ver obligación**.
- **Registrar pago**, solo si es a cargo de titular.
- **Resolver**, solo si es a cargo de inquilino.
- **Editar obligación**.
- **Agregar obligación**.

### Alquiler

Si no hay alquiler vigente:

- Mostrar un estado vacío claro: “Este inmueble no tiene un alquiler activo”.
- Botón principal: **Declarar alquiler**.

Si hay alquiler vigente:

- Mostrar tarjeta de resumen con:
  - Inquilino o inquilinos.
  - Vigencia.
  - Estado del alquiler.
  - Monto mensual vigente total.
  - Composición por modalidades.
  - Próximo cobro.
  - Total pendiente de cobro.
  - Próximo vencimiento relevante.
- Botón principal: **Ver alquiler**.

### Documentos y notas

Mantener documentos y notas en la ficha del bien, pero separados visualmente del alquiler.

- Documentos: carga, vista, descarga y eliminación con confirmación.
- Notas: creación, edición, eliminación y filtrado por rango de fechas.

### Economía del bien

La información económica del bien puede permanecer en la ficha, pero debe estar claramente separada del alquiler.

No debe mostrarse dentro del modal de alquiler.

Si se conserva, mostrar:

- Ingresos reales atribuidos.
- Gastos reales atribuidos.
- Reembolsos.
- Resultado neto.
- Pendientes, separados de los movimientos reales.
- Todo por moneda, sin conversión.

No mostrar “análisis económico”, “evolución mensual y acumulada”, “gastos recuperables”, “movimientos atribuidos” ni “reclamos de reintegro” dentro del modal de alquiler.

---

# 3. Acceso al alquiler

## Cambio de nombre

Renombrar el botón actual **“Alquileres”** a:

- **“Ver alquiler”**, cuando existe un alquiler vigente.
- **“Declarar alquiler”**, cuando no existe alquiler vigente.

## Comportamiento

Al pulsar **“Ver alquiler”**:

- Abrir directamente el modal del alquiler vigente.
- Mostrar por defecto la pestaña **“Resumen”**.
- No mostrar primero una ficha del inmueble.

## Histórico de alquileres

En la ficha del inmueble debe existir una sección o acceso llamado:

- **“Histórico de alquileres”**

Debe listar todos los alquileres del inmueble, incluyendo el vigente y los finalizados.

Cada fila debe mostrar:

| Campo | Ejemplo |
|---|---|
| Período | 01/07/2026 – 30/06/2029 |
| Inquilino | Bella Paloma |
| Modalidades | Locación + Comodato |
| Estado | Activo / Finalizado |
| Acción | Ver |

Al pulsar **“Ver”** sobre un alquiler histórico:

- Abrir un modal secundario de solo lectura.
- Mostrar todos los datos relevantes del alquiler.
- Permitir cerrar.
- Permitir editar solo si no existen cobros, documentos, obligaciones vinculadas u otros datos que impidan una edición segura.
- Permitir eliminar solo con confirmación fuerte y reversible en términos de auditoría, pero irreversible desde el punto de vista del usuario.

Mensaje de eliminación:

```text
Estás por eliminar un alquiler y potencialmente sus datos asociados.
Esta acción no se puede deshacer.
¿Querés continuar?
```

Si el alquiler tiene cobros, documentos o períodos asociados, mostrar una advertencia adicional antes de permitir la eliminación.

---

# 4. Modal de alquiler

## Problema actual

El modal actual es un desplazamiento vertical extremadamente largo que mezcla:

- Datos del inmueble.
- Ficha del bien.
- Obligaciones.
- Gastos recuperables.
- Movimientos atribuidos.
- Reclamos de reintegro.
- Análisis económico.
- Evolución mensual.
- Ficha mensual.
- Historial de titularidad.
- Próximos vencimientos.
- Pagos atrasados.
- Contratos y alquileres.
- Meses de alquiler.
- Cobros y saldos no aplicados.
- Otros movimientos atribuidos.
- Historial de estados.
- Documentos.
- Notas.

Esto debe eliminarse.

## Nueva estructura

Convertir el modal de alquiler en un modal ancho, con cabecera fija y pestañas.

El modal debe ocupar un ancho mayor que el actual en escritorio, por ejemplo entre 900 y 1200 píxeles, según el diseño existente.

En móvil, debe adaptarse a pantalla completa con navegación por pestañas o secciones colapsables.

## Cabecera fija

La cabecera debe permanecer visible mientras el usuario navega entre pestañas.

Debe mostrar:

- Nombre del inmueble.
- Estado del alquiler: activo, próximo a vencer, finalizado.
- Inquilino o inquilinos.
- Vigencia.
- Monto mensual vigente total.
- Próximo cobro.
- Próximo vencimiento relevante.
- Acciones globales.

Botones globales:

- **Editar alquiler**
- **Actualizar alquiler**
- **Finalizar alquiler**

El botón **“Finalizar alquiler”** debe ser rojo, prominente y claramente separado de las acciones comunes.

## Pestañas recomendadas

Implementar estas pestañas:

1. **Resumen**
2. **Períodos**
3. **Contratos**
4. **Documentos**
5. **Notas**
6. **Historial**, opcional pero recomendable

---

# 5. Pestaña Resumen

## Objetivo

Mostrar rápidamente el estado actual del alquiler y las acciones más frecuentes.

## Contenido

### Estado general

Mostrar:

- Estado del alquiler.
- Fecha de inicio.
- Fecha de finalización.
- Inquilino o inquilinos.
- Próximo cobro.
- Total pendiente de cobro.
- Próximo ajuste, si existe.
- Estado de obligaciones pendientes del período actual.

### Composición del alquiler

Mostrar una tarjeta por cada modalidad activa:

- Locación.
- Comodato.
- Mutuo.

Cada tarjeta debe mostrar:

- Modalidad.
- Estado: activa, finalizada, etc.
- Vigencia.
- Monto mensual vigente.
- Clasificación por defecto: A o B.
- IVA, si corresponde.
- Próximo ajuste.
- Acciones: **Actualizar alquiler**, **Registrar cobro**, **Ver períodos**, **Finalizar contrato**.

### Avance de cobros

Reemplazar el actual “análisis económico del bien” por un indicador de avance del alquiler.

Mostrar barras de progreso por modalidad y un total consolidado.

Ejemplo:

```text
Avance de cobros · 2026

Locación   ████████████░░░░  1/6 períodos cobrados
Comodato   ████████████░░░░  1/6 períodos cobrados
Total      ████████████░░░░  ARS 14.797.500 cobrados
```

Mostrar también:

- Períodos esperados.
- Períodos cobrados.
- Períodos parcialmente cobrados.
- Períodos vencidos.
- Períodos pendientes.
- Períodos cancelados.

Permitir filtrar por año o por rango de fechas.

### Alertas

Mostrar alertas solo si corresponden:

- Meses de alquiler vencidos sin cobrar.
- Obligaciones a cargo del inquilino sin resolver.
- Obligaciones a cargo del titular pendientes o vencidas.
- Contrato próximo a vencer.
- Ajuste de alquiler próximo.
- Comprobantes faltantes.

Cada alerta debe tener una acción directa.

---

# 6. Pestaña Períodos

## Objetivo

Esta debe ser la vista operativa principal del alquiler.

Debe responder:

- ¿Qué meses tengo que cobrar?
- ¿Qué obligaciones debo pagar o hacer resolver?
- ¿Qué está vencido?
- ¿Qué ya fue cobrado o pagado?
- ¿Qué puedo revertir si me equivoqué?

## Reemplazo de secciones duplicadas

Esta pestaña debe reemplazar y unificar:

- “Próximos vencimientos”.
- “Pagos atrasados”.
- “Meses de alquiler”.
- Listados repetidos por contrato.
- “Cobros y saldos no aplicados”.
- “Otros movimientos atribuidos al contrato”.

## Estructura

Mostrar una tabla mensual con una fila por período.

| Período | Vencimiento | Locación | Comodato | Mutuo | Obligaciones | Total | Estado | Acción |
|---|---:|---:|---:|---:|---|---:|---|---|
| Noviembre 2026 | 01/11/2026 | ARS 11.797.500 | ARS 3.000.000 | — | Impuesto municipal: ARS 100.000 | ARS 14.897.500 | Vencido | Cobrar / Pagar / Resolver |
| Diciembre 2026 | 01/12/2026 | ARS 11.797.500 | ARS 3.000.000 | — | Impuesto municipal: ARS 100.000 | ARS 14.897.500 | Pendiente | Cobrar / Pagar / Resolver |

Reglas:

- Una fila por mes.
- Dentro de cada fila, mostrar todas las modalidades activas de ese mes.
- Mostrar obligaciones asociadas a ese período, separando titular e inquilino.
- Mostrar el total esperado del mes.
- Mostrar el estado consolidado del mes.
- Permitir expandir la fila para ver el detalle completo.

## Estados del período

Un período puede tener estos estados:

- **Pendiente**
- **Parcial**
- **Cobrado**
- **Vencido**
- **Cancelado**

Un período solo debe figurar como **“Cobrado”** cuando todas sus modalidades están cobradas.

Un período con una modalidad cobrada y otra pendiente debe figurar como **“Parcial”**.

## Acciones por ítem

| Ítem | Responsable | Acción | Efecto |
|---|---|---|---|
| Alquiler | Inquilino | Registrar cobro | Crea ingreso real |
| Alquiler | Inquilino | Deshacer cobro | Anula el cobro y vuelve el período a pendiente |
| Obligación | Titular | Registrar pago | Crea gasto real y descuenta saldo |
| Obligación | Inquilino | Resolver | No afecta saldos; registra constancia y comprobante |
| Obligación | Titular | Revertir pago | Anula el gasto y devuelve el vencimiento a pendiente |
| Obligación | Inquilino | Anular resolución | Devuelve el vencimiento a pendiente |
| Período sin cobros | — | Cancelar período | Cancela el período, solo si no tiene cobros |

## Filtros

Agregar filtros por:

- Año.
- Mes.
- Estado: pendiente, parcial, cobrado, vencido, cancelado.
- Tipo: alquiler, obligación, ambos.
- Responsable: titular, inquilino.
- Modalidad: locación, comodato, mutuo.
- Proveedor.
- Texto libre.

## Detalle del período

Al hacer clic en un período, abrir un panel lateral o modal secundario con:

- Período.
- Fecha de vencimiento.
- Modalidades y montos.
- Estado de cada modalidad.
- Obligaciones del período.
- Responsable de cada obligación.
- Cobros registrados.
- Pagos registrados.
- Resoluciones registradas.
- Comprobantes.
- Notas.
- Acciones disponibles.

---

# 7. Pestaña Contratos

## Objetivo

Mostrar las modalidades que componen el alquiler sin duplicar la información mensual.

## Tarjeta por contrato

Cada modalidad debe tener una tarjeta compacta.

Ejemplo:

```text
Locación · Bella Paloma
Vigencia: 01/07/2026 – 30/06/2029
Monto mensual vigente: ARS 11.797.500
Clasificación: A · IVA incluido
Próximo ajuste: —

[Actualizar alquiler] [Registrar cobro] [Ver períodos] [Finalizar contrato]
```

## Datos mínimos

Mostrar:

- Modalidad.
- Inquilino o inquilinos.
- Estado.
- Fecha de inicio.
- Fecha de finalización.
- Monto original.
- Monto mensual vigente.
- Moneda.
- Clasificación A/B.
- IVA, si corresponde.
- Frecuencia de ajuste.
- Criterio de ajuste.
- Próximo ajuste.
- Acciones disponibles.

## Actualizar alquiler

El botón **“Actualizar alquiler”** debe estar visible en:

- La cabecera del modal.
- La pestaña Resumen.
- Cada tarjeta de contrato.
- La pestaña Períodos, si corresponde.

Al pulsarlo:

1. Mostrar el valor actual.
2. Permitir elegir:
   - Nuevo importe manual.
   - Porcentaje de aumento.
   - Índice o criterio, si ya existe esa capacidad.
3. Permitir elegir la fecha efectiva.
4. La fecha efectiva debe coincidir con un vencimiento futuro del contrato.
5. No permitir ajustes retroactivos.
6. No modificar períodos ya cobrados.
7. Mostrar una previsualización antes de confirmar.

Ejemplo:

```text
Desde diciembre 2026, el alquiler pasa de ARS 11.797.500 a ARS 15.336.750.
Se actualizarán 5 períodos futuros no cobrados.
```

8. Al confirmar, aplicar el nuevo valor a todos los períodos futuros no cobrados.
9. Registrar la acción en Logs.

## Finalizar contrato

El botón **“Finalizar contrato”** debe existir solo dentro de una modalidad concreta.

Debe:

- Pedir fecha de finalización.
- Cancelar períodos futuros sin cobrar de esa modalidad.
- Conservar cobros ya registrados.
- Requerir confirmación explícita.
- Registrar la acción en Logs.

No debe confundirse con **“Finalizar alquiler”**, que finaliza todas las modalidades.

---

# 8. Acciones globales del alquiler

## Editar alquiler

El botón **“Editar alquiler”** debe estar siempre visible en la cabecera del modal.

Debe permitir modificar:

- Inquilinos.
- Modalidades.
- Fechas.
- Montos.
- Monedas.
- IVA.
- Frecuencia y criterio de ajuste.
- Notas generales.

Reglas:

- Mostrar confirmación antes de guardar.
- Advertir que los períodos futuros no cobrados se regenerarán.
- No modificar períodos ya cobrados.
- No permitir editar cobros registrados; esos se corrigen con **“Deshacer cobro”**.
- Registrar la edición en Logs.

## Finalizar alquiler

El botón **“Finalizar alquiler”** debe ser rojo, prominente y separado de las acciones comunes.

Al pulsarlo:

1. Pedir fecha de finalización.
2. Mostrar qué períodos futuros serán cancelados.
3. Advertir que las obligaciones a cargo del inquilino volverán al titular.
4. Requerir confirmación explícita.
5. Finalizar todas las modalidades.
6. Cancelar períodos futuros sin cobrar.
7. Conservar cobros registrados.
8. Registrar la acción en Logs.

Mensaje de confirmación:

```text
Estás por finalizar este alquiler.
Se cancelarán los períodos futuros sin cobrar.
Las obligaciones a cargo del inquilino volverán al titular.
Esta acción no se puede deshacer.
¿Querés continuar?
```

## Declarar nuevo alquiler

Eliminar el botón **“Declarar nuevo alquiler”** del interior del modal de alquiler.

Debe existir únicamente en la ficha del inmueble.

Reglas:

- Si no hay alquiler vigente, habilitar **“Declarar alquiler”**.
- Si hay alquiler vigente, deshabilitar el botón y mostrar: “Finalizá el alquiler vigente antes de declarar uno nuevo”.
- No permitir declarar un nuevo alquiler con fechas superpuestas al alquiler vigente.
- Mantener la regla existente: un inmueble no puede tener dos alquileres con fechas superpuestas.

---

# 9. Secciones a eliminar del modal de alquiler

Eliminar por completo del modal de alquiler las siguientes secciones:

- “Gastos recuperables e importes pendientes”.
- “Movimientos atribuidos”.
- “Reclamos de reintegro”.
- “Registrar gasto recuperable”.
- “Análisis económico del bien”.
- “Evolución mensual y acumulada”.
- “Historial de titularidad”.
- “Cobros y saldos no aplicados”.
- “Otros movimientos atribuidos al contrato”.
- “Historial de estados”, salvo que se convierta en una pestaña de auditoría útil.
- Duplicación de “Próximos vencimientos”, “Pagos atrasados”, “Meses de alquiler” y “Contratos y alquileres”.

Estas funcionalidades pueden conservarse en la ficha o historial del bien, pero no dentro del modal de alquiler.

---

# 10. Ficha mensual

## Problema actual

La “ficha mensual” actual se muestra dentro del mismo modal y es difícil de leer.

## Cambio requerido

Convertirla en un **modal secundario ancho**, que se abra al pulsar **“Ver ficha mensual”**.

Debe permitir:

- Elegir año.
- Elegir mes o rango de meses.
- Elegir rango personalizado.
- Filtrar por tipo: alquiler, obligación, ambos.
- Filtrar por responsable: titular, inquilino.
- Filtrar por estado.
- Filtrar por modalidad.
- Filtrar por proveedor.
- Filtrar por texto.

## Formato

Usar una tabla clara con columnas:

| Período | Concepto | Responsable | Esperado | Ejecutado | Estado | Comprobante | Acción |
|---|---|---|---:|---:|---|---|---|
| Noviembre 2026 | Alquiler | Inquilino | ARS 14.797.500 | ARS 14.797.500 | Cobrado | Ver | Deshacer cobro |
| Noviembre 2026 | Impuesto municipal | Titular | ARS 100.000 | ARS 0 | Vencido | — | Registrar pago |
| Noviembre 2026 | Impuesto municipal | Inquilino | ARS 100.000 | ARS 0 | Pendiente | — | Resolver |

La tabla debe ser responsive.

En móvil, convertir cada fila en una tarjeta colapsable.

---

# 11. Documentos y notas

## Documentos

Crear una pestaña propia de documentos dentro del modal de alquiler.

Debe permitir:

- Cargar documentos.
- Ver documentos.
- Descargar documentos.
- Eliminar documentos con confirmación.
- Filtrar por tipo, fecha o nombre.
- Mostrar fecha de carga.
- Mostrar quién cargó el documento, si corresponde.

Formatos aceptados:

- PDF.
- PNG.
- JPEG.
- WebP.
- Texto UTF-8.

Máximo:

- 20 MiB por archivo.

## Notas

Crear una pestaña propia de notas dentro del modal de alquiler.

Debe permitir:

- Crear nota.
- Editar nota.
- Eliminar nota con confirmación.
- Filtrar por fecha única.
- Filtrar por rango de fechas.
- Ordenar por fecha.
- Mostrar fecha, título y texto.

Cada nota debe mostrar:

```text
16/11/2026 · Título de la nota
Texto de la nota
[Editar] [Eliminar]
```

---

# 12. Avisos

## Problema actual

Actualmente, los avisos mezclan obligaciones a cargo de titulares y a cargo de inquilinos sin una separación visual clara.

## Cambio requerido

En la pantalla de Avisos, separar los avisos en dos grupos visuales:

1. **A cargo de titulares**
2. **A cargo de inquilinos**

Cada grupo debe tener su propio encabezado, contador y estilo visual.

### A cargo de titulares

Incluir:

- Obligaciones vencidas.
- Próximos vencimientos.
- Pagos parciales.
- Comprobantes pendientes.
- Saldo insuficiente.
- Cuotas de tarjeta.
- Otros avisos que afecten finanzas propias.

Acciones:

- **Registrar pago**.
- **Adjuntar comprobante**.
- **Ver obligación**.
- **Ver bien**.

### A cargo de inquilinos

Incluir:

- Comprobantes pendientes de inquilinos.
- Obligaciones a cargo del inquilino sin resolver.
- Alquileres pendientes de cobro.
- Contratos por vencer.
- Ajustes de alquiler.
- Otros avisos relacionados con el inquilino.

Acciones:

- **Resolver**.
- **Registrar cobro**.
- **Adjuntar comprobante**.
- **Ver obligación**.
- **Ver bien**.

## Reglas

- Mantener los avisos internos; no enviar correos ni notificaciones push.
- Mantener el límite actual de 90 días hacia adelante y 200 avisos.
- No mostrar avisos de vencimientos cancelados o resueltos.
- Mantener los filtros existentes.
- Agregar filtro por responsable: titular o inquilino.

---

# 13. Reversión de pagos

## Problema actual

Actualmente, los pagos de obligaciones no se pueden editar ni eliminar. Se corrigen con un movimiento compensatorio.

Esto no resuelve bien el caso de un pago cargado por error.

## Cambio requerido

Agregar la acción **“Revertir pago”** para pagos de obligaciones a cargo de titulares.

### Dónde debe aparecer

El botón debe aparecer en:

- Detalle de un pago desde el historial del bien.
- Detalle de un vencimiento desde Obligaciones.
- Detalle de un pago desde Avisos.
- Detalle de un pago desde la pestaña Períodos del alquiler.
- Detalle de una transacción de tipo gasto vinculada a una obligación.

### Comportamiento

Al pulsar **“Revertir pago”**:

1. Mostrar un modal de confirmación.
2. Mostrar los datos del pago:
   - Fecha.
   - Importe.
   - Cuenta.
   - Medio de pago.
   - Obligación.
   - Vencimiento.
   - Comprobante, si existe.
3. Pedir confirmación explícita.
4. Permitir agregar un motivo opcional.
5. Al confirmar:
   - Anular el efecto contable del pago.
   - Devolver el importe al saldo de la cuenta.
   - Marcar el vencimiento como pendiente nuevamente.
   - Conservar trazabilidad del pago revertido.
   - Registrar la acción en Logs.
   - Actualizar avisos e historial.

Mensaje de confirmación:

```text
Estás por revertir un pago registrado.
Se anulará el gasto asociado y el vencimiento volverá a pendiente.
Esta acción no se puede deshacer.
¿Querés continuar?
```

### Reglas

- No permitir revertir un pago si tiene movimientos dependientes, como reintegros o conversiones vinculadas.
- Si existen dependencias, mostrar un mensaje claro: “No se puede revertir este pago porque tiene movimientos dependientes”.
- Si el pago tiene comprobante, mantener el comprobante asociado al registro revertido o permitir eliminarlo durante la reversión.
- El estado del pago revertido debe ser visible como **“Revertido”**.
- El vencimiento debe volver a estado **“Pendiente”** o **“Vencido”**, según la fecha.
- La reversión debe afectar correctamente:
  - Saldo de la cuenta.
  - Gastos del mes.
  - Ahorro del mes.
  - Historial del bien.
  - Avisos.
  - Logs.

---

# 14. Mensajes, estados vacíos y confirmaciones

## Estados vacíos

Todos los estados vacíos deben tener un mensaje claro y una acción sugerida.

Ejemplos:

- “Este inmueble no tiene un alquiler activo.”
- “No hay períodos pendientes de cobro.”
- “No hay obligaciones a cargo del inquilino.”
- “No hay documentos cargados.”
- “No hay notas en este rango de fechas.”
- “No hay movimientos en este período.”

## Confirmaciones

Toda acción destructiva o irreversible debe pedir confirmación.

Acciones que requieren confirmación:

- Eliminar documento.
- Eliminar nota.
- Eliminar alquiler histórico.
- Finalizar alquiler.
- Finalizar contrato.
- Cancelar período.
- Deshacer cobro.
- Revertir pago.
- Anular resolución.
- Eliminar obligación.
- Editar obligación con pagos existentes.

## Mensajes de error

Los mensajes de error deben ser claros y específicos.

Ejemplos:

- “No se puede declarar un nuevo alquiler porque ya existe uno activo.”
- “No se puede revertir este pago porque tiene movimientos dependientes.”
- “No se puede finalizar este contrato porque ya está finalizado.”
- “No se puede cancelar este período porque tiene cobros registrados.”
- “No se puede registrar un cobro porque el período ya está cobrado.”

---

# 15. Responsive y accesibilidad

## Responsive

El diseño debe funcionar correctamente en:

- Móvil.
- Tablet.
- Escritorio.

En móvil:

- El modal de alquiler debe ocupar pantalla completa.
- Las pestañas deben ser desplazables horizontalmente si no entran.
- Las tablas deben convertirse en tarjetas o listas colapsables.
- Los botones principales deben ser accesibles sin scroll excesivo.
- La cabecera fija debe ocupar poco espacio.

En escritorio:

- El modal debe ser más ancho que el actual.
- Las tablas deben aprovechar el ancho disponible.
- Las acciones deben estar visibles sin necesidad de llegar al final del modal.

## Accesibilidad

- Usar jerarquía visual clara.
- Usar contraste suficiente.
- Usar etiquetas accesibles en botones e inputs.
- Mantener navegación por teclado.
- Evitar depender solo del color para comunicar estado; usar texto e íconos también.

---

# 16. Reglas de negocio que no deben romperse

Mantener intactas las siguientes reglas existentes:

- Un bien debe tener al menos un titular.
- Con varios titulares, los porcentajes deben sumar 100%.
- Un inmueble no puede tener dos alquileres con fechas superpuestas.
- Un alquiler requiere al menos una modalidad y al menos un inquilino.
- Cada modalidad requiere monto original positivo y fecha de inicio.
- Los meses de alquiler vencen el mismo día del mes que la fecha de inicio.
- Un mes se considera cobrado solo cuando todas sus modalidades están cobradas.
- Locación por defecto es ingreso A.
- Comodato y mutuo por defecto son ingreso B.
- Solo la parte A admite IVA.
- Los cobros de alquiler no se editan; se deshacen y se registran nuevamente.
- Al deshacer un cobro, se eliminan juntos todos los ingresos del mes, sus asignaciones y comprobantes.
- Si la cuenta estaba conciliada, la conciliación se reinicia y se avisa.
- Los ajustes de alquiler no son retroactivos.
- Los ajustes de alquiler no modifican períodos ya cobrados.
- Al finalizar un alquiler, se cancelan los períodos futuros sin cobrar y se conservan los cobros registrados.
- Al finalizar un alquiler, las obligaciones a cargo del inquilino vuelven al titular.
- Las obligaciones a cargo de titular se pagan con “Registrar pago” y crean gasto real.
- Las obligaciones a cargo de inquilino se resuelven con “Resolver” y no afectan saldos.
- Los pagos parciales están permitidos.
- No se puede pagar un vencimiento cancelado, ya saldado o a cargo del inquilino.
- Los importes se muestran por moneda, sin conversión.

---

# 17. Criterios de aceptación

El evolutivo se considera completo cuando:

1. El historial de un bien permite seleccionar año y mes por separado.
2. El historial muestra cobros, obligaciones, pagos, resoluciones y estados claramente.
3. Al hacer clic en un registro del historial se abre un detalle con acciones contextuales.
4. El botón “Alquileres” fue renombrado a “Ver alquiler” cuando existe alquiler vigente.
5. El modal de alquiler es más ancho y está organizado por pestañas.
6. La cabecera del modal muestra estado, inquilino, vigencia, monto vigente y próximo cobro.
7. La pestaña Resumen muestra composición, avance de cobros y alertas.
8. La pestaña Períodos unifica alquileres y obligaciones por mes.
9. No existen duplicaciones visuales de cobros, obligaciones o vencimientos.
10. La pestaña Contratos muestra cada modalidad con acciones claras.
11. “Actualizar alquiler” está visible en la cabecera y en cada contrato.
12. “Actualizar alquiler” permite elegir fecha efectiva futura y actualizar períodos futuros no cobrados.
13. “Finalizar alquiler” es rojo, prominente y requiere confirmación.
14. “Declarar nuevo alquiler” ya no aparece dentro del alquiler vigente.
15. “Declarar alquiler” está en la ficha del inmueble y se bloquea si hay alquiler vigente.
16. El histórico de alquileres permite ver alquileres pasados en modo solo lectura.
17. La eliminación de un alquiler histórico requiere confirmación fuerte.
18. Los documentos y notas tienen pestañas propias.
19. Las notas permiten crear, editar, eliminar y filtrar por rango de fechas.
20. Los avisos están separados entre titulares e inquilinos.
21. Es posible revertir un pago de obligación a cargo de titular.
22. La reversión de pago actualiza saldo, gastos, ahorro, historial, avisos y logs.
23. La interfaz es responsive en móvil y escritorio.
24. Todas las acciones destructivas tienen confirmación.
25. Todas las acciones de escritura quedan registradas en Logs.

---

# 18. Prioridad de implementación

Implementar en este orden:

1. Selector separado de año y mes en historial.
2. Renombrar “Alquileres” a “Ver alquiler”.
3. Modal de alquiler ancho con pestañas.
4. Pestaña Períodos unificada.
5. Eliminación de secciones obsoletas del modal de alquiler.
6. Reorganización de contratos y modalidades.
7. Actualización de alquiler visible y funcional.
8. Finalización de alquiler visible y confirmada.
9. Declaración de nuevo alquiler movida a la ficha del inmueble.
10. Histórico de alquileres.
11. Documentos y notas como pestañas.
12. Ficha mensual como modal secundario.
13. Separación de avisos por titular e inquilino.
14. Reversión de pagos.
15. Mejoras finales de responsive, mensajes y accesibilidad.

---

# 19. Entregables esperados

Al finalizar, el agente desarrollador debe entregar:

- Código implementado.
- Migraciones o adaptaciones de datos si fueran necesarias.
- Pruebas unitarias para reglas nuevas o modificadas.
- Pruebas E2E para los flujos principales.
- Capturas o descripción de la nueva UI.
- Lista de cambios realizados.
- Lista de riesgos o limitaciones.
- Instrucciones de despliegue si corresponden.

No eliminar funcionalidades existentes sin confirmación explícita. Si una funcionalidad se mueve, debe seguir siendo accesible desde el lugar correcto.
