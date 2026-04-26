import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  scriptId: integer("script_id").notNull(),
  status: text("status").notNull().default("active"),
  leadFilter: text("lead_filter"),
  callsMade: integer("calls_made").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Campaign = typeof campaignsTable.$inferSelect;
export type NewCampaign = typeof campaignsTable.$inferInsert;
