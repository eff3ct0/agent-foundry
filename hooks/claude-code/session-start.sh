#!/bin/sh
set -eu

adapter_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
project_dir=$(CDPATH= cd "$adapter_dir/../.." && pwd)
if [ ! -f "$project_dir/start.mjs" ]; then
    project_dir=$(CDPATH= cd "$adapter_dir/../../.." && pwd)
fi
exec node "$project_dir/start.mjs" --cwd "$project_dir"
