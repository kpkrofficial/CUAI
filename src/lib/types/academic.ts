import { z } from 'zod';

export type QualificationType = 'SSC' | 'INTERMEDIATE' | 'DIPLOMA' | 'PRIOR_DEGREE';
export type AcademicValueType = 'RAW_MARKS' | 'PERCENTAGE' | 'CGPA' | 'GRADE';

/**
 * Strict Zod validation schema for canonical academic records.
 * Enforces:
 * - marks_obtained >= 0 and marks_obtained <= maximum_marks
 * - maximum_marks > 0
 * - percentage >= 0 and percentage <= 100
 * - cgpa >= 0 and cgpa <= 10
 * - Disallows arbitrary strings in numeric fields
 */
export const CanonicalAcademicEntrySchema = z.object({
  qualification: z.enum(['SSC', 'INTERMEDIATE', 'DIPLOMA', 'PRIOR_DEGREE']),
  value_type: z.enum(['RAW_MARKS', 'PERCENTAGE', 'CGPA', 'GRADE']),
  marks_obtained: z.number().min(0).nullable(),
  maximum_marks: z.number().positive().nullable(),
  percentage: z.number().min(0).max(100).nullable(),
  cgpa: z.number().min(0).max(10).nullable(),
  grade: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
  hall_ticket_no: z.string().nullable().optional(),
  display_summary: z.string(),
}).refine(data => {
  if (data.value_type === 'RAW_MARKS') {
    if (data.marks_obtained !== null && data.maximum_marks !== null) {
      return data.marks_obtained <= data.maximum_marks;
    }
  }
  return true;
}, {
  message: 'marks_obtained must be less than or equal to maximum_marks',
});

export type CanonicalAcademicEntry = z.infer<typeof CanonicalAcademicEntrySchema>;

export const StudentAcademicProfileSchema = z.object({
  student_id: z.string(),
  roll_number: z.string(),
  name: z.string(),
  ssc: CanonicalAcademicEntrySchema.nullable(),
  intermediate: CanonicalAcademicEntrySchema.nullable(),
  prior_degree: CanonicalAcademicEntrySchema.nullable(),
  highest_academic_percentage: z.number().min(0).max(100).nullable(),
  highest_academic_cgpa: z.number().min(0).max(10).nullable(),
  standing_arrears: z.number().int().min(0),
  requires_manual_review: z.boolean(),
  review_reasons: z.array(z.string()),
});

export type StudentAcademicProfile = z.infer<typeof StudentAcademicProfileSchema>;

/**
 * Validates a student academic profile against institutional business rules.
 */
export function validateAcademicProfile(profile: any): { valid: boolean; errors?: string[] } {
  const result = StudentAcademicProfileSchema.safeParse(profile);
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: (result.error.issues || []).map((e: any) => `${e.path.join('.')}: ${e.message}`),
  };
}
