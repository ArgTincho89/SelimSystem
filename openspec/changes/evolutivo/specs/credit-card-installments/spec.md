# Credit Card Installments Specification

## Purpose

Define credit-card installment purchases (cuotas) with optional interest and future occurrences that remain scheduled until posted, so future commitments are visible without affecting posted totals.

## Requirements

### Requirement: Create installment purchase plan

The system MUST allow creating a credit-card installment plan with purchase date, concept, category, total amount, currency, account, credit-card payment method, installment count, due day, optional interest percentage, receipt, and optional asset allocation.

#### Scenario: Create valid plan

- GIVEN an active credit-card payment method linked to an active account in the same currency
- WHEN the user submits a plan with valid fields
- THEN the plan is persisted and N installment occurrences are generated
- AND no transaction or total is created until an occurrence is posted

#### Scenario: Invalid payment method

- GIVEN a payment method that is not a credit card or belongs to another account
- WHEN the user submits the plan
- THEN the request is rejected with 400

### Requirement: Generate installment occurrences

The system MUST generate exactly `installmentsCount` occurrences, one per month, on the configured due day, starting in the first month on or after the purchase date. The last occurrence MUST absorb rounding so occurrence amounts sum to the financed total.

#### Scenario: Monthly generation with day overflow

- GIVEN a due day of 31 and a month with 30 days
- WHEN occurrences are generated
- THEN that occurrence uses the last valid day of the month

#### Scenario: Interest calculation

- GIVEN a total of 1000 and 7% interest over 12 installments
- WHEN the plan is created
- THEN the financed total is calculated in minor units and each installment amount is derived from it

### Requirement: Scheduled occurrences do not affect totals

The system MUST treat installment occurrences as scheduled commitments. They MUST NOT be included in income, expense, or savings totals until posted.

#### Scenario: Unposted occurrence

- GIVEN a plan with generated occurrences
- WHEN monthly totals are calculated
- THEN scheduled occurrences are excluded

### Requirement: Post an installment occurrence

The system MUST allow posting an occurrence, creating one expense transaction linked to the plan and occurrence, and marking the occurrence as posted.

#### Scenario: Post occurrence

- GIVEN a scheduled occurrence
- WHEN the user posts it with account, category, and amount
- THEN an expense transaction is created and the occurrence status becomes posted

#### Scenario: Duplicate posting rejected

- GIVEN an already posted occurrence
- WHEN posting is attempted again
- THEN the request is rejected

### Requirement: Cancel plan or occurrence

The system MUST allow cancelling a plan or future unposted occurrence without deleting posted transactions.

#### Scenario: Cancel future occurrence

- GIVEN a scheduled future occurrence
- WHEN cancellation is requested
- THEN its status becomes cancelled and it no longer generates alerts

### Requirement: Installment alerts

The system MUST generate alerts for upcoming installment occurrences within the configured anticipation period.

#### Scenario: Upcoming installment alert

- GIVEN an occurrence due in 5 days and anticipation of 5 days
- WHEN alerts are requested
- THEN an alert of type `card_installment_due` is returned

## Data Contract

`creditCardInstallmentPlan`
- `id`, `userId`, `accountId`, `paymentMethodId`, `assetId?`, `categoryId?`
- `title`, `purchaseDate`, `currencyCode`, `totalAmount`, `totalAmountMinor`
- `installmentsCount`, `dueDay`, `interestPercent` (default 0), `financedTotalMinor`
- `installmentAmountMinor`, `reminderLeadDays` (0-90, default 5), `status` (`active`|`cancelled`|`completed`), `notes`, `documentId?`, `createdAt`

`creditCardInstallmentOccurrence`
- `id`, `planId`, `installmentNumber`, `dueDate`, `amountMinor`, `currencyCode`
- `status` (`scheduled`|`posted`|`cancelled`), `postedTransactionId?`, `postedAt?`, `notes`

## Validation Rules

- `installmentsCount` MUST be an integer between 1 and 120.
- `dueDay` MUST be an integer between 1 and 31.
- `interestPercent` MUST be a number between 0 and 1000.
- `totalAmount` MUST be positive and valid for `currencyCode`.
- `paymentMethodId` MUST reference an active credit-card method owned by the user and linked to `accountId`.
- `accountId` MUST reference an active account whose currency matches `currencyCode`.
- `assetId` and `categoryId`, when provided, MUST reference valid user-owned records.
- Occurrence amounts MUST be positive integers in minor units.

## Edge Cases

- Leap months and short months use the last valid day.
- Interest rounding uses minor units; the final installment absorbs the remainder.
- Cancelling a posted occurrence is prohibited.
- Plans with no future occurrences may be marked completed.

## Acceptance Criteria

- Creating a plan generates the expected number of future occurrences.
- Scheduled occurrences do not alter posted totals.
- Posting creates exactly one expense transaction.
- Alerts include upcoming installments.