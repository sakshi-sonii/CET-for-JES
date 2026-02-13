import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Course, getUserFromRequest, withRetry } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    await connectDB();

    // GET /api/courses - public
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

      const courses = await withRetry(() =>
        Course.find().sort({ name: 1 }).lean()
      );
      return res.status(200).json(courses);
    }

    // POST /api/courses - admin only
    if (req.method === "POST") {
      const currentUser = await getUserFromRequest(req);

      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const { name, description, stream } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({ message: "Course name is required" });
      }

      if (stream && !["PCM", "PCB"].includes(stream)) {
        return res.status(400).json({ message: "Stream must be 'PCM' or 'PCB'" });
      }

      const existing = await withRetry(() =>
        Course.exists({ name: { $regex: new RegExp(`^${name.trim()}$`, "i") } })
      );

      if (existing) {
        return res.status(400).json({ message: "Course already exists" });
      }

      const courseData: any = {
        name: name.trim(),
        description: description || "",
      };

      if (stream) courseData.stream = stream;

      const course = await withRetry(() => Course.create(courseData));

      return res.status(201).json(course);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Course already exists" });
    }
    console.error("Courses API error:", error.message);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}