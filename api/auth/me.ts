import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, getUserFromRequest } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await connectDB();

    // getUserFromRequest already uses .select("-password").lean() in optimized _db.ts
    const user = await getUserFromRequest(req);

    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Cache for 30 seconds — user data rarely changes mid-session
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

    return res.status(200).json({
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        approved: user.approved,
        course: user.course,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}