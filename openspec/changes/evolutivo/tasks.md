# Tasks: Evolutivo

Conventions: `strict_tdd: false`, but every task ships its tests in the same commit (Jest + Supertest under `tests/routes`, `tests/services`, `tests/ui`). Names, endpoints and fields follow `design.md`. `npm test` and `npm run test:coverage` (global 60%, per-file thresholds in `jest.config.js`) must pass before each slice is pushed. Each slice is a work unit (see `work-unit-commits`) that leaves master green and deployable (push to master -> CI -> Fly deploy).

## Review Workload Forecast

| Slice | Phase | Est. changed lines (code + tests) | Notes |
|---|---|---|---|
| S1 | 1a: external id, holder roles, migration scaffold | ~280 | small, low risk |
| S2 | 1b: responsibility+split, document targets | ~520 | validators + doc consistency |
| S3 | 2: credit card installments | ~720 | new service + routes + UI; near budget |
| S4 | 2b: tenant resolution (backend) | ~600 | status algorithm, highest regression risk |
| S5 | 2b: tenant resolution (UI + KPI regression) | ~300 | obligations.js UI, resolved badge |
| S6 | 3: alerts center | ~520 | read-only aggregator + route + tests |
| S7 | 4: property monthly view | ~450 | economic-overview + assets route + UI tab |
| S8 | 5: ownership overlap | ~170 | independent; can be pulled forward |
| S9 | 6: asset file overview | ~480 | read-only; depends on S4, S6, S7 |
| Total | | ~4,040 | |

Budget: 800 lines per review. Total (~4,040) far exceeds it -> chained slices REQUIRED (auto-chain). Every slice is estimated under 800 (S3 is the closest; if it exceeds ~800, split backend and UI as S3a/S3b). Delivery is direct push to master: each slice is a commit (or small commit group) pushed in order; no slice may depend on an unpushed later slice, and all new behavior is additive so master stays deployable after each push. `public/sw.js` `CACHE_NAME` goes to `selimsystem-v19` in the first slice touching `public/` and increments (v20, ...) in each later slice that changes `public/` assets (design names v19 for the first bump; the per-slice increments are an addition so clients always refresh).

Dependency graph: S1 -> S2 -> {S3, S4}; S4 -> S5; {S2,S3,S4} -> S6; {S2,S4} -> S7; S8 independent; {S4,S6,S7} -> S9. S3 and S4 may be developed in parallel but are pushed sequentially (one writer).

---

## Phase 1a (S1): External identifier, holder roles, migration

- [ ] 1.1 Create `src/services/migrations.js` exporting `migrateEvolutivo(db)`: idempotent backfill of `responsibilityType: 'owner'` (and null defaults for `externalIdentifier`, `externalIdentifierType`) on obligations missing them; register in `src/app.js` startup. Test `tests/services/migrations.test.js`: run twice, no change on second run; legacy obligation reads back with defaults. (Spec: obligation-responsibility "Missing responsibility defaults"; holder-roles "Legacy holder".)
- [ ] 1.2 `src/routes/obligations.js` (+ `src/services/obligations.js` if validation lives there): accept/validate `externalIdentifier` (trimmed 1-120, whitespace -> null) and `externalIdentifierType` (`account|contract|meter|policy|client|other`); add `?externalIdentifier=` list filter. Tests in `tests/routes/obligations.test.js`: persist, omit -> null, typed, invalid type 400, over-length 400, filter returns only matches. (Spec: obligation-external-identifiers all scenarios.)
- [ ] 1.3 `src/routes/owners.js`: widen `ROLES` to `owner, tenant, provider, payment_responsible, other`; dedupe roles; optional `roleLabel` (<=80 chars, only meaningful with `other`); update error message. Tests (new `tests/routes/owners-roles.test.js` or extend existing): accept `payment_responsible` and `other`, reject unknown role 400, dedupe, `roleLabel` >80 -> 400, legacy holder unchanged, `other`-only holder has no effect on tenant checks. (Spec: holder-roles.)
- [ ] 1.4 Frontend: `public/js/pages/entities.js` (role labels/checkboxes ~L18, L63) add the two roles, unknown roles render read-only; `public/js/pages/obligations.js` form fields for external identifier + type and display in list; `public/js/api.js` pass-through if needed. Bump `public/sw.js` `CACHE_NAME` to `selimsystem-v19`. UI contract test under `tests/ui/` asserting role list includes new roles and sw cache name changed. (Spec: holder-roles backward compatibility.)

## Phase 1b (S2): Responsibility and document targets

- [ ] 2.1 `src/services/obligations.js`: add `portionsFor(obligation, dueMinor)` (owner/third/none -> `{owner:due, tenant:0}`; tenant -> `{0,due}`; shared by percentage / fixed / other rule; fixed amounts capped to due, remainder to owner) and `validateResponsibility(db,user,body)` (type enum, shared requires valid split, percentages sum 100, fixed non-negative integer minor units, `responsibleThirdEntityId` must be a user-owned legal owner (any role), `rentalContractId` must be a rental contract of the same asset). Unit tests `tests/services/obligation-portions.test.js` covering owner/tenant/shared pct/fixed/third/none. (Spec: obligation-responsibility split rules and validation.)
- [ ] 2.2 `src/routes/obligations.js`: wire fields `responsibilityType` (default `owner`), `responsibilitySplit`, `responsibleThirdEntityId`, `rentalContractId` into POST/PATCH; changing responsibility affects future occurrences only (no rewriting of history). Supertest tests: create with each type, default owner, percentage split sum != 100 -> 400, fixed split stored, third link with `payment_responsible` holder accepted, shared without split 400, bad contract 400. (Spec: obligation-responsibility all scenarios except alerts/resolution.)
- [ ] 2.3 `src/routes/documents.js`: accept `occurrenceId`, `rentOccurrenceId`, `transactionId`, `tenantEntityId`; require at least one target; derive and store parent `obligationId` / `contractId` / asset; reject mismatched `assetId` or parent with 400; `tenantEntityId` must be a legal owner with tenant role; list filters by every target; dangling links ignored by filters; legacy docs unaffected. Tests `tests/routes/documents-targets.test.js` for each link scenario, mismatch 400, filter by occurrence. (Spec: document-linking.)
- [ ] 2.4 Frontend: `public/js/pages/obligations.js` responsibility selector with conditional split / third-party / contract fields and a responsibility column; `public/js/api.js` client fields. Bump `CACHE_NAME` (v20). UI contract test for the new form fields. (Spec: obligation-responsibility "Create obligation with responsibility".)

## Phase 2 (S3): Credit card installments

- [ ] 3.1 Create `src/services/credit-card-installments.js`: minor-unit math (interest in basis points, `financedTotalMinor`, `installmentAmountMinor`, last installment absorbs remainder), occurrence date generation (first month on/after purchase date, due-day overflow to month end, leap years), plan validation (count 1-120, dueDay 1-31, interest 0-1000, credit-card method active + linked to account, account active + currency match, optional asset/category ownership). Unit tests `tests/services/credit-card-installments.test.js`: 1000 @ 7% / 12, remainder absorption sum equality, day 31 in 30-day month, February leap, invalid ranges. (Spec: credit-card-installments generate occurrences, interest, validation.)
- [ ] 3.2 Plan persistence in new collections `creditCardInstallmentPlans` / `creditCardInstallmentOccurrences` with `create/list/get/update(PATCH: notes, reminderLeadDays, title)/cancelPlan`; plan `completed` when no future scheduled occurrences. Include in `db` collection registration if JsonDB requires it. Test via service level. (Spec: create plan, cancel.)
- [ ] 3.3 Posting: `postOccurrence(db,user,plan,occurrence,{accountId,categoryId,amount})` creates exactly one expense via existing `ledger`/transactions path, sets `status: posted`, `postedTransactionId`, `postedAt`; duplicate post -> 409/400; cancelled -> rejected; cancel only scheduled unposted occurrences (posted cancel rejected). Open question (amount override): default to occurrence amount; allow override only if provided and positive (documented). (Spec: post occurrence, duplicate rejected, cancel future occurrence.)
- [ ] 3.4 Create `src/routes/installments.js`: `GET/POST /api/installments/plans`, `GET/PATCH /plans/:id`, `GET /plans/:id/occurrences`, `POST /plans/:id/occurrences/:occurrenceId/post|cancel`; register in `src/app.js`. Supertest `tests/routes/installments.test.js`: valid plan creates N occurrences and zero transactions, invalid payment method 400, post creates one expense, duplicate post rejected, cancel scheduled ok, unposted occurrences do not change monthly totals/Home summary (`/api/summary`), 401 unauthenticated. (Spec: all credit-card-installments scenarios except alerts.)
- [ ] 3.5 Frontend: installments section (new view or tab in `public/js/pages/` where payment methods/cards live) with create form, occurrence list, post/cancel actions; `public/js/api.js` calls; bump `CACHE_NAME` (v21). UI contract test. If the slice exceeds ~800 lines, ship 3.1-3.4 as S3a and 3.5 as S3b.

## Phase 2b (S4/S5): Tenant obligation resolution

- [ ] 4.1 `src/services/obligations.js`: add `activeResolution(db, occurrenceId)` and rework `occurrenceView` (~L21-27) per the Status Algorithm: when `split.tenant === 0` run the legacy expression untouched; otherwise derive `resolved` / `paid` / `overdue` / `partial` / `confirmed|expected`; `remainingAmount` becomes the owner portion remaining; add `ownerDueAmount`, `tenantDueAmount`, `tenantRemainingAmount`, `resolution`. Unit tests `tests/services/obligation-status.test.js`: matrix owner/tenant/shared x paid/resolved/overdue/partial, plus snapshot that legacy obligations produce identical output. (Spec: tenant-obligation-resolution occurrence status; design Status Algorithm.)
- [ ] 4.2 `createResolution` / `voidResolution` in `src/services/obligations.js` using `obligationResolutions` collection: validations (occurrence not cancelled, responsibility tenant|shared, no active resolution -> 409, tenantEntityId has tenant role and matches contract tenantIds when `rentalContractId`, `period` YYYY-MM, amount via `ledger.moneyInput` > 0 and <= tenant portion for shared, currency matches, `documentIds` exist, user-owned and consistent with occurrence or tenant, valid `resolvedAt`); derive `obligationId`, `assetId`, `portion`, `contractId`; void sets `status: 'voided'`. Guards: payments capped by owner remaining (tenant-only rejects any payment), cancel and `updateOccurrence` return 409 when an active resolution exists. Open question default: `amount` is informational for tenant-only, capped for shared. (Spec: create resolution, separate portion tracking, validation rules.)
- [ ] 4.3 `src/routes/obligations.js`: `POST /api/obligations/:id/occurrences/:occurrenceId/resolution`, `DELETE` same path (void), list resolutions by `occurrenceId|obligationId|tenantEntityId|assetId|period` (e.g. `GET /api/obligations/resolutions`), cancel guard. Supertest `tests/routes/obligation-resolutions.test.js`: resolve tenant occurrence -> status `resolved`; ineligible responsibility 400; duplicate 409; with receipts; inconsistent receipt 400; resolution > tenant portion 400; shared partial then fully settled -> `paid`; 50/50 no double counting; void reopens status; cancel/update guards 409; no new transaction and account balances unchanged; Home KPIs (`/api/summary`) and `assetEconomics.pending` unchanged; list by occurrence. (Spec: tenant-obligation-resolution all scenarios; document-linking resolution receipts; obligation-responsibility settled separately.)
- [ ] 4.4 `src/services/economic-overview.js`: ensure `pendingForRange` / owner expense totals exclude tenant portions (via owner-only `remainingAmount`) and that resolutions never enter posted aggregates. Regression tests in `tests/services/economic-overview.test.js` and `tests/routes/economic-overview.test.js`. (Spec: non-ledger behavior, excluded from totals.)
- [ ] 5.1 Frontend (S5): `public/js/pages/obligations.js` resolve dialog (tenant select, period, amount, receipts upload/select, date, notes), void action, `resolved` badge, owner vs tenant portion display; `public/js/api.js` `createResolution`/`voidResolution`/`listResolutions`; bump `CACHE_NAME` (v22). UI contract test for badge and dialog fields. Run full `npm test` regression of existing obligation/payment suites untouched.

## Phase 3 (S6): Unified alerts center

- [ ] 6.1 Create `src/services/alerts.js` exposing `list(db,user,{from,to,type,assetId,holderId,limit})`, read-only: `obligation_due` (uses each obligation's `reminderLeadDays`, overdue always included), `obligation_overdue`, `partial_payment`, `tenant_obligation_pending` (suppressed when active resolution; shared: tenant portion only when owner paid, and no owner alert once owner paid), `rent_due`, `contract_expiry`, `rent_adjustment_due` (open question: derive from rental conditions; fall back to none if absent), `card_installment_due` (scheduled only, `reminderLeadDays`), `account_forecast`, `document_pending`. Excludes `resolved` occurrences and cancelled items; `none` responsibility yields no tenant/owner payment alerts; dedupe by `id`; sort by date asc; default 90-day horizon, default limit 200. Add a rent alert helper in `src/services/rentals.js`. Unit tests `tests/services/alerts.test.js`. (Spec: alerts-center supported types, anticipation, closing rules, resolved excluded.)
- [ ] 6.2 Create `src/routes/alerts.js` (`GET /api/alerts`): validate `from<=to`, `type` in supported set, `assetId` and `holderId` ownership, `limit` 1-1000; register in `src/app.js`. Supertest `tests/routes/alerts.test.js`: 401 unauthenticated, aggregate of multiple types sorted, type filter, asset filter, holder filter, anticipation 15d included / 4d excluded (10 days out), resolved not overdue/partial, resolution closes and DELETE reopens `tenant_obligation_pending`, shared-portion scenarios, request does not mutate data (db snapshot compare), invalid params 400, installment alert 5 days out. (Spec: alerts-center all scenarios; credit-card-installments upcoming alert; obligation-responsibility tenant alert.)
- [ ] 6.3 Frontend: `public/js/api.js` `getAlerts`; surface alerts in the existing dashboard/alert area in `public/js/pages/` (replace or complement per-source alert calls without removing them); bump `CACHE_NAME` (v23). UI contract test.

## Phase 4 (S7): Property monthly view

- [ ] 7.1 `src/services/economic-overview.js`: add `monthlyView(db,user,asset,{from,to})`: default 12 months ending current, max 120, validates YYYY-MM and `from<=to`; per month rent `{expectedMinor, collectedMinor, differenceMinor, currencyCode}` (grouped by currency), obligation rows (`occurrenceId, obligationId, title, responsibilityType, estimatedMinor, actualMinor, status, currencyCode, documentIds, resolutionStatus, resolutionAmountMinor`), per-currency expenses/income/refunds/recoveries maps, claims, documents (asset, obligation, contract, occurrence, transaction links), notes; empty months present with zeros; cancelled excluded; resolutions never added to expenses. Unit tests `tests/services/monthly-view.test.js`. (Spec: property-monthly-view.)
- [ ] 7.2 `src/routes/assets.js`: `GET /api/assets/:id/monthly-view` (404 unknown asset, 400 bad range or >120 months). Supertest in `tests/routes/assets.test.js` or new `tests/routes/monthly-view.test.js`: list of months, rent difference, obligation row with responsibility, attributed expense, document under month, resolved row with `resolutionStatus: resolved` and unchanged expenses, shared row with owner actual and tenant resolved separately, empty months, multi-currency not mixed. (Spec: all property-monthly-view scenarios.)
- [ ] 7.3 Frontend: `public/js/pages/assets.js` monthly view tab (table by month); `public/js/api.js` `getMonthlyView`; bump `CACHE_NAME` (v24). UI contract test.

## Phase 5 (S8): Ownership overlap validation

- [ ] 8.1 Add a shared inclusive-date overlap helper (e.g. `src/utils/ownership-overlap.js` or a function in `src/routes/assets.js`): `startA <= (endB || Infinity) && startB <= (endA || Infinity)`, plus `endDate >= startDate`, percentage 0-100. Unit tests `tests/services/ownership-overlap.test.js`: shared boundary overlaps, adjacent allowed, open-ended overlaps later period. (Spec: inclusive boundary, open-ended.)
- [ ] 8.2 `src/routes/assets.js`: apply the helper on ownership create, batch asset creation (all pairs), and patch (revalidate against other periods, excluding self). Supertest additions in `tests/routes/assets.test.js`: overlapping create 400, adjacent 2025-01-01 accepted, batch overlap 400, open-ended 400, boundary 2024-06-30 rejected, patching an end date that causes an overlap 400, non-overlapping patch ok. Check existing tests/fixtures for legitimately overlapping data and adjust only if a fixture violated the new rule. (Spec: ownership-overlap-validation all scenarios.)
- [ ] 8.3 Frontend: surface the 400 message on the ownership form in `public/js/pages/assets.js` (no schema change). If `public/` changes, bump `CACHE_NAME` (v25).

## Phase 6 (S9): Asset file overview

- [ ] 9.1 Create `src/services/asset-file.js` with `build(db,user,asset,{horizonDays=90})` (1-365): obligations (responsibility, responsible party, status, next occurrence via `occurrencesFor` 90d, resolution status, settling party owner|tenant|third), `upcoming` (obligation, rent, contract expiry, installments, adjustments, reusing `alerts.list({assetId})` rules), `pending` (unpaid/partial occurrences, uncollected rent, `tenant_obligation_pending`, pending documents; resolved excluded), `documents` (asset plus obligation/occurrence/contract/rent/transaction/resolution targets, dedup by id, dangling ignored), `notes` (asset notes, obligation notes, resolution notes), `costLast12MonthsMinorByCurrency` (owner cost only, excludes resolutions), `rentCollectedThisMonthMinorByCurrency`. Read-only, per-currency, cancelled excluded. Unit tests `tests/services/asset-file.test.js`. (Spec: asset-file-overview.)
- [ ] 9.2 `src/routes/assets.js`: `GET /api/assets/:id/file` (404 unknown, 401 unauth, 400 invalid `horizonDays`). Supertest `tests/routes/asset-file.test.js`: sections returned, vehicle insurance due in 20 days in `upcoming`, pending receipt shown / resolved excluded, documents and notes included, who-paid indicator, cost excludes resolution amounts, empty asset returns empty arrays, no mutation. (Spec: all asset-file-overview scenarios.)
- [ ] 9.3 Frontend: `public/js/pages/assets.js` asset file tab; `public/js/api.js` `getAssetFile`; final `public/sw.js` `CACHE_NAME` bump (v26 or next). UI contract test. Final gate: `npm test`, `npm run test:coverage`, verify new services >= 80% lines.

---

## Proposed Slices (auto-chain, direct push to master)

| Order | Slice | Tasks | Est. lines | Leaves master green because |
|---|---|---|---|---|
| 1 | S1 | 1.1-1.4 | ~280 | all optional fields; migration idempotent |
| 2 | S2 | 2.1-2.4 | ~520 | defaults to `owner`; legacy docs valid |
| 3 | S8 | 8.1-8.3 | ~170 | independent; can be pushed any time after S1 (suggested here as a cheap early win) |
| 4 | S3 | 3.1-3.5 | ~720 (split S3a/S3b if >800) | new collections/routes only; no totals change until posting |
| 5 | S4 | 4.1-4.4 | ~600 | legacy status expression unchanged when tenant portion is 0 |
| 6 | S5 | 5.1 | ~300 | UI over an already-deployed API |
| 7 | S6 | 6.1-6.3 | ~520 | read-only endpoint |
| 8 | S7 | 7.1-7.3 | ~450 | read-only endpoint |
| 9 | S9 | 9.1-9.3 | ~480 | read-only endpoint |

Commit rule: one conventional commit per slice (or per backend/UI half), tests included, no AI attribution. Backend always precedes its UI so the deployed UI never calls a missing endpoint.

## Risks

- S4 changes the shared `occurrenceView`/`remainingAmount` semantics; mitigated by the legacy-path snapshot test (4.1) and the KPI regression tests (4.4). Do not merge S5 before S4 is deployed.
- S3 and S6/S7/S9 each touch `src/app.js`, `src/routes/assets.js` and `public/js/api.js`; merge-conflict risk is low with one writer pushing in order.
- Existing fixtures may contain overlapping ownerships (8.2); verify before pushing S8.
- Open questions (installment posting amount override, `rent_adjustment_due` source, resolution amount strictness) have documented defaults in tasks 3.3, 6.1 and 4.2; revisit with the user if the defaults are wrong.
- Rollback: revert the slice commit; new fields/collections are ignorable. Entities holding the new roles must drop them before re-saving under old code (design Migration).
