import { HttpError } from "../middleware/errorHandler.js";

/**
 * Identify a file from its leading bytes, and check that against what the
 * uploader CLAIMED it was.
 *
 * ── Why the declared type is not enough ──────────────────────────────────────
 *
 * The `Content-Type` on a multipart part is written by the client. It is a
 * label, not a fact: `curl -F "file=@shell.php;type=image/png"` sends a PHP
 * script that every MIME check in the world will call a PNG. Anything that
 * decides what to do with a file based on that label alone — store it, serve
 * it, hand it to an image processor — is trusting the attacker's word for it.
 *
 * The first few bytes of a file are chosen by whatever WROTE it, and every
 * format we accept starts with a fixed, documented signature. Comparing the two
 * turns "they said it was a PNG" into "it is a PNG, and they said so too".
 *
 * This runs before the buffer is handed to Cloudinary. That ordering is the
 * point: a payload we would refuse should never reach a third-party service,
 * get a public URL, or occupy storage on the shared account.
 */

/** The formats this platform accepts anywhere. */
export type FileFormat = "png" | "jpeg" | "webp" | "pdf";

/**
 * Declared MIME types we allow, and the format each one asserts.
 *
 * `image/jpg` is not a registered MIME type, but enough phone cameras and
 * upload widgets send it that refusing it would read to the user as "your photo
 * is broken". It has to prove itself with real JPEG bytes either way.
 */
const MIME_TO_FORMAT: Record<string, FileFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Declared types allowed where only a picture makes sense. */
export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

/** Declared types allowed for legal paperwork: a PDF, or a scan of one. */
export const DOCUMENT_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
] as const;

/** Human wording for a rejection, so the user knows what to upload instead. */
const FORMAT_LABELS: Record<FileFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
  pdf: "PDF",
};

/**
 * Read the format out of a buffer's magic number, or null if it is none of the
 * four we accept.
 *
 * Signatures are matched at offset 0. Several formats tolerate leading junk in
 * practice (a PDF reader will hunt for `%PDF-` within the first kilobyte), but
 * accepting that here would let a file be BOTH a valid PDF and a valid
 * something-else depending on who parses it — the polyglot trick that defeats
 * signature checks. Strict offsets remove the ambiguity.
 */
export function sniffFormat(buffer: Buffer): FileFormat | null {
  if (buffer.length < 12) return null;

  // 89 50 4E 47 0D 0A 1A 0A — the full 8-byte PNG signature. The trailing
  // CR/LF/EOF bytes exist to catch corruption by naive FTP transfers, and
  // checking all eight costs nothing.
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // FF D8 FF — start-of-image plus the first marker. The fourth byte varies by
  // JPEG flavour (JFIF, Exif, raw), so it is deliberately not checked.
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // RIFF....WEBP — a RIFF container whose 4-byte form type is "WEBP". Bytes
  // 4–7 are the file length and are skipped on purpose.
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  // %PDF-
  if (buffer.toString("ascii", 0, 5) === "%PDF-") {
    return "pdf";
  }

  return null;
}

/**
 * Reject an upload whose bytes disagree with its declared type.
 *
 * Throws HttpError(400) so it lands on the normal error path and the user gets
 * a clean, explanatory response — never a stack trace or a 500.
 */
export function assertDeclaredTypeMatchesBytes(file: {
  buffer: Buffer;
  mimetype: string;
}): FileFormat {
  const declared = MIME_TO_FORMAT[file.mimetype.toLowerCase()];

  /*
   * Unreachable when a multer fileFilter has already run, but this function is
   * the last gate before Cloudinary and must not depend on a caller elsewhere
   * having been wired up correctly.
   */
  if (!declared) {
    throw new HttpError(400, "That file type is not accepted.");
  }

  const actual = sniffFormat(file.buffer);

  if (actual === null) {
    throw new HttpError(
      400,
      "That file is not a PNG, JPEG, WebP or PDF. It may be corrupted, or saved in another format.",
    );
  }

  if (actual !== declared) {
    /*
     * The mismatch itself is the finding — an ordinary user renaming .jpeg to
     * .png does not produce this, because browsers set the type from the bytes,
     * not the extension. Worth a log line, without echoing the mismatch back to
     * whoever sent it.
     */
    console.warn(
      `[upload] rejected: declared ${file.mimetype} but bytes are ${actual}`,
    );

    throw new HttpError(
      400,
      `That file is actually a ${FORMAT_LABELS[actual]}, not a ${FORMAT_LABELS[declared]}. Re-save it and try again.`,
    );
  }

  return actual;
}
