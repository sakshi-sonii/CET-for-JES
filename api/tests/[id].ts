import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest } from "../_db.js";

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

    // GET /api/tests/:id - Get single test
    if (req.method === "GET") {
      const test = await Test.findById(id);

      if (!test) {
        return res.status(404).json({ message: "Test not found" });
      }

      // Check access
      if (currentUser.role === "student") {
        if (!test.approved || !test.active || test.course.toString() !== currentUser.course?.toString()) {
          return res.status(403).json({ message: "Access denied" });
        }
      } else if (currentUser.role === "teacher") {
        if (test.teacherId.toString() !== currentUser._id.toString()) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      return res.status(200).json(test);
    }

    // PATCH /api/tests/:id - Update test
    if (req.method === "PATCH") {
      const test = await Test.findById(id);

      if (!test) {
        return res.status(404).json({ message: "Test not found" });
      }

      const { active, title, subject, duration, questions } = req.body;

      // Teachers can only update their own tests (active status)
      if (currentUser.role === "teacher") {
        if (test.teacherId.toString() !== currentUser._id.toString()) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Teachers can only toggle active status if test is approved
        if (active !== undefined && test.approved) {
          test.active = active;
        }
      }
      // Admin can update any test
      else if (currentUser.role === "admin") {
        if (active !== undefined) test.active = active;
        if (title) test.title = title;
        if (subject) test.subject = subject;
        if (duration) test.duration = duration;
        if (questions) test.questions = questions;
      } else {
        return res.status(403).json({ message: "Access denied" });
      }

      await test.save();
      return res.status(200).json(test);
    }

    // DELETE /api/tests/:id - Delete test
    if (req.method === "DELETE") {
      const test = await Test.findById(id);

      if (!test) {
        return res.status(404).json({ message: "Test not found" });
      }

      // Only admin or the teacher who created it can delete
      if (
        currentUser.role !== "admin" &&
        test.teacherId.toString() !== currentUser._id.toString()
      ) {
        return res.status(403).json({ message: "Access denied" });
      }

      await Test.findByIdAndDelete(id);
      return res.status(200).json({ message: "Test deleted successfully" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}