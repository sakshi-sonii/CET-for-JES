import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, TestSubmission, getUserFromRequest } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
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

    const { id } = req.query;

    if (req.method === "GET") {
      const submission = await TestSubmission.findById(id)
        .populate("testId", "title sections sectionTimings totalDuration")
        .populate("studentId", "name email");

      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }

      // Students can only see their own
      if (
        currentUser.role === "student" &&
        submission.studentId._id.toString() !== currentUser._id.toString()
      ) {
        return res.status(403).json({ message: "Access denied" });
      }

      return res.status(200).json(submission);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}