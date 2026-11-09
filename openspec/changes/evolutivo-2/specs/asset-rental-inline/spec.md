# Asset Rental Inline Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs.

## Purpose

When an immovable's Condición is Alquilado or Usufructo, the asset form renders an inline block (tenant, contract dates, original amount, adjustment) backed by a rental contract, bridging the condition to `rentalContracts`.

## Requirements

### Requirement: Conditional block

The block MUST be rendered only when Condición is `Alquilado` or `Usufructo`, and MUST be hidden for `No alquilado`. Usufructo MUST use the same block (Q6), with the label "Inquilino" selecting the usufructuary from Inquilinos.

#### Scenario: Rented shows block

- GIVEN an immovable form
- WHEN Condición is set to "Alquilado"
- THEN the block shows Inquilino, Contrato vigente desde, Hasta, Monto original with currency selector, Frecuencia ajuste and Criterio ajuste

#### Scenario: Not rented hides block

- GIVEN the block is visible
- WHEN Condición is changed to "No alquilado"
- THEN the block is hidden

#### Scenario: Usufructo

- GIVEN Condición "Usufructo"
- WHEN the form renders
- THEN the same block is shown and the person is picked from Inquilinos

### Requirement: Block fields

| Label | Key | Type | Rule |
|---|---|---|---|
| Inquilino | tenantId | select of parties with role `tenant` | required when block visible |
| Contrato vigente desde | startDate | date (calendar) | required, editable |
| Hasta | endDate | date (calendar) | optional, editable, >= startDate |
| Monto original | originalAmount | integer (major units) | required, > 0 |
| Moneda | originalCurrency | select from the existing currency list (ARS, USD, EUR) | default ARS |
| Frecuencia ajuste | adjustmentFrequencyMonths | integer months | optional, >= 1 |
| Criterio ajuste | adjustmentCriterion | string | optional (e.g. a percentage or IPC) |

The Inquilino select MUST offer a link to create a tenant in Settings.

#### Scenario: Required tenant

- GIVEN Condición "Alquilado" and no Inquilino
- WHEN saving
- THEN the request is rejected with 400

#### Scenario: Invalid dates

- GIVEN Hasta earlier than Contrato vigente desde
- WHEN saving
- THEN the request is rejected with 400

#### Scenario: Default currency

- GIVEN the block is first shown
- WHEN no currency is chosen
- THEN ARS is selected

#### Scenario: Non-integer amount

- GIVEN Monto original "100.5"
- WHEN saving
- THEN the request is rejected with 400

#### Scenario: Frequency below one

- GIVEN Frecuencia ajuste "0"
- WHEN saving
- THEN the request is rejected with 400

### Requirement: Backed by a rental contract

Saving an asset with block data MUST create the rental contract for that asset, or update the existing active contract in place (never create a second overlapping active contract). Defaults needed by the contract model that are not requested in the block (type, due day, periodicity) MUST be filled with documented defaults and MUST NOT be asked in the form. When a contract already exists, the dates and values MUST be prefilled from it.

#### Scenario: Create contract

- GIVEN a saved asset with Condición "Alquilado" and complete block data
- WHEN the form is submitted
- THEN a rental contract exists for the asset with that tenant, dates, original amount, currency, frequency and criterion

#### Scenario: Prefill from existing contract

- GIVEN an asset with an active contract from 2026-01-01 to 2026-12-31
- WHEN the edit form is opened
- THEN Contrato vigente desde and Hasta show those dates and are editable

#### Scenario: Update in place

- GIVEN an active contract
- WHEN the tenant or dates are changed in the form
- THEN the same contract is updated and no new contract is created

#### Scenario: Collection constraints respected

- GIVEN an active contract with registered collections
- WHEN a change would violate the existing collection constraints of the contract
- THEN the request is rejected with 409 and an explanatory message, and nothing is modified

### Requirement: Condition change keeps contract

Changing Condición from `Alquilado`/`Usufructo` to `No alquilado` MUST NOT delete the contract. The system MUST ask for or set an end date no later than today on the active contract (when the user confirms) and MUST keep its history. Changing back to `Alquilado` MUST prefill from the latest contract.

#### Scenario: Condition to not rented

- GIVEN an active contract and the user switches to "No alquilado" and confirms
- WHEN saving
- THEN the contract end date is set to today if it was later, and the contract and its collections remain stored

### Requirement: Original amount data model

The contract MUST store `originalAmount` (minor units), `originalCurrency`, `adjustmentFrequencyMonths` and `adjustmentCriterion` as additive fields, without altering existing rent amount or collection logic. Existing contracts without these fields MUST remain valid and render empty values.

#### Scenario: Legacy contract

- GIVEN a contract created before this change
- WHEN the edit form opens
- THEN the new fields are empty and the contract is unchanged until saved

### Requirement: Bridge with usage status

The legacy `usageStatus` value MUST remain stored but MUST NOT drive behavior once `condition` exists. Declaring `Alquilado`/`Usufructo` MUST be reflected in tenant-obligation resolution via the contract (tenant resolution uses the contract of the occurrence date).

#### Scenario: Tenant resolution via contract

- GIVEN a rented asset with an active contract and a tenant-responsible obligation
- WHEN alerts are generated
- THEN the tenant of the contract is the party expected to present the receipt

## Data Contract

`rentalContracts` additions: `originalAmountMinor`, `originalCurrency` (`ARS` default), `adjustmentFrequencyMonths` (int|null), `adjustmentCriterion` (string|null).

## Validation Rules

- Tenant MUST have role `tenant`.
- `startDate` required; `endDate` >= `startDate` when present.
- Only one active contract per asset in the same period.

## Edge Cases

- Usufructo and Alquilado share validation.
- A contract with an end date in the past MUST show the form as "Alquilado" only if the user keeps that condition and renews dates.
- Deleting the tenant party while referenced is rejected (see `party-config-tabs`).

## Changes to baseline

- `tenant-obligation-resolution` (evolutivo): the tenant for an occurrence MUST be resolved from the rental contract active on the occurrence date; the rental contract is now created from the asset form as well as from the contract modal.
- `obligation-responsibility` (evolutivo): see `asset-obligations-section` for UI limits on `responsibilityType`.

## Acceptance Criteria

- The block appears only for Alquilado/Usufructo and persists a contract.
- Dates prefill from existing contracts and remain editable.
- Original amount, currency (ARS default), adjustment frequency and criterion are stored.
