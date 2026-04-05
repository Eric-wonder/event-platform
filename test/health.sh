#!/usr/bin/env bash
# health-check.sh - 系统健康检查脚本

BASE_URL=${1:-http://localhost}
echo Testing: $BASE_URL

echo === Backend Health ===
curl -s http://localhost:3000/api/health && echo

echo === Nginx Frontend ===
curl -s -o /dev/null -w HTTP:%{http_code} http://localhost/ && echo

echo === MySQL Port Check ===
nc -z localhost 3306 && echo UP || echo DOWN

echo === API Auth 401 Check ===
curl -s -o /dev/null -w HTTP:%{http_code} http://localhost:3000/api/auth/me && echo

echo === All Checks Complete ===
