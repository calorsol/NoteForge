import { Router } from "express";
import { z } from "zod";
import type { DatabaseHandle } from "../db";
import { requireAuth } from "../middleware/requireAuth";

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const createSchema = z.object({
  day: z.string().regex(dayPattern).optional(),
  title: z.string().trim().min(1).max(200),
  content: z.string().optional(),
});

const updateSchema = z
  .object({
    day: z.string().regex(dayPattern).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "没有可更新的字段" });

type MaterialRow = {
  id: number;
  day: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export function createMaterialsRouter(database: DatabaseHandle) {
  const router = Router();
  const db = database.getConnection();

  router.use(requireAuth);

  // 当前用户所有有资料的日期 + 每天条数（倒序），供年/月/日级联使用
  router.get("/days", (req, res) => {
    const rows = db
      .prepare(
        `SELECT day, COUNT(*) AS count
         FROM materials
         WHERE user_id = ?
         GROUP BY day
         ORDER BY day DESC`
      )
      .all(req.userId) as { day: string; count: number }[];
    res.json({ days: rows });
  });

  // 某天的全部资料（创建时间正序）
  router.get("/", (req, res) => {
    const day = typeof req.query.day === "string" && dayPattern.test(req.query.day)
      ? req.query.day
      : today();

    const materials = db
      .prepare(
        `SELECT id, day, title, content, created_at, updated_at
         FROM materials
         WHERE user_id = ? AND day = ?
         ORDER BY created_at ASC, id ASC`
      )
      .all(req.userId, day) as MaterialRow[];

    res.json({ day, materials });
  });

  router.post("/", (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const day = parsed.data.day ?? today();
    const info = db
      .prepare(
        "INSERT INTO materials (user_id, day, title, content) VALUES (?, ?, ?, ?)"
      )
      .run(req.userId, day, parsed.data.title, parsed.data.content ?? "");

    const material = db
      .prepare(
        "SELECT id, day, title, content, created_at, updated_at FROM materials WHERE id = ?"
      )
      .get(Number(info.lastInsertRowid)) as MaterialRow;

    res.status(201).json({ material });
  });

  router.put("/:id", (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const existing = db
      .prepare("SELECT id FROM materials WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.userId);
    if (!existing) {
      return res.status(404).json({ error: "资料不存在" });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.day !== undefined) {
      fields.push("day = ?");
      values.push(parsed.data.day);
    }
    if (parsed.data.title !== undefined) {
      fields.push("title = ?");
      values.push(parsed.data.title);
    }
    if (parsed.data.content !== undefined) {
      fields.push("content = ?");
      values.push(parsed.data.content);
    }
    fields.push("updated_at = datetime('now')");

    db.prepare(
      `UPDATE materials SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`
    ).run(...values, req.params.id, req.userId);

    const material = db
      .prepare(
        "SELECT id, day, title, content, created_at, updated_at FROM materials WHERE id = ?"
      )
      .get(req.params.id) as MaterialRow;

    res.json({ material });
  });

  router.delete("/:id", (req, res) => {
    const info = db
      .prepare("DELETE FROM materials WHERE id = ? AND user_id = ?")
      .run(req.params.id, req.userId);
    if (info.changes === 0) {
      return res.status(404).json({ error: "资料不存在" });
    }
    res.status(204).end();
  });

  return router;
}
