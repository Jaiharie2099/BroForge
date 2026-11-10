"""Run the generic MCP campaign/character smoke test (takes over game input)."""
from pathlib import Path
import subprocess

if __name__ == '__main__':
    subprocess.run(['node', str(Path(__file__).resolve().parent/'smoke_mcp.js')], check=True)
