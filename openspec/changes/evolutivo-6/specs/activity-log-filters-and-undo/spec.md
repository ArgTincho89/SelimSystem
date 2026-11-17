# Activity Log Filters and Undo Specification

> Traceability: request.md 2 (Acción rápida "Deshacer", Nuevos filtros avanzados); proposal items 2.2, 2.3; Decision 7.

## Purpose

Let the user segment the audit log and undo supported actions directly from each row.

## Requirements

### Requirement: Query filters

`GET /activity-logs` and `activityLog.list` SHALL accept optional filters `assetId`, `ownerId`, `tenantId` and `categoryId`, combinable with AND. Without filters the result SHALL be unchanged. Entries lacking the filtered metadata SHALL be excluded from filtered results.

#### Scenario: Filter by asset
- GIVEN entries for assets A and B
- WHEN filtering by asset A
- THEN only entries of A are returned

#### Scenario: Combined filters
- WHEN filtering by asset A and tenant T
- THEN only entries matching both are returned

#### Scenario: Legacy entries
- GIVEN an old entry with no metadata
- WHEN any filter is applied
- THEN that entry is not returned

#### Scenario: No filters
- WHEN no filter is sent
- THEN all entries are returned including legacy ones

### Requirement: Filter panel

The logs page SHALL provide a filter panel with selectors for bien, titular, inquilino and categoría, populated from assets, owners, tenants and categories, and a way to clear all filters. Changing a filter SHALL reload the list.

#### Scenario: Apply and clear
- WHEN the user picks a bien and then clears filters
- THEN the list is filtered and then fully restored

#### Scenario: Empty result
- WHEN no entry matches
- THEN an empty-state message is shown

### Requirement: Undo button on rows

Each log row SHALL show a "Deshacer" button only when the entry succeeded, has an `undo` descriptor of a supported type (obligation payment, obligation resolution, rent collection) and its target is not already reverted. The button SHALL open the reversal note dialog of `history-reversal-with-note`. After success the list SHALL refresh and the button SHALL disappear.

#### Scenario: Undoable entry
- GIVEN a successful payment entry whose payment is active
- THEN its row shows "Deshacer"

#### Scenario: Already reverted
- GIVEN an entry whose target was already reverted
- THEN its row shows no "Deshacer" button

#### Scenario: Unsupported or failed entry
- GIVEN a failed entry or one of an unsupported action
- THEN no "Deshacer" button is shown

#### Scenario: Undo from log
- WHEN the user presses "Deshacer", writes a note and confirms
- THEN the target is reverted and the row loses its button
