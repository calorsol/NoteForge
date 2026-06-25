import { Router } from "express";
import { z } from "zod";
import type { DatabaseHandle } from "../db";
import { requireAuth } from "../middleware/requireAuth";

const createSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().optional(),
});

const updateSchema = z
  .object({
    title: z.string().max(200).optional(),
    content: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "没有可更新的字段" });

type DocumentRow = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export function createDocumentsRouter(database: DatabaseHandle) {
  const router = Router();
  const db = database.getConnection();

  router.use(requireAuth);

  // 文档列表（不含正文，按更新时间倒序）
  router.get("/", (req, res) => {
    const documents = db
      .prepare(
        `SELECT id, title, updated_at
         FROM documents
         WHERE user_id = ?
         ORDER BY updated_at DESC, id DESC`
      )
      .all(req.userId);
    res.json({ documents });
  });

  router.get("/:id", (req, res) => {
    const document = db
      .prepare(
        "SELECT id, title, content, created_at, updated_at FROM documents WHERE id = ? AND user_id = ?"
      )
      .get(req.params.id, req.userId) as DocumentRow | undefined;
    if (!document) {
      return res.status(404).json({ error: "文档不存在" });
    }
    res.json({ document });
  });

  router.post("/", (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const info = db
      .prepare("INSERT INTO documents (user_id, title, content) VALUES (?, ?, ?)")
      .run(
        req.userId,
        parsed.data.title?.trim() || "无标题文档",
        parsed.data.content ?? ""
      );

    const document = db
      .prepare(
        "SELECT id, title, content, created_at, updated_at FROM documents WHERE id = ?"
      )
      .get(Number(info.lastInsertRowid)) as DocumentRow;

    res.status(201).json({ document });
  });

  router.put("/:id", (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const existing = db
      .prepare("SELECT id FROM documents WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.userId);
    if (!existing) {
      return res.status(404).json({ error: "文档不存在" });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.title !== undefined) {
      fields.push("title = ?");
      values.push(parsed.data.title.trim() || "无标题文档");
    }
    if (parsed.data.content !== undefined) {
      fields.push("content = ?");
      values.push(parsed.data.content);
    }
    fields.push("updated_at = datetime('now')");

    db.prepare(
      `UPDATE documents SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`
    ).run(...values, req.params.id, req.userId);

    const document = db
      .prepare(
        "SELECT id, title, content, created_at, updated_at FROM documents WHERE id = ?"
      )
      .get(req.params.id) as DocumentRow;

    res.json({ document });
  });

  router.delete("/:id", (req, res) => {
    const info = db
      .prepare("DELETE FROM documents WHERE id = ? AND user_id = ?")
      .run(req.params.id, req.userId);
    if (info.changes === 0) {
      return res.status(404).json({ error: "文档不存在" });
    }
    res.status(204).end();
  });

  return router;
}
