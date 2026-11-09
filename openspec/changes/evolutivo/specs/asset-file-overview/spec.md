# Asset File Overview Specification

## Purpose

Provide one read model for the consolidated asset file (ficha) that answers obligations, upcoming due dates, pending items, documents, and notes questions for a single asset.

## Requirements

### Requirement: Overview endpoint

The system MUST expose `GET /api/assets/:id/file` returning a consolidated read-only view of an asset.

#### Scenario: Request overview

- GIVEN a valid user-owned asset
- WHEN the endpoint is called
- THEN the consolidated sections are returned

#### Scenario: Unknown asset

- GIVEN an unknown asset id
- WHEN requested
- THEN the response is 404

#### Scenario: Unauthenticated

- GIVEN no session
- WHEN requested
- THEN the response is 401

### Requirement: Obligations section

The overview MUST list the asset's obligations with responsibility type, responsible party, status, next occurrence, and resolution status.

#### Scenario: Obligation listing

- GIVEN an asset with obligations
- WHEN the overview is generated
- THEN each obligation appears with responsibility and next due date

### Requirement: Upcoming due dates

The overview MUST list upcoming due dates (obligations, rent, contract expiry, card installments, adjustments) within the horizon, using the same rules as the alerts center.

#### Scenario: Insurance due date

- GIVEN a vehicle with an insurance obligation due in 20 days
- WHEN the overview is generated
- THEN it appears among upcoming due dates

### Requirement: Pending items

The overview MUST list pending collection and payment items: unpaid or partial occurrences, rent not collected, receipts not received (`tenant_obligation_pending`), and pending documents. Occurrences with status `resolved` MUST NOT appear as pending.

#### Scenario: Pending receipt

- GIVEN a tenant obligation without a resolution
- WHEN the overview is generated
- THEN it appears as a pending item

#### Scenario: Resolved excluded

- GIVEN a resolved tenant occurrence
- WHEN the overview is generated
- THEN it does not appear among pending items

### Requirement: Documents and notes

The overview MUST include documents linked to the asset or its obligations, occurrences, contracts, and tenants, and the asset notes.

#### Scenario: Documents and notes included

- GIVEN an asset with documents and notes
- WHEN the overview is generated
- THEN both are included

### Requirement: Question coverage

The overview MUST provide data sufficient to answer: rent collected this month, what is pending, which receipts are missing, who paid each service, cost to maintain the asset over the last 12 months, the asset's obligations, and when insurance expires.

#### Scenario: Who paid

- GIVEN occurrences paid by owner or resolved by tenant
- WHEN the overview is generated
- THEN each obligation row indicates the settling party

### Requirement: Read-only aggregation

The overview MUST aggregate existing services, MUST NOT mutate data, and MUST NOT count tenant resolution amounts in owner cost totals.

#### Scenario: Cost excludes resolutions

- GIVEN a tenant resolution with an amount
- WHEN the 12-month maintenance cost is computed
- THEN the resolution is excluded from owner cost

## Data Contract

Response:
- `assetId`, `generatedAt`
- `obligations`: array of `{ obligationId, title, responsibilityType, responsibleParty, status, nextDueDate, resolutionStatus }`
- `upcoming`: array of alert-shaped items (see `alerts-center`)
- `pending`: array of `{ type, occurrenceId?, rentOccurrenceId?, title, amount?, currencyCode?, dueDate }`
- `documents`: array of `{ id, title, fileName, contentType, uploadedAt, targets }`
- `notes`: array of `{ id?, text, createdAt? }`
- `costLast12MonthsMinorByCurrency`: object
- `rentCollectedThisMonthMinorByCurrency`: object

Query: `horizonDays` (default 90).

## Validation Rules

- The asset MUST exist and belong to the user.
- `horizonDays`, when provided, MUST be an integer between 1 and 365.

## Edge Cases

- Assets without obligations or documents return empty arrays.
- Amounts in different currencies are never mixed.
- Cancelled occurrences are excluded.
- Dangling document links are ignored.

## Acceptance Criteria

- One endpoint lists obligations, upcoming dues, pending items, documents, and notes.
- Resolved occurrences are not pending; resolution amounts are excluded from owner cost.
- Output is read-only and per-currency.
