---
name: omero-forms-dev
description: Development runbook for the OMERO.forms Django and React/RJSF plugin. Use when changing form definition or submission storage, OMERO MapAnnotation serialization, Django views and URLs, the form designer/editor/history UI, tests, packaging, or CI in this repository.
---

# OMERO.forms Development

Work from the repository root containing `.agents`. Inspect the current branch,
working tree, nearest implementation, and related tests before editing. Preserve
released forms and submission history unless the user explicitly authorizes a
breaking migration.

## Architecture

- React/RJSF source is in `src/`; Django and OMERO integration is in
  `omero_forms/`.
- Form definitions and submission history are versioned JSON envelopes stored
  as OMERO MapAnnotations owned by the configured form-master user.
- Current submitted values are also flattened into a MapAnnotation attached to
  the target Project, Dataset, Screen, or Plate.
- Browser/backend contracts currently carry `schema`, `uiSchema`, and
  `formData` as JSON strings inside outer JSON responses and requests. Preserve
  that contract unless the task explicitly includes a coordinated migration.

## Storage Rules

- Do not modify the OMERO database schema or OMERO-managed indexes without
  explicit authorization. Keep changes within the application layer.
- Route large versioned payloads through `omero_forms.storage_codec`. Small
  payloads must remain readable in the legacy inline representation.
- Apply storage changes symmetrically to form definitions and submission
  history. Readers must support annotations containing both legacy and chunked
  versions.
- Keep the manifest as the version row and codec-owned chunk rows out of version
  enumeration. Preserve newest-first ordering and the exact `formTimestamp`
  link between a submission and its schema revision.
- Treat missing, duplicate, malformed, unsupported, or checksum-invalid chunks
  as explicit corruption. Never silently return partial data.
- Property names become flattened OMERO keys; schema titles do not. Consider
  compatibility before renaming schema properties.

## Verification

Run backend tests without requiring a live OMERO server or database:

```powershell
python -m unittest discover -s tests -v
python -m compileall -q omero_forms tests
```

For frontend changes, run the source build as a sanity check:

```powershell
npm.cmd run build
```

Generated bundles under `omero_forms/static/` and build output are ignored and
must not be committed. Add regression tests for serialization boundaries,
legacy compatibility, corrupt storage, ordering, and both definition and data
history paths when those areas change. Finish with `git diff --check` and review
the complete diff for unrelated generated files.
