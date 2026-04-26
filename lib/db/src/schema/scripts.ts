import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

export const scriptsTable = pgTable("scripts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  rootNodeId: integer("root_node_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ScriptOptionData = {
  key: string;
  label: string;
  nextNodeId?: number | null;
  disposition?: string | null;
};

export const scriptNodesTable = pgTable("script_nodes", {
  id: serial("id").primaryKey(),
  scriptId: integer("script_id").notNull(),
  title: text("title"),
  message: text("message").notNull(),
  nodeType: text("node_type").notNull().default("menu"),
  options: jsonb("options").$type<ScriptOptionData[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Script = typeof scriptsTable.$inferSelect;
export type NewScript = typeof scriptsTable.$inferInsert;
export type ScriptNode = typeof scriptNodesTable.$inferSelect;
export type NewScriptNode = typeof scriptNodesTable.$inferInsert;
