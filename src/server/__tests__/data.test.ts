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

withServer("materials: create, list by day, and list days", async ({ baseUrl }) => {
  const token = await registerUser(baseUrl, "matuser");

  const created = await fetch(`${baseUrl}/api/materials`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ day: "2026-06-24", title: "GDP 数据", content: "增长 5%" }),
  });
  assert.equal(created.status, 201);
  const { material } = await created.json();
  assert.equal(material.title, "GDP 数据");
  assert.equal(material.day, "2026-06-24");

  const list = await fetch(`${baseUrl}/api/materials?day=2026-06-24`, {
    headers: authHeaders(token),
  });
  const listPayload = await list.json();
  assert.equal(listPayload.materials.length, 1);
  assert.equal(listPayload.materials[0].title, "GDP 数据");

  const days = await fetch(`${baseUrl}/api/materials/days`, {
    headers: authHeaders(token),
  });
  const daysPayload = await days.json();
  assert.deepEqual(daysPayload.days, [{ day: "2026-06-24", count: 1 }]);
});

withServer("materials: update and delete", async ({ baseUrl }) => {
  const token = await registerUser(baseUrl, "matedit");
  const created = await fetch(`${baseUrl}/api/materials`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ title: "草稿资料" }),
  });
  const { material } = await created.json();

  const updated = await fetch(`${baseUrl}/api/materials/${material.id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ title: "正式资料", content: "内容" }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).material.title, "正式资料");

  const deleted = await fetch(`${baseUrl}/api/materials/${material.id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  assert.equal(deleted.status, 204);

  const missing = await fetch(`${baseUrl}/api/materials/${material.id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  assert.equal(missing.status, 404);
});

withServer("materials: can mark a material as read and unread", async ({ baseUrl }) => {
  const token = await registerUser(baseUrl, "matread");
  const created = await fetch(`${baseUrl}/api/materials`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ day: "2026-07-02", title: "待阅读资料", content: "正文" }),
  });
  assert.equal(created.status, 201);
  const createdPayload = await created.json();
  assert.equal(createdPayload.material.is_read, false);

  const markedRead = await fetch(`${baseUrl}/api/materials/${createdPayload.material.id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ is_read: true }),
  });
  assert.equal(markedRead.status, 200);
  assert.equal((await markedRead.json()).material.is_read, true);

  const listAfterRead = await fetch(`${baseUrl}/api/materials?day=2026-07-02`, {
    headers: authHeaders(token),
  });
  assert.equal(listAfterRead.status, 200);
  assert.equal((await listAfterRead.json()).materials[0].is_read, true);

  const markedUnread = await fetch(`${baseUrl}/api/materials/${createdPayload.material.id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ is_read: false }),
  });
  assert.equal(markedUnread.status, 200);
  assert.equal((await markedUnread.json()).material.is_read, false);
});

withServer("materials: derive title from content and reject empty saves", async ({ baseUrl }) => {
  const token = await registerUser(baseUrl, "mattitle");

  const created = await fetch(`${baseUrl}/api/materials`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ day: "2026-07-01", title: "", content: "" }),
  });
  assert.equal(created.status, 201);
  const createdPayload = await created.json();
  assert.equal(createdPayload.material.title, "");

  const derived = await fetch(`${baseUrl}/api/materials/${createdPayload.material.id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ title: "", content: "这是正文的前八个字后面还有内容" }),
  });
  assert.equal(derived.status, 200);
  assert.equal((await derived.json()).material.title, "这是正文的前八个");

  const rejected = await fetch(`${baseUrl}/api/materials/${createdPayload.material.id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ title: "", content: "   " }),
  });
  assert.equal(rejected.status, 400);
});

withServer("materials: annotations can be created, listed, updated, and deleted", async ({ baseUrl }) => {
  const token = await registerUser(baseUrl, "matnote");

  const created = await fetch(`${baseUrl}/api/materials`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      day: "2026-07-01",
      title: "标注资料",
      content: "第一段内容。第二段内容。第三段内容。",
    }),
  });
  assert.equal(created.status, 201);
  const { material } = await created.json();

  const annotationCreated = await fetch(`${baseUrl}/api/materials/${material.id}/annotations`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      quote: "第二段内容",
      note: "这里要重点看",
      occurrence: 0,
    }),
  });
  assert.equal(annotationCreated.status, 201);
  const annotationPayload = await annotationCreated.json();
  assert.equal(annotationPayload.annotation.quote, "第二段内容");
  assert.equal(annotationPayload.annotation.note, "这里要重点看");

  const listed = await fetch(`${baseUrl}/api/materials?day=2026-07-01`, {
    headers: authHeaders(token),
  });
  assert.equal(listed.status, 200);
  const listedPayload = await listed.json();
  assert.equal(listedPayload.materials[0].annotations.length, 1);
  assert.equal(listedPayload.materials[0].annotations[0].note, "这里要重点看");

  const updated = await fetch(
    `${baseUrl}/api/materials/${material.id}/annotations/${annotationPayload.annotation.id}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ note: "这里已经复查过了" }),
    }
  );
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).annotation.note, "这里已经复查过了");

  const removed = await fetch(
    `${baseUrl}/api/materials/${material.id}/annotations/${annotationPayload.annotation.id}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    }
  );
  assert.equal(removed.status, 204);

  const relisted = await fetch(`${baseUrl}/api/materials?day=2026-07-01`, {
    headers: authHeaders(token),
  });
  const relistedPayload = await relisted.json();
  assert.equal(relistedPayload.materials[0].annotations.length, 0);
});

withServer("documents: create, get, update, list, delete", async ({ baseUrl }) => {
  const token = await registerUser(baseUrl, "docuser");

  const created = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
  assert.equal(created.status, 201);
  const { document } = await created.json();
  assert.equal(document.title, "无标题文档");

  const updated = await fetch(`${baseUrl}/api/documents/${document.id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ title: "我的文章", content: "# 标题\n正文" }),
  });
  assert.equal(updated.status, 200);

  const fetched = await fetch(`${baseUrl}/api/documents/${document.id}`, {
    headers: authHeaders(token),
  });
  const fetchedPayload = await fetched.json();
  assert.equal(fetchedPayload.document.title, "我的文章");
  assert.equal(fetchedPayload.document.content, "# 标题\n正文");

  const list = await fetch(`${baseUrl}/api/documents`, {
    headers: authHeaders(token),
  });
  const listPayload = await list.json();
  assert.equal(listPayload.documents.length, 1);
  assert.equal(listPayload.documents[0].content, undefined);
});

withServer("isolation: a user cannot read or modify another user's data", async ({ baseUrl }) => {
  const alice = await registerUser(baseUrl, "alice");
  const bob = await registerUser(baseUrl, "bob");

  const created = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: authHeaders(alice),
    body: JSON.stringify({ title: "Alice 私密文档" }),
  });
  const { document } = await created.json();

  const bobRead = await fetch(`${baseUrl}/api/documents/${document.id}`, {
    headers: authHeaders(bob),
  });
  assert.equal(bobRead.status, 404);

  const bobDelete = await fetch(`${baseUrl}/api/documents/${document.id}`, {
    method: "DELETE",
    headers: authHeaders(bob),
  });
  assert.equal(bobDelete.status, 404);

  const aliceList = await fetch(`${baseUrl}/api/documents`, {
    headers: authHeaders(alice),
  });
  assert.equal((await aliceList.json()).documents.length, 1);
});

withServer("data routes require authentication", async ({ baseUrl }) => {
  const materials = await fetch(`${baseUrl}/api/materials`);
  assert.equal(materials.status, 401);
  const documents = await fetch(`${baseUrl}/api/documents`);
  assert.equal(documents.status, 401);
});
