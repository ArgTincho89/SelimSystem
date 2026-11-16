# Rental Modal Tabs Specification

> Traceability: request.md sections 4, 5, 6, 9, 15; section 17 criteria 5, 6, 7, 8, 9, 23; section 18 items 3, 4, 5.

## Purpose

Replace the very long rental scroll with a wide tabbed modal with a fixed header, a Resumen tab and a unified monthly Períodos tab, without visual duplication.

## Requirements

### Requirement: Wide modal with fixed header and tabs

The rental modal MUST be wider than the current modal (between 900 and 1200 px on desktop, within the existing design), MUST keep a header fixed and visible while the body scrolls and while the user switches tabs, and MUST provide the tabs "Resumen", "Períodos", "Contratos", "Documentos", "Notas" and the optional "Historial" (audit of status history, if implemented). The default tab MUST be "Resumen". The shared `Modal` component MUST support a fixed header and tabs without breaking other modals.

#### Scenario: Header stays visible

- GIVEN the Períodos tab with many rows
- WHEN the user scrolls the body
- THEN the header remains visible

#### Scenario: Default tab

- WHEN the modal opens from "Ver alquiler"
- THEN "Resumen" is active

#### Scenario: Other modals unchanged

- GIVEN a modal opened without tabs options
- WHEN it renders
- THEN it behaves as before this change

### Requirement: Header content

The header MUST show: asset name, rental status (Activo, Próximo a vencer, Finalizado), tenant or tenants, validity, total current monthly amount per currency, next collection, next relevant due date, and the global buttons "Editar alquiler", "Actualizar alquiler" and "Finalizar alquiler". "Próximo a vencer" MUST apply when the end date is within 30 days. "Finalizar alquiler" MUST be red, prominent and visually separated from the common actions. For a finished rental the actions "Actualizar alquiler" and "Finalizar alquiler" MUST NOT be offered.

#### Scenario: Active rental header

- GIVEN an active rental ending in 6 months
- WHEN the modal opens
- THEN the status "Activo", tenants, validity, monthly amount, next collection and the three global buttons are visible

#### Scenario: Near expiry

- GIVEN a rental that ends in 20 days
- WHEN the modal opens
- THEN the status shown is "Próximo a vencer"

#### Scenario: Finish button style

- WHEN the header renders
- THEN "Finalizar alquiler" is red and separated from "Editar alquiler" and "Actualizar alquiler"

### Requirement: Mobile layout

On mobile the rental modal MUST occupy the full screen. Tabs MUST scroll horizontally when they do not fit. The fixed header MUST use little vertical space. Tables MUST become cards or collapsible lists. Primary buttons MUST be reachable without excessive scrolling.

#### Scenario: Narrow viewport

- GIVEN a viewport narrower than the mobile breakpoint
- WHEN the modal opens
- THEN it is full screen, tabs scroll horizontally and period rows render as collapsible cards

### Requirement: Tab accessibility

The tab list MUST use `role="tablist"`, each tab `role="tab"` with `aria-selected`, and each panel `role="tabpanel"`. Left and right arrow keys MUST move between tabs. On close, focus MUST return to the element that opened the modal. Nested modals (detail, confirmation) MUST restore focus to the previous layer.

#### Scenario: Keyboard navigation

- GIVEN focus is on the active tab
- WHEN the user presses the right arrow key
- THEN the next tab becomes active and focused

### Requirement: Resumen tab

The Resumen tab MUST show: rental status, start date, end date, tenants, next collection, total pending collection, next adjustment (if any), and the status of pending obligations of the current period. It MUST show one card per active modality (Locación, Comodato, Mutuo) with: modality, status, validity, current monthly amount, default classification (A or B), IVA if applicable, next adjustment, and the actions "Actualizar alquiler", "Registrar cobro", "Ver períodos", "Finalizar contrato".

#### Scenario: Modality cards

- GIVEN a rental with Locación and Comodato
- WHEN Resumen opens
- THEN two cards are shown, each with its data and four actions

#### Scenario: "Ver períodos"

- WHEN the user presses "Ver períodos" on a card
- THEN the Períodos tab opens filtered to that modality

### Requirement: Collection progress

Resumen MUST replace the economic analysis with a collection progress indicator: a progress bar per modality (for example "1/6 períodos cobrados") and a consolidated total (for example "ARS 14.797.500 cobrados"), titled "Avance de cobros · {year}". It MUST also show counts of expected, collected, partially collected, overdue, pending and cancelled periods, and MUST allow filtering by year or date range. The progress MUST be computed from the periods builder.

#### Scenario: Progress per modality

- GIVEN 6 expected periods of which 1 is collected for Locación
- WHEN Resumen opens
- THEN the Locación bar reads "1/6 períodos cobrados"

#### Scenario: Year filter

- WHEN the user selects another year
- THEN the bars and counts reflect that year

### Requirement: Rental alerts in Resumen

Resumen MUST show alerts only when they apply: overdue rent months, unresolved tenant obligations, pending or overdue owner obligations, contract close to expiry, rent adjustment close, and missing receipts. Each alert MUST have a direct action. When none applies, no alerts block MUST be rendered (or a neutral message).

#### Scenario: Overdue rent

- GIVEN an overdue uncollected month
- WHEN Resumen opens
- THEN an alert for it is shown with the action "Registrar cobro"

#### Scenario: No alerts

- GIVEN nothing applies
- WHEN Resumen opens
- THEN no alert is shown

### Requirement: Periods builder endpoint

The server MUST expose `GET /rentals/declarations/:id/periods?from&to` produced by a single builder. For each month it MUST return: period, due date, the amount and status of every modality, owner and tenant obligation occurrences of the period, registered collections, payments, resolutions, receipts, notes, consolidated status, and the actions available. Two modalities MUST NOT cause the month to appear twice. The builder MUST be reused by the Períodos tab, the Resumen progress, the monthly sheet and the ficha rental summary. An unknown or foreign declaration MUST yield 404.

#### Scenario: One row per month

- GIVEN a rental with Locación and Comodato for 6 months
- WHEN the periods are requested
- THEN 6 periods are returned, each including both modalities

#### Scenario: Foreign declaration

- WHEN another user's declaration id is requested
- THEN the response is 404

### Requirement: Períodos tab table

The Períodos tab MUST show one row per month with the columns Período, Vencimiento, Locación, Comodato, Mutuo, Obligaciones (owner and tenant separated), Total, Estado, Acción. The row MUST include all active modalities of that month and the expected total. The consolidated state MUST be Pendiente, Parcial, Cobrado, Vencido or Cancelado; "Cobrado" only when all modalities are collected, "Parcial" when one is collected and another is pending. Rows MUST be expandable to the full detail. This tab MUST replace and unify "Próximos vencimientos", "Pagos atrasados", "Meses de alquiler", per-contract occurrence lists, "Cobros y saldos no aplicados" and "Otros movimientos atribuidos al contrato".

#### Scenario: Unified row

- GIVEN November 2026 with Locación ARS 11.797.500, Comodato ARS 3.000.000 and an owner obligation ARS 100.000
- WHEN the tab renders
- THEN one row shows both modality amounts, "Impuesto municipal: ARS 100.000" under the owner group, total, "Vencido" if past due, and actions

#### Scenario: Partial month

- GIVEN Locación collected and Comodato pending
- WHEN the row renders
- THEN its status is "Parcial"

#### Scenario: No duplicates

- WHEN the rental modal is fully rendered
- THEN a given collection, obligation or due date appears in one place only in the Períodos tab and not in separate upcoming, overdue or per-contract lists

#### Scenario: Unapplied collections

- GIVEN a collection with an unapplied balance
- WHEN the period detail opens
- THEN the unapplied balance is shown as a note on the period of that collection

### Requirement: Períodos actions per item

The Períodos tab MUST offer per item: rent "Registrar cobro" (creates real income); collected rent "Deshacer cobro"; owner obligation "Registrar pago"; owner payment "Revertir pago"; tenant obligation "Resolver" (no effect on balances); tenant resolution "Anular resolución"; a period without collections "Cancelar período". Destructive actions MUST ask for confirmation. "Cancelar período" MUST only be offered when the period has no collections.

#### Scenario: Cancel period with collections

- GIVEN a period with registered collections
- WHEN the row actions render
- THEN "Cancelar período" is not offered, and a direct request is rejected with "No se puede cancelar este período porque tiene cobros registrados."

#### Scenario: Collect collected period

- GIVEN a fully collected period
- WHEN a collection is requested
- THEN the server rejects with "No se puede registrar un cobro porque el período ya está cobrado."

### Requirement: Períodos filters

The Períodos tab MUST filter by year, month, status (pendiente, parcial, cobrado, vencido, cancelado), type (alquiler, obligación, ambos), responsible (titular, inquilino), modality (locación, comodato, mutuo), provider and free text.

#### Scenario: Filter by status

- WHEN the user selects status "vencido"
- THEN only overdue periods are listed

#### Scenario: No results

- GIVEN filters that match nothing
- WHEN applied
- THEN "No hay períodos pendientes de cobro." or an equivalent empty message with a suggested action is shown

### Requirement: Period detail

Clicking a period MUST open a side panel or secondary modal with: period, due date, modalities and amounts, status of each modality, obligations with their responsible, registered collections, payments, resolutions, receipts, notes, and the available actions.

#### Scenario: Open detail

- WHEN the user clicks a period row
- THEN the detail shows all the listed sections

### Requirement: Removal of obsolete sections

The rental modal MUST NOT contain: "Gastos recuperables e importes pendientes", "Movimientos atribuidos", "Reclamos de reintegro", "Registrar gasto recuperable", "Análisis económico del bien", "Evolución mensual y acumulada", "Historial de titularidad", "Cobros y saldos no aplicados", "Otros movimientos atribuidos al contrato", duplicated "Próximos vencimientos", "Pagos atrasados", "Meses de alquiler" and "Contratos y alquileres". "Historial de estados" MAY exist only as the optional "Historial" audit tab. The removed capabilities MUST remain reachable from the ficha (see asset-ficha-redesign).

#### Scenario: Sections absent

- WHEN the rental modal renders any tab
- THEN none of the listed section titles is present
