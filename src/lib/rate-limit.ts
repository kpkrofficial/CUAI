import { NextResponse } from 'next/server';

interface RateLimitEntry {
  timestamps: number[];
}

// In-memory sliding window cache with automatic cleanup
const rateLimitStore = new Map<string, RateLimitEntry>();

// Evict expired entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      entry.timestamps = entry.timestamps.filter(ts => now - ts < 15 * 60 * 1000);
      if (entry.timestamps.length === 0) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export const RATE_LIMIT_PRESETS = {
  AUTH_LOGIN: { maxRequests: 8, windowSeconds: 60 } as RateLimitConfig,         // 8 attempts / minute
  FORM_SUBMISSION: { maxRequests: 20, windowSeconds: 60 } as RateLimitConfig,  // 20 submissions / min
  SEARCH_API: { maxRequests: 80, windowSeconds: 60 } as RateLimitConfig,       // 80 searches / min
  ADMIN_GENERAL: { maxRequests: 200, windowSeconds: 60 } as RateLimitConfig,   // 200 requests / min
  STORAGE_UPLOAD: { maxRequests: 30, windowSeconds: 60 } as RateLimitConfig,   // 30 uploads / min
  CHAT_QUERY: { maxRequests: 60, windowSeconds: 60 } as RateLimitConfig,       // 60 chat queries / min
};

/**
 * Extract client IP address safely from standard request headers
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  return '127.0.0.1';
}

/**
 * Check if the request is allowed under the specified rate limit window.
 * Returns { allowed, remaining, resetSeconds, retryAfter }
 */
export function checkRateLimit(
  req: Request,
  prefix: string,
  config: RateLimitConfig
): {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter: number;
} {
  const ip = getClientIp(req);
  const key = `${prefix}:${ip}`;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const cutoff = now - windowMs;

  let entry = rateLimitStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Filter timestamps outside current sliding window
  entry.timestamps = entry.timestamps.filter(ts => ts > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldest = entry.timestamps[0] || now;
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      retryAfter,
    };
  }

  // Record this request
  entry.timestamps.push(now);

  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.timestamps.length),
    retryAfter: 0,
  };
}

/**
 * Convenience helper to return a 429 response if rate limit is exceeded
 */
export function enforceRateLimit(
  req: Request,
  prefix: string,
  config: RateLimitConfig
): NextResponse | null {
  const result = checkRateLimit(req, prefix, config);
  if (!result.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please slow down and retry in ${result.retryAfter}s.`,
        },
        meta: {
          retryAfter: result.retryAfter,
          limit: result.limit,
          timestamp: new Date().toISOString(),
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }
  return null;
}
