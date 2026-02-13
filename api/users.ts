import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, User, getUserFromRequest, hashPassword, withRetry } from "./_db.js";

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

    if (currentUser.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    // GET /api/users
    if (req.method === "GET") {
      const users = await withRetry(() =>
        User.find().select("-password").sort({ createdAt: -1 }).lean()
      );
      return res.status(200).json(users);
    }

    // POST /api/users
    if (req.method === "POST") {
      const { email, password, name, role, course, stream, approved } = req.body;

      if (!email || !password || !name || !role) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      if (!["admin", "teacher", "student"].includes(role)) {
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

      // Fetch back without password instead of using toObject()
      const created = await User.findOne({ email: email.toLowerCase() })
        .select("-password")
        .lean();

      return res.status(201).json(created);
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