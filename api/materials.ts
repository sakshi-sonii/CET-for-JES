import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Material, getUserFromRequest, withRetry } from "./_db.js";
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

    // ======================
    // GET /api/materials
    // ======================
    if (req.method === "GET") {
      let query: any = {};

      if (currentUser.role === "student") {
        query.course = currentUser.course;
      } else if (currentUser.role === "teacher") {
        query.teacherId = new mongoose.Types.ObjectId(currentUser._id.toString());
      }
      // Admin sees all

      const materials = await withRetry(() =>
        Material.find(query)
          .populate("course", "name")
          .sort({ createdAt: -1 })
          .lean()
      );

      return res.status(200).json(materials);
    }

    // ======================
    // POST /api/materials
    // ======================
    if (req.method === "POST") {
      if (currentUser.role !== "teacher") {
        return res.status(403).json({ message: "Only teachers can create materials" });
      }

      if (!currentUser.approved) {
        return res.status(403).json({ message: "Your account is not approved yet" });
      }

      const { title, course, subject, content, type } = req.body;

      if (!title?.trim() || !course || !subject?.trim() || !content?.trim() || !type) {
        return res.status(400).json({ message: "All fields are required" });
      }

      if (!["notes", "video", "pdf"].includes(type)) {
        return res.status(400).json({ message: "Invalid material type" });
      }

      const material = await withRetry(() =>
        Material.create({
          title: title.trim(),
          course,
          subject: subject.trim(),
          content,
          type,
          teacherId: new mongoose.Types.ObjectId(currentUser._id.toString()),
        })
      );

      return res.status(201).json(material);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Materials API error:", error.message);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}