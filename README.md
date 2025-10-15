# Description

backend created using nestjs

## Config

Stripe webhook:

```
http://{domain_name}/api/payment/stripe/webhook
```

for development run stripe cli:

```
stripe listen --forward-to localhost:4000/api/payment/stripe/webhook
```

trigger a event for testing:

```
stripe trigger payment_intent.succeeded
```

## Installation

Install all dependencies

```
yarn install
```

## Setup

Copy .env.example to .env and config according to your needs.

Migrate database:

```bash
npx prisma migrate dev
```

Seed dummy data to database

```
yarn cmd seed
```

## Running:

```bash
# development
yarn start

# watch mode
yarn start:dev

# production mode
yarn start:prod

# watch mode with swc compiler (faster)
yarn start:dev-swc
```

For docker:

```
docker compose up
```

## Api documentation

Swagger: http://{domain_name}/api/docs

## Tech used

- Typescript
- Nest.js
- Prisma
- Postgres
- Socket.io
- Bullmq
- Redis
- etc.

## Reminders

The app includes a minute-level scheduler that delivers due routine and habit reminders. Create reminders via the API to match the UI cards.

Endpoints:
- POST /reminders: { name, time("HH:MM"), days(["Mon","Tue",...]) | date("YYYY-MM-DD"), tz, window, habit_id?, routine_id?, active? }
- GET /reminders/upcoming-today: 3-card list for "Coming Up Today"
- GET /reminders/all: list all reminders for the user
- PATCH /reminders/:id: update fields (recomputes next scheduled_at)
- PATCH /reminders/:id/toggle: enable/disable
- DELETE /reminders/:id
- GET /reminders/windows: Morning/Afternoon/Evening/Night segments
- GET /reminders/presets: Flat time presets (HH:MM:SS)

Scheduling rules:
- One-time reminder (date + time): delivered once, then deactivated
- Recurring reminder (time [+ days]): auto-reschedules to next occurrence based on tz and days
- Cron scans every minute, uses a grace window to avoid missing reminders after restarts and de-duplicates with last_triggered_at
