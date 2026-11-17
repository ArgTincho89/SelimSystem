# Design: Evolutivo 6

This design is authoritative for names, fields and endpoints. The source of truth is `request.md`, and the behavior comes from `specs/*/spec.md`. Code references were checked against the working tree on branch `evolutivo-6`.

## Technical Approach

All changes are additive and keep the existing patterns:
- Express routes validate input and return `{ error }` with 400, 404 or 409.
- Services run synchronous `db.*` calls. Multi-collection writes use the snapshot-and-restore pattern of `rent-collections.js:21` (`atomically`).
- `activity-log.js` keeps its static `ROUTES` table. Routes now also pass structured context through `res.locals.activityMeta`. The middleware still never reads request bodies.
- On the client, plain page objects (`XxxPage`) build the DOM with `create()`/`on()` from `utils/dom.js`, `Modal`/`ConfirmDialog`, and call the `API` facade.

One new client component, `UndoDialog`, is shared by history, logs, obligations and rental periods. One new route/service pair is added: `asset-kinds`. Release: v1.15.0, sw `selimsystem-v47`.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Log metadata source | Routes set `res.locals.activityMeta = { assetId, ownerIds, tenantIds, categoryId, facts, undo }`. The middleware merges it on success only. It also derives `assetId`, `categoryId` and `tenantIds` generically from `entityType` (asset, obligation, contract, declaration) when the route sets nothing | Reading `req.body` in the middleware; resolving at list time | Keeps the "never read bodies" rule (`middleware/activity-log.js:6`). Write-time values survive later deletes |
| Tenant field | Store `tenantIds: string[]`. The query filter is the single `tenantId`, matched by membership | Scalar `tenantId` (spec wording) | Contracts and collections can have several tenants (`contract.tenantIds`). Filter semantics match the spec |
| Owner ids | `ownerIds` = owners with an active `assetOwnerships` row for the asset on the write date. For an asset-less payment, the account's `ownerId` | Owner of the account only | "Titular" in the UI means the asset holder |
| Undoability | Stored `undo` descriptor. `GET /activity-logs` adds a computed `undoable` boolean per item from the current state | Storing a mutable `undone` flag | No back-writes into the log. Stays correct when the undo happens from history instead of from the log |
| Undo UI | New `public/js/components/undoDialog.js`, `UndoDialog.open(descriptor, { onDone })`. It shows a required "Motivo" textarea (1–500 trimmed) and dispatches to one of three endpoints | One dialog per page | A single contract for history, logs, "Revertir pago" (`obligations.js:491`) and "Deshacer cobro" (`rentalPeriods.js:265`) |
| Reversal notes | Payment: `obligationPaymentReversals.reason` becomes required. Resolution: `obligationResolutions.voidReason`. Rent: `rentCollections.reversalReason` (and `rentCollectionGroups.reversalReason` for a month group) | A separate notes collection | Lives next to `voidedAt`/`reversedAt`. `asset-history` reads it as "Motivo" |
| DELETE with body | `API.delete(url, body)` forwards the body. `DELETE .../resolution` reads `req.body.reason` | `POST .../resolution/void` | Keeps the existing endpoint and log `ROUTES` entry. Express already parses JSON on DELETE |
| Double-click guard | Two layers: (a) in-flight dedupe in `API.request` for non-GET, keyed by `method+url+JSON(body)`; (b) promise-aware busy state in `create({onClick})`/`on(el,'click'|'submit')`, with `data-repeatable` opt-out | Server idempotency keys everywhere (out of scope); per-handler ad hoc disabling | (a) stops duplicate writes even from keyboard or programmatic double calls. (b) gives visible feedback. Neither changes sync handlers |
| Principal swap | One `db.replace('accounts', ...)` sets `primary` on exactly one id. Create: `db.create` with `primary:false`, then the replace; if the replace throws, the new account is removed | Two `db.update` calls | Exactly one principal after every request. The db is synchronous, so no reader sees the in-between state |
| Uncheck principal | `PUT /accounts/:id { primary:false, newPrimaryId }`. A missing or invalid replacement returns 400 (was 409 at `accounts.js:203`) | Auto-pick a replacement | Spec: explicit user choice and 400 |
| Asset delete | Hard delete only when unreferenced. Otherwise 409 with `references[]`. Asset-owned rows (`assetOwnerships`, `assetStatusHistory`) cascade in an atomic snapshot | Soft delete; cascading business data | Decision 3. Same pattern as `owners.js:113-121` |
| Custom kinds | New `assetKinds` collection `{ name, key }`, with `key = 'custom-' + slug(name)`. The asset stores `propertyKind = key`. Routes are `GET/POST /api/asset-kinds` (own router) | Storing the label; `/assets/kinds` | A separate router avoids clashing with `/assets/:id`. The key is stable if labels are rendered from the list |
| Categories location | `CategoriesPage.renderPanel(panel)` mounted in Settings section `categories`. `/categories` redirects to `/settings?section=categories` | Keep the page and add a link | Request 5.1. Same pattern as `EntitiesPage.renderPanel` |
| IVA by owner | `SummaryPage.renderIvaByOwner(summary, owners)` uses `summary.ivaByHolder` (`routes/summary.js:212`) for `HomePage.currentMonth`, left-joined with role-owner `API.owners.list()` (0 when absent). Title and `data-favorite-type="trend-iva"` stay the same | A new server endpoint | The data already exists per month. Home already loads `API.summary.get(this.currentMonth)` |

## Data Model (all additive)

| Collection | New fields |
|---|---|
| `activityLogs` | `assetId: string\|null`, `ownerIds: string[]`, `tenantIds: string[]`, `categoryId: string\|null`, `undo: UndoDescriptor\|null`. Old rows lack them and are treated as null/[] |
| `obligationResolutions` | `voidReason: string` (set by void) |
| `rentCollections`, `rentCollectionGroups` | `reversalReason: string` |
| `obligationPaymentReversals` | `reason` now always non-empty for new rows |
| `assetKinds` (new, per user) | `{ id, name (1–50, trimmed), key, createdAt }` |

```js
// UndoDescriptor (stored only when outcome === 'success')
{ type: 'obligation.payment',    obligationId, occurrenceId, transactionId }
{ type: 'obligation.resolution', obligationId, occurrenceId, resolutionId }
{ type: 'rental.collection',     collectionId }   // group id or collection id
```

`undoable` rules (computed in `activityLog.list`):
- Payment: the transaction exists and `obligationOccurrenceId` matches.
- Resolution: the resolution's `status === 'active'`.
- Collection: the collection or group exists and has no `reversedAt`.

## API Changes

| Endpoint | Change | Errors |
|---|---|---|
| `POST /obligations/:id/occurrences/:occ/resolution` | `notes` required (trimmed 1–2000). Sets `activityMeta` (facts plus `undo` resolution) | 400 "Las notas son obligatorias" |
| `POST .../payments` | `notes` required (trimmed 1–1000). The fingerprint is unchanged. `undo.transactionId` = the created transaction id | 400 "Las notas son obligatorias" |
| `DELETE .../resolution` | Body `{ reason }` required (1–500). Stored as `voidReason` | 400 "Indicá el motivo (hasta 500 caracteres)"; 404 when there is no active resolution (existing) |
| `POST .../payments/:tx/revert` | `reason` required (`obligation-payment-reversal.js:62`) | 400 (same message); 409 when already reverted (existing) |
| `POST /rentals/collections/:id/reverse` | Body `{ reason }` required. Passed to `rentals.reverseCollection(db,u,id,storage,reason)` and `reverseGroup` | 400; 409 "Ese cobro ya fue deshecho" (existing) |
| `GET /activity-logs` | Optional `assetId`, `ownerId`, `tenantId`, `categoryId` (AND). Filtering runs before pagination. Each item gets `undoable` | 400 "Filtro inválido" when the value is not a string of 100 characters or fewer |
| `POST /accounts` | `primary:true` (non-sub) swaps instead of returning 409 | 400 for a sub-account (existing) |
| `PUT /accounts/:id` | `primary:false` requires `newPrimaryId`: it must exist for the user, differ from `:id`, be `activo` and have no `parentId` | 400 "Elegí una cuenta activa para que sea la nueva principal" |
| `DELETE /assets/:id` (new) | 200 `{ ok:true }`. Log `asset.delete` "Eliminaste el bien" | 404 "Bien no encontrado"; 409 `{ error, references }` |
| `GET /asset-kinds`, `POST /asset-kinds` (new) | List or create `{ name }` → 201 kind. Log `asset-kind.create` "Creaste el tipo de bien" | 400 for a blank name or more than 50 characters; 409 "Ese tipo ya existe" (case- and accent-insensitive vs built-ins and the user's kinds) |
| `POST /assets`, `/assets/form`, `PUT` | `propertyKind` validated against `PROPERTY_KINDS` ∪ the user's `assetKinds.key` (`routes/assets.js:76`, which already receives `db,userId`) | 400 "El tipo de inmueble no es válido" |

**Asset reference checks.** `DELETE /assets/:id` returns 409 when any of these references the asset:

| Collection | Field |
|---|---|
| `transactions` | `assetId` |
| `movementAllocations` | `assetId` |
| `obligations` | `assetId` |
| `obligationResolutions` | `assetId` |
| `rentalContracts` | `assetId` |
| `rentalDeclarations` | `assetId` |
| `documents` | `assetId` |
| `wealthNotes` | `targetType==='asset' && targetId` |
| `recoverableExpenseClaims` | `assetId` |
| `creditCardInstallmentPlans` | `assetId` |

The message joins Spanish labels: "No se puede eliminar el bien porque tiene {movimientos, obligaciones, alquileres, documentos, notas, gastos a recuperar, planes de cuotas} asociados".

**Log messages.** `activityMeta.facts = { assetName, amount, currencyCode, dueDate, installment }` feeds a `describe(route, facts)` label builder:
- Example: "… de la obligación {title} de la propiedad {asset}, por un monto de {CUR} {es-AR amount}, con vencimiento {dd/mm/yyyy} | cuota {n/m}".
- A missing fact drops its fragment.
- Labels built from metadata may reach 300 characters (the plain-label cap of 120 stays).
- The note suffix " motivo: …" keeps `activityNote`.

## Client Changes

| File | Change |
|---|---|
| `public/js/api.js` | Add the `inflight` Map in `request`, `delete(url, body)`, `assetKinds.{list,create}`, `assets.delete(id)`, and filter params in `activityLogs.list` |
| `public/js/utils/dom.js` | `guard(el, event, handler)` is used by `create()` `on*` attrs and by `on()`: (1) for `click` or `submit` without `data-repeatable`; (2) if busy, `preventDefault` and return; (3) when the handler returns a thenable, disable the target (the button, or the form's `[type=submit]` buttons) and set `aria-busy="true"`; (4) restore the previous `disabled` value in `finally` |
| `public/js/components/undoDialog.js` (new) | Required "Motivo" textarea. Confirm stays blocked until the note is valid. Dispatches the descriptor to the three endpoints |
| `pages/obligations.js` | `showResolveModal`: tenants come from `obligation.rentalContractId`, then the asset's active contract (`GET /rentals?assetId=`), then all tenants; the first one is preselected. Required notes in resolve and pay. `revertPayment` delegates to `UndoDialog` |
| `pages/assetHistory.js` | `buildActions` maps `revert`, `unresolve` and `undo-collect` to a single "Deshacer" → `UndoDialog`. Detail shows `voidReason`/`reversalReason` as "Motivo" |
| `pages/rentalPeriods.js` | `undoCollections` uses `UndoDialog` |
| `pages/logs.js` | Filter panel (Bien, Titular, Inquilino, Categoría, "Limpiar filtros") that reloads from the server. "Deshacer" when `item.undoable`. Empty state |
| `pages/rentalModal.js` | `rent_due` alert gets the `alert-critical` class (red, bold). `cardActions(contract, { collect:false })` in Contratos. Contract cards load `API.documents.list('contract', id)` → "Ver documento" (reuses the `AssetHistory.showReceipt` viewer) and "Descargar documento" (`contentUrl(id,true)`) |
| `pages/assets.js`, `asset-form.js` | "Eliminar" (danger `ConfirmDialog`) in the ficha and the edit form. The 409 reason stays in the dialog. `propertyKindOptions()` merges the cached `assetKinds`, plus the "Agregar tipo…" option. The contract type falls back to `residential` (existing) |
| `pages/settings.js` | Section `categories` in the whitelist (`:9`) and the nav (`:48`). Principal checkbox enabled on create (not sub). On edit of the principal, unchecking reveals the "Nueva cuenta principal" select; with no eligible account, the box stays checked/disabled with a hint |
| `pages/categories.js` | Extract `renderPanel(panel)`. `render()` delegates to it |
| `pages/entities.js` | `showForm` always fetches `API.categories.list()` (expense) and shows the empty-state hint "Primero creá una categoría de gastos" |
| `pages/summary.js`, `home.js` | `renderIvaByOwner(summary, owners)` replaces the `renderIvaChart(trends)` call sites (`home.js:104,342`). Home adds `API.owners.list()` |
| `app.js` | Remove the navbar item (`:141`). The `/categories` route redirects (`:74`) |
| `public/css/*`, `public/sw.js`, `index.html` | `.alert-critical` and `[aria-busy]` styles. Register `undoDialog.js`. sw v47 |

## Data Flow

```
Row/History "Deshacer" -> UndoDialog(descriptor) --reason--> API (dedupe) -> route
  route: validate reason -> service (atomic) -> res.locals.activityNote/Meta
  middleware 'finish' -> activityLog.append({..., assetId, ownerIds, tenantIds, categoryId, undo})
Logs page -> GET /activity-logs?assetId&ownerId&tenantId&categoryId -> list() filter -> undoable()
```

## File Changes

| File | Action |
|---|---|
| `src/services/activity-log.js`, `src/middleware/activity-log.js` | Modify: fields, `describe`, filters, `undoable`, ROUTES `asset.delete`, `asset-kind.create` |
| `src/routes/activity-logs.js` | Modify: filter params |
| `src/routes/obligations.js`, `src/services/obligations.js`, `src/services/obligation-payment-reversal.js` | Modify: required notes/reason, `voidReason`, meta |
| `src/routes/rentals.js`, `src/services/rentals.js`, `src/services/rent-collections.js` | Modify: reason, `reversalReason`, collection meta |
| `src/routes/accounts.js` | Modify: create swap, `newPrimaryId` |
| `src/routes/assets.js` | Modify: `DELETE /:id`, kind validation |
| `src/services/asset-kinds.js`, `src/routes/asset-kinds.js`, `src/app.js` | Create, plus mount `/api/asset-kinds` |
| `src/services/asset-history.js` | Modify: expose the reasons |
| Client files listed above | Modify. `components/undoDialog.js` is created |
| `CHANGELOG.md`, Documento funcional, `package.json` | 1.15.0 |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (services) | `describe` fragments and missing facts; filters (AND, legacy excluded, no filters = unchanged); `undoable`; principal invariant; kind dedupe (accents) | `tests/services/activity-log.test.js` (extend); new `asset-kinds.test.js` |
| Routes | Required notes (400) on resolve and pay; reason on the 3 reversals (400/409); filters (400); create/edit principal (exactly one principal, 400 cases); asset delete with one 409 per referencing collection plus 404 plus the log entry; asset-kinds isolation | Extend `obligation-resolutions`, `obligation-payment-revert`, `rentals-reverse`, `activity-logs`, `accounts`, `assets` tests; new `asset-kinds.test.js` |
| UI contracts | Dedupe (same/different body, after settle, GET not deduped); busy button with reject restore and `data-repeatable`; UndoDialog blocks an empty note; resolve preselection; logs panel and undo button; Contratos without "Registrar cobro"; `rent_due` class; "Hacer principal" hidden on principal (regression); Settings Categorías; IVA rows with 0 | `tests/helpers/fake-dom.js`; new `evolutivo6-*.test.js` |
| Existing tests to update | Payload without notes/reason: `evolutivo4-pay-contract`, `obligation-payment-*`, `obligation-resolutions`, `rentals-reverse`, `rental-batch-collections`, `evolutivo5-revert`, `evolutivo5-periods`, `evolutivo5-monthly-sheet`, `evolutivo3-s2`/`s4c`; navbar/categories in `evolutivo2-s2`/`s8`; `accounts` 409 → swap/400; `evolutivo4-logs-contract`; IVA chart tests | Update in the same work unit |
| E2E | Pay/resolve flows fill the notes. History "Deshacer" uses a reason (`e2e/pages/AssetsPage.ts`). Categories via Configuración. `HomePage.ts`/`SummaryPage.ts` IVA selectors stay valid | Playwright page objects |

## Threat Matrix

N/A: no routing, shell, subprocess, VCS/PR automation, executable-file classification or process-integration boundary. Express route additions are ordinary authenticated per-user CRUD.

## Migration / Rollout

No migration. Every new field is optional when read. Old log rows remain unfilterable by design. Take a backup before deploy, because asset deletes are hard deletes.

## Open Questions

- [ ] Spec `activity-log-enrichment` says `tenantId`; the design stores `tenantIds[]` and filters by `tenantId` membership. Confirm, or the spec should be updated.
- [ ] Installment text ("cuota n/m") is printed only when the occurrence carries installment data. Plain monthly obligations show the due date instead.
- [ ] `DELETE /transactions/:id` on a rent-collection transaction still undoes it without a note. This path is out of scope and left unchanged.
