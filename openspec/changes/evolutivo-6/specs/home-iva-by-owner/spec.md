# Home IVA By Owner Specification

> Traceability: request.md 7 (Rediseño "IVA mensual por titular"); proposal item 7.1; Decision 6.

## Purpose

Show, for one month, the IVA total of every owner instead of a historical list.

## Requirements

### Requirement: Summary data

`summary` SHALL expose `ivaByHolder` for the requested month: the IVA total registered per owner in that month.

#### Scenario: Totals
- GIVEN owner A with IVA 100 and 50 in the month
- THEN `ivaByHolder` reports 150 for A

#### Scenario: Other months
- GIVEN IVA registered in other months
- THEN it is not counted

### Requirement: Section rendering

The section "IVA mensual por titular" SHALL show only the month selected in the Home month navigator (current month by default), listing every owner with the month IVA total on the right. Owners with no IVA SHALL show 0. No historical months list SHALL be shown. The title and `data-favorite-type="trend-iva"` SHALL be kept.

#### Scenario: Current month
- WHEN Home opens
- THEN owners are listed with the current month IVA on the right

#### Scenario: Owner without IVA
- THEN that owner is listed with 0

#### Scenario: Navigator change
- WHEN the user selects another month
- THEN the section shows that month's totals

#### Scenario: No owners
- GIVEN no owners
- THEN an empty-state message is shown

#### Scenario: Favorite
- THEN the section keeps `data-favorite-type="trend-iva"`
