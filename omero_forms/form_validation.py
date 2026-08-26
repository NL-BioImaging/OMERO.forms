ALLOWED_OBJECT_TYPES = {"Project", "Dataset", "Screen", "Plate"}


def validate_object_types(object_types):
    """Return valid applicable object types or raise a user-facing error."""
    if not isinstance(object_types, list) or len(object_types) == 0:
        raise ValueError("Select at least one applicable object type")

    invalid = [value for value in object_types if value not in ALLOWED_OBJECT_TYPES]
    if invalid:
        raise ValueError("Invalid object type(s): %s" % invalid)

    return object_types
