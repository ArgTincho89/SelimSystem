# Apply progress: Evolutivo 4

Mode: standard (strict_tdd false). Delivery: single PR, `size:exception` recorded, one commit per work unit. No push, no deploy (orchestrator owns both).

## Work units

| Unit | Commit | Status | New / changed tests |
|---|---|---|---|
| W1 shared primitives | `31be607` | done | evolutivo4-modal-width, evolutivo4-due-badge; evolutivo3-s1-format updated |
| W2 /logs screen | `ad1d40f` | done | evolutivo4-logs-contract; evolutivo3-s5 rewritten |
| W3 obligation card + due state | `5e9ebcc` | done | obligation-due-state, obligations-status-pending, evolutivo4-obligations-contract; obligation-status, evolutivo-s2/s5 contracts adjusted |
| W4 register payment | `0d49507` | done | obligation-payment-title-notes, evolutivo4-pay-contract |
| W5 asset obligation history | `80baebc` | done | obligation-history (service), assets-obligation-history (route), evolutivo4-history-contract; e2e AssetsPage "Ficha" |
| W6 transfers UI + Home cleanup | `909e5fe` | done | transfers-notes, evolutivo4-transfer-contract; evolutivo3-s1-status-contract updated |
| W7 release | `7399bb0` | done (7.1-7.3) | evolutivo4-release-contract; rental-batch-contract cache assertion relaxed |

Task 7.4 (commit, PR, merge, deploy to Fly.io, verify success criteria) is intentionally left unchecked: it is the orchestrator's job.

## Test results

Full suite, all 113 files (run per work unit, see note): final result Test Suites 113 passed, Tests 940 passed (baseline before W1: 101 suites, 877 tests).

Environment note: `npm test` / `npx jest` only crawls 13 of the 113 test files in this checkout (the haste crawler on the OneDrive folder skips files; `--no-cache`, `haste: {}` and `watchman: false` do not change it, and it is unrelated to this change). The full suite was therefore run with `npx jest --runTestsByPath $(git ls-files 'tests/*.test.js')` plus untracked tests. CI (clean checkout) is not affected.

## Deviations from design

- `dueBadge` classes: paid -> `badge-resolved` (existing class), cancelled -> `due-cancelled`, pending -> `due-pending` (new muted styles), `due-soon` / `due-overdue` as designed.
- W1 left the Home assertion in `evolutivo3-s1-status-contract` until W6 (the Home block still existed in W1); it was replaced by a "not present" assertion in W6.
- Existing contract tests adjusted in W3: `evolutivo-s2` (responsibility now rendered through `labelValue`), `evolutivo-s5` (badge via `dueBadge`), `obligation-status` (legacy view now carries `dueState`). `rental-batch-contract` hard-coded `v40`; relaxed to `>= 40` in W7.
- `evolutivo3-s5` cache assertion set to `>= 40` in W2 as planned; sw `CACHE_NAME` bumped to v41 once, in W7.
- Obligation card "Cuenta" shows the account name when the account is in the active-account list; the extra "Identificador" line is kept when present. "Cancelar" occurrence action kept (not in the removal list).
- `e2e/pages/TransactionForm.ts` needed no change: its selector already targets `.type-btn[data-type="<type>"]` per type, so the new `transfer` button does not conflict. `e2e/pages/AssetsPage.ts` was changed instead: `undoCollectedMonth` now opens "Ficha" (rent undo lives in the ficha, "Ver historial" is now the lean history).
- Receipt viewer: MIME allowlist uses the base type before `;` (the server stores `text/plain; charset=utf-8`).
- `monthly-view` extraction proof: existing `monthly-view*` suites pass unchanged, and `obligation-history.test.js` asserts monthly-view rows deep-equal `obligationRow(...)` and the exact key set.

## Risks

- Jest haste crawl (above): run the full suite from CI or with `--runTestsByPath` to see the real totals.
- Open question from design still open: auto-mode defaults (orange only in the current month, overdue + next occurrence, history range, cancelled hidden) need user review after deploy.
- E2E (`npm run test:e2e`) was not run in this session.
