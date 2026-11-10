# Design: Evolutivo 3

Authoritative for names, fields, endpoints and slice order. Specs defer to it. Source of truth: `request.md`.

## Technical Approach

Additive changes on Express/JsonDB. Two new collections (`activityLogs`, `rentalDeclarations`) and new optional fields. `migrateEvolutivo3` is an idempotent, add-only backfill. One frontend component (`MoneyInput`) and one shared helper (`statusLabel`). **Rental modalities reuse the existing contract machinery: one `rentalContracts` row per modality, grouped by a declaration.** Six slices, each ≤ 800 changed lines, deployable on master. `CACHE_NAME` goes up by one per UI slice (v32 to v37).

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Modalities model | `rentalDeclarations {assetId, tenantIds, notes, endedAt}` plus N `rentalContracts` with `declarationId`, `modality`, `ivaPercent` | `contract.modalities[]` with per-modality occurrence keys | Each modality has its own dates, amount, currency and adjustment, so it is already a contract. Occurrences, `generationKey` (`${contractId}:${date}`), allocations (one currency), conditions, alerts and economic-overview keep working unchanged |
| IVA amount | Contract `initialRent`/condition `rentMinor` stay **net**. Occurrence `rentMinor` = gross = `mulDivRound(net, 10000+ivaBp, 10000)` and also stores `netMinor`, `ivaPercent`, `ivaMinor` | Store gross on contract | Adjustments apply to net. Expected and collected amounts are gross, so allocation math is unchanged |
| IVA classification | Collection tx: `clasificacion:'A'`, `ivaPorcentaje`, `ivaIncluded:true` when all allocated contracts share one `ivaPercent>0`. Body may override with `clasificacion:'A'\|'B'`. `getIncomeIva` uses `a×r/(100+r)` when `ivaIncluded` | Plain `A` | `getIncomeIva` (`utils/income.js:81`) treats `monto` as net, so a gross `monto` would overstate IVA |
| Correct a collection | `rentals.reverseCollection` service. Reached from `POST /api/rentals/collections/:id/reverse` and from `DELETE /api/transactions/:id` when the tx has `rentCollectionId`. Allocations and the transaction are hard-deleted. The collection becomes a tombstone (`reversedAt`, `reversedTransactionId`) | Hard-delete the collection; compensating tx | Occurrence status comes from allocations (`rentals.js:204`), so it returns to pending/overdue. The tombstone keeps the idempotency key: a replay gets 409 "Ese cobro fue anulado; registrá uno nuevo" and the old collection is never resurrected. Notes that target the collection stay valid |
| Audit capture | Global middleware `src/middleware/activity-log.js`, mounted after `session` and before routers (`app.js:59`). Logs POST/PUT/PATCH/DELETE on `res.on('finish')`. `userId` is read at start, or at finish for login. It wraps `res.json` **only to read `body.id`** | JsonDB hook; per-route calls | One chokepoint and no edits to the 73 routes. A DB hook has no user intent |
| Audit message | `src/services/activity-log.js` `ROUTES` table `{method, pattern, action, entityType, done, attempt}` + `labelFor(db,userId,type,id)`. Label is resolved **before** the handler for PUT/DELETE and after it for POST. Message is stored as text at write time | Render at read time | Entities can be renamed or deleted later |
| Sub-account balances | A child is a full account with `parentId`. Each balance is its own. No roll-up, no cross-currency sums | Parent includes children | KPIs are transaction-based (one `accountId` each), so there is no double counting. Existing `accountForMovement`/reconcile work unchanged |
| Money input | `type="text" inputmode="decimal" data-money-input data-currency`. Formats es-AR on blur. Exposes `MoneyInput.value(el)` → Number | `type=number` + mask | Number inputs cannot show "211.392,00" |
| Contract edit | Allowed. Unpaid occurrences are hard-deleted and regenerated | Keep locked (evolutivo-2) | Request item 5c |

## Data Model

| Collection | New fields |
|---|---|
| `accounts` | `parentId` (null or the id of an active top-level account). It cannot be changed after creation |
| `assets` (immovable) | `cadastralId` string ≤100 or null. `constructionDate` YYYY-MM-DD, not future, or null. Response adds `age: {years, source:'constructionDate'\|'legacy'\|null}` |
| `rentalDeclarations` | `assetId`, `tenantIds[]`, `notes` ≤4000, `endedAt`. `status` is derived: active if any contract is active |
| `rentalContracts` | `declarationId`, `modality` `locacion\|comodato\|mutuo`, `ivaPercent` (0–100, 2 decimals, locación only, else null). `contractKind` is derived: locación→`rental`, others→`usufruct` |
| `rentOccurrences` | `modality`, `netMinor`, `ivaPercent`, `ivaMinor` (all optional; legacy rows fall back to gross = net) |
| `rentCollections` | `reversedAt`, `reversedTransactionId`, `clasificacion` |
| `documents` | Reversal sets `transactionId:null` and `detachedFromCollectionId` (the receipt is kept on the asset) |
| `activityLogs` (per user) | `timestamp` (ISO), `method`, `route` (the pattern, not the raw URL), `action`, `entityType`, `entityId`, `entityLabel`, `outcome` `success\|failure`, `statusCode`, `message`. **Never** bodies, queries, headers or credentials |

`asset.condition` is derived: `afterContractWrite` sets it, and so does ending the last contract (→ `not_rented`). The form no longer sends it.

## Interfaces / Contracts

```
POST /api/rentals/declarations   PUT /api/rentals/declarations/:id
{ assetId, tenantIds[>=1], notes,
  modalities: [ {kind, startDate, endDate|null, amount, currencyCode,
                 ivaPercent|null /*locacion only*/, adjustmentFrequencyMonths|null,
                 adjustmentCriterion|null} ]   // 1..3, kinds unique
  obligationResponsibilities: [{obligationId, responsibilityType}] }
-> 201/200 { id, assetId, tenants, notes, status,
             modalities:[{contractId, kind, ...fields, locked, occurrences}] }
POST /api/rentals/declarations/:id/end  -> ends all contracts (cancel unpaid > today,
     tenant obligations -> owner). Replaces the condition=not_rented path.
GET  /api/rentals/declarations?assetId=
```

PUT rules, applied per modality:
- A new kind creates a contract. A removed kind ends it (like `/end`).
- If a `startDate`, `endDate`, `amount`, `currencyCode` or `ivaPercent` change would leave a **collected** occurrence outside `[start,end]`, the request fails with 409 "Hay períodos cobrados fuera del nuevo rango; anulá esos cobros primero".
- A currency change with any collected occurrence also returns 409.
- A new start earlier than an existing `rentalConditions.effectiveDate` returns 409.
- Otherwise, unpaid non-superseded occurrences are hard-deleted, the contract is updated, and the occurrences are regenerated. `dueDay` follows the new start day only when nothing was collected.

`asset-form.planRental` runs only when `body.rental !== undefined` (legacy API/tests). The UI never sends it.

```
POST /api/rentals/collections   (+ clasificacion?: 'A'|'B'; method optional 0..100 chars;
     paymentMethodId still accepted, no longer sent by the UI; fingerprint adds clasificacion)
POST /api/rentals/collections/:id/reverse -> 200 {ok, collectionId, reopenedOccurrenceIds}
  409 if: already reversed | account reconciled and (collection.date < openingDate or
  tx in includedMovementIds) | refund/normalization/movementAllocations reference the tx.
  Order: validate all -> remove allocations -> remove tx -> tombstone -> detach docs
  -> ledger.refreshAlerts. Lists, collectionView and finance.js:50 skip tombstones.
DELETE /api/transactions/:id  rentCollectionId -> delegates to reverseCollection.
PUT    /api/transactions/:id  rentCollectionId -> 409 "Para corregir un cobro de alquiler,
  eliminá la transacción: el período vuelve a quedar pendiente de cobro".

GET /api/activity-logs?limit=50(max 200)&before=<ISO> -> {items:[...], nextBefore}
  Own entries only, newest first. Retention: entries older than 12 months are pruned
  on write, at most once per user per day.
  Skipped: unauthenticated requests, DELETE /api/auth/account (the user dir is removed),
  forgot/reset-password. A logging failure never affects the response (try/catch).
```

Message examples: "Registraste el cobro del alquiler de Casa Centro, período mayo 2026", "Intentaste anular un cobro de alquiler, pero no se completó". Unknown route: "Realizaste un cambio en {sección}".

Accounts:
- `POST /api/accounts {parentId}` requires the parent to exist, be active and have no `parentId` itself. A child cannot be primary. Its `ownerId` defaults to the parent's. Its currency can be any selectable currency.
- `POST /archive` on a parent with active children returns 409. `DELETE` on a parent that has any children returns 409.
- `getAccountBalances` adds `parentId`. Results are ordered parent, then its children.
- `paymentContext` ranking adds: top-level accounts before sub-accounts.

Frontend:
- `MoneyInput.create({currency, value, id, ariaLabel, allowNegative})`, `.value(el)`, `.setValue(el,n)`, `.setCurrency(el,code)`, `.parse(text, currency)`.
- Parse rule: if the text has a comma, the comma is the decimal separator and dots are dropped. If it has only dots, `^\d+\.\d{1,precision}$` is read as a decimal and anything else as thousands groups. Returns null if invalid.
- `currencyDigits(code)` is moved into `format.js`.
- `statusLabel(status)` lives in `format.js`. Map: pending→Pendiente, overdue→Vencido, partially_collected/partial→Parcial, collected→Cobrado, paid→Pagado, resolved→Resuelto, cancelled→Cancelado, expected→Esperado, confirmed→Confirmado, posted→Contabilizado, active→Activo, ended→Finalizado, draft→Borrador, expiring→Por vencer, scheduled→Programado, reversed→Anulado. Unknown values → "Sin estado" (raw English is never shown).
- `orderAccountsAsTree(accounts)` (in `format.js`) keeps top-level option labels unchanged and prefixes children with `↳ `.

## Data Flow

```
Avisos "Registrar cobro" -> showRentCollectionModal(asset, contract, occId, reload, {single:true})
  -> one occurrence (remaining prefilled), account, date, optional method, A/B (default from IVA)
  -> POST /collections -> tx(income, A+IVA) + collection + allocation
Transacciones "Eliminar" -> DELETE /transactions/:id -> reverseCollection -> occurrence pending
  -> visible again in Avisos
any write -> activity-log mw -> handler -> finish -> activityLogs.create(message)
```

## File Changes

| File | Action | Change |
|---|---|---|
| `public/js/components/moneyInput.js` | Create | `MoneyInput`; added to `index.html` (after `format.js`) and to the `sw.js` asset list |
| `public/js/utils/format.js` | Modify | `statusLabel`, `currencyDigits`, `orderAccountsAsTree` |
| `public/js/components/transactionForm.js` | Modify | Amount, A/B and record amount → MoneyInput; account tree |
| `public/js/pages/home.js`, `obligations.js`, `settings.js` | Modify | Money inputs (filters 1136/1148; 229/311/381; 394/477/478/496/528). Settings: sub-account UI |
| `public/js/pages/assets.js` | Modify | `statusLabel` at :64,364,424,680,691,721. Cadastral/date fields. No condition or rental block in the form. `readOnly` "Ver". Inline confirm on save. Holder blocks :403-421 removed. Declaration modal. Single-occurrence collection. "Anular cobro" |
| `public/js/pages/alerts.js` | Modify | Pass `{single:true}` |
| `public/js/pages/profile.js` | Modify | "LOGS" button in `showAccountActionsModal` → paginated list ("Cargar más"), formatted es-AR `dd/mm/aaaa hh:mm` in `pate_timezone` |
| `public/js/api.js` | Modify | `rentals.declarations.*`, `rentals.reverseCollection`, `activityLogs.list` |
| `src/middleware/activity-log.js`, `src/services/activity-log.js`, `src/routes/activity-logs.js` | Create | Capture, message table, read endpoint |
| `src/app.js` | Modify | Mount middleware + route; call `migrateEvolutivo3` |
| `src/services/rentals.js`, `src/routes/rentals.js` | Modify | Declarations, IVA gross-up, `activeContractsFor`, `reverseCollection`, single classification |
| `src/routes/transactions.js` | Modify | DELETE delegates; PUT message |
| `src/utils/income.js` | Modify | `ivaIncluded` |
| `src/routes/assets.js`, `src/services/asset-form.js` | Modify | `cadastralId`, `constructionDate`, `age`; `planRental` only when `rental` is present; `describe` → `declaration` |
| `src/routes/accounts.js`, `src/services/account-ledger.js`, `src/services/obligations.js`, `src/routes/finance.js` | Modify | `parentId` rules, ordering, ranking, tombstone filter |
| `src/services/migrations.js` | Modify | `migrateEvolutivo3` |
| `e2e/pages/TransactionForm.ts`, `AccountSettingsPage.ts` | Modify | `fillAmount` → `#transaction-amount`. Split inputs → `[data-money-input]`. IVA stays `type=number`. Transfer fills unchanged (ids kept; parse accepts "12.5") |

## Migration — `migrateEvolutivo3(db)`

Runs per user. It only fills fields that are `undefined`:
- `accounts.parentId=null`
- immovable `cadastralId=null`, `constructionDate=null`
- for each contract without `declarationId`: create one `rentalDeclarations` record (`assetId`, `tenantIds`, `notes:''`, `endedAt` = contract `endDate` if it is not active), then set `declarationId`, `modality` (`rental`→`locacion`, `usufruct`→`comodato`) and `ivaPercent=null`.

It returns `{updated}`. A second run returns 0. `activeContractFor` returns the declaration's first active contract in modality order (locación, comodato, mutuo) for `obligations.js:235`.

## Slices (auto-chain, each ≤ 800 changed lines)

| # | Slice | Est. lines | Content | sw |
|---|---|---|---|---|
| 1 | ui-localization-and-money-input | ~550 | statusLabel, MoneyInput, all money inputs, E2E page objects | v32 |
| 2 | rent-collection-corrections | ~500 | single mode, no reusable method, IVA classification (`ivaIncluded`), reverse + DELETE cascade, UI | v33 |
| 3 | asset-form-simplify | ~450 | cadastral, construction date/age, no condition/rental in form, "Ver", holder blocks removed, save confirm | v34 |
| 4 | rental-declaration-modal | ~750 | declarations API, per-modality contracts, IVA gross-up, edit/regeneration, migration (contracts) | v35 |
| 5 | audit-log | ~500 | middleware, table, endpoint, LOGS UI | v36 |
| 6 | sub-accounts | ~600 | parentId rules, ordering, tree selects, ranking, settings UI, migration (accounts) | v37 |

`migrateEvolutivo3` grows by slice (assets in 3, contracts in 4, accounts in 6). Slices 1 and 4 split into a/b if the forecast exceeds 800.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `MoneyInput.parse` ("211.392,00", "12.5", "1.234", JPY, negative); `statusLabel`; IVA gross-up and `ivaIncluded` IVA; activity message builder and label resolution; migration idempotency | Jest (`tests/ui` file-read contracts for frontend helpers via `vm`) |
| Integration | Collection classification A/B; reverse returns occurrence to pending, tx gone, replay 409, reconciled 409; DELETE tx cascade; declarations 1–3 modalities, IVA only locación, edit regenerates unpaid, 409 orphaning paid; legacy contract readable after migration; audit: writes logged incl. failures, no body keys, GET own-only, retention prune, logging error swallowed; sub-account create/validate/archive/delete, balances not rolled up | Supertest |
| Regression | `rentals`, `assets`, `alerts`, `finance`, `obligation-*`, `accounts` suites | `npm test`, coverage thresholds kept |
| E2E | Existing transaction/goal/account features through updated page objects; one new scenario: register income "211392" shows "211.392,00" | Cucumber/Playwright |

## Threat Matrix

N/A: no shell, subprocess, VCS/PR automation or executable-file boundary. Audit privacy is a design requirement: it logs no bodies, queries or credentials, and it is per-user.

## Open Questions

- [ ] Q3: confirm that IVA rent is reported as `A` with IVA included in the collected amount.
- [ ] Q4: should comodato/mutuo accept a zero amount? Assumed positive, as in current validation.
- [ ] `settings.js` is missing from the `sw.js` asset list. Slice 1 adds it (assumed harmless).

## Amendment 2026-11-10 — user answers (authoritative over earlier sections)

Source: `request.md` § "Answers to open questions". Implemented in slice **S4c** (sw v36; S5 → v37, S6 → v38).

### A/B classification (Q3 resolved)
- A = declared/invoiced income (only A carries IVA). B = cash, not invoiced, never IVA. Both count as income; reports keep the A/B split (`utils/income.js` breakdown already supports `A`, `B`, `Mixto` with `montoA`/`montoB`).
- Default per modality: **locación → A** (with the contract `ivaPercent` when set, amounts gross, `ivaIncluded:true`); **comodato and mutuo → B** (never IVA).
- A collection covering several modalities is ONE income transaction per currency: `clasificacion` = `A`, `B` or `Mixto` derived from the allocations (`montoA` = sum allocated to A lines, `montoB` = rest, `ivaPorcentaje` = locación IVA, `ivaIncluded:true`). The body may override per allocation with `allocations[i].clasificacion` ∈ {A,B}; IVA is dropped for lines overridden to B. `getIncomeIva` already applies `ivaIncluded` to `montoA`.

### Month-level rent period (Q4 resolved)
- A declaration month = all modality occurrences of the same declaration with the same due date. The month is **Cobrado** only when every modality occurrence is fully collected; otherwise Pendiente/Vencido/Parcial (statusLabel) at month level.
- Avisos: ONE "Alquiler pendiente de cobro" entry per declaration month, showing total and the parts (Locación/Comodato/Mutuo with remaining amounts). Legacy single-contract periods behave as a one-part month.
- "Registrar cobro" from Avisos (single mode): the selected month only, one line per modality with its remaining amount prefilled (MoneyInput, editable for partial) and its A/B select (default above; IVA shown only for A). Lines in different currencies are grouped per currency, each with its own account select (default primary of that currency) and posted as separate collections in one action; the dialog reports per-currency result.
- Ver historial / ficha mensual group occurrences by declaration month (month row with status + collapsed per-modality lines).

### Undo collection (Q10 resolved: "Deshacer")
- UI label "Deshacer cobro" (replaces "Anular cobro"); inline confirmation. Available on the month/occurrence rows, the "Cobros y saldos" list, and via deleting the transaction in Transacciones.
- Undo restores the state before the collection: transaction, allocations and collection removed (internal tombstone kept only for idempotency, hidden everywhere); receipts uploaded for that collection whose only target was the collection/transaction are deleted with their stored file; documents with other targets are only unlinked.
- The reconciled-account guard is REMOVED (undo always allowed; if the account was reconciled the reconciliation is invalidated: `reconciled:false` and the transaction id removed from `includedMovementIds`, the response returns `reconciliationReset:true` and the UI shows "La conciliación de la cuenta quedó pendiente de revisar").
- Still blocked (409 with a clear Spanish message naming the dependent movement) only when another movement depends on the transaction (refund, normalization, movement allocation): the user must undo that one first.
