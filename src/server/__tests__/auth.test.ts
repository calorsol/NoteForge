import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "../app";
import { createDatabase } from "../db";

const tempDir = path.join(process.cwd(), "src", "server", "data", "test-artifacts");

async function withServer(
  name: string,
  run: (context: { baseUrl: string; dbFile: string }) => Promise<void>
) {
  await test(name, async () => {
    fs.mkdirSync(tempDir, { recursive: true });
    const dbFile = path.join(tempDir, `${name.replace(/[^a-z0-9]+/gi, "-")}.db`);
    if (fs.existsSync(dbFile)) {
      fs.unlinkSync(dbFile);
    }

    const database = createDatabase(dbFile);
    const app = createApp({ database });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("server did not bind to a port");
      }

      await run({
        baseUrl: `http://127.0.0.1:${address.port}`,
        dbFile,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
      if (fs.existsSync(dbFile)) {
        fs.unlinkSync(dbFile);
      }
    }
  });
}

withServer("POST /api/auth/register creates a user, hashes the password, and returns a token", async ({ baseUrl, dbFile }) => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "alice_01",
      password: "secret123",
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(typeof payload.token, "string");
  assert.equal(payload.user.username, "alice_01");
  assert.equal(typeof payload.user.id, "number");

  const db = createDatabase(dbFile);
  const row = db
    .getConnection()
    .prepare("SELECT username, password_hash FROM users WHERE username = ?")
    .get("alice_01") as { username: string; password_hash: string } | undefined;
  db.close();

  assert.equal(row?.username, "alice_01");
  assert.notEqual(row?.password_hash, "secret123");
  assert.match(row?.password_hash ?? "", /^\$2[aby]\$/);
});

withServer("POST /api/auth/login returns a token for valid credentials", async ({ baseUrl }) => {
  await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "writer",
      password: "draft123",
    }),
  });

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "writer",
      password: "draft123",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.user.username, "writer");
  assert.equal(typeof payload.token, "string");
});

withServer("GET /api/auth/me returns the current user when the bearer token is valid", async ({ baseUrl }) => {
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "reader",
      password: "secret123",
    }),
  });
  const registerPayload = await registerResponse.json();

  const response = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      authorization: `Bearer ${registerPayload.token}`,
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    user: registerPayload.user,
  });
});

withServer("GET /api/auth/me returns 401 when the bearer token is missing", async ({ baseUrl }) => {
  const response = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "未登录或登录已过期",
  });
});
