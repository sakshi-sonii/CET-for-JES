import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest, withRetry } from "../_db.js";

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

      // Build access query based on role — single query handles auth + fetch
      let query: any = { _id: id };

      if (currentUser.role === "student") {
        query.approved = true;
        query.active = true;
        query.course = currentUser.course;
      } else if (currentUser.role === "teacher") {
        query.teacherId = currentUser._id;
      }
      // Admin: no extra filters

      const test = await withRetry(() =>
        Test.findOne(query).lean()
      );

      if (!test) {
        // Distinguish 404 vs 403
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

      const { active, title, sections, sectionTimings } = req.body;

      // Build update based on role
      const update: any = {};

      if (currentUser.role === "teacher") {
        // First check: does this test belong to the teacher?
        // Use lean + select to minimize data loaded
        const test = await withRetry(() =>
          Test.findOne({ _id: id, teacherId: currentUser._id })
            .select("approved teacherId")
            .lean()
        );

        if (!test) {
          const exists = await Test.exists({ _id: id });
          if (!exists) return res.status(404).json({ message: "Test not found" });
          return res.status(403).json({ message: "Access denied" });
        }

        // Teachers can toggle active only if approved
        if (active !== undefined && test.approved) {
          update.active = active;
        }

        // Teachers can update content only if NOT yet approved
        if (!test.approved) {
          if (title) update.title = title;
          if (sections && Array.isArray(sections)) {
            update.sections = sections.map((section: any) => ({
              subject: section.subject.toLowerCase(),
              marksPerQuestion: section.subject.toLowerCase() === "maths" ? 2 : 1,
              questions: section.questions.map((q: any) => ({
                question: q.question,
                options: q.options,
                correct: q.correct,
                explanation: q.explanation || "",
              })),
            }));
          }
          if (sectionTimings) update.sectionTimings = sectionTimings;
        }
      } else {
        // Admin can update anything
        if (active !== undefined) update.active = active;
        if (title) update.title = title;
        if (sections && Array.isArray(sections)) {
          update.sections = sections.map((section: any) => ({
            subject: section.subject.toLowerCase(),
            marksPerQuestion: section.subject.toLowerCase() === "maths" ? 2 : 1,
            questions: section.questions.map((q: any) => ({
              question: q.question,
              options: q.options,
              correct: q.correct,
              explanation: q.explanation || "",
            })),
          }));
        }
        if (sectionTimings) update.sectionTimings = sectionTimings;
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Atomic update
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
      // Single atomic query: find + check ownership + delete
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
    return res.status(500).json({ message: error.message });
  }
}