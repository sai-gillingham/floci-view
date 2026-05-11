import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { NextRequest } from "next/server";
import {
  DELETE as DELETE_OBJECT,
  GET,
  PATCH,
  POST,
} from "@/app/api/s3/buckets/[bucket]/objects/route";

const s3 = mockClient(S3Client);
const context = { params: Promise.resolve({ bucket: "assets" }) };

describe("GET /api/s3/buckets/[bucket]/objects", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("returns object content and metadata", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: "hello",
      ContentType: "text/plain",
      ContentLength: 5,
      Metadata: { owner: "dev" },
      ETag: "abc",
    });

    const res = await GET(new NextRequest("http://test/api/s3/buckets/assets/objects?key=notes.txt"), context);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.object).toMatchObject({
      Key: "notes.txt",
      Body: "hello",
      BodyEncoding: "text",
      Metadata: { owner: "dev" },
    });
  });

  it("streams an attachment when download is requested", async () => {
    s3.on(GetObjectCommand).resolves({
      Body: "hello",
      ContentType: "text/plain",
      ContentLength: 5,
    });

    const res = await GET(
      new NextRequest("http://test/api/s3/buckets/assets/objects?key=notes.txt&download=1"),
      context,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="notes.txt"');
    expect(await res.text()).toBe("hello");
  });
});

describe("POST /api/s3/buckets/[bucket]/objects", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("uploads JSON content with normalized metadata", async () => {
    s3.on(PutObjectCommand).resolves({});

    const res = await POST(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: "notes.txt",
          content: "hello",
          contentType: "text/plain",
          metadata: { Owner: " Dev ", empty: " " },
        }),
      }),
      context,
    );

    expect(res.status).toBe(201);
    expect(s3.commandCalls(PutObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: "assets",
      Key: "notes.txt",
      Body: "hello",
      ContentType: "text/plain",
      Metadata: { owner: "Dev" },
    });
  });
});

describe("PATCH /api/s3/buckets/[bucket]/objects", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("rewrites object metadata with a self-copy", async () => {
    s3.on(HeadObjectCommand).resolves({
      ContentType: "text/plain",
      CacheControl: "max-age=60",
      ContentDisposition: "inline",
    });
    s3.on(CopyObjectCommand).resolves({});

    const res = await PATCH(
      new Request("http://test/api/s3/buckets/assets/objects", {
        method: "PATCH",
        body: JSON.stringify({
          key: "notes.txt",
          metadata: { Env: " dev " },
          contentType: "application/json",
        }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(CopyObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: "assets",
      Key: "notes.txt",
      CopySource: "assets/notes.txt",
      MetadataDirective: "REPLACE",
      Metadata: { env: "dev" },
      ContentType: "application/json",
      CacheControl: "max-age=60",
      ContentDisposition: "inline",
    });
  });
});

describe("DELETE /api/s3/buckets/[bucket]/objects", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("deletes an object by key", async () => {
    s3.on(DeleteObjectCommand).resolves({});

    const res = await DELETE_OBJECT(
      new NextRequest("http://test/api/s3/buckets/assets/objects?key=notes.txt"),
      context,
    );

    expect(res.status).toBe(200);
    expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input).toEqual({
      Bucket: "assets",
      Key: "notes.txt",
    });
  });
});
