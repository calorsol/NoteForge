import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../auth";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      username?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登录或登录已过期" });
  }

  const token = authorization.slice("Bearer ".length);

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    return res.status(401).json({ error: "未登录或登录已过期" });
  }
}
