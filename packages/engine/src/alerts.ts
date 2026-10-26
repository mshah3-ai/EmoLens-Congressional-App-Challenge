/** Pure alert-scheduling decisions (spec 15.2). The app turns decisions into notifications. */
import { ALERT_COOLDOWN_MIN, ALERT_LEAD_MIN, CONFIRM_DELAY_MIN, MINUTE_MS, type RiskLevel } from '@emolens/shared';
import { localMinuteOf, parseHHMM } from './features/time';

export interface UpcomingBlock { start: number; end: number; localDate: string; level: RiskLevel; }
export interface ExistingAlert { id: string; blockStart: number; localDate: string; scheduledFor: number; status: 'scheduled' | 'delivered' | 'cancelled' | 'suppressed'; }
export type SuppressReason = 'quiet_hours' | 'daily_max' | 'cooldown' | 'recent_episode' | 'learning';

export interface AlertPlanInput {
  now: number;
  tz: string;
  blocks: UpcomingBlock[];
  existing: ExistingAlert[];
  episodeTimes: number[];
  quietHours: { start: string; end: string };
  maxPerDay: number;
  learning: boolean;
  earlyAlertsEnabled: boolean;
}
export interface AlertPlan {
  cancel: string[];
  deliver: string[];
  create: { blockStart: number; localDate: string; fireAt: number; confirmAt: number }[];
  suppress: { blockStart: number; localDate: string; fireAt: number; reason: SuppressReason }[];
}

export function inQuietHours(t: number, tz: string, q: { start: string; end: string }): boolean {
  const m = localMinuteOf(t, tz), a = parseHHMM(q.start), b = parseHHMM(q.end);
  return a <= b ? m >= a && m < b : m >= a || m < b;
}

export function planAlerts(inp: AlertPlanInput): AlertPlan {
  const plan: AlertPlan = { cancel: [], deliver: [], create: [], suppress: [] };
  const levelByBlock = new Map(inp.blocks.map((b) => [b.start, b.level]));
  const live: { blockStart: number; localDate: string; fireAt: number }[] = [];
  for (const a of inp.existing) {
    if (a.status === 'scheduled' && levelByBlock.has(a.blockStart) && levelByBlock.get(a.blockStart) !== 'high' && a.scheduledFor > inp.now) {
      plan.cancel.push(a.id);
      continue;
    }
    if (a.status === 'scheduled' && a.scheduledFor <= inp.now) plan.deliver.push(a.id);
    if (a.status === 'scheduled' || a.status === 'delivered') live.push({ blockStart: a.blockStart, localDate: a.localDate, fireAt: a.scheduledFor });
  }
  const cancelled = new Set(plan.cancel);
  const hasAlert = new Set(inp.existing.filter((a) => a.status !== 'cancelled' && !cancelled.has(a.id)).map((a) => a.blockStart));

  for (const B of [...inp.blocks].sort((a, b) => a.start - b.start)) {
    if (B.level !== 'high' || hasAlert.has(B.start) || B.end <= inp.now) continue;
    let fire = B.start - ALERT_LEAD_MIN * MINUTE_MS;
    if (fire < inp.now) {
      if (inp.now < B.end - 30 * MINUTE_MS) fire = inp.now + 5000;
      else continue;
    }
    const sup = (reason: SuppressReason) => { plan.suppress.push({ blockStart: B.start, localDate: B.localDate, fireAt: fire, reason }); hasAlert.add(B.start); };
    if (inQuietHours(fire, inp.tz, inp.quietHours)) { sup('quiet_hours'); continue; }
    if (live.filter((a) => a.localDate === B.localDate).length >= inp.maxPerDay) { sup('daily_max'); continue; }
    if (live.some((a) => Math.abs(a.fireAt - fire) < ALERT_COOLDOWN_MIN * MINUTE_MS)) { sup('cooldown'); continue; }
    if (fire <= inp.now + 60_000 && inp.episodeTimes.some((t) => t >= fire - 60 * MINUTE_MS && t <= fire)) { sup('recent_episode'); continue; }
    if (inp.learning && !inp.earlyAlertsEnabled) { sup('learning'); continue; }
    plan.create.push({ blockStart: B.start, localDate: B.localDate, fireAt: fire, confirmAt: B.end + CONFIRM_DELAY_MIN * MINUTE_MS });
    live.push({ blockStart: B.start, localDate: B.localDate, fireAt: fire });
    hasAlert.add(B.start);
  }
  return plan;
}
