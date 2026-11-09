# Proposal: Evolutivo 3

## Intent

Address production feedback on evolutivo-2 (`request.md`): action logs, bank sub-accounts, a simpler asset form with a separate "Declaración de alquiler" (locación/comodato/mutuo), Spanish-only labels, formatted money inputs, single-period rent collection, and a way to undo a wrong rent collection.

## Scope

### In Scope
- Timestamped log of every write action, shown in a "LOGS" section inside Perfil → "Acciones de cuenta" (`public/js/pages/profile.js`), listing the user's own actions in plain Spanish with day, hour and minute (confirmed by user).
- Child sub-account with its own currency; income/expense/refund assignable to account or sub-account.
- Asset form: optional cadastral text, construction date (age computed), no condition on create, "Ver" read-only, holder blocks removed from details, full edit with warning on save.
- Rent declaration modal with 1–3 modalities; IVA % for locación only; shared obligations/notes.
- Spanish status labels; money inputs shown as "211.392,00".
- Avisos collection: selected period only, no "Medio reutilizable"; reverse a collection back to pending.
- Rent collection with IVA not reported as B. Cause inferred: collection stores `clasificacion:null`, which income reporting maps to B.

### Out of Scope
- Sub-accounts deeper than one level; cross-currency aggregation.
- Deleting legacy fields (`ageYears`, `condition`, `contractKind`).
- Logging request bodies or read (GET) traffic.

## Capabilities

### New Capabilities
- `ui-localization-and-money-input`: `statusLabel()`, `MoneyInput`, E2E page-object updates.
- `rent-collection-corrections`: single-occurrence dialog, IVA classification, reverse collection.
- `asset-form-simplify`: cadastral, construction date, no condition on create, read-only "Ver", full edit.
- `rental-declaration-modal`: modalities, IVA, per-modality occurrences, legacy migration.
- `audit-log`: middleware, `activityLogs`, retention, Spanish action descriptions, Perfil "LOGS" section.
- `sub-accounts`: `parentId`, validation, balances, selects, pay-dialog ranking.

### Modified Capabilities
None in `openspec/specs/` (empty). Change-local behavior amended: `asset-rental-inline`, `asset-form-rewrite`, `payment-and-receipts`, `alerts-center`.

## Approach

Add-only fields and collections plus an idempotent startup migration `migrateEvolutivo3` in `src/services/migrations.js` (legacy contract → one modality; never deletes or overwrites).

| Phase | Slice | Depends |
|---|---|---|
| 1 | ui-localization-and-money-input | — |
| 2 | rent-collection-corrections | 1 |
| 3 | asset-form-simplify | 1 |
| 4 | rental-declaration-modal | 3 |
| 5 | audit-log | — |
| 6 | sub-accounts | 1 |

Auto-chain, each slice ≤ 800 review lines, deployable on master.

## Defaults pending user confirmation

- Q1 Cadastral is a new text field; obligation list moves to "Obligaciones del bien".
- Q2 Balances per account/currency; children under parent; sub-account never primary; parent with active children not archivable; child with movements archived, not deleted.
- Q3 Locación with IVA → `clasificacion:'A'` + `ivaPorcentaje`; editable in dialog.
- Q4 One occurrence per modality per period; locación = original × (1 + IVA%).
- Q5 Legacy `rental` → locación, `usufruct` → comodato; `ageYears` shown as "dato anterior".
- Q6 Logs (placement and format confirmed: Perfil → "Acciones de cuenta" → "LOGS", own actions, plain Spanish, day/hour/minute). Defaults: writes incl. failures, no bodies/credentials, 12-month retention.
- Q7 Money formatted on blur, es-AR, currency precision.
- Q8 "Añadir titularidad" and "Finalizar titularidad hoy" removed.
- Q9 Start-date edit rejected only if a collected period falls outside; unpaid regenerated.
- Q10 Reverse blocked if account reconciled after collection date; receipts kept.

## Affected Areas

| Area | Impact |
|---|---|
| `src/app.js`, new log middleware/route, `public/js/pages/profile.js` | Modified/New |
| `public/js/pages/settings.js` (sub-accounts UI) | Modified |
| `src/routes/accounts.js`, `src/services/account-ledger.js`, `src/services/obligations.js` | Modified |
| `src/routes/assets.js`, `public/js/pages/assets.js`, `asset-form.js` | Modified |
| `src/services/rentals.js`, `src/routes/rentals.js`, `src/routes/transactions.js` | Modified |
| `public/js/pages/alerts.js`, `e2e/pages/*.ts`, `src/services/migrations.js` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| E2E `fillAmount` selects `[type="number"]` | High | `data-money-input` selector; update page objects in slice 1 |
| Sub-account double counting in KPIs | High | count each account once; no cross-currency sums; tests |
| Collection reversal breaks ledger / idempotency resurrects it | Med-High | atomic removal of allocations+collection+transaction; reconciled guard; tests |
| Per-modality occurrences break allocation/alerts | High | migration to one modality; tests on legacy data |
| `activityLogs` file growth / secret leakage | Med | retention; no bodies |

## Rollback Plan

Revert the slice's commits. New fields/collections are ignored by older code; `migrateEvolutivo3` only adds data, so legacy fields keep working. Reversed collections are not restorable by rollback; re-register them.

## Dependencies

Evolutivo-2 deployed (`23d8c93`).

## Success Criteria

- [ ] Every request item traceable to a passing scenario.
- [ ] No English status words in the UI; money inputs formatted.
- [ ] Avisos collects one period; reversal returns it to pending.
- [ ] IVA rent collection not reported as B.
- [ ] Perfil "LOGS" lists the user's own actions in Spanish with day, hour and minute.
- [ ] Migration idempotent; existing tests pass.

## Proposal question round

Auto mode; Q1–Q10 above need user review. Highest-impact: Q3 (B cause inferred), Q4, Q9, Q10.
