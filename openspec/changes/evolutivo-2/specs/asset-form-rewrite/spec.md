# Asset Form Rewrite Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs.

## Purpose

Rewrite the "Nuevo bien" form so that, per asset type, it shows exactly the fields requested in `request.md`, with strict validation, holder percentages, legacy data preserved and filters kept working.

## Requirements

### Requirement: Fields per asset type

The form MUST show only the fields listed for the selected type (Mueble / Inmueble), with the Spanish labels below. Fields not listed MUST NOT appear in the create/edit form.

Mueble:

| Label | Key | Type | Rule |
|---|---|---|---|
| Titular | holders | list of titular + % | at least one required |
| Título | title | string | required; shown as the asset name |
| Tipo | movableType | enum | default `Automóvil`; only that option for now |
| Marca | brand | string | optional |
| Dominio | plate | string | optional |
| KMs | kms | string | optional |
| Color | color | string | optional |

Inmueble:

| Label | Key | Type | Rule |
|---|---|---|---|
| Titular | holders | list of titular + % | at least one required |
| Título | title | string | required; shown as the asset name |
| Tipo | propertyKind | enum | `Departamento`, `Casa`, `Galpón`, `Lote`; required |
| Características | characteristics | string | optional |
| Ubicación | location | string | optional |
| Superficie cubierta | coveredArea | integer m2 | optional, >= 0 |
| Superficie libre | freeArea | integer m2 | optional, >= 0 |
| Antigüedad | age | integer | optional, >= 0 |
| Condición | condition | enum | `Alquilado`, `No alquilado`, `Usufructo`; required |
| Obligaciones | obligations | section | see `asset-obligations-section` |
| Notas | notes | textarea | optional, persistent |

For Inmueble, when Condición is `Alquilado` or `Usufructo` the form MUST additionally show the block defined in `asset-rental-inline`.

#### Scenario: Movable form

- GIVEN the user chooses "Mueble" in "Nuevo bien"
- WHEN the form renders
- THEN it shows Titular, Título, Tipo (preselected "Automóvil"), Marca, Dominio, KMs and Color
- AND it does not show description, acquisition, status, subtype, address or area fields

#### Scenario: Immovable form

- GIVEN the user chooses "Inmueble"
- WHEN the form renders
- THEN it shows Titular, Título, Tipo, Características, Ubicación, Superficie cubierta (M2), Superficie libre (M2), Antigüedad, Condición, Obligaciones and Notas

#### Scenario: Notas persist

- GIVEN an immovable saved with Notas "Llaves en portería"
- WHEN the asset is reopened
- THEN Notas contains "Llaves en portería"

### Requirement: Title is the asset name

The system MUST store `title` and expose it as the asset's display name everywhere `name` is shown. Blank titles MUST be rejected with 400.

#### Scenario: Title shown in lists

- GIVEN an asset saved with Título "Casa Alta Gracia"
- WHEN the assets list renders
- THEN the row shows "Casa Alta Gracia"

#### Scenario: Blank title

- GIVEN a payload with a blank `title`
- WHEN submitted
- THEN the response is 400

### Requirement: Integer m2 and age validation

Superficie cubierta, Superficie libre and Antigüedad MUST be integers greater than or equal to 0. Decimals, negatives and non-numeric values MUST be rejected with 400 and the form MUST show a field-level error. Empty values MUST be accepted and stored as null.

#### Scenario: Decimal rejected

- GIVEN Superficie cubierta "45.5"
- WHEN the form is submitted
- THEN it is rejected with 400

#### Scenario: Negative rejected

- GIVEN Antigüedad "-1"
- WHEN submitted
- THEN it is rejected with 400

#### Scenario: Zero accepted

- GIVEN Superficie libre "0"
- WHEN submitted
- THEN the value 0 is stored

### Requirement: Type enums

`movableType` MUST be `Automóvil` by default when omitted. `propertyKind` MUST be one of `Departamento`, `Casa`, `Galpón`, `Lote`. `condition` MUST be one of `Alquilado`, `No alquilado`, `Usufructo`. Other values MUST be rejected with 400.

#### Scenario: Default movable type

- GIVEN a Mueble payload without Tipo
- WHEN saved
- THEN Tipo is `Automóvil`

#### Scenario: Invalid property kind

- GIVEN `propertyKind` "Castillo"
- WHEN submitted
- THEN the response is 400

### Requirement: Holders (Titular) with percentage

The Titular control MUST select from parties with role `titular` and MUST offer an "Agregar titular" action that adds another selector row. With exactly one titular the percentage MUST be implicit 100 and not requested. With more than one titular each row MUST require a percentage greater than 0, and the percentages MUST sum exactly 100. The same titular MUST NOT appear twice.

#### Scenario: Single titular

- GIVEN one titular selected
- WHEN saving
- THEN the ownership is stored with 100%

#### Scenario: Add second titular

- GIVEN one titular selected
- WHEN "Agregar titular" is pressed
- THEN a second row appears and percentage inputs are shown and required for both rows

#### Scenario: Sum not 100

- GIVEN two titulars with 60% and 30%
- WHEN saving
- THEN the request is rejected with 400 and the UI shows that the total must be 100

#### Scenario: Sum 100

- GIVEN two titulars with 60% and 40%
- WHEN saving
- THEN both ownerships are stored

#### Scenario: Duplicate titular

- GIVEN the same titular chosen in two rows
- WHEN saving
- THEN the request is rejected with 400

#### Scenario: No titular

- GIVEN no titular selected
- WHEN saving
- THEN the request is rejected with 400

### Requirement: Editing holders keeps history

The edit form MUST show the current holders and percentages. When the holder set or percentages change, the system MUST close the current ownership periods at the edit date and open new periods from that date (the existing ownership-overlap rules continue to apply). Unchanged holders MUST NOT be altered.

#### Scenario: Change split

- GIVEN holders A 100%
- WHEN the asset is edited to A 50% and B 50%
- THEN the old period for A is closed today and new periods for A and B open today

#### Scenario: No change

- GIVEN a saved asset
- WHEN it is edited changing only the title
- THEN ownership records are untouched

### Requirement: Legacy data preserved

Legacy fields (acquisition data, status, address parts, `area`, free-text property type/subtype, `usageStatus`, description) MUST remain stored and MUST NOT be deleted or overwritten. They MUST be hidden in the form and, when present, MUST be shown read-only in the asset detail under the heading "Datos anteriores".

#### Scenario: Legacy shown read-only

- GIVEN a legacy asset with `area` 80 and a free-text address
- WHEN the asset detail opens
- THEN a "Datos anteriores" section shows those values read-only
- AND the edit form has no inputs for them

#### Scenario: No legacy data

- GIVEN an asset without legacy values
- WHEN the asset detail opens
- THEN no "Datos anteriores" section is rendered

### Requirement: Idempotent startup backfill

At startup an idempotent backfill MUST fill only blank new fields on legacy assets: `title` from `name`; `condition` from `usageStatus` (`rented` -> `Alquilado`, `usufruct` -> `Usufructo`, any other non-blank value -> `No alquilado`); `location` from the joined address parts; `coveredArea` from `area` when it is a non-negative integer; `movableType` `Automóvil` for movables. Existing non-blank new fields MUST NOT be overwritten and running it twice MUST produce no change.

#### Scenario: Backfill blanks

- GIVEN a legacy immovable with `usageStatus` "rented" and blank `condition`
- WHEN the backfill runs
- THEN `condition` becomes `Alquilado` and `usageStatus` is unchanged

#### Scenario: Idempotent

- GIVEN a backfilled database
- WHEN the backfill runs again
- THEN no record is modified

#### Scenario: No overwrite

- GIVEN an asset with `condition` already `Usufructo`
- WHEN the backfill runs
- THEN `condition` stays `Usufructo`

### Requirement: Filters and listings

Asset list filters (type, status/condition, search) MUST keep working with both legacy and new records: search MUST match `title`, `brand`, `plate` and `location`; the status filter MUST use `condition` for immovables, falling back to `usageStatus` when `condition` is blank.

#### Scenario: Search by plate

- GIVEN a movable with Dominio "AB123CD"
- WHEN searching "AB123"
- THEN it is returned

#### Scenario: Filter by condition

- GIVEN immovables with conditions `Alquilado` and `No alquilado`
- WHEN filtering by "Alquilado"
- THEN only the rented one is returned

### Requirement: Cadastral identification is a section

"Identificación catastral" MUST be rendered as a non-input section header that groups the obligation account/contract numbers; no cadastral number input exists.

#### Scenario: Header only

- GIVEN the immovable form
- WHEN it renders
- THEN "Identificación catastral" is a header followed by the obligation numbers and has no text input of its own

## Data Contract

Asset additions: `title`, `movableType`, `brand`, `plate`, `kms` (string), `color`, `propertyKind`, `characteristics`, `location`, `coveredArea`, `freeArea`, `age` (integers or null), `condition`, `notes`. Holders are stored in `assetOwnerships` with `ownershipPercentage`.

## Validation Rules

- `title` non-blank; at least one holder; percentages sum 100 when more than one holder.
- `coveredArea`, `freeArea`, `age`: integer >= 0 or empty.
- Enums as above.
- `kms`, `brand`, `plate`, `color`, `characteristics`, `location`: strings, trimmed.

## Edge Cases

- Changing type of an existing asset is not supported by the form.
- Switching Condición from `Alquilado` to `No alquilado` MUST NOT delete the rental contract (see `asset-rental-inline`).
- Legacy assets with no holders MUST open for editing and require a holder before saving.

## Changes to baseline

- `asset-file-overview` (evolutivo): the asset file header MUST show `title`, `condition`, `location` and type-specific fields; the area summary uses `coveredArea` and `freeArea`, falling back to legacy `area`.
- `ownership-overlap-validation` (evolutivo): unchanged rules, now also triggered by the edit flow.

## Acceptance Criteria

- Each form matches the tables above field by field.
- Validation rules and holder percentage rules are enforced in API and UI.
- Legacy data remains readable and visible under "Datos anteriores"; backfill is idempotent.
