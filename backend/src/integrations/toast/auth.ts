import axios from "axios";
import { ToastCredentials } from "./config";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const tokenCache = new Map<string, CachedToken>();

/**
 * Toast's Standard/Partner API auth: OAuth2 client-credentials exchange
 * against POST {hostname}/authentication/v1/authentication/login with
 * { clientId, clientSecret, userAccessType: "TOAST_MACHINE_CLIENT" },
 * returning a bearer token in body.token.accessToken (expiresIn seconds).
 * See ./README.md for how to obtain clientId/clientSecret and what access
 * tier they require — verify against https://doc.toasttab.com before going
 * live, as Toast can change endpoint paths/response shapes between API
 * versions.
 */
export async function getAccessToken(creds: ToastCredentials): Promise<string> {
  const cacheKey = `${creds.hostname}:${creds.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const response = await axios.post(
    `https://${creds.hostname}/authentication/v1/authentication/login`,
    {
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      userAccessType: "TOAST_MACHINE_CLIENT",
    },
    { headers: { "Content-Type": "application/json" }, timeout: 15_000 }
  );

  const accessToken: string | undefined = response.data?.token?.accessToken;
  const expiresIn: number = response.data?.token?.expiresIn ?? 3600;
  if (!accessToken) {
    throw new Error("Toast authentication response did not contain an access token");
  }

  tokenCache.set(cacheKey, { accessToken, expiresAt: Date.now() + expiresIn * 1000 });
  return accessToken;
}

export function clearTokenCache(): void {
  tokenCache.clear();
}
