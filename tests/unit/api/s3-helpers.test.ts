import { describe, expect, it } from "bun:test";
import {
  chunkArray,
  encodeCopySource,
  errorResponse,
  MalformedJsonBodyError,
  metadataFromUnknown,
  normalizeFolderPrefix,
  readJsonBody,
  stringFromUnknown,
} from "@/app/api/s3/helpers";

describe("errorResponse", () => {
  it("uses Error message for Error instances", async () => {
    const res = errorResponse(new Error("bad"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "bad" });
  });

  it("stringifies non-Error values", async () => {
    const res = errorResponse("plain");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "plain" });
  });

  it("accepts a custom status", async () => {
    const res = errorResponse(new Error("teapot"), 418);
    expect(res.status).toBe(418);
  });
});

describe("readJsonBody", () => {
  it("returns empty object when body is empty", async () => {
    const request = new Request("http://test", { method: "POST", body: "" });
    expect(await readJsonBody<Record<string, unknown>>(request)).toEqual({});
  });

  it("throws MalformedJsonBodyError when JSON is invalid", async () => {
    const request = new Request("http://test", { method: "POST", body: "not-json" });
    await expect(readJsonBody<Record<string, unknown>>(request)).rejects.toThrow(MalformedJsonBodyError);
  });

  it("preserves the parse error as cause", async () => {
    const request = new Request("http://test", { method: "POST", body: "not-json" });
    try {
      await readJsonBody<Record<string, unknown>>(request);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MalformedJsonBodyError);
      expect((error as MalformedJsonBodyError).cause).toBeDefined();
    }
  });

  it("returns empty object when body is an array", async () => {
    const request = new Request("http://test", { method: "POST", body: "[]" });
    expect(await readJsonBody<Record<string, unknown>>(request)).toEqual({});
  });

  it("returns empty object when body is null", async () => {
    const request = new Request("http://test", { method: "POST", body: "null" });
    expect(await readJsonBody<Record<string, unknown>>(request)).toEqual({});
  });
});

describe("metadataFromUnknown", () => {
  it("returns empty metadata for non-objects", () => {
    expect(metadataFromUnknown(null)).toEqual({});
    expect(metadataFromUnknown(undefined)).toEqual({});
    expect(metadataFromUnknown([])).toEqual({});
    expect(metadataFromUnknown("x")).toEqual({});
  });

  it("normalizes keys and skips empty values", () => {
    expect(
      metadataFromUnknown({
        "  Owner  ": " Dev ",
        "": "skip",
        k: null,
        empty: "   ",
      }),
    ).toEqual({ owner: "Dev" });
  });
});

describe("stringFromUnknown", () => {
  it("trims strings and returns empty for other types", () => {
    expect(stringFromUnknown("  a  ")).toBe("a");
    expect(stringFromUnknown(99)).toBe("");
  });
});

describe("normalizeFolderPrefix", () => {
  it("strips leading slashes and ensures trailing slash", () => {
    expect(normalizeFolderPrefix("  photos  ")).toBe("photos/");
    expect(normalizeFolderPrefix("/docs")).toBe("docs/");
    expect(normalizeFolderPrefix("x/")).toBe("x/");
    expect(normalizeFolderPrefix("  ")).toBe("");
  });
});

describe("encodeCopySource", () => {
  it("encodes bucket and each key segment", () => {
    expect(encodeCopySource("my bucket", "a/b c")).toBe("my%20bucket/a/b%20c");
  });
});

describe("chunkArray", () => {
  it("splits items into fixed-size chunks", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([] as number[], 3)).toEqual([]);
  });

  it("defaults invalid chunkSize to 1", () => {
    expect(chunkArray([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
    expect(chunkArray([1, 2, 3], -1)).toEqual([[1], [2], [3]]);
    expect(chunkArray([1, 2, 3], Number.NaN)).toEqual([[1], [2], [3]]);
    expect(chunkArray([1, 2, 3], 0.5)).toEqual([[1], [2], [3]]);
  });
});
