import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";
import { DELETE as DELETE_FOLDER, POST } from "@/app/api/s3/buckets/[bucket]/folders/route";

const s3 = mockClient(S3Client);
const context = { params: Promise.resolve({ bucket: "assets" }) };

describe("POST /api/s3/buckets/[bucket]/folders", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("creates a folder marker object", async () => {
    s3.on(PutObjectCommand).resolves({});

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({ action: "create", prefix: "photos" }),
      }),
      context,
    );

    expect(res.status).toBe(201);
    expect(s3.commandCalls(PutObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: "assets",
      Key: "photos/",
    });
  });

  it("requires a prefix when creating folders", async () => {
    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({ action: "create", prefix: "" }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "prefix is required" });
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("moves all objects under a folder prefix", async () => {
    s3.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: "old/a.txt" }, { Key: "old/sub/b.txt" }],
    });
    s3.on(CopyObjectCommand).resolves({});
    s3.on(DeleteObjectsCommand).resolves({});

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({
          action: "move",
          sourcePrefix: "old/",
          targetPrefix: "new/",
        }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(CopyObjectCommand).map((call) => call.args[0].input.Key)).toEqual([
      "new/a.txt",
      "new/sub/b.txt",
    ]);
    expect(s3.commandCalls(DeleteObjectsCommand)[0].args[0].input.Delete?.Objects).toEqual([
      { Key: "old/a.txt" },
      { Key: "old/sub/b.txt" },
    ]);
  });

  it("paginates object listings when moving folders", async () => {
    s3.on(ListObjectsV2Command)
      .resolvesOnce({
        Contents: [{ Key: "old/a.txt" }],
        NextContinuationToken: "t1",
      })
      .resolvesOnce({
        Contents: [{ Key: "old/b.txt" }],
      });
    s3.on(CopyObjectCommand).resolves({});
    s3.on(DeleteObjectsCommand).resolves({});

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({
          action: "move",
          sourcePrefix: "old/",
          targetPrefix: "new/",
        }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(ListObjectsV2Command)).toHaveLength(2);
    expect(s3.commandCalls(CopyObjectCommand)).toHaveLength(2);
  });

  it("skips copy and delete steps when nothing matches the prefix", async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [] });

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({
          action: "move",
          sourcePrefix: "empty/",
          targetPrefix: "dest/",
        }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.moved).toBe(0);
    expect(s3.commandCalls(CopyObjectCommand)).toHaveLength(0);
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
  });

  it("requires both prefixes when moving", async () => {
    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({ action: "move", sourcePrefix: "a/" }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "sourcePrefix and targetPrefix are required" });
  });

  it("rejects identical source and target prefixes", async () => {
    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({
          action: "move",
          sourcePrefix: "same/",
          targetPrefix: "same/",
        }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "sourcePrefix and targetPrefix must differ" });
  });

  it("rejects targets nested inside the source prefix", async () => {
    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({
          action: "move",
          sourcePrefix: "root/",
          targetPrefix: "root/nested/",
        }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "targetPrefix cannot be inside sourcePrefix" });
  });

  it("batches delete calls when more than 1000 keys are moved", async () => {
    const keys = Array.from({ length: 1001 }, (_, index) => `bulk/${index}.txt`);
    s3.on(ListObjectsV2Command).resolves({
      Contents: keys.map((Key) => ({ Key })),
    });
    s3.on(CopyObjectCommand).resolves({});
    s3.on(DeleteObjectsCommand).resolves({});

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({
          action: "move",
          sourcePrefix: "bulk/",
          targetPrefix: "moved/",
        }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(2);
    expect(s3.commandCalls(DeleteObjectsCommand)[0].args[0].input.Delete?.Objects).toHaveLength(1000);
    expect(s3.commandCalls(DeleteObjectsCommand)[1].args[0].input.Delete?.Objects).toHaveLength(1);
  });

  it("rejects unknown actions", async () => {
    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({ action: "nope" }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported folder action" });
  });

  it("returns 500 when folder operations fail", async () => {
    s3.on(PutObjectCommand).rejects(new Error("disk"));

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({ action: "create", prefix: "fail/" }),
      }),
      context,
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("disk");
  });

  it("returns 500 when move reports DeleteObjects per-key errors", async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: "old/a.txt" }] });
    s3.on(CopyObjectCommand).resolves({});
    s3.on(DeleteObjectsCommand).resolves({
      Errors: [{ Key: "old/a.txt", Code: "InternalError", Message: "oops" }],
    });

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/folders", {
        method: "POST",
        body: JSON.stringify({
          action: "move",
          sourcePrefix: "old/",
          targetPrefix: "new/",
        }),
      }),
      context,
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("partial failure");
    expect(body.error).toContain("old/a.txt");
  });
});

describe("DELETE /api/s3/buckets/[bucket]/folders", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("deletes all objects under a folder prefix", async () => {
    s3.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: "tmp/a.txt" }, { Key: "tmp/b.txt" }],
    });
    s3.on(DeleteObjectsCommand).resolves({});

    const res = await DELETE_FOLDER(
      new NextRequest("http://test/api/s3/buckets/assets/folders?prefix=tmp/"),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(DeleteObjectsCommand)[0].args[0].input.Delete?.Objects).toEqual([
      { Key: "tmp/a.txt" },
      { Key: "tmp/b.txt" },
    ]);
  });

  it("returns success when the prefix is already empty", async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [] });

    const res = await DELETE_FOLDER(
      new NextRequest("http://test/api/s3/buckets/assets/folders?prefix=empty/"),
      context,
    );

    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(0);
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
  });

  it("returns 400 when prefix query is missing", async () => {
    const res = await DELETE_FOLDER(
      new NextRequest("http://test/api/s3/buckets/assets/folders"),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "prefix is required" });
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
  });

  it("returns 400 when prefix is empty", async () => {
    const res = await DELETE_FOLDER(
      new NextRequest("http://test/api/s3/buckets/assets/folders?prefix="),
      context,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "prefix is required" });
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
  });

  it("returns 500 when DeleteObjects reports per-key errors", async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: "x/y" }] });
    s3.on(DeleteObjectsCommand).resolves({
      Errors: [{ Key: "x/y", Code: "AccessDenied", Message: "denied" }],
    });

    const res = await DELETE_FOLDER(
      new NextRequest("http://test/api/s3/buckets/assets/folders?prefix=x/"),
      context,
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("partial failure");
    expect(body.error).toContain("assets");
    expect(body.error).toContain("x/y");
    expect(body.error).toContain("AccessDenied");
  });

  it("returns 500 when deletion fails", async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: "x/y" }] });
    s3.on(DeleteObjectsCommand).rejects(new Error("access denied"));

    const res = await DELETE_FOLDER(
      new NextRequest("http://test/api/s3/buckets/assets/folders?prefix=x/"),
      context,
    );

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("access denied");
  });
});
