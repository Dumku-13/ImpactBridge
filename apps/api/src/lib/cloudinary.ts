import { v2 as cloudinary } from "cloudinary";
import { env, isCloudinaryConfigured } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";

/**
 * Cloudinary client for NGO media.
 *
 * Configured lazily so the server still starts (and everything else still
 * works) with no Cloudinary account; upload endpoints then fail with a clear
 * 503 instead of a confusing crash.
 */
let configured = false;

function getClient() {
  if (!isCloudinaryConfigured) {
    throw new HttpError(
      503,
      "File uploads are not available — Cloudinary has not been configured on this server.",
    );
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }

  return cloudinary;
}

export interface UploadedAsset {
  url: string;
  publicId: string;
  bytes: number;
  format: string | null;
  resourceType: string;
}

/**
 * Upload a buffer to Cloudinary.
 *
 * Everything lands under `impactbridge/<folder>/` so a shared Cloudinary
 * account stays navigable and a whole folder can be purged at once.
 */
export function uploadBuffer(
  buffer: Buffer,
  folder: string,
  /** `auto` lets Cloudinary decide between image and raw (PDFs, etc.). */
  resourceType: "image" | "auto" = "auto",
): Promise<UploadedAsset> {
  const client = getClient();

  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: `impactbridge/${folder}`,
        resource_type: resourceType,
        // Strip any embedded scripts/metadata Cloudinary can detect.
        invalidate: true,
      },
      (error, result) => {
        if (error || !result) {
          return reject(
            new HttpError(502, error?.message ?? "Upload to Cloudinary failed"),
          );
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
          format: result.format ?? null,
          resourceType: result.resource_type,
        });
      },
    );

    stream.end(buffer);
  });
}

/**
 * Delete an asset. Never throws — a failed remote delete must not stop us
 * removing the database row, or the user is stuck with an undeletable record.
 * The worst case is an orphaned file, which is recoverable; a stuck row is not.
 */
export async function deleteAsset(
  publicId: string,
  resourceType = "image",
): Promise<void> {
  try {
    await getClient().uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  } catch (err) {
    console.error(`[cloudinary] failed to delete ${publicId}:`, err);
  }
}
