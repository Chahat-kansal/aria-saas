-- Add requires_briefing_refresh flag to businesses
alter table businesses
  add column if not exists requires_briefing_refresh boolean not null default false;

-- Trigger function: mark briefing stale whenever invoices are mutated
create or replace function trg_invoices_mark_briefing_stale()
returns trigger language plpgsql as $$
begin
  update businesses
  set requires_briefing_refresh = true
  where id = coalesce(NEW.business_id, OLD.business_id);
  return null;
end;
$$;

drop trigger if exists invoices_briefing_stale on invoices;
create trigger invoices_briefing_stale
  after insert or update or delete on invoices
  for each row execute procedure trg_invoices_mark_briefing_stale();