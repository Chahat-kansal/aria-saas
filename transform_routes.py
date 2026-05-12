import re, os, sys

METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

def get_route_name(path):
    p = path.replace(os.sep, '/')
    m = re.search(r'src/app/api/(.+)/route\.ts$', p)
    return m.group(1) if m else 'unknown'

def transform(file_path):
    route_name = get_route_name(file_path)
    if 'webhook' in route_name.lower():
        return False, 'webhook-skipped'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    if 'withErrorCapture' in content:
        return False, 'already-done'
    found = []
    new = content
    for method in METHODS:
        pat = rf'export\s+async\s+function\s+{method}\s*\('
        if re.search(pat, new):
            new = re.sub(pat, f'async function _{method}(', new)
            found.append(method)
    if not found:
        return False, 'no-handler'
    # add exports block at EOF
    block = '\n'
    for m in found:
        block += f"export const {m} = withErrorCapture('{route_name}', _{m})\n"
    new = new.rstrip() + '\n' + block
    # insert import after last import line
    imp = "import { withErrorCapture } from '@/lib/api/with-error-capture'"
    positions = [m.end() for m in re.finditer(r'^import\s+.+$', new, re.MULTILINE)]
    if positions:
        pos = positions[-1]
        new = new[:pos] + '\n' + imp + new[pos:]
    else:
        new = imp + '\n' + new
    with open(file_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(new)
    return True, f'wrapped-{found}'

base = r'C:\Users\kansa\aria-saas-audit\src\app\api'
batch = sys.argv[1] if len(sys.argv) > 1 else 'all'
transformed = skipped = errors = 0
for root, _, files in os.walk(base):
    for file in files:
        if file != 'route.ts': continue
        fp = os.path.join(root, file)
        rn = get_route_name(fp)
        if batch != 'all' and not rn.startswith(batch): continue
        try:
            ok, reason = transform(fp)
            if ok:
                print(f'OK  {rn} ({reason})')
                transformed += 1
            else:
                print(f'--  {rn} ({reason})')
                skipped += 1
        except Exception as e:
            print(f'ERR {rn}: {e}')
            errors += 1
print(f'\ntransformed={transformed} skipped={skipped} errors={errors}')
