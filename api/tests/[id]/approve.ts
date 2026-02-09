import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest } from "../../_db.js";

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

    const test = await Test.findById(id);

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    // Validate that the test has all 3 required sections before approving
    const requiredSubjects = ["physics", "chemistry", "maths"];
    const testSubjects = test.sections?.map((s: any) => s.subject) || [];

    for (const subj of requiredSubjects) {
      if (!testSubjects.includes(subj)) {
        return res.status(400).json({
          message: `Cannot approve: test is missing the "${subj}" section. All three sections (physics, chemistry, maths) are required.`,
        });
      }
    }

    // Validate each section has at least 1 question
    for (const section of test.sections) {
      if (!section.questions || section.questions.length === 0) {
        return res.status(400).json({
          message: `Cannot approve: section "${section.subject}" has no questions.`,
        });
      }
    }

    test.approved = true;
    await test.save();

    return res.status(200).json(test);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}