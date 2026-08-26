"""Shared URL-pattern fragments for OMERO.forms routes."""


# Form IDs are user-visible names. They may contain punctuation such as the
# hyphen in "LEI-MIBME", but a slash remains the URL path separator.
FORM_ID_PATTERN = r"[^/]+"
