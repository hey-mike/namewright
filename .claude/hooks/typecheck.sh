#!/bin/bash
# Runs after every Edit or Write tool call.
# Feeds tsc errors back as additionalContext so Claude sees them immediately.

cd "$(dirname "$0")/../.." || exit 0

OUTPUT=$(npx tsc --noEmit 2>&1)
EXIT=$?

if [ $EXIT -ne 0 ]; then
  jq -n --arg output "$OUTPUT" '{
    additionalContext: ("TypeScript errors detected:\n" + $output)
  }'
fi

exit 0
