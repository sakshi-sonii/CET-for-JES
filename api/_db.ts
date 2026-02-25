import mongoose from "mongoose";

// ============== CONNECTION ==============

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/quizplatform";

let cached = (global as any).mongoose;
if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // Reset if connection dropped
  cached.conn = null;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        bufferCommands: false,
        retryWrites: true,
        retryReads: true,
      })
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    cached.conn = null;
    throw err;
  }

  return cached.conn;
}

// ============== RETRY HELPER ==============

const TRANSIENT_ERRORS = new Set([
  "MongoNetworkError",
  "MongoServerSelectionError",
]);

const TRANSIENT_MESSAGES = [
  "ECONNRESET",
  "connection pool",
  "topology was destroyed",
  "buffering timed out",
  "socket disconnected",
  "socket hang up",
];

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 500
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      const isTransient =
        TRANSIENT_ERRORS.has(error.name) ||
        TRANSIENT_MESSAGES.some((msg) => error.message?.includes(msg));

      if (!isTransient || attempt >= maxRetries) throw error;

      // Reset connection on network-level errors
      cached.conn = null;
      cached.promise = null;

      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }

  throw lastError;
}

// ============== SCHEMAS ==============

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, default: "" },
    questionImage: { type: String, default: "" },
    options: [{ type: String, default: "" }],
    optionImages: [{ type: String, default: "" }],
    correct: { type: Number, required: true },
    explanation: { type: String, default: "" },
    explanationImage: { type: String, default: "" },
  },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      enum: ["physics", "chemistry", "maths", "biology"],
    },
    marksPerQuestion: { type: Number, required: true },
    questions: [questionSchema],
  },
  { _id: false }
);

const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    // Created by teacher (when uploading questions for their subject)
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Created by coordinator (when combining questions from multiple subjects)
    coordinatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // 'mock' = PCM/PCB two-phase, 'custom' = single timer any subjects
    testType: {
      type: String,
      enum: ["mock", "custom"],
      default: "custom",
    },

    // PCM or PCB (only for mock tests)
    stream: {
      type: String,
      enum: ["PCM", "PCB"],
    },

    sections: { type: [sectionSchema], required: true },

    // Mock test phase timings (minutes)
    sectionTimings: {
      physicsChemistry: { type: Number, default: 90 },
      mathsOrBiology: { type: Number, default: 90 },
    },

    // Custom test total duration (minutes)
    customDuration: { type: Number },

    // Quick reference for custom test subjects
    customSubjects: [
      {
        type: String,
        enum: ["physics", "chemistry", "maths", "biology"],
      },
    ],

    // Coordinator/Admin controls when students can see correct answers & explanations
    showAnswerKey: { type: Boolean, default: false },

    // Teacher -> Coordinator -> Admin review workflow
    reviewStatus: {
      type: String,
      enum: [
        "submitted_to_coordinator",
        "changes_requested",
        "accepted_by_coordinator",
        "submitted_to_admin",
        "approved",
      ],
      default: "submitted_to_coordinator",
    },
    reviewComment: { type: String, default: "" },
    reviewedAt: { type: Date },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // For chunked tests: ID of parent test (if this is a chunk)
    parentTestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
    },

    // For chunked tests: chunk info (e.g., "part 1 of 3")
    chunkInfo: {
      current: { type: Number },
      total: { type: Number },
    },

    // Quick reference for subjects included (derived from sections)
    subjectsIncluded: [
      {
        type: String,
        enum: ["physics", "chemistry", "maths", "biology"],
      },
    ],

    approved: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
  },
  { timestamps: true }
);

testSchema.index({ course: 1, approved: 1, active: 1 });
testSchema.index({ teacherId: 1 });
testSchema.index({ coordinatorId: 1 });
testSchema.index({ parentTestId: 1 });

const questionResultSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    question: { type: String, default: "" },
    questionImage: { type: String, default: "" },
    options: [{ type: String }],
    optionImages: [{ type: String }],
    correctAnswer: { type: Number, required: true },
    studentAnswer: { type: Number, default: null },
    isCorrect: { type: Boolean, required: true },
    explanation: { type: String, default: "" },
    explanationImage: { type: String, default: "" },
    marksAwarded: { type: Number, required: true },
    marksPerQuestion: { type: Number, required: true },
  },
  { _id: false }
);

const sectionResultSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      enum: ["physics", "chemistry", "maths", "biology"],
    },
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    marksPerQuestion: { type: Number, required: true },
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
    questions: [questionResultSchema],
  },
  { _id: false }
);

const testSubmissionSchema = new mongoose.Schema(
  {
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    answers: { type: mongoose.Schema.Types.Mixed, required: true },
    sectionResults: [sectionResultSchema],
    totalScore: { type: Number, required: true },
    totalMaxScore: { type: Number, required: true },
    percentage: { type: Number, required: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

testSubmissionSchema.index({ testId: 1, studentId: 1 }, { unique: true });
testSubmissionSchema.index({ studentId: 1 });
testSubmissionSchema.index({ testId: 1, percentage: -1 });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  role: {
    type: String,
    enum: ["admin", "teacher", "student", "coordinator"],
    required: true,
  },
  approved: { type: Boolean, default: false },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  stream: { type: String, enum: ["PCM", "PCB"] },
  // For teachers: which subjects they teach in their course
  assignedSubjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ role: 1, approved: 1 });
userSchema.index({ course: 1 });

const subjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ["physics", "chemistry", "maths", "biology"],
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: { type: Date, default: Date.now },
});

subjectSchema.index({ course: 1 });
subjectSchema.index({ teacherId: 1 });

const courseSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: "" },
  stream: { type: String, enum: ["PCM", "PCB"] },
  // Array of subject IDs
  subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
  createdAt: { type: Date, default: Date.now },
});

const materialSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  subject: { type: String, required: true },
  content: { type: String, required: true },
  type: {
    type: String,
    enum: ["notes", "video", "pdf"],
    required: true,
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

materialSchema.index({ course: 1 });
materialSchema.index({ teacherId: 1 });

// ============== MODELS ==============

export const User = (mongoose.models.User ||
  mongoose.model("User", userSchema)) as mongoose.Model<any>;
export const Course = (mongoose.models.Course ||
  mongoose.model("Course", courseSchema)) as mongoose.Model<any>;
export const Subject = (mongoose.models.Subject ||
  mongoose.model("Subject", subjectSchema)) as mongoose.Model<any>;
export const Test = (mongoose.models.Test ||
  mongoose.model("Test", testSchema)) as mongoose.Model<any>;
export const TestSubmission = (mongoose.models.TestSubmission ||
  mongoose.model(
    "TestSubmission",
    testSubmissionSchema
  )) as mongoose.Model<any>;
export const Material = (mongoose.models.Material ||
  mongoose.model("Material", materialSchema)) as mongoose.Model<any>;

// ============== AUTH HELPERS ==============

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "your-super-secret-jwt-key-change-in-production";

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, 10);

export const comparePassword = (
  password: string,
  hash: string
): Promise<boolean> => bcrypt.compare(password, hash);

export const generateToken = (userId: string, role: string): string =>
  jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });

export const verifyToken = (
  token: string
): { userId: string; role: string } | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
    };
  } catch {
    return null;
  }
};

// ============== REQUEST HELPERS ==============

import { VercelRequest } from "@vercel/node";

export const getUserFromRequest = async (req: VercelRequest) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const decoded = verifyToken(authHeader.slice(7));
  if (!decoded) return null;

  await connectDB();
  return withRetry(() =>
    User.findById(decoded.userId).select("-password").lean()
  );
};

// ============== SEED ADMIN ==============

export const seedAdmin = async () => {
  await connectDB();

  const exists = await withRetry(() =>
    User.exists({ role: "admin" })
  );

  if (!exists) {
    const hashed = await hashPassword("admin123");
    await User.create({
      email: "admin@quiz.com",
      password: hashed,
      name: "Admin",
      role: "admin",
      approved: true,
    });
    console.log("Admin seeded: admin@quiz.com / admin123");
  }
};
