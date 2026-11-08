## Exploration: account-configuration

### Current State

**Verified architecture and behavior**

- The app is a Node.js/Express API with a static, Spanish-language browser client (`src/app.js`, `public/js/*`). It has mobile bottom navigation and an optional desktop sidebar/home workspace (`public/js/app.js`, `public/css/base.css`, `public/css/pages.css`). The browser calls authenticated, same-origin JSON routes through `public/js/api.js`.
- `JsonDB` stores JSON arrays in per-user files under `DATA_DIR/<userId>/<collection>.json`; users are in a global file. Reads are cached and each collection write uses a temporary file and rename (`src/db/jsondb.js`). There is no account/currency schema, migration framework, cross-file transaction, or ledger reconciliation. A file write is atomic per collection, not across a transfer's legs or other related records.
- Transactions currently store `tipo`, numeric `monto`, `fecha`, category and existing income/recurrence fields. API create/update rounds amounts to cents with JavaScript `Number`; no currency or account is stored, no movement status exists, and there are no transfer/conversion/allocation resources or routes (`src/routes/transactions.js`). No database migration or data prevalidation path was found. `src/services/cron.js` contains weekly JSON backup code, but `src/server.js` does not call `startCronJobs`; automatic backup execution is therefore not evidenced by the app entry point.
- **Refund behavior is authoritative in the current application:** refunds are a distinct `refund` type, are excluded from income, and reduce expense totals (`gastosNetos = gastos - reembolsos`) and category net spend. Savings are `income - net expenses`. This is covered by `src/routes/summary.js` and tests in `tests/routes/summary.test.js` (including refund-only behavior), `tests/routes/trends.test.js`, and UI scenarios in `e2e/features/ui/home-dashboard.feature` and `e2e/features/ui/transactions.feature`. Refunds require a category but are not linked to a source expense or account. Preserve this verified convention; the cross-currency/source-link treatment still needs a product decision.
- **Historical currency is not authoritative/persisted:** the amount fields have no currency code. UI rendering assumes EUR via `formatearEuro` (`public/js/utils/format.js`), while number formatting uses `es-AR` and date labels use `es-ES`. This is a presentation convention, not evidence that every historical transaction was actually EUR. Migration must not infer historical currency from the display or future primary-currency setting.
- Monthly summary, goals, burn-rate, and trends aggregate numeric amounts without currency partitions (`src/routes/summary.js`, `src/routes/trends.js`). Summary and savings calculations are tested, including negative savings, but all totals implicitly assume one currency. Income A/B is an existing classification breakdown, not currency. There is no normalization/conversion representation or original-vs-adjusted breakdown.
- **Recurrence behavior is authoritative but not posting behavior:** a recurring transaction is a stored template. `getMonthTransactions` synthesizes virtual instances on query (`isRecurringInstance` / synthetic IDs); summary, trends, burn-rate, and transaction listing consume these instances. There is no scheduled/posted status, persisted occurrence, balance, or one-time posting mechanism. Editing a generated instance submits its `originalId`, so it edits the template/series; no “this occurrence vs this and future” operation exists. Existing coverage is in `src/utils/recurring.js`, `tests/utils/recurring.test.js`, `tests/routes/transactions.test.js`, and E2E recurring scenarios.
- The transaction API supports list (optionally month), recurring total, get-by-ID, create, update, and delete. Summary supports monthly results and burn-rate; trends supports date range and category filtering. There are no accounts, settings, transfer, conversion-history, alert, forecast, or currency-filter endpoints. Transaction list filtering is currently client-side in `public/js/pages/home.js` and covers type/category/classification/text/amount/date only.
- Home shows three one-currency monthly KPI values plus transactions; desktop adds analytics tabs and charts. Mobile and desktop use different home layouts. Privacy is a local-storage toggle (`pate_hide_income`) that blurs only income and savings KPI values; transaction rows/details, summary, charts, trends and other amounts remain visible. No account cards, account selection, or account filter indicator exists. No financial Settings section exists; `/profile` is account identity/security management, not app preferences.
- `src/services/cron.js` implements only weekly backup logic (and is not wired in `src/server.js`). No alert model, daily job, forecast, scheduled movement lifecycle, or internal alert surface was found. No money-in-transit or transfer behavior exists.
- Tests are split between root Jest (`tests/routes`, `tests/utils`, `tests/db`) and the separate Playwright/Cucumber suite under `e2e/`; package scripts run them separately. Existing tests cover transaction validation, refund math, recurrence synthesis, JSONDB, summaries, trends, and some mobile/desktop UI behavior. No account, currency, transfer, conversion, allocation, migration, balance, forecast, alert, or comprehensive amount-privacy tests were found. Tests were not run in this read-only phase.

**OpenSpec context and constraints**

- Native `gentle-ai sdd-status account-configuration --json --instructions` initially reported `artifactStore: openspec`, planning home `openspec`, `changeRoot: null`, and no active change. After creating the change folder and exploration artifact, status resolves `changeRoot` to `openspec/changes/account-configuration` and reports no proposal/spec/design/tasks yet. Its generic `nextRecommended` is `propose`; the phase instruction for this change explicitly requires `sdd-research` before proposal, so the next phase here is research. The folder was created for this exploration artifact only.
- No `openspec/config.yaml` or existing files under `openspec/specs/` were present to supply project-specific OpenSpec rules or source specifications. No application source or existing artifact was changed.
- The supplied scope retains all 23 acceptance criteria below. This is a large, high-risk cross-cutting financial ledger change; exploration does not authorize a narrower scope or select product behavior.

### Affected Areas

- `src/db/jsondb.js`, `src/db/seed.js`, `src/config.js` — user-scoped persistence, initial data, backup/data paths; no account migration or multi-record transaction support.
- `src/routes/transactions.js`, `src/routes/summary.js`, `src/routes/trends.js`, `src/utils/income.js`, `src/utils/recurring.js`, `src/services/cron.js`, `src/server.js` — movement/refund/recurrence semantics, totals and charts, and lack of posting/alert scheduling.
- `src/app.js`, `public/js/api.js`, `public/js/app.js`, `public/js/router.js`, `public/js/pages/home.js`, `public/js/pages/summary.js`, `public/js/pages/trends.js`, `public/js/pages/profile.js`, `public/js/components/transactionForm.js`, `public/js/utils/format.js`, `public/index.html`, `public/css/*` — API registration, settings navigation, account/transfer/forms, multi-currency rendering, privacy and responsive UI.
- `tests/routes/transactions.test.js`, `tests/routes/summary.test.js`, `tests/routes/trends.test.js`, `tests/utils/recurring.test.js`, `tests/db/jsondb.test.js`, `e2e/features/{api,ui}/*` — regression coverage to extend for the 23 criteria and existing behavior.

### Approaches

1. **Introduce explicit ledger entities on the current JSONDB** — keep ordinary movements distinct from accounts, transfers, fees, normalization allocations, and alerts; compute balances and summaries from those records.
   - Pros: extends the current stack and keeps transfer/conversion lineage explicit; avoids pretending transfers are income/expense.
   - Cons: JSONDB has no cross-collection transaction or referential constraints, so paired transfer legs, allocation recalculation, migration idempotency and concurrent edits need a new integrity mechanism. Financial `Number` arithmetic also needs replacement or strict decimal/minor-unit boundaries.
   - Effort: High.

2. **Move financial records to a transactional relational store before adding ledger features** — model accounts, movements, transfer legs, fees and allocations with constraints and transactional updates; retain/rebuild the browser and API around it.
   - Pros: natural atomicity and referential integrity for linked legs/dependencies; more suitable for durable migrations and derived-balance reconciliation.
   - Cons: substantial infrastructure and migration work; existing JSON users, backup/restore and deployment operations need a validated transition path.
   - Effort: High/Very high.

Both approaches can respect the functional invariants. Persistence selection is an engineering tradeoff for research/design, not a product decision made here. Neither option permits silently dropping normalization, migration, or alerts.

### Recommendation

Proceed to **`sdd-research` before proposal**, then return unresolved product questions to the owner. Research should compare the integrity/migration cost of preserving JSONDB versus a transactional store; define a decimal/minor-unit strategy; trace per-user settings, account lifecycle and recurrence creation/posting; and determine how future daily alert evaluation can run given that the existing cron service is not started. Preserve the verified refund calculation as the compatibility baseline and add currency-aware rules only after the owner resolves how legacy and cross-currency refunds are attributed. Do not infer legacy currency, choose an opening-balance cutoff, or propose implementation scope until those decisions are confirmed.

### Acceptance Criteria Traceability

`Gap` means no supporting current capability was found; `Partial` means related current behavior exists but does not satisfy the criterion. These are exploration findings, not acceptance or rejection of scope.

| ID | Criterion (preserved) | Current evidence / status |
|---|---|---|
| CA01 | Five accounts show five cards with name, currency and balance. | **Gap** — no account model, balance or account cards. |
| CA02 | A 2,500 EUR salary increases BBVA and EUR income by 2,500. | **Partial** — income summary is tested, but no account assignment/balance and no persisted currency. |
| CA03 | A 1,100 EUR BBVA-to-ING transfer updates both balances only. | **Gap** — no transfer or balance concept. |
| CA04 | Show 2,500 EUR / 1,000 USD / 400,000 ARS separately. | **Gap** — all amounts are implicitly aggregated and formatted as EUR. |
| CA05 | Linking 1,000 USD to 900 EUR yields normalized income 3,400 EUR / 400,000 ARS. | **Gap** — no conversion or normalization allocation. |
| CA06 | Then link 400,000 ARS to 300 EUR for 3,700 EUR while retaining originals. | **Gap** — no conversion lineage or normalized representation. |
| CA07 | Assigning 400 of 1,000 USD to 360 EUR leaves 600 USD / 360 EUR represented. | **Gap** — no partial allocations or rounding/lineage behavior. |
| CA08 | An unlinked conversion changes balances only. | **Gap** — no conversions or balances. |
| CA09 | A savings conversion creates no current-month income. | **Gap** — no transfer/conversion type; current income is only transaction `income`. |
| CA10 | A later conversion normalizes the original income period and shows its later normalization date. | **Gap** — summaries use only original transaction dates; no adjustment history. |
| CA11 | Prevent double allocation and preserve chained-conversion traceability. | **Gap** — no allocation/dependency model. |
| CA12 | An explicit fee is counted once as an expense. | **Gap** — no transfer or linked fee model; ordinary expenses do count in the existing summary. |
| CA13 | Savings are calculated by currency, without cross-currency summation. | **Gap** — current savings is a single numeric `income - (expenses - refunds)` total. |
| CA14 | A scheduled expense leaves current balance unchanged but forecasts; posting changes balance once. | **Partial** — recurrence creates virtual future list/summary instances, but no statuses, forecast, balance or posting-once mechanism. |
| CA15 | A recurring expense retains its account and supports edit-one/edit-future behavior. | **Partial** — recurrence template/frequency exists, but there is no account; editing a virtual instance edits its original template/series. |
| CA16 | An ING -250 EUR deficit within five days alerts with account/item/date/need. | **Gap** — no forecast or alert system. |
| CA17 | Another account's balance does not clear the ING alert without a sufficient planned inflow. | **Gap** — no per-account balance or planned movement model. |
| CA18 | A sufficient scheduled transfer marks the alert covered without changing current balance. | **Gap** — no transfers, scheduled status or alerts. |
| CA19 | Editing/deleting a transfer updates both sides and normalization dependents. | **Gap** — no linked transfer legs or allocation dependencies; JSONDB writes are not cross-file transactional. |
| CA20 | Changing primary currency does not rewrite movements or balances. | **Gap** — no primary-currency preference, stored movement currency or account balance. |
| CA21 | Privacy hides all new sensitive amounts. | **Partial** — current toggle covers income/savings KPI only; other amounts in rows, details and analytics remain visible. |
| CA22 | Migration preserves historical results before explicit normalization. | **Gap** — no migration implementation; currency is absent from existing transaction records. |
| CA23 | No chart sums currencies invisibly. | **Gap** — charts currently receive single totals that are aggregated without currency metadata. |

### Verified Findings, Gaps, Conflicts, Assumptions, and Product Decisions

- **Verified:** existing refund treatment is expense reduction, not additional income. Tests establish numeric behavior, but they do not establish an account/source-expense link or multi-currency refund behavior.
- **Verified gap:** current UI's EUR marker is not historical currency data. All legacy transaction currency assignments require explicit confirmation or user mapping before conversion/migration.
- **Verified gap:** recurring rows are synthesized on reads, not posted ledger movements. The functional requirement for scheduled-vs-posted balance effects cannot be mapped to an existing authoritative posting mechanism.
- **Verified gap:** accounts and reference-date balance cutoffs do not exist. The provided spec defines opening balance at the start of the reference date and applies movements after it; no existing cutoff can be reused. Entering a present balance alongside historical movements requires an explicit, reviewable migration mapping to avoid double-counting.
- **Verified gap:** alert timing has no existing scheduler. A weekly backup implementation exists but is not started by `src/server.js`; there is no evidence of daily forecast/alert execution.
- **Conflict to resolve:** the app's legacy presentation assumes EUR, but the functional spec forbids inferring existing data currency from settings. Display convention and migration evidence are not equivalent.
- **Assumptions explicitly not made:** no assumption that every legacy movement is EUR; that a primary-currency change converts data; that a generated recurrence has been paid; that an account balance equals monthly savings; or that a conversion source can be inferred from the origin account.
- **Product-owner decisions needed before proposal:** (1) how the user confirms/maps actual currency per existing movement or historical period and how migration handles unknowns; (2) how to set a safe opening-balance/reference-date cutoff for users whose entered balance already includes transactions; (3) how legacy category-only refunds map to the new selected account and what to do when the original expense/account is unknown, while retaining the proven global refund convention; (4) what an occurrence-level recurrence edit means for already generated/unposted instances and what action posts a scheduled occurrence exactly once; (5) where Settings is reachable in mobile navigation as well as the requested desktop sidebar; (6) whether internal alerts are evaluated only when the app is open or by a continuously available background service, and how missed daily reviews behave. The default five-day advance, 30-day horizon, no market quote, no automatic send, and no cross-currency guessing are already specified and are not reopened here.

### Risks

- **High financial-integrity risk:** multi-file JSON writes do not provide atomic transfer/fee/allocation updates; partial persistence or concurrent edits could create unbalanced transfers or orphan normalization links.
- **High historical-data risk:** currency is absent, and no migration or active automated backup path is evidenced; incorrect currency/cutoff mapping can silently rewrite financial meaning or double-count balances.
- **High calculation/regression risk:** current summary, goals, burn rate and charts assume one currency, while refund reductions and recurring pseudo-instances feed them. A single totals change can affect multiple views and historical periods.
- **High recurrence/alert risk:** virtual recurrence instances are not posted movements, and no daily scheduling path exists; treating them as both forecast and current balance would violate the specified cutoff.
- **High privacy/accessibility risk:** existing amount masking is narrow. New cards, lists, alerts, filters and details must consistently hide amounts and remain keyboard/screen-reader usable across mobile and desktop layouts.
- **Broad verification risk:** root Jest and separate E2E suites have no single aggregate command (per session preflight); implementation will need explicit verification gates per layer and strong deterministic money/ledger regression coverage.

### Ready for Proposal

**No.** The research/pre-proposal gate should run immediately. Resolve the product-owner decisions above before drafting a proposal; keep the complete 23-criterion scope visible, especially the migration currency/cutoff, recurrence posting, refund attribution, normalization lineage and alert-scheduling requirements.

### Pending Research Selection

Status: selected — the user chose to investigate first, so research completion is mandatory before proposal.

Reason: Exploration identified high financial-integrity and migration risks and recommends technical research before proposal. Selecting research makes that phase mandatory before any proposal.

Allowed choices:
- `run-research` — run and complete `sdd-research` before resolving proposal readiness.
- `skip-research` — do not run that phase; still resolve all product-owner decisions listed above before proposal.

No proposal may be created while this selection is pending.
