# Outbound Ops — Terminal Dialer

A power dialer for SDRs running outbound cold-call campaigns against local-business lead lists. The current seed dataset is ~9,000 nail salons. The product feels like a Bloomberg-terminal for cold calling: dark background, monospaced type, neon green/amber/cyan accents, ALL-CAPS labels, sharp 1px borders.

## What it does

1. **Lead inbox** — search and triage 9k+ leads with tier / status / disposition.
2. **Script flow editor** — IVR-style script trees: each node is a message + numbered branching options that either jump to another node or record a disposition (INTERESTED / NOT_INTERESTED / CALLBACK / WRONG_NUMBER / NO_ANSWER / DNC).
3. **Campaigns** — pair a script with the lead pool; the system pops the next callable lead by lead score.
4. **Dialer command deck** — keyboard-driven terminal UI: SPACE to dial the next lead, 1-9 to walk the script tree or record a disposition, C to end the call. Live timer + queue counter.
5. **Twilio integration** — when configured, a real outbound call is placed via Twilio's REST API; otherwise, calls are still logged so the agent can practice flow without burning numbers.
6. **Calls log + dashboard** — full call history, KPI cards, disposition breakdown.

## Stack

- Monorepo: pnpm workspaces, TypeScript, OpenAPI-first.
- API contract: `lib/api-spec/openapi.yaml` → Orval generates `@workspace/api-zod` (Zod validators) and `@workspace/api-client-react` (typed React Query hooks).
- Backend: `artifacts/api-server` — Express 5, pino, Drizzle ORM on Postgres.
- Frontend: `artifacts/dialer` — React + Vite + wouter + TanStack Query + shadcn/ui + Recharts.
- DB: `lib/db` — Drizzle schema for `leads`, `scripts`, `script_nodes` (options stored as JSONB), `campaigns`, `calls`.
- Seed: `scripts/src/seed.ts` — imports the attached CSV (~9,022 leads), creates a default "NAIL SALON COLD CALL v1" script with a 4-node tree (INTRO → PITCH → DEMO_OFFER + GATEKEEPER), and creates a default campaign.

## Twilio

`artifacts/api-server/src/lib/twilio.ts` calls the Twilio REST API directly (no SDK) using `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`. When credentials are missing, `/api/twilio/status` reports "not connected" and the dialer shows an amber warning banner. Outbound calls play a brief greeting then hold the line open while the agent works the script and ends manually.

## Routes

Frontend: `/` dashboard, `/leads`, `/leads/:id`, `/scripts`, `/scripts/:id`, `/campaigns`, `/campaigns/:id`, `/dialer?campaignId=N`, `/calls`, `/settings`.

API (under `/api`): leads CRUD + stats, scripts CRUD + nodes CRUD, campaigns + next-lead pop, calls (start/update/end), dashboard/summary, dashboard/recent-calls, twilio/status.

## Re-seeding

```bash
cd scripts && pnpm exec tsx ./src/seed.ts
```

The seed is idempotent — if leads or scripts already exist it skips re-creating them.
