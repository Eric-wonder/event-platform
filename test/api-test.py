#!/usr/bin/env python3
"""api-test.py - API 测试脚本"""
import sys, urllib.request, json

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:3000'
TOKEN = ''

def api(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {'Content-Type': 'application/json', 'User-Agent': 'APITest'}
    if token: headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except:
            return e.code, {}
    except Exception as e:
        return 0, {'message': str(e)}

def check(name, method, path, body=None, token=None, expect=None):
    status, resp = api(method, path, body, token)
    ok = expect is None or status == expect
    mark = 'PASS' if ok else 'FAIL'
    print(f'  [{mark}] {method} {path} -> {status}' + ('' if ok else f' (expected {expect})'))
    return ok

def login(email, password):
    status, resp = api('POST', '/api/auth/login', {'email': email, 'password': password})
    if status == 200 and resp.get('data', {}).get('token'):
        return resp['data']['token'], resp['data']['user']['id']
    return None, None

print('=== event-platform API Test ===')
print('BASE: ' + BASE)
results = []
results.append(check('Backend health', 'GET', '/api/health', expect=200))
results.append(check('Auth me (no token)', 'GET', '/api/auth/me', expect=401))
results.append(check('Activities list (public)', 'GET', '/api/activities?page=1&pageSize=10', expect=200))
results.append(check('Projects list (public)', 'GET', '/api/projects', expect=200))
results.append(check('Register', 'POST', '/api/auth/register',
    {'username': 'testuser', 'email': 'test@example.com', 'password': 'Test@123', 'role': 'USER'}, expect=201))
tok, uid = login('test@example.com', 'Test@123')
if tok:
    print('  [PASS] Login OK, uid=' + str(uid))
    results.append(True)
    results.append(check('Auth me', 'GET', '/api/auth/me', token=tok, expect=200))
    results.append(check('Notifications', 'GET', '/api/notifications', token=tok, expect=200))
    results.append(check('Pay orders', 'GET', '/api/pay/orders', token=tok, expect=200))
    results.append(check('Pay preview', 'POST', '/api/commissions/preview', {'price': 100}, token=tok, expect=200))
    results.append(check('Admin forbidden', 'GET', '/api/admin/users', token=tok, expect=403))
else:
    print('  [WARN] Login failed, skipping authenticated tests')
    results.append(False)

total = len(results)
passed = sum(results)
print('')
print('Results: ' + str(passed) + '/' + str(total) + ' passed')
sys.exit(0 if passed == total else 1)
