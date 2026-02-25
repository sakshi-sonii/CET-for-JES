import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Material, getUserFromRequest, withRetry } from "./_db.js";
import mongoose from "mongoose";

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

    // Extract ID from URL (e.g., /api/materials/123)
    const urlParts = req.url?.split('/').filter(Boolean) || [];
    const materialId = urlParts.length > 2 ? urlParts[2] : null;

    if (!currentUser) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // =====================================
    // GET /api/materials or /api/materials/:id
    // =====================================
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");

      // GET specific material by ID
      if (materialId && materialId.match(/^[0-9a-fA-F]{24}$/)) {
        const material = await withRetry(() =>
          Material.findById(materialId)
            .populate("course", "name")
            .populate("teacherId", "name")
            .lean()
        );

        if (!material) {
          return res.status(404).json({ message: "Material not found" });
        }

        return res.status(200).json(material);
      }

      // GET all materials (list)
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

    // =====================================
    // POST /api/materials
    // =====================================
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

    // =====================================
    // PATCH /api/materials/:id
    // =====================================
    if (req.method === "PATCH") {
      if (!materialId || !materialId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ message: "Invalid material ID" });
      }

      const { title, subject, content, type } = req.body;

      // Build update object
      const update: any = {};
      if (title) update.title = title;
      if (subject) update.subject = subject;
      if (content) update.content = content;
      if (type && ["notes", "video", "pdf"].includes(type)) update.type = type;

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Non-admin can only update their own materials
      const query: any = { _id: materialId };
      if (currentUser.role !== "admin") {
        query.teacherId = currentUser._id;
      }

      const material = await withRetry(() =>
        Material.findOneAndUpdate(query, update, { new: true }).lean()
      );

      if (!material) {
        const exists = await Material.exists({ _id: materialId });
        if (!exists) {
          return res.status(404).json({ message: "Material not found" });
        }
        return res.status(403).json({ message: "Access denied" });
      }

      return res.status(200).json(material);
    }

    // =====================================
    // DELETE /api/materials/:id
    // =====================================
    if (req.method === "DELETE") {
      if (!materialId || !materialId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ message: "Invalid material ID" });
      }

      const query: any = { _id: materialId };

      if (currentUser.role !== "admin") {
        query.teacherId = currentUser._id;
      }

      const material = await withRetry(() =>
        Material.findOneAndDelete(query).lean()
      );

      if (!material) {
        const exists = await Material.exists({ _id: materialId });
        if (!exists) {
          return res.status(404).json({ message: "Material not found" });
        }
        return res.status(403).json({ message: "Access denied" });
      }

      return res.status(200).json({ message: "Material deleted successfully" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Materials API error:", error.message);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}