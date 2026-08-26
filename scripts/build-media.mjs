#!/usr/bin/env node
/**
 * build-media.mjs
 *
 * ImpactBridge web-media optimisation pipeline.
 *
 * Reads the raw frame-sequence / reference-image folders at the project root
 * (STRICTLY READ-ONLY — never written to) and produces optimised, web-ready
 * media into apps/web/public/media/.
 *
 * Usage:
 *   node scripts/build-media.mjs           # idempotent — skips work whose
 *                                           # output already exists
 *   node scripts/build-media.mjs --force   # rebuild everything
 *
 * Requires ffmpeg + ffprobe on PATH.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SRC = {
  hero: path.join(ROOT, 'hero video frames'),
  water: path.join(ROOT, 'water video franmmes'),
  tree: path.join(ROOT, 'tree movin gion bg'),
  construction: path.join(ROOT, 'construction video frames'),
  pictures: path.join(ROOT, 'pictures for reference and use for frontend'),
};
SRC.contactSheet = path.join(SRC.pictures, 'imapct stories.png');

const MEDIA_DIR = path.join(ROOT, 'apps', 'web', 'public', 'media');
const OUT = {
  hero: path.join(MEDIA_DIR, 'hero'),
  stories: path.join(MEDIA_DIR, 'stories'),
  stills: path.join(MEDIA_DIR, 'stills'),
  posters: path.join(MEDIA_DIR, 'posters'),
};

const FORCE = process.argv.includes('--force');

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function section(title) {
  console.log(`\n=== ${title} ===`);
}
function log(msg) {
  console.log(msg);
}
function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}
function fileSize(p) {
  return statSync(p).size;
}
function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ffmpeg(args) {
  const res = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed (exit ${res.status}):\n${res.stderr || res.stdout}`);
  }
  return res;
}

function ffprobeDims(file) {
  const res = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) {
    throw new Error(`ffprobe failed for ${file}: ${res.stderr}`);
  }
  const [width, height] = res.stdout.trim().split(',').map(Number);
  return { width, height };
}

function ffprobeDuration(file) {
  const res = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) {
    throw new Error(`ffprobe failed for ${file}: ${res.stderr}`);
  }
  return parseFloat(res.stdout.trim());
}

// Shared watermark crops, each verified visually against a specific frame
// (see call sites below for which frame). Hoisted here so every consumer of
// a given source folder — the hero still sequence AND the people-loop video
// both read `hero video frames/`; texture-loop AND community-loop both read
// `construction video frames/` — applies the exact same crop.
const HERO_SPARKLE_CROP = 'crop=iw*0.88:ih*0.90:0:0';
const CONSTRUCTION_LOGO_CROP = 'crop=iw*0.75:ih*0.80:0:0';

// Map a 0-100 "JPEG-style" quality to ffmpeg's mjpeg qscale (2=best .. 31=worst).
function qscaleFromQuality(q) {
  return Math.min(31, Math.max(2, Math.round(31 - (q / 100) * 29)));
}

function relToMedia(p) {
  return path.relative(MEDIA_DIR, p).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// A. Hero scroll sequence
// ---------------------------------------------------------------------------

function buildHero() {
  section('A. Hero scroll sequence');
  ensureDir(OUT.hero);

  const SRC_COUNT = 161;
  const TARGET_COUNT = 100;
  // Verified visually (frame_120.jpg): crop=iw*0.88:ih*0.90 fully removes the
  // bottom-right sparkle watermark while keeping the subject's feet and the
  // path in frame. The originally-suggested 0.92/0.90 crop left a faint
  // remnant of the sparkle, so the width crop was tightened to 0.88.
  const CROP = HERO_SPARKLE_CROP;
  /*
   * Ceiling, not a target. The source frames are 1280x720, so after the crop
   * only 1126x648 of real detail survives — scaling past that invents pixels,
   * costs bytes, and softens the one image the whole homepage rests on. The
   * `min(WIDTH,iw)` in the filter below clamps to whatever the source actually
   * has, exactly as the ambient-loop encoder already does.
   */
  const WIDTH = 1600;
  const MAX_AVG_BYTES = 35 * 1024;

  const existing = existsSync(OUT.hero) ? readdirSync(OUT.hero).filter((f) => f.endsWith('.jpg')) : [];
  if (!FORCE && existing.length === TARGET_COUNT) {
    log(`Already built (${TARGET_COUNT} frames) — skipping (use --force to rebuild).`);
    return summarizeHero();
  }

  // Evenly-spaced decimation, always keeping first (1) and last (SRC_COUNT).
  const indices = [];
  for (let i = 0; i < TARGET_COUNT; i++) {
    indices.push(Math.round(1 + (i * (SRC_COUNT - 1)) / (TARGET_COUNT - 1)));
  }

  function renderAll(quality, width) {
    const qscale = qscaleFromQuality(quality);
    for (let i = 0; i < indices.length; i++) {
      const srcFile = path.join(SRC.hero, `frame_${String(indices[i]).padStart(3, '0')}.jpg`);
      const outFile = path.join(OUT.hero, `frame-${String(i + 1).padStart(4, '0')}.jpg`);
      ffmpeg(['-i', srcFile, '-vf', `${CROP},scale='min(${width},iw)':-2`, '-q:v', String(qscale), outFile]);
    }
  }

  function measure() {
    const files = readdirSync(OUT.hero).filter((f) => f.endsWith('.jpg'));
    const totalBytes = files.reduce((s, f) => s + fileSize(path.join(OUT.hero, f)), 0);
    return { files, totalBytes, avg: totalBytes / files.length };
  }

  let quality = 72;
  let width = WIDTH;
  log(`Rendering ${TARGET_COUNT} frames (decimated from ${SRC_COUNT}), crop + scale to ${width}px wide, quality ${quality}...`);
  renderAll(quality, width);
  let { files, totalBytes, avg } = measure();

  // Phase 1: lower JPEG quality (ffmpeg's mjpeg encoder tops out at qscale 31,
  // i.e. "quality" 0 in our 0-100 mapping — that's the floor for this lever).
  let attempts = 0;
  while (avg > MAX_AVG_BYTES && quality > 0 && attempts < 10) {
    quality = Math.max(0, quality - 8);
    log(`Average frame size ${kb(avg)} exceeds ${kb(MAX_AVG_BYTES)} target — lowering quality to ${quality} and re-encoding...`);
    renderAll(quality, width);
    ({ files, totalBytes, avg } = measure());
    attempts++;
  }

  // Phase 2: JPEG quality is maxed out (qscale 31) but still over budget —
  // trim the output width in small steps until the average fits.
  attempts = 0;
  while (avg > MAX_AVG_BYTES && width > 1000 && attempts < 10) {
    width -= 50;
    log(`Still over budget at max compression — reducing width to ${width}px and re-encoding...`);
    renderAll(quality, width);
    ({ files, totalBytes, avg } = measure());
    attempts++;
  }

  log(`Done: ${files.length} frames, average ${kb(avg)}/frame, total ${mb(totalBytes)}, final quality ${quality}, width ${width}px.`);
  return summarizeHero();
}

function summarizeHero() {
  const files = readdirSync(OUT.hero).filter((f) => f.endsWith('.jpg')).sort();
  const totalBytes = files.reduce((s, f) => s + fileSize(path.join(OUT.hero, f)), 0);
  const { width, height } = files.length ? ffprobeDims(path.join(OUT.hero, files[0])) : { width: 0, height: 0 };
  return {
    count: files.length,
    width,
    height,
    pathPattern: 'hero/frame-%04d.jpg',
    totalBytes,
  };
}

// ---------------------------------------------------------------------------
// B. Ambient loops
// ---------------------------------------------------------------------------

function buildLoop({
  name,
  srcDir,
  frameCount,
  startNumber = 1,
  cropFilter = null,
  fps = 25,
  maxWidth = 1920,
  targetBytesMp4,
  targetBytesWebm,
  // Source footage that translates or evolves in one direction (a walk
  // toward camera, a construction time-lapse) has no frame that matches the
  // first frame, so a straight loop cuts. Ping-pong plays the processed
  // clip forward then backward — by construction the two halves always meet
  // exactly at both the turnaround and the wrap, regardless of how much the
  // scene itself changes. The 1-frame trim on each end of the reversed half
  // drops the frames that would otherwise be held twice (once as the last
  // forward frame / next cycle's first frame, once again reversed).
  pingPong = false,
}) {
  section(`B. Ambient loop: ${name}`);
  ensureDir(MEDIA_DIR);

  const mp4Out = path.join(MEDIA_DIR, `${name}.mp4`);
  const webmOut = path.join(MEDIA_DIR, `${name}.webm`);

  if (!FORCE && existsSync(mp4Out) && existsSync(webmOut)) {
    log(`Already built — skipping (use --force to rebuild).`);
    return {
      mp4: relToMedia(mp4Out),
      webm: relToMedia(webmOut),
      bytes: { mp4: fileSize(mp4Out), webm: fileSize(webmOut) },
    };
  }

  // `trim` bounds the read to exactly `frameCount` frames INSIDE the filter
  // graph. This used to be done with the output option `-frames:v` in
  // inputArgs(), which works for a 1-in/1-out chain but is a trap for the
  // ping-pong path below: -frames:v caps frames WRITTEN to the final output,
  // so it silently truncated the concatenated forward+reverse stream back
  // down to just `frameCount` frames, discarding the entire reversed half.
  // Bounding inside the graph instead makes both paths correct uniformly.
  function buildVf(width) {
    const parts = [`trim=start_frame=0:end_frame=${frameCount}`, 'setpts=PTS-STARTPTS'];
    if (cropFilter) parts.push(cropFilter);
    parts.push(`scale='min(${width},iw)':-2`);
    parts.push(`fps=${fps}`);
    return parts.join(',');
  }

  function inputArgs() {
    return ['-start_number', String(startNumber), '-framerate', String(fps), '-i', path.join(srcDir, 'frame_%03d.jpg')];
  }

  // Plain path: one linear filter chain via -vf. Ping-pong path: crop/scale/fps
  // run once into [proc], which is split into an untouched forward copy and a
  // reversed-and-trimmed copy, then concatenated — see the pingPong doc
  // comment above for why the trim bounds are frame 1..frameCount-2.
  function filterArgs(width) {
    if (!pingPong) {
      return ['-vf', buildVf(width)];
    }
    const lastFrameIdx = frameCount - 1;
    const graph =
      `[0:v]${buildVf(width)}[proc];` +
      `[proc]split=2[fwd][rev0];` +
      `[rev0]reverse,trim=start_frame=1:end_frame=${lastFrameIdx},setpts=PTS-STARTPTS[rev];` +
      `[fwd][rev]concat=n=2:v=1:a=0[out]`;
    return ['-filter_complex', graph, '-map', '[out]'];
  }

  function encodeMp4(crf, width) {
    ffmpeg([
      ...inputArgs(),
      ...filterArgs(width),
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-an',
      mp4Out,
    ]);
  }

  function encodeWebm(crf, width) {
    ffmpeg([
      ...inputArgs(),
      ...filterArgs(width),
      '-c:v', 'libvpx-vp9',
      '-b:v', '0',
      '-crf', String(crf),
      '-row-mt', '1',
      '-cpu-used', '4',
      '-pix_fmt', 'yuv420p',
      '-an',
      webmOut,
    ]);
  }

  const outputFrameCount = pingPong ? frameCount + (frameCount - 2) : frameCount;
  log(
    `Encoding ${frameCount} source frames @ ${fps}fps (source frames ${startNumber}..${startNumber + frameCount - 1})` +
      (pingPong ? `, ping-pong -> ${outputFrameCount} output frames (~${(outputFrameCount / fps).toFixed(1)}s loop)...` : '...')
  );

  // Two-phase budget search, shared by both codecs:
  //   Phase 1: raise CRF (lower quality) up to the codec's practical ceiling.
  //   Phase 2: if even worst-quality CRF doesn't fit, this is very
  //            high-frequency source content (e.g. leaves/water detail) —
  //            step the output width down and re-run the CRF search.
  function encodeWithBudget({ label, encode, outFile, targetBytes, crfStart, crfStep, crfMax }) {
    let width = maxWidth;
    let crf = crfStart;
    encode(crf, width);
    let size = fileSize(outFile);

    for (let tries = 0; size > targetBytes && crf < crfMax && tries < 8; tries++) {
      crf = Math.min(crfMax, crf + crfStep);
      log(`  ${label} ${mb(size)} over ${mb(targetBytes)} target — raising CRF to ${crf} and re-encoding...`);
      encode(crf, width);
      size = fileSize(outFile);
    }

    for (let tries = 0; size > targetBytes && width > 480 && tries < 8; tries++) {
      width = Math.round(width * 0.8);
      log(`  ${label} still over budget at max CRF (${crf}) — reducing width to ${width}px and re-encoding...`);
      encode(crf, width);
      size = fileSize(outFile);
    }

    return { size, crf, width };
  }

  const mp4Result = encodeWithBudget({
    label: 'mp4',
    encode: encodeMp4,
    outFile: mp4Out,
    targetBytes: targetBytesMp4,
    crfStart: 28,
    crfStep: 3,
    crfMax: 51,
  });
  const sizeMp4 = mp4Result.size;

  const webmResult = encodeWithBudget({
    label: 'webm',
    encode: encodeWebm,
    outFile: webmOut,
    targetBytes: targetBytesWebm,
    crfStart: 32,
    crfStep: 4,
    crfMax: 63,
  });
  const sizeWebm = webmResult.size;

  log(
    `Done: ${name}.mp4 = ${mb(sizeMp4)} (crf ${mp4Result.crf}, ${mp4Result.width}px), ` +
      `${name}.webm = ${mb(sizeWebm)} (crf ${webmResult.crf}, ${webmResult.width}px)`
  );

  return {
    mp4: relToMedia(mp4Out),
    webm: relToMedia(webmOut),
    bytes: { mp4: sizeMp4, webm: sizeWebm },
  };
}

// ---------------------------------------------------------------------------
// C. Impact-stories contact sheet
// ---------------------------------------------------------------------------

function darkRun(getVal, start, end, thresh, minLen = 1) {
  let curStart = -1;
  for (let i = start; i <= end; i++) {
    const dark = getVal(i) < thresh;
    if (dark) {
      if (curStart === -1) curStart = i;
    } else if (curStart !== -1) {
      if (i - curStart >= minLen) return [curStart, i - 1];
      curStart = -1;
    }
  }
  if (curStart !== -1 && end - curStart + 1 >= minLen) return [curStart, end];
  return null;
}

function findBrightStart(getVal, from, to, brightThresh) {
  for (let y = from; y <= to; y++) {
    if (getVal(y) > brightThresh) return y;
  }
  return null;
}

/**
 * Determine the pixel geometry of the 3x2 contact sheet by scanning raw
 * grayscale pixel data for near-black gutter rows/columns, rather than
 * hardcoding coordinates. Returns 6 blocks, each with wide/portrait/detail
 * pixel rects (caption text strips and gutters excluded).
 */
function detectStoryGeometry() {
  const { width: W, height: H } = ffprobeDims(SRC.contactSheet);

  const rawPath = path.join(os.tmpdir(), `impactbridge-contact-sheet-${process.pid}.gray`);
  ffmpeg(['-i', SRC.contactSheet, '-f', 'rawvideo', '-pix_fmt', 'gray', rawPath]);
  const buf = readFileSync(rawPath);
  rmSync(rawPath, { force: true });

  const colAvg = (x, y0, y1) => {
    let s = 0;
    for (let y = y0; y <= y1; y++) s += buf[y * W + x];
    return s / (y1 - y0 + 1);
  };
  const rowAvg = (y, x0 = 0, x1 = W - 1) => {
    let s = 0;
    for (let x = x0; x <= x1; x++) s += buf[y * W + x];
    return s / (x1 - x0 + 1);
  };

  // --- 3 column blocks: full-height scan for border/gutter columns ---
  const colVals = [];
  for (let x = 0; x < W; x++) colVals.push(colAvg(x, 0, H - 1));
  const colDarkRuns = [];
  {
    let start = -1;
    for (let x = 0; x < W; x++) {
      if (colVals[x] < 20) {
        if (start === -1) start = x;
      } else if (start !== -1) {
        colDarkRuns.push([start, x - 1]);
        start = -1;
      }
    }
    if (start !== -1) colDarkRuns.push([start, W - 1]);
  }
  if (colDarkRuns.length !== 4) {
    throw new Error(`Expected 4 dark column runs (border+2 gutters+border), found ${colDarkRuns.length}: ${JSON.stringify(colDarkRuns)}`);
  }
  const colBlocks = [
    [colDarkRuns[0][1] + 1, colDarkRuns[1][0] - 1],
    [colDarkRuns[1][1] + 1, colDarkRuns[2][0] - 1],
    [colDarkRuns[2][1] + 1, colDarkRuns[3][0] - 1],
  ];

  // --- 2 row blocks: derive top-of-wide-image y for each row ---
  const rowVal = (y) => rowAvg(y);
  const topBorder = darkRun(rowVal, 0, H - 1, 20, 1);
  const rowTop = [topBorder[1] + 1];

  const blocks = [];
  for (let r = 0; r < 2; r++) {
    const wideY0 = rowTop[r];
    const thin = darkRun(rowVal, wideY0 + 100, wideY0 + 350, 15, 1);
    const wideY1 = thin[0] - 1;
    const pdY0 = thin[1] + 1;

    const below = darkRun(rowVal, pdY0 + 50, pdY0 + 300, 15, 3);
    const pdY1 = below[0] - 1;

    if (r === 0) {
      const nextTop = findBrightStart(rowVal, below[1] + 1, below[1] + 200, 50);
      if (nextTop == null) throw new Error('Could not locate start of row 2 in contact sheet.');
      rowTop.push(nextTop);
    }

    for (let c = 0; c < 3; c++) {
      const [colX0, colX1] = colBlocks[c];
      const internal = darkRun((x) => colAvg(x, pdY0, pdY1), colX0 + 10, colX1 - 10, 15, 1);
      if (!internal) throw new Error(`Could not find portrait/detail gutter for story ${r * 3 + c + 1}`);
      const portraitX1 = internal[0] - 1;
      const detailX0 = internal[1] + 1;

      blocks.push({
        story: r * 3 + c + 1,
        wide: { x0: colX0, y0: wideY0, x1: colX1, y1: wideY1 },
        portrait: { x0: colX0, y0: pdY0, x1: portraitX1, y1: pdY1 },
        detail: { x0: detailX0, y0: pdY0, x1: colX1, y1: pdY1 },
      });
    }
  }

  return { width: W, height: H, blocks };
}

function buildStories() {
  section('C. Impact-stories contact sheet');
  ensureDir(OUT.stories);

  const expected = [];
  for (let s = 1; s <= 6; s++) {
    for (const kind of ['wide', 'portrait', 'detail']) {
      expected.push(`story-${String(s).padStart(2, '0')}-${kind}.jpg`);
    }
  }
  if (!FORCE && expected.every((f) => existsSync(path.join(OUT.stories, f)))) {
    log('Already sliced — skipping (use --force to rebuild).');
    return summarizeStories(expected);
  }

  const geometry = detectStoryGeometry();
  log(`Contact sheet: ${geometry.width}x${geometry.height}. Detected geometry for ${geometry.blocks.length} story blocks:`);
  for (const b of geometry.blocks) {
    log(
      `  story-${String(b.story).padStart(2, '0')}: wide=[${b.wide.x0},${b.wide.y0}..${b.wide.x1},${b.wide.y1}] ` +
        `portrait=[${b.portrait.x0},${b.portrait.y0}..${b.portrait.x1},${b.portrait.y1}] ` +
        `detail=[${b.detail.x0},${b.detail.y0}..${b.detail.x1},${b.detail.y1}]`
    );
  }

  const qWide = qscaleFromQuality(80);
  for (const b of geometry.blocks) {
    const n = String(b.story).padStart(2, '0');
    exportRect(b.wide, path.join(OUT.stories, `story-${n}-wide.jpg`), 1600, qWide);
    exportRect(b.portrait, path.join(OUT.stories, `story-${n}-portrait.jpg`), 800, qWide);
    exportRect(b.detail, path.join(OUT.stories, `story-${n}-detail.jpg`), 800, qWide);
  }

  log(`Done: 18 story images written to ${relToMedia(OUT.stories)}/`);
  return summarizeStories(expected);
}

function exportRect(rect, outFile, maxWidth, qscale) {
  const w = rect.x1 - rect.x0 + 1;
  const h = rect.y1 - rect.y0 + 1;
  ffmpeg(['-i', SRC.contactSheet, '-vf', `crop=${w}:${h}:${rect.x0}:${rect.y0},scale='min(${maxWidth},iw)':-2`, '-q:v', String(qscale), outFile]);
}

function summarizeStories(files) {
  return files
    .filter((f) => existsSync(path.join(OUT.stories, f)))
    .map((f) => {
      const { width, height } = ffprobeDims(path.join(OUT.stories, f));
      return { file: f, width, height };
    });
}

// ---------------------------------------------------------------------------
// D. Stills
// ---------------------------------------------------------------------------

const STILLS_MAP = [
  ['hero image.png', 'hero-poster.jpg'],
  ['education.jpg', 'cause-education.jpg'],
  ['healthcare.jpg', 'cause-healthcare.jpg'],
  ['women emporvaremnt.jpg', 'cause-women-empowerment.jpg'],
  ['environment.webp', 'cause-environment.jpg'],
  ['veternary care.jpg', 'cause-animals.jpg'],
  ['disaster.webp', 'cause-disaster-relief.jpg'],
  ['children.jpg', 'children.jpg'],
  ['ngo childern.webp', 'ngo-children.jpg'],
  ['NGO workers interacting with a community.avif', 'ngo-community.jpg'],
  ['classroom desk.webp', 'detail-classroom-desk.jpg'],
  ['paper doccuments.jpg', 'detail-documents.jpg'],
  ['fabric.jpg', 'detail-fabric.jpg'],
  ['building texture.jpg', 'texture-building.jpg'],
  ['maps.jpg', 'detail-maps.jpg'],
  ['forest restroation.jpg', 'forest-restoration.jpg'],
  ['forest restoration 2.jpg', 'forest-restoration-2.jpg'],
  ['close up deatil pic.png', 'detail-closeup.jpg'],
];

function buildStills() {
  section('D. Stills');
  ensureDir(OUT.stills);

  const qscale = qscaleFromQuality(80);
  const results = [];
  const failures = [];

  for (const [srcName, outName] of STILLS_MAP) {
    const srcPath = path.join(SRC.pictures, srcName);
    const outPath = path.join(OUT.stills, outName);

    if (!existsSync(srcPath)) {
      log(`  SKIP "${srcName}": source file not found`);
      failures.push({ src: srcName, out: outName, reason: 'source not found' });
      continue;
    }

    if (!FORCE && existsSync(outPath)) {
      const { width, height } = ffprobeDims(outPath);
      results.push({ file: outName, width, height });
      log(`  ${outName}: already exists — skipping`);
      continue;
    }

    try {
      ffmpeg(['-i', srcPath, '-vf', `scale='min(1920,iw)':-2`, '-q:v', String(qscale), outPath]);
      const { width, height } = ffprobeDims(outPath);
      results.push({ file: outName, width, height });
      log(`  "${srcName}" -> ${outName} (${width}x${height}, ${kb(fileSize(outPath))})`);
    } catch (err) {
      log(`  FAILED "${srcName}" -> ${outName}: ${err.message.split('\n')[0]} — skipping.`);
      failures.push({ src: srcName, out: outName, reason: err.message.split('\n')[0] });
    }
  }

  /*
   * `close up deatil pic.png` is not one photograph — it is TWO butted together
   * with a hairline seam down the centre: a hand writing in an exercise book,
   * and hands planting a sapling. Rendered whole it reads as a layout bug, and
   * it shipped that way into an organisation's gallery captioned as a single
   * image. Split it here so both halves are usable on their own; the composite
   * is still written for anyone who wants it, but nothing should render it.
   */
  const composite = path.join(OUT.stills, 'detail-closeup.jpg');

  if (existsSync(composite)) {
    const { width, height } = ffprobeDims(composite);
    const half = Math.floor(width / 2) - 2;

    for (const [outName, x] of [
      ['detail-writing.jpg', 0],
      ['detail-planting.jpg', Math.ceil(width / 2) + 2],
    ]) {
      const outPath = path.join(OUT.stills, outName);

      if (!FORCE && existsSync(outPath)) {
        const dims = ffprobeDims(outPath);
        results.push({ file: outName, width: dims.width, height: dims.height });
        log(`  ${outName}: already exists — skipping`);
        continue;
      }

      try {
        ffmpeg(['-i', composite, '-vf', `crop=${half}:${height}:${x}:0`, '-q:v', String(qscale), outPath]);
        const dims = ffprobeDims(outPath);
        results.push({ file: outName, width: dims.width, height: dims.height });
        log(`  detail-closeup.jpg -> ${outName} (${dims.width}x${dims.height}, ${kb(fileSize(outPath))})`);
      } catch (err) {
        log(`  FAILED split -> ${outName}: ${err.message.split('
')[0]} — skipping.`);
        failures.push({ src: 'detail-closeup.jpg', out: outName, reason: err.message.split('
')[0] });
      }
    }
  }

  return { results, failures };
}

// ---------------------------------------------------------------------------
// E. Loop posters
// ---------------------------------------------------------------------------

// One representative still per ambient loop, pulled from the middle of the
// FINAL encoded .mp4 (not the source frames) so the poster matches exactly
// what the <video> element will show while it buffers — same crop, same
// color, same encode. `poster` attribute use, so JPEG at stills-grade quality.
const POSTERS_MAP = [
  ['water', 'water-loop.mp4'],
  ['tree', 'tree-loop.mp4'],
  ['texture', 'texture-loop.mp4'],
  ['people', 'people-loop.mp4'],
  ['community', 'community-loop.mp4'],
];

function buildPosters() {
  section('E. Loop posters');
  ensureDir(OUT.posters);

  const qscale = qscaleFromQuality(80);
  const results = [];
  const failures = [];

  for (const [name, loopFile] of POSTERS_MAP) {
    const srcVideo = path.join(MEDIA_DIR, loopFile);
    const outPath = path.join(OUT.posters, `${name}.jpg`);

    if (!existsSync(srcVideo)) {
      log(`  SKIP "${name}.jpg": ${loopFile} not built yet`);
      failures.push({ out: `${name}.jpg`, reason: `${loopFile} not found` });
      continue;
    }

    if (!FORCE && existsSync(outPath)) {
      const { width, height } = ffprobeDims(outPath);
      results.push({ file: `${name}.jpg`, width, height });
      log(`  ${name}.jpg: already exists — skipping`);
      continue;
    }

    try {
      const duration = ffprobeDuration(srcVideo);
      const midpoint = (duration / 2).toFixed(3);
      // Input-side -ss for fast seek; grab exactly one frame at the midpoint.
      ffmpeg(['-ss', midpoint, '-i', srcVideo, '-frames:v', '1', '-vf', `scale='min(1600,iw)':-2`, '-q:v', String(qscale), outPath]);
      const { width, height } = ffprobeDims(outPath);
      results.push({ file: `${name}.jpg`, width, height });
      log(`  "${loopFile}" @ ${midpoint}s -> ${name}.jpg (${width}x${height}, ${kb(fileSize(outPath))})`);
    } catch (err) {
      log(`  FAILED "${name}.jpg": ${err.message.split('\n')[0]} — skipping.`);
      failures.push({ out: `${name}.jpg`, reason: err.message.split('\n')[0] });
    }
  }

  return { results, failures };
}

// ---------------------------------------------------------------------------
// Manifest + .gitignore
// ---------------------------------------------------------------------------

function writeManifest({ hero, loops, stories, stills, posters }) {
  section('Manifest');
  const manifest = {
    generatedAt: new Date().toISOString(),
    hero: {
      count: hero.count,
      width: hero.width,
      height: hero.height,
      pathPattern: hero.pathPattern,
    },
    loops,
    stories,
    stills,
    posters,
  };
  const manifestPath = path.join(MEDIA_DIR, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log(`Wrote ${relToMedia(manifestPath)}`);
  return manifest;
}

function updateGitignore() {
  section('.gitignore');
  const gitignorePath = path.join(ROOT, '.gitignore');
  const marker = '# --- ImpactBridge: raw media source frames (local-only, never commit) ---';
  const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';

  if (content.includes(marker)) {
    log('Already present — skipping.');
    return;
  }

  const block = `
${marker}
# These folders hold the raw frame-sequence exports that
# scripts/build-media.mjs reads as INPUT. They are hundreds of MB, are the
# user's originals, and must never be committed. The pipeline OUTPUT
# (apps/web/public/media/) is intentionally NOT ignored — that IS committed.
construction video frames/
hero video frames/
ngo video/
tree movin gion bg/
water video franmmes/
lando norris reference website frames/
# --- end ImpactBridge raw media source frames ---
`;
  writeFileSync(gitignorePath, content + (content.endsWith('\n') || content === '' ? '' : '\n') + block);
  log(`Appended source-frame ignore block to ${path.relative(ROOT, gitignorePath)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('ImpactBridge media pipeline');
  console.log(`Root: ${ROOT}`);
  console.log(`Output: ${MEDIA_DIR}`);
  if (FORCE) console.log('(--force: rebuilding everything)');

  ensureDir(MEDIA_DIR);

  const hero = buildHero();

  const loops = {
    'water-loop': buildLoop({
      name: 'water-loop',
      srcDir: SRC.water,
      frameCount: 252,
      startNumber: 1,
      cropFilter: null,
      fps: 25,
      maxWidth: 1920,
      targetBytesMp4: 2 * 1024 * 1024,
      targetBytesWebm: 2 * 1024 * 1024,
    }),
    'tree-loop': buildLoop({
      name: 'tree-loop',
      srcDir: SRC.tree,
      frameCount: 155,
      startNumber: 1,
      cropFilter: null,
      fps: 25,
      maxWidth: 1920,
      targetBytesMp4: 2 * 1024 * 1024,
      targetBytesWebm: 2 * 1024 * 1024,
    }),
    'texture-loop': buildLoop({
      name: 'texture-loop',
      srcDir: SRC.construction,
      // Frames 1-~46 carry a full-frame "bigBLOCK construction" intro title
      // card + caption bar, and frames ~251-281 carry an outro URL bar +
      // wipe transition — neither is croppable without destroying the shot.
      // Frames 50-249 are clean footage with only the small persistent
      // bottom-right corner logo, which the crop below removes.
      frameCount: 200,
      startNumber: 50,
      // Verified visually (frame_140.jpg): crop=iw*0.75:ih*0.80 fully
      // removes the "bigBLOCK construction" corner watermark. Used only as
      // abstract texture, so the aggressive crop is acceptable.
      cropFilter: CONSTRUCTION_LOGO_CROP,
      fps: 25,
      maxWidth: 1920,
      targetBytesMp4: 1.5 * 1024 * 1024,
      targetBytesWebm: 1.5 * 1024 * 1024,
    }),
    // Full-bleed motion background behind large typography. Source frames
    // 1..161 show a woman walking steadily TOWARD camera (see frame_001.jpg
    // vs frame_161.jpg — she goes from small/distant to large/close and her
    // head turn changes too), so frame 161 -> frame 1 is a hard jump cut, not
    // a loop. Ping-pong (walk forward, then the same walk in reverse) is used
    // instead: the two halves meet exactly at both the turnaround and the
    // wrap because the reverse half is the literal reverse of the forward
    // half, regardless of how much the subject moves.
    'people-loop': buildLoop({
      name: 'people-loop',
      srcDir: SRC.hero,
      frameCount: 161,
      startNumber: 1,
      cropFilter: HERO_SPARKLE_CROP,
      fps: 25,
      maxWidth: 1920,
      pingPong: true,
      targetBytesMp4: 1.5 * 1024 * 1024,
      targetBytesWebm: 1.5 * 1024 * 1024,
    }),
    // Same clean-footage slice as texture-loop (frames 50-249; see the note
    // above frames 1-~46/251-281 are not usable). Abstract texture only —
    // full-bleed motion background behind large typography. This is actually
    // a construction TIME-LAPSE (frame_050.jpg: bare foundation in daylight;
    // frame_150.jpg: framed + wrapped mid-build; frame_249.jpg: finished
    // building under snow) — scene content changes dramatically throughout,
    // not just at the endpoints, so a straight loop would jump badly at
    // multiple points, not only the seam. Ping-pong sidesteps this
    // entirely: forward is "built", reverse is "un-built", and since reverse
    // is literally the same footage played backward, the join is seamless by
    // construction no matter how much the scene itself changes.
    'community-loop': buildLoop({
      name: 'community-loop',
      srcDir: SRC.construction,
      frameCount: 200,
      startNumber: 50,
      cropFilter: CONSTRUCTION_LOGO_CROP,
      fps: 25,
      maxWidth: 1920,
      pingPong: true,
      targetBytesMp4: 1.5 * 1024 * 1024,
      targetBytesWebm: 1.5 * 1024 * 1024,
    }),
  };

  const stories = buildStories();
  const { results: stills, failures: stillFailures } = buildStills();
  const { results: posters, failures: posterFailures } = buildPosters();

  const manifest = writeManifest({ hero, loops, stories, stills, posters });
  updateGitignore();

  section('Summary');
  log(`Hero: ${hero.count} frames, ${hero.width}x${hero.height}, ${mb(hero.totalBytes)} total`);
  for (const [name, info] of Object.entries(loops)) {
    log(`${name}: mp4 ${mb(info.bytes.mp4)}, webm ${mb(info.bytes.webm)}`);
  }
  log(`Stories: ${stories.length}/18 images`);
  log(`Stills: ${stills.length}/${STILLS_MAP.length} images`);
  if (stillFailures.length) {
    log(`Still failures/skips:`);
    for (const f of stillFailures) log(`  - "${f.src}" -> ${f.out}: ${f.reason}`);
  }
  log(`Posters: ${posters.length}/${POSTERS_MAP.length} images`);
  if (posterFailures.length) {
    log(`Poster failures/skips:`);
    for (const f of posterFailures) log(`  - ${f.out}: ${f.reason}`);
  }

  function dirSize(dir) {
    let total = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      total += entry.isDirectory() ? dirSize(p) : statSync(p).size;
    }
    return total;
  }
  log(`Total apps/web/public/media size: ${mb(dirSize(MEDIA_DIR))}`);
}

main();
