# Flight Recovery MCP

When a flight is cancelled, the airline app tells you the flight is gone but not what else breaks. Flight Recovery MCP joins three mock sources—airline status and alternates, traveller commitments, and transfer buffer—so an AI agent can map the impact, rank replacement flights against what matters most, and return a specific proposed plan.

## Demo

- **Demo video:** `TODO_VIDEO_URL`
- **Live MCP URL:** `TODO_LIVE_URL`
- **GitHub repo:** <https://github.com/dhonicore/flight-recovery-mcp>

## Tools (call in order)

1. `assess_disruption` — returns the disrupted flight's status, cause, and timing.
2. `map_blast_radius` — checks which commitments (client dinner, hotel late check-in, downstream meeting) are affected.
3. `rank_alternates` — ranks three replacement flights and returns one server-side recommendation.
4. `plan_recovery` — returns specific ordered proposed actions for the chosen or recommended flight.

## Example prompt

```text
My flight DEMO-BLR-DEL-001 just got cancelled. I have a client dinner, a hotel with late check-in, and a 9:30 AM meeting that matters most, so a missed connection is not acceptable. Fix my trip.
```

Expected tool chain: `assess_disruption` → `map_blast_radius` → `rank_alternates` → `plan_recovery`.

## Priority table

| Priority | Top choice | Why |
|---|---|---|
| `protect_meeting` (default) | `MOCK-ALT-102` | Nonstop; keeps the meeting and hotel check-in. |
| `earliest_arrival` | `MOCK-ALT-101` | Arrives earliest, but the short connection puts commitments at risk. |
| `lowest_cost` | `MOCK-ALT-103` | Cheapest nonstop option; misses dinner and hotel check-in. |

## Synthetic alternates

| ID | Departure | Arrival | Stops | Connection risk | Cost (USD) |
|---|---|---|---|---|---|
| `MOCK-ALT-101` | Day +2, 14:00 IST | Day +2, 18:30 IST | 1 | High (30 min connection) | 180 |
| `MOCK-ALT-102` | Day +2, 18:15 IST | Day +2, 20:30 IST | 0 | Low | 220 |
| `MOCK-ALT-103` | Day +2, 23:30 IST | Day +3, 07:00 IST | 0 | Low | 95 |

All times are generated relative to the current IST date, so fixtures never go stale.

## How to connect

Connect any MCP client to the HTTP transport:

```text
http://<host>:<port>/mcp
```

Or legacy SSE:

```text
http://<host>:<port>/sse
```

## Data notice

All data is synthetic. This server does not query live airline systems, schedules, availability, fares, booking records, hotel systems, or calendars. Every action returned is a proposal that requires user approval (`requires_user_approval: true`, `executed: false`).

## Common commands

```bash
npm run build
npm run check   # domain-level assertions
npm run dev     # local development
npm start       # production server
```

## What's next

- Real airline schedule and rebooking APIs.
- Calendar and hotel connector integrations.
- Live policy/entitlement checks.

## Deployment

This project is configured for HTTP transport on `0.0.0.0` and the port provided by the `PORT` environment variable (default `3000`).

## Links

- Docs: <https://docs.nitrostack.ai>
- NitroStudio: <https://nitrostack.ai/studio>
