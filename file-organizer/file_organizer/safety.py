"""Refuse folders where moving files would damage the computer, and warn
about risky choices before anything is changed."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple

from .scanner import protection_reason
from .utils import app_data_dir, path_key


def _real(path) -> str:
    return path_key(os.path.realpath(os.fspath(path)))


def _inside(path_k: str, folder_k: str) -> bool:
    return path_k == folder_k or path_k.startswith(folder_k.rstrip(os.sep) + os.sep)


def _system_folders() -> Tuple[List[str], List[str]]:
    """(folders whose whole tree is off-limits, folders off-limits only themselves)."""
    trees: List[str] = []
    exact: List[str] = []
    if sys.platform == "win32":
        for var in ("SystemRoot", "windir", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432",
                    "ProgramData", "APPDATA", "LOCALAPPDATA"):
            value = os.environ.get(var)
            if value:
                trees.append(value)
        exact.append(str(Path.home().parent))  # C:\Users
    else:
        trees += ["/bin", "/sbin", "/usr", "/etc", "/boot", "/lib", "/lib32", "/lib64", "/libx32",
                  "/proc", "/sys", "/dev", "/run", "/snap", "/System", "/Library", "/Applications",
                  "/private/etc", "/cores", "/Network"]
        exact += ["/var", "/private", "/private/var", "/opt", "/home", "/Users", "/Volumes",
                  "/mnt", "/media", "/srv"]
        if sys.platform == "darwin":
            trees.append(str(Path.home() / "Library"))
    trees.append(str(app_data_dir()))
    return [_real(p) for p in trees], [_real(p) for p in exact]


def _is_drive_root(folder: Path) -> bool:
    real = os.path.realpath(folder)
    anchor = Path(real).anchor
    return bool(anchor) and _real(real) == _real(anchor)


def _forbidden(folder: Path) -> Optional[str]:
    """'system_drive', 'system_folder' or None."""
    key = _real(folder)
    if _inside(key, _real(tempfile.gettempdir())):
        return None
    if _is_drive_root(folder):
        system_drive = os.environ.get("SystemDrive", "C:") + os.sep
        if sys.platform != "win32" or key == _real(system_drive):
            return "system_drive"
    trees, exact = _system_folders()
    if any(_inside(key, tree) for tree in trees) or key in exact:
        return "system_folder"
    return None


def check_folder(folder: Optional[Path], *, recursive: bool) -> Tuple[Optional[str], List[str]]:
    """Return (error, warnings) for organizing *folder*.

    An error means the folder must not be used at all; warnings should be
    shown to the user for confirmation first.
    """
    if folder is None:
        return "請先選擇要整理的資料夾。", []
    folder = Path(folder)
    if not folder.exists():
        return f"找不到這個資料夾：{folder}", []
    if not folder.is_dir():
        return f"這不是資料夾：{folder}", []

    forbidden = _forbidden(folder)
    if forbidden == "system_drive":
        return f"為了安全，不能整理整個系統磁碟（{folder}）。請改選裡面的某個資料夾。", []
    if forbidden == "system_folder":
        return f"「{folder}」是系統或程式使用的資料夾，為了安全不能整理。", []

    is_home = _real(folder) == _real(Path.home())
    is_root = _is_drive_root(folder)
    warnings: List[str] = []
    if recursive:
        if is_root or is_home:
            return (f"為了安全，不能對「{folder}」使用「包含子資料夾」。"
                    "請改選下載、桌面等資料夾，或取消勾選「包含子資料夾」。"), []
        warnings.append("已勾選「包含子資料夾」：子資料夾裡的檔案也會被搬出來分類，原本的資料夾結構會改變。")
    elif is_root:
        warnings.append(f"「{folder}」是整個磁碟的最上層，只會整理直接放在這裡的檔案。")
    elif is_home:
        warnings.append("這是你的使用者資料夾，只會整理直接放在這一層的檔案（不含隱藏檔）。")

    try:
        reason = protection_reason(os.listdir(folder), count_exe=False)
    except OSError:
        reason = None
    if reason:
        warnings.append(f"這個資料夾看起來是{reason}，整理後程式可能無法正常執行。")
    return None, warnings


def check_destination(folder: Optional[Path]) -> Optional[str]:
    """Error message if *folder* cannot receive the organized files."""
    if folder is None:
        return "請選擇要放整理結果的資料夾。"
    folder = Path(folder)
    if folder.exists() and not folder.is_dir():
        return f"目的地不是資料夾：{folder}"
    forbidden = _forbidden(folder)
    if forbidden == "system_drive":
        return f"為了安全，不能把整個系統磁碟（{folder}）當作目的地。"
    if forbidden == "system_folder":
        return f"「{folder}」是系統或程式使用的資料夾，不能當作目的地。"
    return None
