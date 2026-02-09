import type { VercelRequest, VercelResponse } from "@vercel/node";
import { connectDB, Test, getUserFromRequest } from "../../_db.js";

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
      return res.status(403).json({ message: "Only admin can approve tests" });
    }

    const id = req.query?.id as string;

    const test = await Test.findByIdAndUpdate(
      id,
      { approved: true },
      { new: true }
    );

    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    return res.status(200).json(test);
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
}