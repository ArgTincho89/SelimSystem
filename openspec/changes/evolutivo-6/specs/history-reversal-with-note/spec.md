# History Reversal With Note Specification

> Traceability: request.md 3 (Gestión de reversiones, Requisitos de seguridad); proposal items 3.1, 3.2. Extends evolutivo-5 obligation-payment-reversal.

## Purpose

Offer one uniform "Deshacer" flow with a mandatory note for resolved obligations, paid obligations and collected rents.

## Requirements

### Requirement: Deshacer entry point

The asset history detail modal SHALL show a "Deshacer" button for a resolved obligation, a paid obligation and a collected rent, and SHALL NOT show it for pending or already reverted items.

#### Scenario: Three kinds
- WHEN the detail of a resolved obligation, a paid obligation or a collected rent opens
- THEN "Deshacer" is offered

#### Scenario: Pending or reverted
- WHEN the detail of a pending or reverted item opens
- THEN no "Deshacer" is offered

### Requirement: Mandatory justification note

Pressing "Deshacer" SHALL open a dialog with a textarea "Motivo". Confirm SHALL be blocked until the trimmed note has 1 to 500 characters. The server SHALL enforce the same bounds with 400. Nothing SHALL be sent before confirmation.

#### Scenario: Empty note
- WHEN the user confirms with an empty or whitespace note
- THEN the dialog stays open with an error and no request is sent

#### Scenario: Too long
- WHEN the note exceeds 500 characters
- THEN it is rejected in UI and by the server with 400

#### Scenario: Cancel
- WHEN the user dismisses the dialog
- THEN nothing is sent

### Requirement: Reversal effect

On confirmation the system SHALL remove the financial and operational effect of the movement (transaction, balance, month totals, collection) and return the obligation or rent to pending (or overdue by due date). The void-resolution and rent-reverse endpoints SHALL accept and store the note, and the existing payment revert SHALL require it. The note SHALL appear as "Motivo" in the history and in the log entry. Reconciliation reset behavior of evolutivo-5 SHALL be preserved.

#### Scenario: Paid obligation undone
- GIVEN an account balance of 900 after paying 100
- WHEN the payment is undone with a note
- THEN the balance is 1000 and the obligation is pending or overdue

#### Scenario: Resolution undone
- GIVEN a resolved tenant obligation
- WHEN undone with a note
- THEN it returns to pending and its effects are removed

#### Scenario: Rent undone
- GIVEN a collected rent
- WHEN undone with a note
- THEN the collection is removed and the rent is pending

#### Scenario: Note recorded
- WHEN any undo succeeds
- THEN the note is stored and shown as "Motivo" in the history and the log

#### Scenario: Already reverted
- WHEN undo is requested again for the same item
- THEN it is rejected with a clear message and nothing changes

#### Scenario: Delete with body
- WHEN the client calls a DELETE reversal endpoint
- THEN `API.delete` sends the note in the request body
