import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import type { DatabaseHandle } from "./db";
import { database as defaultDatabase } from "./db";
import { createAuthRouter } from "./routes/auth.routes";
import { createConfigRouter } from "./routes/config.routes";
import { createMaterialsRouter } from "./routes/materials.routes";
import { createDocumentsRouter } from "./routes/documents.routes";

type AppOptions = {
  database?: DatabaseHandle;
};

export function createApp(options: AppOptions = {}) {
  const app = express();
  const database = options.database ?? defaultDatabase;
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", createAuthRouter(database));
  app.use("/api/config", createConfigRouter(database));
  app.use("/api/materials", createMaterialsRouter(database));
  app.use("/api/documents", createDocumentsRouter(database));

  // 生产环境：托管前端构建产物，并对非 /api 路由回退到 index.html（SPA）
  const clientDist = path.join(process.cwd(), "src", "client", "dist");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) return next();
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return app;
}
