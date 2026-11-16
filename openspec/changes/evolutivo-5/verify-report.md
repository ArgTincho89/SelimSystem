# Verify Report: evolutivo-5

Mode: Standard (strict_tdd off), artifact_store openspec. Verdict: **PASS WITH WARNINGS**

## Completeness
Tasks 1.1-12.6 checked (71/72); only 12.7 (orchestrator push/PR) is open by design. No core task incomplete.

## Execution evidence
| Command | Result |
|---|---|
| `node -e "require('./src/app')"` | BOOT OK |
| `e2e/node_modules/.bin/tsc --noEmit -p e2e` | exit 0 (note: `npx tsc` at repo root is unavailable; use e2e's tsc) |
| Focused jest (30 suites: evolutivo5-* ui, obligation-payment-revert, rental-*, assets-history, documents-declaration, notes-crud, alerts-responsibility, rentals-adjustment, rentals-reverse, assets-active-declaration, services asset-history/rental-periods/movement-dependents) | 30/30 suites, 264/264 tests pass |
| Full suite | Not run here (pre-push hook runs it); apply-progress reports 139 suites / 1162 tests green at W12 |

## Critical-area checks (source + passing tests)
- Payment reversal: removes the expense transaction, so balance, month expenses, savings and alerts recompute (`ledger.refreshAlerts`); occurrence status derived from remaining payments (returns to Pendiente/Vencido); dependents blocked with the exact 409 message (refund, normalization, allocation, claims, recoveries); reconciliation reset when the transaction is before openingDate or included; replay of revert -> 409 "Ese pago ya fue revertido"; POST replay with tombstoned key -> 409; reason > 500 -> 400; receipts kept with `revertedPaymentId`; tenant-side blocked; atomic rollback via snapshots; log `obligation.payment-revert`. Covered by obligation-payment-revert.test.js (15 tests).
- Skip-collected adjustment: `applyCondition` skips collected periods; rentals-adjustment and rental-condition-preview tests pass.
- Modality end + settle: `endModality` runs `endContract` + `settle` inside `withRollback`; 409 on already ended; collected-after-date blocked; tests pass.
- Rental delete block: `remove` returns 409 for active contracts and for any non-reversed (live) collection (confirmed user decision); reversed collections kept; tombstone, documents removed/detached, obligations unlinked, atomic. Tests pass.
- Section 16 business rules: relevant existing suites (rentals-*, rental-batch-*) pass; no regression seen.
- Section 17 criteria 1-25: all have implementation + contract/route tests; criteria involving real browser rendering (responsive, e2e flows) are verified only at source/vm level.

## CRITICAL
None.

## WARNING
1. E2E (Playwright) scenarios for revert payment, history year/month, end modality, undoCollectedMonth are written and type-check but were NOT executed.
2. Responsive/a11y (criterion 23) has no runtime browser evidence; only CSS/source contract tests.
3. Deviation 16: "Revertir pago" from Avisos is offered only for `document_pending` alerts (request lists "detalle de un pago desde Avisos"); acceptable but narrower than wording.
4. Deviation 8: safe edit of a historical rental is stricter than spec (notes also block edit).
5. Deviation 12/design drift: `ROUTES` lives in `src/services/activity-log.js`, not `middleware/activity-log.js` (functionally equivalent).
6. Deviation 19: W8/W11 ran only tests/ui rather than the full suite per unit (full suite ran at W12).
7. Deviation 15: tenant-side `document_pending` mapping is unreachable and only covered via the owner case.
8. Deviation 4: pre-change reversed collections lack `reversedOccurrenceIds`, so no history event is shown for them.

## SUGGESTION
- Run the Playwright e2e suite before release.
- Add a root `typescript` devDependency or document `e2e/node_modules/.bin/tsc` for the type-check command.
- Task 12.7 push/PR remains for the orchestrator (size:exception).
