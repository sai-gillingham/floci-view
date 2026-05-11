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
});
