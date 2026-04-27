import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, callsTable, leadsTable } from "@workspace/db";
import {
  GetVoiceTokenBody,
  HoldCallBody,
  UnholdCallBody,
  TransferCallBody,
  LeaveCallBody,
} from "@workspace/api-zod";
import {
  buildAgentConferenceTwiml,
  endCallSid,
  holdParticipant,
  isVoiceConfigured,
  mintVoiceToken,
  placeAgentIntoConference,
  placeLeadIntoConference,
} from "../lib/twilio";

const router: IRouter = Router();

/**
 * POST /api/voice/token
 * Returns a short-lived Voice access token for the browser SDK.
 */
router.post("/voice/token", async (req, res): Promise<void> => {
  const parsed = GetVoiceTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isVoiceConfigured()) {
    res.status(503).json({
      error:
        "Voice is not configured. Add TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, and TWILIO_TWIML_APP_SID secrets, then restart.",
    });
    return;
  }

  const result = mintVoiceToken(parsed.data.identity);
  if (!result) {
    res.status(500).json({ error: "Failed to mint token" });
    return;
  }
  res.json(result);
});

/**
 * POST /api/voice/twiml — Twilio webhook
 * Twilio hits this when an agent's browser places a call via the TwiML App.
 * We respond with TwiML that drops the agent into a unique conference,
 * and simultaneously dial the lead into the same conference via REST.
 *
 * Custom params from the Device.connect({ params }) call arrive on the body
 * and on the URL: callId, leadPhone are required. agentIdentity is filled
 * from the Twilio "From" param ("client:NAME").
 */
router.post("/voice/twiml", async (req, res): Promise<void> => {
  const merged = { ...(req.body ?? {}), ...(req.query ?? {}) };
  const callIdRaw = merged["callId"];
  const callId = callIdRaw ? Number(callIdRaw) : NaN;
  const fromRaw = String(merged["From"] ?? "");
  const agentIdentity = fromRaw.startsWith("client:")
    ? fromRaw.slice("client:".length)
    : null;

  if (!callId || Number.isNaN(callId)) {
    req.log.warn({ merged }, "voice/twiml missing callId");
    res
      .type("text/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Missing call identifier.</Say><Hangup/></Response>`,
      );
    return;
  }

  const [call] = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.id, callId));
  if (!call) {
    res
      .type("text/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Call not found.</Say><Hangup/></Response>`,
      );
    return;
  }

  const conferenceName = call.conferenceName ?? `dialer-${call.id}`;

  // Persist agent identity + agent-leg call SID for hold/transfer ops later.
  const agentCallSid = String(merged["CallSid"] ?? "") || null;
  await db
    .update(callsTable)
    .set({
      conferenceName,
      agentIdentity: agentIdentity ?? call.agentIdentity,
      agentCallSid: agentCallSid ?? call.agentCallSid,
    })
    .where(eq(callsTable.id, call.id));

  // Dial the lead into the same conference (only on the FIRST agent who
  // joins — i.e. don't re-dial on transfer when another agent's TwiML hits us).
  if (!call.twilioCallSid) {
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, call.leadId));
    if (lead?.phone) {
      const dialed = await placeLeadIntoConference({
        to: lead.phone,
        conferenceName,
      });
      if (dialed.success && dialed.callSid) {
        await db
          .update(callsTable)
          .set({ twilioCallSid: dialed.callSid, status: "ringing" })
          .where(eq(callsTable.id, call.id));
      } else {
        req.log.warn({ err: dialed.error }, "Failed to dial lead into conference");
      }
    } else {
      req.log.warn({ leadId: call.leadId }, "Lead has no phone");
    }
  }

  res
    .type("text/xml")
    .send(buildAgentConferenceTwiml({ conferenceName, endOnAgentExit: false }));
});

/**
 * POST /api/voice/hold — put the lead leg on hold (with music)
 */
router.post("/voice/hold", async (req, res): Promise<void> => {
  const parsed = HoldCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [call] = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.id, parsed.data.callId));
  if (!call) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  if (!call.conferenceName || !call.twilioCallSid) {
    res
      .status(409)
      .json({ error: "Call is not in a conference (browser audio required)" });
    return;
  }
  const ok = await holdParticipant({
    conferenceName: call.conferenceName,
    callSid: call.twilioCallSid,
    hold: true,
  });
  if (ok) {
    await db
      .update(callsTable)
      .set({ holdState: true })
      .where(eq(callsTable.id, call.id));
  }
  res.json({ ok, message: ok ? "Lead on hold" : "Failed to put lead on hold" });
});

router.post("/voice/unhold", async (req, res): Promise<void> => {
  const parsed = UnholdCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [call] = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.id, parsed.data.callId));
  if (!call) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  if (!call.conferenceName || !call.twilioCallSid) {
    res.status(409).json({ error: "Call is not in a conference" });
    return;
  }
  const ok = await holdParticipant({
    conferenceName: call.conferenceName,
    callSid: call.twilioCallSid,
    hold: false,
  });
  if (ok) {
    await db
      .update(callsTable)
      .set({ holdState: false })
      .where(eq(callsTable.id, call.id));
  }
  res.json({ ok, message: ok ? "Lead resumed" : "Failed to resume" });
});

/**
 * POST /api/voice/transfer
 * Dial target agent's browser into the conference. With mode=blind the
 * original agent's leg is dropped immediately. With mode=warm the original
 * agent stays on the line until they manually leave.
 */
router.post("/voice/transfer", async (req, res): Promise<void> => {
  const parsed = TransferCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [call] = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.id, parsed.data.callId));
  if (!call) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  if (!call.conferenceName) {
    res.status(409).json({ error: "Call is not in a conference" });
    return;
  }

  const dialed = await placeAgentIntoConference({
    targetIdentity: parsed.data.targetIdentity,
    conferenceName: call.conferenceName,
  });
  if (!dialed.success) {
    res.status(502).json({ ok: false, message: dialed.error });
    return;
  }

  const mode = parsed.data.mode ?? "blind";
  if (mode === "blind" && call.agentCallSid) {
    await endCallSid(call.agentCallSid).catch(() => {});
    await db
      .update(callsTable)
      .set({ status: "transferred", agentCallSid: null })
      .where(eq(callsTable.id, call.id));
  } else {
    await db
      .update(callsTable)
      .set({ status: "transferring" })
      .where(eq(callsTable.id, call.id));
  }
  res.json({ ok: true, message: `Transferred (${mode}) to ${parsed.data.targetIdentity}` });
});

/**
 * POST /api/voice/leave — drop only the agent's leg (lead stays on hold/conf)
 */
router.post("/voice/leave", async (req, res): Promise<void> => {
  const parsed = LeaveCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [call] = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.id, parsed.data.callId));
  if (!call) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  if (call.agentCallSid) {
    await endCallSid(call.agentCallSid).catch(() => {});
  }
  await db
    .update(callsTable)
    .set({ agentCallSid: null })
    .where(eq(callsTable.id, call.id));
  res.json({ ok: true, message: "Agent leg dropped" });
});

export default router;
