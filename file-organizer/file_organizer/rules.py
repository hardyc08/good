"""Classification rules: which folder each file belongs in.

Two kinds of rules are used, in this order:
1. keyword rules  – the file name contains a word (e.g. "螢幕擷取畫面" → 圖片/截圖)
2. extension rules – the file extension (e.g. .jpg → 圖片)
Anything left over goes to the 「其他」 folder.
The rules are stored as JSON next to the history and can be edited in the app.
"""

from __future__ import annotations

import json
import os
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, Union

from .utils import app_data_dir, sanitize_folder

OTHER_FOLDER = "其他"

DEFAULT_CATEGORIES: List[Tuple[str, str]] = [
    ("圖片", "jpg jpeg jpe jfif png gif bmp tif tiff webp heic heif avif svg ico "
             "raw dng cr2 cr3 nef nrw arw srw orf rw2 pef raf"),
    ("影片", "mp4 m4v mov avi mkv wmv flv webm mpg mpeg 3gp 3g2 ts mts m2ts vob rm rmvb"),
    ("音樂", "mp3 wav flac aac ogg oga wma m4a aiff aif ape opus mid midi amr"),
    ("文件", "pdf doc docx odt rtf txt md pages epub mobi azw azw3 djvu wps hwp tex "
             "htm html mht mhtml"),
    ("試算表", "xls xlsx xlsm ods csv tsv numbers et"),
    ("簡報", "ppt pptx pps ppsx odp key dps"),
    ("設計檔", "psd ai eps indd sketch fig xd cdr afdesign afphoto"),
    ("壓縮檔", "zip rar 7z tar gz tgz bz2 xz zst cab iso"),
    ("安裝程式", "exe msi dmg pkg apk deb rpm appimage msix appx"),
    ("程式碼", "py js css java c cpp h hpp cs go rs php rb swift kt sh bat ps1 "
               "json xml yml yaml sql ipynb"),
    ("字型", "ttf otf woff woff2 fon"),
    ("捷徑", "lnk url webloc desktop"),
]

DEFAULT_KEYWORD_RULES: List[Tuple[str, List[str], str]] = [
    (
        "圖片/截圖",
        ["螢幕擷取畫面", "螢幕截圖", "螢幕快照", "截圖", "截图", "屏幕截图",
         "screenshot", "screen shot", "スクリーンショット"],
        "png jpg jpeg gif bmp webp heic",
    ),
]

_EXT_SPLIT = re.compile(r"[\s,，;；、]+")
_KEYWORD_SPLIT = re.compile(r"[,，;；、\n]+")


def normalize_extensions(values: Union[str, Iterable[str]]) -> List[str]:
    """'.JPG, png  *.jpeg' -> ['jpg', 'png', 'jpeg'] (lower case, no duplicates)."""
    if isinstance(values, str):
        values = _EXT_SPLIT.split(values)
    result: List[str] = []
    for value in values:
        ext = str(value).strip().lstrip("*").lstrip(".").strip().lower()
        if ext and ext not in result:
            result.append(ext)
    return result


def normalize_keywords(values: Union[str, Iterable[str]]) -> List[str]:
    """Split on commas (not spaces, so "screen shot" stays one keyword)."""
    if isinstance(values, str):
        values = _KEYWORD_SPLIT.split(values)
    result: List[str] = []
    for value in values:
        keyword = str(value).strip()
        if keyword and keyword not in result:
            result.append(keyword)
    return result


def file_extension(name: str) -> str:
    """'Photo.JPG' -> 'jpg'; names without an extension give ''."""
    return os.path.splitext(name)[1][1:].lower()


def _fold(text: str) -> str:
    return unicodedata.normalize("NFC", text).casefold()


@dataclass
class Category:
    name: str
    extensions: List[str] = field(default_factory=list)


@dataclass
class KeywordRule:
    folder: str
    keywords: List[str] = field(default_factory=list)
    extensions: List[str] = field(default_factory=list)  # empty = any file type


class Rules:
    def __init__(self, categories: List[Category], keyword_rules: List[KeywordRule],
                 other_folder: str = OTHER_FOLDER):
        self.categories = categories
        self.keyword_rules = keyword_rules
        self.other_folder = sanitize_folder(other_folder) or OTHER_FOLDER
        self._by_extension: Dict[str, str] = {}
        for category in categories:
            for ext in category.extensions:
                self._by_extension.setdefault(ext, category.name)

    @classmethod
    def default(cls) -> "Rules":
        categories = [Category(name, normalize_extensions(exts)) for name, exts in DEFAULT_CATEGORIES]
        keyword_rules = [KeywordRule(folder, list(words), normalize_extensions(exts))
                         for folder, words, exts in DEFAULT_KEYWORD_RULES]
        return cls(categories, keyword_rules)

    def classify(self, filename: str) -> Tuple[str, str]:
        """Return (folder, reason) for a file name."""
        ext = file_extension(filename)
        stem = _fold(os.path.splitext(filename)[0])
        for rule in self.keyword_rules:
            if rule.extensions and ext not in rule.extensions:
                continue
            for keyword in rule.keywords:
                if keyword and _fold(keyword) in stem:
                    return rule.folder, f"檔名包含「{keyword}」"
        folder = self._by_extension.get(ext)
        if folder:
            return folder, f"副檔名 .{ext}"
        if ext:
            return self.other_folder, f"沒有 .{ext} 的分類規則"
        return self.other_folder, "沒有副檔名"

    def category_of_extension(self, ext: str) -> Optional[str]:
        return self._by_extension.get(ext.lower())

    def to_dict(self) -> dict:
        return {
            "version": 1,
            "other_folder": self.other_folder,
            "categories": [{"name": c.name, "extensions": list(c.extensions)} for c in self.categories],
            "keyword_rules": [
                {"folder": r.folder, "keywords": list(r.keywords), "extensions": list(r.extensions)}
                for r in self.keyword_rules
            ],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Rules":
        if not isinstance(data, dict):
            raise ValueError("rules must be a JSON object")
        categories = []
        for item in data.get("categories", []):
            name = sanitize_folder(str(item.get("name", "")))
            if name:
                categories.append(Category(name, normalize_extensions(item.get("extensions", []))))
        keyword_rules = []
        for item in data.get("keyword_rules", []):
            folder = sanitize_folder(str(item.get("folder", "")))
            keywords = normalize_keywords(item.get("keywords", []))
            if folder and keywords:
                keyword_rules.append(KeywordRule(folder, keywords, normalize_extensions(item.get("extensions", []))))
        return cls(categories, keyword_rules, str(data.get("other_folder") or OTHER_FOLDER))

    def copy(self) -> "Rules":
        return Rules.from_dict(self.to_dict())


def rules_path() -> Path:
    return app_data_dir() / "rules.json"


def load_rules(path: Optional[Path] = None) -> Rules:
    """Load the saved rules; fall back to the defaults if missing or broken."""
    path = Path(path) if path else rules_path()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return Rules.from_dict(data)
    except FileNotFoundError:
        return Rules.default()
    except (OSError, ValueError, TypeError, AttributeError):
        return Rules.default()


def save_rules(rules: Rules, path: Optional[Path] = None) -> Path:
    path = Path(path) if path else rules_path()
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(rules.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, path)
    return path
