import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  db,
  leadsTable,
  scriptsTable,
  scriptNodesTable,
  campaignsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm/sql";

type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else if (c === "\r") {
        // ignore
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  if (rows.length === 0) return [];
  const header = rows[0]!;
  return rows.slice(1).filter((r) => r.length === header.length).map((r) => {
    const obj: CsvRow = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });
}

function num(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function seedLeads() {
  const [{ count = 0 } = {}] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable);
  if (count > 0) {
    console.log(`Leads already loaded (${count}). Skipping CSV import.`);
    return;
  }
  const csvPath = resolve(
    "/home/runner/workspace/attached_assets/nail-salon-leads-all-2026-04-26_1777243819724.csv",
  );
  const text = readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} CSV rows`);

  const seen = new Set<string>();
  const values = rows
    .map((r) => {
      const placeId = r["place_id"] || `${r["name"]}-${r["latitude"]}`;
      if (seen.has(placeId)) return null;
      seen.add(placeId);
      return {
        name: r["name"] || "Unknown",
        phone: r["phone"] || null,
        address: r["address"] || null,
        website: r["website"] || null,
        rating: num(r["rating"]),
        reviewCount: num(r["review_count"]) ?? 0,
        signalTags: r["signal_tags"] || null,
        latitude: num(r["latitude"]),
        longitude: num(r["longitude"]),
        placeId,
        leadScore: Math.round(num(r["lead_score"]) ?? 50),
        tier: r["tier"] || "Warm",
        status: r["status"] || "new",
        notes: r["notes"] || null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Insert in chunks to keep parameter count reasonable.
  const CHUNK = 500;
  for (let i = 0; i < values.length; i += CHUNK) {
    const slice = values.slice(i, i + CHUNK);
    await db.insert(leadsTable).values(slice).onConflictDoNothing();
    console.log(`Inserted ${Math.min(i + CHUNK, values.length)} / ${values.length}`);
  }
}

async function seedScript() {
  const existing = await db.select().from(scriptsTable);
  if (existing.length > 0) {
    console.log("Scripts already exist, skipping seed script.");
    return existing[0]!.id;
  }
  const [script] = await db
    .insert(scriptsTable)
    .values({
      name: "NAIL SALON COLD CALL v1",
      description: "Cold call script for offering an online booking widget to nail salons",
      isActive: true,
    })
    .returning();

  const [intro] = await db
    .insert(scriptNodesTable)
    .values({
      scriptId: script.id,
      title: "INTRO",
      message:
        "Hi, this is {agent} calling from BookFast — am I speaking with the owner or manager of {leadName}?",
      nodeType: "menu",
      options: [
        { key: "1", label: "Yes, this is them", nextNodeId: null, disposition: null },
        { key: "2", label: "No — gatekeeper", nextNodeId: null, disposition: null },
        { key: "3", label: "Wrong number", nextNodeId: null, disposition: "WRONG_NUMBER" },
      ],
    })
    .returning();

  const [pitch] = await db
    .insert(scriptNodesTable)
    .values({
      scriptId: script.id,
      title: "PITCH",
      message:
        "Quick reason for the call — we help local nail salons in {city} fill more chairs by adding a one-click online booking widget to your Google profile. Can I take 30 seconds to walk you through it?",
      nodeType: "menu",
      options: [
        { key: "1", label: "Sure, go ahead", nextNodeId: null, disposition: null },
        { key: "2", label: "Send me an email", nextNodeId: null, disposition: "CALLBACK" },
        { key: "3", label: "Not interested", nextNodeId: null, disposition: "NOT_INTERESTED" },
      ],
    })
    .returning();

  const [demo] = await db
    .insert(scriptNodesTable)
    .values({
      scriptId: script.id,
      title: "DEMO_OFFER",
      message:
        "It takes us about 6 minutes to get you live and we charge nothing until you take your first booking. Want me to text you a link so you can see it on your phone right now?",
      nodeType: "menu",
      options: [
        { key: "1", label: "Yes, text me the link", nextNodeId: null, disposition: "INTERESTED" },
        { key: "2", label: "Schedule a callback", nextNodeId: null, disposition: "CALLBACK" },
        { key: "3", label: "Not now", nextNodeId: null, disposition: "NOT_INTERESTED" },
      ],
    })
    .returning();

  const [gatekeeper] = await db
    .insert(scriptNodesTable)
    .values({
      scriptId: script.id,
      title: "GATEKEEPER",
      message:
        "No problem — when's a good time to catch the owner? We've been helping salons like yours add about 18 bookings a month.",
      nodeType: "menu",
      options: [
        { key: "1", label: "Try later (callback)", nextNodeId: null, disposition: "CALLBACK" },
        { key: "2", label: "Take a message", nextNodeId: null, disposition: "CALLBACK" },
        { key: "3", label: "DNC / hostile", nextNodeId: null, disposition: "DNC" },
      ],
    })
    .returning();

  // Wire up branches
  await db
    .update(scriptNodesTable)
    .set({
      options: [
        { key: "1", label: "Yes, this is them", nextNodeId: pitch.id, disposition: null },
        { key: "2", label: "No — gatekeeper", nextNodeId: gatekeeper.id, disposition: null },
        { key: "3", label: "Wrong number", nextNodeId: null, disposition: "WRONG_NUMBER" },
      ],
    })
    .where(sql`${scriptNodesTable.id} = ${intro.id}`);

  await db
    .update(scriptNodesTable)
    .set({
      options: [
        { key: "1", label: "Sure, go ahead", nextNodeId: demo.id, disposition: null },
        { key: "2", label: "Send me an email", nextNodeId: null, disposition: "CALLBACK" },
        { key: "3", label: "Not interested", nextNodeId: null, disposition: "NOT_INTERESTED" },
      ],
    })
    .where(sql`${scriptNodesTable.id} = ${pitch.id}`);

  await db
    .update(scriptsTable)
    .set({ rootNodeId: intro.id })
    .where(sql`${scriptsTable.id} = ${script.id}`);

  console.log(`Seeded script ${script.id} with intro/pitch/demo/gatekeeper`);
  return script.id;
}

async function seedCampaign(scriptId: number) {
  const existing = await db.select().from(campaignsTable);
  if (existing.length > 0) {
    console.log("Campaign already exists, skipping.");
    return;
  }
  await db.insert(campaignsTable).values({
    name: "NAIL SALON BLITZ — WAVE 01",
    scriptId,
    status: "active",
  });
  console.log("Seeded default campaign");
}

async function main() {
  await seedLeads();
  const scriptId = await seedScript();
  if (scriptId) await seedCampaign(scriptId);
  console.log("DONE");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
