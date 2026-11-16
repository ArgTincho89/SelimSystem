# Principal Account Management Specification

> Traceability: request.md 5 (Cuenta Principal en creación, Restricción al desmarcar, Mejora de interfaz); proposal items 5.3 to 5.5; Decisions 2 and 10.

## Purpose

Keep exactly one principal account and make its management consistent.

## Requirements

### Requirement: Create as principal

The "Cuenta principal" checkbox SHALL be enabled when creating an account. Creating with `primary: true` SHALL make the new account the principal and demote the previous one in a single write.

#### Scenario: Create principal
- GIVEN account A is principal
- WHEN B is created as principal
- THEN B is principal, A is not, and exactly one principal exists

#### Scenario: Create normal
- WHEN an account is created without the checkbox
- THEN the principal does not change

### Requirement: Uncheck with replacement

Editing a principal account SHALL allow unchecking "Cuenta principal" only when the user picks a replacement account in the same dialog; the request SHALL carry `newPrimaryId`. The server SHALL promote the replacement and demote the account in one write, and SHALL reject an invalid replacement (missing, itself, archived, other user's, other currency rules as per existing principal rules) with 400. If no account is eligible, the checkbox SHALL stay checked and a message SHALL explain why.

#### Scenario: Valid replacement
- WHEN the user unchecks and picks account B
- THEN B becomes principal, the account is not, and exactly one principal exists

#### Scenario: No eligible account
- GIVEN no other eligible account
- THEN unchecking is not possible and a message explains it

#### Scenario: Invalid replacement
- WHEN `newPrimaryId` is missing or invalid
- THEN the server answers 400 and nothing changes

### Requirement: Action visibility

"Hacer principal" SHALL NOT be shown on an account that is already principal, on any account action surface. Archive and delete actions SHALL be reviewed on every surface: they SHALL NOT be offered for the principal account, which must be replaced first, and the server SHALL reject them with a clear message. A regression test SHALL cover this.

#### Scenario: Principal row
- THEN no "Hacer principal" button appears for it

#### Scenario: Non-principal row
- THEN "Hacer principal" is available

#### Scenario: Archive principal
- WHEN archive or delete is requested for the principal
- THEN it is not offered in the UI and is rejected by the server
