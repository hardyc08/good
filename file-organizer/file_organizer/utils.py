"""Small shared helpers: sizes, dates, safe folder names, unique file names
and the place where settings and history are stored."""

from __future__ import annotations

import os
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Optional, Set

APP_DIR_NAME = "FileOrganizer"


class Cancelled(Exception):
    """Raised inside long-running work after the user presses 「取消」."""


def check_cancel(cancel) -> None:
    if cancel is not None and cancel.is_set():
        raise Cancelled()


def app_data_dir() -> Path:
    """Folder for rules.json and the undo history.

    Windows: %APPDATA%\\FileOrganizer, macOS: ~/Library/Application Support/
    FileOrganizer, Linux: ~/.config/file-organizer. The FILE_ORGANIZER_HOME
    environment variable overrides it (used by the tests).
    """
    override = os.environ.get("FILE_ORGANIZER_HOME")
    if override:
        base = Path(override)
    elif sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        base = (Path(appdata) if appdata else Path.home() / "AppData" / "Roaming") / APP_DIR_NAME
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / APP_DIR_NAME
    else:
        xdg = os.environ.get("XDG_CONFIG_HOME")
        base = (Path(xdg) if xdg else Path.home() / ".config") / "file-organizer"
    base.mkdir(parents=True, exist_ok=True)
    return base


def human_size(num: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(num) < 1024:
            return f"{int(num)} B" if unit == "B" else f"{num:.1f} {unit}"
        num /= 1024
    return f"{num:.1f} TB"


def safe_datetime(timestamp: float) -> Optional[datetime]:
    try:
        return datetime.fromtimestamp(timestamp)
    except (OverflowError, OSError, ValueError):
        return None


def format_timestamp(timestamp: float) -> str:
    moment = safe_datetime(timestamp)
    return moment.strftime("%Y-%m-%d %H:%M") if moment else "-"


_INVALID_CHARS = set('<>:"|?*')
_RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL"} | {f"{p}{i}" for p in ("COM", "LPT") for i in range(1, 10)}


def sanitize_folder(label: str) -> str:
    """Turn a folder label typed by the user into a safe relative path.

    "/" or "\\" separate nested folders ("工作/發票"). Characters Windows does
    not allow become "_", and empty, "." and ".." parts are dropped so a rule
    can never send files outside the chosen folder.
    """
    parts = []
    for raw in re.split(r"[\\/]+", label or ""):
        part = "".join("_" if (ch in _INVALID_CHARS or ord(ch) < 32) else ch for ch in raw)
        part = part.strip().rstrip(". ")
        if not part:
            continue
        if part.split(".")[0].upper() in _RESERVED_NAMES:
            part = "_" + part
        parts.append(part)
    return "/".join(parts)


def path_key(path) -> str:
    """Comparison key for paths that treats names the way Windows and macOS
    do: case-insensitive and independent of the Unicode normal form."""
    text = os.path.normpath(os.path.abspath(os.fspath(path)))
    return unicodedata.normalize("NFC", text).casefold()


def is_within(path, folder) -> bool:
    """True when *path* is *folder* itself or anywhere inside it."""
    p, f = path_key(path), path_key(folder)
    if p == f:
        return True
    sep = os.sep
    return p.startswith(f.rstrip(sep) + sep)


_DOUBLE_SUFFIXES = (".tar.gz", ".tar.bz2", ".tar.xz", ".tar.zst")


def split_name(name: str):
    """'photo.jpg' -> ('photo', '.jpg'); 'backup.tar.gz' -> ('backup', '.tar.gz')."""
    lower = name.lower()
    for suffix in _DOUBLE_SUFFIXES:
        if lower.endswith(suffix) and len(name) > len(suffix):
            return name[: -len(suffix)], name[-len(suffix):]
    return os.path.splitext(name)


def unique_path(target: Path, taken: Optional[Set[str]] = None) -> Path:
    """Return *target*, or 'name (1).ext', 'name (2).ext', ... — the first
    name that is free on disk and not already reserved in *taken*."""

    def is_free(candidate: Path) -> bool:
        return not os.path.lexists(candidate) and (taken is None or path_key(candidate) not in taken)

    if is_free(target):
        return target
    stem, suffix = split_name(target.name)
    start = 1
    numbered = re.match(r"^(.*) \((\d{1,3})\)$", stem)
    if numbered:  # 'a (1).jpg' becomes 'a (2).jpg', not 'a (1) (1).jpg'; 'Report (2023)' keeps its year
        stem, start = numbered.group(1), int(numbered.group(2)) + 1
    for number in range(start, start + 100000):
        candidate = target.with_name(f"{stem} ({number}){suffix}")
        if is_free(candidate):
            return candidate
    raise FileExistsError(f"找不到可用的檔名：{target}")


def clean_user_path(text: str) -> Optional[Path]:
    """Accept a path typed or pasted by the user ("Copy as path" adds quotes)."""
    text = (text or "").strip().strip('"').strip("'").strip()
    if not text:
        return None
    return Path(os.path.expanduser(text))


def display_width(text: str) -> int:
    """Terminal columns used by *text* (Chinese characters take two)."""
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in text)


def pad(text: str, width: int) -> str:
    return text + " " * max(0, width - display_width(text))
