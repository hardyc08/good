"""Command-line interface.

    python -m file_organizer                     開啟視窗
    python -m file_organizer organize <資料夾>    預覽 → 確認 → 整理
    python -m file_organizer stats <資料夾>       統計各類檔案
    python -m file_organizer duplicates <資料夾>  找重複檔案
    python -m file_organizer history              整理紀錄
    python -m file_organizer undo [編號]          復原（預設最近一次）
    python -m file_organizer rules [--reset]      顯示／重設分類規則
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from typing import List, Optional, Sequence

from . import APP_TITLE, __version__
from .duplicates import DUPLICATES_FOLDER, KEEP_STRATEGIES, find_duplicates, move_duplicates
from .executor import Operation, RunResult, list_history, run_operations, undo
from .planner import DATE_LEVELS, MODES, OrganizeOptions, Plan, build_plan
from .rules import Rules, load_rules, rules_path, save_rules
from .safety import check_destination, check_folder
from .scanner import scan
from .utils import clean_user_path, display_width, format_timestamp, human_size, pad

MODE_ALIASES = {"type": "type", "date": "date", "type-date": "type_date", "extension": "extension"}
PREVIEW_LINES = 40


def _fix_stdio() -> None:
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name)
        if stream is None:  # windowed .exe without a console
            setattr(sys, name, open(os.devnull, "w", encoding="utf-8"))
            continue
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass


def confirm(question: str) -> bool:
    try:
        answer = input(f"{question} [y/N] ")
    except EOFError:
        return False
    return answer.strip().lower() in ("y", "yes", "是", "好", "要")


def _verb(operation: str) -> str:
    return "移動" if operation == "move" else "複製"


def _print_table(rows: Sequence[Sequence[str]], indent: str = "  ") -> None:
    if not rows:
        return
    widths = [max(display_width(row[i]) for row in rows) for i in range(len(rows[0]))]
    for row in rows:
        cells = [pad(cell, widths[i]) if i == 0 else " " * (widths[i] - display_width(cell)) + cell
                 for i, cell in enumerate(row)]
        print(indent + "   ".join(cells).rstrip())


def print_plan(plan: Plan) -> None:
    options = plan.options
    print(f"資料夾：{plan.source}")
    if plan.destination != plan.source:
        print(f"整理到：{plan.destination}")
    mode = MODES[options.mode]
    if options.mode in ("date", "type_date"):
        mode += f"（分到{DATE_LEVELS[options.date_level]}）"
    print(f"方式：{mode}・{_verb(options.operation)}" + ("・包含子資料夾" if options.recursive else ""))
    notes = []
    if plan.already_in_place:
        notes.append(f"{plan.already_in_place} 個已在正確位置")
    if plan.conflicts_skipped:
        notes.append(f"{plan.conflicts_skipped} 個因同名而略過")
    if plan.scan.hidden_skipped:
        notes.append(f"略過 {plan.scan.hidden_skipped} 個隱藏檔")
    if plan.scan.system_skipped:
        notes.append(f"略過 {plan.scan.system_skipped} 個系統檔／下載中的檔案")
    if notes:
        print("、".join(notes))
    for folder, reason in plan.scan.protected_dirs:
        print(f"略過資料夾：{folder}（{reason}）")
    if not plan.items:
        return
    print(f"\n將{_verb(options.operation)} {len(plan.items):,} 個檔案，共 {human_size(plan.selected_size())}：")
    _print_table([(name, f"{count:,} 個", human_size(size)) for name, count, size in plan.summary()])
    print("\n預覽：")
    for item in plan.items[:PREVIEW_LINES]:
        note = "（同名，自動改名）" if item.renamed else ""
        print(f"  {item.rel_source}  →  {item.rel_target}{note}")
    if len(plan.items) > PREVIEW_LINES:
        print(f"  …還有 {len(plan.items) - PREVIEW_LINES:,} 個檔案")


def print_result(result: RunResult, operation: str) -> None:
    if result.cancelled:
        print("已中斷，剩下的檔案沒有處理。")
    print(f"完成：已{_verb(operation)} {result.done:,} 個檔案（{human_size(result.bytes)}）。")
    if result.renamed:
        print(f"{result.renamed} 個檔案因同名而自動改名。")
    if result.removed_dirs:
        print(f"移除了 {result.removed_dirs} 個變空的資料夾。")
    for path, reason in result.skipped[:20]:
        print(f"略過：{path}（{reason}）")
    for path, reason in result.errors[:20]:
        print(f"失敗：{path}（{reason}）")
    if result.done:
        print("想恢復原狀的話，執行：python -m file_organizer undo")


# --------------------------------------------------------------------- commands

def cmd_gui(_args=None) -> int:
    try:
        from .gui import main as gui_main
    except ImportError as exc:
        print(f"無法開啟視窗介面（{exc}）。")
        print("請安裝含 tkinter 的 Python（https://www.python.org/downloads/），"
              "或使用指令模式：python -m file_organizer --help")
        return 1
    return gui_main()


def cmd_organize(args) -> int:
    folder = clean_user_path(args.folder)
    error, warnings = check_folder(folder, recursive=args.recursive)
    if error:
        print(f"錯誤：{error}")
        return 2
    destination = clean_user_path(args.dest) if args.dest else None
    if destination is not None:
        dest_error = check_destination(destination)
        if dest_error:
            print(f"錯誤：{dest_error}")
            return 2
    for warning in warnings:
        print(f"注意：{warning}")
    options = OrganizeOptions(
        mode=MODE_ALIASES[args.by], date_level=args.date_level, recursive=args.recursive,
        include_hidden=args.include_hidden, use_capture_date=not args.no_capture_date,
        operation="copy" if args.copy else "move", conflict=args.on_conflict,
        remove_empty_dirs=not args.keep_empty_dirs, destination=destination,
    )
    plan = build_plan(folder, options, load_rules())
    print_plan(plan)
    if not plan.items:
        print("\n沒有需要整理的檔案。")
        return 0
    if args.dry_run:
        print("\n（只預覽，沒有做任何變更）")
        return 0
    if warnings and not args.yes and not confirm("\n請確認上面的注意事項，仍要繼續嗎？"):
        print("已取消。")
        return 1
    if not args.yes and not confirm(f"\n確定要{_verb(options.operation)}這 {len(plan.items):,} 個檔案嗎？"):
        print("已取消，沒有做任何變更。")
        return 1
    cleanup = folder if options.recursive and options.remove_empty_dirs else None
    result = run_operations(
        [Operation(item.source, item.target) for item in plan.items], kind="organize",
        title=f"{MODES[options.mode]}・{_verb(options.operation)}", source=folder,
        operation=options.operation, conflict=options.conflict, cleanup_root=cleanup,
    )
    print()
    print_result(result, options.operation)
    return 1 if result.errors else 0


def cmd_stats(args) -> int:
    folder = clean_user_path(args.folder)
    if folder is None or not folder.is_dir():
        print(f"錯誤：找不到資料夾 {args.folder}")
        return 2
    result = scan(folder, recursive=args.recursive)
    rules = load_rules()
    totals = defaultdict(lambda: [0, 0])
    for entry in result.files:
        category, _ = rules.classify(entry.name)
        totals[category][0] += 1
        totals[category][1] += entry.size
    total_size = sum(e.size for e in result.files)
    print(f"資料夾：{folder}" + ("（包含子資料夾）" if args.recursive else ""))
    print(f"共 {len(result.files):,} 個檔案，{human_size(total_size)}\n")
    rows = sorted(totals.items(), key=lambda kv: -kv[1][1])
    _print_table([(name, f"{count:,} 個", human_size(size)) for name, (count, size) in rows])
    if result.files:
        print("\n最大的 10 個檔案：")
        biggest = sorted(result.files, key=lambda e: -e.size)[:10]
        _print_table([(e.rel, human_size(e.size), format_timestamp(e.mtime)) for e in biggest])
    return 0


def cmd_duplicates(args) -> int:
    folder = clean_user_path(args.folder)
    recursive = not args.no_recursive
    error, _ = check_folder(folder, recursive=recursive)
    if error:
        print(f"錯誤：{error}")
        return 2
    report = find_duplicates(folder, recursive=recursive, min_size=args.min_size, strategy=args.keep)
    if not report.groups:
        print("沒有找到內容相同的檔案。")
        return 0
    extra = sum(len(g.files) - 1 for g in report.groups)
    print(f"找到 {len(report.groups):,} 組重複檔案，共 {extra:,} 個多餘的檔案，可省下 {human_size(report.wasted)}。\n")
    for number, group in enumerate(report.groups, 1):
        print(f"第 {number} 組（每個 {human_size(group.size)}）")
        for index, entry in enumerate(group.files):
            mark = "保留" if index == group.keep else "多餘"
            print(f"  [{mark}] {entry.rel}  {format_timestamp(entry.mtime)}")
    if not args.move:
        print(f"\n加上 --move 可以把「多餘」的檔案移到「{DUPLICATES_FOLDER}」資料夾（不會刪除）。")
        return 0
    if not args.yes and not confirm(f"\n要把 {extra:,} 個多餘的檔案移到「{folder / DUPLICATES_FOLDER}」嗎？"):
        print("已取消。")
        return 1
    result = move_duplicates(report)
    print_result(result, "move")
    return 1 if result.errors else 0


def cmd_history(_args) -> int:
    history = list_history()
    if not history:
        print("還沒有整理紀錄。")
        return 0
    rows = []
    for number, entry in enumerate(history, 1):
        rows.append((f"{number}.", entry.created.replace("T", " "), entry.title, f"{entry.count:,} 個檔案",
                     entry.status, entry.source))
    for row in rows:
        print("  ".join(row))
    return 0


def cmd_undo(args) -> int:
    history = list_history()
    if args.number:
        if not 1 <= args.number <= len(history):
            print(f"錯誤：沒有第 {args.number} 筆紀錄（用 history 指令查看編號）。")
            return 2
        entry = history[args.number - 1]
    else:
        entry = next((e for e in history if e.can_undo), None)
        if entry is None:
            print("沒有可以復原的整理紀錄。")
            return 0
    if not entry.can_undo:
        print("這筆紀錄已經復原過了。")
        return 0
    print(f"{entry.created.replace('T', ' ')}  {entry.title}  {entry.source}（{entry.count:,} 個檔案）")
    if not args.yes and not confirm("要把這次整理的檔案全部移回原位嗎？"):
        print("已取消。")
        return 1
    result = undo(entry.path)
    print(f"已復原 {result.restored:,} 個檔案。")
    for old, new in result.renamed[:20]:
        print(f"原位置已有同名檔案，改放到：{new}")
    for path, reason in result.problems[:20]:
        print(f"問題：{path}（{reason}）")
    if result.retry_later:
        print(f"有 {result.retry_later} 個檔案暫時無法移回，關閉相關程式後可以再執行一次 undo。")
    return 1 if result.problems else 0


def cmd_rules(args) -> int:
    if args.reset:
        save_rules(Rules.default())
        print("已恢復預設的分類規則。")
    rules = load_rules()
    print(f"規則檔：{rules_path()}\n")
    print("依檔名關鍵字（優先）：")
    for rule in rules.keyword_rules:
        limit = f"（只限 {' '.join(rule.extensions)}）" if rule.extensions else ""
        print(f"  {rule.folder}：{'、'.join(rule.keywords)}{limit}")
    print("\n依副檔名：")
    for category in rules.categories:
        print(f"  {category.name}：{' '.join(category.extensions)}")
    print(f"\n其他檔案放到：{rules.other_folder}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="file_organizer",
        description=f"{APP_TITLE}：依類型或日期自動分類資料夾裡的檔案。不帶任何參數執行會開啟視窗。",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="command", metavar="指令")

    p = sub.add_parser("gui", help="開啟視窗介面")
    p.set_defaults(func=cmd_gui)

    p = sub.add_parser("organize", help="整理資料夾（會先顯示預覽並詢問）")
    p.add_argument("folder", help="要整理的資料夾")
    p.add_argument("--by", choices=list(MODE_ALIASES), default="type",
                   help="分類方式：type 依類型（預設）、date 依日期、type-date 依類型＋日期、extension 依副檔名")
    p.add_argument("--date-level", choices=list(DATE_LEVELS), default="month", help="日期分到 month（年/月，預設）或 year（年）")
    p.add_argument("--dest", help="把整理結果放到另一個資料夾（預設整理在原資料夾裡）")
    p.add_argument("--copy", action="store_true", help="複製而不是移動（原檔保留不動）")
    p.add_argument("-r", "--recursive", action="store_true", help="也整理子資料夾裡的檔案")
    p.add_argument("--include-hidden", action="store_true", help="也整理隱藏檔")
    p.add_argument("--no-capture-date", action="store_true", help="不讀取相片／影片的拍攝日期，一律使用修改日期")
    p.add_argument("--on-conflict", choices=["rename", "skip"], default="rename",
                   help="目的地已有同名檔案時：rename 自動改名（預設）、skip 略過")
    p.add_argument("--keep-empty-dirs", action="store_true", help="保留整理後變空的子資料夾")
    p.add_argument("--dry-run", action="store_true", help="只預覽，不做任何變更")
    p.add_argument("-y", "--yes", action="store_true", help="不詢問，直接執行")
    p.set_defaults(func=cmd_organize)

    p = sub.add_parser("stats", help="統計資料夾裡各類檔案的數量與大小")
    p.add_argument("folder", help="要統計的資料夾")
    p.add_argument("-r", "--recursive", action="store_true", help="包含子資料夾")
    p.set_defaults(func=cmd_stats)

    p = sub.add_parser("duplicates", help="找出內容完全相同的檔案")
    p.add_argument("folder", help="要檢查的資料夾")
    p.add_argument("--no-recursive", action="store_true", help="不檢查子資料夾")
    p.add_argument("--keep", choices=list(KEEP_STRATEGIES), default="shortest",
                   help="每組保留哪一個：shortest 檔名最短（預設）、oldest 最舊、newest 最新")
    p.add_argument("--min-size", type=int, default=1, help="忽略小於這個大小（位元組）的檔案")
    p.add_argument("--move", action="store_true", help=f"把多餘的檔案移到「{DUPLICATES_FOLDER}」資料夾")
    p.add_argument("-y", "--yes", action="store_true", help="不詢問，直接執行")
    p.set_defaults(func=cmd_duplicates)

    p = sub.add_parser("history", help="列出整理紀錄")
    p.set_defaults(func=cmd_history)

    p = sub.add_parser("undo", help="復原一次整理（預設為最近一次）")
    p.add_argument("number", nargs="?", type=int, help="history 指令列出的編號")
    p.add_argument("-y", "--yes", action="store_true", help="不詢問，直接執行")
    p.set_defaults(func=cmd_undo)

    p = sub.add_parser("rules", help="顯示分類規則")
    p.add_argument("--reset", action="store_true", help="恢復預設的分類規則")
    p.set_defaults(func=cmd_rules)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    _fix_stdio()
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv:
        return cmd_gui()
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 0
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\n已中斷。")
        return 130
