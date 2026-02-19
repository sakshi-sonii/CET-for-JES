import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest, withRetry } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "PATCH") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await connectDB();
    const currentUser = await getUserFromRequest(req);

    if (!currentUser) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (currentUser.role !== "admin") {
      return res.status(403).json({ message: "Only admin can approve tests" });
    }

    const id = req.query?.id as string;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid test ID" });
    }

    const test = await withRetry(() =>
      Test.findById(id)
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

    // Custom tests: just need at least one section with questions (already validated above)
    // No specific subject requirements for custom tests

    const updated = await withRetry(() =>
      Test.findByIdAndUpdate(
        id,
        { approved: true },
        { new: true }
      ).lean()
    );

    return res.status(200).json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}