/**
 * Reading the replies.
 *
 * Pure and separately tested, like the budget and projection modules,
 * because "how many people are coming" is the number the caterer, the
 * seating solver and the budget all take on trust. Getting it from a
 * quick `.filter()` in a page component is how the three of them end up
 * disagreeing.
 */

export type RsvpGuest = {
  ageBracket: "adult" | "child" | "infant";
  rsvpStatus: "pending" | "attending" | "declined";
};

export type RsvpHousehold = {
  id: number;
  name: string;
  inviteToken: string | null;
  respondedAt: Date | null;
  guests: RsvpGuest[];
};

export type HeadCount = {
  adults: number;
  children: number;
  infants: number;
  /** What the caterer charges for: adults and children, never infants. */
  catered: number;
  /** Everyone through the gate, infants included. */
  bodies: number;
};

export function countAttending(guests: RsvpGuest[]): HeadCount {
  const coming = guests.filter((guest) => guest.rsvpStatus === "attending");
  const adults = coming.filter((g) => g.ageBracket === "adult").length;
  const children = coming.filter((g) => g.ageBracket === "child").length;
  const infants = coming.filter((g) => g.ageBracket === "infant").length;
  return {
    adults,
    children,
    infants,
    catered: adults + children,
    bodies: adults + children + infants,
  };
}

export type HouseholdStatus =
  | "replied"
  | "partial"
  | "not_replied"
  | "no_link"
  | "empty";

/** The statuses that still want something done about them. */
export type ChaseReason = Exclude<HouseholdStatus, "replied" | "empty">;

/**
 * Where one household stands, in a word.
 *
 * The invitations page shows this against every row and the chase list
 * gives it as its reason, from the one function, so a row can never say
 * "waiting" about a household the chase list calls half answered.
 *
 * "Partial" outranks the link: a household that half-replied plainly has
 * a working link, whatever the column says, and the missing answers are
 * the thing to fix.
 */
export function householdStatus(household: RsvpHousehold): HouseholdStatus {
  if (household.guests.length === 0) return "empty";
  const outstanding = outstandingIn(household);
  if (outstanding === 0) return "replied";
  if (outstanding < household.guests.length) return "partial";
  return household.inviteToken === null ? "no_link" : "not_replied";
}

/** How many of the household still have no answer either way. */
export function outstandingIn(household: RsvpHousehold): number {
  return household.guests.filter((guest) => guest.rsvpStatus === "pending")
    .length;
}

export type ChaseEntry = {
  household: RsvpHousehold;
  reason: ChaseReason;
  /** How many of the household still have no answer either way. */
  outstanding: number;
};

/**
 * Who still owes an answer, in the order worth working through.
 *
 * "Partial" is its own case and deliberately ranks first: a household
 * that half-replied is the one most likely to be an accident - a form
 * abandoned, or a person added to the guest list after they answered -
 * and it is the one a single message will fix.
 *
 * Households with nobody on them are left out entirely. There is nothing
 * to chase, and they would sit at the top of the list forever.
 */
export function buildChaseList(households: RsvpHousehold[]): ChaseEntry[] {
  const order: Record<ChaseReason, number> = {
    partial: 0,
    not_replied: 1,
    no_link: 2,
  };

  const entries: ChaseEntry[] = [];
  for (const household of households) {
    const status = householdStatus(household);
    if (status === "empty" || status === "replied") continue;
    entries.push({
      household,
      reason: status,
      outstanding: outstandingIn(household),
    });
  }

  return entries.sort(
    (a, b) =>
      order[a.reason] - order[b.reason] ||
      a.household.name.localeCompare(b.household.name),
  );
}

/** Households that have answered for everyone, newest reply first. */
export function repliedHouseholds(
  households: RsvpHousehold[],
): RsvpHousehold[] {
  return households
    .filter((household) => householdStatus(household) === "replied")
    .sort(
      (a, b) =>
        (b.respondedAt?.getTime() ?? 0) - (a.respondedAt?.getTime() ?? 0),
    );
}
