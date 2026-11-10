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

## Slice S3 (asset-form-simplify, sw v34) - done
- [x] 3.1 `src/services/asset-age.js` (`ageFor`, `completedYears`, `isValidDay`); `src/routes/assets.js` immovable `cadastralId` (trimmed, <=100 else 400, empty -> null) and `constructionDate` (valid, not future else 400 "La fecha de construcción no puede ser futura", empty -> null); list and detail responses add `age: {years, source}`; legacy `ageYears` is kept and used only without a date. `asset-form.planRental` returns `action:'none'` when `body.rental === undefined` (the UI never sends it); a legacy `rental` payload still works.
- [x] 3.2 `migrateEvolutivo3(db)` (assets part) in `src/services/migrations.js`, called in `src/app.js` after `migrateEvolutivo2`.
- [x] 3.3 `public/js/pages/assets.js`: "Identificación catastral" text, "Fecha de construcción" date with live "Antigüedad: N años/meses" and "Antigüedad (dato anterior): N años"; no condition select or rental block (`renderRentalAndObligations` replaced by `renderObligations`: list, A cargo de, "Nueva obligación", heading "Obligaciones del bien"; "Inquilino" is offered only with an active contract); "Ver" per row opens the edit modal with `{readOnly:true}` (all controls disabled, footer only "Cerrar"); inline "Estás por modificar datos del bien. Revisá los cambios antes de confirmar." with "Confirmar y guardar"/"Volver" before every edit save; holder add/end blocks removed from the details modal (which now shows cadastral, construction date and age). `sw.js` -> `selimsystem-v34`.

Notes:
- Tests: new `asset-age`, `migrations-evolutivo3-assets`, `assets-cadastral-age`, `evolutivo3-s3-contract`. `evolutivo2-s5`/`s7` contract tests rewritten for the removed condition/rental block (obligations behavior still covered); S1/S2 cache-version assertions relaxed to ">= vN" so later bumps do not break them. No e2e feature touched the removed UI.
- Edit save sends no `rental` and no `condition`, so existing contracts are left untouched until the declaration modal (S4b) exists; `condition` stays derived/legacy.
- Read-only "Ver" disables controls by DOM query after build; the "Nueva obligación" shortcut is disabled too.

## Slice S4a (rental-declarations backend, no sw bump) - done
- [x] 4.1 `rentals.js`: `MODALITIES`, `modalityOf`, `grossMinor`, `activeContractsFor` (declaration/asset scope, order locacion, comodato, mutuo); `activeContractFor` returns the first of those. `validateContract` accepts `modality` (derives `contractKind`), `ivaPercent` (0-100, 2 decimals, locacion only) and `declarationId`. Occurrences store `modality`, `netMinor`, `ivaPercent`, `ivaMinor`; `rentMinor` is gross (net x (1 + IVA%)); legacy rows fall back to gross = net. `afterContractWrite` derives asset condition from all active contracts.
- [x] 4.2 `src/services/rental-declarations.js` + `src/routes/rental-declarations.js` (mounted at `/api/rentals/declarations` before `/:id`): POST (201) and GET (`?assetId=`) with 1..3 unique modalities, shared tenants/notes/obligation responsibilities, 409 when the asset already has an active rental. All validation runs before any write.
- [x] 4.3 PUT (edit) and POST `/:id/end`: unpaid occurrences (not superseded by a condition) are hard-deleted, linked documents detached, contract updated, occurrences regenerated lazily; 409 for collected periods outside the new range, currency change after collection, start later than a registered adjustment; `dueDay` follows the new start only when nothing was collected and there are no adjustments. Removed kinds and `/end` end the contract (cancel unpaid > today, tenant obligations back to owner when the asset has no active contract left, asset `not_rented`/`vacant`). Writes run inside a snapshot rollback (rentalDeclarations, contracts, occurrences, assets, obligations, obligationOccurrences, documents).
- [x] 4.4 `migrateEvolutivo3` (contracts part, via `backfillDeclarations`): one declaration per contract without `declarationId`, plus `modality`/`ivaPercent`, only when undefined; idempotent. `GET /declarations` also backfills contracts created by the legacy API after startup. `assets describe` adds `declaration` (no occurrences) and keeps `activeContract`. `api.js` `rentals.declarations.{list,create,update,end}`. Contract and occurrence responses/alerts expose `modality` (legacy fallback) and `ivaPercent`.

Notes:
- Design/user decision: the "start earlier than effectiveDate" wording in tasks was read as "start LATER than a registered adjustment" (an adjustment before the start would be orphaned); moving the start earlier is allowed.
- Collection IVA classification (S2) works with contracts created through the declarations API (A + `ivaIncluded` on the gross amount); covered in `tests/services/rental-iva.test.js`.
- Tests: `rental-iva`, `rentals-declarations-create`, `rentals-declarations-edit`, `migrations-evolutivo3-contracts`; `tests/helpers/rent-fixture.js` gained `modality/declare/edit/collectModality`.
- No sw bump (no UI). `end` endpoint and `api.js` stayed in S4a (fallback not needed).

## Slice S4b (rental-declaration modal UI, sw v35) - done
- [x] 4.5 `public/js/pages/rentalDeclaration.js` (new, loaded in index.html and cached in sw.js) and `assets.js`: "Declarar/Editar alquiler" modal, modality checkboxes with per-modality fieldsets, MoneyInput amounts, IVA only in locacion with live "Total con IVA", shared obligations/notes, "Seleccioná al menos una modalidad", inline save warning, server 409 messages surfaced, read-only in "Ver", "Finalizar alquiler" via `/end`.
- [x] 4.6 `modalityLabel`/`totalWithIva` in `format.js`; modality labels in Avisos, pending occurrences, contract list and history. sw `selimsystem-v35`.
- Tests: `tests/ui/evolutivo3-s4-contract.test.js`; e2e `rental-declaration.feature` (+ `AssetsPage.ts`, `assetsSteps.ts`). Jest 85 suites/753 tests, coverage thresholds pass, e2e 79/79 scenarios.
- Out of scope: S4c (month-level aggregation, collection dialog).
