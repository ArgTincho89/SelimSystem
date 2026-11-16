# Exploration: evolutivo-6

Source: `request.md`. All items map to existing code. Paths under `public/js/pages` unless noted.

## 1. Obligations
- **1.1 Tenant preselection (bug):** `ObligationsPage.showResolveModal` (`obligations.js:418-459`) lists all tenants (`:419`) and preselects `tenants[0]` (`:422`). Server (`src/services/obligations.js:502-509`) rejects a tenant not in `contract.tenantIds` when `obligation.rentalContractId` is set → wrong default fails with "El inquilino no pertenece al contrato". Fix: tenants from `obligation.rentalContractId`, fallback to asset's active contract (`src/services/rentals.js:169 activeContractFor`; client already calls `GET /rentals?assetId=` at `obligations.js:249-255`); restrict list and preselect first; full list only when no contract. No server change.
- **1.2 Mandatory notes:** notes optional in resolve modal (`obligations.js:439`) and pay modal ("Notas (opcional)", `:561`; server `routes/obligations.js:256-258`, `createResolution` `:518`). Default: mandatory for both, UI + server. Affects `tests/ui/evolutivo4-pay-contract.test.js`, `obligation-payment-*.test.js`, `obligation-resolutions.test.js`, e2e pay flows.

## 2. Logs
- `src/services/activity-log.js`: static `ROUTES` table; message `done + " de " + label` (label = `obligation.title`). Record: `{timestamp, method, route, action, entityType, entityId, entityLabel, outcome, statusCode, message}`. Bodies never read; `res.locals.activityNote` hook (payment revert, `routes/obligations.js:330`) capped at 120 chars in `src/middleware/activity-log.js`. `GET /activity-logs` filters only from/to/limit/before; `logs.js` searches client-side.
- **2.1 Rich messages:** add `res.locals.activityMeta` (asset name, amount, currency, due date/period). Tests: `tests/services/activity-log.test.js`, `tests/routes/activity-logs.test.js`, `tests/ui/evolutivo4-logs-contract.test.js`.
- **2.2 Deshacer per row:** undoable = `obligation.payment` (`POST .../payments/:txId/revert`; tx id not stored today), `obligation.resolve` (`DELETE .../resolution`), `rental.collection` (`POST /rentals/collections/:id/reverse`). Store `undo` metadata at write time; show button only when the entry succeeded and the target is still undoable. Reuse the section 3 flow.
- **2.3 Filters (bien, titular, inquilino, categoría):** persist `assetId`, `ownerIds`, `tenantId`, `categoryId` at write time (derived from obligation/transaction/collection/account/asset). Old records lack them (best-effort only). Query params on `activityLog.list` + filter panel in `logs.js`. Largest item.

## 3. Deshacer in asset history
- `src/services/asset-history.js:141-144` emits `pay|resolve|unresolve|revert`; `:207-208` `collect|undo-collect`. `AssetHistory.buildActions` (`assetHistory.js:195`) ignores `unresolve`.
- Existing: "Revertir pago" (`obligations.js:491`, optional reason, max 500 server `obligation-payment-reversal.js:62`); "Deshacer cobro" `RentalPeriods.undoCollections` (`rentalPeriods.js:265`, no note); "Anular resolución" not in history detail; `API.delete` sends no body (`api.js:24`).
- Plan: single "Deshacer" with required textarea (trimmed, ≤500) dispatching to the three endpoints; void-resolution and rent reverse accept and store a note; note shown in detail ("Motivo", `assetHistory.js:177`) and log. Tests: `obligation-payment-revert`, `rentals-reverse`, `rental-batch-collections`, `obligation-resolutions` routes; UI `evolutivo5-revert`, `evolutivo5-periods`, `evolutivo5-monthly-sheet`, `evolutivo3-s2`/`s4c`; `e2e/pages/AssetsPage.ts`.

## 4. Assets and rentals
- **4.1** `RentalModal.renderAlerts` (`rentalModal.js:415`): red + bold class for `rent_due` only.
- **4.2** Contratos cards (`renderContracts`, `rentalModal.js:439`) show no documents. Documents link by `contractId` (`routes/documents.js:85`); load via `API.documents.list('contract', id)`; "Ver documento" reuses blob viewer `AssetHistory.showReceipt` (`assetHistory.js:287`, iframe + zoom); "Descargar documento" `API.documents.contentUrl(id, true)`.
- **4.3** "Registrar cobro" in shared `cardActions` (`rentalModal.js:361-367`, used by Resumen `:354` and Contratos `:455`) → option to hide in Contratos.
- **4.4 Delete asset (new):** no `DELETE /assets/:id`; UI only "Editar" (`assets.js:70`, `:438`). Add DELETE guarded like `owners.js:113-121` (409 when referenced by transactions, obligations, rentals, documents), danger ConfirmDialog, log "Eliminaste el bien".
- **4.5 Edit confirmation:** by design (`assets.js:341-349`, `rentalDeclaration.js:147`, evolutivo-3; locked by `evolutivo3-s3-contract.test.js:66-68`, `evolutivo3-s4-contract.test.js:38`). Default: keep, no extension.
- **4.6 Custom asset types:** hardcoded in `PROPERTY_KINDS` (`routes/assets.js:46,76`), `propertyKindOptions()` (`assets.js:122-124`), `CONTRACT_TYPE_BY_KIND` (`asset-form.js:91`, fallback `residential`). Recommended per-user `assetKinds` collection + list/create endpoints + server validation + "Agregar tipo…" option.

## 5. Configuración
- **5.1** Add `['categories','Categorías']` to settings nav (`settings.js:48`) and whitelist (`:9`); refactor `CategoriesPage` to `renderPanel(panel)` like `EntitiesPage.renderPanel`; remove navbar item (`app.js:141`); `/categories` (`app.js:74`) redirects. Update UI/e2e navbar steps.
- **5.2 Provider category empty (inferred):** select from shared `EntitiesPage.categories` (`entities.js:91-94`) loaded only when `role==='provider'` (`entities.js:20`). Causes: zero categories (not seeded, field mandatory `entities.js:154`); form opened from Titular/Inquilino with "Proveedor" checkbox → `categories=[]`; concurrent `renderPanel` overwrite. Fix: fetch fresh in `showForm`, empty-state hint, optgroups. Tests `evolutivo2-s2-contract.test.js:26-27`, `evolutivo2-s8-contract.test.js:32`.
- **5.3 Principal not clickable on create (root cause):** `settings.js:380` disables it when an active primary exists; server 409 (`routes/accounts.js:104`). Edit swaps (`:197-201`). Fix: enable; create with `primary:true` promotes new, demotes old.
- **5.4 Cannot uncheck principal:** `settings.js:379` disables; server 409 (`accounts.js:202-204`). Invariant "exactly one principal" used by `transactions.js:169`, `account-ledger.js:145`, `obligations.js:574`, archive/delete (`accounts.js:216,234`). Default: allow unchecking by choosing replacement (`newPrimaryId`) in the same dialog; if no eligible account, keep checked with message.
- **5.5 "Hacer principal" on principal:** list already guards `!account.primary && account.activo` (`settings.js:117`); archive/delete hidden for principal (`:133`). Not reproduced → audit every account action surface and add regression test.

## 6. Double-click
- Ad hoc: few handlers disable submit (`obligations.js:572`); many don't (`entities.js:119`, `assets.js:310`, `settings.js:388`, ConfirmDialog, `runAction`, `undoCollections`). Server idempotency only for obligation payments and rent allocations.
- Recommended: (a) in-flight dedupe in `API.request` (`api.js:2`) for non-GET (same method+url+body → same promise); (b) `create({onClick})`/`on()` in `utils/dom.js` wrap promise-returning handlers: disable + `aria-busy` until settled; opt-out attribute for repeatable buttons (zoom, steppers). Tests with `tests/helpers/fake-dom.js`.

## 7. IVA mensual por titular
- `SummaryPage.renderIvaChart(trends)` (`summary.js:264-298`), mounted `home.js:104`, `:342`, 6-month `API.trends`. Keep title and `data-favorite-type="trend-iva"` (`home.js:420,492`, e2e `HomePage.ts:226`, `SummaryPage.ts:34`).
- `summary.ivaByHolder` (`routes/summary.js:212`) exists for the selected month (holders with income only) → merge with `API.owners.list()` role owner, 0 for the rest; name left, amount per currency right.

## Defaults adopted (auto mode)
1. Notes mandatory in resolve and pay, UI + server.
2. Unchecking principal requires choosing a replacement in the same dialog.
3. Asset hard delete only when unreferenced (409 otherwise, with reason).
4. Custom asset types: per-user `assetKinds` for immovables.
5. Edit confirmation kept as is.
6. IVA section uses the month shown by the Home navigator (defaults to current month).
7. Undoable from logs: obligation payment, obligation resolution, rent collection.
8. Resolver: list restricted to the contract's tenants, first preselected.
9. Red/bold only for `rent_due` alerts.
10. 5.5: audit all account surfaces; hide "Hacer principal" wherever the account is principal; regression test.

## Risks
- Logs metadata is the largest scope; old records stay unfilterable; message tests change.
- Server-side mandatory notes change API contracts across route tests and e2e.
- 5.4 touches the single-principal invariant.
- Removing the Categories navbar item breaks e2e navigation and mobile navbar layout.
- Global click guard may affect repeatable buttons → opt-out.
- Asset hard delete needs exhaustive reference checks.
- 5.2 root cause inferred, not reproduced.

## Suggested slicing (single PR, size:exception)
1. Quick fixes: 1.1, 1.2, 4.1, 4.3, 5.2, 5.3, 5.4, 5.5, 7.
2. Double-click guard: 6.
3. Reversals with mandatory note: 3 (reused by 2.2).
4. Logs: 2.1 + metadata, 2.3 filters, 2.2 undo.
5. Structural: 5.1, 4.4, 4.6, 4.2.
