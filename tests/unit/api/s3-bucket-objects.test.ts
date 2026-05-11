import { beforeEach, describe, expect, it } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import { DeleteBucketCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { DELETE as DELETE_BUCKET, GET } from "@/app/api/s3/buckets/[bucket]/route";

const s3 = mockClient(S3Client);

const callGet = async (bucket: string, prefix = "") => {
  const url = `http://test/api/s3/buckets/${bucket}${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`;
  return GET(new Request(url), { params: Promise.resolve({ bucket }) });
};

describe("GET /api/s3/buckets/[bucket]", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("derives folders from a flat object list at the root", async () => {
    s3.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: "a.txt" },
        { Key: "dir1/b.txt" },
        { Key: "dir1/sub/c.txt" },
        { Key: "dir2/d.txt" },
      ],
    });
    const res = await callGet("my-bucket", "");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.objects.map((o: { Key: string }) => o.Key)).toEqual(["a.txt"]);
    expect(body.prefixes.map((p: { Prefix: string }) => p.Prefix)).toEqual([
      "dir1/",
      "dir2/",
    ]);
  });

  it("derives folders relative to a non-empty prefix", async () => {
    s3.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: "dir1/b.txt" },
        { Key: "dir1/sub/c.txt" },
        { Key: "dir1/sub/deeper/d.txt" },
      ],
    });
    const res = await callGet("my-bucket", "dir1/");
    const body = await res.json();
    expect(body.objects.map((o: { Key: string }) => o.Key)).toEqual(["dir1/b.txt"]);
    expect(body.prefixes.map((p: { Prefix: string }) => p.Prefix)).toEqual(["dir1/sub/"]);
  });

  it("returns empty arrays when the bucket is empty", async () => {
    s3.on(ListObjectsV2Command).resolves({});
    const res = await callGet("my-bucket");
    const body = await res.json();
    expect(body.objects).toEqual([]);
    expect(body.prefixes).toEqual([]);
  });

  it("passes through truncation fields from list results", async () => {
    s3.on(ListObjectsV2Command).resolves({
      Contents: [],
      IsTruncated: true,
      NextContinuationToken: "next-page",
    });

    const res = await callGet("my-bucket");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isTruncated).toBe(true);
    expect(body.nextContinuationToken).toBe("next-page");
  });

  it("returns 500 on SDK error", async () => {
    s3.on(ListObjectsV2Command).rejects(new Error("nope"));
    const res = await callGet("my-bucket");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("nope");
  });
});

describe("DELETE /api/s3/buckets/[bucket]", () => {
  beforeEach(() => {
    s3.reset();
  });

  it("deletes an empty bucket", async () => {
    s3.on(DeleteBucketCommand).resolves({});

    const res = await DELETE_BUCKET(new Request("http://test/api/s3/buckets/my-bucket"), {
      params: Promise.resolve({ bucket: "my-bucket" }),
    });

    expect(res.status).toBe(200);
    expect(s3.commandCalls(DeleteBucketCommand)[0].args[0].input).toEqual({ Bucket: "my-bucket" });
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 500 when delete fails", async () => {
    s3.on(DeleteBucketCommand).rejects(new Error("not empty"));

    const res = await DELETE_BUCKET(new Request("http://test/api/s3/buckets/my-bucket"), {
      params: Promise.resolve({ bucket: "my-bucket" }),
    });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("not empty");
  });
});
