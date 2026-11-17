# Custom Asset Kinds Specification

> Traceability: request.md 4 (Flexibilidad en tipos de bienes); proposal item 4.6; Decision 4.

## Purpose

Let the user create asset types beyond the built-in `PROPERTY_KINDS` (e.g. "Local comercial").

## Requirements

### Requirement: Kinds API

The server SHALL expose list and create endpoints for per-user asset kinds stored in an `assetKinds` collection. Create SHALL trim the name, require 1 to 50 characters and reject (400 or 409) names that duplicate, case- and accent-insensitively, a built-in or existing user kind. Kinds SHALL be isolated per user. Rename and delete are not provided.

#### Scenario: Create
- WHEN the user creates "Local comercial"
- THEN it is stored and returned by the list

#### Scenario: Duplicate
- WHEN the user creates "local comercial" again, or a built-in label
- THEN the request is rejected and nothing is stored

#### Scenario: Empty or too long
- WHEN the name is blank or over 50 characters
- THEN the response is 400

#### Scenario: Isolation
- GIVEN another user created "Galpón"
- THEN it is not listed for this user

### Requirement: Form option and validation

`propertyKindOptions()` SHALL merge built-in and user kinds. The asset form SHALL offer "Agregar tipo…", which creates the kind and selects it. The server SHALL accept an asset `kind` that is built-in or one of the user's kinds, and reject others. A contract on an asset with a custom kind SHALL use the `residential` contract type.

#### Scenario: Add from form
- WHEN the user picks "Agregar tipo…" and enters "Local comercial"
- THEN the option appears selected and the asset can be saved with it

#### Scenario: Unknown kind
- WHEN an asset is saved with a kind that is neither built-in nor the user's
- THEN the server rejects it

#### Scenario: Contract fallback
- GIVEN an asset of kind "Local comercial"
- WHEN a contract is created
- THEN its type is `residential`
