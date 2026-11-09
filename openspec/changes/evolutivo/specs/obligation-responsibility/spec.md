# Obligation Responsibility Specification

## Purpose

Define who is responsible for an obligation (owner, tenant, shared, third party, or none) and how shared obligations are split, so alerts and accounting reflect the responsible party.

## Requirements

### Requirement: Responsibility type on obligation

The system MUST store a `responsibilityType` on every obligation with one of `owner`, `tenant`, `shared`, `third`, or `none`. Existing obligations without the field MUST default to `owner`.

#### Scenario: Create obligation with responsibility

- GIVEN a valid obligation payload
- WHEN `responsibilityType` is provided
- THEN it is persisted and returned

#### Scenario: Missing responsibility defaults

- GIVEN an obligation created without `responsibilityType`
- WHEN it is read
- THEN `responsibilityType` equals `owner`

### Requirement: Shared split rules

When `responsibilityType` is `shared`, the system MUST store a `responsibilitySplit` defining either percentage, fixed amounts, or an agreed rule.

#### Scenario: Percentage split

- GIVEN a shared obligation with owner 50% and tenant 50%
- WHEN persisted
- THEN both percentages are stored and sum to 100

#### Scenario: Fixed split

- GIVEN a shared obligation with fixed amounts
- WHEN persisted
- THEN both fixed minor amounts are stored and are non-negative

#### Scenario: Invalid split rejected

- GIVEN percentages that do not sum to 100
- WHEN the obligation is saved
- THEN the request is rejected with 400

### Requirement: Third-party responsibility

When `responsibilityType` is `third`, the system MUST store a valid `responsibleThirdEntityId`.

#### Scenario: Third party link

- GIVEN a legal owner with any role
- WHEN assigned as third party
- THEN the link is persisted

### Requirement: Responsibility affects alerts

The system MUST use responsibility to classify alerts: owner obligations generate payment reminders, tenant obligations generate receipt-pending reminders, and shared obligations generate reminders for both the owner portion and receipt collection.

#### Scenario: Tenant obligation alert

- GIVEN an obligation with tenant responsibility
- WHEN alerts are generated
- THEN a `tenant_obligation_pending` alert is produced requesting the receipt

### Requirement: Tenant portion settled via resolution

For `tenant` and `shared` obligations, the tenant portion MUST be settled through a tenant obligation resolution (see `tenant-obligation-resolution`), never through a ledger transaction. The owner portion of a shared obligation MUST be settled through payments. Both portions MUST be tracked separately so neither is double-counted, and the occurrence is fully settled only when both are settled.

#### Scenario: Shared settled separately

- GIVEN a shared obligation split 60/40 owner/tenant
- WHEN the owner pays the owner portion and a resolution covers the tenant portion
- THEN each portion is settled independently and the total is counted once

#### Scenario: Tenant portion excluded from owner totals

- GIVEN a shared occurrence with a tenant resolution
- WHEN owner expense totals are computed
- THEN only the owner payments are included

### Requirement: Payment responsible holder

A holder with role `payment_responsible` MAY be the responsible party of an obligation via `responsibleThirdEntityId`.

#### Scenario: Payment responsible as responsible party

- GIVEN a holder with role `payment_responsible`
- WHEN assigned as the responsible party
- THEN the link is accepted

## Data Contract

Obligation additions:
- `responsibilityType`: `owner`|`tenant`|`shared`|`third`|`none`
- `responsibilitySplit`: `{ type: percentage|fixed|other, ownerPercent?, tenantPercent?, ownerFixedMinor?, tenantFixedMinor?, ruleText? } | null`
- `responsibleThirdEntityId`: string | null
- `rentalContractId`: string | null (optional link to a rental contract for the same asset)

## Validation Rules

- `responsibilityType` MUST be one of the allowed values.
- If `shared`, `responsibilitySplit` MUST be provided and valid.
- Percentage splits MUST sum to 100.
- Fixed amounts MUST be non-negative integers in minor units.
- `responsibleThirdEntityId`, when provided, MUST reference a valid legal owner.
- `rentalContractId`, when provided, MUST reference a valid rental contract for the same asset.

## Edge Cases

- Changing responsibility on an obligation with payment history MUST apply to future occurrences only.
- `none` responsibility MUST NOT generate tenant or owner payment alerts.
- Split values are informational and do not alter posted totals; tenant portions never become posted totals.
- A shared occurrence with only one portion settled remains open.

## Acceptance Criteria

- Responsibility type and split are persisted and returned.
- Invalid responsibility or split is rejected.
- Alerts reflect the responsible party.