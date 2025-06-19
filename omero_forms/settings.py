# This settings.py file will be imported by omero.settings file AFTER it has initialised custom settings.
# import django

# https://www.openmicroscopy.org/site/support/omero5.2/developers/Web/CreateApp.html
CUSTOM_SETTINGS_MAPPINGS = {
    "omero.web.forms.priv.user": [
        "OMERO_FORMS_PRIV_USER",
        None,
        str,
        "The privileged username to be used for storing key-values",
    ],
    "omero.web.forms.priv.password": [
        "OMERO_FORMS_PRIV_PASSWORD",
        None,
        str,
        "The privileged user's password to be used for storing key-values",
    ],
}
