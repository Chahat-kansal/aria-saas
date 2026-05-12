import re, os

BASE = 'C:/Users/kansa/aria-saas-audit/src/app/api/aria'

MODEL_HIGH = 'claude-opus-4-7'
MODEL_MID  = 'claude-sonnet-4-6'
MODEL_FAST = 'claude-haiku-4-5-20251001'

MODEL_MAP = {
    'aria/profit-analysis': MODEL_HIGH,
    'aria/receipt-scan':    MODEL_FAST,
    'aria/review-request':  MODEL_FAST,
}

TEMP_MAP = {
    'aria/receipt-scan':             0.2,
    'aria/generate-quote':           0.2,
    'aria/generate-purchase-orders': 0.2,
    'aria/feature-builder':          0.2,
    'aria/profit-analysis':          0.4,
    'aria/missed-demand-analysis':   0.4,
    'aria/slow-day-analysis':        0.4,
    'aria/variance':                 0.4,
    'aria/reorder-forecast':         0.4,
    'aria/competitor-prices':        0.4,
    'aria/widget-insights':          0.4,
    'aria/page-insight':             0.4,
    'aria/business-chat':            0.6,
    'aria/winback-message':          0.75,
    'aria/draft-review-reply':       0.75,
    'aria/social-suggest':           0.75,
    'aria/generate-promotion':       0.75,
    'aria/review-request':           0.75,
    'aria/winback':                  0.75,
    'aria/pos-chat':                 0.75,
    'aria/customer-intel':           0.6,
}

FEW_SHOT_MAP = {
    'aria/winback-message':    'winback-message',
    'aria/draft-review-reply': 'draft-review-reply',
    'aria/social-suggest':     'social-suggest',
}

PREFLIGHT_ROUTES = {
    'aria/profit-analysis', 'aria/missed-demand-analysis',
    'aria/slow-day-analysis', 'aria/variance', 'aria/reorder-forecast',
    'aria/competitor-prices', 'aria/widget-insights', 'aria/page-insight',
}

OUTCOMES_MAP = {
    'aria/winback':                'winback-sms-draft',
    'aria/winback-message':        'winback-message',
    'aria/profit-analysis':        'profit-analysis',
    'aria/slow-day-analysis':      'slow-day',
    'aria/missed-demand-analysis': 'missed-demand',
    'aria/reorder-forecast':       'reorder-forecast',
    'aria/generate-promotion':     'promotion',
}

SKIP_ROUTES = {'aria/business-chat', 'aria/business-brain'}

IMPORTS_BLOCK = (
    "import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'\n"
    "import { getSystemPrompt } from '@/lib/aria/get-system-prompt'\n"
    "import { writeAriaOutcome } from '@/lib/aria/write-outcome'"
)

def get_route(fp):
    p = fp.replace(os.sep, '/')
    m = re.search(r'src/app/api/(.+)/route\.ts$', p)
    return m.group(1) if m else 'unknown'

def find_biz_id(content):
    for pat, val in [
        (r'const \{ business_id', 'business_id'),
        (r'business_id = body\.business_id', 'business_id'),
        (r'business_id = searchParams', 'business_id'),
        (r'const \{ businessId', 'businessId'),
        (r'businessId = searchParams', 'businessId'),
        (r'const businessId =', 'businessId'),
    ]:
        if re.search(pat, content):
            return val
    return None

def upgrade_model(content, route):
    target = MODEL_MAP.get(route, MODEL_MID)
    if target != MODEL_FAST:
        content = content.replace("'claude-haiku-4-5-20251001'", "'" + target + "'")
    content = content.replace("'claude-sonnet-4-5-20250929'", "'" + MODEL_MID + "'")
    content = content.replace("'claude-opus-4-5-20251101'", "'" + MODEL_HIGH + "'")
    return content

def add_temperature(content, route):
    temp = TEMP_MAP.get(route)
    if temp is None or 'temperature:' in content:
        return content
    content = re.sub(
        r'(max_tokens:\s*\d+,)',
        lambda m: m.group(0) + '\n      temperature: ' + str(temp) + ',',
        content,
        count=1
    )
    return content

def add_imports(content):
    if 'getBusinessContext' in content:
        return content
    positions = [m.end() for m in re.finditer(r'^import\s+.+$', content, re.MULTILINE)]
    if positions:
        pos = positions[-1]
        content = content[:pos] + '\n' + IMPORTS_BLOCK + content[pos:]
    return content

def inject_context_before_create(content, route, biz_id):
    if not biz_id or 'getBusinessContext' not in content or '_bizCtx' in content:
        return content
    few_shot = FEW_SHOT_MAP.get(route, '')
    purpose_arg = ", '" + few_shot + "'" if few_shot else ''
    ctx_block = (
        "\n  const _bizCtx = await getBusinessContext(" + biz_id + ")\n"
        "  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'\n"
        "  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx" + purpose_arg + ")\n"
    )
    target = re.search(r'await trackAICall\(', content)
    if not target:
        target = re.search(r'await (anthropic|client)\.messages\.create\(', content)
    if target:
        content = content[:target.start()] + ctx_block + content[target.start():]
    return content

def add_preflight_guard(content, route, biz_id):
    if route not in PREFLIGHT_ROUTES or not biz_id:
        return content
    if 'hasEnoughData' in content or 'insufficient_data' in content:
        return content
    guard = (
        "\n  if (!hasEnoughData(_bizCtx)) {\n"
        "    return NextResponse.json({ data: null, status: 'insufficient_data',\n"
        "      message: \"I don't have enough transaction history yet. Come back after your first week of sales.\" })\n"
        "  }\n"
    )
    m = re.search(r'const systemPrompt = getSystemPrompt[^\n]+\n', content)
    if m:
        content = content[:m.end()] + guard + content[m.end():]
    return content

def replace_system_prompt(content):
    if '_bizCtx' not in content or 'cache_control' in content:
        return content
    new_sys = "system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],"
    content = re.sub(r'system:\s*`\$\{ARIA_VOICE\}[^`]*`,', new_sys, content)
    content = re.sub(r'system:\s*ARIA_VOICE\s*\+\s*[^\n,]+,', new_sys, content)
    content = re.sub(r'system:\s*ARIA_VOICE,', new_sys, content)
    content = re.sub(r"system:\s*'You are Aria[^']*',", new_sys, content)
    content = re.sub(r"system:\s*'[A-Z][^']{5,200}',", new_sys, content)
    return content

def add_outcomes(content, route):
    if route not in OUTCOMES_MAP or 'writeAriaOutcome' in content:
        return content
    rtype = OUTCOMES_MAP[route]
    biz_id_var = 'business_id' if re.search(r'\bbusiness_id\b', content) else (
        'businessId' if re.search(r'\bbusinessId\b', content) else None)
    if not biz_id_var:
        return content
    outcome_call = "\n  await writeAriaOutcome(" + biz_id_var + ", '" + rtype + "', JSON.stringify({ route: '" + route + "' })).catch(() => null)\n  "
    m = re.search(r'  return NextResponse\.json\(', content)
    if m:
        content = content[:m.start()] + outcome_call + content[m.start():]
    return content

def transform(fp):
    route = get_route(fp)
    if route in SKIP_ROUTES:
        return False, 'streaming-skip'
    with open(fp, 'r', encoding='utf-8') as f:
        content = f.read()
    if '.messages.create(' not in content:
        return False, 'no-create'
    orig = content
    biz_id = find_biz_id(content)
    content = upgrade_model(content, route)
    content = add_temperature(content, route)
    content = add_imports(content)
    if biz_id:
        content = inject_context_before_create(content, route, biz_id)
        content = add_preflight_guard(content, route, biz_id)
        content = replace_system_prompt(content)
        content = add_outcomes(content, route)
    if content == orig:
        return False, 'no-change'
    with open(fp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    applied = []
    if biz_id:
        applied += ['ctx', 'prompt', 'cache']
    if route in PREFLIGHT_ROUTES and biz_id:
        applied.append('preflight')
    if route in OUTCOMES_MAP and biz_id:
        applied.append('outcomes')
    return True, 'biz_id=' + str(biz_id) + ' applied=' + str(applied)

done = skip = err = 0
for root, _, files in os.walk(BASE):
    for file in files:
        if file != 'route.ts': continue
        fp = os.path.join(root, file)
        try:
            ok, reason = transform(fp)
            r = get_route(fp)
            print(('OK' if ok else '--') + '  ' + r + ': ' + reason)
            if ok: done += 1
            else: skip += 1
        except Exception as e:
            print('ERR ' + get_route(fp) + ': ' + str(e))
            err += 1
print('\ntransformed=' + str(done) + ' skipped=' + str(skip) + ' errors=' + str(err))
