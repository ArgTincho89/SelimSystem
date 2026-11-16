# Asset Ficha Redesign Specification

> Traceability: request.md section 2 (Ficha del inmueble), section 3 (Acceso al alquiler, rename), section 17 criteria 4, 15, section 9 (re-homing: "Si una funcionalidad se mueve, debe seguir siendo accesible"), section 18 items 2, 9.

## Purpose

Turn the asset ficha into a clear summary of the asset (data, holders, obligations, rental card, documents, notes, economics) instead of one long mixed scroll, and rename the rental access.

## Requirements

### Requirement: Ficha header

The ficha MUST show a header with: asset name, type, location, status (available, rented, etc.), current holder or holders with percentages, and the buttons "Editar", "Ver historial", and either "Declarar alquiler" (no current rental) or "Ver alquiler" (a current rental exists).

#### Scenario: Asset without rental

- GIVEN an asset with no current rental
- WHEN the ficha opens
- THEN the header shows "Editar", "Ver historial" and "Declarar alquiler", and does not show "Ver alquiler"

#### Scenario: Asset with rental

- GIVEN an asset with a current rental
- WHEN the ficha opens
- THEN the header shows "Ver alquiler" and does not show "Declarar alquiler"

### Requirement: Rename of "Alquileres"

The asset list and the ficha MUST NOT show a button labelled "Alquileres". "Ver alquiler" MUST open the rental modal of the current rental directly on the "Resumen" tab, without showing the ficha first. The decision between "Ver alquiler" and "Declarar alquiler" MUST be based on the existence of a current rental (a declaration with at least one active modality), not on the asset `condition` alone. The asset list response MUST expose a `hasActiveRental` flag (or equivalent) for this.

#### Scenario: Open rental from list

- GIVEN an asset with a current rental in the asset list
- WHEN the user presses "Ver alquiler"
- THEN the rental modal opens on "Resumen"

#### Scenario: Usufruct condition without rental

- GIVEN an asset whose condition is `usufruct` and that has no rental declaration
- WHEN the list renders
- THEN the button is "Declarar alquiler"

### Requirement: Asset data block

The ficha MUST keep: classification, type, characteristics, location, covered area, free area, cadastral identification, construction date, age, holders with percentages and validity periods, and general asset notes. The ownership (holders) history MUST be shown in the ficha and MUST NOT be shown in the rental modal.

#### Scenario: Data present

- GIVEN an asset with the data above
- WHEN the ficha opens
- THEN each datum is shown in the data block

### Requirement: Compact obligations list

The ficha MUST list obligations compactly, each with: name, type, provider, responsible (Titular or Inquilino), account or contract number, estimated amount, currency, frequency, next due date, and next due status. Actions per row: "Ver obligación", "Registrar pago" (only if owner-responsible), "Resolver" (only if tenant-responsible), "Editar obligación". The list MUST offer "Agregar obligación". The existing payment dialog and resolution flow MUST be reused.

#### Scenario: Owner obligation actions

- GIVEN an owner-responsible obligation
- WHEN the row renders
- THEN "Registrar pago" is offered and "Resolver" is not

#### Scenario: Tenant obligation actions

- GIVEN a tenant-responsible obligation
- WHEN the row renders
- THEN "Resolver" is offered and "Registrar pago" is not

#### Scenario: Add obligation

- WHEN the user presses "Agregar obligación"
- THEN the existing obligation creation flow opens for this asset

### Requirement: Rental section in the ficha

Without a current rental, the ficha MUST show "Este inmueble no tiene un alquiler activo" and the primary button "Declarar alquiler". With a current rental, the ficha MUST show a summary card with tenant or tenants, validity, rental status, total current monthly amount, composition by modality, next collection, total pending collection, next relevant due date, and the primary button "Ver alquiler".

#### Scenario: Summary card

- GIVEN a rental with Locación ARS 11.797.500 and Comodato ARS 3.000.000
- WHEN the ficha opens
- THEN the card shows both modalities, each total per currency, next collection and pending total, and "Ver alquiler"

#### Scenario: No rental

- GIVEN no current rental
- WHEN the ficha opens
- THEN the empty state text "Este inmueble no tiene un alquiler activo" and "Declarar alquiler" are shown

### Requirement: Declare gating

"Declarar alquiler" MUST exist only in the asset list and the ficha. When a current rental exists, the declare action MUST be disabled and show "Finalizá el alquiler vigente antes de declarar uno nuevo". The backend rules MUST NOT change: an overlapping rental MUST still be rejected with "No se puede declarar un nuevo alquiler porque ya existe uno activo." when the dates overlap.

#### Scenario: Declare blocked in UI

- GIVEN a current rental
- WHEN the ficha renders the declare action
- THEN it is disabled with the text "Finalizá el alquiler vigente antes de declarar uno nuevo"

#### Scenario: Overlap rejected

- GIVEN a current rental until 30/06/2029
- WHEN a declaration overlapping those dates is submitted
- THEN the server rejects it and the user sees "No se puede declarar un nuevo alquiler porque ya existe uno activo."

### Requirement: Rental history access

The ficha MUST contain a section or access named "Histórico de alquileres" (see rental-history-and-deletion).

#### Scenario: Access present

- WHEN the ficha opens
- THEN "Histórico de alquileres" is reachable

### Requirement: Documents and notes block

The ficha MUST keep documents and notes of the asset in a block visually separated from the rental. Documents MUST support upload, view, download and delete with confirmation. Notes MUST support create, edit, delete and filtering by date range (see rental-documents-and-notes).

#### Scenario: Separation

- WHEN the ficha opens
- THEN documents and notes are in their own block, not inside the rental card

### Requirement: Economics block separate from rental

The ficha MAY keep the economic information, and if kept it MUST show: attributed real income, attributed real expenses, refunds, net result, pending amounts shown separately from real movements, all per currency without conversion. It MUST NOT be shown in the rental modal. The following MUST remain reachable from the ficha because they are removed from the rental modal: recoverable expenses and pending amounts, attributed movements, reimbursement claims, "Registrar gasto recuperable", economic analysis, monthly and cumulative evolution, ownership history, status history, "Otros movimientos atribuidos", and unapplied collections.

#### Scenario: Re-homed features

- GIVEN a feature removed from the rental modal (for example "Registrar gasto recuperable")
- WHEN the user opens the ficha
- THEN the feature is still accessible there

#### Scenario: Currency separation

- GIVEN income in ARS and USD
- WHEN the economics block renders
- THEN amounts are shown per currency and no conversion is applied
