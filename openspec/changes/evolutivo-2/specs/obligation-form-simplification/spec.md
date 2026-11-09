# Obligation Form Simplification Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs.

## Purpose

Simplify the obligation form: remove payment method, derive category from the provider, use one account/contract number field, and default the responsible to the asset's titular.

## Requirements

### Requirement: Form fields

The obligation form MUST contain exactly: Nombre, Tipo, Bien, Proveedor, Cuenta/Contrato Nº, Frecuencia de pago, Primer vencimiento, Último vencimiento (optional), Aviso (días antes), Moneda, Importe estimado, Categoría (prefilled), Responsable (see below) and Notas. It MUST NOT contain Medio de pago.

Frecuencia de pago options: única vez, mensual, cada dos meses, trimestral, semestral, anual.

#### Scenario: No payment method

- GIVEN the obligation form (create or edit)
- WHEN it renders
- THEN no "Medio de pago" control exists

#### Scenario: Frequency options

- GIVEN the Frecuencia de pago select
- WHEN opened
- THEN it offers única vez, mensual, cada dos meses, trimestral, semestral and anual

#### Scenario: Optional last due date

- GIVEN a recurring obligation without Último vencimiento
- WHEN saved
- THEN it is accepted and occurrences continue per frequency

### Requirement: Payment method removed from obligation

`paymentMethod` MUST NOT be required or validated on create/update of obligations. A legacy stored `paymentMethod` MUST remain readable but MUST NOT be copied into payment transactions. Payment method is set only when paying (see `payment-and-receipts`).

#### Scenario: Create without payment method

- GIVEN a valid payload without `paymentMethod`
- WHEN POSTed
- THEN the obligation is created with 201

#### Scenario: Legacy value ignored on payment

- GIVEN a legacy obligation with `paymentMethod` "card"
- WHEN an occurrence is paid without choosing a method
- THEN the transaction has no payment method derived from the obligation

### Requirement: Provider selection and category prefill

Proveedor MUST be a select of parties with role `provider`. Selecting a provider with an `expenseCategoryId` MUST prefill Categoría with it; the user MAY override it. Selecting a provider without category MUST leave Categoría blank. Category is still required to pay but MUST NOT block saving the obligation.

#### Scenario: Prefill

- GIVEN provider "Municipalidad" with category "Impuesto municipal"
- WHEN it is selected in the form
- THEN Categoría shows "Impuesto municipal"

#### Scenario: Override

- GIVEN a prefilled category
- WHEN the user selects another category and saves
- THEN the chosen category is stored

#### Scenario: Provider without category

- GIVEN a person provider without category
- WHEN selected
- THEN Categoría stays empty and the obligation can be saved

#### Scenario: Provider changed later

- GIVEN a prefilled category the user had overridden
- WHEN the provider is changed
- THEN Categoría is re-prefilled only if it was still the previous provider's category

### Requirement: Single account/contract number

The form MUST offer one text field "Cuenta/Contrato Nº" plus a selector Cuenta | Contrato that sets `externalIdentifierType`. The previous multiple identifier inputs MUST be removed from the form.

#### Scenario: Contract type

- GIVEN the selector set to "Contrato" and value "998877"
- WHEN saved
- THEN `externalIdentifierType` is `contract` and the value is stored

#### Scenario: Legacy multiple identifiers

- GIVEN a legacy obligation with several identifiers
- WHEN edited
- THEN the first identifier is shown in the field and the remaining ones are kept untouched in storage

### Requirement: Default responsible

When an obligation is linked to an asset, `responsibilityType` MUST default to `owner` (the asset's titular). The form MUST show Responsable with options Titular / Inquilino; Inquilino is selectable only for assets with an active rental contract. `shared` and `third` MUST NOT be offered; `none` MAY remain only for obligations not linked to an asset.

#### Scenario: Default titular

- GIVEN an asset is selected
- WHEN the form is untouched
- THEN Responsable is Titular

#### Scenario: Tenant option disabled

- GIVEN an asset without active contract
- WHEN opening Responsable
- THEN Inquilino is disabled with a hint

#### Scenario: Legacy shared kept

- GIVEN a legacy obligation with `shared`
- WHEN edited and saved without touching Responsable
- THEN `responsibilityType` and split are unchanged

### Requirement: Estimated amount and currency

Moneda and Importe estimado MUST remain as before (currency from the existing list; amount in major units, > 0).

#### Scenario: Amount validation

- GIVEN Importe estimado 0
- WHEN saving
- THEN the request is rejected with 400

### Requirement: Backend compatibility

Updating an obligation with payment history MUST continue to follow existing `effectiveFromDate` rules for changes other than the lightweight responsible change.

#### Scenario: Edit with payments

- GIVEN an obligation with payments
- WHEN a financial field changes without `effectiveFromDate`
- THEN the existing validation applies

## Data Contract

Obligation: `providerId` (party id), `categoryId`, `externalIdentifierType` (`account`|`contract`), `externalIdentifier` (string), `responsibilityType`. `paymentMethod` becomes optional/ignored.

## Validation Rules

- `providerId`, when provided, MUST reference a party with role `provider`.
- `categoryId`, when provided, MUST reference an existing expense category.
- Dates: `lastDueDate` >= `firstDueDate` when present.
- No `paymentMethod` requirement.

## Edge Cases

- Obligations without asset: Responsable defaults to Titular is not applicable; type `none` stays available.
- Existing recurrences are not regenerated by removing `paymentMethod`.

## Changes to baseline

- `obligation-responsibility` (evolutivo): form default is `owner` and UI limited to owner/tenant; storage still accepts all values.
- `obligation-external-identifiers` (evolutivo): form shows a single number field; legacy extra identifiers stay stored.
- `alerts-center` (evolutivo): alert payloads MUST NOT depend on `paymentMethod`.

## Acceptance Criteria

- Form matches the field list and has no payment method.
- Provider prefills category (overridable).
- New asset-linked obligations default to Titular.
- Obligations can be created without `paymentMethod`.
