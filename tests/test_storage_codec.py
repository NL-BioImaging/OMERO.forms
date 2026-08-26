import base64
import hashlib
import json
import random
import unittest
import zlib

from omero_forms.storage_codec import (
    CHUNK_KEY_PREFIX,
    MAX_NAMED_VALUE_UTF8_BYTES,
    PayloadCodecError,
    STORAGE_FORMAT,
    STORAGE_MARKER_KEY,
    UnsupportedPayloadFormat,
    decode_payload,
    encode_payload,
    is_chunk_key,
    iter_payload_entries,
)


class StorageCodecTest(unittest.TestCase):
    def _large_payload(self, size=12000):
        random_source = random.Random(20260826)
        random_bytes = bytes(random_source.randrange(0, 256) for _ in range(size))
        return json.dumps(
            {
                "id": "large-form",
                "schema": base64.b64encode(random_bytes).decode("ascii"),
                "uiSchema": {"description": {"ui:widget": "textarea"}},
            },
            separators=(",", ":"),
        )

    def _chunked_rows(self):
        rows = encode_payload("2026-08-26T12:00:00", self._large_payload())
        self.assertGreater(len(rows), 2)
        return rows

    def test_small_payload_retains_legacy_inline_format(self):
        payload = '{"schema":"small"}'

        rows = encode_payload("version-1", payload)

        self.assertEqual(rows, [("version-1", payload)])
        self.assertEqual(decode_payload(rows[0][1], rows), payload)

    def test_payload_exactly_at_inline_boundary_stays_inline(self):
        payload = "x" * MAX_NAMED_VALUE_UTF8_BYTES

        rows = encode_payload("version-1", payload)

        self.assertEqual(rows, [("version-1", payload)])

    def test_payload_one_byte_above_inline_boundary_is_chunked(self):
        payload = "x" * (MAX_NAMED_VALUE_UTF8_BYTES + 1)

        rows = encode_payload("version-1", payload)

        manifest = json.loads(rows[0][1])
        self.assertEqual(manifest[STORAGE_MARKER_KEY], STORAGE_FORMAT)
        self.assertEqual(decode_payload(rows[0][1], rows), payload)

    def test_utf8_byte_length_controls_inline_boundary(self):
        payload = "é" * 600
        self.assertLess(len(payload), MAX_NAMED_VALUE_UTF8_BYTES)
        self.assertGreater(len(payload.encode("utf-8")), MAX_NAMED_VALUE_UTF8_BYTES)

        rows = encode_payload("version-1", payload)

        self.assertTrue(is_chunk_key(rows[1][0]))
        self.assertEqual(decode_payload(rows[0][1], rows), payload)

    def test_large_form_round_trip_and_safe_chunk_sizes(self):
        payload = self._large_payload()

        rows = encode_payload("version-1", payload)

        self.assertGreater(len(rows), 3)
        self.assertEqual(decode_payload(rows[0][1], rows), payload)
        for _name, value in rows:
            self.assertLessEqual(
                len(value.encode("utf-8")), MAX_NAMED_VALUE_UTF8_BYTES
            )

    def test_chunks_can_be_returned_in_any_order(self):
        rows = self._chunked_rows()

        decoded = decode_payload(rows[0][1], list(reversed(rows)))

        self.assertEqual(decoded, self._large_payload())

    def test_missing_chunk_is_rejected(self):
        rows = self._chunked_rows()

        with self.assertRaisesRegex(PayloadCodecError, "missing chunk"):
            decode_payload(rows[0][1], rows[:-1])

    def test_duplicate_chunk_is_rejected(self):
        rows = self._chunked_rows()
        duplicate_rows = rows + [rows[1]]

        with self.assertRaisesRegex(PayloadCodecError, "duplicate chunk"):
            decode_payload(rows[0][1], duplicate_rows)

    def test_unexpected_chunk_is_rejected(self):
        rows = self._chunked_rows()
        manifest = json.loads(rows[0][1])
        extra_name = "{}:{:06d}".format(
            manifest["prefix"], manifest["chunks"]
        )

        with self.assertRaisesRegex(PayloadCodecError, "unexpected chunk"):
            decode_payload(rows[0][1], rows + [(extra_name, "AAAA")])

    def test_invalid_base64_is_rejected(self):
        rows = self._chunked_rows()
        corrupted = list(rows)
        corrupted[1] = (corrupted[1][0], "!" * len(corrupted[1][1]))

        with self.assertRaisesRegex(PayloadCodecError, "invalid Base64"):
            decode_payload(corrupted[0][1], corrupted)

    def test_invalid_zlib_is_rejected(self):
        rows = self._chunked_rows()
        manifest = json.loads(rows[0][1])
        invalid_zlib = base64.b64encode(b"not a zlib stream").decode("ascii")
        manifest["chunks"] = 1
        manifest["encoded_bytes"] = len(invalid_zlib)
        manifest_row = (rows[0][0], json.dumps(manifest, separators=(",", ":")))
        chunk_row = (manifest["prefix"] + ":000000", invalid_zlib)

        with self.assertRaisesRegex(PayloadCodecError, "invalid zlib"):
            decode_payload(manifest_row[1], [manifest_row, chunk_row])

    def test_checksum_mismatch_is_rejected(self):
        rows = self._chunked_rows()
        manifest = json.loads(rows[0][1])
        manifest["sha256"] = "0" * 64
        corrupted_manifest = json.dumps(manifest, separators=(",", ":"))

        with self.assertRaisesRegex(PayloadCodecError, "SHA-256"):
            decode_payload(corrupted_manifest, rows[1:])

    def test_unknown_storage_format_is_rejected(self):
        manifest = json.dumps({STORAGE_MARKER_KEY: "future-codec-v2"})

        with self.assertRaises(UnsupportedPayloadFormat):
            decode_payload(manifest, [])

    def test_mixed_legacy_and_chunked_versions_preserve_order(self):
        legacy_payload = '{"id":"legacy"}'
        chunked_payload = self._large_payload()
        chunked_rows = encode_payload("version-2", chunked_payload)
        entries = chunked_rows + [
            ("id", "test-form"),
            ("owner", "1"),
            ("version-1", legacy_payload),
            ("objType", "Dataset"),
        ]

        versions = list(
            iter_payload_entries(
                entries, reserved_names=["id", "owner", "objType"]
            )
        )

        self.assertEqual(
            versions,
            [("version-2", chunked_payload), ("version-1", legacy_payload)],
        )

    def test_reserved_chunk_keys_are_not_exposed_as_versions(self):
        rows = self._chunked_rows()

        versions = list(iter_payload_entries(rows))

        self.assertEqual(len(versions), 1)
        self.assertFalse(versions[0][0].startswith(CHUNK_KEY_PREFIX))

    def test_chunks_without_a_manifest_are_rejected(self):
        rows = self._chunked_rows()

        with self.assertRaisesRegex(PayloadCodecError, "without a manifest"):
            list(iter_payload_entries(rows[1:]))

    def test_malformed_reserved_chunk_key_is_rejected(self):
        rows = self._chunked_rows()

        with self.assertRaisesRegex(PayloadCodecError, "malformed chunk key"):
            list(iter_payload_entries(rows + [(CHUNK_KEY_PREFIX + "broken", "AAAA")]))

    def test_trailing_zlib_data_is_rejected(self):
        payload = self._large_payload()
        raw = payload.encode("utf-8")
        compressed = zlib.compress(raw) + b"trailing"
        encoded = base64.b64encode(compressed).decode("ascii")
        prefix = CHUNK_KEY_PREFIX + "a" * 32
        chunks = [
            encoded[offset : offset + MAX_NAMED_VALUE_UTF8_BYTES]
            for offset in range(0, len(encoded), MAX_NAMED_VALUE_UTF8_BYTES)
        ]
        manifest = json.dumps(
            {
                STORAGE_MARKER_KEY: STORAGE_FORMAT,
                "prefix": prefix,
                "chunks": len(chunks),
                "raw_bytes": len(raw),
                "encoded_bytes": len(encoded),
                "sha256": hashlib.sha256(raw).hexdigest(),
            }
        )
        rows = [("version-1", manifest)] + [
            ("{}:{:06d}".format(prefix, index), chunk)
            for index, chunk in enumerate(chunks)
        ]

        with self.assertRaisesRegex(PayloadCodecError, "trailing"):
            decode_payload(manifest, rows)


if __name__ == "__main__":
    unittest.main()
