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

    // Fetch only sections for validation — don't load full question content
    const test = await withRetry(() =>
      Test.findById(id)
        .select("approved sections.subject sections.questions")
        .lean()
    );

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    if (test.approved) {
      return res.status(400).json({ message: "Test is already approved" });
    }

    // Validate all 3 sections exist with questions
    const requiredSubjects = ["physics", "chemistry", "maths"];
    const testSubjects = test.sections?.map((s: any) => s.subject) || [];

    for (const subj of requiredSubjects) {
      if (!testSubjects.includes(subj)) {
        return res.status(400).json({
          message: `Cannot approve: missing "${subj}" section.`,
        });
      }
    }

    for (const section of test.sections) {
      if (!section.questions || section.questions.length === 0) {
        return res.status(400).json({
          message: `Cannot approve: "${section.subject}" has no questions.`,
        });
      }
    }

    // Single atomic update — no need to fetch full doc, modify, and save
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