# Activity Log Enrichment Specification

> Traceability: request.md 2 (Enriquecimiento del detalle); proposal item 2.1.

## Purpose

Make log messages descriptive and store structured metadata at write time so they can be filtered and undone.

## Requirements

### Requirement: Descriptive messages

Log messages for obligation resolution, payment and rent collection SHALL include the property name, the exact amount with currency and the due date or installment, in Spanish. A resolution SHALL read like: "Resolviste un vencimiento de la obligación [Tipo] de la propiedad [X], por un monto de [Y], con vencimiento/cuota [Z]". When a datum is unavailable, the message SHALL omit that fragment instead of printing "undefined" or empty brackets.

#### Scenario: Municipal tax resolved
- GIVEN a municipal tax of 15.000 ARS due 10/11/2026 on property "Casa Centro"
- WHEN the user resolves it
- THEN the log reads "Resolviste un vencimiento de la obligación Impuesto Municipal de la propiedad Casa Centro, por un monto de ARS 15.000, con vencimiento 10/11/2026"

#### Scenario: Missing amount
- GIVEN an obligation without a known amount
- WHEN it is resolved
- THEN the message omits the amount fragment and contains no "undefined"

#### Scenario: Installment obligation
- GIVEN an obligation occurrence that carries installment data 3/12 (obligation occurrences carry none today; the fragment is omitted otherwise)
- WHEN it is paid
- THEN the message shows the installment as "cuota 3/12"

### Requirement: Write-time metadata

Entries created by these actions SHALL store additive fields: `assetId`, `ownerIds`, `tenantIds` (array; the log query parameter stays `tenantId` and matches by membership), `categoryId` (when applicable) and an `undo` descriptor (target type, ids and, for payments, the transaction id). Routes SHALL provide them through `res.locals.activityMeta`. Existing entries without these fields SHALL stay valid and readable. A failed request SHALL NOT store an `undo` descriptor.

#### Scenario: Metadata stored
- WHEN an obligation is resolved
- THEN the entry stores the asset id, owner ids, tenant ids and category id

#### Scenario: Old entry
- GIVEN an entry created before this change
- WHEN the logs list loads
- THEN it renders with its old message and no error

#### Scenario: Failed action
- WHEN the action responds with an error status
- THEN the entry has no `undo` descriptor
