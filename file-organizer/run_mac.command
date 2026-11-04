#!/bin/bash
# 檔案整理小幫手 - 在 Finder 中雙擊即可啟動（需要 python.org 的 Python 3.8 以上版本）
cd "$(dirname "$0")" || exit 1
for candidate in /Library/Frameworks/Python.framework/Versions/Current/bin/python3 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "import tkinter" >/dev/null 2>&1; then
    exec "$candidate" -m file_organizer "$@"
  fi
done
echo "找不到可以使用的 Python 3（需要包含 tkinter）。"
echo "請到 https://www.python.org/downloads/ 下載安裝 Python，然後再雙擊這個檔案一次。"
open "https://www.python.org/downloads/"
read -n 1 -s -r -p "按任意鍵關閉…"
