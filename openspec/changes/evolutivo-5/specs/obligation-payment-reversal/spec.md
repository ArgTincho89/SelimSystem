# Obligation Payment Reversal Specification

> Traceability: request.md section 13; section 14 (confirmations, errors); section 17 criteria 21, 22, 24, 25; section 18 item 14. Q8 to Q11 defaults of exploration.md adopted.

## Purpose

Let the user undo an owner obligation payment recorded by mistake, voiding its expense and returning the due date to pending, while keeping traceability.

## Requirements

### Requirement: Revert endpoint

The server MUST expose `POST /obligations/:id/occurrences/:occId/payments/:paymentId/revert {reason?}`. Reversal MUST apply to one individual payment (by `paymentId`), not the whole occurrence. It MUST only apply to payments of owner-responsible obligations. Unknown or foreign obligation, occurrence or payment MUST yield 404. A payment that is already reverted MUST be rejected with a clear message. `reason` MUST be optional and length-limited. The operation MUST be atomic (snapshot rollback on failure) and MUST be idempotent against retries.

#### Scenario: Revert one of two partial payments

- GIVEN an occurrence with two partial payments
- WHEN the first is reverted
- THEN only that payment is voided and the occurrence is Parcial with the other payment

#### Scenario: Unknown payment

- WHEN a non-existent payment id is sent
- THEN the response is 404

#### Scenario: Already reverted

- GIVEN a reverted payment
- WHEN revert is requested again
- THEN it is rejected with a clear message and nothing changes

#### Scenario: Tenant obligation

- GIVEN a tenant-responsible obligation
- WHEN revert is requested
- THEN it is rejected (tenant resolutions are cancelled with "Anular resolución" instead)

### Requirement: Accounting effects

On success the system MUST remove the expense transaction of the payment and MUST keep a tombstone record (in a new additive collection `obligationPaymentReversals`) with a snapshot of the transaction, occurrence id, reason, reversal date, linked document ids and the idempotency key. The effects MUST be: the amount returns to the account balance; the month expenses decrease; the month savings are recomputed; the occurrence returns to "Pendiente" or "Vencido" according to its due date (or "Parcial" if other payments remain); history, alerts and activity log reflect the reversal. Retrying the original payment request with the same idempotency key after a reversal MUST NOT silently recreate the payment.

#### Scenario: Balance and expenses

- GIVEN an account with balance 900 after paying 100 for an occurrence
- WHEN the payment is reverted
- THEN the account balance is 1000, month expenses drop by 100 and month savings are recomputed

#### Scenario: Status after revert

- GIVEN an occurrence due 10/11/2026 and today 16/11/2026
- WHEN its only payment is reverted
- THEN its status is "Vencido"

#### Scenario: Future due date

- GIVEN an occurrence due next month
- WHEN its only payment is reverted
- THEN its status is "Pendiente"

#### Scenario: Tombstone

- WHEN a payment is reverted
- THEN a tombstone with the transaction snapshot, reason and timestamp exists

#### Scenario: Idempotency replay

- GIVEN a reverted payment
- WHEN the original payment request is replayed with the same key
- THEN no new payment is created

### Requirement: Dependents guard

A payment with dependent movements (refunds linked by `refundSourceId`, transfer normalization allocations, movement allocations, recoverable expense claims or recoveries) MUST NOT be reverted. The response MUST be an error with the message "No se puede revertir este pago porque tiene movimientos dependientes." and nothing MUST change. The dependents check MUST be a single shared helper.

#### Scenario: Refund exists

- GIVEN a payment with a linked refund
- WHEN revert is requested
- THEN the response is an error with the message above and the payment remains

### Requirement: Reconciliation

If the payment account was reconciled, reversal MUST reset the reconciliation and drop the transaction from the reconciled movements, MUST report `reconciliationReset` in the response, and the UI MUST warn the user, like the rent collection undo.

#### Scenario: Reconciled account

- GIVEN a reconciled account with the payment included
- WHEN reverted
- THEN the account reconciliation is reset and the response reports it

### Requirement: Receipts

Receipts of a reverted payment MUST stay linked to the reverted record and remain viewable from the history as "Revertido". The reversal flow MUST NOT offer deleting receipts.

#### Scenario: Receipt kept

- GIVEN a payment with a receipt
- WHEN reverted
- THEN the receipt remains viewable on the reverted record

### Requirement: Confirmation dialog

Pressing "Revertir pago" MUST open a confirmation modal showing date, amount, account, payment method, obligation, due date and receipt (if any), an optional reason field, and the copy: "Estás por revertir un pago registrado. Se anulará el gasto asociado y el vencimiento volverá a pendiente. Esta acción no se puede deshacer. ¿Querés continuar?". Nothing MUST be sent until the user confirms.

#### Scenario: Show data

- WHEN the user presses "Revertir pago"
- THEN the modal shows the payment data, a reason field and the copy

#### Scenario: Cancel

- WHEN the user dismisses the modal
- THEN no request is sent

#### Scenario: Optional reason

- WHEN the user confirms without a reason
- THEN the reversal succeeds

### Requirement: Entry points

"Revertir pago" MUST be available in: the payment detail from the asset history; the due date detail in Obligaciones; the payment detail from Avisos (only for `document_pending` alerts, because Avisos does not list payments otherwise); the payment detail in the rental Períodos tab; and the detail of an expense transaction linked to an obligation. It MUST NOT be offered for payments with dependents (the reason SHOULD be shown) or for tenant obligations.

#### Scenario: Five entry points

- GIVEN a revertible owner payment
- WHEN its detail opens from each of the five places
- THEN "Revertir pago" is offered in each

#### Scenario: Not offered on pending

- GIVEN an unpaid obligation
- WHEN the detail opens
- THEN "Revertir pago" is not offered

### Requirement: Revertido visibility

The reverted payment MUST be visible as "Revertido" in the asset history and Períodos detail. The existing transaction guards (edit and delete of obligation payments) MUST remain, and their messages SHOULD point to "Revertir pago".

#### Scenario: Visible

- GIVEN a reverted payment
- WHEN the history shows its month
- THEN a "Revertido" row with the payment data is shown

#### Scenario: Direct delete blocked

- WHEN `DELETE /transactions/:id` targets an obligation payment
- THEN it is rejected and the message points to "Revertir pago"

### Requirement: Logging

The reversal MUST be logged with a specific activity log entry (not the generic fallback), including the reason when provided.

#### Scenario: Logged

- WHEN a payment is reverted
- THEN the logs screen shows a reversal entry
