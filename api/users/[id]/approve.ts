import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, User, getUserFromRequest, withRetry } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "PATCH") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await connectDB();
    const currentUser = await getUserFromRequest(req);

    if (!currentUser) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (currentUser.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const id = req.query?.id as string;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // Atomic update: only update if not already approved (skip unnecessary writes)
    const user = await withRetry(() =>
      User.findOneAndUpdate(
        { _id: id, approved: { $ne: true } },
        { approved: true },
        { new: true }
      )
        .select("-password")
        .lean()
    );

    if (!user) {
      // Check if user exists but is already approved
      const exists = await User.findById(id).select("approved").lean();
      if (!exists) {
        return res.status(404).json({ message: "User not found" });
      }
      if (exists.approved) {
        return res.status(200).json({ message: "User already approved", ...exists });
      }
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}