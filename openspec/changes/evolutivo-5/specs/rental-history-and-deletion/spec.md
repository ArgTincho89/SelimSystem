# Rental History and Deletion Specification

> Traceability: request.md section 3 (Histórico de alquileres), section 14 (confirmations), section 17 criteria 16, 17, 24, 25. Confirmed user decision (2026-11-16): a historical rental with collections that were not reversed cannot be deleted.

## Purpose

List all rentals of an asset, view past rentals read-only, edit only when safe, and delete a historical rental with strong confirmation and safe constraints.

## Requirements

### Requirement: Histórico de alquileres list

The ficha MUST list all rentals of the asset (current and finished) in "Histórico de alquileres" with the columns Período (for example "01/07/2026 – 30/06/2029"), Inquilino, Modalidades (for example "Locación + Comodato"), Estado (Activo / Finalizado) and the action "Ver". The list MUST be served by a summary variant of the declarations endpoint (for example `?summary=1`) that does not return generated occurrences. When there are none, the section MUST show an empty message with a suggested action ("Declarar alquiler").

#### Scenario: Mixed list

- GIVEN one active and two finished rentals
- WHEN the section opens
- THEN three rows are shown with period, tenant, modalities, status and "Ver"

#### Scenario: Lightweight list

- WHEN the list is requested with the summary option
- THEN the response contains no occurrence arrays

#### Scenario: Empty

- GIVEN an asset that never had a rental
- WHEN the section opens
- THEN an empty message is shown

### Requirement: Read-only view

"Ver" on a historical rental MUST open a secondary read-only modal with all relevant data of the rental (tenants, modalities, dates, amounts, classification, IVA, adjustments, notes) with all controls disabled and a way to close it. "Ver" on the current rental MAY open the main rental modal.

#### Scenario: Read-only

- WHEN the user presses "Ver" on a finished rental
- THEN a modal shows its data with no editable inputs and a close action

### Requirement: Safe edit rule

A historical rental MUST be editable only when it has no collections, no documents and no linked obligations. Otherwise the edit action MUST NOT be offered and the reason SHOULD be shown.

#### Scenario: Editable

- GIVEN a historical rental without collections, documents or linked obligations
- WHEN its read-only modal opens
- THEN an edit action is offered

#### Scenario: Not editable

- GIVEN a historical rental with a collection
- WHEN its read-only modal opens
- THEN no edit action is offered

### Requirement: Delete endpoint

The server MUST expose `DELETE /rentals/declarations/:id`. The deletion MUST be rejected with a Spanish message when: the rental is active (finish it first); or the rental still has collections that were not reversed (the user MUST first use "Deshacer cobro" on those months). A foreign or unknown id MUST yield 404. When allowed, deletion MUST remove the declaration, its contracts, conditions and generated occurrences, detach or remove associated documents and notes consistently, and re-point obligations linked to the rental contracts so that no dangling reference remains. The operation MUST be atomic (all or nothing) and MUST be logged with a specific activity log entry. Existing endpoints MUST keep working.

#### Scenario: Active rental

- GIVEN an active rental
- WHEN deletion is requested
- THEN it is rejected with a message asking to finish the rental first and nothing changes

#### Scenario: Non-reversed collections block

- GIVEN a finished rental with a collection that was not reversed
- WHEN deletion is requested
- THEN it is rejected with a message asking to use "Deshacer cobro" first and nothing changes

#### Scenario: After reversing collections

- GIVEN the same rental after all collections were reversed with "Deshacer cobro"
- WHEN deletion is requested and confirmed
- THEN the rental, contracts, conditions and occurrences are removed and the response is successful

#### Scenario: Without collections

- GIVEN a finished rental that never had collections
- WHEN deletion is confirmed
- THEN it is removed and logged

#### Scenario: Atomicity

- GIVEN a failure while removing associated data
- WHEN deletion runs
- THEN no partial deletion remains

#### Scenario: Foreign id

- WHEN another user's declaration id is deleted
- THEN the response is 404

### Requirement: Strong confirmation

Deleting a historical rental MUST require explicit confirmation with this copy: "Estás por eliminar un alquiler y potencialmente sus datos asociados. Esta acción no se puede deshacer. ¿Querés continuar?". When the rental has periods, documents or notes associated, an additional warning MUST be shown before allowing the deletion. The confirmation MUST use the shared modal confirm (no `window.confirm`).

#### Scenario: Copy shown

- WHEN the user presses delete
- THEN the confirmation shows the copy above

#### Scenario: Extra warning

- GIVEN a rental with documents
- WHEN the user presses delete
- THEN an additional warning about the associated data is shown before confirming

#### Scenario: Cancelled

- WHEN the user dismisses the confirmation
- THEN nothing is deleted and no request is sent
