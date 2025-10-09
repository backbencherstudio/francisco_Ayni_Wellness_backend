import { $Enums } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

// Preferred time windows (end hour is exclusive for slot generation)
// Each window uses [start,end) hours (end exclusive). We generate 30-min slots
// but business/UI wants the first visible slot at :30 (e.g., 6:30 not 6:00).
export const PREF_WINDOWS: Record<string,{ start:number; end:number; firstHalf?: boolean; }> = {
  Morning: { start: 6, end: 10, firstHalf: false },      // display from 06:30 to 09:30
  Afternoon: { start: 12, end: 16, firstHalf: false },   // 12:30 - 15:30
  Evening: { start: 18, end: 21, firstHalf: false },     // 18:30 - 20:30
  Night: { start: 21, end: 23, firstHalf: false },       // 21:30 - 22:30 (window labeled 9-11 PM)
};

export interface ReminderSlot {
  value: string;      // HH:MM legacy
  value_iso: string;  // HH:MM:00 ISO-like
  label: string;      // 6:30 AM
}

// Normalize various UI labels to enum keys
export function normalizePreferred(raw?: string): $Enums.PreferredTime | undefined {
  if (!raw) return undefined;
  const labelToKey: Record<string,$Enums.PreferredTime> = {
    'Morning (6-10 AM)': 'Morning',
    'Afternoon (12-4 PM)': 'Afternoon',
    'Evening (6-9 PM)': 'Evening',
    'Night (9-11 PM)': 'Night',
    // legacy accepted
    'Morning (6-10am)': 'Morning',
    'Afternoon (10am-2pm)': 'Afternoon',
    'Evening (2pm-6pm)': 'Evening',
    'Night (6pm-10pm)': 'Night',
  };
  if (['Morning','Afternoon','Evening','Night'].includes(raw)) return raw as $Enums.PreferredTime;
  return labelToKey[raw];
}

export function formatAmPm(h:number,m:number) {
  const suffix = h>=12? 'PM':'AM';
  const hour12 = ((h+11)%12)+1;
  return `${hour12}:${m.toString().padStart(2,'0')} ${suffix}`;
}

export function generatePreferredSlots(pref: $Enums.PreferredTime): ReminderSlot[] {
  const win = PREF_WINDOWS[pref];
  if (!win) return [];
  const slots: ReminderSlot[] = [];
  for (let h = win.start; h < win.end; h++) {
    for (let m of [0,30]) {
      if (h === win.end && m>0) continue; // guard end boundary
      // Skip the first :00 in each window to start at :30 visual requirement
      if (h === win.start && m === 0) continue;
      const hour = h.toString().padStart(2,'0');
      const mm = m.toString().padStart(2,'0');
      const base = `${hour}:${mm}`;       // for UI selection
      const iso = `${hour}:${mm}:00`;     // stored value
      slots.push({ value: base, value_iso: iso, label: formatAmPm(h,m) });
    }
  }
  // Ensure last slot ends 30 minutes before end boundary (e.g., 09:30 when end=10)
  return slots;
}

export function validateReminderAgainstPreferred(reminder: string, pref?: $Enums.PreferredTime) {
  if (!pref) return; // nothing to validate
  const win = PREF_WINDOWS[pref]; if (!win) return;
  let timePart = reminder.trim();
  const isoDateTimeMatch = timePart.match(/T(\d{2}:\d{2}:\d{2})/);
  if (isoDateTimeMatch) timePart = isoDateTimeMatch[1];
  const match = timePart.match(/^([0-2]\d):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) throw new BadRequestException('reminder_time must be HH:MM or HH:MM:SS (optionally inside ISO datetime)');
  const h = parseInt(match[1],10); const m = parseInt(match[2],10);
  if (m !==0 && m !==30) throw new BadRequestException('reminder_time must be on 30-minute boundary');
  if (h < win.start || h >= win.end || (h === win.end && m>0)) {
    throw new BadRequestException(`reminder_time must fall within ${pref} window`);
  }
}

export function getReminderSlots(preferredRaw: string) {
  const pref = normalizePreferred(preferredRaw);
  if (!pref) throw new BadRequestException('Invalid preferred time');
  const slots = generatePreferredSlots(pref);
  // Provide a UI label echo (maintain design string)
  const uiLabelMap: Record<$Enums.PreferredTime,string> = {
    Morning: 'Morning (6-10 AM)',
    Afternoon: 'Afternoon (12-4 PM)',
    Evening: 'Evening (6-9 PM)',
    Night: 'Night (9-11 PM)'
  } as const;
  return { success: true, preferred_time: pref, preferred_time_label: uiLabelMap[pref], slots, format: { ui: 'label', value: 'HH:MM', stored: 'HH:MM:SS' } };
}