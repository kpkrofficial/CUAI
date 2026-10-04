import { createAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/types';

export interface StudentRecord {
  id: string;
  campus_id: string;
  folder_id: string;
  account_id?: string | null;
  name: string;
  roll_number: string;
  branch: string;
  year: string;
  section?: string | null;
  college: string;
  email?: string | null;
  phone?: string | null;
  profile_image?: string | null;
  admission_type?: string | null;
  dob?: string | null;
  blood_group?: string | null;
  aadhaar_no?: string | null;
  father_name?: string | null;
  father_occupation?: string | null;
  mother_name?: string | null;
  mother_occupation?: string | null;
  reservation_category?: string | null;
  mode_of_transport?: string | null;
  accommodation_type?: string | null;
  permanent_address?: string | null;
  present_address?: string | null;
  permanent_pincode?: string | null;
  present_pincode?: string | null;
  permanent_phone?: string | null;
  present_phone?: string | null;
  ssc_marks?: string | null;
  inter_marks?: string | null;
  diploma_marks?: string | null;
  student_data?: Record<string, any>;
  is_draft?: number;
  created_at?: string;
  updated_at?: string;
}

export interface StudentFilterParams {
  folderId?: string;
  branch?: string;
  year?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SanitizedStudent {
  id: string;
  name: string;
  roll_number: string;
  branch: string;
  year: string;
  section?: string | null;
  college: string;
  email?: string | null;
  phone?: string | null;
  profile_image?: string | null;
  admission_type?: string | null;
  blood_group?: string | null;
  created_at?: string;
  is_draft?: number;
  // Non-sensitive academic summaries
  tenth_percentage?: string;
  twelfth_percentage?: string;
  cgpa?: string;
}

/**
 * Strips sensitive PII (Aadhaar, parents' phone, full address) for general responses
 */
export function sanitizeStudentForChat(student: StudentRecord): Record<string, any> {
  return {
    id: student.id,
    name: student.name,
    roll_number: student.roll_number,
    branch: student.branch,
    year: student.year,
    section: student.section,
    college: student.college,
    email: student.email,
    profile_image: student.profile_image,
    admission_type: student.admission_type,
    blood_group: student.blood_group,
    ssc_marks: student.ssc_marks,
    inter_marks: student.inter_marks,
    diploma_marks: student.diploma_marks,
    // Sensitive PII explicitly excluded:
    // aadhaar_no -> EXCLUDED
    // parent_phone / permanent_phone -> EXCLUDED
    // permanent_address -> EXCLUDED
    // father_name / mother_name -> EXCLUDED
  };
}

export class StudentService {
  private static getClient() {
    return createAdminClient();
  }

  /**
   * Get single student by roll number with strict tenant & self-access checks.
   */
  static async getStudentByRoll(
    rollNumber: string,
    context: AuthContext,
    options: { forChat?: boolean } = {}
  ): Promise<StudentRecord | null> {
    const client = this.getClient();
    const cleanRoll = rollNumber.trim().toUpperCase();

    let query = client
      .from('student_records')
      .select('*')
      .ilike('roll_number', cleanRoll);

    // Tenant Isolation
    if (context.role !== 'superadmin') {
      if (!context.campusId) {
        throw new Error('Tenant isolation violation: No campus assigned to user');
      }
      query = query.eq('campus_id', context.campusId);
    }

    const { data: record, error } = await query.maybeSingle();
    if (error || !record) return null;

    // Strict Student Self-Access Rule
    if (context.role === 'student') {
      const isOwner =
        (record.account_id && record.account_id === context.userId) ||
        (record.email && record.email.toLowerCase() === context.email.toLowerCase());

      if (!isOwner) {
        throw new Error('Access Denied: Students are strictly restricted to their own private records.');
      }
    }

    if (options.forChat) {
      return sanitizeStudentForChat(record) as any;
    }

    return record;
  }

  /**
   * Get authenticated student's own record
   */
  static async getOwnStudentProfile(
    context: AuthContext,
    options: { forChat?: boolean } = {}
  ): Promise<StudentRecord | null> {
    const client = this.getClient();

    let query = client
      .from('student_records')
      .select('*')
      .or(`account_id.eq.${context.userId},email.ilike.${context.email}`);

    if (context.campusId && context.role !== 'superadmin') {
      query = query.eq('campus_id', context.campusId);
    }

    const { data: record, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !record) return null;

    if (options.forChat) {
      return sanitizeStudentForChat(record) as any;
    }

    return record;
  }

  /**
   * Paginated student listing for administrative dashboards (Strictly Campus-Scoped)
   */
  static async listStudents(
    params: StudentFilterParams,
    context: AuthContext
  ): Promise<{ students: StudentRecord[]; total: number }> {
    if (context.role === 'student') {
      throw new Error('Access Denied: Students cannot access administrative student lists.');
    }

    const client = this.getClient();
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    let query = client
      .from('student_records')
      .select('*', { count: 'exact' });

    // Tenant Isolation
    if (context.role !== 'superadmin') {
      if (!context.campusId) {
        throw new Error('Tenant isolation violation: No campus assigned to user');
      }
      query = query.eq('campus_id', context.campusId);
    }

    if (params.folderId) {
      query = query.eq('folder_id', params.folderId);
    }

    if (params.branch) {
      query = query.ilike('branch', `%${params.branch}%`);
    }

    if (params.year) {
      query = query.ilike('year', `%${params.year}%`);
    }

    if (params.search) {
      const s = `%${params.search.trim()}%`;
      query = query.or(`name.ilike.${s},roll_number.ilike.${s},email.ilike.${s}`);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      console.error('[StudentService] listStudents error:', error);
      throw new Error('Database query error while retrieving student records');
    }

    return {
      students: data || [],
      total: count || 0,
    };
  }

  /**
   * Aggregation query for counts (used by AI tools and Admin Stats)
   */
  static async countStudents(
    filter: { branch?: string; year?: string; folderId?: string; isDraft?: number },
    context: AuthContext
  ): Promise<number> {
    if (context.role === 'student') {
      throw new Error('Access Denied: Students cannot perform administrative aggregation queries.');
    }

    const client = this.getClient();
    let query = client
      .from('student_records')
      .select('*', { count: 'exact', head: true });

    if (context.role !== 'superadmin') {
      if (!context.campusId) throw new Error('Tenant isolation violation: Missing campus context');
      query = query.eq('campus_id', context.campusId);
    }

    if (filter.branch) {
      query = query.ilike('branch', `%${filter.branch}%`);
    }
    if (filter.year) {
      query = query.ilike('year', `%${filter.year}%`);
    }
    if (filter.folderId) {
      query = query.eq('folder_id', filter.folderId);
    }
    if (typeof filter.isDraft === 'number') {
      query = query.eq('is_draft', filter.isDraft);
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }

  /**
   * Upsert a student record with tenant boundary enforcement
   */
  static async upsertStudent(
    studentData: Partial<StudentRecord> & { roll_number: string; name: string },
    context: AuthContext
  ): Promise<StudentRecord> {
    if (context.role === 'student') {
      throw new Error('Access Denied: Students cannot directly upsert arbitrary student records.');
    }

    const client = this.getClient();
    const campusId = context.role === 'superadmin' ? (studentData.campus_id || context.campusId) : context.campusId;

    if (!campusId) {
      throw new Error('Tenant isolation violation: Missing target campus ID');
    }

    const cleanRoll = studentData.roll_number.trim().toUpperCase();

    // Check existing
    const { data: existing } = await client
      .from('student_records')
      .select('id, campus_id')
      .eq('campus_id', campusId)
      .eq('roll_number', cleanRoll)
      .maybeSingle();

    const recordToSave = {
      ...studentData,
      roll_number: cleanRoll,
      campus_id: campusId,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { data, error } = await client
        .from('student_records')
        .update(recordToSave)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      const id = studentData.id || `student_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const { data, error } = await client
        .from('student_records')
        .insert({
          ...recordToSave,
          id,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  }

  /**
   * Delete student record
   */
  static async deleteStudent(id: string, context: AuthContext): Promise<boolean> {
    if (context.role === 'student') {
      throw new Error('Access Denied: Only administrators can delete student records.');
    }

    const client = this.getClient();
    let query = client.from('student_records').delete().eq('id', id);

    if (context.role !== 'superadmin') {
      if (!context.campusId) throw new Error('Tenant isolation violation');
      query = query.eq('campus_id', context.campusId);
    }

    const { error } = await query;
    if (error) throw error;
    return true;
  }
}
