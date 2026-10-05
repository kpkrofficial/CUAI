export type UserRole = 'superadmin' | 'campus_admin' | 'staff' | 'student';
export type MembershipStatus = 'active' | 'suspended' | 'pending';

export interface AuthProfile {
  id: string; // references auth.users.id
  email: string;
  full_name: string;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TenantMembership {
  id: string;
  profile_id: string;
  organization_id: string;
  campus_id: string | null; // null only for global superadmin
  department_id?: string | null;
  role: UserRole;
  status: MembershipStatus;
  created_at?: string;
  updated_at?: string;
}

export interface CampusContext {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  branding?: {
    college_name?: string;
    chatbot_title?: string;
    logo_url?: string;
    theme?: string;
  };
}

export interface AuthContext {
  userId: string;
  email: string;
  profile: AuthProfile;
  memberships: TenantMembership[];
  activeMembership: TenantMembership | null;
  role: UserRole;
  campusId: string | null;
  campus?: CampusContext | null;
}

// Backward compatibility interface for existing components (AdminHeader, Sidebar, etc.)
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'superadmin' | 'admin' | 'user'; // legacy role naming for UI components
  canonicalRole: UserRole;
  campusId?: string | null;
  status?: 'active' | 'maintenance' | 'suspended';
  lastActivity?: number;
}
