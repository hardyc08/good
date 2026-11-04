import errno
import json
import os
import threading
import unittest
from unittest import mock

from helpers import TempDirTestCase

from file_organizer import executor
from file_organizer.executor import Operation, list_history, read_journal, run_operations, undo
from file_organizer.planner import OrganizeOptions, build_plan
from file_organizer.rules import Rules


class RunAndUndoTests(TempDirTestCase):
    def organize(self, **options):
        plan = build_plan(self.root, OrganizeOptions(**options), Rules.default())
        cleanup = self.root if options.get("recursive") and options.get("remove_empty_dirs", True) else None
        return run_operations([Operation(i.source, i.target) for i in plan.items], kind="organize", title="測試",
                              source=self.root, operation=options.get("operation", "move"), cleanup_root=cleanup)

    def test_move_and_undo_restores_everything(self):
        self.make("a.jpg", b"A", mtime=1_500_000_000)
        self.make("old/deeper/b.pdf", b"B")
        self.make("old/c.txt", b"C")
        self.make("keep/empty-dir-marker.txt")  # becomes empty only if moved
        (self.root / "pre-existing-empty").mkdir()
        before_files, before_dirs = self.files(), self.dirs()

        result = self.organize(recursive=True)
        self.assertEqual((result.done, result.errors), (4, []))
        self.assertEqual(self.files(), {"圖片/a.jpg", "文件/b.pdf", "文件/c.txt", "文件/empty-dir-marker.txt"})
        self.assertNotIn("old", self.dirs())  # emptied folders are removed …
        self.assertIn("pre-existing-empty", self.dirs())  # … folders that were already empty are not
        self.assertEqual(int(os.path.getmtime(self.root / "圖片" / "a.jpg")), 1_500_000_000)

        outcome = undo(result.journal)
        self.assertEqual((outcome.restored, outcome.problems), (4, []))
        self.assertEqual(self.files(), before_files)
        self.assertEqual(self.dirs(), before_dirs)  # created folders removed, removed folders back
        self.assertEqual((self.root / "old" / "deeper" / "b.pdf").read_bytes(), b"B")
        with self.assertRaises(ValueError):
            undo(result.journal)

    def test_copy_and_undo(self):
        self.make("a.jpg", b"A")
        self.make("b.jpg", b"B")
        result = self.organize(operation="copy")
        self.assertEqual(self.files(), {"a.jpg", "b.jpg", "圖片/a.jpg", "圖片/b.jpg"})
        (self.root / "圖片" / "b.jpg").write_bytes(b"edited by the user")
        outcome = undo(result.journal)
        self.assertEqual(outcome.restored, 1)
        self.assertEqual(len(outcome.problems), 1)  # the edited copy is kept
        self.assertEqual(self.files(), {"a.jpg", "b.jpg", "圖片/b.jpg"})

    def test_never_overwrites_files_that_appear_later(self):
        source = self.make("a.jpg", b"new")
        target = self.root / "圖片" / "a.jpg"
        ops = [Operation(source, target)]
        self.make("圖片/a.jpg", b"existing")
        result = run_operations(ops, kind="organize", title="t", source=self.root, conflict="skip")
        self.assertEqual((result.done, len(result.skipped)), (0, 1))
        self.assertEqual(target.read_bytes(), b"existing")
        result = run_operations(ops, kind="organize", title="t", source=self.root, conflict="rename")
        self.assertEqual((result.done, result.renamed), (1, 1))
        self.assertEqual(target.read_bytes(), b"existing")
        self.assertEqual((self.root / "圖片" / "a (1).jpg").read_bytes(), b"new")

    def test_missing_source_is_skipped(self):
        result = run_operations([Operation(self.root / "gone.txt", self.root / "x" / "gone.txt")],
                                kind="organize", title="t", source=self.root)
        self.assertEqual((result.done, len(result.skipped)), (0, 1))
        self.assertFalse((self.root / "x").exists())

    def test_undo_when_original_name_is_taken_again(self):
        self.make("a.jpg", b"original")
        result = self.organize()
        self.make("a.jpg", b"a new file with the same name")
        outcome = undo(result.journal)
        self.assertEqual(outcome.restored, 1)
        self.assertEqual(len(outcome.renamed), 1)
        self.assertEqual((self.root / "a (1).jpg").read_bytes(), b"original")
        self.assertEqual((self.root / "a.jpg").read_bytes(), b"a new file with the same name")

    def test_undo_reports_files_deleted_meanwhile(self):
        self.make("a.jpg")
        self.make("b.jpg")
        result = self.organize()
        (self.root / "圖片" / "b.jpg").unlink()
        outcome = undo(result.journal)
        self.assertEqual((outcome.restored, len(outcome.problems), outcome.retry_later), (1, 1, 0))
        self.assertEqual(self.files(), {"a.jpg"})

    def test_failed_undo_can_be_retried(self):
        self.make("a.jpg")
        self.make("b.jpg")
        result = self.organize()
        real_move = executor._move_file

        def flaky(src, dst):
            if src.name == "b.jpg":
                raise PermissionError(errno.EACCES, "in use")
            return real_move(src, dst)

        with mock.patch.object(executor, "_move_file", flaky):
            outcome = undo(result.journal)
        self.assertEqual((outcome.restored, outcome.retry_later), (1, 1))
        self.assertEqual(list_history()[0].undo_state, "partial")
        self.assertTrue(list_history()[0].can_undo)
        outcome = undo(result.journal)
        self.assertEqual((outcome.restored, outcome.problems), (1, []))
        self.assertEqual(self.files(), {"a.jpg", "b.jpg"})
        self.assertEqual(list_history()[0].status, "已復原")

    def test_cancel_keeps_a_usable_journal(self):
        for i in range(30):
            self.make(f"f{i:02}.txt")
        plan = build_plan(self.root, OrganizeOptions(), Rules.default())
        cancel = threading.Event()

        def progress(done, total, _text):
            if done >= 10:
                cancel.set()

        result = run_operations([Operation(i.source, i.target) for i in plan.items], kind="organize", title="t",
                                source=self.root, cancel=cancel, progress=progress)
        self.assertTrue(result.cancelled)
        self.assertTrue(0 < result.done < 30)
        entry = list_history()[0]
        self.assertTrue(entry.cancelled and entry.can_undo)
        undo(result.journal)
        self.assertEqual(len(self.files()), 30)
        self.assertEqual(self.dirs(), set())

    def test_interrupted_journal_without_footer_can_be_undone(self):
        self.make("a.jpg")
        result = self.organize()
        lines = result.journal.read_text(encoding="utf-8").splitlines()
        result.journal.write_text("\n".join(lines[:-1]) + "\n{\"type\": \"mo", encoding="utf-8")  # crash mid-write
        entry = list_history()[0]
        self.assertFalse(entry.finished)
        self.assertEqual(entry.status, "中途停止（可復原）")
        undo(result.journal)
        self.assertEqual(self.files(), {"a.jpg"})

    def test_cross_drive_move_falls_back_to_copy(self):
        source = self.make("a.jpg", b"data", mtime=1_400_000_000)
        target = self.root / "圖片" / "a.jpg"
        real_rename = os.rename

        def rename(src, dst):
            raise OSError(errno.EXDEV, "Invalid cross-device link")

        with mock.patch.object(executor.os, "rename", rename):
            result = run_operations([Operation(source, target)], kind="organize", title="t", source=self.root)
        self.assertEqual((result.done, result.errors), (1, []))
        self.assertFalse(source.exists())
        self.assertEqual(target.read_bytes(), b"data")
        self.assertEqual(int(os.path.getmtime(target)), 1_400_000_000)
        self.assertIs(os.rename, real_rename)

    def test_journal_contents_and_history(self):
        self.make("a.jpg")
        result = self.organize()
        kinds = [e["type"] for e in read_journal(result.journal)]
        self.assertEqual(kinds, ["header", "mkdir", "move", "footer"])
        json.loads(result.journal.read_text(encoding="utf-8").splitlines()[0])
        history = list_history()
        self.assertEqual(len(history), 1)
        self.assertEqual((history[0].title, history[0].count, history[0].status), ("測試", 1, "已完成"))
        self.make("b.pdf")
        self.organize()
        self.assertEqual(len(list_history()), 2)
        self.assertEqual(list_history()[0].path.name > list_history()[1].path.name, True)


if __name__ == "__main__":
    unittest.main()
