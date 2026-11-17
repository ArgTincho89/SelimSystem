# Verify report: evolutivo-6

Verdict: PASS WITH WARNINGS

Method: static inspection of `git diff 448a0d3..HEAD` (src, public, tests, specs) plus 4 targeted jest files, run with `--runInBand --coverage=false`: `evolutivo6-asset-delete`, `evolutivo6-accounts-principal`, `evolutivo6-notes-reversal`, `evolutivo6-guard`. Result: 4 suites, 59 tests, all passing. The full suite and e2e were not run (a concurrent push is running them). The apply-progress reports the full suite green.

## Findings

### CRITICAL
None.

### WARNING
- W-1 `public/js/utils/dom.js` (`guardedHandler`): the "release on modal open" behaviour is order-dependent.
  - `release` is added to `activeGuards` only after `handler.call(...)` returns its promise.
  - An async handler that calls `Modal.open` before its first `await` runs `releaseGuards()` while its own guard is not registered yet. Its button then stays locked until the promise settles.
  - A handler that awaits a dialog could therefore leave the button locked.
  - Current handlers do not hit this: `showResolveModal` awaits `resolveTenants` first, and the guard test only covers the post-registration case (`tests/ui/evolutivo6-guard.test.js:183`).
  - Suggested fix: register the guard before calling the handler, or defer the registration.
- W-2 `public/js/pages/summary.js` (`renderIvaByOwner`): request 7.1 asks for the month in progress, but the section follows the selected `currentMonth`.
  - If the user navigates to another month, the section shows that month's IVA.
  - This is consistent with the design and with the `currentMonth` test, but it differs from the literal request.
- W-3 `src/routes/assets.js:376-390` (`DELETE_REFERENCES`): the reference list is an explicit allow-list of 10 collections.
  - A future collection with `assetId` will not block deletion.
  - Contract-linked rows (rentOccurrences, collections, conditions) are protected only indirectly, through `rentalContracts` and `rentalDeclarations`.
  - Acceptable today.
- W-4 `src/routes/assets.js` (`DELETE /:id`): there is no cross-collection transaction.
  - The three `db.replace` calls are made one after another, and rollback is best-effort.
  - It is tested for rollback, and the risk is low.
- W-5 e2e was not run locally. The page objects were type-checked only (per apply-progress).

### SUGGESTION
- S-1 The `.alert-critical` rule (`public/css/pages.css:2011`) could lose to a more specific `.rental-alert` colour rule. Confirm visually.
- S-2 "cuota n/m" is never printed for obligations. Obligation occurrences carry no installment data, and the spec was reworded in apply to reflect this. It is covered by a unit test of `describe`.
- S-3 The `tenantIds` stored for a resolution log entry is the chosen tenant, while other obligation entries use the contract tenants. Document this or unify it.
- S-4 Add a guard test for a handler that calls `Modal.open` synchronously (see W-1).

## Correctness checks (focus areas)
- **Asset delete:**
  - It returns 404 when the asset is missing and 409 with `references[]` per referencing collection.
  - It cascades `assetOwnerships` and `assetStatusHistory`.
  - It is user-scoped through `findAll(collection, userId)`.
  - The log route `asset.delete` is registered.
  - The UI has a danger ConfirmDialog and shows the 409 reason.
- **Principal account swap:**
  - Create with `primary:true` creates the account non-primary, then swaps with one `db.replace` (`src/routes/accounts.js:112-123`). On failure it removes the new account and returns 500.
  - Uncheck requires `newPrimaryId` that exists, differs from the account, is active, has no `parentId` and belongs to the user. Otherwise it returns 400.
  - The old 409 is replaced.
  - The UI hides "Hacer principal" on the principal account, shows a replacement select on uncheck, and disables the checkbox when no replacement is eligible.
- **Undo descriptors / undoable:**
  - Descriptors are set on payment, resolution, single collection and "Cobrar mes". They are stored on success only.
  - `undoable` is computed on read from live state (`isUndoable`). It is false for failed, legacy and reversed rows.
  - The logs UI shows "Deshacer" only when `undoable && undo`.
  - Reversal rows carry meta but no `undo`.
- **Duplicate guard:**
  - API dedupe is keyed by method + url + body, and GET is exempt.
  - The DOM guard locks the button while a promise is pending and restores it in `finally`. `data-repeatable` opts out.
  - See W-1 for the modal-release ordering gap.
- **Mandatory notes:**
  - On the server, resolve requires non-blank notes of at most 2000 characters (`src/services/obligations.js:521-522`). Pay requires non-blank notes of at most 1000 (`src/routes/obligations.js:265-266`), both with 400 "Las notas son obligatorias".
  - In the UI, both forms mark notes as required and block submit on blank (`public/js/pages/obligations.js:452-458`, `:570`, and the `validNotes` helper at `:666`).
  - The rent-collection `DELETE /transactions/:id` stays without a reason, as per the non-goal.
- **IVA rows:** one row per role-owner, 0 when absent, extra holders from `ivaByHolder` appended, `data-favorite-type="trend-iva"` kept. See W-2.

## Traceability

| Req | Implementation | Tests | Status |
|-----|----------------|-------|--------|
| 1.1 Tenant preselect | `obligations.js` `resolveTenants`/`showResolveModal` | `evolutivo6-quickfixes` | OK |
| 1.2 Mandatory notes | `routes/obligations.js:265`, `services/obligations.js:521`, UI `validNotes` | `evolutivo6-notes-reversal`, `undo-contract` | OK |
| 2.1 Log detail | `services/activity-log.js` `describe`/`obligationMeta` | `activity-log.test`, `evolutivo6-log-meta` | OK (S-2) |
| 2.2 Undo in log | `logs.js:65`, `isUndoable` | `evolutivo6-logs-contract`, `log-filters` | OK |
| 2.3 Log filters | `routes/activity-logs.js`, `list()`, `logs.js` panel | `evolutivo6-log-filters` | OK |
| 3.1 Undo in history | `assetHistory.js`, `undoDialog.js` | `evolutivo6-undo-contract` | OK |
| 3.2 Reversal with note | reasons.js, revert/void/reverse routes | `evolutivo6-notes-reversal` | OK |
| 4.1 Red alerts | `rentalModal.js:418`, `pages.css:2011` | `evolutivo6-quickfixes` | OK (S-1) |
| 4.2 Contract docs | `rentalModal.js:475-476` | `evolutivo6-contract-docs` | OK |
| 4.3 Remove "Registrar cobro" in Contratos | `cardActions(..., {collect:false})` | `evolutivo6-quickfixes` | OK |
| 4.4 Delete asset | `routes/assets.js` DELETE, `assets.js` UI | `evolutivo6-asset-delete` (+ui) | OK (W-3, W-4) |
| 4.5 Edit confirm | Validated and kept (proposal) | n/a | OK |
| 4.6 Custom kinds | `services/asset-kinds.js`, routes, form | `asset-kinds` (service + route) | OK |
| 5.1 Categories in Settings | `settings.js`, `categories.js renderPanel`, `app.js` | `evolutivo6-categories-contract` | OK |
| 5.2 Provider category dropdown | `entities.js showForm` | `evolutivo6-quickfixes` | OK |
| 5.3 Principal on create | `accounts.js:112` | `evolutivo6-accounts-principal` | OK |
| 5.4 Unmark principal / UI | `accounts.js:214`, `settings.js` | `accounts-principal` (+ui) | OK |
| 6.1 Double click | `api.js`, `dom.js`, `modal.js` | `evolutivo6-guard` | OK (W-1) |
| 7.1 IVA by owner | `summary.js renderIvaByOwner`, `home.js` | `evolutivo6-iva-contract` | OK (W-2) |
| Release 1.15.0 | `sw.js` v47, package, changelog | `evolutivo6-release-contract` | OK |

Task state: all tasks 1.1-12.3 are marked `[x]`. Apply-progress notes 12.7 as left to the orchestrator.
