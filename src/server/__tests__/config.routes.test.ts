import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "../app";
import { createDatabase } from "../db";

const tempDir = path.join(process.cwd(), "src", "server", "data", "test-artifacts");

async function withServer(
  name: string,
  run: (context: { baseUrl: string }) => Promise<void>
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
      await run({ baseUrl: `http://127.0.0.1:${address.port}` });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      database.close();
      if (fs.existsSync(dbFile)) {
        fs.unlinkSync(dbFile);
      }
    }
  });
}

async function registerUser(baseUrl: string, username: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "secret123" }),
  });
  const payload = await response.json();
  return payload.token as string;
}

function authHeaders(token: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };
}

withServer("config: routes require authentication", async ({ baseUrl }) => {
  const listResponse = await fetch(`${baseUrl}/api/config`);
  assert.equal(listResponse.status, 401);
  assert.deepEqual(await listResponse.json(), {
    error: "未登录或登录已过期",
  });

  const updateResponse = await fetch(`${baseUrl}/api/config/disguise.csdn_title`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ value: "技术笔记" }),
  });
  assert.equal(updateResponse.status, 401);
  assert.deepEqual(await updateResponse.json(), {
    error: "未登录或登录已过期",
  });
});

withServer("config: GET returns default disguise config", async ({ baseUrl }) => {
  const token = await registerUser(baseUrl, "config_reader");
  const response = await fetch(`${baseUrl}/api/config`, {
    headers: authHeaders(token),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    config: {
      "disguise.wiki_brand": "内部文档中心",
      "disguise.csdn_title": "技术笔记",
      "disguise.csdn_brand": "技术博客_CSDN",
    },
  });
});

withServer("config: PUT updates existing config values", async ({ baseUrl }) => {
  const token = await registerUser(baseUrl, "config_writer");

  const updateResponse = await fetch(`${baseUrl}/api/config/disguise.csdn_title`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ value: "摸鱼技术周报" }),
  });

  assert.equal(updateResponse.status, 200);
  assert.deepEqual(await updateResponse.json(), {
    key: "disguise.csdn_title",
    value: "摸鱼技术周报",
  });

  const listResponse = await fetch(`${baseUrl}/api/config`, {
    headers: authHeaders(token),
  });

  assert.equal(listResponse.status, 200);
  assert.deepEqual(await listResponse.json(), {
    config: {
      "disguise.wiki_brand": "内部文档中心",
      "disguise.csdn_title": "摸鱼技术周报",
      "disguise.csdn_brand": "技术博客_CSDN",
    },
  });
});

withServer("config: PUT rejects unknown keys and empty values", async ({ baseUrl }) => {
  const token = await registerUser(baseUrl, "config_guard");

  const missingKeyResponse = await fetch(`${baseUrl}/api/config/disguise.unknown_key`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ value: "不存在" }),
  });
  assert.equal(missingKeyResponse.status, 404);
  assert.deepEqual(await missingKeyResponse.json(), {
    error: "配置项不存在",
  });

  const emptyValueResponse = await fetch(`${baseUrl}/api/config/disguise.wiki_brand`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ value: "   " }),
  });
  assert.equal(emptyValueResponse.status, 400);
  assert.deepEqual(await emptyValueResponse.json(), {
    error: "请求参数不合法",
  });
});
