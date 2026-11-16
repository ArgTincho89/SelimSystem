# Apply progress: Evolutivo 5 (batch 1 of 2: W1-W6 done; W7-W12 pending)

Mode: Standard (strict_tdd off). Delivery: single PR with `size:exception`, one commit per work unit, branch `evolutivo-5`. Commits carry no Co-Authored-By or AI attribution. Nothing pushed, no deploy, `CACHE_NAME` untouched (W12 bumps it once to v42).

## Status per unit

| Unit | Status | Commit | Full suite after the unit |
|------|--------|--------|---------------------------|
| W1 asset-history | done | c04122d | 116 suites / 960 tests |
| W2 ficha-redesign | done | 4ccb9d1 | 118 suites / 975 tests |
| W3 rental-modal-shell | done | ddcccf6 | 121 suites / 1003 tests |
| W4 periods-tab | done | e5d9b46 | 123 suites / 1026 tests |
| W5 contracts-and-lifecycle | done | c2d6f39 | 126 suites / 1052 tests |
| W6 rental-deletion-history | done | `git log --grep "delete rental and rental history"` (the amend changes its SHA) | 128 suites / 1072 tests |

All tasks 1.1-6.3 are `[x]` in `tasks.md`. W7-W12 are untouched.

## Work Unit Evidence

| Unit | Focused test command and result | Runtime harness | Rollback boundary |
|------|---------------------------------|-----------------|-------------------|
| W1 | `npx jest --runTestsByPath tests/services/asset-history.test.js tests/routes/assets-history.test.js tests/ui/evolutivo5-history-contract.test.js` green (4 + 10 + 7 tests) | Supertest `GET /api/assets/:id/history` (month, all, from/to, 400/404/401, no writes) | `asset-history.js`, `assetHistory.js`, route, `reversedOccurrenceIds` additive field |
| W2 | `... tests/ui/evolutivo5-ficha-contract.test.js tests/routes/assets-active-declaration.test.js` green | Supertest `GET /api/assets` and `/api/assets/:id` (`activeDeclarationId`) | `assets.js` ficha edits, `routes/assets.js` |
| W3 | `... tests/services/rental-periods.test.js tests/routes/rental-overview.test.js tests/ui/evolutivo5-modal-tabs-contract.test.js` green (14 + 14) | Supertest overview/`GET declarations/:id` | `rental-periods.js`, `rentalModal.js`, `tabs.js`, `modal.js` panel layout |
| W4 | `... tests/routes/rental-periods.test.js tests/ui/evolutivo5-periods-contract.test.js` green (8 + 16) | Supertest periods | `rentalPeriods.js`, `dataTable.js`, `confirmDialog.js`, collection delegates in `assets.js` |
| W5 | `... tests/routes/rental-condition-preview.test.js tests/routes/rental-modality-end.test.js tests/ui/evolutivo5-contracts-contract.test.js` green (7 + 9 + 10) | Supertest preview/end/end-preview, rollback via spy | `rentals.js` (`planCondition`), `rental-declarations.js` (`endModality`), `rentalModal.js` |
| W6 | `... tests/routes/rental-declaration-delete.test.js tests/ui/evolutivo5-rental-history-contract.test.js` green (9 + 11) | Supertest delete cascade, atomic rollback, summary list, safe edit | `remove`/`summary`/`purge` in `rental-declarations.js`, `RentalModal.showHistory/deleteRental` |

E2E: `npx tsc --noEmit -p e2e` is clean. The e2e scenarios were updated but NOT run (no Playwright run in this environment).

## What exists now (names batch 2 must reuse)

Backend
- `src/services/asset-history.js`: `build`, `resolveRange`, `makeContext(db,userId)`, `buildObligationRows(ctx, obligation, {fromDate,toDate})`, `noteView`, `documentView`. Rows carry `actions` (`pay|resolve|unresolve|collect|undo-collect`) and `reversals[]`.
- `src/services/rental-periods.js`: `overview`, `periods`, `rentPeriods`, `modalityCards`, `headerStatus`, `resolvePeriodRange`. `overview.management` = `declarations.summary` (editable/deletable/impact).
- `src/services/rental-declarations.js`: `summary`, `remove`, `endModality`, `endPreview`; `update` now rewrites a historical rental only when `summary.editable` (else 409). `withRollback(db,userId,work,extra=[])` accepts extra collections.
- `src/services/rentals.js`: `planCondition`, `previewCondition`, `applyCondition` (skips collected periods). `validateAllocations` rejects collecting a fully collected period ("No se puede registrar un cobro porque el período ya está cobrado.").
- Routes: `GET /assets/:id/history`, `GET /rentals/declarations/:id`, `.../overview`, `.../periods`, `.../end-preview`, `.../modalities/:cid/end-preview`, `POST .../modalities/:cid/end`, `DELETE /rentals/declarations/:id`, `GET /rentals/declarations?summary=1`, `GET /rentals/:id/conditions/preview`. Unlogged GETs. `ROUTES` added: `rental.contract-end`, `rental.declaration-delete`.
- New data (additive): `rentCollections.reversedOccurrenceIds` (set when a collection is reversed), tombstone collection `rentalDeletions`.

Frontend
- `components/`: `tabs.js` (`Tabs.create`), `dataTable.js` (`DataTable.create`, `rowDataset`, `expand`), `confirmDialog.js` (`ConfirmDialog.open({title,message,confirmLabel,danger,details,reasonField}) -> {confirmed, reason}`; created in W4 with the full W10 interface, so W10 only needs to use it), `modal.js` panel layout (`layout:'panel'`, `header`, `fullscreenOnMobile`).
- `pages/`: `assetHistory.js` (`AssetHistory.open/showReceipt/payObligation/resolveObligation/attachReceipt/actionProviders`), `rentalModal.js` (`RentalModal.open/showHistory/deleteRental/openCondition/finishRental/finishContract/endDialog`), `rentalPeriods.js` (`RentalPeriods.render/collectMonth/collectContract/undoCollections/showCollectionView/applyFilters`).
- `AssetsPage.showRentMonthModal/showRentCollectionModal/showCollectionView/undoCollections/showRentalHistory/showHistory` are thin delegates (alerts.js and home.js still call them).
- `format.js` `statusBadge(state)` returns `{label, icon, className}`.
- Test helper: `tests/helpers/fake-dom.js` (`loadBrowser(files, names, globals)` runs browser scripts in a vm with a fake DOM; note `showToast` from `dom.js` overrides an injected stub, read the toast from `document.body`).
- Scripts registered in `public/index.html` and `public/sw.js` `STATIC_ASSETS`: assetHistory, tabs, dataTable, confirmDialog, rentalPeriods, rentalModal. Still to register in W11: `feedback.js`.

## Deviations from design.md (all non-blocking, recorded for the verify phase)

1. `GET /rentals/declarations/:id` did NOT exist (the design assumed it). It was added in W3 and returns `declarations.view` (persisting the next 12 months, like the list).
2. W3 task 3.3 said `showRentMonthModal` becomes a thin delegate in W3. The collection dialog stayed in `assets.js` for W3 (the move is W4's job) and became a delegate in W4. Between W3 and W4 the Períodos tab temporarily hosted the legacy per-asset rentals section (replaced in W4).
3. `ConfirmDialog` was created in W4 (first need: "Cancelar período" and "Anular resolución"), not W10. It already supports `details` and `reasonField`.
4. History rows of kind `event` and `adjustment` have `state: null` (the status vocabulary applies to obligations, rent, reversals). The reversal event of a collection is dated when it was reversed (today), not at the period it reopened. Old reversed collections (before this change) have no `reversedOccurrenceIds`, so they do not appear as history events.
5. The periods `Total` column adds the expected rent and the obligations of the month per currency (as in the request's example row), without conversion.
6. `previousAmount`/`newAmount` of the adjustment preview include IVA (the amount the tenant pays), plus `ivaPercent`.
7. The Períodos tab rows use `data-rent-month` (kept for the e2e). Months whose modalities fall due on different days are still one row; its `monthKey` is the first due date's key.
8. Historical rental edit: `PUT /rentals/declarations/:id` on a rental with no active modality is allowed only when `summary.editable` (no live or reversed collections, documents, notes or linked obligations); it purges the old contracts/occurrences/conditions and recreates them, saving contracts whose end date is already past as `ended`. Notes also block editing (stricter than the spec's "collections, documents and linked obligations").
9. Alerts and the "Ver alquiler" modal in `readOnly` mode (finished rentals) hide the update and finish actions and show edit/delete only when allowed.
10. Cancel-period message changed to "No se puede cancelar este período porque tiene cobros registrados." (was "Un período con cobros no se puede cancelar").
11. The optional "Historial" tab of the rental modal was not implemented (spec says optional); the status history stays in the ficha.

## Contracts batch 2 must honor (decided here)

- Payment reversal tombstone collection `obligationPaymentReversals` is already READ by the history and periods builders. Required shape: `{ obligationId, occurrenceId, reversedAt (ISO), reason, snapshot: { date (YYYY-MM-DD), amount (major units), currencyCode, ... } }`. Rows then show `reversals[]` under the occurrence and a `kind: 'reversal'`, `state: 'reverted'` row dated `snapshot.date` (falls back to `reversedAt`). If W10 uses other field names, update `reversalRows`/`buildObligationRows` in `asset-history.js`.
- Documents: the rental delete cascade already treats `declarationId` as a rental target (rental-only documents with only `contractId`/`rentOccurrenceId`/`declarationId` are removed, others detached) and notes of target type `declaration`, `contract` and `rentOccurrence` are removed. W7 only has to add the `declarationId` document target and the `declaration` note target.
- History/periods `actions` for obligations do not include `revert` yet; W10 should append it (and reuse `AssetHistory.actionProviders` for the history detail).
- Alerts page keeps calling `AssetsPage.showRentMonthModal(...)` (delegate).

## Issues found

- OneDrive crawler check passed (`jest --listTests` equals the tracked test file count), no placeholder rewrite was needed.
- The shell tool truncates very long heredocs; large files were written with the Write tool or via scratch scripts.
- `git` shows CRLF warnings (autocrlf); the index stays LF.

## Remaining (batch 2)

- [ ] W7 documents-and-notes, W8 monthly-sheet, W9 alerts-responsibility, W10 payment-reversal, W11 feedback-and-a11y, W12 release.
