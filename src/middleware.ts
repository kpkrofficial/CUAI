import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'cityapp_super_secret_jwt_key_9876543210_abcdef'
);

const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface DecodedToken {
  id: string;
  email: string;
  name: string;
  role: 'superadmin' | 'admin' | 'user';
  lastActivity?: number;
  iat?: number;
  exp?: number;
}

async function verifyLegacyToken(tokenValue?: string, expectedRole?: 'superadmin' | 'admin' | 'user'): Promise<DecodedToken | null> {
  if (!tokenValue) return null;
  try {
    const { payload } = await jwtVerify(tokenValue, JWT_SECRET);
    if (!payload || !payload.id || !payload.role) return null;

    const role = payload.role as 'superadmin' | 'admin' | 'user';
    if (expectedRole && role !== expectedRole) return null;

    const lastActivity = typeof payload.lastActivity === 'number' 
      ? payload.lastActivity 
      : (typeof payload.iat === 'number' ? payload.iat * 1000 : 0);
    
    if (Date.now() - lastActivity > SESSION_INACTIVITY_TIMEOUT_MS) {
      return null;
    }

    return payload as unknown as DecodedToken;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Static and system assets
  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.match(/\.(png|jpg|jpeg|svg|webp|ico|css|js|map|json|txt|woff|woff2)$/)
  ) {
    return NextResponse.next();
  }

  // 2. Canonicalize legacy `/superadmin` to `/super-admin`
  if (pathname === '/superadmin' || pathname.startsWith('/superadmin/')) {
    const target = pathname.replace('/superadmin', '/super-admin');
    return NextResponse.redirect(new URL(target, request.url));
  }

  // 3. Open Public APIs & Intake Forms
  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/forms') ||
    pathname.startsWith('/forms') ||
    pathname === '/unauthorized' ||
    pathname === '/register'
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  // 4. Initialize Supabase Client with SSR cookie handling
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  let supabaseUser: any = null;
  let supabaseRole: 'superadmin' | 'admin' | 'user' | null = null;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      supabaseUser = user;
      const rawRole = user.app_metadata?.role || user.user_metadata?.role;
      if (rawRole === 'superadmin') {
        supabaseRole = 'superadmin';
      } else if (rawRole === 'campus_admin' || rawRole === 'staff' || rawRole === 'admin') {
        supabaseRole = 'admin';
      } else {
        supabaseRole = 'user';
      }
    }
  }

  // 5. Read legacy role-scoped tokens as fallback
  const superAdminToken = request.cookies.get('superadmin_auth_token')?.value;
  const adminToken = request.cookies.get('admin_auth_token')?.value;
  const userToken = request.cookies.get('user_auth_token')?.value;

  const validLegacySuper = await verifyLegacyToken(superAdminToken, 'superadmin');
  const validLegacyAdmin = await verifyLegacyToken(adminToken, 'admin');
  const validLegacyUser = await verifyLegacyToken(userToken, 'user');

  const isSuperAdmin = supabaseRole === 'superadmin' || !!validLegacySuper;
  const isAdmin = isSuperAdmin || supabaseRole === 'admin' || !!validLegacyAdmin;
  const isStudent = !!supabaseUser || !!validLegacyUser || isAdmin;

  const hasSwitchParam = request.nextUrl.searchParams.has('switch') || request.nextUrl.searchParams.has('reason');

  // 6. Dedicated Login Pages
  if (pathname === '/super-admin/login') {
    if (!hasSwitchParam && isSuperAdmin) {
      return NextResponse.redirect(new URL('/super-admin/dashboard', request.url));
    }
    return response;
  }

  if (pathname === '/admin/login') {
    if (!hasSwitchParam && isAdmin) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
    return response;
  }

  if (pathname === '/login' || pathname === '/chat/login') {
    if (!hasSwitchParam && isStudent && (supabaseRole === 'user' || validLegacyUser)) {
      return NextResponse.redirect(new URL('/chat', request.url));
    }
    return response;
  }

  // 7. Root Path ('/') authoritative resolution
  if (pathname === '/') {
    if (isSuperAdmin) return NextResponse.redirect(new URL('/super-admin/dashboard', request.url));
    if (isAdmin) return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    if (isStudent && (supabaseRole === 'user' || validLegacyUser)) return NextResponse.redirect(new URL('/chat', request.url));
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 8. SUPER ADMIN Protection (`/super-admin/*` and `/api/super-admin/*`)
  if (pathname.startsWith('/super-admin') || pathname.startsWith('/api/super-admin')) {
    if (!isSuperAdmin) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden: Super Administrator authentication required' },
          { status: 403 }
        );
      }
      const loginUrl = new URL('/super-admin/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // 9. CAMPUS ADMIN & ADMIN APIs Protection (`/admin/*` and `/api/admin/*`)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (!isAdmin) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Forbidden: Administrator authentication required' },
          { status: 403 }
        );
      }
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // 10. STUDENT CHATBOT Protection (`/chat/*` and `/api/chat/*`)
  if (pathname.startsWith('/chat') || pathname.startsWith('/api/chat')) {
    if (!isStudent && !supabaseUser) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'Unauthorized: Student authentication required' },
          { status: 401 }
        );
      }
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
