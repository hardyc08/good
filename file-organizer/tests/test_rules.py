import json
import unittest

from helpers import TempDirTestCase

from file_organizer.rules import (Category, KeywordRule, Rules, load_rules, normalize_extensions,
                                  normalize_keywords, rules_path, save_rules)
from file_organizer.utils import sanitize_folder, split_name, unique_path


class ClassifyTests(unittest.TestCase):
    def setUp(self):
        self.rules = Rules.default()

    def test_by_extension_case_insensitive(self):
        self.assertEqual(self.rules.classify("photo.JPG")[0], "圖片")
        self.assertEqual(self.rules.classify("報告.pdf")[0], "文件")
        self.assertEqual(self.rules.classify("data.xlsx")[0], "試算表")
        self.assertEqual(self.rules.classify("backup.tar.gz")[0], "壓縮檔")

    def test_unknown_and_missing_extension(self):
        self.assertEqual(self.rules.classify("weird.abcxyz"), ("其他", "沒有 .abcxyz 的分類規則"))
        self.assertEqual(self.rules.classify("README"), ("其他", "沒有副檔名"))
        self.assertEqual(self.rules.classify(".bashrc")[0], "其他")

    def test_keyword_rule_wins_but_respects_extensions(self):
        self.assertEqual(self.rules.classify("螢幕擷取畫面 2024-01-01 101010.png")[0], "圖片/截圖")
        self.assertEqual(self.rules.classify("SCREENSHOT_2024.PNG")[0], "圖片/截圖")
        self.assertEqual(self.rules.classify("Screen Shot 2020.jpg")[0], "圖片/截圖")
        # a PDF that mentions screenshots is still a document
        self.assertEqual(self.rules.classify("screenshot教學.pdf")[0], "文件")

    def test_keyword_without_extension_limit(self):
        rules = Rules([Category("文件", ["pdf"])], [KeywordRule("財務/發票", ["發票", "invoice"])])
        self.assertEqual(rules.classify("2024電子發票.pdf"), ("財務/發票", "檔名包含「發票」"))
        self.assertEqual(rules.classify("Invoice-001.png")[0], "財務/發票")
        self.assertEqual(rules.classify("x.pdf")[0], "文件")

    def test_first_category_wins_for_duplicate_extension(self):
        rules = Rules([Category("A", ["txt"]), Category("B", ["txt"])], [])
        self.assertEqual(rules.classify("a.txt")[0], "A")


class NormalizeTests(unittest.TestCase):
    def test_extensions(self):
        self.assertEqual(normalize_extensions(".JPG, png  *.jpeg，jpg、gif"), ["jpg", "png", "jpeg", "gif"])
        self.assertEqual(normalize_extensions(["  .Mp4", "", "mp4"]), ["mp4"])

    def test_keywords_keep_inner_spaces(self):
        self.assertEqual(normalize_keywords("screen shot, 截圖、 截圖 ,"), ["screen shot", "截圖"])

    def test_sanitize_folder(self):
        self.assertEqual(sanitize_folder("../../etc"), "etc")
        self.assertEqual(sanitize_folder("工作/../發票"), "工作/發票")
        self.assertEqual(sanitize_folder("a:b*c?"), "a_b_c_")
        self.assertEqual(sanitize_folder("CON"), "_CON")
        self.assertEqual(sanitize_folder("  資料夾.  "), "資料夾")
        self.assertEqual(sanitize_folder("a\\b"), "a/b")
        self.assertEqual(sanitize_folder(" / . / "), "")


class UniqueNameTests(TempDirTestCase):
    def test_numbering(self):
        self.make("a.jpg")
        self.assertEqual(unique_path(self.root / "a.jpg").name, "a (1).jpg")
        self.make("a (1).jpg")
        self.assertEqual(unique_path(self.root / "a.jpg").name, "a (2).jpg")
        self.assertEqual(unique_path(self.root / "a (1).jpg").name, "a (2).jpg")
        self.make("Report (2023).pdf")
        self.assertEqual(unique_path(self.root / "Report (2023).pdf").name, "Report (2023) (1).pdf")

    def test_reserved_names_and_double_suffix(self):
        taken = set()
        from file_organizer.utils import path_key
        taken.add(path_key(self.root / "b.tar.gz"))
        self.assertEqual(unique_path(self.root / "b.tar.gz", taken).name, "b (1).tar.gz")
        self.assertEqual(split_name("x.tar.gz"), ("x", ".tar.gz"))
        self.assertEqual(split_name(".bashrc"), (".bashrc", ""))


class PersistenceTests(TempDirTestCase):
    def test_roundtrip(self):
        rules = Rules([Category("相片", ["jpg"])], [KeywordRule("工作", ["報告"], ["docx"])], "雜項")
        save_rules(rules)
        loaded = load_rules()
        self.assertEqual(loaded.to_dict(), rules.to_dict())
        self.assertEqual(loaded.classify("x.jpg")[0], "相片")
        self.assertEqual(loaded.classify("月報告.docx")[0], "工作")
        self.assertEqual(loaded.classify("x.zip")[0], "雜項")

    def test_missing_or_broken_file_gives_defaults(self):
        self.assertEqual(load_rules().to_dict(), Rules.default().to_dict())
        rules_path().write_text("{ not json", encoding="utf-8")
        self.assertEqual(load_rules().to_dict(), Rules.default().to_dict())
        rules_path().write_text(json.dumps([1, 2, 3]), encoding="utf-8")
        self.assertEqual(load_rules().to_dict(), Rules.default().to_dict())

    def test_invalid_entries_are_dropped_and_folders_sanitized(self):
        data = {"categories": [{"name": "..", "extensions": ["a"]}, {"name": "../ok", "extensions": [".B"]}],
                "keyword_rules": [{"folder": "x", "keywords": []}, {"folder": "y/z", "keywords": "k1, k2"}]}
        rules = Rules.from_dict(data)
        self.assertEqual([(c.name, c.extensions) for c in rules.categories], [("ok", ["b"])])
        self.assertEqual([(r.folder, r.keywords) for r in rules.keyword_rules], [("y/z", ["k1", "k2"])])


if __name__ == "__main__":
    unittest.main()
