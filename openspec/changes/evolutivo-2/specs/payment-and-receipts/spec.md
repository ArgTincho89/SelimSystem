# Payment and Receipts Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs.

## Purpose

Settle obligation occurrences correctly: owner-paid occurrences debit the titular's account and affect Home expenses and savings; tenant-paid occurrences stay off-ledger but are recorded in the asset history; both can carry a receipt viewable and downloadable from the asset file and monthly view.

## Requirements

### Requirement: Pay dialog

Paying an owner-responsible occurrence MUST open a dialog (replacing the amount prompt) with: Importe (prefilled with estimated/expected amount, editable, > 0), Fecha de pago (default today), Cuenta (debited account), Categoría (prefilled, required), Medio de pago (optional), Comprobante (optional file) and Notas (optional). Confirming MUST create one expense transaction.

#### Scenario: Dialog fields

- GIVEN an open owner occurrence
- WHEN "Pagar" is pressed
- THEN the dialog shows Importe, Fecha de pago, Cuenta, Categoría, Medio de pago (optional), Comprobante and Notas

#### Scenario: Create expense

- GIVEN a completed dialog
- WHEN confirmed
- THEN one expense transaction is created on the selected account and the occurrence becomes paid

#### Scenario: Missing category

- GIVEN neither the provider nor the user supplied a category
- WHEN confirming
- THEN the request is rejected with 400 and the dialog asks for a category

#### Scenario: Invalid amount

- GIVEN Importe 0
- WHEN confirming
- THEN it is rejected with 400

### Requirement: Titular-based account resolution

The debited account candidates MUST be the active accounts owned by the asset's current titular(es) whose currency equals the occurrence currency. Preselection: if exactly one candidate exists it MUST be selected; otherwise the primary account of the titular with the largest ownership percentage; if still ambiguous the user MUST choose. The user MUST be able to change the account in the dialog.

#### Scenario: Single candidate

- GIVEN one active ARS account of the titular and an ARS occurrence
- WHEN the dialog opens
- THEN that account is preselected

#### Scenario: Co-owners

- GIVEN titulars A 70% and B 30% each with accounts
- WHEN the dialog opens
- THEN A's primary account is preselected and B's accounts are also selectable

#### Scenario: Currency filter

- GIVEN the titular has an ARS and a USD account and the occurrence is USD
- WHEN the dialog opens
- THEN only the USD account is a titular candidate

#### Scenario: Override

- GIVEN a preselected account
- WHEN the user picks another listed account
- THEN the transaction uses the chosen account

### Requirement: Fallback accounts

If no titular account matches the occurrence currency, the dialog MUST list all active accounts in that currency with a visible warning that they do not belong to the titular. If no active account in that currency exists, payment MUST be blocked with an explanatory message and no transaction created. The API MUST reject an account that is inactive or in a different currency with 400.

#### Scenario: Fallback with warning

- GIVEN the titular has no USD account but another active USD account exists
- WHEN the dialog opens for a USD occurrence
- THEN the other account is listed with a warning

#### Scenario: No accounts

- GIVEN no active account in the occurrence currency
- WHEN "Pagar" is pressed
- THEN payment is blocked with a message and nothing is created

#### Scenario: Wrong currency account

- GIVEN a payload with an account in another currency
- WHEN submitted
- THEN the response is 400

### Requirement: Ledger impact for owner payments

An owner payment MUST decrease the chosen account balance, appear as an expense in Home global expenses and therefore reduce savings, on the payment date and in the occurrence currency. Existing partial-payment behavior MUST be preserved: several payments are allowed until the owner portion is covered, a payment MUST NOT exceed the owner remaining amount, and paying a fully settled occurrence MUST be rejected.

#### Scenario: Home totals

- GIVEN an owner payment of 10000 ARS
- WHEN Home is loaded for the payment month
- THEN expenses increase by 10000 and savings decrease by 10000

#### Scenario: Payment on a settled occurrence

- GIVEN an occurrence whose owner portion is fully paid
- WHEN paying again
- THEN the request is rejected (existing over-payment rule)

### Requirement: Optional payment method

Medio de pago in the dialog MUST be optional. When provided it MUST be stored on the transaction; when omitted the transaction MUST be created without it. The obligation's legacy `paymentMethod` MUST NOT be used.

#### Scenario: Without method

- GIVEN the dialog with Medio de pago empty
- WHEN confirmed
- THEN the transaction is created without a payment method

### Requirement: Tenant payment is off-ledger

For tenant-responsible occurrences, "Registrar pago del inquilino" MUST create a tenant obligation resolution (paid by tenant) with date, optional amount, notes and optional receipt. It MUST NOT create a transaction and MUST NOT change any account balance, income, expense or savings figure.

#### Scenario: No financial effect

- GIVEN a tenant-responsible occurrence
- WHEN the tenant payment is registered
- THEN no transaction exists for it and Home income, expenses, savings and account balances are unchanged

#### Scenario: History entry

- GIVEN a registered tenant payment on 2026-03-12 of 8000 ARS
- WHEN the asset file history is opened
- THEN it shows "Pagado por inquilino" on that date with the amount

#### Scenario: Alert text

- GIVEN a tenant occurrence due on 2026-03-10
- WHEN alerts are generated
- THEN the alert tells that the tenant must present the receipt for that provider and due date

#### Scenario: Alert cleared

- GIVEN the tenant payment is registered
- WHEN alerts are generated again
- THEN the pending alert disappears

### Requirement: Receipt attachment

A receipt (Comprobante) MAY be attached when paying (owner payment dialog) and when registering a tenant payment, using the existing document upload rules (type and size limits). The document MUST be linked to the payment transaction or the resolution and to the occurrence and asset. If the file is rejected, nothing MUST be created and the user MUST see the error.

#### Scenario: Attach on owner payment

- GIVEN a PDF receipt
- WHEN the owner payment is confirmed
- THEN the document is stored and linked to the transaction, occurrence and asset

#### Scenario: Attach on tenant payment

- GIVEN a JPG receipt
- WHEN a tenant payment is registered
- THEN the document is linked to the resolution, occurrence and asset

#### Scenario: Oversized or invalid file

- GIVEN a file exceeding the allowed size or an unsupported type
- WHEN confirming
- THEN the request is rejected and no transaction/resolution exists

#### Scenario: Attach later

- GIVEN a paid occurrence without receipt
- WHEN the user uploads a receipt from the monthly view
- THEN the document is linked to that payment

### Requirement: View and download receipts

The asset file and the monthly view MUST show, for each paid or resolved occurrence with a receipt, a "Ver" link (opens online in a new tab) and a "Descargar" link (download), backed by `GET /api/documents/:id/content` and `?download=1`. Payloads MUST include document id, file name and mime type instead of counts only. Users MUST only access documents of their own data.

#### Scenario: View online

- GIVEN a paid occurrence with a PDF receipt
- WHEN "Ver" is clicked in the monthly view
- THEN the PDF opens inline in a new tab

#### Scenario: Download

- GIVEN the same receipt
- WHEN "Descargar" is clicked in the asset file
- THEN the browser downloads it with its original file name

#### Scenario: No receipt

- GIVEN an occurrence without attachments
- WHEN rendered
- THEN no links appear

#### Scenario: Multiple receipts

- GIVEN two documents linked to one occurrence
- WHEN rendered
- THEN both are listed with their file names

### Requirement: Month-by-month history

The asset file/monthly view MUST list each month's obligations with payer (Titular / Inquilino), paid date, amount and receipt links, covering both owner payments and tenant resolutions.

#### Scenario: Mixed months

- GIVEN January paid by the owner and February paid by the tenant
- WHEN the monthly view opens
- THEN January shows "Titular" with amount and date, February shows "Inquilino" with date and amount, each with their receipt links

## Data Contract

- Pay request: `{ amountMinor, paidAt, accountId, categoryId, paymentMethod?, notes?, document? }`.
- Occurrence/resolution payloads add `documents: [{ id, fileName, mimeType }]`, `paidBy`, `paidAt`, `amountMinor`.
- Tenant payments use `obligationResolutions`; no `transactions` row.

## Validation Rules

- `accountId` MUST be an active account of the occurrence currency.
- `categoryId` MUST be an expense category.
- `amountMinor` > 0; `paidAt` valid date.
- Tenant resolutions MUST NOT reference an account.

## Edge Cases

- Partial payments keep the existing behavior (multiple payments until the owner portion is covered).
- Deleting the transaction (existing tools) leaves the document, now linked only to occurrence and asset.
- Shared legacy occurrences keep separate owner payment and tenant resolution paths.
- A tenant resolution is not counted in any KPI even when it carries an amount.

## Changes to baseline

- `tenant-obligation-resolution` (evolutivo): resolution accepts an optional receipt in the same request and exposes its documents in payloads.
- `document-linking` (evolutivo): documents MAY be linked to a payment transaction at creation time from the pay dialog.
- `property-monthly-view` (evolutivo): cells expose document metadata and show "Ver"/"Descargar" links and payer, replacing document counts and file-name text only.
- `asset-file-overview` (evolutivo): history entries and receipt links added.
- `alerts-center` (evolutivo): tenant alerts state that the tenant must present the receipt for the provider and due date; owner pay actions open the new dialog.
- `obligation-responsibility` (evolutivo): owner payments no longer use `paymentMethod` from the obligation.

## Acceptance Criteria

- Owner payment debits the titular account (or chosen alternative) and changes Home expenses and savings.
- Tenant payment changes no financial figure and appears in the asset history.
- Receipts can be attached, viewed online and downloaded from the asset file and monthly view.
