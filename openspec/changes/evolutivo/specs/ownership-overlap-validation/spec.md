# Ownership Overlap Validation Specification

## Purpose

Prevent overlapping ownership periods for the same asset, including shared ownership.

## Requirements

### Requirement: Reject overlapping periods on create

The system MUST reject creating an ownership period that overlaps an existing period for the same asset.

#### Scenario: Overlapping create rejected

- GIVEN an existing ownership from 2024-01-01 to 2024-12-31
- WHEN a new ownership from 2024-06-01 to 2024-08-31 is created
- THEN the request is rejected with 400

#### Scenario: Non-overlapping create accepted

- GIVEN an existing ownership ending 2024-12-31
- WHEN a new ownership starts 2025-01-01
- THEN it is accepted

### Requirement: Reject overlapping periods in batch asset creation

When creating an asset with multiple ownerships, the system MUST validate all pairs and reject overlaps.

#### Scenario: Batch overlap rejected

- GIVEN two ownerships in the same request overlapping
- WHEN the asset is created
- THEN the request is rejected with 400

### Requirement: Open-ended periods

An ownership with no end date MUST be treated as extending indefinitely and MUST overlap any later period for the same asset.

#### Scenario: Open-ended overlap

- GIVEN an existing open-ended ownership starting 2024-01-01
- WHEN a new ownership starting 2025-01-01 is created
- THEN the request is rejected with 400

### Requirement: Inclusive boundary rule

Periods sharing a boundary day MUST be considered overlapping; adjacent periods (end date one day before start date) are allowed.

#### Scenario: Shared boundary rejected

- GIVEN an existing ownership from 2024-01-01 to 2024-06-30
- WHEN a new ownership starts 2024-06-30
- THEN the request is rejected with 400

## Data Contract

No new fields. Validation applies to `assetOwnerships` records:
- `assetId`, `ownerId`, `startDate`, `endDate` (nullable), `percentage`, `notes`.

## Validation Rules

- Two periods overlap when `startA <= (endB || infinity)` and `startB <= (endA || infinity)`.
- `startDate` and `endDate` MUST be valid dates; `endDate`, when provided, MUST be >= `startDate`.
- Overlap validation MUST consider all existing ownerships for the asset.
- Percentage values, when provided, MUST remain between 0 and 100.

## Edge Cases

- Adjacent periods are allowed.
- Closed periods do not block future non-overlapping periods.
- Patching an open period's end date does not need overlap revalidation unless it would overlap another existing period.

## Acceptance Criteria

- Overlapping ownership periods are rejected.
- Non-overlapping and adjacent periods are accepted.
- Batch creation validates all pairs.