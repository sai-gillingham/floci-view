"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import {
  Activity,
  ArrowLeft,
  Calendar,
  FileText,
  Filter,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
  X,
} from "lucide-react";

interface LogGroup {
  logGroupName: string;
  storedBytes?: number;
  creationTime?: number;
  retentionInDays?: number;
}

interface LogStream {
  logStreamName: string;
  lastEventTimestamp?: number;
  storedBytes?: number;
}

interface LogEvent {
  eventId?: string;
  timestamp?: number;
  message?: string;
}

interface AppliedEventFilters {
  filterPattern: string;
  startTime?: number;
  endTime?: number;
}

interface EventsResponse {
  events?: LogEvent[];
  nextToken?: string;
  error?: string;
}

type TimeRangeValue = "all" | "5m" | "30m" | "1h" | "3h" | "12h" | "1d" | "3d" | "custom";

const EVENT_PAGE_SIZE = 100;
const DEFAULT_TRUNCATE_CHARS = 500;

const TIME_RANGES: Array<{ value: TimeRangeValue; label: string; durationMs?: number }> = [
  { value: "all", label: "All time" },
  { value: "5m", label: "Last 5 minutes", durationMs: 5 * 60 * 1000 },
  { value: "30m", label: "Last 30 minutes", durationMs: 30 * 60 * 1000 },
  { value: "1h", label: "Last 1 hour", durationMs: 60 * 60 * 1000 },
  { value: "3h", label: "Last 3 hours", durationMs: 3 * 60 * 60 * 1000 },
  { value: "12h", label: "Last 12 hours", durationMs: 12 * 60 * 60 * 1000 },
  { value: "1d", label: "Last 1 day", durationMs: 24 * 60 * 60 * 1000 },
  { value: "3d", label: "Last 3 days", durationMs: 3 * 24 * 60 * 60 * 1000 },
  { value: "custom", label: "Custom range" },
];

const controlStyle: CSSProperties = {
  background: "var(--bg-primary)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const mutedTextStyle: CSSProperties = { color: "var(--text-secondary)" };

const defaultEventFilters: AppliedEventFilters = {
  filterPattern: "",
};

function clampPositiveInteger(value: number, fallback: number, max: number) {
  if (!Number.isInteger(value) || value < 1) return fallback;

  return Math.min(value, max);
}

function parseDateTimeInput(value: string) {
  if (!value) return undefined;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function formatBytes(bytes = 0) {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDateTime(timestamp?: number) {
  return timestamp === undefined ? "-" : new Date(timestamp).toLocaleString();
}

function formatRetention(retentionInDays?: number) {
  return retentionInDays ? `${retentionInDays} days` : "Never expire";
}

function toLowerSearch(value: string) {
  return value.trim().toLowerCase();
}

export default function CloudWatchPage() {
  const [logGroups, setLogGroups] = useState<LogGroup[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [streams, setStreams] = useState<LogStream[]>([]);
  const [streamFilter, setStreamFilter] = useState("");
  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterPattern, setFilterPattern] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("all");
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<AppliedEventFilters>(defaultEventFilters);
  const [truncateMessages, setTruncateMessages] = useState(true);
  const [truncateAt, setTruncateAt] = useState(DEFAULT_TRUNCATE_CHARS);
  const [eventPage, setEventPage] = useState(1);
  const [eventToken, setEventToken] = useState<string | undefined>();
  const [previousEventTokens, setPreviousEventTokens] = useState<Array<string | undefined>>([]);
  const [nextEventToken, setNextEventToken] = useState<string | undefined>();
  const [deletingStream, setDeletingStream] = useState(false);

  const buildEventsUrl = useCallback(
    (logGroupName: string, logStreamName: string, filters: AppliedEventFilters, nextToken?: string) => {
      const params = new URLSearchParams({
        logGroupName,
        logStreamName,
        limit: String(EVENT_PAGE_SIZE),
      });

      if (filters.filterPattern) params.set("filterPattern", filters.filterPattern);
      if (filters.startTime !== undefined) params.set("startTime", String(filters.startTime));
      if (filters.endTime !== undefined) params.set("endTime", String(filters.endTime));
      if (nextToken) params.set("nextToken", nextToken);

      return `/api/cloudwatch/events?${params.toString()}`;
    },
    [],
  );

  const resetEventPagination = useCallback(() => {
    setEventPage(1);
    setEventToken(undefined);
    setPreviousEventTokens([]);
    setNextEventToken(undefined);
  }, []);

  const fetchLogGroups = useCallback(async () => {
    setLoadingGroups(true);
    setError(null);

    try {
      const res = await fetch("/api/cloudwatch/log-groups");
      if (!res.ok) throw new Error("Unable to load log groups");

      const data = await res.json();
      setLogGroups(data.logGroups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLogGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const fetchStreams = useCallback(async (logGroupName: string) => {
    setLoadingStreams(true);
    setError(null);

    try {
      const res = await fetch(`/api/cloudwatch/streams?logGroupName=${encodeURIComponent(logGroupName)}`);
      if (!res.ok) throw new Error("Unable to load log streams");

      const data = await res.json();
      setStreams(data.streams ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStreams([]);
    } finally {
      setLoadingStreams(false);
    }
  }, []);

  const fetchEvents = useCallback(
    async (logGroupName: string, logStreamName: string, filters: AppliedEventFilters, nextToken?: string) => {
      setLoadingEvents(true);
      setError(null);

      try {
        const res = await fetch(buildEventsUrl(logGroupName, logStreamName, filters, nextToken));
        const data: EventsResponse = await res.json();

        if (!res.ok) throw new Error(data.error ?? "Unable to load log events");

        setEvents(data.events ?? []);
        setNextEventToken(data.nextToken);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setEvents([]);
        setNextEventToken(undefined);
      } finally {
        setLoadingEvents(false);
      }
    },
    [buildEventsUrl],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchLogGroups();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchLogGroups]);

  useEffect(() => {
    setSelectedStream(null);
    setEvents([]);
    setStreams([]);
    setStreamFilter("");
    resetEventPagination();

    if (!selectedGroup) return undefined;

    const timer = setTimeout(() => {
      void fetchStreams(selectedGroup);
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchStreams, resetEventPagination, selectedGroup]);

  useEffect(() => {
    if (!selectedGroup || !selectedStream) return undefined;

    const timer = setTimeout(() => {
      void fetchEvents(selectedGroup, selectedStream, appliedFilters, eventToken);
    }, 0);

    return () => clearTimeout(timer);
  }, [appliedFilters, eventToken, fetchEvents, selectedGroup, selectedStream]);

  const visibleLogGroups = useMemo(() => {
    const query = toLowerSearch(groupFilter);
    if (!query) return logGroups;

    return logGroups.filter((group) => group.logGroupName.toLowerCase().includes(query));
  }, [groupFilter, logGroups]);

  const visibleStreams = useMemo(() => {
    const query = toLowerSearch(streamFilter);
    if (!query) return streams;

    return streams.filter((stream) => stream.logStreamName.toLowerCase().includes(query));
  }, [streamFilter, streams]);

  const appliedFilterCount = useMemo(() => {
    let count = 0;
    if (appliedFilters.filterPattern) count += 1;
    if (appliedFilters.startTime !== undefined || appliedFilters.endTime !== undefined) count += 1;

    return count;
  }, [appliedFilters]);

  const getDraftTimeBounds = () => {
    const selectedRange = TIME_RANGES.find((range) => range.value === timeRange);

    if (selectedRange?.durationMs) {
      const endTime = Date.now();
      return { startTime: endTime - selectedRange.durationMs, endTime };
    }

    if (timeRange === "custom") {
      return {
        startTime: parseDateTimeInput(startDateTime),
        endTime: parseDateTimeInput(endDateTime),
      };
    }

    return {};
  };

  const applyEventFilters = () => {
    const { startTime, endTime } = getDraftTimeBounds();

    resetEventPagination();
    setAppliedFilters({
      filterPattern: filterPattern.trim(),
      startTime,
      endTime,
    });
  };

  const clearEventFilters = () => {
    setFilterPattern("");
    setTimeRange("all");
    setStartDateTime("");
    setEndDateTime("");
    resetEventPagination();
    setAppliedFilters(defaultEventFilters);
  };

  const refreshCloudWatch = () => {
    void fetchLogGroups();
    if (selectedGroup) void fetchStreams(selectedGroup);
    if (selectedGroup && selectedStream) void fetchEvents(selectedGroup, selectedStream, appliedFilters, eventToken);
  };

  const goToNextEventPage = () => {
    if (!nextEventToken) return;

    setPreviousEventTokens([...previousEventTokens, eventToken]);
    setEventToken(nextEventToken);
    setNextEventToken(undefined);
    setEventPage((page) => page + 1);
  };

  const goToPreviousEventPage = () => {
    if (previousEventTokens.length === 0) return;

    const previousToken = previousEventTokens[previousEventTokens.length - 1];
    setPreviousEventTokens(previousEventTokens.slice(0, -1));
    setEventToken(previousToken);
    setNextEventToken(undefined);
    setEventPage((page) => Math.max(1, page - 1));
  };

  const deleteSelectedStream = async () => {
    if (!selectedGroup || !selectedStream) return;

    const confirmed = window.confirm(
      `Delete log stream "${selectedStream}" and all archived events? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingStream(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        logGroupName: selectedGroup,
        logStreamName: selectedStream,
      });
      const res = await fetch(`/api/cloudwatch/streams?${params.toString()}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Unable to delete log stream");

      setStreams((currentStreams) => currentStreams.filter((stream) => stream.logStreamName !== selectedStream));
      setSelectedStream(null);
      setEvents([]);
      resetEventPagination();
      void fetchStreams(selectedGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingStream(false);
    }
  };

  const visibleMessage = (message = "") => {
    if (!truncateMessages) return message;

    const maxLength = clampPositiveInteger(Number(truncateAt), DEFAULT_TRUNCATE_CHARS, 10_000);
    if (message.length <= maxLength) return message;

    return `${message.slice(0, maxLength)}...`;
  };

  return (
    <div>
      <PageHeader title="CloudWatch Logs" description="Log Groups and Streams">
        <button
          onClick={refreshCloudWatch}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          type="button"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </PageHeader>

      <div className="flex h-[calc(100vh-73px)]">
        <aside className="w-80 shrink-0 overflow-y-auto border-r p-3" style={{ borderColor: "var(--border)" }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase" style={mutedTextStyle}>
              Log Groups ({visibleLogGroups.length}/{logGroups.length})
            </div>
            {groupFilter && (
              <button
                aria-label="Clear log group filter"
                className="rounded-md p-1"
                onClick={() => setGroupFilter("")}
                style={mutedTextStyle}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <label className="mb-3 flex items-center gap-2 rounded-md border px-2 py-1.5" style={controlStyle}>
            <Search className="h-4 w-4 shrink-0" style={mutedTextStyle} />
            <input
              aria-label="Filter log groups"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500"
              onChange={(event) => setGroupFilter(event.target.value)}
              placeholder="Filter log groups"
              type="search"
              value={groupFilter}
            />
          </label>

          {loadingGroups && (
            <div className="animate-pulse text-sm" style={mutedTextStyle}>
              Loading...
            </div>
          )}

          {visibleLogGroups.map((group) => (
            <button
              className="mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition-colors"
              key={group.logGroupName}
              onClick={() => setSelectedGroup(group.logGroupName)}
              style={{
                background: selectedGroup === group.logGroupName ? "var(--bg-tertiary)" : "transparent",
                color: selectedGroup === group.logGroupName ? "var(--text-primary)" : "var(--text-secondary)",
              }}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Activity className="h-4 w-4 shrink-0" />
                <span className="truncate">{group.logGroupName}</span>
              </span>
              <span className="mt-1 flex items-center gap-2 pl-6 text-xs" style={mutedTextStyle}>
                <span>{formatBytes(group.storedBytes)}</span>
                <span>{formatRetention(group.retentionInDays)}</span>
              </span>
            </button>
          ))}

          {!loadingGroups && visibleLogGroups.length === 0 && (
            <p className="px-3 text-sm" style={mutedTextStyle}>
              No log groups found
            </p>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto p-4">
          {error && (
            <div
              className="mb-4 rounded-md border px-3 py-2 text-sm"
              role="alert"
              style={{ borderColor: "var(--error)", color: "var(--error)" }}
            >
              {error}
            </div>
          )}

          {!selectedGroup && (
            <div className="flex h-full items-center justify-center" style={mutedTextStyle}>
              Select a log group to view streams
            </div>
          )}

          {selectedGroup && !selectedStream && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="min-w-0 truncate text-sm font-semibold" style={mutedTextStyle}>
                  Streams in {selectedGroup}
                </h2>
                <label className="flex min-w-64 items-center gap-2 rounded-md border px-2 py-1.5" style={controlStyle}>
                  <Search className="h-4 w-4 shrink-0" style={mutedTextStyle} />
                  <input
                    aria-label="Filter log streams"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500"
                    onChange={(event) => setStreamFilter(event.target.value)}
                    placeholder="Filter streams"
                    type="search"
                    value={streamFilter}
                  />
                </label>
              </div>

              <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary)" }}>
                      <th className="px-4 py-2 text-left font-medium">Stream Name</th>
                      <th className="px-4 py-2 text-right font-medium">Last Event</th>
                      <th className="px-4 py-2 text-right font-medium">Stored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStreams.map((stream) => (
                      <tr
                        className="cursor-pointer border-t hover:opacity-80"
                        key={stream.logStreamName}
                        onClick={() => {
                          resetEventPagination();
                          setSelectedStream(stream.logStreamName);
                        }}
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td className="flex items-center gap-2 px-4 py-2">
                          <FileText className="h-4 w-4 shrink-0" style={mutedTextStyle} />
                          <span className="truncate">{stream.logStreamName}</span>
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap" style={mutedTextStyle}>
                          {formatDateTime(stream.lastEventTimestamp)}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap" style={mutedTextStyle}>
                          {formatBytes(stream.storedBytes)}
                        </td>
                      </tr>
                    ))}
                    {(loadingStreams || visibleStreams.length === 0) && (
                      <tr>
                        <td className="px-4 py-8 text-center" colSpan={3} style={mutedTextStyle}>
                          {loadingStreams ? "Loading..." : "No streams found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {selectedGroup && selectedStream && (
            <>
              <button
                className="mb-3 flex items-center gap-1 text-sm"
                onClick={() => setSelectedStream(null)}
                style={{ color: "var(--accent)" }}
                type="button"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to streams
              </button>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="min-w-0 truncate text-sm font-semibold" style={mutedTextStyle}>
                  Events in {selectedStream} ({events.length}/{EVENT_PAGE_SIZE})
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {appliedFilterCount > 0 && (
                    <span className="rounded-md border px-2 py-1 text-xs" style={{ ...controlStyle, color: "var(--accent)" }}>
                      {appliedFilterCount} active
                    </span>
                  )}
                  <button
                    className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                    disabled={deletingStream}
                    onClick={deleteSelectedStream}
                    style={{ borderColor: "var(--error)", color: "var(--error)", opacity: deletingStream ? 0.6 : 1 }}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" /> {deletingStream ? "Deleting..." : "Delete stream"}
                  </button>
                </div>
              </div>

              <div className="mb-4 grid gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_10rem]">
                  <label className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={controlStyle}>
                    <Filter className="h-4 w-4 shrink-0" style={mutedTextStyle} />
                    <input
                      aria-label="Filter pattern"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500"
                      onChange={(event) => setFilterPattern(event.target.value)}
                      placeholder="Filter pattern"
                      type="search"
                      value={filterPattern}
                    />
                  </label>

                  <label className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={controlStyle}>
                    <Calendar className="h-4 w-4 shrink-0" style={mutedTextStyle} />
                    <select
                      aria-label="Time range"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      onChange={(event) => setTimeRange(event.target.value as TimeRangeValue)}
                      value={timeRange}
                    >
                      {TIME_RANGES.map((range) => (
                        <option key={range.value} value={range.value}>
                          {range.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm"
                      onClick={applyEventFilters}
                      style={{ background: "var(--accent)", color: "white" }}
                      type="button"
                    >
                      <Search className="h-4 w-4" /> Apply
                    </button>
                    <button
                      aria-label="Clear event filters"
                      className="rounded-md border p-2"
                      onClick={clearEventFilters}
                      style={controlStyle}
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {timeRange === "custom" && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={controlStyle}>
                      <span className="w-12 text-xs" style={mutedTextStyle}>
                        Start
                      </span>
                      <input
                        aria-label="Start date and time"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        onChange={(event) => setStartDateTime(event.target.value)}
                        type="datetime-local"
                        value={startDateTime}
                      />
                    </label>
                    <label className="flex items-center gap-2 rounded-md border px-2 py-1.5" style={controlStyle}>
                      <span className="w-12 text-xs" style={mutedTextStyle}>
                        End
                      </span>
                      <input
                        aria-label="End date and time"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        onChange={(event) => setEndDateTime(event.target.value)}
                        type="datetime-local"
                        value={endDateTime}
                      />
                    </label>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 text-sm" style={mutedTextStyle}>
                  <span>Page size: {EVENT_PAGE_SIZE} events</span>
                  <label className="flex items-center gap-2">
                    <input
                      checked={truncateMessages}
                      onChange={(event) => setTruncateMessages(event.target.checked)}
                      type="checkbox"
                    />
                    <Scissors className="h-4 w-4" />
                    Truncate messages
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      aria-label="Truncate message length"
                      className="w-24 rounded-md border px-2 py-1 text-sm outline-none"
                      disabled={!truncateMessages}
                      max={10_000}
                      min={50}
                      onChange={(event) => setTruncateAt(Number(event.target.value))}
                      style={controlStyle}
                      type="number"
                      value={truncateAt}
                    />
                    chars
                  </label>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm" style={mutedTextStyle}>
                <span>
                  Page {eventPage} · {EVENT_PAGE_SIZE} events/page
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md border px-3 py-1.5"
                    disabled={loadingEvents || previousEventTokens.length === 0}
                    onClick={goToPreviousEventPage}
                    style={{ ...controlStyle, opacity: loadingEvents || previousEventTokens.length === 0 ? 0.5 : 1 }}
                    type="button"
                  >
                    Previous {EVENT_PAGE_SIZE}
                  </button>
                  <button
                    className="rounded-md border px-3 py-1.5"
                    disabled={loadingEvents || !nextEventToken}
                    onClick={goToNextEventPage}
                    style={{ ...controlStyle, opacity: loadingEvents || !nextEventToken ? 0.5 : 1 }}
                    type="button"
                  >
                    Next {EVENT_PAGE_SIZE}
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary)" }}>
                      <th className="w-56 px-4 py-2 text-left font-medium">Timestamp</th>
                      <th className="px-4 py-2 text-left font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event, index) => (
                      <tr className="border-t" key={event.eventId ?? `${event.timestamp}-${index}`} style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-2 whitespace-nowrap" style={mutedTextStyle}>
                          {formatDateTime(event.timestamp)}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs break-all whitespace-pre-wrap" title={event.message}>
                          {visibleMessage(event.message)}
                        </td>
                      </tr>
                    ))}
                    {(loadingEvents || events.length === 0) && (
                      <tr>
                        <td className="px-4 py-8 text-center" colSpan={2} style={mutedTextStyle}>
                          {loadingEvents ? "Loading..." : "No events found"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
