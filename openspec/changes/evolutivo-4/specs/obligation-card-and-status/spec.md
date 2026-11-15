# Obligation Card and Status Specification

> Traceability: request.md, obligations tab ("más intuitiva ... títulos en negrita", "naranja ... vencido ... rojo y en negrita", "no entiendo la diferencia entre confirmar ... previsto ... tiene que desaparecer", "editarla ... eliminarla ... registrar pago").

## Purpose

Present each obligation as a labelled, readable card whose status is either pending (orange when due soon) or "Vencido" (bold red), with no confirm/forecast concept, and with Edit, Delete and "Registrar pago" actions.

## Requirements

### Requirement: Label/value card layout

Each obligation card MUST show the obligation name as its heading, followed by a list of label/value pairs with the labels in bold. The labels and values MUST be, in order: "Tipo" (type label), "Inmueble" (asset title), "Proveedor", "Responsabilidad", "Cuenta" (external identifier, with its identifier type when present), "Monto estimado" (formatted amount with currency), "Frecuencia", "Aviso" (e.g. "3 días"). Missing optional values MUST be omitted or shown as "—", never as "undefined" or "null". Raw English codes MUST NOT be visible.

#### Scenario: Municipal tax card

- GIVEN obligation "Impuesto municipal" of type tax on asset "Local Circunvalación", provider "Municipalidad de Córdoba", responsibility tenant, monthly, reminder 3 days, estimate 50000 ARS
- WHEN the card renders
- THEN the heading is "Impuesto municipal" and below it bold labels "Tipo", "Inmueble", "Proveedor", "Responsabilidad", "Cuenta", "Monto estimado", "Frecuencia", "Aviso" appear with values "Impuesto", "Local Circunvalación", "Municipalidad de Córdoba", "Inquilino", the account, a formatted amount with currency, "Mensual", "3 días"

#### Scenario: Missing provider

- GIVEN an obligation without provider
- WHEN the card renders
- THEN "Proveedor" shows "—" or is omitted and no "undefined" text appears

### Requirement: Type labels and type select

Obligation types MUST be displayed using a Spanish label map with a fallback that shows the raw value capitalised for unknown codes (the server type is a free string). The type filter in the obligations tab MUST be a select populated from the label map, with an "Todos" option, replacing the free-text input. The create/edit form SHOULD offer the same select while still accepting an existing unknown type value.

#### Scenario: Known type

- GIVEN an obligation with type code `tax`
- WHEN rendered
- THEN "Tipo" shows "Impuesto"

#### Scenario: Unknown type

- GIVEN a type code `custom_fee`
- WHEN rendered
- THEN "Tipo" shows a readable fallback and the card does not break

#### Scenario: Filter

- GIVEN obligations of types tax and utility
- WHEN the user selects "Impuesto" in the type select
- THEN only tax obligations are listed

### Requirement: Pending and overdue states

The system MUST compute a `dueState` per occurrence on the server, with values `pending`, `due-soon`, `overdue` (and none for paid/cancelled), using the user's local date. Rules, with D the due day:
- `overdue` when today is after D (day D+1 onward) and the occurrence is unpaid.
- `due-soon` when the occurrence falls in the current month, today is on or before D (inclusive of D), and it is unpaid.
- `pending` otherwise (unpaid future-month occurrences).
The UI MUST render `due-soon` in orange with the text "Pendiente", `pending` as "Pendiente" in neutral colour, and `overdue` as "Vencido" in bold red. Overdue items MUST be visually prioritised over pending ones within the card. The labels "Confirmar", "Confirmada", "Previsto", "Prevista" and the status filter "Previstas/Confirmadas" MUST NOT appear anywhere in the UI.

#### Scenario: Due day inclusive (orange)

- GIVEN an occurrence due on the 10th of the current month and today is the 10th
- WHEN the card renders
- THEN its status is "Pendiente" in orange and not "Vencido"

#### Scenario: Early in month (orange)

- GIVEN due day 10 and today is the 1st of the same month
- WHEN rendered
- THEN "Pendiente" in orange

#### Scenario: Overdue

- GIVEN due day 10 and today is the 11th of the same month
- WHEN rendered
- THEN "Vencido" in bold red replaces "Pendiente"

#### Scenario: Overdue from a previous month

- GIVEN an unpaid occurrence from two months ago
- WHEN rendered
- THEN "Vencido" in bold red

#### Scenario: Future month

- GIVEN an unpaid occurrence in a future month
- WHEN rendered
- THEN "Pendiente" in neutral colour (not orange)

#### Scenario: Paid

- GIVEN an occurrence with a recorded payment
- WHEN rendered
- THEN it shows "Pagado" (no "Pendiente" or "Vencido")

#### Scenario: Confirm vocabulary absent

- GIVEN any obligation list or alert
- WHEN rendered
- THEN no "Confirmar", "Confirmada", "Previsto" or "Prevista" text or button exists

### Requirement: Collapse expected and confirmed

Stored statuses `expected` and `confirmed` MUST both be treated as unpaid/pending in every UI surface (obligations tab, alerts, Home, status filter, asset history, `STATUS_LABELS`). The backend status model and the `/confirm` endpoint MUST be left in place and remain functional but MUST NOT be reachable from any UI control. The status filter MUST offer "Todas", "Pendientes", "Vencidas" and "Pagadas" (no confirm/forecast options).

#### Scenario: Both stored statuses

- GIVEN one occurrence stored as `expected` and one as `confirmed`
- WHEN listed
- THEN both show the same pending/overdue presentation

#### Scenario: Endpoint retained

- GIVEN a direct API call to the confirm endpoint
- WHEN made
- THEN it still succeeds as before

#### Scenario: Filter "Vencidas"

- GIVEN one overdue and one pending occurrence
- WHEN the filter "Vencidas" is chosen
- THEN only the overdue one is listed

### Requirement: Which occurrences a card shows

The card MUST show all unpaid overdue occurrences plus the next upcoming pending occurrence (earliest unpaid not overdue). It MUST NOT list the generated future horizon (previous `slice(-8)` behaviour). When there are no unpaid occurrences it MUST show "Al día".

#### Scenario: Overdue plus next

- GIVEN two overdue occurrences and 12 future occurrences
- WHEN the card renders
- THEN the two overdue and the single next pending occurrence are listed

#### Scenario: All paid

- GIVEN no unpaid occurrences in range
- WHEN rendered
- THEN "Al día" is shown

### Requirement: Card actions

Each card MUST provide "Editar", "Eliminar" and "Registrar pago" actions. "Registrar pago" MUST be available per listed unpaid occurrence and MUST open the payment dialog (see `obligation-payment-registration`). "Editar" MUST open the existing edit form and keep its restrictions (when payment history exists, changes require a future effective date). "Eliminar" MUST ask for confirmation ("¿Eliminar esta obligación?" with "Eliminar" and "Cancelar") before cancelling; declining MUST leave data unchanged. Confirmation MUST soft-cancel as today.

#### Scenario: Delete confirmed

- GIVEN a card
- WHEN the user presses "Eliminar" and confirms
- THEN the obligation is cancelled and disappears from the list

#### Scenario: Delete declined

- GIVEN the confirmation dialog is open
- WHEN the user presses "Cancelar"
- THEN nothing changes

#### Scenario: Edit

- GIVEN a card
- WHEN "Editar" is pressed
- THEN the edit form opens prefilled

### Requirement: Cancelled obligations hidden

Cancelled obligations MUST NOT appear in the obligations tab by default.

#### Scenario: After delete

- GIVEN an obligation was deleted
- WHEN the tab reloads
- THEN it is not listed

## Data Contract

- Occurrence view gains `dueState`: `'pending' | 'due-soon' | 'overdue' | null`, additive. Existing `overdue` boolean semantics stay (date strictly before today).
- Stored statuses unchanged.

## Edge Cases

- "Today" uses the same timezone basis as the existing `occurrenceView`.
- Last day of a short month: due day 31 in a 30-day month uses the occurrence's stored date.
- An occurrence paid partially is out of scope (payment is full per occurrence).

## Acceptance Criteria

- Cards show bold labels and values; statuses are orange "Pendiente" through the due day and bold red "Vencido" after it.
- No "Confirmar"/"Previsto" in the UI; Edit, Delete (confirmed) and "Registrar pago" available.
