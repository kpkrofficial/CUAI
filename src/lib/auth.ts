import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { getAdminById, getUserById } from './db';
import { getCurrentAuthUser } from './auth/session';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'cityapp_super_secret_jwt_key_9876543210_abcdef'
);

export const SESSION_INACTIVITY_TIMEOUT_SECONDS = 30 * 60; // 30 minutes server-side timeout

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'superadmin' | 'user';
  status?: 'active' | 'maintenance' | 'suspended';
  lastActivity?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(payload: AuthUser): Promise<string> {
  const now = Date.now();
  return new SignJWT({
    id: payload.id,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    status: payload.status || 'active',
    lastActivity: now
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!payload || !payload.role || !payload.id) return null;

    // Server-side strict 30-minute inactivity validation
    const lastActivity = typeof payload.lastActivity === 'number' ? payload.lastActivity : (typeof payload.iat === 'number' ? payload.iat * 1000 : 0);
    const now = Date.now();
    if (now - lastActivity > SESSION_INACTIVITY_TIMEOUT_SECONDS * 1000) {
      return null;
    }

    return payload as unknown as AuthUser;
  } catch (err) {
    return null;
  }
}

/**
 * Strict, isolated role verification.
 * SUPER ADMIN will never fall back to ADMIN or USER.
 * ADMIN will never fall back to SUPER ADMIN or USER.
 */
export async function getCurrentUser(roleScope?: 'admin' | 'superadmin' | 'user'): Promise<AuthUser | null> {
  try {
    // 1. Primary Source of Truth: Supabase Auth Session
    const supabaseUser = await getCurrentAuthUser(roleScope);
    if (supabaseUser) {
      return supabaseUser;
    }

    // 2. Legacy fallback during progressive migration
    const cookieStore = await cookies();
    const superToken = cookieStore.get('superadmin_auth_token')?.value;
    const adminToken = cookieStore.get('admin_auth_token')?.value;
    const userToken = cookieStore.get('user_auth_token')?.value;

    if (roleScope === 'superadmin') {
      if (!superToken) return null;
      const decoded = await verifyToken(superToken);
      if (!decoded || decoded.role !== 'superadmin') return null;
      const admin = getAdminById(decoded.id);
      if (!admin || admin.role !== 'superadmin' || admin.status === 'suspended') return null;
      return { id: admin.id, email: admin.email, name: admin.name, role: 'superadmin', status: admin.status };
    }

    if (roleScope === 'admin') {
      // Super Admin has master authority over all admin APIs
      if (superToken) {
        const decodedSuper = await verifyToken(superToken);
        if (decodedSuper && decodedSuper.role === 'superadmin') {
          const superAdmin = getAdminById(decodedSuper.id);
          if (superAdmin && superAdmin.role === 'superadmin' && superAdmin.status !== 'suspended') {
            return { id: superAdmin.id, email: superAdmin.email, name: superAdmin.name, role: 'superadmin', status: superAdmin.status };
          }
        }
      }

      if (adminToken) {
        const decodedAdmin = await verifyToken(adminToken);
        if (decodedAdmin && decodedAdmin.role === 'admin') {
          const admin = getAdminById(decodedAdmin.id);
          if (admin && admin.role === 'admin' && admin.status !== 'suspended') {
            return { id: admin.id, email: admin.email, name: admin.name, role: 'admin', status: admin.status };
          }
        }
      }

      return null;
    }

    if (roleScope === 'user') {
      if (!userToken) return null;
      const decoded = await verifyToken(userToken);
      if (!decoded || decoded.role !== 'user') return null;
      const user = getUserById(decoded.id);
      if (!user || user.status === 'suspended') return null;
      return { id: user.id, email: user.email, name: user.name, role: 'user', status: user.status };
    }

    // Direct resolution if no roleScope specified
    if (superToken) {
      const decoded = await verifyToken(superToken);
      if (decoded && decoded.role === 'superadmin') {
        const admin = getAdminById(decoded.id);
        if (admin && admin.role === 'superadmin' && admin.status !== 'suspended') {
          return { id: admin.id, email: admin.email, name: admin.name, role: 'superadmin', status: admin.status };
        }
      }
    }
    if (adminToken) {
      const decoded = await verifyToken(adminToken);
      if (decoded && decoded.role === 'admin') {
        const admin = getAdminById(decoded.id);
        if (admin && admin.role === 'admin' && admin.status !== 'suspended') {
          return { id: admin.id, email: admin.email, name: admin.name, role: 'admin', status: admin.status };
        }
      }
    }
    if (userToken) {
      const decoded = await verifyToken(userToken);
      if (decoded && decoded.role === 'user') {
        const user = getUserById(decoded.id);
        if (user && user.status !== 'suspended') {
          return { id: user.id, email: user.email, name: user.name, role: 'user', status: user.status };
        }
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

export async function setAuthCookie(token: string, role: 'admin' | 'superadmin' | 'user' = 'user') {
  const cookieStore = await cookies();
  const cookieName = `${role}_auth_token`;
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_INACTIVITY_TIMEOUT_SECONDS, // 30 minutes server-enforced timeout
  });
}

export async function removeAuthCookie(role?: 'admin' | 'superadmin' | 'user' | 'all') {
  const cookieStore = await cookies();
  const cookiesToClear = 
    !role || role === 'all'
      ? ['superadmin_auth_token', 'admin_auth_token', 'user_auth_token', 'auth_token']
      : [`${role}_auth_token`];

  for (const name of cookiesToClear) {
    cookieStore.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
}
