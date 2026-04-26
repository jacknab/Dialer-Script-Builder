import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  website: text("website"),
  rating: doublePrecision("rating"),
  reviewCount: integer("review_count"),
  signalTags: text("signal_tags"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  placeId: text("place_id").unique(),
  leadScore: integer("lead_score").notNull().default(50),
  tier: text("tier").notNull().default("Warm"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  lastDisposition: text("last_disposition"),
  lastCalledAt: timestamp("last_called_at", { withTimezone: true }),
  callCount: integer("call_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Lead = typeof leadsTable.$inferSelect;
export type NewLead = typeof leadsTable.$inferInsert;
