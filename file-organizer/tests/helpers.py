"""Shared test helpers: isolated temp folders and hand-made media files."""

import os
import struct
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from typing import Optional, Set

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class TempDirTestCase(unittest.TestCase):
    """Gives each test an empty folder (self.root) and a private app-data dir."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.root = self.tmp / "inbox"
        self.root.mkdir()
        self._old_home = os.environ.get("FILE_ORGANIZER_HOME")
        os.environ["FILE_ORGANIZER_HOME"] = str(self.tmp / "apphome")

    def tearDown(self):
        if self._old_home is None:
            os.environ.pop("FILE_ORGANIZER_HOME", None)
        else:
            os.environ["FILE_ORGANIZER_HOME"] = self._old_home
        self._tmp.cleanup()

    def make(self, rel: str, data: bytes = b"x", mtime: Optional[float] = None, base: Optional[Path] = None) -> Path:
        path = (base or self.root) / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        if mtime is not None:
            os.utime(path, (mtime, mtime))
        return path

    def files(self, base: Optional[Path] = None) -> Set[str]:
        """All files below *base* as 'a/b.txt' strings."""
        base = base or self.root
        return {p.relative_to(base).as_posix() for p in base.rglob("*") if p.is_file()}

    def dirs(self, base: Optional[Path] = None) -> Set[str]:
        base = base or self.root
        return {p.relative_to(base).as_posix() for p in base.rglob("*") if p.is_dir()}


def ts(text: str) -> float:
    """'2024-03-05 10:00' -> local timestamp."""
    return datetime.strptime(text, "%Y-%m-%d %H:%M").timestamp()


# --------------------------------------------------------------------- media builders

def tiff_with_date(date: str, endian: str = "<", in_exif_ifd: bool = True) -> bytes:
    order = b"II" if endian == "<" else b"MM"
    value = date.encode("ascii") + b"\x00"
    header = order + struct.pack(endian + "HI", 42, 8)
    if in_exif_ifd:
        ifd0 = struct.pack(endian + "H", 1) + struct.pack(endian + "HHII", 0x8769, 4, 1, 26) + struct.pack(endian + "I", 0)
        exif = struct.pack(endian + "H", 1) + struct.pack(endian + "HHII", 0x9003, 2, len(value), 44) + struct.pack(endian + "I", 0)
        return header + ifd0 + exif + value
    ifd0 = struct.pack(endian + "H", 1) + struct.pack(endian + "HHII", 0x0132, 2, len(value), 26) + struct.pack(endian + "I", 0)
    return header + ifd0 + value


def jpeg_with_exif(tiff: Optional[bytes], app0: bool = True) -> bytes:
    data = b"\xff\xd8"
    if app0:
        data += b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    if tiff is not None:
        payload = b"Exif\x00\x00" + tiff
        data += b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload
    data += b"\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00" + b"\x12" * 32 + b"\xff\xd9"
    return data


def box(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", 8 + len(payload)) + kind + payload


QT_EPOCH_OFFSET = 2082844800  # seconds between 1904-01-01 and 1970-01-01


def mp4_with_date(unix_seconds: int, version: int = 0, moov_last: bool = True) -> bytes:
    seconds = unix_seconds + QT_EPOCH_OFFSET if unix_seconds else 0
    if version == 0:
        mvhd = box(b"mvhd", b"\x00\x00\x00\x00" + struct.pack(">II", seconds, seconds) + b"\x00" * 88)
    else:
        mvhd = box(b"mvhd", b"\x01\x00\x00\x00" + struct.pack(">QQ", seconds, seconds) + b"\x00" * 96)
    moov = box(b"moov", mvhd)
    ftyp = box(b"ftyp", b"isom\x00\x00\x02\x00isomiso2mp41")
    mdat = box(b"mdat", b"\x00" * 64)
    return ftyp + (mdat + moov if moov_last else moov + mdat)


def heif_with_exif(tiff: bytes) -> bytes:
    ftyp = box(b"ftyp", b"heic\x00\x00\x00\x00mif1heic")
    hdlr = box(b"hdlr", b"\x00" * 8 + b"pict" + b"\x00" * 13)
    infe_image = box(b"infe", b"\x02\x00\x00\x00" + struct.pack(">HH", 1, 0) + b"hvc1\x00")
    infe_exif = box(b"infe", b"\x02\x00\x00\x00" + struct.pack(">HH", 2, 0) + b"Exif\x00")
    iinf = box(b"iinf", b"\x00\x00\x00\x00" + struct.pack(">H", 2) + infe_image + infe_exif)
    payload = struct.pack(">I", 6) + b"Exif\x00\x00" + tiff

    def head(offset: int) -> bytes:
        iloc = box(b"iloc", b"\x01\x00\x00\x00" + bytes([0x44, 0x00]) + struct.pack(">H", 2)
                   + struct.pack(">HHHH", 1, 0, 0, 1) + struct.pack(">II", 0, 0)
                   + struct.pack(">HHHH", 2, 0, 0, 1) + struct.pack(">II", offset, len(payload)))
        return ftyp + box(b"meta", b"\x00\x00\x00\x00" + hdlr + iinf + iloc)

    offset = len(head(0)) + 8  # payload starts right after the mdat header
    return head(offset) + box(b"mdat", payload)
