import os
import unittest

from helpers import TempDirTestCase, ts

from file_organizer.duplicates import DUPLICATES_FOLDER, apply_strategy, find_duplicates, move_duplicates
from file_organizer.executor import undo


def rels(group):
    return [f.rel.replace(os.sep, "/") for f in group.files]


class DuplicateTests(TempDirTestCase):
    def test_finds_only_identical_content(self):
        self.make("a.jpg", b"same")
        self.make("sub/a copy.jpg", b"same")
        self.make("b.jpg", b"diff")  # same size, different content
        self.make("empty1.txt", b"")
        self.make("empty2.txt", b"")
        report = find_duplicates(self.root)
        self.assertEqual([rels(g) for g in report.groups], [["a.jpg", "sub/a copy.jpg"]])
        self.assertEqual(report.wasted, 4)

    def test_large_and_medium_files_are_fully_compared(self):
        big = os.urandom(300 * 1024)
        changed_middle = big[:150 * 1024] + bytes([big[150 * 1024] ^ 1]) + big[150 * 1024 + 1:]
        medium = os.urandom(100 * 1024)
        changed_tail = medium[:-10] + b"0123456789"  # differs after the first 64 KB only
        self.make("big1.bin", big)
        self.make("big2.bin", big)
        self.make("big3.bin", changed_middle)
        self.make("mid1.bin", medium)
        self.make("mid2.bin", changed_tail)
        report = find_duplicates(self.root)
        self.assertEqual([rels(g) for g in report.groups], [["big1.bin", "big2.bin"]])

    def test_min_size_and_recursion(self):
        self.make("s1.txt", b"ab")
        self.make("s2.txt", b"ab")
        self.make("sub/s3.txt", b"ab")
        self.assertEqual(find_duplicates(self.root, min_size=3).groups, [])
        self.assertEqual([rels(g) for g in find_duplicates(self.root, recursive=False).groups], [["s1.txt", "s2.txt"]])

    def test_keep_strategies(self):
        self.make("photo (1).jpg", b"x", mtime=ts("2024-01-01 00:00"))
        self.make("photo.jpg", b"x", mtime=ts("2024-02-01 00:00"))
        self.make("z/IMG.jpg", b"x", mtime=ts("2023-01-01 00:00"))
        report = find_duplicates(self.root)
        group = report.groups[0]
        kept = lambda: group.files[group.keep].rel.replace(os.sep, "/")
        self.assertEqual(kept(), "z/IMG.jpg")  # shortest name
        apply_strategy(report.groups, "oldest")
        self.assertEqual(kept(), "z/IMG.jpg")
        apply_strategy(report.groups, "newest")
        self.assertEqual(kept(), "photo.jpg")
        self.assertEqual(sorted(group.remove), sorted(i for i in range(3) if i != group.keep))

    def test_move_and_undo(self):
        self.make("a.jpg", b"same")
        self.make("sub/b.jpg", b"same")
        self.make("sub/c.jpg", b"same")
        report = find_duplicates(self.root)
        result = move_duplicates(report)
        self.assertEqual(result.done, 2)
        self.assertEqual(self.files(), {"a.jpg", f"{DUPLICATES_FOLDER}/sub/b.jpg", f"{DUPLICATES_FOLDER}/sub/c.jpg"})
        self.assertEqual(find_duplicates(self.root).groups, [])  # the 重複檔案 folder is not scanned again
        undo(result.journal)
        self.assertEqual(self.files(), {"a.jpg", "sub/b.jpg", "sub/c.jpg"})

    def test_a_group_is_never_emptied(self):
        self.make("a.txt", b"same")
        self.make("b.txt", b"same")
        report = find_duplicates(self.root)
        report.groups[0].remove = [0, 1]
        result = move_duplicates(report)
        self.assertEqual(result.done, 0)
        self.assertEqual(self.files(), {"a.txt", "b.txt"})


if __name__ == "__main__":
    unittest.main()
