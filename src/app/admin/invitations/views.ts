/**
 * Which households the invitations list shows, kept in the URL (`?show=`)
 * so a view survives a reload and can be sent between the two of you -
 * "here are the ones to chase" is a link, not a description.
 *
 * Shared by the page, which reads the parameter on the server, and the
 * filter bar, which writes it on the client.
 */
export const VIEWS = [
  { value: "all", label: "Everyone" },
  { value: "chase", label: "To chase" },
  { value: "replied", label: "Replied" },
] as const;

export type View = (typeof VIEWS)[number]["value"];

export function parseView(value: unknown): View {
  return VIEWS.some((view) => view.value === value) ? (value as View) : "all";
}
