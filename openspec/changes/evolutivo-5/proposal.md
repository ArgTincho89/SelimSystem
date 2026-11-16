# Proposal: Evolutivo 5

## Intent

The asset ficha and rental modal are one long scroll that mixes asset, rental, modality and monthly data, repeats the same dues, and hides actions. History cannot reach past years. Avisos mixes owner and tenant duties. A payment entered by mistake cannot be undone. Rebuild these screens per `request.md` and keep the data compatible.

## Scope

### In Scope
- History with separate year and month selectors ("Todo el año", "Hoy"), a typed compact timeline, and a detail view with actions.
- Ficha redesign. "Alquileres" becomes "Ver alquiler" or "Declarar alquiler", plus "Histórico de alquileres".
- Wide tabbed rental modal (Resumen, Períodos, Contratos, Documentos, Notas) with a fixed header. Obsolete sections are re-homed in the ficha.
- Actualizar alquiler with a preview, Finalizar contrato, Finalizar alquiler (red), and declaring only from the ficha.
- Delete a historical rental. Documents and notes support delete, edit and filters.
- Ficha mensual as a secondary modal. Avisos split by owner and tenant. "Revertir pago". Confirmations, empty states, error copy and a11y.

### Out of Scope
- Data model rewrite, conversion between currencies, email or push notifications, soft-void of transactions.
- Changing the backend overlap rule. Removing or breaking existing endpoints.

## Capabilities

### New Capabilities
- `asset-history-timeline`: `GET /assets/:id/history`, year/month/Hoy, typed rows, detail and actions.
- `asset-ficha-redesign`: header, obligations list, rental card, docs/notes, economics, rental history entry.
- `rental-modal-tabs`: Modal fixed header/tabs/mobile full-screen, Resumen, Períodos, periods builder.
- `rental-contracts-and-lifecycle`: Contratos, update preview, modality end, rental end, declare gating.
- `rental-history-and-deletion`: history list, read-only view, safe edit, `DELETE /rentals/declarations/:id`.
- `rental-documents-and-notes`: document delete, note edit/delete/title, filters.
- `monthly-sheet-modal`: filtered secondary modal.
- `alerts-by-responsibility`: `responsibility` field and filter, two groups.
- `obligation-payment-reversal`: revert endpoint, tombstone, reconciliation, five UI entry points.
- `ux-messages-and-accessibility`: shared confirm, empty states, error copy, ARIA, responsive.

### Modified Capabilities
None (`openspec/specs/` is empty).

## Approach

Follow the exploration recommendations (A1, B1, C1, D1):
- A payment reversal removes the transaction and keeps a tombstone, the same pattern as rent undo.
- One server builder produces the periods, and a new history endpoint provides the history read model.
- The rental UI moves to a new file, `rentalModal.js`.
- Backend changes are additive, and every new write gets an activity-log route.
- The exploration defaults Q3 to Q13 are adopted.
- Delivery is one PR with `size:exception`. Work units W1 to W11 each get one commit.

**Confirmed decision (user, 2026-11-16):** a historical rental that still has collections that were not reversed cannot be deleted. The user must first use "Deshacer cobro" on those months.

## Affected Areas

| Area | Impact |
|---|---|
| `public/js/pages/{assets,rentalModal,rentalDeclaration,alerts,obligations,home}.js` | Modified/New |
| `public/js/components/modal.js`, `utils/{format,wealth-records}.js`, `index.html`, `sw.js`, CSS | Modified |
| `src/routes/*`, `src/services/{economic-overview,rentals,rental-declarations,rent-collections,obligations,alerts,activity-log}.js` + `rental-periods.js`, `obligation-payment-reversal.js` | Modified/New |
| `tests/ui/*` (about 12 contracts), `tests/{routes,services}`, `e2e/` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| About 7k lines against an 800-line budget | High | `size:exception`, one commit per unit |
| Revert breaks balances or reconciliation | Med | Dependents guard, reset reconciliation, snapshot rollback, tests |
| Tests that slice source text break | High | Rewrite them in the same unit |
| A modality end skips `settle` | Med | New endpoint replaces the `PUT` path |
| Stale PWA files | Med | Register the new files, sw v42 |

## Rollback Plan

Revert the PR merge on master and redeploy v1.12.0 (sw v41). The schema changes are additive (`obligationPaymentReversals`, note `title`, alert `responsibility`), and old endpoints still work. Data written in the meantime has these effects:
- Reversed payments stay removed. Their tombstones keep the snapshots, so a manual re-entry is possible.
- Deleted rentals and documents are not restored. Restore them from the backup taken before deploy.

## Dependencies

Evolutivo-4 deployed (v1.12.0). Take a backup of the user data before deploy.

## Success Criteria

- [ ] All 25 acceptance criteria in `request.md` §17 trace to passing scenarios.
- [ ] Reverting a payment updates balance, expenses, savings, history, alerts and logs.
- [ ] Every write is logged with a specific action. Every destructive action asks for confirmation.
- [ ] The full Jest suite and the E2E suite pass, and the change is deployed.

## Proposal question round

Auto mode: the defaults need user review.
1. "Vigente" means any active modality. The header shows Activo, Próximo a vencer (30 days) or Finalizado.
2. A historical rental can be edited only when it has no collections, documents or linked obligations.
3. "Otros movimientos" and unapplied collections move to the ficha economics and the Períodos detail.
4. Revert works per individual payment. Receipts stay on the reverted record. Avisos offers it only on `document_pending`.
5. An adjustment now skips periods that are already collected instead of rejecting the whole update. This changes current behavior.
