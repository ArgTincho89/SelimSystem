# Account Transfers UI Specification

> Traceability: request.md (Home: "movimiento entre cuentas ... quitar eso", "botón de nueva transacción ... gasto, ingreso y reembolso ... otro botón ... transferencias ... cuenta de salida, cuenta de ingreso, monto ... título ... nota ... no afecta a los ingresos, gastos ni ahorro, pero sí al saldo de las cuentas").

## Purpose

Remove the noisy Home block and let the user record account-to-account transfers from "Nueva transacción", affecting balances only.

## Requirements

### Requirement: Remove the Home block

The Home page (mobile and desktop layouts) MUST NOT render the "Movimiento entre cuentas" block, including the text about transfers not counting as income/expense, the "no hay transferencias contabilizadas" message, and the "Pendiente fuera de los importes reales" section (obligations, expected rents). The renderer (`renderEconomicContext`) and its call sites MUST be removed. Income, expense and savings cards MUST be unaffected. The API fields `overview.transfers` and `overview.pending` MUST remain.

#### Scenario: Home without block

- GIVEN the Home page
- WHEN rendered on mobile and on desktop
- THEN no "Movimiento entre cuentas" text or pending-outside-real-amounts section appears below the income/expense/savings cards

#### Scenario: API unchanged

- GIVEN the overview endpoint
- WHEN called
- THEN it still returns `transfers` and `pending`

### Requirement: "Transferencia" type in Nueva transacción

The "Nueva transacción" type selector MUST offer, besides gasto, ingreso and reembolso, a type button labelled "Transferencia". Selecting it MUST swap the form to a transfer sub-form with: "Cuenta de origen" (required), "Cuenta de destino" (required), "Monto" (required, > 0), "Fecha" (default today), "Título" (optional) and "Nota" (optional). Fee and allocation inputs MUST NOT be shown. Expense/income/refund-only fields (category, payment method, etc.) MUST be hidden for this type and switching back MUST restore the previous forms without data leakage.

#### Scenario: Type visible

- GIVEN the new-transaction form
- WHEN opened
- THEN type buttons for expense, income, refund and "Transferencia" are present

#### Scenario: Sub-form fields

- GIVEN the user selects "Transferencia"
- WHEN the form updates
- THEN it shows origin, destination, amount, date, title and note and no category or fee fields

#### Scenario: Switch back

- GIVEN "Transferencia" was selected and the user returns to expense
- WHEN the form updates
- THEN the expense fields show with no transfer values leaking

### Requirement: Transfer validation

Origin and destination MUST be different accounts. The destination list SHOULD exclude the chosen origin. When the two accounts have different currencies the form MUST additionally require the received amount in the destination currency ("Monto recibido"); same-currency transfers MUST NOT ask for it. Accounts without a reconciled balance MUST remain selectable but the form MUST NOT invent a balance. Insufficient-balance handling follows existing ledger rules. Future-dated posted transfers MUST be rejected with the server message shown. Invalid input MUST show inline Spanish messages and send nothing.

#### Scenario: Same account

- GIVEN origin equals destination
- WHEN the user submits
- THEN an inline error is shown and no request is sent

#### Scenario: Different currencies

- GIVEN origin in ARS and destination in USD
- WHEN selected
- THEN "Monto recibido" appears and is required

#### Scenario: Same currency

- GIVEN both accounts in ARS
- WHEN selected
- THEN no received-amount field is shown

#### Scenario: Missing amount

- GIVEN amount empty or 0
- WHEN submitted
- THEN an inline error is shown

### Requirement: Saving a transfer

Submitting MUST create the transfer through the existing transfers API (`API.transfers.create`) with title, note and the chosen accounts, close the form, refresh Home and account balances, and show a Spanish success message. The origin balance MUST decrease by the amount and the destination balance MUST increase by the received amount, per currency. The transfer MUST NOT change the income, expense or savings totals. The transfer MUST appear in the transactions list as a transfer. Double submission MUST be prevented.

#### Scenario: Balances change

- GIVEN accounts A (ARS 100000) and B (ARS 0)
- WHEN a transfer of 30000 from A to B is saved
- THEN A shows 70000 and B shows 30000

#### Scenario: Totals unchanged

- GIVEN the month's income, expense and savings values
- WHEN a transfer is saved
- THEN those values are unchanged

#### Scenario: Listed

- GIVEN a saved transfer
- WHEN the transactions list loads
- THEN it appears labelled "Transferencia" with origin and destination

#### Scenario: Server error

- GIVEN the server rejects the transfer
- WHEN the response arrives
- THEN the error is shown in the form and the form stays open with the data

### Requirement: Transfer title and note

Transfers MUST store an optional title (existing `reference` field may carry it, assumption) and a new optional `notes` field. `notes` MUST be accepted on create and update, persisted, returned, capped in length, and shown in the transfer detail view (`showTransferDetails`) as "Nota". Existing transfers without notes MUST keep working and show no empty "Nota" row.

#### Scenario: Note persisted

- GIVEN title "Ahorro" and note "Pasaje a USD"
- WHEN the transfer is saved and its detail opened
- THEN both are shown

#### Scenario: Legacy transfer

- GIVEN a transfer created before this change
- WHEN its detail opens
- THEN no empty note is shown and no error occurs

#### Scenario: Update note

- GIVEN a transfer
- WHEN its note is edited via PUT
- THEN the new note is stored

### Requirement: Transfer type usable by E2E contract

The type buttons MUST keep the `.type-btn` class convention so existing E2E page objects can select the new type, and the page object MUST be updated accordingly.

#### Scenario: Selector

- GIVEN the E2E TransactionForm page object
- WHEN selecting "Transferencia"
- THEN it uses the same `.type-btn` mechanism as other types

## Data Contract

- `POST /api/transfers` / `PUT`: accepts additional optional `notes`; `createTransferRecord` stores it. No change to fee/allocations behaviour (UI never sends them).
- No migration; `notes` absent on old records.

## Edge Cases

- Deleted or archived accounts are not selectable.
- Amount uses the app money input and minor units.
- A transfer from the Transferencia form MUST NOT create a transaction record counted by income/expense queries.

## Acceptance Criteria

- Home has no "Movimiento entre cuentas" block; "Nueva transacción" offers "Transferencia" with origin, destination, amount, title and note; saving changes only account balances.
