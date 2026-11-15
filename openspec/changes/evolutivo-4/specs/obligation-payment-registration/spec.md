# Obligation Payment Registration Specification

> Traceability: request.md ("debo poder registrar pago ... campos precargados ... como cuando imputo un nuevo gasto ... de qué cuenta sale, cuál es el medio de pago ... adjuntar un comprobante si quiero").

## Purpose

Let the user register the payment of an obligation occurrence from its card through an expense-like dialog with prefilled fields and an optional receipt.

## Requirements

### Requirement: "Registrar pago" dialog

Pressing "Registrar pago" MUST open the existing obligation payment dialog (`ObligationsPage.pay`), extended, with these fields: payment date (default today), amount (prefilled), source account, payment method, title, notes, and an optional receipt file. The dialog header MUST name the obligation and period. The submit button MUST read "Registrar pago". The same dialog MUST be used from the obligations tab and from alerts, and the legacy "Pagar" button label MUST be replaced.

#### Scenario: Open from card

- GIVEN an unpaid occurrence on a card
- WHEN the user presses "Registrar pago"
- THEN the dialog opens with date, amount, account, payment method, title, notes and receipt fields

#### Scenario: Open from alert

- GIVEN a due alert
- WHEN the user chooses to pay it
- THEN the same dialog opens

### Requirement: Prefilled values

The dialog MUST prefill from the payment context: amount from the occurrence estimate (or the amount the system derives from the contract/arrangement), suggested source account among same-currency accounts, suggested payment method when known (otherwise the default expense method), and a default title (e.g. obligation name and period). The user MUST be able to change every prefilled value. Only same-currency accounts MUST be offered.

#### Scenario: Prefill

- GIVEN occurrence of "Impuesto municipal" for 11/2026 with estimate 50000 ARS and a suggested account
- WHEN the dialog opens
- THEN amount shows 50000, the suggested account and payment method are selected and the title is prefilled

#### Scenario: Editable

- GIVEN the dialog is prefilled
- WHEN the user changes the amount and account
- THEN the submitted payment uses the changed values

### Requirement: Required fields and validation

Amount (> 0), source account and payment date MUST be required. Payment method follows the same rule as the new-expense form. Invalid input MUST show inline Spanish messages and MUST NOT send the request. Amounts MUST use the app's money input (no float rounding errors).

#### Scenario: Empty amount

- GIVEN the amount is cleared
- WHEN the user submits
- THEN an inline error is shown and no request is sent

#### Scenario: No eligible account

- GIVEN no same-currency account exists
- WHEN the dialog opens
- THEN a message explains the account is needed and submit is disabled

### Requirement: Blocked payments

When the payment context reports a blocked reason (e.g. tenant-paid obligation), the dialog MUST show that reason in Spanish and MUST disable submission.

#### Scenario: Tenant-paid

- GIVEN an obligation whose responsibility is tenant-paid and the context returns a blocked reason
- WHEN the dialog opens
- THEN the reason is displayed and "Registrar pago" is disabled

### Requirement: Create expense linked to occurrence

Submitting MUST create a real expense transaction linked to the obligation and occurrence through the existing payment endpoint, mark the occurrence as paid, and debit the chosen account. The optional title and notes MUST be stored with the transaction (additive optional fields; defaults apply when empty). The card MUST refresh and show the occurrence as "Pagado" after success. Double submission MUST be prevented while the request is in flight.

#### Scenario: Successful payment

- GIVEN a prefilled dialog
- WHEN submitted
- THEN an expense is created, the account balance decreases by the amount, and the occurrence shows "Pagado"

#### Scenario: Title and notes

- GIVEN title "ABL noviembre" and notes "Pago por homebanking"
- WHEN submitted
- THEN the created transaction carries that title and those notes

#### Scenario: Double click

- GIVEN the user presses the submit button twice quickly
- WHEN processed
- THEN only one payment exists

#### Scenario: Server rejection

- GIVEN the server rejects the payment
- WHEN the response arrives
- THEN the error is shown in the dialog and the occurrence stays unpaid

### Requirement: Optional receipt upload

The dialog MUST accept one optional receipt file (image or PDF, subject to the existing upload limits). When provided, after the payment is created the file MUST be uploaded as a document linked to the occurrence and the payment transaction, so the asset and obligation are derived server-side. If the upload fails, the payment MUST be kept and the user MUST see an error stating the payment was registered but the receipt was not attached, with a way to retry. Unsupported types or oversize files MUST be rejected before submission.

#### Scenario: With receipt

- GIVEN a PDF selected
- WHEN the payment is submitted
- THEN the payment exists and the document is linked to the occurrence and transaction

#### Scenario: Without receipt

- GIVEN no file
- WHEN submitted
- THEN the payment is created with no document and no error

#### Scenario: Upload failure

- GIVEN the upload request fails after the payment succeeded
- WHEN the response arrives
- THEN the payment remains, the occurrence shows "Pagado", and a message says the receipt could not be attached

#### Scenario: Wrong type

- GIVEN a `.exe` file
- WHEN selected
- THEN it is rejected with a message and not uploaded

### Requirement: Payment visible in asset history

A payment registered here MUST appear, with its receipt when present, in the asset obligation history (see `asset-obligation-history`).

#### Scenario: Appears in history

- GIVEN a payment registered with a receipt
- WHEN the asset history is opened for that month
- THEN the occurrence is listed as paid with the receipt available

## Data Contract

- Reuses `GET /api/obligations/:id/payment-context` and `POST /api/obligations/:id/payments`; request gains optional `title` and `notes` (strings, length capped). Receipt via `API.documents.uploadTargets({occurrenceId, transactionId})`.
- The dialog uses a wider Modal via an additive width option; existing modals keep 440px default.

## Edge Cases

- Paying an already paid occurrence is rejected by the server and shown as an error.
- Upload is not atomic with payment (accepted risk).
- Date in the future is allowed only if the existing expense rules allow it.

## Acceptance Criteria

- "Registrar pago" opens a prefilled expense-like dialog; submission creates a linked expense, marks the occurrence paid and optionally stores a receipt.
