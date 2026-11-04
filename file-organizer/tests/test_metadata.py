import unittest
from datetime import datetime

from helpers import TempDirTestCase, heif_with_exif, jpeg_with_exif, mp4_with_date, tiff_with_date

from file_organizer import metadata


class CaptureDateTests(TempDirTestCase):
    def date_of(self, name: str, data: bytes):
        path = self.make(name, data)
        return metadata.capture_date(path, name.rsplit(".", 1)[-1])

    def test_jpeg_little_and_big_endian(self):
        for endian in ("<", ">"):
            with self.subTest(endian=endian):
                data = jpeg_with_exif(tiff_with_date("2021:07:04 09:08:07", endian))
                self.assertEqual(self.date_of("a.jpg", data), datetime(2021, 7, 4, 9, 8, 7))

    def test_jpeg_without_app0(self):
        data = jpeg_with_exif(tiff_with_date("2020:02:29 23:59:59"), app0=False)
        self.assertEqual(self.date_of("b.JPEG", data), datetime(2020, 2, 29, 23, 59, 59))

    def test_jpeg_without_exif(self):
        self.assertIsNone(self.date_of("c.jpg", jpeg_with_exif(None)))

    def test_tiff_falls_back_to_ifd0_datetime(self):
        data = tiff_with_date("2019:01:02 03:04:05", in_exif_ifd=False)
        self.assertEqual(self.date_of("raw.dng", data), datetime(2019, 1, 2, 3, 4, 5))

    def test_heic(self):
        data = heif_with_exif(tiff_with_date("2022:06:18 08:45:30", ">"))
        self.assertEqual(self.date_of("IMG_1234.HEIC", data), datetime(2022, 6, 18, 8, 45, 30))

    def test_mp4_moov_after_mdat_is_local_time(self):
        unix = 1688214896  # 2023-07-01 12:34:56 UTC
        self.assertEqual(self.date_of("v.mp4", mp4_with_date(unix)), datetime.fromtimestamp(unix))

    def test_mov_version1_moov_first(self):
        unix = 1609556645
        self.assertEqual(self.date_of("v.mov", mp4_with_date(unix, version=1, moov_last=False)),
                         datetime.fromtimestamp(unix))

    def test_video_without_date(self):
        self.assertIsNone(self.date_of("v.mp4", mp4_with_date(0)))

    def test_garbage_and_truncated_files_never_raise(self):
        good = jpeg_with_exif(tiff_with_date("2021:07:04 09:08:07"))
        samples = [b"", b"\xff\xd8", b"\xff\xd8\xff\xe1\x00\x02", good[:30], b"II*\x00\xff\xff\xff\xff",
                   b"\x00\x00\x00\x18ftypheic" + b"\xff" * 40, mp4_with_date(1688214896)[:50],
                   b"\x00\x00\x00\x01ftyp" + b"\x00" * 30]
        for i, data in enumerate(samples):
            for ext in ("jpg", "tif", "heic", "mp4"):
                with self.subTest(sample=i, ext=ext):
                    self.assertIsNone(self.date_of(f"g{i}.{ext}", data))

    def test_unsupported_extension_is_not_opened(self):
        path = self.make("x.pdf", jpeg_with_exif(tiff_with_date("2021:07:04 09:08:07")))
        self.assertIsNone(metadata.capture_date(path, "pdf"))


class ParseDateTests(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(metadata.parse_exif_datetime("2024:03:05 10:11:12"), datetime(2024, 3, 5, 10, 11, 12))
        self.assertEqual(metadata.parse_exif_datetime("2024-03-05 10:11:12"), datetime(2024, 3, 5, 10, 11, 12))
        self.assertEqual(metadata.parse_exif_datetime("2024:03:05T10:11:12+08:00"), datetime(2024, 3, 5, 10, 11, 12))

    def test_invalid(self):
        for text in ("", "0000:00:00 00:00:00", "    :  :     :  :  ", "2024:13:01 00:00:00", "garbage"):
            with self.subTest(text=text):
                self.assertIsNone(metadata.parse_exif_datetime(text))


if __name__ == "__main__":
    unittest.main()
