# Evolutivo 9 — Bienes filter bar and asset cards

> Branch: `evolutivo-9`. Delivery: PR to master, merge after CI green, deploy (follow-up to evolutivo-8).

## Request (summary of the user's words)
- Remove "Ubicación" and "Buscar" from the Bienes filter.
- "Estado" becomes a select with "Alquilado" / "No alquilado"; remove "Uso".
- When "Tipo de bien" = "Inmueble", show "Tipo de inmueble" next to it with the existing property kinds (Departamento, Casa, Galpón, …).
- Final bar: Tipo de bien (+ Tipo de inmueble), Titular legal, Estado, Filtrar, Limpiar.
- Asset cards: parameter names in bold (Inmueble, Tipo, Ubicación, Estado, Titular); Estado shows Alquilado / No alquilado instead of "Activo".

## Decisions
- D1: Estado maps to `asset.condition` (derived from active contracts). `condition=not_rented` matches every asset that is not `rented` (movables, usufruct, unset).
- D2: Tipo de inmueble uses the existing `propertyKind` filter; it is cleared when Tipo de bien is not Inmueble.
- D3: The ficha header is unchanged (only the list cards were requested).
