"""Read the date a photo or video was taken.

Supports EXIF in JPEG, TIFF-based RAW files (DNG, CR2, NEF, ARW …) and
HEIC/HEIF (iPhone photos), plus the creation time stored in MP4/MOV videos.
Pure standard library; on anything unexpected the functions return None and
the caller falls back to the file's modified time.
"""

from __future__ import annotations

import re
import struct
from datetime import datetime, timedelta, timezone
from typing import BinaryIO, Dict, Iterator, Optional, Tuple

JPEG_EXTS = {"jpg", "jpeg", "jpe", "jfif"}
TIFF_EXTS = {"tif", "tiff", "dng", "cr2", "nef", "nrw", "arw", "srw", "pef", "sr2"}
HEIF_EXTS = {"heic", "heif", "avif"}
VIDEO_EXTS = {"mp4", "m4v", "mov", "3gp", "3g2"}
SUPPORTED_EXTS = JPEG_EXTS | TIFF_EXTS | HEIF_EXTS | VIDEO_EXTS

HEIF_BRANDS = {b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx", b"mif1", b"msf1", b"avif", b"avis"}
QUICKTIME_TOP_BOXES = {b"moov", b"mdat", b"wide", b"free", b"skip", b"pnot"}

TAG_EXIF_IFD = 0x8769
TAG_DATETIME = 0x0132
TAG_DATETIME_ORIGINAL = 0x9003
TAG_DATETIME_DIGITIZED = 0x9004
MAX_IFD_ENTRIES = 1024
MAX_BOXES = 4096
MAX_JPEG_SEGMENTS = 128

_DATE_RE = re.compile(r"(\d{4})[:\-/.](\d{2})[:\-/.](\d{2})[ T](\d{2}):(\d{2}):(\d{2})")
_QT_EPOCH = datetime(1904, 1, 1, tzinfo=timezone.utc)


def capture_date(path, ext: str) -> Optional[datetime]:
    """Date the photo/video was taken (local time), or None if unknown."""
    if ext.lower() not in SUPPORTED_EXTS:
        return None
    try:
        with open(path, "rb") as fh:
            head = fh.read(16)
            if head[:2] == b"\xff\xd8":
                return _jpeg_date(fh)
            if head[:4] in (b"II*\x00", b"MM\x00*"):
                return _tiff_date(fh, 0)
            if head[4:8] == b"ftyp":
                if head[8:12] in HEIF_BRANDS:
                    return _heif_date(fh)
                return _quicktime_date(fh)
            if head[4:8] in QUICKTIME_TOP_BOXES:
                return _quicktime_date(fh)
    except (OSError, ValueError, struct.error, OverflowError, IndexError):
        return None
    return None


def parse_exif_datetime(text: str) -> Optional[datetime]:
    match = _DATE_RE.match(text.strip()) if text else None
    if not match:
        return None
    try:
        moment = datetime(*(int(g) for g in match.groups()))
    except ValueError:
        return None
    return moment if 1900 < moment.year < 2200 else None


# --------------------------------------------------------------------- JPEG

def _jpeg_date(fh: BinaryIO) -> Optional[datetime]:
    fh.seek(2)
    for _ in range(MAX_JPEG_SEGMENTS):
        if fh.read(1) != b"\xff":
            return None
        marker = fh.read(1)
        while marker == b"\xff":  # padding bytes
            marker = fh.read(1)
        if not marker:
            return None
        code = marker[0]
        if code in (0xD9, 0xDA):  # end of image / start of the pixel data
            return None
        if code == 0x01 or 0xD0 <= code <= 0xD7:  # markers without a length
            continue
        raw = fh.read(2)
        if len(raw) < 2:
            return None
        length = struct.unpack(">H", raw)[0]
        if length < 2:
            return None
        start = fh.tell()
        if code == 0xE1 and length >= 8 and fh.read(6) == b"Exif\x00\x00":
            found = _tiff_date(fh, start + 6)
            if found:
                return found
        fh.seek(start + length - 2)
    return None


# --------------------------------------------------------------------- TIFF / EXIF

IfdEntry = Tuple[int, int, bytes]  # (type, count, 4 value bytes)


def _tiff_date(fh: BinaryIO, base: int) -> Optional[datetime]:
    fh.seek(base)
    header = fh.read(8)
    if len(header) < 8:
        return None
    if header[:2] == b"II":
        endian = "<"
    elif header[:2] == b"MM":
        endian = ">"
    else:
        return None
    if struct.unpack(endian + "H", header[2:4])[0] != 42:
        return None
    ifd0 = _read_ifd(fh, base, endian, struct.unpack(endian + "I", header[4:8])[0])
    pointer = ifd0.get(TAG_EXIF_IFD)
    if pointer is not None:
        exif = _read_ifd(fh, base, endian, struct.unpack(endian + "I", pointer[2])[0])
        for tag in (TAG_DATETIME_ORIGINAL, TAG_DATETIME_DIGITIZED):
            if tag in exif:
                found = parse_exif_datetime(_read_ascii(fh, base, endian, exif[tag]))
                if found:
                    return found
    if TAG_DATETIME in ifd0:
        return parse_exif_datetime(_read_ascii(fh, base, endian, ifd0[TAG_DATETIME]))
    return None


def _read_ifd(fh: BinaryIO, base: int, endian: str, offset: int) -> Dict[int, IfdEntry]:
    if offset < 8:
        return {}
    fh.seek(base + offset)
    raw = fh.read(2)
    if len(raw) < 2:
        return {}
    count = struct.unpack(endian + "H", raw)[0]
    if count == 0 or count > MAX_IFD_ENTRIES:
        return {}
    data = fh.read(count * 12)
    entries: Dict[int, IfdEntry] = {}
    for i in range(len(data) // 12):
        chunk = data[i * 12:(i + 1) * 12]
        tag, kind, number = struct.unpack(endian + "HHI", chunk[:8])
        entries[tag] = (kind, number, chunk[8:12])
    return entries


def _read_ascii(fh: BinaryIO, base: int, endian: str, entry: IfdEntry) -> str:
    kind, count, value = entry
    if kind != 2 or count == 0 or count > 64:  # 2 = ASCII
        return ""
    if count <= 4:
        raw = value[:count]
    else:
        fh.seek(base + struct.unpack(endian + "I", value)[0])
        raw = fh.read(count)
    return raw.split(b"\x00", 1)[0].decode("ascii", "replace")


# --------------------------------------------------------------------- ISO BMFF (MP4 / MOV / HEIC)

def _file_size(fh: BinaryIO) -> int:
    fh.seek(0, 2)
    return fh.tell()


def _boxes(fh: BinaryIO, start: int, end: int) -> Iterator[Tuple[bytes, int, int]]:
    """Yield (type, payload start, box end) for each box in [start, end)."""
    pos = start
    for _ in range(MAX_BOXES):
        if pos + 8 > end:
            return
        fh.seek(pos)
        size, kind = struct.unpack(">I4s", fh.read(8))
        header = 8
        if size == 1:
            size = struct.unpack(">Q", fh.read(8))[0]
            header = 16
        elif size == 0:  # box runs to the end of its parent
            size = end - pos
        if size < header or pos + size > end:
            return
        yield kind, pos + header, pos + size
        pos += size


def _find_box(fh: BinaryIO, start: int, end: int, kind: bytes) -> Optional[Tuple[int, int]]:
    for found, payload, box_end in _boxes(fh, start, end):
        if found == kind:
            return payload, box_end
    return None


def _quicktime_date(fh: BinaryIO) -> Optional[datetime]:
    moov = _find_box(fh, 0, _file_size(fh), b"moov")
    if not moov:
        return None
    mvhd = _find_box(fh, moov[0], moov[1], b"mvhd")
    if not mvhd:
        return None
    fh.seek(mvhd[0])
    version = fh.read(4)[0]
    if version == 1:
        seconds = struct.unpack(">Q", fh.read(8))[0]
    else:
        seconds = struct.unpack(">I", fh.read(4))[0]
    if seconds == 0:
        return None
    moment = _QT_EPOCH + timedelta(seconds=seconds)
    if not 1990 < moment.year < 2200:
        return None
    return moment.astimezone().replace(tzinfo=None)  # UTC -> local time


def _read_uint(fh: BinaryIO, size: int) -> int:
    if size == 0:
        return 0
    raw = fh.read(size)
    if len(raw) < size:
        raise ValueError("truncated")
    return int.from_bytes(raw, "big")


def _heif_date(fh: BinaryIO) -> Optional[datetime]:
    meta = _find_box(fh, 0, _file_size(fh), b"meta")
    if not meta:
        return None
    start, end = meta[0] + 4, meta[1]  # 'meta' is a full box (version + flags)
    exif_item = _heif_exif_item(fh, start, end)
    if exif_item is None:
        return None
    iloc = _find_box(fh, start, end, b"iloc")
    if not iloc:
        return None
    location = _iloc_offset(fh, iloc[0], exif_item)
    if location is None:
        return None
    fh.seek(location)
    skip = struct.unpack(">I", fh.read(4))[0]  # offset of the TIFF header inside the item
    if skip > 64:
        return None
    return _tiff_date(fh, location + 4 + skip)


def _heif_exif_item(fh: BinaryIO, start: int, end: int) -> Optional[int]:
    iinf = _find_box(fh, start, end, b"iinf")
    if not iinf:
        return None
    fh.seek(iinf[0])
    version = fh.read(4)[0]
    count_size = 2 if version == 0 else 4
    for kind, payload, _box_end in _boxes(fh, iinf[0] + 4 + count_size, iinf[1]):
        if kind != b"infe":
            continue
        fh.seek(payload)
        item_version = fh.read(4)[0]
        if item_version < 2:
            continue
        item_id = _read_uint(fh, 2 if item_version == 2 else 4)
        fh.read(2)  # protection index
        if fh.read(4) == b"Exif":
            return item_id
    return None


def _iloc_offset(fh: BinaryIO, payload: int, wanted: int) -> Optional[int]:
    fh.seek(payload)
    version = fh.read(4)[0]
    sizes = fh.read(2)
    offset_size, length_size = sizes[0] >> 4, sizes[0] & 0x0F
    base_offset_size = sizes[1] >> 4
    index_size = sizes[1] & 0x0F if version in (1, 2) else 0
    count = _read_uint(fh, 2 if version < 2 else 4)
    for _ in range(min(count, 65535)):
        item_id = _read_uint(fh, 2 if version < 2 else 4)
        construction = _read_uint(fh, 2) & 0x0F if version in (1, 2) else 0
        _read_uint(fh, 2)  # data reference index
        base = _read_uint(fh, base_offset_size)
        extents = _read_uint(fh, 2)
        first = None
        for _ in range(extents):
            if version in (1, 2) and index_size:
                _read_uint(fh, index_size)
            offset = _read_uint(fh, offset_size)
            _read_uint(fh, length_size)
            if first is None:
                first = offset
        if item_id == wanted:
            if construction != 0 or first is None:
                return None  # only data stored directly in the file is supported
            return base + first
    return None
