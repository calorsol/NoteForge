import { Router } from "express";
import { z } from "zod";
import type { DatabaseHandle } from "../db";
import { requireAuth } from "../middleware/requireAuth";

const updateSchema = z.object({
  value: z.string().trim().min(1).max(64),
});

type ConfigRow = {
  config_key: string;
  config_value: string;
};

export function createConfigRouter(database: DatabaseHandle) {
  const router = Router();
  const db = database.getConnection();

  router.use(requireAuth);

  router.get("/", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT config_key, config_value
         FROM sys_config
         ORDER BY config_key ASC`
      )
      .all() as ConfigRow[];

    const config = Object.fromEntries(rows.map((row) => [row.config_key, row.config_value]));
    res.json({ config });
  });

  router.put("/:key", (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "请求参数不合法" });
    }

    const existing = db
      .prepare("SELECT config_key FROM sys_config WHERE config_key = ?")
      .get(req.params.key) as { config_key: string } | undefined;
    if (!existing) {
      return res.status(404).json({ error: "配置项不存在" });
    }

    db.prepare("UPDATE sys_config SET config_value = ? WHERE config_key = ?").run(
      parsed.data.value,
      req.params.key
    );

    res.json({
      key: req.params.key,
      value: parsed.data.value,
    });
  });

  return router;
}
