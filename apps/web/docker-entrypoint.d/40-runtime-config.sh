#!/bin/sh
set -eu
: "${BACKEND_UPSTREAM:?BACKEND_UPSTREAM must be an API origin reachable from the frontend container}"
printf 'window.__CERCA_CONFIG__ = ' > /tmp/cerca-config/runtime-config.js
jq -cn --arg apiBaseUrl '/api' '{apiBaseUrl:$apiBaseUrl}' >> /tmp/cerca-config/runtime-config.js
printf ';\n' >> /tmp/cerca-config/runtime-config.js
