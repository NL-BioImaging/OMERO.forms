OMERO.forms Design
==================

This document elaborates on some aspects of the OMERO.forms design, such as data storage.


Immutable metadata store
========================

OMERO has no built-in immutable data store that a user can make use of. OMERO.forms makes use of privilege escalation in OMERO.web to record form metadata and context as an OMERO map annotation attached to a special user ("formmaster") created specifically for OMERO.forms. The annotations attached to this formmaster user are not readable or writeable by regular users. To access a forms history, privilege escalation is again used. At the point of privilege escalation, authorization checks are performed to ensure that a user has the right to access the requested form data.


OMERO Imaging Collection Object
===============================

In OMERO, an imaging collection object is some assemblage of imaging data. These include a dataset (containing images), a project (containing datasets, in turn containing images), a single plate from a high content screen, or an entire high content screen.


JSON (JavaScript Object Notation) Schema
========================================

(`JSON Schema is an IETF (Internet Engineering Task Force) draft specification <http://json-schema.org/documentation.html>`_ for validating schemas written in JSON.  Forms designed in OMERO.forms conform to this schema and an implementation of this specification underpins OMERO.forms. This implementation is used to render the JSON-designed form into HTML. It is also used to validate values entered into the rendered form as conforming to assertions set forth in the design. Forms can take advantage of the full capabilities of JSON Schema and become extremely complex if desired. Details are available in `Mozilla Services. React JSON Schema Form  <https://github.com/mozilla-services/react-jsonschema-form>`_ and `Understanding JSON Schema <https://spacetelescope.github.io/understanding-json-schema>`_ and interactive examples in `Mozilla Services. React JSON Schema Form Playground <https://mozilla-services.github.io/react-jsonschema-form>`_. As JSON Schema is an open standard this should enable OMERO.forms to be easily interoperable with future repositories of fields, field sets and whole forms from repositories such as `CEDAR <https://metadatacenter.org/>`_ that use the same specification.

Provenance Model
================

OMERO.forms uses a bespoke provenance model to closely bind the imaging collection objects in OMERO to the metadata recorded through OMERO.forms and to avoid introducing additional backend requirements that would represent a high barrier to entry, especially for maintainers of OMERO servers that are not IT professionals.


Form versioning and submissions
===============================

OMERO.forms records every form design revision in the immutable metadata store. Metadata entered and edited through forms is also recorded in the immutable metadata store and is associated with the form version with which it was submitted to put it in the correct context. The record of each form revision or submission also incorporates the identity of the editor, timestamp and an optional change message explaining the changes that have been made. Previous metadata submissions are not overwritten upon edit and the chronology of these represents the history of that form metadata.


Large payload storage
=====================

Small form definitions and submissions are stored in the original inline JSON format. Larger JSON payloads are compressed with zlib, Base64 encoded and divided over multiple safe-sized map annotation values. The timestamp entry contains a versioned manifest that identifies the chunks and records the original byte length and SHA-256 checksum. Readers reassemble chunks by their numbered keys, independently of row order, and reject incomplete or corrupted payloads. This application-level representation avoids changes to the OMERO database schema while remaining backward compatible with existing inline form and submission history.


OMERO.web plugin
================

OMERO.web has several extension points through which it is possible to extend the base functionality with custom plugins. One of these is the centre panel extension point. The default view in this slot when selecting an imaging collection object is the thumbnail view of the images in that collection. OMERO.forms augments this by adding a second view to the centre panel which presents a choice of applicable forms and renders the interface for form submission and history browsing. OMERO.forms Designer is deployed into the same web framework, but is a top-level application, linked to by extending the customizable links slot of the OMERO interface.
