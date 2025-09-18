"""Create a zip archive of the AI Security Lab repository."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Package the lab as a zip archive.")
    parser.add_argument("--output", default="ai_security_lab.zip", help="Zip filename")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    output_path = Path(args.output)
    if output_path.exists():
        output_path.unlink()
    shutil.make_archive(output_path.with_suffix(""), "zip", repo_root)
    print(f"Created archive at {output_path}")


if __name__ == "__main__":
    main()
