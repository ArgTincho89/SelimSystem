# Asset Form Simplify Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs. Traceability: request.md "Bienes".

> **Drift resolved (design.md wins).** Read response adds `age: {years, source:'constructionDate'|'legacy'|null}` (not `ageYears`/`ageSource:'date'`). `asset.condition` is derived server-side (`afterContractWrite`, ending the last contract -> `not_rented`); the form never sends it. Start-date/amount/currency edits are governed by the declaration PUT rules (409 "Hay períodos cobrados fuera del nuevo rango; anulá esos cobros primero"), not by the asset PUT. `asset-form.planRental` runs only if `body.rental !== undefined` (legacy API); the UI never sends it. Edit save keeps `PUT /api/assets/:id/form`.

## Purpose

Simplify asset creation (cadastral text, construction date, no rental condition), add a read-only "Ver" view, remove holder blocks from the details modal, and make "Editar" able to change everything with a warning on save.

## Requirements

### Requirement: Cadastral identification text

The immovable creation/edit modal MUST contain an optional free-text field "Identificación catastral" (string, trimmed, max 100 chars DEFAULT). It MUST be stored in `cadastralId` and shown in the detail and asset file. The obligation list previously rendered under the heading "Identificación catastral" MUST move under "Obligaciones del bien" (DEFAULT Q1).

#### Scenario: Create with cadastral

- GIVEN the create immovable modal
- WHEN "Identificación catastral" is "Circ. II, Secc. B, Mz 12, Parc 4" and the asset is saved
- THEN `cadastralId` is stored and shown in the asset detail

#### Scenario: Empty cadastral

- GIVEN the field left empty
- WHEN saved
- THEN the asset is created without error and no value is shown

#### Scenario: Too long

- GIVEN 101 characters
- WHEN saved
- THEN the response is 400 with a Spanish message

### Requirement: Construction date and computed age

"Antigüedad" MUST be replaced by a date field "Fecha de construcción" (`constructionDate`, YYYY-MM-DD, optional, not in the future). The age MUST be computed automatically from it (completed years, and months when under one year) and shown as read-only text "Antigüedad: N años". The age MUST be derived on read, not stored as the source of truth. Legacy `ageYears` MUST be kept and shown as "Antigüedad (dato anterior): N años" only when no `constructionDate` exists (DEFAULT Q5).

#### Scenario: Compute age

- GIVEN today 2026-11-09 and constructionDate 2010-03-15
- WHEN the asset is rendered
- THEN it shows "Antigüedad: 16 años"

#### Scenario: Live preview

- GIVEN the modal open
- WHEN the user picks a date
- THEN the age text updates immediately

#### Scenario: Future date

- GIVEN a constructionDate after today
- WHEN saved
- THEN it is rejected with 400 "La fecha de construcción no puede ser futura"

#### Scenario: Legacy value

- GIVEN an asset with `ageYears: 20` and no constructionDate
- WHEN rendered
- THEN it shows "Antigüedad (dato anterior): 20 años" and editing allows setting a date

### Requirement: No rental condition on creation

The create modal MUST NOT ask for condition (alquilado / no alquilado) nor render the inline rental block. A new asset MUST be created without an active contract. The asset `condition`/`usageStatus` MUST be derived from the existence of an active rental declaration, and legacy values remain readable. Rent is declared afterwards via "Declarar alquiler" (see `rental-declaration-modal`).

#### Scenario: Create without condition

- GIVEN the create modal
- WHEN rendered
- THEN there is no condition select and no rental fields

#### Scenario: Derived condition

- GIVEN an asset without an active declaration
- WHEN rendered
- THEN it appears as not rented, and as rented once a declaration is active

#### Scenario: API default

- GIVEN a create payload without `condition`
- WHEN posted
- THEN it is accepted (condition defaults to derived value)

### Requirement: "Ver" read-only modal

The assets table MUST offer a "Ver" button per row (besides "Ver historial" and "Editar") that opens the same modal as "Editar" in read-only mode: all controls disabled, no "Guardar cambios", with a close action. It MUST show the same content including holders, obligations, notes and rental declaration summary.

#### Scenario: Open Ver

- GIVEN a rendered asset row
- WHEN "Ver" is pressed
- THEN the edit modal opens with all fields filled and disabled and no save button

#### Scenario: No changes possible

- GIVEN the read-only modal
- WHEN the user types or clicks controls
- THEN nothing is modified and no request is sent

### Requirement: Remove holder blocks from details

The asset details modal MUST NOT show "Añadir titularidad" nor "Finalizar titularidad hoy" (DEFAULT Q8). Holders MUST be managed from "Editar" (existing diff logic).

#### Scenario: Details modal

- GIVEN the details modal of an asset
- WHEN rendered
- THEN neither "Añadir titularidad" nor "Finalizar titularidad hoy" is present

#### Scenario: Holder change via Editar

- GIVEN the "Editar" modal
- WHEN holders are changed and saved
- THEN holders are updated as before

### Requirement: Full edit with warning

"Editar" MUST allow modifying every field, including "Contrato vigente desde" (no longer disabled for locked contracts). Pressing "Guardar cambios" MUST always show a warning confirmation (Spanish, e.g. "Estás por modificar datos del bien. Revisá los cambios antes de confirmar.") before sending. Cancelling MUST send nothing. The backend MUST reject a start-date change only when an already collected occurrence would fall outside the new range, with a clear message; unpaid occurrences MUST be regenerated (DEFAULT Q9). Generic 409 for tenant/amount/currency changes on contracts with occurrences MUST be replaced by the same collected-occurrence rule.

#### Scenario: Warning shown

- GIVEN any edit with changes
- WHEN "Guardar cambios" is pressed
- THEN a warning dialog appears and the save happens only after confirming

#### Scenario: Cancel warning

- GIVEN the warning dialog
- WHEN cancelled
- THEN no request is sent and the modal stays open

#### Scenario: Edit start date, nothing collected

- GIVEN a contract starting 2026-01-01 with no collected occurrences
- WHEN the start date is changed to 2026-03-01 and confirmed
- THEN the occurrences before 2026-03 are removed and the rest regenerated

#### Scenario: Edit start date with collected period outside

- GIVEN 2026-01 already collected
- WHEN the start date is moved to 2026-03-01
- THEN the response is 409 "No se puede mover la fecha: hay cobros registrados en períodos fuera del nuevo rango" and nothing changes

#### Scenario: Edit start date earlier

- GIVEN a contract starting 2026-03-01 with 2026-03 collected
- WHEN the start date moves to 2026-02-01
- THEN the collected occurrence is preserved and a new unpaid 2026-02 occurrence is generated

## Data Contract

- Asset (immovable): adds `cadastralId?: string`, `constructionDate?: 'YYYY-MM-DD'`; derived `ageYears` (read) and `ageSource: 'date'|'legacy'`.
- `condition` becomes optional on create.
- No new endpoints; the edit save keeps the existing asset PUT (design.md authoritative).

## Validation Rules

- `cadastralId` string <= 100.
- `constructionDate` valid date, not future.
- Start-date change validated against collected occurrences.

## Edge Cases

- Leap-day construction date computes age by calendar comparison.
- Assets of other types (non-immovable) do not show cadastral or construction fields unless they already did.
- Read-only mode MUST NOT open any sub-dialog that writes.

## Changes to baseline

- `asset-form-rewrite` (evolutivo-2): condition select, inline rental block and "Antigüedad" number removed from create; edit unlocked.
- `asset-rental-inline` (evolutivo-2): inline block replaced by "Declarar alquiler" (see `rental-declaration-modal`).

## Acceptance Criteria

- Create asset without condition, with optional cadastral text and a construction date.
- "Ver" opens a non-editable modal; details modal has no holder add/finalize.
- "Contrato vigente desde" is editable with a warning on every save.
