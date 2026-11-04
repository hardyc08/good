"""Window interface (tkinter), in Traditional Chinese.

Tabs: 整理檔案 / 找重複檔案 / 分類規則 / 整理紀錄／復原.
Slow work (scanning, hashing, moving) runs in a background thread and
reports back through a queue, so the window never freezes.
"""

from __future__ import annotations

import os
import queue
import sys
import threading
import time
import traceback
from collections import OrderedDict
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import tkinter as tk
import tkinter.font as tkfont
from tkinter import filedialog, messagebox, ttk

from . import APP_TITLE, __version__
from .desktop import known_folders, open_in_file_manager
from .duplicates import DUPLICATES_FOLDER, KEEP_STRATEGIES, DuplicateReport, apply_strategy, find_duplicates, move_duplicates
from .executor import HistoryEntry, Operation, RunResult, history_dir, journal_file_actions, list_history, run_operations, undo
from .planner import DATE_LEVELS, MODES, OrganizeOptions, Plan, build_plan, example_target
from .rules import Category, KeywordRule, Rules, load_rules, normalize_extensions, normalize_keywords, save_rules
from .safety import check_destination, check_folder
from .utils import Cancelled, clean_user_path, format_timestamp, human_size, sanitize_folder

CHECKED = "☑"
UNCHECKED = "☐"
MAX_PREVIEW_ROWS = 5000
PREFERRED_FONTS = [
    "Microsoft JhengHei UI", "Microsoft JhengHei", "PingFang TC", "Heiti TC", "Noto Sans CJK TC",
    "Noto Sans TC", "Source Han Sans TC", "WenQuanYi Zen Hei", "WenQuanYi Micro Hei",
    "Microsoft YaHei UI", "Noto Sans CJK SC",
]
MODE_LABELS = OrderedDict([
    ("type", "依檔案類型"),
    ("date", "依日期"),
    ("type_date", "依類型＋日期"),
    ("extension", "依副檔名"),
])
MIN_SIZES = OrderedDict([("不限", 1), ("10 KB", 10 * 1024), ("100 KB", 100 * 1024),
                         ("1 MB", 1024 ** 2), ("10 MB", 10 * 1024 ** 2)])


def _set_state(widgets: Sequence[tk.Widget], enabled: bool) -> None:
    for widget in widgets:
        try:
            if isinstance(widget, ttk.Combobox):
                widget.configure(state="readonly" if enabled else "disabled")
            else:
                widget.configure(state="normal" if enabled else "disabled")
        except tk.TclError:
            pass


def _scrolled(parent: tk.Widget, widget_factory: Callable[[tk.Widget], tk.Widget],
              horizontal: bool = True) -> tk.Widget:
    """Place a Treeview/Text with scrollbars in *parent* (which uses grid)."""
    widget = widget_factory(parent)
    widget.grid(row=0, column=0, sticky="nsew")
    vbar = ttk.Scrollbar(parent, orient="vertical", command=widget.yview)
    vbar.grid(row=0, column=1, sticky="ns")
    widget.configure(yscrollcommand=vbar.set)
    if horizontal:
        hbar = ttk.Scrollbar(parent, orient="horizontal", command=widget.xview)
        hbar.grid(row=1, column=0, sticky="ew")
        widget.configure(xscrollcommand=hbar.set)
    parent.rowconfigure(0, weight=1)
    parent.columnconfigure(0, weight=1)
    return widget


class FolderField(ttk.Frame):
    """Entry + 「瀏覽…」 button, optionally with shortcuts to common folders."""

    def __init__(self, parent, app: "App", variable: tk.StringVar, title: str, quick: bool = True):
        super().__init__(parent)
        self.app = app
        self.variable = variable
        self.title = title
        self.entry = ttk.Entry(self, textvariable=variable)
        self.entry.grid(row=0, column=0, sticky="ew")
        self.browse_button = ttk.Button(self, text="瀏覽…", command=self.browse)
        self.browse_button.grid(row=0, column=1, padx=(app.px(6), 0))
        self.columnconfigure(0, weight=1)
        self.quick_buttons: List[ttk.Button] = []
        folders = known_folders() if quick else []
        if folders:
            bar = ttk.Frame(self)
            bar.grid(row=0, column=2, sticky="e", padx=(app.px(14), 0))
            ttk.Label(bar, text="常用：", style="Hint.TLabel").pack(side="left")
            for label, path in folders:
                button = ttk.Button(bar, text=label, width=5, command=lambda p=path: variable.set(str(p)))
                button.pack(side="left", padx=(app.px(2), 0))
                self.quick_buttons.append(button)

    def browse(self) -> None:
        current = clean_user_path(self.variable.get())
        initial = str(current) if current and current.is_dir() else str(Path.home())
        chosen = filedialog.askdirectory(parent=self, title=self.title, initialdir=initial, mustexist=False)
        if chosen:
            self.variable.set(os.path.normpath(chosen))

    def set_enabled(self, enabled: bool) -> None:
        _set_state([self.entry, self.browse_button] + self.quick_buttons, enabled)


class EditDialog(tk.Toplevel):
    """Small modal form. fields: [(key, label, initial value, hint)]."""

    def __init__(self, app: "App", title: str, fields: Sequence[Tuple[str, str, str, str]]):
        super().__init__(app.root)
        self.withdraw()
        self.title(title)
        self.transient(app.root)
        self.resizable(False, False)
        self.result: Optional[Dict[str, str]] = None
        frame = ttk.Frame(self, padding=app.px(14))
        frame.pack(fill="both", expand=True)
        self.vars: Dict[str, tk.StringVar] = {}
        first = None
        for row, (key, label, initial, hint) in enumerate(fields):
            ttk.Label(frame, text=label).grid(row=row * 2, column=0, sticky="w", padx=(0, app.px(8)), pady=(app.px(4), 0))
            var = tk.StringVar(value=initial)
            entry = ttk.Entry(frame, textvariable=var, width=56)
            entry.grid(row=row * 2, column=1, sticky="ew", pady=(app.px(4), 0))
            if hint:
                ttk.Label(frame, text=hint, style="Hint.TLabel").grid(row=row * 2 + 1, column=1, sticky="w")
            self.vars[key] = var
            first = first or entry
        buttons = ttk.Frame(frame)
        buttons.grid(row=len(fields) * 2, column=0, columnspan=2, sticky="e", pady=(app.px(12), 0))
        ttk.Button(buttons, text="確定", style="Accent.TButton", command=self._ok).pack(side="left", padx=(0, app.px(6)))
        ttk.Button(buttons, text="取消", command=self.destroy).pack(side="left")
        self.bind("<Return>", lambda _e: self._ok())
        self.bind("<Escape>", lambda _e: self.destroy())
        self.update_idletasks()
        x = app.root.winfo_rootx() + (app.root.winfo_width() - self.winfo_reqwidth()) // 2
        y = app.root.winfo_rooty() + (app.root.winfo_height() - self.winfo_reqheight()) // 3
        self.geometry(f"+{max(0, x)}+{max(0, y)}")
        self.deiconify()
        try:
            self.wait_visibility()
            self.grab_set()
        except tk.TclError:
            pass
        if first is not None:
            first.focus_set()

    def _ok(self) -> None:
        self.result = {key: var.get() for key, var in self.vars.items()}
        self.destroy()

    def show(self) -> Optional[Dict[str, str]]:
        self.wait_window()
        return self.result


# ===================================================================== 整理檔案

class OrganizeTab(ttk.Frame):
    def __init__(self, parent, app: "App"):
        super().__init__(parent, padding=app.px(10))
        self.app = app
        self.plan: Optional[Plan] = None
        px = app.px

        self.source_var = tk.StringVar()
        self.mode_var = tk.StringVar(value="type")
        self.level_var = tk.StringVar(value=DATE_LEVELS["month"])
        self.operation_var = tk.StringVar(value="move")
        self.conflict_var = tk.StringVar(value="rename")
        self.recursive_var = tk.BooleanVar(value=False)
        self.hidden_var = tk.BooleanVar(value=False)
        self.capture_var = tk.BooleanVar(value=True)
        self.cleanup_var = tk.BooleanVar(value=True)
        self.dest_mode_var = tk.StringVar(value="inplace")
        self.dest_var = tk.StringVar()
        self.example_var = tk.StringVar()
        self.summary_var = tk.StringVar()
        self.detail_var = tk.StringVar()

        # ① which folder
        box = ttk.LabelFrame(self, text=" ① 要整理哪個資料夾 ", padding=px(8))
        box.grid(row=0, column=0, columnspan=2, sticky="ew")
        self.source_field = FolderField(box, app, self.source_var, "選擇要整理的資料夾")
        self.source_field.pack(fill="x")
        self.source_field.entry.bind("<Return>", lambda _e: self.preview())

        # ② how to sort
        box = ttk.LabelFrame(self, text=" ② 分類方式 ", padding=px(8))
        box.grid(row=1, column=0, sticky="nsew", pady=(px(8), 0), padx=(0, px(8)))
        self.mode_buttons = []
        for index, (key, text) in enumerate(MODE_LABELS.items()):
            button = ttk.Radiobutton(box, text=text, value=key, variable=self.mode_var)
            button.grid(row=index // 2, column=index % 2, sticky="w", pady=1, padx=(0, px(24)))
            self.mode_buttons.append(button)
        level_row = ttk.Frame(box)
        level_row.grid(row=2, column=0, columnspan=2, sticky="w", pady=(px(6), 0))
        ttk.Label(level_row, text="日期分到：").pack(side="left")
        self.level_combo = ttk.Combobox(level_row, state="readonly", width=7, values=list(DATE_LEVELS.values()),
                                        textvariable=self.level_var)
        self.level_combo.pack(side="left")
        ttk.Label(box, textvariable=self.example_var, style="Hint.TLabel").grid(
            row=3, column=0, columnspan=2, sticky="w", pady=(px(6), 0))

        # ③ options
        box = ttk.LabelFrame(self, text=" ③ 選項 ", padding=px(8))
        box.grid(row=1, column=1, sticky="nsew", pady=(px(8), 0))
        ttk.Label(box, text="動作：").grid(row=0, column=0, sticky="w")
        self.move_radio = ttk.Radiobutton(box, text="移動", value="move", variable=self.operation_var)
        self.copy_radio = ttk.Radiobutton(box, text="複製（原檔保留）", value="copy", variable=self.operation_var)
        self.move_radio.grid(row=0, column=1, sticky="w")
        self.copy_radio.grid(row=0, column=2, sticky="w")
        ttk.Label(box, text="同名檔案：").grid(row=1, column=0, sticky="w")
        self.rename_radio = ttk.Radiobutton(box, text="自動改名", value="rename", variable=self.conflict_var)
        self.skip_radio = ttk.Radiobutton(box, text="略過不動", value="skip", variable=self.conflict_var)
        self.rename_radio.grid(row=1, column=1, sticky="w")
        self.skip_radio.grid(row=1, column=2, sticky="w")
        self.recursive_check = ttk.Checkbutton(box, text="包含子資料夾", variable=self.recursive_var)
        self.cleanup_check = ttk.Checkbutton(box, text="移除整理後變空的資料夾", variable=self.cleanup_var)
        self.capture_check = ttk.Checkbutton(box, text="相片／影片依拍攝日期", variable=self.capture_var)
        self.hidden_check = ttk.Checkbutton(box, text="也整理隱藏檔", variable=self.hidden_var)
        self.recursive_check.grid(row=2, column=0, columnspan=2, sticky="w", pady=(px(4), 1))
        self.cleanup_check.grid(row=2, column=2, sticky="w", pady=(px(4), 1))
        self.capture_check.grid(row=3, column=0, columnspan=2, sticky="w", pady=1)
        self.hidden_check.grid(row=3, column=2, sticky="w", pady=1)
        ttk.Label(box, text="放到：").grid(row=4, column=0, sticky="w", pady=(px(4), 0))
        self.inplace_radio = ttk.Radiobutton(box, text="原資料夾裡", value="inplace", variable=self.dest_mode_var)
        self.other_radio = ttk.Radiobutton(box, text="另一個資料夾", value="other", variable=self.dest_mode_var)
        self.inplace_radio.grid(row=4, column=1, sticky="w", pady=(px(4), 0))
        self.other_radio.grid(row=4, column=2, sticky="w", pady=(px(4), 0))
        self.dest_field = FolderField(box, app, self.dest_var, "選擇要放整理結果的資料夾", quick=False)
        self.dest_field.grid(row=5, column=0, columnspan=3, sticky="ew", pady=(px(4), 0))
        self.dest_field.grid_remove()  # shown only for "另一個資料夾"
        box.columnconfigure(2, weight=1)

        # actions + summary
        actions = ttk.Frame(self)
        actions.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(px(10), px(6)))
        self.preview_button = ttk.Button(actions, text="預覽", style="Accent.TButton", command=self.preview)
        self.run_button = ttk.Button(actions, text="開始整理", style="Accent.TButton", command=self.execute, state="disabled")
        self.preview_button.grid(row=0, column=0, rowspan=2, sticky="w", ipadx=px(10))
        self.run_button.grid(row=0, column=1, rowspan=2, sticky="w", padx=(px(8), 0), ipadx=px(10))
        ttk.Label(actions, textvariable=self.summary_var, style="Summary.TLabel").grid(row=0, column=2, sticky="w", padx=(px(14), 0))
        ttk.Label(actions, textvariable=self.detail_var, style="Hint.TLabel").grid(row=1, column=2, sticky="w", padx=(px(14), 0))
        actions.columnconfigure(2, weight=1)

        # preview list
        table = ttk.Frame(self)
        table.grid(row=3, column=0, columnspan=2, sticky="nsew")
        columns = ("check", "source", "category", "target", "size", "note")
        self.tree: ttk.Treeview = _scrolled(table, lambda p: ttk.Treeview(p, columns=columns, show="headings", selectmode="extended"))
        for column, text, width, anchor, stretch in (
            ("check", "整理", 50, "center", False), ("source", "檔案", 250, "w", True),
            ("category", "類別", 80, "w", False), ("target", "整理後的位置", 300, "w", True),
            ("size", "大小", 80, "e", False), ("note", "說明", 190, "w", False),
        ):
            self.tree.heading(column, text=text, anchor=anchor)
            self.tree.column(column, width=px(width), minwidth=px(40), anchor=anchor, stretch=stretch)
        self.tree.tag_configure("excluded", foreground="#9aa0a6")
        self.tree.tag_configure("renamed", foreground="#b06000")
        self.tree.bind("<Button-1>", self._on_click)
        self.tree.bind("<space>", lambda _e: self._toggle_selection())
        self.tree.bind("<Double-1>", self._on_double_click)

        bottom = ttk.Frame(self)
        bottom.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(px(6), 0))
        self.all_button = ttk.Button(bottom, text="全部勾選", command=lambda: self._set_all(True))
        self.none_button = ttk.Button(bottom, text="全部取消", command=lambda: self._set_all(False))
        self.toggle_button = ttk.Button(bottom, text="勾選／取消選取的項目", command=self._toggle_selection)
        for button in (self.all_button, self.none_button, self.toggle_button):
            button.pack(side="left", padx=(0, px(6)))
        ttk.Label(bottom, text="提示：點清單最左邊的 ☑ 可以排除不想整理的檔案；預覽時不會移動任何檔案。",
                  style="Hint.TLabel").pack(side="left", padx=(px(8), 0))

        self.columnconfigure(0, weight=1)
        self.columnconfigure(1, weight=1)
        self.rowconfigure(3, weight=1)

        for var in (self.source_var, self.mode_var, self.level_var, self.operation_var, self.conflict_var,
                    self.recursive_var, self.hidden_var, self.capture_var, self.cleanup_var,
                    self.dest_mode_var, self.dest_var):
            var.trace_add("write", self._options_changed)
        self._update_controls()
        self._reset_summary()

    # ---------------------------------------------------------------- state

    def _level_key(self) -> str:
        for key, label in DATE_LEVELS.items():
            if label == self.level_var.get():
                return key
        return "month"

    def _update_controls(self) -> None:
        mode = self.mode_var.get()
        uses_date = mode in ("date", "type_date")
        self.example_var.set("整理後會像這樣：" + example_target(mode, self._level_key()))
        busy = self.app.busy
        _set_state([self.level_combo, self.capture_check], uses_date and not busy)
        _set_state([self.cleanup_check], self.recursive_var.get() and self.operation_var.get() == "move" and not busy)
        other = self.dest_mode_var.get() == "other"
        if other:
            self.dest_field.grid()
        else:
            self.dest_field.grid_remove()
        self.dest_field.set_enabled(other and not busy)

    def _options_changed(self, *_args) -> None:
        self._update_controls()
        if self.plan is not None:
            self._clear_preview()
            self.summary_var.set("設定已變更，請重新按「預覽」。")
            self.detail_var.set("")

    def _reset_summary(self) -> None:
        self.summary_var.set("選好資料夾和分類方式後，先按「預覽」看看整理後的樣子。")
        self.detail_var.set("預覽不會移動任何檔案；確認沒問題再按「開始整理」。")

    def invalidate(self) -> None:
        if self.plan is not None:
            self._clear_preview()
            self._reset_summary()

    def set_busy(self, busy: bool) -> None:
        widgets = [self.preview_button, self.all_button, self.none_button, self.toggle_button,
                   self.move_radio, self.copy_radio, self.rename_radio, self.skip_radio,
                   self.recursive_check, self.hidden_check, self.inplace_radio, self.other_radio] + self.mode_buttons
        _set_state(widgets, not busy)
        self.source_field.set_enabled(not busy)
        self._update_controls()
        selected = bool(self.plan and self.plan.selected())
        _set_state([self.run_button], selected and not busy)

    def _clear_preview(self) -> None:
        self.plan = None
        self.tree.delete(*self.tree.get_children())
        _set_state([self.run_button], False)

    def _collect_options(self) -> Optional[OrganizeOptions]:
        destination = None
        if self.dest_mode_var.get() == "other":
            destination = clean_user_path(self.dest_var.get())
            error = check_destination(destination)
            if error:
                self.app.error("目的地不能使用", error)
                return None
        return OrganizeOptions(
            mode=self.mode_var.get(), date_level=self._level_key(), recursive=self.recursive_var.get(),
            include_hidden=self.hidden_var.get(), use_capture_date=self.capture_var.get(),
            operation=self.operation_var.get(), conflict=self.conflict_var.get(),
            remove_empty_dirs=self.cleanup_var.get(), destination=destination,
        )

    # ---------------------------------------------------------------- preview

    def preview(self) -> None:
        source = clean_user_path(self.source_var.get())
        options = self._collect_options()
        if options is None:
            return
        error, warnings = check_folder(source, recursive=options.recursive)
        if error:
            self.app.error("無法整理這個資料夾", error)
            return
        if warnings and not self.app.ask("請確認", "\n\n".join(warnings) + "\n\n要繼續預覽嗎？（預覽不會移動任何檔案）"):
            return
        rules = self.app.rules
        self._clear_preview()
        self.summary_var.set("正在分析…")
        self.detail_var.set("")
        self.app.run_task(lambda cancel, progress: build_plan(source, options, rules, cancel, progress),
                          self._show_plan, "正在掃描檔案…", on_stop=self._reset_summary)

    def _show_plan(self, plan: Plan) -> None:
        self.plan = plan
        self.tree.delete(*self.tree.get_children())
        for index, item in enumerate(plan.items[:MAX_PREVIEW_ROWS]):
            note = item.date_text or item.reason
            if item.renamed:
                note += "（同名，自動改名）"
            self.tree.insert("", "end", iid=str(index), tags=("renamed",) if item.renamed else (),
                             values=(CHECKED, item.rel_source, item.category, item.rel_target,
                                     human_size(item.size), note))
        self._refresh_summary()
        self.app.set_status(f"預覽完成：找到 {len(plan.items):,} 個要整理的檔案")

    def _refresh_summary(self) -> None:
        plan = self.plan
        if plan is None:
            return
        verb = "移動" if plan.options.operation == "move" else "複製"
        selected = plan.selected()
        if not plan.items:
            self.summary_var.set("這個資料夾已經很整齊了，沒有需要整理的檔案。")
        else:
            parts = "、".join(f"{name} {count:,}" for name, count, _ in plan.summary()[:6])
            self.summary_var.set(f"將{verb} {len(selected):,} 個檔案（{human_size(plan.selected_size())}）"
                                 + (f"：{parts}" if parts else ""))
        notes = []
        if plan.already_in_place:
            notes.append(f"{plan.already_in_place:,} 個已在正確位置")
        if plan.conflicts_skipped:
            notes.append(f"{plan.conflicts_skipped:,} 個因同名而略過")
        if plan.scan.hidden_skipped:
            notes.append(f"略過 {plan.scan.hidden_skipped:,} 個隱藏檔")
        if plan.scan.system_skipped:
            notes.append(f"略過 {plan.scan.system_skipped:,} 個系統檔／下載中的檔案")
        if plan.scan.protected_dirs:
            names = "、".join(p.name for p, _ in plan.scan.protected_dirs[:3])
            notes.append(f"略過 {len(plan.scan.protected_dirs)} 個程式／專案資料夾（{names}…）"
                         if len(plan.scan.protected_dirs) > 3 else f"略過程式／專案資料夾：{names}")
        if len(plan.items) > MAX_PREVIEW_ROWS:
            notes.append(f"清單只顯示前 {MAX_PREVIEW_ROWS:,} 筆")
        self.detail_var.set("・".join(notes))
        _set_state([self.run_button], bool(selected) and not self.app.busy)

    def _on_click(self, event) -> Optional[str]:
        if self.plan is None or self.tree.identify("region", event.x, event.y) != "cell":
            return None
        if self.tree.identify_column(event.x) != "#1":
            return None
        row = self.tree.identify_row(event.y)
        if row and not self.app.busy:
            self._set_include([row], None)
            return "break"
        return None

    def _on_double_click(self, event) -> None:
        row = self.tree.identify_row(event.y)
        if self.plan is not None and row and self.tree.identify_column(event.x) != "#1":
            self.app.open_folder(self.plan.items[int(row)].source, select=True)

    def _set_include(self, rows: Sequence[str], value: Optional[bool]) -> None:
        if self.plan is None:
            return
        for row in rows:
            item = self.plan.items[int(row)]
            item.include = (not item.include) if value is None else value
            self._paint_row(row)
        self._refresh_summary()

    def _paint_row(self, row: str) -> None:
        item = self.plan.items[int(row)]
        self.tree.set(row, "check", CHECKED if item.include else UNCHECKED)
        tags = () if item.include else ("excluded",)
        if item.include and item.renamed:
            tags = ("renamed",)
        self.tree.item(row, tags=tags)

    def _toggle_selection(self) -> None:
        if self.plan is not None and not self.app.busy:
            self._set_include(self.tree.selection(), None)

    def _set_all(self, value: bool) -> None:
        if self.plan is None or self.app.busy:
            return
        for item in self.plan.items:
            item.include = value
        for row in self.tree.get_children():
            self._paint_row(row)
        self._refresh_summary()

    # ---------------------------------------------------------------- run

    def execute(self) -> None:
        plan = self.plan
        if plan is None:
            return
        selected = plan.selected()
        if not selected:
            self.app.info("沒有勾選檔案", "請至少勾選一個要整理的檔案。")
            return
        options = plan.options
        verb = "移動" if options.operation == "move" else "複製"
        where = "原資料夾裡的分類資料夾" if plan.destination == plan.source else f"「{plan.destination}」"
        message = (f"即將{verb} {len(selected):,} 個檔案（{human_size(plan.selected_size())}）到{where}。\n\n"
                   "整理完如果不滿意，可以到「整理紀錄／復原」分頁一鍵復原。\n\n要開始整理嗎？")
        if not self.app.ask("開始整理", message):
            return
        operations = [Operation(item.source, item.target) for item in selected]
        cleanup = plan.source if (options.recursive and options.remove_empty_dirs and options.operation == "move") else None
        title = f"{MODES[options.mode]}・{verb}"

        def work(cancel, progress):
            return run_operations(operations, kind="organize", title=title, source=plan.source,
                                  operation=options.operation, conflict=options.conflict,
                                  cleanup_root=cleanup, cancel=cancel, progress=progress)

        self.app.run_task(work, lambda result: self._after_run(plan, result), f"正在{verb}檔案…")

    def _after_run(self, plan: Plan, result: RunResult) -> None:
        verb = "移動" if plan.options.operation == "move" else "複製"
        self._clear_preview()
        self.app.history_tab.refresh()
        self.app.duplicates_tab.invalidate()
        headline = f"已{verb} {result.done:,} 個檔案（{human_size(result.bytes)}）。"
        lines = ["已取消，剩下的檔案沒有處理。" + headline if result.cancelled else headline]
        if result.renamed:
            lines.append(f"{result.renamed:,} 個檔案因為同名而自動改名。")
        if result.removed_dirs:
            lines.append(f"移除了 {result.removed_dirs:,} 個變空的資料夾。")
        if result.skipped:
            lines.append(f"略過 {len(result.skipped):,} 個檔案（例如：{Path(result.skipped[0][0]).name}：{result.skipped[0][1]}）。")
        if result.errors:
            lines.append(f"有 {len(result.errors):,} 個檔案沒有成功：")
            lines += [f"  • {Path(path).name}：{why}" for path, why in result.errors[:8]]
            if len(result.errors) > 8:
                lines.append(f"  …還有 {len(result.errors) - 8:,} 個")
        lines.append("\n不滿意的話，可以到「整理紀錄／復原」分頁復原。")
        self.summary_var.set(headline)
        self.detail_var.set("想恢復原狀：到「整理紀錄／復原」分頁按「復原」。")
        self.app.set_status("已取消" if result.cancelled else "整理完成")
        title = "整理完成" if not result.errors else "整理完成（有部分問題）"
        if self.app.ask(title, "\n".join(lines) + "\n\n要開啟資料夾看看嗎？", icon="info"):
            self.app.open_folder(plan.destination)


# ===================================================================== 找重複檔案

class DuplicatesTab(ttk.Frame):
    KEEP = "保留"
    REMOVE = "移走"

    def __init__(self, parent, app: "App"):
        super().__init__(parent, padding=app.px(10))
        self.app = app
        self.report: Optional[DuplicateReport] = None
        px = app.px
        self.folder_var = tk.StringVar()
        self.recursive_var = tk.BooleanVar(value=True)
        self.hidden_var = tk.BooleanVar(value=False)
        self.min_size_var = tk.StringVar(value="不限")
        self.keep_var = tk.StringVar(value=list(KEEP_STRATEGIES.values())[0])
        self.summary_var = tk.StringVar(value="選一個資料夾，找出內容完全一樣的檔案（不論檔名）。")

        box = ttk.LabelFrame(self, text=" 要檢查的資料夾 ", padding=px(8))
        box.grid(row=0, column=0, sticky="ew")
        self.folder_field = FolderField(box, app, self.folder_var, "選擇要檢查的資料夾")
        self.folder_field.pack(fill="x")
        options = ttk.Frame(box)
        options.pack(fill="x", pady=(px(8), 0))
        self.recursive_check = ttk.Checkbutton(options, text="包含子資料夾", variable=self.recursive_var)
        self.hidden_check = ttk.Checkbutton(options, text="包含隱藏檔", variable=self.hidden_var)
        self.recursive_check.pack(side="left")
        self.hidden_check.pack(side="left", padx=(px(12), 0))
        ttk.Label(options, text="忽略小於").pack(side="left", padx=(px(16), px(4)))
        self.size_combo = ttk.Combobox(options, state="readonly", width=7, values=list(MIN_SIZES), textvariable=self.min_size_var)
        self.size_combo.pack(side="left")
        ttk.Label(options, text="的檔案").pack(side="left", padx=(px(4), 0))
        ttk.Label(options, text="每組：").pack(side="left", padx=(px(16), px(4)))
        self.keep_combo = ttk.Combobox(options, state="readonly", width=34, values=list(KEEP_STRATEGIES.values()), textvariable=self.keep_var)
        self.keep_combo.pack(side="left")
        self.keep_var.trace_add("write", self._strategy_changed)

        actions = ttk.Frame(self)
        actions.grid(row=1, column=0, sticky="ew", pady=(px(10), px(6)))
        self.search_button = ttk.Button(actions, text="尋找重複檔案", style="Accent.TButton", command=self.search)
        self.move_button = ttk.Button(actions, text="移走標記的重複檔案", style="Accent.TButton", command=self.move, state="disabled")
        self.search_button.pack(side="left", ipadx=px(10))
        self.move_button.pack(side="left", padx=(px(8), 0), ipadx=px(10))
        ttk.Label(actions, textvariable=self.summary_var, style="Summary.TLabel").pack(side="left", padx=(px(14), 0))

        table = ttk.Frame(self)
        table.grid(row=2, column=0, sticky="nsew")
        self.tree: ttk.Treeview = _scrolled(table, lambda p: ttk.Treeview(p, columns=("action", "size", "modified"), show="tree headings"))
        self.tree.heading("#0", text="檔案位置", anchor="w")
        self.tree.column("#0", width=px(560), stretch=True)
        for column, text, width, anchor in (("action", "處理方式", 90, "center"), ("size", "大小", 90, "e"),
                                            ("modified", "修改日期", 150, "w")):
            self.tree.heading(column, text=text, anchor=anchor)
            self.tree.column(column, width=px(width), anchor=anchor, stretch=False)
        self.tree.tag_configure("group", font=app.font_bold)
        self.tree.tag_configure("remove", foreground="#c5221f")
        self.tree.bind("<Button-1>", self._on_click)
        self.tree.bind("<Double-1>", self._on_double_click)

        ttk.Label(self, style="Hint.TLabel", text=(
            f"「移走」的檔案會被移到「{DUPLICATES_FOLDER}」資料夾（不會刪除），確認沒問題後再自行刪除，也可以在「整理紀錄」復原。\n"
            "點「處理方式」可以切換保留／移走；在檔案上點兩下可以在檔案總管中顯示它。"),
        ).grid(row=3, column=0, sticky="w", pady=(px(6), 0))
        self.columnconfigure(0, weight=1)
        self.rowconfigure(2, weight=1)

    def set_busy(self, busy: bool) -> None:
        _set_state([self.search_button, self.recursive_check, self.hidden_check, self.size_combo, self.keep_combo], not busy)
        self.folder_field.set_enabled(not busy)
        _set_state([self.move_button], bool(self.report and self.report.groups) and not busy)

    def invalidate(self) -> None:
        if self.report is not None:
            self.report = None
            self.tree.delete(*self.tree.get_children())
            self.summary_var.set("資料夾內容已變更，請重新尋找。")
            _set_state([self.move_button], False)

    def _strategy_key(self) -> str:
        for key, label in KEEP_STRATEGIES.items():
            if label == self.keep_var.get():
                return key
        return "shortest"

    def search(self) -> None:
        folder = clean_user_path(self.folder_var.get())
        error, _ = check_folder(folder, recursive=self.recursive_var.get())
        if error:
            self.app.error("無法檢查這個資料夾", error)
            return
        recursive, hidden = self.recursive_var.get(), self.hidden_var.get()
        min_size, strategy = MIN_SIZES.get(self.min_size_var.get(), 1), self._strategy_key()
        self.report = None
        self.tree.delete(*self.tree.get_children())
        self.summary_var.set("正在尋找…")
        self.app.run_task(
            lambda cancel, progress: find_duplicates(folder, recursive=recursive, include_hidden=hidden,
                                                     min_size=min_size, strategy=strategy,
                                                     cancel=cancel, progress=progress),
            self._show_report, "正在掃描檔案…",
            on_stop=lambda: self.summary_var.set("已取消。"))

    def _show_report(self, report: DuplicateReport) -> None:
        self.report = report
        self._fill_tree()
        self.app.set_status("尋找完成")

    def _fill_tree(self) -> None:
        report = self.report
        self.tree.delete(*self.tree.get_children())
        if report is None:
            return
        for g, group in enumerate(report.groups):
            parent = self.tree.insert("", "end", iid=f"g{g}", open=True, tags=("group",),
                                      text=f"第 {g + 1} 組：{len(group.files)} 個相同的檔案，每個 {human_size(group.size)}")
            for f, entry in enumerate(group.files):
                self.tree.insert(parent, "end", iid=f"g{g}f{f}", text=entry.rel,
                                 values=("", human_size(entry.size), format_timestamp(entry.mtime)))
                self._paint(g, f)
        self._refresh_summary()

    def _paint(self, g: int, f: int) -> None:
        removing = f in self.report.groups[g].remove
        self.tree.set(f"g{g}f{f}", "action", self.REMOVE if removing else self.KEEP)
        self.tree.item(f"g{g}f{f}", tags=("remove",) if removing else ())

    def _refresh_summary(self) -> None:
        report = self.report
        if report is None:
            return
        if not report.groups:
            self.summary_var.set(f"在 {len(report.scan.files):,} 個檔案中，沒有找到內容相同的檔案。")
        else:
            count = sum(len(g.remove) for g in report.groups)
            size = sum(len(g.remove) * g.size for g in report.groups)
            self.summary_var.set(f"找到 {len(report.groups):,} 組重複檔案；標記移走 {count:,} 個，可省下 {human_size(size)}")
        _set_state([self.move_button], any(g.remove for g in report.groups) and not self.app.busy)

    def _strategy_changed(self, *_args) -> None:
        if self.report is not None:
            apply_strategy(self.report.groups, self._strategy_key())
            self._fill_tree()

    def _parse(self, row: str) -> Optional[Tuple[int, int]]:
        if not row.startswith("g") or "f" not in row:
            return None
        g, f = row[1:].split("f")
        return int(g), int(f)

    def _on_click(self, event) -> Optional[str]:
        if self.report is None or self.app.busy or self.tree.identify_column(event.x) != "#1":
            return None
        position = self._parse(self.tree.identify_row(event.y))
        if position is None:
            return None
        g, f = position
        group = self.report.groups[g]
        if f in group.remove:
            group.remove.remove(f)
        elif len(group.remove) + 1 >= len(group.files):
            self.app.info("至少保留一個", "每一組至少要保留一個檔案。")
            return "break"
        else:
            group.remove.append(f)
        self._paint(g, f)
        self._refresh_summary()
        return "break"

    def _on_double_click(self, event) -> None:
        position = self._parse(self.tree.identify_row(event.y))
        if self.report is not None and position is not None:
            g, f = position
            self.app.open_folder(self.report.groups[g].files[f].path, select=True)

    def move(self) -> None:
        report = self.report
        if report is None:
            return
        count = sum(len(g.remove) for g in report.groups)
        size = sum(len(g.remove) * g.size for g in report.groups)
        if not count:
            return
        target = report.root / DUPLICATES_FOLDER
        if not self.app.ask("移走重複檔案", f"要把標記「移走」的 {count:,} 個檔案（{human_size(size)}）移到\n「{target}」嗎？\n\n"
                                         "檔案不會被刪除，之後也可以在「整理紀錄／復原」分頁復原。"):
            return
        self.app.run_task(lambda cancel, progress: move_duplicates(report, cancel, progress),
                          self._after_move, "正在移動重複檔案…")

    def _after_move(self, result: RunResult) -> None:
        root = self.report.root if self.report else None
        self.report = None
        self.tree.delete(*self.tree.get_children())
        _set_state([self.move_button], False)
        self.app.history_tab.refresh()
        self.app.organize_tab.invalidate()
        text = f"已把 {result.done:,} 個重複檔案移到「{DUPLICATES_FOLDER}」資料夾。"
        if result.errors:
            text += f"\n\n有 {len(result.errors)} 個檔案沒有成功：\n" + "\n".join(
                f"  • {Path(p).name}：{why}" for p, why in result.errors[:8])
        self.summary_var.set(text.splitlines()[0])
        self.app.set_status("完成")
        if root is not None and result.done and self.app.ask("完成", text + "\n\n要開啟「重複檔案」資料夾看看嗎？", icon="info"):
            self.app.open_folder(root / DUPLICATES_FOLDER)


# ===================================================================== 分類規則

class RulesTab(ttk.Frame):
    def __init__(self, parent, app: "App"):
        super().__init__(parent, padding=app.px(10))
        self.app = app
        px = app.px
        self.categories: List[Category] = []
        self.keyword_rules: List[KeywordRule] = []
        self.other_var = tk.StringVar()
        self.test_var = tk.StringVar(value="螢幕擷取畫面 2024-05-01.png")
        self.test_result_var = tk.StringVar()
        self.state_var = tk.StringVar()
        self.dirty = False

        ttk.Label(self, wraplength=px(1000), justify="left", text=(
            "「依檔案類型」整理時，程式會先看「檔名關鍵字」，再看「副檔名」，決定檔案要放進哪個資料夾；都不符合的放到「其他」。"
            "資料夾名稱可以用「/」建立子資料夾，例如「工作/發票」。"),
        ).grid(row=0, column=0, columnspan=2, sticky="w")

        box = ttk.LabelFrame(self, text=" 依副檔名分類 ", padding=px(8))
        box.grid(row=1, column=0, columnspan=2, sticky="nsew", pady=(px(8), 0))
        table = ttk.Frame(box)
        table.grid(row=0, column=0, sticky="nsew")
        self.cat_tree: ttk.Treeview = _scrolled(table, lambda p: ttk.Treeview(p, columns=("folder", "exts"), show="headings", height=8, selectmode="browse"), horizontal=False)
        self.cat_tree.heading("folder", text="資料夾", anchor="w")
        self.cat_tree.heading("exts", text="副檔名", anchor="w")
        self.cat_tree.column("folder", width=px(140), stretch=False)
        self.cat_tree.column("exts", width=px(700), stretch=True)
        self.cat_tree.bind("<Double-1>", lambda _e: self.edit_category())
        buttons = ttk.Frame(box)
        buttons.grid(row=0, column=1, sticky="n", padx=(px(8), 0))
        for text, command in (("新增", self.add_category), ("編輯", self.edit_category), ("刪除", self.delete_category),
                              ("上移", lambda: self.move_category(-1)), ("下移", lambda: self.move_category(1))):
            ttk.Button(buttons, text=text, command=command).pack(fill="x", pady=(0, px(4)))
        box.columnconfigure(0, weight=1)
        box.rowconfigure(0, weight=1)

        box = ttk.LabelFrame(self, text=" 依檔名關鍵字分類（優先於副檔名） ", padding=px(8))
        box.grid(row=2, column=0, columnspan=2, sticky="nsew", pady=(px(8), 0))
        table = ttk.Frame(box)
        table.grid(row=0, column=0, sticky="nsew")
        self.kw_tree: ttk.Treeview = _scrolled(table, lambda p: ttk.Treeview(p, columns=("folder", "keywords", "exts"), show="headings", height=3, selectmode="browse"), horizontal=False)
        for column, text, width, stretch in (("folder", "資料夾", 140, False), ("keywords", "檔名包含（任一個）", 460, True),
                                             ("exts", "只套用在這些副檔名（空白＝全部）", 240, True)):
            self.kw_tree.heading(column, text=text, anchor="w")
            self.kw_tree.column(column, width=px(width), stretch=stretch)
        self.kw_tree.bind("<Double-1>", lambda _e: self.edit_keyword())
        buttons = ttk.Frame(box)
        buttons.grid(row=0, column=1, sticky="n", padx=(px(8), 0))
        for text, command in (("新增", self.add_keyword), ("編輯", self.edit_keyword), ("刪除", self.delete_keyword)):
            ttk.Button(buttons, text=text, command=command).pack(fill="x", pady=(0, px(4)))
        box.columnconfigure(0, weight=1)
        box.rowconfigure(0, weight=1)

        row = ttk.Frame(self)
        row.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(px(10), 0))
        ttk.Label(row, text="其他檔案放到：").pack(side="left")
        ttk.Entry(row, textvariable=self.other_var, width=14).pack(side="left")
        ttk.Label(row, text="試試看，輸入檔名：").pack(side="left", padx=(px(24), px(4)))
        ttk.Entry(row, textvariable=self.test_var, width=30).pack(side="left")
        ttk.Label(row, textvariable=self.test_result_var, style="Summary.TLabel").pack(side="left", padx=(px(8), 0))

        row = ttk.Frame(self)
        row.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(px(10), 0))
        self.save_button = ttk.Button(row, text="儲存規則", style="Accent.TButton", command=self.save)
        self.save_button.pack(side="left", ipadx=px(10))
        ttk.Button(row, text="恢復預設值", command=self.reset).pack(side="left", padx=(px(8), 0))
        ttk.Label(row, textvariable=self.state_var, style="Hint.TLabel").pack(side="left", padx=(px(12), 0))

        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=3)
        self.rowconfigure(2, weight=1)
        self.other_var.trace_add("write", lambda *_: self._changed())
        self.test_var.trace_add("write", lambda *_: self._update_test())
        self.load(app.rules)

    def set_busy(self, busy: bool) -> None:
        _set_state([self.save_button], not busy)

    def load(self, rules: Rules) -> None:
        copy = rules.copy()
        self.categories = copy.categories
        self.keyword_rules = copy.keyword_rules
        self.other_var.set(copy.other_folder)
        self._refresh()
        self._set_dirty(False)

    def current_rules(self) -> Rules:
        return Rules([Category(c.name, list(c.extensions)) for c in self.categories],
                     [KeywordRule(r.folder, list(r.keywords), list(r.extensions)) for r in self.keyword_rules],
                     self.other_var.get())

    def _refresh(self, select_cat: Optional[int] = None, select_kw: Optional[int] = None) -> None:
        self.cat_tree.delete(*self.cat_tree.get_children())
        for i, category in enumerate(self.categories):
            self.cat_tree.insert("", "end", iid=str(i), values=(category.name, " ".join(category.extensions)))
        self.kw_tree.delete(*self.kw_tree.get_children())
        for i, rule in enumerate(self.keyword_rules):
            self.kw_tree.insert("", "end", iid=str(i), values=(rule.folder, "、".join(rule.keywords), " ".join(rule.extensions)))
        if select_cat is not None and 0 <= select_cat < len(self.categories):
            self.cat_tree.selection_set(str(select_cat))
            self.cat_tree.see(str(select_cat))
        if select_kw is not None and 0 <= select_kw < len(self.keyword_rules):
            self.kw_tree.selection_set(str(select_kw))
        self._update_test()

    def _set_dirty(self, dirty: bool) -> None:
        self.dirty = dirty
        self.state_var.set("有尚未儲存的變更" if dirty else "規則已儲存，會用在「依檔案類型」與「依類型＋日期」整理。")

    def _changed(self) -> None:
        self._set_dirty(True)
        self._update_test()

    def _update_test(self) -> None:
        name = self.test_var.get().strip()
        if not name:
            self.test_result_var.set("")
            return
        folder, reason = self.current_rules().classify(name)
        self.test_result_var.set(f"→ 放到「{folder}」（{reason}）")

    @staticmethod
    def _selected(tree: ttk.Treeview) -> Optional[int]:
        selection = tree.selection()
        return int(selection[0]) if selection else None

    def _category_dialog(self, title: str, category: Optional[Category]) -> Optional[Category]:
        result = EditDialog(self.app, title, [
            ("name", "資料夾名稱：", category.name if category else "", "例如：圖片、工作/報表"),
            ("exts", "副檔名：", " ".join(category.extensions) if category else "", "用空白或逗號分隔，例如：jpg png gif"),
        ]).show()
        if result is None:
            return None
        name, exts = sanitize_folder(result["name"]), normalize_extensions(result["exts"])
        if not name or not exts:
            self.app.error("資料不完整", "請填寫資料夾名稱和至少一個副檔名。")
            return None
        return Category(name, exts)

    def add_category(self) -> None:
        category = self._category_dialog("新增分類", None)
        if category:
            self.categories.append(category)
            self._refresh(select_cat=len(self.categories) - 1)
            self._changed()

    def edit_category(self) -> None:
        index = self._selected(self.cat_tree)
        if index is None:
            return
        category = self._category_dialog("編輯分類", self.categories[index])
        if category:
            self.categories[index] = category
            self._refresh(select_cat=index)
            self._changed()

    def delete_category(self) -> None:
        index = self._selected(self.cat_tree)
        if index is not None and self.app.ask("刪除分類", f"要刪除「{self.categories[index].name}」這個分類嗎？"):
            del self.categories[index]
            self._refresh(select_cat=min(index, len(self.categories) - 1))
            self._changed()

    def move_category(self, delta: int) -> None:
        index = self._selected(self.cat_tree)
        if index is None or not 0 <= index + delta < len(self.categories):
            return
        self.categories[index], self.categories[index + delta] = self.categories[index + delta], self.categories[index]
        self._refresh(select_cat=index + delta)
        self._changed()

    def _keyword_dialog(self, title: str, rule: Optional[KeywordRule]) -> Optional[KeywordRule]:
        result = EditDialog(self.app, title, [
            ("folder", "資料夾名稱：", rule.folder if rule else "", "例如：文件/發票"),
            ("keywords", "檔名包含：", "、".join(rule.keywords) if rule else "", "多個關鍵字用逗號或頓號分隔，例如：發票、收據、invoice"),
            ("exts", "只套用在：", " ".join(rule.extensions) if rule else "", "副檔名，可留空（代表所有檔案），例如：pdf jpg"),
        ]).show()
        if result is None:
            return None
        folder, keywords = sanitize_folder(result["folder"]), normalize_keywords(result["keywords"])
        if not folder or not keywords:
            self.app.error("資料不完整", "請填寫資料夾名稱和至少一個關鍵字。")
            return None
        return KeywordRule(folder, keywords, normalize_extensions(result["exts"]))

    def add_keyword(self) -> None:
        rule = self._keyword_dialog("新增關鍵字規則", None)
        if rule:
            self.keyword_rules.append(rule)
            self._refresh(select_kw=len(self.keyword_rules) - 1)
            self._changed()

    def edit_keyword(self) -> None:
        index = self._selected(self.kw_tree)
        if index is None:
            return
        rule = self._keyword_dialog("編輯關鍵字規則", self.keyword_rules[index])
        if rule:
            self.keyword_rules[index] = rule
            self._refresh(select_kw=index)
            self._changed()

    def delete_keyword(self) -> None:
        index = self._selected(self.kw_tree)
        if index is not None and self.app.ask("刪除規則", f"要刪除「{self.keyword_rules[index].folder}」這條關鍵字規則嗎？"):
            del self.keyword_rules[index]
            self._refresh()
            self._changed()

    def save(self) -> None:
        rules = self.current_rules()
        try:
            save_rules(rules)
        except OSError as exc:
            self.app.error("無法儲存", f"儲存規則時發生錯誤：{exc}")
            return
        self.app.rules = rules
        self.load(rules)
        self.app.organize_tab.invalidate()
        self.app.set_status("規則已儲存")

    def reset(self) -> None:
        if self.app.ask("恢復預設值", "要把分類規則恢復成預設值嗎？（按「儲存規則」後才會生效）"):
            self.load(Rules.default())
            self._set_dirty(True)


# ===================================================================== 整理紀錄／復原

class HistoryTab(ttk.Frame):
    def __init__(self, parent, app: "App"):
        super().__init__(parent, padding=app.px(10))
        self.app = app
        self.entries: List[HistoryEntry] = []
        px = app.px
        ttk.Label(self, text="每次整理都會留下紀錄。選一筆按「復原」，就會把那次移動的檔案全部放回原位。",
                  wraplength=px(1000), justify="left").grid(row=0, column=0, sticky="w")
        table = ttk.Frame(self)
        table.grid(row=1, column=0, sticky="nsew", pady=(px(8), 0))
        columns = ("time", "title", "folder", "count", "status")
        self.tree: ttk.Treeview = _scrolled(table, lambda p: ttk.Treeview(p, columns=columns, show="headings", selectmode="browse"))
        for column, text, width, anchor, stretch in (
            ("time", "時間", 160, "w", False), ("title", "動作", 170, "w", False), ("folder", "資料夾", 420, "w", True),
            ("count", "檔案數", 80, "e", False), ("status", "狀態", 210, "w", False),
        ):
            self.tree.heading(column, text=text, anchor=anchor)
            self.tree.column(column, width=px(width), anchor=anchor, stretch=stretch)
        self.tree.tag_configure("undone", foreground="#9aa0a6")
        self.tree.bind("<Double-1>", lambda _e: self.show_details())
        buttons = ttk.Frame(self)
        buttons.grid(row=2, column=0, sticky="ew", pady=(px(8), 0))
        self.undo_button = ttk.Button(buttons, text="復原這次整理", style="Accent.TButton", command=self.undo_selected)
        self.undo_button.pack(side="left", ipadx=px(10))
        self.details_button = ttk.Button(buttons, text="查看明細", command=self.show_details)
        self.details_button.pack(side="left", padx=(px(8), 0))
        ttk.Button(buttons, text="重新整理列表", command=self.refresh).pack(side="left", padx=(px(8), 0))
        ttk.Button(buttons, text="開啟紀錄資料夾", command=lambda: self.app.open_folder(history_dir())).pack(side="left", padx=(px(8), 0))
        ttk.Label(self, style="Hint.TLabel", text="復原時，整理過程中建立、現在又變空的資料夾也會一併移除；被你修改過的複本不會被刪除。").grid(
            row=3, column=0, sticky="w", pady=(px(6), 0))
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)
        self.refresh()

    def set_busy(self, busy: bool) -> None:
        _set_state([self.undo_button], not busy)

    def refresh(self) -> None:
        self.entries = list_history()
        self.tree.delete(*self.tree.get_children())
        for i, entry in enumerate(self.entries):
            self.tree.insert("", "end", iid=str(i), tags=("undone",) if entry.undo_state == "undone" else (),
                             values=(entry.created.replace("T", " "), entry.title, entry.source,
                                     f"{entry.count:,}", entry.status))
        if self.entries:
            self.tree.selection_set("0")

    def _selected(self) -> Optional[HistoryEntry]:
        selection = self.tree.selection()
        return self.entries[int(selection[0])] if selection else None

    def undo_selected(self) -> None:
        entry = self._selected()
        if entry is None:
            self.app.info("請先選擇", "請先在清單中選一筆紀錄。")
            return
        if not entry.can_undo:
            self.app.info("無法復原", "這筆紀錄已經復原過了。" if entry.undo_state == "undone" else "這筆紀錄沒有可以復原的檔案。")
            return
        verb = "移回原本的位置" if entry.operation == "move" else "刪除（只刪除當時建立、之後沒有被修改的複本）"
        if not self.app.ask("復原", f"{entry.created.replace('T', ' ')}　{entry.title}\n{entry.source}\n\n"
                                  f"要把這次處理的 {entry.count:,} 個檔案{verb}嗎？"):
            return
        self.app.run_task(lambda cancel, progress: undo(entry.path, progress=progress), self._after_undo,
                          "正在復原…", cancellable=False)

    def _after_undo(self, result) -> None:
        self.refresh()
        self.app.organize_tab.invalidate()
        self.app.duplicates_tab.invalidate()
        lines = [f"已復原 {result.restored:,} 個檔案。"]
        if result.renamed:
            lines.append(f"\n{len(result.renamed)} 個檔案的原位置已經有同名檔案，改用新名稱放回：")
            lines += [f"  • {Path(new).name}" for _old, new in result.renamed[:6]]
        if result.problems:
            lines.append(f"\n有 {len(result.problems)} 個問題：")
            lines += [f"  • {Path(path).name}：{why}" for path, why in result.problems[:8]]
        if result.retry_later:
            lines.append(f"\n有 {result.retry_later} 個檔案暫時無法移回（可能正在使用中），關閉相關程式後可以再按一次「復原」。")
        self.app.set_status("復原完成")
        self.app.info("復原完成" if not result.problems else "復原完成（有部分問題）", "\n".join(lines))

    def show_details(self) -> None:
        entry = self._selected()
        if entry is None:
            return
        window = tk.Toplevel(self.app.root)
        window.title(f"整理明細 - {entry.created.replace('T', ' ')}")
        window.transient(self.app.root)
        window.geometry(f"{self.app.px(900)}x{self.app.px(520)}")
        frame = ttk.Frame(window, padding=self.app.px(8))
        frame.pack(fill="both", expand=True)
        holder = ttk.Frame(frame)
        holder.pack(fill="both", expand=True)
        text: tk.Text = _scrolled(holder, lambda p: tk.Text(p, wrap="none", font="TkDefaultFont"))
        try:
            actions = journal_file_actions(entry.path)
        except OSError as exc:
            actions = []
            text.insert("end", f"無法讀取紀錄：{exc}\n")
        text.insert("end", f"{entry.title}　{entry.source}　共 {len(actions):,} 個檔案　狀態：{entry.status}\n\n")
        for action in actions[:5000]:
            verb = "移動" if action.get("type") == "move" else "複製"
            text.insert("end", f"{verb}　{action.get('src')}\n　　→ {action.get('dst')}\n")
        if len(actions) > 5000:
            text.insert("end", f"\n…還有 {len(actions) - 5000:,} 筆\n")
        text.configure(state="disabled")
        ttk.Button(frame, text="關閉", command=window.destroy).pack(anchor="e", pady=(self.app.px(8), 0))


# ===================================================================== application

class App:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.events: "queue.Queue[Tuple[str, object]]" = queue.Queue()
        self.busy = False
        self.cancel_event: Optional[threading.Event] = None
        self.closing = False
        self._last_progress = 0.0
        self._on_stop: Optional[Callable[[], None]] = None
        self.rules = load_rules()
        self.scale = max(1.0, root.winfo_fpixels("1i") / 96.0)

        root.title(f"{APP_TITLE} {__version__}")
        self._setup_style()
        self._set_icon()
        self._place_window(1180, 860)

        outer = ttk.Frame(root, padding=self.px(10))
        outer.pack(fill="both", expand=True)
        if root.winfo_screenheight() >= self.px(800):  # short screens: keep the room for the file list
            header = ttk.Frame(outer)
            header.pack(fill="x", pady=(0, self.px(6)))
            ttk.Label(header, text=APP_TITLE, style="Title.TLabel").pack(side="left")
            ttk.Label(header, text="依類型或日期自動分類檔案・找出重複檔案・每次整理都能一鍵復原",
                      style="Hint.TLabel").pack(side="left", padx=(self.px(14), 0), pady=(self.px(6), 0))

        # The status bar is packed before the tabs so it always keeps its space.
        status = ttk.Frame(outer)
        status.pack(side="bottom", fill="x", pady=(self.px(8), 0))
        self.status_var = tk.StringVar(value="準備就緒")
        ttk.Label(status, textvariable=self.status_var).pack(side="left", fill="x", expand=True)
        self.cancel_button = ttk.Button(status, text="取消", command=self.cancel, state="disabled")
        self.cancel_button.pack(side="right")
        self.progress = ttk.Progressbar(status, mode="determinate", maximum=100, length=self.px(240))
        self.progress.pack(side="right", padx=self.px(8))

        self.notebook = ttk.Notebook(outer)
        self.notebook.pack(fill="both", expand=True)
        self.organize_tab = OrganizeTab(self.notebook, self)
        self.duplicates_tab = DuplicatesTab(self.notebook, self)
        self.rules_tab = RulesTab(self.notebook, self)
        self.history_tab = HistoryTab(self.notebook, self)
        self.tabs = [self.organize_tab, self.duplicates_tab, self.rules_tab, self.history_tab]
        for tab, text in zip(self.tabs, ("整理檔案", "找重複檔案", "分類規則", "整理紀錄／復原")):
            self.notebook.add(tab, text=f"  {text}  ")

        root.protocol("WM_DELETE_WINDOW", self.on_close)
        self._poll_job: Optional[str] = root.after(80, self._poll)

    # ---------------------------------------------------------------- look

    def px(self, value: float) -> int:
        return int(round(value * self.scale))

    def _setup_style(self) -> None:
        style = ttk.Style(self.root)
        if sys.platform.startswith("linux") and "clam" in style.theme_names():
            style.theme_use("clam")
        families = set(tkfont.families(self.root))
        family = next((name for name in PREFERRED_FONTS if name in families), None)
        for name in ("TkDefaultFont", "TkTextFont", "TkMenuFont", "TkHeadingFont", "TkCaptionFont",
                     "TkSmallCaptionFont", "TkIconFont", "TkTooltipFont"):
            try:
                font = tkfont.nametofont(name)
            except tk.TclError:
                continue
            if family:
                font.configure(family=family)
            if sys.platform == "win32":
                font.configure(size=10)
        base = tkfont.nametofont("TkDefaultFont")
        size = int(base.cget("size")) or 10
        self.font_title = base.copy()
        self.font_title.configure(size=int(size * 1.45), weight="bold")
        self.font_bold = base.copy()
        self.font_bold.configure(weight="bold")
        style.configure("Title.TLabel", font=self.font_title, foreground="#1a5fb4")
        style.configure("Hint.TLabel", foreground="#5f6368")
        style.configure("Summary.TLabel", foreground="#1a5fb4", font=self.font_bold)
        style.configure("Accent.TButton", font=self.font_bold)
        style.configure("Treeview", rowheight=int(base.metrics("linespace") * 1.4))
        style.configure("Treeview.Heading", font=self.font_bold)

        def fixed_map(option: str):  # Tk 8.6.9 bug: tag colours ignored in Treeview
            return [e for e in style.map("Treeview", query_opt=option) if e[:2] != ("!disabled", "!selected")]

        style.map("Treeview", foreground=fixed_map("foreground"), background=fixed_map("background"))

    def _set_icon(self) -> None:
        try:
            icon = tk.PhotoImage(width=32, height=32)
            icon.put("#d9902f", to=(2, 6, 14, 10))
            icon.put("#d9902f", to=(2, 9, 30, 28))
            icon.put("#f6c453", to=(2, 12, 30, 28))
            icon.put("#3d7dd8", to=(7, 15, 25, 17))
            icon.put("#3fa66b", to=(7, 19, 21, 21))
            icon.put("#e05d44", to=(7, 23, 17, 25))
            self.root.iconphoto(True, icon)
            self._icon = icon
        except tk.TclError:
            pass

    def _place_window(self, width: int, height: int) -> None:
        screen_w, screen_h = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
        w = min(self.px(width), int(screen_w * 0.94))
        h = min(self.px(height), int(screen_h * 0.9))
        x = max(0, (screen_w - w) // 2)
        y = max(0, (screen_h - h) // 3)
        self.root.geometry(f"{w}x{h}+{x}+{y}")
        self.root.minsize(min(w, self.px(900)), min(h, self.px(640)))

    # ---------------------------------------------------------------- dialogs (wrapped so tests can stub them)

    def ask(self, title: str, message: str, icon: str = "question") -> bool:
        return bool(messagebox.askyesno(title, message, icon=icon, parent=self.root))

    def info(self, title: str, message: str) -> None:
        messagebox.showinfo(title, message, parent=self.root)

    def error(self, title: str, message: str) -> None:
        messagebox.showerror(title, message, parent=self.root)

    def open_folder(self, path: Path, select: bool = False) -> None:
        try:
            open_in_file_manager(path, select=select)
        except Exception as exc:  # no file manager available, etc.
            self.error("無法開啟", f"無法開啟資料夾：{exc}")

    def set_status(self, text: str) -> None:
        self.status_var.set(text)

    # ---------------------------------------------------------------- background work

    def run_task(self, work: Callable, on_done: Callable, message: str,
                 on_stop: Optional[Callable[[], None]] = None, cancellable: bool = True) -> bool:
        """Run work(cancel_event, progress) in a thread, then on_done(result)."""
        if self.busy:
            return False
        self.busy = True
        cancel = threading.Event()
        self.cancel_event = cancel
        self._on_stop = on_stop
        for tab in self.tabs:
            tab.set_busy(True)
        self.cancel_button.configure(state="normal" if cancellable else "disabled")
        self.status_var.set(message)
        self.progress.configure(mode="indeterminate")
        self.progress.start(15)
        self._last_progress = 0.0

        def report(done: int, total: Optional[int], text: str) -> None:
            now = time.monotonic()
            if total is not None and done < total and now - self._last_progress < 0.1:
                return
            self._last_progress = now
            self.events.put(("progress", (done, total, text)))

        def worker() -> None:
            try:
                result = work(cancel, report)
            except Cancelled:
                self.events.put(("cancelled", None))
            except Exception as exc:  # shown to the user, never silently lost
                self.events.put(("error", (exc, traceback.format_exc())))
            else:
                self.events.put(("done", (on_done, result)))

        threading.Thread(target=worker, daemon=True).start()
        return True

    def cancel(self) -> None:
        if self.cancel_event is not None:
            self.cancel_event.set()
            self.status_var.set("正在取消…（目前這個檔案處理完就會停止）")

    def _poll(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()
                self._handle_event(kind, payload)
        except queue.Empty:
            pass
        finally:
            if self._poll_job is not None:
                try:
                    self._poll_job = self.root.after(80, self._poll)
                except tk.TclError:
                    self._poll_job = None

    def _handle_event(self, kind: str, payload) -> None:
        if kind == "progress":
            done, total, text = payload
            if total:
                if str(self.progress.cget("mode")) != "determinate":
                    self.progress.stop()
                    self.progress.configure(mode="determinate")
                self.progress["value"] = done * 100.0 / total
                self.status_var.set(f"{text}（{done:,} / {total:,}）")
            else:
                self.status_var.set(f"{text}（已找到 {done:,} 個檔案）")
            return
        on_stop = self._on_stop
        self._finish()
        if self.closing:
            self.shutdown()
            return
        try:
            if kind == "done":
                callback, result = payload
                callback(result)
            elif kind == "cancelled":
                self.status_var.set("已取消")
                if on_stop:
                    on_stop()
            elif kind == "error":
                exc, details = payload
                self.status_var.set("發生錯誤")
                if on_stop:
                    on_stop()
                self.error("發生錯誤", f"{exc}\n\n詳細資訊：\n{details[-1200:]}")
        except Exception as exc:
            self.error("發生錯誤", f"{exc}\n\n{traceback.format_exc()[-1200:]}")

    def _finish(self) -> None:
        self.busy = False
        self.cancel_event = None
        self._on_stop = None
        self.progress.stop()
        self.progress.configure(mode="determinate")
        self.progress["value"] = 0
        self.cancel_button.configure(state="disabled")
        self.status_var.set("完成")
        for tab in self.tabs:
            tab.set_busy(False)

    def shutdown(self) -> None:
        """Stop polling and close the window."""
        job, self._poll_job = self._poll_job, None
        if job is not None:
            try:
                self.root.after_cancel(job)
            except tk.TclError:
                pass
        self.root.destroy()

    def on_close(self) -> None:
        if not self.busy:
            self.shutdown()
            return
        if self.ask("還在處理中", "目前的工作還沒完成。要停止並關閉程式嗎？\n（已經完成的部分會保留在整理紀錄中，之後仍可復原）", icon="warning"):
            self.closing = True
            self.cancel()


def _prepare_windows() -> None:
    if sys.platform != "win32":
        return
    try:
        import ctypes
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)  # sharp text on high-DPI screens
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("FileOrganizer.App")
    except Exception:
        pass


def main() -> int:
    _prepare_windows()
    try:
        root = tk.Tk()
    except tk.TclError as exc:
        print(f"無法開啟視窗：{exc}", file=sys.stderr)
        return 1
    App(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
