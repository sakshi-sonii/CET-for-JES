import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, TeacherDraft, getUserFromRequest, withRetry } from "./_db.js";
import mongoose from "mongoose";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
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

    if (currentUser.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can access draft storage" });
    }

    const teacherId = new mongoose.Types.ObjectId(String(currentUser._id));

    if (req.method === "GET") {
      const saved = await withRetry(() =>
        TeacherDraft.findOne({ teacherId }).select("drafts").lean()
      );
      return res.status(200).json({ drafts: Array.isArray(saved?.drafts) ? saved.drafts : [] });
    }

    if (req.method === "PUT") {
      const drafts = Array.isArray(req.body?.drafts) ? req.body.drafts : null;
      if (!drafts) {
        return res.status(400).json({ message: "drafts must be an array" });
      }

      const updated = await withRetry(() =>
        TeacherDraft.findOneAndUpdate(
          { teacherId },
          { $set: { drafts } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
          .select("drafts updatedAt")
          .lean()
      );

      return res.status(200).json({
        message: "Drafts synced",
        drafts: Array.isArray(updated?.drafts) ? updated.drafts : [],
        updatedAt: updated?.updatedAt,
      });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Teacher drafts API error:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}
