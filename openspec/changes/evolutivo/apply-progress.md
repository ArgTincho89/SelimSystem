# Apply Progress: Evolutivo

Mode: standard (strict_tdd false). Branch: feat/evolutivo (feature-branch-chain).

## S1 - Phase 1a (done)

- [x] 1.1 `src/services/migrations.js` `migrateEvolutivo(db)`, registered in `createApp`; idempotent backfill (`responsibilityType: 'owner'`, null external id fields).
- [x] 1.2 External identifier/type validation in `validateDefinition` (`src/services/obligations.js`); `?externalIdentifier=` list filter in `src/routes/obligations.js`.
- [x] 1.3 `src/routes/owners.js`: roles widened, deduped, optional `roleLabel` (<=80).
- [x] 1.4 UI: entities roles, obligations identifier form/list; `public/sw.js` -> `selimsystem-v19`.

Tests: tests/services/migrations.test.js, tests/routes/owners-roles.test.js, tests/routes/obligation-external-identifiers.test.js, tests/ui/evolutivo-s1-contract.test.js.
Results: `npm run test:coverage` 30 suites / 370 tests pass, thresholds met.

Notes: identifier tests live in a new file instead of extending obligations.test.js (separate temp-db lifecycle). Migration does not set `responsibilityType` on newly created obligations (S2 wires it, default `owner`).

## S2 - Phase 1b (done)

- [x] 2.1 `portionsFor` / `validateResponsibility` (+ `validateSplit`) in `src/services/obligations.js`, wired into `validateDefinition`.
- [x] 2.2 Responsibility fields flow through existing POST/PUT via `validateDefinition`; `createObligation` defaults `responsibilityType: 'owner'`. Non-shared types store `responsibilitySplit: null`; non-third store `responsibleThirdEntityId: null`. Edits only change the definition (occurrences unchanged; history is kept via existing revisions).
- [x] 2.3 `src/routes/documents.js`: `resolveTargets` replaces `targetFor` (accepts occurrence/rentOccurrence/transaction/tenant plus legacy targets, derives obligation/contract/asset, 400 on mismatch); list filters by every provided target (AND); multer `fields` limit raised to 9.
- [x] 2.4 Obligations form (responsibility selector, conditional split/third/contract fields), list shows responsibility; `API.documents.uploadTargets/listBy`; `public/sw.js` -> `selimsystem-v20`.

Tests: tests/services/obligation-portions.test.js, tests/routes/obligation-responsibility.test.js, tests/routes/documents-targets.test.js, tests/ui/evolutivo-s2-contract.test.js (S1 UI test now accepts v19 or later).
Results: `npm run test:coverage` 34 suites / 395 tests pass.

Notes: `portionsFor` treats shared `other` rule as owner-only (informational). Percentage split rounds tenant portion, owner takes the remainder. Fixed split: tenant = min(tenantFixed, due); if only ownerFixed given, tenant = due - ownerFixed. Obligations are updated with PUT (no PATCH route exists).

## S8 - Phase 5 (done)

- [x] 8.1 `src/utils/ownership-overlap.js` (`overlaps`, `validateOwnershipSet`): same-holder overlap rejected, concurrent percentage sum > 100 rejected at each start date; different holders may overlap.
- [x] 8.2 Applied in `src/routes/assets.js` on batch create, POST ownership (existing + candidate) and PATCH end date (others + patched).
- [x] 8.3 No frontend change: add/close ownership handlers in `public/js/pages/assets.js` already toast the API error message; CACHE_NAME stays v20.

Tests: tests/services/ownership-overlap.test.js, tests/routes/assets-ownership-overlap.test.js.
Results: `npm run test:coverage` 36 suites / 409 tests pass.

## S3 - Phase 2 (done; commits S3a backend, S3b frontend)

- [x] 3.1 `src/services/credit-card-installments.js`: basis-point interest, `financedTotalMinor`, last installment absorbs remainder, date generation with day clamp / leap years, `validatePlan`.
- [x] 3.2 Collections `creditCardInstallmentPlans` / `creditCardInstallmentOccurrences` (JsonDB needs no registration); create/list/get/update (notes, reminderLeadDays, title)/cancelPlan; plan auto-`completed` when no scheduled occurrences remain after a posting.
- [x] 3.3 `postOccurrence`: one expense transaction (fecha = dueDate unless `date` given, amount override optional and positive, category from plan or body), asset imputation via `movementAllocations` (complete) when plan has `assetId`; duplicate/cancelled -> 409; posted cannot be cancelled.
- [x] 3.4 `src/routes/installments.js` registered at `/api/installments`; extras: `GET /occurrences?month=` (scheduled items of active plans, labelled) and `POST /plans/:id/cancel`.
- [x] 3.5 Frontend: Transactions page block for scheduled installments, installment fields in the expense form for credit cards, API client, `CACHE_NAME` -> `selimsystem-v21`.

Tests: tests/services/credit-card-installments.test.js, tests/routes/installments.test.js, tests/ui/evolutivo-s3-contract.test.js (S2 UI test now accepts v20 or later).

Notes: `card_installment_due` alerts belong to S6. Receipt: plan stores optional existing `documentId`; documents have no plan target, so no upload in the form yet. Scheduled installments are not in `/api/transactions` or summary totals.

## S4 - Phase 2b backend (done; commit S4)

- [x] 4.1 `occurrenceView` in `src/services/obligations.js` is portion-aware: when `portionsFor(...).tenant === 0` (and for cancelled) the legacy expression runs unchanged and the view has no new fields; otherwise status `resolved` (tenant-only settled) / `paid` (shared, both portions settled) / `overdue` / `partial` / `confirmed|expected`; `remainingAmount` is the owner portion remaining; adds `ownerDueAmount`, `tenantDueAmount`, `tenantRemainingAmount`, `resolution` (only on the tenant-portion path). `activeResolution(db, userId, occurrenceId)` exported.
- [x] 4.2 `createResolution` / `voidResolution` / `listResolutions` using `obligationResolutions` (status `active|voided`). Guards: updateOccurrence returns 409 with an active resolution (series-wide updates skip resolved occurrences); payments are capped by owner `remainingAmount` (tenant-only rejects any payment with the existing 400); cancel returns 409; obligation PUT/DELETE loops skip resolved occurrences. Amount is informational for tenant-only (positive), capped to tenant portion for shared. Receipts must be linked to the occurrence OR the tenant.
- [x] 4.3 Routes: `POST|DELETE /api/obligations/:id/occurrences/:occurrenceId/resolution` (201 / 200 with `{ resolution, occurrence }`; duplicate 409; DELETE without active resolution 404), `GET /api/obligations/resolutions?occurrenceId|obligationId|tenantEntityId|assetId|period` (active only).
- [x] 4.4 No code change needed in `economic-overview.js`: `pendingForRange` already consumes `remainingAmount`, now owner-only. Regression asserted in the new route test (tenant-only excluded from pending, shared shows owner portion, summary/accounts/transactions/economics/overview unchanged by create and void).

Consumers of `remainingAmount` audited: `routes/obligations.js` (nextDue/overdue actionable, payment cap), `getAlerts`, `economic-overview.pendingForRange`, UI payment prompt (`public/js/pages/obligations.js`). rentals/assets UI use rent occurrences (separate view). All become owner-only; tenant-only occurrences are never actionable.

Tests: tests/services/obligation-status.test.js (legacy-equivalence matrix), tests/routes/obligation-resolutions.test.js.
Results: `npm run test:coverage` 41 suites / 457 tests pass.

Notes: a resolution persists after the obligation responsibility is later changed, but the view then follows the current responsibility (legacy path when tenant portion is 0); changing responsibility is not blocked.

## S5 - Phase 2b frontend (done; commit S5)

- [x] 5.1 `public/js/pages/obligations.js`: `resolved` badge/label and status filter, owner vs tenant portion in the occurrence row, "Resolver (pagó el inquilino)" dialog (tenant select, period, amount, existing/new receipts via `uploadTargets` with occurrenceId+tenantEntityId, date, notes), "Anular resolución"; Confirm/Edit/Cancel hidden while resolved, Pagar hidden when the owner portion is settled. `public/js/api.js` `createResolution`/`voidResolution`/`listResolutions`. `public/sw.js` -> `selimsystem-v22`.

Tests: tests/ui/evolutivo-s5-contract.test.js.

## Remaining: S6, S7, S9
