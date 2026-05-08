#!/usr/bin/env bash
# Apply repository rulesets defined in .github/rulesets/*.json via gh api.
# Idempotent: existing rulesets matched by name are updated; new ones are created.
# On first run, deletes the legacy "Default" ruleset so the new branch-specific
# rulesets are the sole source of truth.
#
# Usage:
#   bash scripts/apply-rulesets.sh
#   REPO=other-owner/other-repo bash scripts/apply-rulesets.sh

set -euo pipefail

REPO=${REPO:-sai-gillingham/floci-view}
RULESETS_DIR="$(cd "$(dirname "$0")/.." && pwd)/.github/rulesets"

if ! command -v gh >/dev/null 2>&1; then
  echo "::error::gh CLI not found. Install from https://cli.github.com/." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq not found. Install with your package manager." >&2
  exit 1
fi

delete_legacy_default() {
  local id
  id=$(gh api "repos/${REPO}/rulesets" --jq '.[] | select(.name == "Default") | .id' 2>/dev/null || true)
  if [ -n "${id:-}" ]; then
    echo "Deleting legacy 'Default' ruleset (id=${id})..."
    gh api -X DELETE "repos/${REPO}/rulesets/${id}" >/dev/null
  fi
}

apply_ruleset() {
  local file="$1"
  local name
  name=$(jq -r '.name' "$file")
  local id
  id=$(gh api "repos/${REPO}/rulesets" --jq ".[] | select(.name == \"${name}\") | .id" 2>/dev/null || true)

  if [ -n "${id:-}" ]; then
    echo "Updating ruleset '${name}' (id=${id})..."
    gh api -X PUT "repos/${REPO}/rulesets/${id}" --input "$file" >/dev/null
  else
    echo "Creating ruleset '${name}'..."
    gh api -X POST "repos/${REPO}/rulesets" --input "$file" >/dev/null
  fi
}

echo "Applying rulesets to ${REPO} from ${RULESETS_DIR}"
delete_legacy_default

shopt -s nullglob
files=("${RULESETS_DIR}"/*.json)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  echo "::error::No ruleset JSON files found in ${RULESETS_DIR}" >&2
  exit 1
fi

for f in "${files[@]}"; do
  apply_ruleset "$f"
done

echo
echo "Active rulesets on ${REPO}:"
gh api "repos/${REPO}/rulesets" --jq '.[] | "  \(.id)\t\(.name)\t\(.target)\t\(.enforcement)"'
