# Form lifecycle, provenance, drafts, and reuse

This document records the current storage relationships and a backward-
compatible direction for form lifecycle and data reuse. It is a design note,
not a commitment that every phase is implemented.

## Current provenance model

A form's user-visible ID is currently also its storage identity. The ID occurs
in all of these places:

- the form-definition MapAnnotation namespace;
- assignment MapAnnotation namespaces and values;
- form-data MapAnnotation namespaces and serialized payloads;
- the flattened current-value MapAnnotation attached to an OMERO object.

Every saved form definition is retained as a timestamped payload containing
its JSON Schema, UI schema, author, timestamp, message, and optional source
URL. Every submitted data version records:

- `formId`;
- `formTimestamp`, identifying the exact definition version used;
- target object type and ID, encoded in the annotation namespace;
- `changedBy`, `changedAt`, message, and form data.

The history is therefore tied to a specific form ID and definition version,
not merely to a display title. Submission history is stored on the privileged
form-master user. A separate flattened MapAnnotation exposes only the current
values on the target OMERO object.

## Rename, archive, and deletion

### Do not implement rename as copy plus delete

Changing the current ID creates a different storage identity. Existing
submissions continue to reference the old ID and its timestamped definitions.
Deleting that old definition prevents the history UI from resolving the
schema needed to render those submissions.

The current internal `delete_form` helper deliberately leaves form-data
annotations behind. Calling it on a form with submissions would therefore
create provenance orphans. It should not be exposed as an ordinary UI action.

### Phase 1: archive and clone

Add an additive lifecycle status with these semantics:

- Missing status means `active`, preserving every existing form.
- `archived` forms retain definitions, versions, source URL, submissions, and
  flattened object data.
- Archiving removes manageable group assignments and prevents new assignment
  or submission.
- Archived forms are hidden from normal form-selection lists but remain
  available in an explicit archived/history view.
- Unarchive restores availability but not prior assignments automatically.

Store lifecycle state as reserved MapAnnotation metadata so lists can filter
without decoding large schemas. Any new reserved keys must be excluded from
version-payload iteration by the storage codec.

For an immediate name correction, offer **Clone with new name** followed by
**Archive old form**. The clone should record `derivedFromFormId` and
`derivedFromTimestamp`. It is intentionally a new identity; the UI must not
call this operation a provenance-preserving rename.

### Phase 2: stable identity and editable display name

A true rename requires separating identity from presentation:

- immutable `formKey` used by APIs, namespaces, assignments, and submissions;
- editable `displayName` used in the UI;
- existing forms default `formKey` to their current `formId`, requiring no
  rewrite of stored annotations;
- new submissions continue recording the exact `formTimestamp`.

Once all lookups use `formKey`, changing `displayName` is provenance-safe.
Hard deletion should remain an administrator-only operation and should be
blocked whenever definition versions, submissions, assignments, or flattened
object annotations still depend on the form.

## Reusing previously entered data

### Permission boundary

Existing history is organized by form and target object, not by user profile.
Although each version records `changedBy`, reusable-data discovery must not
expose a submission merely because it is stored centrally.

- **Mine** may show versions where `changedBy` is the current user and the user
  can still read the source OMERO object.
- **Group** reuse should require an explicitly shared preset and current group
  access. It should not automatically expose every group member's historical
  submission.
- Every list and detail request must re-check source-object permissions.

### Reuse workflow

Add **Use previous submission** to the form-filling UI:

1. List permitted candidates as metadata only: source object, changed time,
   author, message, and definition version.
2. Fetch full data only after the user selects a candidate.
3. Load a copy into the current target form as unsaved starting values.
4. If source and current definition timestamps differ, warn and validate the
   copied values against the current schema. Never silently delete unknown
   values.
5. On submission, create an independent new history entry with optional
   additive `copiedFrom` metadata identifying the source form, object, data
   timestamp, and definition timestamp.

Existing submissions without `copiedFrom` remain original entries. Reuse is a
copy operation, not a mutable link: later edits to either object cannot change
the other object's history.

### Partial forms and reusable presets

Separate three concepts in the UI and storage model:

- **Save draft** stores incomplete data for a user and optional target object,
  even when required-field validation fails.
- **Submit** creates the authoritative object history entry and updates the
  flattened object annotation.
- **Save as preset** creates an explicitly named, user-owned reusable copy;
  optional group sharing is a deliberate second action.

Drafts must not update the flattened object annotation or appear as completed
submission history. A preset may originate from a draft or historical
submission, but should store a copy plus provenance rather than reference
mutable source data. An initial implementation can reuse whole-form data;
schema-section presets such as only `investigator` can be added later using an
explicit JSON pointer and compatible form identity.

## Recommended delivery order

1. Full unassignment and required object-type validation.
2. Archive/unarchive with no deletion and no identity changes.
3. Reuse a known history entry as unsaved values, recording `copiedFrom`.
4. User drafts and explicitly shared presets.
5. Stable `formKey` plus editable `displayName` for true renames.
6. Consider guarded hard deletion only after dependency checks exist.
