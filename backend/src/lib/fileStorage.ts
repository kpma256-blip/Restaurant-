import fs from "fs";
import path from "path";
import crypto from "crypto";

// Uploaded invoice/receipt PDFs are stored on local disk under this
// directory. NOTE for production: on an ephemeral host (e.g. Render's free
// plan) this directory does NOT persist across deploys/restarts — mount a
// persistent disk, or swap this module for S3-compatible object storage,
// before relying on it for real files. Same tradeoff already documented
// for the database in README.md, handled the same way: real working code
// now, a clear documented upgrade path for when it matters.
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? path.resolve(__dirname, "../../uploads");
const DRAFTS_DIR = path.join(UPLOADS_DIR, "receiving-drafts");
const RECEIVING_DIR = path.join(UPLOADS_DIR, "receiving");

for (const dir of [UPLOADS_DIR, DRAFTS_DIR, RECEIVING_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** Saves an uploaded file as an unconfirmed "draft" and returns an id to reference it with (see promoteDraft). */
export function saveDraft(buffer: Buffer, originalName: string): { draftId: string; storagePath: string } {
  const draftId = crypto.randomUUID();
  const ext = path.extname(originalName) || ".pdf";
  const storagePath = path.join("receiving-drafts", `${draftId}${ext}`);
  fs.writeFileSync(path.join(UPLOADS_DIR, storagePath), buffer);
  return { draftId, storagePath };
}

export function readStoredFile(storagePath: string): Buffer {
  return fs.readFileSync(path.join(UPLOADS_DIR, storagePath));
}

/** Moves a draft into permanent storage once its receiving is confirmed, scoped under the resulting Purchase's id. */
export function promoteDraft(draftStoragePath: string, purchaseId: string): string {
  const filename = path.basename(draftStoragePath);
  const permanentRelative = path.join("receiving", purchaseId, filename);
  const permanentAbsolute = path.join(UPLOADS_DIR, permanentRelative);
  fs.mkdirSync(path.dirname(permanentAbsolute), { recursive: true });
  fs.renameSync(path.join(UPLOADS_DIR, draftStoragePath), permanentAbsolute);
  return permanentRelative;
}

export function deleteStoredFile(storagePath: string): void {
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, storagePath));
  } catch {
    // already gone — fine
  }
}

/** Drafts nobody confirmed pile up (cancelled reviews); sweep anything older than 48h. Call once at server startup. */
export function cleanupStaleDrafts(maxAgeMs = 48 * 60 * 60 * 1000): void {
  let files: string[];
  try {
    files = fs.readdirSync(DRAFTS_DIR);
  } catch {
    return;
  }
  const now = Date.now();
  for (const file of files) {
    const full = path.join(DRAFTS_DIR, file);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(full);
    } catch {
      // ignore races with a concurrent promote/delete
    }
  }
}
