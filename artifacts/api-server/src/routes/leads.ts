import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { db, leadsTable, callsTable } from "@workspace/db";
import {
  CreateLeadBody,
  UpdateLeadBody,
  ListLeadsQueryParams,
  GetLeadParams,
  UpdateLeadParams,
  DeleteLeadParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leads", async (req, res): Promise<void> => {
  const params = ListLeadsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { search, status, tier, hasPhone, limit, offset } = params.data;

  const filters = [];
  if (search) {
    filters.push(
      or(
        ilike(leadsTable.name, `%${search}%`),
        ilike(leadsTable.address, `%${search}%`),
        ilike(leadsTable.phone, `%${search}%`),
      ),
    );
  }
  if (status) filters.push(eq(leadsTable.status, status));
  if (tier) filters.push(eq(leadsTable.tier, tier));
  if (hasPhone) filters.push(isNotNull(leadsTable.phone));

  const where = filters.length ? and(...filters) : undefined;

  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(leadsTable)
      .where(where)
      .orderBy(desc(leadsTable.leadScore), asc(leadsTable.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(where),
  ]);

  res.json({ items, total: totalRow[0]?.count ?? 0 });
});

router.post("/leads", async (req, res): Promise<void> => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [lead] = await db
    .insert(leadsTable)
    .values({
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      address: parsed.data.address ?? null,
      website: parsed.data.website ?? null,
      leadScore: parsed.data.leadScore ?? 50,
      tier: parsed.data.tier ?? "Warm",
      status: parsed.data.status ?? "new",
      notes: parsed.data.notes ?? null,
    })
    .returning();
  res.status(201).json(lead);
});

router.get("/leads/stats", async (_req, res): Promise<void> => {
  const [totals, byStatus, byTier, byDisposition] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        withPhone: sql<number>`count(*) filter (where ${leadsTable.phone} is not null)::int`,
        called: sql<number>`count(*) filter (where ${leadsTable.callCount} > 0)::int`,
        hotLeads: sql<number>`count(*) filter (where ${leadsTable.tier} = 'Hot')::int`,
      })
      .from(leadsTable),
    db
      .select({
        key: leadsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(leadsTable)
      .groupBy(leadsTable.status),
    db
      .select({
        key: leadsTable.tier,
        count: sql<number>`count(*)::int`,
      })
      .from(leadsTable)
      .groupBy(leadsTable.tier),
    db
      .select({
        key: sql<string>`coalesce(${leadsTable.lastDisposition}, 'NONE')`.as(
          "key",
        ),
        count: sql<number>`count(*)::int`,
      })
      .from(leadsTable)
      .groupBy(sql`coalesce(${leadsTable.lastDisposition}, 'NONE')`),
  ]);

  const t = totals[0] ?? { total: 0, withPhone: 0, called: 0, hotLeads: 0 };
  res.json({
    total: t.total,
    withPhone: t.withPhone,
    called: t.called,
    hotLeads: t.hotLeads,
    byStatus,
    byTier,
    byDisposition,
  });
});

router.get("/leads/:leadId", async (req, res): Promise<void> => {
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.leadId));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const calls = await db
    .select()
    .from(callsTable)
    .where(eq(callsTable.leadId, lead.id))
    .orderBy(desc(callsTable.createdAt));

  res.json({ ...lead, calls });
});

router.patch("/leads/:leadId", async (req, res): Promise<void> => {
  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [lead] = await db
    .update(leadsTable)
    .set(parsed.data)
    .where(eq(leadsTable.id, params.data.leadId))
    .returning();
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  res.json(lead);
});

router.delete("/leads/:leadId", async (req, res): Promise<void> => {
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(leadsTable).where(eq(leadsTable.id, params.data.leadId));
  res.sendStatus(204);
});

export default router;
