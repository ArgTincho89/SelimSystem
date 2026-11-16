# Rental Contracts and Lifecycle Specification

> Traceability: request.md sections 7, 8; section 16 (adjustments, end of rental, overlap, income classes); section 17 criteria 10, 11, 12, 13, 14, 15; section 18 items 6, 7, 8, 9.

## Purpose

Show each modality as a compact contract card, and define the lifecycle actions: update rent with preview, end a modality, end the whole rental, edit the rental, and declare only from the ficha.

## Requirements

### Requirement: Contratos tab cards

The Contratos tab MUST show one compact card per modality (not duplicating monthly information) with: modality and tenant or tenants (for example "Locación · Bella Paloma"), status, start date, end date, original amount, current monthly amount, currency, classification A/B, IVA if applicable, adjustment frequency, adjustment criterion, next adjustment, and the actions "Actualizar alquiler", "Registrar cobro", "Ver períodos", "Finalizar contrato". The current monthly amount MUST be the amount of the latest condition effective on or before today, or the initial amount when none, with IVA applied when it applies. The backend view of a modality MUST expose `currentAmount` and `nextAdjustmentDate`.

#### Scenario: Card content

- GIVEN a Locación from 01/07/2026 to 30/06/2029 with ARS 11.797.500, class A with IVA
- WHEN the Contratos tab opens
- THEN the card shows the validity, "Monto mensual vigente: ARS 11.797.500", "Clasificación: A · IVA incluido", "Próximo ajuste: —" and the four actions

#### Scenario: Current amount after adjustment

- GIVEN an adjustment effective yesterday raising rent to ARS 15.000.000
- WHEN the card renders
- THEN the current monthly amount is ARS 15.000.000 and the original amount is still shown

#### Scenario: Ended modality

- GIVEN a finished modality
- WHEN its card renders
- THEN its status is Finalizado and "Actualizar alquiler", "Registrar cobro" for future periods and "Finalizar contrato" are not offered

### Requirement: Business rules preserved

The change MUST NOT alter these rules: a rental requires at least one modality and one tenant; each modality requires a positive original amount and a start date; rent months fall due on the same day of the month as the start date; Locación defaults to income class A, Comodato and Mutuo default to class B; only part A admits IVA; a month is collected only when all its modalities are collected; a property cannot have two rentals with overlapping dates; amounts are per currency without conversion.

#### Scenario: Class defaults

- WHEN a Comodato is declared without an explicit class
- THEN its income class is B

#### Scenario: IVA on B

- WHEN IVA is set on a class B modality
- THEN the server rejects it

### Requirement: "Actualizar alquiler" visibility

"Actualizar alquiler" MUST be visible in the modal header, in the Resumen tab, in each modality card, and in the Períodos tab where applicable.

#### Scenario: Entry points

- WHEN the rental modal renders
- THEN "Actualizar alquiler" is available in the header, Resumen, each contract card and Períodos

### Requirement: Update dialog and preview

Pressing "Actualizar alquiler" MUST open a dialog that shows the current value and allows choosing a new manual amount, a percentage increase, or an index or criterion where that capability already exists, and an effective date. The effective date MUST be selected from the future due dates of the modality. Retroactive effective dates MUST NOT be allowed. Before confirming, the dialog MUST show a preview such as "Desde diciembre 2026, el alquiler pasa de ARS 11.797.500 a ARS 15.336.750. Se actualizarán 5 períodos futuros no cobrados." The preview MUST be computed by a read-only endpoint (a dry run of the same rule) that does not modify data and does not produce a write log entry.

#### Scenario: Preview

- GIVEN current ARS 11.797.500, a +30% increase effective 01/12/2026 and 5 uncollected future periods
- WHEN the user fills the dialog
- THEN the preview shows the new amount ARS 15.336.750 and "Se actualizarán 5 períodos futuros no cobrados."

#### Scenario: Retroactive date

- WHEN a date earlier than today is submitted
- THEN the server rejects it and no period changes

#### Scenario: Date not a due date

- WHEN an effective date that is not a due date of the contract is submitted
- THEN the server rejects it

#### Scenario: Preview does not write

- WHEN the preview is requested
- THEN no data is persisted and no write entry is added to the activity log

### Requirement: Applying the update

On confirmation the new amount MUST apply to all future uncollected periods from the effective date. Periods already collected MUST NOT be modified. When some periods from the effective date are already collected, they MUST be skipped and the rest MUST be updated (this replaces the previous behavior that rejected the whole update). The action MUST be logged with the existing specific action for rental conditions.

#### Scenario: Skip collected

- GIVEN periods in December and January, January already collected, effective date 01/12/2026
- WHEN the update is confirmed
- THEN December changes, January keeps its amount and collections, and the preview had announced 1 updated period

#### Scenario: Logged

- WHEN the update is confirmed
- THEN a specific activity log entry for the rent adjustment exists

### Requirement: "Finalizar contrato"

"Finalizar contrato" MUST exist only inside a concrete modality. It MUST ask for an end date, show the future uncollected periods of that modality that will be cancelled, and require explicit confirmation. On confirmation it MUST end only that modality, cancel its future uncollected periods, keep registered collections, and log the action with a specific entry. It MUST be implemented by a dedicated endpoint `POST /rentals/declarations/:id/modalities/:contractId/end {endDate}` that applies the same settlement as ending a rental (when the last active modality ends, the asset condition is updated and tenant obligations return to the owner). Ending an already finished modality MUST be rejected with "No se puede finalizar este contrato porque ya está finalizado."

#### Scenario: End one modality

- GIVEN Locación and Comodato active
- WHEN the user ends Comodato with date 31/12/2026 and confirms
- THEN Comodato future uncollected periods are cancelled, collected ones are kept, and Locación stays active

#### Scenario: End last modality

- GIVEN a single active modality
- WHEN it is ended
- THEN the asset condition is settled and tenant obligations return to the owner

#### Scenario: Already ended

- GIVEN a finished modality
- WHEN its end is requested
- THEN the response is an error with "No se puede finalizar este contrato porque ya está finalizado."

#### Scenario: Distinct from ending the rental

- WHEN the user ends one modality
- THEN the other modalities are not ended

### Requirement: "Finalizar alquiler"

"Finalizar alquiler" MUST ask for an end date, list the future periods that will be cancelled, warn that tenant obligations return to the owner, and require explicit confirmation with this copy:

"Estás por finalizar este alquiler. Se cancelarán los períodos futuros sin cobrar. Las obligaciones a cargo del inquilino volverán al titular. Esta acción no se puede deshacer. ¿Querés continuar?"

On confirmation it MUST end all modalities, cancel future uncollected periods, keep registered collections, apply the existing settlement, and log the action.

#### Scenario: Confirm copy

- WHEN the user presses "Finalizar alquiler"
- THEN the confirmation shows the copy above and the list of periods to cancel

#### Scenario: Cancel confirmation

- WHEN the user dismisses the confirmation
- THEN nothing changes

#### Scenario: Result

- WHEN the user confirms
- THEN all modalities end, future uncollected periods are cancelled, collected periods are kept, and a log entry exists

### Requirement: "Editar alquiler"

"Editar alquiler" MUST be always visible in the header. It MUST allow editing tenants, modalities, dates, amounts, currencies, IVA, adjustment frequency and criterion, and general notes. Before saving it MUST show a confirmation warning that future uncollected periods will be regenerated. Collected periods MUST NOT be modified. Registered collections MUST NOT be editable (they are corrected with "Deshacer cobro"). The edit MUST be logged.

#### Scenario: Warning

- WHEN the user saves an edit
- THEN a confirmation warns that future uncollected periods will be regenerated

#### Scenario: Collected untouched

- GIVEN a collected period
- WHEN the rental is edited
- THEN that period and its collections are unchanged

### Requirement: Declaring only from the ficha

The label "Declarar nuevo alquiler" and any declare action MUST NOT appear inside the rental modal. See asset-ficha-redesign for gating and overlap rules.

#### Scenario: Absent in modal

- WHEN the rental modal renders any tab
- THEN no declare action is present
