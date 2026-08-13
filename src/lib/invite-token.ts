/**
 * Invite tokens: the entire access control for the public invitation.
 *
 * There are no guest accounts and no passwords - the link a household is
 * sent *is* the credential. That puts the whole burden on the token being
 * unguessable, so it is 100 bits of `crypto.getRandomValues`. At that
 * size, an attacker guessing a billion tokens a second still expects to
 * wait longer than the age of the universe to hit one, which is the only
 * argument that matters given what sits behind it.
 *
 * The alphabet is 32 characters with every confusable pair removed
 * (no i/l/1, no o/O). Tokens end up on printed cards and get read aloud
 * down the phone by relatives, and a token that cannot be transcribed is
 * a support call the couple have to answer.
 */

/** 32 characters: a-z less i, l, o; digits less 1. Powers of two keep the mapping uniform. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz023456789";

/** 20 characters x 5 bits. Short enough to retype, long enough not to matter. */
export const TOKEN_LENGTH = 20;

const TOKEN_PATTERN = new RegExp(`^[${ALPHABET}]{${TOKEN_LENGTH}}$`);

export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  let token = "";
  // 256 is a multiple of 32, so masking to 5 bits stays uniform - no
  // modulo bias to correct for and no rejection loop needed.
  for (const byte of bytes) token += ALPHABET[byte & 31];
  return token;
}

/**
 * Whether a string could be a token at all. Lets a request for a
 * malformed URL be turned away without a database round trip, which
 * keeps a crawler hammering /i/... from costing anything.
 */
export function isInviteTokenShape(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/** The URL a household is sent. `origin` carries no trailing slash. */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/i/${token}`;
}
