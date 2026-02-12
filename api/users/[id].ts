import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, User, getUserFromRequest, withRetry } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
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

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    // ======================
    // GET
    // ======================
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");

      const user = await withRetry(() =>
        User.findById(id)
          .select("-password")
          .lean()
      );

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json(user);
    }

    // ======================
    // DELETE
    // ======================
    if (req.method === "DELETE") {
      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      // Prevent admin from deleting themselves
      if (id === currentUser._id.toString()) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      const user = await withRetry(() =>
        User.findByIdAndDelete(id)
          .select("_id email name role")
          .lean()
      );

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json({ message: "User deleted successfully" });
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}