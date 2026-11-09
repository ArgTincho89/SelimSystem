# Party Config Tabs Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs.

## Purpose

Provide Titular, Inquilino and Proveedor configuration tabs in Settings, backed by the existing `legalOwners` collection, so that accounts, assets, rental contracts and obligations select parties created in Settings.

## Requirements

### Requirement: Settings tabs

The Settings page MUST show the tabs "Cuentas", "Avisos", "Titular", "Inquilino" and "Proveedor". "Cuentas" and "Avisos" MUST behave as before. Each new tab MUST list the parties holding the corresponding role and offer create, edit and delete.

#### Scenario: Tabs visible

- GIVEN an authenticated user
- WHEN the Settings page is opened
- THEN five tab buttons are shown in the order Cuentas, Avisos, Titular, Inquilino, Proveedor

#### Scenario: Role-filtered list

- GIVEN parties with role `titular`, `tenant` and `provider`
- WHEN the "Inquilino" tab is opened
- THEN only parties carrying role `tenant` are listed

### Requirement: Party kind

Every party MUST have a kind of `person` or `organization` (UI labels "Persona" / "Organización"). The kind MUST determine the visible and accepted fields.

#### Scenario: Person fields

- GIVEN the create form with kind "Persona"
- WHEN it renders
- THEN it asks for Nombre, Apellido, DNI, Correo electrónico and Teléfono
- AND Nombre and Apellido are required

#### Scenario: Organization fields

- GIVEN the create form with kind "Organización"
- WHEN it renders
- THEN it asks for Razón social, CUIL/CUIT, Teléfono, Correo electrónico and Dirección
- AND Razón social is required

#### Scenario: Switching kind

- GIVEN a form with kind "Persona" filled in
- WHEN the kind is changed to "Organización"
- THEN person-only fields are hidden and are not persisted

### Requirement: Same fields for all three roles

The Titular, Inquilino and Proveedor tabs MUST offer the same person/organization fields. The Proveedor tab MUST additionally require an expense category (see below) when the kind is `organization`.

#### Scenario: Tenant uses same fields

- GIVEN the "Inquilino" tab
- WHEN a new party is created
- THEN the same person/organization fields as in "Titular" are presented

### Requirement: Provider expense category

A party with role `provider` and kind `organization` MUST reference an existing expense category via `expenseCategoryId`. A provider of kind `person` MAY reference one. A referenced category that does not exist or is not an expense category MUST be rejected with 400.

#### Scenario: Organization provider requires category

- GIVEN the "Proveedor" tab with kind "Organización"
- WHEN saving without a category
- THEN the request is rejected with 400 and the form shows a required-field error

#### Scenario: Provider saved with category

- GIVEN provider "Municipalidad" of kind organization and category "Impuesto municipal"
- WHEN saved
- THEN `expenseCategoryId` is persisted and returned

#### Scenario: Unknown category

- GIVEN an `expenseCategoryId` that does not exist
- WHEN the provider is saved
- THEN the request is rejected with 400

### Requirement: Derived display name

The system MUST derive and persist `name` for every party: `"<firstName> <lastName>"` for persons and `businessName` for organizations. Existing readers of `legalOwners.name` MUST keep working. Parties created before this change MUST keep their stored `name` and MUST NOT be altered by the backfill beyond additive fields.

#### Scenario: Person name derived

- GIVEN a person with firstName "Ana" and lastName "Pérez"
- WHEN saved
- THEN `name` equals "Ana Pérez"

#### Scenario: Organization name derived

- GIVEN an organization with businessName "Municipalidad de Córdoba"
- WHEN saved
- THEN `name` equals "Municipalidad de Córdoba"

#### Scenario: Legacy record untouched

- GIVEN a legacy party with `name` "Juan Gómez" and no firstName
- WHEN the system starts
- THEN `name` is still "Juan Gómez" and the record remains readable

### Requirement: Multiple roles per party

A party MAY hold several roles and MUST then appear in every corresponding tab. Removing a role in one tab MUST NOT remove the others.

#### Scenario: Party in two tabs

- GIVEN a party with roles `titular` and `tenant`
- WHEN the "Titular" and "Inquilino" tabs are opened
- THEN the party appears in both

### Requirement: Deletion guard

A party that is referenced by an account, ownership, rental contract, obligation or document MUST NOT be deleted; the API MUST answer 409 and the UI MUST show an explanatory message.

#### Scenario: Delete referenced titular

- GIVEN a titular referenced by an account
- WHEN deletion is requested
- THEN the response is 409 and the party remains

### Requirement: Account titular select

The account edit form MUST offer a titular select whose options are the parties with role `titular`. Existing `account.ownerId` semantics MUST be preserved.

#### Scenario: Assign titular to account

- GIVEN titulars created in the "Titular" tab
- WHEN editing an account
- THEN the select lists exactly those titulars and the saved choice is stored in `ownerId`

### Requirement: Entities route redirect

The legacy `/entities` page MUST redirect to Settings. Existing links and navigation entries to it MUST end on the Settings page.

#### Scenario: Old URL

- GIVEN a bookmark to `/entities`
- WHEN it is opened
- THEN the user lands on Settings

## Data Contract

`legalOwners` additions (all optional at storage level, enforced by validation):
- `kind`: `person` | `organization`
- `firstName`, `lastName`, `dni` (person)
- `businessName`, `taxIdentification` (CUIL/CUIT), `address` (organization)
- `email`, `phone` (both kinds)
- `roles`: includes `titular`, `tenant` and/or `provider`
- `expenseCategoryId`: string | null (provider)
- `name`: derived, persisted

## Validation Rules

- Person: `firstName` and `lastName` MUST be non-blank.
- Organization: `businessName` MUST be non-blank.
- `email`, when provided, MUST be a syntactically valid email.
- `roles` MUST contain at least one of `titular`, `tenant`, `provider` when created from these tabs.
- Provider organization MUST have a valid `expenseCategoryId`.

## Edge Cases

- A party created in one tab MAY be given another role later by editing it.
- Editing a person's names MUST refresh the derived `name`.
- Changing kind MUST NOT delete stored legacy data silently from other collections.

## Acceptance Criteria

- Three tabs work and persist parties with the correct per-kind fields.
- Provider organizations cannot be saved without a category.
- Accounts select titulars from the Titular tab.
- `/entities` redirects to Settings; legacy parties remain readable.
