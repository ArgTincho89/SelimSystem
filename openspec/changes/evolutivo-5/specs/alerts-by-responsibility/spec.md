# Alerts by Responsibility Specification

> Traceability: request.md section 12; section 17 criterion 20; section 18 item 13.

## Purpose

Split the Avisos screen into owner-responsible and tenant-responsible groups, keeping internal alerts only, the existing limits and filters.

## Requirements

### Requirement: Responsibility field

Every alert returned by the alerts service MUST include `responsibility` with value `owner` or `tenant`. Tenant alerts: `tenant_obligation_pending`, `rent_due`, `contract_expiry`, `rent_adjustment_due`, and tenant receipt-pending alerts. Owner alerts: `obligation_due`, `obligation_overdue`, `partial_payment`, `document_pending` (owner payments), `card_installment_due`, `account_forecast`, and other alerts affecting the user's own finances. Existing fields MUST be unchanged.

#### Scenario: Classification

- GIVEN an overdue owner obligation and a pending rent month
- WHEN alerts are listed
- THEN the first has responsibility `owner` and the second `tenant`

#### Scenario: Backward compatible

- WHEN an old client reads alerts
- THEN all previous fields are still present

### Requirement: Responsibility filter

The alerts endpoint MUST accept a `responsibility` query filter (`owner` or `tenant`) combinable with existing filters (from, to, type, assetId, holderId, limit). An invalid value MUST yield a 400 with a Spanish message. The UI MUST add a "Responsable" filter (titular, inquilino) alongside the existing filters.

#### Scenario: Filter tenant

- WHEN `responsibility=tenant` is requested
- THEN only tenant alerts are returned

#### Scenario: Invalid value

- WHEN `responsibility=other` is requested
- THEN the response is 400

#### Scenario: Combined

- WHEN `responsibility=owner&type=obligation_due` is requested
- THEN only owner due alerts are returned

### Requirement: Two visual groups

The Avisos screen MUST show two top-level groups, "A cargo de titulares" and "A cargo de inquilinos", each with its own header, counter and visual style. Type groups MAY remain inside each group, keeping the existing `data-alert-group` attributes. A group with no alerts MUST show an empty message (for example "No hay obligaciones a cargo del inquilino."). The group MUST be conveyed by text and not by color alone.

#### Scenario: Groups with counters

- GIVEN 3 owner alerts and 2 tenant alerts
- WHEN Avisos opens
- THEN "A cargo de titulares" shows counter 3 and "A cargo de inquilinos" shows counter 2

#### Scenario: Empty group

- GIVEN no tenant alerts
- WHEN Avisos opens
- THEN the tenant group shows an empty message

### Requirement: Actions per group

Owner group actions: "Registrar pago", "Adjuntar comprobante", "Ver obligación", "Ver bien". Tenant group actions: "Resolver", "Registrar cobro", "Adjuntar comprobante", "Ver obligación", "Ver bien". The existing action labels pinned for other alert types MUST be kept.

#### Scenario: Owner due

- GIVEN an overdue owner obligation alert
- WHEN rendered
- THEN "Registrar pago" and "Ver obligación" are offered

#### Scenario: Rent due

- GIVEN a rent due alert
- WHEN rendered in the tenant group
- THEN "Registrar cobro" and "Ver bien" are offered

### Requirement: Existing rules preserved

Alerts MUST remain internal (no emails and no push notifications). The 90-day forward window and the 200-alert limit MUST be kept. Alerts of cancelled or resolved due dates MUST NOT be shown. Existing filters MUST keep working.

#### Scenario: Resolved excluded

- GIVEN a resolved tenant obligation
- WHEN alerts are listed
- THEN it does not appear

#### Scenario: Limit

- GIVEN more than 200 alerts
- WHEN listed
- THEN at most 200 are returned
