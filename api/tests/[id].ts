import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest, withRetry } from "../_db.js";

const VALID_SUBJECTS = ["physics", "chemistry", "maths", "biology"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, DELETE, OPTIONS");
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

    const id = req.query.id as string;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid test ID" });
    }

    // ======================
    // GET
    // ======================
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");

      let query: any = { _id: id };

      if (currentUser.role === "student") {
        query.approved = true;
        query.active = true;
        query.course = currentUser.course;
      } else if (currentUser.role === "teacher") {
        query.teacherId = currentUser._id;
      }

      const test = await withRetry(() =>
        Test.findOne(query).lean()
      );

      if (!test) {
        if (currentUser.role !== "admin") {
          const exists = await Test.exists({ _id: id });
          if (exists) {
            return res.status(403).json({ message: "Access denied" });
          }
        }
        return res.status(404).json({ message: "Test not found" });
      }

      return res.status(200).json(test);
    }

    // ======================
    // PATCH
    // ======================
    if (req.method === "PATCH") {
      if (currentUser.role !== "teacher" && currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

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

      if (currentUser.role === "teacher") {
        const test = await withRetry(() =>
          Test.findOne({ _id: id, teacherId: currentUser._id })
            .select("approved teacherId testType")
            .lean()
        );

        if (!test) {
          const exists = await Test.exists({ _id: id });
          if (!exists) return res.status(404).json({ message: "Test not found" });
          return res.status(403).json({ message: "Access denied" });
        }

        // Teachers can always toggle these regardless of approval
        if (active !== undefined && test.approved) {
          update.active = !!active;
        }

        // Teachers can always toggle answer key visibility
        if (showAnswerKey !== undefined) {
          update.showAnswerKey = !!showAnswerKey;
        }

        // Teachers can update content only if NOT yet approved
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
        Test.findByIdAndUpdate(id, update, { new: true }).lean()
      );

      if (!updated) {
        return res.status(404).json({ message: "Test not found" });
      }

      return res.status(200).json(updated);
    }

    // ======================
    // DELETE
    // ======================
    if (req.method === "DELETE") {
      const query: any = { _id: id };

      if (currentUser.role !== "admin") {
        query.teacherId = currentUser._id;
      }

      const deleted = await withRetry(() =>
        Test.findOneAndDelete(query).select("_id title").lean()
      );

      if (!deleted) {
        const exists = await Test.exists({ _id: id });
        if (!exists) return res.status(404).json({ message: "Test not found" });
        return res.status(403).json({ message: "Access denied" });
      }

      return res.status(200).json({ message: "Test deleted successfully" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Test [id] API error:", error.message);
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