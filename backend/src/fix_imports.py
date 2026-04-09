import os
import re

backend = r'C:\workspace\event-platform\backend\src'
routes_dir = os.path.join(backend, 'routes')

updated = []
for fname in os.listdir(routes_dir):
    if not fname.endswith('.js'):
        continue
    fpath = os.path.join(routes_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Pattern: const { success, fail } = require('../utils/response');
    # Replace with: const { success, fail, catchAsync } = require('../utils/response');
    # Only if catchAsync is not already imported from response
    if "require('../utils/response')" in content:
        # Check if catchAsync is already imported
        if re.search(r"const \{[^}]*\bcatchAsync\b[^}]*\} = require\('\.\./utils/response'\);", content):
            continue  # already imported
        # Replace the import line to include catchAsync
        content = re.sub(
            r"const \{ ([^}]+) \} = require\('\.\./utils/response'\);",
            r"const { \1, catchAsync } = require('../utils/response');",
            content
        )

    if content != original:
        updated.append(fname)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated: {fname}')

print(f'\nTotal updated: {len(updated)}')
