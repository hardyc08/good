"""Operating-system integration: common folders and opening the file manager."""

from __future__ import annotations

import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

# (label, usual folder name, Windows KNOWNFOLDERID, XDG key)
_KNOWN = [
    ("下載", "Downloads", "374DE290-123F-4565-9164-39C4925E467B", "XDG_DOWNLOAD_DIR"),
    ("桌面", "Desktop", "B4BFCC3A-DB2C-424C-B029-7FE99A87C641", "XDG_DESKTOP_DIR"),
    ("文件", "Documents", "FDD39AD0-238F-46AF-ADB4-6C85480369C7", "XDG_DOCUMENTS_DIR"),
    ("圖片", "Pictures", "33E28130-4E1E-4676-835A-98395C3BC3BB", "XDG_PICTURES_DIR"),
]


def _windows_known_folder(guid_text: str) -> Optional[Path]:
    try:
        import ctypes
        from ctypes import wintypes

        class GUID(ctypes.Structure):
            _fields_ = [("Data1", wintypes.DWORD), ("Data2", wintypes.WORD),
                        ("Data3", wintypes.WORD), ("Data4", ctypes.c_ubyte * 8)]

        value = uuid.UUID(guid_text)
        guid = GUID(value.fields[0], value.fields[1], value.fields[2],
                    (ctypes.c_ubyte * 8)(*value.bytes[8:]))
        result = ctypes.c_wchar_p()
        shell32 = ctypes.windll.shell32
        shell32.SHGetKnownFolderPath.argtypes = [ctypes.POINTER(GUID), wintypes.DWORD,
                                                  wintypes.HANDLE, ctypes.POINTER(ctypes.c_wchar_p)]
        if shell32.SHGetKnownFolderPath(ctypes.byref(guid), 0, None, ctypes.byref(result)) != 0:
            return None
        path = result.value
        ctypes.windll.ole32.CoTaskMemFree(ctypes.cast(result, ctypes.c_void_p))
        return Path(path) if path else None
    except Exception:
        return None


def _xdg_user_dir(key: str) -> Optional[Path]:
    config = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "user-dirs.dirs"
    try:
        text = config.read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(rf'^{key}="(.*)"\s*$', text, re.MULTILINE)
    if not match:
        return None
    value = match.group(1).replace("$HOME", str(Path.home()))
    return Path(value) if value else None


def known_folders() -> List[Tuple[str, Path]]:
    """[(label, path)] of Downloads/Desktop/Documents/Pictures that exist."""
    found = []
    for label, name, guid, xdg in _KNOWN:
        path = None
        if sys.platform == "win32":
            path = _windows_known_folder(guid)
        elif sys.platform != "darwin":
            path = _xdg_user_dir(xdg)
        if path is None or not path.is_dir():
            path = Path.home() / name
        if path.is_dir():
            found.append((label, path))
    return found


def open_in_file_manager(path: Path, select: bool = False) -> None:
    """Open a folder, or show a file selected in Explorer/Finder."""
    path = Path(path)
    if sys.platform == "win32":
        if select and path.exists():
            subprocess.Popen(["explorer", "/select,", str(path)])
        else:
            os.startfile(str(path if path.is_dir() else path.parent))  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", str(path)] if select else ["open", str(path)])
    else:
        folder = path if path.is_dir() else path.parent
        subprocess.Popen(["xdg-open", str(folder)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
