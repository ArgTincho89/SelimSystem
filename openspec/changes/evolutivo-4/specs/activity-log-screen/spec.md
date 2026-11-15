# Activity Log Screen Specification

> Traceability: request.md, first topic ("la parte de los logs ... un botón que se llame logs ... buscador ... desde y hasta ... por defecto me muestre todo ... a la izquierda la fecha y hora y luego la descripción"). Builds on the evolutivo-3 `audit-log` capability (recording, descriptions, retention are unchanged).

## Purpose

Move the activity log out of the Perfil page into a dedicated `/logs` screen with search and optional date filters, laid out as date/time on the left and description on the right.

## Requirements

### Requirement: Logs button in Perfil

Perfil MUST show a button labelled "Logs" that navigates to the `/logs` route. Perfil MUST NOT render the inline log list, its filters, or its pagination any more.

#### Scenario: Button navigates

- GIVEN the user is on Perfil
- WHEN they press "Logs"
- THEN the app shows the `/logs` screen

#### Scenario: No inline logs

- GIVEN the Perfil page is rendered
- WHEN the user inspects its content
- THEN no log entries, date filters or "Cargar más" control are present, only the "Logs" button

### Requirement: Dedicated /logs route

The app MUST register a `/logs` route served by a new page module. The route MUST require authentication like other pages. The navigation bar MUST keep "Perfil" highlighted while on `/logs`. The new module MUST be added to `public/index.html` and the service-worker static asset list, and the service-worker cache name MUST be bumped so clients refresh.

#### Scenario: Direct URL

- GIVEN an authenticated user
- WHEN they open `/logs` directly
- THEN the Logs screen renders

#### Scenario: Nav highlight

- GIVEN the user is on `/logs`
- WHEN the navigation bar renders
- THEN the "Perfil" item is the active one

#### Scenario: Cache refresh

- GIVEN a client holding the previous service-worker cache
- WHEN the new version is deployed
- THEN the cache name differs and `logs.js` is among the precached assets

### Requirement: Show everything by default

On first load the screen MUST request and show all entries with no default date range (the previous 30-day default MUST NOT apply). The list MUST be newest first and MUST be loaded in pages using the existing `before`/`nextBefore` cursor, with a "Cargar más" control while more entries exist. The empty state "Todavía no hay acciones registradas" MUST be shown when the user has no entries.

#### Scenario: Old entries visible

- GIVEN an entry dated 6 months ago
- WHEN the user opens `/logs` without touching any filter
- THEN that entry is reachable (on first page or via "Cargar más")

#### Scenario: Pagination

- GIVEN 120 entries and a page size of 50
- WHEN the screen loads and the user presses "Cargar más" twice
- THEN 50, then 100, then 120 entries are shown in newest-first order and the control disappears

#### Scenario: Empty

- GIVEN a user without entries
- WHEN `/logs` opens
- THEN "Todavía no hay acciones registradas" is shown

### Requirement: Search

The screen MUST provide a search input that filters the loaded entries client-side, case-insensitively and accent-insensitively, over the description text and the formatted date/time. Clearing the input MUST restore the full list. When search is active and entries remain unloaded, the screen MUST load further pages as needed or make clear that only loaded entries were searched (assumption: loading remaining pages on demand).

#### Scenario: Match

- GIVEN entries "Registraste el cobro del alquiler de Casa Centro" and "Eliminaste una transacción"
- WHEN the user types "casa centro"
- THEN only the first entry is visible

#### Scenario: Accent-insensitive

- GIVEN the entry "Eliminaste una transacción"
- WHEN the user types "transaccion"
- THEN the entry is visible

#### Scenario: No match

- GIVEN a search term that matches nothing
- WHEN applied
- THEN a "Sin resultados" message is shown

### Requirement: Optional from/to date filters

The screen MUST provide optional "Desde" and "Hasta" date inputs, both empty by default. When set, they MUST restrict the list to entries whose local-day falls within the inclusive range, using the existing `from`/`to`/`timezone` API parameters. "Desde" later than "Hasta" MUST be rejected with an inline message and no request. Clearing both MUST return to the all-entries view. Filters and search MUST combine.

#### Scenario: Range

- GIVEN entries on 2026-11-01, 2026-11-05 and 2026-11-10
- WHEN "Desde" is 2026-11-02 and "Hasta" is 2026-11-08
- THEN only the 2026-11-05 entry is shown

#### Scenario: Only from

- GIVEN only "Desde" is set
- WHEN applied
- THEN entries on or after that day are shown with no upper bound

#### Scenario: Invalid range

- GIVEN "Desde" 2026-11-10 and "Hasta" 2026-11-01
- WHEN applied
- THEN an inline error is shown and the list is unchanged

#### Scenario: Reset

- GIVEN active filters
- WHEN both dates are cleared
- THEN all entries are shown again

### Requirement: Two-column row layout

Each entry MUST render as a row with the date and time (day, hour, minute, e.g. "09/11/2026 14:35") in a left column and the Spanish description in a right column. Failed entries MUST still show the failure indication from evolutivo-3. Rows MUST stay legible on mobile widths (the left column keeps a fixed narrow width, the description wraps). The `<details>`-per-day grouping MUST NOT be used.

#### Scenario: Layout

- GIVEN an entry at 2026-11-09 14:35 "Eliminaste una transacción"
- WHEN rendered
- THEN "09/11/2026 14:35" is in the left column and the description in the right column of the same row

#### Scenario: Ordering

- GIVEN entries at 14:35 and 09:10 on the same day
- WHEN rendered
- THEN 14:35 appears above 09:10

#### Scenario: Mobile

- GIVEN a 360px wide viewport and a long description
- WHEN rendered
- THEN the description wraps and no horizontal scroll appears

### Requirement: Data isolation unchanged

The screen MUST only display the authenticated user's entries; no user identifier parameter is sent.

#### Scenario: Own entries

- GIVEN users A and B with entries
- WHEN A opens `/logs`
- THEN only A's entries appear

## Data Contract

- Reuses `GET /api/activity-logs?from&to&before&limit&timezone` returning `{items, nextBefore}`; no backend change. Text search is client-side.

## Edge Cases

- Time displayed in the user's local timezone to the minute.
- A filter change MUST reset the pagination cursor.
- API error shows an error message with a retry action and does not clear a previously loaded list.

## Acceptance Criteria

- "Logs" button in Perfil opens `/logs`; Perfil has no inline logs.
- `/logs` shows all entries by default with search and optional Desde/Hasta; rows are date/time left, description right.
