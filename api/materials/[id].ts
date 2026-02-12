import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Material, getUserFromRequest, withRetry } from "../_db.js";

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
      return res.status(400).json({ message: "Invalid material ID" });
    }

    // ======================
    // GET
    // ======================
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");

      const material = await withRetry(() =>
        Material.findById(id)
          .populate("course", "name")
          .populate("teacherId", "name")
          .lean()
      );

      if (!material) {
        return res.status(404).json({ message: "Material not found" });
      }

      return res.status(200).json(material);
    }

    // ======================
    // PATCH
    // ======================
    if (req.method === "PATCH") {
      const { title, subject, content, type } = req.body;

      // Build update object — only include fields that are provided
      const update: any = {};
      if (title) update.title = title;
      if (subject) update.subject = subject;
      if (content) update.content = content;
      if (type && ["notes", "video", "pdf"].includes(type)) update.type = type;

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Single atomic operation: find + check ownership + update
      const query: any = { _id: id };

      // Non-admin can only update their own materials
      if (currentUser.role !== "admin") {
        query.teacherId = currentUser._id;
      }

      const material = await withRetry(() =>
        Material.findOneAndUpdate(query, update, { new: true }).lean()
      );

      if (!material) {
        // Could be not found OR not authorized — check which
        const exists = await Material.exists({ _id: id });
        if (!exists) {
          return res.status(404).json({ message: "Material not found" });
        }
        return res.status(403).json({ message: "Access denied" });
      }

      return res.status(200).json(material);
    }

    // ======================
    // DELETE
    // ======================
    if (req.method === "DELETE") {
      // Single atomic operation: find + check ownership + delete
      const query: any = { _id: id };

      if (currentUser.role !== "admin") {
        query.teacherId = currentUser._id;
      }

      const material = await withRetry(() =>
        Material.findOneAndDelete(query).lean()
      );

      if (!material) {
        const exists = await Material.exists({ _id: id });
        if (!exists) {
          return res.status(404).json({ message: "Material not found" });
        }
        return res.status(403).json({ message: "Access denied" });
      }

      return res.status(200).json({ message: "Material deleted successfully" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}