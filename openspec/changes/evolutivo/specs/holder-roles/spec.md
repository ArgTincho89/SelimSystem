# Holder Roles Specification

## Purpose

Extend legal-owner (holder) roles with `payment_responsible` and `other` so holders can be designated as payers or take free-form roles.

## Requirements

### Requirement: Extended role set

The system MUST accept the roles `owner`, `tenant`, `provider`, `payment_responsible`, and `other` (in addition to any existing roles) when creating or updating a holder. A holder MAY have multiple roles.

#### Scenario: Create payment responsible

- GIVEN a valid holder payload
- WHEN roles include `payment_responsible`
- THEN the holder is persisted with that role

#### Scenario: Create other role

- GIVEN a valid holder payload
- WHEN roles include `other`
- THEN the holder is persisted with that role

#### Scenario: Unknown role rejected

- GIVEN a role not in the allowed set
- WHEN the holder is saved
- THEN the request is rejected with 400

### Requirement: Role `other` is free

The role `other` MUST have no special behavior: it MUST NOT grant, restrict, or alter any workflow, eligibility, alert, or accounting rule. It MAY carry an optional free-text label.

#### Scenario: No special behavior

- GIVEN a holder with only role `other`
- WHEN used where a role is not required
- THEN it behaves as any holder without effects on alerts or totals

### Requirement: Payment responsible eligibility

A holder with role `payment_responsible` MUST be eligible as the responsible party of an obligation (see `obligation-responsibility`) and as a filter value in alerts.

#### Scenario: Assign as responsible

- GIVEN a holder with role `payment_responsible`
- WHEN assigned as `responsibleThirdEntityId` on an obligation
- THEN the link is accepted

### Requirement: Backward compatibility

Existing holders MUST remain valid and unchanged. Clients encountering unknown roles MUST fall back to read-only display.

#### Scenario: Legacy holder

- GIVEN a holder created before the change
- WHEN read
- THEN it is returned unchanged

## Data Contract

Holder additions:
- `roles`: array of `owner`|`tenant`|`provider`|`payment_responsible`|`other` (plus existing values)
- `roleLabel?`: string (max 80 chars), meaningful only with `other`

## Validation Rules

- Each role MUST belong to the allowed set.
- Duplicate roles MUST be deduplicated.
- `roleLabel`, when provided, MUST be a string of at most 80 characters.
- Existing role requirements elsewhere (for example tenant role for tenant links) MUST remain enforced.

## Edge Cases

- Removing a role MUST NOT be blocked by `other`.
- A role removal that breaks an existing required link (for example tenant on an active contract) follows existing rules.
- Holders keep working with no roles added.

## Acceptance Criteria

- Holders accept `payment_responsible` and `other`.
- `other` has no special behavior.
- Legacy holders and links keep working.
