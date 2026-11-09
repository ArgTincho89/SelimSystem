# Alerts Center Specification

## Purpose

Provide a single unified alerts endpoint aggregating all event types that require attention, using per-obligation anticipation.

## Requirements

### Requirement: Unified alerts endpoint

The system MUST expose `GET /api/alerts` returning a normalized list of all alert events for the authenticated user within the configured horizon.

#### Scenario: Aggregate events

- GIVEN obligations, rentals, accounts, card installments, and documents
- WHEN `/api/alerts` is requested
- THEN events of all supported types are returned sorted by date

#### Scenario: Unauthenticated request

- GIVEN no session
- WHEN `/api/alerts` is requested
- THEN the response is 401

### Requirement: Supported alert types

The system MUST support at least these types: `obligation_due`, `obligation_overdue`, `rent_due`, `contract_expiry`, `rent_adjustment_due`, `card_installment_due`, `account_forecast`, `document_pending`, `partial_payment`, `tenant_obligation_pending`.

#### Scenario: Type filtering

- GIVEN the `type` query parameter
- WHEN provided
- THEN only matching alert types are returned

### Requirement: Per-obligation anticipation

For obligation alerts, the system MUST use each obligation's `reminderLeadDays` to decide inclusion; overdue items MUST always be included.

#### Scenario: Anticipation respected

- GIVEN an obligation with 15 days anticipation
- WHEN an occurrence is due in 10 days
- THEN it is included

#### Scenario: Outside anticipation

- GIVEN an obligation with 4 days anticipation
- WHEN an occurrence is due in 10 days
- THEN it is excluded unless overdue

### Requirement: Normalized alert shape

Each alert MUST include `id`, `type`, `date`, `title`, and relevant identifiers and amounts.

#### Scenario: Normalized fields

- GIVEN any alert
- WHEN returned
- THEN it contains `id`, `type`, `date`, and `title`

### Requirement: Query filters

The endpoint MUST support filtering by `from`, `to`, `type`, and `assetId`.

#### Scenario: Asset filter

- GIVEN an asset id
- WHEN provided
- THEN only alerts for that asset are returned

### Requirement: Resolved occurrences excluded

Occurrences with status `resolved` MUST NOT produce `obligation_overdue`, `partial_payment`, `obligation_due`, or `tenant_obligation_pending` alerts.

#### Scenario: Resolved not overdue

- GIVEN a tenant-responsibility occurrence past due with status `resolved`
- WHEN `/api/alerts` is requested
- THEN no `obligation_overdue` or `partial_payment` alert is returned for it

### Requirement: Closing rules for tenant_obligation_pending

A `tenant_obligation_pending` alert MUST close when a tenant obligation resolution exists for the occurrence (or, for shared obligations, for the tenant portion). The alert MUST reopen if the resolution is deleted.

#### Scenario: Resolution closes alert

- GIVEN a `tenant_obligation_pending` alert for an occurrence
- WHEN a resolution is recorded for it
- THEN the alert is no longer returned

#### Scenario: Shared obligation portions

- GIVEN a shared occurrence whose tenant portion is resolved but owner portion unpaid
- WHEN alerts are generated
- THEN no `tenant_obligation_pending` alert is returned and the owner portion still produces its payment alert

#### Scenario: Shared tenant portion unresolved

- GIVEN a shared occurrence whose owner portion is paid but tenant portion is unresolved
- WHEN alerts are generated
- THEN a `tenant_obligation_pending` alert is returned and no owner payment alert is returned

### Requirement: Optional holder filter

The endpoint SHOULD support an optional `holderId` filter returning only alerts related to that holder (tenant, responsible party, or account holder).

#### Scenario: Holder filter

- GIVEN a `holderId`
- WHEN provided
- THEN only alerts linked to that holder are returned

## Data Contract

Alert item:
- `id` (string, unique), `type` (enum), `date` (YYYY-MM-DD)
- `title` (string), `message?` (string)
- `assetId?`, `assetName?`, `obligationId?`, `occurrenceId?`
- `contractId?`, `rentOccurrenceId?`, `transactionId?`
- `tenantEntityId?`, `planId?`, `installmentNumber?`
- `amount?`, `currencyCode?`, `status?`, `reminderLeadDays?`

Query: `from`, `to`, `type`, `assetId`, `holderId?`, `limit` (default 200, max 1000). Horizon default 90 days.

## Validation Rules

- `from`, `to`, when provided, MUST be valid dates and `from <= to`.
- `type`, when provided, MUST be a supported alert type.
- `assetId`, when provided, MUST reference a valid user-owned asset.
- `holderId`, when provided, MUST reference a valid user-owned holder.
- `limit` MUST be an integer between 1 and 1000.

## Edge Cases

- Duplicate underlying events MUST be deduplicated by `id`.
- Alerts MUST NOT mutate data.
- Missing optional identifiers are omitted or null.
- Empty result returns an empty array.

## Acceptance Criteria

- One endpoint returns all event types.
- Per-obligation anticipation is respected.
- Alerts are sorted by date ascending.
- `resolved` occurrences never appear as overdue or partial.
- Tenant resolution closes `tenant_obligation_pending`.