import { NextResponse } from 'next/server';
import { getServerSupabase, getAuthContext } from '@/lib/auth/session';
import { removeAuthCookie } from '@/lib/auth';
import { AuditService } from '@/lib/services/audit.service';

export async function POST(req: Request) {
  let role: 'admin' | 'superadmin' | 'user' | 'all' | undefined;
  try {
    const body = await req.json();
    role = body?.role;
  } catch (e) {
    // No body or empty body
  }

  if (!role) {
    try {
      const url = new URL(req.url);
      role = (url.searchParams.get('role') as any) || undefined;
    } catch (e) {}
  }

  try {
    const context = await getAuthContext();
    if (context) {
      await AuditService.log(
        {
          action: 'LOGOUT',
          entityType: 'auth',
          entityId: context.userId,
          details: { email: context.email, role: context.role },
        },
        context
      );
    }

    const supabase = await getServerSupabase();
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[Logout API] Supabase signOut notice:', err);
  }

  await removeAuthCookie(role);
  return NextResponse.json({ success: true, message: 'Logged out successfully' });
}
