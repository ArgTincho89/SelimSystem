# Apply Progress: evolutivo-2

## Slice S1 (party backend) - done
- [x] 1.1 owners route: firstName/lastName/dni/expenseCategoryId, derived name, DELETE with 409 reference guard (route did not exist before)
- [x] 1.2 migrateEvolutivo2 (owners part) + call in app.js

Notes: legacy `kind` default is `entity`; backfill only touches `kind === 'person'`. Person fields are cleared (null) when a party is switched to organization. Category is only accepted when roles include `provider`.
