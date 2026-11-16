# Apply progress: Evolutivo 5 (batch 1 W1-W6 and batch 2 W7-W12 done; only the orchestrator push/PR task 12.7 remains)

Mode: Standard (strict_tdd off). Delivery: single PR with `size:exception`, one commit per work unit, branch `evolutivo-5`. Commits carry no Co-Authored-By or AI attribution. Nothing pushed, no deploy. `CACHE_NAME` bumped once, in W12 (v42).

## Status per unit

| Unit | Status | Commit | Full suite after the unit |
|------|--------|--------|---------------------------|
| W1 asset-history | done | c04122d | 116 suites / 960 tests |
| W2 ficha-redesign | done | 4ccb9d1 | 118 suites / 975 tests |
| W3 rental-modal-shell | done | ddcccf6 | 121 suites / 1003 tests |
| W4 periods-tab | done | e5d9b46 | 123 suites / 1026 tests |
| W5 contracts-and-lifecycle | done | c2d6f39 | 126 suites / 1052 tests |
| W6 rental-deletion-history | done | `git log --grep "delete rental and rental history"` (the amend changes its SHA) | 128 suites / 1072 tests |
| W7 documents-and-notes | done | 0551c2e | 131 suites / 1094 tests |
| W8 monthly-sheet | done | b44e2b1 | tests/ui 41 suites / 303 tests (frontend-only unit; backend untouched since W7) |
| W9 alerts-responsibility | done | c416be9 | 134 suites / 1117 tests |
| W10 payment-reversal | done | 5a06acd | 137 suites / 1146 tests |
| W11 feedback-and-a11y | done | 651ac85 | tests/ui 44 suites / 330 tests (frontend-only unit; backend untouched since W10) |
| W12 release | done | see `git log` (`chore(release): evolutivo-5 version 1.13.0 ...`) | 139 suites / 1162 tests, `tsc --noEmit` in `e2e/` clean |

All tasks 1.1-12.6 are `[x]` in `tasks.md`. Task 12.7 (push and PR) is intentionally left unchecked for the orchestrator.

## Work Unit Evidence

| Unit | Focused test command and result | Runtime harness | Rollback boundary |
|------|---------------------------------|-----------------|-------------------|
| W1 | `npx jest --runTestsByPath tests/services/asset-history.test.js tests/routes/assets-history.test.js tests/ui/evolutivo5-history-contract.test.js` green (4 + 10 + 7 tests) | Supertest `GET /api/assets/:id/history` (month, all, from/to, 400/404/401, no writes) | `asset-history.js`, `assetHistory.js`, route, `reversedOccurrenceIds` additive field |
| W2 | `... tests/ui/evolutivo5-ficha-contract.test.js tests/routes/assets-active-declaration.test.js` green | Supertest `GET /api/assets` and `/api/assets/:id` (`activeDeclarationId`) | `assets.js` ficha edits, `routes/assets.js` |
| W3 | `... tests/services/rental-periods.test.js tests/routes/rental-overview.test.js tests/ui/evolutivo5-modal-tabs-contract.test.js` green (14 + 14) | Supertest overview/`GET declarations/:id` | `rental-periods.js`, `rentalModal.js`, `tabs.js`, `modal.js` panel layout |
| W4 | `... tests/routes/rental-periods.test.js tests/ui/evolutivo5-periods-contract.test.js` green (8 + 16) | Supertest periods | `rentalPeriods.js`, `dataTable.js`, `confirmDialog.js`, collection delegates in `assets.js` |
| W5 | `... tests/routes/rental-condition-preview.test.js tests/routes/rental-modality-end.test.js tests/ui/evolutivo5-contracts-contract.test.js` green (7 + 9 + 10) | Supertest preview/end/end-preview, rollback via spy | `rentals.js` (`planCondition`), `rental-declarations.js` (`endModality`), `rentalModal.js` |
| W6 | `... tests/routes/rental-declaration-delete.test.js tests/ui/evolutivo5-rental-history-contract.test.js` green (9 + 11) | Supertest delete cascade, atomic rollback, summary list, safe edit | `remove`/`summary`/`purge` in `rental-declarations.js`, `RentalModal.showHistory/deleteRental` |
| W7 | `npx jest --runTestsByPath tests/routes/documents-declaration.test.js tests/routes/notes-crud.test.js tests/ui/evolutivo5-docs-notes-contract.test.js` green (6 + 6 + 10) | Supertest upload/list/delete (file removed through the storage), notes CRUD, rental aggregation | `documents.js`, `wealth-notes.js`, `wealth-records.js`, Documentos/Notas tabs of `rentalModal.js` |
| W8 | `... tests/ui/evolutivo5-monthly-sheet-contract.test.js tests/ui/evolutivo-s7-contract.test.js` green (10 + 3) | vm run of `MonthlySheet.open` with the history API stubbed (range, filters, totals, actions) | `MonthlySheet` in `rentalPeriods.js`, `renderMonthlyView` in `assets.js` |
| W9 | `... tests/routes/alerts-responsibility.test.js tests/ui/evolutivo5-alerts-contract.test.js tests/routes/alerts.test.js` green (6 + 7 + 12) | Supertest `GET /alerts?responsibility=` (classification, filter, 400) | `alerts.js` service/route/page, `pages.css` block |
| W10 | `... tests/services/movement-dependents.test.js tests/routes/obligation-payment-revert.test.js tests/ui/evolutivo5-revert-contract.test.js` green (5 + 15 + 9) | Supertest revert (balance, month summary, alerts, dependents, replay, reconciliation, atomic rollback, history); e2e feature written, not run | `obligation-payment-reversal.js`, `movement-dependents.js`, revert routes in `obligations.js`, entry points in five pages |
| W11 | `... tests/ui/evolutivo5-feedback-contract.test.js` green (11) | N/A: UI source/vm contract (no runtime boundary) | `feedback.js`, CSS block in `components.css`, ConfirmDialog adoption in `obligations.js`/`transactionForm.js` |
| W12 | `... tests/ui/evolutivo5-release-contract.test.js` green (5) | Full suite (139 suites / 1162 tests) and `tsc --noEmit` of `e2e` | version, `sw.js` v42, `CHANGELOG.md`, `Documento funcional.md` |

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

### Batch 2 deviations

12. `ROUTES` for the activity log are in `src/services/activity-log.js`; the design said `middleware/activity-log.js`. The middleware only gained the optional `activityNote`.
13. Documents: uploads from the Documentos tab let the user choose "Todo el alquiler" (`declarationId`, default) or one modality contract, reconciling the design (declarationId) and the spec (selected modality contract). The list uses `includeRelated=1` (an additive option also on `GET /documents`).
14. The monthly sheet keeps the `renderMonthlyView` entry in the ficha but it only renders a "Ver ficha mensual" button; the old inline table and its `API.assets.monthlyView` use were removed from the ficha (the API client method stays). `evolutivo-s7` and `evolutivo2-s10` contract tests were re-pointed.
15. A tenant-side `document_pending` alert is unreachable in practice (a tenant-only occurrence never reaches `paid`); the mapping exists in code and is covered through the shared (owner) case only.
16. `Revertir pago` in Avisos fetches the occurrence and asks which payment when there are several; the history, Períodos and Inicio entry points act on one concrete payment.
17. The revert dialog for a payment with dependents is informational only (no confirm), showing "No se puede revertir este pago porque tiene movimientos dependientes." plus the cause.
18. W11 adopted `Feedback` in wealth-records, alerts, assetHistory, rentalPeriods and the ficha empty rental; `tabs.js` keeps its own loading/error markup (its tests load it standalone). `ConfirmDialog` replaced the remaining `confirm(` calls in `obligations.js` and `transactionForm.js`; `prompt(` calls elsewhere are untouched (out of scope).
19. Unit-level full-suite runs: W8 and W11 only changed frontend files and tests, so those two units ran `tests/ui` (full UI suites) instead of the 9-minute full run; the full suite ran at W7, W9, W10 and W12.
20. Release test `evolutivo4-release-contract` was relaxed (cache version >= 41, package and lock versions equal and >= 1.12.0).

## Contracts batch 2 must honor (decided here)

- Payment reversal tombstone collection `obligationPaymentReversals` is already READ by the history and periods builders. Required shape: `{ obligationId, occurrenceId, reversedAt (ISO), reason, snapshot: { date (YYYY-MM-DD), amount (major units), currencyCode, ... } }`. Rows then show `reversals[]` under the occurrence and a `kind: 'reversal'`, `state: 'reverted'` row dated `snapshot.date` (falls back to `reversedAt`). If W10 uses other field names, update `reversalRows`/`buildObligationRows` in `asset-history.js`.
- Documents: the rental delete cascade already treats `declarationId` as a rental target (rental-only documents with only `contractId`/`rentOccurrenceId`/`declarationId` are removed, others detached) and notes of target type `declaration`, `contract` and `rentOccurrence` are removed. W7 only has to add the `declarationId` document target and the `declaration` note target.
- History/periods `actions` for obligations do not include `revert` yet; W10 should append it (and reuse `AssetHistory.actionProviders` for the history detail).
- Alerts page keeps calling `AssetsPage.showRentMonthModal(...)` (delegate).

## Batch 2 names and contracts (W7-W12)

Backend
- `documents.js`: `declarationId` target (validated, derives the asset), `uploadedBy` on create, `uploadedByName` in responses, `DELETE /documents/:id` (removes the file, drops the id from `obligationResolutions.documentIds`), `GET /documents?declarationId=&includeRelated=1` (contracts and periods too).
- `wealth-notes.js`: `declaration` target, `title` (<=120), `PUT/DELETE /notes/:id`, `from/to` (400 "El rango de fechas no es válido"), `includeRelated=1` (contracts, periods, collections).
- `alerts.js`: every alert has `responsibility` (`owner|tenant`), `?responsibility=` filter (400 "El responsable no es válido"); `document_pending` follows its obligation (shared and owner map to owner).
- `movement-dependents.js`: `dependentMovement(db,u,tx,{claims})` and `buildIndex`; `rentals.reverseCollection` delegates with `claims:false`.
- `obligation-payment-reversal.js`: `revert`, `paymentDetail`, `reversalOf`. Tombstone collection `obligationPaymentReversals` = `{obligationId, occurrenceId, transactionId, paymentId, reversedAt, reason, idempotencyKeyHash, documentIds, snapshot:{date, amount, currencyCode, title, notes, obligationTitle, occurrenceDate, accountId, accountName, paymentMethod, transaction}}` (matches the shape batch 1 already read). Receipts keep existing and get `transactionId:null, revertedPaymentId`.
- Routes: `GET /obligations/:id/occurrences/:occId/payments/:paymentId` (unlogged) and `POST .../revert {reason?}`; payment POST with a tombstoned key hash returns 409 "Ese pago fue revertido; registrá uno nuevo".
- `asset-history.js`: payments carry `revertible`/`revertBlockedReason`, owner rows with a revertible payment get `actions: ['revert']`, reversal rows list the receipts (`documents`).
- Activity log: `ROUTES` lives in `src/services/activity-log.js` (not the middleware). New: `document.delete`, `note.update`, `note.delete`, `obligation.payment-revert`. The middleware appends `res.locals.activityNote` (the reversal reason, <=120 chars) to the entry label; bodies are still never read.

Frontend
- `components/feedback.js` (`Feedback.loading/empty/error`, `Feedback.MESSAGES`); `tests/helpers/fake-dom.js` `loadBrowser` now preloads it.
- `wealth-records.js`: `renderDocuments`/`renderNotes` (config driven), `renderPanel` wires both to one target; pure helpers `filterDocuments`, `sortNotes`, `noteHeading`.
- `MonthlySheet.open(assetId, {from,to})` in `rentalPeriods.js`; actions reuse `AssetHistory.actionProviders` (the revert provider is registered at the end of `assetHistory.js`).
- `ObligationsPage.revertPayment({obligationId, occurrenceId, transactionId}, onDone)` and `revertFromOccurrence(obligation, occurrence, onDone)`; `AssetHistory.revertButtons(row, afterDone)`.
- Entry points: Obligaciones vencimientos, asset history detail and monthly sheet, Períodos obligations, Avisos (`document_pending` only), Inicio transaction detail.

## Issues found

- OneDrive crawler check passed (`jest --listTests` equals the tracked test file count), no placeholder rewrite was needed.
- The shell tool truncates very long heredocs; large files were written with the Write tool or via scratch scripts.
- `git` shows CRLF warnings (autocrlf); the index stays LF.

## Remaining (batch 2)

- [x] W7 documents-and-notes, W8 monthly-sheet, W9 alerts-responsibility, W10 payment-reversal, W11 feedback-and-a11y, W12 release.
- [ ] 12.7 push `evolutivo-5` and open the PR to `master` with the `size:exception` note (orchestrator task; no deploy).
- E2E scenarios (revert payment, history year/month, end modality) are written but NOT run (no Playwright run here); `npx tsc --noEmit` in `e2e/` is clean.
