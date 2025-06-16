OMERO.forms
===========

OMERO.forms is an extension to OMERO.web to enhance metadata input and provide provenance. Forms can be designed in a powerful and flexible JSON Schema, using the Designer - Editor component of OMERO.forms. These can then be assigned for use to appropriate groups by group owners or administrators. Users can then populate these forms for container objects (Such as a Dataset or Screen). The history of both the form (as it may evolve over time) and the data entered into it for an object is recorded in an immutable fashion. At any point it is possible to see what metadata was entered into a specific version of a form previously. Finally, the metadata entered into a form is reduced to an OMERO MapAnnotation and attached to the object for use by computational methods.

The design of the forms themselves is based on `IETF JSON Schema Internet Draft Version 4 <http://json-schema.org/documentation.html>`_. A demonstration environment with a number of examples that could be used in OMERO.forms is available, `react-jsonschema-form <https://mozilla-services.github.io/react-jsonschema-form/>`_.


Design Details
==============

Further details about the design can be found in `design.rst <design.rst>`_

Usage
=====

There are two parts to OMERO.forms. The first is the the Designer where forms can be created, edited and assigned to groups. The second is the centre panel plugin that allows forms to be displayed, populated with data and the history of the form viewed.

The Designer can be found by clicking on the top-link, 'FORMS Designer'. There are two parts to the Designer, an Editor and Assigner.

The centre panel plugin can be found by clicking on a container object (Project, Dataset, Screen or Plate) in the OMERO.web client and then select 'Forms' from the dropdown menu in the centre panel.

Designer - Editor
=================

The Editor is used to create and update forms. It is also used to indicate which OMERO object types (e.g. Dataset or Screen) that a form is appropriate for.

The left-hand side of the Editor is used to design the form, which is shown as a live preview on the right-hand side.

The **Form Name** field is used to set the name of the form to be saved. This must be unique within the system. To overwrite a form, this should be kept the same, otherwise it will be saved as a new form with a different name.

The **Load Existing Form** dropdown can be used to search for and load any other form in the system.

The **Object Types** field is used to indicate for which object types this form is appropriate for.

Much like the centre panel plugin editor, when submitting updates to a form, an additional optional input field **Change Message** is always present. This can (and is highly recommended to) be used to add a comment about the reason for the update.

The **JSONSchema** field is the primary design code for the form. Changes made here are reflected live in the preview.

The **UISchema** field is used to modify default form rendering options. An example might be to change a text input to a text area for a larger body of text input.

The **formData** field reflects what the metadata structure will look like when entering data into the form. This will update live as metadata is inputted into the form. It can also be used to enter example form metadata to populate the current form design.

The **Submit** button on the preview form does nothing except check that the form is valid. It is not possible to submit data using this form as it would not be associated with any particular OMERO object.

Only an admin or the original owner of a form can make changes to it. When a form is updated, it is saved as a new version of that form. All previous form versions are retained as the form design in which data was originally entered is important context information for the metadata that was entered.

Designer - Assigner
===================

The Assigner is used to assert that certain forms are for use in certain groups so that all forms are not shown to all users. Only an administrator or group owner can assign a form to a group.

A summary of all groups that the current user can administer is shown as a table along with the forms currently assigned to those groups.

To assign a form to a group, start by selecting a form from the dropdown list. This will display the current list of group that this form is assigned to (that the current user has permission to assign). Add or remove groups to this assignment as appropriate and press save.

Centre Panel Plugin - Editor
============================

The centre panel plugin Editor is the main component of OMERO.forms. This is where users can input and update metadata.

The forms that are assigned to the users current group are displayed in a list. The user can make a selection and this will render the form ready for input. If the form has previously been populated, then the previous values will be displayed in the form.

Any errors with the current input (such as missing mandatory fields) are displayed at the top of the form. The form can not be submitted if it is not valid.

When submitting any form metadata, an additional optional input field **Change Message** is always present. This can (and is highly recommended to) be used to add a comment about the reason for the update. Anyone familiar with version control systems such as `git <https://git-scm.com/>`_ will recognise this as a commit message.

Once the user has populated the form to their satisfaction and it is valid, the form can be submitted. The submitted form metadata is recorded in an immutable metadata store and also, converted into an OMERO MapAnnotation. The MapAnnotation is attached to the object for which the form was populated. This can then be used in computational steps such as an analysis.

Centre Panel Plugin - History
=============================

The centre panel plugin History is where users can view the history of metadata for the current OMERO object.

The list of changes in reverse chronological order are presented on the left along with the timestamp at which they were entered, the user name of the editor and the change message (if present). Selecting any of these changes will render the form that was used to enter those changes on the right, populated with the metadata that was submitted in that change.

Installation
============

Before configuring the plugin, create an administrative user in OMERO. In this example that user is called 'formmaster'. This user should not be a member of any groups other than the 'system' group that all administrators are a part of. Give this user a secure password. This can be done with the CLI.

::

  omero user add formmaster form master system

Alternatively, add a startup script to the OMERO.server configuration to create this user automatically on startup. 

Perform the installation steps

::

  # In the python environment of OMERO.web (virtualenv or global)
  pip install omero-forms

  # Add OMERO.forms to webclient
  omero config append omero.web.apps '"omero_forms"'

  # Add OMERO.forms to centre panel
  omero config append omero.web.ui.center_plugins '["Forms", "forms/forms_init.js.html", "omero_forms_panel"]'

  # Add a top-link to the OMERO.forms designer
  omero config append omero.web.ui.top_links '["Forms Designer", "omeroforms_designer", {"title": "Open OMERO.Forms in a new tab", "target": "new"}]'

  # Configure the form master user
  omero config set omero.web.forms.priv.user 'formmaster'
  omero config set omero.web.forms.priv.password 'changeit'


Contributing
================

OMERO.forms uses Node.js and webpack for frontend builds. The package is distributed via PyPI.

Building for production
=======================

This will build `static/forms/js/bundle.js` which contains the minified frontend code including CSS:

::

    npm install --force
    node_modules/.bin/webpack --mode production

Building for development
========================

This will detect changes and rebuild `static/forms/js/bundle.js` when there
are any. This works in conjunction with django development server as that
will be monitoring `bundle.js` for any changes:

::

    npm install --force
    node_modules/.bin/webpack --watch --mode development

Publishing Releases
===================

1. Create a new release on GitHub
2. The GitHub Action will automatically:
   - Build the frontend assets
   - Create a Python package
   - Publish to PyPI

The package can then be installed via pip:

::

    pip install omero-forms
