import re, os

PURPOSE_MAP = {
    'aria/activity-narrative': ['activity-narrative'],
    'aria/autopilot': ['autopilot-analysis'],
    'aria/bom-suggest': ['bom-suggest'],
    'aria/briefing': ['daily-briefing'],
    'aria/classify-product': ['product-classification'],
    'aria/command': ['command-execution'],
    'aria/competitor-prices': ['competitor-price-search'],
    'aria/customer-intel': ['customer-intel'],
    'aria/daily-briefing': ['daily-briefing'],
    'aria/draft-review-reply': ['review-reply-draft'],
    'aria/explain-metric': ['metric-explanation'],
    'aria/feature-builder': ['feature-generate'],
    'aria/generate-promotion': ['slow-day-promotion'],
    'aria/generate-purchase-orders': ['purchase-order-generate'],
    'aria/generate-quote': ['quote-generate'],
    'aria/grn-assist': ['grn-assist'],
    'aria/missed-demand-analysis': ['missed-demand-analysis'],
    'aria/page-insight': ['page-insight'],
    'aria/pos-chat': ['pos-chat'],
    'aria/pos-end-of-day': ['pos-eod-summary'],
    'aria/pos-insight': ['pos-insight'],
    'aria/price-check': ['price-check'],
    'aria/price-intelligence': ['price-intelligence'],
    'aria/product-insights': ['product-insights'],
    'aria/profit-analysis': ['profit-leak-analysis', 'profit-leak-discovery'],
    'aria/receipt-scan': ['receipt-scan-vision'],
    'aria/reorder-forecast': ['reorder-summary'],
    'aria/review-request': ['review-request-sms'],
    'aria/roster': ['roster-optimization'],
    'aria/social-suggest': ['social-post-generate'],
    'aria/staff-visa-insight': ['staff-visa-insight'],
    'aria/supplier-insights': ['supplier-insights'],
    'aria/variance': ['variance-insights'],
    'aria/warehouse-intelligence': ['warehouse-intelligence'],
    'aria/warehouse-slotting': ['warehouse-slotting'],
    'aria/widget-insights': ['widget-insights'],
    'aria/winback-message': ['winback-message-personalize'],
    'aria/winback': ['winback-sms-draft'],
}

STREAMING = {'aria/business-chat', 'aria/business-brain'}

def find_paren_end(text, start):
    depth = 0
    i = start
    in_str = None
    while i < len(text):
        c = text[i]
        if in_str:
            if c == '\': i += 1
            elif c == in_str: in_str = None
        else:
            if c in ('"', "'", '`'): in_str = c
            elif c == '(': depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0: return i
        i += 1
    return -1

def get_route_name(path):
    p = path.replace(os.sep, '/')
    m = re.search(r'src/app/api/(.+)/route\.ts$', p)
    return m.group(1) if m else 'unknown'

def wrap_file(file_path):
    route = get_route_name(file_path)
    if route in STREAMING:
        return False, 'streaming-manual'
    if route not in PURPOSE_MAP:
        return False, 'no-purpose-map'

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'trackAICall' in content:
        return False, 'already-done'
    if '.messages.create(' not in content and 'anthropic.messages' not in content:
        return False, 'no-create-call'

    purposes = PURPOSE_MAP[route]

    # Detect client var name
    client_var = 'client' if re.search(r'const client\s*=\s*new Anthropic', content) else 'anthropic'

    # Detect businessId var
    biz_id = 'undefined'
    for pat, val in [('business_id', 'business_id'), ('businessId', 'businessId'),
                     (r'biz\.id', 'biz?.id'), (r'business\.id', 'business?.id')]:
        if re.search(pat, content):
            biz_id = val
            break

    # Find all .messages.create( positions
    call_re = re.compile(rf'({re.escape(client_var)})\.messages\.create\(')
    matches = list(call_re.finditer(content))
    if not matches:
        return False, 'no-match'

    # Process from end to preserve offsets
    for i, m in enumerate(reversed(matches)):
        purpose_idx = len(matches) - 1 - i
        purpose = purposes[min(purpose_idx, len(purposes) - 1)]
        open_paren = m.end() - 1
        close_paren = find_paren_end(content, open_paren)
        if close_paren == -1:
            continue
        call_text = content[open_paren:close_paren + 1]
        model_m = re.search(r"model:\s*'([^']+)'", call_text)
        model = model_m.group(1) if model_m else 'claude-haiku-4-5-20251001'
        ctx = f"{{ route: '{route}', model: '{model}', businessId: {biz_id}, purpose: '{purpose}' }}"
        replacement = f"trackAICall({ctx}, () => {m.group(1)}.messages.create{call_text})"
        content = content[:m.start()] + replacement + content[close_paren + 1:]

    # Add import
    imp = "import { trackAICall } from '@/lib/aria/ai-telemetry'"
    positions = [mx.end() for mx in re.finditer(r'^import\s+.+$', content, re.MULTILINE)]
    if positions:
        pos = positions[-1]
        content = content[:pos] + '\n' + imp + content[pos:]
    else:
        content = imp + '\n' + content

    with open(file_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    return True, f'wrapped {len(matches)} call(s) ({route})'

base = r'C:\Users\kansa\aria-saas-audit\src\app\api\aria'
done = skip = err = 0
for root, _, files in os.walk(base):
    for file in files:
        if file != 'route.ts': continue
        fp = os.path.join(root, file)
        try:
            ok, reason = wrap_file(fp)
            sym = 'OK' if ok else '--'
            print(f'{sym}  {get_route_name(fp)}: {reason}')
            if ok: done += 1
            else: skip += 1
        except Exception as e:
            print(f'ERR {get_route_name(fp)}: {e}')
            err += 1
print(f'\nwrapped={done} skipped={skip} errors={err}')
