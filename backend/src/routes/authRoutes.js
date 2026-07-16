import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/authMiddleware.js";
import { loginUser, logoutUser, registerUser } from "../services/authService.js";
import { clearSessionCookie, setSessionCookie } from "../utils/sessionCookie.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  mobile: z
    .string()
    .trim()
    .min(7, "Mobile number must be at least 7 digits")
    .max(20, "Mobile number is too long"),
  email: z.string().trim().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "VIEWER"]).optional().default("VIEWER"),
});

const loginSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid registration payload",
        details: parsed.error.flatten(),
      });
    }

    const session = await registerUser(parsed.data);
    setSessionCookie(res, session.token, session.expires_at);

    return res.status(201).json(toPublicSession(session));
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid login payload",
        details: parsed.error.flatten(),
      });
    }

    const session = await loginUser(parsed.data);
    setSessionCookie(res, session.token, session.expires_at);

    return res.json(toPublicSession(session));
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await logoutUser(req.authToken);
    clearSessionCookie(res);
    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    return next(error);
  }
});

function toPublicSession(session) {
  return {
    user: session.user,
    expires_at: session.expires_at,
  };
}
