# Obligation External Identifiers Specification

## Purpose

Allow each obligation to store an external identifier such as account, contract, meter, policy, or client number, distinguishing obligations sharing a provider.

## Requirements

### Requirement: External identifier field

The system MUST store an optional `externalIdentifier` on every obligation.

#### Scenario: Persist external identifier

- GIVEN an obligation created with an external identifier
- WHEN it is read
- THEN the value is returned

#### Scenario: Omit external identifier

- GIVEN an obligation created without the field
- WHEN it is read
- THEN the value is null or empty

### Requirement: External identifier type

The system SHOULD store an optional `externalIdentifierType` classifying the identifier.

#### Scenario: Typed identifier

- GIVEN `externalIdentifierType` is provided
- WHEN persisted
- THEN the type is stored and returned

### Requirement: Filter by external identifier

The system SHOULD allow filtering obligations by `externalIdentifier`.

#### Scenario: Filter

- GIVEN obligations with different identifiers
- WHEN filtering by an identifier
- THEN only matching obligations are returned

## Data Contract

Obligation additions:
- `externalIdentifier`: string | null (max 120)
- `externalIdentifierType`: `account`|`contract`|`meter`|`policy`|`client`|`other` | null

## Validation Rules

- `externalIdentifier`, when provided, MUST be a trimmed string of 1 to 120 characters.
- `externalIdentifierType`, when provided, MUST be one of the allowed values.
- The field is optional and defaults to null.

## Edge Cases

- Whitespace-only values are treated as null.
- Updating the identifier does not affect occurrences or totals.
- Identifiers are not required to be globally unique.

## Acceptance Criteria

- External identifier and type are persisted and returned.
- Invalid values are rejected.