import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest } from "./_db.js";
import mongoose from "mongoose";

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
      let query: any = {};

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
        query = { teacherId: new mongoose.Types.ObjectId(currentUser._id.toString()) };
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

      const { title, course, sections } = req.body;

      if (!title || !course || !sections || !Array.isArray(sections) || sections.length === 0) {
        return res.status(400).json({ message: "Title, course, and sections are required" });
      }

      // Validate sections
      const validSubjects = ["physics", "chemistry", "maths"];
      const providedSubjects: string[] = [];

      for (const section of sections) {
        if (!section.subject || !validSubjects.includes(section.subject.toLowerCase())) {
          return res.status(400).json({
            message: `Invalid section subject: "${section.subject}". Must be one of: ${validSubjects.join(", ")}`,
          });
        }

        if (providedSubjects.includes(section.subject.toLowerCase())) {
          return res.status(400).json({
            message: `Duplicate section: ${section.subject}. Each subject can only appear once.`,
          });
        }
        providedSubjects.push(section.subject.toLowerCase());

        if (!section.questions || !Array.isArray(section.questions) || section.questions.length === 0) {
          return res.status(400).json({
            message: `Section "${section.subject}" must have at least one question`,
          });
        }

        // Validate each question
        for (let i = 0; i < section.questions.length; i++) {
          const q = section.questions[i];
          if (!q.question || !q.options || q.options.length < 2 || q.correct === undefined) {
            return res.status(400).json({
              message: `Invalid question format at question ${i + 1} in section "${section.subject}". Required: question, options (min 2), correct`,
            });
          }
        }
      }

      // Ensure all 3 sections are present
      for (const subj of validSubjects) {
        if (!providedSubjects.includes(subj)) {
          return res.status(400).json({
            message: `Missing required section: ${subj}. All three sections (physics, chemistry, maths) are required.`,
          });
        }
      }

      // Build sections with proper marksPerQuestion
      const processedSections = sections.map((section: any) => ({
        subject: section.subject.toLowerCase(),
        marksPerQuestion: section.subject.toLowerCase() === "maths" ? 2 : 1,
        questions: section.questions.map((q: any) => ({
          question: q.question,
          options: q.options,
          correct: q.correct,
          explanation: q.explanation || "",
        })),
      }));

      const test = await Test.create({
        title,
        course,
        sections: processedSections,
        // Section timing: Physics+Chemistry = 90 min combined, Maths = 90 min
        sectionTimings: {
          physicsChemistry: 90,
          maths: 90,
        },
        totalDuration: 180,
        teacherId: new mongoose.Types.ObjectId(currentUser._id.toString()),
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