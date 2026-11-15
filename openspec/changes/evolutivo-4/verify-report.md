# Verification Report: evolutivo-4

Mode: openspec, standard (Strict TDD off). Range: e19289c..9cca1ae.

## Verdict: PASS WITH WARNINGS

## Completeness
Tasks: 26 of 27 checked. Only 7.4 (commit/PR/deploy) is unchecked, as expected (the orchestrator deploys after verify). All W1-W7 work units are committed.
Specs: 5 capabilities, 74 scenarios (counted from the `#### Scenario` headings).

## Execution evidence
- Full suite by path: `npx jest --forceExit --runTestsByPath <113 files>` gave 112 suites passed and 1 failed. 939 tests passed and 1 failed, out of 940.
- The one failure is `tests/routes/rentals-declarations-create.test.js` > "creates one contract per modality". It hits the 5000 ms Jest timeout; the first test in the file is slow, about 7.5 s on this OneDrive checkout.
- I ran the same test at the baseline commit e19289c in a temporary worktree and it failed the same way (7487 ms). It is pre-existing and environmental, not a regression. The suite and the files it covers are not touched by the evolutivo-4 diff. The temporary worktree has been removed.
- App boot: `node -e "require('./src/app')"` printed `boot ok` and exited.
- Build/type-check: none configured (plain JS).

## Spec compliance (evidence)
- activity-log-screen: PASS. `public/js/pages/logs.js` is wired in `public/sw.js:31` (STATIC_ASSETS). The route, nav alias, "Logs" button in Perfil and the removal of `renderLogsSection` are asserted in `evolutivo4-logs-contract.test.js` (passed). CSS `.log-row` is in `components.css:636`.
- obligation-card-and-status: PASS. `dueStateFor` is at `src/services/obligations.js:29` and is exported. `obligation-due-state.test.js` and `obligations-status-pending.test.js` passed. The "Previsto" and "Confirmar" count in `obligations.js` is 0. `.due-overdue` and `.label-value` are in CSS.
- obligation-payment-registration: PASS. `suggestedPaymentMethodId` is at `src/services/obligations.js:592`. `obligation-payment-title-notes.test.js` and `evolutivo4-pay-contract.test.js` passed.
- asset-obligation-history: PASS. The route is at `src/routes/assets.js:299`. `obligation-history.test.js`, `assets-obligation-history.test.js` and `evolutivo4-history-contract.test.js` passed. The iframe has no `sandbox` attribute (grep found none in `assets.js`). The `monthly-view` suites pass, so extracting `obligationRow` did not change output.
- account-transfers-ui: PASS. `renderTransferFields` is at `transactionForm.js:613,647`. `renderEconomicContext` and the "Movimiento entre cuentas" text are gone from `home.js`. `transfers-notes.test.js` and `evolutivo4-transfer-contract.test.js` passed.
- Release: `sw.js:1` has CACHE_NAME `selimsystem-v41`. `package.json` is 1.12.0. The CHANGELOG has a `[1.12.0]` entry. `evolutivo4-release-contract.test.js` passed.

Limitation: the UI scenarios are covered by source/vm contract tests, not browser tests. Runtime behavior in a real browser (receipt iframe/zoom, dialog flows) is not exercised. The e2e suite was not run.

## Design coherence
No deviations found. The single sw bump, the additive Modal `width` option, the non-atomic receipt upload and the unchanged overview API are all as designed.

## Issues
CRITICAL: none.

WARNING:
1. `tests/routes/rentals-declarations-create.test.js` fails on timeout in this environment. It also fails at the baseline, so it is pre-existing and unrelated. Consider a larger per-test timeout.
2. The browser-level behavior in the spec scenarios (PDF/image viewer, zoom, upload flow) is verified only by static and vm contract tests. A manual smoke test is advised after deploy.
3. `npm test` in this OneDrive checkout skips files in the jest crawler. The suite had to be run by path.

SUGGESTION:
- Add a Playwright e2e check for "Registrar pago" with a receipt and for the "Transferencia" type.
