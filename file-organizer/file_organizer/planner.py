"""Turn a folder scan into a list of planned moves — the 「預覽」.

Nothing on disk is changed here.
"""

from __future__ import annotations

import os
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Set, Tuple

from . import metadata
from .rules import OTHER_FOLDER, Rules, file_extension
from .scanner import FileEntry, Progress, ScanResult, scan
from .utils import check_cancel, is_within, path_key, safe_datetime, sanitize_folder, unique_path

MODES = OrderedDict([
    ("type", "依檔案類型"),
    ("date", "依日期"),
    ("type_date", "依類型＋日期"),
    ("extension", "依副檔名"),
])
DATE_LEVELS = OrderedDict([("month", "年／月"), ("year", "年")])
NO_EXTENSION_FOLDER = "無副檔名"
UNKNOWN_DATE_FOLDER = "日期不明"


@dataclass
class OrganizeOptions:
    mode: str = "type"              # one of MODES
    date_level: str = "month"       # one of DATE_LEVELS
    recursive: bool = False
    include_hidden: bool = False
    use_capture_date: bool = True   # EXIF / video date instead of modified time
    operation: str = "move"         # "move" or "copy"
    conflict: str = "rename"        # "rename" or "skip"
    remove_empty_dirs: bool = True  # only matters together with recursive
    destination: Optional[Path] = None  # None = organize inside the folder itself


@dataclass
class PlanItem:
    source: Path
    target: Path
    rel_source: str
    folder: str          # destination folder relative to the destination root
    category: str        # rule category (used for the summary)
    reason: str          # why it went there
    size: int
    mtime: float
    date_text: str = ""
    renamed: bool = False
    include: bool = True

    @property
    def rel_target(self) -> str:
        parts = self.folder.split("/") if self.folder else []
        return os.path.join(*parts, self.target.name) if parts else self.target.name


@dataclass
class Plan:
    source: Path
    destination: Path
    options: OrganizeOptions
    items: List[PlanItem]
    already_in_place: int
    conflicts_skipped: int
    scan: ScanResult

    def selected(self) -> List[PlanItem]:
        return [item for item in self.items if item.include]

    def selected_size(self) -> int:
        return sum(item.size for item in self.items if item.include)

    def summary(self) -> List[Tuple[str, int, int]]:
        """[(category, file count, total bytes)] of the selected items, largest first."""
        totals: "OrderedDict[str, List[int]]" = OrderedDict()
        for item in self.items:
            if item.include:
                entry = totals.setdefault(item.category, [0, 0])
                entry[0] += 1
                entry[1] += item.size
        return sorted(((k, v[0], v[1]) for k, v in totals.items()), key=lambda r: (-r[1], r[0]))


def date_folder(moment: Optional[datetime], level: str) -> str:
    if moment is None:
        return UNKNOWN_DATE_FOLDER
    if level == "year":
        return f"{moment.year}"
    return f"{moment.year}/{moment.year}-{moment.month:02d}"


def example_target(mode: str, level: str, name: str = "IMG_0001.jpg") -> str:
    """Show the user what a path will look like, e.g. '圖片/2024/2024-03/IMG_0001.jpg'."""
    sample = datetime(2024, 3, 15)
    folder = {
        "type": "圖片",
        "date": date_folder(sample, level),
        "type_date": "圖片/" + date_folder(sample, level),
        "extension": file_extension(name).upper() or NO_EXTENSION_FOLDER,
    }.get(mode, "")
    return f"{folder}/{name}" if folder else name


def file_date(entry: FileEntry, use_capture_date: bool) -> Tuple[Optional[datetime], str]:
    ext = file_extension(entry.name)
    if use_capture_date and not entry.cloud_only and ext in metadata.SUPPORTED_EXTS:
        taken = metadata.capture_date(entry.path, ext)
        if taken:
            return taken, "拍攝日期"
    return safe_datetime(entry.mtime), "修改日期"


def folder_for(options: OrganizeOptions, category: str, ext: str,
               moment: Optional[datetime], rules: Rules) -> str:
    if options.mode == "type":
        label = category
    elif options.mode == "date":
        label = date_folder(moment, options.date_level)
    elif options.mode == "type_date":
        label = f"{category}/{date_folder(moment, options.date_level)}"
    elif options.mode == "extension":
        label = ext.upper() if ext else NO_EXTENSION_FOLDER
    else:
        raise ValueError(f"unknown mode: {options.mode}")
    return sanitize_folder(label) or rules.other_folder or OTHER_FOLDER


def build_plan(source, options: OrganizeOptions, rules: Rules,
               cancel=None, progress: Progress = None) -> Plan:
    source = Path(source)
    destination = Path(options.destination) if options.destination else source
    exclude = []
    if path_key(destination) != path_key(source) and is_within(destination, source):
        exclude.append(destination)  # never re-organize the output folder itself
    scanned = scan(source, recursive=options.recursive, include_hidden=options.include_hidden,
                   exclude=exclude, cancel=cancel, progress=progress)

    needs_date = options.mode in ("date", "type_date")
    step = "讀取拍攝日期…" if needs_date and options.use_capture_date else "分析檔案…"
    items: List[PlanItem] = []
    taken: Set[str] = set()
    in_place = 0
    conflicts = 0
    total = len(scanned.files)
    for index, entry in enumerate(scanned.files, 1):
        check_cancel(cancel)
        if progress and (index % 50 == 0 or index == total):
            progress(index, total, step)
        category, reason = rules.classify(entry.name)
        ext = file_extension(entry.name)
        moment, date_text = None, ""
        if needs_date:
            moment, origin = file_date(entry, options.use_capture_date)
            date_text = f"{moment:%Y-%m-%d}（{origin}）" if moment else "日期不明"
        folder = folder_for(options, category, ext, moment, rules)
        target = destination.joinpath(*folder.split("/"), entry.name)
        if path_key(target) == path_key(entry.path):
            in_place += 1
            continue
        renamed = False
        if os.path.lexists(target) or path_key(target) in taken:
            if options.conflict == "skip":
                conflicts += 1
                continue
            target = unique_path(target, taken)
            renamed = True
        taken.add(path_key(target))
        items.append(PlanItem(
            source=entry.path, target=target, rel_source=entry.rel, folder=folder,
            category=category, reason=reason, size=entry.size, mtime=entry.mtime,
            date_text=date_text, renamed=renamed,
        ))
    return Plan(source=source, destination=destination, options=options, items=items,
                already_in_place=in_place, conflicts_skipped=conflicts, scan=scanned)
