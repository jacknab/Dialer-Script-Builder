import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import { db, callsTable, leadsTable } from "@workspace/db";
import { GetRecentCallsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [totalsRow] = await db
    .select({
      totalLeads: sql<number>`count(*)::int`,
      leadsWithPhone: sql<number>`count(*) filter (where ${leadsTable.phone} is not null)::int`,
      hotLeads: sql<number>`count(*) filter (where ${leadsTable.tier} = 'Hot')::int`,
    })
    .from(leadsTable);

  const [callsRow] = await db
    .select({
      totalCalls: sql<number>`count(*)::int`,
      callsToday: sql<number>`count(*) filter (where ${callsTable.createdAt} >= now() - interval '24 hours')::int`,
      connectedToday: sql<number>`count(*) filter (where ${callsTable.createdAt} >= now() - interval '24 hours' and ${callsTable.disposition} is not null)::int`,
      avgDurationSec: sql<number>`coalesce(avg(${callsTable.durationSec}), 0)::float`,
    })
    .from(callsTable);

  const dispositions = await db
    .select({
      key: sql<string>`coalesce(${callsTable.disposition}, 'PENDING')`.as(
        "key",
      ),
      count: sql<number>`count(*)::int`,
    })
    .from(callsTable)
    .groupBy(sql`coalesce(${callsTable.disposition}, 'PENDING')`)
    .orderBy(sql`count(*) desc`);

  res.json({
    totalLeads: totalsRow?.totalLeads ?? 0,
    leadsWithPhone: totalsRow?.leadsWithPhone ?? 0,
    hotLeads: totalsRow?.hotLeads ?? 0,
    totalCalls: callsRow?.totalCalls ?? 0,
    callsToday: callsRow?.callsToday ?? 0,
    connectedToday: callsRow?.connectedToday ?? 0,
    avgDurationSec: callsRow?.avgDurationSec ?? 0,
    dispositions,
  });
});

router.get("/dashboard/recent-calls", async (req, res): Promise<void> => {
  const params = GetRecentCallsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select({
      id: callsTable.id,
      leadId: callsTable.leadId,
      scriptId: callsTable.scriptId,
      campaignId: callsTable.campaignId,
      twilioCallSid: callsTable.twilioCallSid,
      status: callsTable.status,
      disposition: callsTable.disposition,
      notes: callsTable.notes,
      durationSec: callsTable.durationSec,
      pathTaken: callsTable.pathTaken,
      startedAt: callsTable.startedAt,
      endedAt: callsTable.endedAt,
      createdAt: callsTable.createdAt,
      leadName: leadsTable.name,
      leadPhone: leadsTable.phone,
    })
    .from(callsTable)
    .leftJoin(leadsTable, sql`${leadsTable.id} = ${callsTable.leadId}`)
    .orderBy(desc(callsTable.createdAt))
    .limit(params.data.limit);
  res.json(rows);
});

export default router;
