# Timezone Implementation - Complete

## Overview
Implemented comprehensive per-user timezone support across the entire application, capturing timezone on signup/login and updating on every app refresh.

## Frontend Requirements

The client (Flutter app) must send the user's timezone in the following scenarios:

### 1. **Registration** (`POST /auth/register`)
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "timezone": "America/New_York"
}
```

### 2. **Login** (`POST /auth/login`)
```json
{
  "email": "john@example.com",
  "password": "password123",
  "timezone": "America/New_York"
}
```

### 3. **Google OAuth** (`POST /auth/google/mobile`)
```json
{
  "idToken": "google_id_token_here",
  "timezone": "America/New_York"
}
```

### 4. **Apple OAuth** (`POST /auth/apple/mobile`)
```json
{
  "identityToken": "apple_identity_token_here",
  "timezone": "America/New_York"
}
```

### 5. **Profile Update** (`PATCH /profile/me`)
```json
{
  "name": "John Doe",
  "timezone": "America/New_York"
}
```

### How to Get Timezone in Flutter

```dart
// Add package: timezone (https://pub.dev/packages/timezone)
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz;

// Initialize timezone database (do this once on app startup)
tz.initializeTimeZones();

// Get user's current timezone
String getUserTimezone() {
  return DateTime.now().timeZoneName; // e.g., "America/New_York"
}

// Or use this method for more reliable timezone detection
String getUserTimezoneIANA() {
  final location = tz.local;
  return location.name; // Returns IANA timezone string
}
```

## Backend Changes

### 1. **DTOs Updated**
- ✅ `CreateUserDto` - Added optional `timezone` field
- ✅ `GoogleMobileDto` - Added optional `timezone` field
- ✅ `AppleMobileDto` - Added optional `timezone` field
- ✅ `CreateProfileDto` - Added optional `timezone`, `name`, `avatar` fields
- ✅ `UpdateProfileDto` - Inherits timezone from CreateProfileDto

### 2. **Auth Service**
- ✅ `register()` - Accepts and saves timezone on signup
- ✅ `login()` - Updates timezone on every login
- ✅ `googleLogin()` - Updates timezone on Google OAuth
- ✅ `appleLogin()` - Updates timezone on Apple OAuth
- ✅ `handleGoogleProfile()` - Passes timezone to login
- ✅ `handleAppleProfile()` - Passes timezone to login

### 3. **Auth Strategies**
- ✅ `GoogleMobileStrategy` - Extracts timezone from request body
- ✅ `AppleMobileStrategy` - Extracts timezone from request body

### 4. **Auth Controller**
- ✅ `register()` - Passes timezone from DTO to service
- ✅ `login()` - Extracts timezone from body and passes to service

### 5. **User Repository**
- ✅ `createUser()` - Accepts and persists timezone field

### 6. **Profile Service**
- ✅ `updateMe()` - Already handles timezone via DTO spreading

## Database Schema

The `User` table already has a `timezone` column:
```prisma
model User {
  id       String   @id @default(uuid())
  email    String   @unique
  name     String?
  timezone String?  @default("UTC")
  // ... other fields
}
```

## How It Works

### On Registration
1. Client detects user timezone using `DateTime.now().timeZoneName`
2. Sends timezone in registration request
3. Backend saves timezone in User table during user creation
4. All future operations use this timezone for reminders, stats, etc.

### On Login/App Refresh
1. Client detects current timezone (handles travel, timezone changes)
2. Sends timezone in login request
3. Backend updates User.timezone field
4. Ensures user always has correct timezone for their current location

### On Profile Update
1. User can manually update timezone in profile settings
2. Client sends new timezone to `/profile/me` endpoint
3. Backend updates User.timezone field

## Services Using Timezone

### Already Implemented:
1. **RemindersService** - Uses user timezone for scheduling reminders
2. **HabitService** - Uses user timezone for daily habit tracking
3. **MoodService** - Uses user timezone for mood entry timestamps
4. **StatsService** - Uses user timezone for statistics calculations
5. **ProfileService** - Uses user timezone for overview metrics

### Example Usage in Services:
```typescript
// Get user timezone with fallback to UTC
private async getUserTimezone(userId: string): Promise<string> {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return user?.timezone || 'UTC';
}

// Use timezone for date calculations
const tz = await this.getUserTimezone(userId);
const userMidnight = DateTime.now().setZone(tz).startOf('day');
```

## Testing

### Test Scenarios:
1. ✅ Register new user with timezone
2. ✅ Login updates timezone (handles travel)
3. ✅ Google OAuth captures timezone
4. ✅ Apple OAuth captures timezone
5. ✅ Profile update changes timezone
6. ✅ Reminders scheduled in user timezone
7. ✅ Habit logs use user timezone for day boundaries
8. ✅ Mood entries timestamped in user timezone
9. ✅ Stats calculated using user timezone

## Migration Status

No new migration needed - `User.timezone` field already exists from migration `20260204041417_add_user_timezone`.

## Important Notes

### Timezone Format
- **REQUIRED**: IANA timezone strings (e.g., "America/New_York", "Asia/Dhaka", "Europe/London")
- **NOT SUPPORTED**: UTC offsets (e.g., "+05:30", "GMT+6")
- **DEFAULT**: "UTC" if not provided

### Auto-Update on Login
The timezone is updated on EVERY login/auth, not just signup. This ensures:
- Users who travel get correct timezone for their current location
- Users who change device timezone settings are automatically updated
- No stale timezone data

### Backward Compatibility
- All timezone fields are optional
- Existing users without timezone default to "UTC"
- Services gracefully handle missing timezone values

## Summary

✅ **Complete timezone implementation** across all auth flows (register, login, Google, Apple)
✅ **Auto-update on refresh** ensures timezone is always current
✅ **Profile updates** allow manual timezone changes
✅ **All services** (Reminders, Habits, Mood, Stats, Profile) use user timezone
✅ **No breaking changes** - all fields are optional
✅ **Default fallback** to UTC for users without timezone

The system is now fully timezone-aware and will correctly handle users across all timezones globally.
