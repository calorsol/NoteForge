import { Router } from "express";
import { z } from "zod";
import type { DatabaseHandle } from "../db";
import { requireAuth } from "../middleware/requireAuth";
import { resolveMaterialTitle } from "../../shared/materials";

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
  title: z.string().max(200).optional(),
  content: z.string().optional(),
});

const updateSchema = z
  .object({
    day: z.string().regex(dayPattern).optional(),
    title: z.string().max(200).optional(),
    content: z.string().optional(),
    is_read: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "没有可更新的字段" });

const createAnnotationSchema = z.object({
  quote: z.string().trim().min(1).max(500),
  note: z.string().trim().min(1).max(2000),
  occurrence: z.number().int().min(0),
});

const updateAnnotationSchema = z
  .object({
    quote: z.string().trim().min(1).max(500).optional(),
    note: z.string().trim().min(1).max(2000).optional(),
    occurrence: z.number().int().min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "没有可更新的字段" });

type MaterialRow = {
  id: number;
  day: string;
  title: string;
  content: string;
  is_read: number;
  created_at: string;
  updated_at: string;
};

type AnnotationRow = {
  id: number;
  material_id: number;
  quote: string;
  note: string;
  occurrence: number;
  created_at: string;
  updated_at: string;
};

function groupAnnotations(rows: AnnotationRow[]) {
  const grouped = new Map<number, AnnotationRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.material_id);
    if (current) {
      current.push(row);
    } else {
      grouped.set(row.material_id, [row]);
    }
  }
  return grouped;
}

function getOwnedMaterial(db: ReturnType<DatabaseHandle["getConnection"]>, materialId: string, userId: number) {
  return db
    .prepare("SELECT id, title, content, is_read FROM materials WHERE id = ? AND user_id = ?")
    .get(materialId, userId) as { id: number; title: string; content: string; is_read: number } | undefined;
}

function serializeMaterial(material: MaterialRow, annotations: AnnotationRow[]) {
  return {
    ...material,
    is_read: material.is_read === 1,
    annotations,
  };
}

export function createMaterialsRouter(database: DatabaseHandle) {
  const router = Router();
  const db = database.getConnection();

  router.use(requireAuth);

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

  router.get("/", (req, res) => {
    const day = typeof req.query.day === "string" && dayPattern.test(req.query.day) ? req.query.day : today();

    const materials = db
      .prepare(
        `SELECT id, day, title, content, is_read, created_at, updated_at
         FROM materials
         WHERE user_id = ? AND day = ?
         ORDER BY created_at ASC, id ASC`
      )
      .all(req.userId, day) as MaterialRow[];

    const materialIds = materials.map((material) => material.id);
    const annotations = materialIds.length
      ? (db
          .prepare(
            `SELECT id, material_id, quote, note, occurrence, created_at, updated_at
             FROM material_annotations
             WHERE material_id IN (${materialIds.map(() => "?").join(",")})
             ORDER BY id ASC`
          )
          .all(...materialIds) as AnnotationRow[])
      : [];
    const annotationsByMaterial = groupAnnotations(annotations);

    res.json({
      day,
      materials: materials.map((material) => serializeMaterial(material, annotationsByMaterial.get(material.id) ?? [])),
    });
  });

  router.post("/", (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const day = parsed.data.day ?? today();
    const title = parsed.data.title?.trim() ?? "";
    const info = db
      .prepare("INSERT INTO materials (user_id, day, title, content, is_read) VALUES (?, ?, ?, ?, 0)")
      .run(req.userId, day, title, parsed.data.content ?? "");

    const material = db
      .prepare("SELECT id, day, title, content, is_read, created_at, updated_at FROM materials WHERE id = ?")
      .get(Number(info.lastInsertRowid)) as MaterialRow;

    res.status(201).json({ material: serializeMaterial(material, []) });
  });

  router.put("/:id", (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const existing = getOwnedMaterial(db, req.params.id, req.userId);
    if (!existing) {
      return res.status(404).json({ error: "资料不存在" });
    }

    const resolvedTitle = resolveMaterialTitle({
      currentTitle: existing.title,
      nextTitle: parsed.data.title,
      nextContent: parsed.data.content,
    });
    if (!resolvedTitle.ok) {
      return res.status(400).json({ error: resolvedTitle.error });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.day !== undefined) {
      fields.push("day = ?");
      values.push(parsed.data.day);
    }
    if (parsed.data.content !== undefined) {
      fields.push("content = ?");
      values.push(parsed.data.content);
    }
    if (parsed.data.is_read !== undefined) {
      fields.push("is_read = ?");
      values.push(parsed.data.is_read ? 1 : 0);
    }
    fields.push("title = ?");
    values.push(resolvedTitle.title);
    fields.push("updated_at = datetime('now')");

    db.prepare(`UPDATE materials SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(
      ...values,
      req.params.id,
      req.userId
    );

    const material = db
      .prepare("SELECT id, day, title, content, is_read, created_at, updated_at FROM materials WHERE id = ?")
      .get(req.params.id) as MaterialRow;
    const annotations = db
      .prepare(
        `SELECT id, material_id, quote, note, occurrence, created_at, updated_at
         FROM material_annotations
         WHERE material_id = ?
         ORDER BY id ASC`
      )
      .all(req.params.id) as AnnotationRow[];

    res.json({ material: serializeMaterial(material, annotations) });
  });

  router.delete("/:id", (req, res) => {
    const info = db.prepare("DELETE FROM materials WHERE id = ? AND user_id = ?").run(req.params.id, req.userId);
    if (info.changes === 0) {
      return res.status(404).json({ error: "资料不存在" });
    }
    res.status(204).end();
  });

  router.post("/:id/annotations", (req, res) => {
    const parsed = createAnnotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const material = getOwnedMaterial(db, req.params.id, req.userId);
    if (!material) {
      return res.status(404).json({ error: "资料不存在" });
    }

    const info = db
      .prepare(
        `INSERT INTO material_annotations (material_id, quote, note, occurrence)
         VALUES (?, ?, ?, ?)`
      )
      .run(req.params.id, parsed.data.quote, parsed.data.note, parsed.data.occurrence);

    const annotation = db
      .prepare(
        `SELECT id, material_id, quote, note, occurrence, created_at, updated_at
         FROM material_annotations
         WHERE id = ?`
      )
      .get(Number(info.lastInsertRowid)) as AnnotationRow;

    res.status(201).json({ annotation });
  });

  router.put("/:id/annotations/:annotationId", (req, res) => {
    const parsed = updateAnnotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const annotation = db
      .prepare(
        `SELECT ma.id
         FROM material_annotations ma
         JOIN materials m ON m.id = ma.material_id
         WHERE ma.id = ? AND ma.material_id = ? AND m.user_id = ?`
      )
      .get(req.params.annotationId, req.params.id, req.userId);
    if (!annotation) {
      return res.status(404).json({ error: "标注不存在" });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.quote !== undefined) {
      fields.push("quote = ?");
      values.push(parsed.data.quote);
    }
    if (parsed.data.note !== undefined) {
      fields.push("note = ?");
      values.push(parsed.data.note);
    }
    if (parsed.data.occurrence !== undefined) {
      fields.push("occurrence = ?");
      values.push(parsed.data.occurrence);
    }
    fields.push("updated_at = datetime('now')");

    db.prepare(`UPDATE material_annotations SET ${fields.join(", ")} WHERE id = ? AND material_id = ?`).run(
      ...values,
      req.params.annotationId,
      req.params.id
    );

    const updated = db
      .prepare(
        `SELECT id, material_id, quote, note, occurrence, created_at, updated_at
         FROM material_annotations
         WHERE id = ?`
      )
      .get(req.params.annotationId) as AnnotationRow;

    res.json({ annotation: updated });
  });

  router.delete("/:id/annotations/:annotationId", (req, res) => {
    const info = db
      .prepare(
        `DELETE FROM material_annotations
         WHERE id = ?
           AND material_id = ?
           AND material_id IN (
             SELECT id FROM materials WHERE id = ? AND user_id = ?
           )`
      )
      .run(req.params.annotationId, req.params.id, req.params.id, req.userId);
    if (info.changes === 0) {
      return res.status(404).json({ error: "标注不存在" });
    }
    res.status(204).end();
  });

  return router;
}
