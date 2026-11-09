# Ownership Overlap Validation Specification

## Purpose

Keep ownership history of an asset consistent while allowing shared (concurrent) ownership. An asset MAY have several holders at the same time (e.g. 50% mother, 50% father). What MUST be prevented is (a) the same holder having two overlapping periods on the same asset, and (b) the concurrent percentages of an asset exceeding 100% on any date.

## Requirements

### Requirement: Concurrent co-ownership allowed

The system MUST allow different holders to have overlapping ownership periods on the same asset.

#### Scenario: Two co-owners at the same time

- GIVEN holder A owns the asset 50% from 2024-01-01 (open-ended)
- WHEN holder B is added with 50% from 2024-01-01
- THEN it is accepted

### Requirement: Same-holder overlap rejected

The system MUST reject an ownership period that overlaps another period of the SAME holder on the same asset.

#### Scenario: Same holder overlapping create rejected

- GIVEN holder A owns the asset from 2024-01-01 to 2024-12-31
- WHEN a new period for holder A from 2024-06-01 to 2024-08-31 is created
- THEN the request is rejected with 400

#### Scenario: Same holder adjacent period accepted

- GIVEN holder A owns the asset until 2024-12-31
- WHEN a new period for holder A starts 2025-01-01
- THEN it is accepted

#### Scenario: Same holder open-ended overlap rejected

- GIVEN holder A has an open-ended period starting 2024-01-01
- WHEN a new period for holder A starting 2025-01-01 is created
- THEN the request is rejected with 400

#### Scenario: Shared boundary day rejected

- GIVEN holder A owns the asset from 2024-01-01 to 2024-06-30
- WHEN a new period for holder A starts 2024-06-30
- THEN the request is rejected with 400

### Requirement: Concurrent percentage cap

On any date, the sum of non-null `percentage` values of the asset's periods active on that date MUST NOT exceed 100. Periods with a null percentage do not count toward the sum.

#### Scenario: Percentages exceed 100 rejected

- GIVEN holder A owns 60% from 2024-01-01 (open-ended)
- WHEN holder B is added with 50% from 2024-06-01
- THEN the request is rejected with 400

#### Scenario: Percentages fit after a period closes

- GIVEN holder A owned 100% from 2024-01-01 to 2024-12-31
- WHEN holder B is added with 100% from 2025-01-01
- THEN it is accepted

### Requirement: Batch asset creation

When creating an asset with multiple ownerships, the system MUST apply both rules across all submitted periods and reject the request with 400 if any is violated.

#### Scenario: Batch same-holder overlap rejected

- GIVEN two periods for the same holder in the same request that overlap
- WHEN the asset is created
- THEN the request is rejected with 400

#### Scenario: Batch co-owners accepted

- GIVEN two different holders at 50% each with the same start date
- WHEN the asset is created
- THEN it is accepted

### Requirement: Patch revalidation

Closing an open period (the only patch allowed) can only shrink it, so it can never introduce a violation. The system MUST NOT reject it on overlap grounds, so legacy data that already violates a rule can be fixed by closing a period.

## Data Contract

No new fields. Validation applies to `assetOwnerships` records:
- `assetId`, `ownerId`, `startDate`, `endDate` (nullable), `percentage` (nullable), `notes`.

## Validation Rules

- Two periods overlap when `startA <= (endB || infinity)` and `startB <= (endA || infinity)` (inclusive dates).
- Same-holder rule compares only periods with equal `ownerId`.
- Percentage cap: it is sufficient to check the sum at every period start date within the candidate period (sums only change at start dates).
- `endDate`, when provided, MUST be >= `startDate`; `percentage`, when provided, MUST be between 0 and 100.

## Edge Cases

- Adjacent periods of the same holder are allowed.
- Closed periods do not block future periods.
- Legacy data that already violates a rule is not rewritten; only new writes are validated.

## Acceptance Criteria

- Concurrent co-ownership by different holders is accepted.
- Overlapping periods of the same holder are rejected.
- Concurrent percentages above 100% are rejected.
- Batch creation and patch apply both rules.
