import {
  boolean,
  check,
  date,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const inviteStageEnum = pgEnum("invite_stage", [
  "not_invited",
  "save_the_date",
  "invited",
  "confirmed",
]);

export const sideEnum = pgEnum("side", ["a", "b", "both"]);

export const ageBracketEnum = pgEnum("age_bracket", ["adult", "child", "infant"]);

export const rsvpStatusEnum = pgEnum("rsvp_status", [
  "pending",
  "attending",
  "declined",
]);

export const taskOwnerEnum = pgEnum("task_owner", ["a", "b", "both"]);

export const constraintKindEnum = pgEnum("constraint_kind", ["together", "apart"]);

/**
 * Single-row table (id is always 1, enforced by check) holding the few
 * global facts the app needs: who the couple are and when the wedding is.
 */
export const settings = pgTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    partnerAName: text("partner_a_name").notNull(),
    partnerBName: text("partner_b_name").notNull(),
    weddingDate: date("wedding_date"),
    monthlyContributionCents: integer("monthly_contribution_cents")
      .notNull()
      .default(0),
    /** Day of the month the monthly saving lands; clamped in short months. */
    contributionDayOfMonth: integer("contribution_day_of_month")
      .notNull()
      .default(1),
  },
  (t) => [
    check("settings_singleton", sql`${t.id} = 1`),
    check(
      "settings_contribution_day_range",
      sql`${t.contributionDayOfMonth} between 1 and 31`,
    ),
  ],
);

export const households = pgTable("households", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  inviteStage: inviteStageEnum("invite_stage").notNull().default("not_invited"),
  notes: text("notes"),
});

export const tables = pgTable(
  "tables",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
  },
  (t) => [check("tables_capacity_positive", sql`${t.capacity} > 0`)],
);

export const guests = pgTable("guests", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  side: sideEnum("side").notNull().default("both"),
  ageBracket: ageBracketEnum("age_bracket").notNull().default("adult"),
  dietaryNotes: text("dietary_notes"),
  rsvpStatus: rsvpStatusEnum("rsvp_status").notNull().default("pending"),
  tableId: integer("table_id").references(() => tables.id, {
    onDelete: "set null",
  }),
  /** Placed by hand; the seating solver will not move them. */
  pinned: boolean("pinned").notNull().default(false),
});

/**
 * Costs are split into a fixed component and a per-head component so a
 * guest-count change recalculates the whole budget correctly.
 * perChildCostCents: null means children are charged at the adult rate;
 * a value (including 0) overrides it. Infants are never charged.
 */
export const budgetItems = pgTable(
  "budget_items",
  {
    id: serial("id").primaryKey(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    fixedCostCents: integer("fixed_cost_cents").notNull().default(0),
    perHeadCostCents: integer("per_head_cost_cents").notNull().default(0),
    perChildCostCents: integer("per_child_cost_cents"),
    priorityA: smallint("priority_a").notNull().default(3),
    priorityB: smallint("priority_b").notNull().default(3),
    notes: text("notes"),
  },
  (t) => [
    check("budget_items_priority_a_range", sql`${t.priorityA} between 1 and 5`),
    check("budget_items_priority_b_range", sql`${t.priorityB} between 1 and 5`),
  ],
);

export const itemOptions = pgTable("item_options", {
  id: serial("id").primaryKey(),
  budgetItemId: integer("budget_item_id")
    .notNull()
    .references(() => budgetItems.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  fixedCostCents: integer("fixed_cost_cents").notNull().default(0),
  perHeadCostCents: integer("per_head_cost_cents").notNull().default(0),
  perChildCostCents: integer("per_child_cost_cents"),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Guest counts are stored per bracket because per-head costs differ:
 * adults pay full rate, children pay perChildCostCents where set,
 * infants are free (and therefore not stored).
 */
export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  adultCount: integer("adult_count").notNull(),
  childCount: integer("child_count").notNull().default(0),
  notes: text("notes"),
});

/**
 * A scenario includes every budget item at its base cost by default.
 * A row here overrides that: either selecting a tier (itemOptionId)
 * or excluding the item entirely (excluded = true).
 */
export const scenarioChoices = pgTable(
  "scenario_choices",
  {
    scenarioId: integer("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    budgetItemId: integer("budget_item_id")
      .notNull()
      .references(() => budgetItems.id, { onDelete: "cascade" }),
    itemOptionId: integer("item_option_id").references(() => itemOptions.id, {
      onDelete: "set null",
    }),
    excluded: boolean("excluded").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.scenarioId, t.budgetItemId] })],
);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  budgetItemId: integer("budget_item_id")
    .notNull()
    .references(() => budgetItems.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  dueDate: date("due_date").notNull(),
  paidDate: date("paid_date"),
  notes: text("notes"),
});

export const contributions = pgTable("contributions", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  amountCents: integer("amount_cents").notNull(),
  source: text("source").notNull(),
  notes: text("notes"),
});

export const seatingConstraints = pgTable(
  "seating_constraints",
  {
    id: serial("id").primaryKey(),
    guestAId: integer("guest_a_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    guestBId: integer("guest_b_id")
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    kind: constraintKindEnum("kind").notNull(),
    weight: smallint("weight").notNull(),
  },
  (t) => [
    check("seating_constraints_weight_range", sql`${t.weight} between 1 and 10`),
    check(
      "seating_constraints_distinct_guests",
      sql`${t.guestAId} <> ${t.guestBId}`,
    ),
  ],
);

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  dueDate: date("due_date"),
  owner: taskOwnerEnum("owner").notNull().default("both"),
  done: boolean("done").notNull().default(false),
  category: text("category"),
  notes: text("notes"),
  /**
   * The due date is a placeholder that depends on something outside this
   * app - local marriage law, most obviously - and needs checking.
   */
  needsConfirmation: boolean("needs_confirmation").notNull().default(false),
});

export const householdsRelations = relations(households, ({ many }) => ({
  guests: many(guests),
}));

export const guestsRelations = relations(guests, ({ one }) => ({
  household: one(households, {
    fields: [guests.householdId],
    references: [households.id],
  }),
  table: one(tables, { fields: [guests.tableId], references: [tables.id] }),
}));

export const tablesRelations = relations(tables, ({ many }) => ({
  guests: many(guests),
}));

export const budgetItemsRelations = relations(budgetItems, ({ many }) => ({
  options: many(itemOptions),
  payments: many(payments),
}));

export const itemOptionsRelations = relations(itemOptions, ({ one }) => ({
  budgetItem: one(budgetItems, {
    fields: [itemOptions.budgetItemId],
    references: [budgetItems.id],
  }),
}));

export const scenariosRelations = relations(scenarios, ({ many }) => ({
  choices: many(scenarioChoices),
}));

export const scenarioChoicesRelations = relations(scenarioChoices, ({ one }) => ({
  scenario: one(scenarios, {
    fields: [scenarioChoices.scenarioId],
    references: [scenarios.id],
  }),
  budgetItem: one(budgetItems, {
    fields: [scenarioChoices.budgetItemId],
    references: [budgetItems.id],
  }),
  option: one(itemOptions, {
    fields: [scenarioChoices.itemOptionId],
    references: [itemOptions.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  budgetItem: one(budgetItems, {
    fields: [payments.budgetItemId],
    references: [budgetItems.id],
  }),
}));
