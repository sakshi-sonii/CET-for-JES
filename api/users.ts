import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, User, getUserFromRequest } from "./_db.js";

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

    // Only admin can access user list
    if (currentUser.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    // GET /api/users - Get all users
    if (req.method === "GET") {
      const users = await User.find().select("-password").sort({ createdAt: -1 });
      return res.status(200).json(users);
    }

    // POST /api/users - Create a user (admin only)
    if (req.method === "POST") {
      if (currentUser.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const { email, password, name, role, course, approved } = req.body;

      if (!email || !password || !name || !role) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      if (!["admin", "teacher", "student"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password using helper from _db.js
      const { hashPassword } = await import("./_db.js");
      const hashed = await hashPassword(password);

      const newUser = await User.create({
        email: email.toLowerCase(),
        password: hashed,
        name,
        role,
        course: course || null,
        approved: !!approved,
      });

      const out = await User.findById(newUser._id).select("-password");
      return res.status(201).json(out);
    }

    return res.status(405).json({ message: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}