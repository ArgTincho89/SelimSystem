# Design: Evolutivo 5

This design is authoritative for names, fields and endpoints. The source of truth is `request.md`. Code references were checked against the working tree on branch `evolutivo-5`.

## Technical Approach

The backend changes are additive. There are two read models, both built over `alerts.readOnlyView(db)` so they never write:
- `asset-history.js` covers an asset, for one year or month. It feeds the timeline and the monthly sheet.
- `rental-periods.js` covers one declaration. It feeds the modal header, Resumen, Períodos and the ficha rental card.

New writes reuse existing patterns:
- Payment reversal uses the tombstone and transaction removal from rent undo (`rentals.js:397`).
- Modality end reuses `endContract` and `settle`.
- Rental delete uses `withRollback` and a tombstone.

Every new write gets a `ROUTES` entry. The rental UI leaves `assets.js` for new page files. `Modal` gains a panel layout, and a `Tabs` component is added. Delivery is one PR with `size:exception` and one commit per work unit, released as v1.13.0 with sw `selimsystem-v42`.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Payment reversal | New `obligationPaymentReversals` tombstone, holding a snapshot, the key hash, the reason and the document ids. The transaction is removed inside `atomically` | `voidedAt` flag; compensating movement | There are 26 `findAll('transactions')` consumers, and they stay correct untouched. The occurrence state is recomputed from `paymentTransactions` (`obligations.js:19`) |
| Dependents | Extract `movement-dependents.js` with `dependentMovement(db,u,tx,{claims})`. `rentals.js:380` delegates with `claims:false`, so rent undo keeps its current behavior. Revert uses `claims:true` (refund, normalization, `movementAllocations`, claims, recoveries, `recoverableClaimId`) | Copy a fourth time | One rule. No behavior change for rent undo |
| Idempotency | A payment POST whose `obligationIdempotencyKey` matches a tombstone returns 409 "Ese pago fue revertido; registrá uno nuevo". A second revert returns 409 "Ese pago ya fue revertido" | Re-create on replay | Same contract as rent (`rent-collections.js:73`) |
| Reconciliation | Same rule as `rentals.js:416`: reset `reconciled` and drop the transaction from `includedMovementIds`. The response returns `reconciliationReset` | Block | Request §16 |
| Receipts on revert | Kept. Their `transactionId` becomes `null` and `revertedPaymentId` is set. They are listed under the tombstone | Delete option | Q9 default. The receipts still exist for audit |
| History read model | `GET /assets/:id/history` accepts either `year&month` or `from&to`. It returns typed rows with details embedded. The window is one year, with no 120-month clamp. A custom range is capped at 36 months, and the UI states the cap | Extend `obligation-history`; client composition | Tests pin the key set of `obligation-history`. One builder also serves the monthly sheet (W8) |
| Periods read model | `rental-periods.js` builds `overview` and `periods` over `readOnlyView`. Occurrences that are already stored keep their real ids. Generated ones are `virtual:` and get `actionable:false`. The modal loads `GET /rentals/declarations/:id` first, which already persists the next 12 months (`contractResponse`) | Writing on every GET | Actions need persisted ids. Read endpoints stay pure |
| Adjustment preview | `GET /rentals/:id/conditions/preview`. `applyCondition` is split into a pure `planCondition` step and the write. Collected occurrences at or after the effective date are **skipped**, and only uncollected ones are superseded. `generateOccurrences:271` already skips a date that has a live occurrence | POST dry-run (it would be logged); reject the whole update | Request §7.6–8. GET is not logged |
| Modality end | `POST /rentals/declarations/:id/modalities/:contractId/end {endDate}` runs `endContract` and `settle` in `withRollback`. The UI stops using `PUT /rentals/:id {status:'ended'}`, which stays available for the API | Patch the `PUT` | Fixes the latent bug where `settle` was skipped |
| Rental delete | `DELETE /rentals/declarations/:id`. It returns 409 while the rental is active ("Finalizá el alquiler antes de eliminarlo") or while non-reversed collections exist ("No se puede eliminar este alquiler porque tiene cobros registrados. Deshacé los cobros primero."). Otherwise it cascades: occurrences, conditions, contracts, declaration notes, and rental-only documents (files removed after commit). Other documents are detached. `obligations.rentalContractId` becomes `null`. A `rentalDeletions` tombstone keeps the snapshot. Reversed `rentCollections` are kept | Cascade collections | Confirmed user decision. The deletion stays auditable |
| Rental targets | Documents get a `declarationId` target and `uploadedBy`. Notes get the `declaration` target, an optional `title` (≤120), `PUT`/`DELETE`, `from`/`to`, and `includeRelated=1` (which also returns notes of the rental's contracts). Uploads from the Documentos tab target `declarationId` | Aggregate only over contracts | Simple filtering. Additive |
| Alerts | Every alert gets `responsibility`. `tenant_obligation_pending`, `rent_due`, `contract_expiry` and `rent_adjustment_due` are `tenant`. `document_pending` follows its obligation's responsibility. All other types are `owner`. A `responsibility` query value other than `owner` or `tenant` returns 400 "El responsable no es válido" | UI-only split | The filter is needed by the API and the tests |
| "Vigente" | A declaration with any contract whose `status==='active'` (`activeDeclarationFor`). `GET /assets` adds `activeDeclarationId` | `condition==='rented'` | `condition` can be `usufruct` |
| UI files | New `assetHistory.js`, `rentalModal.js`, `rentalPeriods.js`, `components/{tabs,feedback,dataTable}.js`. `AssetsPage.showRentMonthModal` remains as a thin delegate | Keep everything in `assets.js` | `assets.js` is already 1311 lines. Tests pin `alerts.js` calls to that delegate |
| Revert UI | `ObligationsPage.revertPayment({obligationId,occurrenceId,transactionId}, onDone)` is reused from five entry points | One per page | Same pattern as `pay()` |

## Data Flow

```
Ficha ─ "Ver alquiler" ─> RentalModal.open(declarationId, {tab:'resumen'})
  GET /rentals/declarations/:id        (persists 12 months; existing behavior)
  GET /rentals/declarations/:id/overview?year=   -> header, modality cards, progress, alerts
  Tab Períodos -> GET .../periods?from=&to= -> rows -> Modal.push(period detail)
Ficha ─ "Ver historial" ─> AssetHistory: GET /assets/:id/history?year=&month= -> detail push
Ficha ─ "Ver ficha mensual" ─> MonthlySheet (rentalPeriods.js): same history endpoint, from/to
```

Payment reversal:

```
UI ConfirmDialog      Route /revert            reversal service          db
  | GET payments/:tx -> payment+dependent ------------------------------->|
  | POST revert{reason}->|validate occ/tx/owner     |                       |
  |                      |tombstone exists? 409     |                       |
  |                      |--revert(db,u,tx,reason)->|dependentMovement? 409 |
  |                      |                          |atomically: create tombstone,
  |                      |                          | remove tx, detach docs,
  |                      |                          | reset reconciliation ->|
  |                      |                          |refreshAlerts           |
  |<-200{reversal,occurrence,reconciliationReset}---|  (log: obligation.payment-revert)
```

Rental delete: the route checks `active` (409), then non-reversed collections (409), then runs `withRollback` (snapshot into `rentalDeletions`, cascade, `settle(asset)`), then deletes the storage files, then returns 200 `{deletedDocumentIds}`.

## Interfaces / Contracts

```
GET  /assets                              + activeDeclarationId|null per asset
GET  /assets/:id/history?year=YYYY&month=MM|all  | ?from=YYYY-MM&to=YYYY-MM (≤36)
  -> { years:[YYYY], year, month, range:{from,to}, rows:[{ id, kind:'obligation'|'rent'|'adjustment'|'event'|'reversal',
       date, concept, typeLabel, responsibility:'owner'|'tenant'|null, counterpart, currencyCode, expected, executed,
       balance, state:'pending'|'overdue'|'partial'|'paid'|'collected'|'resolved'|'reverted'|'cancelled',
       parts?:[{modality,amount,state}], payments[], reversals[], documents[], notes[], refs:{...ids}, actionable }] }
  400 invalid year/month/range; 404 asset.
GET  /rentals/declarations?assetId=&summary=1 -> [{ id, from, to, tenants, modalities, state, editable,
       deletable, impact:{collections, reversedCollections, periods, documents, notes, linkedObligations} }]
GET  /rentals/declarations/:id/overview?year= -> { header:{status:'active'|'ending-soon'|'upcoming'|'ended',
       tenants, from, to, monthlyTotals[], nextCollection, nextDue, pendingTotals[], nextAdjustment},
       modalities:[{contractId, modality, status, from, to, originalAmount, currentAmount, currencyCode,
       classification, ivaPercent, adjustmentFrequencyMonths, adjustmentCriterion, nextAdjustmentDate,
       futureDueDates[]}], progress:{byModality[], total[], counts:{expected,collected,partial,overdue,pending,cancelled}}, alerts[] }
GET  /rentals/declarations/:id/periods?from=YYYY-MM&to=YYYY-MM -> [{ period, dueDate, state,
       parts[{modality,contractId,occurrenceId,actionable,expected,collected,state}], obligations[{...,
       responsibility, payments[], reversals[], resolution}], totals[], collections[], documents[], notes[] }]
GET  /rentals/:id/conditions/preview?method&effectiveDate&rentAmount|percentage|indexValue&baseIndexValue
  -> { currencyCode, previousAmount, newAmount, effectiveDate, affectedDates[], skippedCollectedDates[] }
GET  /rentals/declarations/:id/end-preview?endDate=           -> { cancelledPeriods[], tenantObligations[] }
GET  /rentals/declarations/:id/modalities/:cid/end-preview?endDate= -> { cancelledPeriods[] }
POST /rentals/declarations/:id/modalities/:cid/end {endDate} 409 "No se puede finalizar este contrato porque ya está finalizado"
DELETE /rentals/declarations/:id
GET  /obligations/:id/occurrences/:occId/payments/:txId -> { payment, account, paymentMethod, documents, dependent|null }
POST /obligations/:id/occurrences/:occId/payments/:txId/revert { reason?: string<=500 }
DELETE /documents/:id; POST /documents + declarationId target; records gain uploadedBy
PUT|DELETE /notes/:id { date?, title?, content? }; GET /notes + from,to,includeRelated
GET  /alerts?responsibility=owner|tenant; every alert + responsibility
Modal.show/push(title, content, { width, layout:'panel', header?: HTMLElement, footer?, fullscreenOnMobile? })
Tabs.create({ tabs:[{id,label,render}], initial }) -> { element, select(id), refresh(id) }
ConfirmDialog.open({ title, message, confirmLabel, danger, details?, reasonField? }) -> Promise<{confirmed, reason}>
```

Activity-log `ROUTES` additions: `obligation.payment-revert` ("Revertiste un pago de la obligación"), `rental.contract-end`, `rental.declaration-delete`, `document.delete`, `note.update`, `note.delete`. All new GET previews are unlogged. Context is resolved before the handler runs (`middleware/activity-log.js:14`), so delete labels still resolve.

## File Changes

| Unit | Files |
|---|---|
| W1 | Create `src/services/asset-history.js`, `public/js/pages/assetHistory.js` (moves `showHistory`/`showReceipt`). Modify `routes/assets.js`, `api.js`, `assets.js`, `format.js` (`statusBadge` with text and icon) |
| W2 | `assets.js` (list buttons, `showDetails` header/obligations/rental card/docs-notes/economics, re-home recoveries, ownership and status history), `routes/assets.js` (`activeDeclarationId`) |
| W3 | Create `src/services/rental-periods.js`, `public/js/pages/rentalModal.js`, `components/tabs.js`. Modify `modal.js` (panel layout), `routes/rental-declarations.js`, CSS |
| W4 | Create `public/js/pages/rentalPeriods.js` and `components/dataTable.js`. Move the collection modals out of `assets.js` and remove the obsolete sections |
| W5 | `rentals.js` (`planCondition`, skip collected), `routes/rentals.js` (preview), `rental-declarations.js` (`endModality`, previews), `rentalModal.js` (Contratos, update, end) |
| W6 | `rental-declarations.js` (`remove`, `summary` view), route, `rentalModal.js` history list, `rentalDeclaration.js` (safe edit) |
| W7 | `routes/documents.js`, `routes/wealth-notes.js`, `wealth-records.js` (tabs, filters, edit/delete) |
| W8 | `rentalPeriods.js` `MonthlySheet` |
| W9 | `services/alerts.js`, `routes/alerts.js`, `pages/alerts.js` (`data-alert-responsibility` sections that wrap the existing `data-alert-group`) |
| W10 | Create `services/obligation-payment-reversal.js` and `services/movement-dependents.js`. Modify `routes/obligations.js`, `rentals.js:380`, `obligations.js` page, `home.js`, `alerts.js`, `assetHistory.js`, `rentalPeriods.js` |
| W11 | `components/feedback.js`, CSS responsive pass, `index.html` and `sw.js` (all new scripts, `v42`), `package.json` 1.13.0, `CHANGELOG.md`, `Documento funcional.md` |

Each unit adds its new scripts to `index.html` and `sw.js` `STATIC_ASSETS` at the time the file is created.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit/Integration | history (years, month, all, range cap, typed rows, reverted, 404/400); periods and overview (consolidated state, partial, `actionable`, no writes); preview and skip-collected; modality end (`settle`, 409); delete (409 active, 409 collections, cascade, tombstone); documents and notes CRUD and targets; alert responsibility and filter; revert (balance, month expense, savings, alerts, dependents 409, reconciliation reset, replay 409, rollback, receipts); log action per new route | Jest + Supertest. Run the full suite with `npx jest --runTestsByPath $(git ls-files 'tests/*.test.js')` |
| Contract (re-point) | W1: `evolutivo4-history-contract`. W2: `evolutivo2-s5`, `evolutivo3-s3`. W3–W5: `evolutivo3-s4`, `evolutivo3-s4c`, `evolutivo3-s2`, `rental-batch-contract` (load `rentalPeriods.js` into the vm), `evolutivo2-s7` (forbid `confirm(` in new files too). W9: `evolutivo-s6`. W11: relax `evolutivo4-release-contract` and add `evolutivo5-release-contract` (v42 / 1.13.0) | Source-read + `vm`. New `tests/ui/evolutivo5-*` per unit |
| E2E | `AssetsPage.undoCollectedMonth` becomes "Ver alquiler" → tab "Períodos" → `[data-rent-month]` (attribute kept). `AlertsPage` is unchanged, because `data-alert-group` is kept. New: history year/month, revert payment, end modality | Cucumber + Playwright |

## Threat Matrix

N/A. There is no routing to shell, subprocess, VCS automation or executable-file boundary. Document delete removes only `storageKey` files owned by the user, through `documentStorage.remove`.

## Migration / Rollout

No migration is needed. The new collections (`obligationPaymentReversals`, `rentalDeletions`) and fields (`title`, `responsibility`, `declarationId`, `uploadedBy`, `revertedPaymentId`) are additive. Take a backup before deploy. To roll back, revert the merge and redeploy v1.12.0.

## Open Questions

- [ ] The auto-mode defaults (proposal question round 1–5, Q7–Q13) still need user review. They are not blocking.
- [ ] Skipping collected periods on an adjustment changes current behavior, and `rentals-adjustment` tests must be updated (proposal default 5).
