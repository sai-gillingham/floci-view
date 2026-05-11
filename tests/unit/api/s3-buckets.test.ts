import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import { CreateBucketCommand, ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import { GET, POST } from "@/app/api/s3/buckets/route";

const s3 = mockClient(S3Client);

describe("GET /api/s3/buckets", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("returns the bucket list on success", async () => {
    s3.on(ListBucketsCommand).resolves({
      Buckets: [{ Name: "alpha", CreationDate: new Date("2024-01-01") }],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buckets).toHaveLength(1);
    expect(body.buckets[0].Name).toBe("alpha");
  });

  it("returns an empty array when no Buckets field is present", async () => {
    s3.on(ListBucketsCommand).resolves({});
    const res = await GET();
    const body = await res.json();
    expect(body.buckets).toEqual([]);
  });

  it("returns 500 on SDK error", async () => {
    s3.on(ListBucketsCommand).rejects(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("boom");
  });
});

describe("POST /api/s3/buckets", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("creates a bucket", async () => {
    s3.on(CreateBucketCommand).resolves({});

    const res = await POST(
      new Request("http://test/api/s3/buckets", {
        method: "POST",
        body: JSON.stringify({ name: "assets" }),
      }),
    );

    expect(res.status).toBe(201);
    expect(s3.commandCalls(CreateBucketCommand)[0].args[0].input).toEqual({ Bucket: "assets" });
    const body = await res.json();
    expect(body.bucket.Name).toBe("assets");
  });

  it("requires a bucket name", async () => {
    const res = await POST(
      new Request("http://test/api/s3/buckets", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(s3.commandCalls(CreateBucketCommand)).toHaveLength(0);
  });

  it("returns 500 when create fails", async () => {
    s3.on(CreateBucketCommand).rejects(new Error("already exists"));

    const res = await POST(
      new Request("http://test/api/s3/buckets", {
        method: "POST",
        body: JSON.stringify({ name: "assets" }),
      }),
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("already exists");
  });
});
