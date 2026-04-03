"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { HardDrive, FolderOpen, FileText, RefreshCw } from "lucide-react";

interface S3Bucket {
  Name: string;
  CreationDate: string;
}

interface S3Object {
  Key: string;
  Size: number;
  LastModified: string;
}

export default function S3Page() {
  const [buckets, setBuckets] = useState<S3Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [prefixes, setPrefixes] = useState<any[]>([]);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBuckets();
  }, []);

  useEffect(() => {
    if (selectedBucket) fetchObjects(selectedBucket, currentPrefix);
  }, [selectedBucket, currentPrefix]);

  const fetchBuckets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/s3/buckets");
      const data = await res.json();
      setBuckets(data.buckets ?? []);
    } catch {}
    setLoading(false);
  };

  const fetchObjects = async (bucket: string, prefix: string) => {
    try {
      const res = await fetch(`/api/s3/buckets/${bucket}?prefix=${encodeURIComponent(prefix)}`);
      const data = await res.json();
      setObjects(data.objects ?? []);
      setPrefixes(data.prefixes ?? []);
    } catch {}
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div>
      <PageHeader title="S3 Buckets" description="Simple Storage Service">
        <button
          onClick={fetchBuckets}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </PageHeader>

      <div className="flex h-[calc(100vh-73px)]">
        <div className="w-72 border-r overflow-y-auto p-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: "var(--text-secondary)" }}>
            Buckets ({buckets.length})
          </div>
          {loading && <div className="text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>Loading...</div>}
          {buckets.map((bucket) => (
            <button
              key={bucket.Name}
              onClick={() => { setSelectedBucket(bucket.Name); setCurrentPrefix(""); }}
              className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 mb-1 transition-colors"
              style={{
                background: selectedBucket === bucket.Name ? "var(--bg-tertiary)" : "transparent",
                color: selectedBucket === bucket.Name ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <HardDrive className="w-4 h-4 shrink-0" />
              <span className="truncate">{bucket.Name}</span>
            </button>
          ))}
          {!loading && buckets.length === 0 && (
            <p className="text-sm px-3" style={{ color: "var(--text-secondary)" }}>No buckets found</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedBucket && (
            <div className="flex items-center justify-center h-full" style={{ color: "var(--text-secondary)" }}>
              Select a bucket to browse objects
            </div>
          )}
          {selectedBucket && (
            <>
              {currentPrefix && (
                <button
                  onClick={() => {
                    const parts = currentPrefix.split("/").filter(Boolean);
                    parts.pop();
                    setCurrentPrefix(parts.length ? parts.join("/") + "/" : "");
                  }}
                  className="mb-3 text-sm flex items-center gap-1"
                  style={{ color: "var(--accent)" }}
                >
                  .. (back)
                </button>
              )}
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary)" }}>
                      <th className="text-left px-4 py-2 font-medium">Name</th>
                      <th className="text-right px-4 py-2 font-medium">Size</th>
                      <th className="text-right px-4 py-2 font-medium">Last Modified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prefixes.map((p: any) => (
                      <tr
                        key={p.Prefix}
                        className="border-t cursor-pointer hover:opacity-80"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => setCurrentPrefix(p.Prefix)}
                      >
                        <td className="px-4 py-2 flex items-center gap-2">
                          <FolderOpen className="w-4 h-4" style={{ color: "var(--warning)" }} />
                          {p.Prefix.replace(currentPrefix, "")}
                        </td>
                        <td className="px-4 py-2 text-right">-</td>
                        <td className="px-4 py-2 text-right">-</td>
                      </tr>
                    ))}
                    {objects.map((obj) => (
                      <tr key={obj.Key} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-2 flex items-center gap-2">
                          <FileText className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                          {obj.Key.replace(currentPrefix, "")}
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                          {formatBytes(obj.Size)}
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                          {new Date(obj.LastModified).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {objects.length === 0 && prefixes.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                          Empty
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
