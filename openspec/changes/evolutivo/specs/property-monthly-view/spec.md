# Property Monthly View Specification

## Purpose

Provide a per-month economic table for a property, including rent, obligations, receipts, expenses, claims, recoveries, and documents.

## Requirements

### Requirement: Monthly view endpoint

The system MUST expose an endpoint returning month-by-month data for an asset, with optional `from` and `to` month filters.

#### Scenario: Request monthly view

- GIVEN a valid asset
- WHEN `GET /api/assets/:id/monthly-view` is called
- THEN a list of months with economic data is returned

#### Scenario: Invalid asset

- GIVEN an unknown asset id
- WHEN requested
- THEN the response is 404

### Requirement: Rent summary per month

For each month, the system MUST include expected rent, collected rent, and the difference.

#### Scenario: Rent difference

- GIVEN rent occurrences in a month
- WHEN the view is generated
- THEN expected, collected, and difference are calculated in minor units

### Requirement: Obligations per month

For each month, the system MUST list obligation occurrences due that month with responsible party, estimated amount, actual amount, status, and linked documents.

#### Scenario: Obligation row

- GIVEN an obligation occurrence due in the month
- WHEN the view is generated
- THEN it appears with responsibility type and amounts

### Requirement: Movements and claims per month

For each month, the system MUST include attributed expenses, income, refunds, recoverable claims, and recoveries.

#### Scenario: Attributed expense

- GIVEN an expense attributed to the asset in the month
- WHEN the view is generated
- THEN it contributes to that month's expenses

### Requirement: Documents per month

For each month, the system MUST include documents linked to the asset or its obligations, contracts, occurrences, or transactions in that month.

#### Scenario: Document inclusion

- GIVEN a document linked to an occurrence in the month
- WHEN the view is generated
- THEN it is listed under that month

### Requirement: Resolution status in obligation rows

Each obligation row MUST show the tenant resolution status and resolved amount when a resolution exists. Resolution amounts MUST NOT be added to the month's expenses.

#### Scenario: Resolved row

- GIVEN a tenant occurrence with a resolution in the month
- WHEN the view is generated
- THEN the row shows `resolutionStatus` `resolved` and `resolutionAmountMinor`, and expenses are unchanged

#### Scenario: Shared row portions

- GIVEN a shared occurrence with owner paid and tenant resolved
- WHEN the view is generated
- THEN the row shows owner actual and tenant resolved amounts separately

## Data Contract

Response:
- `assetId`, `from` (YYYY-MM), `to` (YYYY-MM)
- `months`: array of:
  - `month` (YYYY-MM)
  - `rent`: `{ expectedMinor, collectedMinor, differenceMinor, currencyCode }` (grouped when multiple currencies)
  - `obligations`: array of `{ occurrenceId, obligationId, title, responsibilityType, estimatedMinor, actualMinor, status, currencyCode, documentIds, resolutionStatus (`none`|`partial`|`resolved`), resolutionAmountMinor }`
  - `expensesMinorByCurrency`: object
  - `incomeMinorByCurrency`: object
  - `refundsMinorByCurrency`: object
  - `recoveriesMinorByCurrency`: object
  - `claims`: array of `{ claimId, amountMinor, currencyCode, status }`
  - `documents`: array of `{ id, title, fileName, contentType, uploadedAt }`
  - `notes`: array of strings

Default range: 12 months ending in the current month. Maximum 120 months.

## Validation Rules

- `from` and `to`, when provided, MUST be valid months in YYYY-MM format.
- `from` MUST NOT be after `to`.
- The requested range MUST NOT exceed 120 months.
- The asset MUST exist and belong to the user.

## Edge Cases

- Months with no activity still appear with zero values.
- Multiple currencies are reported separately and never mixed.
- Cancelled occurrences are excluded.
- Posted totals only include posted transactions; tenant resolutions are not transactions.

## Acceptance Criteria

- Monthly table includes rent, obligations, expenses, income, refunds, claims, recoveries, and documents.
- Range validation is enforced.
- Empty months are included.