import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BLOT, DIE, SEAL_SIZE } from "./i/[token]/wax-seal";

/**
 * The link preview.
 *
 * A link to a wedding gets forwarded, pasted into group chats and
 * unfurled by every messaging app on the way, and this is the picture
 * each of them shows. It is served to anyone, with no cookie, from a
 * path the proxy opens for exactly that - so it is made from nothing a
 * stranger should not have: no names, no date, no address, no initials.
 * What it shows is the stationery itself. A sealed envelope on the
 * washed sheet, the couple's wax unbroken, and a print of the two of
 * them laid beside it, and three words on the envelope. The picture
 * says whose.
 *
 * It is one picture for the whole public surface - the front door and
 * every household's link alike - and it is generated at build time,
 * because nothing in it comes from the database. That is also why the
 * fonts and artwork are read off disk here rather than imported: they
 * are consumed by the renderer at build, not served to a browser.
 *
 * Satori, the renderer behind `ImageResponse`, lays out flexbox, sets
 * type and draws shadows; it does not do filters, blend modes or CSS
 * variables. So
 * everything *drawn* - the sheet, the envelope, the seal, the leaves -
 * is written here as SVG with the theme's colours spelled out, and
 * handed to it as an image. The colours are copied from `@theme` in
 * globals.css and have to be kept in step with it by hand.
 */

export const alt = "A sealed envelope, waiting to be opened";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const { width: W, height: H } = size;

/* Copied from globals.css. Satori cannot read a custom property. */
const PAPER = "#f6f3ec";
const CARD = "#fdfcf8";
const INK = "#212b25";
const HAIRLINE = "#ddd6c6";
const HAIRLINE_STRONG = "#c3bba7";
const BRASS_BRIGHT = "#c9a961";
const SAGE_MID = "#6d8877";
const ROSE_MID = "#a8737d";
const BLUSH = "#fbe7d9";
const BLUSH_SOFT = "#fdf2e9";
const BLUSH_DEEP = "#f6dbc8";
const BLUSH_GREEN = "#eef0e4";
const WAX = "#6f3742";
const WAX_LIT = "#9a545f";
const WAX_SHADOW = "#431f27";

/* The envelope: C6 proportions, as on the invitation, at desk scale. */
const ENVELOPE_W = 600;
const ENVELOPE_H = 423;
/** Where the flap's point lands, as a share of the height - see .seal. */
const FLAP = 0.52;
const SEAL_PX = 176;

/* The print of the couple: a 3:4 photograph in a paper border. */
const PRINT_BORDER = 14;
const PHOTO_W = 300;
const PHOTO_H = 400;

const ASSETS = join(process.cwd(), "src/assets");

async function asset(path: string): Promise<Buffer> {
  return readFile(join(ASSETS, path));
}

function dataUri(type: string, body: Buffer | string): string {
  const data = typeof body === "string" ? Buffer.from(body) : body;
  return `data:${type};base64,${data.toString("base64")}`;
}

const svgUri = (markup: string) => dataUri("image/svg+xml", markup);

/**
 * One radial layer of the watercolour wash, in SVG.
 *
 * CSS says `radial-gradient(58% 42% at 4% 0%, colour, transparent 64%)`.
 * In bounding-box units an SVG radial gradient is a circle, so the
 * ellipse is a circle of the wider radius squashed about its own centre
 * by the ratio of the two - the same picture, written the other way up.
 */
function radial(
  id: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: string,
  fadeAt: number,
  opacity = 1,
): string {
  const squash = (ry / rx).toFixed(4);
  return (
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${rx}" ` +
    `gradientTransform="translate(${cx} ${cy}) scale(1 ${squash}) translate(${-cx} ${-cy})">` +
    `<stop offset="0" stop-color="${colour}" stop-opacity="${opacity}"/>` +
    `<stop offset="${fadeAt}" stop-color="${colour}" stop-opacity="0"/>` +
    `</radialGradient>`
  );
}

/**
 * The wash, layer for layer as `--wash-layers` in globals.css: four
 * corners and a green breath off-centre, the middle left clear for
 * whatever is printed on it. Same colours, same positions, so the
 * painted corners feather into this exactly as they do on the page.
 */
function wash(prefix: string): { defs: string; rects: string } {
  const layers: Array<[number, number, number, number, string, number]> = [
    [0.04, 0.0, 0.58, 0.42, BLUSH, 0.64],
    [0.98, 0.06, 0.52, 0.36, BLUSH_DEEP, 0.6],
    [0.96, 0.98, 0.64, 0.44, BLUSH, 0.62],
    [0.02, 0.94, 0.6, 0.4, BLUSH_SOFT, 0.6],
    [0.76, 0.44, 0.4, 0.3, BLUSH_GREEN, 0.7],
  ];
  return {
    defs: layers
      .map(([cx, cy, rx, ry, colour, fade], i) =>
        radial(`${prefix}-wash-${i}`, cx, cy, rx, ry, colour, fade),
      )
      .join(""),
    rects: layers
      .map((_, i) => `<rect width="100%" height="100%" fill="url(#${prefix}-wash-${i})"/>`)
      .join(""),
  };
}

/**
 * Laid paper: the `grain` and `grain-stock` utilities. The page blends
 * its grain with multiply; resvg honours `mix-blend-mode` on an element,
 * and where it does not the noise simply sits on top at this opacity,
 * which over paper this pale is indistinguishable.
 */
function grain(id: string, frequency: string, octaves: number, opacity: number): string {
  return (
    `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" ` +
    `numOctaves="${octaves}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="100%" height="100%" filter="url(#${id})" opacity="${opacity}" style="mix-blend-mode:multiply"/>`
  );
}

/** The sheet everything lies on. */
function sheet(): string {
  const { defs, rects } = wash("sheet");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>${defs}</defs>` +
    `<rect width="100%" height="100%" fill="${PAPER}"/>` +
    rects +
    grain("sheet-grain", "0.82", 3, 0.08) +
    `</svg>`
  );
}

/**
 * The envelope, sealed, exactly as `.envelope-front` and `.envelope-flap`
 * paint it: one sheet folded, so the flap is invisible but for its
 * crease. The key light from the upper left, the falloff towards the
 * bottom edge and the wash underneath both are the face's own; the
 * crease is the flap's triangle drawn a few pixels lower, so all that
 * shows of it is a sliver along the two diagonals - which is what the
 * eye reads as a folded edge.
 */
function envelope(): string {
  const w = ENVELOPE_W;
  const h = ENVELOPE_H;
  const tipY = h * FLAP;
  const flap = `M0 0 H${w} L${w / 2} ${tipY} Z`;
  const { defs, rects } = wash("env");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${defs}` +
    radial("env-key", 0.27, 0.03, 1.24, 0.88, "#ffffff", 0.64, 0.82) +
    `<linearGradient id="env-fall" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0.42" stop-color="#685e46" stop-opacity="0"/>` +
    `<stop offset="1" stop-color="#685e46" stop-opacity="0.14"/></linearGradient>` +
    `<linearGradient id="env-crease" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${INK}" stop-opacity="0.06"/>` +
    `<stop offset="1" stop-color="${INK}" stop-opacity="0.2"/></linearGradient>` +
    `<clipPath id="env-clip"><rect width="${w}" height="${h}"/></clipPath>` +
    `</defs>` +
    `<g clip-path="url(#env-clip)">` +
    `<rect width="100%" height="100%" fill="${CARD}"/>` +
    rects +
    `<rect width="100%" height="100%" fill="url(#env-key)"/>` +
    `<rect width="100%" height="100%" fill="url(#env-fall)"/>` +
    // The crease: the flap's own shape, four pixels lower and a hair
    // wider, showing only along the diagonals.
    `<path d="${flap}" fill="url(#env-crease)" transform="translate(${w / 2} 4) scale(1.006) translate(${-w / 2} 0)"/>` +
    // The flap over it, the same paper in the same light, so only its
    // edge catching the light says where it ends.
    `<path d="${flap}" fill="${CARD}"/>` +
    `<path d="${flap}" fill="url(#env-key)"/>` +
    `<path d="${flap}" fill="url(#env-fall)"/>` +
    `<path d="M0 0 L${w / 2} ${tipY} L${w} 0" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="1.2"/>` +
    grain("env-grain", "0.34 0.62", 4, 0.1) +
    `</g>` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${HAIRLINE_STRONG}"/>` +
    `</svg>`
  );
}

/**
 * The couple's wax, unbroken. The same blot and die as `wax-seal.tsx`,
 * with the same inverted lighting - the dome lit from the upper left,
 * the recess from the lower right, the device standing proud again -
 * and two interlocked rings struck into it in place of the initials.
 * The rings are the app icon's reading of the duogram: its meaning, not
 * its letterforms, which is exactly what a preview may carry.
 */
function seal(): string {
  const s = SEAL_SIZE;
  const c = s / 2;
  const ring = 20;
  const apart = 11.5;
  const left = `<circle cx="${c - apart}" cy="${c}" r="${ring}"/>`;
  const right = `<circle cx="${c + apart}" cy="${c}" r="${ring}"/>`;
  // The rings cross twice. The left one is drawn again over the right
  // along the arc through the upper crossing, so it passes over at the
  // top and under at the bottom - woven, as on the icon, rather than
  // stacked. Butt ends, so the arc's ends vanish into the ring it is
  // part of instead of standing on it as two beads.
  const arc = (degrees: number): string => {
    const angle = (degrees * Math.PI) / 180;
    const x = c - apart + ring * Math.cos(angle);
    const y = c + ring * Math.sin(angle);
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  };
  const over =
    `<path d="M${arc(-84)} A${ring} ${ring} 0 0 1 ${arc(-26)}" fill="none" stroke-linecap="butt"/>`;
  const rings = (colour: string, dx: number, dy: number) =>
    `<g transform="translate(${dx} ${dy})" fill="none" stroke="${colour}" stroke-width="6">` +
    `${left}${right}${over}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<defs>` +
    `<radialGradient id="seal-dome" cx="0.33" cy="0.26" r="0.82">` +
    `<stop offset="0" stop-color="${WAX_LIT}"/><stop offset="0.52" stop-color="${WAX}"/>` +
    `<stop offset="1" stop-color="${WAX_SHADOW}"/></radialGradient>` +
    `<radialGradient id="seal-recess" cx="0.72" cy="0.78" r="0.86">` +
    `<stop offset="0" stop-color="${WAX_LIT}" stop-opacity="0.9"/><stop offset="0.45" stop-color="${WAX}"/>` +
    `<stop offset="1" stop-color="${WAX_SHADOW}"/></radialGradient>` +
    `<radialGradient id="seal-sheen" cx="0.5" cy="0.5" r="0.5">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/>` +
    `<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
    `<filter id="seal-cast" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feGaussianBlur stdDeviation="4"/></filter>` +
    `</defs>` +
    // Wax sits proud of the paper, so it throws a shadow the paper's
    // flat crease does not.
    `<path d="${BLOT}" fill="${WAX_SHADOW}" opacity="0.38" filter="url(#seal-cast)" transform="translate(2 6)"/>` +
    `<path d="${BLOT}" fill="url(#seal-dome)" stroke="${WAX_SHADOW}" stroke-width="1.25" stroke-opacity="0.55"/>` +
    `<path d="${DIE}" fill="url(#seal-recess)"/>` +
    `<path d="${DIE}" fill="none" stroke="${WAX_SHADOW}" stroke-width="2.5" stroke-opacity="0.42"/>` +
    `<ellipse cx="72" cy="62" rx="46" ry="34" fill="url(#seal-sheen)" transform="rotate(-28 72 62)"/>` +
    rings(WAX_SHADOW, 1.6, 1.6) +
    rings(WAX_LIT, 0, 0) +
    `</svg>`
  );
}

/**
 * A leaf let go on the desk: the sprig's own leaf, as in `petals.tsx`,
 * in one of the two sides' colours or the brass. A midrib in a darker
 * shade of itself is what stops it reading as a blob at this size.
 */
function leaf(colour: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="36" viewBox="0 0 20 12">` +
    `<path d="M 1 6 Q 10 -3.5 19 6 Q 10 15.5 1 6 Z" fill="${colour}"/>` +
    `<path d="M 1.5 6 Q 10 5.4 18.5 6" fill="none" stroke="${INK}" stroke-opacity="0.28" stroke-width="0.5"/>` +
    `</svg>`
  );
}

/**
 * Stands in for the print until the couple's photograph is on disk at
 * `src/assets/og/couple.jpg`: the paper's own colour, so the frame
 * still reads as a print and not as a hole.
 */
function blankPrint(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PHOTO_W}" height="${PHOTO_H}" viewBox="0 0 ${PHOTO_W} ${PHOTO_H}">` +
    `<defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${BLUSH_GREEN}"/><stop offset="1" stop-color="${BLUSH_DEEP}"/>` +
    `</linearGradient></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`
  );
}

async function photo(): Promise<string> {
  try {
    return dataUri("image/jpeg", await asset("og/couple.jpg"));
  } catch {
    return svgUri(blankPrint());
  }
}

type Petal = {
  x: number;
  y: number;
  turn: number;
  scale: number;
  tone: string;
};

/**
 * Laid out from a table, as everything drawn here is. A handful, not a
 * shower: they should read as leaves that fell on the desk, not as
 * confetti thrown at it.
 */
const PETALS: readonly Petal[] = [
  { x: 96, y: 548, turn: 24, scale: 0.85, tone: SAGE_MID },
  { x: 152, y: 586, turn: -38, scale: 0.7, tone: ROSE_MID },
  { x: 706, y: 566, turn: 62, scale: 0.9, tone: BRASS_BRIGHT },
  { x: 1108, y: 118, turn: -70, scale: 0.75, tone: SAGE_MID },
  { x: 1060, y: 560, turn: 14, scale: 0.8, tone: ROSE_MID },
  { x: 60, y: 300, turn: -12, scale: 0.65, tone: BRASS_BRIGHT },
];

export default async function Image() {
  const [marcellus, topLeft, bottomLeft, bottomRight, dove, print] =
    await Promise.all([
      asset("fonts/Marcellus-Regular.ttf"),
      asset("og/corner-top-left.png"),
      asset("og/corner-bottom-left.png"),
      asset("og/corner-bottom-right.png"),
      asset("sketches/dove-rising.svg"),
      photo(),
    ]);

  const envelopeLeft = 118;
  const envelopeTop = 112;
  const tipY = ENVELOPE_H * FLAP;

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundColor: PAPER,
        }}
      >
        {/* The washed sheet, with its grain. */}
        <img
          alt=""
          src={svgUri(sheet())}
          width={W}
          height={H}
          style={{ position: "absolute", top: 0, left: 0 }}
        />

        {/* The painted corners, feathered into the wash they were sampled
            from. Two on the sheet; the envelope carries its own. */}
        <img
          alt=""
          src={dataUri("image/png", topLeft)}
          width={430}
          height={430}
          style={{ position: "absolute", top: 0, left: 0 }}
        />
        <img
          alt=""
          src={dataUri("image/png", bottomRight)}
          width={330}
          height={370}
          style={{ position: "absolute", right: 0, bottom: 0 }}
        />

        {/* Marginalia, in the second hand: one dove, faint, where the
            margin is. */}
        <img
          alt=""
          src={dataUri("image/svg+xml", dove)}
          width={168}
          height={119}
          style={{ position: "absolute", top: 34, left: 1000, opacity: 0.38 }}
        />

        {PETALS.map((petal, i) => (
          <img
            alt=""
            key={i}
            src={svgUri(leaf(petal.tone))}
            width={60}
            height={36}
            style={{
              position: "absolute",
              left: petal.x,
              top: petal.y,
              opacity: 0.85,
              transform: `rotate(${petal.turn}deg) scale(${petal.scale})`,
            }}
          />
        ))}

        {/* The envelope. Leaning a few degrees, as a thing put down on a
            desk does, and throwing the invitation's own overlay shadow. */}
        <div
          style={{
            position: "absolute",
            left: envelopeLeft,
            top: envelopeTop,
            width: ENVELOPE_W,
            height: ENVELOPE_H,
            display: "flex",
            transform: "rotate(-3deg)",
            boxShadow: "0 16px 48px rgba(29, 38, 33, 0.28), 0 2px 6px rgba(29, 38, 33, 0.12)",
          }}
        >
          <img
            alt=""
            src={svgUri(envelope())}
            width={ENVELOPE_W}
            height={ENVELOPE_H}
            style={{ position: "absolute", top: 0, left: 0 }}
          />
          {/* The same painted corner the invitation opens on, small, so
              the envelope and what is in it are visibly one piece. */}
          <img
            alt=""
            src={dataUri("image/png", bottomLeft)}
            width={176}
            height={109}
            style={{ position: "absolute", left: 1, bottom: 1 }}
          />

          {/* Addressed the way it would be if it had come by post: in the
              lower half, clear of the flap and the wax. One line, in the
              display face, debossed into the stock like the name on the
              real envelope - and haloed in the stock's own colour, so
              where it runs over the painted corner the paint drops back
              rather than the letters. */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: tipY + SEAL_PX / 2 - 6,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Marcellus",
              fontSize: 52,
              lineHeight: 1,
              color: INK,
              letterSpacing: "0.02em",
              textShadow:
                "0 1px 0 rgba(255,255,255,0.62), 0 -1px 1px rgba(33,43,37,0.14), " +
                `0 0 14px ${CARD}, 0 0 24px ${CARD}, 0 0 36px ${CARD}`,
            }}
          >
            You&rsquo;re invited
          </div>

          <img
            alt=""
            src={svgUri(seal())}
            width={SEAL_PX}
            height={SEAL_PX}
            style={{
              position: "absolute",
              left: ENVELOPE_W / 2 - SEAL_PX / 2,
              top: tipY - SEAL_PX / 2,
            }}
          />
        </div>

        {/* A print of the two of them, laid against the envelope: the
            album's device, one photograph at its own proportions in a
            paper border. */}
        <div
          style={{
            position: "absolute",
            left: 748,
            top: 96,
            width: PHOTO_W + PRINT_BORDER * 2,
            height: PHOTO_H + PRINT_BORDER * 2,
            padding: PRINT_BORDER,
            display: "flex",
            backgroundColor: CARD,
            border: `1px solid ${HAIRLINE}`,
            transform: "rotate(5deg)",
            boxShadow: "0 14px 40px rgba(29, 38, 33, 0.26), 0 2px 5px rgba(29, 38, 33, 0.12)",
          }}
        >
          <img
            alt=""
            src={print}
            width={PHOTO_W}
            height={PHOTO_H}
            style={{ width: PHOTO_W, height: PHOTO_H, objectFit: "cover" }}
          />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Marcellus", data: marcellus, weight: 400, style: "normal" }],
    },
  );
}
