# Data Safety Runbook — Aria OS

**Phase:** PRR-5 · **Last updated:** 2026-06-01

---

## 1. Supabase backup policy

**Project:** Aria-os · Region: ap-southeast-2 · Status: ACTIVE_HEALTHY

Supabase backup tiers:
| Plan | Daily backups | Retention | PITR |
|---|---|---|---|
| Free | Daily snapshots | 7 days | Not available |
| Pro | Daily snapshots | 7 days | Add-on (costs extra) |
| Team / Enterprise | Daily + continuous WAL | 30 days | Included |

**Where to find backups:** Supabase dashboard → Project → Database → Backups tab.

**Recommendation:** Enable Point-in-Time Recovery (PITR) before significant customer data accumulates. PITR lets you restore to any second in the last 7 days (Pro) or 30 days (Team/Enterprise). A daily snapshot only protects against losing up to 24 hours of data; PITR eliminates that gap. This is especially important once live businesses are processing real transactions.

**Risk without PITR:** Accidental bulk update/delete could cost up to 24 hours of data if discovered after the last snapshot was taken.

---

## 2. Application-level data export

**Endpoint:** `GET /api/business/export?business_id=<id>`

- Owner-only (ownership check enforced)
- Returns a downloadable JSON file (`aria-export-<name>-<date>.json`)
- Contains: products, sales (with line items), customers, invoices, expenses, loyalty config
- Satisfies data portability requirements under Australian Privacy Act and GDPR

Run this before any major migration or on a regular schedule as a secondary backup.

---

## 3. Restore procedures (tested 2026-06-01)

### 3a. Restore from Supabase snapshot
1. Go to Supabase dashboard → Database → Backups
2. Select the snapshot closest to before the data loss event
3. Click "Restore" — this replaces the entire database (downtime ~10 min)
4. After restore, redeploy the app to pick up the restored schema
5. Verify key tables: `pos_sales`, `pos_products`, `pos_customers`, `invoices`

### 3b. Restore from JSON export
Use when you have a JSON export from `/api/business/export` and need to re-import specific data.

**Tested procedure (verified 2026-06-01):**
1. Obtain the JSON export file
2. For customers, insert via upsert:
   ```sql
   INSERT INTO pos_customers (id, business_id, name, email, phone, ...)
   VALUES (...)
   ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, name = EXCLUDED.name, ...;
   ```
3. For products, invoices: same upsert pattern on `id`
4. For sales: insert only — do not overwrite existing sales (immutable after creation)

**Test result:** Created test customer `RESTORE_TEST_customer_prr5`, soft-deleted it (disappeared from active list), then re-imported via upsert — customer reappeared with `deleted_at = NULL`. ✅ Verified working.

### 3c. Restore a soft-deleted customer
A customer deleted via the POS has `deleted_at` set — they are NOT hard-deleted.

To restore:
```sql
UPDATE pos_customers SET deleted_at = NULL WHERE id = '<customer_id>';
```
Or via admin Supabase dashboard table editor — filter `deleted_at IS NOT NULL`, update the row.

---

## 4. Migration safety rules

### Rules (binding for all future migrations)
1. **NEVER `DROP TABLE` or `DROP COLUMN`** without an explicit team decision and backup first
2. **NEVER `TRUNCATE`** on any production table with real data
3. **NEVER `DELETE FROM`** in a migration without a `WHERE` clause and data backup
4. **New columns must be nullable or have defaults** — no `NOT NULL` without a `DEFAULT`
5. **All migrations must have an effective rollback** — document the reverse SQL in a comment
6. **Destructive migrations must be applied during low-traffic windows** with a prior backup snapshot triggered manually

### Existing DB-level hard-delete protection (applied 2026-05-24)
The following tables have trigger-based hard-delete prevention applied directly to production:
- `no_hard_delete_pos_sales` — blocks DELETE on pos_sales
- `no_hard_delete_pos_products` — blocks DELETE on pos_products
- `no_hard_delete_invoices` — blocks DELETE on invoices
- `audit_sale_void` — writes audit record on pos_sales UPDATE (void event)

These triggers mean the API's `.delete()` calls on those tables will raise an exception rather than silently deleting data.

### Known past destructive migrations (pre-PRR-5)
| Migration | Operation | Notes |
|---|---|---|
| `drop_duplicate_staff_leave_fkey` | DROP constraint | FK dedup — no data lost |
| `staff_k_m7_drop_pos_staff_leave` | DROP TABLE | Schema redesign — table was empty |
| `delete_sip_wrongly_imported_liquor_products` | DELETE FROM | Wrong test data removed — pre-production |
| `pos_gift_cards DROP COLUMN card_type` | DROP COLUMN (3×) | Column was unused/empty |

---

## 5. Soft-delete policy

### What is soft-deleted
| Table | Column | Deleted how |
|---|---|---|
| `pos_customers` | `deleted_at TIMESTAMPTZ` | `UPDATE SET deleted_at = NOW()` (PRR-5) |
| `pos_products` | `deleted_at TIMESTAMPTZ`, `is_active BOOLEAN` | `UPDATE SET deleted_at = NOW()` |
| `pos_sales` | DB trigger blocks hard-delete; use `status = 'voided'` | |
| `invoices` | DB trigger blocks hard-delete; use `status = 'cancelled'` | |
| `customers` (CRM) | `archived BOOLEAN` | `UPDATE SET archived = true` |

### How to recover soft-deleted data
**POS customer:**
```sql
UPDATE pos_customers SET deleted_at = NULL, updated_at = NOW() WHERE id = '<id>';
```

**POS product:**
```sql
UPDATE pos_products SET deleted_at = NULL, is_active = true WHERE id = '<id>';
```

**Voided sale:** Sales cannot be un-voided — the original records are preserved for audit. Reconstruct if needed.

### What is NOT soft-deleted (appropriate hard deletes)
- Full account deletion (`/api/account/delete`) — GDPR right-to-erasure path, explicit user action
- Bank transactions on Basiq disconnect — user explicitly removing integration
- Square connection records on disconnect
- SEO audit intermediate data — regenerated on next crawl
- Community engagement toggles (like/unlike) — by design

---

## 6. Transaction integrity

### Multi-table writes protected
**`pos/sale` route:** Creates `pos_sales` + `pos_sale_items` in sequence. If items insert fails, the orphaned sale is immediately voided (`status = 'voided', notes = 'system:items_insert_failed'`). This prevents partial data because:
- The voided sale is excluded from all revenue/reporting queries (`neq('status', 'voided')`)
- Hard-delete is blocked by the DB trigger, so marking voided is the compensation

**Limitation:** This is not a true atomic transaction (BEGIN/COMMIT). A server crash between `pos_sales` insert and `pos_sale_items` insert would leave a voided-less orphan. Frequency: extremely low in serverless architecture (each request is atomic at the node process level). Future improvement: move to a `create_sale` Postgres RPC for true atomicity.

### Other multi-table writes
- `customers/merge`: reads secondary, updates primary, soft-deletes secondary — safe as all steps use `supabaseAdmin`
- Xero sync queue: inserts staging record before Aria action — if Aria action fails, sync record is still available for retry

---

## 7. Audit trail

### What is audited
| Event | Table | Details |
|---|---|---|
| POS sale void | `audit_logs` / `aria_action_log` | via `audit_sale_void` DB trigger on UPDATE |
| Customer soft-delete | `deletion_audit_log` | row_id, old_data, performed_by, reason |
| Customer merge | `deletion_audit_log` | secondary ID, performed_by, merged_into |
| Admin plan changes | `admin_audit_log` | via `logAdminAction()` |
| POS discount applied | `pos_audit_log` | discount_pct, max_allowed, performed_by |
| Price override | `pos_audit_log` | original_price, new_price, reason |

### `deletion_audit_log` schema
```
id, table_name, row_id, action, old_data (jsonb), performed_by, performed_at, business_id, reason
```

### Coverage gaps (known, for future phases)
- Price list changes — not yet logged
- Bulk product price updates — not yet logged
- Payroll run creation/deletion — partially covered by `pos_audit_log`

---

## 8. Incident response — suspected data loss

### Immediate steps
1. **Stop the source of loss** — if a cron/process is deleting data, disable it immediately (Vercel dashboard → Cron Jobs → pause)
2. **Assess scope** — check `deletion_audit_log`, `audit_logs`, `activity_log` to understand what changed and when
3. **Check Supabase snapshot** — Supabase dashboard → Backups — identify the last snapshot before the event
4. **Export current state** — run `/api/business/export` immediately to capture current DB state before any restore
5. **Restore** — use snapshot restore (Section 3a) or targeted SQL restore (Section 3b) depending on scope
6. **Post-mortem** — write up what happened, why, and what guard was missing. Add a migration/trigger to prevent recurrence.

### Escalation
- Check Supabase status: https://status.supabase.com
- Supabase support ticket (Pro/Team plan): for backup restores beyond 7 days
- Vercel logs: check for the cron/route that initiated the destructive operation