# Design: Evolutivo 4

Authoritative for names, fields and endpoints. Source of truth: `request.md`.

## Technical Approach

Most of the work is in the UI. The backend changes only add things: `dueState` in `occurrenceView`, `title`/`notes`/payment-method prefill on the obligation payment, a lean `GET /assets/:id/obligation-history` that reuses an extracted row builder, and transfer `notes`. `showDetails` (ficha) stays as it is. History is a new `showHistory`. Single PR, sw `selimsystem-v41`.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Due state | Server: `occurrenceView` adds `dueState` ∈ `paid\|cancelled\|overdue\|due-soon\|pending` (`paid`/`resolved`→paid; `status==='overdue'`→overdue; same month as the user's local today→due-soon; else pending). Client `dueBadge(occ)` in `format.js` → `{label, className}` | Client date math | One rule for the list, the history and the tests. Uses `localDateForUser` (timezone). Due day is not overdue (`date < today`) |
| Confirm/forecast | UI-only: `expected`/`confirmed` → "Pendiente" (`STATUS_LABELS` + `ObligationsPage.statusLabel`). Filter option `pending` (route matches `expected\|confirmed\|partial`). Confirmar button removed. `/confirm` kept | Backend status merge | No migration. Alerts and overview keep working |
| Card occurrences | Show unpaid `overdue` + the first non-paid with `date >= today`. Replaces `slice(-8)` | Last N | The 365-day horizon fills cards with future months |
| Type labels | `OBLIGATION_TYPES` constant (from the form at `obligations.js:211`). Used by the card, the type filter `<select>` and history. Unknown → "Otro" | Server map | Type is a free string server-side |
| Registrar pago | Extend `ObligationsPage.pay()`: optional `Título` (default occurrence title, ≤100) and `Notas` (≤1000). Method preselected from `context.suggestedPaymentMethodId`. Card-level button pays the oldest unpaid shown occurrence. Row "Pagar" renamed | `TransactionForm` | It cannot create occurrence payments (exploration §3) |
| Delete | "Eliminar" + `confirm()` → `API.obligations.delete` (soft cancel). Client hides `status==='cancelled'`; "Canceladas" filter removed | Hard delete | Keeps payment history |
| History data | `obligationRow(db,userId,obligation,item,allDocuments)` extracted from `monthlyView` (`economic-overview.js:498-519`) and reused | Reuse `monthly-view` | It is heavy (economics, rent, claims). The extraction keeps `monthly-view` output identical |
| Receipt viewer | `fetch` → `Blob` (type only if it is in the allowlist pdf/png/jpeg/webp/text, else download) → `URL.createObjectURL` → `<iframe>` without `sandbox` (PDF) / `<img>` with CSS `scale` ±25% (images). Revoke in `onClose`. Fallback links "Abrir"/"Descargar" | Direct `contentUrl` iframe | `default-src 'none'; sandbox` (`documents.js:238`) blocks the PDF viewer. The app has no CSP (`helmet` CSP off) |
| Modal width | `options.width` → `maxWidth` (default `440px`) | New component | Additive |
| Ficha access | "Ver historial" → `showHistory`. "Alquileres" (immovable) and a new "Ficha" button (all assets) → `showDetails`. `/assets?asset=` keeps `showDetails` | Delete ficha | Out of scope. The s2/s3/s4c contracts stay green |
| Logs search | `/logs` page loads all pages (`limit 200`, follows `nextBefore`, cap 50 pages). Accent/case-insensitive filtering on the client. A date change re-fetches | Server search | 12-month retention keeps the volume small |
| Transfer UI | Type button "Transferencia" (`data-type="transfer"`, new only, hidden on edit) switches between the regular body and the `renderTransferFields()` sub-form. Fields: source, destination, amount, received (only when currencies differ), date (`max=today`), title → `reference`, note → `notes`. `status:'posted'`, no fee/allocations | Reuse the Settings form | That form brings fee and normalization noise |

## Data Flow

```
Card "Registrar pago" -> pay(ob, occ)
  -> GET payment-context {accounts, suggestedAccountId, suggestedPaymentMethodId, categoryId}
  -> POST payments {amount, accountId, categoryId, date, paymentMethodId, title, notes, idempotencyKey}
       -> tx(expense, titulo=title, comments=notes, obligationOccurrenceId)
  -> [file] documents.uploadTargets({occurrenceId, transactionId})   (non-atomic; toast on failure)
  -> refresh

Asset "Ver historial" -> showHistory(id) -> GET /assets/:id/obligation-history
  -> Modal{width:'760px'}: month <select> (Todos | YYYY-MM...) -> month > type > rows (badge)
  -> click row -> detail panel (payments, title, notes, documents)
  -> click document -> Modal.push(viewer, {width:'900px', onClose: revoke})
```

## Interfaces / Contracts

```
GET /api/assets/:id/obligation-history -> 200
{ assetId, from:'YYYY-MM', to:'YYYY-MM',   // from = min(asset.createdAt, earliest obligation startDate), to = current; clamp 120 months
  months: [ { month, rows: [ obligationRow + { type, providerName, obligationTitle, dueState,
              payments[i] + { title, notes } } ] } ] }   // newest month first, cancelled excluded
404 unknown asset.

POST /obligations/:id/occurrences/:occId/payments  + title?: string<=100, notes?: string<=1000
  (400 otherwise; both added to fingerprint). tx.titulo = title || occurrence/obligation title; tx.comments = notes||''.
payment-context + suggestedPaymentMethodId (obligation.paymentMethodId when it exists, else null).
GET /obligations?status=pending -> expected|confirmed|partial.
POST/PUT /transfers + notes?: string<=1000 ('La nota no es válida'); PUT keeps it via ...current.
GET /transactions transfer events + notes. showTransferDetails shows titulo + notes.
Modal.show/push(title, content, { width?, footer?, onClose? })
```

## File Changes

| File | Action | Change |
|---|---|---|
| `public/js/pages/logs.js` | Create | `LogsPage` (search, from/to, two-column `.log-row`, "No se completó") |
| `public/js/app.js`, `router.js`, `index.html`, `sw.js` | Modify | `/logs` route; `navAliases['/logs']='/profile'`; script tag; STATIC_ASSETS + `v41` |
| `public/js/pages/profile.js` | Modify | Remove `renderLogsSection` and its helpers. Add a "Logs" button → `#/logs` |
| `public/js/pages/obligations.js` | Modify | Label/value card, `OBLIGATION_TYPES`, type select, occurrence rule, badges, actions, `pay()` fields, delete confirm, hide cancelled |
| `public/js/utils/format.js` | Modify | `dueBadge`; expected/confirmed → "Pendiente" |
| `public/js/pages/assets.js` | Modify | `showHistory`, `showReceipt`, "Ficha" button |
| `public/js/components/modal.js` | Modify | `width` option |
| `public/js/components/transactionForm.js` | Modify | Transfer type + sub-form |
| `public/js/pages/home.js` | Modify | Delete `renderEconomicContext` and calls (:94, :268); transfer notes |
| `public/js/api.js` | Modify | `assets.obligationHistory(id)` |
| `public/css/components.css`, `variables.css` | Modify | `--due-soon:#FF9F43`, `.due-soon`, `.due-overdue` (danger, 700), `.label-value`, `.log-row`, `.receipt-viewer` |
| `src/services/obligations.js` | Modify | `dueState`, `suggestedPaymentMethodId` |
| `src/services/economic-overview.js` | Modify | Extract `obligationRow`; add `obligationHistory(db,userId,asset)` |
| `src/routes/assets.js`, `obligations.js`, `transfers.js`, `transactions.js`; `src/services/account-ledger.js` | Modify | Endpoint, payment fields, status filter, `notes` |
| `e2e/pages/TransactionForm.ts` | Modify | Exclude `[data-type="transfer"]` from type selectors |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `dueState` (day before/on/after the due day, next month, paid, partial, timezone); `dueBadge`; `STATUS_LABELS` | Jest + `vm` (`tests/ui`) |
| Integration | obligation-history (range, grouping fields, documents, 404, cancelled excluded, 120 clamp); `monthly-view` unchanged; payment title/notes/validation/fingerprint replay; `status=pending`; transfer notes create/PUT/list; transfer leaves income/expense untouched | Supertest |
| Contract | New `tests/ui/evolutivo4-*`: logs route/sw/index, card labels, no "Confirmar"/"Previsto", delete confirm, history/viewer, Modal width, transfer button, no `renderEconomicContext`. **Rewrite** `evolutivo3-s5` (logs → logs.js), `evolutivo3-s1-format:19`, `evolutivo3-s1-status-contract:22,30` (home assertion removed). Re-run s2/s3/s4c (they should be unaffected) | Source-read + `vm` |
| Regression | `npm test`; e2e type-button selectors | CI |

## Threat Matrix

N/A: no shell, subprocess, VCS automation or executable-file boundary. Receipt blobs: the MIME allowlist means HTML never renders.

## Migration / Rollout

No migration. All fields are optional. Revert the commit to roll back.

## Open Questions

- [ ] The auto-mode defaults from the proposal (orange only in the current month, overdue + next, history range, cancelled hidden) still need user review. They are not blocking.
