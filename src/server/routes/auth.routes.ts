import { Router } from "express";
import { z } from "zod";
import type { DatabaseHandle } from "../db";
import { createToken, hashPassword, verifyPassword } from "../auth";
import { requireAuth } from "../middleware/requireAuth";

const credentialsSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[\p{L}\p{N}_]+$/u, "用户名格式不正确"),
  password: z.string().min(6),
});

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
};

export function createAuthRouter(database: DatabaseHandle) {
  const router = Router();
  const db = database.getConnection();

  router.post("/register", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const existingUser = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(parsed.data.username);
    if (existingUser) {
      return res.status(409).json({ error: "用户名已被占用" });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const insert = db
      .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
      .run(parsed.data.username, passwordHash);

    const user = {
      id: Number(insert.lastInsertRowid),
      username: parsed.data.username,
    };

    return res.status(201).json({
      token: createToken(user),
      user,
    });
  });

  router.post("/login", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const user = db
      .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
      .get(parsed.data.username) as UserRow | undefined;

    if (!user) {
      return res.status(401).json({ error: "用户名或密码错误" });
    }

    const matched = await verifyPassword(parsed.data.password, user.password_hash);
    if (!matched) {
      return res.status(401).json({ error: "用户名或密码错误" });
    }

    return res.json({
      token: createToken({ id: user.id, username: user.username }),
      user: {
        id: user.id,
        username: user.username,
      },
    });
  });

  router.get("/me", requireAuth, (req, res) => {
    const user = db
      .prepare("SELECT id, username FROM users WHERE id = ?")
      .get(req.userId) as { id: number; username: string } | undefined;

    if (!user) {
      return res.status(401).json({ error: "未登录或登录已过期" });
    }

    return res.json({ user });
  });

  return router;
}
