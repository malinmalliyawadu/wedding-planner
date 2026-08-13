/**
 * Seeds a realistic fake wedding so development never starts from an
 * empty screen. Idempotent: wipes and refills every table on each run.
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  budgetItems,
  contributions,
  faqItems,
  guests,
  households,
  itemOptions,
  payments,
  publicSite,
  runSheetItemRecipients,
  runSheetItems,
  runSheetRecipients,
  scenarioChoices,
  scenarios,
  seatingConstraints,
  settings,
  tables,
  tasks,
  venues,
} from "../src/db/schema";
import { inviteUrl, newInviteToken } from "../src/lib/invite-token";

type SeedGuest = {
  first: string;
  last: string;
  side?: "a" | "b" | "both";
  age?: "adult" | "child" | "infant";
  diet?: string;
  rsvp?: "pending" | "attending" | "declined";
};

type SeedHousehold = {
  name: string;
  address?: string;
  stage: "not_invited" | "save_the_date" | "invited" | "confirmed";
  notes?: string;
  members: SeedGuest[];
};

// Side a = Ru, side b = Malin.
const HOUSEHOLDS: SeedHousehold[] = [
  { name: "Ngata Whānau", address: "14 Kōwhai St, Rotorua", stage: "confirmed", members: [
    { first: "Hine", last: "Ngata", side: "a", rsvp: "attending" },
    { first: "Wiremu", last: "Ngata", side: "a", rsvp: "attending" },
    { first: "Anahera", last: "Ngata", side: "a", age: "child", rsvp: "attending" },
    { first: "Nikau", last: "Ngata", side: "a", age: "infant", rsvp: "attending" },
  ]},
  { name: "Margaret & John Calder", address: "8 Rimu Rd, Cambridge", stage: "confirmed", notes: "Malin's grandparents - need seats near the front", members: [
    { first: "Margaret", last: "Calder", side: "b", rsvp: "attending", diet: "No shellfish" },
    { first: "John", last: "Calder", side: "b", rsvp: "attending" },
  ]},
  { name: "The Tuilagi Family", address: "22 Beach Haven Rd, Auckland", stage: "confirmed", members: [
    { first: "Sina", last: "Tuilagi", side: "a", rsvp: "attending" },
    { first: "Malo", last: "Tuilagi", side: "a", rsvp: "attending" },
    { first: "Losa", last: "Tuilagi", side: "a", age: "child", rsvp: "attending", diet: "Dairy free" },
  ]},
  { name: "Priya & Dev Sharma", address: "3/41 Riccarton Rd, Christchurch", stage: "confirmed", members: [
    { first: "Priya", last: "Sharma", side: "b", rsvp: "attending", diet: "Vegetarian" },
    { first: "Dev", last: "Sharma", side: "b", rsvp: "attending", diet: "Vegetarian" },
  ]},
  { name: "Sophie Laurent", address: "Flat 2, 88 Aro St, Wellington", stage: "confirmed", notes: "Bridesmaid", members: [
    { first: "Sophie", last: "Laurent", side: "a", rsvp: "attending", diet: "Gluten free" },
  ]},
  { name: "Tom & Jess Whitford", address: "102 Ilam Rd, Christchurch", stage: "confirmed", notes: "Best man + partner", members: [
    { first: "Tom", last: "Whitford", side: "b", rsvp: "attending" },
    { first: "Jess", last: "Whitford", side: "b", rsvp: "attending" },
    { first: "Ollie", last: "Whitford", side: "b", age: "child" },
  ]},
  { name: "Kahu & Mere Walker", address: "56 Tarawera Rd, Rotorua", stage: "invited", members: [
    { first: "Kahu", last: "Walker", side: "a", rsvp: "attending" },
    { first: "Mere", last: "Walker", side: "a", rsvp: "pending" },
  ]},
  { name: "The Hendersons", address: "19 Marine Parade, Napier", stage: "invited", members: [
    { first: "Bruce", last: "Henderson", side: "b", rsvp: "pending" },
    { first: "Carol", last: "Henderson", side: "b", rsvp: "pending", diet: "Coeliac" },
    { first: "Emma", last: "Henderson", side: "b", rsvp: "pending" },
  ]},
  { name: "Aiden O'Connell", stage: "invited", notes: "Groomsman", members: [
    { first: "Aiden", last: "O'Connell", side: "b", rsvp: "attending" },
  ]},
  { name: "Ruby & Charlie Fletcher", address: "7 Seddon St, Raglan", stage: "invited", members: [
    { first: "Ruby", last: "Fletcher", side: "a", rsvp: "attending", diet: "Vegan" },
    { first: "Charlie", last: "Fletcher", side: "a", rsvp: "pending" },
  ]},
  { name: "The Patels", address: "31 Great South Rd, Hamilton", stage: "invited", members: [
    { first: "Anish", last: "Patel", side: "b", rsvp: "attending" },
    { first: "Meera", last: "Patel", side: "b", rsvp: "attending", diet: "Vegetarian" },
    { first: "Riya", last: "Patel", side: "b", age: "child", rsvp: "attending", diet: "Vegetarian" },
    { first: "Arjun", last: "Patel", side: "b", age: "infant" },
  ]},
  { name: "Lucy Chen", address: "12B Ponsonby Tce, Auckland", stage: "invited", notes: "Bridesmaid", members: [
    { first: "Lucy", last: "Chen", side: "a", rsvp: "attending" },
  ]},
  { name: "Hemi & Kiri Rangi", address: "3 Pōhutukawa Ave, Tauranga", stage: "invited", members: [
    { first: "Hemi", last: "Rangi", side: "a", rsvp: "pending" },
    { first: "Kiri", last: "Rangi", side: "a", rsvp: "pending" },
    { first: "Tui", last: "Rangi", side: "a", age: "child", rsvp: "pending" },
  ]},
  { name: "The Morrisons", address: "45 Highgate, Dunedin", stage: "invited", members: [
    { first: "Grant", last: "Morrison", side: "b", rsvp: "declined", diet: undefined },
    { first: "Fiona", last: "Morrison", side: "b", rsvp: "declined" },
  ]},
  { name: "Nadia Kovač", stage: "invited", members: [
    { first: "Nadia", last: "Kovač", side: "a", rsvp: "attending", diet: "Pescatarian" },
  ]},
  { name: "Sam & Alex Berridge", address: "9 Norfolk St, Ponsonby", stage: "invited", members: [
    { first: "Sam", last: "Berridge", side: "both", rsvp: "attending" },
    { first: "Alex", last: "Berridge", side: "both", rsvp: "pending" },
  ]},
  { name: "The Faleolo Family", address: "27 Māngere Rd, Auckland", stage: "invited", members: [
    { first: "Ioane", last: "Faleolo", side: "a", rsvp: "pending" },
    { first: "Teuila", last: "Faleolo", side: "a", rsvp: "pending" },
    { first: "Manaia", last: "Faleolo", side: "a", age: "child", rsvp: "pending" },
  ]},
  { name: "George Papadopoulos", stage: "invited", notes: "Malin's uni flatmate", members: [
    { first: "George", last: "Papadopoulos", side: "b", rsvp: "attending" },
  ]},
  { name: "Holly & Mark Stein", address: "2/18 Kelburn Parade, Wellington", stage: "invited", members: [
    { first: "Holly", last: "Stein", side: "a", rsvp: "attending" },
    { first: "Mark", last: "Stein", side: "a", rsvp: "attending", diet: "Kosher-style, no pork" },
  ]},
  { name: "The Kereopa Whānau", address: "11 Ngāpuhi Rd, Kaikohe", stage: "invited", members: [
    { first: "Rangi", last: "Kereopa", side: "a", rsvp: "pending" },
    { first: "Awhina", last: "Kereopa", side: "a", rsvp: "pending" },
    { first: "Moana", last: "Kereopa", side: "a", age: "child", rsvp: "pending" },
    { first: "Tāne", last: "Kereopa", side: "a", age: "child", rsvp: "pending" },
  ]},
  { name: "Dan & Steph Kowalski", address: "76 Papanui Rd, Christchurch", stage: "invited", members: [
    { first: "Dan", last: "Kowalski", side: "b", rsvp: "attending" },
    { first: "Steph", last: "Kowalski", side: "b", rsvp: "attending", diet: "Nut allergy (severe)" },
  ]},
  { name: "Isla McGregor", stage: "invited", members: [
    { first: "Isla", last: "McGregor", side: "a", rsvp: "pending" },
  ]},
  { name: "The Novaks", address: "5 Frankton Rd, Queenstown", stage: "save_the_date", members: [
    { first: "Peter", last: "Novak", side: "b" },
    { first: "Jana", last: "Novak", side: "b" },
  ]},
  { name: "Te Puni Whānau", address: "40 Ōtaki Beach Rd, Ōtaki", stage: "save_the_date", members: [
    { first: "Hōne", last: "Te Puni", side: "a" },
    { first: "Waimarie", last: "Te Puni", side: "a" },
  ]},
  { name: "Chloe & Ryan Dawson", address: "88 Mount Eden Rd, Auckland", stage: "save_the_date", members: [
    { first: "Chloe", last: "Dawson", side: "b" },
    { first: "Ryan", last: "Dawson", side: "b" },
    { first: "Maddie", last: "Dawson", side: "b", age: "infant" },
  ]},
  { name: "The Singhs", address: "14 King St, Pukekohe", stage: "save_the_date", members: [
    { first: "Harpreet", last: "Singh", side: "b" },
    { first: "Simran", last: "Singh", side: "b", diet: "Vegetarian" },
  ]},
  { name: "Bella Firth", stage: "save_the_date", notes: "Work friend of Ru", members: [
    { first: "Bella", last: "Firth", side: "a" },
  ]},
  { name: "Nikolai & Emily Petrov", address: "23 The Terrace, Wellington", stage: "save_the_date", members: [
    { first: "Nikolai", last: "Petrov", side: "b" },
    { first: "Emily", last: "Petrov", side: "b" },
  ]},
  { name: "The Andersons", address: "67 Bealey Ave, Christchurch", stage: "not_invited", notes: "B-list - depends on venue capacity", members: [
    { first: "Paul", last: "Anderson", side: "b" },
    { first: "Denise", last: "Anderson", side: "b" },
  ]},
  { name: "Kauri & Ataahua Broughton", stage: "not_invited", members: [
    { first: "Kauri", last: "Broughton", side: "a" },
    { first: "Ataahua", last: "Broughton", side: "a" },
  ]},
  { name: "Freya Lindqvist", stage: "not_invited", notes: "Overseas - unlikely to travel", members: [
    { first: "Freya", last: "Lindqvist", side: "a" },
  ]},
  { name: "The Osbornes", address: "31 Victoria Ave, Whanganui", stage: "not_invited", members: [
    { first: "Rob", last: "Osborne", side: "b" },
    { first: "Karen", last: "Osborne", side: "b" },
    { first: "Jack", last: "Osborne", side: "b", age: "child" },
  ]},
  { name: "Mia & Kate Thornton-Reid", address: "4 Surrey Cres, Grey Lynn", stage: "confirmed", members: [
    { first: "Mia", last: "Thornton-Reid", side: "a", rsvp: "attending" },
    { first: "Kate", last: "Thornton-Reid", side: "a", rsvp: "attending", diet: "Vegan" },
  ]},
  { name: "Uncle Barry", stage: "invited", notes: "Keep away from the Morrisons", members: [
    { first: "Barry", last: "Calder", side: "b", rsvp: "attending" },
  ]},
];

const TABLE_NAMES: Array<[string, number]> = [
  ["Pōhutukawa", 10],
  ["Kōwhai", 10],
  ["Rimu", 8],
  ["Kauri", 8],
  ["Nīkau", 8],
  ["Mānuka", 8],
  ["Harakeke", 10],
  ["Rātā", 8],
];

const VENUES: Array<typeof venues.$inferInsert> = [
  {
    name: "Kōwhai Barn",
    status: "shortlisted",
    locality: "Matakana",
    address: "412 Whitmore Road, Matakana",
    url: "https://example.com/kowhai-barn",
    seatedCapacity: 120,
    standingCapacity: 160,
    hireFixedCostCents: 450_000,
    perHeadCostCents: 14_500,
    perChildCostCents: 7_000,
    dateAvailable: true,
    travelMinutes: 65,
    curfew: "23:30",
    siteVisitDate: "2026-07-18",
    hireIncludes: "Tables, chairs, the wet-weather room, pack-down",
    notes:
      "The light in the barn at five o'clock. Ru cried in the car park. Gravel underfoot everywhere, so warn people about heels.",
  },
  {
    name: "The Harbour Rooms",
    status: "considering",
    locality: "Devonport",
    url: "https://example.com/harbour-rooms",
    seatedCapacity: 140,
    standingCapacity: 220,
    hireFixedCostCents: 200_000,
    perHeadCostCents: 16_500,
    perChildCostCents: 8_000,
    // The trap: cheap to hire, and then $22,000 of food whether or not
    // ninety people eat it.
    minimumSpendCents: 2_200_000,
    dateAvailable: true,
    travelMinutes: 20,
    curfew: "00:00",
    siteVisitDate: "2026-08-02",
    hireIncludes: "Room only - everything else is on their catering list",
    notes:
      "Beautiful, and twenty minutes from home. Their minimum spend is the whole question.",
  },
  {
    name: "Waipuna Homestead",
    status: "considering",
    locality: "Clevedon",
    seatedCapacity: 80,
    standingCapacity: 110,
    hireFixedCostCents: 320_000,
    perHeadCostCents: 13_000,
    perChildCostCents: 6_500,
    dateAvailable: true,
    travelMinutes: 45,
    curfew: "22:00",
    hireIncludes: "Tables and chairs, marquee extra",
    notes:
      "Lovely, and too small unless the list comes down. Keep it - it comes back into range at ninety.",
  },
  {
    name: "Tāwharanui Lodge",
    status: "ruled_out",
    locality: "Tāwharanui",
    seatedCapacity: 100,
    hireFixedCostCents: 900_000,
    perHeadCostCents: 19_000,
    perChildCostCents: 9_500,
    dateAvailable: false,
    travelMinutes: 80,
    notes: "Taken. Somebody else's wedding, the same Saturday.",
  },
  {
    name: "St Aidan's Hall",
    status: "considering",
    locality: "Ponsonby",
    seatedCapacity: null,
    hireFixedCostCents: 120_000,
    perHeadCostCents: 0,
    dateAvailable: null,
    travelMinutes: 10,
    hireIncludes: "Hall only - bring your own everything",
    notes: "Nobody has rung them yet. Ask about the capacity and the kitchen.",
  },
];

async function main() {
  await db.execute(sql`
    truncate table
      run_sheet_item_recipients, run_sheet_items, run_sheet_recipients,
      seating_constraints, scenario_choices, scenarios, payments,
      contributions, item_options, budget_items, photos, guests, households,
      tables, tasks, settings, public_site, faq_items, venues
    restart identity cascade
  `);

  await db.insert(settings).values({
    id: 1,
    partnerAName: "Ru",
    partnerBName: "Malin",
    weddingDate: "2027-03-20",
    monthlyContributionCents: 250_000,
    contributionDayOfMonth: 1,
  });

  const insertedTables = await db
    .insert(tables)
    .values(TABLE_NAMES.map(([name, capacity]) => ({ name, capacity })))
    .returning();

  // A venue shortlist with one of each thing that goes wrong: a minimum
  // spend a wedding this size does not clear, a room that seats fewer
  // than have been invited, a date already gone, and one nobody has
  // rung up yet.
  await db.insert(venues).values(VENUES);

  for (const hh of HOUSEHOLDS) {
    const [household] = await db
      .insert(households)
      .values({
        name: hh.name,
        address: hh.address ?? null,
        inviteStage: hh.stage,
        notes: hh.notes ?? null,
        // Everyone past "not invited" has had a link minted, which is
        // what the invitations page would have done for real.
        inviteToken: hh.stage === "not_invited" ? null : newInviteToken(),
      })
      .returning();

    await db.insert(guests).values(
      hh.members.map((m) => ({
        householdId: household.id,
        firstName: m.first,
        lastName: m.last,
        side: m.side ?? "both",
        ageBracket: m.age ?? "adult",
        dietaryNotes: m.diet ?? null,
        rsvpStatus: m.rsvp ?? "pending",
      })),
    );
  }

  // Seat a handful of confirmed guests so the tables page shows occupancy.
  // Infants sit on laps, so the seating solver never places them and they
  // should not arrive already holding a chair.
  const allGuests = await db.select().from(guests);
  const attending = allGuests.filter(
    (g) => g.rsvpStatus === "attending" && g.ageBracket !== "infant",
  );
  for (let i = 0; i < Math.min(attending.length, 24); i++) {
    const table = insertedTables[i % 3];
    await db
      .update(guests)
      .set({ tableId: table.id })
      .where(sql`${guests.id} = ${attending[i].id}`);
  }

  // Budget. Costs are realistic 2026-ish NZD for a ~90-guest wedding.
  const items = await db
    .insert(budgetItems)
    .values([
      { category: "Venue", name: "Venue hire", fixedCostCents: 800_000, perHeadCostCents: 0, priorityA: 5, priorityB: 5, notes: "Includes tables, chairs, pack-down" },
      { category: "Food & drink", name: "Catering", fixedCostCents: 0, perHeadCostCents: 16_500, perChildCostCents: 8_000, priorityA: 5, priorityB: 5 },
      { category: "Food & drink", name: "Drinks package", fixedCostCents: 0, perHeadCostCents: 9_000, perChildCostCents: 1_500, priorityA: 4, priorityB: 5 },
      { category: "Food & drink", name: "Cake", fixedCostCents: 90_000, perHeadCostCents: 0, priorityA: 3, priorityB: 2 },
      { category: "Ceremony", name: "Celebrant", fixedCostCents: 120_000, perHeadCostCents: 0, priorityA: 5, priorityB: 5 },
      { category: "Ceremony", name: "Marriage licence", fixedCostCents: 15_000, perHeadCostCents: 0, priorityA: 5, priorityB: 5, notes: "Legal requirement - confirm current fee" },
      { category: "Photography", name: "Photographer", fixedCostCents: 550_000, perHeadCostCents: 0, priorityA: 5, priorityB: 3 },
      { category: "Photography", name: "Videographer", fixedCostCents: 420_000, perHeadCostCents: 0, priorityA: 4, priorityB: 1, notes: "Ru wants this, Malin thinks photos are enough" },
      { category: "Photography", name: "Photo booth", fixedCostCents: 120_000, perHeadCostCents: 0, priorityA: 1, priorityB: 4 },
      { category: "Attire", name: "Dress & alterations", fixedCostCents: 350_000, perHeadCostCents: 0, priorityA: 5, priorityB: 2 },
      { category: "Attire", name: "Suit", fixedCostCents: 180_000, perHeadCostCents: 0, priorityA: 2, priorityB: 4 },
      { category: "Attire", name: "Rings", fixedCostCents: 250_000, perHeadCostCents: 0, priorityA: 4, priorityB: 4 },
      { category: "Attire", name: "Hair & makeup", fixedCostCents: 95_000, perHeadCostCents: 0, priorityA: 4, priorityB: 1 },
      { category: "Styling", name: "Flowers", fixedCostCents: 120_000, perHeadCostCents: 1_500, priorityA: 4, priorityB: 2, notes: "Bouquets fixed; centrepieces scale with tables" },
      { category: "Styling", name: "Stationery & signage", fixedCostCents: 20_000, perHeadCostCents: 1_200, priorityA: 3, priorityB: 1 },
      { category: "Styling", name: "Favours", fixedCostCents: 0, perHeadCostCents: 800, priorityA: 2, priorityB: 1 },
      { category: "Styling", name: "Marquee & furniture hire", fixedCostCents: 150_000, perHeadCostCents: 2_500, priorityA: 3, priorityB: 3, notes: "Only if we go with the paddock venue" },
      { category: "Entertainment", name: "Music", fixedCostCents: 280_000, perHeadCostCents: 0, priorityA: 3, priorityB: 5 },
      { category: "Logistics", name: "Guest transport", fixedCostCents: 60_000, perHeadCostCents: 0, priorityA: 2, priorityB: 3 },
      { category: "Logistics", name: "Wet weather contingency", fixedCostCents: 100_000, perHeadCostCents: 0, priorityA: 3, priorityB: 4 },
    ])
    .returning();

  const byName = new Map(items.map((i) => [i.name, i]));
  const opt = (
    name: string,
    label: string,
    fixed: number,
    perHead = 0,
    perChild: number | null = null,
    sortOrder = 0,
  ) => ({
    budgetItemId: byName.get(name)!.id,
    label,
    fixedCostCents: fixed,
    perHeadCostCents: perHead,
    perChildCostCents: perChild,
    sortOrder,
  });

  await db.insert(itemOptions).values([
    opt("Venue hire", "Saturday, peak season", 800_000, 0, null, 0),
    opt("Venue hire", "Friday", 650_000, 0, null, 1),
    opt("Venue hire", "Off-peak (May-Sep)", 500_000, 0, null, 2),
    opt("Catering", "Plated three-course", 0, 18_500, 8_000, 0),
    opt("Catering", "Family-style shared", 0, 16_500, 8_000, 1),
    opt("Catering", "Buffet", 0, 14_000, 7_000, 2),
    opt("Catering", "Food trucks", 0, 9_500, 6_000, 3),
    opt("Drinks package", "Open bar", 0, 11_000, 1_500, 0),
    opt("Drinks package", "Beer, wine & bubbles", 0, 9_000, 1_500, 1),
    opt("Drinks package", "Subsidised bar tab", 0, 4_500, 1_500, 2),
    opt("Photographer", "Half day (6 hrs)", 380_000, 0, null, 0),
    opt("Photographer", "Full day", 550_000, 0, null, 1),
    opt("Photographer", "Full day + second shooter", 720_000, 0, null, 2),
    opt("Music", "Playlist + hired PA", 80_000, 0, null, 0),
    opt("Music", "DJ", 280_000, 0, null, 1),
    opt("Music", "Live band", 550_000, 0, null, 2),
    opt("Cake", "Two-tier buttercream", 90_000, 0, null, 0),
    opt("Cake", "Three-tier + dessert table", 160_000, 0, null, 1),
  ]);

  // Two starter scenarios so the M2 comparison view has data on day one.
  const [dream] = await db
    .insert(scenarios)
    .values({
      name: "The dream",
      adultCount: 85,
      childCount: 9,
      notes: "Everyone we'd love to have, full-day photography, live band",
    })
    .returning();
  const [middle] = await db
    .insert(scenarios)
    .values({
      name: "Middle ground",
      adultCount: 70,
      childCount: 5,
      notes: "Trim to 70, keep the band, drop the photo booth",
    })
    .returning();
  const [tighter] = await db
    .insert(scenarios)
    .values({
      name: "Keep it under 60k",
      adultCount: 62,
      childCount: 6,
      notes: "Trim the B-list, DJ instead of band, no videographer",
    })
    .returning();

  const choose = (
    scenarioId: number,
    itemName: string,
    excluded = false,
  ) => ({
    scenarioId,
    budgetItemId: byName.get(itemName)!.id,
    itemOptionId: null as number | null,
    excluded,
  });

  const allOptions = await db.select().from(itemOptions);
  const optionId = (itemName: string, label: string) =>
    allOptions.find(
      (o) => o.budgetItemId === byName.get(itemName)!.id && o.label === label,
    )!.id;

  await db.insert(scenarioChoices).values([
    { ...choose(dream.id, "Photographer"), itemOptionId: optionId("Photographer", "Full day + second shooter") },
    { ...choose(dream.id, "Music"), itemOptionId: optionId("Music", "Live band") },
    { ...choose(dream.id, "Catering"), itemOptionId: optionId("Catering", "Plated three-course") },
    { ...choose(dream.id, "Drinks package"), itemOptionId: optionId("Drinks package", "Open bar") },
    { ...choose(middle.id, "Music"), itemOptionId: optionId("Music", "Live band") },
    { ...choose(middle.id, "Catering"), itemOptionId: optionId("Catering", "Family-style shared") },
    choose(middle.id, "Photo booth", true),
    { ...choose(tighter.id, "Photographer"), itemOptionId: optionId("Photographer", "Half day (6 hrs)") },
    { ...choose(tighter.id, "Music"), itemOptionId: optionId("Music", "DJ") },
    { ...choose(tighter.id, "Catering"), itemOptionId: optionId("Catering", "Buffet") },
    choose(tighter.id, "Videographer", true),
    choose(tighter.id, "Photo booth", true),
    choose(tighter.id, "Marquee & furniture hire", true),
  ]);

  // Payment schedule: deposits mostly paid, balances due through early 2027.
  const pay = (
    itemName: string,
    amount: number,
    due: string,
    paid: string | null = null,
    notes: string | null = null,
  ) => ({
    budgetItemId: byName.get(itemName)!.id,
    amountCents: amount,
    dueDate: due,
    paidDate: paid,
    notes,
  });

  await db.insert(payments).values([
    pay("Venue hire", 200_000, "2026-05-01", "2026-04-28", "Deposit"),
    pay("Venue hire", 600_000, "2027-02-20", null, "Balance"),
    pay("Catering", 150_000, "2026-09-15", "2026-09-10", "Deposit"),
    pay("Catering", 1_200_000, "2027-03-06", null, "Balance - final numbers due 1 Mar"),
    pay("Drinks package", 700_000, "2027-03-06", null),
    pay("Celebrant", 30_000, "2026-08-01", "2026-07-30", "Booking fee"),
    pay("Celebrant", 90_000, "2027-03-13", null),
    pay("Photographer", 150_000, "2026-07-10", "2026-07-08", "Deposit"),
    pay("Photographer", 400_000, "2027-03-01", null, "Balance"),
    pay("Videographer", 100_000, "2026-11-01", null, "Deposit - book by Nov"),
    pay("Videographer", 320_000, "2027-03-01", null),
    pay("Dress & alterations", 175_000, "2026-10-15", "2026-10-12", "Half on order"),
    pay("Dress & alterations", 175_000, "2027-01-30", null, "Balance + alterations"),
    pay("Suit", 180_000, "2027-01-15", null),
    pay("Rings", 250_000, "2026-12-10", null),
    pay("Hair & makeup", 20_000, "2026-11-20", null, "Trial"),
    pay("Hair & makeup", 75_000, "2027-03-19", null),
    pay("Flowers", 50_000, "2026-12-01", null, "Deposit"),
    pay("Flowers", 205_000, "2027-03-17", null, "Balance"),
    pay("Stationery & signage", 60_000, "2026-10-01", "2026-09-29", "Save-the-dates + invites print run"),
    pay("Music", 80_000, "2026-09-01", "2026-08-30", "DJ deposit"),
    pay("Music", 200_000, "2027-03-13", null),
    pay("Marriage licence", 15_000, "2027-02-25", null, "Apply no earlier than 3 months out"),
    pay("Cake", 30_000, "2026-12-15", null, "Deposit"),
    pay("Cake", 60_000, "2027-03-10", null),
  ]);

  // Contributions to date: joint savings since engagement.
  await db.insert(contributions).values([
    { date: "2026-01-15", amountCents: 500_000, source: "Joint savings kickoff", notes: "Engagement present from Ru's parents included" },
    { date: "2026-02-01", amountCents: 250_000, source: "Monthly savings" },
    { date: "2026-03-01", amountCents: 250_000, source: "Monthly savings" },
    { date: "2026-04-01", amountCents: 250_000, source: "Monthly savings" },
    { date: "2026-05-01", amountCents: 250_000, source: "Monthly savings" },
    { date: "2026-06-01", amountCents: 250_000, source: "Monthly savings" },
    { date: "2026-06-20", amountCents: 300_000, source: "Malin's tax refund" },
    { date: "2026-07-01", amountCents: 250_000, source: "Monthly savings" },
    { date: "2026-08-01", amountCents: 250_000, source: "Monthly savings" },
  ]);

  const guestId = (first: string, last: string) =>
    allGuests.find((g) => g.firstName === first && g.lastName === last)!.id;

  await db.insert(seatingConstraints).values([
    { guestAId: guestId("Margaret", "Calder"), guestBId: guestId("John", "Calder"), kind: "together", weight: 10 },
    { guestAId: guestId("Barry", "Calder"), guestBId: guestId("Grant", "Morrison"), kind: "apart", weight: 10 },
    { guestAId: guestId("Barry", "Calder"), guestBId: guestId("Fiona", "Morrison"), kind: "apart", weight: 10 },
    { guestAId: guestId("Sophie", "Laurent"), guestBId: guestId("Lucy", "Chen"), kind: "together", weight: 7 },
    { guestAId: guestId("Tom", "Whitford"), guestBId: guestId("Aiden", "O'Connell"), kind: "together", weight: 6 },
    { guestAId: guestId("Hine", "Ngata"), guestBId: guestId("Rangi", "Kereopa"), kind: "together", weight: 5 },
    { guestAId: guestId("Priya", "Sharma"), guestBId: guestId("Meera", "Patel"), kind: "together", weight: 4 },
    { guestAId: guestId("Ruby", "Fletcher"), guestBId: guestId("Kate", "Thornton-Reid"), kind: "together", weight: 3 },
    { guestAId: guestId("Bruce", "Henderson"), guestBId: guestId("Dan", "Kowalski"), kind: "apart", weight: 4, },
  ]);

  // A partly-worked plan. Titles that exist in the timeline template match
  // it exactly, so regenerating fills the gaps instead of duplicating;
  // the rest are the couple's own additions, which it leaves alone.
  await db.insert(tasks).values([
    { title: "Book the venue", dueDate: "2026-05-01", owner: "both", done: true, category: "Venue" },
    { title: "Book the celebrant", dueDate: "2026-08-01", owner: "a", done: true, category: "Ceremony" },
    { title: "Send save-the-dates", dueDate: "2026-10-10", owner: "both", done: true, category: "Guests" },
    { title: "Buy the rings", dueDate: "2026-12-10", owner: "b", done: false, category: "Attire" },
    { title: "Hair and makeup trial", dueDate: "2026-11-20", owner: "a", done: false, category: "Attire" },
    { title: "Send the invitations", dueDate: "2026-12-20", owner: "both", done: false, category: "Guests" },
    {
      title: "Apply for the marriage licence",
      dueDate: "2027-01-20",
      owner: "both",
      done: false,
      category: "Ceremony",
      needsConfirmation: true,
      notes:
        "PLACEHOLDER DATE - confirm this one. How far ahead you must apply, " +
        "how long the licence stays valid and what it costs all depend on " +
        "where you are marrying. Look up the rule, then set the real date.",
    },
    { title: "Write your vows", dueDate: "2027-03-13", owner: "a", done: false, category: "Ceremony" },
    // The couple's own, not from the template.
    { title: "Book videographer or decide against", dueDate: "2026-11-01", owner: "a", done: false, category: "Photography" },
    { title: "Suit fitting", dueDate: "2027-01-15", owner: "b", done: false, category: "Attire" },
    { title: "Confirm run sheet with MC", dueDate: "2027-03-15", owner: "b", done: false, category: "Logistics" },
  ]);

  // The day itself: one canonical run sheet, and who needs which parts.
  const recipients = await db
    .insert(runSheetRecipients)
    .values([
      { name: "Ana Whitfield", role: "Photographer", sortOrder: 0, notes: "Arrive at the house, not the venue. Park on the street." },
      { name: "Rev. Tomasi Leota", role: "Celebrant", sortOrder: 1, notes: "Sound check with the venue before guests arrive." },
      { name: "Harvest Kitchen", role: "Caterer", sortOrder: 2, notes: "Two vegan, one coeliac, one severe nut allergy. Confirmed numbers on the day sheet." },
      { name: "George Papadopoulos", role: "MC", sortOrder: 3, notes: "Keep speeches to 20 minutes total. Cut the mic gently if needed." },
      { name: "Sophie, Lucy, Tom and Aiden", role: "Wedding party", sortOrder: 4, notes: "Eat something before you arrive. Please." },
      { name: "Kauri Sound", role: "Band", sortOrder: 5, notes: "Load in through the side gate; the main doors are for guests." },
    ])
    .returning();

  const byRole = new Map(recipients.map((r) => [r.role, r.id]));
  const to = (...roles: string[]) => roles.map((r) => byRole.get(r)!);

  const runSheet: Array<{
    start: string;
    end?: string;
    title: string;
    detail?: string;
    location?: string;
    lead?: string;
    to: number[];
  }> = [
    { start: "09:00", end: "12:00", title: "Hair and makeup", location: "The house", lead: "Ru", to: to("Photographer", "Wedding party"), detail: "Ru first, bridesmaids from 10:00." },
    { start: "10:30", title: "Photographer arrives", location: "The house", to: to("Photographer"), detail: "Getting-ready shots, rings, shoes, the dress on the door." },
    { start: "11:00", end: "13:00", title: "Caterer load-in", location: "Venue kitchen", lead: "Harvest Kitchen", to: to("Caterer"), detail: "Side gate. Power is on the north wall." },
    { start: "12:00", end: "13:00", title: "Band load-in and sound check", location: "Marquee", lead: "Kauri Sound", to: to("Band", "Celebrant"), detail: "Celebrant to test the ceremony mic in the same window." },
    { start: "13:00", title: "Wedding party leaves for the venue", location: "The house", to: to("Wedding party", "Photographer"), detail: "Two cars. Do not forget the licence." },
    { start: "13:30", end: "14:00", title: "Guests arrive", location: "Front lawn", lead: "George Papadopoulos", to: to("MC", "Celebrant", "Photographer"), detail: "Welcome drinks on the lawn. MC to gather everyone at 13:55." },
    { start: "14:00", end: "14:30", title: "Ceremony", location: "Under the pōhutukawa", lead: "Rev. Tomasi Leota", to: to("Celebrant", "Photographer", "MC", "Wedding party", "Band"), detail: "Processional, vows, rings, signing, recessional. Signing needs two witnesses: Sophie and Tom." },
    { start: "14:30", end: "15:30", title: "Canapés and drinks", location: "Front lawn", lead: "Harvest Kitchen", to: to("Caterer", "Band", "Photographer", "MC"), detail: "Band plays acoustic. Two vegan and one gluten-free platter kept separate." },
    { start: "14:45", end: "15:30", title: "Family and couple photos", location: "The paddock", lead: "Ana Whitfield", to: to("Photographer", "Wedding party"), detail: "Family list is on the back of this sheet. Grandparents first so they can sit down." },
    { start: "15:45", title: "Guests seated for dinner", location: "Marquee", lead: "George Papadopoulos", to: to("MC", "Caterer"), detail: "MC to call everyone in. Seating plan at the entrance." },
    { start: "16:00", end: "17:30", title: "Dinner served", location: "Marquee", lead: "Harvest Kitchen", to: to("Caterer", "MC", "Photographer"), detail: "Family-style shared. Dietary plates go out first and are labelled." },
    { start: "17:30", end: "18:00", title: "Speeches", location: "Marquee", lead: "George Papadopoulos", to: to("MC", "Photographer", "Band"), detail: "Father of the bride, best man, then the couple. Twenty minutes total." },
    { start: "18:00", title: "Cake cut", location: "Marquee", to: to("Photographer", "Caterer", "MC"), detail: "Caterer to take the cake away and plate it for supper." },
    { start: "18:15", title: "First dance", location: "Marquee", lead: "Kauri Sound", to: to("Band", "Photographer", "MC") },
    { start: "18:30", end: "23:00", title: "Dancing", location: "Marquee", lead: "Kauri Sound", to: to("Band", "MC"), detail: "Two sets with a half-hour break at 20:00." },
    { start: "20:00", title: "Supper out", location: "Marquee", lead: "Harvest Kitchen", to: to("Caterer") },
    { start: "22:00", title: "Photographer finishes", to: to("Photographer"), detail: "Last shots on the dance floor, then away." },
    { start: "23:00", title: "Last song", location: "Marquee", lead: "Kauri Sound", to: to("Band", "MC") },
    { start: "23:30", title: "Carriages", location: "Front gate", to: to("MC", "Wedding party"), detail: "Two vans booked. MC to make the announcement at 23:15." },
  ];

  /*
   * The slice of the day guests are shown. Load-ins, supplier calls and
   * the getting-ready hours are left off - not because they are secret,
   * but because a guest's schedule should answer "when do I need to be
   * where" and nothing else.
   */
  const GUEST_NOTES: Record<string, string | null> = {
    "Guests arrive": "Welcome drinks on the lawn. Please be seated by 1:55.",
    Ceremony: "Under the big pōhutukawa by the gate. Rain or shine.",
    "Canapés and drinks": null,
    "Guests seated for dinner": "Find your name on the plan at the marquee door.",
    "Dinner served": "Shared plates down the middle - come hungry.",
    Speeches: null,
    "Cake cut": null,
    "First dance": null,
    Dancing: "Two sets, with a breather around eight.",
    "Supper out": "Something to soak up the evening.",
    "Last song": null,
    Carriages: "Two vans back into town. Ask the MC if you need a seat.",
  };
  const GUEST_VISIBLE = new Set(Object.keys(GUEST_NOTES));

  for (const entry of runSheet) {
    const [inserted] = await db
      .insert(runSheetItems)
      .values({
        startTime: entry.start,
        endTime: entry.end ?? null,
        title: entry.title,
        detail: entry.detail ?? null,
        location: entry.location ?? null,
        lead: entry.lead ?? null,
        guestVisible: GUEST_VISIBLE.has(entry.title),
        guestNote: GUEST_NOTES[entry.title] ?? null,
      })
      .returning();
    if (entry.to.length > 0) {
      await db.insert(runSheetItemRecipients).values(
        entry.to.map((recipientId) => ({
          itemId: inserted.id,
          recipientId,
        })),
      );
    }
  }

  await db.insert(publicSite).values({
    id: 1,
    // Published in the seed so development has something to look at.
    // In production this starts false and stays false until the couple
    // decide otherwise.
    published: true,
    welcomeMessage:
      "We have been putting this off for eleven years, so thank you for coming all this way to watch us finally get on with it.",
    venueName: "Te Awa Paddock",
    venueAddress: "482 Hamurana Road, Rotorua",
    venueMapUrl: "https://maps.google.com/?q=Hamurana+Road+Rotorua",
    arrivalTime: "13:30",
    ceremonyTime: "14:00",
    dressCode: "Garden formal - and flat shoes, the lawn is real grass",
    giftNote:
      "Your being there is the gift. If you would still like to do something, we are putting a little aside for a honeymoon in the Marlborough Sounds - ask either of us and we will point you at it.",
    travelNotes:
      "Twenty minutes north of Rotorua on Hamurana Road. Parking is in the paddock inside the gate - follow the flags, and leave the keys in the car if you plan to leave it overnight.\n\nTaxis and rideshares do come out this far but not quickly. If you would rather not drive, tell us on your reply and we will put you on the van list.",
    accommodationNotes:
      "We have held a block of rooms at the Regent in town under 'Ru & Malin' until the end of January.\n\nThere are also two cabins on the property itself for anyone who would rather not travel at midnight - first come, and we will sort it out with you directly.",
    rsvpDeadline: "2027-01-31",
    photosEnabled: true,
    tableRevealEnabled: false,
  });

  await db.insert(faqItems).values([
    {
      question: "Can I bring someone?",
      answer:
        "Your invitation lists everyone we have a seat for by name. The paddock only holds so many, so we have had to be strict - please do not take it personally.",
      sortOrder: 0,
    },
    {
      question: "Are children welcome?",
      answer:
        "Yes, and there will be others. Anyone under two eats free and sits on a lap. Let us know on your reply what they will eat.",
      sortOrder: 1,
    },
    {
      question: "What happens if it rains?",
      answer:
        "Nothing changes. The ceremony moves under the marquee and everything else was always going to be in there anyway.",
      sortOrder: 2,
    },
    {
      question: "What time should I actually arrive?",
      answer:
        "Any time from 1:30. The ceremony starts at 2:00 sharp and we would hate for you to miss it.",
      sortOrder: 3,
    },
    {
      question: "Is there parking?",
      answer:
        "In the paddock inside the gate. It is grass, so nothing low-slung after heavy rain - park on the road if you are worried.",
      sortOrder: 4,
    },
    {
      question: "Can I take photographs?",
      answer:
        "During the ceremony, please leave it to Ana - phones in the aisle end up in every shot. Afterwards, take as many as you like and put them in the shared album.",
      sortOrder: 5,
    },
  ]);

  const [sampleHousehold] = await db
    .select({ name: households.name, token: households.inviteToken })
    .from(households)
    .where(sql`${households.inviteToken} is not null`)
    .limit(1);
  if (sampleHousehold?.token) {
    console.log(
      `Invitation for ${sampleHousehold.name}: ${inviteUrl("http://localhost:3000", sampleHousehold.token)}`,
    );
  }

  const counts = {
    households: HOUSEHOLDS.length,
    guests: allGuests.length,
    tables: insertedTables.length,
    venues: VENUES.length,
    budgetItems: items.length,
    runSheetItems: runSheet.length,
  };
  console.log("Seeded:", counts);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
