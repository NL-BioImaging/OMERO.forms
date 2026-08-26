import json
import sys
import types
import unittest
from datetime import datetime
from unittest import mock


if "omero" not in sys.modules:
    class FakeParameters:
        def addLong(self, _name, _value):
            pass

        def add(self, _name, _value):
            pass

    fake_omero = types.ModuleType("omero")
    fake_rtypes = types.ModuleType("omero.rtypes")
    fake_rtypes.rlong = lambda value: value
    fake_rtypes.unwrap = lambda value: value
    fake_rtypes.wrap = lambda value: value
    fake_omero.rtypes = fake_rtypes
    fake_omero.model = types.SimpleNamespace()
    fake_omero.sys = types.SimpleNamespace(ParametersI=FakeParameters)
    sys.modules["omero"] = fake_omero
    sys.modules["omero.rtypes"] = fake_rtypes

from omero_forms import utils
from omero_forms.storage_codec import encode_payload, iter_payload_entries


class FakeNamedValue:
    def __init__(self, name, value):
        self.name = name
        self.value = value


class FakeAnnotation:
    def __init__(self, rows):
        self.rows = [FakeNamedValue(name, value) for name, value in rows]

    def getMapValue(self):
        return self.rows


class FakeUpdateService:
    def __init__(self):
        self.saved = []

    def saveObject(self, value, _service_options):
        self.saved.append(value)


class FakeConnection:
    def __init__(self):
        self.SERVICE_OPTS = object()
        self.update_service = FakeUpdateService()

    def getUpdateService(self):
        return self.update_service


class FakeMapAnnotationWrapper:
    instances = []

    def __init__(self, _connection):
        self.namespace = None
        self.value = None
        self.saved = False
        self._obj = object()
        self.instances.append(self)

    def setNs(self, namespace):
        self.namespace = namespace

    def setValue(self, value):
        self.value = value

    def save(self):
        self.saved = True


class FakeAnnotationLink:
    def __init__(self):
        self.parent = None
        self.child = None


class FakeExperimenter:
    def __init__(self, object_id, loaded):
        self.object_id = object_id
        self.loaded = loaded


class FakeUserConnection:
    def isAdmin(self):
        return False

    def getUserId(self):
        return 7


class UtilsStorageIntegrationTest(unittest.TestCase):
    def setUp(self):
        FakeMapAnnotationWrapper.instances.clear()
        self.named_value_patch = mock.patch.object(
            utils.omero.model, "NamedValue", FakeNamedValue, create=True
        )
        self.named_value_patch.start()

    def tearDown(self):
        self.named_value_patch.stop()

    def _form_payload(self, schema, timestamp):
        return json.dumps(
            {
                "id": "test-form",
                "schema": schema,
                "uiSchema": "{}",
                "author": 7,
                "timestamp": timestamp,
                "message": "",
            }
        )

    def _mixed_form_annotation(self):
        latest_timestamp = "2026-08-26T12:00:00.123456"
        older_timestamp = "2026-08-25T12:00:00.123456"
        latest_payload = self._form_payload("x" * 6000, latest_timestamp)
        older_payload = self._form_payload('{"type":"object"}', older_timestamp)
        latest_rows = encode_payload(latest_timestamp, latest_payload)
        rows = latest_rows + [
            ("id", "test-form"),
            ("owner", "7"),
            ("objType", "Dataset"),
            (older_timestamp, older_payload),
        ]
        return FakeAnnotation(rows), latest_payload, older_payload

    def test_form_version_readers_support_mixed_legacy_and_chunked_rows(self):
        annotation, latest_payload, older_payload = self._mixed_form_annotation()

        with mock.patch.object(utils, "_get_form", return_value=annotation):
            versions = utils.get_form_versions(None, None, "test-form")
            latest = utils.get_form_version(
                None, FakeUserConnection(), None, "test-form"
            )
            older = utils.get_form_version(
                None,
                FakeUserConnection(),
                None,
                "test-form",
                timestamp="2026-08-25T12:00:00.123456",
            )

        expected_versions = [json.loads(latest_payload), json.loads(older_payload)]
        for version in expected_versions:
            version["sourceUrl"] = ""
        self.assertEqual(versions, expected_versions)
        self.assertEqual(latest["schema"], "x" * 6000)
        self.assertEqual(latest["owners"], [7])
        self.assertEqual(latest["objTypes"], ["Dataset"])
        self.assertTrue(latest["editable"])
        self.assertEqual(older["schema"], '{"type":"object"}')
        self.assertEqual(latest["sourceUrl"], "")

    def test_legacy_load_message_backfills_source_url(self):
        latest_timestamp = "2026-08-26T12:00:00.123456"
        older_timestamp = "2026-08-25T12:00:00.123456"
        source_url = "https://example.org/forms/schema.json"
        latest_payload = self._form_payload("{}", latest_timestamp)
        older_payload = json.loads(self._form_payload("{}", older_timestamp))
        older_payload["message"] = "Loaded version v1.0.0 from %s" % source_url
        annotation = FakeAnnotation(
            [
                (latest_timestamp, latest_payload),
                ("id", "test-form"),
                ("owner", "7"),
                (older_timestamp, json.dumps(older_payload)),
            ]
        )

        with mock.patch.object(utils, "_get_form", return_value=annotation):
            versions = utils.get_form_versions(None, None, "test-form")
            version = utils.get_form_version(
                None, FakeUserConnection(), None, "test-form"
            )

        self.assertEqual(version["sourceUrl"], source_url)
        self.assertEqual(versions[0]["sourceUrl"], source_url)
        self.assertEqual(versions[1]["sourceUrl"], source_url)

    def test_explicit_empty_source_url_stops_legacy_inheritance(self):
        latest_timestamp = "2026-08-26T12:00:00.123456"
        older_timestamp = "2026-08-25T12:00:00.123456"
        latest_payload = json.loads(self._form_payload("{}", latest_timestamp))
        latest_payload["sourceUrl"] = ""
        older_payload = json.loads(self._form_payload("{}", older_timestamp))
        older_payload["message"] = (
            "Loaded version v1.0.0 from https://example.org/forms/schema.json"
        )
        annotation = FakeAnnotation(
            [
                (latest_timestamp, json.dumps(latest_payload)),
                ("id", "test-form"),
                ("owner", "7"),
                (older_timestamp, json.dumps(older_payload)),
            ]
        )

        with mock.patch.object(utils, "_get_form", return_value=annotation):
            version = utils.get_form_version(
                None, FakeUserConnection(), None, "test-form"
            )

        self.assertEqual(version["sourceUrl"], "")

    def test_older_client_inherits_existing_source_url(self):
        existing = {"sourceUrl": "https://example.org/forms/schema.json"}
        self.assertEqual(
            utils.resolve_source_url(None, existing),
            existing["sourceUrl"],
        )
        self.assertEqual(utils.resolve_source_url("", existing), "")
        with self.assertRaisesRegex(ValueError, "must be a string"):
            utils.resolve_source_url(123, existing)

    def test_updating_form_prepends_complete_chunk_block(self):
        old_timestamp = "2026-08-25T12:00:00.123456"
        old_payload = self._form_payload('{"type":"object"}', old_timestamp)
        annotation = FakeAnnotation(
            [
                (old_timestamp, old_payload),
                ("id", "test-form"),
                ("owner", "7"),
                ("objType", "Dataset"),
            ]
        )
        connection = FakeConnection()
        timestamp = datetime(2026, 8, 26, 12, 0, 0, 123456)

        with mock.patch.object(utils, "_get_form", return_value=annotation):
            utils.add_form_version(
                connection,
                99,
                "test-form",
                "x" * 6000,
                "{}",
                7,
                timestamp,
                "large schema",
                ["Dataset"],
                "https://example.org/forms/schema.json",
            )

        entries = [(row.name, row.value) for row in annotation.rows]
        decoded_versions = list(
            iter_payload_entries(
                entries, reserved_names=["id", "owner", "objType"]
            )
        )
        self.assertEqual(decoded_versions[0][0], timestamp.isoformat())
        self.assertEqual(json.loads(decoded_versions[0][1])["schema"], "x" * 6000)
        self.assertEqual(
            json.loads(decoded_versions[0][1])["sourceUrl"],
            "https://example.org/forms/schema.json",
        )
        self.assertEqual(decoded_versions[1], (old_timestamp, old_payload))
        self.assertEqual(connection.update_service.saved, [annotation])

    def test_creating_large_form_stores_safe_manifest_and_chunks(self):
        connection = FakeConnection()
        timestamp = datetime(2026, 8, 26, 12, 0, 0, 123456)

        with (
            mock.patch.object(utils, "_get_form", return_value=None),
            mock.patch.object(
                utils.omero,
                "gateway",
                types.SimpleNamespace(MapAnnotationWrapper=FakeMapAnnotationWrapper),
                create=True,
            ),
            mock.patch.object(
                utils.omero.model,
                "ExperimenterAnnotationLinkI",
                FakeAnnotationLink,
                create=True,
            ),
            mock.patch.object(
                utils.omero.model,
                "ExperimenterI",
                FakeExperimenter,
                create=True,
            ),
        ):
            utils.add_form_version(
                connection,
                99,
                "test-form",
                "x" * 12000,
                "{}",
                7,
                timestamp,
                "large schema",
                ["Dataset"],
            )

        wrapper = FakeMapAnnotationWrapper.instances[0]
        entries = [(name, value) for name, value in wrapper.value]
        decoded_versions = list(
            iter_payload_entries(
                entries, reserved_names=["id", "owner", "objType"]
            )
        )
        self.assertTrue(wrapper.saved)
        self.assertEqual(
            wrapper.namespace, "hms.harvard.edu/omero/forms/schema/test-form"
        )
        self.assertEqual(decoded_versions[0][0], timestamp.isoformat())
        self.assertEqual(json.loads(decoded_versions[0][1])["schema"], "x" * 12000)
        self.assertTrue(any(name.startswith("__ofchunk__") for name, _ in entries))
        self.assertTrue(all(len(value.encode("utf-8")) <= 1024 for _, value in entries))
        self.assertEqual(len(connection.update_service.saved), 1)

    def test_submission_history_supports_chunked_and_legacy_rows(self):
        latest_changed_at = "2026-08-26T12:00:00.123456"
        older_changed_at = "2026-08-25T12:00:00.123456"
        latest = json.dumps(
            {
                "formId": "test-form",
                "formTimestamp": "schema-v2",
                "formData": json.dumps({"notes": "x" * 6000}),
                "changedBy": 7,
                "changedAt": latest_changed_at,
                "message": "latest",
            }
        )
        older = json.dumps(
            {
                "formId": "test-form",
                "formTimestamp": "schema-v1",
                "formData": "{}",
                "changedBy": 7,
                "changedAt": older_changed_at,
                "message": "older",
            }
        )
        annotation = FakeAnnotation(
            encode_payload(latest_changed_at, latest) + [(older_changed_at, older)]
        )

        with mock.patch.object(utils, "_get_form_data", return_value=annotation):
            history = list(
                utils.get_form_data_history(
                    None, None, "test-form", "Dataset", 123
                )
            )

        self.assertEqual([item["message"] for item in history], ["latest", "older"])
        self.assertEqual(history[0]["changedAt"], datetime.fromisoformat(latest_changed_at))
        self.assertEqual(json.loads(history[0]["formData"])["notes"], "x" * 6000)

    def test_updating_submission_prepends_complete_chunk_block(self):
        old_changed_at = "2026-08-25T12:00:00.123456"
        old_payload = json.dumps(
            {
                "formId": "test-form",
                "formTimestamp": "schema-v1",
                "formData": "{}",
                "changedBy": 7,
                "changedAt": old_changed_at,
                "message": "older",
            }
        )
        annotation = FakeAnnotation([(old_changed_at, old_payload)])
        connection = FakeConnection()
        changed_at = datetime(2026, 8, 26, 12, 0, 0, 123456)

        with mock.patch.object(utils, "_get_form_data", return_value=annotation):
            utils.add_form_data(
                connection,
                99,
                "test-form",
                "schema-v2",
                "latest",
                "Dataset",
                123,
                json.dumps({"notes": "x" * 6000}),
                7,
                changed_at,
            )

        entries = [(row.name, row.value) for row in annotation.rows]
        decoded_history = list(iter_payload_entries(entries))
        self.assertEqual(decoded_history[0][0], changed_at.isoformat())
        self.assertEqual(json.loads(decoded_history[0][1])["message"], "latest")
        self.assertEqual(decoded_history[1], (old_changed_at, old_payload))
        self.assertEqual(connection.update_service.saved, [annotation])


if __name__ == "__main__":
    unittest.main()
