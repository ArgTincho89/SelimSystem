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

## Slice S6 (rental inline and responsibility backend) - done
- [x] 6.1 rentals service/route: adjustmentFrequencyMonths, adjustmentCriterion, contractKind; `afterContractWrite` sets usageStatus and condition on activation; `cancelUnpaidOccurrences` extracted
- [x] 6.2 `responsibilityFor` + `setResponsibility` (pins past/settled occurrences first), PATCH /api/obligations/:id/responsibility; occurrenceView, createResolution and monthlyView use the helper
- [x] 6.3 asset-form applies `rental` (create/update/end, locked -> 409) and `obligationResponsibilities`; assetResponse adds `activeContract` and `obligations` (also GET /api/assets/:id)

Notes: rented/usufruct with no rental and no active contract returns 400 ("Completá los datos del alquiler..."); with an existing active contract and `rental: null` the contract is kept unchanged (S5 UI edits still work). not_rented ignores `rental`; rental on a movable is 400. validateContract takes an `assetHint` so a contract can be validated before the asset exists. alerts.js still reads the live obligation type (not part of the task).

## Slice S7 (rental block and obligations section UI) - done
- [x] 7.1 assets.js `renderRentalAndObligations` mounted in the S5 slot: tenant select, desde/hasta, Monto original + currency (ARS/EUR/USD), frecuencia/criterio de ajuste; locked contract read-only with hint; prefill from `activeContract`; inline (no window.confirm) confirmation before ending a contract via No alquilado
- [x] 7.2 "Identificacion catastral" header + obligation lines ("<Proveedor> - Cuenta Nº: x"), "A cargo de" Titular/Inquilino selectors (legacy shared read-only), "Nueva obligacion" shortcut -> `/obligations?newForAsset=<id>` opens the create modal prefilled; `API.obligations.setResponsibility`
- [x] 7.3 sw.js v29; tests/ui/evolutivo2-s7-contract.test.js; S5/S6 contract tests relaxed/updated

Notes: the asset Editar button now fetches GET /api/assets/:id so activeContract and obligations are available. Responsibilities travel in the composite form body (not via PATCH). Frequency is a text input with integer validation; the amount is the only number input of the block.

## Slice S8 (obligation form simplification) - done
- [x] 8.1 validateDefinition defaults missing paymentMethod to ''; payment POST no longer copies the obligation/occurrence payment method (empty, S9 captures it); category chain body -> occurrence -> obligation -> provider.expenseCategoryId; PUT propagation tolerates missing paymentMethod
- [x] 8.2 obligations.js form: Nombre, Tipo, Bien, Proveedor, Cuenta/Contrato selector + number, Frecuencia, Primer/Ultimo vencimiento, Aviso, Moneda, Importe, Categoria (provider prefill), Responsable Titular/Inquilino, Notas; sw.js v30; tests/ui/evolutivo2-s8-contract.test.js, tests/routes/obligation-simplified.test.js

Notes: provider field stays providerEntityId (legalOwners). Cuenta habitual and responsibleEntityId were removed from the form but stored values are kept (omitted from PUT payload). Legacy shared/third/none appear as an "(anterior)" option and are left untouched unless changed. Custom reminder days is a text input so the amount stays the first number input. Obligation list no longer shows paymentMethod.
