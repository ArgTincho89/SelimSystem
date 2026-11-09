# Document Linking Specification

## Purpose

Extend comprobantes (documents) to link to a concrete occurrence, rent period, tenant, or transaction, in addition to existing asset, entity, obligation, and contract targets.

## Requirements

### Requirement: Expanded document targets

The system MUST allow a document to target at least one of asset, legal owner, obligation, rental contract, obligation occurrence, rent occurrence, transaction, or tenant.

#### Scenario: Link to occurrence

- GIVEN a valid obligation occurrence
- WHEN a document is uploaded with `occurrenceId`
- THEN the document is stored and retrievable by that occurrence

#### Scenario: Link to rent period

- GIVEN a valid rent occurrence
- WHEN a document is uploaded with `rentOccurrenceId`
- THEN the document is stored and retrievable by that rent period

#### Scenario: Link to transaction

- GIVEN a valid transaction
- WHEN a document is uploaded with `transactionId`
- THEN the document is stored and retrievable by that transaction

#### Scenario: Link to tenant

- GIVEN a legal owner with tenant role
- WHEN a document is uploaded with `tenantEntityId`
- THEN the document is stored and retrievable by that tenant

### Requirement: Consistency of derived links

When linking to an occurrence or rent period, the system MUST store the derived parent obligation or contract and validate asset consistency.

#### Scenario: Occurrence parent stored

- GIVEN an occurrence belonging to an obligation
- WHEN a document is linked to the occurrence
- THEN `obligationId` is set to the occurrence's obligation

#### Scenario: Mismatched asset rejected

- GIVEN an occurrence whose obligation asset differs from a provided `assetId`
- WHEN uploaded
- THEN the request is rejected with 400

### Requirement: Retrieval by any target

The system MUST allow listing documents by any supported target field.

#### Scenario: Filter by occurrence

- GIVEN documents linked to an occurrence
- WHEN listing with `occurrenceId`
- THEN those documents are returned

### Requirement: Resolution receipts

A tenant obligation resolution MUST be able to reference receipts that are documents linked to the same occurrence or tenant.

#### Scenario: Reference linked receipt

- GIVEN a document linked to an occurrence and tenant
- WHEN a resolution for that occurrence references the document
- THEN the reference is accepted

#### Scenario: Inconsistent receipt rejected

- GIVEN a document linked to a different occurrence and tenant
- WHEN a resolution references it
- THEN the request is rejected with 400

## Data Contract

Document additions:
- `occurrenceId`: string | null
- `rentOccurrenceId`: string | null
- `transactionId`: string | null
- `tenantEntityId`: string | null

Existing fields remain: `assetId`, `entityId`, `obligationId`, `contractId`.

## Validation Rules

- At least one target field MUST be provided.
- `occurrenceId` MUST reference a valid obligation occurrence; if `obligationId` is also provided it MUST match the occurrence's obligation.
- `rentOccurrenceId` MUST reference a valid rent occurrence; if `contractId` is also provided it MUST match the rent occurrence's contract.
- `transactionId` MUST reference a valid user-owned transaction.
- `tenantEntityId` MUST reference a legal owner with tenant role.
- Provided `assetId`, when present with occurrence or rent period, MUST match the derived asset.

## Edge Cases

- A document may be linked to multiple consistent targets (for example occurrence plus derived obligation).
- Backward-compatible documents with only legacy targets remain valid.
- Deleting a linked transaction or occurrence does not delete the document; the link becomes dangling and is ignored by filters.

## Acceptance Criteria

- Documents can be linked to occurrence, rent period, tenant, or transaction.
- Consistency validation rejects mismatches.
- Listing works by any supported target.
- Resolutions reference receipts linked to the occurrence or tenant.