# Design: Evolutivo

## Technical Approach

Additive, non-breaking extensions on the existing Express/JsonDB stack. New collections and optional fields; services generate scheduled commitments that never affect posted totals until posted. Tenant-paid obligations are closed by a non-ledger `obligationResolutions` record. Read-only aggregators (unified alerts, monthly view, asset file) compose existing services and never mutate data. Idempotent migration backfills defaults for legacy records.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Installment storage | Two collections: `creditCardInstallmentPlans`, `creditCardInstallmentOccurrences` | Single embedded array | Matches recurring-obligation pattern; targeted updates and queries |
| Money math | Integer minor units; interest in basis points; last installment absorbs remainder | Floating decimals | Avoids rounding drift |
| Alerts endpoint | Read-only aggregation over services | Mutating refresh per call | Spec requires alerts not to mutate data |
| Document targets | Store expanded targets plus derived parents | Only derived links | Retrieval by any target with consistency |
| Ownership overlap | Inclusive-date predicate in a shared helper | Per-route checks | One rule for create, batch, patch |
| Migration | Idempotent startup backfill of missing optional fields | Manual script | Zero-downtime; old code ignores unknown fields |
| Tenant resolution storage | Separate `obligationResolutions` collection, one active per occurrence | Fake `transactions` row; flag on occurrence | Never touches ledger, Home KPIs, or owner expense totals; keeps receipts/period/tenant auditable; voidable |
| Status derivation | Portion-aware `occurrenceView`: owner portion settled by payments, tenant portion by resolution | Persist `status: 'resolved'` on occurrence | Status stays derived like `paid`; no drift if a resolution is voided |
| Backward compatibility | When `tenantDueMinor === 0` the legacy status expression runs unchanged | Rewrite status for all | Zero behavior change for owner/third/none obligations |
| Shared completion status | Tenant-only fully settled -> `resolved`; shared with both portions settled -> `paid` | `resolved` for shared | Owner portion is a real ledger expense; `paid` keeps existing reports correct |
| `remainingAmount` meaning | Owner portion remaining; new `tenantRemainingAmount` | Total remaining | `pendingForRange` and payment cap automatically exclude tenant portions from Home and owner totals |
| Holder roles | Widen `ROLES` set in `src/routes/owners.js`; `other` free, unconstrained | New role table | Smallest change; roles are plain strings |
| Asset file | New read-only `src/services/asset-file.js`, `GET /api/assets/:id/file` | Extend `assetEconomics` | Different question (state vs. economics); avoids bloating the economics payload |

## Status Algorithm (`src/services/obligations.js`, `occurrenceView` ~L21-27)

```
split = portionsFor(obligation, dueMinor)  // owner: {owner:due, tenant:0}; tenant: {0,due};
                                           // shared: split rule; third/none: {owner:due, tenant:0}
resolution = activeResolution(occurrence.id)
if split.tenant === 0 -> legacy expression (unchanged)
else if cancelled -> 'cancelled'
else ownerOk = split.owner === 0 || paid >= split.owner; tenantOk = !!resolution
  ownerOk && tenantOk -> split.owner === 0 ? 'resolved' : 'paid'
  date < today -> 'overdue'; paid > 0 || resolution -> 'partial'; else confirmed/expected
```

View adds `ownerDueAmount`, `tenantDueAmount`, `tenantRemainingAmount`, `resolution`. Guards: cancel and `updateOccurrence` return 409 when an active resolution exists; payments are capped by owner remaining (tenant-only rejects any payment).

## Data Model Extensions

New collections: `creditCardInstallmentPlans`, `creditCardInstallmentOccurrences`, `obligationResolutions`.

Obligation additions: `responsibilityType` (default `owner`), `responsibilitySplit`, `responsibleThirdEntityId`, `rentalContractId`, `externalIdentifier`, `externalIdentifierType`.

Document additions: `occurrenceId`, `rentOccurrenceId`, `transactionId`, `tenantEntityId`. Resolution receipts are documents targeting `occurrenceId` + `tenantEntityId`, referenced by `resolution.documentIds`.

Legal owner roles: `owner`, `tenant`, `provider`, `payment_responsible`, `other`.

Installment plan/occurrence fields unchanged from prior design (`accountId`, `paymentMethodId`, amounts in minor units, `installmentsCount`, `dueDay`, `interestPercent`, `status`, `postedTransactionId?`).

## API Endpoint Design

New:

- `GET /api/alerts` — filters `from`, `to`, `type`, `assetId`, `limit`.
- Installments: `GET/POST /api/installments/plans`, `GET/PATCH /plans/:id`, `GET /plans/:id/occurrences`, `POST .../occurrences/:occurrenceId/post|cancel`.
- `POST /api/obligations/:id/occurrences/:occurrenceId/resolution` — body `{ tenantEntityId, period, amount, documentIds?, resolvedAt?, notes? }`.
- `DELETE /api/obligations/:id/occurrences/:occurrenceId/resolution` — voids (sets `status: 'voided'`).
- `GET /api/assets/:id/monthly-view`, `GET /api/assets/:id/file`.

Modified: obligations (responsibility, external id), documents (targets), assets/ownerships (overlap), owners (roles).

## Sequence: Tenant Resolution

```
UI(obligations.js) -> POST .../resolution -> routes/obligations.js
  -> obligations.createResolution(db,user,obligation,occurrence,body)
       validate: occurrence not cancelled; split.tenant > 0; no active resolution (409)
       tenant has role 'tenant' (and in contract.tenantIds if rentalContractId)
       period YYYY-MM; amount via ledger.moneyInput; documentIds exist & owned
  -> db.create('obligationResolutions')        (no transactions write)
  <- occurrenceView (status resolved|partial|paid)
alerts.js: tenant_obligation_pending suppressed when active resolution exists
```

## Sequence: Asset File

```
GET /api/assets/:id/file -> assetFile.build(db,user,asset)
  -> ownerships + holders (legalOwners)
  -> obligations by assetId + next occurrence (occurrencesFor, 90d)
  -> upcoming: obligation, rent, installment occurrences <= today+90
  -> pending: alerts.list({ assetId })
  -> documents: asset + obligation/occurrence/contract/rent/transaction/resolution targets (dedup by id)
  -> notes: asset.notes, obligation notes, resolution notes
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/services/credit-card-installments.js` | Create | Plans, generation, posting, cancellation |
| `src/services/alerts.js` | Create | Unified aggregator incl. tenant pending/closed |
| `src/services/asset-file.js` | Create | Asset file read model |
| `src/services/migrations.js` | Create | Idempotent field backfill |
| `src/routes/installments.js`, `src/routes/alerts.js` | Create | Endpoints |
| `src/services/obligations.js` | Modify | Portions, resolution CRUD, status, guards |
| `src/routes/obligations.js` | Modify | Fields, resolution endpoints, cancel guard |
| `src/routes/owners.js` | Modify | `ROLES` + error message |
| `src/routes/documents.js` | Modify | Targets and consistency |
| `src/routes/assets.js` | Modify | Monthly view, file, overlap |
| `src/services/economic-overview.js` | Modify | Monthly view; tenant portions out of pending totals |
| `src/services/rentals.js` | Modify | Rent alert helper |
| `src/app.js` | Modify | Register routes, migration |
| `public/js/pages/obligations.js` | Modify | Responsibility form, resolve dialog, `resolved` badge |
| `public/js/pages/assets.js` | Modify | Monthly view and asset file tabs |
| `public/js/pages/entities.js` | Modify | Role labels/checkboxes (L18, L63) |
| `public/js/api.js` | Modify | Client calls |
| `public/sw.js` | Modify | Bump `CACHE_NAME` to `selimsystem-v19` |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Minor-unit interest; overlap predicate; `portionsFor` and status matrix (owner/tenant/shared x paid/resolved/overdue) | Jest |
| Integration | Resolution create/void, 409 guards, no transaction created, Home KPIs and `assetEconomics.pending` unchanged | Supertest |
| Integration | Roles accept `payment_responsible`/`other`, reject unknown | Supertest |
| Integration | Alerts (tenant pending closes), monthly view, asset file sections, documents | Supertest |
| Regression | Existing obligation/payment suites pass untouched | `npm test` |

Coverage: `npm run test:coverage` must keep `jest.config.js` global 60% and per-file thresholds; new services should target >=80% lines.

## Threat Matrix

N/A — no shell/subprocess/VCS boundary; HTTP routing uses existing auth/validation.

## Migration / Rollout

`migrateEvolutivo` backfills `responsibilityType: 'owner'`. No destructive changes. Rollback: code revert; resolutions ignored, tenant occurrences revert to payment-derived status; entities holding new roles must drop them before re-saving under old code.

## Open Questions

- Should installment posting allow amount override?
- Should `rent_adjustment_due` derive from rental conditions or a reminder field?
- Must resolution `amount` equal tenant portion, or is it informational (assumed informational)?
