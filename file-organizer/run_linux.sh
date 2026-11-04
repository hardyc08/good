#!/bin/sh
# 檔案整理小幫手 - 啟動視窗介面（需要 Python 3.8 以上與 tkinter）
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "找不到 Python 3，請先安裝（例如：sudo apt install python3 python3-tk）。"
  exit 1
fi
if ! python3 -c "import tkinter" >/dev/null 2>&1; then
  echo "缺少 tkinter，請先安裝（例如：sudo apt install python3-tk），或改用指令模式：python3 -m file_organizer --help"
  exit 1
fi
exec python3 -m file_organizer "$@"
