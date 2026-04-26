import { Router, type IRouter } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db, scriptsTable, scriptNodesTable } from "@workspace/db";
import {
  CreateScriptBody,
  UpdateScriptBody,
  GetScriptParams,
  UpdateScriptParams,
  DeleteScriptParams,
  CreateScriptNodeParams,
  CreateScriptNodeBody,
  UpdateScriptNodeParams,
  UpdateScriptNodeBody,
  DeleteScriptNodeParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/scripts", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: scriptsTable.id,
      name: scriptsTable.name,
      description: scriptsTable.description,
      isActive: scriptsTable.isActive,
      rootNodeId: scriptsTable.rootNodeId,
      createdAt: scriptsTable.createdAt,
      nodeCount: sql<number>`(select count(*)::int from ${scriptNodesTable} where ${scriptNodesTable.scriptId} = ${scriptsTable.id})`,
    })
    .from(scriptsTable)
    .orderBy(asc(scriptsTable.id));
  res.json(rows);
});

router.post("/scripts", async (req, res): Promise<void> => {
  const parsed = CreateScriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [script] = await db
    .insert(scriptsTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive ?? true,
    })
    .returning();
  res.status(201).json({ ...script, nodes: [] });
});

router.get("/scripts/:scriptId", async (req, res): Promise<void> => {
  const params = GetScriptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, params.data.scriptId));
  if (!script) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  const nodes = await db
    .select()
    .from(scriptNodesTable)
    .where(eq(scriptNodesTable.scriptId, script.id))
    .orderBy(asc(scriptNodesTable.id));
  res.json({ ...script, nodes });
});

router.patch("/scripts/:scriptId", async (req, res): Promise<void> => {
  const params = UpdateScriptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateScriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [script] = await db
    .update(scriptsTable)
    .set(parsed.data)
    .where(eq(scriptsTable.id, params.data.scriptId))
    .returning();
  if (!script) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  const nodes = await db
    .select()
    .from(scriptNodesTable)
    .where(eq(scriptNodesTable.scriptId, script.id))
    .orderBy(asc(scriptNodesTable.id));
  res.json({ ...script, nodes });
});

router.delete("/scripts/:scriptId", async (req, res): Promise<void> => {
  const params = DeleteScriptParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(scriptNodesTable)
    .where(eq(scriptNodesTable.scriptId, params.data.scriptId));
  await db
    .delete(scriptsTable)
    .where(eq(scriptsTable.id, params.data.scriptId));
  res.sendStatus(204);
});

router.post("/scripts/:scriptId/nodes", async (req, res): Promise<void> => {
  const params = CreateScriptNodeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateScriptNodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [node] = await db
    .insert(scriptNodesTable)
    .values({
      scriptId: params.data.scriptId,
      title: parsed.data.title ?? null,
      message: parsed.data.message,
      nodeType: parsed.data.nodeType ?? "menu",
      options: (parsed.data.options ?? []).map((o) => ({
        key: o.key,
        label: o.label,
        nextNodeId: o.nextNodeId ?? null,
        disposition: o.disposition ?? null,
      })),
    })
    .returning();

  // If this is the script's first node, set it as root.
  const [scriptRow] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, params.data.scriptId));
  if (scriptRow && scriptRow.rootNodeId == null) {
    await db
      .update(scriptsTable)
      .set({ rootNodeId: node.id })
      .where(eq(scriptsTable.id, params.data.scriptId));
  }
  res.status(201).json(node);
});

router.patch(
  "/scripts/:scriptId/nodes/:nodeId",
  async (req, res): Promise<void> => {
    const params = UpdateScriptNodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateScriptNodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.options) {
      updateData["options"] = parsed.data.options.map((o) => ({
        key: o.key,
        label: o.label,
        nextNodeId: o.nextNodeId ?? null,
        disposition: o.disposition ?? null,
      }));
    }
    const [node] = await db
      .update(scriptNodesTable)
      .set(updateData)
      .where(eq(scriptNodesTable.id, params.data.nodeId))
      .returning();
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    res.json(node);
  },
);

router.delete(
  "/scripts/:scriptId/nodes/:nodeId",
  async (req, res): Promise<void> => {
    const params = DeleteScriptNodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await db
      .delete(scriptNodesTable)
      .where(eq(scriptNodesTable.id, params.data.nodeId));
    res.sendStatus(204);
  },
);

export default router;
