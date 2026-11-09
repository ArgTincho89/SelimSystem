# Rental Declaration Modal Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs. Traceability: request.md "Bienes" (Declaración de alquiler).

> **Drift resolved (design.md wins).** (1) There is NO `rentalContracts[].modalities[]` and NO `modality` in the occurrence `generationKey`: each modality is its own `rentalContracts` row (`declarationId`, `modality`, `ivaPercent`), grouped by a `rentalDeclarations` record; `generationKey` stays `${contractId}:${date}` and legacy keys are untouched. (2) Endpoints are `POST/PUT /api/rentals/declarations[/:id]`, `POST /api/rentals/declarations/:id/end`, `GET /api/rentals/declarations?assetId=` (not `/api/assets/:id/rental-declaration`). (3) Modality payload field is `kind` + `amount` (stored as the contract `initialRent`, NET); `ivaPercent` is null (not 0) for legacy/migrated and non-locación. (4) `contractKind` is derived: locación -> `rental`, comodato/mutuo -> `usufruct`. (5) Removing a modality ENDS its contract (unpaid future occurrences cancelled); it is not blocked with 409. The 409 applies to edits that would orphan a collected occurrence ("Hay períodos cobrados fuera del nuevo rango; anulá esos cobros primero"). (6) Migration creates one `rentalDeclarations` record per legacy contract; it does not add a `modalities` array.

## Purpose

After an asset exists, let the user declare its rental through a modal where one, two or three modalities (Contrato de locación, Comodato, Mutuo) can be selected at once, each with its own data, plus shared obligations and notes.

## Requirements

### Requirement: Declare rental on existing asset

An existing asset MUST offer a "Declarar alquiler" action (and "Editar alquiler" when a declaration exists) that opens the "Declaración de alquiler" modal. Declaring MUST be possible only for an asset without an active declaration; otherwise the action edits the existing one.

#### Scenario: Open modal

- GIVEN an asset without rental
- WHEN "Declarar alquiler" is pressed
- THEN the "Declaración de alquiler" modal opens with three unchecked checkboxes: "Contrato de locación", "Comodato", "Mutuo"

#### Scenario: Nothing selected

- GIVEN no checkbox selected
- WHEN "Guardar" is pressed
- THEN it is rejected with "Seleccioná al menos una modalidad" and nothing is saved

### Requirement: Multiple modalities via checkboxes

The user MUST be able to select any combination of 1 to 3 modalities. For every selected modality the modal MUST show its own fieldset; unselecting hides it and discards its data after confirmation if it has values.

#### Scenario: Locación only

- GIVEN only "Contrato de locación" is checked
- WHEN rendered
- THEN one fieldset is shown with Fecha de inicio, Fecha de finalización, Monto original, IVA (%), Moneda, Frecuencia de ajuste (meses), Criterio de ajuste

#### Scenario: Comodato only

- GIVEN only "Comodato" is checked
- WHEN rendered
- THEN the fieldset has the same fields without IVA

#### Scenario: Mutuo only

- GIVEN only "Mutuo" is checked
- WHEN rendered
- THEN the fieldset has the same fields without IVA

#### Scenario: All three

- GIVEN the three checkboxes are checked
- WHEN rendered
- THEN three fieldsets appear (IVA only in locación) and each is saved as its own modality in the same declaration

#### Scenario: Two combined

- GIVEN "Contrato de locación" and "Mutuo" are checked
- WHEN saved with valid data
- THEN the declaration contains two modalities

### Requirement: Modality fields and IVA

Each modality MUST capture: `startDate`, `endDate`, `initialRent` (original amount, > 0), `currencyCode`, `adjustmentFrequencyMonths` (integer > 0, months), `adjustmentCriterion`. Locación MUST additionally capture `ivaPercent` (0-100, the percentage), which is added to the original amount: expected amount = original x (1 + IVA/100). The modal MUST show the computed total for locación. `endDate` MUST be after `startDate`. Comodato and Mutuo MUST NOT store IVA.

#### Scenario: IVA sum

- GIVEN a locación with Monto original 100.000,00 and IVA 21
- WHEN the amounts are shown
- THEN the modal displays "Total con IVA: 121.000,00" and the expected occurrence amount is 121.000,00

#### Scenario: IVA empty

- GIVEN a locación with IVA empty or 0
- WHEN saved
- THEN the expected amount equals the original amount

#### Scenario: Invalid dates

- GIVEN endDate earlier than startDate
- WHEN saved
- THEN it is rejected with 400 "La fecha de finalización debe ser posterior a la de inicio"

#### Scenario: Invalid IVA

- GIVEN IVA 150
- WHEN saved
- THEN it is rejected with 400

#### Scenario: Money format

- GIVEN the Monto original field
- WHEN `100000` is typed and blurred
- THEN it shows "100.000,00"

### Requirement: Shared obligations and notes

Obligations del bien and Notas MUST be generic and shared by the whole declaration, shown once regardless of how many modalities are selected. They MUST NOT be duplicated per modality.

#### Scenario: Single block

- GIVEN three modalities selected
- WHEN rendered
- THEN there is one "Obligaciones del bien" section and one "Notas" section

### Requirement: Occurrences per modality

Expected rent occurrences MUST be generated one per modality per period (DEFAULT Q4), labelled "Locación", "Comodato" or "Mutuo". Each uses its own amount, currency, dates and adjustment rules. Locación occurrence amount includes IVA. Avisos, monthly view and asset history MUST show the modality label.

#### Scenario: Two occurrences in one month

- GIVEN a locación (121.000,00 ARS) and a mutuo (50.000,00 ARS) both active in 2026-06
- WHEN occurrences are generated
- THEN 2026-06 has two expected occurrences: "Locación" 121.000,00 and "Mutuo" 50.000,00

#### Scenario: Different currencies

- GIVEN a locación in ARS and a comodato in USD
- WHEN occurrences are generated
- THEN each occurrence keeps its own currency and no cross-currency sum is shown

#### Scenario: Adjustment

- GIVEN a modality with adjustment every 6 months by criterion "IPC"
- WHEN the 7th period occurrence is generated
- THEN the existing adjustment mechanism applies per modality

### Requirement: Legacy migration

An idempotent startup migration `migrateEvolutivo3` MUST convert each legacy rental contract into a declaration with one modality: `contractKind: 'rental'` -> locación, `usufruct` -> comodato (DEFAULT Q5), copying dates, amount, currency, adjustment settings. It MUST NOT delete or overwrite existing fields, occurrences, allocations or collections; existing occurrences MUST keep their ids and generationKey. Running it twice MUST yield the same data.

#### Scenario: Legacy rental

- GIVEN a legacy contract kind `rental` with initialRent 100.000 ARS
- WHEN the migration runs
- THEN the contract has one modality `locacion` with the same values and ivaPercent 0

#### Scenario: Legacy usufruct

- GIVEN a legacy contract kind `usufruct`
- WHEN migrated
- THEN it has one modality `comodato`

#### Scenario: Idempotent

- GIVEN a migrated database
- WHEN the migration runs again
- THEN nothing changes

#### Scenario: Collections preserved

- GIVEN a legacy contract with collected occurrences
- WHEN migrated
- THEN collections, allocations and balances are unchanged

### Requirement: Edit and remove modalities

Editing a declaration MUST allow adding or removing modalities and changing their fields, with the warning on save described in `asset-form-simplify`. A modality with collected occurrences MUST NOT be removable (409 "La modalidad tiene cobros registrados"); unpaid occurrences of a removed modality MUST be deleted.

#### Scenario: Remove unused modality

- GIVEN a mutuo modality without collections
- WHEN unchecked and saved
- THEN its unpaid occurrences are removed

#### Scenario: Remove collected modality

- GIVEN a comodato with a collected period
- WHEN removal is attempted
- THEN it is rejected with 409

## Data Contract

- `rentalContracts[].modalities[]`: `{ kind: 'locacion'|'comodato'|'mutuo', startDate, endDate, initialRent, currencyCode, ivaPercent?, adjustmentFrequencyMonths, adjustmentCriterion }`.
- Occurrence adds `modality` and `generationKey` includes modality (e.g. `${contractId}:${kind}:${date}`); legacy keys preserved by migration.
- Endpoint(s) for declare/edit: design.md decides (e.g. `POST /api/assets/:id/rental-declaration`).
- Legacy fields (`contractKind`, `initialRent`, etc.) are kept for compatibility.

## Validation Rules

- 1 to 3 distinct modalities, no duplicate kind.
- `initialRent` > 0; `ivaPercent` only in locación, 0-100.
- Dates valid; end > start; `adjustmentFrequencyMonths` integer > 0.
- Currency supported by the app.

## Edge Cases

- Overlapping periods between modalities are allowed (separate occurrences).
- Asset `condition` is derived as rented while at least one modality is active.
- Read-only "Ver" shows the declaration disabled.

## Changes to baseline

- `asset-rental-inline` (evolutivo-2): replaced by this modal; single-kind contract becomes a multi-modality declaration.
- `alerts-center` (evolutivo-2): rent alerts carry modality label.

## Acceptance Criteria

- A rented asset can combine locación, comodato and mutuo via checkboxes.
- Locación 100.000 + IVA 21% yields an expected 121.000,00; comodato/mutuo have no IVA.
- Legacy contracts keep working after the idempotent migration.
