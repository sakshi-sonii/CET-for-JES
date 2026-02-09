import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, User, getUserFromRequest } from "../_db.js";

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

    const { id } = req.query;

    // GET /api/users/:id - Get single user
    if (req.method === "GET") {
      const user = await User.findById(id).select("-password");
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.status(200).json(user);
    }

    // DELETE /api/users/:id - Delete user (admin only)
    if (req.method === "DELETE") {
      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const user = await User.findByIdAndDelete(id);

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