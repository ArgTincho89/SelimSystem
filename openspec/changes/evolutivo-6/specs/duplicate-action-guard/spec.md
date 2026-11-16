# Duplicate Action Guard Specification

> Traceability: request.md 6 (Prevención de doble clic); proposal item 6.1.

## Purpose

Prevent duplicate records caused by rapid repeated clicks.

## Requirements

### Requirement: In-flight request dedupe

`API.request` SHALL share one promise among identical non-GET requests (same method, URL and body) while one is in flight, so only one network request is sent. Once settled, the same request MAY be sent again. GET requests SHALL NOT be deduplicated.

#### Scenario: Double click
- WHEN the same POST is issued twice before the first settles
- THEN a single request is sent and both callers get its result

#### Scenario: After settle
- WHEN the first request has settled
- THEN an identical request is sent normally

#### Scenario: Different body
- WHEN two POSTs to the same URL differ in body
- THEN both are sent

### Requirement: Busy button state

Action button handlers in `utils/dom.js` SHALL disable the button and set `aria-busy="true"` until the handler promise settles (success or failure), then restore it. A button with `data-repeatable` SHALL be exempt.

#### Scenario: Busy
- WHEN a button is clicked and its action is pending
- THEN it is disabled with `aria-busy` and further clicks do nothing

#### Scenario: Failure restores
- WHEN the action rejects
- THEN the button is enabled again

#### Scenario: Repeatable
- GIVEN a button with `data-repeatable`
- THEN it is not disabled between clicks
