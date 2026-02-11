import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, TestSubmission, getUserFromRequest, withRetry } from "./_db.js";
import mongoose from "mongoose";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
  }

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
    // GET
    // ======================
    if (req.method === "GET") {
      const { testId, studentId, limit } = req.query;
      let query: any = {};

      if (currentUser.role === "student") {
        query.studentId = new mongoose.Types.ObjectId(currentUser._id.toString());
      }

      if (currentUser.role === "teacher") {
        const teacherTestIds = await withRetry(() =>
          Test.find({
            teacherId: new mongoose.Types.ObjectId(currentUser._id.toString()),
          }).select("_id").lean()
        );
        query.testId = { $in: teacherTestIds.map((t: any) => t._id) };
      }

      if (testId) {
        query.testId = new mongoose.Types.ObjectId(testId as string);
      }
      if (studentId && currentUser.role === "admin") {
        query.studentId = new mongoose.Types.ObjectId(studentId as string);
      }

      const maxResults = parseInt(limit as string) || 200;

      const submissions = await withRetry(() =>
        TestSubmission.find(query)
          .populate("testId", "title sections sectionTimings totalDuration")
          .populate("studentId", "name email")
          .sort({ submittedAt: -1 })
          .limit(maxResults)
          .lean()
      );

      return res.status(200).json(submissions);
    }

    // ======================
    // POST
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

      // Parallel: check duplicate + fetch test
      const [existingSubmission, test] = await withRetry(() =>
        Promise.all([
          TestSubmission.findOne({ testId: testOid, studentId: studentOid })
            .select("_id").lean(),
          Test.findById(testId).lean(),
        ])
      );

      if (existingSubmission) {
        return res.status(400).json({ message: "You have already submitted this test" });
      }

      if (!test) {
        return res.status(404).json({ message: "Test not found" });
      }

      // Calculate scores
      let totalScore = 0;
      let totalMaxScore = 0;
      const sectionResults: any[] = [];

      for (const section of test.sections) {
        const marksPerQuestion =
          section.marksPerQuestion || (section.subject === "maths" ? 2 : 1);
        let sectionScore = 0;
        const questions = section.questions || [];
        const sectionMaxScore = questions.length * marksPerQuestion;
        const questionResults: any[] = [];

        for (let i = 0; i < questions.length; i++) {
          const question = questions[i];
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
            studentAnswer,
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
        totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;

      const submission = await withRetry(() =>
        TestSubmission.create({
          testId: testOid,
          studentId: studentOid,
          answers,
          sectionResults,
          totalScore,
          totalMaxScore,
          percentage,
          submittedAt: new Date(),
        })
      );

      return res.status(201).json({
        _id: submission._id,
        testId: submission.testId,
        studentId: submission.studentId,
        sectionResults: submission.sectionResults,
        totalScore: submission.totalScore,
        totalMaxScore: submission.totalMaxScore,
        percentage: submission.percentage,
        submittedAt: submission.submittedAt,
      });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("attempts error:", error.message);
    return res.status(500).json({ message: error.message });
  }
}