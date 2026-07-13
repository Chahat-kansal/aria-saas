# SQL-GUARD-1 — query_business_data tool hardening

MODE: SOLO. pwd must confirm C:\Users\kansa\aria-saas-audit.

## What this sprint does
Adds defensive guards inside the query_business_data tool definition so Aria can never silently query the wrong table or include voided sales. Three guards, all additive — existing queries continue working unchanged, only known-bad patterns get rewritten.

1. **Table alias rewrite** — if Aria writes `FROM customers` (or joins it) for a business whose `customers` table is empty, transparently rewrite to `pos_customers`. Log the rewrite.
2. **Voided sales filter** — if a query references `pos_sales` without a `status` filter, inject `status='completed'` (or `status != 'voided'` if a different status filter is already there, leave it alone).
3. **Schema-aware column hints** — when a query fails with `column does not exist`, return a structured error to the LLM containing the closest column matches from the actual schema, so the next tool call can self-correct.

Per the additive rule: no tool removed, no existing query path broken. Existing valid queries pass through guards as no-ops.

## PRE-FLIGHT (mandatory)
1. `pwd` → must be C:\Users\kansa\aria-saas-audit.
2. Read in full:
   - The query_business_data tool definition — search: grep -rn "query_business_data" src/app/api/aria src/lib --include="*.ts" -l, then read the file(s) that DEFINE the tool (not callers).
   - The actual SQL executor that runs the query string Aria emits — likely the same file or one imported by it.
3. Verify against live DB which businesses have empty `customers` vs populated `pos_customers`. Sip Café (ff5055a0-c351-4ada-817a-1804961035f3) is the canonical empty-customers case.
4. Verify pos_sales status values in use: confirm 'completed' and 'voided' are the canonical values via:
   ```sql
   SELECT status, COUNT(*) FROM pos_sales WHERE business_id = 'ff5055a0-c351-4ada-817a-1804961035f3' GROUP BY status;
   ```
   (chat Claude will run this and paste results into the report — include in the prompt run command).

## BUILD

### Guard 1 — table alias rewrite
At the top of the SQL executor (before `supabaseAdmin.rpc(...)` or wherever the query string runs):

```ts
async function rewriteEmptyCustomersTable(sql: string, businessId: string): Promise<{ sql: string; rewritten: boolean }> {
  // only act if sql references plain 'customers' table (not pos_customers)
  if (!/\bfrom\s+customers\b|\bjoin\s+customers\b/i.test(sql)) return { sql, rewritten: false }
  
  // check if customers has rows for this business
  const { count } = await supabaseAdmin.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId)
  if ((count ?? 0) > 0) return { sql, rewritten: false } // populated — leave alone
  
  // empty — rewrite to pos_customers
  const rewritten = sql
    .replace(/\bfrom\s+customers\b/gi, 'FROM pos_customers')
    .replace(/\bjoin\s+customers\b/gi, 'JOIN pos_customers')
  return { sql: rewritten, rewritten: true }
}
```

Call before query execution. Log every rewrite to aria_ai_calls with agent_key='sql_guard', request_summary='customers→pos_customers', learning_signal='guard_fired:customers_empty_rewrite'.

### Guard 2 — voided sales filter
```ts
function injectCompletedFilter(sql: string): { sql: string; injected: boolean } {
  // skip if no pos_sales reference
  if (!/\bpos_sales\b/i.test(sql)) return { sql, injected: false }
  
  // skip if status filter already present (any form)
  if (/\bstatus\s*(=|!=|<>|in\s*\()/i.test(sql)) return { sql, injected: false }
  
  // inject status='completed' into WHERE clause, or add WHERE if missing
  if (/\bwhere\b/i.test(sql)) {
    const injected_sql = sql.replace(/\bwhere\b/i, "WHERE pos_sales.status='completed' AND ")
    return { sql: injected_sql, injected: true }
  } else {
    // no WHERE clause — append before any GROUP BY / ORDER BY / LIMIT
    const injected_sql = sql.replace(/(\bgroup\s+by\b|\border\s+by\b|\blimit\b|$)/i, "WHERE pos_sales.status='completed' $1")
    return { sql: injected_sql, injected: true }
  }
}
```

Same logging pattern, learning_signal='guard_fired:voided_filter_injected'.

### Guard 3 — schema-aware error hints
Wrap the query execution in try/catch. When the DB throws `42703` (column does not exist) or `42P01` (relation does not exist):

```ts
catch (err) {
  if (err.code === '42703') {
    // column does not exist — extract column name from error, query information_schema for similar
    const match = err.message.match(/column "?([a-z_]+)"? does not exist/i)
    if (match) {
      const badCol = match[1]
      const tableMatch = sql.match(/\bfrom\s+([a-z_]+)/i)
      const table = tableMatch?.[1]
      if (table) {
        const { data: cols } = await supabaseAdmin
          .from('information_schema.columns')
          .select('column_name')
          .eq('table_schema','public').eq('table_name', table)
        const candidates = cols?.map(c => c.column_name).filter(c => 
          c.includes(badCol.slice(0, 4)) || badCol.includes(c.slice(0, 4))
        ).slice(0, 5) ?? []
        // return structured error to LLM
        return {
          error: 'column_not_found',
          requested_column: badCol,
          table,
          available_similar_columns: candidates,
          hint: `Column "${badCol}" does not exist on table "${table}". Did you mean one of: ${candidates.join(', ')}?`
        }
      }
    }
  }
  if (err.code === '42P01') {
    // table does not exist — similar pattern, suggest tables in public schema with similar names
    // ...
  }
  throw err // re-throw for any other error class
}
```

Log error-hint events to aria_ai_calls with agent_key='sql_guard', learning_signal='guard_fired:schema_hint'.

## What this sprint does NOT do
- Does not change the tool's input/output JSON Schema (just the execution wrapper)
- Does not change the system prompt's tool description
- Does not block any query class — every guard either rewrites silently or returns a structured error the LLM can act on
- Does not modify any other tool
- Does not touch the deliverable pipeline
- Does not modify HEAL-1's response validator
- Does not add new npm dependencies

## BUILD GATE
- npx tsc --noEmit → 0 errors
- npm run build → PASS
- ONE commit: `feat(sql-guard-1): table rewrite + voided filter + schema hints on query_business_data`
- STOP before push. Write reports/sprint-SQL-GUARD-1-report.md including:
  - Exact file path of the query_business_data tool executor
  - Output of the status-values verification SQL (chat Claude will paste)
  - Confirmation that no existing valid query path is altered
  - Test plan: 3 queries to try in live UI (one that would have hit customers, one that omits status filter on pos_sales, one with a typo'd column name)

## DO NOT
- Do not touch vercel.json
- Do not log full SQL queries to aria_ai_calls (first 200 chars only — privacy + sometimes contains business data)
- Do not skip guards on admin/internal queries — they apply uniformly
- Do not modify Aria's system prompt guidance about which table to use (the rule stays in the prompt as documentation; the guard is belt-and-braces)
