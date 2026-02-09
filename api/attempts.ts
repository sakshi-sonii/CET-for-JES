import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, TestSubmission, Attempt, getUserFromRequest } from "./_db.js";
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
    // GET — Fetch submissions
    // ======================
    if (req.method === "GET") {
      const { testId, studentId, type } = req.query;
      let query: any = {};

      // Students see only their own submissions
      if (currentUser.role === "student") {
        query.studentId = new mongoose.Types.ObjectId(currentUser._id.toString());
      }

      // Teachers see submissions for their tests
      if (currentUser.role === "teacher") {
        const teacherTests = await Test.find({
          teacherId: new mongoose.Types.ObjectId(currentUser._id.toString()),
        }).select("_id");
        const teacherTestIds = teacherTests.map((t: any) => t._id);
        query.testId = { $in: teacherTestIds };
      }

      // Admin sees all — no extra filter

      // Optional filters
      if (testId) {
        query.testId = new mongoose.Types.ObjectId(testId as string);
      }
      if (studentId && currentUser.role === "admin") {
        query.studentId = new mongoose.Types.ObjectId(studentId as string);
      }

      // Try to fetch from TestSubmission (new format) first
      const submissions = await TestSubmission.find(query)
        .populate("testId", "title sections sectionTimings totalDuration")
        .populate("studentId", "name email")
        .sort({ submittedAt: -1 });

      return res.status(200).json(submissions);
    }

    // ======================
    // POST — Submit test
    // ======================
    if (req.method === "POST") {
      if (currentUser.role !== "student") {
        return res.status(403).json({ message: "Only students can submit tests" });
      }

      const { testId, answers } = req.body;

      if (!testId || !answers) {
        return res.status(400).json({ message: "testId and answers are required" });
      }

      const studentOid = new mongoose.Types.ObjectId(currentUser._id.toString());
      const testOid = new mongoose.Types.ObjectId(testId);

      // Check for duplicate submission
      const existingSubmission = await TestSubmission.findOne({
        testId: testOid,
        studentId: studentOid,
      });

      if (existingSubmission) {
        return res.status(400).json({ message: "You have already submitted this test" });
      }

      // Fetch the test
      const test = await Test.findById(testId);
      if (!test) {
        return res.status(404).json({ message: "Test not found" });
      }

      // Calculate scores per section
      let totalScore = 0;
      let totalMaxScore = 0;
      const sectionResults: any[] = [];

      for (const section of test.sections) {
        const marksPerQuestion =
          section.marksPerQuestion || (section.subject === "maths" ? 2 : 1);
        let sectionScore = 0;
        const sectionMaxScore = (section.questions?.length || 0) * marksPerQuestion;
        const questionResults: any[] = [];

        for (let i = 0; i < section.questions.length; i++) {
          const question = section.questions[i];
          const questionKey = `${section.subject}_${i}`;
          const studentAnswer =
            answers[questionKey] !== undefined && answers[questionKey] !== null
              ? Number(answers[questionKey])
              : null;
          const isCorrect =
            studentAnswer !== null && studentAnswer === question.correct;

          if (isCorrect) {
            sectionScore += marksPerQuestion;
          }

          questionResults.push({
            questionIndex: i,
            question: question.question,
            options: question.options,
            correctAnswer: question.correct,
            studentAnswer: studentAnswer,
            isCorrect,
            explanation: question.explanation || "",
            marksAwarded: isCorrect ? marksPerQuestion : 0,
            marksPerQuestion,
          });
        }

        totalScore += sectionScore;
        totalMaxScore += sectionMaxScore;

        sectionResults.push({
          subject: section.subject,
          score: sectionScore,
          maxScore: sectionMaxScore,
          marksPerQuestion,
          questions: questionResults,
        });
      }

      const percentage =
        totalMaxScore > 0
          ? Math.round((totalScore / totalMaxScore) * 100)
          : 0;

      const submission = await TestSubmission.create({
        testId: testOid,
        studentId: studentOid,
        answers,
        sectionResults,
        totalScore,
        totalMaxScore,
        percentage,
        submittedAt: new Date(),
      });

      // Populate before returning
      const populatedSubmission = await TestSubmission.findById(submission._id)
        .populate("testId", "title sections sectionTimings totalDuration")
        .populate("studentId", "name email");

      return res.status(201).json(populatedSubmission);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("attempts error:", error);
    return res.status(500).json({ message: error.message });
  }
}