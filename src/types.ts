// types.ts
// Types for multi-section tests: Physics, Chemistry, Maths, Biology

export type SubjectKey = 'physics' | 'chemistry' | 'maths' | 'biology';

// ========================
// Course type for PCM vs PCB
// ========================
export type CourseStream = 'PCM' | 'PCB';

export interface Question {
  question: string;
  questionImage?: string;
  options: string[];
  optionImages?: string[];
  correct: number;
  explanation?: string;
  explanationImage?: string;
}

export interface TestSection {
  subject: SubjectKey;
  marksPerQuestion?: number;
  questions: Question[];
}

// ========================
// Test types
// ========================

// 'mock' = full syllabus PCM/PCB with fixed two-phase timing
// 'custom' = teacher picks subjects and sets custom duration
export type TestType = 'mock' | 'custom';

export interface Test {
  _id: string;
  title: string;
  course: string;
  teacherId?: string | { _id: string; name?: string };
  coordinatorId?: string | { _id: string; name?: string };

  testType: TestType;

  // Which stream this mock test belongs to (only relevant for testType 'mock')
  stream?: CourseStream;

  sections: TestSection[];

  // --- Mock test timing (testType === 'mock') ---
  // Phase 1: Physics + Chemistry combined time in minutes (default 90)
  // Phase 2: Maths (PCM) or Biology (PCB) time in minutes (default 90)
  sectionTimings?: {
    physicsChemistry?: number;
    mathsOrBiology?: number;
  };

  // --- Custom test timing (testType === 'custom') ---
  // Total duration in minutes for the entire custom test
  customDuration?: number;

  // Which subjects are included in a custom test
  customSubjects?: SubjectKey[];

  // --- Answer key visibility control ---
  // When false, students only see score after submission
  // When true, students can view correct answers and explanations
  showAnswerKey: boolean;

  approved: boolean;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ========================
// Section Timings (for mock tests)
// ========================

export interface SectionTimings {
  physicsChemistry: number;
  mathsOrBiology: number;
}

// ========================
// Test-taking state
// ========================

export type TestPhase =
  | 'physics_chemistry'
  | 'maths_or_biology'
  | 'custom_active'
  | 'submitted';

export interface SectionAnswers {
  subject: SubjectKey;
  answers: Record<number, number>;
}

export interface TestTakingState {
  testId: string;
  testType: TestType;
  stream?: CourseStream;

  currentPhase: TestPhase;

  // --- Mock test timers (seconds remaining) ---
  physicsChemistryTimeLeft: number;
  mathsOrBiologyTimeLeft: number;

  // --- Custom test timer (seconds remaining) ---
  customTimeLeft: number;

  // answers keyed by "{subject}_{questionIndex}" e.g. "physics_0", "maths_3", "biology_2"
  answers: Record<string, number>;

  // Track which sections are locked (already submitted / auto-submitted)
  lockedSections: SubjectKey[];

  // Current active subject tab (for UI navigation)
  activeSubject: SubjectKey;
}

// ========================
// Submission & Results
// ========================

export interface QuestionResult {
  questionIndex: number;
  question: string;
  questionImage?: string;
  options: string[];
  optionImages?: string[];
  correctAnswer: number;
  studentAnswer: number | null;
  isCorrect: boolean;
  explanation: string;
  explanationImage?: string;
  marksAwarded: number;
  marksPerQuestion: number;
}

export interface SectionResult {
  subject: SubjectKey;
  score: number;
  maxScore: number;
  marksPerQuestion: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  questions: QuestionResult[];
}

export interface TestSubmission {
  _id: string;
  testId: string | Test;
  studentId: string | User;
  answers: Record<string, number>;

  sectionResults: SectionResult[];
  totalScore: number;
  totalMaxScore: number;
  percentage: number;

  canViewAnswerKey?: boolean;

  submittedAt: string;
  createdAt?: string;
}

// ========================
// Subject
// ========================

export interface Subject {
  _id: string;
  name: SubjectKey;
  course: string;
  teacherId?: string | User;
  label: string;
  createdAt?: string;
}

// ========================
// User, Course, Material
// ========================

export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin' | 'coordinator';
  course?: string;
  stream?: CourseStream;
  approved?: boolean;
  // For teachers: which subjects they teach (subject IDs)
  assignedSubjects?: string[];
}

export interface Course {
  _id: string;
  name: string;
  stream?: CourseStream;
  subjects?: Subject[] | string[];
}

export interface Material {
  _id: string;
  title: string;
  course: string | Course;
  subject: string;
  content: string;
  type: 'notes' | 'video' | 'pdf';
  teacherId: string | User;
  createdAt?: string;
}

// ========================
// Helper type for creating tests (teacher form)
// ========================

export interface CreateTestPayload {
  title: string;
  course: string;
  testType: TestType;

  stream?: CourseStream;

  sections: {
    subject: SubjectKey;
    marksPerQuestion?: number;
    questions: {
      question: string;
      questionImage?: string;
      options: string[];
      optionImages?: string[];
      correct: number;
      explanation?: string;
      explanationImage?: string;
    }[];
  }[];

  sectionTimings?: {
    physicsChemistry?: number;
    mathsOrBiology?: number;
  };

  customDuration?: number;
  customSubjects?: SubjectKey[];

  showAnswerKey?: boolean;
}

// ========================
// Teacher action types
// ========================

export interface ToggleAnswerKeyPayload {
  testId: string;
  showAnswerKey: boolean;
}

// ========================
// CSV Template row (for bulk upload)
// ========================

export interface CSVQuestionRow {
  section: SubjectKey;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

// ========================
// Timer configuration helper
// ========================

export interface TimerConfig {
  phase1Duration: number; // seconds for Physics + Chemistry
  phase2Duration: number; // seconds for Maths/Biology
  totalDuration: number;  // seconds for entire custom test
}

export function getTimerConfig(test: Test): TimerConfig {
  if (test.testType === 'mock') {
    const phyChem = (test.sectionTimings?.physicsChemistry ?? 90) * 60;
    const mathBio = (test.sectionTimings?.mathsOrBiology ?? 90) * 60;
    return {
      phase1Duration: phyChem,
      phase2Duration: mathBio,
      totalDuration: phyChem + mathBio,
    };
  } else {
    const total = (test.customDuration ?? 60) * 60;
    return {
      phase1Duration: 0,
      phase2Duration: 0,
      totalDuration: total,
    };
  }
}

// Phase 1 is always Physics + Chemistry regardless of stream
export function getPhase1Subjects(): SubjectKey[] {
  return ['physics', 'chemistry'];
}

export function getPhase2Subject(stream?: CourseStream): SubjectKey {
  return stream === 'PCB' ? 'biology' : 'maths';
}

export function isSubjectLocked(
  state: TestTakingState,
  subject: SubjectKey
): boolean {
  return state.lockedSections.includes(subject);
}

export function canNavigateToSubject(
  state: TestTakingState,
  subject: SubjectKey
): boolean {
  if (state.currentPhase === 'submitted') return false;

  if (state.testType === 'custom') {
    return state.currentPhase === 'custom_active';
  }

  // Mock test navigation rules
  const phase1Subjects = getPhase1Subjects();
  const phase2Subject = getPhase2Subject(state.stream);

  if (state.currentPhase === 'physics_chemistry') {
    return phase1Subjects.includes(subject);
  }

  if (state.currentPhase === 'maths_or_biology') {
    return subject === phase2Subject;
  }

  return false;
}

export function createInitialTestTakingState(
  test: Test
): TestTakingState {
  const timerConfig = getTimerConfig(test);

  if (test.testType === 'mock') {
    return {
      testId: test._id,
      testType: 'mock',
      stream: test.stream,
      currentPhase: 'physics_chemistry',
      physicsChemistryTimeLeft: timerConfig.phase1Duration,
      mathsOrBiologyTimeLeft: timerConfig.phase2Duration,
      customTimeLeft: 0,
      answers: {},
      lockedSections: [],
      activeSubject: 'physics',
    };
  } else {
    const firstSubject = test.sections[0]?.subject ?? 'physics';
    return {
      testId: test._id,
      testType: 'custom',
      currentPhase: 'custom_active',
      physicsChemistryTimeLeft: 0,
      mathsOrBiologyTimeLeft: 0,
      customTimeLeft: timerConfig.totalDuration,
      answers: {},
      lockedSections: [],
      activeSubject: firstSubject,
    };
  }
}