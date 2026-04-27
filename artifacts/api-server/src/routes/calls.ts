import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  callsTable,
  leadsTable,
  campaignsTable,
} from "@workspace/db";
import {
  StartCallBody,
  UpdateCallBody,
  GetCallParams,
  UpdateCallParams,
  EndCallParams,
  ListCallsQueryParams,
} from "@workspace/api-zod";
import {
  endTwilioCall,
  isTwilioConfigured,
  isVoiceConfigured,
  placeOutboundCall,
} from "../lib/twilio";

const router: IRouter = Router();

async function joinLead(rows: Array<typeof callsTable.$inferSelect>) {
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map((r) => r.leadId)));
  const leads = await db
    .select({
      id: leadsTable.id,
      name: leadsTable.name,
      phone: leadsTable.phone,
    })
    .from(leadsTable)
    .where(sql`${leadsTable.id} = ANY(${ids})`);
  const byId = new Map(leads.map((l) => [l.id, l]));
  return rows.map((r) => ({
    ...r,
    leadName: byId.get(r.leadId)?.name ?? "Unknown",
    leadPhone: byId.get(r.leadId)?.phone ?? null,
  }));
}

router.get("/calls", async (req, res): Promise<void> => {
  const params = ListCallsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const filters = [];
  if (params.data.leadId) filters.push(eq(callsTable.leadId, params.data.leadId));

  const rows = await db
    .select()
    .from(callsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(callsTable.createdAt))
    .limit(params.data.limit);

  res.json(await joinLead(rows));
});

router.post("/calls", async (req, res): Promise<void> => {
  const parsed = StartCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, parsed.data.leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  let twilioCallSid: string | null = null;
  let status = "initiated";
  const useBrowserAudio = parsed.data.useBrowserAudio === true;

  // Browser-audio mode: don't place the outbound call here. The browser
  // softphone will trigger it via the TwiML webhook and we'll record the
  // lead's call SID at that point. Just create the row + reserve a
  // conference name for hold/transfer.
  if (useBrowserAudio) {
    if (!lead.phone) {
      status = "no_phone";
    } else if (!isTwilioConfigured()) {
      status = "no_twilio";
    } else {
      status = "browser_pending";
    }
  } else if (lead.phone && isTwilioConfigured()) {
    const result = await placeOutboundCall({ to: lead.phone });
    if (result.success && result.callSid) {
      twilioCallSid = result.callSid;
      status = "ringing";
    } else {
      req.log.warn({ error: result.error }, "Twilio call failed");
      status = "twilio_error";
    }
  } else if (!lead.phone) {
    status = "no_phone";
  } else {
    status = "no_twilio";
  }

  const [call] = await db
    .insert(callsTable)
    .values({
      leadId: parsed.data.leadId,
      scriptId: parsed.data.scriptId ?? null,
      campaignId: parsed.data.campaignId ?? null,
      agentIdentity: parsed.data.agentIdentity ?? null,
      twilioCallSid,
      status,
      startedAt: new Date(),
    })
    .returning();

  // Reserve a deterministic conference name for browser-audio calls so
  // the TwiML webhook (which fires after the browser connects) can find it.
  if (useBrowserAudio && call) {
    const conferenceName = `dialer-${call.id}`;
    await db
      .update(callsTable)
      .set({ conferenceName })
      .where(eq(callsTable.id, call.id));
    call.conferenceName = conferenceName;
  }

  await db
    .update(leadsTable)
    .set({
      callCount: sql`${leadsTable.callCount} + 1`,
      lastCalledAt: new Date(),
      status: lead.status === "new" ? "contacted" : lead.status,
    })
    .where(eq(leadsTable.id, lead.id));

  if (parsed.data.campaignId) {
    await db
      .update(campaignsTable)
      .set({ callsMade: sql`${campaignsTable.callsMade} + 1` })
      .where(eq(campaignsTable.id, parsed.data.campaignId));
  }

  res.status(201).json(call);
});

router.get("/calls/:callId", async (req, res): Promise<void> => {
  const params = GetCallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [call] = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.id, params.data.callId));
  if (!call) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const [withLead] = await joinLead([call]);
  res.json(withLead);
});

router.patch("/calls/:callId", async (req, res): Promise<void> => {
  const params = UpdateCallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [call] = await db
    .update(callsTable)
    .set(parsed.data)
    .where(eq(callsTable.id, params.data.callId))
    .returning();
  if (!call) {
    res.status(404).json({ error: "Call not found" });
    return;
  }

  // If a disposition was set, propagate to the lead.
  if (parsed.data.disposition) {
    const updates: Record<string, unknown> = {
      lastDisposition: parsed.data.disposition,
    };
    const dispLower = parsed.data.disposition.toLowerCase();
    if (dispLower.includes("interested") && !dispLower.includes("not")) {
      updates["status"] = "interested";
    } else if (dispLower.includes("not interested")) {
      updates["status"] = "not_interested";
    } else if (dispLower.includes("callback")) {
      updates["status"] = "callback";
    } else if (dispLower.includes("wrong")) {
      updates["status"] = "wrong_number";
    } else if (dispLower.includes("dnc") || dispLower.includes("do not")) {
      updates["status"] = "do_not_call";
    }
    await db.update(leadsTable).set(updates).where(eq(leadsTable.id, call.leadId));
  }
  res.json(call);
});

router.post("/calls/:callId/end", async (req, res): Promise<void> => {
  const params = EndCallParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.id, params.data.callId));
  if (!existing) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  const endedAt = new Date();
  const startedAt = existing.startedAt ?? existing.createdAt;
  const durationSec = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
  );

  if (existing.twilioCallSid) {
    await endTwilioCall(existing.twilioCallSid).catch(() => {});
  }

  const [call] = await db
    .update(callsTable)
    .set({
      status: "completed",
      endedAt,
      durationSec,
    })
    .where(eq(callsTable.id, existing.id))
    .returning();
  res.json(call);
});

router.get("/twilio/status", async (_req, res): Promise<void> => {
  const configured = isTwilioConfigured();
  const voice = isVoiceConfigured();
  res.json({
    connected: configured,
    voiceConnected: voice,
    phoneNumber: process.env["TWILIO_PHONE_NUMBER"] ?? null,
    message: configured
      ? voice
        ? "Twilio + browser softphone ready"
        : "Twilio is connected. Add TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_TWIML_APP_SID to enable the browser softphone."
      : "Twilio credentials are not configured. Calls will be logged but not placed.",
  });
});

export default router;
