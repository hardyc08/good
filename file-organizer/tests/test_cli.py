import contextlib
import io
import unittest

from helpers import TempDirTestCase

from file_organizer.cli import main


class CliTests(TempDirTestCase):
    def run_cli(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main(list(args))
        return code, out.getvalue()

    def test_dry_run_changes_nothing(self):
        self.make("a.jpg")
        self.make("b.pdf")
        code, out = self.run_cli("organize", str(self.root), "--dry-run")
        self.assertEqual(code, 0)
        self.assertIn("圖片", out)
        self.assertIn("只預覽", out)
        self.assertEqual(self.files(), {"a.jpg", "b.pdf"})

    def test_organize_history_undo(self):
        self.make("a.jpg")
        self.make("sub/b.pdf")
        code, out = self.run_cli("organize", str(self.root), "-r", "--yes")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.files(), {"圖片/a.jpg", "文件/b.pdf"})
        code, out = self.run_cli("history")
        self.assertIn("依檔案類型・移動", out)
        code, out = self.run_cli("undo", "--yes")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.files(), {"a.jpg", "sub/b.pdf"})
        code, out = self.run_cli("undo", "--yes")
        self.assertIn("沒有可以復原", out)

    def test_copy_by_date_to_other_folder(self):
        self.make("a.txt", mtime=1_700_000_000)
        target = self.tmp / "sorted"
        code, out = self.run_cli("organize", str(self.root), "--by", "date", "--date-level", "year",
                                 "--copy", "--dest", str(target), "-y")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.files(), {"a.txt"})
        self.assertEqual(len(self.files(target)), 1)

    def test_errors(self):
        code, out = self.run_cli("organize", str(self.root / "missing"), "-y")
        self.assertEqual(code, 2)
        self.assertIn("錯誤", out)
        code, out = self.run_cli("undo", "5", "-y")
        self.assertEqual(code, 2)

    def test_stats_and_duplicates(self):
        self.make("a.jpg", b"same")
        self.make("b.jpg", b"same")
        self.make("c.mp3", b"music")
        code, out = self.run_cli("stats", str(self.root))
        self.assertEqual(code, 0)
        self.assertIn("圖片", out)
        self.assertIn("音樂", out)
        code, out = self.run_cli("duplicates", str(self.root))
        self.assertIn("找到 1 組", out)
        code, out = self.run_cli("duplicates", str(self.root), "--move", "-y")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.files(), {"a.jpg", "重複檔案/b.jpg", "c.mp3"})

    def test_rules(self):
        code, out = self.run_cli("rules", "--reset")
        self.assertEqual(code, 0)
        self.assertIn("圖片/截圖", out)


if __name__ == "__main__":
    unittest.main()
