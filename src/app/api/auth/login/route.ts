import { NextResponse } from 'next/server';
import { getServerSupabase, getAuthContext, toLegacyAuthUser } from '@/lib/auth/session';
import { setAuthCookie } from '@/lib/auth';
import { enforceRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { AuditService } from '@/lib/services/audit.service';

export async function POST(req: Request) {
  // 1. Enforce IP-based rate limiting on login endpoint
  const rateLimitResponse = enforceRateLimit(req, 'auth_login', RATE_LIMIT_PRESETS.AUTH_LOGIN);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await req.json();
    const { email, password, loginType } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // 2. Authenticate directly against Supabase Auth (auth.users)
    const supabase = await getServerSupabase();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (authError || !authData.user) {
      await AuditService.log({
        action: 'LOGIN_FAILED',
        entityType: 'auth',
        entityId: cleanEmail,
        details: { reason: authError?.message || 'Invalid credentials', loginType },
      });

      return NextResponse.json(
        { error: 'Invalid email or password. Please verify your credentials.' },
        { status: 401 }
      );
    }

    // 3. Resolve Profile and Tenant Memberships
    const authContext = await getAuthContext();
    if (!authContext) {
      await AuditService.log({
        action: 'LOGIN_PROFILE_MISSING',
        entityType: 'auth',
        entityId: authData.user.id,
        details: { email: cleanEmail },
      });
      return NextResponse.json(
        { error: 'User profile or tenant membership not configured. Please contact administration.' },
        { status: 403 }
      );
    }

    // Check account status
    if (authContext.activeMembership?.status === 'suspended') {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: 'Access Denied: Your account has been suspended by the administration.' },
        { status: 403 }
      );
    }

    const legacyUser = toLegacyAuthUser(authContext);

    // 4. Determine redirect path based on role and login type
    let redirectTo = '/chat';
    if (authContext.role === 'superadmin') {
      redirectTo = loginType === 'admin' ? '/admin/dashboard' : '/super-admin/dashboard';
    } else if (authContext.role === 'campus_admin' || authContext.role === 'staff') {
      redirectTo = '/admin/dashboard';
    } else {
      redirectTo = '/chat';
    }

    // 5. Set backward-compatible session cookie for any legacy client dependencies
    try {
      await setAuthCookie(authData.session.access_token, legacyUser.role);
    } catch (_) {}

    // 6. Record immutable security audit log
    await AuditService.log(
      {
        action: 'LOGIN_SUCCESS',
        entityType: 'auth',
        entityId: authData.user.id,
        details: {
          role: authContext.role,
          campusId: authContext.campusId,
          email: cleanEmail,
        },
      },
      authContext
    );

    return NextResponse.json({
      success: true,
      user: {
        id: legacyUser.id,
        email: legacyUser.email,
        name: legacyUser.name,
        role: legacyUser.role,
        canonicalRole: authContext.role,
        campusId: authContext.campusId,
      },
      redirectTo,
    });
  } catch (err: any) {
    console.error('[Auth API] Login exception:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred during authentication.' },
      { status: 500 }
    );
  }
}
