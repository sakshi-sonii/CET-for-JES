import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  connectDB,
  User,
  hashPassword,
  comparePassword,
  generateToken,
  seedAdmin,
  withRetry,
} from "./_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    await connectDB();
    await seedAdmin();

    const { mode, email, password, name, role, course, stream } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // LOGIN
    if (mode === "login") {
      const user = await withRetry(() =>
        User.findOne({ email: email.toLowerCase() })
          .select("_id email name role approved course stream password")
          .lean()
      );

      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValid = await comparePassword(password, user.password);

      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.approved && user.role !== "admin") {
        return res.status(403).json({ message: "Your account is pending approval" });
      }

      const token = generateToken(user._id.toString(), user.role);
      const { password: _, ...userWithoutPassword } = user;

      return res.status(200).json({ token, user: userWithoutPassword });
    }

    // REGISTER
    if (mode === "register") {
      if (!name || !role) {
        return res.status(400).json({ message: "Name and role are required" });
      }

      if (!["student", "teacher"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Validate stream if provided
      if (stream && !["PCM", "PCB"].includes(stream)) {
        return res.status(400).json({ message: "Stream must be 'PCM' or 'PCB'" });
      }

      // Parallel: check existing + hash password
      const [existing, hashedPassword] = await Promise.all([
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
        password: hashedPassword,
        name,
        role,
        approved: false,
      };

      if (course) userData.course = course;
      if (stream) userData.stream = stream;

      await withRetry(() => User.create(userData));

      return res.status(201).json({
        message: "Registration successful! Please wait for admin approval.",
      });
    }

    return res.status(400).json({ message: "Invalid mode" });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already registered" });
    }
    console.error("Auth API error:", error.message);
    return res.status(500).json({ message: error.message || "Internal server error" });
  }
}