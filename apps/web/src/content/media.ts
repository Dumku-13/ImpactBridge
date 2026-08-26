/**
 * Typed access to the art-directed media library.
 *
 * Everything here is produced by `scripts/build-media.mjs` from the source
 * frame folders (which are gitignored — see the plan). Components address media
 * by ROLE, never by file path, so replacing a photograph later is an edit to
 * this file and nothing else.
 *
 * `maxWidth` is the real pixel width of the asset. It is recorded because the
 * library has a wide resolution spread — 1600px down to 414px — and a small
 * asset rendered full-bleed looks broken. Layouts consult this rather than
 * assuming every image can go large.
 */

const BASE = "/media";

export interface MediaAsset {
  src: string;
  alt: string;
  maxWidth: number;
  /** `object-position`, for when a replacement image crops differently. */
  focalPoint?: string;
}

/** The scroll-scrubbed hero sequence. */
export const heroSequence = {
  count: 100,
  width: 1126,
  height: 648,
  frame: (i: number) => `${BASE}/hero/frame-${String(i).padStart(4, "0")}.jpg`,
  poster: `${BASE}/stills/hero-poster.jpg`,
  alt: "A community health worker walking through a village, carrying records",
} as const;

/**
 * Muted ambient loops — motion layers, never embedded clips.
 *
 * These run full-bleed behind typography at low opacity. MP4 only: H.264 is
 * universally supported, and the VP9 siblings measurably lost quality at the
 * CRF needed to hit the size budget.
 */
export const loops = {
  water: `${BASE}/water-loop.mp4`,
  tree: `${BASE}/tree-loop.mp4`,
  texture: `${BASE}/texture-loop.mp4`,
  people: `${BASE}/people-loop.mp4`,
  community: `${BASE}/community-loop.mp4`,
} as const;

/** First-frame stills, so a <video> shows something before it buffers. */
export const posters = {
  water: `${BASE}/posters/water.jpg`,
  tree: `${BASE}/posters/tree.jpg`,
  texture: `${BASE}/posters/texture.jpg`,
  people: `${BASE}/posters/people.jpg`,
  community: `${BASE}/posters/community.jpg`,
} as const;

const still = (
  file: string,
  alt: string,
  maxWidth: number,
  focalPoint?: string,
): MediaAsset => ({ src: `${BASE}/stills/${file}`, alt, maxWidth, focalPoint });

/**
 * Cause imagery. Note the resolution spread — education and disaster relief can
 * carry a large panel; animals and environment cannot. The layout leans into
 * that rather than forcing a six-up grid of equals, which is also the more
 * interesting composition.
 */
export const causes = {
  education: still("cause-education.jpg", "A teacher leading an open-air class", 1024),
  healthcare: still("cause-healthcare.jpg", "A health worker attending to a patient", 612),
  womenEmpowerment: still("cause-women-empowerment.jpg", "Women meeting as a collective", 600),
  environment: still("cause-environment.jpg", "Restored land under cultivation", 533),
  animals: still("cause-animals.jpg", "Veterinary care for working animals", 480),
  disasterRelief: still("cause-disaster-relief.jpg", "Relief supplies reaching a village", 959),
} as const;

/** Large-format imagery for editorial moments. All ≥1000px. */
export const editorial = {
  ngoChildren: still("ngo-children.jpg", "Children in a classroom", 1600),
  ngoCommunity: still("ngo-community.jpg", "Fieldworkers meeting a community", 1200),
  children: still("children.jpg", "Children at a learning centre", 1024),
  forestRestoration: still("forest-restoration.jpg", "Replanted forest", 1080),
  closeup: still("detail-closeup.jpg", "Hands at work", 1536),
} as const;

/** Small texture and detail shots — insets and accents only, never full-bleed. */
export const details = {
  classroomDesk: still("detail-classroom-desk.jpg", "A school desk and exercise book", 500),
  documents: still("detail-documents.jpg", "Verification paperwork", 554),
  fabric: still("detail-fabric.jpg", "Hand-woven fabric", 678),
  maps: still("detail-maps.jpg", "A field map", 700),
  building: still("texture-building.jpg", "Weathered wall texture", 414),
  forestRestoration2: still("forest-restoration-2.jpg", "Saplings", 640),
} as const;

/**
 * Six impact stories, each shot as wide + portrait + detail.
 *
 * IMPORTANT: these were sliced from a contact sheet, so they are small —
 * wide ≈489px, portrait ≈222px, detail ≈265px. They must never be rendered
 * full-bleed; at column scale they are sharp, and beyond roughly 480px CSS
 * width they visibly soften. The section is designed around that limit.
 */
export interface ImpactStory {
  id: string;
  wide: string;
  portrait: string;
  detail: string;
}

export const storyMaxWidth = { wide: 489, portrait: 222, detail: 265 } as const;

export const impactStories: ImpactStory[] = Array.from({ length: 6 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    id: `story-${n}`,
    wide: `${BASE}/stories/story-${n}-wide.jpg`,
    portrait: `${BASE}/stories/story-${n}-portrait.jpg`,
    detail: `${BASE}/stories/story-${n}-detail.jpg`,
  };
});
