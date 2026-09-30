#!/usr/bin/env bash
# Build the Chrome Web Store upload zip from extension/.
# Usage: STORE_VERSION=2.1.3 scripts/package.sh   (ALLOW_DIRTY=1 to skip the clean-tree check)
set -euo pipefail
ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
EXT="$ROOT/extension"
OUT="${OUT_DIR:-$ROOT/dist}"
STORE_VERSION="${STORE_VERSION:-}"

VERSION=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$EXT/manifest.json")

# 1. Version must be strictly greater than what's live on the store
if [ -n "$STORE_VERSION" ]; then
  python3 - "$VERSION" "$STORE_VERSION" <<'PY' || { echo "ERROR: manifest $VERSION is not > store $STORE_VERSION" >&2; exit 1; }
import sys
p=lambda v:[int(x) for x in v.split('.')]+[0]*(4-len(v.split('.')))
sys.exit(0 if p(sys.argv[1])>p(sys.argv[2]) else 1)
PY
else
  echo "WARN: STORE_VERSION not set; skipping version check" >&2
fi

# 2. Manifest sanity: every referenced file exists; no remote code patterns
python3 - "$EXT" <<'PY'
import json,os,re,sys
ext=sys.argv[1]; m=json.load(open(os.path.join(ext,'manifest.json')))
refs=[m['background']['service_worker'],m.get('options_page'),m['action'].get('default_popup')]
refs+=list(m.get('icons',{}).values())+list(m['action'].get('default_icon',{}).values())
for cs in m.get('content_scripts',[]): refs+=cs.get('js',[])+cs.get('css',[])
missing=[r for r in refs if r and not os.path.isfile(os.path.join(ext,r))]
if missing: sys.exit(f'ERROR: manifest references missing files: {missing}')
bad=[]
for d,_,fs in os.walk(ext):
  for f in fs:
    if f.endswith(('.js','.html')):
      s=open(os.path.join(d,f),encoding='utf-8',errors='ignore').read()
      if re.search(r'\beval\(|new Function\(|<script[^>]+src=["\']https?:',s): bad.append(f)
if bad: sys.exit(f'ERROR: remote/dynamic code patterns in {bad}')
PY

# 3. Clean tree (the zip must match a commit/tag)
if [ "${ALLOW_DIRTY:-0}" != 1 ] && [ -n "$(git -C "$ROOT" status --porcelain -- extension)" ]; then
  echo "ERROR: extension/ has uncommitted changes (ALLOW_DIRTY=1 to override)" >&2; exit 1
fi

# 4. Zip, excluding dev-only files
mkdir -p "$OUT"
ZIP="$OUT/download-router-$VERSION.zip"
rm -f "$ZIP"
( cd "$EXT" && zip -r -X -q "$ZIP" . \
    -x '.*' '*/.*' '*.bak' '*.orig' '*.map' '*~' '*.md' )
unzip -l "$ZIP"
echo "Built $ZIP ($(du -h "$ZIP" | cut -f1)) from $(git -C "$ROOT" rev-parse --short HEAD)"
