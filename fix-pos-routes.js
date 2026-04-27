const fs = require('fs');
const path = require('path');

const POS_DIR = path.join(__dirname, 'src', 'app', 'api', 'pos');

const NEW_BODY = `
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
`;

// Matches getBid or getBusinessId helper with any single/maybeSingle variant
const OLD_PATTERN = /async function (getBid|getBusinessId)\(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string\)[^{]*\{[\s\S]*?return data\?\.id \?\? null;\n\}/g;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name === 'route.ts') out.push(full);
  }
  return out;
}

let fixedCount = 0;

walk(POS_DIR).forEach(file => {
  let src = fs.readFileSync(file, 'utf8');
  OLD_PATTERN.lastIndex = 0;
  if (!OLD_PATTERN.test(src)) return;
  OLD_PATTERN.lastIndex = 0;

  const updated = src.replace(OLD_PATTERN, (_match, fnName) => {
    return `async function ${fnName}(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {${NEW_BODY}}`;
  });

  if (updated !== src) {
    fs.writeFileSync(file, updated, 'utf8');
    console.log('FIXED:', path.relative(POS_DIR, file));
    fixedCount++;
  }
});

// Fix sale/route.ts inline lookup (no helper function)
const saleFile = path.join(POS_DIR, 'sale', 'route.ts');
let saleSrc = fs.readFileSync(saleFile, 'utf8');
const OLD_SALE = `  const { data: business } = await supabase
    .from('businesses').select('id').eq('user_id', user.id).maybeSingle();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });`;
const NEW_SALE = `  const { data: activeBiz } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const activeId = activeBiz?.business_id
    ?? (await supabase.from('businesses').select('id').eq('user_id', user.id)
        .eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()).data?.id;
  const business = activeId ? { id: activeId } : null;
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });`;

if (saleSrc.includes(OLD_SALE)) {
  saleSrc = saleSrc.replace(OLD_SALE, NEW_SALE);
  fs.writeFileSync(saleFile, saleSrc, 'utf8');
  console.log('FIXED: sale/route.ts (inline)');
  fixedCount++;
}

// Fix products/route.ts GET — remove is_active filter so inactive products are retrievable
const productsFile = path.join(POS_DIR, 'products', 'route.ts');
let prodSrc = fs.readFileSync(productsFile, 'utf8');
const OLD_ACTIVE_FILTER = `      .eq('business_id', bid)\n      .eq('is_active', true)\n      .order('name'),`;
const NEW_ACTIVE_FILTER = `      .eq('business_id', bid)\n      .order('name'),`;
if (prodSrc.includes(OLD_ACTIVE_FILTER)) {
  prodSrc = prodSrc.replace(OLD_ACTIVE_FILTER, NEW_ACTIVE_FILTER);
  fs.writeFileSync(productsFile, prodSrc, 'utf8');
  console.log('FIXED: products/route.ts (removed is_active filter from GET)');
  fixedCount++;
}

console.log(`\nTotal files fixed: ${fixedCount}`);