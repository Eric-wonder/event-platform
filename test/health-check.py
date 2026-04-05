#!/usr/bin/env python3
"""health-check.py - 系统健康检查脚本"""
import sys
import urllib.request
import socket
import json

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost'
BACKEND_URL = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:3000'

def check(url, name, timeout=5):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'HealthCheck'})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode()
            print(f'  OK {name}: {r.status} - {body[:100]}')
            return True
    except Exception as e:
        print(f'  FAIL {name}: {e}')
        return False

def check_port(host, port, name):
    try:
        s = socket.socket()
        s.settimeout(3)
        s.connect((host, port))
        s.close()
        print(f'  OK {name}: port {port} is open')
        return True
    except Exception as e:
        print(f'  FAIL {name}: port {port} - {e}')
        return False

print('=== event-platform Health Check ===')
print(f'Frontend: {BASE_URL}')
print(f'Backend:  {BACKEND_URL}')

results = []
results.append(check(BACKEND_URL + '/api/health', 'Backend /api/health'))
results.append(check(BASE_URL + '/', 'Frontend /'))

results.append(check_port('localhost', 3306, 'MySQL port'))

if all(results):
    print('\nAll checks passed')
    sys.exit(0)
else:
    print('\nSome checks failed')
    sys.exit(1)
