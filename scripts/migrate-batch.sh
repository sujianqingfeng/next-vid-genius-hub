#!/bin/bash

set -euo pipefail

if [ $# -ne 2 ]; then
	echo "Usage: $0 <old-module> <new-module>"
	echo "Example: $0 types shared/types"
	exit 1
fi

OLD_MODULE="$1"
NEW_MODULE="$2"

echo "Migrating: ~/lib/$OLD_MODULE -> ~/lib/$NEW_MODULE"

rg -l --null "['\\\"]~/lib/${OLD_MODULE}(/|['\\\"])" \
	apps/web/src -g'*.ts' -g'*.tsx' \
	| xargs -0 -I{} perl -pi -e "s#'~/lib/${OLD_MODULE}/#'~/lib/${NEW_MODULE}/#g; s#\\\"~/lib/${OLD_MODULE}/#\\\"~/lib/${NEW_MODULE}/#g; s#'~/lib/${OLD_MODULE}'#'~/lib/${NEW_MODULE}'#g; s#\\\"~/lib/${OLD_MODULE}\\\"#\\\"~/lib/${NEW_MODULE}\\\"#g" {}

echo "Verifying no old imports remain..."
if rg "from ['\\\"]~/lib/${OLD_MODULE}['\\\"]" apps/web/src -g'*.ts' -g'*.tsx' | grep -q .; then
	echo "ERROR: still found imports from ~/lib/${OLD_MODULE}"
	exit 1
fi
if rg "from ['\\\"]~/lib/${OLD_MODULE}/" apps/web/src -g'*.ts' -g'*.tsx' | grep -q .; then
	echo "ERROR: still found imports from ~/lib/${OLD_MODULE}/..."
	exit 1
fi

echo "OK: no old imports detected."
