# Asset History Timeline Specification

> Traceability: request.md section 1 (Historial del bien), section 17 criteria 1, 2, 3, 22 (history part), section 18 item 1.

## Purpose

Give each asset a financial and operational timeline navigable by separate year and month selectors, with typed compact rows and a detail view with contextual actions.

## Requirements

### Requirement: Separate year and month selectors

The asset history MUST replace the single month selector with two independent controls: "Año" and "Mes". The year selector MUST list every year that has data for the asset, from the earliest asset, obligation or rental date to the current year (plus the next year when future rent exists). The month selector MUST offer the twelve months and the option "Todo el año". A button "Hoy" MUST return both selectors to the current year and month. The default view MUST be the current month. Changing either selector MUST update the list without reloading the application.

#### Scenario: Default view

- GIVEN an asset with data in 2024, 2025 and 2026
- WHEN the user opens "Ver historial" in November 2026
- THEN year is 2026, month is November, and only November 2026 rows are shown

#### Scenario: Past year

- GIVEN the history shows November 2026
- WHEN the user selects year 2024
- THEN the list refreshes to the selected month of 2024 without a page reload

#### Scenario: Whole year

- GIVEN year 2026 is selected
- WHEN the user selects "Todo el año"
- THEN rows of all twelve months of 2026 are shown, grouped by month

#### Scenario: Return to today

- GIVEN the user is viewing March 2024
- WHEN the user presses "Hoy"
- THEN the selectors show the current year and month and the list refreshes

### Requirement: No artificial 120-month limit

The history endpoint MUST NOT cap the range at 120 months. Any year with data MUST be reachable. The existing 120-month cap on `GET /assets/:id/monthly-view` MAY remain and, if kept, MUST be communicated in its UI.

#### Scenario: Old year reachable

- GIVEN an asset with an obligation dated 12 years ago
- WHEN the user opens the history
- THEN that year is offered in the year selector and its rows can be shown

### Requirement: History read model endpoint

The server MUST expose `GET /assets/:id/history?year=&month=` returning `years[]` and typed rows. `month` omitted or "all" MUST mean the whole year. Invalid `year` or `month` MUST yield a 400 with a Spanish message. The existing `GET /assets/:id/obligation-history` MUST keep working unchanged. The endpoint MUST be read-only (it MUST NOT persist generated occurrences). It MUST only return data of the authenticated user's asset (otherwise 404).

#### Scenario: Valid query

- GIVEN an asset with rows in 11/2026
- WHEN the client requests `year=2026&month=11`
- THEN the response contains `years[]` and the rows of that month

#### Scenario: Invalid month

- WHEN the client requests `month=13`
- THEN the response is 400 with a Spanish error message

#### Scenario: Legacy endpoint intact

- WHEN the client requests `GET /assets/:id/obligation-history`
- THEN it responds as before this change

### Requirement: Typed timeline rows

The history MUST include rows of these types: rent collection months, owner-responsible obligation occurrences and payments, tenant-responsible obligation occurrences and resolutions, pending, overdue and partial occurrences, receipts, relevant notes, rental adjustments applicable to the period, and rental events (start, end, period cancellation, payment reversal, collection reversal). Each row MUST show: date, concept, type (Obligación / Cobro de alquiler / Ajuste / Evento), responsible (Titular / Inquilino), provider or tenant, expected amount, executed amount, balance, status, and the available action. Amounts MUST be shown per currency without conversion. The list MUST be a compact table or list, not repeated large blocks.

#### Scenario: Owner obligation row

- GIVEN "Impuesto municipal" ARS 100.000 due 10/11/2026, unpaid, by the owner
- WHEN the history shows 11/2026
- THEN a row shows 10/11/2026, "Impuesto municipal", Obligación, Titular, Municipalidad, expected ARS 100.000, executed ARS 0, balance ARS 100.000, and the action "Registrar pago"

#### Scenario: Tenant obligation row

- GIVEN an obligation assigned to the tenant, unresolved
- WHEN the history shows its month
- THEN the row shows responsible "Inquilino" and the action "Resolver"

#### Scenario: Events and adjustments

- GIVEN a rental started in the month and a rent adjustment effective in that month
- WHEN the history shows the month
- THEN an event row for the start and an Ajuste row are shown

### Requirement: Rent rows with modality breakdown

A rent collection row for a rental with several modalities MUST show the month title (for example "Alquiler noviembre 2026"), one line per modality with its amount and income classification (A or B), the total and the consolidated status.

#### Scenario: Two modalities

- GIVEN November 2026 with Locación ARS 11.797.500 (A) and Comodato ARS 3.000.000 (B), uncollected and past due
- WHEN the history shows November 2026
- THEN the row lists "Locación: ARS 11.797.500 · A", "Comodato: ARS 3.000.000 · B", "Total: ARS 14.797.500" and "Estado: Vencido"

### Requirement: Status vocabulary

The history MUST use exactly these statuses: Pendiente (current or future, no record), Vencido (date passed without full record), Parcial (partial record), Pagado (owner obligation fully paid), Cobrado (rent fully collected, all modalities), Resuelto (tenant obligation with resolution), Revertido (payment or collection voided), Cancelado (period or due date cancelled). Each status MUST be conveyed by text and an icon, not by color alone. Colors: Pendiente neutral gray, Próximo a vencer amber, Vencido red, Parcial amber, Pagado/Cobrado/Resuelto green, Revertido gray with an explicit label, Cancelado gray. A rent month MUST be "Cobrado" only when every modality is collected.

#### Scenario: One modality collected

- GIVEN Locación collected and Comodato pending
- WHEN the history shows the month
- THEN the status is "Parcial"

#### Scenario: Reverted payment visible

- GIVEN a payment was reverted
- WHEN the history shows its month
- THEN a row labelled "Revertido" is shown with the reverted payment data, and the occurrence row is "Pendiente" or "Vencido" by date

### Requirement: Record detail view

Clicking a history row MUST open a modal or side panel with: record type, date, concept, asset, responsible, provider or tenant, expected amount, paid/collected/resolved amount, pending balance, status, account used (if any), payment or collection method (if any), receipts, notes, partial payment or collection history, and the actions available for the status. Possible actions: "Registrar pago" (owner obligations only), "Resolver" (tenant obligations only), "Registrar cobro" (pending rent periods), "Deshacer cobro" (collected rent periods), "Revertir pago" (owner payments, see obligation-payment-reversal), "Adjuntar comprobante", "Ver comprobante", "Descargar comprobante", "Agregar nota". Actions not valid for the record state MUST NOT be offered. The detail MUST expose an actions slot so new actions can be added without restructuring.

#### Scenario: Detail of unpaid owner obligation

- GIVEN an unpaid owner obligation row
- WHEN the user clicks it
- THEN the detail shows expected amount, balance and "Registrar pago", and does not show "Resolver" or "Revertir pago"

#### Scenario: Detail of collected rent

- GIVEN a collected rent month
- WHEN the user clicks it
- THEN the detail shows collections, receipts and "Deshacer cobro", and does not show "Registrar cobro"

#### Scenario: Receipt actions

- GIVEN a payment with a receipt
- WHEN the detail opens
- THEN "Ver comprobante" and "Descargar comprobante" are available

### Requirement: Empty state

When the selected period has no rows, the history MUST show "No hay movimientos en este período." with a suggested action (for example "Hoy").

#### Scenario: Empty month

- GIVEN a month without records
- WHEN selected
- THEN the empty message and a suggested action are shown
