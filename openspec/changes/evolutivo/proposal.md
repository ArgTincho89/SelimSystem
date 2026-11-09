# Proposal: Evolutivo

## Intent

Close gaps between the implementation and `docs/functional-specification.md`, delivering only genuinely-new capabilities; already-solid domains are not re-planned.

## Scope

### In Scope

- Credit card installments with interest and future occurrences.
- Obligation responsibility (owner/tenant/shared/third/none) with split rules.
- Unified alerts center with per-obligation lead time.
- Receipts linked to occurrence, rent period, tenant, transaction.
- Monthly property view; shared-ownership overlap validation; obligation external id.
- Tenant-paid obligation resolution without a financial transaction (incl. tenant portion of shared obligations).
- Holder roles `payment_responsible` and `other`.
- Consolidated asset file (obligations, upcoming due dates, pending items, docs, notes).

### Out of Scope

- Verified solid, not re-planned: account holder/currency/reconciled balance/archive, unlimited payment methods per account, allocations (general/assets/obligation/contract/rent period), claims + recoveries, per-currency Home KPIs, movable/immovable assets with optional subtypes, sessions.
- Transaction holder stays derived from account (income keeps `incomeHolderId` snapshot).
- Backup cron startup (risk only).

## Capabilities

### New Capabilities

- `credit-card-installments`, `obligation-responsibility`, `alerts-center`, `document-linking`, `property-monthly-view`, `ownership-overlap-validation`, `obligation-external-identifiers` (existing change specs).
- `tenant-obligation-resolution`: record fulfilled occurrence, tenant, period, amount, receipts, `resolvedAt`; non-ledger; closes `tenant_obligation_pending`.
- `holder-roles`: extend legal-owner roles with `payment_responsible`, `other`.
- `asset-file-overview`: one read model answering every asset-file question.

### Modified Capabilities

None in `openspec/specs/`. Change-local specs to amend: `alerts-center`, `obligation-responsibility`, `property-monthly-view`, `document-linking`.

## Approach

Additive: optional fields, new `obligationResolutions` collection, occurrence status `resolved` (never counted as owner expense), widened role set, read-only asset-file aggregation over existing services.

## Phases

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | External id, responsibility+split, document targets, holder roles | — |
| 2 | Credit card installments | 1 |
| 2b | Tenant obligation resolution | 1 |
| 3 | Unified alerts center | 1, 2, 2b |
| 4 | Monthly property view | 1, 2b |
| 5 | Ownership overlap validation | — |
| 6 | Asset file overview | 1, 2b, 3, 4 |

## Affected Areas

| Area | Impact |
|---|---|
| `src/services/obligations.js`, `src/routes/obligations.js` | Modified (resolution, status) |
| `src/routes/owners.js` | Modified (roles) |
| `src/routes/documents.js` | Modified |
| `src/services/economic-overview.js`, `src/routes/assets.js` | Modified |
| `src/services/finance.js`, `src/routes/finance.js` | Modified |
| alerts route/service | New |
| `public/js/pages/assets.js`, `public/js/pages/obligations.js` | Modified |
| `tests/*` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `resolved` leaks into owner expense/KPI totals | Med | excluded from ledger; tests |
| Shared occurrence double-settled | Med | owner portion via payments, tenant portion via resolution; both required |
| Alert aggregation perf | Med | 90-day horizon |
| Interest rounding | Med | minor units |
| Backup cron never started (`src/services/cron.js`) | Med | out of scope; follow-up |

## Rollback Plan

Revert code. New collection/fields/roles are ignorable; unknown roles fall back to read-only display; no destructive migration.

## Dependencies

Existing payment methods, rentals, obligations, documents, claims.

## Success Criteria

- [ ] Installments create future occurrences; totals only when posted.
- [ ] Responsibility+split validated; external id persisted.
- [ ] Unified alerts return all types; tenant resolution closes `tenant_obligation_pending`.
- [ ] Tenant resolution stores occurrence, tenant, period, amount, receipts, `resolvedAt` with no transaction.
- [ ] Holders accept `payment_responsible`/`other`.
- [ ] Asset file lists obligations, upcoming dues, pending items, docs, notes.
- [ ] Monthly view matches spec; overlapping ownership rejected.
- [ ] Existing tests pass.
