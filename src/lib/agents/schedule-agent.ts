import { BaseAgent } from './base-agent';
import type { AgentType, AgentDecisionInput, AgentRunResult } from './types';

const REVENUE_PER_CASHIER_PER_HOUR = 200; // AUD
const DAYPART_LABELS: Record<string, string> = {
  morning: '9–12', lunch: '12–14', arvo: '14–17', evening: '17–22',
};
function getDaypart(hour: number): string {
  if (hour < 12) return 'morning';
  if (hour < 14) return 'lunch';
  if (hour < 17) return 'arvo';
  return 'evening';
}

// Australian public holidays 2026 (AEST) — excluded from baseline avg to avoid skew
const AU_PUBLIC_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-26', '2026-04-03', '2026-04-06',
  '2026-04-25', '2026-06-08', '2026-11-03', '2026-12-25',
  '2026-12-26', '2026-12-28',
]);

const AU_HOLIDAY_NAMES: Record<string, string> = {
  '2026-01-01': "New Year's Day", '2026-01-26': 'Australia Day',
  '2026-04-03': 'Good Friday', '2026-04-06': 'Easter Monday',
  '2026-04-25': 'ANZAC Day', '2026-06-08': "King's Birthday",
  '2026-11-03': 'Melbourne Cup', '2026-12-25': 'Christmas Day',
  '2026-12-26': 'Boxing Day', '2026-12-28': 'Boxing Day (observed)',
};

interface StaffRow { id: string; name: string; role: string; hourly_rate_cents?: number | null; rsa_expiry?: string | null; max_hours_week?: number | null; availability?: Record<string, number[][]> | null; }
interface ShiftAssignment { staff_id: string; staff_name: string; hour: number; day: string; hourly_rate_cents: number; reasoning: string; }

const DOW_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function isStaffAvailable(staff: StaffRow, dow: number, hour: number): boolean {
  const dayKey = DOW_NAMES[dow];
  const windows: number[][] = (staff.availability as Record<string, number[][]>)?.[dayKey] ?? [];
  if (!windows.length) return true; // no restrictions = always available
  return windows.some(([start, end]) => hour >= start && hour < end);
}

function isRSAValid(staff: StaffRow): boolean {
  if (!staff.rsa_expiry) return true;
  return new Date(staff.rsa_expiry) > new Date();
}

export class ScheduleAgent extends BaseAgent {
  type: AgentType = 'schedule';

  async run(business_id: string): Promise<AgentRunResult> {
    const started = Date.now();
    const errors: Error[] = [];
    const settings = await this.getSettings(business_id);
    if (!settings.enabled) return { decisions: [], errors: [], duration_ms: Date.now() - started };

    try {
      const { data: outlets } = await this.supabase.from('pos_outlets').select('id,name').eq('business_id', business_id).limit(10);
      if (!outlets?.length) return { decisions: [], errors: [], duration_ms: Date.now() - started };

      const { data: staff } = await this.supabase.from('pos_staff').select('id,name,role').eq('business_id', business_id).eq('is_active', true).limit(50);
      if (!staff?.length) return { decisions: [], errors: [], duration_ms: Date.now() - started };

      // 4-week hourly revenue history
      const fourWeeksAgo = new Date(Date.now() - 28 * 86400000).toISOString();
      const { data: salesHistory } = await this.supabase.from('pos_sales')
        .select('created_at,total_amount,outlet_id')
        .eq('business_id', business_id)
        .neq('status', 'voided')
        .gte('created_at', fourWeeksAgo)
        .limit(5000);

      // Build hourly revenue grid [outlet][dow][hour] = avg revenue
      // Exclude public holidays from baseline to avoid skewing averages
      const grid: Record<string, Record<number, Record<number, number[]>>> = {};
      for (const sale of (salesHistory ?? [])) {
        const d = new Date(sale.created_at);
        const dateStr = d.toISOString().split('T')[0];
        if (AU_PUBLIC_HOLIDAYS_2026.has(dateStr)) continue; // exclude holidays from baseline
        const dow = d.getDay();
        const hour = d.getHours();
        const oid = sale.outlet_id ?? outlets[0].id;
        if (!grid[oid]) grid[oid] = {};
        if (!grid[oid][dow]) grid[oid][dow] = {};
        if (!grid[oid][dow][hour]) grid[oid][dow][hour] = [];
        grid[oid][dow][hour].push(sale.total_amount ?? 0);
      }

      // Next 7 days
      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() + 1); // start tomorrow

      const decisions: AgentDecisionInput[] = [];

      for (const outlet of (outlets as Array<{ id: string; name: string }>)) {
        const shifts: ShiftAssignment[] = [];
        const staffHours: Record<string, number> = {};
        const eligibleStaff = (staff as StaffRow[]).filter(s => isRSAValid(s));
        // Daypart coverage gap tracking
        const daypartGapRevenue: Record<string, number> = { morning: 0, lunch: 0, arvo: 0, evening: 0 };
        const daypartCoveredRevenue: Record<string, number> = { morning: 0, lunch: 0, arvo: 0, evening: 0 };
        let salesProtected = 0;

        for (let d = 0; d < 7; d++) {
          const date = new Date(weekStart);
          date.setDate(date.getDate() + d);
          const dow = date.getDay();
          const dateStr = date.toISOString().split('T')[0];

          for (let h = 9; h < 22; h++) { // 9am-10pm operating hours
            const revenues = grid[outlet.id]?.[dow]?.[h] ?? [];
            const avgRevenue = revenues.length > 0 ? revenues.reduce((s, v) => s + v, 0) / revenues.length : 0;
            const targetStaff = Math.max(1, Math.ceil(avgRevenue / REVENUE_PER_CASHIER_PER_HOUR));

            // Assign cheapest available staff up to targetStaff
            const available = eligibleStaff
              .filter(s => isStaffAvailable(s, dow, h) && (staffHours[s.id] ?? 0) < (s.max_hours_week ?? 38) && (staffHours[s.id] ?? 0) < 8)
              .sort((a, b) => (a.hourly_rate_cents ?? 2500) - (b.hourly_rate_cents ?? 2500));

            const assigned = available.slice(0, targetStaff);
            const dp = getDaypart(h);
            if (assigned.length >= targetStaff) {
              daypartCoveredRevenue[dp] = (daypartCoveredRevenue[dp] ?? 0) + avgRevenue;
              salesProtected += avgRevenue;
            } else {
              daypartGapRevenue[dp] = (daypartGapRevenue[dp] ?? 0) + avgRevenue;
            }
            for (const s of assigned) {
              staffHours[s.id] = (staffHours[s.id] ?? 0) + 1;
              shifts.push({ staff_id: s.id, staff_name: s.name, hour: h, day: dateStr, hourly_rate_cents: 2500, reasoning: `${s.name} assigned — predicted A$${avgRevenue.toFixed(0)} revenue this hour` });
            }
          }
        }

        if (!shifts.length) continue;

        const totalHours = Object.values(staffHours).reduce((s, v) => s + v, 0);
        const totalCostCents = shifts.reduce((s, sh) => s + sh.hourly_rate_cents, 0);

        // Check if any day in the roster week is a public holiday
        const holidaysInWeek: string[] = [];
        for (let d = 0; d < 7; d++) {
          const date = new Date(weekStart);
          date.setDate(date.getDate() + d);
          const ds = date.toISOString().split('T')[0];
          if (AU_PUBLIC_HOLIDAYS_2026.has(ds)) holidaysInWeek.push(`Note: ${ds} is ${AU_HOLIDAY_NAMES[ds] ?? 'public holiday'} — forecast adjusted.`);
        }

        const reasoning = await this.claudeReason({
          system: 'You are Aria, summarising a generated staff roster for an Australian bottle shop manager. Be specific with hours and cost. Max 2 sentences. Australian English.',
          user: `Outlet: ${outlet.name}. Roster: ${shifts.length} shifts, ${totalHours} staff-hours, A$${(totalCostCents / 100).toFixed(0)} cost. Strongest demand: ${shifts.filter(s => s.reasoning.includes('200')).length > 0 ? 'peak hours covered' : 'steady coverage'}. ${holidaysInWeek.join(' ')} Summarise why this roster looks right.`,
          maxTokens: 120,
          agent_key: 'schedule',
          role: 'rostering',
          business_id,
        });

        // Save roster row
        await this.supabase.from('pos_rosters').upsert({
          business_id, outlet_id: outlet.id,
          week_start: weekStart.toISOString().split('T')[0],
          shifts: shifts, total_hours: totalHours,
          total_cost_cents: totalCostCents,
          generated_by_agent: true, published: false,
        }, { onConflict: 'business_id,outlet_id,week_start' });

        // Coverage gap summary per daypart
        const coverageGaps = Object.keys(daypartGapRevenue)
          .filter(dp => daypartGapRevenue[dp] > 0)
          .map(dp => ({ daypart: dp, label: DAYPART_LABELS[dp], gap_revenue: Math.round(daypartGapRevenue[dp] * 100) / 100 }));

        decisions.push({
          business_id, agent_type: 'schedule',
          decision_data: {
            outlet_id: outlet.id, outlet_name: outlet.name,
            week_start: weekStart.toISOString().split('T')[0],
            shift_count: shifts.length, total_hours: totalHours,
            total_cost_cents: totalCostCents,
            sales_protected: Math.round(salesProtected * 100) / 100,
            coverage_gaps: coverageGaps,
            daypart_covered: Object.fromEntries(
              Object.keys(daypartCoveredRevenue).map(dp => [dp, Math.round(daypartCoveredRevenue[dp] * 100) / 100])
            ),
          },
          reasoning, confidence_score: 0.72,
          projected_impact_cents: Math.round(salesProtected * 100),
          expires_at: weekStart.toISOString(),
        });
      }

      const saved = await this.saveDecisions(decisions);
      const result: AgentRunResult = { decisions: saved, errors, duration_ms: Date.now() - started };
      await this.logRun(business_id, result);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      errors.push(err);
      return { decisions: [], errors, duration_ms: Date.now() - started };
    }
  }
}
