import express from "express";
import cors from "cors";
import type { DatabaseHandle } from "./db";
import { database as defaultDatabase } from "./db";
import { createAuthRouter } from "./routes/auth.routes";
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
  app.use("/api/materials", createMaterialsRouter(database));
  app.use("/api/documents", createDocumentsRouter(database));

  return app;
}
