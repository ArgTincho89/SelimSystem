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

## Remaining: S2..S9
