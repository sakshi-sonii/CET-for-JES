// Types for multi-section tests: Physics, Chemistry, Maths

export interface Question {
  question: string;
  questionImage?: string;
  options: string[];
  optionImages?: string[];
  correct: number;
  explanation?: string;
  explanationImage?: string;  // ← NEW
}

export interface TestSection {
  subject: "physics" | "chemistry" | "maths";
  marksPerQuestion: number; // 1 for physics/chemistry, 2 for maths
  questions: Question[];
}

export interface SectionTimings {
  physicsChemistry: number; // minutes for physics + chemistry combined (default 90)
  maths: number; // minutes for maths section (default 90)
}

export interface Test {
  _id: string;
  title: string;
  course: string;
  sections: TestSection[];
  sectionTimings: SectionTimings;
  totalDuration: number; // total in minutes (default 180)
  teacherId: string;
  approved: boolean;
  active: boolean;
  createdAt: string;
}

// ========================
// Test-taking state
// ========================

// Which timed phase the student is currently in
export type TestPhase = "physics_chemistry" | "maths" | "submitted";

export interface SectionAnswers {
  subject: string;
  // key = question index within the section, value = selected option index
  answers: Record<number, number>;
}

export interface TestTakingState {
  testId: string;
  currentPhase: TestPhase;
  physicsChemistryTimeLeft: number; // seconds remaining for phase 1
  mathsTimeLeft: number; // seconds remaining for phase 2
  // answers keyed by "{subject}_{questionIndex}" e.g. "physics_0", "maths_3"
  answers: Record<string, number>;
}

// ========================
// Submission & Results
// ========================

export interface QuestionResult {
  questionIndex: number;
  question: string;
  options: string[];
  correctAnswer: number; // index of correct option
  studentAnswer: number | null; // index student chose, null if unanswered
  isCorrect: boolean;
  explanation: string;
  marksAwarded: number; // 0 if wrong/unanswered, marksPerQuestion if correct
  marksPerQuestion: number; // 1 for phy/chem, 2 for maths
}

export interface SectionResult {
  subject: "physics" | "chemistry" | "maths";
  score: number; // marks obtained in this section
  maxScore: number; // max possible marks in this section
  marksPerQuestion: number;
  questions: QuestionResult[];
}

export interface TestSubmission {
  _id: string;
  testId: string | Test; // populated or just ID
  studentId: string | User; // populated or just ID
  answers: Record<string, number>; // raw answers keyed by "{subject}_{questionIndex}"
  sectionResults: SectionResult[];
  totalScore: number;
  totalMaxScore: number;
  percentage: number;
  submittedAt: string;
}

// ========================
// User, Course, Material
// ========================

export interface User {
  _id: string;
  name: string;
  email: string;
  role: "student" | "teacher" | "admin";
  course?: string;
  approved?: boolean;
}

export interface Course {
  _id: string;
  name: string;
}

export interface Material {
  _id: string;
  title: string;
  course: string | Course; // can be populated
  subject: string;
  content: string;
  type: "notes" | "video" | "pdf";
  teacherId: string | User; // can be populated
  createdAt?: string;
}

// ========================
// Helper type for creating tests (teacher form)
// ========================

export interface CreateTestPayload {
  title: string;
  course: string;
  sections: {
    subject: "physics" | "chemistry" | "maths";
    questions: {
      question: string;
      options: string[];
      correct: number;
      explanation?: string;
    }[];
  }[];
}

// ========================
// CSV Template row (for bulk upload)
// ========================

export interface CSVQuestionRow {
  section: "physics" | "chemistry" | "maths";
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: "A" | "B" | "C" | "D";
  explanation: string;
}

