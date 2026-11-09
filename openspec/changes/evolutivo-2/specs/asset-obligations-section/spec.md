# Asset Obligations Section Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs.

## Purpose

Show, inside the immovable form and detail, the obligations linked to the asset as "Proveedor - Cuenta/Contrato Nº: value", let rented assets pick who is responsible for each, and keep persistent notes.

## Requirements

### Requirement: Obligations list

For every immovable the form MUST list all obligations linked to the asset under the "Identificación catastral" header. Each row MUST read `<Proveedor> - <Cuenta Nº | Contrato Nº>: <value>`, where the label depends on `externalIdentifierType` (`account` -> "Cuenta Nº", `contract` -> "Contrato Nº"; default "Cuenta Nº" when unset) and the value is the stored number (empty when none). Rows MUST be non-editable text apart from the responsible selector.

#### Scenario: Account label

- GIVEN an obligation with provider "DGR" and account number "123-45"
- WHEN the asset form opens
- THEN the row shows "DGR - Cuenta Nº: 123-45"

#### Scenario: Contract label

- GIVEN an obligation with provider "EPEC" and contract "998877"
- WHEN the asset form opens
- THEN the row shows "EPEC - Contrato Nº: 998877"

#### Scenario: No obligations

- GIVEN an asset with no linked obligations
- WHEN the form opens
- THEN an empty-state message and the "Nueva obligación" shortcut are shown

#### Scenario: Not for movables

- GIVEN a Mueble form
- WHEN it renders
- THEN no obligations section is shown

### Requirement: Assignment shortcut

Obligations are assigned in the Obligaciones section (Q5). The asset form MUST show a "Nueva obligación" action that opens the obligation form with the asset prefilled. On a new (unsaved) asset the shortcut MUST be available only after the asset is saved.

#### Scenario: Shortcut prefill

- GIVEN a saved asset
- WHEN "Nueva obligación" is pressed
- THEN the obligation form opens with that asset selected

#### Scenario: Unsaved asset

- GIVEN a new asset not yet saved
- WHEN the form renders
- THEN the shortcut is disabled with an explanation

### Requirement: Responsible selector (rented only)

When Condición is `Alquilado` or `Usufructo`, each listed obligation MUST show a selector with options "Titular" and "Inquilino" (stored as `responsibilityType` `owner` / `tenant`). For `No alquilado` assets the selector MUST NOT be rendered. Obligations with legacy `shared`, `third` or `none` MUST show a read-only badge with the legacy value and MUST NOT be changed by this UI unless the user picks Titular or Inquilino explicitly.

#### Scenario: Selector visible

- GIVEN a rented asset with an obligation
- WHEN the form opens
- THEN the row has a selector with Titular and Inquilino

#### Scenario: Selector hidden

- GIVEN a "No alquilado" asset
- WHEN the form opens
- THEN no selector is rendered

#### Scenario: Legacy shared

- GIVEN an obligation with `responsibilityType` `shared`
- WHEN listed
- THEN a read-only "Compartida" badge is shown and the stored split is untouched

### Requirement: Responsibility change scope

Changing the responsible MUST use a lightweight endpoint that updates only `responsibilityType` (and clears no other data). It MUST apply to future unpaid occurrences only: occurrences that are paid, or have a resolution, MUST keep their original responsibility, and previously generated alerts for settled occurrences MUST NOT change. The endpoint MUST NOT require `effectiveFromDate`.

#### Scenario: Switch to tenant

- GIVEN an owner-responsible obligation with a paid January occurrence and an open February occurrence
- WHEN the responsible is changed to Inquilino
- THEN February becomes tenant-responsible and January stays owner-paid

#### Scenario: No payment-history error

- GIVEN an obligation with payments
- WHEN the responsible is changed from the asset form
- THEN the change succeeds without asking for an effective date

#### Scenario: Invalid value

- GIVEN a request with `responsibilityType` "shared"
- WHEN sent to the lightweight endpoint
- THEN it is rejected with 400

### Requirement: Tenant responsibility needs a tenant

Choosing "Inquilino" for an obligation MUST be rejected with 409 and a message when the asset has no active rental contract with a tenant.

#### Scenario: No tenant

- GIVEN a "Alquilado" asset whose contract has expired
- WHEN "Inquilino" is selected
- THEN the change is rejected with 409

### Requirement: Default responsible

A newly linked obligation MUST default to Titular (`owner`) (see `obligation-form-simplification`) and MUST show Titular in the selector.

#### Scenario: New obligation default

- GIVEN a rented asset and a new obligation without explicit responsible
- WHEN listed in the asset form
- THEN the selector shows Titular

### Requirement: Notas

The immovable form MUST include "Notas", a textarea whose content persists on the asset and is returned in detail and file views.

#### Scenario: Notes editable

- GIVEN existing notes
- WHEN edited and saved
- THEN the new content replaces the old and is shown in the asset file

## Data Contract

- `GET /api/assets/:id` (or equivalent) exposes linked obligations with `providerName`, `externalIdentifierType`, `externalIdentifier`, `responsibilityType`.
- Lightweight update affects only `responsibilityType`.

## Validation Rules

- Allowed values via this UI: `owner`, `tenant`.
- Responsible change allowed only for obligations linked to an immovable.

## Edge Cases

- Obligations of other assets are never listed.
- Archived obligations are listed only when "Mostrar archivadas" is active, otherwise hidden.
- Provider deleted/renamed: the row uses the current provider name.

## Changes to baseline

- `obligation-responsibility` (evolutivo): UI exposes only `owner` and `tenant`; `shared`, `third` and `none` remain valid in storage/API for legacy records but are hidden for new input; change applies to future unpaid occurrences only (previously required `effectiveFromDate` when payments existed).
- `obligation-external-identifiers` (evolutivo): the identifier is rendered as "Cuenta Nº" or "Contrato Nº" from `externalIdentifierType`.
- `asset-file-overview` (evolutivo): the file lists the same obligation rows and notes.

## Acceptance Criteria

- Obligation rows render as "Proveedor - Cuenta/Contrato Nº: value".
- Selector appears only on rented/usufruct assets and affects future unpaid occurrences only.
- Notas persist.
