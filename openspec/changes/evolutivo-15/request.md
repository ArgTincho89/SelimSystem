# Evolutivo 15 — Dates in DD-MM-AAAA and wider modals

> Branch: `evolutivo-15`. Delivery: PR to master, merge after CI green, deploy (follow-up to evolutivo-14). Release 1.21.0.

## Request (summary of the user's words)
- Every date shown anywhere in the app must read DD-MM-AAAA, with dashes (e.g. 20-11-2026): lists, details, history rows, alerts, logs, receipts, rental periods, obligations, transactions, settings, home, document viewer, toasts and confirm dialogs. Server-generated text that embeds dates (alert messages, validation errors, activity-log descriptions) too. Stored data and API date fields stay ISO YYYY-MM-DD.
- Every modal another 15% wider (on top of the existing 30%), except the "Ver alquiler" modal, which keeps its current size.

## Decisions
- D1: One client formatter in `public/js/utils/format.js`: `formatDate(value)` turns "YYYY-MM-DD" into "DD-MM-AAAA" and an ISO timestamp into its day in the user's timezone; empty or non-date values give `''` and each caller keeps its own placeholder ('—', 'sin fecha de fin'). `formatDateTime(value)` gives "DD-MM-AAAA HH:mm" (Logs) and replaces `formatLogDateTime`. The ad-hoc helpers (`AssetHistory.formatDate`, `RentalModal.shortDate`, `RentalPeriods.shortDate`, `TransactionForm.dueDateLabel`, `WealthRecords.dmy`, `formatFechaCorta`, manual `split('-').reverse().join('/')`, `toLocaleDateString()`) are removed in favour of it.
- D2: The day headers of the movement lists keep the weekday: "jueves, 20-11-2026" (`formatFechaLarga` now builds on `formatDate`).
- D3: One server helper, `src/utils/date-format.js` (`formatDisplayDate`), used by the alert messages (`src/services/alerts.js`; the former "20 de noviembre" and "dd/mm/aaaa" forms), the rental overlap error (`src/services/rental-declarations.js`), the activity-log "con vencimiento" fragment (`src/services/activity-log.js`) and the cheque detail of rent collections in the log (`src/routes/rentals.js`). Messages already stored in the activity log are not rewritten.
- D4: Out of scope: native `<input type="date">` display (browser-controlled) and month-only labels ("Noviembre 2026", "Alquiler de noviembre"). The obligations filter hint "Desde/Hasta (AAAA-MM-DD)" becomes "(dd-mm-aaaa)". "Fecha del documento" in the functional document is document metadata, not UI output, and stays as is.
- D5: `Modal.WIDTH_SCALE` becomes 1.495 (1.3 × 1.15; 440px → 658px, 480px → 718px, 1100px → 1645px), written as the literal product so that rounding stays exact. `Modal.scaledWidth(width, scale)` and the new `options.widthScale` let one dialog keep its own factor; widths stay `width: 100%` with a max-width, so phones are unchanged.
- D6: Only the rental modal ("Ver alquiler", `RentalModal.open`) passes `widthScale: RentalModal.WIDTH_SCALE` (1.3) and keeps 1100px × 1.3 = 1430px from every entry point (the asset ficha button and "Ver" in the rental history, both through `AssetsPage.openRental`). Dialogs pushed on top of it (Actualizar alquiler, Histórico de alquileres, Ficha mensual, period detail, Registrar cobro) take the new global factor.
- D7: Version 1.21.0, service worker cache v56.
