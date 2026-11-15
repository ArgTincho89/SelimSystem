# Asset Obligation History Specification

> Traceability: request.md (historial del bien: "modal ... muy feo", "selector ... cuál mes ... o todos los meses desde la creación", "dividido por meses y por tipos de obligaciones ... proveedor ... tipo ... mes ... pagado o no", "clic ... información de ese registro", "documento ... modal tipo iframe ... zoom", "lo que tenemos ahora tiene más sentido en la ficha del bien").

## Purpose

Replace the content of the asset "Ver historial" modal with a focused obligation payment history, and keep the current rich view reachable as the asset ficha.

## Requirements

### Requirement: Separate history from ficha

The "Ver historial" action on an asset MUST open the new history modal. The existing detailed view (`showDetails`: pending items, documents, notes, recoverables, economic analysis, monthly evolution, monthly sheet, ownership history, upcoming dues, collect-month buttons, rental contracts and states) MUST remain available unchanged and MUST be opened from a different button (e.g. "Ficha") on the asset. The history modal MUST NOT contain any of that content.

#### Scenario: Ver historial

- GIVEN an asset
- WHEN the user presses "Ver historial"
- THEN the modal shows only the month selector and obligation history

#### Scenario: Ficha available

- GIVEN an asset
- WHEN the user presses the "Ficha" button
- THEN the previous detailed view opens as before

#### Scenario: Alquileres button

- GIVEN the asset has the "Alquileres" action
- WHEN pressed
- THEN it opens the ficha (rentals content), not the history

### Requirement: Month selector

The modal MUST provide a selector with the option "Todos los meses" and one option per month from the history start through the current month, newest first. The default MUST be "Todos los meses" (assumption). The history start MUST be the earlier of the asset creation month and the earliest obligation start month. Selecting a month MUST show only that month.

#### Scenario: All months

- GIVEN an asset created 2026-03 with obligations starting 2026-05
- WHEN the modal opens with "Todos los meses"
- THEN months from 2026-03 to the current month are available and listed

#### Scenario: Single month

- GIVEN the user selects "octubre 2026"
- WHEN applied
- THEN only that month's group is shown

#### Scenario: Obligation older than asset

- GIVEN an obligation start earlier than the asset creation
- WHEN the selector builds
- THEN its start month is the first option

### Requirement: Grouped list

Records MUST be grouped by month (newest first), and within a month by obligation type (using the type labels from `obligation-card-and-status`). Each record row MUST show provider (or obligation name when no provider), type label, month/period and a status: "Pagado" or unpaid ("Pendiente" orange through the due day, "Vencido" bold red after, same `dueState` rules). A record with a linked receipt SHOULD show a small attachment indicator. Months with no records MUST show nothing or "Sin obligaciones". When the asset has no obligations the modal MUST show an empty state "Este bien no tiene obligaciones registradas".

#### Scenario: Grouping

- GIVEN in 2026-10 a tax (paid) and a utility (unpaid, overdue)
- WHEN the modal lists all months
- THEN the 2026-10 group contains "Impuesto" and "Servicio" subgroups with "Pagado" and "Vencido" respectively

#### Scenario: Provider shown

- GIVEN a paid tax from "Municipalidad de Córdoba"
- WHEN rendered
- THEN the row shows the provider, "Impuesto", the month and "Pagado"

#### Scenario: Empty

- GIVEN an asset with no obligations
- WHEN opened
- THEN the empty state is shown

### Requirement: Record detail

Clicking a record MUST show its details in the modal (via Modal.push or an in-modal panel): obligation name, type, provider, period, due date, estimated amount, paid amount, payment date, account, payment method, status, title/notes of the payment, and the list of linked documents. A "Volver" control MUST return to the list preserving selector and scroll position.

#### Scenario: Paid record

- GIVEN a paid record with payment date, account and method
- WHEN clicked
- THEN those values and the amount paid are displayed

#### Scenario: Unpaid record

- GIVEN an unpaid record
- WHEN clicked
- THEN the detail shows estimated amount and due date and no payment info

#### Scenario: Back

- GIVEN a detail is open
- WHEN "Volver" is pressed
- THEN the list returns with the same month selected

### Requirement: Receipt viewer

When a record has linked documents, the detail MUST offer a "Ver comprobante" action opening a second modal containing an iframe (for PDFs) or an image (for images) that supports zoom (at minimum zoom in, zoom out and reset controls; for PDFs the browser viewer's own zoom is acceptable). The content MUST be loaded by fetching the document bytes with authentication and displaying them through a blob URL so that the document endpoint's sandbox Content-Security-Policy does not block display. Object URLs MUST be revoked when the viewer closes. If loading or inline display fails, the viewer MUST show an error and offer "Abrir" and "Descargar" fallbacks. Closing the viewer MUST return to the record detail. Multiple documents MUST be selectable.

#### Scenario: PDF receipt

- GIVEN a record with a PDF receipt
- WHEN "Ver comprobante" is pressed
- THEN a modal with an iframe displaying the PDF opens

#### Scenario: Image zoom

- GIVEN an image receipt
- WHEN the user presses zoom in
- THEN the image scales up, and reset restores the original size

#### Scenario: Load failure

- GIVEN the document request fails
- WHEN the viewer opens
- THEN an error with "Abrir" and "Descargar" options is shown

#### Scenario: Cleanup

- GIVEN the viewer is open with a blob URL
- WHEN it closes
- THEN the object URL is revoked and the detail modal is visible again

#### Scenario: No document

- GIVEN a record without documents
- WHEN its detail opens
- THEN no "Ver comprobante" action is shown

### Requirement: Obligation history endpoint

The system MUST expose `GET /assets/:id/obligation-history` (authenticated, owner-scoped) returning, per occurrence in the range, only the data needed above, reusing the monthly-view row builder: `occurrenceId`, `obligationId`, obligation `title`, `type`, provider name, `period`/`date`, `status`, `dueState`, `estimatedMinor`, `actualMinor`, `currency`, `documents[]` (id, name, mime type), `payments[]` (date, amountMinor, accountName, paymentMethod, title, notes). It MUST NOT include economics, rent, claims or ownership data. Query parameters `from`/`to` (YYYY-MM) optional; with none it returns the full range from the history start. Responses MUST be capped (existing 120-month limit). Cancelled obligations MUST be excluded. Access to another user's asset MUST return not found. The response MUST also expose the computed `rangeStart` so the UI builds the selector.

#### Scenario: Shape

- GIVEN an asset with one paid tax occurrence
- WHEN the endpoint is called
- THEN the item has type, provider, dueState, documents and payments and no economic analysis fields

#### Scenario: Range filter

- GIVEN `from=2026-10&to=2026-10`
- WHEN called
- THEN only October occurrences are returned

#### Scenario: Foreign asset

- GIVEN an asset owned by another user
- WHEN requested
- THEN 404 is returned

#### Scenario: Cancelled excluded

- GIVEN a cancelled obligation
- WHEN called
- THEN none of its occurrences appear

## Edge Cases

- Modal width MUST be larger than the default 440px through an additive Modal width option; the viewer modal SHOULD be wider still. Existing modals are unaffected.
- Receipt content MUST NOT be requested until the viewer opens.
- Large histories render grouped lists without freezing (months rendered lazily or collapsed by default beyond the most recent, assumption).

## Acceptance Criteria

- "Ver historial" shows a clean month-selectable list grouped by month and type with paid/unpaid; clicking shows detail and opens receipts in a zoomable viewer; the old content stays reachable in the ficha.
