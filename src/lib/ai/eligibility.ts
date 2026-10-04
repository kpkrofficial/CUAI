export interface EligibilityCriterion {
  name: string;
  required: string;
  studentValue: string;
  passed: boolean;
}

export interface EligibilityResult {
  policyName: string;
  eligible: boolean;
  verdict: 'ELIGIBLE' | 'INELIGIBLE' | 'INCOMPLETE_DATA';
  score: number;
  maxScore: number;
  criteria: EligibilityCriterion[];
  summary: string;
}

export class EligibilityEngine {
  /**
   * Deterministically evaluates Merit Scholarship eligibility.
   * Hard requirements:
   * 1. High Academic Performance: Either CGPA >= 8.5, or Intermediate/Diploma >= 85%, or SSC >= 85%.
   * 2. Clear Academic Standing: 0 standing arrears.
   */
  static evaluateMeritScholarship(student: Record<string, any>): EligibilityResult {
    const criteria: EligibilityCriterion[] = [];
    let passCount = 0;

    // 1. Check CGPA or Secondary marks
    let academicScore = 0;
    let academicPassed = false;
    let scoreDetail = 'N/A';

    if (student.cgpa) {
      const val = parseFloat(student.cgpa);
      academicScore = isNaN(val) ? 0 : val;
      academicPassed = academicScore >= 8.5;
      scoreDetail = `CGPA: ${student.cgpa}`;
    } else if (student.inter_marks || student.twelfth_percentage) {
      const raw = student.inter_marks || student.twelfth_percentage;
      const val = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
      academicScore = isNaN(val) ? 0 : val;
      academicPassed = academicScore >= 85;
      scoreDetail = `Intermediate: ${raw}%`;
    } else if (student.ssc_marks || student.tenth_percentage) {
      const raw = student.ssc_marks || student.tenth_percentage;
      const val = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
      academicScore = isNaN(val) ? 0 : val;
      academicPassed = academicScore >= 85;
      scoreDetail = `SSC: ${raw}%`;
    }

    criteria.push({
      name: 'Minimum Academic Benchmark',
      required: 'CGPA >= 8.5 or Marks >= 85%',
      studentValue: scoreDetail,
      passed: academicPassed,
    });
    if (academicPassed) passCount++;

    // 2. Standing Arrears (Must be 0)
    const arrearsRaw = student.standing_arrears || student.history_of_arrears || '0';
    const arrears = parseInt(String(arrearsRaw).replace(/[^0-9]/g, '') || '0', 10);
    const arrearsPassed = arrears === 0;

    criteria.push({
      name: 'Standing Backlogs / Arrears',
      required: '0 Active Backlogs',
      studentValue: `${arrears} Backlogs`,
      passed: arrearsPassed,
    });
    if (arrearsPassed) passCount++;

    // 3. Admission Verification
    const hasAdmission = !!student.roll_number && (student.is_draft === 0 || !student.is_draft);
    criteria.push({
      name: 'Verified Enrollment Status',
      required: 'Enrolled and Non-Draft Student',
      studentValue: hasAdmission ? 'Verified Enrolled' : 'Pending Verification',
      passed: hasAdmission,
    });
    if (hasAdmission) passCount++;

    const isEligible = passCount === 3;
    const verdict = isEligible ? 'ELIGIBLE' : 'INELIGIBLE';

    const summary = isEligible
      ? `Student ${student.name} (${student.roll_number}) meets all verified deterministic criteria for the Merit Scholarship with ${scoreDetail} and 0 standing backlogs.`
      : `Student ${student.name} (${student.roll_number}) does NOT meet all requirements for the Merit Scholarship. Failed criteria: ${criteria.filter(c => !c.passed).map(c => c.name).join(', ')}.`;

    return {
      policyName: 'Merit Scholarship Policy 2026',
      eligible: isEligible,
      verdict,
      score: passCount,
      maxScore: criteria.length,
      criteria,
      summary,
    };
  }

  /**
   * Deterministically evaluates Campus Placement Drives eligibility.
   */
  static evaluatePlacementEligibility(student: Record<string, any>): EligibilityResult {
    const criteria: EligibilityCriterion[] = [];
    let passCount = 0;

    // CGPA >= 7.0
    let cgpaPassed = false;
    let cgpaVal = 0;
    if (student.cgpa) {
      cgpaVal = parseFloat(student.cgpa) || 0;
      cgpaPassed = cgpaVal >= 7.0;
    } else {
      cgpaPassed = true; // Conditional pass for intake applicants
    }

    criteria.push({
      name: 'Placement Minimum CGPA',
      required: 'CGPA >= 7.0',
      studentValue: student.cgpa ? `${student.cgpa}` : 'In progress',
      passed: cgpaPassed,
    });
    if (cgpaPassed) passCount++;

    // Standing backlogs
    const arrears = parseInt(student.standing_arrears || '0', 10);
    const arrearsPassed = arrears === 0;
    criteria.push({
      name: 'No Active Arrears',
      required: '0 Standing Arrears',
      studentValue: `${arrears} Arrears`,
      passed: arrearsPassed,
    });
    if (arrearsPassed) passCount++;

    const isEligible = passCount === criteria.length;

    return {
      policyName: 'Campus Placement Drive Regulations',
      eligible: isEligible,
      verdict: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
      score: passCount,
      maxScore: criteria.length,
      criteria,
      summary: isEligible
        ? `Student is verified eligible for Campus Placement Drives.`
        : `Student is currently ineligible for Placement Drives due to unsatisfied criteria.`,
    };
  }
}
