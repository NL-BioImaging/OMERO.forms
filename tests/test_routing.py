import re
import unittest

from omero_forms.routing import FORM_ID_PATTERN


class FormIdRoutePatternTest(unittest.TestCase):
    def test_accepts_existing_legacy_form_names(self):
        self.assertIsNotNone(re.fullmatch(FORM_ID_PATTERN, "REMBI_Biosample"))

    def test_accepts_spaces_and_punctuation(self):
        self.assertIsNotNone(
            re.fullmatch(FORM_ID_PATTERN, "LEI-MIBME User Template v1")
        )

    def test_rejects_empty_or_path_spanning_ids(self):
        self.assertIsNone(re.fullmatch(FORM_ID_PATTERN, ""))
        self.assertIsNone(re.fullmatch(FORM_ID_PATTERN, "folder/form"))


if __name__ == "__main__":
    unittest.main()
