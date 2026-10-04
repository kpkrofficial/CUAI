import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr';

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable.');
    }
    console.warn('[Supabase] Warning: NEXT_PUBLIC_SUPABASE_URL is not set.');
    return '';
  }
  return url;
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.');
    }
    console.warn('[Supabase] Warning: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.');
    return '';
  }
  return key;
}

export function getSupabaseServiceKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('Security Violation: SUPABASE_SERVICE_ROLE_KEY cannot be accessed from client-side code.');
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY server-side environment variable.');
  }
  return key;
}

export function getBucketName(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'student-assets';
}

export const BUCKET_NAME = getBucketName();

/**
 * Browser-side Supabase client for Client Components using @supabase/ssr
 */
export function createBrowserClientInstance(): SupabaseClient {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  return createBrowserClient(url, anonKey);
}

/**
 * Server-side authenticated Supabase client for Server Components and Route Handlers.
 */
export function createServerClientInstance(cookieStore: {
  getAll: () => { name: string; value: string }[];
  setAll?: (cookies: { name: string; value: string; options?: CookieOptions }[]) => void;
}): SupabaseClient {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          if (cookieStore.setAll) {
            cookieStore.setAll(cookiesToSet);
          }
        } catch {
          // Handled gracefully in read-only Server Component renders
        }
      },
    },
  });
}

/**
 * Privileged Admin client for server-only background processes and data migration.
 * NEVER expose to the browser.
 */
export function createAdminClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const serviceKey = getSupabaseServiceKey();
  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Backward-compatible wrappers for existing code
let cachedClient: SupabaseClient | null = null;
let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  if (!cachedClient) {
    cachedClient = createSupabaseClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return cachedClient;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  try {
    const url = getSupabaseUrl();
    const key = getSupabaseServiceKey();
    if (!url || !key) return null;
    if (!cachedAdmin) {
      cachedAdmin = createSupabaseClient(url, key, {
        auth: { persistSession: false },
      });
    }
    return cachedAdmin;
  } catch (err) {
    console.warn('[Supabase] Admin client initialization notice:', (err as Error)?.message);
    return null;
  }
}

export async function ensureBucketExists(): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  try {
    const bucket = getBucketName();
    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) {
      console.warn('Supabase listBuckets warning:', error.message);
    }
    const exists = buckets?.some(b => b.name === bucket);
    if (!exists) {
      const { error: createErr } = await admin.storage.createBucket(bucket, {
        public: true,
        fileSizeLimit: 10485760, // 10 MB
      });
      if (createErr && !createErr.message?.includes('already exists')) {
        console.warn('Supabase createBucket error:', createErr.message);
      }
    }
    return true;
  } catch (e: any) {
    console.warn('Supabase ensureBucketExists catch:', e?.message);
    return false;
  }
}

/**
 * Upload a binary buffer to Supabase Storage and return its permanent public CDN URL.
 */
export async function uploadToSupabaseStorage(
  fileBuffer: Buffer | ArrayBuffer,
  fileName: string,
  contentType: string,
  folder = 'student-photos'
): Promise<{ success: boolean; url: string; error?: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      success: false,
      url: '',
      error: 'Supabase storage is not configured. Service key required.'
    };
  }

  try {
    await ensureBucketExists();
    const bucket = getBucketName();

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${folder}/${Date.now()}_${cleanFileName}`;

    const { data, error } = await admin.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType,
        upsert: true
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      return { success: false, url: '', error: error.message };
    }

    const { data: publicUrlData } = admin.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      success: true,
      url: publicUrlData.publicUrl
    };
  } catch (err: any) {
    console.error('Supabase storage upload exception:', err);
    return {
      success: false,
      url: '',
      error: err.message || 'Failed to upload to Supabase storage'
    };
  }
}

/**
 * Upload a base64 image to Supabase Storage and return the permanent public URL.
 */
export async function uploadBase64ToSupabase(
  base64Data: string,
  fileNamePrefix: string,
  folder = 'student-photos'
): Promise<{ success: boolean; url: string; error?: string }> {
  try {
    if (!base64Data || typeof base64Data !== 'string') {
      return { success: false, url: '', error: 'Empty base64 data' };
    }

    if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
      return { success: true, url: base64Data };
    }

    let mimeType = 'image/jpeg';
    let base64Payload = base64Data;

    if (base64Data.includes(';base64,')) {
      const parts = base64Data.split(';base64,');
      mimeType = parts[0].replace(/^data:/, '') || 'image/jpeg';
      base64Payload = parts[1];
    } else if (base64Data.startsWith('data:')) {
      const commaIdx = base64Data.indexOf(',');
      if (commaIdx > -1) {
        base64Payload = base64Data.substring(commaIdx + 1);
      }
    }

    const buffer = Buffer.from(base64Payload, 'base64');
    let ext = 'jpg';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('gif')) ext = 'gif';

    const safePrefix = (fileNamePrefix || 'photo').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safePrefix}_${Date.now()}.${ext}`;

    return await uploadToSupabaseStorage(buffer, fileName, mimeType, folder);
  } catch (err: any) {
    console.error('Base64 upload to Supabase failed:', err);
    return { success: false, url: '', error: err.message || 'Base64 upload failed' };
  }
}
