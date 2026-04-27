# Outbound Ops — Terminal Dialer

A complete reference for the power dialer: what it does, how it's built, how the browser softphone (hold + transfer) works, what to configure in Twilio, how to run and deploy it, and how to extend it.

---

## 1. Product Overview

**What it is.** A browser-based outbound power dialer for SDRs running cold-call campaigns against local-business lead lists. Current seed dataset is ~9,022 nail salons. The look-and-feel is a Bloomberg-terminal-style command deck: dark background, monospaced type, neon green / amber / cyan accents, ALL-CAPS labels, sharp 1px borders.

**Core capabilities**
- Lead inbox: search, triage, and tier 9k+ leads.
- Script flow editor: IVR-style script trees (each node is a message + numbered branching options that either jump to another node or record a disposition).
- Campaigns: pair a script with a lead pool; the system pops the next callable lead by lead score.
- Dialer command deck: keyboard-driven UI — `SPACE` to dial, `1-9` to walk the script tree or record dispositions, `H` hold, `M` mute, `T` transfer, `C` end call.
- **Browser softphone** (Twilio Voice WebRTC): the agent talks through their laptop mic/speakers — no headset bridge required.
- **Hold with music** (Twilio's S3 hold music URL by default; override with `TWILIO_HOLD_MUSIC_URL`).
- **Transfer** to another logged-in agent (warm = both stay on the line, blind = drop the originating agent).
- Calls log + dashboard with KPI cards and disposition breakdown.

**Dispositions**
`INTERESTED`, `NOT_INTERESTED`, `CALLBACK`, `WRONG_NUMBER`, `NO_ANSWER`, `DNC`, plus dynamic `TRANSFERRED_TO_<identity>` and `ABANDONED`.

---

## 2. Tech Stack

| Layer        | Choice                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| Monorepo     | pnpm workspaces, TypeScript everywhere                                 |
| API contract | OpenAPI YAML at `lib/api-spec/openapi.yaml`                            |
| Codegen      | Orval → `@workspace/api-zod` (Zod) + `@workspace/api-client-react` (typed React Query hooks) |
| Backend      | `artifacts/api-server` — Express 5, pino, Drizzle ORM on Postgres, official `twilio` Node SDK |
| Frontend     | `artifacts/dialer` — React + Vite + wouter + TanStack Query + shadcn/ui + Recharts + `@twilio/voice-sdk` |
| Database     | Postgres via `lib/db` (Drizzle): `leads`, `scripts`, `script_nodes`, `campaigns`, `calls`, `agents` |
| Seed         | `scripts/src/seed.ts` — imports the attached CSV, creates a default 4-node script (INTRO → PITCH → DEMO_OFFER + GATEKEEPER), creates a default campaign |

---

## 3. Repo Layout

```
artifacts/
  api-server/          # Express API (port from $PORT)
    src/
      lib/twilio.ts    # SDK helpers: token mint, TwiML, conferences, hold
      routes/
        calls.ts       # Start/update/end calls
        voice.ts       # token, twiml webhook, hold, unhold, transfer, leave
        agents.ts      # heartbeat, online
        ...
  dialer/              # React + Vite app, mounted at /
    src/
      pages/dialer.tsx # The command deck
      lib/
        twilio-device.ts   # useTwilioDevice() — auto-register + connect
        agent-presence.ts  # localStorage identity + heartbeat + online polling
  mockup-sandbox/      # Component preview server (design tooling)
lib/
  api-spec/openapi.yaml          # Source of truth
  api-zod/                       # Generated Zod validators
  api-client-react/              # Generated typed RQ hooks
  db/src/schema/                 # Drizzle schemas (leads, scripts, calls, agents...)
scripts/src/seed.ts              # Idempotent seeding
docs/DIALER_GUIDE.md             # This file
```

---

## 4. Database Schema (relevant tables)

**`calls`** — extended for the browser softphone:
- `id`, `leadId`, `scriptId`, `campaignId`, `status`, `disposition`, `pathTaken`, `duration`, `notes`, timestamps
- `twilioCallSid` — legacy outbound REST CallSid (lead leg under PSTN-only mode)
- `agentCallSid` — agent's browser-leg CallSid (under conference mode)
- `agentIdentity` — Twilio Client identity that placed the call
- `conferenceName` — `dialer-${callId}` (reserved at row creation time)
- `conferenceSid` — populated by Twilio status callbacks (optional)
- `holdState` — `live` | `hold`

**`agents`** — presence (no auth yet):
- `identity` (PK) — random ID stored in browser localStorage, persistent per browser
- `displayName` — editable inline in the dialer header (uppercase, ≤24 chars)
- `status` — `available` | `on_call` | `wrap` | `offline`
- `currentCallId` (nullable)
- `lastSeenAt` — updated on every heartbeat

---

## 5. API Surface

All routes prefixed with `/api`.

| Verb | Path                                  | Purpose                                                  |
| ---- | ------------------------------------- | -------------------------------------------------------- |
| GET  | `/twilio/status`                      | Returns `{ connected, voiceConnected }`                  |
| GET  | `/leads`, `/leads/:id`, `/leads/stats`| Lead inbox + stats                                        |
| GET  | `/scripts`, `/scripts/:id`            | Script CRUD + nodes                                      |
| GET  | `/campaigns`, `/campaigns/:id`        | Campaign CRUD                                            |
| GET  | `/campaigns/:id/next-lead`            | Pop next callable lead by score                          |
| POST | `/calls`                              | Start a call (accepts `useBrowserAudio` + `agentIdentity`)|
| PATCH| `/calls/:id`                          | Update status / disposition / pathTaken                  |
| POST | `/calls/:id/end`                      | End the call (and the conference legs)                   |
| GET  | `/dashboard/summary`, `/dashboard/recent-calls` | KPI cards + recent activity feed                         |
| POST | `/voice/token`                        | Mint a Voice Access Token for the current agent identity |
| POST | `/voice/twiml`                        | TwiML webhook hit by Twilio when the browser dials       |
| POST | `/voice/hold`                         | Put the lead's leg on hold (music plays)                 |
| POST | `/voice/unhold`                       | Resume the lead                                           |
| POST | `/voice/transfer`                     | Dial another agent into the conference (warm or blind)   |
| POST | `/voice/leave`                        | Drop just the agent's leg                                |
| POST | `/agents/heartbeat`                   | Upsert presence row, refresh `lastSeenAt`                |
| GET  | `/agents/online`                      | Agents seen in the last 60 seconds                       |

---

## 6. Browser Softphone — How a Call Flows

```
┌──────────┐  1.POST /api/calls          ┌──────────┐
│ Dialer   │ ───────────────────────────▶│ API      │  reserves conferenceName=dialer-<id>
│ (browser)│                             │ Server   │  NO outbound dial yet
└──────────┘ ◀── { id, conferenceName }──└──────────┘
      │
      │ 2. Device.connect({ params:{ callId } })
      ▼
┌──────────────┐  POST /api/voice/twiml  ┌──────────┐
│   Twilio     │ ───────────────────────▶│ API      │ stores agentCallSid + agentIdentity,
│ (Voice SDK + │                         │          │ fires REST dial of LEAD into same conf,
│  TwiML App)  │ ◀── TwiML <Conference> ─│          │ returns TwiML putting AGENT into conf
└──────────────┘                         └──────────┘
      │
      ▼
   conference dialer-<id>:  agent ↔ lead
```

Step by step:

1. **Agent presses `SPACE`.** Frontend calls `POST /api/calls` with `useBrowserAudio: true`, `agentIdentity`, and the lead/script/campaign IDs. The server creates the row, sets `conferenceName = dialer-${id}`, and returns it. **No outbound call is placed yet.**
2. **Frontend connects the softphone.** `device.connect({ params: { callId: String(call.id) } })`. The Twilio Voice SDK opens an audio session; Twilio fetches our **TwiML App's Voice URL** (`/api/voice/twiml`) over POST.
3. **TwiML webhook does two things:**
   - Stores the agent's `CallSid` (passed as `From`/`CallSid`) and `agentIdentity` on the row.
   - Fires a REST call to dial the **lead's** number into `dialer-${callId}` (this becomes the lead leg, `agentCallSid`'s peer).
   - Responds with `<Response><Dial><Conference>dialer-<id></Conference></Dial></Response>` — which puts the **agent** into the same conference.
4. **Hold.** `POST /api/voice/hold` calls `client.conferences(name).participants(leadCallSid).update({ hold: true, holdUrl: HOLD_MUSIC_URL })`. Default music: Twilio's `MARKOVICHAMP-Borghestral.mp3`. Override with `TWILIO_HOLD_MUSIC_URL`.
5. **Transfer.** `POST /api/voice/transfer { targetIdentity, mode }` dials `client:<targetIdentity>` into the same conference.
   - **Warm**: both agents stay on the line. The originating agent confirms the hand-off then leaves manually.
   - **Blind**: server immediately calls `endCallSid(agentCallSid)` after the new agent is dialed, dropping the originator.
6. **Leave.** `POST /api/voice/leave` ends only the agent's leg (the lead stays in the conference, useful for park/queue patterns).
7. **End call.** `POST /api/calls/:id/end` closes any remaining legs and the conference.

### Frontend hooks

- `useTwilioDevice(identity)` — auto-fetches a Voice token, registers a `Device`, exposes `{ status, error, connect, disconnect, muteSelf }`. Auto-accepts incoming `Call`s so transfers ring straight through.
- `useAgentPresence({ status, currentCallId })` — manages the localStorage identity + display name, posts a heartbeat every 30s, polls `/agents/online` every 10s, exposes `{ self, online, renameSelf }`.

### Hotkeys

| Key       | When         | Action                                  |
| --------- | ------------ | --------------------------------------- |
| `SPACE`   | READY        | Dial next lead                          |
| `1`–`9`   | LIVE         | Walk script tree or record disposition  |
| `H`       | LIVE         | Hold / Resume                           |
| `M`       | LIVE         | Mute / Unmute mic                       |
| `T`       | LIVE         | Open transfer dialog                    |
| `C`       | LIVE         | End call (records `ABANDONED` if no dispo) |

---

## 7. Twilio Configuration

### 7.1 PSTN-only mode (already configured)
Set these for plain outbound dialing without the in-browser softphone:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` (e.g. `+18888147623`)

`/api/twilio/status.connected` will be `true`.

### 7.2 Browser softphone mode (hold + transfer)
Add these three on top of the PSTN ones:
- `TWILIO_API_KEY_SID` — starts with `SK...`
- `TWILIO_API_KEY_SECRET` — shown **once** at creation time
- `TWILIO_TWIML_APP_SID` — starts with `AP...`

`/api/twilio/status.voiceConnected` will be `true` and the dialer header will show `MIC READY` instead of `PSTN ONLY`.

### 7.3 Twilio Console steps

1. **Create an API Key**
   Console → Account → API keys & tokens → "Create API key" (type: **Standard**).
   Copy the **SID** and **Secret** (Secret is shown only once).

2. **Create a TwiML App**
   Console → Voice → TwiML → TwiML Apps → "Create new TwiML App".
   - **Voice REQUEST URL**: `https://<your-published-domain>.replit.app/api/voice/twiml`
   - **Method**: `POST`
   - Save and copy the **App SID** (`AP...`).

3. **Set the three env vars** (see §7.2). The server auto-detects them on restart.

4. (Optional) **Custom hold music**: set `TWILIO_HOLD_MUSIC_URL` to any publicly reachable MP3 / WAV.

### 7.4 Deployed URL is mandatory
The TwiML webhook must be reachable by Twilio's servers, so the `Voice REQUEST URL` must point at the **deployed** domain (not localhost). Develop locally → publish → set the TwiML App URL once → all subsequent code changes work without re-touching Twilio.

---

## 8. Local Development

```bash
# Install deps (run at repo root)
pnpm install

# Push DB schema
pnpm --filter @workspace/db drizzle-kit push

# Seed leads + default script + default campaign (idempotent)
cd scripts && pnpm exec tsx ./src/seed.ts

# Workflows (auto-managed by the platform):
#   artifacts/api-server: API Server
#   artifacts/dialer:     web
#   artifacts/mockup-sandbox: Component Preview Server
```

Frontend is mounted at `/`, API at `/api/*`.

### Codegen

```bash
# Regenerate Zod + React Query clients from openapi.yaml
pnpm --filter @workspace/api-spec run codegen
```

**Caveat (resolved, but worth knowing).** Orval insists on regenerating
`lib/api-zod/src/index.ts` with broken `./generated/api.schemas` re-exports.
Our codegen script `rm -f`s that file after orval runs, and `lib/api-zod/package.json`'s
`exports` field points directly at `./src/generated/api.ts`. Don't restore the
re-export file — orval will overwrite it.

---

## 9. Environment Variables

| Key                        | Required for                                | Notes                                   |
| -------------------------- | ------------------------------------------- | --------------------------------------- |
| `DATABASE_URL`             | Always                                      | Postgres connection string              |
| `SESSION_SECRET`           | Always                                      | Express session signing                 |
| `PORT`                     | Always (set by platform)                    | API server binds here                   |
| `TWILIO_ACCOUNT_SID`       | Outbound calling (PSTN + browser)           | `AC...`                                 |
| `TWILIO_AUTH_TOKEN`        | Outbound calling (PSTN + browser)           |                                         |
| `TWILIO_PHONE_NUMBER`      | Outbound calling (PSTN + browser)           | E.164 format                            |
| `TWILIO_API_KEY_SID`       | Browser softphone                           | `SK...`                                 |
| `TWILIO_API_KEY_SECRET`    | Browser softphone                           | Shown once                              |
| `TWILIO_TWIML_APP_SID`     | Browser softphone                           | `AP...`                                 |
| `TWILIO_HOLD_MUSIC_URL`    | Optional                                    | Custom hold music URL                   |

---

## 10. Frontend Routes

| Path                   | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `/`                    | Dashboard (KPIs, recent calls)            |
| `/leads`               | Lead inbox                                |
| `/leads/:id`           | Lead detail + history                     |
| `/scripts`             | Script list                               |
| `/scripts/:id`         | Script tree editor                        |
| `/campaigns`           | Campaign list                             |
| `/campaigns/:id`       | Campaign detail                           |
| `/dialer`              | Command deck (auto-picks first active campaign) |
| `/dialer?campaignId=N` | Command deck for a specific campaign      |
| `/calls`               | Call log                                  |
| `/settings`            | Twilio + agent settings                   |

---

## 11. Re-seeding

```bash
cd scripts && pnpm exec tsx ./src/seed.ts
```

The seed is idempotent — if leads or scripts already exist, it skips re-creating them.

---

## 12. Multi-Agent Walkthrough (testing transfers)

1. Open the dialer in two different browsers (or one normal + one incognito).
2. Set distinct names in the agent-name input at the top of each dialer.
3. Both browsers register a Twilio Voice device using a unique random `identity` (kept in localStorage).
4. Browser A starts a call. Browser B appears in `AGENTS ONLINE`.
5. Browser A presses `T` → picks Browser B → **WARM** keeps both on, **BLIND** drops Browser A immediately.
6. Browser B's softphone auto-accepts the incoming `Call` and joins the conference.

---

## 13. Architecture Notes & Gotchas

- **Conference name is reserved before the call.** This means hold/transfer work the moment Twilio places the lead leg — there's no race where the agent presses hold before the conference exists.
- **Identity is browser-scoped, not user-scoped.** No auth yet. Replace localStorage-derived identity with a real user ID once authentication ships (Replit Auth or Clerk).
- **The TwiML webhook is the single place where the lead REST dial is fired.** Don't dial the lead from `POST /api/calls` — that race-conditions the conference.
- **Codec preferences** in `twilio-device.ts` use an `as any` cast on `["opus", "pcmu"]` to satisfy the SDK's enum typing.
- **Vite HMR** occasionally complains about stale `api.schemas.ts` after codegen; one full reload clears it.
- **Status callbacks** for the conference (`conferenceSid`) are not wired in yet. Add a `/api/voice/conference-status` webhook and configure it on the TwiML `<Conference>` element if you want join/leave events in the DB.

---

## 14. Roadmap / What's Next

- Real authentication (Replit Auth or Clerk) → derive `agentIdentity` from the user record.
- Call recording (Twilio recording on the conference; stored URL + transcript on the call row).
- Voicemail-detection-aware dial (`MachineDetection=DetectMessageEnd` on the lead leg, branch in the TwiML).
- Outbound queues / round-robin dispatch instead of one-at-a-time pop.
- Conference status webhook + live "who's on this call" indicator in the dashboard.
- Configurable hold music per campaign.
- Push-to-talk / silent monitoring for managers (`<Conference muted="true" coach="...">`).

---

## 15. Quick Sanity Checklist before going live

- [ ] DB migrated (`drizzle-kit push`) and seeded.
- [ ] PSTN env vars set; `/api/twilio/status.connected` is `true`.
- [ ] Browser env vars set; `/api/twilio/status.voiceConnected` is `true`.
- [ ] TwiML App's Voice URL points at the **deployed** `/api/voice/twiml`, method `POST`.
- [ ] Agent name shows in the dialer header.
- [ ] Test call lands and lead leg picks up; agent hears them in browser audio.
- [ ] `H` toggles hold music; `M` mutes the mic; `T` shows the other agent.
- [ ] Disposition saved on `C` end-call.
