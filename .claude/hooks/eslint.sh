#!/bin/bash
# Runs after every Edit or Write tool call.
# Feeds ESLint errors back as additionalContext so Claude sees them immediately.

cd "$(dirname "$0")/../.." || exit 0

OUTPUT=$(npx eslint src/ --format compact 2>&1)
EXIT=$?

if [ $EXIT -ne 0 ]; then
  jq -n --arg output "$OUTPUT" '{
    additionalContext: ("ESLint errors detected:\n" + $output)
  }'
fi

exit 0
