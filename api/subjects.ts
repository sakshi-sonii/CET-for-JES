import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Subject, Test, User, Course, getUserFromRequest, withRetry } from "./_db.js";
import mongoose from "mongoose";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    await connectDB();

    // Support both consolidated query routing (/api/subjects?action=questions)
    // and legacy path routing (/api/subjects/questions, /api/subjects/:id).
    const requestUrl = new URL(req.url || "/api/subjects", "http://localhost");
    const pathParts = requestUrl.pathname.split("/").filter(Boolean);
    const pathParam = pathParts.length > 2 ? pathParts[2] : null;
    const queryAction = typeof req.query.action === "string" ? req.query.action : null;
    const isQuestionsPath = pathParam === "questions" || queryAction === "questions";

    // ========================
    // GET /api/subjects/questions or /api/subjects?courseId=xxx
    // ========================
    if (req.method === "GET") {
      if (isQuestionsPath) {
        // GET /api/subjects/questions?courseId=xxx
        const currentUser = await getUserFromRequest(req);
        if (!currentUser) {
          return res.status(401).json({ message: "Not authenticated" });
        }

        if (!["coordinator", "admin"].includes(currentUser.role)) {
          return res.status(403).json({ message: "Access denied. Only coordinators and admins can view questions" });
        }

        const { courseId, subjectId } = req.query;

        if (!courseId) {
          return res.status(400).json({ message: "courseId is required" });
        }

        let query: any = {
          course: new mongoose.Types.ObjectId(courseId as string),
          teacherId: { $exists: true }, // Created by a teacher
          approved: false, // Not yet combined into a final test by coordinat
          reviewStatus: "accepted_by_coordinator", // Only approved question banks
        };

        if (subjectId) {
          query["sections.subject"] = subjectId;
        }

        const tests = await withRetry(() =>
          Test.find(query)
            .populate("teacherId", "name email")
            .select("_id title sections")
            .lean()
        );

        return res.status(200).json(tests);
      }

      // GET /api/subjects?courseId=xxx (or all subjects when courseId is omitted)
      const { courseId } = req.query;

      const query: any = {};
      if (courseId) {
        query.course = courseId;
      }

      const subjects = await withRetry(() =>
        Subject.find(query)
          .populate("teacherId", "name email")
          .sort({ course: 1, name: 1 })
          .lean()
      );

      return res.status(200).json(subjects);
    }

    // ========================
    // POST /api/subjects
    // ========================
    if (req.method === "POST") {
      const currentUser = await getUserFromRequest(req);

      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const { name, courseId } = req.body;

      if (!name || !["physics", "chemistry", "maths", "biology"].includes(name)) {
        return res.status(400).json({ message: "Invalid subject name" });
      }

      if (!courseId) {
        return res.status(400).json({ message: "courseId is required" });
      }

      // Check if course exists
      const course = await withRetry(() => Course.findById(courseId));
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Check if subject already exists for this course
      const existing = await withRetry(() =>
        Subject.exists({ course: courseId, name })
      );

      if (existing) {
        return res.status(400).json({ message: "Subject already exists for this course" });
      }

      const subject = await withRetry(() =>
        Subject.create({ name, course: courseId })
      );

      // Add subject to course's subjects array
      await withRetry(() =>
        Course.findByIdAndUpdate(
          courseId,
          { $push: { subjects: subject._id } },
          { new: true }
        )
      );

      return res.status(201).json(subject);
    }

    // ========================
    // PUT /api/subjects
    // ========================
    if (req.method === "PUT") {
      const currentUser = await getUserFromRequest(req);

      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const { subjectId, teacherId } = req.body;

      if (!subjectId || !teacherId) {
        return res.status(400).json({ message: "subjectId and teacherId are required" });
      }

      // Check if subject exists
      const subject = await withRetry(() => Subject.findById(subjectId));
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }

      // Check if teacher exists
      const teacher = await withRetry(() => User.findById(teacherId));
      if (!teacher || teacher.role !== "teacher") {
        return res.status(404).json({ message: "Teacher not found" });
      }

      // Assign teacher to subject
      const updatedSubject = await withRetry(() =>
        Subject.findByIdAndUpdate(
          subjectId,
          { teacherId },
          { new: true }
        ).populate("teacherId", "name email")
      );

      // Add subject to teacher's assignedSubjects
      await withRetry(() =>
        User.findByIdAndUpdate(
          teacherId,
          { $addToSet: { assignedSubjects: subjectId } }
        )
      );

      return res.status(200).json(updatedSubject);
    }

    // ========================
    // DELETE /api/subjects?subjectId=xxx
    // ========================
    if (req.method === "DELETE") {
      const currentUser = await getUserFromRequest(req);

      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const querySubjectId = req.query.subjectId as string | undefined;
      const pathSubjectId =
        pathParam && /^[0-9a-fA-F]{24}$/.test(pathParam) ? pathParam : null;
      const subjectId = querySubjectId || pathSubjectId;

      if (!subjectId) {
        return res.status(400).json({ message: "subjectId is required" });
      }

      const subject = await withRetry(() => Subject.findById(subjectId));
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }

      // Remove subject from course
      await withRetry(() =>
        Course.findByIdAndUpdate(
          subject.course,
          { $pull: { subjects: subjectId } }
        )
      );

      // Remove subject from teacher's assignedSubjects if assigned
      if (subject.teacherId) {
        await withRetry(() =>
          User.findByIdAndUpdate(
            subject.teacherId,
            { $pull: { assignedSubjects: subjectId } }
          )
        );
      }

      await withRetry(() => Subject.findByIdAndDelete(subjectId));

      return res.status(200).json({ message: "Subject deleted" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Subjects API error:", error.message);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}
