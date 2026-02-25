import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest, withRetry } from "./_db.js";
import mongoose from "mongoose";

const VALID_SUBJECTS = ["physics", "chemistry", "maths", "biology"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
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

    // Support both consolidated query routing (/api/tests?testId=...)
    // and legacy path routing (/api/tests/:id[/approve]).
    const requestUrl = new URL(req.url || "/api/tests", "http://localhost");
    const pathParts = requestUrl.pathname.split("/").filter(Boolean);
    const pathTestId = pathParts.length > 2 ? pathParts[2] : null;
    const pathAction = pathParts.length > 3 ? pathParts[3] : null;
    const queryTestId = typeof req.query.testId === "string" ? req.query.testId : null;
    const queryAction = typeof req.query.action === "string" ? req.query.action : null;
    const testId = queryTestId || pathTestId;
    const action = queryAction || pathAction;

    // ========================
    // GET /api/tests or /api/tests/:id
    // ========================
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");

      // GET specific test by ID
      if (testId && testId.match(/^[0-9a-fA-F]{24}$/)) {
        let query: any = { _id: testId };

        if (currentUser.role === "student") {
          query.approved = true;
          query.active = true;
          query.course = currentUser.course;
        } else if (currentUser.role === "teacher") {
          query.teacherId = currentUser._id;
        } else if (currentUser.role === "coordinator") {
          // Coordinators can view all tests they created or pending approval
          query = {
            _id: testId,
            $or: [
              { coordinatorId: currentUser._id },
              { approved: false }
            ]
          };
        }
        // Admin sees all

        const test = await withRetry(() =>
          Test.findOne(query).lean()
        );

        if (!test) {
          if (currentUser.role !== "admin") {
            const exists = await Test.exists({ _id: testId });
            if (exists) {
              return res.status(403).json({ message: "Access denied" });
            }
          }
          return res.status(404).json({ message: "Test not found" });
        }

        return res.status(200).json(test);
      }

      // GET all tests (list)
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
      } else if (currentUser.role === "coordinator") {
        // Coordinators see all unapproved tests (both from teachers and other coordinators)
        // plus any tests they created
        query = {
          $or: [
            { approved: false },
            { coordinatorId: new mongoose.Types.ObjectId(currentUser._id.toString()) }
          ]
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
      if (!["teacher", "coordinator"].includes(currentUser.role)) {
        return res.status(403).json({ message: "Only teachers and coordinators can create tests" });
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

      // ---- Teacher constraint: can only upload for assigned subjects ----
      if (currentUser.role === "teacher") {
        const assignedSubjects = currentUser.assignedSubjects || [];
        for (const section of sections) {
          const subject = section.subject?.toLowerCase();
          if (!subject) {
            return res.status(400).json({ message: "Section must have a subject" });
          }
        }
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
        approved: false,
        active: false,
      };

      // Set creator based on role
      if (currentUser.role === "teacher") {
        testDoc.teacherId = new mongoose.Types.ObjectId(currentUser._id.toString());
      } else if (currentUser.role === "coordinator") {
        testDoc.coordinatorId = new mongoose.Types.ObjectId(currentUser._id.toString());
      }

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

    // ========================
    // PATCH /api/tests/:id or /api/tests/:id/approve
    // ========================
    if (req.method === "PATCH") {
      if (!testId || !testId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ message: "Invalid test ID" });
      }

      // Handle /approve endpoint
      if (action === "approve") {
        if (currentUser.role !== "admin") {
          return res.status(403).json({ message: "Only admin can approve tests" });
        }

        const test = await withRetry(() =>
          Test.findById(testId)
            .select("approved testType stream sections.subject sections.questions")
            .lean()
        );

        if (!test) {
          return res.status(404).json({ message: "Test not found" });
        }

        if (test.approved) {
          return res.status(400).json({ message: "Test is already approved" });
        }

        // Must have at least one section
        if (!test.sections || test.sections.length === 0) {
          return res.status(400).json({
            message: "Cannot approve: test has no sections.",
          });
        }

        // Every section must have at least one question
        for (const section of test.sections) {
          if (!section.questions || section.questions.length === 0) {
            return res.status(400).json({
              message: `Cannot approve: "${section.subject}" section has no questions.`,
            });
          }
        }

        // Only mock tests require specific subject combinations
        if (test.testType === "mock") {
          const testSubjects = test.sections.map((s: any) => s.subject);
          const hasPhy = testSubjects.includes("physics");
          const hasChem = testSubjects.includes("chemistry");
          const hasMaths = testSubjects.includes("maths");
          const hasBio = testSubjects.includes("biology");

          if (!hasPhy) {
            return res.status(400).json({
              message: 'Cannot approve mock test: missing "physics" section.',
            });
          }
          if (!hasChem) {
            return res.status(400).json({
              message: 'Cannot approve mock test: missing "chemistry" section.',
            });
          }
          if (!hasMaths && !hasBio) {
            return res.status(400).json({
              message: 'Cannot approve mock test: needs either "maths" or "biology" section.',
            });
          }
        }

        const updated = await withRetry(() =>
          Test.findByIdAndUpdate(
            testId,
            { approved: true },
            { new: true }
          ).lean()
        );

        return res.status(200).json(updated);
      }

      // Handle regular PATCH
      const {
        active,
        title,
        sections,
        sectionTimings,
        showAnswerKey,
        testType,
        stream,
        customDuration,
        customSubjects,
      } = req.body;

      const update: any = {};

      if (currentUser.role === "teacher" || currentUser.role === "coordinator") {
        const query: any = { _id: testId };
        if (currentUser.role === "teacher") {
          query.teacherId = currentUser._id;
        } else if (currentUser.role === "coordinator") {
          query.coordinatorId = currentUser._id;
        }

        const test = await withRetry(() =>
          Test.findOne(query)
            .select("approved")
            .lean()
        );

        if (!test) {
          const exists = await Test.exists({ _id: testId });
          if (!exists) return res.status(404).json({ message: "Test not found" });
          return res.status(403).json({ message: "Access denied" });
        }

        // Can always toggle these
        if (active !== undefined && test.approved) {
          update.active = !!active;
        }

        if (showAnswerKey !== undefined) {
          update.showAnswerKey = !!showAnswerKey;
        }

        // Can update content only if NOT approved
        if (!test.approved) {
          if (title?.trim()) update.title = title.trim();
          if (testType && ["mock", "custom"].includes(testType)) {
            update.testType = testType;
          }
          if (stream && ["PCM", "PCB"].includes(stream)) {
            update.stream = stream;
          }
          if (sections && Array.isArray(sections) && sections.length > 0) {
            update.sections = buildProcessedSections(sections);
          }
          if (sectionTimings) {
            update.sectionTimings = {
              physicsChemistry: sectionTimings.physicsChemistry ?? 90,
              mathsOrBiology: sectionTimings.mathsOrBiology ?? 90,
            };
          }
          if (customDuration !== undefined) {
            const dur = Number(customDuration);
            if (dur >= 1 && dur <= 600) {
              update.customDuration = dur;
            }
          }
          if (customSubjects && Array.isArray(customSubjects)) {
            update.customSubjects = customSubjects.filter(
              (s: string) => VALID_SUBJECTS.includes(s)
            );
          }
        }
      } else {
        // Admin can update everything
        if (active !== undefined) update.active = !!active;
        if (showAnswerKey !== undefined) {
          update.showAnswerKey = !!showAnswerKey;
        }
        if (title?.trim()) update.title = title.trim();
        if (testType && ["mock", "custom"].includes(testType)) {
          update.testType = testType;
        }
        if (stream && ["PCM", "PCB"].includes(stream)) {
          update.stream = stream;
        }
        if (sections && Array.isArray(sections) && sections.length > 0) {
          update.sections = buildProcessedSections(sections);
        }
        if (sectionTimings) {
          update.sectionTimings = {
            physicsChemistry: sectionTimings.physicsChemistry ?? 90,
            mathsOrBiology: sectionTimings.mathsOrBiology ?? 90,
          };
        }
        if (customDuration !== undefined) {
          const dur = Number(customDuration);
          if (dur >= 1 && dur <= 600) {
            update.customDuration = dur;
          }
        }
        if (customSubjects && Array.isArray(customSubjects)) {
          update.customSubjects = customSubjects.filter(
            (s: string) => VALID_SUBJECTS.includes(s)
          );
        }
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updated = await withRetry(() =>
        Test.findByIdAndUpdate(testId, update, { new: true }).lean()
      );

      if (!updated) {
        return res.status(404).json({ message: "Test not found" });
      }

      return res.status(200).json(updated);
    }

    // ========================
    // DELETE /api/tests/:id
    // ========================
    if (req.method === "DELETE") {
      if (!testId || !testId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ message: "Invalid test ID" });
      }

      const query: any = { _id: testId };

      if (currentUser.role === "teacher") {
        query.teacherId = currentUser._id;
      } else if (currentUser.role === "coordinator") {
        query.coordinatorId = currentUser._id;
      }
      // Admin can delete any

      const deleted = await withRetry(() =>
        Test.findOneAndDelete(query).select("_id title").lean()
      );

      if (!deleted) {
        const exists = await Test.exists({ _id: testId });
        if (!exists) return res.status(404).json({ message: "Test not found" });
        return res.status(403).json({ message: "Access denied" });
      }

      return res.status(200).json({ message: "Test deleted successfully" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Tests API error:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

// ========================
// Helper: Process sections for storage
// ========================
function buildProcessedSections(sections: any[]): any[] {
  return sections
    .filter((section: any) => {
      const subject = section.subject?.toLowerCase();
      return (
        subject &&
        VALID_SUBJECTS.includes(subject) &&
        section.questions?.length > 0
      );
    })
    .map((section: any) => {
      const subject = section.subject.toLowerCase();
      return {
        subject,
        marksPerQuestion:
          section.marksPerQuestion || (subject === "maths" ? 2 : 1),
        questions: section.questions.map((q: any) => ({
          question: q.question || "",
          questionImage: q.questionImage || "",
          options: q.options || [],
          optionImages: q.optionImages?.some((img: string) => img)
            ? q.optionImages
            : [],
          correct: q.correct,
          explanation: q.explanation || "",
          explanationImage: q.explanationImage || "",
        })),
      };
    });
}
