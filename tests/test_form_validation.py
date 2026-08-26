import unittest

from omero_forms.form_validation import validate_object_types


class FormValidationTest(unittest.TestCase):
    def test_requires_at_least_one_object_type(self):
        with self.assertRaisesRegex(ValueError, "at least one"):
            validate_object_types([])
        with self.assertRaisesRegex(ValueError, "at least one"):
            validate_object_types(None)

    def test_accepts_supported_object_types(self):
        object_types = ["Project", "Dataset", "Screen", "Plate"]
        self.assertEqual(validate_object_types(object_types), object_types)

    def test_rejects_unsupported_object_types(self):
        with self.assertRaisesRegex(ValueError, "Invalid object type"):
            validate_object_types(["Image"])


if __name__ == "__main__":
    unittest.main()
