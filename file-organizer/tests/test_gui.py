"""Drives the real window end to end (skipped when no display is available)."""

import time
import unittest

from helpers import TempDirTestCase

try:
    import tkinter as tk
except ImportError:  # Python built without Tk
    tk = None


class GuiTests(TempDirTestCase):
    def setUp(self):
        super().setUp()
        if tk is None:
            self.skipTest("tkinter is not installed")
        try:
            self.tk_root = tk.Tk()
        except tk.TclError as exc:
            self.skipTest(f"no display: {exc}")
        from file_organizer import gui
        self.app = gui.App(self.tk_root)
        self.dialogs = []
        self.app.ask = lambda title, message, icon="question": self.dialogs.append(title) or True
        self.app.info = lambda title, message: self.dialogs.append(title)
        self.app.error = lambda title, message: self.fail(f"unexpected error dialog: {title}: {message}")
        self.app.open_folder = lambda *args, **kwargs: None

    def tearDown(self):
        if hasattr(self, "app"):
            self.app.shutdown()
        elif hasattr(self, "tk_root"):
            self.tk_root.destroy()
        super().tearDown()

    def wait(self, timeout=30):
        end = time.time() + timeout
        self.tk_root.update()
        while self.app.busy and time.time() < end:
            self.tk_root.update()
            time.sleep(0.02)
        self.tk_root.update()
        self.assertFalse(self.app.busy, "background task did not finish")

    def test_status_bar_is_fully_visible(self):
        self.tk_root.update()
        button = self.app.cancel_button
        self.assertTrue(button.winfo_ismapped())
        self.assertGreaterEqual(button.winfo_height(), button.winfo_reqheight())
        bottom = button.winfo_rooty() + button.winfo_height()
        self.assertLessEqual(bottom, self.tk_root.winfo_rooty() + self.tk_root.winfo_height())

    def test_preview_exclude_run_and_undo(self):
        self.make("a.jpg")
        self.make("b.pdf")
        self.make("c.mp3")
        tab = self.app.organize_tab
        tab.source_var.set(str(self.root))
        tab.preview()
        self.wait()
        self.assertEqual(len(tab.plan.items), 3)
        self.assertEqual(len(tab.tree.get_children()), 3)
        excluded = next(row for row in tab.tree.get_children() if tab.plan.items[int(row)].target.name == "c.mp3")
        tab._set_include([excluded], False)
        self.assertEqual(tab.tree.set(excluded, "check"), "☐")
        self.assertIn("2 個檔案", tab.summary_var.get())

        tab.execute()
        self.wait()
        self.assertEqual(self.files(), {"圖片/a.jpg", "文件/b.pdf", "c.mp3"})
        self.assertIsNone(tab.plan)
        history = self.app.history_tab
        self.assertEqual(len(history.entries), 1)

        history.tree.selection_set("0")
        history.undo_selected()
        self.wait()
        self.assertEqual(self.files(), {"a.jpg", "b.pdf", "c.mp3"})
        self.assertEqual(history.entries[0].status, "已復原")

    def test_changing_options_invalidates_preview(self):
        self.make("a.jpg")
        tab = self.app.organize_tab
        tab.source_var.set(str(self.root))
        tab.preview()
        self.wait()
        self.assertIsNotNone(tab.plan)
        tab.mode_var.set("date")
        self.assertIsNone(tab.plan)
        self.assertEqual(str(tab.run_button.cget("state")), "disabled")

    def test_cancel_preview(self):
        for i in range(400):
            self.make(f"f{i}.txt")
        tab = self.app.organize_tab
        tab.source_var.set(str(self.root))
        tab.preview()
        self.app.cancel()
        self.wait()
        self.assertTrue(tab.plan is None or len(tab.plan.items) == 400)

    def test_duplicates_tab(self):
        self.make("a.jpg", b"same")
        self.make("sub/b.jpg", b"same")
        tab = self.app.duplicates_tab
        tab.folder_var.set(str(self.root))
        tab.search()
        self.wait()
        self.assertEqual(len(tab.report.groups), 1)
        tab.move()
        self.wait()
        self.assertEqual(self.files(), {"a.jpg", "重複檔案/sub/b.jpg"})

    def test_rules_tab_save(self):
        from file_organizer.rules import Category, load_rules
        tab = self.app.rules_tab
        tab.categories.insert(0, Category("相片", ["jpg"]))
        tab._changed()
        tab.test_var.set("x.jpg")
        self.assertIn("相片", tab.test_result_var.get())
        tab.save()
        self.assertEqual(load_rules().classify("x.jpg")[0], "相片")
        self.assertEqual(self.app.rules.classify("x.jpg")[0], "相片")


if __name__ == "__main__":
    unittest.main()
