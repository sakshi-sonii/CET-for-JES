import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Attempt, Test, getUserFromRequest } from "./_db.js";

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

    // GET /api/attempts - Get attempts
    if (req.method === "GET") {
      let query = {};

      // Students can only see their own attempts
      if (currentUser.role === "student") {
        query = { studentId: currentUser._id };
      }
      // Teachers can see attempts for their tests
      else if (currentUser.role === "teacher") {
        const teacherTests = await Test.find({ teacherId: currentUser._id }).select("_id");
        const testIds = teacherTests.map((t) => t._id);
        query = { testId: { $in: testIds } };
      }
      // Admin can see all attempts

      const attempts = await Attempt.find(query)
        .populate("testId", "title subject")
        .populate("studentId", "name email")
        .sort({ submittedAt: -1 });

      return res.status(200).json(attempts);
    }

    // POST /api/attempts - Submit attempt (students only)
    if (req.method === "POST") {
      if (currentUser.role !== "student") {
        return res.status(403).json({ message: "Only students can submit attempts" });
      }

      const { testId, score, total, answers, shuffledOrder } = req.body;

      if (!testId || score === undefined || !total || !answers) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check if test exists and is available
      const test = await Test.findById(testId);

      if (!test) {
        return res.status(404).json({ message: "Test not found" });
      }

      if (!test.approved || !test.active) {
        return res.status(400).json({ message: "Test is not available" });
      }

      if (test.course.toString() !== currentUser.course?.toString()) {
        return res.status(403).json({ message: "You are not enrolled in this course" });
      }

      // Check if already attempted
      const existingAttempt = await Attempt.findOne({
        testId,
        studentId: currentUser._id,
      });

      if (existingAttempt) {
        return res.status(400).json({ message: "You have already attempted this test" });
      }

      const attempt = await Attempt.create({
        testId,
        studentId: currentUser._id,
        score,
        total,
        answers,
        shuffledOrder,
      });

      return res.status(201).json(attempt);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}