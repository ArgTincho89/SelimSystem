# UX Messages and Accessibility Specification

> Traceability: request.md sections 14, 15, 16 (rules not to break), principles ("Mantener los logs", "confirmación explícita"); section 17 criteria 9, 23, 24, 25; section 18 item 15.

## Purpose

Standardize confirmations, empty states, error copy, accessibility, responsiveness and audit logging across the redesigned screens.

## Requirements

### Requirement: Shared confirmation

All destructive or irreversible actions MUST use one shared modal-based confirmation component with danger styling, a clear message, and explicit confirm and cancel buttons. `window.confirm` MUST NOT be used. The actions that MUST require confirmation: delete document, delete note, delete historical rental, finish rental, finish contract, cancel period, undo collection ("Deshacer cobro"), revert payment, cancel resolution ("Anular resolución"), delete obligation, and edit an obligation that has payments.

#### Scenario: Each action confirms

- GIVEN any action in the list
- WHEN the user triggers it
- THEN a confirmation opens and no request is sent until the user confirms

#### Scenario: Cancel

- WHEN the user cancels a confirmation
- THEN the state does not change

#### Scenario: Cancel period

- WHEN the user presses "Cancelar período"
- THEN a confirmation is shown (it had none before)

#### Scenario: No native confirm

- WHEN the front-end source is inspected
- THEN `window.confirm` is not used

### Requirement: Empty states

Every empty state MUST show a clear message and a suggested action. Required messages: "Este inmueble no tiene un alquiler activo.", "No hay períodos pendientes de cobro.", "No hay obligaciones a cargo del inquilino.", "No hay documentos cargados.", "No hay notas en este rango de fechas.", "No hay movimientos en este período.".

#### Scenario: Messages

- GIVEN each empty condition
- WHEN the view renders
- THEN its message is shown with a suggested action

### Requirement: Error messages

User-facing errors MUST be clear and specific, in Spanish. The server MUST use these messages for the corresponding conditions: "No se puede declarar un nuevo alquiler porque ya existe uno activo.", "No se puede revertir este pago porque tiene movimientos dependientes.", "No se puede finalizar este contrato porque ya está finalizado.", "No se puede cancelar este período porque tiene cobros registrados.", "No se puede registrar un cobro porque el período ya está cobrado.". Status codes of existing endpoints MUST be kept.

#### Scenario: Cancel period message

- GIVEN a period with collections
- WHEN cancellation is requested
- THEN the 409 message is "No se puede cancelar este período porque tiene cobros registrados."

#### Scenario: Collect collected period

- WHEN a collection is requested for a collected period
- THEN the message is "No se puede registrar un cobro porque el período ya está cobrado."

### Requirement: Accessibility

Interactive controls MUST have accessible names (labels or `aria-label`). Keyboard navigation MUST work in modals, tabs and tables, with a focus trap in the top modal layer and focus restored on close. Status MUST be communicated with text and an icon in addition to color. Text contrast MUST be sufficient. Heading hierarchy MUST be clear.

#### Scenario: Unlabeled icon button

- GIVEN an icon-only button
- WHEN rendered
- THEN it has an accessible name

#### Scenario: Status not by color only

- WHEN a status badge renders
- THEN it contains text and an icon

#### Scenario: Focus on close

- GIVEN a confirmation opened from a button
- WHEN it closes
- THEN focus returns to that button

### Requirement: Responsive behavior

The redesigned screens MUST work on mobile, tablet and desktop. On mobile the rental modal is full screen, tabs scroll horizontally, tables become cards or collapsible lists, and the fixed header is compact. On desktop tables use the available width and actions are visible without reaching the end of the modal.

#### Scenario: Mobile and desktop

- GIVEN mobile and desktop viewports
- WHEN the rental modal opens
- THEN each follows the layout above

### Requirement: Write actions logged

Every new or changed write endpoint MUST have a specific activity log entry: payment revert, modality end, rental delete, document delete, note update, note delete, rent adjustment, rental end, collection, collection undo, payment, resolution. Read-only previews MUST NOT be logged as writes. No new write MUST fall back to the generic "Realizaste un cambio en ..." entry.

#### Scenario: Specific entries

- WHEN each new write endpoint succeeds
- THEN the logs screen shows a specific entry for it

#### Scenario: Preview not logged

- WHEN the rent update preview is requested
- THEN no write entry is added

### Requirement: Compatibility and delivery

The change MUST be additive: no existing endpoint removed or broken, no data model rewrite, new fields optional (note `title`, document uploader, alert `responsibility`, new `obligationPaymentReversals` collection). New front-end files MUST be registered in `index.html` and the service worker static asset list, and the service worker cache version MUST be bumped (v42; release v1.13.0) so users do not keep stale code. Existing business rules of request.md section 16 MUST remain intact.

#### Scenario: Old data

- GIVEN data created before this change
- WHEN the application starts
- THEN it loads and renders without migration errors

#### Scenario: Static assets

- WHEN the release is built
- THEN the new JS files are in `index.html` and the service worker list and the cache version is bumped

#### Scenario: Amounts per currency

- GIVEN data in several currencies
- WHEN any redesigned view renders amounts
- THEN they are shown per currency without conversion
