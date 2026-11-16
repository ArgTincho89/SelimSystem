# Settings Categories and Providers Specification

> Traceability: request.md 5 (Reubicación de Categorías, Corrección en la creación de Proveedores); proposal items 5.1, 5.2.

## Purpose

Move Categorías into Configuración and make provider creation work.

## Requirements

### Requirement: Categorías in Configuración

Configuración SHALL include a "Categorías" subsection (in its navigation and whitelist) that renders the categories panel. The navbar item "Categorías" SHALL be removed. The route `/categories` SHALL redirect to the new location.

#### Scenario: Subsection
- WHEN the user opens Configuración → Categorías
- THEN the categories panel is shown and works as before

#### Scenario: Navbar
- THEN no top-level "Categorías" item exists, on desktop or mobile

#### Scenario: Old route
- WHEN the user visits `/categories`
- THEN they land on Configuración → Categorías

### Requirement: Provider category loading

The provider form SHALL always load expense categories on open, whatever the user role, and fill the "Seleccionar categoría de gasto" dropdown. When there are none, it SHALL show an empty-state hint pointing to Configuración → Categorías. A load error SHALL show a message. When categories exist, the user SHALL be able to select one and create the provider.

#### Scenario: Categories exist
- GIVEN expense categories
- WHEN the form opens
- THEN the dropdown lists them and the provider can be created

#### Scenario: No categories
- GIVEN no expense categories
- THEN the dropdown is empty and a hint explains how to create one

#### Scenario: Load fails
- WHEN the categories request fails
- THEN an error message is shown instead of a silent empty dropdown

#### Scenario: Non-admin role
- GIVEN a user with a non-admin role
- THEN categories still load
