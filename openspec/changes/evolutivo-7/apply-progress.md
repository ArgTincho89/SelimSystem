# Evolutivo 7 — apply progress

Status: implemented on branch `evolutivo-7` (not pushed or merged).

| Item | Status | Commit |
|---|---|---|
| 1. Independent privacy toggles (D4) | Done | 4c4cf20 |
| 2. Month picker fit + scrollable year list | Done | cd3be3f |
| 5a. Shared zoomable document viewer (Ver documento / Descargar) | Done | 66c3a57 |
| 3. Partial collections ("Parcialmente cancelado", saldo pendiente) (D1) | Done | 5e959ea |
| 4. Cheque method + "Días", posting on the collection date, alerts, mark cashed (D2) | Done | 5e959ea |
| 6. Descriptive logs + undo of a cashed cheque | Done | 5e959ea |
| 5b. Attachments on movements, obligation pay/resolve, collections (D3) | Done | 5e959ea, 0020365 |
| 7. Release 1.16.0, CHANGELOG, sw cache v48 | Done | a6f0f87 |

## Notes
- New optional fields on `rentCollections`: `receivedDate` and `cheque` (`{ days, dueDate, cashedAt }`). Older records have neither and behave as before.
- A cheque collection's income `fecha` is the cheque due date. Balances only count dates up to today, so the money shows up when the cheque is cashed.
- Marking a cheque as cashed is POST `/api/rentals/collections/:id/cheque-cashed`. Undo is POST `/api/rentals/collections/:id/cheque-cashed/undo`, which needs a reason and is offered from Logs.
- Deleting a plain movement now removes the receipts that belonged only to it. Receipts that are also linked to another target lose only their link to the movement.
- E2E: `e2e/pages/HomePage.ts` `expectPrivacyState` now checks only the Home-scoped values, because the Home eye no longer covers account balances.
