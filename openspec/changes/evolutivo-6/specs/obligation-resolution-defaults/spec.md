# Obligation Resolution Defaults Specification

> Traceability: request.md 1 (Precarga del Inquilino, Obligatoriedad de Notas); proposal items 1.1, 1.2; Decisions 1 and 8.

## Purpose

Make "Resolver" prefill the right tenant and force a justification note when resolving or paying an obligation.

## Requirements

### Requirement: Contract tenant preselection

The resolve modal of a tenant-responsible obligation SHALL list only the tenants of the obligation's rental contract (`rentalContractId`), or of the asset's active contract when the obligation has none, and SHALL preselect the first one. The full tenant list SHALL be shown only when no contract can be determined.

#### Scenario: Contract with one tenant
- GIVEN a tenant obligation linked to a contract whose tenant is "Ana"
- WHEN the user presses "Resolver"
- THEN the tenant selector lists only "Ana" and has her selected

#### Scenario: Obligation without contract id
- GIVEN an obligation with no `rentalContractId` on an asset with one active contract
- WHEN "Resolver" opens
- THEN the tenants of that active contract are listed and the first is selected

#### Scenario: No contract
- GIVEN an asset with no contract
- WHEN "Resolver" opens
- THEN all tenants are listed and none is silently preselected as a contract tenant

#### Scenario: Contract with several tenants
- GIVEN a contract with tenants "Ana" and "Beto"
- WHEN "Resolver" opens
- THEN only those two are listed and the first is selected

### Requirement: Mandatory note

Resolving an obligation and marking it as paid SHALL require a non-empty note (after trimming), enforced in the UI and on the server. The UI SHALL block submit and show an error when the note is empty. The server SHALL answer 400 with a clear message when the trimmed note is empty or missing, and SHALL NOT change any data.

#### Scenario: Empty note in resolve modal
- GIVEN the resolve modal is open
- WHEN the user submits with an empty or whitespace-only note
- THEN no request is sent and the note field shows a required error

#### Scenario: Empty note in pay modal
- GIVEN the pay modal is open
- WHEN the user submits without a note
- THEN the save is blocked with a required error

#### Scenario: Server rejects missing note
- WHEN a resolve or pay request arrives with a blank note
- THEN the response is 400 and the obligation stays unchanged

#### Scenario: Valid note
- WHEN the user submits with note "Pagado por transferencia"
- THEN the action succeeds and the trimmed note is stored
