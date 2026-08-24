#!/usr/bin/env python3
"""Fail if an em or en dash reaches the tree.

The ban covers anything a person reads: source, comments, docs, and the message this
product drafts. Ranges in prose spell the word instead. Run by `npm run check`.
"""

import shutil
import subprocess
import sys
from pathlib import Path

DASHES = ("\u2014", "\u2013")  # em dash, en dash; escaped so this file passes its own check
SKIP_SUFFIXES = {".png", ".jpg", ".webp", ".pdf", ".sqlite", ".lock"}
SKIP_DIRS = ("node_modules/", ".venv/", "data/runs/", "dist/", ".git/")


def tracked_files():
    git = shutil.which("git") or "/usr/bin/git"
    out = subprocess.run(  # noqa: S603 - fixed argv, no shell, no user input
        [git, "ls-files"], capture_output=True, text=True, check=True
    ).stdout
    for name in out.splitlines():
        if any(name.startswith(d) or f"/{d}" in name for d in SKIP_DIRS):
            continue
        if Path(name).suffix in SKIP_SUFFIXES:
            continue
        yield Path(name)


def main():
    hits = []
    for path in tracked_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        for number, line in enumerate(text.splitlines(), 1):
            if any(dash in line for dash in DASHES):
                hits.append(f"{path}:{number}: {line.strip()[:100]}")
    if hits:
        sys.stdout.write("em or en dash found:\n" + "\n".join(hits) + "\n")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
