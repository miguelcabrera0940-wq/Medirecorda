#!/bin/bash
set -e

cd "$(dirname "$0")/.."

tree -a -I '.git|node_modules|dist|build|coverage|.env|.env.*|*.log' > arnes/ESTRUCTURA.md
