# Asset Deletion Specification

> Traceability: request.md 4 (Eliminación de bienes creados por error, Confirmación al editar un bien); proposal items 4.4, 4.5; Decisions 3 and 5.

## Purpose

Allow deleting an asset created by mistake, safely, and keep the edit confirmation as is.

## Requirements

### Requirement: Guarded delete endpoint

`DELETE /assets/:id` SHALL hard-delete the asset only when no transaction, obligation, rental, contract or document references it. Otherwise it SHALL answer 409 with a message naming the blocking references (transactions, obligations, rentals, documents) and change nothing. Unknown or foreign ids SHALL yield 404. The deletion SHALL be logged.

#### Scenario: Unreferenced asset
- WHEN an asset with no references is deleted
- THEN the response is success and the asset no longer exists

#### Scenario: Referenced asset
- GIVEN an asset with transactions
- WHEN delete is requested
- THEN the response is 409 with the reason and the asset remains

#### Scenario: Each reference type
- GIVEN an asset referenced only by obligations, rentals or documents
- THEN each case yields 409 naming that reference

#### Scenario: Not found
- WHEN the id does not exist
- THEN the response is 404

#### Scenario: Logged
- WHEN a deletion succeeds
- THEN a log entry with the asset name exists

### Requirement: Delete UI

The asset ficha and edit form SHALL offer "Eliminar", opening a danger-type `ConfirmDialog`. Nothing SHALL be sent before confirmation. On 409 the dialog SHALL show the server reason.

#### Scenario: Confirm
- WHEN the user confirms
- THEN the asset is deleted and the user returns to the assets list

#### Scenario: Cancel
- WHEN the user cancels
- THEN no request is sent

#### Scenario: Blocked
- WHEN the server answers 409
- THEN the reason is shown and the asset stays

### Requirement: Edit confirmation unchanged

The existing confirmation before saving an asset edit SHALL be kept and SHALL NOT be extended to other entities.

#### Scenario: Edit asset
- WHEN the user saves an asset edit
- THEN the existing confirmation appears as before

#### Scenario: Other entities
- WHEN another entity is edited
- THEN no new confirmation is introduced
