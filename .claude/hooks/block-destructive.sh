#!/bin/bash
# Blocks destructive bash commands before they execute.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

DANGEROUS_PATTERNS=(
  "rm -rf /"
  "rm -rf \*"
  "git push --force origin main"
  "git push --force origin master"
  "git reset --hard"
  "DROP TABLE"
  "DROP DATABASE"
)

for PATTERN in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qF "$PATTERN"; then
    jq -n --arg cmd "$COMMAND" --arg pat "$PATTERN" '{
      hookSpecificOutput: {
        permissionDecision: "deny",
        permissionDecisionReason: ("Blocked: command matches dangerous pattern \"" + $pat + "\"")
      }
    }'
    exit 0
  fi
done

exit 0
