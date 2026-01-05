#!/bin/bash

set -euo pipefail

ROOT_DIR="$(pwd)"
LIB_DIR="$ROOT_DIR/apps/web/src/lib"

mkdir -p "$LIB_DIR"/domain/{media,thread,points}
mkdir -p "$LIB_DIR"/infra/{db,cloudflare,storage,proxy,logger}
mkdir -p "$LIB_DIR"/features/{auth,ai,job,subtitle,remotion}
mkdir -p "$LIB_DIR"/shared/{types,utils,errors,hooks,providers,query,i18n,theme,config}

echo "Created lib structure under: $LIB_DIR"
