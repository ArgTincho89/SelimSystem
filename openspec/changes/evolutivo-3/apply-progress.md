# Apply Progress: evolutivo-3

## Slice S1 (ui-localization-and-money-input, sw v32) - done
- [x] 1.1 `format.js`: `statusLabel`, `currencyDigits`, `orderAccountsAsTree` (returns `[{account, label, depth}]`, optional label builder)
- [x] 1.2 `public/js/components/moneyInput.js` (`create/value/setValue/setCurrency/parse` plus `validate/validateAll/refresh/format`); registered in `index.html` and `sw.js` (also `settings.js` added to the asset list)
- [x] 1.3 `statusLabel` applied in `assets.js` (list, legacy lines, history, monthly view, movements, pending-outside-results, contract badge, `rentStatusLabel`), `home.js` pending list, `obligations.js` fallback
- [x] 1.4 `MoneyInput` in `transactionForm.js` (amount, A/B, allocation amounts), `home.js` filters, `obligations.js` (estimated, tenant resolution, payment), `settings.js` (opening balance, transfer sent/received/fee, allocation amounts)
- [x] 1.5 e2e `TransactionForm.fillAmount` -> `#transaction-amount`, Mixto split -> `[data-money-input]`; new scenario "Crear ingreso de seis cifras" (211392 -> ARS 211.392,00); `AccountSettingsPage` needed no change (transfer fills use ids); `sw.js` -> `selimsystem-v32`

Notes:
- Money in `assets.js` (rent amounts, recoveries, deposit, collection dialog) is NOT converted in S1: those dialogs are rewritten in S2/S4b, which use `MoneyInput`.
- Existing `evolutivo2-s8` / `evolutivo2-s10` contract tests updated (first money input via `moneyField` instead of `type: 'number'`).
- Jest in this checkout lists only 45 of the 71 test files via the default `testMatch` crawl (haste/OneDrive quirk, pre-existing); the full suite is run with `--runTestsByPath` over all `tests/**/*.test.js`.
