"""Walk a folder and collect the files that are safe to organize.

Never touched:
* symbolic links / junctions
* hidden and system files (unless asked), desktop.ini, Thumbs.db, .DS_Store …
* downloads that are still in progress (.crdownload, .part …) and Office lock files
* sub-folders that look like a program or a software project (they contain
  .git, package.json, .exe/.dll …) and macOS packages such as *.app, because
  moving the files inside would break them
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, List, Optional, Tuple

from .utils import check_cancel, path_key

JUNK_FILES = {
    "desktop.ini", "thumbs.db", "ehthumbs.db", "ehthumbs_vista.db", ".ds_store",
    "icon\r", ".localized", ".directory",
}
PARTIAL_SUFFIXES = (
    ".crdownload", ".part", ".partial", ".download", ".opdownload", ".!ut", ".!qb",
    ".tmp", ".temp", ".swp", ".lock",
)
SKIP_DIR_NAMES = {
    "node_modules", "__pycache__", ".git", ".svn", ".hg", "venv", ".venv", "site-packages",
    "$recycle.bin", "recycler", "system volume information", ".trash", ".trashes",
    "@eadir", "#recycle",
}
PACKAGE_SUFFIXES = (
    ".app", ".bundle", ".framework", ".photoslibrary", ".musiclibrary", ".imovielibrary",
    ".tvlibrary", ".fcpbundle", ".lrdata", ".xcodeproj", ".xcworkspace", ".plugin", ".kext",
    ".pkg", ".mpkg", ".rtfd", ".pages", ".numbers", ".key", ".band", ".logicx", ".dsym",
)
PROJECT_MARKERS = {
    ".git", ".svn", ".hg", "package.json", "pyproject.toml", "setup.py", "requirements.txt",
    "cargo.toml", "go.mod", "pom.xml", "build.gradle", "cmakelists.txt", "makefile",
    "composer.json", "gemfile", ".project", ".vscode", ".idea",
}
LIBRARY_SUFFIXES = (".dll", ".so", ".dylib", ".sln", ".csproj", ".vcxproj")
PROGRAM_SUFFIXES = (".exe",) + LIBRARY_SUFFIXES

FILE_ATTRIBUTE_HIDDEN = 0x2
FILE_ATTRIBUTE_SYSTEM = 0x4
FILE_ATTRIBUTE_OFFLINE = 0x1000
FILE_ATTRIBUTE_RECALL_ON_OPEN = 0x40000
FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x400000
IO_REPARSE_TAG_MOUNT_POINT = 0xA0000003
UF_HIDDEN = 0x8000  # macOS "hidden" flag

Progress = Optional[Callable[[int, Optional[int], str], None]]


@dataclass
class FileEntry:
    path: Path
    rel: str  # path relative to the scanned folder
    size: int
    mtime: float
    cloud_only: bool = False  # OneDrive "online-only" file: reading it would download it

    @property
    def name(self) -> str:
        return self.path.name


@dataclass
class ScanResult:
    root: Path
    files: List[FileEntry] = field(default_factory=list)
    protected_dirs: List[Tuple[Path, str]] = field(default_factory=list)
    hidden_skipped: int = 0
    system_skipped: int = 0
    links_skipped: int = 0
    errors: List[Tuple[str, str]] = field(default_factory=list)


def _attributes(st) -> int:
    return getattr(st, "st_file_attributes", 0) or 0


def is_hidden_file(name: str, st) -> bool:
    if name.startswith("."):
        return True
    if _attributes(st) & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM):
        return True
    return bool((getattr(st, "st_flags", 0) or 0) & UF_HIDDEN)


def is_hidden_dir(name: str, st) -> bool:
    # Folders with only the "system" attribute are ordinary customised folders.
    if name.startswith("."):
        return True
    if _attributes(st) & FILE_ATTRIBUTE_HIDDEN:
        return True
    return bool((getattr(st, "st_flags", 0) or 0) & UF_HIDDEN)


def is_cloud_placeholder(st) -> bool:
    attrs = _attributes(st)
    return bool(attrs & (FILE_ATTRIBUTE_OFFLINE | FILE_ATTRIBUTE_RECALL_ON_OPEN
                         | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS))


def is_system_file(name: str) -> bool:
    lower = name.lower()
    return lower in JUNK_FILES or lower.endswith(PARTIAL_SUFFIXES) or name.startswith("~$")


def protection_reason(names: Iterable[str], count_exe: bool = True) -> Optional[str]:
    """Why a folder with these entries must not be taken apart (None = fine).

    A sub-folder holding an .exe is usually an unzipped program, so it is left
    alone; *count_exe* is False for the chosen folder itself, because a
    Downloads folder full of installers is perfectly normal.
    """
    suffixes = PROGRAM_SUFFIXES if count_exe else LIBRARY_SUFFIXES
    for name in names:
        lower = name.lower()
        if lower in PROJECT_MARKERS:
            return f"程式專案（含 {name}）"
        if lower.endswith(suffixes):
            return f"應用程式資料夾（含 {name}）"
    return None


def _skip_dir_reason(name: str) -> Optional[str]:
    lower = name.lower()
    if lower in SKIP_DIR_NAMES:
        return "系統或程式資料夾"
    if lower.endswith(PACKAGE_SUFFIXES):
        return "應用程式套件"
    return None


def scan(root, recursive: bool = False, include_hidden: bool = False,
         exclude: Iterable = (), cancel=None, progress: Progress = None) -> ScanResult:
    """List the files in *root* (and its sub-folders when *recursive*)."""
    root = Path(root)
    result = ScanResult(root=root)
    excluded = {path_key(p) for p in exclude}
    stack: List[Tuple[Path, int]] = [(root, 0)]
    while stack:
        check_cancel(cancel)
        folder, depth = stack.pop()
        try:
            with os.scandir(folder) as iterator:
                entries = list(iterator)
        except OSError as exc:
            result.errors.append((str(folder), exc.strerror or str(exc)))
            continue
        if depth > 0:
            reason = protection_reason(e.name for e in entries)
            if reason:
                result.protected_dirs.append((folder, reason))
                continue
        entries.sort(key=lambda e: e.name.casefold())
        subfolders: List[Tuple[Path, int]] = []
        for entry in entries:
            try:
                if entry.is_symlink():
                    result.links_skipped += 1
                    continue
                st = entry.stat(follow_symlinks=False)
                if entry.is_dir(follow_symlinks=False):
                    if not recursive:
                        continue
                    if getattr(st, "st_reparse_tag", 0) == IO_REPARSE_TAG_MOUNT_POINT:
                        result.links_skipped += 1
                        continue
                    if not include_hidden and is_hidden_dir(entry.name, st):
                        result.hidden_skipped += 1
                        continue
                    reason = _skip_dir_reason(entry.name)
                    if reason:
                        result.protected_dirs.append((Path(entry.path), reason))
                        continue
                    if path_key(entry.path) in excluded:
                        continue
                    subfolders.append((Path(entry.path), depth + 1))
                elif entry.is_file(follow_symlinks=False):
                    if is_system_file(entry.name):
                        result.system_skipped += 1
                        continue
                    if not include_hidden and is_hidden_file(entry.name, st):
                        result.hidden_skipped += 1
                        continue
                    path = Path(entry.path)
                    result.files.append(FileEntry(
                        path=path,
                        rel=os.path.relpath(entry.path, root),
                        size=st.st_size,
                        mtime=st.st_mtime,
                        cloud_only=is_cloud_placeholder(st),
                    ))
                    if progress and len(result.files) % 200 == 0:
                        progress(len(result.files), None, "正在掃描檔案…")
            except OSError as exc:
                result.errors.append((entry.path, exc.strerror or str(exc)))
        stack.extend(reversed(subfolders))
    result.files.sort(key=lambda f: f.rel.casefold())
    return result
