import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { getToastCredentials, ToastCredentials } from "./config";
import { getAccessToken } from "./auth";

export class ToastNotConnectedError extends Error {
  constructor() {
    super("Toast is not connected. Add valid credentials on the Toast Integration page first.");
  }
}

export class ToastApiError extends Error {
  constructor(message: string, public status?: number, public data?: unknown) {
    super(message);
  }
}

/** Simple in-process token-bucket limiter. Toast's Partner tier documents a
 *  rate limit around 20-40 req/s depending on endpoint/tier; we default
 *  conservatively and make it configurable. */
class RateLimiter {
  private tokens: number;
  private readonly max: number;
  private lastRefill = Date.now();

  constructor(private readonly perSecond: number) {
    this.max = perSecond;
    this.tokens = perSecond;
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const elapsed = (now - this.lastRefill) / 1000;
      if (elapsed > 0) {
        this.tokens = Math.min(this.max, this.tokens + elapsed * this.perSecond);
        this.lastRefill = now;
      }
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

const limiter = new RateLimiter(Number(process.env.TOAST_MAX_REQUESTS_PER_SECOND ?? 5));

const MAX_RETRIES = 3;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Makes one authenticated, rate-limited, retried request against the Toast
 * API. Every route/service in the app that needs Toast data should go
 * through this — never call axios directly against a toasttab.com host
 * elsewhere in the codebase.
 */
export async function toastRequest<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  const creds = await getToastCredentials();
  if (!creds) throw new ToastNotConnectedError();
  return toastRequestWithCreds<T>(config, creds);
}

export async function toastRequestWithCreds<T = unknown>(
  config: AxiosRequestConfig,
  creds: ToastCredentials
): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt++;
    await limiter.acquire();
    const token = await getAccessToken(creds);
    try {
      const instance: AxiosInstance = axios.create({
        baseURL: `https://${creds.hostname}`,
        timeout: 20_000,
        headers: {
          Authorization: `Bearer ${token}`,
          "Toast-Restaurant-External-ID": creds.restaurantGuid,
        },
      });
      const response = await instance.request<T>(config);
      return response.data;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (retryable && attempt <= MAX_RETRIES) {
        const backoffMs = 500 * 2 ** (attempt - 1);
        await sleep(backoffMs);
        continue;
      }
      const data = axios.isAxiosError(err) ? err.response?.data : undefined;
      throw new ToastApiError(
        axios.isAxiosError(err) ? err.message : "Unknown Toast API error",
        status,
        data
      );
    }
  }
}
