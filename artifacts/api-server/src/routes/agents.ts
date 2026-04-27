import { Router, type IRouter } from "express";
import { gte, sql } from "drizzle-orm";
import { db, agentsTable } from "@workspace/db";
import { AgentHeartbeatBody } from "@workspace/api-zod";

const router: IRouter = Router();

const ONLINE_WINDOW_MS = 60_000;

router.post("/agents/heartbeat", async (req, res): Promise<void> => {
  const parsed = AgentHeartbeatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const now = new Date();
  await db
    .insert(agentsTable)
    .values({
      identity: parsed.data.identity,
      displayName: parsed.data.displayName,
      status: parsed.data.status ?? "available",
      currentCallId: parsed.data.currentCallId ?? null,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: agentsTable.identity,
      set: {
        displayName: parsed.data.displayName,
        status: parsed.data.status ?? "available",
        currentCallId: parsed.data.currentCallId ?? null,
        lastSeenAt: now,
      },
    });
  res.json({ ok: true });
});

router.get("/agents/online", async (_req, res): Promise<void> => {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
  const rows = await db
    .select()
    .from(agentsTable)
    .where(gte(agentsTable.lastSeenAt, cutoff))
    .orderBy(sql`${agentsTable.lastSeenAt} DESC`);
  res.json(rows);
});

export default router;
