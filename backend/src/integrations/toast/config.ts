import crypto from "crypto";
import { prisma } from "../../lib/prisma";

const ALGO = "aes-256-gcm";

function encryptionKey(): Buffer {
  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be set to a 32-byte hex string (64 chars) — see backend/.env.example"
    );
  }
  return Buffer.from(hex, "hex");
}

/** Encrypts a secret for at-rest storage (ToastConnection.encryptedClientSecret). Never store plaintext. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(".");
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

export interface ToastCredentials {
  environment: string;
  hostname: string;
  clientId: string;
  clientSecret: string;
  restaurantGuid: string;
}

/**
 * Resolves live Toast credentials to use for API calls: the ToastConnection
 * row (set via the Toast Integration page) takes precedence, falling back
 * to environment variables for headless/CI setups. Returns null when the
 * integration isn't configured yet — callers must treat that as
 * "disconnected", never silently proceed.
 */
export async function getToastCredentials(): Promise<ToastCredentials | null> {
  const connection = await prisma.toastConnection.findFirst({ orderBy: { createdAt: "desc" } });

  const environment = connection?.environment ?? process.env.TOAST_ENVIRONMENT ?? "sandbox";
  const hostname =
    process.env.TOAST_API_HOSTNAME ?? (environment === "production" ? "ws-api.toasttab.com" : "ws-api.eng.toasttab.com");
  const clientId = connection?.clientId ?? process.env.TOAST_CLIENT_ID ?? "";
  const restaurantGuid = connection?.restaurantGuid ?? process.env.TOAST_RESTAURANT_GUID ?? "";

  let clientSecret = process.env.TOAST_CLIENT_SECRET ?? "";
  if (connection?.encryptedClientSecret) {
    try {
      clientSecret = decryptSecret(connection.encryptedClientSecret);
    } catch {
      clientSecret = "";
    }
  }

  if (!clientId || !clientSecret || !restaurantGuid) return null;
  return { environment, hostname, clientId, clientSecret, restaurantGuid };
}

export async function isToastConnected(): Promise<boolean> {
  const creds = await getToastCredentials();
  return creds != null;
}
