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

## Twilio + Browser Softphone

`artifacts/api-server/src/lib/twilio.ts` uses the official `twilio` Node SDK and exposes:

- **Outbound REST dial** (legacy / fallback): `placeOutboundCall()` — places a direct call, plays a greeting, holds the line.
- **Voice Access Token minting** for the browser softphone (`mintVoiceToken`) — requires API Key + TwiML App.
- **Conference helpers** for browser-audio calls: `placeLeadIntoConference`, `placeAgentIntoConference`, `holdParticipant` (with Twilio's S3 hold music URL by default), `endCallSid`.

Two env-var groups:

1. PSTN dialing only (already configured):
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
2. Browser softphone (in-browser audio + hold + transfer):
   - `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`
   - The TwiML App's Voice URL (in the Twilio Console) must POST to `https://<deployed-domain>/api/voice/twiml`.

`/api/twilio/status` reports both `connected` (PSTN) and `voiceConnected` (browser softphone).

### Conference call flow (browser softphone)
1. Agent presses Call. `POST /api/calls` runs with `useBrowserAudio: true`, creates a row, and reserves `conferenceName = dialer-${callId}`. **No outbound REST call is placed yet.**
2. Frontend `Device.connect({ params: { callId } })` triggers Twilio to POST `/api/voice/twiml`.
3. The webhook responds with TwiML that drops the agent into the conference, AND simultaneously dials the lead into the same conference via REST. Lead's CallSid is stored on the row.
4. Hold/Resume calls `/api/voice/hold|/voice/unhold` — Twilio's REST `participants.update` toggles `hold` with `holdUrl` set to `MARKOVICHAMP-Borghestral.mp3` (override via `TWILIO_HOLD_MUSIC_URL`).
5. Transfer dials a target agent (`client:<identity>`) into the same conference. Blind transfer also drops the original agent's leg via `endCallSid`.
6. `/api/voice/leave` drops only the agent's leg (lead stays).

### Agent presence (no auth yet)
- `lib/db/src/schema/agents.ts` — agents table keyed by `identity` (random ID stored in localStorage), with `displayName`, `status`, `lastSeenAt`.
- Frontend pings `/api/agents/heartbeat` every 30s. `/api/agents/online` returns rows seen in the last 60s. The transfer dialog uses this list.
- `displayName` is editable inline in the dialer header. Identity is auto-generated and persistent per browser.

## Routes

Frontend: `/` dashboard, `/leads`, `/leads/:id`, `/scripts`, `/scripts/:id`, `/campaigns`, `/campaigns/:id`, `/dialer?campaignId=N` (also works without param — picks first active campaign), `/calls`, `/settings`.

API (under `/api`): leads CRUD + stats, scripts CRUD + nodes CRUD, campaigns + next-lead pop, calls (start/update/end), dashboard/summary, dashboard/recent-calls, twilio/status, voice/{token,twiml,hold,unhold,transfer,leave}, agents/{heartbeat,online}.

## Codegen note

Orval generates both api-zod and api-client-react. The api-zod codegen step now `rm -f`s the auto-generated `lib/api-zod/src/index.ts` (orval keeps re-creating it with broken `./generated/api.schemas` re-exports); the package's `exports` field points directly at `./src/generated/api.ts`.

## Re-seeding

```bash
cd scripts && pnpm exec tsx ./src/seed.ts
```

The seed is idempotent — if leads or scripts already exist it skips re-creating them.
