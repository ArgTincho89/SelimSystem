# Rental Documents and Notes Specification

> Traceability: request.md section 11; section 2 (Documentos y notas en la ficha); section 17 criteria 18, 19, 24, 25; section 18 item 11.

## Purpose

Give documents and notes their own tabs in the rental modal (and equivalent blocks in the ficha) with delete, edit, title and filters.

## Requirements

### Requirement: Documents tab

The rental modal MUST have a "Documentos" tab that allows uploading, viewing, downloading and deleting documents, filtering by type, date or name, and shows the upload date and, when available, who uploaded the document. Accepted formats are PDF, PNG, JPEG, WebP and UTF-8 text, with a maximum of 20 MiB per file. The tab MUST aggregate the documents linked to the declaration's contracts, occurrences and collections. Uploading from the tab MUST attach the document to the selected modality contract. The documents block in the ficha MUST offer the same operations for asset documents.

#### Scenario: Upload valid file

- WHEN the user uploads a 2 MiB PDF
- THEN it appears in the list with its upload date

#### Scenario: Invalid file

- WHEN the user uploads a file larger than 20 MiB or of an unsupported format
- THEN it is rejected with a clear Spanish message

#### Scenario: Filter

- GIVEN several documents
- WHEN the user filters by name
- THEN only matching documents are listed

#### Scenario: Empty

- GIVEN no documents
- WHEN the tab opens
- THEN "No hay documentos cargados." is shown with an upload action

#### Scenario: View and download

- WHEN the user presses "Ver" or "Descargar" on a document
- THEN the document is displayed or downloaded

### Requirement: Document deletion

The server MUST expose `DELETE /documents/:id`. It MUST remove the stored file, remove references to it (for example resolutions listing the document), and be logged with a specific activity log entry. A foreign or unknown id MUST yield 404. The UI MUST ask for confirmation before deleting.

#### Scenario: Delete confirmed

- GIVEN a document attached to a resolution
- WHEN the user confirms deletion
- THEN the file is removed, the resolution no longer references it, and a log entry exists

#### Scenario: Delete cancelled

- WHEN the user dismisses the confirmation
- THEN the document remains

#### Scenario: Foreign document

- WHEN another user's document is deleted
- THEN the response is 404

### Requirement: Uploader recorded

New documents MUST record the uploading user (additive field). Existing documents without that field MUST still render without error.

#### Scenario: Legacy document

- GIVEN a document without an uploader
- WHEN the list renders
- THEN it renders without error and the uploader is omitted

### Requirement: Notes tab

The rental modal MUST have a "Notas" tab that allows creating, editing and deleting notes, filtering by a single date or a date range, and sorting by date. Each note MUST show date, title and text (for example "16/11/2026 · Título de la nota" followed by the text) and the actions "Editar" and "Eliminar". The tab MUST aggregate notes linked to the declaration's contracts, occurrences and collections. The notes block in the ficha MUST offer the same operations for asset notes.

#### Scenario: Create

- WHEN the user creates a note with date, title and text
- THEN it appears in the list in the chosen order

#### Scenario: Filter by range

- GIVEN notes on 01/11/2026 and 20/11/2026
- WHEN the range 15/11/2026 to 30/11/2026 is applied
- THEN only the second note is listed

#### Scenario: Empty range

- WHEN no note matches
- THEN "No hay notas en este rango de fechas." is shown

#### Scenario: Sort

- WHEN the user toggles the order by date
- THEN notes are listed ascending or descending accordingly

### Requirement: Note edit and delete endpoints

The server MUST expose `PUT /notes/:id` and `DELETE /notes/:id`. Notes MUST support an optional additive `title`. Existing notes without a title MUST keep working. Editing MUST validate content like creation. Both operations MUST be logged with specific entries. A foreign or unknown id MUST yield 404. The UI MUST ask for confirmation before deleting.

#### Scenario: Edit

- WHEN a note text and title are changed
- THEN the update is persisted and logged

#### Scenario: Delete confirmed

- WHEN the user confirms note deletion
- THEN the note is removed and logged

#### Scenario: Legacy note

- GIVEN a note without a title
- WHEN rendered
- THEN it shows date and text without error

#### Scenario: Foreign note

- WHEN another user's note is edited or deleted
- THEN the response is 404
