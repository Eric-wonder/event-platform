import os
import re

backend = r'C:\workspace\event-platform\backend\src'
routes_dir = os.path.join(backend, 'routes')

fixed = []
for fname in os.listdir(routes_dir):
    if not fname.endswith('.js'):
        continue
    fpath = os.path.join(routes_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Remove: const { catchAsync } = require('../utils/catchAsync');
    content = re.sub(r"const \{ catchAsync \} = require\('\.\./utils/catchAsync'\);\n?", '', content)

    if content != original:
        fixed.append(fname)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed: {fname}')

print(f'\nTotal fixed: {len(fixed)}')
