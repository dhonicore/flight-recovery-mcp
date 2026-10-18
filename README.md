# Flight Recovery MCP

A cancelled flight breaks more than the flight: it ripples into hotel check-in, a client dinner, and the morning meeting. This MCP server lets an AI agent map the impact, rank replacement flights, and propose a recovery plan in one prompt.

- **Live MCP URL:** `<RENDER_URL>`
- **Demo video:** `<VIDEO_URL>`

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

## Fixtures

Disrupted flights:

- `DEMO-BLR-DEL-001` — cancelled morning BLR→DEL flight.
- `DEMO-BLR-DEL-002` — delayed afternoon BLR→DEL flight.

Replacement alternates:

- `MOCK-ALT-101` — one stop, high connection risk, earliest arrival.
- `MOCK-ALT-102` — nonstop, low risk, protects the meeting.
- `MOCK-ALT-103` — nonstop, low risk, lowest cost, latest arrival.

All dates and times are generated relative to today (IST) so the fixtures never go stale.

## Priority table

| Priority | Top choice | Why |
|---|---|---|
| `protect_meeting` (default) | `MOCK-ALT-102` | Nonstop; keeps the downstream meeting and hotel check-in. |
| `earliest_arrival` | `MOCK-ALT-101` | Arrives earliest, but the short connection puts commitments at risk. |
| `lowest_cost` | `MOCK-ALT-103` | Cheapest listed option; misses dinner and hotel check-in. |

## How to connect

Add the MCP URL as a custom connector in Claude:

`Customize` > `Connectors` > `Add custom connector`

## Production path (not implemented)

| Domain | Planned integration | Status |
|---|---|---|
| Flight status | Flight-status API | not implemented |
| Calendar | Google Calendar via OAuth | not implemented |
| Hotel | Hotel partner API | not implemented |
| Rebooking | Airline/GDS partner API with user approval | not implemented |

## Synthetic-data note

All data is mock. Nothing is booked or sent. Every action returned is a proposal that needs user approval.

## Local commands

```bash
npm install
npm run dev
npm run build
npm start
npm run check   # domain-level assertions
```

## Links

- GitHub repo: <https://github.com/dhonicore/flight-recovery-mcp>
- Docs: <https://docs.nitrostack.ai>
- NitroStudio: <https://nitrostack.ai/studio>
