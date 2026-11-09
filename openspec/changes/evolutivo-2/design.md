# Design: Evolutivo 2

## Technical Approach

Only additive changes on the existing Express/JsonDB stack. New fields are optional at the API level, so existing callers and tests keep working. The UI enforces the stricter `request.md` form rules. A new composite asset-form endpoint validates the whole form before writing anything. A lightweight responsibility path pins history on each occurrence. A payment-context read model resolves the titular's account to debit. Tenant payments keep the `obligationResolutions` path and never write a ledger transaction. `migrateEvolutivo2` is an idempotent, add-only backfill (it only fills fields that are `undefined`).

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Party model | Extend `legalOwners` with `firstName`, `lastName`, `dni`, `expenseCategoryId`. Persist a derived `name`. Keep `kind` values `person`/`entity` (shown as "Organización") | New collections per role | 9 services read `legalOwners.name`. Keeping a persisted `name` means no reader changes. Roles already model Titular/Inquilino/Proveedor |
| Party UI | `EntitiesPage` refactored into `EntitiesPage.renderPanel(panel, role)`, mounted by Settings tabs. `/entities` redirects to `/settings?section=owners` and the navbar "Contactos" item is removed | Delete `entities.js` | No `sw.js`/`index.html` churn. Keeps the S1 UI contract test. The mobile navbar loses an item |
| Asset schema | New top-level fields. Legacy fields (`propertyType`, `usageStatus`, `area`, address parts, `subtype`, `acquisition*`, `status`) stay accepted and stored | Replace legacy fields | Rollback safety. Existing tests post `propertyType: 'Apartment'` |
| Asset form save | Composite `POST /api/assets/form` and `PUT /api/assets/:id/form`. Phase 1 validates everything with no writes. Phase 2 writes | Sequential client calls | JsonDB has no transactions, and validate-all-first is the closest thing to atomic. A failed call leaves no half-saved contract |
| Holder edits | Diff by `ownerId`+`percentage`. Changed or removed holders close with `endDate = today-1`. Records with `startDate === today` are updated or removed in place. Unchanged holders stay open | Close all and reopen | Keeps history minimal and still passes `validateOwnershipSet` (inclusive dates) |
| Responsibility change | `PATCH /api/obligations/:id/responsibility` sets the live type. It first pins `responsibilityType`/`responsibilitySplit` on existing occurrences that are past-dated or settled | `PUT /obligations` with `effectiveFromDate` | `occurrenceView` reads the live obligation, so without pinning, paid history would flip to overdue. PUT forces a revision ceremony for a non-schedule change |
| Locked contract | Contracts with rent occurrences keep `tenantIds`, `startDate`, `initialRent`, `currencyCode` read-only in the form (`locked: true`). To change the tenant, set the condition to No alquilado (which ends the contract) and declare it again | Auto-supersede the contract | Reuses the `rentals.js` 409 rules. No hidden writes |
| Payment account | Server read model `payment-context` (algorithm below). The dialog may override the account | Client-side heuristic | Testable and reused by tests. Same validation as the payment POST |
| Receipt upload | Two steps: the payment POST, then `uploadTargets({ transactionId, occurrenceId })`. If the upload fails, the payment stays and the row offers "Adjuntar comprobante" | Multipart payment endpoint | Reuses document validation unchanged. Idempotent payment replay is unaffected |
| Payment method | Removed from the obligation form. Stored legacy values remain. The payment POST accepts optional `paymentMethodId` and `paymentMethod` | Drop the field | Rollback-safe. The `validateDefinition` string check defaults `undefined` to `''` |
| Document links | Payloads carry metadata (`id`, `title`, `fileName`, `contentType`). The client builds `/api/documents/:id/content` and `?download=1` | Server URLs | Single URL source. The content endpoint already sets inline/attachment and the CSP sandbox |

## Data Model (authoritative)

**legalOwners**: `firstName` (person, required, ≤80), `lastName` (≤80, required in UI, may be `''` for legacy records), `dni` (person, ≤20, `/^[0-9.]*$/`, nullable), `expenseCategoryId` (existing category or null; offered only when the roles include `provider`).
- `name` derivation: for a person, `name = trim(firstName + ' ' + lastName)`. For an organization, `name` is the razón social (input). Existing fields reused: `taxIdentification` (CUIL/CUIT), `email`, `phone`, `address`.
- Validation rule: any request that sends `firstName`/`lastName` gets `name` re-derived.

**assets (movable)**:

| Field | Type / constraint | UI label |
|---|---|---|
| `vehicleType` | enum `['automovil']`, default `'automovil'` | Tipo |
| `brand` | ≤80 | Marca |
| `plate` | ≤20, uppercased | Dominio |
| `mileage` | string ≤20 | KMs |
| `color` | ≤40 | Color |

**assets (immovable)**:

| Field | Type / constraint | UI label |
|---|---|---|
| `propertyKind` | enum `departamento\|casa\|galpon\|lote`, nullable | Tipo; required in UI |
| `characteristics` | ≤2000 | Características |
| `location` | existing field, max raised to 300 | Ubicación |
| `coveredAreaM2`, `freeAreaM2` | int ≥0, nullable | Sup. cubierta / libre |
| `ageYears` | int 0–500, nullable | Antigüedad |
| `condition` | enum `rented\|not_rented\|usufruct`, default `not_rented` | Condición |

Syncing rule: `condition` in `rented`/`usufruct` sets `usageStatus: 'rented'`. Setting `not_rented` while `usageStatus` is `'rented'` sets it to `'vacant'`. `name` is the Título. `notes` is shared by both types.

**rentalContracts**:
- `adjustmentFrequencyMonths`: int 1–120, nullable.
- `adjustmentCriterion`: string ≤120, nullable.
- `contractKind`: `rental|usufruct`, default `rental`.
- Defaults when the form creates a contract:
  - `type`: `galpon` → `industrial`, `lote` → `other`, everything else → `residential`
  - `periodicity`: `monthly`
  - `dueDay`: the day of `startDate`
  - `status`: `active`
  - `expenseResponsibility`: `{}`
  - `includedExpenses`: `[]`
  - `depositAmount`: `0`

**obligationOccurrences**: optional pinned `responsibilityType`/`responsibilitySplit`. A helper `obligations.responsibilityFor(obligation, occurrence)` replaces direct reads in `occurrenceView`, `createResolution`, and `economic-overview.monthlyView`.

## Backfill — `migrateEvolutivo2(db)` in `src/services/migrations.js`

Each field below is set only when it is `undefined`:

- **legalOwners**: for persons, `firstName = name` and `lastName = ''`. `dni` and `expenseCategoryId` become `null`.
- **Movable assets**: `vehicleType = 'automovil'`. `brand`, `plate`, `mileage`, `color` become `''`.
- **Immovable assets**:
  - `condition`:
    - `'rented'` if `usageStatus === 'rented'` or the asset has an `active` contract
    - `'not_rented'` otherwise
  - `propertyKind`, from the accent-stripped, lowercased `propertyType`:

    | `propertyType` match | `propertyKind` |
    |---|---|
    | `/depart\|dpto\|flat\|apartment/` | `departamento` |
    | `/casa\|house/` | `casa` |
    | `/galp\|warehouse/` | `galpon` |
    | `/lote\|terreno\|lot/` | `lote` |
    | no match | `null` |

  - `coveredAreaM2 = round(area)` or `null`. `freeAreaM2` and `ageYears` become `null`. `characteristics` becomes `''`.
- **rentalContracts**: the two adjustment fields become `null`. `contractKind` becomes `'rental'`.

It is called in `src/app.js` after `migrateEvolutivo` and returns `{ updated }`.

## Interfaces / Contracts

```
POST /api/assets/form            PUT /api/assets/:id/form
{ asset: { type, name, notes, ...typed fields },
  owners: [{ ownerId, percentage|null }],           // >=1; if >1 every % in (0,100], sum 100 (±0.01)
  rental: null | { tenantId, startDate, endDate|null, amount, currencyCode='ARS',
                   adjustmentFrequencyMonths|null, adjustmentCriterion },   // required iff condition rented|usufruct
  obligationResponsibilities: [{ obligationId, responsibilityType: 'owner'|'tenant' }] }  // PUT only
-> 201/200 assetResponse + activeContract{...,locked,tenants} + obligations[{id,title,providerName,
   externalIdentifier,externalIdentifierType,responsibilityType}]   (also added to GET /api/assets/:id)
Errors: 400 validation (no writes), 409 locked-contract field change, 500 write failure (db.clearCache()).

PATCH /api/obligations/:id/responsibility  { responsibilityType: 'owner'|'tenant' }
  tenant requires obligation.assetId with an active contract -> sets rentalContractId.

GET /api/obligations/:id/occurrences/:occurrenceId/payment-context
-> { occurrence:{id,date,currencyCode,remainingAmount}, responsibilityType, categoryId,
     accounts:[{id,name,currency,ownerId,ownerName,primary}], suggestedAccountId|null,
     accountSource:'explicit'|'titular'|'fallback'|'none', warning|null, blocked:boolean, blockedReason|null,
     paymentMethods:[...] }

POST .../payments  adds optional { paymentMethodId, paymentMethod }; category chain:
  body -> occurrence -> obligation -> provider.expenseCategoryId.
```

Account resolution order:
1. **Explicit**: `occurrence.accountId`, then `obligation.accountId`, used if active and in the occurrence currency.
2. **Titular**: active accounts whose `ownerId` is one of the asset's open ownerships and whose currency matches. If there is one candidate, suggest it. If there are several, rank by the holder with the largest percentage (ties go to the earliest `startDate`), then by global `primary`, then by `order`.
3. **Fallback**: all active accounts in the currency, with a warning.
4. **None**: `blocked`.

Tenant-only occurrences return `blocked`, so the UI shows "Resolver" instead.

Monthly view obligation rows add:
- `documents[]`, built from documents whose `occurrenceId` matches, whose `transactionId` is in `paymentIds`, or that the resolution references in `documentIds`
- `payments[{transactionId,date,amountMinor,accountName,paymentMethod}]`
- `resolvedAt`

`documentIds` is kept.

## Sequence: Asset Form Save

```
assets.js form -> PUT /api/assets/:id/form -> asset-form.validate (no writes):
   validateAsset + owners % rule + validateOwnershipSet(diff)
   + rentals.validateContract(defaults|existing) + locked check + responsibilities
 -> asset-form.apply: update asset (+usageStatus sync, statusHistory)
   -> close/open ownerships -> create | update | end contract (rentals.afterContractWrite)
   -> not_rented: tenant obligations -> owner (pinning) -> PATCH-equivalent per responsibility
 <- assetResponse
```

## Sequence: Pay Owner Occurrence

```
obligations.js pay dialog -> GET payment-context -> render amount (first number input), account select,
  date, optional payment method, receipt file
 -> POST .../payments (idempotencyKey) -> expense transaction (Home expenses/savings)
 -> if file: POST /api/documents {transactionId, occurrenceId} -> asset derived
 -> refresh; monthly view/asset file show view/download links
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/services/asset-form.js` | Create | Validate/apply the composite form, ownership diff, contract bridge |
| `src/services/migrations.js` | Modify | `migrateEvolutivo2` |
| `src/app.js` | Modify | Call the migration |
| `src/routes/owners.js` | Modify | New fields, `name` derivation |
| `src/routes/assets.js` | Modify | Typed fields, filters (`condition`, `propertyKind`), form routes, response extras |
| `src/services/rentals.js`, `src/routes/rentals.js` | Modify | Adjustment fields, `contractKind`, extract `afterContractWrite`, set `condition` on activation |
| `src/services/obligations.js` | Modify | `responsibilityFor`, pinning, `setResponsibility`, `paymentMethod` optional, `paymentContext` |
| `src/routes/obligations.js` | Modify | PATCH responsibility, payment-context, payment method in POST |
| `src/services/economic-overview.js` | Modify | Row documents/payments, pinned responsibility |
| `public/js/pages/settings.js` | Modify | Tabs Titular/Inquilino/Proveedor (`owners`/`tenants`/`providers`); account titular select filtered to role owner |
| `public/js/pages/entities.js` | Modify | `renderPanel(panel, role)`, person/organization fields, provider category |
| `public/js/app.js` | Modify | `/entities` redirect, remove the navbar item |
| `public/js/pages/assets.js` | Modify | Rewritten form, rental block, obligations section, "Datos anteriores", document links |
| `public/js/pages/obligations.js` | Modify | Simplified form, pay dialog replacing `prompt()`, attach receipt |
| `public/js/api.js` | Modify | `assets.saveForm`, `obligations.paymentContext`, `obligations.setResponsibility`, `documents.contentUrl` |
| `public/sw.js` | Modify | `CACHE_NAME` to `selimsystem-v27`, bumped once per UI slice (v27 to v31) |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Name derivation, ownership diff, % rule, account ranking, propertyKind mapping, backfill idempotency (run twice, second run `updated: 0`) | Jest |
| Integration | Composite form create/update/400-no-writes/409-locked. Condition transitions (create/end contract, tenant obligations revert). PATCH responsibility pins paid history. payment-context cases (one, many, fallback, none, tenant). Owner payment changes Home KPIs; resolution does not. Monthly view links | Supertest |
| Regression | Existing `assets`, `rentals`, `finance`, `obligation-responsibility`, and `alerts` suites unchanged | `npm test` |
| UI contract | Update `tests/ui/evolutivo-s1..s9` where they assert `entities.js` roles or the obligation form. The S2 tuple strings stay because legacy shared/third remain renderable. Add an `evolutivo2` contract test | Jest file reads |
| E2E | No feature touches assets, entities, or obligations. `account-configuration.feature` clicks the exact tabs "Cuentas"/"Avisos", which are unaffected (new tabs have distinct names). Transaction modal unchanged (`fillAmount` uses the first number input). Pay dialog keeps the amount as the first number input; account/contract numbers use `type="text"`. Full run as regression | Cucumber |

Coverage: `npm run test:coverage` must keep the global 60% and per-file thresholds. Target ≥80% lines for `asset-form.js`.

## Threat Matrix

N/A: no shell, subprocess, VCS, or executable-file boundary. Uploads reuse the existing validated documents route.

## Migration / Rollout

Five slices, as in the proposal. The backfill ships with slice 1 (owners) and slice 2 (assets/contracts). Rollback by reverting code. Added fields are ignored by older code. Pinned occurrence fields are inert under older code (it reads the live obligation).

## Open Questions

- [ ] For usufruct, is "Monto original" mandatory? (Assumed yes: the same contract validation, which needs a positive rent.)
- [ ] Should `adjustmentFrequencyMonths` feed `rent_adjustment_due` alerts? (Out of scope.)
