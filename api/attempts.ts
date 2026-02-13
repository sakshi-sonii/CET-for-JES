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
          .populate("testId", "title sections sectionTimings testType stream customDuration showAnswerKey")
          .populate("studentId", "name email")
          .sort({ submittedAt: -1 })
          .limit(maxResults)
          .lean()
      );

      // If student, strip answer details when answer key is hidden
      if (currentUser.role === "student") {
        const processed = submissions.map((sub: any) => {
          const test = sub.testId;
          const showAnswerKey = test?.showAnswerKey ?? false;

          if (showAnswerKey) {
            // Full data — include canViewAnswerKey flag
            return { ...sub, canViewAnswerKey: true };
          }

          // Strip correct answers, explanations, and per-question details
          return {
            ...sub,
            canViewAnswerKey: false,
            sectionResults: sub.sectionResults?.map((sr: any) => ({
              subject: sr.subject,
              score: sr.score,
              maxScore: sr.maxScore,
              marksPerQuestion: sr.marksPerQuestion,
              correctCount: sr.correctCount,
              incorrectCount: sr.incorrectCount,
              unansweredCount: sr.unansweredCount,
              // Strip detailed question data — student only sees aggregate scores
              questions: [],
            })),
          };
        });
        return res.status(200).json(processed);
      }

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
          Test.findById(testOid).lean(),
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

      for (const section of (test as any).sections) {
        const marksPerQuestion =
          section.marksPerQuestion || (section.subject === "maths" ? 2 : 1);

        const questions = section.questions || [];
        const sectionMaxScore = questions.length * marksPerQuestion;

        let sectionScore = 0;
        let correctCount = 0;
        let incorrectCount = 0;
        let unansweredCount = 0;
        const questionResults: any[] = [];

        for (let i = 0; i < questions.length; i++) {
          const question = questions[i];
          const questionKey = `${section.subject}_${i}`;
          const rawAnswer = answers[questionKey];
          const studentAnswer =
            rawAnswer !== undefined && rawAnswer !== null
              ? Number(rawAnswer)
              : null;

          const isCorrect =
            studentAnswer !== null && studentAnswer === question.correct;

          const marksAwarded = isCorrect ? marksPerQuestion : 0;

          if (studentAnswer === null) {
            unansweredCount++;
          } else if (isCorrect) {
            correctCount++;
            sectionScore += marksPerQuestion;
          } else {
            incorrectCount++;
          }

          questionResults.push({
            questionIndex: i,
            question: question.question || "",
            questionImage: question.questionImage || "",
            options: question.options || [],
            optionImages: question.optionImages?.length ? question.optionImages : [],
            correctAnswer: question.correct,
            studentAnswer,
            isCorrect,
            explanation: question.explanation || "",
            explanationImage: question.explanationImage || "",
            marksAwarded,
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
          correctCount,
          incorrectCount,
          unansweredCount,
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

      // Return response — strip answer details if answer key is hidden
      const showAnswerKey = (test as any).showAnswerKey ?? false;

      const responseData: any = {
        _id: submission._id,
        testId: submission.testId,
        studentId: submission.studentId,
        totalScore: submission.totalScore,
        totalMaxScore: submission.totalMaxScore,
        percentage: submission.percentage,
        submittedAt: submission.submittedAt,
        canViewAnswerKey: showAnswerKey,
      };

      if (showAnswerKey) {
        // Include full section results with answers and explanations
        responseData.sectionResults = submission.sectionResults;
      } else {
        // Only include aggregate scores, no question details
        responseData.sectionResults = submission.sectionResults.map((sr: any) => ({
          subject: sr.subject,
          score: sr.score,
          maxScore: sr.maxScore,
          marksPerQuestion: sr.marksPerQuestion,
          correctCount: sr.correctCount,
          incorrectCount: sr.incorrectCount,
          unansweredCount: sr.unansweredCount,
          questions: [],
        }));
      }

      return res.status(201).json(responseData);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Submissions API error:", error.message);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}