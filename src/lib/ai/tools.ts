import { StudentService } from '@/lib/services/student.service';
import { EligibilityEngine } from './eligibility';
import { createAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/types';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiresAdmin?: boolean;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  data?: any;
  error?: string;
  citations?: any[];
}

export const CHATBOT_TOOLS: ToolDefinition[] = [
  {
    name: 'getStudentProfile',
    description: 'Retrieve authorized student profile information (name, branch, year, college, academic info). Students may only retrieve their own record.',
    parameters: {
      type: 'object',
      properties: {
        rollNumber: {
          type: 'string',
          description: 'The student registration / roll number (e.g. 23CSE104). If omitted by a student, retrieves own profile.',
        },
      },
    },
  },
  {
    name: 'searchStudents',
    description: 'Administrative tool: Search students by name, branch, or year within the current campus. Restricted to Staff and Administrators.',
    requiresAdmin: true,
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Name or roll number search keyword' },
        branch: { type: 'string', description: 'Department/Branch filter (e.g. CSE)' },
        year: { type: 'string', description: 'Academic year (e.g. 2nd_year)' },
      },
    },
  },
  {
    name: 'countStudents',
    description: 'Administrative tool: Perform exact database aggregation counts for students matching branch, year, or application status. Restricted to Staff and Administrators.',
    requiresAdmin: true,
    parameters: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Department/Branch filter (e.g. CSE)' },
        year: { type: 'string', description: 'Academic year (e.g. 2nd_year)' },
        folderId: { type: 'string', description: 'Folder filter (e.g. folder_2nd_year)' },
      },
    },
  },
  {
    name: 'getApplicationStatus',
    description: 'Check the official intake/admission application status and details. Students may only check their own application.',
    parameters: {
      type: 'object',
      properties: {
        rollNumber: { type: 'string', description: 'Student roll number to look up' },
      },
    },
  },
  {
    name: 'searchApplications',
    description: 'Administrative tool: Search or count applications/intake submissions. Restricted to Staff and Administrators.',
    requiresAdmin: true,
    parameters: {
      type: 'object',
      properties: {
        year: { type: 'string', description: 'Academic year filter' },
        folderId: { type: 'string', description: 'Intake folder ID' },
      },
    },
  },
  {
    name: 'getFormSubmission',
    description: 'Retrieve submitted registration form fields and uploaded document records for verification.',
    parameters: {
      type: 'object',
      properties: {
        rollNumber: { type: 'string', description: 'Student roll number' },
      },
    },
  },
  {
    name: 'searchAcademicRecords',
    description: 'Retrieve student academic performance, percentages, and marks without exposing sensitive personal identifiers.',
    parameters: {
      type: 'object',
      properties: {
        rollNumber: { type: 'string', description: 'Student roll number' },
      },
    },
  },
  {
    name: 'getEligibilityData',
    description: 'Deterministically evaluate student eligibility for Scholarships or Campus Placement Drives using verified business rules.',
    parameters: {
      type: 'object',
      properties: {
        rollNumber: { type: 'string', description: 'Student roll number to evaluate' },
        policyType: {
          type: 'string',
          enum: ['merit_scholarship', 'placement'],
          description: 'The specific institutional policy to evaluate against',
        },
      },
      required: ['rollNumber', 'policyType'],
    },
  },
  {
    name: 'searchKnowledge',
    description: 'Search campus rules, admission guidelines, refund policy, FAQs, and procedures from verified campus documents.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question or keyword to search in campus knowledge' },
      },
      required: ['query'],
    },
  },
];

export class ToolExecutionEngine {
  /**
   * Authorizes and executes a strongly typed tool invocation.
   * Enforces role, tenant, and student self-access boundaries BEFORE tool execution.
   */
  static async executeTool(
    name: string,
    args: Record<string, any>,
    context: AuthContext
  ): Promise<ToolResult> {
    try {
      const toolDef = CHATBOT_TOOLS.find((t) => t.name === name);
      if (!toolDef) {
        return { tool: name, success: false, error: `Unknown tool: ${name}` };
      }

      // 1. Role-based Tool Authorization
      if (toolDef.requiresAdmin && context.role === 'student') {
        return {
          tool: name,
          success: false,
          error: `Authorization Error: The tool "${name}" requires administrative privileges. Students cannot access administrative directories or bulk analytics.`,
        };
      }

      switch (name) {
        case 'getStudentProfile': {
          let targetRoll = args.rollNumber;
          if (!targetRoll && context.role === 'student') {
            const own = await StudentService.getOwnStudentProfile(context, { forChat: true });
            if (!own) return { tool: name, success: false, error: 'Could not find a verified record matching your student profile.' };
            return { tool: name, success: true, data: own };
          }

          if (!targetRoll) {
            return { tool: name, success: false, error: 'rollNumber is required to look up a student profile.' };
          }

          try {
            const student = await StudentService.getStudentByRoll(targetRoll, context, { forChat: true });
            if (!student) {
              return { tool: name, success: false, error: `I could not find a verified record matching roll number "${targetRoll}".` };
            }
            return { tool: name, success: true, data: student };
          } catch (accessErr: any) {
            return { tool: name, success: false, error: accessErr.message };
          }
        }

        case 'searchStudents': {
          const result = await StudentService.listStudents(
            { search: args.search, branch: args.branch, year: args.year, limit: 10 },
            context
          );
          const sanitized = result.students.map(s => ({
            name: s.name,
            roll_number: s.roll_number,
            branch: s.branch,
            year: s.year,
            college: s.college,
          }));
          return { tool: name, success: true, data: { total: result.total, students: sanitized } };
        }

        case 'countStudents': {
          const count = await StudentService.countStudents(
            { branch: args.branch, year: args.year, folderId: args.folderId },
            context
          );
          return { tool: name, success: true, data: { count, criteria: args } };
        }

        case 'getApplicationStatus': {
          let targetRoll = args.rollNumber;
          if (!targetRoll && context.role === 'student') {
            const own = await StudentService.getOwnStudentProfile(context);
            targetRoll = own?.roll_number;
          }
          if (!targetRoll) return { tool: name, success: false, error: 'rollNumber is required.' };

          const student = await StudentService.getStudentByRoll(targetRoll, context);
          if (!student) {
            return { tool: name, success: false, error: `No application found matching "${targetRoll}".` };
          }

          return {
            tool: name,
            success: true,
            data: {
              roll_number: student.roll_number,
              name: student.name,
              application_status: student.is_draft === 1 ? 'Pending Draft' : 'Verified Enrolled',
              branch: student.branch,
              year: student.year,
              college: student.college,
              submitted_at: student.created_at,
            },
          };
        }

        case 'searchApplications': {
          const count = await StudentService.countStudents({ year: args.year, folderId: args.folderId }, context);
          return { tool: name, success: true, data: { count, filter: args } };
        }

        case 'getFormSubmission': {
          let targetRoll = args.rollNumber;
          if (!targetRoll && context.role === 'student') {
            const own = await StudentService.getOwnStudentProfile(context);
            targetRoll = own?.roll_number;
          }
          if (!targetRoll) return { tool: name, success: false, error: 'rollNumber is required.' };

          const student = await StudentService.getStudentByRoll(targetRoll, context, { forChat: true });
          if (!student) {
            return { tool: name, success: false, error: `No submitted form found for "${targetRoll}".` };
          }
          return { tool: name, success: true, data: student };
        }

        case 'searchAcademicRecords': {
          let targetRoll = args.rollNumber;
          if (!targetRoll && context.role === 'student') {
            const own = await StudentService.getOwnStudentProfile(context);
            targetRoll = own?.roll_number;
          }
          if (!targetRoll) return { tool: name, success: false, error: 'rollNumber is required.' };

          const student = await StudentService.getStudentByRoll(targetRoll, context);
          if (!student) {
            return { tool: name, success: false, error: `No academic records found for "${targetRoll}".` };
          }

          const academic = student.canonical_academic || student.student_data?.canonical_academic;

          return {
            tool: name,
            success: true,
            data: {
              roll_number: student.roll_number,
              name: student.name,
              branch: student.branch,
              year: student.year,
              ssc_marks: student.ssc_marks,
              inter_marks: student.inter_marks,
              diploma_marks: student.diploma_marks,
              canonical_academic: academic,
              academic_summary: {
                ssc: academic?.ssc?.display_summary || (student.ssc_marks ? `${student.ssc_marks}/600` : null),
                intermediate: academic?.intermediate?.display_summary || (student.inter_marks ? `${student.inter_marks}%` : null),
                cgpa: academic?.highest_academic_cgpa !== null && academic?.highest_academic_cgpa !== undefined ? academic.highest_academic_cgpa : null,
                grade: academic?.ssc?.grade || null,
                classification: academic?.ssc?.classification || null,
              },
            },
          };
        }

        case 'getEligibilityData': {
          const student = await StudentService.getStudentByRoll(args.rollNumber, context);
          if (!student) {
            return {
              tool: name,
              success: false,
              error: `Student record "${args.rollNumber}" not found for eligibility evaluation.`,
            };
          }

          let evaluation;
          if (args.policyType === 'merit_scholarship') {
            evaluation = EligibilityEngine.evaluateMeritScholarship(student);
          } else {
            evaluation = EligibilityEngine.evaluatePlacementEligibility(student);
          }

          return {
            tool: name,
            success: true,
            data: evaluation,
          };
        }

        case 'searchKnowledge': {
          const client = createAdminClient();
          const campusId = context.campusId || 'de1a8da7-a875-4648-94c8-3e642ed6c45c';

          // Search knowledge_chunks strictly bound to user's campus
          const { data: chunks, error } = await client
            .from('knowledge_chunks')
            .select('id, content, metadata, chunk_index, knowledge_documents(title, category, version, effective_date)')
            .eq('campus_id', campusId)
            .ilike('content', `%${args.query.trim().split(' ')[0]}%`)
            .limit(3);

          if (error || !chunks || chunks.length === 0) {
            // General campus fallback
            const { data: fallbackChunks } = await client
              .from('knowledge_chunks')
              .select('id, content, metadata, chunk_index, knowledge_documents(title, category, version, effective_date)')
              .eq('campus_id', campusId)
              .limit(3);

            if (!fallbackChunks || fallbackChunks.length === 0) {
              return {
                tool: name,
                success: false,
                error: 'I could not find a verified campus policy or document supporting that answer.',
              };
            }

            const citations = fallbackChunks.map(c => ({
              document: (c.knowledge_documents as any)?.title || 'Campus Guide',
              section: (c.metadata as any)?.section || 'General',
              page: (c.metadata as any)?.page || 1,
              version: (c.knowledge_documents as any)?.version || 1,
              effective_date: (c.knowledge_documents as any)?.effective_date || '2026-01-01',
            }));

            return {
              tool: name,
              success: true,
              data: fallbackChunks.map(c => c.content),
              citations,
            };
          }

          const citations = chunks.map(c => ({
            document: (c.knowledge_documents as any)?.title || 'Campus Guide',
            section: (c.metadata as any)?.section || 'General',
            page: (c.metadata as any)?.page || 1,
            version: (c.knowledge_documents as any)?.version || 1,
            effective_date: (c.knowledge_documents as any)?.effective_date || '2026-01-01',
          }));

          return {
            tool: name,
            success: true,
            data: chunks.map(c => c.content),
            citations,
          };
        }

        default:
          return { tool: name, success: false, error: `Unhandled tool: ${name}` };
      }
    } catch (err: any) {
      console.error(`[ToolExecutionEngine] Tool ${name} error:`, err);
      return { tool: name, success: false, error: err.message || 'Tool execution error' };
    }
  }
}
