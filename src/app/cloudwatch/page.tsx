"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Activity, FileText, ArrowLeft, RefreshCw } from "lucide-react";

interface LogGroup {
  logGroupName: string;
  storedBytes: number;
  creationTime: number;
  retentionInDays?: number;
}

interface LogStream {
  logStreamName: string;
  lastEventTimestamp?: number;
  storedBytes?: number;
}

interface LogEvent {
  timestamp: number;
  message: string;
}

export default function CloudWatchPage() {
  const [logGroups, setLogGroups] = useState<LogGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [streams, setStreams] = useState<LogStream[]>([]);
  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      setSelectedStream(null);
      setEvents([]);
      fetchStreams(selectedGroup);
    }
  }, [selectedGroup]);

  useEffect(() => {
    if (selectedGroup && selectedStream) {
      fetchEvents(selectedGroup, selectedStream);
    }
  }, [selectedGroup, selectedStream]);

  const fetchLogGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cloudwatch/log-groups");
      const data = await res.json();
      setLogGroups(data.logGroups ?? []);
    } catch {}
    setLoading(false);
  };

  const fetchStreams = async (logGroupName: string) => {
    try {
      const res = await fetch(`/api/cloudwatch/streams?logGroupName=${encodeURIComponent(logGroupName)}`);
      const data = await res.json();
      setStreams(data.streams ?? []);
    } catch {}
  };

  const fetchEvents = async (logGroupName: string, logStreamName: string) => {
    try {
      const res = await fetch(
        `/api/cloudwatch/events?logGroupName=${encodeURIComponent(logGroupName)}&logStreamName=${encodeURIComponent(logStreamName)}`
      );
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch {}
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div>
      <PageHeader title="CloudWatch Logs" description="Log Groups and Streams">
        <button
          onClick={fetchLogGroups}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </PageHeader>

      <div className="flex h-[calc(100vh-73px)]">
        <div className="w-72 border-r overflow-y-auto p-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: "var(--text-secondary)" }}>
            Log Groups ({logGroups.length})
          </div>
          {loading && <div className="text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>Loading...</div>}
          {logGroups.map((group) => (
            <button
              key={group.logGroupName}
              onClick={() => setSelectedGroup(group.logGroupName)}
              className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 mb-1 transition-colors"
              style={{
                background: selectedGroup === group.logGroupName ? "var(--bg-tertiary)" : "transparent",
                color: selectedGroup === group.logGroupName ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <Activity className="w-4 h-4 shrink-0" />
              <span className="truncate">{group.logGroupName}</span>
            </button>
          ))}
          {!loading && logGroups.length === 0 && (
            <p className="text-sm px-3" style={{ color: "var(--text-secondary)" }}>No log groups found</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedGroup && (
            <div className="flex items-center justify-center h-full" style={{ color: "var(--text-secondary)" }}>
              Select a log group to view streams
            </div>
          )}

          {selectedGroup && !selectedStream && (
            <>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                Streams in {selectedGroup}
              </h2>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary)" }}>
                      <th className="text-left px-4 py-2 font-medium">Stream Name</th>
                      <th className="text-right px-4 py-2 font-medium">Last Event</th>
                      <th className="text-right px-4 py-2 font-medium">Stored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streams.map((stream) => (
                      <tr
                        key={stream.logStreamName}
                        className="border-t cursor-pointer hover:opacity-80"
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => setSelectedStream(stream.logStreamName)}
                      >
                        <td className="px-4 py-2 flex items-center gap-2">
                          <FileText className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                          <span className="truncate">{stream.logStreamName}</span>
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                          {stream.lastEventTimestamp ? new Date(stream.lastEventTimestamp).toLocaleString() : "-"}
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                          {formatBytes(stream.storedBytes ?? 0)}
                        </td>
                      </tr>
                    ))}
                    {streams.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                          No streams found
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
                onClick={() => setSelectedStream(null)}
                className="mb-3 text-sm flex items-center gap-1"
                style={{ color: "var(--accent)" }}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to streams
              </button>
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                Events in {selectedStream}
              </h2>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary)" }}>
                      <th className="text-left px-4 py-2 font-medium w-48">Timestamp</th>
                      <th className="text-left px-4 py-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-2 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                          {new Date(event.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs whitespace-pre-wrap break-all">
                          {event.message}
                        </td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                          No events found
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
