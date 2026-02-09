import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/quizplatform";

// Connection cache
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((mongoose) => {
      return mongoose;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

// ============== SCHEMAS ==============

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ["admin", "teacher", "student"], required: true },
  approved: { type: Boolean, default: false },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  createdAt: { type: Date, default: Date.now },
});

// Course Schema
const courseSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

// Question Sub-Schema (used inside sections)
const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: [{ type: String, required: true }],
    correct: { type: Number, required: true },
    explanation: { type: String, default: "" },
    questionImage: { type: String, default: "" },
    optionImages: [{ type: String }],
  },
  { _id: false }
);

// Section Sub-Schema
const sectionSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      enum: ["physics", "chemistry", "maths"],
    },
    marksPerQuestion: { type: Number, required: true },
    questions: [questionSchema],
  },
  { _id: false }
);

// Test Schema — 3 sections (Physics, Chemistry, Maths)
const testSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    sections: { type: [sectionSchema], required: true },
    sectionTimings: {
      physicsChemistry: { type: Number, default: 90 }, // minutes for Physics + Chemistry combined
      maths: { type: Number, default: 90 }, // minutes for Maths
    },
    totalDuration: { type: Number, default: 180 }, // total minutes
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approved: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ============== TEST SUBMISSION SCHEMAS ==============

// Per-question result stored in submission
const questionResultSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true },
    question: { type: String, required: true },
    options: [{ type: String }],
    correctAnswer: { type: Number, required: true },
    studentAnswer: { type: Number, default: null },
    isCorrect: { type: Boolean, required: true },
    explanation: { type: String, default: "" },
    marksAwarded: { type: Number, required: true },
    marksPerQuestion: { type: Number, required: true },
  },
  { _id: false }
);

// Per-section result stored in submission
const sectionResultSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true },
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    marksPerQuestion: { type: Number, required: true },
    questions: [questionResultSchema],
  },
  { _id: false }
);

// Test Submission Schema
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

// Prevent duplicate submissions
testSubmissionSchema.index({ testId: 1, studentId: 1 }, { unique: true });

// Legacy Attempt Schema (kept for backward compatibility)
const attemptSchema = new mongoose.Schema({
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
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  answers: { type: Map, of: Number },
  submittedAt: { type: Date, default: Date.now },
});

// Material Schema
const materialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  subject: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, enum: ["notes", "video", "pdf"], required: true },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

// ============== MODELS ==============

export const User = (mongoose.models.User ||
  mongoose.model("User", userSchema)) as mongoose.Model<any>;

export const Course = (mongoose.models.Course ||
  mongoose.model("Course", courseSchema)) as mongoose.Model<any>;

export const Test = (mongoose.models.Test ||
  mongoose.model("Test", testSchema)) as mongoose.Model<any>;

export const TestSubmission = (mongoose.models.TestSubmission ||
  mongoose.model(
    "TestSubmission",
    testSubmissionSchema
  )) as mongoose.Model<any>;

export const Attempt = (mongoose.models.Attempt ||
  mongoose.model("Attempt", attemptSchema)) as mongoose.Model<any>;

export const Material = (mongoose.models.Material ||
  mongoose.model("Material", materialSchema)) as mongoose.Model<any>;

// ============== AUTH HELPERS ==============

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "your-super-secret-jwt-key-change-in-production";

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};

export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateToken = (userId: string, role: string): string => {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "7d" });
};

export const verifyToken = (
  token: string
): { userId: string; role: string } | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
  } catch {
    return null;
  }
};

// ============== REQUEST HELPERS ==============

import { VercelRequest } from "@vercel/node";

export const getUserFromRequest = async (req: VercelRequest) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return null;
  }

  await connectDB();
  const user = await User.findById(decoded.userId).select("-password");

  return user;
};

// ============== SEED ADMIN ==============

export const seedAdmin = async () => {
  await connectDB();

  const adminExists = await User.findOne({ role: "admin" });

  if (!adminExists) {
    const hashedPassword = await hashPassword("admin123");
    await User.create({
      email: "admin@quiz.com",
      password: hashedPassword,
      name: "Admin",
      role: "admin",
      approved: true,
    });
    console.log("Admin user created: admin@quiz.com / admin123");
  }
};