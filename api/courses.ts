import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Course, getUserFromRequest } from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    await connectDB();

    // GET /api/courses - Get all courses (public)
    if (req.method === "GET") {
      const courses = await Course.find().sort({ name: 1 });
      return res.status(200).json(courses);
    }

    // POST /api/courses - Create course (admin only)
    if (req.method === "POST") {
      const currentUser = await getUserFromRequest(req);

      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Course name is required" });
      }

      // Check if course already exists
      const existingCourse = await Course.findOne({ name: { $regex: new RegExp(`^${name}$`, "i") } });
      
      if (existingCourse) {
        return res.status(400).json({ message: "Course already exists" });
      }

      const course = await Course.create({
        name,
        description: description || "",
      });

      return res.status(201).json(course);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}