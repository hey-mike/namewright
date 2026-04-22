#!/bin/bash
# Blocks writes to sensitive files (.env*, lock files, CI secrets).

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

PROTECTED_PATTERNS=(
  '\.env$'
  '\.env\.'
  'package-lock\.json$'
  'yarn\.lock$'
  'pnpm-lock\.yaml$'
)

for PATTERN in "${PROTECTED_PATTERNS[@]}"; do
  if echo "$FILE" | grep -qE "$PATTERN"; then
    jq -n --arg file "$FILE" '{
      hookSpecificOutput: {
        permissionDecision: "deny",
        permissionDecisionReason: ("Blocked: direct writes to \"" + $file + "\" are prohibited. Edit env files manually; lock files update via package manager.")
      }
    }'
    exit 0
  fi
done

exit 0
