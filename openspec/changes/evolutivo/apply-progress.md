# Apply Progress: Evolutivo

Mode: standard (strict_tdd false). Branch: feat/evolutivo (feature-branch-chain).

## S1 - Phase 1a (done)

- [x] 1.1 `src/services/migrations.js` `migrateEvolutivo(db)`, registered in `createApp`; idempotent backfill (`responsibilityType: 'owner'`, null external id fields).
- [x] 1.2 External identifier/type validation in `validateDefinition` (`src/services/obligations.js`); `?externalIdentifier=` list filter in `src/routes/obligations.js`.
- [x] 1.3 `src/routes/owners.js`: roles widened, deduped, optional `roleLabel` (<=80).
- [x] 1.4 UI: entities roles, obligations identifier form/list; `public/sw.js` -> `selimsystem-v19`.

Tests: tests/services/migrations.test.js, tests/routes/owners-roles.test.js, tests/routes/obligation-external-identifiers.test.js, tests/ui/evolutivo-s1-contract.test.js.
Results: `npm run test:coverage` 30 suites / 370 tests pass, thresholds met.

Notes: identifier tests live in a new file instead of extending obligations.test.js (separate temp-db lifecycle). Migration does not set `responsibilityType` on newly created obligations (S2 wires it, default `owner`).

## S2 - Phase 1b (done)

- [x] 2.1 `portionsFor` / `validateResponsibility` (+ `validateSplit`) in `src/services/obligations.js`, wired into `validateDefinition`.
- [x] 2.2 Responsibility fields flow through existing POST/PUT via `validateDefinition`; `createObligation` defaults `responsibilityType: 'owner'`. Non-shared types store `responsibilitySplit: null`; non-third store `responsibleThirdEntityId: null`. Edits only change the definition (occurrences unchanged; history is kept via existing revisions).
- [x] 2.3 `src/routes/documents.js`: `resolveTargets` replaces `targetFor` (accepts occurrence/rentOccurrence/transaction/tenant plus legacy targets, derives obligation/contract/asset, 400 on mismatch); list filters by every provided target (AND); multer `fields` limit raised to 9.
- [x] 2.4 Obligations form (responsibility selector, conditional split/third/contract fields), list shows responsibility; `API.documents.uploadTargets/listBy`; `public/sw.js` -> `selimsystem-v20`.

Tests: tests/services/obligation-portions.test.js, tests/routes/obligation-responsibility.test.js, tests/routes/documents-targets.test.js, tests/ui/evolutivo-s2-contract.test.js (S1 UI test now accepts v19 or later).
Results: `npm run test:coverage` 34 suites / 395 tests pass.

Notes: `portionsFor` treats shared `other` rule as owner-only (informational). Percentage split rounds tenant portion, owner takes the remainder. Fixed split: tenant = min(tenantFixed, due); if only ownerFixed given, tenant = due - ownerFixed. Obligations are updated with PUT (no PATCH route exists).

## S8 - Phase 5 (done)

- [x] 8.1 `src/utils/ownership-overlap.js` (`overlaps`, `validateOwnershipSet`): same-holder overlap rejected, concurrent percentage sum > 100 rejected at each start date; different holders may overlap.
- [x] 8.2 Applied in `src/routes/assets.js` on batch create, POST ownership (existing + candidate) and PATCH end date (others + patched).
- [x] 8.3 No frontend change: add/close ownership handlers in `public/js/pages/assets.js` already toast the API error message; CACHE_NAME stays v20.

Tests: tests/services/ownership-overlap.test.js, tests/routes/assets-ownership-overlap.test.js.
Results: `npm run test:coverage` 36 suites / 409 tests pass.

## Remaining: S3..S7, S9
