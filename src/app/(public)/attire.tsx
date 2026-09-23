/**
 * What to wear, shown rather than only said.
 *
 * "Garden formal" is two words a guest has to interpret, and the card
 * can do some of the interpreting for them: four garments and a row of
 * colours, under the phrase. They are examples, not a uniform - which is
 * why there are four of them and not an outfit each, and why the colours
 * are a spread rather than a pair.
 *
 * Drawn, like the emblems and the lodge, in the sprig's line. Found
 * artwork was the first thought and was set aside: what is free to use
 * is either the felt-tip clip art `motifs.tsx` explains the page cannot
 * carry, pencil scans, or the 1930s fashion plates the Rijksmuseum has
 * released - which are beautiful and are pictures of 1931. A line
 * drawing in this hand costs nothing, recolours with the brass, and
 * sits beside the hanger emblem at the head of the block as one set.
 *
 * Like the lodge, this is a drawing of one dress code, so `isGardenFormal`
 * shows it only while the dress code in settings says so. Change it to
 * black tie and the sun hat goes, rather than standing in for a dress
 * code it does not illustrate.
 */

import type { ReactNode } from "react";

export function isGardenFormal(dressCode: string | null | undefined): boolean {
  return /garden/i.test(dressCode ?? "");
}

/*
 * Colours a guest might wear. Named the way a swatch book names them,
 * not the way the design tokens do, because a guest is picking a dress
 * and not a hex value. The greens and pinks are the card's own sage and
 * rose; the rest are the garden around them.
 */
const PALETTE: ReadonlyArray<{ name: string; hex: string }> = [
  { name: "Sage", hex: "#6d8877" },
  { name: "Eucalyptus", hex: "#a9c2ae" },
  { name: "Dusty rose", hex: "#a8737d" },
  { name: "Blush", hex: "#e3bfc2" },
  { name: "Cream", hex: "#efe5cf" },
  { name: "Terracotta", hex: "#b8684b" },
  { name: "Slate blue", hex: "#6f7f96" },
  { name: "Ochre", hex: "#c8a24a" },
];

/*
 * Each garment is drawn into a box 96 units tall, so that four of them
 * set at one height share a floor: the hat, which is short, is pushed
 * to the bottom of its box rather than floating at the top. No stroke
 * width is set on the paths, as in `motifs.tsx` - the block picks the
 * weight and the colour once.
 */

/** The hook every hanging garment is on. */
const HOOK = "M 32 25 V 12.6 C 29.4 11.8 29.4 8.2 32 8.2 C 34.6 8.2 34.6 11 32.6 11.8";

/** A dress on a hanger: fitted to the waist, a sash, a skirt to mid-calf. */
function Dress() {
  return (
    <>
      <path d="M 32 15 V 12.6 C 29.4 11.8 29.4 8.2 32 8.2 C 34.6 8.2 34.6 11 32.6 11.8" />
      <path d="M 32 15 L 15.5 24.5 M 32 15 L 48.5 24.5" />
      {/* Straps, up to the hanger's arms. */}
      <path d="M 19 30.5 L 16.8 24 M 45 30.5 L 47.2 24" />
      <path d="M 19 30.5 Q 32 36 45 30.5" />
      <path d="M 19 30.5 L 23.5 48.5 M 45 30.5 L 40.5 48.5" />
      <path d="M 23.5 48.5 Q 32 50.5 40.5 48.5 M 23.8 51 Q 32 53 40.2 51" />
      <path d="M 23.8 51 L 11.5 89.5 M 40.2 51 L 52.5 89.5" />
      <path d="M 11.5 89.5 Q 22 92.5 32 89.8 Q 42 87 52.5 89.5" />
      {/* Two folds, lighter: the skirt has some weight to it. */}
      <path d="M 29.5 52.5 Q 26.5 70 25.5 89.5 M 35.5 52.5 Q 38.5 70 39.5 88" strokeOpacity="0.5" />
    </>
  );
}

/** An unlined jacket on a hanger: notched lapels, two buttons, a patch pocket. */
function Jacket() {
  return (
    <>
      <path d={HOOK} />
      <path d="M 21 31 L 25.5 27.2 Q 32 23 38.5 27.2 L 43 31" />
      {/* The left front lies over the right, so its edge runs to the hem
          and the right lapel stops where it goes under. */}
      <path d="M 25.5 27.2 L 33 50 L 34 90" />
      <path d="M 38.5 27.2 L 31 50" />
      <path d="M 27 31 Q 31 40 32.5 48" strokeOpacity="0.45" />
      <path d="M 17 28.5 L 25.5 27.2 M 38.5 27.2 L 47 28.5" />
      <path d="M 17 28.5 L 9.5 34 L 11.5 77 L 19 77.5 L 19.8 47" />
      <path d="M 47 28.5 L 54.5 34 L 52.5 77 L 45 77.5 L 44.2 47" />
      <path d="M 19.8 47 L 19.4 89.5 Q 27 90 34 90" />
      <path d="M 44.2 47 L 44.6 89.5 Q 39 90 34 90" />
      <circle cx="33.2" cy="54" r="1.1" />
      <circle cx="33.4" cy="63" r="1.1" />
      <path d="M 22.5 67 V 80.5 H 30.5 V 67" />
      <path d="M 38.5 47.5 H 43.5 V 52.5" />
    </>
  );
}

/**
 * A sun hat: a wide brim, a low crown, a band with its ribbon trailing.
 * Drawn 80 wide and scaled into the 64 box, on the floor of it.
 */
function Hat() {
  return (
    <g transform="translate(1.5 50) scale(0.82)">
      {/* The brim is two arcs, front and back, leaving out the stretch
          that would pass behind the crown - nothing here is filled, so
          the line has to stop rather than be painted over. */}
      <path d="M 3 34 C 3 47 77 47 77 34" />
      <path d="M 3 34 C 3 28 12 25 21 24.5 M 77 34 C 77 28 68 25 59 24.5" />
      <path d="M 22 31 C 22 8 58 8 58 31" />
      <path d="M 22 31 Q 40 37 58 31" />
      <path d="M 22.6 27 Q 40 33 57.4 27" />
      <path d="M 21 24.5 Q 40 38 59 24.5" strokeOpacity="0.5" />
      <path d="M 57 29.5 Q 66 31 70 40 M 57.5 30.5 Q 62 36 63 43" strokeOpacity="0.8" />
    </g>
  );
}

/** A pair of flats, from above, toes apart - the lawn is real grass. */
function Flats() {
  const shoe = (cx: number) => (
    <>
      <path
        d={`M ${cx} 7 C ${cx + 9} 7 ${cx + 12} 20 ${cx + 12} 38 C ${cx + 12} 56 ${cx + 9} 68 ${cx + 6} 78 C ${cx + 4.5} 83 ${cx + 3} 87 ${cx} 87 C ${cx - 3} 87 ${cx - 4.5} 83 ${cx - 6} 78 C ${cx - 9} 68 ${cx - 12} 56 ${cx - 12} 38 C ${cx - 12} 20 ${cx - 9} 7 ${cx} 7 Z`}
      />
      <path
        d={`M ${cx} 31 C ${cx + 5.5} 31 ${cx + 8} 38 ${cx + 8} 46 C ${cx + 8} 62 ${cx + 5} 74 ${cx} 78 C ${cx - 5} 74 ${cx - 8} 62 ${cx - 8} 46 C ${cx - 8} 38 ${cx - 5.5} 31 ${cx} 31 Z`}
        strokeOpacity="0.7"
      />
      <path
        d={`M ${cx} 29 C ${cx - 4} 26 ${cx - 4} 31.5 ${cx} 29 C ${cx + 4} 26 ${cx + 4} 31.5 ${cx} 29`}
        strokeOpacity="0.8"
      />
    </>
  );
  return (
    <>
      <g transform="rotate(-7 22 50)">{shoe(22)}</g>
      <g transform="rotate(7 42 50)">{shoe(42)}</g>
    </>
  );
}

const GARMENTS: ReadonlyArray<{
  caption: string;
  Shape: () => ReactNode;
  /** The ones on a hanger sway from the hook; a hat and shoes lie still. */
  hangs: boolean;
}> = [
  { caption: "Midi dress", Shape: Dress, hangs: true },
  { caption: "Linen jacket", Shape: Jacket, hangs: true },
  { caption: "Sun hat", Shape: Hat, hangs: false },
  { caption: "Flat shoes", Shape: Flats, hangs: false },
];

/**
 * The block under the dress code: the garments in a row, then the
 * colours. Two `Rise`s rather than one so each arrives as it is reached,
 * on the same path as everything else on the card.
 */
export function Wardrobe() {
  return (
    <>
      <div className="rise rise-in mx-auto mt-10 max-w-xl" data-reveal="">
        <ul className="grid grid-cols-4 items-end gap-3 sm:gap-6">
          {GARMENTS.map(({ caption, Shape, hangs }) => (
            <li key={caption} className="text-center">
              <svg
                viewBox="0 0 64 96"
                className={`mx-auto h-24 w-auto text-brass-bright sm:h-32 ${hangs ? "idle-sway" : ""}`}
                aria-hidden
              >
                <g
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.05"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <Shape />
                </g>
              </svg>
              <p className="formula mt-3 text-[0.9rem] leading-snug text-ink-soft sm:text-[1.05rem]">
                {caption}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {/* Wide enough for all eight in one row from a tablet up; a phone
          gets two rows of four rather than a row of six and an orphan pair. */}
      <div className="rise rise-in mx-auto mt-12 max-w-2xl text-center" data-reveal="">
        <p className="eyebrow text-ink-faint">Colours</p>
        <ul className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-5">
          {PALETTE.map(({ name, hex }) => (
            <li key={name} className="w-[4.25rem] text-center">
              {/* A dab rather than a chip: lit from above and shaded
                  underneath, so it reads as paint on the card and not as
                  a colour picker. */}
              <span
                className="mx-auto block size-10 rounded-full shadow-[inset_0_-5px_9px_rgba(33,43,37,0.14),inset_0_4px_7px_rgba(255,255,255,0.35),0_0_0_1px_rgba(33,43,37,0.08)] sm:size-11"
                style={{ background: hex }}
                aria-hidden
              />
              <span className="mt-2 block text-[0.72rem] leading-tight tracking-wide text-ink-soft">
                {name}
              </span>
            </li>
          ))}
        </ul>
        <p className="formula mx-auto mt-6 max-w-sm text-[1.05rem] leading-relaxed text-ink-soft sm:text-[1.15rem]">
          Any of these, or something near them.
        </p>
      </div>
    </>
  );
}
