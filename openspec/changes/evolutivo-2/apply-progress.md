# Apply Progress: evolutivo-2

## Slice S1 (party backend) - done
- [x] 1.1 owners route: firstName/lastName/dni/expenseCategoryId, derived name, DELETE with 409 reference guard (route did not exist before)
- [x] 1.2 migrateEvolutivo2 (owners part) + call in app.js

Notes: legacy `kind` default is `entity`; backfill only touches `kind === 'person'`. Person fields are cleared (null) when a party is switched to organization. Category is only accepted when roles include `provider`.

## Slice S2 (party UI) - done
- [x] 2.1 entities.js: `EntitiesPage.renderPanel(panel, role)`, person/organization fields, provider category required for organizations (UI), delete via `API.owners.delete`
- [x] 2.2 settings.js: tabs Titular/Inquilino/Proveedor (sections owners/tenants/providers); account titular select already filtered to role `owner`
- [x] 2.3 app.js: `/entities` redirects to `/settings?section=owners`, navbar "Contactos" removed; sw.js cache v27
- [x] 2.4 tests/ui/evolutivo2-s2-contract.test.js (existing S1 contract test needed no change)

Notes: e2e has no references to Contactos or /entities. Roles checkboxes keep the five legacy roles so payment_responsible/other stay editable.

## Slice S3 (asset backend) - done
- [x] 3.1 assets.js typed movable/immovable fields, condition/usageStatus sync, filters condition/propertyKind, search plate/brand
- [x] 3.2 src/services/asset-holders.js `validateHolders` (used by S4 composite form; not applied to legacy POST /api/assets)
- [x] 3.3 migrateEvolutivo2 extended (assets and contracts), add-only/idempotent

Notes: when `condition` is omitted it is derived from `usageStatus` (rented -> rented) so legacy posts keep their usage status; the sync only runs when `condition` is sent explicitly.

## Slice S4 (asset composite form) - done
- [x] 4.1 src/services/asset-form.js validate/apply/diffHolders
- [x] 4.2 POST /api/assets/form and PUT /api/assets/:id/form; non-null rental returns 400 until S6; assetResponse adds activeContract:null and obligations:[] placeholders

Notes: validateAsset is injected into the service (no circular require). Holders starting today or later are edited/removed in place; older changed ones close at yesterday. obligationResponsibilities is only type-checked (S6 applies it). Tests in tests/routes/assets-form.test.js.

## Slice S5 (asset form UI) - done
- [x] 5.1 api.js `assets.saveForm(id|null, payload)`; assets.js "Nuevo bien" rewritten per request.md (Titular rows with "Agregar titular" and % when >1, Titulo, per-type fields, Notas); edit prefills open holders; list/detail show new fields; "Datos anteriores" read-only section only when legacy values exist
- [x] 5.2 sw.js cache v28; tests/ui/evolutivo2-s5-contract.test.js; S2 contract test relaxed to a versioned cache name

Notes: `documents.contentUrl` already existed. Single-titular edits resend the stored percentage (or null) so unchanged holders are not rewritten. `div[data-slot="rental-and-obligations"]` is the mount point for S7 (rental block + obligations). Condition Alquilado/Usufructo is sent with `rental: null` until S6/S7.
