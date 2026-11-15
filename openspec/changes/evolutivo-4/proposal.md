# Proposal: Evolutivo 4

## Intent

Act on user feedback after evolutivo-3 (`request.md`): cleaner, more readable screens. Logs get their own screen, obligation cards and statuses are easier to read, payments with receipts are registered from the card and shown in a rebuilt asset history, and the noisy Home block is replaced by a "Transferencia" transaction type.

## Scope

### In Scope
- `/logs` screen opened from a "Logs" button in Perfil: search, optional from/to, all logs by default, date/time left and description right.
- Obligation card with bold labels; collapse expected/confirmed into "Pendiente"; orange until the due day (inclusive), bold red "Vencido" after it; Edit, Delete (with confirmation), "Registrar pago".
- "Registrar pago": prefilled expense-like dialog (account, payment method, title, notes, optional receipt).
- New asset history modal: month or all-months selector, grouped by month and obligation type, paid/unpaid, record detail, zoomable iframe receipt viewer.
- Remove the Home "Movimiento entre cuentas"/pending block (`renderEconomicContext`) completely; add "Transferencia" to "Nueva transacción" (source, destination, amount, title, note).

### Out of Scope
- Redesigning the asset ficha (`showDetails` stays, moved to another button).
- Backend status model changes; `/confirm` endpoint kept.
- Transfer fee/allocations in the UI; removing `overview.transfers/pending` API fields.

## Capabilities

### New Capabilities
- `activity-log-screen`: `/logs` route, client-side search, date filters, two-column rows, Perfil button.
- `obligation-card-and-status`: label/value card, type labels and type select, `dueState` (pending/due-soon/overdue), "Pendiente" collapse, edit/delete, hide cancelled.
- `obligation-payment-registration`: extended `pay()` dialog, prefill, title/notes, receipt upload.
- `asset-obligation-history`: `GET /assets/:id/obligation-history`, history modal, receipt viewer.
- `account-transfers-ui`: Home block removal, Transferencia sub-form, transfer `notes`.

### Modified Capabilities
None (`openspec/specs/` is empty).

## Approach

Follow the exploration decisions. Most of the work is UI. Backend changes only add things: a server-side `dueState`, a lean history endpoint that reuses the monthly-view row builder, and transfer `notes`. Receipts load as blob URLs so the sandbox CSP does not block them. `Modal` gets an additive width option. Bump the service-worker cache and register `logs.js`. Rewrite the `tests/ui` contracts that read source text.

## Affected Areas

| Area | Impact |
|---|---|
| `public/js/pages/{profile,logs,obligations,assets,home}.js`, `app.js`, `router.js` | Modified/New |
| `public/js/components/{transactionForm,modal}.js`, `utils/format.js` | Modified |
| `src/services/{obligations,economic-overview,account-ledger}.js`, `src/routes/{assets,transfers}.js` | Modified |
| `public/index.html`, `public/sw.js`, `tests/ui/*`, `e2e/pages/TransactionForm.ts` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Forecast exceeds 800-line review budget (single PR) | High | Record size exception; slice commits per capability |
| PDF iframe blocked by sandbox CSP | Med | Blob URL; open/download fallback |
| Source-text `tests/ui` contracts break | High | Rewrite in the same slice |
| Stale PWA assets | Med | Bump `CACHE_NAME` |
| Receipt upload not atomic with payment | Low | Keep payment; show upload error |

## Rollback Plan

Revert the commit(s) on master and redeploy. All backend changes are additive (no migration, `notes` optional), so the data stays compatible. Payments and transfers created in the meantime remain valid records.

## Dependencies

Evolutivo-3 deployed (`50561b0`).

## Success Criteria

- [ ] Each request item traced to a passing scenario.
- [ ] No "Confirmar"/"Previsto" in the UI; overdue shown as bold red "Vencido".
- [ ] A payment with a receipt appears in the asset history and its receipt opens with zoom.
- [ ] A transfer changes account balances only.
- [ ] `npm test` passes; deployed to Fly.io.

## Proposal question round

Auto mode: the exploration defaults were adopted and need user review. 1) Orange applies only to current-month pending items. 2) The card shows overdue items plus the next pending one. 3) History starts at the earlier of asset creation or the first obligation start. 4) Cancelled obligations are hidden.
