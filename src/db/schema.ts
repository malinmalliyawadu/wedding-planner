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
  time,
  timestamp,
  unique,
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

export const venueStatusEnum = pgEnum("venue_status", [
  "considering",
  "shortlisted",
  "booked",
  "ruled_out",
]);

/**
 * Which of the two of you answered a head-to-head. Side A and B as
 * everywhere else, but with no "both" member: a preference is one
 * person's, and the pair you agree on is two rows rather than one.
 */
export const venueJudgeEnum = pgEnum("venue_judge", ["a", "b"]);

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
    /**
     * What an outside caterer charges a head. Used to price venues that
     * do not cater, so a dry hire and an all-in venue can be compared on
     * the same bill. It is an assumption, labelled as one wherever it is
     * spent; the default is a plausible NZ figure to start from.
     */
    cateringPerHeadCents: integer("catering_per_head_cents")
      .notNull()
      .default(14_500),
    /** Null charges children at the adult rate, as everywhere else. */
    cateringPerChildCents: integer("catering_per_child_cents").default(7_000),
  },
  (t) => [
    check("settings_singleton", sql`${t.id} = 1`),
    check(
      "settings_contribution_day_range",
      sql`${t.contributionDayOfMonth} between 1 and 31`,
    ),
  ],
);

/**
 * A household is also the unit of invitation. `inviteToken` is the whole
 * of the public site's access control: the link is the credential, so it
 * is long, unguessable and unique. Null means no link has been minted
 * yet, which is a real state - it is what "not invited" looks like from
 * the guest's side - so it is deliberately not defaulted.
 */
export const households = pgTable("households", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  inviteStage: inviteStageEnum("invite_stage").notNull().default("not_invited"),
  notes: text("notes"),
  inviteToken: text("invite_token").unique(),
  /** Set the first time the household submits; edits after that keep it. */
  rsvpRespondedAt: timestamp("rsvp_responded_at", { withTimezone: true }),
  /** Free text left for the couple on the RSVP card. */
  rsvpMessage: text("rsvp_message"),
  /** One request per household, handed to the band as a list. */
  songRequest: text("song_request"),
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

/**
 * A venue under consideration, before one of them becomes *the* venue.
 *
 * Costs use the same fixed + per-head split as budget items, so what a
 * venue actually costs at your real guest count falls out of the same
 * arithmetic as the rest of the budget rather than a second, subtly
 * different one. `minimumSpendCents` is the mechanic budget items do not
 * have: a floor on the catering spend that a small wedding pays whether
 * it eats it or not.
 *
 * Everything here is a fact that can be checked - seats, money, whether
 * the date is free. How a place *feels* is deliberately not a column:
 * it belongs in `notes`, not in a number that would let a spreadsheet
 * appear to settle the one decision that is least about arithmetic.
 *
 * Venues are their own record and write nothing into budget items or
 * scenarios. The comparison is useful long before the budget is settled,
 * and a venue you later delete must not tear a hole in a saved scenario.
 */
export const venues = pgTable(
  "venues",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    status: venueStatusEnum("status").notNull().default("considering"),
    /** The town, as you would say it out loud. */
    locality: text("locality"),
    address: text("address"),
    url: text("url"),
    /** Null means not found out yet, which is different from zero. */
    seatedCapacity: integer("seated_capacity"),
    standingCapacity: integer("standing_capacity"),
    /**
     * The hire fee, which a minimum spend does not count towards.
     *
     * Null means nobody has been quoted one yet, and unlike the per-head
     * rate there is nothing sensible to fill the gap with - so a venue
     * with no figure is blocked rather than estimated. Zero is a real
     * quote and stays one: plenty of places roll the room into a
     * per-head package and charge no separate hire at all.
     */
    hireFixedCostCents: integer("hire_fixed_cost_cents"),
    /**
     * Null means no per-head figure from this venue - either they do not
     * cater or nobody has asked yet. The comparison then prices an
     * outside caterer at the assumed rate in `settings`, so a dry hall
     * cannot win on a blank field. Zero would mean they genuinely feed
     * everyone for nothing, which is not a quote anyone receives.
     */
    perHeadCostCents: integer("per_head_cost_cents"),
    /** Null means children are charged at the adult rate, as in budget items. */
    perChildCostCents: integer("per_child_cost_cents"),
    /** Floor on the per-head spend. Null means there is no minimum. */
    minimumSpendCents: integer("minimum_spend_cents"),
    /** Is our date free: null until somebody has actually asked. */
    dateAvailable: boolean("date_available"),
    /** Door-to-door from town, in minutes. */
    travelMinutes: integer("travel_minutes"),
    /** When the music has to stop. A deal-breaker that hides in a PDF. */
    curfew: time("curfew"),
    siteVisitDate: date("site_visit_date"),
    /** What the hire fee covers, in their words. */
    hireIncludes: text("hire_includes"),
    notes: text("notes"),
  },
  (t) => [
    check(
      "venues_seated_capacity_positive",
      sql`${t.seatedCapacity} is null or ${t.seatedCapacity} > 0`,
    ),
    check(
      "venues_standing_capacity_positive",
      sql`${t.standingCapacity} is null or ${t.standingCapacity} > 0`,
    ),
    check(
      "venues_travel_minutes_non_negative",
      sql`${t.travelMinutes} is null or ${t.travelMinutes} >= 0`,
    ),
  ],
);

/**
 * One person's answer to "which of these two would you rather get
 * married at". The whole of the venue ranking is built from this table
 * and nothing else - see `src/lib/venue-ranking.ts`.
 *
 * Three constraints carry the shape:
 *
 * - **The pair is stored one way round**, lower id first. Without that,
 *   the same two venues could be judged twice under two spellings and
 *   the ranking would count one opinion as two.
 * - **One verdict per pair per person**, so re-answering replaces rather
 *   than stacks. A comparison is what you think of that pair, not an
 *   event that happened - clicking the same way twice must not weigh
 *   double.
 * - **The winner has to be one of the two**, or null for "cannot split
 *   them", which is a real answer and not a missing one.
 */
export const venueComparisons = pgTable(
  "venue_comparisons",
  {
    id: serial("id").primaryKey(),
    venueAId: integer("venue_a_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    venueBId: integer("venue_b_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    /** Null means the two could not be split, which is a verdict. */
    winnerId: integer("winner_id").references(() => venues.id, {
      onDelete: "cascade",
    }),
    judge: venueJudgeEnum("judge").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("venue_comparisons_pair_judge").on(t.venueAId, t.venueBId, t.judge),
    check("venue_comparisons_ordered_pair", sql`${t.venueAId} < ${t.venueBId}`),
    check(
      "venue_comparisons_winner_in_pair",
      sql`${t.winnerId} is null or ${t.winnerId} in (${t.venueAId}, ${t.venueBId})`,
    ),
  ],
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

/**
 * The day itself. One canonical run sheet; each recipient gets the
 * moments that concern them, never a separate rewritten timeline.
 */
export const runSheetItems = pgTable("run_sheet_items", {
  id: serial("id").primaryKey(),
  startTime: time("start_time").notNull(),
  /** Null for a moment rather than a stretch. */
  endTime: time("end_time"),
  title: text("title").notNull(),
  detail: text("detail"),
  location: text("location"),
  /** Who is running this moment, in plain words. */
  lead: text("lead"),
  /**
   * Shown on the public invitation's schedule. Guests are just another
   * audience for the one canonical timeline - there is no second, guest
   * copy of the day that could drift out of step with this one. Off by
   * default: load-ins and supplier calls are nobody else's business.
   */
  guestVisible: boolean("guest_visible").notNull().default(false),
  /**
   * What guests are told about this moment. Separate from `detail`
   * because that is written for suppliers - "signing needs two
   * witnesses", "power is on the north wall" - and publishing it would
   * be publishing the couple's operational notes.
   *
   * The time, the title and the place stay canonical and shared: those
   * are the facts that must never disagree between the two audiences.
   * Only the wording around them differs.
   */
  guestNote: text("guest_note"),
});

export const runSheetRecipients = pgTable("run_sheet_recipients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** e.g. "Photographer", "Celebrant" - what they are to the day. */
  role: text("role").notNull(),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const runSheetItemRecipients = pgTable(
  "run_sheet_item_recipients",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => runSheetItems.id, { onDelete: "cascade" }),
    recipientId: integer("recipient_id")
      .notNull()
      .references(() => runSheetRecipients.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.recipientId] })],
);

/**
 * Everything the invitation says, in one singleton row (id always 1) to
 * match the settings table.
 *
 * `published` is the master switch and defaults to off: until it is
 * turned on, every invite link 404s. A wedding site that is live before
 * anyone means it to be is the failure mode worth engineering against,
 * so the safe state is the default rather than something to remember.
 */
export const publicSite = pgTable(
  "public_site",
  {
    id: integer("id").primaryKey().default(1),
    published: boolean("published").notNull().default(false),
    /** Standfirst on the opened card, in the couple's own words. */
    welcomeMessage: text("welcome_message"),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    /** Straight to the map app rather than making guests retype an address. */
    venueMapUrl: text("venue_map_url"),
    arrivalTime: time("arrival_time"),
    ceremonyTime: time("ceremony_time"),
    dressCode: text("dress_code"),
    giftNote: text("gift_note"),
    travelNotes: text("travel_notes"),
    accommodationNotes: text("accommodation_notes"),
    rsvpDeadline: date("rsvp_deadline"),
    photosEnabled: boolean("photos_enabled").notNull().default(true),
    /** Held back until the seating plan is final, then flipped on. */
    tableRevealEnabled: boolean("table_reveal_enabled").notNull().default(false),
  },
  (t) => [check("public_site_singleton", sql`${t.id} = 1`)],
);

/** Answers to the questions that otherwise arrive as texts at 11pm. */
export const faqItems = pgTable("faq_items", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(true),
});

/**
 * Guest photographs. The file itself lives in object storage; this row
 * is the index, so the database stays the thing you query and the bucket
 * stays the thing you stream from.
 *
 * householdId is nullable and set null on delete: removing a household
 * from the guest list must not delete photographs of the day.
 */
export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  householdId: integer("household_id").references(() => households.id, {
    onDelete: "set null",
  }),
  /** Whoever typed their name on the upload screen; not a guest record. */
  uploaderName: text("uploader_name"),
  /** Key within the bucket. Opaque, random, never guessable from the id. */
  storageKey: text("storage_key").notNull().unique(),
  /**
   * A small copy, made on the guest's phone at the same time as the
   * full one.
   *
   * The album could have leaned on next/image instead, but that would
   * mean exposing `/_next/image` to unauthenticated guests - and the
   * optimiser fetches any same-origin path it is given, which turns it
   * into a way around basicauth for every private route that returns an
   * image. Shipping our own thumbnail keeps the public surface to `/i`.
   */
  thumbStorageKey: text("thumb_storage_key").unique(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  caption: text("caption"),
  /** Hidden by the couple. The row and the object both stay. */
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const householdsRelations = relations(households, ({ many }) => ({
  guests: many(guests),
  photos: many(photos),
}));

export const photosRelations = relations(photos, ({ one }) => ({
  household: one(households, {
    fields: [photos.householdId],
    references: [households.id],
  }),
}));

export const runSheetItemsRelations = relations(runSheetItems, ({ many }) => ({
  recipients: many(runSheetItemRecipients),
}));

export const runSheetRecipientsRelations = relations(
  runSheetRecipients,
  ({ many }) => ({
    items: many(runSheetItemRecipients),
  }),
);

export const runSheetItemRecipientsRelations = relations(
  runSheetItemRecipients,
  ({ one }) => ({
    item: one(runSheetItems, {
      fields: [runSheetItemRecipients.itemId],
      references: [runSheetItems.id],
    }),
    recipient: one(runSheetRecipients, {
      fields: [runSheetItemRecipients.recipientId],
      references: [runSheetRecipients.id],
    }),
  }),
);

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
