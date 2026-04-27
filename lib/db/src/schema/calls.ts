import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const callsTable = pgTable("calls", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  scriptId: integer("script_id"),
  campaignId: integer("campaign_id"),
  twilioCallSid: text("twilio_call_sid"),
  agentCallSid: text("agent_call_sid"),
  agentIdentity: text("agent_identity"),
  conferenceName: text("conference_name"),
  conferenceSid: text("conference_sid"),
  holdState: boolean("hold_state").notNull().default(false),
  status: text("status").notNull().default("initiated"),
  disposition: text("disposition"),
  notes: text("notes"),
  durationSec: integer("duration_sec"),
  pathTaken: text("path_taken"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Call = typeof callsTable.$inferSelect;
export type NewCall = typeof callsTable.$inferInsert;
