"use client";

import type { ChangeEvent, CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import {
  Bell,
  ChevronRight,
  Download,
  Eye,
  FileText,
  FolderInput,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";

interface S3Bucket {
  Name: string;
  CreationDate?: string;
}

interface S3Object {
  Key: string;
  Size?: number;
  LastModified?: string;
  ETag?: string;
}

interface S3Prefix {
  Prefix: string;
}

interface S3ObjectDetail {
  Key: string;
  ContentType?: string;
  ContentLength?: number;
  LastModified?: string;
  ETag?: string;
  Metadata?: Record<string, string>;
  Body?: string;
  BodyEncoding?: "text" | "base64";
}

interface TriggerConfiguration {
  id: string;
  destinationType: "Queue" | "Topic" | "Lambda";
  destinationArn: string;
  eventTypes: string[];
  prefixFilter: string;
  suffixFilter: string;
}

interface MetadataRow {
  id: string;
  key: string;
  value: string;
}

type ToastKind = "success" | "error";

const controlStyle: CSSProperties = {
  background: "var(--bg-primary)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const mutedTextStyle: CSSProperties = { color: "var(--text-secondary)" };

const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const textButtonClass =
  "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

const S3_EVENTS = [
  "s3:ObjectCreated:*",
  "s3:ObjectCreated:Put",
  "s3:ObjectCreated:Post",
  "s3:ObjectCreated:Copy",
  "s3:ObjectCreated:CompleteMultipartUpload",
  "s3:ObjectRemoved:*",
  "s3:ObjectRemoved:Delete",
  "s3:ObjectRemoved:DeleteMarkerCreated",
  "s3:ObjectRestore:*",
  "s3:ObjectTagging:*",
];

function formatBytes(bytes = 0) {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDateTime(value?: string) {
  if (!value) return "-";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function cleanPath(value: string) {
  return value.trim().replace(/^\/+/, "");
}

function normalizePrefix(value: string) {
  const path = cleanPath(value);
  if (!path) return "";

  return path.endsWith("/") ? path : `${path}/`;
}

function scopedKey(input: string, currentPrefix: string) {
  const key = cleanPath(input);
  if (!key) return "";
  if (!currentPrefix || key.startsWith(currentPrefix)) return key;

  return `${currentPrefix}${key}`;
}

function scopedPrefix(input: string, currentPrefix: string) {
  return normalizePrefix(scopedKey(input, currentPrefix));
}

function folderName(prefix: string, currentPrefix: string) {
  return prefix.replace(currentPrefix, "").replace(/\/$/, "");
}

function objectName(key: string, currentPrefix: string) {
  return key.replace(currentPrefix, "") || key;
}

function parentPrefix(prefix: string) {
  const parts = prefix.split("/").filter(Boolean);
  parts.pop();

  return parts.length ? `${parts.join("/")}/` : "";
}

function metadataRowsFromObject(metadata?: Record<string, string>): MetadataRow[] {
  return Object.entries(metadata ?? {}).map(([key, value], index) => ({
    id: `${key}-${index}`,
    key,
    value,
  }));
}

function metadataFromRows(rows: MetadataRow[]) {
  return rows.reduce<Record<string, string>>((metadata, row) => {
    const key = row.key.trim().toLowerCase();
    const value = row.value.trim();

    if (key && value) metadata[key] = value;
    return metadata;
  }, {});
}

function emptyTrigger(): TriggerConfiguration {
  return {
    id: "",
    destinationType: "Queue",
    destinationArn: "",
    eventTypes: ["s3:ObjectCreated:*"],
    prefixFilter: "",
    suffixFilter: "",
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data ? String(data.error) : "Request failed";
    throw new Error(message);
  }

  return data as T;
}

export default function S3Page() {
  const [buckets, setBuckets] = useState<S3Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [objects, setObjects] = useState<S3Object[]>([]);
  const [prefixes, setPrefixes] = useState<S3Prefix[]>([]);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);

  const [bucketName, setBucketName] = useState("");
  const [folderInput, setFolderInput] = useState("");
  const [moveSourcePrefix, setMoveSourcePrefix] = useState("");
  const [moveTargetPrefix, setMoveTargetPrefix] = useState("");

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState("");
  const [uploadContentType, setUploadContentType] = useState("");
  const [uploadMetadata, setUploadMetadata] = useState<MetadataRow[]>([]);

  const [objectDetail, setObjectDetail] = useState<S3ObjectDetail | null>(null);
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>([]);
  const [metadataContentType, setMetadataContentType] = useState("");
  const [metadataCacheControl, setMetadataCacheControl] = useState("");
  const [metadataDisposition, setMetadataDisposition] = useState("");

  const [triggers, setTriggers] = useState<TriggerConfiguration[]>([]);
  const [eventBridgeEnabled, setEventBridgeEnabled] = useState(false);
  const [loadingTriggers, setLoadingTriggers] = useState(false);

  const objectsFetchGenerationRef = useRef(0);
  const triggersFetchGenerationRef = useRef(0);

  const visibleObjects = useMemo(
    () => objects.filter((object) => object.Key !== currentPrefix),
    [currentPrefix, objects],
  );

  const selectedBucketPath = selectedBucket ? encodeURIComponent(selectedBucket) : "";

  const setSuccess = useCallback((message: string) => setToast({ kind: "success", message }), []);
  const setError = useCallback((message: string) => setToast({ kind: "error", message }), []);

  const fetchBuckets = useCallback(async () => {
    setLoadingBuckets(true);
    setToast(null);

    try {
      const data = await responseJson<{ buckets?: S3Bucket[] }>(await fetch("/api/s3/buckets"));
      setBuckets(data.buckets ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setBuckets([]);
    } finally {
      setLoadingBuckets(false);
    }
  }, [setError]);

  const fetchObjects = useCallback(
    async (bucket: string, prefix: string) => {
      const generation = ++objectsFetchGenerationRef.current;
      setLoadingObjects(true);
      setToast(null);

      try {
        const params = new URLSearchParams({ prefix });
        const data = await responseJson<{ objects?: S3Object[]; prefixes?: S3Prefix[] }>(
          await fetch(`/api/s3/buckets/${encodeURIComponent(bucket)}?${params.toString()}`),
        );

        if (generation !== objectsFetchGenerationRef.current) return;

        setObjects(data.objects ?? []);
        setPrefixes(data.prefixes ?? []);
      } catch (error) {
        if (generation !== objectsFetchGenerationRef.current) return;
        setError(error instanceof Error ? error.message : String(error));
        setObjects([]);
        setPrefixes([]);
      } finally {
        if (generation === objectsFetchGenerationRef.current) {
          setLoadingObjects(false);
        }
      }
    },
    [setError],
  );

  const fetchTriggers = useCallback(
    async (bucket: string) => {
      const generation = ++triggersFetchGenerationRef.current;
      setLoadingTriggers(true);

      try {
        const data = await responseJson<{
          triggers?: Array<Partial<TriggerConfiguration>>;
          eventBridgeEnabled?: boolean;
        }>(await fetch(`/api/s3/buckets/${encodeURIComponent(bucket)}/notifications`));

        if (generation !== triggersFetchGenerationRef.current) return;

        setTriggers(
          (data.triggers ?? []).map((trigger) => ({
            id: trigger.id ?? "",
            destinationType: trigger.destinationType ?? "Queue",
            destinationArn: trigger.destinationArn ?? "",
            eventTypes: trigger.eventTypes ?? [],
            prefixFilter: trigger.prefixFilter ?? "",
            suffixFilter: trigger.suffixFilter ?? "",
          })),
        );
        setEventBridgeEnabled(Boolean(data.eventBridgeEnabled));
      } catch (error) {
        if (generation !== triggersFetchGenerationRef.current) return;
        setError(error instanceof Error ? error.message : String(error));
        setTriggers([]);
        setEventBridgeEnabled(false);
      } finally {
        if (generation === triggersFetchGenerationRef.current) {
          setLoadingTriggers(false);
        }
      }
    },
    [setError],
  );

  const clearBucketContextUi = useCallback(() => {
    setObjectDetail(null);
    setMetadataRows([]);
    setMetadataContentType("");
    setMetadataCacheControl("");
    setMetadataDisposition("");
    setMoveSourcePrefix("");
    setMoveTargetPrefix("");
    setTriggers([]);
    setEventBridgeEnabled(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchBuckets();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchBuckets]);

  useEffect(() => {
    if (!selectedBucket) return undefined;

    const timer = setTimeout(() => {
      void fetchObjects(selectedBucket, currentPrefix);
    }, 0);

    return () => clearTimeout(timer);
  }, [currentPrefix, fetchObjects, selectedBucket]);

  useEffect(() => {
    if (!selectedBucket) return;

    void fetchTriggers(selectedBucket);
  }, [fetchTriggers, selectedBucket]);

  const refreshSelectedBucket = useCallback(async () => {
    if (!selectedBucket) return;
    await fetchObjects(selectedBucket, currentPrefix);
    await fetchTriggers(selectedBucket);
  }, [currentPrefix, fetchObjects, fetchTriggers, selectedBucket]);

  const createBucket = async () => {
    const name = bucketName.trim();
    if (!name) return;

    setBusy(true);
    setToast(null);

    try {
      await responseJson(
        await fetch("/api/s3/buckets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      );
      setBucketName("");
      clearBucketContextUi();
      setSelectedBucket(name);
      setCurrentPrefix("");
      await fetchBuckets();
      setSuccess(`Created bucket ${name}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteBucket = async (bucket: string) => {
    if (!window.confirm(`Delete bucket "${bucket}"?`)) return;

    setBusy(true);
    setToast(null);

    try {
      await responseJson(
        await fetch(`/api/s3/buckets/${encodeURIComponent(bucket)}`, {
          method: "DELETE",
        }),
      );
      if (selectedBucket === bucket) {
        setSelectedBucket(null);
        setObjects([]);
        setPrefixes([]);
        setCurrentPrefix("");
        clearBucketContextUi();
      }
      await fetchBuckets();
      setSuccess(`Deleted bucket ${bucket}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    if (!selectedBucket) return;

    const prefix = scopedPrefix(folderInput, currentPrefix);
    if (!prefix) return;

    setBusy(true);
    setToast(null);

    try {
      await responseJson(
        await fetch(`/api/s3/buckets/${selectedBucketPath}/folders`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "create", prefix }),
        }),
      );
      setFolderInput("");
      await fetchObjects(selectedBucket, currentPrefix);
      setSuccess(`Created folder ${prefix}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const startMoveFolder = (prefix: string) => {
    setMoveSourcePrefix(prefix);
    setMoveTargetPrefix(prefix);
  };

  const moveFolder = async () => {
    if (!selectedBucket || !moveSourcePrefix) return;

    const targetPrefix = normalizePrefix(moveTargetPrefix);
    if (!targetPrefix) return;

    setBusy(true);
    setToast(null);

    try {
      await responseJson(
        await fetch(`/api/s3/buckets/${selectedBucketPath}/folders`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "move",
            sourcePrefix: moveSourcePrefix,
            targetPrefix,
          }),
        }),
      );
      setMoveSourcePrefix("");
      setMoveTargetPrefix("");
      await fetchObjects(selectedBucket, currentPrefix);
      setSuccess(`Moved folder to ${targetPrefix}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = async (prefix: string) => {
    if (!selectedBucket) return;
    if (!window.confirm(`Delete folder "${prefix}" and its objects?`)) return;

    setBusy(true);
    setToast(null);

    try {
      const params = new URLSearchParams({ prefix });
      await responseJson(
        await fetch(`/api/s3/buckets/${selectedBucketPath}/folders?${params.toString()}`, {
          method: "DELETE",
        }),
      );
      await fetchObjects(selectedBucket, currentPrefix);
      setSuccess(`Deleted folder ${prefix}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const uploadObject = async () => {
    if (!selectedBucket || !uploadFile) return;

    const key = scopedKey(uploadKey || uploadFile.name, currentPrefix);
    if (!key) return;

    setBusy(true);
    setToast(null);

    try {
      const formData = new FormData();
      formData.set("file", uploadFile);
      formData.set("key", key);
      formData.set("contentType", uploadContentType || uploadFile.type);
      formData.set("metadata", JSON.stringify(metadataFromRows(uploadMetadata)));

      await responseJson(
        await fetch(`/api/s3/buckets/${selectedBucketPath}/objects`, {
          method: "POST",
          body: formData,
        }),
      );

      setUploadFile(null);
      setUploadKey("");
      setUploadContentType("");
      setUploadMetadata([]);
      await fetchObjects(selectedBucket, currentPrefix);
      setSuccess(`Uploaded ${key}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const viewObject = async (key: string, options?: { skipBusy?: boolean }) => {
    if (!selectedBucket) return;

    const manageBusy = !options?.skipBusy;
    if (manageBusy) {
      setBusy(true);
      setToast(null);
    }

    try {
      const params = new URLSearchParams({ key });
      const data = await responseJson<{ object?: S3ObjectDetail }>(
        await fetch(`/api/s3/buckets/${selectedBucketPath}/objects?${params.toString()}`),
      );
      const detail = data.object ?? null;

      setObjectDetail(detail);
      setMetadataRows(metadataRowsFromObject(detail?.Metadata));
      setMetadataContentType(detail?.ContentType ?? "");
      setMetadataCacheControl("");
      setMetadataDisposition("");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (manageBusy) setBusy(false);
    }
  };

  const downloadObject = (key: string) => {
    if (!selectedBucket) return;

    const params = new URLSearchParams({ key, download: "1" });
    window.location.href = `/api/s3/buckets/${selectedBucketPath}/objects?${params.toString()}`;
  };

  const deleteObject = async (key: string) => {
    if (!selectedBucket) return;
    if (!window.confirm(`Delete object "${key}"?`)) return;

    setBusy(true);
    setToast(null);

    try {
      const params = new URLSearchParams({ key });
      await responseJson(
        await fetch(`/api/s3/buckets/${selectedBucketPath}/objects?${params.toString()}`, {
          method: "DELETE",
        }),
      );
      if (objectDetail?.Key === key) setObjectDetail(null);
      await fetchObjects(selectedBucket, currentPrefix);
      setSuccess(`Deleted ${key}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const saveObjectMetadata = async () => {
    if (!selectedBucket || !objectDetail) return;

    setBusy(true);
    setToast(null);

    try {
      await responseJson(
        await fetch(`/api/s3/buckets/${selectedBucketPath}/objects`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            key: objectDetail.Key,
            metadata: metadataFromRows(metadataRows),
            contentType: metadataContentType,
            cacheControl: metadataCacheControl,
            contentDisposition: metadataDisposition,
          }),
        }),
      );
      await viewObject(objectDetail.Key, { skipBusy: true });
      await fetchObjects(selectedBucket, currentPrefix);
      setSuccess(`Updated metadata for ${objectDetail.Key}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const saveTriggers = async () => {
    if (!selectedBucket) return;

    setBusy(true);
    setToast(null);

    try {
      const data = await responseJson<{
        triggers?: TriggerConfiguration[];
        eventBridgeEnabled?: boolean;
      }>(
        await fetch(`/api/s3/buckets/${selectedBucketPath}/notifications`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ triggers, eventBridgeEnabled }),
        }),
      );
      setTriggers(
        (data.triggers ?? []).map((trigger) => ({
          ...trigger,
          prefixFilter: trigger.prefixFilter ?? "",
          suffixFilter: trigger.suffixFilter ?? "",
        })),
      );
      setEventBridgeEnabled(Boolean(data.eventBridgeEnabled));
      setSuccess("Saved S3 trigger events");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const clearTriggers = async () => {
    if (!selectedBucket) return;
    if (!window.confirm(`Delete all trigger events for "${selectedBucket}"?`)) return;

    setBusy(true);
    setToast(null);

    try {
      await responseJson(
        await fetch(`/api/s3/buckets/${selectedBucketPath}/notifications`, {
          method: "DELETE",
        }),
      );
      setTriggers([]);
      setEventBridgeEnabled(false);
      setSuccess("Deleted S3 trigger events");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const selectUploadFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadFile(file);
    if (file && !uploadContentType) setUploadContentType(file.type);
  };

  const addMetadataRow = (rows: MetadataRow[], setRows: (rows: MetadataRow[]) => void) => {
    setRows([...rows, { id: `${Date.now()}-${rows.length}`, key: "", value: "" }]);
  };

  const updateMetadataRow = (
    rows: MetadataRow[],
    setRows: (rows: MetadataRow[]) => void,
    id: string,
    field: "key" | "value",
    value: string,
  ) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const removeMetadataRow = (rows: MetadataRow[], setRows: (rows: MetadataRow[]) => void, id: string) => {
    setRows(rows.filter((row) => row.id !== id));
  };

  const updateTrigger = <K extends keyof TriggerConfiguration>(
    index: number,
    field: K,
    value: TriggerConfiguration[K],
  ) => {
    setTriggers(triggers.map((trigger, triggerIndex) => (triggerIndex === index ? { ...trigger, [field]: value } : trigger)));
  };

  const toggleTriggerEvent = (index: number, eventType: string) => {
    const trigger = triggers[index];
    const eventTypes = trigger.eventTypes.includes(eventType)
      ? trigger.eventTypes.filter((value) => value !== eventType)
      : [...trigger.eventTypes, eventType];

    updateTrigger(index, "eventTypes", eventTypes);
  };

  return (
    <div>
      <PageHeader title="S3 Buckets" description="Simple Storage Service">
        <div className="flex items-center gap-2">
          {toast && (
            <span
              className="rounded-md border px-3 py-1.5 text-sm"
              style={{
                borderColor: toast.kind === "error" ? "var(--error)" : "var(--success)",
                color: toast.kind === "error" ? "var(--error)" : "var(--success)",
              }}
            >
              {toast.message}
            </span>
          )}
          <button
            type="button"
            onClick={fetchBuckets}
            className={textButtonClass}
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            disabled={loadingBuckets || busy}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </PageHeader>

      <div className="grid h-[calc(100vh-73px)] grid-cols-[18rem_minmax(0,1fr)_24rem] overflow-hidden">
        <aside className="border-r p-3" style={{ borderColor: "var(--border)" }}>
          <div className="mb-3 flex gap-2">
            <input
              value={bucketName}
              onChange={(event) => setBucketName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createBucket();
              }}
              placeholder="Bucket name"
              className={inputClass}
              style={controlStyle}
            />
            <button
              type="button"
              onClick={createBucket}
              className={iconButtonClass}
              style={{ borderColor: "var(--border)", color: "var(--accent)" }}
              disabled={busy || !bucketName.trim()}
              title="Create bucket"
              aria-label="Create bucket"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 text-xs font-semibold uppercase" style={mutedTextStyle}>
            Buckets ({buckets.length})
          </div>

          <div className="h-[calc(100%-5rem)] overflow-y-auto pr-1">
            {loadingBuckets && (
              <div className="animate-pulse px-3 py-2 text-sm" style={mutedTextStyle}>
                Loading...
              </div>
            )}

            {!loadingBuckets && buckets.length === 0 && (
              <div className="px-3 py-2 text-sm" style={mutedTextStyle}>
                No buckets found
              </div>
            )}

            {buckets.map((bucket) => (
              <div key={bucket.Name} className="mb-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    clearBucketContextUi();
                    setSelectedBucket(bucket.Name);
                    setCurrentPrefix("");
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
                  style={{
                    background: selectedBucket === bucket.Name ? "var(--bg-tertiary)" : "transparent",
                    color: selectedBucket === bucket.Name ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  <HardDrive className="h-4 w-4 shrink-0" />
                  <span className="truncate">{bucket.Name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteBucket(bucket.Name)}
                  className={iconButtonClass}
                  style={{ borderColor: "transparent", color: "var(--text-secondary)" }}
                  disabled={busy}
                  title="Delete bucket"
                  aria-label={`Delete bucket ${bucket.Name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 overflow-y-auto p-4">
          {!selectedBucket && (
            <div className="flex h-full items-center justify-center text-sm" style={mutedTextStyle}>
              Select a bucket to browse objects
            </div>
          )}

          {selectedBucket && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm" style={mutedTextStyle}>
                  <HardDrive className="h-4 w-4" />
                  <button
                    type="button"
                    onClick={() => setCurrentPrefix("")}
                    className="rounded px-1.5 py-1"
                    style={{ color: currentPrefix ? "var(--accent)" : "var(--text-primary)" }}
                  >
                    {selectedBucket}
                  </button>
                  {currentPrefix
                    .split("/")
                    .filter(Boolean)
                    .map((part, index, parts) => {
                      const prefix = `${parts.slice(0, index + 1).join("/")}/`;
                      return (
                        <span key={prefix} className="flex items-center gap-1">
                          <ChevronRight className="h-3.5 w-3.5" />
                          <button
                            type="button"
                            onClick={() => setCurrentPrefix(prefix)}
                            className="rounded px-1.5 py-1"
                            style={{ color: index === parts.length - 1 ? "var(--text-primary)" : "var(--accent)" }}
                          >
                            {part}
                          </button>
                        </span>
                      );
                    })}
                </div>

                <button
                  type="button"
                  onClick={() => void refreshSelectedBucket()}
                  className={textButtonClass}
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  disabled={busy || loadingObjects}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
              </div>

              <section className="grid gap-3 xl:grid-cols-2">
                <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <Upload className="h-4 w-4" style={{ color: "var(--accent)" }} /> Upload object
                    </h2>
                    <button
                      type="button"
                      onClick={uploadObject}
                      className={textButtonClass}
                      style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                      disabled={busy || !uploadFile}
                    >
                      <Upload className="h-3.5 w-3.5" /> Upload
                    </button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      type="file"
                      onChange={selectUploadFile}
                      className="h-9 rounded-md border px-2 py-1 text-sm"
                      style={controlStyle}
                    />
                    <input
                      value={uploadKey}
                      onChange={(event) => setUploadKey(event.target.value)}
                      placeholder={uploadFile ? `${currentPrefix}${uploadFile.name}` : "Object key"}
                      className={inputClass}
                      style={controlStyle}
                    />
                    <input
                      value={uploadContentType}
                      onChange={(event) => setUploadContentType(event.target.value)}
                      placeholder="Content type"
                      className={inputClass}
                      style={controlStyle}
                    />
                  </div>
                  <MetadataEditor
                    rows={uploadMetadata}
                    onAdd={() => addMetadataRow(uploadMetadata, setUploadMetadata)}
                    onChange={(id, field, value) => updateMetadataRow(uploadMetadata, setUploadMetadata, id, field, value)}
                    onRemove={(id) => removeMetadataRow(uploadMetadata, setUploadMetadata, id)}
                  />
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                      <FolderPlus className="h-4 w-4" style={{ color: "var(--warning)" }} /> Folders
                    </h2>
                    <button
                      type="button"
                      onClick={createFolder}
                      className={textButtonClass}
                      style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                      disabled={busy || !folderInput.trim()}
                    >
                      <Plus className="h-3.5 w-3.5" /> Create
                    </button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <input
                      value={folderInput}
                      onChange={(event) => setFolderInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void createFolder();
                      }}
                      placeholder={`${currentPrefix}folder-name`}
                      className={inputClass}
                      style={controlStyle}
                    />
                  </div>

                  {moveSourcePrefix && (
                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                      <input value={moveSourcePrefix} readOnly className={inputClass} style={controlStyle} />
                      <input
                        value={moveTargetPrefix}
                        onChange={(event) => setMoveTargetPrefix(event.target.value)}
                        className={inputClass}
                        style={controlStyle}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={moveFolder}
                          className={iconButtonClass}
                          style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                          disabled={busy || !moveTargetPrefix.trim()}
                          title="Move folder"
                          aria-label="Move folder"
                        >
                          <FolderInput className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMoveSourcePrefix("");
                            setMoveTargetPrefix("");
                          }}
                          className={iconButtonClass}
                          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                          title="Cancel move"
                          aria-label="Cancel move"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary)" }}>
                      <th className="w-[48%] px-4 py-2 text-left font-medium">Name</th>
                      <th className="w-[14%] px-4 py-2 text-right font-medium">Size</th>
                      <th className="w-[22%] px-4 py-2 text-right font-medium">Last Modified</th>
                      <th className="w-[16%] px-4 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPrefix && (
                      <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-2" colSpan={4}>
                          <button
                            type="button"
                            onClick={() => setCurrentPrefix(parentPrefix(currentPrefix))}
                            className="flex items-center gap-2 text-sm"
                            style={{ color: "var(--accent)" }}
                          >
                            <FolderOpen className="h-4 w-4" /> ..
                          </button>
                        </td>
                      </tr>
                    )}

                    {prefixes.map((prefix) => (
                      <tr key={prefix.Prefix} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="min-w-0 px-4 py-2">
                          <button
                            type="button"
                            onClick={() => setCurrentPrefix(prefix.Prefix)}
                            className="flex max-w-full items-center gap-2"
                          >
                            <FolderOpen className="h-4 w-4 shrink-0" style={{ color: "var(--warning)" }} />
                            <span className="truncate">{folderName(prefix.Prefix, currentPrefix)}</span>
                          </button>
                        </td>
                        <td className="px-4 py-2 text-right" style={mutedTextStyle}>
                          -
                        </td>
                        <td className="px-4 py-2 text-right" style={mutedTextStyle}>
                          -
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => startMoveFolder(prefix.Prefix)}
                              className={iconButtonClass}
                              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                              disabled={busy}
                              title="Move folder"
                              aria-label={`Move folder ${prefix.Prefix}`}
                            >
                              <FolderInput className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteFolder(prefix.Prefix)}
                              className={iconButtonClass}
                              style={{ borderColor: "var(--border)", color: "var(--error)" }}
                              disabled={busy}
                              title="Delete folder"
                              aria-label={`Delete folder ${prefix.Prefix}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {visibleObjects.map((object) => (
                      <tr key={object.Key} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="min-w-0 px-4 py-2">
                          <button
                            type="button"
                            onClick={() => void viewObject(object.Key)}
                            className="flex max-w-full items-center gap-2"
                          >
                            <FileText className="h-4 w-4 shrink-0" style={mutedTextStyle} />
                            <span className="truncate">{objectName(object.Key, currentPrefix)}</span>
                          </button>
                        </td>
                        <td className="px-4 py-2 text-right" style={mutedTextStyle}>
                          {formatBytes(object.Size)}
                        </td>
                        <td className="px-4 py-2 text-right" style={mutedTextStyle}>
                          {formatDateTime(object.LastModified)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => void viewObject(object.Key)}
                              className={iconButtonClass}
                              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                              disabled={busy}
                              title="View object"
                              aria-label={`View object ${object.Key}`}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadObject(object.Key)}
                              className={iconButtonClass}
                              style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                              disabled={busy}
                              title="Download object"
                              aria-label={`Download object ${object.Key}`}
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteObject(object.Key)}
                              className={iconButtonClass}
                              style={{ borderColor: "var(--border)", color: "var(--error)" }}
                              disabled={busy}
                              title="Delete object"
                              aria-label={`Delete object ${object.Key}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {(loadingObjects || (visibleObjects.length === 0 && prefixes.length === 0)) && (
                      <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td colSpan={4} className="px-4 py-8 text-center" style={mutedTextStyle}>
                          {loadingObjects ? "Loading..." : "Empty"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        <aside className="overflow-y-auto border-l p-4" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
          <section className="border-b pb-4" style={{ borderColor: "var(--border)" }}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4" style={{ color: "var(--accent)" }} /> Object
              </h2>
              <button
                type="button"
                onClick={saveObjectMetadata}
                className={iconButtonClass}
                style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                disabled={busy || !objectDetail}
                title="Save metadata"
                aria-label="Save metadata"
              >
                <Save className="h-4 w-4" />
              </button>
            </div>

            {!objectDetail && (
              <div className="py-8 text-center text-sm" style={mutedTextStyle}>
                Select an object
              </div>
            )}

            {objectDetail && (
              <div className="space-y-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium" title={objectDetail.Key}>
                    {objectDetail.Key}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs" style={mutedTextStyle}>
                    <span>{formatBytes(objectDetail.ContentLength)}</span>
                    <span className="text-right">{formatDateTime(objectDetail.LastModified)}</span>
                  </div>
                </div>

                <input
                  value={metadataContentType}
                  onChange={(event) => setMetadataContentType(event.target.value)}
                  placeholder="Content type"
                  className={inputClass}
                  style={controlStyle}
                />
                <input
                  value={metadataCacheControl}
                  onChange={(event) => setMetadataCacheControl(event.target.value)}
                  placeholder="Cache-Control"
                  className={inputClass}
                  style={controlStyle}
                />
                <input
                  value={metadataDisposition}
                  onChange={(event) => setMetadataDisposition(event.target.value)}
                  placeholder="Content-Disposition"
                  className={inputClass}
                  style={controlStyle}
                />

                <MetadataEditor
                  rows={metadataRows}
                  onAdd={() => addMetadataRow(metadataRows, setMetadataRows)}
                  onChange={(id, field, value) => updateMetadataRow(metadataRows, setMetadataRows, id, field, value)}
                  onRemove={(id) => removeMetadataRow(metadataRows, setMetadataRows, id)}
                />

                <textarea
                  value={objectDetail.Body ?? ""}
                  readOnly
                  className="min-h-48 w-full resize-y rounded-md border p-3 font-mono text-xs outline-none"
                  style={controlStyle}
                />
                <div className="text-xs" style={mutedTextStyle}>
                  {objectDetail.BodyEncoding === "base64" ? "base64" : "text"}
                </div>
              </div>
            )}
          </section>

          <section className="pt-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Bell className="h-4 w-4" style={{ color: "var(--warning)" }} /> S3 trigger events
              </h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setTriggers([...triggers, emptyTrigger()])}
                  className={iconButtonClass}
                  style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                  disabled={!selectedBucket || busy}
                  title="Add trigger"
                  aria-label="Add trigger"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={saveTriggers}
                  className={iconButtonClass}
                  style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                  disabled={!selectedBucket || busy}
                  title="Save triggers"
                  aria-label="Save triggers"
                >
                  <Save className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!selectedBucket && (
              <div className="py-8 text-center text-sm" style={mutedTextStyle}>
                Select a bucket
              </div>
            )}

            {selectedBucket && (
              <div className="space-y-3">
                <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm" style={controlStyle}>
                  <span>EventBridge</span>
                  <input
                    type="checkbox"
                    checked={eventBridgeEnabled}
                    onChange={(event) => setEventBridgeEnabled(event.target.checked)}
                  />
                </label>

                {loadingTriggers && (
                  <div className="animate-pulse py-3 text-sm" style={mutedTextStyle}>
                    Loading...
                  </div>
                )}

                {!loadingTriggers && triggers.length === 0 && (
                  <div className="py-4 text-center text-sm" style={mutedTextStyle}>
                    No triggers configured
                  </div>
                )}

                {triggers.map((trigger, index) => (
                  <div key={`${trigger.destinationArn}-${index}`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <select
                        value={trigger.destinationType}
                        onChange={(event) =>
                          updateTrigger(index, "destinationType", event.target.value as TriggerConfiguration["destinationType"])
                        }
                        className="h-8 rounded-md border px-2 text-sm outline-none"
                        style={controlStyle}
                      >
                        <option>Queue</option>
                        <option>Topic</option>
                        <option>Lambda</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setTriggers(triggers.filter((_, triggerIndex) => triggerIndex !== index))}
                        className={iconButtonClass}
                        style={{ borderColor: "var(--border)", color: "var(--error)" }}
                        disabled={busy}
                        title="Remove trigger"
                        aria-label="Remove trigger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      <input
                        value={trigger.id}
                        onChange={(event) => updateTrigger(index, "id", event.target.value)}
                        placeholder="Trigger id"
                        className={inputClass}
                        style={controlStyle}
                      />
                      <input
                        value={trigger.destinationArn}
                        onChange={(event) => updateTrigger(index, "destinationArn", event.target.value)}
                        placeholder="Destination ARN"
                        className={inputClass}
                        style={controlStyle}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={trigger.prefixFilter}
                          onChange={(event) => updateTrigger(index, "prefixFilter", event.target.value)}
                          placeholder="Prefix filter"
                          className={inputClass}
                          style={controlStyle}
                        />
                        <input
                          value={trigger.suffixFilter}
                          onChange={(event) => updateTrigger(index, "suffixFilter", event.target.value)}
                          placeholder="Suffix filter"
                          className={inputClass}
                          style={controlStyle}
                        />
                      </div>
                      <div className="grid gap-1">
                        {S3_EVENTS.map((eventType) => (
                          <label
                            key={eventType}
                            className="flex items-center gap-2 rounded px-2 py-1 text-xs"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            <input
                              type="checkbox"
                              checked={trigger.eventTypes.includes(eventType)}
                              onChange={() => toggleTriggerEvent(index, eventType)}
                            />
                            <span className="truncate">{eventType}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={clearTriggers}
                  className={textButtonClass}
                  style={{ borderColor: "var(--border)", color: "var(--error)" }}
                  disabled={busy || (!eventBridgeEnabled && triggers.length === 0)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear triggers
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function MetadataEditor({
  rows,
  onAdd,
  onChange,
  onRemove,
}: {
  rows: MetadataRow[];
  onAdd: () => void;
  onChange: (id: string, field: "key" | "value", value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase" style={mutedTextStyle}>
          Metadata
        </span>
        <button
          type="button"
          onClick={onAdd}
          className={iconButtonClass}
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          title="Add metadata"
          aria-label="Add metadata"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {rows.length === 0 && (
        <div className="rounded-md border px-3 py-2 text-sm" style={{ ...controlStyle, color: "var(--text-secondary)" }}>
          No metadata
        </div>
      )}

      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2">
          <input
            value={row.key}
            onChange={(event) => onChange(row.id, "key", event.target.value)}
            placeholder="Key"
            className={inputClass}
            style={controlStyle}
          />
          <input
            value={row.value}
            onChange={(event) => onChange(row.id, "value", event.target.value)}
            placeholder="Value"
            className={inputClass}
            style={controlStyle}
          />
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            className={iconButtonClass}
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            title="Remove metadata"
            aria-label="Remove metadata"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
