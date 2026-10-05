import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey, createAdminClient } from '@/lib/supabase';
import type { AuthContext, AuthProfile, TenantMembership, UserRole, AuthUser } from './types';

/**
 * Creates an authenticated Supabase client for Server Components, Server Actions, and Route Handlers.
 */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as any);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}

/**
 * Resolves the authenticated Supabase user, profile, tenant memberships, and campus context.
 * Performs strict server-side authorization checks.
 */
export async function getAuthContext(requiredRoles?: UserRole[]): Promise<AuthContext | null> {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    const adminClient = createAdminClient();

    // 1. Fetch user profile from public.profiles
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      // Profile fallback if trigger has not completed or legacy sync
      const fallbackProfile: AuthProfile = {
        id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      };
      return resolveContextWithMemberships(user, fallbackProfile, [], requiredRoles);
    }

    // 2. Fetch tenant memberships
    const { data: memberships, error: memError } = await adminClient
      .from('tenant_memberships')
      .select('*, campuses(*)')
      .eq('profile_id', user.id)
      .eq('status', 'active');

    return resolveContextWithMemberships(user, profile, memberships || [], requiredRoles);
  } catch (err) {
    console.error('[Auth] Error resolving auth context:', err);
    return null;
  }
}

function resolveContextWithMemberships(
  user: any,
  profile: AuthProfile,
  memberships: any[],
  requiredRoles?: UserRole[]
): AuthContext | null {
  // Determine highest/active role
  // Priority: superadmin > campus_admin > staff > student
  const roleHierarchy: UserRole[] = ['superadmin', 'campus_admin', 'staff', 'student'];
  let activeMembership: TenantMembership | null = null;
  let activeRole: UserRole = 'student';

  for (const role of roleHierarchy) {
    const found = memberships.find((m) => m.role === role);
    if (found) {
      activeMembership = found;
      activeRole = role;
      break;
    }
  }

  // Check if user has app_metadata role as superadmin
  if (user.app_metadata?.role === 'superadmin' || user.user_metadata?.role === 'superadmin') {
    activeRole = 'superadmin';
  }

  // If requiredRoles specified, ensure user meets requirement
  if (requiredRoles && requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.includes(activeRole);
    if (!hasRequiredRole) {
      return null;
    }
  }

  const campus = (activeMembership as any)?.campuses || null;
  const campusId = activeMembership?.campus_id || null;

  return {
    userId: user.id,
    email: user.email || profile.email,
    profile,
    memberships,
    activeMembership,
    role: activeRole,
    campusId,
    campus: campus
      ? {
          id: campus.id,
          organization_id: campus.organization_id,
          name: campus.name,
          code: campus.code,
          branding: campus.branding,
        }
      : null,
  };
}

/**
 * Adapter converting AuthContext to the legacy AuthUser interface
 * to keep UI components (Sidebar, AdminHeader, etc.) working seamlessly.
 */
export function toLegacyAuthUser(ctx: AuthContext): AuthUser {
  const legacyRole: 'superadmin' | 'admin' | 'user' =
    ctx.role === 'superadmin'
      ? 'superadmin'
      : ctx.role === 'campus_admin' || ctx.role === 'staff'
      ? 'admin'
      : 'user';

  return {
    id: ctx.userId,
    email: ctx.email,
    name: ctx.profile.full_name || ctx.email.split('@')[0],
    role: legacyRole,
    canonicalRole: ctx.role,
    campusId: ctx.campusId,
    status: (ctx.activeMembership?.status as any) || 'active',
    lastActivity: Date.now(),
  };
}

/**
 * Compatibility function for routes migrating to the new auth layer.
 */
export async function getCurrentAuthUser(roleScope?: 'admin' | 'superadmin' | 'user'): Promise<AuthUser | null> {
  const requiredRoles: UserRole[] | undefined =
    roleScope === 'superadmin'
      ? ['superadmin']
      : roleScope === 'admin'
      ? ['superadmin', 'campus_admin', 'staff']
      : roleScope === 'user'
      ? ['student', 'superadmin', 'campus_admin', 'staff']
      : undefined;

  const ctx = await getAuthContext(requiredRoles);
  if (!ctx) return null;

  const legacyUser = toLegacyAuthUser(ctx);
  if (roleScope && legacyUser.role !== roleScope && !(roleScope === 'admin' && legacyUser.role === 'superadmin')) {
    return null;
  }
  return legacyUser;
}
