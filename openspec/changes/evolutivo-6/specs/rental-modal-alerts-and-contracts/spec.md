# Rental Modal Alerts and Contracts Specification

> Traceability: request.md 4 (Resaltado visual, Gestión avanzada de documentos, Limpieza de interfaz); proposal items 4.1 to 4.3; Decision 9.

## Purpose

Improve the Ver alquiler modal: highlight unpaid rent alerts, give access to contract documents and remove a redundant action.

## Requirements

### Requirement: Unpaid rent alert highlight

In Ver alquiler, Alertas SHALL render `rent_due` alerts in red and bold. Other alert types SHALL keep their current style.

#### Scenario: rent_due
- GIVEN a `rent_due` alert
- THEN it has the red and bold style

#### Scenario: Other alert
- GIVEN a non-`rent_due` alert
- THEN it is not red and bold

### Requirement: Contract document actions

In the Contratos tab, when a contract has an attached document, the UI SHALL show "Descargar documento" and "Ver documento". Download SHALL save the file locally. View SHALL open an embedded viewer (iframe) that allows navigation and zoom. Without a document neither button SHALL be shown. A load failure SHALL show an error message, not a blank viewer.

#### Scenario: Document attached
- THEN both buttons are visible

#### Scenario: No document
- THEN no document button is visible

#### Scenario: View
- WHEN the user presses "Ver documento"
- THEN the document renders in an embedded viewer

#### Scenario: Download
- WHEN the user presses "Descargar documento"
- THEN the browser downloads the file

#### Scenario: Load error
- WHEN the document content request fails
- THEN an error message is shown

### Requirement: No "Registrar cobro" in Contratos

The bottom of the Contratos tab SHALL NOT show "Registrar cobro". The action SHALL remain available in Resumen.

#### Scenario: Contratos tab
- THEN no "Registrar cobro" button exists in it

#### Scenario: Resumen tab
- THEN "Registrar cobro" is still available
