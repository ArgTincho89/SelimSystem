# Monthly Sheet Modal Specification

> Traceability: request.md section 10; section 17 criteria 8, 23; section 18 item 12.

## Purpose

Show the ficha mensual as a wide secondary modal with filters and a clear table, instead of inline content that is hard to read.

## Requirements

### Requirement: Secondary modal

The monthly sheet MUST open as a wide secondary modal (stacked over the current modal or ficha) when the user presses "Ver ficha mensual". It MUST NOT render inline inside the rental modal or ficha. Closing it MUST return to the previous layer with focus restored.

#### Scenario: Open and close

- WHEN the user presses "Ver ficha mensual"
- THEN a wide secondary modal opens, and closing it returns to the previous modal

### Requirement: Filters

The sheet MUST allow choosing a year, a month or a range of months, and a custom date range, and filtering by type (alquiler, obligación, ambos), responsible (titular, inquilino), status, modality, provider and free text. Data MUST come from the shared periods builder so both views are consistent. If a range limit is kept, the UI MUST state it clearly.

#### Scenario: Filter by responsible

- WHEN the user filters responsible "inquilino"
- THEN only tenant-responsible rows are shown

#### Scenario: Range

- WHEN the user chooses a custom date range
- THEN only rows inside the range are shown

#### Scenario: Free text

- WHEN the user types a provider name
- THEN only matching rows are shown

### Requirement: Table format

The sheet MUST show a table with the columns Período, Concepto, Responsable, Esperado, Ejecutado, Estado, Comprobante, Acción. Example rows: "Noviembre 2026 · Alquiler · Inquilino · ARS 14.797.500 · ARS 14.797.500 · Cobrado · Ver · Deshacer cobro"; "Noviembre 2026 · Impuesto municipal · Titular · ARS 100.000 · ARS 0 · Vencido · — · Registrar pago"; "Noviembre 2026 · Impuesto municipal · Inquilino · ARS 100.000 · ARS 0 · Pendiente · — · Resolver". Amounts MUST be per currency without conversion. Actions MUST follow the same rules as the periods tab.

#### Scenario: Rows and actions

- GIVEN a collected rent and an overdue owner obligation in the same month
- WHEN the sheet renders
- THEN the first row offers "Deshacer cobro" and the second "Registrar pago"

#### Scenario: Empty

- GIVEN a filter without results
- WHEN applied
- THEN "No hay movimientos en este período." is shown

### Requirement: Mobile cards

On mobile each row MUST render as a collapsible card showing the same information. The sheet MUST remain usable by keyboard and with accessible labels.

#### Scenario: Narrow viewport

- GIVEN a mobile viewport
- WHEN the sheet opens
- THEN rows render as collapsible cards
