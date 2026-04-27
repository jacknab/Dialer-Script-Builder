import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const agentsTable = pgTable("agents", {
  identity: text("identity").primaryKey(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("available"),
  currentCallId: text("current_call_id"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Agent = typeof agentsTable.$inferSelect;
export type NewAgent = typeof agentsTable.$inferInsert;
