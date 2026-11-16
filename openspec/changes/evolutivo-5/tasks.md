# Tasks: Evolutivo 5

Conventions: `strict_tdd: false`, but every task ships its tests in the same commit (Jest + Supertest under `tests/routes`, `tests/services`, `tests/ui`). Prefer NEW test files (temp db is shared per file). Names, endpoints, fields and collections follow `design.md` (authoritative). New API fields are additive. Each unit adds new scripts to `public/index.html` and `public/sw.js` `STATIC_ASSETS` when the file is created; `CACHE_NAME` is bumped once, in W12. Each new write route gets a `ROUTES` entry in `src/middleware/activity-log.js` plus a log-action test. Delivery: one branch `evolutivo-5`, one conventional commit per unit (no AI attribution), single PR to `master`. No migration, no deploy.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~7,500-9,000 (code + tests + docs) |
| 400-line budget risk | High |
| Chained PRs recommended | No (user asked for one PR) |
| Suggested split | Single PR, one commit per work unit |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

Budget is 800 lines (review_budget_lines); `size:exception` is recorded. Mitigation: commit-by-commit review.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| W1 | Asset history read model + timeline modal | PR 1 | `npx jest --runTestsByPath tests/services/asset-history.test.js tests/routes/assets-history.test.js tests/ui/evolutivo5-history-contract.test.js` | `GET /assets/:id/history` via Supertest | `asset-history.js`, `assetHistory.js`, route |
| W2 | Ficha redesign + `activeDeclarationId` | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo5-ficha-contract.test.js tests/routes/assets-active-declaration.test.js` | Supertest `GET /assets` | `assets.js` ficha edits |
| W3 | Panel Modal, Tabs, rental modal shell, overview | PR 1 | `npx jest --runTestsByPath tests/services/rental-periods.test.js tests/routes/rental-overview.test.js tests/ui/evolutivo5-modal-tabs-contract.test.js` | Supertest overview | `rental-periods.js`, `rentalModal.js`, `tabs.js` |
| W4 | Periods tab + collections moved out of `assets.js` | PR 1 | `npx jest --runTestsByPath tests/routes/rental-periods.test.js tests/ui/evolutivo5-periods-contract.test.js` | Supertest periods | `rentalPeriods.js`, `dataTable.js` |
| W5 | Adjustment preview, skip collected, modality end | PR 1 | `npx jest --runTestsByPath tests/routes/rental-condition-preview.test.js tests/routes/rental-modality-end.test.js` | Supertest preview/end | `rentals.js` split, `endModality` |
| W6 | Rental delete + history list + safe edit | PR 1 | `npx jest --runTestsByPath tests/routes/rental-declaration-delete.test.js` | Supertest delete cascade | `remove`, `summary` view |
| W7 | Documents and notes for rentals | PR 1 | `npx jest --runTestsByPath tests/routes/documents-declaration.test.js tests/routes/notes-crud.test.js` | Supertest CRUD | `documents.js`, `wealth-notes.js` |
| W8 | Monthly sheet modal | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo5-monthly-sheet-contract.test.js` | history endpoint with `from/to` | `MonthlySheet` in `rentalPeriods.js` |
| W9 | Alerts by responsibility | PR 1 | `npx jest --runTestsByPath tests/routes/alerts-responsibility.test.js tests/ui/evolutivo5-alerts-contract.test.js` | Supertest `GET /alerts?responsibility=` | `alerts.js` service/route/page |
| W10 | Payment reversal + shared dependents | PR 1 | `npx jest --runTestsByPath tests/routes/obligation-payment-revert.test.js tests/services/movement-dependents.test.js` | Supertest revert flow | `obligation-payment-reversal.js`, `movement-dependents.js` |
| W11 | Feedback component + responsive/a11y | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo5-feedback-contract.test.js` | N/A (UI source/vm contract) | `feedback.js`, CSS pass |
| W12 | Release v1.13.0 | PR 1 | `npx jest --runTestsByPath tests/ui/evolutivo5-release-contract.test.js` | full suite + e2e tsc | version, sw, docs |

## W1: asset-history (commit: `feat(assets): typed history timeline by year and month`)

- [x] 1.1 RED `tests/services/asset-history.test.js` + `tests/routes/assets-history.test.js`: years list, month, `all`, `from/to` (36-month cap -> 400), typed rows, reverted rows, 400 invalid, 404 asset, 401, user isolation, no writes.
- [x] 1.2 Create `src/services/asset-history.js` (over `alerts.readOnlyView`); add `GET /assets/:id/history` in `src/routes/assets.js`; `API.assets.history` in `public/js/api.js`.
- [x] 1.3 Create `public/js/pages/assetHistory.js` (move `showHistory`/`showReceipt` from `assets.js`; year/month selectors, detail push); `format.js` `statusBadge` with text + icon; register script in `index.html`/`sw.js`.
- [x] 1.4 Re-point `tests/ui/evolutivo4-history-contract.test.js`; add `tests/ui/evolutivo5-history-contract.test.js`.

## W2: ficha-redesign (commit: `feat(assets): redesigned ficha with rental card`)

- [x] 2.1 RED `tests/routes/assets-active-declaration.test.js`: `activeDeclarationId` set only with an active contract (not `usufruct` condition), null otherwise.
- [x] 2.2 `src/routes/assets.js`: add `activeDeclarationId`. `assets.js`: list buttons, `showDetails` header/obligations/rental card/docs-notes/economics; re-home recoveries, ownership and status history.
- [x] 2.3 Re-point `evolutivo2-s5`, `evolutivo3-s3`; add `tests/ui/evolutivo5-ficha-contract.test.js`.

## W3: rental-modal-shell (commit: `feat(rentals): tabbed rental modal with overview`)

- [x] 3.1 RED `tests/services/rental-periods.test.js` + `tests/routes/rental-overview.test.js`: header status (`active|ending-soon|upcoming|ended`), modality cards, progress counts, alerts, no writes, 404.
- [x] 3.2 Create `src/services/rental-periods.js` (`overview`); `GET /rentals/declarations/:id/overview` in `routes/rental-declarations.js`.
- [x] 3.3 `public/js/components/modal.js` panel layout (`layout:'panel'`, `header`, `fullscreenOnMobile`); create `components/tabs.js`; create `pages/rentalModal.js` (Resumen tab); `AssetsPage.showRentMonthModal` becomes a thin delegate; CSS; register scripts.
- [x] 3.4 Re-point `evolutivo3-s4`, `evolutivo3-s4c`; add `tests/ui/evolutivo5-modal-tabs-contract.test.js` (Modal default unchanged, Tabs `select`/`refresh`).

## W4: periods-tab (commit: `feat(rentals): periods tab and collection flows`)

- [x] 4.1 RED `tests/routes/rental-periods.test.js`: consolidated state, partial, `virtual:` ids with `actionable:false`, obligations with payments/reversals, no writes.
- [x] 4.2 `rental-periods.js` `periods`; route `GET .../periods?from&to`.
- [x] 4.3 Create `pages/rentalPeriods.js` and `components/dataTable.js`; move collection modals out of `assets.js`, remove obsolete sections; keep `[data-rent-month]`.
- [x] 4.4 Re-point `evolutivo3-s2`, `rental-batch-contract` (load `rentalPeriods.js` in vm), `evolutivo2-s7` (no `confirm(` in new files); add `tests/ui/evolutivo5-periods-contract.test.js`.
- [x] 4.5 e2e: `e2e/pages/AssetsPage.ts` `undoCollectedMonth` -> "Ver alquiler" -> tab "Períodos" -> `[data-rent-month]`; update feature steps.

## W5: contracts-and-lifecycle (commit: `feat(rentals): adjustment preview and modality end`)

- [x] 5.1 RED `tests/routes/rental-condition-preview.test.js`: preview shape, collected dates skipped, only uncollected superseded, GET unlogged. Update `rentals-adjustment` tests for skip-collected.
- [x] 5.2 RED `tests/routes/rental-modality-end.test.js`: `settle` runs, 409 "No se puede finalizar este contrato porque ya está finalizado", end-previews, rollback, log `rental.contract-end`.
- [x] 5.3 `rentals.js` split `planCondition` + write; `GET /rentals/:id/conditions/preview`; `rental-declarations.js` `endModality` + end-previews; routes + `ROUTES`.
- [x] 5.4 `rentalModal.js` Contratos tab (update flow with preview, end flow); UI stops using `PUT /rentals/:id {status:'ended'}`. Add `tests/ui/evolutivo5-contracts-contract.test.js`.
- [x] 5.5 e2e: end-modality scenario in `e2e/features` + page object.

## W6: rental-deletion-history (commit: `feat(rentals): delete rental and rental history list`)

- [x] 6.1 RED `tests/routes/rental-declaration-delete.test.js`: 409 active, 409 non-reversed collections, cascade, rental-only documents removed, others detached, `obligations.rentalContractId` null, `rentalDeletions` tombstone, reversed collections kept, log `rental.declaration-delete`.
- [x] 6.2 `rental-declarations.js` `remove` + `summary=1` view (`editable`, `deletable`, `impact`); `DELETE /rentals/declarations/:id`; `ROUTES`.
- [x] 6.3 `rentalModal.js` history list and delete confirm with impact; `rentalDeclaration.js` safe edit. Add `tests/ui/evolutivo5-rental-history-contract.test.js`.

## W7: documents-and-notes (commit: `feat(rentals): rental documents and notes tabs`)

- [x] 7.1 RED `tests/routes/documents-declaration.test.js` + `tests/routes/notes-crud.test.js`: `declarationId` target, `uploadedBy`, `DELETE /documents/:id` (owner files only), notes `title` <=120, `PUT/DELETE`, `from/to`, `includeRelated=1`, log actions.
- [x] 7.2 `routes/documents.js`, `routes/wealth-notes.js`, `ROUTES` (`document.delete`, `note.update`, `note.delete`).
- [x] 7.3 `wealth-records.js` tabs, filters, edit/delete; `rentalModal.js` Documentos and Notas tabs. Add `tests/ui/evolutivo5-docs-notes-contract.test.js`.

## W8: monthly-sheet (commit: `feat(assets): monthly sheet modal`)

- [x] 8.1 RED `tests/ui/evolutivo5-monthly-sheet-contract.test.js` (vm): month rows by `from/to`, totals, empty state.
- [x] 8.2 `rentalPeriods.js` `MonthlySheet` over `/assets/:id/history`; wire "Ver ficha mensual" in ficha.

## W9: alerts-responsibility (commit: `feat(alerts): owner and tenant responsibility sections`)

- [ ] 9.1 RED `tests/routes/alerts-responsibility.test.js`: every alert has `responsibility`; tenant types per design; `document_pending` follows obligation; filter owner/tenant; invalid -> 400 "El responsable no es válido".
- [ ] 9.2 `services/alerts.js`, `routes/alerts.js`; `pages/alerts.js` `data-alert-responsibility` sections wrapping `data-alert-group`.
- [ ] 9.3 Re-point `evolutivo-s6`; add `tests/ui/evolutivo5-alerts-contract.test.js`; confirm `AlertsPage` e2e unchanged.

## W10: payment-reversal (commit: `feat(obligations): revert registered payments`)

- [ ] 10.1 RED `tests/services/movement-dependents.test.js`: `claims:false` equals current rent undo behavior; `claims:true` detects refund, normalization, allocations, claims, recoveries.
- [ ] 10.2 RED `tests/routes/obligation-payment-revert.test.js`: balance, month expense, savings and alerts recompute; dependents 409; reconciliation reset (`reconciliationReset`); revert replay 409 "Ese pago ya fue revertido"; POST replay with tombstoned key 409; receipts kept with `revertedPaymentId`; reason >500 -> 400; rollback on failure; GET payment detail; log `obligation.payment-revert`.
- [ ] 10.3 Create `services/movement-dependents.js`; make `rentals.js:380` delegate; create `services/obligation-payment-reversal.js`; routes in `routes/obligations.js`; `ROUTES`.
- [ ] 10.4 `ConfirmDialog.open` (details, reasonField) and `ObligationsPage.revertPayment`; wire entry points in `obligations.js`, `home.js`, `alerts.js`, `assetHistory.js`, `rentalPeriods.js`. Add `tests/ui/evolutivo5-revert-contract.test.js`.
- [ ] 10.5 e2e: revert-payment scenario + history year/month scenario.

## W11: feedback-and-a11y (commit: `feat(ui): feedback component and responsive pass`)

- [ ] 11.1 RED `tests/ui/evolutivo5-feedback-contract.test.js`: loading/empty/error states, accessible labels, no `confirm(` in new files.
- [ ] 11.2 Create `components/feedback.js`; adopt in new pages; CSS responsive pass; register scripts.

## W12: release (commit: `chore(release): evolutivo-5 version 1.13.0, changelog and cache bump`)

- [ ] 12.1 `public/sw.js` `CACHE_NAME` -> `selimsystem-v42`; verify every new script (`assetHistory.js`, `rentalModal.js`, `rentalPeriods.js`, `tabs.js`, `feedback.js`, `dataTable.js`) in `index.html` and `STATIC_ASSETS`.
- [ ] 12.2 Relax `tests/ui/evolutivo4-release-contract.test.js`; add `tests/ui/evolutivo5-release-contract.test.js` (v42, 1.13.0).
- [ ] 12.3 `package.json` and `package-lock.json` -> `1.13.0`; `CHANGELOG.md` `## [1.13.0]` (Added/Changed, Spanish).
- [ ] 12.4 Update `Documento funcional.md` for the new UI (history, rental modal, alerts, revert).
- [ ] 12.5 Full suite: `npx jest --forceExit --runTestsByPath $(git ls-files 'tests/*.test.js' 'tests/**/*.test.js')` plus untracked new tests; fix regressions.
- [ ] 12.6 e2e type check (`npx tsc --noEmit -p e2e`).
- [ ] 12.7 Orchestrator: push `evolutivo-5`, open PR to `master` with the `size:exception` note. No deploy.
