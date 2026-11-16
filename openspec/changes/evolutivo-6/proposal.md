# Proposal: Evolutivo 6

## Intent

The user's backlog (`request.md`) has bugs and gaps that block daily work:
- Resolving a tenant obligation preselects the wrong tenant. The server then rejects the request.
- New providers and new principal accounts cannot be saved.
- Fast double clicks create duplicate records.
- Logs are vague, cannot be filtered and cannot undo anything.
- Reversals in the asset history are not uniform and do not record a reason.
- An asset created by mistake cannot be deleted, and the user cannot add new asset types.

This change fixes these issues and keeps the data compatible.

## Scope

### In Scope (numbered as `request.md`)
- **1.1** "Resolver" lists only the tenants of the obligation's contract (or the asset's active contract) and preselects the first one. The full list is shown only when there is no contract.
- **1.2** Notes are mandatory to resolve an obligation or mark it as paid. The UI and the server both enforce this.
- **2.1** Rich log messages: property, exact amount and currency, due date or installment.
- **2.2** A "Deshacer" button on each log row that is still undoable.
- **2.3** A log filter panel: bien, titular, inquilino, categoría.
- **3.1** "Deshacer" in the asset history detail for a resolved obligation, a paid obligation and a collected rent.
- **3.2** "Deshacer" requires a reason note (trimmed, 1 to 500 characters). It removes the financial effect and returns the item to pending.
- **4.1** Unpaid rent alerts (`rent_due`) are shown in red and bold in Ver alquiler → Alertas.
- **4.2** Contratos tab: "Descargar documento" and "Ver documento" (an embedded viewer with navigation and zoom) when a contract document is attached.
- **4.3** Remove "Registrar cobro" from the bottom of the Contratos tab. It stays in Resumen.
- **4.4** Delete an asset created by mistake.
- **4.5** Edit confirmation: validated and kept as it is (see Decisions).
- **4.6** User-defined asset types ("Agregar tipo…").
- **5.1** Categorías moves to a Configuración subsection. The navbar item is removed, and `/categories` redirects to the new location.
- **5.2** The provider form always loads the expense categories and shows an empty-state hint when there are none.
- **5.3** "Cuenta principal" can be checked when creating an account. The new account becomes the principal and the old one is demoted.
- **5.4** A principal account can be unchecked if the user picks a replacement in the same dialog.
- **5.5** Hide "Hacer principal" on a principal account and review archive/delete on every account action surface.
- **6.1** Global protection against double clicks on action buttons and duplicate write requests.
- **7.1** "IVA mensual por titular" shows the month currently selected on Home: every owner, each with the IVA total registered in that month.

### Out of Scope
- Extending the edit confirmation to other entities (4.5 keeps the current behavior).
- Backfilling filter metadata into old log records. Old records stay unfilterable by bien, titular, inquilino or categoría (best effort only).
- Undo from logs for any action other than an obligation payment, an obligation resolution or a rent collection.
- Soft delete or recovery of deleted assets. Deleting an asset that is still referenced. Renaming or deleting custom asset types.
- Server-side idempotency keys for every endpoint.

## Decisions (auto-mode defaults adopted)
1. Notes are mandatory in both the resolve and pay flows, enforced in the UI and on the server.
2. To uncheck the principal, the user must choose a replacement account (`newPrimaryId`). If no account is eligible, the box stays checked and a message explains why.
3. An asset is hard-deleted only when nothing references it. Otherwise the server returns 409 with the reason (transactions, obligations, rentals, documents).
4. Custom asset types are stored per user in an `assetKinds` collection that extends the built-in `PROPERTY_KINDS`. Contract type falls back to `residential`.
5. The asset edit confirmation stays as it is and is not extended to other entities.
6. The IVA section follows the Home month navigator, which defaults to the current month. Owners with no IVA show 0.
7. These actions can be undone from logs: obligation payment, obligation resolution, rent collection.
8. Resolver restricts the tenant list to the contract's tenants and preselects the first one.
9. Red and bold apply only to `rent_due` alerts.
10. For 5.5, every account action surface is audited, "Hacer principal" is hidden wherever the account is principal, and a regression test is added.

## Capabilities

### New Capabilities
- `obligation-resolution-defaults`: contract-tenant preselection and mandatory notes (1.1, 1.2).
- `activity-log-enrichment`: rich messages and write-time metadata (assetId, ownerIds, tenantId, categoryId, undo target) (2.1).
- `activity-log-filters-and-undo`: query filters, filter panel and a "Deshacer" button on each row (2.2, 2.3).
- `history-reversal-with-note`: one "Deshacer" flow with a required note across the three reversal endpoints (3.1, 3.2).
- `rental-modal-alerts-and-contracts`: red and bold alerts, download and view of contract documents, Contratos without "Registrar cobro" (4.1 to 4.3).
- `asset-deletion`: guarded `DELETE /assets/:id` with a danger confirmation and a log entry (4.4).
- `custom-asset-kinds`: list and create endpoints, validation and the form option (4.6).
- `settings-categories-and-providers`: Categorías inside Configuración, provider category loading (5.1, 5.2).
- `principal-account-management`: create as principal, uncheck with a replacement, action visibility (5.3 to 5.5).
- `duplicate-action-guard`: client dedupe of in-flight requests and busy state on buttons (6.1).
- `home-iva-by-owner`: IVA per owner for one month (7.1).

### Modified Capabilities
None (`openspec/specs/` is empty).

## Approach (per item)
- **1.1** Client only (`obligations.js` `showResolveModal`): use the tenants of `obligation.rentalContractId`, falling back to `GET /rentals?assetId=`. The server check already exists.
- **1.2** Required textarea in the resolve and pay modals. The `routes/obligations.js` routes return 400 when the trimmed note is empty.
- **2.1** Routes set `res.locals.activityMeta`. `activity-log.js` builds Spanish messages, e.g. "Resolviste un vencimiento de la obligación [Impuesto Municipal] de la propiedad [X], por un monto de [Y], con vencimiento/cuota [Z]".
- **2.2** Store an `undo` descriptor at write time, including the transaction id for payments. Show the button only when the entry succeeded and the target can still be undone. It reuses the section 3 note dialog.
- **2.3** Filter params on `activityLog.list` and `GET /activity-logs`. A filter panel in `logs.js`, populated from assets, owners, tenants and categories.
- **3** `AssetHistory.buildActions` maps pay, resolve and collect to one "Deshacer" dialog. Void-resolution and rent reverse accept and store a note. `API.delete` can send a body. The note appears as "Motivo" and in the log.
- **4.1/4.3** Class on `rent_due` alerts in `renderAlerts`. A `cardActions` option hides "Registrar cobro" in Contratos.
- **4.2** `API.documents.list('contract', id)`. "Ver" reuses the blob iframe viewer in `AssetHistory.showReceipt`. "Descargar" uses `contentUrl(id, true)`.
- **4.4** Guard modeled on `owners.js` delete. "Eliminar" button in the ficha and edit form, with a `ConfirmDialog` of type danger.
- **4.6** `assetKinds` service and route. `propertyKindOptions()` merges the built-in and user kinds, and the server validates against both.
- **5.1** `settings.js` nav and whitelist add Categorías. `CategoriesPage.renderPanel(panel)`. `app.js` removes the navbar item and redirects `/categories`.
- **5.2** Fetch categories inside `showForm` whatever the role, with an empty-state hint.
- **5.3/5.4** Enable the checkbox. On the server, create with `primary:true` swaps the principal in one write, and edit accepts `newPrimaryId` so there is always exactly one principal.
- **6.1** `API.request` shares one promise for identical in-flight non-GET requests. `utils/dom.js` handlers disable the button and set `aria-busy` until the promise settles. `data-repeatable` opts a button out.
- **7.1** `summary.ivaByHolder` for the selected month, merged with `API.owners.list()`. The title and `data-favorite-type="trend-iva"` stay the same.

Suggested work order: quick fixes, then double-click guard, reversals, logs, and structural items (5.1, 4.4, 4.6, 4.2).

## Affected Areas

| Area | Impact |
|---|---|
| `public/js/pages/{obligations,logs,assetHistory,rentalModal,assets,asset-form,settings,entities,categories,summary,home}.js`, `public/js/{api,app}.js`, `utils/dom.js` | Modified |
| `src/routes/{obligations,activity-logs,assets,accounts,rentals}.js`, `src/services/{activity-log,obligations,obligation-payment-reversal,rentals,rent-collections}.js`, `src/middleware/activity-log.js` | Modified |
| `src/services/asset-kinds.js` + route | New |
| `tests/{ui,routes,services}`, `e2e/` (navbar, pay flows, history) | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Making notes mandatory on the server breaks the route, UI and e2e tests | High | Update them in the same work unit |
| Logs metadata is large; old records cannot be filtered | Med | Additive fields, optional filters, documented limit |
| 5.4 breaks the single-principal invariant | Med | Swap in a single write, invariant tests |
| The global click guard blocks repeatable buttons | Med | `data-repeatable` opt-out, fake-dom tests |
| An asset delete misses a reference | Med | Check every referencing collection, 409 tests |
| Removing the navbar item breaks e2e or the mobile layout | Med | Redirect `/categories`, update e2e steps |
| The 5.2 root cause is inferred, not reproduced | Med | Cover every cause found in exploration |
| Diff over 800 lines | High | `size:exception` accepted, one commit per unit |

## Rollback Plan

Revert the PR merge on master and redeploy v1.14.0 (sw `selimsystem-v46`). The schema changes are additive: `assetKinds` and the log fields `meta`, `undo` and the filter ids. If the user created assets with a custom type, they keep their stored kind string. Deleted assets are not restored, so take a backup before deploy.

## Dependencies

Evolutivo-5 is merged (v1.14.0). Do not deploy until the user asks.

## Delivery

- One PR from `evolutivo-6` to `master` (`size:exception`), with conventional commits, one per work unit.
- Bump the version to **1.15.0** and the service worker cache to `selimsystem-v47`, and register any new JS files in `STATIC_ASSETS`.
- Update the CHANGELOG and the Documento funcional, in Spanish.

## Success Criteria

- [ ] Every item from 1.1 to 7.1 traces to at least one passing scenario.
- [ ] Every "Deshacer" requires a note and returns the item to pending with its financial effect removed.
- [ ] New logs show property, amount and due date and can be filtered by bien, titular, inquilino and categoría.
- [ ] Rapid repeated clicks produce exactly one record.
- [ ] The full Jest suite and the E2E suite pass.

## Proposal question round

Auto mode: these assumptions need user review.
1. Notes are also mandatory for the plain "Resolver" action, not only for "marcar como pagada".
2. The IVA section follows the Home month navigator instead of always showing the calendar month.
3. A referenced asset cannot be deleted. The user must remove its dependents first.
4. Custom asset types can only be created for now. Editing and deleting them come later.
