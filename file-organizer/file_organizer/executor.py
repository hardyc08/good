"""Carry out moves/copies, record every change in a journal, and undo them.

Safety rules:
* an existing file is never overwritten — a free name such as "a (1).jpg" is used
* nothing is ever deleted, except (on undo) copies this program made that are
  still unchanged, and folders this program created that are empty again
* every change is written to a journal (one JSON object per line, flushed
  immediately) so even an interrupted run can be undone
"""

from __future__ import annotations

import errno
import json
import os
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Sequence, Set, Tuple

from .scanner import Progress
from .utils import app_data_dir, is_within, path_key, unique_path

FILE_ACTIONS = ("move", "copy")
DIR_ACTIONS = ("mkdir", "rmdir")


@dataclass
class Operation:
    source: Path
    target: Path


@dataclass
class RunResult:
    done: int = 0
    bytes: int = 0
    renamed: int = 0
    removed_dirs: int = 0
    skipped: List[Tuple[str, str]] = field(default_factory=list)
    errors: List[Tuple[str, str]] = field(default_factory=list)
    cancelled: bool = False
    journal: Optional[Path] = None


@dataclass
class UndoResult:
    restored: int = 0
    renamed: List[Tuple[str, str]] = field(default_factory=list)
    problems: List[Tuple[str, str]] = field(default_factory=list)
    retry_later: int = 0


@dataclass
class HistoryEntry:
    path: Path
    created: str
    kind: str
    title: str
    source: str
    operation: str
    count: int
    finished: bool
    cancelled: bool
    undo_state: str  # "" (not undone), "undone" or "partial"

    @property
    def status(self) -> str:
        if self.undo_state == "undone":
            return "已復原"
        if self.undo_state == "partial":
            return "部分復原"
        if self.cancelled:
            return "已取消（可復原已完成的部分）"
        if not self.finished:
            return "中途停止（可復原）"
        return "已完成"

    @property
    def can_undo(self) -> bool:
        return self.undo_state != "undone" and self.count > 0


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def history_dir() -> Path:
    folder = app_data_dir() / "history"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def describe_error(exc: BaseException) -> str:
    winerror = getattr(exc, "winerror", None)
    if winerror in (32, 33):
        return "檔案正在被其他程式使用，請關閉後再試"
    if isinstance(exc, PermissionError):
        return "沒有權限，或檔案正在被其他程式使用"
    if isinstance(exc, FileNotFoundError):
        return "找不到檔案或資料夾"
    if isinstance(exc, FileExistsError):
        return "目的地已有同名檔案"
    if isinstance(exc, OSError):
        if exc.errno == errno.ENOSPC or winerror == 112:
            return "磁碟空間不足"
        if exc.errno == errno.ENAMETOOLONG or winerror == 206:
            return "路徑或檔名太長"
        return exc.strerror or str(exc)
    return str(exc)


class Journal:
    """Append-only record of the changes made by one run."""

    def __init__(self, kind: str, title: str, source: Path, operation: str, planned: int):
        folder = history_dir()
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")  # sorts in creation order
        number = 0
        while True:
            name = f"{stamp}-{kind}.jsonl" if number == 0 else f"{stamp}-{kind}-{number}.jsonl"
            try:
                self._fh = open(folder / name, "x", encoding="utf-8")
                break
            except FileExistsError:
                number += 1
        self.path = folder / name
        self.write({"type": "header", "version": 1, "kind": kind, "title": title,
                    "source": str(source), "operation": operation, "planned": planned,
                    "created": _now()})

    def write(self, entry: dict) -> None:
        self._fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
        self._fh.flush()

    def close(self, **footer) -> None:
        try:
            self.write({"type": "footer", "finished": _now(), **footer})
            os.fsync(self._fh.fileno())
        except OSError:
            pass
        finally:
            self._fh.close()


# --------------------------------------------------------------------- file helpers

def _copy_file(source: Path, target: Path) -> None:
    if os.path.lexists(target):
        raise FileExistsError(errno.EEXIST, "目的地已有同名檔案", str(target))
    try:
        shutil.copy2(source, target)
    except BaseException:
        try:
            os.unlink(target)  # remove a half-written copy
        except OSError:
            pass
        raise


def _move_file(source: Path, target: Path) -> bool:
    """Move without ever overwriting. Returns False when the file had to be
    copied to another drive and the original could not be removed."""
    if os.path.lexists(target):
        raise FileExistsError(errno.EEXIST, "目的地已有同名檔案", str(target))
    try:
        os.rename(source, target)
        return True
    except OSError as exc:
        if exc.errno != errno.EXDEV:  # anything but "different drive"
            raise
    _copy_file(source, target)
    try:
        os.unlink(source)
    except OSError:
        return False
    return True


def _ensure_dir(folder: Path, journal: Journal) -> None:
    """Create *folder* (and missing parents), recording each new folder."""
    missing = []
    current = folder
    while not os.path.isdir(current):
        missing.append(current)
        if current.parent == current:
            break
        current = current.parent
    for path in reversed(missing):
        try:
            os.mkdir(path)
        except FileExistsError:
            if os.path.isdir(path):
                continue
            raise
        journal.write({"type": "mkdir", "path": str(path)})


def _remove_empty_dirs(vacated: Set[Path], root: Path, journal: Journal) -> int:
    """Delete folders under *root* that became empty because files left them."""
    candidates: Set[Path] = set()
    root_key = path_key(root)
    for folder in vacated:
        current = folder
        while is_within(current, root) and path_key(current) != root_key:
            candidates.add(current)
            if current.parent == current:
                break
            current = current.parent
    removed = 0
    for folder in sorted(candidates, key=lambda p: len(p.parts), reverse=True):
        try:
            os.rmdir(folder)  # only succeeds when the folder is completely empty
        except OSError:
            continue
        journal.write({"type": "rmdir", "path": str(folder)})
        removed += 1
    return removed


# --------------------------------------------------------------------- run

def run_operations(operations: Sequence[Operation], *, kind: str, title: str, source: Path,
                   operation: str = "move", conflict: str = "rename",
                   cleanup_root: Optional[Path] = None, cancel=None,
                   progress: Progress = None) -> RunResult:
    """Move or copy each file, never overwriting anything.

    *conflict* decides what happens when the target name is taken by now:
    "rename" picks a free name, "skip" leaves the file where it is.
    With *cleanup_root*, folders under it that end up empty are removed.
    """
    if operation not in FILE_ACTIONS:
        raise ValueError(f"unknown operation: {operation}")
    result = RunResult()
    if not operations:
        return result
    journal = Journal(kind, title, source, operation, len(operations))
    result.journal = journal.path
    vacated: Set[Path] = set()
    total = len(operations)
    try:
        for index, op in enumerate(operations):
            if cancel is not None and cancel.is_set():
                result.cancelled = True
                break
            if progress and (index % 10 == 0 or index == total - 1):
                progress(index, total, op.source.name)
            src, dst = Path(op.source), Path(op.target)
            try:
                if os.path.islink(src) or not os.path.isfile(src):
                    result.skipped.append((str(src), "原本的檔案已經不在了"))
                    continue
                if os.path.lexists(dst):
                    if conflict == "skip":
                        result.skipped.append((str(src), "目的地已有同名檔案"))
                        continue
                    dst = unique_path(dst)
                    result.renamed += 1
                _ensure_dir(dst.parent, journal)
                size = os.path.getsize(src)
                action = operation
                if operation == "copy":
                    _copy_file(src, dst)
                elif _move_file(src, dst):
                    vacated.add(src.parent)
                else:
                    action = "copy"  # the original is still there; undo only removes the copy
                    result.errors.append((str(src), "已複製到新位置，但無法刪除原本的檔案"))
                stat = os.stat(dst)
            except OSError as exc:
                result.errors.append((str(src), describe_error(exc)))
                continue
            journal.write({"type": action, "src": str(src), "dst": str(dst),
                           "size": stat.st_size, "mtime": stat.st_mtime})
            result.done += 1
            result.bytes += size
        if progress:
            progress(total, total, "完成")
        if cleanup_root is not None and operation == "move" and vacated:
            result.removed_dirs = _remove_empty_dirs(vacated, Path(cleanup_root), journal)
    finally:
        journal.close(done=result.done, skipped=len(result.skipped), errors=len(result.errors),
                      cancelled=result.cancelled)
    return result


# --------------------------------------------------------------------- history & undo

def read_journal(path: Path) -> List[dict]:
    entries = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue  # half-written last line after a crash
            if isinstance(entry, dict):
                entries.append(entry)
    return entries


def _undo_state(entries: List[dict]) -> Optional[Set[int]]:
    """None: never undone; empty set: fully undone; otherwise the entry
    numbers that still need to be undone (a retry after errors)."""
    state: Optional[Set[int]] = None
    for entry in entries:
        if entry.get("type") == "undone":
            state = set(entry.get("remaining") or [])
    return state


def load_history_entry(path: Path) -> Optional[HistoryEntry]:
    try:
        entries = read_journal(path)
    except (OSError, UnicodeDecodeError):
        return None
    if not entries or entries[0].get("type") != "header":
        return None
    header = entries[0]
    footer = next((e for e in reversed(entries) if e.get("type") == "footer"), None)
    count = sum(1 for e in entries if e.get("type") in FILE_ACTIONS)
    state = _undo_state(entries)
    undo_state = "" if state is None else ("partial" if state else "undone")
    return HistoryEntry(
        path=Path(path), created=str(header.get("created", "")), kind=str(header.get("kind", "")),
        title=str(header.get("title", "")), source=str(header.get("source", "")),
        operation=str(header.get("operation", "move")), count=count, finished=footer is not None,
        cancelled=bool(footer and footer.get("cancelled")), undo_state=undo_state,
    )


def list_history(limit: int = 300) -> List[HistoryEntry]:
    files = sorted(history_dir().glob("*.jsonl"), key=lambda p: p.name, reverse=True)
    history = []
    for path in files[:limit]:
        entry = load_history_entry(path)
        if entry is not None:
            history.append(entry)
    return history


def journal_file_actions(path: Path) -> List[dict]:
    return [e for e in read_journal(path) if e.get("type") in FILE_ACTIONS]


def _undo_move(entry: dict, result: UndoResult) -> None:
    src, dst = Path(entry["src"]), Path(entry["dst"])
    if not os.path.lexists(dst):
        result.problems.append((str(dst), "檔案已不在整理後的位置（可能被移動、改名或刪除）"))
        return
    target = src
    if os.path.lexists(src):
        target = unique_path(src)
        result.renamed.append((str(src), str(target)))
    os.makedirs(target.parent, exist_ok=True)
    if not _move_file(dst, target):
        result.problems.append((str(dst), "已複製回原位置，但無法刪除整理後的檔案"))
    result.restored += 1


def _undo_copy(entry: dict, result: UndoResult) -> None:
    dst = Path(entry["dst"])
    if not os.path.lexists(dst):
        return  # already gone
    stat = os.stat(dst)
    if stat.st_size != entry.get("size") or abs(stat.st_mtime - float(entry.get("mtime", 0))) > 2:
        result.problems.append((str(dst), "這個複本在整理後被修改過，為了安全沒有刪除"))
        return
    os.unlink(dst)
    result.restored += 1


def undo(path: Path, progress: Progress = None) -> UndoResult:
    """Put every file of one run back where it came from."""
    path = Path(path)
    entries = read_journal(path)
    if not entries or entries[0].get("type") != "header":
        raise ValueError("這不是有效的整理紀錄。")
    state = _undo_state(entries)
    if state is not None and not state:
        raise ValueError("這次整理已經復原過了。")
    actions = [(i, e) for i, e in enumerate(entries)
               if e.get("type") in FILE_ACTIONS + DIR_ACTIONS
               and (state is None or i in state or e.get("type") in DIR_ACTIONS)]
    result = UndoResult()
    remaining: List[int] = []
    total = sum(1 for _, e in actions if e.get("type") in FILE_ACTIONS)
    done = 0
    try:
        for index, entry in reversed(actions):
            kind = entry.get("type")
            try:
                if kind == "rmdir":
                    os.makedirs(entry["path"], exist_ok=True)
                elif kind == "mkdir":
                    try:
                        os.rmdir(entry["path"])  # only if it is empty again
                    except OSError:
                        pass
                else:
                    done += 1
                    if progress and (done % 10 == 0 or done == total):
                        progress(done, total, Path(entry.get("dst", "")).name)
                    if kind == "move":
                        _undo_move(entry, result)
                    else:
                        _undo_copy(entry, result)
            except (OSError, KeyError) as exc:
                label = entry.get("dst") or entry.get("path") or "?"
                result.problems.append((str(label), describe_error(exc)))
                if kind in FILE_ACTIONS and isinstance(exc, OSError):
                    remaining.append(index)
    finally:
        result.retry_later = len(remaining)
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"type": "undone", "at": _now(), "restored": result.restored,
                                 "problems": len(result.problems), "remaining": sorted(remaining)},
                                ensure_ascii=False) + "\n")
    return result
