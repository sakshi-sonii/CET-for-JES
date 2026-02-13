import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest, withRetry } from "./_db.js";
import mongoose from "mongoose";

const VALID_SUBJECTS = ["physics", "chemistry", "maths", "biology"];
const PHASE1_SUBJECTS = ["physics", "chemistry"];

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

    // ========================
    // GET /api/tests
    // ========================
    if (req.method === "GET") {
      let query: any = {};

      if (currentUser.role === "student") {
        query = {
          approved: true,
          active: true,
          course: currentUser.course,
        };
      } else if (currentUser.role === "teacher") {
        query = {
          teacherId: new mongoose.Types.ObjectId(currentUser._id.toString()),
        };
      }
      // Admin sees all

      const tests = await withRetry(() =>
        Test.find(query).sort({ createdAt: -1 }).lean()
      );

      return res.status(200).json(tests);
    }

    // ========================
    // POST /api/tests
    // ========================
    if (req.method === "POST") {
      if (currentUser.role !== "teacher") {
        return res.status(403).json({ message: "Only teachers can create tests" });
      }

      if (!currentUser.approved) {
        return res.status(403).json({ message: "Your account is not approved yet" });
      }

      const {
        title,
        course,
        testType = "custom",
        stream,
        sections,
        sectionTimings,
        customDuration,
        customSubjects,
        showAnswerKey = false,
      } = req.body;

      // ---- Basic validation ----
      if (!title?.trim()) {
        return res.status(400).json({ message: "Title is required" });
      }
      if (!course) {
        return res.status(400).json({ message: "Course is required" });
      }
      if (!sections || !Array.isArray(sections) || sections.length === 0) {
        return res.status(400).json({ message: "At least one section is required" });
      }
      if (!["mock", "custom"].includes(testType)) {
        return res.status(400).json({ message: "testType must be 'mock' or 'custom'" });
      }

      // ---- Validate sections ----
      const providedSubjects: string[] = [];

      for (const section of sections) {
        const subject = section.subject?.toLowerCase();

        if (!subject || !VALID_SUBJECTS.includes(subject)) {
          return res.status(400).json({
            message: `Invalid subject: "${section.subject}". Must be one of: ${VALID_SUBJECTS.join(", ")}`,
          });
        }

        if (providedSubjects.includes(subject)) {
          return res.status(400).json({
            message: `Duplicate section: ${subject}. Each subject can only appear once.`,
          });
        }
        providedSubjects.push(subject);

        if (!section.questions || !Array.isArray(section.questions) || section.questions.length === 0) {
          return res.status(400).json({
            message: `Section "${subject}" must have at least one question`,
          });
        }

        // Validate each question
        for (let i = 0; i < section.questions.length; i++) {
          const q = section.questions[i];

          // Question needs text OR image
          const hasQuestion = q.question?.trim() || q.questionImage;
          if (!hasQuestion) {
            return res.status(400).json({
              message: `Question ${i + 1} in "${subject}" needs question text or image`,
            });
          }

          // Must have at least 2 options (text or image)
          if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            return res.status(400).json({
              message: `Question ${i + 1} in "${subject}" must have at least 2 options`,
            });
          }

          // Each option needs text or image
          for (let oi = 0; oi < q.options.length; oi++) {
            const hasOptText = q.options[oi]?.trim();
            const hasOptImage = q.optionImages?.[oi]?.trim();
            if (!hasOptText && !hasOptImage) {
              return res.status(400).json({
                message: `Option ${oi + 1} of question ${i + 1} in "${subject}" needs text or image`,
              });
            }
          }

          if (q.correct === undefined || q.correct === null) {
            return res.status(400).json({
              message: `Question ${i + 1} in "${subject}" must have a correct answer index`,
            });
          }

          if (q.correct < 0 || q.correct >= q.options.length) {
            return res.status(400).json({
              message: `Question ${i + 1} in "${subject}" has invalid correct answer index`,
            });
          }
        }
      }

      // ---- Mock test validation ----
      if (testType === "mock") {
        // Must have physics and chemistry
        if (!providedSubjects.includes("physics") || !providedSubjects.includes("chemistry")) {
          return res.status(400).json({
            message: "Mock test requires both Physics and Chemistry sections",
          });
        }

        // Must have maths or biology for phase 2
        const hasMaths = providedSubjects.includes("maths");
        const hasBiology = providedSubjects.includes("biology");
        if (!hasMaths && !hasBiology) {
          return res.status(400).json({
            message: "Mock test requires either Mathematics or Biology section",
          });
        }

        // Validate stream
        if (stream && !["PCM", "PCB"].includes(stream)) {
          return res.status(400).json({
            message: "Stream must be 'PCM' or 'PCB'",
          });
        }
      }

      // ---- Custom test validation ----
      if (testType === "custom") {
        const duration = customDuration || 60;
        if (duration < 1 || duration > 600) {
          return res.status(400).json({
            message: "Custom test duration must be between 1 and 600 minutes",
          });
        }
      }

      // ---- Build processed sections ----
      const processedSections = sections.map((section: any) => {
        const subject = section.subject.toLowerCase();
        return {
          subject,
          marksPerQuestion: section.marksPerQuestion || (subject === "maths" ? 2 : 1),
          questions: section.questions.map((q: any) => ({
            question: q.question || "",
            questionImage: q.questionImage || "",
            options: q.options,
            optionImages: q.optionImages?.some((img: string) => img)
              ? q.optionImages
              : [],
            correct: q.correct,
            explanation: q.explanation || "",
            explanationImage: q.explanationImage || "",
          })),
        };
      });

      // ---- Determine stream for mock tests ----
      let resolvedStream = stream;
      if (testType === "mock" && !resolvedStream) {
        if (providedSubjects.includes("biology") && !providedSubjects.includes("maths")) {
          resolvedStream = "PCB";
        } else {
          resolvedStream = "PCM";
        }
      }

      // ---- Build test document ----
      const testDoc: any = {
        title: title.trim(),
        course,
        testType,
        sections: processedSections,
        showAnswerKey: !!showAnswerKey,
        teacherId: new mongoose.Types.ObjectId(currentUser._id.toString()),
        approved: false,
        active: false,
      };

      if (testType === "mock") {
        testDoc.stream = resolvedStream;
        testDoc.sectionTimings = {
          physicsChemistry: sectionTimings?.physicsChemistry ?? 90,
          mathsOrBiology: sectionTimings?.mathsOrBiology ?? 90,
        };
      } else {
        testDoc.customDuration = customDuration ?? 60;
        testDoc.customSubjects = providedSubjects;
      }

      const test = await withRetry(() => Test.create(testDoc));

      return res.status(201).json(test);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Tests API error:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}