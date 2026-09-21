#!/usr/bin/env python3
"""Compatibility entrypoint for the canonical Node startup router.

The Python command remains the manual fallback required by the repository
contract. Routing itself lives in start.mjs so maintained adapters and manual
startup use one implementation.
"""

import os
import subprocess
import sys


ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    command = ["node", os.path.join(ROOT, "start.mjs"), *sys.argv[1:]]
    try:
        result = subprocess.run(command, cwd=ROOT, shell=False)
    except OSError as error:
        sys.stderr.write("startup requires Node.js: %s\n" % error)
        return 1
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
