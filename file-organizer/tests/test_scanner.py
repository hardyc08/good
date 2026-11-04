import os
import unittest

from helpers import TempDirTestCase

from file_organizer.scanner import protection_reason, scan


class ScanTests(TempDirTestCase):
    def names(self, result):
        return sorted(f.rel.replace(os.sep, "/") for f in result.files)

    def test_skips_hidden_system_and_partial_files(self):
        for name in ("keep.pdf", ".hidden", "desktop.ini", "Thumbs.db", ".DS_Store", "movie.mp4.crdownload",
                     "big.zip.part", "~$報告.docx", "報告.docx"):
            self.make(name)
        result = scan(self.root)
        self.assertEqual(self.names(result), ["keep.pdf", "報告.docx"])
        self.assertEqual(result.hidden_skipped, 1)  # .hidden
        self.assertEqual(result.system_skipped, 6)  # .DS_Store counts as a system file

    def test_include_hidden(self):
        self.make(".config.json")
        self.assertEqual(self.names(scan(self.root, include_hidden=True)), [".config.json"])

    def test_not_recursive_by_default(self):
        self.make("a.txt")
        self.make("sub/b.txt")
        self.assertEqual(self.names(scan(self.root)), ["a.txt"])
        self.assertEqual(self.names(scan(self.root, recursive=True)), ["a.txt", "sub/b.txt"])

    def test_protected_folders_are_left_alone(self):
        self.make("photos/a.jpg")
        self.make("project/package.json")
        self.make("project/src/index.js")
        self.make("portable-app/app.exe")
        self.make("portable-app/readme.txt")
        self.make("node_modules/x/index.js")
        self.make("Photo Booth.app/Contents/x.plist")
        self.make(".git/config")
        result = scan(self.root, recursive=True)
        self.assertEqual(self.names(result), ["photos/a.jpg"])
        protected = {p.name for p, _ in result.protected_dirs}
        self.assertEqual(protected, {"project", "portable-app", "node_modules", "Photo Booth.app"})

    def test_chosen_folder_itself_is_never_protected(self):
        self.make("package.json")
        self.make("setup.exe")
        self.assertEqual(self.names(scan(self.root)), ["package.json", "setup.exe"])

    def test_exclude(self):
        self.make("a.txt")
        self.make("out/b.txt")
        result = scan(self.root, recursive=True, exclude=[self.root / "out"])
        self.assertEqual(self.names(result), ["a.txt"])

    def test_symlinks_are_skipped(self):
        target = self.make("real.txt")
        try:
            os.symlink(target, self.root / "link.txt")
            os.symlink(self.root, self.root / "loop", target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("symbolic links are not available")
        result = scan(self.root, recursive=True)
        self.assertEqual(self.names(result), ["real.txt"])
        self.assertEqual(result.links_skipped, 2)

    def test_file_details(self):
        path = self.make("a.bin", b"12345", mtime=1_600_000_000)
        entry = scan(self.root).files[0]
        self.assertEqual((entry.path, entry.size, int(entry.mtime), entry.name), (path, 5, 1_600_000_000, "a.bin"))


class ProtectionTests(unittest.TestCase):
    def test_reasons(self):
        self.assertIn("package.json", protection_reason(["a.txt", "package.json"]))
        self.assertIn("x.dll", protection_reason(["x.dll"]))
        self.assertIsNotNone(protection_reason(["setup.exe"]))
        self.assertIsNone(protection_reason(["setup.exe"], count_exe=False))
        self.assertIsNone(protection_reason(["a.jpg", "b.pdf"]))


if __name__ == "__main__":
    unittest.main()
