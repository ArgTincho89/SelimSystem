# Apply progress: Evolutivo 6 (batch 1: W1, W2, W3)

Mode: Standard (strict_tdd off). Delivery: single PR with `size:exception`, one commit per work unit, branch `evolutivo-6`. Commits carry no Co-Authored-By or AI attribution. Nothing pushed, no deploy. `CACHE_NAME` is NOT bumped yet (W12).

## Status per unit

| Unit | Status | Commit | Tests |
|------|--------|--------|-------|
| W1 quick-fixes | done | d553c78 | `tests/ui/evolutivo6-quickfixes.test.js` 10 tests; `tests/ui` 50 suites green |
| W2 duplicate-guard | done | f7cbeba | `tests/ui/evolutivo6-guard.test.js` 17 tests; `tests/ui` 51 suites green |
| W3 reversals-with-note | done | 5966d62 | `tests/routes/evolutivo6-notes-reversal.test.js` 18 tests, `tests/ui/evolutivo6-undo-contract.test.js` 15 tests; full `npx jest`: 147 suites / 1243 tests green; `npx tsc --noEmit -p e2e` clean |

Tasks 1.1-3.7 are `[x]` in `tasks.md`.

## Work unit evidence

| Unit | Focused command | Rollback boundary |
|------|-----------------|-------------------|
| W1 | `npx jest --runTestsByPath tests/ui/evolutivo6-quickfixes.test.js` | `obligations.js`, `rentalModal.js`, `entities.js`, `pages.css` |
| W2 | `npx jest --runTestsByPath tests/ui/evolutivo6-guard.test.js` | `api.js`, `dom.js`, `modal.js`, `monthSelector.js`, `components.css` |
| W3 | `npx jest --runTestsByPath tests/routes/evolutivo6-notes-reversal.test.js tests/ui/evolutivo6-undo-contract.test.js` | obligation/rental routes+services, `reasons.js`, `undoDialog.js`, history/periods UI |

## Deviations and decisions

- **1.4 (principal actions)**: `settings.js` already hid "Hacer principal", archive and delete on the principal account on every surface (it is the only surface that renders them). No source change; a regression test pins it.
- **1.1 (no contract)**: when no contract can be determined the first tenant of the full list is still preselected (the task text says "preselect the first"), not left blank.
- **1.3**: `EntitiesPage.showForm` became `async` and always reloads categories itself; a load failure shows an inline `role="alert"` message, an empty list shows "Primero creá una categoría de gastos en Configuración → Categorías.". `renderPanel` no longer fails the whole panel when only the categories request fails.
- **W2 guard scope**: `guard()` only wraps `click`/`submit` handlers of `BUTTON`, `FORM` and `A` elements (never inputs, so checkboxes keep working) and only when the handler returns a thenable. `data-repeatable` (or the attribute on the form) opts out; the month navigation arrows use it. `Modal.open` calls `releaseGuards()`, so a handler that awaits a dialog never leaves its button locked. The API dedupe key is `method + url + JSON(body)`; `API.request` is now sync-returning and delegates to `API.send` (same behaviour, errors unchanged).
- **W3 shared module**: new `src/services/reasons.js` (`parseReason`, `REASON_ERROR`, 1-500 trimmed) is used by the three reversals. Validation order keeps existing precedence: resolve/pay notes are checked where the old optional-notes check was (after the other validations), void checks the 404 first, rent reverse validates the reason in the route before the service.
- **W3 DELETE /transactions/:id** on a rent-collection transaction is unchanged (no reason), as per the non-goal; `rentals.reverseCollection(db, userId, id, storage, reason = null)` therefore treats the reason as optional at service level.
- **W3 UI labels**: "Deshacer cobro" (periods tab), "Anular resolución" (obligations, periods) and "Revertir pago" (obligations screen, alerts, transaction detail) keep their labels, but all open `UndoDialog`. The history detail and the monthly sheet now show a single "Deshacer" (`data-history-action="undo"`) for paid, resolved and collected rows (`AssetHistory.undoButtons`). The inline "Confirmar y deshacer" step is gone.
- **W3 history**: obligation rows expose `voidedResolutions[{ voidedAt, voidReason }]`; the reversed-rent event row exposes `reversals[{ reason }]`. The detail shows "Motivo".
- **tests/helpers/fake-dom.js**: added a `lastChild` getter (needed by the async provider form).
- e2e: `paymentRevertSteps.ts` sends `notes`; `AssetsPage.ts` `undoCollectedMonth` and `revertPaymentFromHistory` fill "Motivo" and confirm with `[data-undo-confirm]` (history button selector is now `[data-history-action="undo"]`).

## Risks

- The global guard changes every async click/submit handler: a handler that returns a promise and is meant to be triggered twice in a row must carry `data-repeatable`. Only the month arrows were found; other repeatable async controls are not known.
- The activity-log entry for the three undo routes now ends with `, motivo: <reason>` (reason cut to 120 chars by the existing `activityNote` cap).
- e2e cannot be run locally; the page-object changes were reasoned and type-checked only.

# Apply progress: batch 2 (W4, W5, W6, W7, W8)

| Unit | Status | Commit | Tests |
|------|--------|--------|-------|
| W4 log-enrichment | done | be0b01a | `tests/routes/evolutivo6-log-meta.test.js` 7, `tests/services/activity-log.test.js` +7 (14 total); `activity-logs.test.js` updated (stored keys, collection message now ends with the amount) |
| W5 log-filters-and-undo | done | 7255561 | `tests/routes/evolutivo6-log-filters.test.js` 13, `tests/ui/evolutivo6-logs-contract.test.js` 7 |
| W6 principal-accounts | done | 7ebcc96 | `tests/routes/evolutivo6-accounts-principal.test.js` 9, `tests/ui/evolutivo6-accounts-principal-ui.test.js` 3 |
| W7 categories-in-settings | done | f88a91c | `tests/ui/evolutivo6-categories-contract.test.js` 7; `evolutivo2-s2` updated (six tabs); `e2e/pages/CategoriesPage.ts` navigates via Configuración |
| W8 iva-by-owner | done | c1ae2f6 | `tests/ui/evolutivo6-iva-contract.test.js` 8; `tests/ui` 56 suites green; `tsc --noEmit` in e2e clean |

Tasks 4.1-8.2 are `[x]` in `tasks.md`.

## Deviations and decisions (batch 2)

- **4.3 installment**: obligation occurrences carry no installment data (installments are a separate `creditCardInstallmentPlans` concept), so "cuota n/m" is never printed for obligations today. `describe` supports `facts.installment { number, total }` and `obligationMeta` forwards `occurrence.installment || obligation.installment` if it ever exists; covered by a unit test. Spec scenario reworded accordingly. Format is `..., con vencimiento dd/mm/yyyy, cuota 3/12`.
- **4.4 spec**: `tenantId` -> `tenantIds` (array) in `activity-log-enrichment/spec.md`; the query parameter stays `tenantId` (membership).
- **Meta derivation**: besides `res.locals.activityMeta`, the middleware derives `assetId`/`ownerIds`/`tenantIds`/`categoryId` from `entityType` (asset, category, obligation, contract, declaration, collection) before the handler (so deletes keep them) and after it for created entities. Meta and `undo` are stored on success only; failed rows carry empty values. Owners = active ownership rows today (or the account owner for asset-less obligations).
- **Rent collection message**: the create message now ends with `, por un monto de ARS 200.000` (spec asks for the amount); the undo message keeps its existing `importe ...` form. Amount format is es-AR via a local formatter (no ICU dependency).
- **Undo descriptors**: set on obligation payment, obligation resolution, single collection (`collectionId`) and "Cobrar mes" (group id). Reversal rows carry meta but no `undo`.
- **5.2 `undoable`**: always present (boolean) on every list item; false for failed, legacy and descriptor-less rows. Filters: blank values are ignored; non-string or >100 chars (including repeated/array params) -> 400 "Filtro inválido".
- **5.3 logs UI**: selectors are populated from assets, owners (role owner), tenants (role tenant) and categories; "Limpiar filtros" also clears search and dates; "Deshacer" button carries `data-log-action="undo"`.
- **6.2 accounts**: create with `primary:true` creates the account with `primary:false` then swaps with a single `db.replace`; on failure the new account is removed and 500 is returned. Uncheck without a valid `newPrimaryId` (exists, differs, active, not a sub-account, own user) -> 400 "Elegí una cuenta activa para que sea la nueva principal". No existing test pinned the old 409s.
- **7 categories**: `CategoriesPage.render()` delegates to `renderPanel`; in-panel refreshes use `reload(panel)`. `/categories` redirects with `Router.navigate('/settings?section=categories')` and `navAliases` highlights Configuración. No existing navbar layout test referenced Categorías; only `evolutivo2-s2` (tab list) changed. fake-dom lacks `classList.add`, so the panel test uses root categories only.
- **8 IVA**: `renderIvaChart` was removed (replaced by `renderIvaByOwner`); Home no longer fetches `API.trends.get` (it was only used for this section) and loads `API.owners.list()` instead. Holders present in `ivaByHolder` but not in the owners list are appended so no IVA is hidden. Rows keep the `account-alert-row` class so `SummaryPage.expectIvaMonthlyCounters` (e2e) still finds them.

## Risks (batch 2)

- Collection create/undo log messages changed (amount appended); any external consumer parsing them would need updating.
- e2e still not run locally (type-checked only); `CategoriesPage.navigate` now waits for the "Nueva" button inside Configuración.
- The `tenantIds` of a resolution entry is the chosen tenant, while other obligation entries use the contract tenants.
