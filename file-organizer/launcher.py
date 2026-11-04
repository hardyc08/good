"""Entry point for the stand-alone app built with PyInstaller.

Double-clicking the app opens the window; with arguments it runs the CLI.
"""

import sys

from file_organizer.cli import main

if __name__ == "__main__":
    sys.exit(main())
