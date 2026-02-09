import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Material, getUserFromRequest } from "../_db.js";

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

    const { id } = req.query;

    // GET /api/materials/:id
    if (req.method === "GET") {
      const material = await Material.findById(id)
        .populate("course", "name")
        .populate("teacherId", "name");

      if (!material) {
        return res.status(404).json({ message: "Material not found" });
      }

      return res.status(200).json(material);
    }

    // PATCH /api/materials/:id
    if (req.method === "PATCH") {
      const material = await Material.findById(id);

      if (!material) {
        return res.status(404).json({ message: "Material not found" });
      }

      // Only the teacher who created it or admin can update
      if (
        currentUser.role !== "admin" &&
        material.teacherId.toString() !== currentUser._id.toString()
      ) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { title, subject, content, type } = req.body;

      if (title) material.title = title;
      if (subject) material.subject = subject;
      if (content) material.content = content;
      if (type && ["notes", "video", "pdf"].includes(type)) material.type = type;

      await material.save();
      return res.status(200).json(material);
    }

    // DELETE /api/materials/:id
    if (req.method === "DELETE") {
      const material = await Material.findById(id);

      if (!material) {
        return res.status(404).json({ message: "Material not found" });
      }

      // Only the teacher who created it or admin can delete
      if (
        currentUser.role !== "admin" &&
        material.teacherId.toString() !== currentUser._id.toString()
      ) {
        return res.status(403).json({ message: "Access denied" });
      }

      await Material.findByIdAndDelete(id);
      return res.status(200).json({ message: "Material deleted successfully" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}