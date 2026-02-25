import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest, withRetry } from "./_db.js";
import mongoose from "mongoose";

const VALID_SUBJECTS = ["physics", "chemistry", "maths", "biology"];

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

const CHUNK_TITLE_SUFFIX_RE = /\s*\(\s*part\s+\d+\s*\/\s*\d+\s*\)\s*$/i;

const normalizeChunkTitle = (value: any): string => {
  const title = typeof value === "string" ? value : "";
  return title.replace(CHUNK_TITLE_SUFFIX_RE, "").trim();
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

const mergeChunkGroup = (group: any[]): any => {
  const root = group.find((t) => !t?.parentTestId) || group[0];
  const groupId = root?.parentTestId ? getIdString(root._id) : getChunkRootId(root);
  const mergedSections = mergeSectionsFromChunks(group);
  const subjectsIncluded = Array.from(new Set(mergedSections.map((s: any) => s.subject)));

  return {
    ...root,
    _id: groupId,
    title: normalizeChunkTitle(root?.title),
    parentTestId: undefined,
    chunkInfo: undefined,
    sections: mergedSections,
    subjectsIncluded,
  };
};

const aggregateChunkedTests = (tests: any[]): any[] => {
  const groups = new Map<string, any[]>();
  for (const test of tests) {
    const key = getChunkRootId(test);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(test);
  }

  const merged = Array.from(groups.values()).map((group) => {
    const isChunkedGroup = group.some((t) => hasChunkMeta(t)) || group.length > 1;
    if (!isChunkedGroup) return group[0];
    return mergeChunkGroup(group);
  });

  return merged.sort((a, b) => {
    const aTime = new Date(a?.createdAt || 0).getTime();
    const bTime = new Date(b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
};

const getChunkGroupIds = async (testId: string): Promise<string[]> => {
  const target = await withRetry(() => Test.findById(testId).select("_id parentTestId").lean());
  if (!target) return [];

  const rootId = getChunkRootId(target);
  const group = await withRetry(() =>
    Test.find({
      $or: [{ _id: new mongoose.Types.ObjectId(rootId) }, { parentTestId: new mongoose.Types.ObjectId(rootId) }],
    })
      .select("_id")
      .lean()
  );

  return group.map((t: any) => String(t._id));
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
    const currentUser = await getUserFromRequest(req);

    if (!currentUser) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Support both consolidated query routing (/api/tests?testId=...)
    // and legacy path routing (/api/tests/:id[/approve]).
    const requestUrl = new URL(req.url || "/api/tests", "http://localhost");
    const pathParts = requestUrl.pathname.split("/").filter(Boolean);
    const pathTestId = pathParts.length > 2 ? pathParts[2] : null;
    const pathAction = pathParts.length > 3 ? pathParts[3] : null;
    const queryTestId = typeof req.query.testId === "string" ? req.query.testId : null;
    const queryAction = typeof req.query.action === "string" ? req.query.action : null;
    const testId = queryTestId || pathTestId;
    const action = queryAction || pathAction;

    // ========================
    // GET /api/tests or /api/tests/:id
    // ========================
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");

      // GET specific test by ID
      if (testId && testId.match(/^[0-9a-fA-F]{24}$/)) {
        let query: any = { _id: testId };

        if (currentUser.role === "student") {
          query.approved = true;
          query.active = true;
          query.course = currentUser.course;
        } else if (currentUser.role === "teacher") {
          query.teacherId = currentUser._id;
        } else if (currentUser.role === "coordinator") {
          // Coordinators can view:
          // 1) their own composed tests
          // 2) teacher submissions pending coordinator-side workflow
          query = {
            _id: testId,
            $or: [
              { coordinatorId: currentUser._id },
              {
                teacherId: { $exists: true, $ne: null },
                approved: false,
              },
            ]
          };
        }
        // Admin sees all

        const test = await withRetry(() =>
          Test.findOne(query).lean()
        );

        if (!test) {
          if (currentUser.role !== "admin") {
            const exists = await Test.exists({ _id: testId });
            if (exists) {
              return res.status(403).json({ message: "Access denied" });
            }
          }
          return res.status(404).json({ message: "Test not found" });
        }

        if (hasChunkMeta(test)) {
          const rootId = getChunkRootId(test);
          const group = await withRetry(() =>
            Test.find({
              $or: [
                { _id: new mongoose.Types.ObjectId(rootId) },
                { parentTestId: new mongoose.Types.ObjectId(rootId) },
              ],
            }).lean()
          );
          if (group.length > 0) {
            return res.status(200).json(mergeChunkGroup(group));
          }
        }

        return res.status(200).json(test);
      }

      // GET all tests (list)
      let query: any = {};

      if (currentUser.role === "student") {
        query = {
          approved: true,
          active: true,
          course: currentUser.course,
        };
      } else if (currentUser.role === "teacher") {
        query = {
          teacherId: new mongoose.Types.ObjectId(currentUser._id.toString()),
        };
      } else if (currentUser.role === "coordinator") {
        // Coordinators see teacher submissions pending coordinator-side workflow
        // plus tests created by themselves.
        query = {
          $or: [
            {
              teacherId: { $exists: true, $ne: null },
              approved: false,
            },
            { coordinatorId: new mongoose.Types.ObjectId(currentUser._id.toString()) }
          ]
        };
      }
      // Admin sees all

      const tests = await withRetry(() =>
        Test.find(query).sort({ createdAt: -1 }).lean()
      );

      return res.status(200).json(aggregateChunkedTests(tests));
    }

    // ========================
    // POST /api/tests
    // ========================
    if (req.method === "POST") {
      if (!["teacher", "coordinator"].includes(currentUser.role)) {
        return res.status(403).json({ message: "Only teachers and coordinators can create tests" });
      }

      if (!currentUser.approved) {
        return res.status(403).json({ message: "Your account is not approved yet" });
      }

      const {
        title,
        course,
        testType = "custom",
        stream,
        sections,
        flatQuestions,
        subjectsIncluded,
        sectionTimings,
        customDuration,
        customSubjects,
        showAnswerKey = false,
        isChunk = false,
        chunkIndex = 0,
        totalChunks = 1,
        parentTestId,
        chunkInfo,
      } = req.body;
      const isTeacherSubmission = currentUser.role === "teacher";
      const effectiveTestType = isTeacherSubmission ? "custom" : testType;

      // Convert flatQuestions to sections if provided
      let processedSections = sections;
      if (flatQuestions && !sections) {
        const sectionsMap = new Map<string, any>();
        for (const q of flatQuestions) {
          const subject = q.subject || 'unknown';
          if (!sectionsMap.has(subject)) {
            sectionsMap.set(subject, {
              subject,
              marksPerQuestion: q.marksPerQuestion || (subject === 'maths' ? 2 : 1),
              questions: [],
            });
          }
          const { subject: _, marksPerQuestion: __, ...questionWithoutSubject } = q;
          sectionsMap.get(subject).questions.push(questionWithoutSubject);
        }
        processedSections = Array.from(sectionsMap.values());
      }

      // ---- Basic validation ----
      if (!title?.trim()) {
        return res.status(400).json({ message: "Title is required" });
      }
      if (!course) {
        return res.status(400).json({ message: "Course is required" });
      }
      if (!processedSections || !Array.isArray(processedSections) || processedSections.length === 0) {
        return res.status(400).json({ message: "At least one section is required" });
      }
      if (!["mock", "custom"].includes(effectiveTestType)) {
        return res.status(400).json({ message: "testType must be 'mock' or 'custom'" });
      }

      // ---- Teacher constraint: can only upload for assigned subjects ----
      if (currentUser.role === "teacher") {
        const assignedSubjects = currentUser.assignedSubjects || [];
        for (const section of processedSections) {
          const subject = section.subject?.toLowerCase();
          if (!subject) {
            return res.status(400).json({ message: "Section must have a subject" });
          }
        }
      }

      // ---- Validate sections ----
      const providedSubjects: string[] = [];

      for (const section of processedSections) {
        const subject = section.subject?.toLowerCase();

        if (!subject || !VALID_SUBJECTS.includes(subject)) {
          return res.status(400).json({
            message: `Invalid subject: "${section.subject}". Must be one of: ${VALID_SUBJECTS.join(", ")}`,
          });
        }

        if (providedSubjects.includes(subject)) {
          return res.status(400).json({
            message: `Duplicate section: ${subject}. Each subject can only appear once.`,
          });
        }
        providedSubjects.push(subject);

        if (!section.questions || !Array.isArray(section.questions) || section.questions.length === 0) {
          return res.status(400).json({
            message: `Section "${subject}" must have at least one question`,
          });
        }

        // Validate each question
        for (let i = 0; i < section.questions.length; i++) {
          const q = section.questions[i];

          // Question needs text OR image
          const hasQuestion = q.question?.trim() || q.questionImage;
          if (!hasQuestion) {
            return res.status(400).json({
              message: `Question ${i + 1} in "${subject}" needs question text or image`,
            });
          }

          // Must have at least 2 options (text or image)
          if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            return res.status(400).json({
              message: `Question ${i + 1} in "${subject}" must have at least 2 options`,
            });
          }

          // Each option needs text or image
          for (let oi = 0; oi < q.options.length; oi++) {
            const hasOptText = q.options[oi]?.trim();
            const hasOptImage = q.optionImages?.[oi]?.trim();
            if (!hasOptText && !hasOptImage) {
              return res.status(400).json({
                message: `Option ${oi + 1} of question ${i + 1} in "${subject}" needs text or image`,
              });
            }
          }

          if (q.correct === undefined || q.correct === null) {
            return res.status(400).json({
              message: `Question ${i + 1} in "${subject}" must have a correct answer index`,
            });
          }

          if (q.correct < 0 || q.correct >= q.options.length) {
            return res.status(400).json({
              message: `Question ${i + 1} in "${subject}" has invalid correct answer index`,
            });
          }
        }
      }

      // ---- Mock test validation ----
      // Skip strict validation for:
      // 1. Teacher submissions (always custom)
      // 2. Coordinator submissions that are chunked (sent in parts)
      const skipStrictValidation = isTeacherSubmission || isChunk;
      
      if (effectiveTestType === "mock" && !skipStrictValidation) {
        // Must have physics and chemistry
        if (!providedSubjects.includes("physics") || !providedSubjects.includes("chemistry")) {
          return res.status(400).json({
            message: "Mock test requires both Physics and Chemistry sections",
          });
        }

        // Must have maths or biology for phase 2
        const hasMaths = providedSubjects.includes("maths");
        const hasBiology = providedSubjects.includes("biology");
        if (!hasMaths && !hasBiology) {
          return res.status(400).json({
            message: "Mock test requires either Mathematics or Biology section",
          });
        }

        // Validate stream
        if (stream && !["PCM", "PCB"].includes(stream)) {
          return res.status(400).json({
            message: "Stream must be 'PCM' or 'PCB'",
          });
        }
      }

      // ---- Custom test validation ----
      if (effectiveTestType === "custom" && !isTeacherSubmission) {
        const duration = customDuration || 60;
        if (duration < 1 || duration > 600) {
          return res.status(400).json({
            message: "Custom test duration must be between 1 and 600 minutes",
          });
        }
      }

      // ---- Build processed sections ----
      processedSections = processedSections.map((section: any) => {
        const subject = section.subject.toLowerCase();
        return {
          subject,
          marksPerQuestion: section.marksPerQuestion || (subject === "maths" ? 2 : 1),
          questions: section.questions.map((q: any) => ({
            question: q.question || "",
            questionImage: q.questionImage || "",
            options: q.options,
            optionImages: q.optionImages?.some((img: string) => img)
              ? q.optionImages
              : [],
            correct: q.correct,
            explanation: q.explanation || "",
            explanationImage: q.explanationImage || "",
          })),
        };
      });

      // ---- Determine stream for mock tests ----
      let resolvedStream = stream;
      if (effectiveTestType === "mock" && !resolvedStream) {
        if (providedSubjects.includes("biology") && !providedSubjects.includes("maths")) {
          resolvedStream = "PCB";
        } else {
          resolvedStream = "PCM";
        }
      }

      // ---- Build test document ----
      const testDoc: any = {
        title: isChunk ? normalizeChunkTitle(title) : title.trim(),
        course,
        testType: effectiveTestType,
        sections: processedSections,
        subjectsIncluded: providedSubjects,
        // Coordinator/Admin control this; teacher submissions always start hidden.
        showAnswerKey: false,
        approved: false,
        active: false,
      };

      // Persist chunk metadata for split uploads.
      if (isChunk) {
        const currentChunk =
          chunkInfo?.current !== undefined
            ? Number(chunkInfo.current)
            : Number(chunkIndex) + 1;
        const totalChunkCount =
          chunkInfo?.total !== undefined
            ? Number(chunkInfo.total)
            : Number(totalChunks);

        if (
          Number.isFinite(currentChunk) &&
          Number.isFinite(totalChunkCount) &&
          currentChunk >= 1 &&
          totalChunkCount >= 1 &&
          currentChunk <= totalChunkCount
        ) {
          testDoc.chunkInfo = {
            current: Math.floor(currentChunk),
            total: Math.floor(totalChunkCount),
          };
        }

        if (parentTestId && mongoose.Types.ObjectId.isValid(String(parentTestId))) {
          testDoc.parentTestId = new mongoose.Types.ObjectId(String(parentTestId));
        }
      }

      // Set creator based on role
      if (currentUser.role === "teacher") {
        testDoc.teacherId = new mongoose.Types.ObjectId(currentUser._id.toString());
        testDoc.reviewStatus = "submitted_to_coordinator";
        testDoc.reviewComment = "";
        testDoc.testType = "custom";
        testDoc.customDuration = 60;
        testDoc.customSubjects = providedSubjects;
      } else if (currentUser.role === "coordinator") {
        testDoc.coordinatorId = new mongoose.Types.ObjectId(currentUser._id.toString());
        testDoc.reviewStatus = "submitted_to_admin";
        testDoc.reviewComment = "";
        testDoc.showAnswerKey = !!showAnswerKey;
      }

      if (effectiveTestType === "mock" && !isTeacherSubmission) {
        testDoc.stream = resolvedStream;
        testDoc.sectionTimings = {
          physicsChemistry: sectionTimings?.physicsChemistry ?? 90,
          mathsOrBiology: sectionTimings?.mathsOrBiology ?? 90,
        };
      } else if (!isTeacherSubmission) {
        testDoc.customDuration = customDuration ?? 60;
        testDoc.customSubjects = providedSubjects;
      }

      const test = await withRetry(() => Test.create(testDoc));

      return res.status(201).json(test);
    }

    // ========================
    // PATCH /api/tests/:id or /api/tests/:id/approve
    // ========================
    if (req.method === "PATCH") {
      if (!testId || !testId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ message: "Invalid test ID" });
      }

      // Handle /approve endpoint
      if (action === "approve") {
        if (currentUser.role !== "admin") {
          return res.status(403).json({ message: "Only admin can approve tests" });
        }

        const test = await withRetry(() =>
          Test.findById(testId)
            .select("_id parentTestId")
            .lean()
        );

        if (!test) {
          return res.status(404).json({ message: "Test not found" });
        }

        const rootId = getChunkRootId(test);
        const group = await withRetry(() =>
          Test.find({
            $or: [
              { _id: new mongoose.Types.ObjectId(rootId) },
              { parentTestId: new mongoose.Types.ObjectId(rootId) },
            ],
          })
            .select("approved testType stream teacherId coordinatorId sections.subject sections.questions")
            .lean()
        );

        if (!group.length) {
          return res.status(404).json({ message: "Test not found" });
        }

        const mergedTest = mergeChunkGroup(group);

        if (group.some((t: any) => !!t.teacherId)) {
          return res.status(403).json({
            message: "Admin can only approve tests created by coordinators",
          });
        }

        if (group.every((t: any) => !!t.approved)) {
          return res.status(400).json({ message: "Test is already approved" });
        }

        // Must have at least one section
        if (!mergedTest.sections || mergedTest.sections.length === 0) {
          return res.status(400).json({
            message: "Cannot approve: test has no sections.",
          });
        }

        // Every section must have at least one question
        for (const section of mergedTest.sections) {
          if (!section.questions || section.questions.length === 0) {
            return res.status(400).json({
              message: `Cannot approve: "${section.subject}" section has no questions.`,
            });
          }
        }

        // Only mock tests require specific subject combinations
        if (mergedTest.testType === "mock") {
          const testSubjects = mergedTest.sections.map((s: any) => s.subject);
          const hasPhy = testSubjects.includes("physics");
          const hasChem = testSubjects.includes("chemistry");
          const hasMaths = testSubjects.includes("maths");
          const hasBio = testSubjects.includes("biology");

          if (!hasPhy) {
            return res.status(400).json({
              message: 'Cannot approve mock test: missing "physics" section.',
            });
          }
          if (!hasChem) {
            return res.status(400).json({
              message: 'Cannot approve mock test: missing "chemistry" section.',
            });
          }
          if (!hasMaths && !hasBio) {
            return res.status(400).json({
              message: 'Cannot approve mock test: needs either "maths" or "biology" section.',
            });
          }
        }

        const groupIds = group.map((t: any) => new mongoose.Types.ObjectId(String(t._id)));
        await withRetry(() =>
          Test.updateMany(
            { _id: { $in: groupIds } },
            { approved: true, reviewStatus: "approved", reviewedAt: new Date() }
          )
        );

        return res.status(200).json({
          ...mergedTest,
          approved: true,
          reviewStatus: "approved",
          reviewedAt: new Date(),
        });
      }

      // Handle coordinator review of teacher question banks
      if (action === "review") {
        if (currentUser.role !== "coordinator") {
          return res.status(403).json({ message: "Only coordinator can review teacher submissions" });
        }

        const { decision, comment } = req.body || {};
        if (!["accept", "return"].includes(decision)) {
          return res.status(400).json({ message: "decision must be 'accept' or 'return'" });
        }
        if (decision === "return" && !String(comment || "").trim()) {
          return res.status(400).json({ message: "Comment is required when sending back for edits" });
        }

        const test = await withRetry(() =>
          Test.findOne({
            _id: testId,
            teacherId: { $exists: true, $ne: null },
            approved: false,
          })
            .select("_id reviewStatus")
            .lean()
        );

        if (!test) {
          return res.status(404).json({ message: "Teacher submission not found" });
        }

        const update: any =
          decision === "accept"
            ? {
                reviewStatus: "accepted_by_coordinator",
                reviewComment: "",
              }
            : {
                reviewStatus: "changes_requested",
                reviewComment: String(comment).trim(),
              };

        update.reviewedAt = new Date();
        update.reviewedBy = new mongoose.Types.ObjectId(currentUser._id.toString());

        const updated = await withRetry(() =>
          Test.findByIdAndUpdate(testId, update, { new: true }).lean()
        );

        return res.status(200).json(updated);
      }

      // Handle regular PATCH
      const {
        active,
        title,
        sections,
        sectionTimings,
        showAnswerKey,
        testType,
        stream,
        customDuration,
        customSubjects,
        chunkInfo,
        parentTestId,
      } = req.body;

      const update: any = {};

      if (currentUser.role === "teacher" || currentUser.role === "coordinator") {
        const query: any = { _id: testId };
        if (currentUser.role === "teacher") {
          query.teacherId = currentUser._id;
        } else if (currentUser.role === "coordinator") {
          query.coordinatorId = currentUser._id;
        }

        const test = await withRetry(() =>
          Test.findOne(query)
            .select("approved reviewStatus")
            .lean()
        );

        if (!test) {
          const exists = await Test.exists({ _id: testId });
          if (!exists) return res.status(404).json({ message: "Test not found" });
          return res.status(403).json({ message: "Access denied" });
        }

        // Coordinator/Admin control publish switches; teacher cannot toggle these.
        if (currentUser.role === "teacher" && (active !== undefined || showAnswerKey !== undefined)) {
          return res.status(403).json({ message: "Only coordinator/admin can change active status or answer key visibility" });
        }

        if (currentUser.role === "coordinator") {
          if (active !== undefined && test.approved) {
            update.active = !!active;
          }
          if (showAnswerKey !== undefined) {
            update.showAnswerKey = !!showAnswerKey;
          }
          if (chunkInfo && typeof chunkInfo === "object") {
            const current = Number((chunkInfo as any).current);
            const total = Number((chunkInfo as any).total);
            if (
              Number.isFinite(current) &&
              Number.isFinite(total) &&
              current >= 1 &&
              total >= 1 &&
              current <= total
            ) {
              update.chunkInfo = {
                current: Math.floor(current),
                total: Math.floor(total),
              };
            }
          }
          if (parentTestId && mongoose.Types.ObjectId.isValid(String(parentTestId))) {
            update.parentTestId = new mongoose.Types.ObjectId(String(parentTestId));
          }
        }

        // Can update content only if NOT approved
        if (!test.approved) {
          if (currentUser.role === "teacher" && test.reviewStatus === "accepted_by_coordinator") {
            return res.status(400).json({ message: "Submission already accepted by coordinator and locked for edits" });
          }

          let teacherEdited = false;
          if (title?.trim()) {
            update.title = title.trim();
            if (currentUser.role === "teacher") teacherEdited = true;
          }
          if (testType && ["mock", "custom"].includes(testType)) {
            update.testType = testType;
            if (currentUser.role === "teacher") teacherEdited = true;
          }
          if (stream && ["PCM", "PCB"].includes(stream)) {
            update.stream = stream;
            if (currentUser.role === "teacher") teacherEdited = true;
          }
          if (sections && Array.isArray(sections) && sections.length > 0) {
            update.sections = buildProcessedSections(sections);
            if (currentUser.role === "teacher") teacherEdited = true;
          }
          if (sectionTimings) {
            update.sectionTimings = {
              physicsChemistry: sectionTimings.physicsChemistry ?? 90,
              mathsOrBiology: sectionTimings.mathsOrBiology ?? 90,
            };
            if (currentUser.role === "teacher") teacherEdited = true;
          }
          if (customDuration !== undefined) {
            const dur = Number(customDuration);
            if (dur >= 1 && dur <= 600) {
              update.customDuration = dur;
              if (currentUser.role === "teacher") teacherEdited = true;
            }
          }
          if (customSubjects && Array.isArray(customSubjects)) {
            update.customSubjects = customSubjects.filter(
              (s: string) => VALID_SUBJECTS.includes(s)
            );
            if (currentUser.role === "teacher") teacherEdited = true;
          }

          // Teacher re-submission after feedback
          if (currentUser.role === "teacher" && teacherEdited) {
            update.reviewStatus = "submitted_to_coordinator";
            update.reviewComment = "";
          }
        }
      } else {
        // Admin can update everything
        if (active !== undefined) update.active = !!active;
        if (showAnswerKey !== undefined) {
          update.showAnswerKey = !!showAnswerKey;
        }
        if (title?.trim()) update.title = title.trim();
        if (testType && ["mock", "custom"].includes(testType)) {
          update.testType = testType;
        }
        if (stream && ["PCM", "PCB"].includes(stream)) {
          update.stream = stream;
        }
        if (sections && Array.isArray(sections) && sections.length > 0) {
          update.sections = buildProcessedSections(sections);
        }
        if (sectionTimings) {
          update.sectionTimings = {
            physicsChemistry: sectionTimings.physicsChemistry ?? 90,
            mathsOrBiology: sectionTimings.mathsOrBiology ?? 90,
          };
        }
        if (customDuration !== undefined) {
          const dur = Number(customDuration);
          if (dur >= 1 && dur <= 600) {
            update.customDuration = dur;
          }
        }
        if (customSubjects && Array.isArray(customSubjects)) {
          update.customSubjects = customSubjects.filter(
            (s: string) => VALID_SUBJECTS.includes(s)
          );
        }
        if (chunkInfo && typeof chunkInfo === "object") {
          const current = Number((chunkInfo as any).current);
          const total = Number((chunkInfo as any).total);
          if (
            Number.isFinite(current) &&
            Number.isFinite(total) &&
            current >= 1 &&
            total >= 1 &&
            current <= total
          ) {
            update.chunkInfo = {
              current: Math.floor(current),
              total: Math.floor(total),
            };
          }
        }
        if (parentTestId && mongoose.Types.ObjectId.isValid(String(parentTestId))) {
          update.parentTestId = new mongoose.Types.ObjectId(String(parentTestId));
        }
      }

      if (Object.keys(update).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const groupWideUpdate: any = {};
      if (update.active !== undefined) groupWideUpdate.active = update.active;
      if (update.showAnswerKey !== undefined) groupWideUpdate.showAnswerKey = update.showAnswerKey;

      if (Object.keys(groupWideUpdate).length > 0) {
        const groupIds = await getChunkGroupIds(testId);
        if (groupIds.length > 1) {
          await withRetry(() =>
            Test.updateMany(
              {
                _id: {
                  $in: groupIds.map((id) => new mongoose.Types.ObjectId(id)),
                },
              },
              groupWideUpdate
            )
          );
        }
      }

      const updated = await withRetry(() =>
        Test.findByIdAndUpdate(testId, update, { new: true }).lean()
      );

      if (!updated) {
        return res.status(404).json({ message: "Test not found" });
      }

      if (hasChunkMeta(updated)) {
        const rootId = getChunkRootId(updated);
        const group = await withRetry(() =>
          Test.find({
            $or: [
              { _id: new mongoose.Types.ObjectId(rootId) },
              { parentTestId: new mongoose.Types.ObjectId(rootId) },
            ],
          }).lean()
        );
        if (group.length > 0) {
          return res.status(200).json(mergeChunkGroup(group));
        }
      }

      return res.status(200).json(updated);
    }

    // ========================
    // DELETE /api/tests/:id
    // ========================
    if (req.method === "DELETE") {
      if (!testId || !testId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ message: "Invalid test ID" });
      }

      const groupIds = await getChunkGroupIds(testId);
      if (groupIds.length > 1) {
        const permissionQuery: any =
          currentUser.role === "admin"
            ? { _id: { $in: groupIds.map((id) => new mongoose.Types.ObjectId(id)) } }
            : currentUser.role === "coordinator"
            ? {
                _id: { $in: groupIds.map((id) => new mongoose.Types.ObjectId(id)) },
                coordinatorId: currentUser._id,
              }
            : {
                _id: { $in: groupIds.map((id) => new mongoose.Types.ObjectId(id)) },
                teacherId: currentUser._id,
              };

        const result = await withRetry(() => Test.deleteMany(permissionQuery));
        if (result.deletedCount && result.deletedCount > 0) {
          return res.status(200).json({ message: "Test deleted successfully" });
        }
      }

      const query: any = { _id: testId };

      if (currentUser.role === "teacher") {
        query.teacherId = currentUser._id;
      } else if (currentUser.role === "coordinator") {
        query.coordinatorId = currentUser._id;
      }
      // Admin can delete any

      const deleted = await withRetry(() =>
        Test.findOneAndDelete(query).select("_id title").lean()
      );

      if (!deleted) {
        const exists = await Test.exists({ _id: testId });
        if (!exists) return res.status(404).json({ message: "Test not found" });
        return res.status(403).json({ message: "Access denied" });
      }

      return res.status(200).json({ message: "Test deleted successfully" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Tests API error:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}

// ========================
// Helper: Process sections for storage
// ========================
function buildProcessedSections(sections: any[]): any[] {
  return sections
    .filter((section: any) => {
      const subject = section.subject?.toLowerCase();
      return (
        subject &&
        VALID_SUBJECTS.includes(subject) &&
        section.questions?.length > 0
      );
    })
    .map((section: any) => {
      const subject = section.subject.toLowerCase();
      return {
        subject,
        marksPerQuestion:
          section.marksPerQuestion || (subject === "maths" ? 2 : 1),
        questions: section.questions.map((q: any) => ({
          question: q.question || "",
          questionImage: q.questionImage || "",
          options: q.options || [],
          optionImages: q.optionImages?.some((img: string) => img)
            ? q.optionImages
            : [],
          correct: q.correct,
          explanation: q.explanation || "",
          explanationImage: q.explanationImage || "",
        })),
      };
    });
}
