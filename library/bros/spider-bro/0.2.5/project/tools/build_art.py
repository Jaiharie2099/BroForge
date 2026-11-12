"""Authoring entry point for the approved prototype-3 animation bank."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('build_animations.py')),run_name='__main__')
