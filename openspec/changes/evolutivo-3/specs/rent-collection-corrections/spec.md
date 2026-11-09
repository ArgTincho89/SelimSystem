# Rent Collection Corrections Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs. Traceability: request.md "Avisos".

> **Drift resolved (design.md wins).** `clasificacion` in the body is `'A'|'B'` only (no "Mixto"); `ivaPorcentaje`/`ivaIncluded` are derived server-side from the allocated contracts and are not body fields. The tombstone (`reversedAt`, `reversedTransactionId`) keeps the idempotency key, so a replay returns 409 "Ese cobro fue anulado; registrá uno nuevo". Reversal is `reverseCollection` service via `POST /api/rentals/collections/:id/reverse` and `DELETE /api/transactions/:id`. The expected occurrence amount is GROSS (net + IVA), the contract amount stays NET. Reconciled-account 409 message is chosen in implementation (design lists conditions only).

## Purpose

Let the user register the collection of exactly the selected rent period from Avisos, have IVA rents classified correctly (not as B), and undo a wrongly registered collection so the period returns to pending.

## Requirements

### Requirement: Single-occurrence collection from Avisos

When "Registrar cobro" is pressed on a pending rent in "Alquileres pendientes de cobro", the dialog MUST register only that selected occurrence. It MUST NOT list other occurrences (neither past nor future months of the contract). The amount MUST default to the remaining amount of that occurrence (editable, > 0, not above the remaining amount). The asset-level "Registrar cobro" MAY keep multi-period selection (DEFAULT).

#### Scenario: Only selected period

- GIVEN a contract with occurrences for 2026-05 (pending) and 2026-06..2026-12 (future)
- WHEN "Registrar cobro" is pressed on the 2026-05 alert
- THEN the dialog shows only the 2026-05 period and its remaining amount
- AND no checkbox list of months is displayed

#### Scenario: Collect selected period

- GIVEN the dialog for 2026-05 with amount 121.000,00 ARS, an active account and a date
- WHEN confirmed
- THEN one collection is created allocated only to the 2026-05 occurrence and other occurrences are unchanged

#### Scenario: Amount above remaining

- GIVEN a remaining amount of 121.000,00
- WHEN 130.000,00 is submitted
- THEN the request is rejected with 400 and a Spanish message

### Requirement: Remove reusable payment method

The collection dialog MUST NOT show "Medio reutilizable" (the saved payment method select). It MUST keep an optional free-text "Medio de cobro". The API MUST accept a collection without `paymentMethodId` and without a method text. The idempotency fingerprint MUST NOT depend on `paymentMethodId`.

#### Scenario: Dialog fields

- GIVEN the collection dialog opened from Avisos
- WHEN rendered
- THEN it shows Cuenta, Fecha, Importe, optional Medio de cobro, Clasificación/IVA, Notas, and no "Medio reutilizable"

#### Scenario: Without method

- GIVEN an empty "Medio de cobro"
- WHEN confirmed
- THEN the collection is created successfully

### Requirement: IVA classification of collections

When the collected occurrence belongs to a locación modality with IVA, the created income transaction MUST be classified `clasificacion: 'A'` with `ivaPorcentaje` equal to the modality IVA % (DEFAULT Q3). When there is no IVA, classification remains unset (reported as B by existing rules). The dialog MUST show the classification and IVA % prefilled and let the user change them. The transaction MUST be created on the selected account (the primary account is preselected by default).

#### Scenario: Locación with IVA 21%

- GIVEN a locación occurrence with expected amount 121.000,00 (100.000 + IVA 21%)
- WHEN the collection is registered with defaults
- THEN the transaction has `clasificacion: 'A'` and `ivaPorcentaje: 21`
- AND income reporting does not count it as B

#### Scenario: Locación without IVA

- GIVEN a locación occurrence with IVA 0 or empty
- WHEN collected
- THEN the transaction has no classification (existing behavior)

#### Scenario: Comodato / Mutuo

- GIVEN a comodato or mutuo occurrence
- WHEN collected
- THEN no IVA classification is applied by default

#### Scenario: User override

- GIVEN the dialog prefilled with A / 21
- WHEN the user changes classification to B
- THEN the transaction is stored as chosen

#### Scenario: Primary account default

- GIVEN a primary active account in the occurrence currency
- WHEN the dialog opens
- THEN that account is preselected and can be changed

### Requirement: Reverse a rent collection

The user MUST be able to delete the income transaction of a rent collection (and equivalently reverse the collection). The operation MUST atomically remove the transaction, the collection and its allocations, so the affected occurrence(s) become pending again (or overdue per due date) and reappear in Avisos as pending collection. The previous "inmutable" 409 on `DELETE` of a collection transaction MUST be replaced by this behavior. Editing a collection transaction (`PUT`) MAY remain blocked with a message that points to deleting/reversing (DEFAULT). Reversal MUST be rejected with 409 and a Spanish message when the account was reconciled after the collection date (DEFAULT Q10). Attached receipts (documents) MUST be kept. The reversal MUST generate an audit-log entry that keeps the old amounts. The idempotency key of the reversed collection MUST NOT make a new collection with the same data resolve to the removed one.

#### Scenario: Delete returns to pending

- GIVEN a collection of 121.000,00 for 2026-05 registered to the primary account
- WHEN the user deletes its transaction in Transacciones and confirms
- THEN the transaction, collection and allocations are removed
- AND the 2026-05 occurrence appears again in Avisos as pending collection
- AND the account balance decreases by 121.000,00

#### Scenario: Register again correctly

- GIVEN the reversed 2026-05 occurrence
- WHEN "Registrar cobro" is pressed again with the right account and classification
- THEN a new collection is created (not the old one resurrected)

#### Scenario: Multi-period collection

- GIVEN one collection allocated to 2026-04 and 2026-05
- WHEN it is reversed
- THEN both occurrences return to pending

#### Scenario: Reconciled account

- GIVEN the account was reconciled after the collection date
- WHEN reversal is attempted
- THEN it is rejected with 409 and "La cuenta fue conciliada; no se puede revertir el cobro" and nothing changes

#### Scenario: Receipt kept

- GIVEN a collection with an attached receipt
- WHEN reversed
- THEN the document remains linked to the asset and is flagged as belonging to a reversed collection

#### Scenario: Edit blocked with guidance

- GIVEN a collection transaction
- WHEN edited via `PUT`
- THEN the response is 409 with a message telling the user to delete the transaction to correct it

#### Scenario: Atomicity

- GIVEN a failure while removing allocations
- WHEN reversal runs
- THEN no partial removal persists

## Data Contract

- `POST /api/rentals/collections` accepts `{ occurrenceId?, occurrenceIds?, accountId, date, amountMinor, paymentMethod?, clasificacion?, ivaPorcentaje?, notes? }`; `paymentMethodId` is no longer required or sent.
- Reversal via `DELETE /api/transactions/:id` for collection transactions and/or `POST /api/rentals/collections/:id/reverse` (design.md decides).
- Collection response/alert payload exposes `ivaPorcentaje` and `modality` of the occurrence.

## Validation Rules

- Account active and same currency as the occurrence.
- Amount > 0 and <= remaining of selected occurrence(s).
- `clasificacion` in A/B/Mixto when provided; `ivaPorcentaje` 0-100.
- Reversal only for the owner's data.

## Edge Cases

- Partially collected occurrence reversed returns to its prior remaining amount.
- Notes (`wealth-notes`) targeting the removed collection MUST NOT break; they remain or are detached without error.
- Transfers touching the account: reversal rejected if the movement is part of a reconciled period.

## Changes to baseline

- `alerts-center` (evolutivo-2): "Registrar cobro" opens the single-occurrence dialog.
- `payment-and-receipts` (evolutivo-2): receipts survive reversal.

## Acceptance Criteria

- Avisos collects one period only, with no "Medio reutilizable".
- A locación with IVA is stored as A with IVA %, not B.
- Deleting a collection transaction returns the rent to pending in Avisos.
