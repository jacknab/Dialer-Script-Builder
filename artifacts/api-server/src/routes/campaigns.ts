import { Router, type IRouter } from "express";
import { and, asc, desc, eq, isNotNull, ne, sql, or } from "drizzle-orm";
import {
  db,
  campaignsTable,
  scriptsTable,
  scriptNodesTable,
  leadsTable,
  callsTable,
} from "@workspace/db";
import {
  CreateCampaignBody,
  GetCampaignParams,
  GetCampaignNextLeadParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/campaigns", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(campaignsTable)
    .orderBy(desc(campaignsTable.id));
  res.json(rows);
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [c] = await db
    .insert(campaignsTable)
    .values({
      name: parsed.data.name,
      scriptId: parsed.data.scriptId,
      leadFilter: parsed.data.leadFilter ?? null,
      status: "active",
    })
    .returning();
  res.status(201).json(c);
});

router.get("/campaigns/:campaignId", async (req, res): Promise<void> => {
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [c] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.campaignId));
  if (!c) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, c.scriptId));
  const nodes = script
    ? await db
        .select()
        .from(scriptNodesTable)
        .where(eq(scriptNodesTable.scriptId, script.id))
        .orderBy(asc(scriptNodesTable.id))
    : [];

  const [{ size = 0 } = {}] = await db
    .select({
      size: sql<number>`count(*)::int`,
    })
    .from(leadsTable)
    .where(
      and(
        isNotNull(leadsTable.phone),
        or(
          eq(leadsTable.status, "new"),
          eq(leadsTable.status, "callback"),
        ),
      ),
    );

  res.json({
    ...c,
    script: script ? { ...script, nodes } : null,
    queueSize: size,
  });
});

router.get(
  "/campaigns/:campaignId/next-lead",
  async (req, res): Promise<void> => {
    const params = GetCampaignNextLeadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // pick the next callable lead: must have a phone, not "do_not_call",
    // not "interested" (already won) — order by leadScore desc.
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(
        and(
          isNotNull(leadsTable.phone),
          ne(leadsTable.status, "do_not_call"),
          ne(leadsTable.status, "interested"),
          ne(leadsTable.status, "wrong_number"),
        ),
      )
      .orderBy(desc(leadsTable.leadScore), asc(leadsTable.lastCalledAt), asc(leadsTable.id))
      .limit(1);

    const [{ remaining = 0 } = {}] = await db
      .select({ remaining: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(
        and(
          isNotNull(leadsTable.phone),
          ne(leadsTable.status, "do_not_call"),
          ne(leadsTable.status, "interested"),
          ne(leadsTable.status, "wrong_number"),
        ),
      );

    res.json({ lead: lead ?? undefined, remaining });
    void callsTable;
  },
);

export default router;
