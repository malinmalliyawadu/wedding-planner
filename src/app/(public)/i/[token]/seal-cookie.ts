/**
 * Which invitations this browser has already opened.
 *
 * A cookie rather than localStorage, because the decision has to be made
 * on the server: the envelope is either in the HTML or it is not, and a
 * client-side check would mean rendering it and then taking it away in
 * front of the guest.
 *
 * One cookie per invitation, scoped to that invitation's path. Two
 * households sharing a laptop each get their own ceremony, and nothing
 * about it is sent on any other request.
 */

/** Token characters are [a-z0-9] by construction, so this is a legal cookie name. */
export const sealCookieName = (token: string) => `seal_${token}`;

export const SEAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
