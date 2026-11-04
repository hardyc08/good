import os
import sys
import unittest
from pathlib import Path
from unittest import mock

from helpers import TempDirTestCase

from file_organizer.safety import check_destination, check_folder


class FolderSafetyTests(TempDirTestCase):
    def test_missing_or_not_a_folder(self):
        self.assertIsNotNone(check_folder(None, recursive=False)[0])
        self.assertIsNotNone(check_folder(self.root / "nope", recursive=False)[0])
        self.assertIsNotNone(check_folder(self.make("file.txt"), recursive=False)[0])

    def test_normal_folder(self):
        self.assertEqual(check_folder(self.root, recursive=False), (None, []))
        error, warnings = check_folder(self.root, recursive=True)
        self.assertIsNone(error)
        self.assertEqual(len(warnings), 1)

    def test_system_drive_is_refused(self):
        root = Path(os.environ.get("SystemDrive", "C:") + "\\") if sys.platform == "win32" else Path("/")
        self.assertIsNotNone(check_folder(root, recursive=False)[0])
        self.assertIsNotNone(check_destination(root))

    def test_system_folders_are_refused(self):
        folder = Path(os.environ["SystemRoot"]) if sys.platform == "win32" else Path("/usr/bin")
        if not folder.is_dir():
            self.skipTest("no system folder to test with")
        self.assertIsNotNone(check_folder(folder, recursive=False)[0])
        self.assertIsNotNone(check_destination(folder / "sorted"))

    def test_home_folder(self):
        home = self.tmp / "home"
        home.mkdir()
        with mock.patch.object(Path, "home", return_value=home):
            error, warnings = check_folder(home, recursive=False)
            self.assertIsNone(error)
            self.assertEqual(len(warnings), 1)
            self.assertIsNotNone(check_folder(home, recursive=True)[0])

    def test_project_folder_warning_but_installers_are_fine(self):
        self.make("setup.exe")
        self.assertEqual(check_folder(self.root, recursive=False), (None, []))
        self.make("package.json")
        error, warnings = check_folder(self.root, recursive=False)
        self.assertIsNone(error)
        self.assertIn("package.json", warnings[0])

    def test_destination(self):
        self.assertIsNone(check_destination(self.tmp / "new" / "folder"))
        self.assertIsNotNone(check_destination(self.make("a-file")))
        self.assertIsNotNone(check_destination(None))


if __name__ == "__main__":
    unittest.main()
