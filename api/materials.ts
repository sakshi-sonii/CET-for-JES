import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Material, getUserFromRequest } from "./_db.js";
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
      }

      if (currentUser.role === "teacher") {
        // Fix: Ensure proper ObjectId comparison for teacherId
        const teacherObjectId = new mongoose.Types.ObjectId(currentUser._id.toString());
        query.teacherId = teacherObjectId;
      }

      // admin sees all — no filter applied

      const materials = await Material.find(query)
        .populate("course", "name")
        .sort({ createdAt: -1 });

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

      if (!title || !course || !subject || !content || !type) {
        return res.status(400).json({ message: "All fields are required" });
      }

      if (!["notes", "video", "pdf"].includes(type)) {
        return res.status(400).json({ message: "Invalid material type" });
      }

      const material = await Material.create({
        title,
        course,
        subject,
        content,
        type,
        // Fix: Store teacherId as a proper ObjectId
        teacherId: new mongoose.Types.ObjectId(currentUser._id.toString()),
      });

      return res.status(201).json(material);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}