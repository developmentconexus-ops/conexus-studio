#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cd "$root"
npm run build

echo "== tarball contents"
files="$(npm pack --dry-run --json 2>/dev/null | node -e "
const report = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const [pack] = Array.isArray(report) ? report : Object.values(report);
console.log(pack.files.map((file) => file.path).join('\n'));
")"
echo "$files"
if echo "$files" | grep -Eq '^(src/|studio/|e2b/|\.env)'; then
  echo "tarball has files that must not be published" >&2
  exit 1
fi

npm pack --pack-destination "$work" --silent >/dev/null
tarball="$(cd "$work" && ls ./*.tgz)"

echo "== install in a test host"
cd "$work"
cat > package.json <<'JSON'
{ "name": "host-smoke", "private": true, "type": "module" }
JSON
npm install --no-audit --no-fund "$work/${tarball#./}" @mastra/core@1.86.0 @mastra/memory@1.41.3 zod@4.6.7

echo "== @mastra/core copies"
npm ls @mastra/core --all
copies="$(npm ls @mastra/core --all --parseable | grep -c 'node_modules/@mastra/core$' || true)"
if [ "$copies" != "1" ]; then
  echo "expected one @mastra/core copy, found $copies" >&2
  exit 1
fi

echo "== host cycle"
cp "$root/test/host-smoke/host.mjs" "$work/host.mjs"
node "$work/host.mjs"
