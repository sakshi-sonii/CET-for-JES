import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  connectDB,
  User,
  hashPassword,
  comparePassword,
  generateToken,
  getUserFromRequest,
  seedAdmin,
} from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  await connectDB();
  await seedAdmin();

  // GET /api/auth/me - Get current user
  if (req.method === "GET") {
    try {
      const user = await getUserFromRequest(req);

      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      return res.status(200).json({
        user: {
          _id: user._id,
          id: user._id,
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

  // POST /api/auth - Login or Register
  if (req.method === "POST") {
    const { mode, email, password, name, role, course } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    try {
      // ============== LOGIN ==============
      if (mode === "login") {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        const isValid = await comparePassword(password, user.password);

        if (!isValid) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        // Require admin approval for all non-admin users
        if (!user.approved && user.role !== "admin") {
          return res.status(403).json({ message: "Your account is pending approval" });
        }

        const token = generateToken(user._id.toString(), user.role);

        return res.status(200).json({
          token,
          user: {
            _id: user._id,
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
            approved: user.approved,
            course: user.course,
          },
        });
      }

      // ============== REGISTER ==============
      if (mode === "register") {
        if (!name || !role) {
          return res.status(400).json({ message: "Name and role are required" });
        }

        if (!["student", "teacher"].includes(role)) {
          return res.status(400).json({ message: "Invalid role" });
        }

        if (role === "student" && !course) {
          return res.status(400).json({ message: "Course is required for students" });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });

        if (existingUser) {
          return res.status(400).json({ message: "Email already registered" });
        }

        const hashedPassword = await hashPassword(password);

        const newUser = await User.create({
          email: email.toLowerCase(),
          password: hashedPassword,
          name,
          role,
          approved: false,
          course: role === "student" ? course : undefined,
        });

        const message = "Registration successful! Please wait for admin approval.";

        return res.status(201).json({
          message,
          user: {
            _id: newUser._id,
            id: newUser._id,
            email: newUser.email,
            name: newUser.name,
            role: newUser.role,
          },
        });
      }

      return res.status(400).json({ message: "Invalid mode. Use 'login' or 'register'" });
    } catch (error: any) {
      console.error("Auth error:", error);
      return res.status(500).json({ message: error.message });
    }
  }

  return res.status(405).json({ message: "Method not allowed" });
}