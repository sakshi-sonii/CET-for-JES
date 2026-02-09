import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    await connectDB();
    const currentUser = await getUserFromRequest(req);

    if (!currentUser) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // GET /api/tests - Get all tests
    if (req.method === "GET") {
      let query = {};

      // Students can only see approved and active tests for their course
      if (currentUser.role === "student") {
        query = {
          approved: true,
          active: true,
          course: currentUser.course,
        };
      }
      // Teachers can see their own tests
      else if (currentUser.role === "teacher") {
        query = { teacherId: currentUser._id };
      }
      // Admin can see all tests

      const tests = await Test.find(query).sort({ createdAt: -1 });
      return res.status(200).json(tests);
    }

    // POST /api/tests - Create test (teacher only)
    if (req.method === "POST") {
      if (currentUser.role !== "teacher") {
        return res.status(403).json({ message: "Only teachers can create tests" });
      }

      if (!currentUser.approved) {
        return res.status(403).json({ message: "Your account is not approved yet" });
      }

      const { title, course, subject, duration, questions } = req.body;

      if (!title || !course || !subject || !duration || !questions || questions.length === 0) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Validate questions
      for (const q of questions) {
        if (!q.question || !q.options || q.options.length < 2 || q.correct === undefined) {
          return res.status(400).json({ message: "Invalid question format" });
        }
      }

      const test = await Test.create({
        title,
        course,
        subject,
        duration,
        questions,
        teacherId: currentUser._id,
        approved: false,
        active: false,
      });

      return res.status(201).json(test);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}