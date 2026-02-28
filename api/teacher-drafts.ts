import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, TeacherDraft, getUserFromRequest, withRetry } from "./_db.js";
import mongoose from "mongoose";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
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

    if (currentUser.role !== "teacher") {
      return res.status(403).json({ message: "Only teachers can access draft storage" });
    }

    const teacherId = new mongoose.Types.ObjectId(String(currentUser._id));

    if (req.method === "GET") {
      const saved = await withRetry(() =>
        TeacherDraft.findOne({ teacherId }).select("drafts").lean()
      );
      return res.status(200).json({ drafts: Array.isArray(saved?.drafts) ? saved.drafts : [] });
    }

    if (req.method === "PUT") {
      const mode = typeof req.body?.mode === "string" ? String(req.body.mode) : "full";

      if (mode === "full") {
        const drafts = Array.isArray(req.body?.drafts) ? req.body.drafts : null;
        if (!drafts) {
          return res.status(400).json({ message: "drafts must be an array" });
        }

        const updated = await withRetry(() =>
          TeacherDraft.findOneAndUpdate(
            { teacherId },
            { $set: { drafts }, $unset: { draftSync: "" } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          )
            .select("drafts updatedAt")
            .lean()
        );

        return res.status(200).json({
          message: "Drafts synced",
          drafts: Array.isArray(updated?.drafts) ? updated.drafts : [],
          updatedAt: updated?.updatedAt,
        });
      }

      if (mode === "chunk_init") {
        const sessionId =
          typeof req.body?.sessionId === "string" ? String(req.body.sessionId) : "";
        const totalChunks = Number(req.body?.totalChunks);
        if (!sessionId || !Number.isFinite(totalChunks) || totalChunks < 1) {
          return res.status(400).json({ message: "sessionId and valid totalChunks are required" });
        }

        await withRetry(() =>
          TeacherDraft.findOneAndUpdate(
            { teacherId },
            {
              $set: {
                draftSync: {
                  sessionId,
                  totalChunks: Math.floor(totalChunks),
                  chunks: [],
                  startedAt: new Date().toISOString(),
                },
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          )
        );

        return res.status(200).json({ message: "Draft sync session initialized" });
      }

      if (mode === "chunk_part") {
        const sessionId =
          typeof req.body?.sessionId === "string" ? String(req.body.sessionId) : "";
        const chunkIndex = Number(req.body?.chunkIndex);
        const totalChunks = Number(req.body?.totalChunks);
        const chunkDrafts = Array.isArray(req.body?.drafts) ? req.body.drafts : null;

        if (
          !sessionId ||
          !Number.isFinite(chunkIndex) ||
          !Number.isFinite(totalChunks) ||
          !chunkDrafts
        ) {
          return res.status(400).json({
            message: "sessionId, chunkIndex, totalChunks and drafts[] are required",
          });
        }

        const saved = await withRetry(() =>
          TeacherDraft.findOne({ teacherId }).select("draftSync").lean()
        );

        const syncState: any = saved?.draftSync || null;
        if (!syncState || String(syncState.sessionId) !== sessionId) {
          return res.status(409).json({ message: "Draft sync session not found or expired" });
        }

        if (Number(syncState.totalChunks) !== Math.floor(totalChunks)) {
          return res.status(400).json({ message: "totalChunks mismatch for active sync session" });
        }

        const chunks = Array.isArray(syncState.chunks) ? [...syncState.chunks] : [];
        const normalizedIndex = Math.floor(chunkIndex);
        if (normalizedIndex < 0 || normalizedIndex >= Math.floor(totalChunks)) {
          return res.status(400).json({ message: "Invalid chunkIndex" });
        }

        const withoutCurrent = chunks.filter((c: any) => Number(c?.index) !== normalizedIndex);
        withoutCurrent.push({ index: normalizedIndex, drafts: chunkDrafts });

        await withRetry(() =>
          TeacherDraft.updateOne(
            { teacherId, "draftSync.sessionId": sessionId },
            {
              $set: {
                draftSync: {
                  ...syncState,
                  chunks: withoutCurrent,
                  updatedAt: new Date().toISOString(),
                },
              },
            }
          )
        );

        return res.status(200).json({
          message: "Draft chunk received",
          receivedChunks: withoutCurrent.length,
          totalChunks: Math.floor(totalChunks),
        });
      }

      if (mode === "chunk_finalize") {
        const sessionId =
          typeof req.body?.sessionId === "string" ? String(req.body.sessionId) : "";
        if (!sessionId) {
          return res.status(400).json({ message: "sessionId is required" });
        }

        const saved = await withRetry(() =>
          TeacherDraft.findOne({ teacherId }).select("draftSync").lean()
        );
        const syncState: any = saved?.draftSync || null;
        if (!syncState || String(syncState.sessionId) !== sessionId) {
          return res.status(409).json({ message: "Draft sync session not found or expired" });
        }

        const totalChunks = Number(syncState.totalChunks);
        const chunks = Array.isArray(syncState.chunks) ? syncState.chunks : [];
        if (!Number.isFinite(totalChunks) || totalChunks < 1) {
          return res.status(400).json({ message: "Invalid draft sync session state" });
        }
        if (chunks.length !== Math.floor(totalChunks)) {
          return res.status(400).json({ message: "Not all chunks received yet" });
        }

        const chunkByIndex = new Map<number, any[]>();
        for (const chunk of chunks) {
          const idx = Number(chunk?.index);
          if (!Number.isFinite(idx) || idx < 0 || idx >= totalChunks) {
            return res.status(400).json({ message: "Invalid chunk index in sync state" });
          }
          if (chunkByIndex.has(idx)) {
            return res.status(400).json({ message: "Duplicate chunk index in sync state" });
          }
          chunkByIndex.set(idx, Array.isArray(chunk?.drafts) ? chunk.drafts : []);
        }

        const mergedDrafts: any[] = [];
        for (let i = 0; i < Math.floor(totalChunks); i++) {
          if (!chunkByIndex.has(i)) {
            return res.status(400).json({ message: "Missing draft chunk in sync state" });
          }
          mergedDrafts.push(...(chunkByIndex.get(i) || []));
        }

        const updated = await withRetry(() =>
          TeacherDraft.findOneAndUpdate(
            { teacherId, "draftSync.sessionId": sessionId },
            { $set: { drafts: mergedDrafts }, $unset: { draftSync: "" } },
            { new: true }
          )
            .select("drafts updatedAt")
            .lean()
        );

        return res.status(200).json({
          message: "Draft sync finalized",
          drafts: Array.isArray(updated?.drafts) ? updated.drafts : [],
          updatedAt: updated?.updatedAt,
        });
      }

      return res.status(400).json({ message: "Invalid mode" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    console.error("Teacher drafts API error:", error);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}
