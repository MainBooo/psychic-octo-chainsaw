#!/bin/bash
set -a
source /opt/alphaflow/deploy-ready/.env
set +a
exec node /opt/alphaflow/deploy-ready/dist/index.js
