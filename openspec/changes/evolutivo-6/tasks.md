# Tasks: Evolutivo 6

Conventions: `strict_tdd: false`, but every task ships its tests in the same commit (Jest + Supertest under `tests/routes`, `tests/services`, `tests/ui`). Prefer NEW test files (`tests/**/evolutivo6-*.test.js`; temp db is shared per file). Names, endpoints, fields and collections follow `design.md` (authoritative). New fields are additive. Each unit that creates a client script registers it in `public/index.html` and `public/sw.js` `STATIC_ASSETS`; `CACHE_NAME` is bumped once, in W12. Each new write route gets a `ROUTES` entry in `src/middleware/activity-log.js` plus a log-action test. Existing tests that break because of a unit's change are updated in that same unit. Delivery: branch `evolutivo-6`, one conventional commit per unit (no AI attribution), single PR to `master`. No migration, no deploy.

Non-goal: `DELETE /transactions/:id` on a rent-collection transaction stays unchanged (no note required).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~5,000-6,500 (code + tests + docs) |
| 400-line budget risk | High |
| Chained PRs recommended | No (single PR requested) |
| Suggested split | Single PR, one commit per work unit |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Review budget is 800 lines (`review_budget_lines`); `size:exception` is recorded and accepted. Mitigation: commit-by-commit review.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| W1 | Quick UI fixes (1.1, 4.1, 4.3, 5.2, 5.5) | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo6-quickfixes.test.js` | fake-dom contract | `obligations.js`, `rentalModal.js`, `entities.js`, `settings.js` edits |
| W2 | Duplicate-action guard (6.1) | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo6-guard.test.js` | fake-dom: double click/submit | `api.js`, `dom.js`, CSS |
| W3 | Mandatory notes + reversals with reason + UndoDialog (1.2, 3.1, 3.2) | PR 1 | `npx jest --runTestsByPath tests/routes/evolutivo6-notes-reversal.test.js tests/ui/evolutivo6-undo-contract.test.js` | Supertest pay/resolve/revert/reverse | obligations/rentals routes+services, `undoDialog.js` |
| W4 | Log enrichment metadata (2.1) | PR 1 | `npx jest --runTestsByPath tests/services/activity-log.test.js tests/routes/evolutivo6-log-meta.test.js` | Supertest write then `GET /activity-logs` | `activity-log.js` service/middleware |
| W5 | Log filters + undo from logs (2.2, 2.3) | PR 1 | `npx jest --runTestsByPath tests/routes/evolutivo6-log-filters.test.js tests/ui/evolutivo6-logs-contract.test.js` | Supertest filters, `undoable` | `activity-logs.js` route, `logs.js` |
| W6 | Principal account management (5.3, 5.4) | PR 1 | `npx jest --runTestsByPath tests/routes/evolutivo6-accounts-principal.test.js` | Supertest create/edit principal | `accounts.js`, `settings.js` |
| W7 | Categorías in Configuración (5.1) | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo6-categories-contract.test.js` | fake-dom nav/redirect | `categories.js`, `settings.js`, `app.js` |
| W8 | IVA mensual por titular (7.1) | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo6-iva-contract.test.js` | fake-dom with `ivaByHolder` | `summary.js`, `home.js` |
| W9 | Custom asset kinds (4.6) | PR 1 | `npx jest --runTestsByPath tests/services/asset-kinds.test.js tests/routes/evolutivo6-asset-kinds.test.js` | Supertest kinds + asset create | `asset-kinds` service/route, `assets.js` validation, form |
| W10 | Asset deletion (4.4) | PR 1 | `npx jest --runTestsByPath tests/routes/evolutivo6-asset-delete.test.js` | Supertest 409 per collection | `DELETE /assets/:id`, ficha/form buttons |
| W11 | Contract documents view/download (4.2) | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo6-contract-docs.test.js` | fake-dom Contratos tab | `rentalModal.js` |
| W12 | Release v1.15.0 | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo6-release-contract.test.js` | full suite + `npx tsc --noEmit -p e2e` | version, sw, docs, e2e |

## W1: quick-fixes (commit: `feat(ui): quick fixes for resolve tenants, rent alerts and provider form`)

- [x] 1.1 `public/js/pages/obligations.js` `showResolveModal`: tenants from `obligation.rentalContractId`, then asset active contract (`GET /rentals?assetId=`), then all tenants; preselect the first.
- [x] 1.2 `public/js/pages/rentalModal.js`: `rent_due` alerts get `alert-critical`; `cardActions(contract, { collect:false })` in Contratos (Registrar cobro stays in Resumen). CSS `.alert-critical` (red, bold).
- [x] 1.3 `public/js/pages/entities.js` `showForm`: always fetch `API.categories.list()` (expense); empty hint "Primero creá una categoría de gastos".
- [x] 1.4 `public/js/pages/settings.js`: hide "Hacer principal" when the account is principal; audit archive/delete on every account action surface.
- [x] 1.5 Tests: new `tests/ui/evolutivo6-quickfixes.test.js` (preselection, contract-only tenants, class, no collect in Contratos, hint, regression for principal); update `evolutivo3-s4`/`s4c` if affected.

## W2: duplicate-guard (commit: `feat(ui): global guard against double clicks and duplicate writes`)

- [x] 2.1 RED `tests/ui/evolutivo6-guard.test.js`: same/different body dedupe, GET not deduped, new request after settle, busy button, reject restores `disabled`, `data-repeatable` opt-out.
- [x] 2.2 `public/js/api.js`: `inflight` Map for non-GET keyed by `method+url+JSON(body)`; `delete(url, body)`.
- [x] 2.3 `public/js/utils/dom.js`: `guard(el, event, handler)` for `create()` `on*` and `on()` (click/submit): busy state, `aria-busy`, restore in `finally`.
- [x] 2.4 CSS `[aria-busy]` styles. Fix any existing UI test broken by the guard.

## W3: reversals-with-note (commit: `feat(obligations): mandatory notes and reasoned undo`)

- [x] 3.1 RED `tests/routes/evolutivo6-notes-reversal.test.js`: 400 "Las notas son obligatorias" on resolve (<=2000) and pay (<=1000); `DELETE .../resolution` `{reason}` 1-500 -> `voidReason`; revert reason required; `POST /rentals/collections/:id/reverse` `{reason}` -> `reversalReason` (collection and group); 409 on replays.
- [x] 3.2 `src/routes/obligations.js`, `src/services/obligations.js`, `src/services/obligation-payment-reversal.js`: validations and persistence of reasons.
- [x] 3.3 `src/routes/rentals.js`, `src/services/rentals.js`, `src/services/rent-collections.js`: `reverseCollection`/`reverseGroup` take `reason`.
- [x] 3.4 `src/services/asset-history.js`: expose `voidReason`/`reversalReason`.
- [x] 3.5 Create `public/js/components/undoDialog.js` (`UndoDialog.open(descriptor, { onDone })`, required Motivo 1-500, dispatch to 3 endpoints); register in `index.html`/`sw.js`.
- [x] 3.6 `assetHistory.js` single "Deshacer" for `revert`/`unresolve`/`undo-collect`, "Motivo" in detail; `obligations.js` `revertPayment` and required notes in resolve/pay; `rentalPeriods.js` `undoCollections` use `UndoDialog`.
- [x] 3.7 Tests: new `tests/ui/evolutivo6-undo-contract.test.js` (empty note blocks confirm). Update payloads in `evolutivo4-pay-contract`, `obligation-payment-*`, `obligation-resolutions`, `rentals-reverse`, `rental-batch-collections`, `evolutivo5-revert`, `evolutivo5-periods`, `evolutivo5-monthly-sheet`, `evolutivo3-s2`/`s4c`.

## W4: log-enrichment (commit: `feat(logs): descriptive messages and structured metadata`)

- [x] 4.1 RED `tests/services/activity-log.test.js` (extend) + `tests/routes/evolutivo6-log-meta.test.js`: `describe` fragments, missing facts dropped, "cuota n/m" only with installment data, 300-char cap, `assetId`/`ownerIds`/`tenantIds`/`categoryId`/`undo` stored on success only.
- [x] 4.2 `src/middleware/activity-log.js`: merge `res.locals.activityMeta` on success; derive asset/category/tenants from `entityType`; never read bodies.
- [x] 4.3 `src/services/activity-log.js`: new fields, `describe(route, facts)`; routes in W3 files set `activityMeta` (facts, `undo` descriptors). Verify installment fields during apply.
- [x] 4.4 Spec alignment: edit `openspec/changes/evolutivo-6/specs/activity-log-enrichment/spec.md` wording `tenantId` -> `tenantIds[]` (record stores array; query param stays `tenantId`, membership match).
- [x] 4.5 Update `evolutivo4-logs-contract`.

## W5: log-filters-and-undo (commit: `feat(logs): filters panel and undo from logs`)

- [x] 5.1 RED `tests/routes/evolutivo6-log-filters.test.js`: `assetId`/`ownerId`/`tenantId`/`categoryId` AND semantics, filter before pagination, legacy rows excluded, no filters unchanged, 400 "Filtro inválido", `undoable` for payment/resolution/collection.
- [x] 5.2 `src/routes/activity-logs.js`, `src/services/activity-log.js`: filters and computed `undoable`; `API.activityLogs.list` params.
- [x] 5.3 `public/js/pages/logs.js`: filter panel (Bien, Titular, Inquilino, Categoría, "Limpiar filtros"), empty state, "Deshacer" via `UndoDialog` when `undoable`.
- [x] 5.4 Test `tests/ui/evolutivo6-logs-contract.test.js`.

## W6: principal-accounts (commit: `feat(accounts): set and change the principal account`)

- [x] 6.1 RED `tests/routes/evolutivo6-accounts-principal.test.js`: create with `primary:true` swaps (exactly one principal), sub-account 400, uncheck needs valid `newPrimaryId` (exists, differs, `activo`, no `parentId`) else 400, rollback on failure.
- [x] 6.2 `src/routes/accounts.js`: swap via single `db.replace`; replace the 409 at `:203` with 400.
- [x] 6.3 `public/js/pages/settings.js`: principal checkbox on create; "Nueva cuenta principal" select on uncheck; disabled with hint when no eligible account. Update `accounts` tests (409 -> swap/400).

## W7: categories-in-settings (commit: `feat(settings): move categories into Configuración`)

- [x] 7.1 RED `tests/ui/evolutivo6-categories-contract.test.js`: section `categories` in Settings, navbar item gone, `/categories` redirects to `/settings?section=categories`.
- [x] 7.2 `categories.js` `renderPanel(panel)`; `settings.js` whitelist (`:9`) and nav (`:48`); `app.js` remove navbar item (`:141`), redirect route (`:74`).
- [x] 7.3 Update `evolutivo2-s2`/`s8`; e2e navigation to Categorías via Configuración.

## W8: iva-by-owner (commit: `feat(home): IVA by owner for the selected month`)

- [x] 8.1 RED `tests/ui/evolutivo6-iva-contract.test.js`: rows for every role owner, 0 when absent, follows `currentMonth`, `data-favorite-type="trend-iva"` kept.
- [x] 8.2 `summary.js` `renderIvaByOwner(summary, owners)` over `ivaByHolder`; `home.js` replaces `renderIvaChart` calls (`:104,:342`) and loads `API.owners.list()`. Update IVA chart tests.

## W9: asset-kinds (commit: `feat(assets): user-defined asset kinds`)

- [ ] 9.1 RED `tests/services/asset-kinds.test.js` + `tests/routes/evolutivo6-asset-kinds.test.js`: create/list, 400 blank/>50, 409 "Ese tipo ya existe" (case/accent-insensitive vs built-ins), user isolation, log `asset-kind.create`, asset accepts custom key, 400 "El tipo de inmueble no es válido".
- [ ] 9.2 Create `src/services/asset-kinds.js`, `src/routes/asset-kinds.js`; mount `/api/asset-kinds` in `src/app.js`; `ROUTES` entry; validation in `src/routes/assets.js:76`.
- [ ] 9.3 `api.js` `assetKinds.{list,create}`; `asset-form.js`/`assets.js` `propertyKindOptions()` merges kinds plus "Agregar tipo…".

## W10: asset-delete (commit: `feat(assets): delete unreferenced assets`)

- [ ] 10.1 RED `tests/routes/evolutivo6-asset-delete.test.js`: 200, one 409 per referencing collection (10 in design) with `references`, 404, cascade of `assetOwnerships`/`assetStatusHistory`, atomic rollback, log `asset.delete`.
- [ ] 10.2 `src/routes/assets.js` `DELETE /:id`; `ROUTES` `asset.delete`; `api.js` `assets.delete`.
- [ ] 10.3 "Eliminar" (danger `ConfirmDialog`) in `assets.js` ficha and `asset-form.js`; 409 reason shown in the dialog; UI test.

## W11: contract-documents (commit: `feat(rentals): view and download contract documents`)

- [ ] 11.1 RED `tests/ui/evolutivo6-contract-docs.test.js`: with a document -> "Ver documento"/"Descargar documento"; without -> none.
- [ ] 11.2 `rentalModal.js`: `API.documents.list('contract', id)`; viewer reuses `AssetHistory.showReceipt`; download `contentUrl(id,true)`.

## W12: release (commit: `chore(release): evolutivo-6 version 1.15.0, changelog and cache bump`)

- [ ] 12.1 `public/sw.js` `CACHE_NAME` -> `selimsystem-v47`; verify `undoDialog.js` in `index.html` and `STATIC_ASSETS`.
- [ ] 12.2 Relax `tests/ui/evolutivo5-release-contract.test.js`; add `tests/ui/evolutivo6-release-contract.test.js` (v47, 1.15.0).
- [ ] 12.3 `package.json`/`package-lock.json` -> `1.15.0`; `CHANGELOG.md` `## [1.15.0]` (Spanish).
- [ ] 12.4 Update `Documento funcional.md` (Spanish): notes, undo, logs, accounts, categories, IVA, kinds, delete.
- [ ] 12.5 e2e: pay/resolve fill notes; history "Deshacer" with reason (`e2e/pages/AssetsPage.ts`); Categorías via Configuración; check `HomePage.ts`/`SummaryPage.ts`.
- [ ] 12.6 Full suite: `npx jest --forceExit --runTestsByPath $(git ls-files 'tests/*.test.js' 'tests/**/*.test.js')` plus untracked new tests; `npx tsc --noEmit -p e2e`.
- [ ] 12.7 Orchestrator: push `evolutivo-6`, open PR to `master` with the `size:exception` note. No deploy.
