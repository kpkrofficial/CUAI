import { createAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/types';
import type { StudentAcademicProfile } from '@/lib/types/academic';

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
  canonical_academic?: StudentAcademicProfile;
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
  canonical_academic?: StudentAcademicProfile;
}

/**
 * Strips sensitive PII (Aadhaar, parents' phone, full address) for general responses
 */
export function sanitizeStudentForChat(student: StudentRecord): Record<string, any> {
  const academic = student.canonical_academic || student.student_data?.canonical_academic;
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
    canonical_academic: academic,
    // Sensitive PII explicitly excluded:
    // aadhaar_no -> EXCLUDED
    // parent_phone / permanent_phone -> EXCLUDED
    // permanent_address -> EXCLUDED
    // father_name / mother_name -> EXCLUDED
  };
}

export class StudentService {
  private static studentCache = new Map<string, { record: any; expires: number }>();

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
    const cleanRoll = rollNumber.trim().toUpperCase();
    const cacheKey = `roll_${cleanRoll}_${context.campusId || 'all'}_${options.forChat ? 'chat' : 'raw'}`;
    const cached = this.studentCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.record;
    }

    const client = this.getClient();

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
      const rollFromEmail = context.email ? context.email.split('@')[0].trim().toUpperCase() : '';
      const isOwner =
        (record.account_id && record.account_id === context.userId) ||
        (record.email && record.email.toLowerCase() === context.email.toLowerCase()) ||
        (rollFromEmail && record.roll_number.toUpperCase() === rollFromEmail);

      if (!isOwner) {
        throw new Error('Access Denied: Students are strictly restricted to their own private records.');
      }
    }

    const result = options.forChat ? (sanitizeStudentForChat(record) as any) : record;
    this.studentCache.set(cacheKey, { record: result, expires: Date.now() + 60_000 });
    return result;
  }

  /**
   * Canonical server-side identity resolver for authenticated students (Section 2).
   * Resolves the verified StudentRecord associated with context.userId (auth.uid()).
   * 
   * Strict precedence:
   * 1. Exact match on student_records.account_id = context.userId (when valid UUID)
   * 2. Controlled fallback: Match student_records.email ILIKE context.email
   * 3. Controlled fallback: Match student_records.roll_number ILIKE email username (if valid roll format)
   * 
   * NEVER guesses. Rejects ambiguity. Returns null if unresolvable.
   */
  static async resolveAuthenticatedStudent(
    context: AuthContext,
    options: { forChat?: boolean } = {}
  ): Promise<StudentRecord | null> {
    if (!context || !context.userId) return null;

    const cacheKey = `auth_${context.userId}_${context.email}_${context.campusId || 'all'}_${options.forChat ? 'chat' : 'raw'}`;
    const cached = this.studentCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.record;
    }

    const client = this.getClient();

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.userId);

    // 1. Strict primary lookup: account_id = context.userId
    if (isUuid) {
      let query = client
        .from('student_records')
        .select('*')
        .eq('account_id', context.userId);

      if (context.campusId && context.role !== 'superadmin') {
        query = query.eq('campus_id', context.campusId);
      }

      const { data: record, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!error && record) {
        const res = options.forChat ? (sanitizeStudentForChat(record) as any) : record;
        this.studentCache.set(cacheKey, { record: res, expires: Date.now() + 60_000 });
        return res;
      }

      // Check without campus_id filter in case tenant context was not populated
      if (context.campusId && context.role !== 'superadmin') {
        const { data: globalRec, error: globalErr } = await client
          .from('student_records')
          .select('*')
          .eq('account_id', context.userId)
          .limit(1)
          .maybeSingle();

        if (!globalErr && globalRec) {
          const res = options.forChat ? (sanitizeStudentForChat(globalRec) as any) : globalRec;
          this.studentCache.set(cacheKey, { record: res, expires: Date.now() + 60_000 });
          return res;
        }
      }
    }

    // 2. Controlled fallback: Match by verified email
    if (context.email && context.email.includes('@')) {
      const cleanEmail = context.email.trim().toLowerCase();
      let emailQuery = client
        .from('student_records')
        .select('*')
        .ilike('email', cleanEmail);

      if (context.campusId && context.role !== 'superadmin') {
        emailQuery = emailQuery.eq('campus_id', context.campusId);
      }

      const { data: emailRecords, error: emailErr } = await emailQuery.limit(2);
      if (!emailErr && emailRecords && emailRecords.length === 1) {
        const record = emailRecords[0];
        // Lazily link account_id if valid UUID and currently unset
        if (isUuid && !record.account_id) {
          await client.from('student_records').update({ account_id: context.userId }).eq('id', record.id);
          record.account_id = context.userId;
        }
        const res = options.forChat ? (sanitizeStudentForChat(record) as any) : record;
        this.studentCache.set(cacheKey, { record: res, expires: Date.now() + 60_000 });
        return res;
      }
    }

    // 3. Controlled fallback: Extract roll number from institutional email (e.g. 24HT1A43G2@student.cityapp.campus)
    const rollFromEmail = context.email ? context.email.split('@')[0].trim().toUpperCase() : '';
    if (rollFromEmail && /^[0-9]{2}[A-Za-z0-9]{5,10}$/.test(rollFromEmail)) {
      let rollQuery = client
        .from('student_records')
        .select('*')
        .ilike('roll_number', rollFromEmail);

      if (context.campusId && context.role !== 'superadmin') {
        rollQuery = rollQuery.eq('campus_id', context.campusId);
      }

      const { data: rollRecords, error: rollErr } = await rollQuery.limit(2);
      if (!rollErr && rollRecords && rollRecords.length === 1) {
        const record = rollRecords[0];
        if (isUuid && !record.account_id) {
          await client.from('student_records').update({ account_id: context.userId }).eq('id', record.id);
          record.account_id = context.userId;
        }
        const res = options.forChat ? (sanitizeStudentForChat(record) as any) : record;
        this.studentCache.set(cacheKey, { record: res, expires: Date.now() + 60_000 });
        return res;
      }
    }

    return null;
  }

  /**
   * Get authenticated student's own record. Delegates to the canonical resolveAuthenticatedStudent.
   */
  static async getOwnStudentProfile(
    context: AuthContext,
    options: { forChat?: boolean } = {}
  ): Promise<StudentRecord | null> {
    return await this.resolveAuthenticatedStudent(context, options);
  }

  /**
   * Disambiguated student resolution supporting explicit roll numbers, exact names, and authenticated self-access.
   * Prevents silent misattribution from ambiguous fuzzy matching (Requirement Section 10).
   */
  static async resolveStudent(
    args: { rollNumber?: string; name?: string },
    context: AuthContext,
    options: { forChat?: boolean } = {}
  ): Promise<StudentRecord | null> {
    const client = this.getClient();

    // 1. Student self-resolution: students can only resolve their own record
    if (context.role === 'student') {
      const own = await this.resolveAuthenticatedStudent(context, options);
      if (!own) {
        return null;
      }

      // If user supplied rollNumber, ensure it matches own roll number
      if (args.rollNumber && args.rollNumber.trim()) {
        const cleanReqRoll = args.rollNumber.trim().toUpperCase();
        if (own.roll_number.toUpperCase() !== cleanReqRoll) {
          throw new Error('Access Denied: Students are strictly restricted to their own private records.');
        }
      }

      // If user supplied name, ensure it matches own name
      if (args.name && args.name.trim()) {
        const cleanReqName = args.name.trim().toLowerCase();
        if (!own.name.toLowerCase().includes(cleanReqName)) {
          throw new Error('Access Denied: Students are strictly restricted to their own private records.');
        }
      }

      return own;
    }

    // 2. Staff / Admin Resolution
    // Branch A: By Roll Number
    if (args.rollNumber && args.rollNumber.trim()) {
      return await this.getStudentByRoll(args.rollNumber, context, options);
    }

    // Branch B: By Name (with strict disambiguation)
    if (args.name && args.name.trim()) {
      const cleanName = args.name.trim();
      let query = client
        .from('student_records')
        .select('*')
        .ilike('name', `%${cleanName}%`);

      if (context.role !== 'superadmin') {
        if (!context.campusId) {
          throw new Error('Tenant isolation violation: No campus assigned to user');
        }
        query = query.eq('campus_id', context.campusId);
      }

      const { data: matches, error } = await query;
      if (error) {
        throw new Error(`Database query error while resolving student name "${cleanName}": ${error.message}`);
      }

      if (!matches || matches.length === 0) {
        return null;
      }

      if (matches.length > 1) {
        // Look for exact case-insensitive match
        const exactMatches = matches.filter(
          (m) => m.name.toLowerCase() === cleanName.toLowerCase()
        );
        if (exactMatches.length === 1) {
          return options.forChat ? (sanitizeStudentForChat(exactMatches[0]) as any) : exactMatches[0];
        }

        // Section 10: "If multiple records match: Multiple matching students were found. Please provide the roll number. Do not guess."
        throw new Error(
          `Multiple matching students were found for "${cleanName}". Please provide the roll number.`
        );
      }

      return options.forChat ? (sanitizeStudentForChat(matches[0]) as any) : matches[0];
    }

    return null;
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
