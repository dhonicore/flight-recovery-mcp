# Flight Recovery MCP

A NitroStack MCP server that demonstrates a synthetic flight recovery workflow
for disrupted passengers.

## Workflow

The server exposes four tools that are intended to be called in sequence:

1. `assess_disruption` — check the synthetic status, cause, and timing impact
   of a disrupted flight.
2. `map_blast_radius` — identify synthetic downstream commitments that may be
   affected.
3. `rank_alternates` — rank synthetic alternative flights by
   `earliest_arrival` or `lowest_delay`.
4. `plan_recovery` — produce a consolidated recovery plan with a clear
   recommendation and actionable next steps.

## Synthetic fixtures

- `DEMO-BLR-DEL-001` — cancelled morning flight (BLR → DEL).
- `DEMO-BLR-DEL-002` — delayed afternoon flight (BLR → DEL).
- `MOCK-ALT-101` / `MOCK-ALT-102` — synthetic next-day rebooking options on
  2026-10-18.

All data is synthetic. The server does not query live airline systems,
schedules, availability, fares, or booking records.

## Common commands

```bash
npm run dev
npm run build
npm start
```

## Deployment

This project is configured for HTTP transport on `0.0.0.0` and the port
provided by the `PORT` environment variable (default `3000`).

## Links

- Docs: <https://docs.nitrostack.ai>
- NitroStudio: <https://nitrostack.ai/studio>
