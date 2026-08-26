"""Encode large JSON payloads safely inside OMERO MapAnnotation values.

OMERO stores each ``NamedValue.value`` in a PostgreSQL column with a B-tree
index.  Large individual values can therefore exceed PostgreSQL's maximum
index-entry size.  This codec keeps small payloads in the historical inline
format and stores larger payloads as a small manifest plus compressed chunks.
"""

import base64
import binascii
import hashlib
import hmac
import json
import re
import uuid
import zlib


STORAGE_MARKER_KEY = "_omero_forms_storage"
STORAGE_FORMAT = "chunked-zlib-base64-v1"
CHUNK_KEY_PREFIX = "__ofchunk__"

# Keeping every indexed value below this conservative threshold avoids
# depending on PostgreSQL page size, index tuple overhead or compressibility.
MAX_NAMED_VALUE_UTF8_BYTES = 1024

_PREFIX_RE = re.compile(r"^__ofchunk__[0-9a-f]{32}$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


class PayloadCodecError(ValueError):
    """Raised when a chunked payload is incomplete, invalid or corrupted."""


class UnsupportedPayloadFormat(PayloadCodecError):
    """Raised when a manifest names a codec this version cannot read."""


def is_chunk_key(name):
    """Return whether ``name`` is reserved for codec-owned chunk rows."""

    return isinstance(name, str) and name.startswith(CHUNK_KEY_PREFIX)


def _new_chunk_prefix(existing_names):
    while True:
        prefix = CHUNK_KEY_PREFIX + uuid.uuid4().hex
        if not any(
            name == prefix or name.startswith(prefix + ":")
            for name in existing_names
        ):
            return prefix


def encode_payload(version_key, payload, existing_names=()):
    """Return ``(name, value)`` rows for storing ``payload``.

    Payloads at or below :data:`MAX_NAMED_VALUE_UTF8_BYTES` retain the legacy
    one-row representation.  Larger payloads are compressed, Base64 encoded
    and split into independently safe values.  The row named ``version_key``
    is always first and is either the legacy payload or a chunk manifest.
    """

    if not isinstance(version_key, str) or not version_key:
        raise ValueError("version_key must be a non-empty string")
    if not isinstance(payload, str):
        raise TypeError("payload must be a string")

    raw = payload.encode("utf-8")
    if len(raw) <= MAX_NAMED_VALUE_UTF8_BYTES:
        return [(version_key, payload)]

    compressed = zlib.compress(raw)
    encoded = base64.b64encode(compressed).decode("ascii")
    chunks = [
        encoded[offset : offset + MAX_NAMED_VALUE_UTF8_BYTES]
        for offset in range(0, len(encoded), MAX_NAMED_VALUE_UTF8_BYTES)
    ]

    existing_names = tuple(name for name in existing_names if isinstance(name, str))
    prefix = _new_chunk_prefix(existing_names)
    manifest = json.dumps(
        {
            STORAGE_MARKER_KEY: STORAGE_FORMAT,
            "prefix": prefix,
            "chunks": len(chunks),
            "raw_bytes": len(raw),
            "encoded_bytes": len(encoded),
            "sha256": hashlib.sha256(raw).hexdigest(),
        },
        separators=(",", ":"),
        sort_keys=True,
    )

    if len(manifest.encode("utf-8")) > MAX_NAMED_VALUE_UTF8_BYTES:
        raise PayloadCodecError("chunk manifest exceeds the safe value size")

    rows = [(version_key, manifest)]
    rows.extend(
        ("{}:{:06d}".format(prefix, index), chunk)
        for index, chunk in enumerate(chunks)
    )
    return rows


def _read_manifest(payload):
    try:
        candidate = json.loads(payload)
    except (TypeError, ValueError):
        return None

    if not isinstance(candidate, dict) or STORAGE_MARKER_KEY not in candidate:
        return None
    if candidate[STORAGE_MARKER_KEY] != STORAGE_FORMAT:
        raise UnsupportedPayloadFormat(
            "unsupported OMERO.forms payload format: {!r}".format(
                candidate[STORAGE_MARKER_KEY]
            )
        )

    prefix = candidate.get("prefix")
    chunks = candidate.get("chunks")
    raw_bytes = candidate.get("raw_bytes")
    encoded_bytes = candidate.get("encoded_bytes")
    checksum = candidate.get("sha256")

    if not isinstance(prefix, str) or not _PREFIX_RE.fullmatch(prefix):
        raise PayloadCodecError("chunk manifest has an invalid prefix")
    if isinstance(chunks, bool) or not isinstance(chunks, int) or chunks < 1:
        raise PayloadCodecError("chunk manifest has an invalid chunk count")
    if (
        isinstance(raw_bytes, bool)
        or not isinstance(raw_bytes, int)
        or raw_bytes < 0
    ):
        raise PayloadCodecError("chunk manifest has an invalid raw byte count")
    if (
        isinstance(encoded_bytes, bool)
        or not isinstance(encoded_bytes, int)
        or encoded_bytes < 1
    ):
        raise PayloadCodecError("chunk manifest has an invalid encoded byte count")
    if not isinstance(checksum, str) or not _SHA256_RE.fullmatch(checksum):
        raise PayloadCodecError("chunk manifest has an invalid SHA-256 checksum")

    return candidate


def decode_payload(payload, entries):
    """Decode one legacy payload or chunk manifest from ``entries``.

    ``entries`` must contain all ``(name, value)`` rows from the annotation.
    Chunk order is irrelevant.  Missing, duplicate, unexpected or corrupted
    chunks cause :class:`PayloadCodecError` rather than a partial result.
    """

    if not isinstance(payload, str):
        raise PayloadCodecError("stored payload is not a string")

    manifest = _read_manifest(payload)
    if manifest is None:
        return payload

    prefix = manifest["prefix"]
    expected_chunks = manifest["chunks"]
    chunk_values = {}

    for name, value in entries:
        if not isinstance(name, str) or not name.startswith(prefix + ":"):
            continue

        suffix = name[len(prefix) + 1 :]
        if not suffix.isdigit():
            raise PayloadCodecError("chunk payload has a malformed chunk key")
        index = int(suffix)
        if index >= expected_chunks:
            raise PayloadCodecError("chunk payload contains an unexpected chunk")
        if index in chunk_values:
            raise PayloadCodecError("chunk payload contains a duplicate chunk")
        if not isinstance(value, str):
            raise PayloadCodecError("chunk payload contains a non-string chunk")
        if len(value.encode("utf-8")) > MAX_NAMED_VALUE_UTF8_BYTES:
            raise PayloadCodecError("chunk payload exceeds the safe value size")
        chunk_values[index] = value

    missing = [index for index in range(expected_chunks) if index not in chunk_values]
    if missing:
        raise PayloadCodecError(
            "chunk payload is missing chunk(s): {}".format(
                ", ".join(str(index) for index in missing)
            )
        )

    encoded = "".join(chunk_values[index] for index in range(expected_chunks))
    if len(encoded) != manifest["encoded_bytes"]:
        raise PayloadCodecError("chunk payload has an invalid encoded byte count")

    try:
        compressed = base64.b64decode(encoded.encode("ascii"), validate=True)
    except (UnicodeEncodeError, binascii.Error, ValueError) as exc:
        raise PayloadCodecError("chunk payload contains invalid Base64 data") from exc

    try:
        decompressor = zlib.decompressobj()
        raw = decompressor.decompress(compressed) + decompressor.flush()
    except zlib.error as exc:
        raise PayloadCodecError("chunk payload contains invalid zlib data") from exc

    if not decompressor.eof or decompressor.unused_data or decompressor.unconsumed_tail:
        raise PayloadCodecError("chunk payload has trailing or incomplete zlib data")
    if len(raw) != manifest["raw_bytes"]:
        raise PayloadCodecError("chunk payload has an invalid raw byte count")

    actual_checksum = hashlib.sha256(raw).hexdigest()
    if not hmac.compare_digest(actual_checksum, manifest["sha256"]):
        raise PayloadCodecError("chunk payload failed its SHA-256 checksum")

    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PayloadCodecError("chunk payload is not valid UTF-8") from exc


def iter_payload_entries(entries, reserved_names=()):
    """Yield decoded non-metadata payload rows in stored order."""

    entries = list(entries)
    reserved_names = set(reserved_names)

    referenced_prefixes = set()
    stored_prefixes = set()
    for name, value in entries:
        if name in reserved_names:
            continue
        if is_chunk_key(name):
            prefix, separator, suffix = name.rpartition(":")
            if (
                not separator
                or not _PREFIX_RE.fullmatch(prefix)
                or not suffix.isdigit()
            ):
                raise PayloadCodecError("annotation contains a malformed chunk key")
            stored_prefixes.add(prefix)
            continue

        manifest = _read_manifest(value)
        if manifest is not None:
            referenced_prefixes.add(manifest["prefix"])

    orphaned_prefixes = stored_prefixes - referenced_prefixes
    if orphaned_prefixes:
        raise PayloadCodecError("annotation contains chunks without a manifest")

    for name, value in entries:
        if name in reserved_names or is_chunk_key(name):
            continue
        yield name, decode_payload(value, entries)
