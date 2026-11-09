# UI Localization and Money Input Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs. Traceability: request.md "Bienes" (Ver historial English words) and "Obligaciones" (money format).

> **Drift resolved (design.md wins).** API is `MoneyInput.create({currency, value, id, ariaLabel, allowNegative})`, `.value(el)`, `.setValue`, `.setCurrency`, `.parse(text, currency)` (not `MoneyInput({onChange})`). `statusLabel` map is the one in design.md (includes `expected`, `confirmed`, `posted`, `active`, `ended`, `draft`, `expiring`, `scheduled`, `reversed`, `collected`, `partially_collected`; `open` falls to "Sin estado" unless added). `currencyDigits` and `orderAccountsAsTree` live in `format.js`. Dot parsing: with a comma the comma is decimal; dots-only `^\d+\.\d{1,precision}$` is decimal, else thousands.

## Purpose

Remove English status words from the UI and render every money input as a formatted amount (es-AR), without changing non-money numeric inputs.

## Requirements

### Requirement: Spanish status labels

The UI MUST NOT render raw English status codes (`overdue`, `pending`, `paid`, `open`, `partial`, etc.) to the user. A shared `statusLabel()` helper MUST map every known status code to a Spanish label and MUST be used in every place a status is rendered, including the "Ver historial" modal and the section "Pendiente, fuera de resultados reales". An unknown code MUST render a neutral Spanish fallback ("Sin estado"), never the raw code.

Default label map (DEFAULT, design.md may refine): `pending` -> "Pendiente", `overdue` -> "Vencido", `paid` -> "Pagado", `partial` -> "Parcial", `open` -> "Abierto", `cancelled` -> "Cancelado", `resolved` -> "Resuelto".

#### Scenario: Ver historial overdue

- GIVEN an expected rent of ARS 9.750.000,00 due 2026-05-01 with status `overdue`
- WHEN "Ver historial" is opened
- THEN the pending section shows "2026-05-01 · Alquiler esperado · ARS 9.750.000,00 · Vencido"
- AND the text "overdue" appears nowhere in the modal

#### Scenario: Pending label

- GIVEN an item with status `pending`
- WHEN rendered anywhere in the UI
- THEN it shows "Pendiente"

#### Scenario: Unknown status

- GIVEN a status code not in the map
- WHEN rendered
- THEN the label "Sin estado" is shown and the code is not exposed

### Requirement: Money input component

A shared `MoneyInput` MUST be used for every field that captures a money amount (e.g. "Importe estimado" in "Nueva obligación", payment/collection amounts, rent amounts, account opening balance, transaction amount). It MUST be a text input (`inputMode=decimal`) carrying `data-money-input`. On blur it MUST format the value with es-AR separators (thousands ".", decimals ",") and the precision of the field currency (default 2). On focus the raw edited text MUST remain editable. Non-money numeric inputs (percentages, months, counts, years) MUST stay unchanged.

#### Scenario: Format on blur

- GIVEN the "Importe estimado" field of "Nueva obligación"
- WHEN the user types `211392` and leaves the field
- THEN the field shows "211.392,00"

#### Scenario: Already formatted input

- GIVEN the user types `211.392,50`
- WHEN the field loses focus
- THEN it shows "211.392,50" and the parsed value is 211392.50

#### Scenario: Decimal comma only

- GIVEN the user types `1234,5`
- WHEN blurred
- THEN it shows "1.234,50"

#### Scenario: Non-money numbers untouched

- GIVEN the "Frecuencia de ajuste (meses)" or IVA % field
- WHEN rendered
- THEN it remains a plain number input without money formatting

### Requirement: Money parsing and submission

`MoneyInput` MUST parse es-AR text to a numeric value (or minor units) before submit; the API payload contract MUST NOT change. Empty input MUST yield "no value" (not 0). Invalid text (letters, multiple decimal commas) MUST be rejected client-side with a Spanish message and MUST NOT be submitted.

#### Scenario: Submit parsed value

- GIVEN a field showing "211.392,00"
- WHEN the form is submitted
- THEN the request carries the amount 211392 (or 21139200 minor units, as the existing endpoint expects)

#### Scenario: Invalid text

- GIVEN the user types `12,3,4`
- WHEN blurred or submitted
- THEN the field shows an error "Importe inválido" and nothing is submitted

#### Scenario: Zero precision currency

- GIVEN a currency whose precision is 0
- WHEN `1500` is typed and blurred
- THEN it shows "1.500" (no decimals)

### Requirement: E2E page objects

E2E page objects (`e2e/pages/*.ts`, e.g. `TransactionForm.fillAmount`, `HomePage`) MUST select money fields by `[data-money-input]` instead of `[type="number"]` and MUST type amounts in a form the component accepts.

#### Scenario: fillAmount

- GIVEN `TransactionForm.fillAmount('211392')`
- WHEN executed against a money field
- THEN the field ends with the parsed value 211392 and existing E2E flows still pass

## Data Contract

- `statusLabel(code: string): string`.
- `MoneyInput({ currency?, value?, onChange, required? })` -> element with `data-money-input`; exposes parsed numeric value.
- No API or storage changes.

## Validation Rules

- Accepted input: digits, one decimal comma, optional thousands dots.
- Negative values only where the original field already allowed them.
- Parsed value respects currency precision (rounded, never silently truncated beyond precision without formatting).

## Edge Cases

- Pasting "211392.00" (dot decimal) SHOULD be interpreted as 211392.00 only when the dot is followed by exactly the currency precision digits and no comma exists; otherwise the dot is a thousands separator (DEFAULT, Q7).
- Prefilled values (e.g. estimated amount) are formatted on render.
- Read-only ("Ver") modals show formatted text.

## Changes to baseline

- Amends numeric inputs in `assets.js`, `transactionForm.js`, `home.js`, `obligations.js`, `settings.js` (money ones only).

## Acceptance Criteria

- No English status word is visible in the UI.
- "211392" typed in a money field becomes "211.392,00".
- Existing E2E tests pass with the updated page objects.
