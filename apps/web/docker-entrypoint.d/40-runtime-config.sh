#!/bin/sh
set -eu
: "${API_BASE_URL:?API_BASE_URL must be a browser-accessible API origin}"
printf 'window.__CERCA_CONFIG__ = ' > /tmp/cerca-config/runtime-config.js
jq -cn --arg apiBaseUrl "$API_BASE_URL" '{apiBaseUrl:$apiBaseUrl}' >> /tmp/cerca-config/runtime-config.js
printf ';\n' >> /tmp/cerca-config/runtime-config.js
