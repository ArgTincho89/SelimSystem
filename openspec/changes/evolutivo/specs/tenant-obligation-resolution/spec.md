# Tenant Obligation Resolution Specification

## Purpose

Record that a tenant fulfilled (paid) an obligation occurrence, or the tenant portion of a shared occurrence, without creating any financial transaction, so the owner can evidence compliance and close pending tenant-obligation follow-ups.

## Requirements

### Requirement: Create resolution

The system MUST allow creating an `obligationResolution` for an occurrence whose obligation has responsibility `tenant` or `shared`. A resolution MUST store the occurrence, tenant, period, amount in minor units, currency, receipt document references, and `resolvedAt`.

#### Scenario: Resolve a tenant occurrence

- GIVEN an occurrence of an obligation with `responsibilityType` `tenant` and an existing tenant legal owner
- WHEN a resolution is created with period, amount, currency, and `resolvedAt`
- THEN the resolution is persisted and returned with its identifier

#### Scenario: Resolve with receipts

- GIVEN documents linked to the occurrence or tenant
- WHEN a resolution is created with `documentIds` referencing them
- THEN the references are stored and the documents remain retrievable

#### Scenario: Ineligible responsibility rejected

- GIVEN an occurrence whose obligation has responsibility `owner`, `third`, or `none`
- WHEN a resolution is created
- THEN the request is rejected with 400

### Requirement: Non-ledger behavior

A resolution MUST NOT create, modify, or link any ledger or account transaction. Resolution amounts MUST NOT count in Home KPIs, owner expense totals, account balances, or any posted-transaction aggregate.

#### Scenario: No transaction created

- GIVEN a successful resolution
- WHEN transactions are listed
- THEN no new transaction exists and account balances are unchanged

#### Scenario: Excluded from totals

- GIVEN a resolution with an amount
- WHEN Home KPIs and owner expense totals are computed
- THEN the resolution amount is not included in any total

### Requirement: Occurrence status

A tenant-responsibility occurrence with a resolution MUST have status `resolved`. For a shared occurrence, the tenant portion MUST be settled by a resolution and the owner portion MUST be settled by payments; the occurrence MUST be closed (status `paid`) only when both portions are settled.

#### Scenario: Tenant occurrence resolved

- GIVEN a tenant-responsibility occurrence with status `pending`
- WHEN a resolution is created
- THEN the occurrence status becomes `resolved`

#### Scenario: Shared occurrence partially settled

- GIVEN a shared occurrence with owner and tenant portions
- WHEN only the tenant resolution exists
- THEN the tenant portion is settled, the owner portion remains pending, and the occurrence is not closed

#### Scenario: Shared occurrence fully settled

- GIVEN a shared occurrence whose owner portion is paid in full
- WHEN a resolution settles the tenant portion
- THEN the occurrence is fully settled and closed

### Requirement: Separate portion tracking

For shared occurrences the system MUST track tenant and owner portions separately so that neither portion is double-counted. Owner payments MUST NOT reduce the tenant portion, and a resolution MUST NOT reduce the owner portion.

#### Scenario: No double counting

- GIVEN a shared occurrence of 1000 split 50/50
- WHEN the owner pays 500 and the tenant resolution records 500
- THEN owner paid is 500, tenant resolved is 500, and total settled is 1000

#### Scenario: Resolution exceeds tenant portion

- GIVEN a shared occurrence with tenant portion 500
- WHEN a resolution amount greater than 500 is submitted
- THEN the request is rejected with 400

### Requirement: Close pending alerts

Creating a resolution MUST close the corresponding `tenant_obligation_pending` alert for that occurrence (or tenant portion). Deleting a resolution MUST reopen it.

#### Scenario: Alert closed

- GIVEN a `tenant_obligation_pending` alert for an occurrence
- WHEN a resolution is created
- THEN the alert is no longer returned

#### Scenario: Resolution removed

- GIVEN a resolved occurrence
- WHEN its resolution is deleted
- THEN the occurrence returns to its prior open status and the alert is returned again

### Requirement: Read and delete

The system MUST allow listing resolutions by `occurrenceId`, `obligationId`, `tenantEntityId`, `assetId`, and period, and deleting a resolution.

#### Scenario: List by occurrence

- GIVEN a resolution for an occurrence
- WHEN listing with `occurrenceId`
- THEN that resolution is returned

## Data Contract

`obligationResolution`:
- `id`, `userId`, `createdAt`, `updatedAt`
- `occurrenceId` (required), `obligationId` (derived), `assetId` (derived)
- `tenantEntityId` (required), `contractId?`
- `period` (YYYY-MM, required)
- `portion`: `full` | `tenant_portion` (derived from responsibility)
- `amountMinor` (integer > 0), `currencyCode`
- `documentIds`: string[]
- `resolvedAt` (YYYY-MM-DD, required)
- `notes?`

Occurrence view additions (computed on read, never stored): status `resolved`; `ownerDueAmount`, `tenantDueAmount`, `tenantRemainingAmount`, `resolution`. `remainingAmount` refers to the owner portion only.

## Validation Rules

- `occurrenceId` MUST reference a valid user-owned occurrence that is not cancelled.
- The obligation responsibility MUST be `tenant` or `shared`.
- `tenantEntityId` MUST reference a legal owner with tenant role; for a rental contract link it MUST match the contract tenant.
- `amountMinor` MUST be a positive integer; for shared it MUST NOT exceed the tenant portion.
- `currencyCode` MUST match the occurrence currency.
- `documentIds`, when provided, MUST reference valid user-owned documents consistent with the occurrence or tenant.
- `resolvedAt` MUST be a valid date.
- At most one active resolution per occurrence (tenant or shared responsibility); a resolution can be voided (DELETE) to reopen the occurrence and its alert.

## Edge Cases

- Resolution never produces a transaction, claim, or recovery.
- Cancelled occurrences cannot be resolved.
- Changing obligation responsibility applies to future occurrences only and does not invalidate existing resolutions.
- Dangling document references are ignored on read.

## Acceptance Criteria

- Resolution stores occurrence, tenant, period, amount, receipts, and `resolvedAt` with no transaction.
- Occurrence becomes `resolved`; `tenant_obligation_pending` closes.
- Shared occurrences track tenant and owner portions without double counting.
- Resolved amounts never appear in Home KPIs or owner expense totals.
