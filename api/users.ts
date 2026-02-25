import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, User, Test, TestSubmission, getUserFromRequest, hashPassword, withRetry } from "./_db.js";
import mongoose from "mongoose";

const getIdString = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value._id) return String(value._id);
    if (value.toString) return String(value.toString());
  }
  return String(value);
};

const getChunkRootId = (test: any): string => {
  const parentId = getIdString(test?.parentTestId);
  if (parentId) return parentId;
  return getIdString(test?._id);
};

const hasChunkMeta = (test: any): boolean => {
  return !!getIdString(test?.parentTestId) || Number(test?.chunkInfo?.total || 0) > 1;
};

const mergeSectionsFromChunks = (tests: any[]): any[] => {
  const sectionMap = new Map<string, any>();
  const sorted = [...tests].sort((a, b) => {
    const aIdx = Number(a?.chunkInfo?.current ?? (a?.parentTestId ? 2 : 1));
    const bIdx = Number(b?.chunkInfo?.current ?? (b?.parentTestId ? 2 : 1));
    return aIdx - bIdx;
  });

  for (const test of sorted) {
    for (const section of test?.sections || []) {
      if (!sectionMap.has(section.subject)) {
        sectionMap.set(section.subject, {
          subject: section.subject,
          marksPerQuestion: section.marksPerQuestion,
          questions: [],
        });
      }
      sectionMap.get(section.subject).questions.push(...(section.questions || []));
    }
  }

  return Array.from(sectionMap.values());
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    await connectDB();

    // Support both consolidated query routing (/api/users?userId=...)
    // and legacy path routing (/api/users/:id[/approve]).
    const requestUrl = new URL(req.url || "/api/users", "http://localhost");
    const pathParts = requestUrl.pathname.split("/").filter(Boolean);
    const pathUserId = pathParts.length > 2 ? pathParts[2] : null;
    const pathAction = pathParts.length > 3 ? pathParts[3] : null;
    const queryUserId = typeof req.query.userId === "string" ? req.query.userId : null;
    const queryAction = typeof req.query.action === "string" ? req.query.action : null;
    const userId = queryUserId || pathUserId;
    const action = queryAction || pathAction;

    // Check if this is attempts endpoint (GET/POST /api/users?action=attempts)
    const isAttemptsPath = pathParts[2] === "attempts" || action === "attempts";

    // ========================
    // GET /api/users/attempts
    // ========================
    if (isAttemptsPath && req.method === "GET") {
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");

      const currentUser = await getUserFromRequest(req);
      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

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
            return { ...sub, canViewAnswerKey: true };
          }

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
              questions: [],
            })),
          };
        });
        return res.status(200).json(processed);
      }

      return res.status(200).json(submissions);
    }

    // ========================
    // POST /api/users/attempts
    // ========================
    if (isAttemptsPath && req.method === "POST") {
      const currentUser = await getUserFromRequest(req);
      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "student") {
        return res.status(403).json({ message: "Only students can submit tests" });
      }

      const { testId, answers } = req.body;

      if (!testId || !answers) {
        return res.status(400).json({ message: "testId and answers are required" });
      }

      const studentOid = new mongoose.Types.ObjectId(currentUser._id.toString());
      if (!mongoose.Types.ObjectId.isValid(String(testId))) {
        return res.status(400).json({ message: "Invalid test ID" });
      }
      const requestedTestOid = new mongoose.Types.ObjectId(String(testId));

      const requestedTest = await withRetry(() => Test.findById(requestedTestOid).lean());
      if (!requestedTest) {
        return res.status(404).json({ message: "Test not found" });
      }

      let rootTestId = getChunkRootId(requestedTest);
      let groupTests: any[] = [requestedTest];
      if (hasChunkMeta(requestedTest)) {
        groupTests = await withRetry(() =>
          Test.find({
            $or: [
              { _id: new mongoose.Types.ObjectId(rootTestId) },
              { parentTestId: new mongoose.Types.ObjectId(rootTestId) },
            ],
          }).lean()
        );
      }

      if (!groupTests.length) {
        return res.status(404).json({ message: "Test not found" });
      }

      if (!hasChunkMeta(requestedTest)) {
        rootTestId = getIdString(requestedTest._id);
      }

      const submissionTestOid = new mongoose.Types.ObjectId(rootTestId);
      const groupIdsForDuplicate = Array.from(new Set(groupTests.map((t: any) => getIdString(t._id))));

      // Prevent duplicate attempts against both canonical root test ID and any legacy chunk IDs.
      const existingSubmission = await withRetry(() =>
        TestSubmission.findOne({
          studentId: studentOid,
          testId: {
            $in: groupIdsForDuplicate.map((id) => new mongoose.Types.ObjectId(id)),
          },
        })
          .select("_id")
          .lean()
      );

      if (existingSubmission) {
        return res.status(400).json({ message: "You have already submitted this test" });
      }

      const rootTest = groupTests.find((t: any) => getIdString(t._id) === rootTestId) || groupTests[0];
      const mergedSections = mergeSectionsFromChunks(groupTests);
      const test: any = {
        ...rootTest,
        _id: rootTestId,
        sections: mergedSections,
      };

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
          testId: submissionTestOid,
          studentId: studentOid,
          answers,
          sectionResults,
          totalScore,
          totalMaxScore,
          percentage,
          submittedAt: new Date(),
        })
      );

      // Strip answer details if answer key is hidden
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
        responseData.sectionResults = submission.sectionResults;
      } else {
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

    // From here: user management endpoints and GET /api/users
    const currentUser = await getUserFromRequest(req);

    // ========================
    // GET /api/users or /api/users/:id
    // ========================
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");

      // GET specific user by ID
      if (userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
        const user = await withRetry(() =>
          User.findById(userId)
            .select("-password")
            .lean()
        );

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json(user);
      }

      // GET all users (list) - only admin
      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const users = await withRetry(() =>
        User.find().select("-password").sort({ createdAt: -1 }).lean()
      );
      return res.status(200).json(users);
    }

    // ========================
    // POST /api/users
    // ========================
    if (req.method === "POST") {
      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const { email, password, name, role, course, stream, approved } = req.body;

      if (!email || !password || !name || !role) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      if (!["admin", "teacher", "student", "coordinator"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      if (stream && !["PCM", "PCB"].includes(stream)) {
        return res.status(400).json({ message: "Stream must be 'PCM' or 'PCB'" });
      }

      // Parallel: check existing + hash password
      const [existing, hashed] = await Promise.all([
        withRetry(() =>
          User.findOne({ email: email.toLowerCase() }).select("_id").lean()
        ),
        hashPassword(password),
      ]);

      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const userData: any = {
        email: email.toLowerCase(),
        password: hashed,
        name,
        role,
        approved: !!approved,
      };

      if (course) userData.course = course;
      if (stream) userData.stream = stream;

      await withRetry(() => User.create(userData));

      const created = await User.findOne({ email: email.toLowerCase() })
        .select("-password")
        .lean();

      return res.status(201).json(created);
    }

    // ========================
    // DELETE /api/users/:id
    // ========================
    if (req.method === "DELETE" && userId && userId.match(/^[0-9a-fA-F]{24}$/)) {
      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      // Prevent admin from deleting themselves
      if (userId === currentUser._id.toString()) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      const user = await withRetry(() =>
        User.findByIdAndDelete(userId)
          .select("_id email name role")
          .lean()
      );

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({ message: "User deleted successfully" });
    }

    // ========================
    // PATCH /api/users/:id/approve
    // ========================
    if (req.method === "PATCH" && userId && userId.match(/^[0-9a-fA-F]{24}$/) && action === "approve") {
      if (!currentUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      // Atomic update: only update if not already approved
      const user = await withRetry(() =>
        User.findOneAndUpdate(
          { _id: userId, approved: { $ne: true } },
          { approved: true },
          { new: true }
        )
          .select("-password")
          .lean()
      );

      if (!user) {
        // Check if user exists but is already approved
        const exists = await User.findById(userId).select("approved").lean();
        if (!exists) {
          return res.status(404).json({ message: "User not found" });
        }
        if (exists.approved) {
          return res.status(200).json({ message: "User already approved", ...exists });
        }
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json(user);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already registered" });
    }
    console.error("Users API error:", error.message);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}
