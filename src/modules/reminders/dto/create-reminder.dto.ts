export class CreateReminderDto {
	name?: string;
	// HH:MM or HH:MM:SS (24h)
	time?: string;
	// e.g. ["Mon","Tue",...] or comma string
	days?: string[] | string;
	// IANA TZ like 'America/New_York'
	tz?: string;
	// 'morning' | 'afternoon' | 'evening' | 'night'
	window?: string;
	// YYYY-MM-DD for one-time schedule
	date?: string;
	// Links to entities (optional)
	habit_id?: string;
	routine_id?: string;
	active?: boolean;
}
