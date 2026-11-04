import os
import unittest

from helpers import TempDirTestCase, jpeg_with_exif, tiff_with_date, ts

from file_organizer.planner import OrganizeOptions, build_plan, example_target
from file_organizer.rules import Rules


def targets(plan):
    return {item.rel_source.replace(os.sep, "/"): item.rel_target.replace(os.sep, "/") for item in plan.items}


class PlanTests(TempDirTestCase):
    def plan(self, **options):
        return build_plan(self.root, OrganizeOptions(**options), Rules.default())

    def test_by_type(self):
        self.make("a.jpg")
        self.make("b.PDF")
        self.make("README")
        self.make("螢幕擷取畫面 1.png")
        plan = self.plan()
        self.assertEqual(targets(plan), {
            "a.jpg": "圖片/a.jpg", "b.PDF": "文件/b.PDF", "README": "其他/README",
            "螢幕擷取畫面 1.png": "圖片/截圖/螢幕擷取畫面 1.png",
        })
        self.assertEqual(plan.destination, self.root)
        self.assertEqual(dict((c, n) for c, n, _ in plan.summary()), {"圖片": 1, "文件": 1, "其他": 1, "圖片/截圖": 1})

    def test_files_already_in_place_are_not_moved(self):
        self.make("圖片/a.jpg")
        self.make("文件/a.jpg")  # wrong place
        plan = self.plan(recursive=True)
        self.assertEqual(plan.already_in_place, 1)
        self.assertEqual(targets(plan), {"文件/a.jpg": "圖片/a (1).jpg"})

    def test_name_conflicts_are_renamed_or_skipped(self):
        self.make("圖片/a.jpg", b"old")
        self.make("a.jpg", b"new")
        self.make("sub/a.jpg", b"other")
        plan = self.plan(recursive=True)
        self.assertEqual(targets(plan), {"a.jpg": "圖片/a (1).jpg", "sub/a.jpg": "圖片/a (2).jpg"})
        self.assertTrue(all(item.renamed for item in plan.items))
        plan = self.plan(recursive=True, conflict="skip")
        self.assertEqual(plan.items, [])
        self.assertEqual(plan.conflicts_skipped, 2)

    def test_case_insensitive_conflicts(self):
        self.make("A.JPG")
        self.make("sub/a.jpg")
        plan = self.plan(recursive=True)
        self.assertEqual(sorted(targets(plan).values()), ["圖片/A.JPG", "圖片/a (1).jpg"])

    def test_by_date_uses_capture_date_then_modified_time(self):
        self.make("photo.jpg", jpeg_with_exif(tiff_with_date("2019:05:06 07:08:09")), mtime=ts("2024-01-15 10:00"))
        self.make("doc.pdf", mtime=ts("2023-12-31 23:00"))
        plan = self.plan(mode="date")
        self.assertEqual(targets(plan), {"doc.pdf": "2023/2023-12/doc.pdf", "photo.jpg": "2019/2019-05/photo.jpg"})
        notes = {item.target.name: item.date_text for item in plan.items}
        self.assertEqual(notes["photo.jpg"], "2019-05-06（拍攝日期）")
        self.assertEqual(notes["doc.pdf"], "2023-12-31（修改日期）")
        plan = self.plan(mode="date", use_capture_date=False, date_level="year")
        self.assertEqual(targets(plan), {"doc.pdf": "2023/doc.pdf", "photo.jpg": "2024/photo.jpg"})

    def test_type_and_date(self):
        self.make("photo.jpg", jpeg_with_exif(tiff_with_date("2019:05:06 07:08:09")))
        self.assertEqual(targets(self.plan(mode="type_date")), {"photo.jpg": "圖片/2019/2019-05/photo.jpg"})

    def test_by_extension(self):
        self.make("x.PDF")
        self.make("y.pdf")
        self.make("noext")
        self.assertEqual(targets(self.plan(mode="extension")),
                         {"x.PDF": "PDF/x.PDF", "y.pdf": "PDF/y.pdf", "noext": "無副檔名/noext"})

    def test_other_destination(self):
        self.make("a.jpg")
        destination = self.tmp / "sorted"
        plan = self.plan(destination=destination)
        self.assertEqual(plan.items[0].target, destination / "圖片" / "a.jpg")

    def test_destination_inside_source_is_not_rescanned(self):
        self.make("a.jpg")
        self.make("sorted/圖片/b.jpg")
        plan = self.plan(recursive=True, destination=self.root / "sorted")
        self.assertEqual(targets(plan), {"a.jpg": "圖片/a.jpg"})

    def test_selection_and_summary(self):
        self.make("a.jpg", b"1234")
        self.make("b.jpg", b"12")
        self.make("c.pdf", b"1")
        plan = self.plan()
        plan.items[0].include = False
        self.assertEqual(len(plan.selected()), 2)
        self.assertEqual(plan.selected_size(), 3)
        self.assertEqual(plan.summary(), [("圖片", 1, 2), ("文件", 1, 1)])

    def test_example(self):
        self.assertEqual(example_target("type", "month"), "圖片/IMG_0001.jpg")
        self.assertEqual(example_target("date", "year"), "2024/IMG_0001.jpg")
        self.assertEqual(example_target("type_date", "month"), "圖片/2024/2024-03/IMG_0001.jpg")
        self.assertEqual(example_target("extension", "month"), "JPG/IMG_0001.jpg")


if __name__ == "__main__":
    unittest.main()
