"""Find files with exactly the same content.

Files are first grouped by size, then by a quick hash of their first and
last 64 KB, and finally by a SHA-256 hash of the whole file, so only real
duplicates are reported. Duplicates are never deleted: they are moved into a
「重複檔案」 folder (keeping their sub-folder path) and can be restored with undo.
"""

from __future__ import annotations

import hashlib
import os
from collections import OrderedDict, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from .executor import Operation, RunResult, run_operations
from .scanner import FileEntry, Progress, ScanResult, scan
from .utils import check_cancel

DUPLICATES_FOLDER = "重複檔案"
CHUNK = 64 * 1024
KEEP_STRATEGIES = OrderedDict([
    ("shortest", "保留檔名最短的（通常是原檔）"),
    ("oldest", "保留修改日期最舊的"),
    ("newest", "保留修改日期最新的"),
])


@dataclass
class DuplicateGroup:
    size: int
    files: List[FileEntry]
    keep: int = 0                               # index of the file that stays
    remove: List[int] = field(default_factory=list)  # indexes of files to move away

    @property
    def wasted(self) -> int:
        return self.size * (len(self.files) - 1)


@dataclass
class DuplicateReport:
    root: Path
    groups: List[DuplicateGroup]
    scan: ScanResult
    skipped_cloud: int = 0
    unreadable: List[Tuple[str, str]] = field(default_factory=list)

    @property
    def wasted(self) -> int:
        return sum(g.wasted for g in self.groups)


def _hash_file(path: Path, cancel=None, quick: bool = False, size: int = 0) -> str:
    """SHA-256 of the file; with *quick*, only the first and last 64 KB of
    big files are read (small files are always read completely)."""
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        if quick and size > 2 * CHUNK:
            digest.update(fh.read(CHUNK))
            fh.seek(-CHUNK, os.SEEK_END)
            digest.update(fh.read(CHUNK))
        else:
            while True:
                check_cancel(cancel)
                block = fh.read(1024 * 1024)
                if not block:
                    break
                digest.update(block)
    return digest.hexdigest()


def choose_keep(files: Sequence[FileEntry], strategy: str) -> int:
    indexes = range(len(files))
    if strategy == "oldest":
        return min(indexes, key=lambda i: (files[i].mtime, len(files[i].name), files[i].rel))
    if strategy == "newest":
        return max(indexes, key=lambda i: (files[i].mtime, -len(files[i].name)))
    return min(indexes, key=lambda i: (len(files[i].name), len(files[i].rel), files[i].mtime, files[i].rel))


def apply_strategy(groups: Sequence[DuplicateGroup], strategy: str) -> None:
    for group in groups:
        group.keep = choose_keep(group.files, strategy)
        group.remove = [i for i in range(len(group.files)) if i != group.keep]


def find_duplicates(root, *, recursive: bool = True, include_hidden: bool = False,
                    min_size: int = 1, strategy: str = "shortest",
                    cancel=None, progress: Progress = None) -> DuplicateReport:
    root = Path(root)
    scanned = scan(root, recursive=recursive, include_hidden=include_hidden,
                   exclude=[root / DUPLICATES_FOLDER], cancel=cancel, progress=progress)
    report = DuplicateReport(root=root, groups=[], scan=scanned)

    by_size: Dict[int, List[FileEntry]] = defaultdict(list)
    for entry in scanned.files:
        if entry.size < max(1, min_size):
            continue
        if entry.cloud_only:  # reading it would download it from the cloud
            report.skipped_cloud += 1
            continue
        by_size[entry.size].append(entry)
    candidates = [group for group in by_size.values() if len(group) > 1]

    def split(groups: List[List[FileEntry]], quick: bool, label: str) -> List[List[FileEntry]]:
        total = sum(len(g) for g in groups)
        done = 0
        result: List[List[FileEntry]] = []
        for group in groups:
            buckets: Dict[str, List[FileEntry]] = defaultdict(list)
            for entry in group:
                check_cancel(cancel)
                done += 1
                if progress and (done % 20 == 0 or done == total):
                    progress(done, total, label)
                try:
                    buckets[_hash_file(entry.path, cancel, quick=quick, size=entry.size)].append(entry)
                except OSError as exc:
                    report.unreadable.append((str(entry.path), exc.strerror or str(exc)))
            result.extend(b for b in buckets.values() if len(b) > 1)
        return result

    small = [g for g in candidates if g[0].size <= 2 * CHUNK]  # the quick hash reads them fully
    large = [g for g in candidates if g[0].size > 2 * CHUNK]
    confirmed = split(small, quick=True, label="比對檔案內容…")
    confirmed += split(split(large, quick=True, label="快速比對…"), quick=False, label="完整比對檔案內容…")

    for files in confirmed:
        files.sort(key=lambda e: e.rel.casefold())
        report.groups.append(DuplicateGroup(size=files[0].size, files=files))
    report.groups.sort(key=lambda g: (-g.wasted, g.files[0].rel.casefold()))
    apply_strategy(report.groups, strategy)
    return report


def move_duplicates(report: DuplicateReport, cancel=None, progress: Progress = None,
                    destination: Optional[Path] = None) -> RunResult:
    """Move every file marked for removal into the 「重複檔案」 folder."""
    target_root = Path(destination) if destination else report.root / DUPLICATES_FOLDER
    operations = []
    for group in report.groups:
        remove = sorted({i for i in group.remove if 0 <= i < len(group.files)})
        if not remove or len(remove) >= len(group.files):
            continue  # always keep at least one copy
        for index in remove:
            entry = group.files[index]
            operations.append(Operation(entry.path, target_root / entry.rel))
    return run_operations(operations, kind="duplicates", title="移走重複檔案",
                          source=report.root, operation="move", conflict="rename",
                          cancel=cancel, progress=progress)
