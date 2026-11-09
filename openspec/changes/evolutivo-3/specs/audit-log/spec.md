# Audit Log Specification

> Field names, endpoints and collections are defined in `../../design.md`, which is authoritative where this spec is generic or differs. Traceability: request.md "Agregar LOGS..." and the follow-up clarification (section "LOGS" in Perfil -> "Acciones de cuenta").

> **Drift resolved (design.md wins).** Entry fields are `timestamp`, `method`, `route` (pattern), `action`, `entityType`, `entityId`, `entityLabel`, `outcome` (`success|failure`), `statusCode`, `message` (not `at`/`resourceType`/`status`/`description`/`'ok'|'fallido'`; the UI renders "fallido" text from `failure`). Entries are per-user (no `userId` field needed). Endpoint `GET /api/activity-logs?limit=50(max 200)&before=<ISO>` returns `{items, nextBefore}`; there is no `from/to/cursor` filter. Retention prunes entries older than 12 months on write, at most once per user per day (no startup job). Skipped: unauthenticated requests, `DELETE /api/auth/account`, forgot/reset-password.

## Purpose

Record every write action of the user with a timestamp and let the user consult their own actions in plain Spanish, with day, hour and minute, from Perfil -> "Acciones de cuenta" -> "LOGS".

## Requirements

### Requirement: Record every write action

The system MUST record one log entry for every authenticated write request (POST, PUT, PATCH, DELETE), including failed attempts (DEFAULT Q6). Each entry MUST store: id, userId, timestamp (ISO, server time), HTTP method, route, resource type, resource id when known, outcome (success / failure with status), and a Spanish human-readable description. Read requests (GET) MUST NOT be logged. Request bodies, passwords, tokens, session data and file contents MUST NOT be stored.

#### Scenario: Create transaction

- GIVEN an authenticated user
- WHEN they create an expense transaction successfully
- THEN one entry exists with their userId, timestamp, method POST, outcome success and a Spanish description

#### Scenario: Failed action

- GIVEN a request rejected with 409
- WHEN processed
- THEN an entry is stored with outcome "fallido" and the status

#### Scenario: GET not logged

- GIVEN a GET request
- WHEN processed
- THEN no entry is created

#### Scenario: Secrets excluded

- GIVEN a password change request
- WHEN logged
- THEN the entry says "Cambiaste tu contraseña" and contains no password, token or body

#### Scenario: Unauthenticated

- GIVEN a write request without session (e.g. login failure)
- WHEN processed
- THEN no user-scoped entry is created (DEFAULT; auth routes run before session)

### Requirement: Plain-language Spanish descriptions

Descriptions MUST be written in Spanish, second person past tense, naming the affected entity when known. A mapping from route+method to a message template MUST exist; unmapped routes MUST get a generic message ("Realizaste una acción en <área>") rather than raw paths. English statuses and raw codes MUST NOT appear.

#### Scenario: Rent collection

- GIVEN the user collects the 2026-05 rent of "Casa Centro"
- WHEN logged
- THEN the description reads "Registraste el cobro del alquiler de Casa Centro, período mayo 2026"

#### Scenario: Delete transaction

- GIVEN the user deletes a transaction
- WHEN logged
- THEN the description reads "Eliminaste una transacción" with amount and account when available

#### Scenario: Reverse collection

- GIVEN a rent collection reversal
- WHEN logged
- THEN the description reads "Revertiste el cobro del alquiler de <bien>, período <mes año>" and keeps the old amount

#### Scenario: Unmapped route

- GIVEN a write route without template
- WHEN logged
- THEN the description is generic Spanish and shows no raw URL

### Requirement: LOGS section in Perfil

Perfil -> "Acciones de cuenta" MUST include a section named "LOGS" listing the current user's actions, newest first, each with: date and time with day, hour and minute (e.g. "09/11/2026 14:35"), the Spanish description, and the outcome. The list MUST be paginated or lazily loaded (DEFAULT 50 per page). The section MUST show an empty state "Todavía no hay acciones registradas" when none exist. A user MUST only see their own entries.

#### Scenario: Display

- GIVEN entries at 2026-11-09 14:35 and 2026-11-09 09:10
- WHEN LOGS is opened
- THEN "09/11/2026 14:35" appears above "09/11/2026 09:10", each with its description

#### Scenario: Empty

- GIVEN a user without entries
- WHEN LOGS is opened
- THEN the empty state is shown

#### Scenario: Isolation

- GIVEN user A and user B with entries
- WHEN A opens LOGS
- THEN only A's entries appear and requesting B's ids returns nothing

#### Scenario: Pagination

- GIVEN 120 entries
- WHEN LOGS is opened and "Cargar más" is pressed
- THEN the first 50 and then the next 50 appear in order

#### Scenario: Location

- GIVEN the Perfil page
- WHEN "Acciones de cuenta" is opened
- THEN the "LOGS" entry is visible there

### Requirement: Read endpoint

An authenticated endpoint MUST return the caller's entries newest first with pagination (cursor or page) and optional date range filter. It MUST NOT accept a userId parameter.

#### Scenario: Own only

- GIVEN a userId query parameter of another user
- WHEN requested
- THEN it is ignored and only the caller's entries are returned

### Requirement: Retention

Entries older than 12 months MUST be purged automatically (DEFAULT Q6), by startup or scheduled cleanup, without affecting newer entries. Logging MUST NOT block or fail the original request: a logging failure MUST be swallowed and reported to the server console only.

#### Scenario: Purge

- GIVEN an entry 13 months old and one 2 months old
- WHEN cleanup runs
- THEN only the old one is removed

#### Scenario: Logging failure

- GIVEN a failure writing the log
- WHEN a user action succeeds
- THEN the action response is unaffected

## Data Contract

- Collection `activityLogs`: `{ id, userId, at, method, route, resourceType?, resourceId?, status, outcome: 'ok'|'fallido', description }`.
- `GET /api/activity-logs?limit&cursor&from&to` (name per design.md).
- Middleware mounted after session, before routers.

## Validation Rules

- `limit` 1-100; dates valid.
- Description length capped (e.g. 300 chars).

## Edge Cases

- Time displayed in the user's/local timezone, to the minute.
- Concurrent writes MUST NOT lose entries (single chokepoint append).
- Multi-step operations produce one entry per request, not per internal write.

## Changes to baseline

- `profile.js` "Acciones de cuenta" gains the "LOGS" section.

## Acceptance Criteria

- Every write action appears in Perfil -> Acciones de cuenta -> LOGS in Spanish with day, hour and minute.
- No bodies or credentials are stored; only own entries are visible.
