# Sub-accounts Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs. Traceability: request.md "Configuración".

> **Drift resolved (design.md wins).** Account list is FLAT with `parentId` (no `children` array), ordered parent then its children by `getAccountBalances`. `parentId` cannot change after creation. `DELETE` on a parent that has ANY children returns 409; `POST /archive` on a parent with ACTIVE children returns 409. Select tree is built client-side by `orderAccountsAsTree` (children prefixed `↳ `), top-level labels unchanged. Ranking adds "top-level accounts before sub-accounts" in `paymentContext`.

## Purpose

Allow a bank account to have child sub-accounts with their own currency, and allow income, expense and refund transactions to be assigned to an account or one of its sub-accounts.

## Requirements

### Requirement: Create a child sub-account

From Configuración the user MUST be able to create a sub-account under an existing top-level account, with its own name and its own currency (may differ from the parent). The sub-account MUST store `parentId`. Only one level is allowed: the parent MUST be top-level and active; a sub-account MUST NOT have children. A sub-account MUST NOT be primary. By default it inherits the parent's `ownerId`.

#### Scenario: Create in other currency

- GIVEN an ARS account "Banco Nación"
- WHEN a sub-account "Caja USD" with currency USD is created under it
- THEN it is stored with `parentId` of the parent and currency USD

#### Scenario: Depth limit

- GIVEN "Caja USD" is already a sub-account
- WHEN creating a sub-account under it
- THEN the response is 400 "Una sub-cuenta no puede tener sub-cuentas"

#### Scenario: Inactive parent

- GIVEN an archived parent
- WHEN creating a child
- THEN the response is 400

#### Scenario: Not primary

- GIVEN a sub-account
- WHEN marking it primary
- THEN the response is 400 "Una sub-cuenta no puede ser la principal"

#### Scenario: Owner inheritance

- GIVEN a parent owned by titular A
- WHEN a child is created without owner
- THEN the child ownerId equals A (DEFAULT Q2b)

### Requirement: Assign transactions to accounts or sub-accounts

Income, expense and refund transactions MUST be assignable to a top-level account or to a sub-account via `accountId`. Account selects (transaction form, pay dialog, collection dialog, transfers where accounts are chosen) MUST list accounts as a tree: parent followed by its indented children, showing currency. The transaction currency MUST match the chosen (sub-)account currency per existing rules.

#### Scenario: Expense to sub-account

- GIVEN sub-account "Caja USD" (USD)
- WHEN a USD expense of 100,00 is created with that accountId
- THEN the transaction is stored on the sub-account and its balance decreases by 100,00

#### Scenario: Refund to sub-account

- GIVEN a refund transaction
- WHEN assigned to a sub-account in the same currency
- THEN it is accepted

#### Scenario: Currency mismatch

- GIVEN a USD sub-account
- WHEN an ARS income is assigned to it
- THEN the response is 400 as for any account with different currency

#### Scenario: Select tree

- GIVEN "Banco Nación" with children "Caja USD" and "Caja EUR"
- WHEN an account select opens
- THEN options appear as "Banco Nación (ARS)", then indented "Caja USD (USD)", "Caja EUR (EUR)"

### Requirement: Balances per account and currency

Balances MUST be computed per account (including each sub-account) in its own currency. The parent view MUST list children beneath it with their own balances. There MUST be no cross-currency sum. Home KPIs, trends, economic overview and alerts MUST count each account once (a parent's total MUST NOT include its children's movements again) (DEFAULT Q2).

#### Scenario: Separate balances

- GIVEN parent ARS balance 500.000,00 and child USD balance 300,00
- WHEN Configuración is shown
- THEN the parent shows ARS 500.000,00 and the child USD 300,00 beneath it, with no combined total

#### Scenario: No double counting

- GIVEN a USD income of 100,00 in the child
- WHEN Home USD totals are computed
- THEN 100,00 is counted once

#### Scenario: Same-currency child

- GIVEN a child in ARS under an ARS parent
- WHEN totals for ARS are computed
- THEN both balances are summed as separate accounts, each once

### Requirement: Pay-dialog ranking

The pay/collection account candidates MUST rank: titular accounts in the occurrence currency first, then their sub-accounts in that currency, then the remaining active accounts (with the existing non-titular warning) (DEFAULT Q2b). Sub-accounts MUST be eligible when active and in the occurrence currency.

#### Scenario: Sub-account candidate

- GIVEN the titular has an ARS parent and a USD child, and a USD occurrence
- WHEN the pay dialog opens
- THEN the USD child is listed among titular candidates

#### Scenario: Ranking

- GIVEN titular account T (ARS), its child C (ARS) and a foreign account F (ARS)
- WHEN the dialog opens
- THEN order is T, C, F

### Requirement: Archive and delete rules

A parent with active children MUST NOT be archived or deleted (409 with Spanish message). A sub-account with movements MUST be archived, not deleted; one without movements MAY be deleted (DEFAULT Q2c). Archived sub-accounts MUST NOT be selectable for new movements but historical data remains.

#### Scenario: Archive parent with children

- GIVEN a parent with an active child
- WHEN archiving the parent
- THEN 409 "Archivá primero las sub-cuentas"

#### Scenario: Delete child with movements

- GIVEN a child with transactions
- WHEN deleting
- THEN it is archived instead and its history remains

#### Scenario: Delete empty child

- GIVEN a child without movements
- WHEN deleted
- THEN it is removed

### Requirement: Currency rule for parent change

Existing rules preventing currency changes on accounts with movements MUST also apply to sub-accounts. Changing a parent's currency MUST NOT alter its children.

#### Scenario: Child currency locked

- GIVEN a child with movements
- WHEN its currency is edited
- THEN the response is 400 as for top-level accounts

## Data Contract

- `accounts[].parentId?: string | null` (null/absent = top-level); other fields unchanged.
- Account list payload includes `parentId`, `children` or flat list plus `parentId` (design.md decides), and per-account balance with currency.
- Creation/edit use existing accounts endpoints (design.md authoritative).

## Validation Rules

- `parentId` references an existing, active, top-level account of the same user.
- Sub-account: `primary` false; depth 1.
- Currency required for children.

## Edge Cases

- Reconciliation and forecast operate per account, including sub-accounts.
- Transfers between parent and child in different currencies follow existing transfer rules (no implicit conversion added).
- Legacy accounts have no `parentId` and keep working; no migration data change besides optional normalization.

## Changes to baseline

- `payment-and-receipts` (evolutivo-2): candidate ranking adds sub-accounts.
- Settings UI shows sub-accounts under their parent.

## Acceptance Criteria

- A bank account can have a child with its own currency.
- Income, expense and refund can be assigned to an account or a sub-account.
- Balances are per account and currency with no double counting.
