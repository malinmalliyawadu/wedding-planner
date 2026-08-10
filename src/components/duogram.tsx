/**
 * The app's signature mark: the couple's initials interlocked, side A in
 * sage and side B in rose. Rendered wherever the app needs an identity.
 */
export function Duogram({
  a,
  b,
  tone = "light",
  size = "lg",
}: {
  a: string;
  b: string;
  /** "light" for dark surfaces (sidebar), "dark" for paper surfaces. */
  tone?: "light" | "dark";
  /** "sm" for the phone header, where the mark sits beside the names. */
  size?: "sm" | "lg";
}) {
  const initialA = (a[0] ?? "A").toUpperCase();
  const initialB = (b[0] ?? "B").toUpperCase();
  const [colorA, colorB] =
    tone === "light"
      ? ["text-sage-bright/90", "text-rose-bright/80"]
      : ["text-sage-mid", "text-rose-mid/90"];
  return (
    <span
      aria-hidden
      className={`relative inline-block font-display leading-none select-none ${
        size === "sm" ? "text-2xl" : "text-[2.75rem]"
      }`}
    >
      <span className={colorA}>{initialA}</span>
      <span className={`-ml-[0.32em] ${colorB}`}>{initialB}</span>
    </span>
  );
}
