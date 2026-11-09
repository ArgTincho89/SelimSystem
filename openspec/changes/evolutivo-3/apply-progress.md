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

## Slice S2 (rent-collection-corrections, sw v33) - done
- [x] 2.1 `POST /api/rentals/collections`: `clasificacion` A/B (else 400), `method` optional (<=100), fingerprint drops `paymentMethodId` and adds `clasificacion`; contracts sharing one `ivaPercent > 0` produce `clasificacion:'A'`, `ivaPorcentaje`, `ivaIncluded:true` (override A/B; B drops IVA). `getIncomeIva` uses `a*r/(100+r)` when `ivaIncluded`.
- [x] 2.2 `rentals.reverseCollection` + `POST /api/rentals/collections/:id/reverse`: 409 for reversed, reconciled (`date < openingDate` or in `includedMovementIds`), refund/normalization/movementAllocations; tombstone (`reversedAt`, `reversedTransactionId`); documents detached (`transactionId:null`, `detachedFromCollectionId`); replay of the idempotency key -> 409. List and payment-method reference check skip tombstones; failure restores removed records and returns 500.
- [x] 2.3 `DELETE /api/transactions/:id` with `rentCollectionId` delegates to `reverseCollection`; `PUT` returns the 409 guidance message.
- [x] 2.4 UI: `API.rentals.reverseCollection`; `showRentCollectionModal(..., {single:true})` (one period, no month list, no "Medio reutilizable", optional "Medio de cobro", Clasificación select prefilled from contract IVA, primary account default, `MoneyInput`, idempotency key once per open); `alerts.js` passes `{single:true}`; "Anular cobro" with inline confirmation on collected occurrence rows; Transacciones delete of a rent collection needs a second click and explains the period returns to pending; `sw.js` -> v33.

Notes:
- Tests: new `tests/helpers/rent-fixture.js` (shared fixture), `rentals-collection-classification`, `rentals-reverse`, `transactions-rent-delete`, `income-iva-included`, `evolutivo3-s2-contract`. Updated `rentals.test.js` (DELETE of a collection tx is no longer 409) and the S1 contract test cache version (v33).
- The `ivaPercent` contract field is seeded directly in tests; the declarations API arrives in S4a. The dialog reads `ivaPercent` from the contract response.
- Asset-level "Registrar cobro" keeps multi-period selection (now with MoneyInput and no reusable method).
