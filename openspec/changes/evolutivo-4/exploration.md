# Exploration: evolutivo-4

Source: `request.md`. Feasible; mostly UI with small additive backend changes.

## 1. Logs
- Rendered by `ProfilePage.renderLogsSection()` (`public/js/pages/profile.js:134`, def `:231-287`, helpers `:176-228`); default last 30 days (`:236`), grouped per day in `<details>`.
- API `GET /api/activity-logs` (`src/routes/activity-logs.js:11-20`, `src/services/activity-log.js:268-284`): `from,to,before,limit(max 200),timezone`. No text search. Client `public/js/api.js:254-265`.
- Router registration `public/js/app.js:69-103`; navbar hard-coded `app.js:120-173`; `Router.navAliases` `public/js/router.js:6`.
- Fit: new `/logs` route + `public/js/pages/logs.js`; `navAliases['/logs']='/profile'`; Perfil gets a "Logs" button; no default range; two-column rows; client-side search; add to `public/index.html:26-48` and `public/sw.js` STATIC_ASSETS + bump `CACHE_NAME` (currently `selimsystem-v40`).
- Test `tests/ui/evolutivo3-s5-contract.test.js` slices `profile.js` text — must be rewritten.

## 2. Obligation card
- `renderObligation` (`public/js/pages/obligations.js:119-129`) prints 4 muted lines.
- `item.type` is a raw code (`tax`, `utility`, ...), no label map; server type is free string → label map with fallback.
- "Cuenta" = `externalIdentifier` + `externalIdentifierType` (`:126`), not financial account. Amount unformatted. Aviso = `reminderLeadDays`.
- Type filter (`:77`) is free text matched by equality against code (`src/routes/obligations.js:46`) → should be a select.

## 3. Statuses, Registrar pago, edit/delete
- `occurrenceView` (`src/services/obligations.js:27-55`): `overdue` = `occurrence.date < today` (due day is not overdue — matches requested rule). Stored statuses: `expected|confirmed|cancelled`.
- Dependents of expected/confirmed: `getAlerts` (`:534`), `pendingForRange` (`src/services/economic-overview.js:129-140`), `monthlyView`, list filter, `/confirm` route (`src/routes/obligations.js:178-188`), activity log (`src/services/activity-log.js:58`); UI Confirmar button (`obligations.js:143`), filter "Previstas/Confirmadas" (`:76`), `statusLabel` (`:569`), `STATUS_LABELS` (`public/js/utils/format.js:128-146`), `home.js:763`. Tests: `tests/services/obligation-status.test.js`, `tests/ui/evolutivo3-s1-format.test.js:19`.
- Recommendation: UI-only collapse expected+confirmed → "Pendiente"; keep backend/endpoint.
- Cards show `occurrences.slice(-8)` (`:130`) — mostly future generated months (365-day horizon). Needs a display rule.
- Existing payment dialog `ObligationsPage.pay` (`obligations.js:420-474`, also from `alerts.js:134`); context `GET .../payment-context` (`src/services/obligations.js:566-593`: same-currency accounts, suggested account, category chain, blocked reason for tenant-paid); `POST .../payments` (`src/routes/obligations.js:244-293`) creates real `expense` transaction linked to obligation/occurrence; receipt uploaded afterwards via `API.documents.uploadTargets({occurrenceId, transactionId})` (`src/routes/documents.js:94-135` derives obligationId/assetId; non-atomic).
- Gaps: button named "Pagar" per row; no title/notes; payment method not prefilled; Modal fixed 440px. Do NOT rebuild on `TransactionForm` (cannot create occurrence payments).
- Edit exists (`:166`, PUT `src/routes/obligations.js:105-164`; with payment history requires future `effectiveFromDate`, UI field at `:293`).
- Delete = soft cancel (`:167`, `src/routes/obligations.js:166-176`), no confirmation; cancelled obligations still listed (`src/routes/obligations.js:41-47`, `obligations.js:92-94`).

## 4. Asset history modal
- "Ver historial" and "Alquileres" both call `AssetsPage.showDetails` (`public/js/pages/assets.js:68,72,389-419`), which renders everything the user wants removed. Pinned by `tests/ui/evolutivo3-s3-contract.test.js:10-53`, `evolutivo3-s2`, `evolutivo3-s4c`.
- Recommendation: keep `showDetails` as ficha (reachable from another button), add new `showHistory`.
- Data: `GET /assets/:id/monthly-view?from&to` (`src/routes/assets.js:289`, `src/services/economic-overview.js:452-568`) returns per month/obligation `occurrenceId,title,date,status,estimatedMinor,actualMinor,documents[],payments[{date,amountMinor,accountName,paymentMethod}]`. Missing obligation `type` and provider name. Heavy (economics, rent, claims), capped 120 months, default last 12.
- Recommendation: thin `GET /assets/:id/obligation-history` reusing the row builder; range from `min(asset.createdAt, earliest obligation.startDate)`.
- Receipts: `GET /api/documents/:id/content` (`src/routes/documents.js:216-244`) sends `Content-Security-Policy: default-src 'none'; sandbox` — likely blocks Chromium PDF viewer in iframes. Existing preview `public/js/utils/wealth-records.js:88-107`. Mitigation: fetch → blob URL → iframe; image zoom controls; open/download fallback. Use `Modal.push` (`public/js/components/modal.js:14`); `modal.js:40` fixed `maxWidth:440px` → additive width option.

## 5. Home & transfers
- Remove `HomePage.renderEconomicContext` (`public/js/pages/home.js:746-769`, called `:94` mobile, `:268` desktop) — includes transfers text and "Pendiente fuera de los importes reales" (user explicitly asked to remove both). API fields `overview.transfers/pending` stay.
- Test `tests/ui/evolutivo3-s1-status-contract.test.js:22,30-33` pins `statusLabel(item.status)` in `home.js`.
- Transfers backend exists: `src/routes/transfers.js`, `ledger.createTransferRecord` (`src/services/account-ledger.js:275-309`); balances `:236-273` (source -(sent+fee), destination +received, per currency); income/expense/savings count only transactions (`:400-446`, `src/services/economic-overview.js:156-216`) — transfer without fee/allocations affects balances only. `GET /api/transactions` merges transfers (`src/routes/transactions.js:36-55`).
- `TransactionForm` type selector `['expense','income','refund']` (`public/js/components/transactionForm.js:15-37`), 594-line monolith → add "Transferencia" button swapping in a dedicated sub-form (source, destination, amount, received amount when currencies differ, date, title, note) saving via `API.transfers.create`.
- Gaps: no `notes` field (only `reference`) → add to `createTransferRecord`/PUT and `showTransferDetails` (`home.js:1013`); future-dated posted transfer rejected; unreconciled accounts show no balance; E2E `.type-btn` selectors in `e2e/pages/TransactionForm.ts`.

## Decisions (recommended)
| Decision | Recommended |
|---|---|
| Confirmar/previsto | UI-only collapse to "Pendiente" |
| Orange/overdue | Shared `dueState` (server) consumed by obligations tab and history |
| Registrar pago | Extend existing `pay()` dialog, expose on card |
| History data | Thin `/assets/:id/obligation-history` |
| Receipt viewer | Blob-URL iframe + image zoom |
| Transfer form | Dedicated sub-form inside TransactionForm |
| Logs search | Client-side |

## Defaults adopted for open questions
1. Orange only for current-month pending up to due day; future months neutral.
2. Card shows overdue occurrences + next pending.
3. Payment dialog gets optional title and notes.
4. Transfer UI hides fee and allocations.
5. History range starts at `min(asset creation, earliest obligation start)`.
6. Cancelled obligations hidden from the tab; delete asks confirmation.

## Risks
- PDF iframe vs sandbox CSP (mitigated by blob URL).
- Text-slicing `tests/ui` contracts break when code moves.
- Service worker cache must be bumped and `logs.js` registered.
- 800-line budget tight with items 4 + 5.
