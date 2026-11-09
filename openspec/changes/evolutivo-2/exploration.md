# Exploration: evolutivo-2

Source: `request.md` (verbatim user request). Baseline: change `evolutivo` (S1–S9) deployed at master `acab476`.

## Current state vs requested

| # | Item | Current (evidence) | Requested | Gap | Risk |
|---|------|--------------------|-----------|-----|------|
| 1a | Movable form | `public/js/pages/assets.js:120-232` name, description, acquisition*, status, subtype, location, notes; `src/routes/assets.js:40-90` | Titular(s)+%, Título, Tipo (default Automóvil), Marca, Dominio, KMs, Color | New fields, default type, remove others from form | Medium: legacy data, filters (`assets.js:118-129`) |
| 1b | Immovable form | propertyType free text, address/locality/province/country, `area` float, `usageStatus` (7 values) | Tipo enum Departamento/Casa/Galpón/Lote, Características, Ubicación, Sup. cubierta/libre int m², Antigüedad int, Condición Alquilado/No alquilado/Usufructo | New/changed fields + enums | Medium-High: usageStatus → condition backfill |
| 1c | Rented/usufruct block | Not in asset form; contract modal in asset detail; `src/services/rentals.js:69-109` requires type, dueDay, periodicity, tenantIds | Inquilino, contract desde/hasta prefilled, Monto original + moneda (ARS), Frecuencia ajuste (months), Criterio ajuste | Inline contract create/update with defaults; 2 new contract fields | High: contract constraints with collections (`rentals.js:125`) |
| 1d | Obligations in asset form | None; asset linked from obligation form | List "Proveedor - Cuenta Nº/Contrato Nº: value"; Titular/Inquilino selector per obligation (rented only) | New UI; label from `externalIdentifierType`; responsibility edit path | Medium: PUT /obligations needs effectiveFromDate when payments exist (`routes/obligations.js:85-101`) |
| 1e | Holders with % | `assetOwnerships`, optional informative %, create-only in form (`assets.js:157`) | "Agregar titular", % required when >1 | Sum = 100 rule, edit mode | Medium |
| 2 | Config tabs | `settings.js:9,48` Cuentas, Avisos; owners on `/entities` (`entities.js:52-92`); `legalOwners` {name, kind person/entity, roles, email, phone, address, taxIdentification, notes} (`src/routes/owners.js:7-34`) | Tabs Titular, Inquilino, Proveedor; person: nombre, apellido, DNI, email, teléfono; organización: razón social, CUIL/CUIT, teléfono, email, dirección; provider has expense category | Role-filtered tabs; new fields firstName, lastName, dni, expenseCategoryId; derive `name` | Medium: many readers of `legalOwners.name` |
| 3 | Account titular | Exists: `account.ownerId` (`accounts.js:84-95,165-182`; `settings.js:359-366`) | Same | Source list from Titular tab | Low |
| 4 | Rental | `usageStatus === 'rented'` disconnected from `rentalContracts` | Declaring rented assigns tenant from Inquilinos | Bridge condition ↔ contract | High |
| 5 | Obligation form | `obligations.js:181-289`; paymentMethod required string (`services/obligations.js:255`) copied into payment transactions (`routes/obligations.js:254-255`); manual category; 5 responsibility modes | No payment method; provider (+ category); single account/contract number; default responsible = asset titular | Remove paymentMethod chain; category from provider; simplify UI | Medium: payment requires category (`routes/obligations.js:235-237`) |
| 6a | Owner payment | `routes/obligations.js:215-262` creates expense transaction; UI `prompt()` for amount (`obligations.js:347-356`); no titular → account derivation | Debit titular's account; impacts Home expenses/savings | Pay dialog + account resolution | High: co-owners / several accounts / currency |
| 6b | Tenant payment | Exists (resolutions, no ledger, asset history) | Same + receipt + history | Verify flow | Low |
| 6c | Receipts | Resolution upload exists; owner payment none | Attach on payments and resolutions | Upload in pay dialog | Low-Medium |
| 6d | View/download | `GET /api/documents/:id/content` (+ `?download=1`) exists (`documents.js:216-244`); monthly view shows counts / file names only (`assets.js:451,479,486`) | View online or download from asset file / monthly view | Clickable links + document metadata in payloads | Low |

## Product defaults adopted (auto mode — to be confirmed by the user)

- **Q1 Identificación catastral**: rendered as a non-input section header grouping the obligation account numbers (DGR, Municipalidad…); no cadastral number field.
- **Q2 Editing holders**: edit form shows current holders with %; changing the set closes old periods and opens new ones from today (history kept).
- **Q3 /entities page**: replaced by the three Settings tabs (route redirects to Settings); a record may carry several roles and appear in several tabs.
- **Q4 Per-obligation responsible**: stored as `obligation.responsibilityType` owner/tenant, editable from the asset form via a lightweight endpoint affecting future unpaid occurrences only; shared/third kept for legacy records, hidden in UI.
- **Q5 Assign obligations from asset form**: list obligations already linked to the asset + "Nueva obligación" shortcut prefilled with the asset (assignment happens in the obligation form).
- **Q6 Usufructo**: same block as Alquilado (usufructuario selected from Inquilinos), stored as a rental contract.
- **Q7 Category**: prefilled from provider's expense category, overridable; payment still requires one.
- **Q8 Debited account**: candidates = active accounts of the asset's current titular(es) in the occurrence currency; preselect if exactly one, else the primary account of the titular with the largest %; the pay dialog always allows changing it.
- **Q10 Payment method**: optional field in the pay dialog (not on the obligation).

## Recommended capabilities

1. `party-config-tabs` — Titular / Inquilino / Proveedor tabs, person vs organization fields, provider expense category, name derivation, /entities redirect; account titular select sourced from it.
2. `asset-form-rewrite` — movable/immovable schema + validation, legacy backfill, filters, holders with % rule and edit behavior.
3. `asset-rental-inline` — condición rented/usufruct block backed by rental contract, new adjustment fields, defaults.
4. `asset-obligations-section` — obligations list with "Proveedor - Cuenta/Contrato Nº", Titular/Inquilino selector, notes.
5. `obligation-form-simplification` — remove payment method, single number field, provider → category, default responsible.
6. `payment-and-receipts` — pay dialog, titular → account resolution, optional payment method, receipt upload, view/download links in asset file and monthly view.
