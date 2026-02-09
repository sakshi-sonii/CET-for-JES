export interface User {
  id: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  name: string;
  approved: boolean;
  course?: string;
}

export interface Question {
  question: string;
  questionImage?: string;
  options: string[];
  optionImages?: string[];
  correct: number;
  explanation?: string;
}

export interface Test {
  id: string;
  title: string;
  course: string;
  subject: string;
  duration: number;
  questions: Question[];
  teacherId: string;
  approved: boolean;
  active: boolean;
  createdAt: string;
}

export interface Course {
  id: string;
  name: string;
  description: string;
}

export interface Material {
  id: string;
  title: string;
  course: string;
  subject: string;
  content: string;
  type: 'notes' | 'video' | 'pdf';
  teacherId: string;
  createdAt: string;
}

export interface Attempt {
  id: string;
  testId: string;
  studentId: string;
  score: number;
  total: number;
  answers: Record<number, number>;
  submittedAt: string;
  shuffledOrder?: number[];
}
