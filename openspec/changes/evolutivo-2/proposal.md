# Proposal: Evolutivo 2

## Intent

Make the "Nuevo bien" form exactly match `request.md`, add Titular/Inquilino/Proveedor configuration, simplify obligations, and settle payments correctly: owner-paid debits the titular's account (Home expenses/savings), tenant-paid stays off-ledger but goes into asset history with a receipt.

## Scope

### In Scope
- Settings tabs Titular, Inquilino, Proveedor (person/organization fields, provider expense category); account titular select uses them.
- Movable/immovable form rewritten per request; holders with required % when >1 (sum 100).
- Condición Alquilado/Usufructo inline block backed by a rental contract (tenant, dates, original amount + currency, adjustment frequency/criterion).
- Asset obligations section ("Proveedor - Cuenta/Contrato Nº"), Titular/Inquilino selector, notes.
- Obligation form: no payment method, provider prefills category, single number field, default responsible = asset titular.
- Pay dialog (account resolution, optional payment method, receipt upload); view/download links in asset file and monthly view.

### Out of Scope
- New movable types beyond Automóvil; category changes; cadastral number field.
- Deleting legacy asset fields, `legalOwners.name`, or shared/third responsibility data.

## Capabilities

### New Capabilities
- `party-config-tabs`: Titular/Inquilino/Proveedor CRUD, person vs organization, derived `name`, `/entities` redirect.
- `asset-form-rewrite`: typed movable/immovable schema, validation, legacy backfill, filters, holder % rules.
- `asset-rental-inline`: condition-to-contract bridge, new adjustment fields, prefill.
- `asset-obligations-section`: per-asset obligation list, responsible selector (future unpaid occurrences only).
- `obligation-form-simplification`: paymentMethod removed from obligation, provider-to-category, default responsible.
- `payment-and-receipts`: pay dialog, titular-to-account debit, receipts, online view/download.

### Modified Capabilities
None in `openspec/specs/` (empty). Baseline change-local behavior amended: `obligation-responsibility`, `tenant-obligation-resolution`, `document-linking`, `property-monthly-view`, `asset-file-overview`, `alerts-center`.

## Approach

Additive fields plus an idempotent startup backfill (`src/services/migrations.js` pattern). Legacy values stay stored and readable. Tenant-paid keeps the `obligationResolutions` path, so it never touches the ledger or KPIs.

| Phase | Slice | Depends |
|---|---|---|
| 1 | party-config-tabs | — |
| 2 | asset-form-rewrite | 1 |
| 3 | asset-rental-inline + asset-obligations-section | 2 |
| 4 | obligation-form-simplification | 1 |
| 5 | payment-and-receipts | 3, 4 |

Each slice ships to master and leaves it deployable.

## Assumptions pending user confirmation

- Q1 Identificación catastral: section header grouping obligation account numbers; no input.
- Q2 Editing holders closes old periods and opens new ones from today.
- Q3 `/entities` redirects to Settings; one party may hold several roles.
- Q4 `responsibilityType` owner/tenant only in UI; changes apply to future unpaid occurrences.
- Q5 Asset form lists linked obligations plus a prefilled "Nueva obligación" shortcut.
- Q6 Usufructo uses the Alquilado block, with the usufructuary picked from Inquilinos.
- Q7 Category prefilled from provider, overridable, still required to pay.
- Q8 Debited account: titular's active accounts in occurrence currency; one auto-selected, otherwise primary of the largest-% titular; always changeable.
- Q9 Monto original currency: chosen from the existing currency list (ARS, USD, EUR), default ARS. No question.
- Q10 Payment method is optional and set in the pay dialog only.

## Affected Areas

| Area | Impact |
|---|---|
| `src/routes/owners.js`, `public/js/pages/settings.js`, `entities.js` | Modified |
| `src/routes/assets.js`, `public/js/pages/assets.js` | Modified |
| `src/services/rentals.js` | Modified |
| `src/services/obligations.js`, `src/routes/obligations.js`, `public/js/pages/obligations.js` | Modified |
| `src/routes/documents.js`, `src/services/migrations.js` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| usageStatus to condition backfill loses meaning | Med | keep original field; map only blanks |
| Inline contract hits collection constraints (`rentals.js:125`) | High | defaults; update-in-place only |
| Wrong account debited (co-owners/currency) | High | explicit dialog choice; tests |
| Tenant payment leaks into KPIs | Med | resolution path only; tests |
| `legalOwners.name` readers break | Med | derive and persist `name` |

## Rollback Plan

Revert the slice's commits. New fields and collections are ignored by older code. The backfill only adds data (it never deletes or overwrites), so legacy fields keep working. Payment transactions created by the new dialog are ordinary expense transactions and can be deleted with existing tools.

## Dependencies

Baseline `evolutivo` deployed (resolutions, documents, monthly view, asset file).

## Success Criteria

- [ ] Asset form fields match `request.md` exactly per type.
- [ ] Three party tabs work; accounts/assets/contracts select from them.
- [ ] Owner payment debits the titular account and changes Home expenses/savings; tenant payment changes nothing financial and appears in asset history.
- [ ] Receipts viewable/downloadable from the asset file and monthly view.
- [ ] Legacy data still readable; backfill idempotent; existing tests pass.

## Proposal question round

Auto mode. Orchestrator defaults for the remaining questions (pending user review): legacy movable/immovable fields (acquisition, status, address parts, area, subtype) are hidden from the form and shown read-only in the asset detail under "Datos anteriores" when present; if no titular account matches the occurrence currency, the pay dialog lists all active accounts in that currency with a warning, and if none exist payment is blocked with an explanatory message.
