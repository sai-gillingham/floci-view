"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { MessageSquare, RefreshCw } from "lucide-react";

export default function SQSPage() {
  const [queues, setQueues] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQueues();
  }, []);

  const fetchQueues = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sqs/queues");
      const data = await res.json();
      setQueues(data.queues ?? []);
    } catch {}
    setLoading(false);
  };

  const getQueueName = (url: string) => url.split("/").pop() ?? url;

  return (
    <div>
      <PageHeader title="SQS Queues" description="Simple Queue Service">
        <button
          onClick={fetchQueues}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </PageHeader>

      <div className="p-6">
        {loading && <div className="animate-pulse" style={{ color: "var(--text-secondary)" }}>Loading...</div>}
        {!loading && queues.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
            No queues found
          </div>
        )}
        {queues.length > 0 && (
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--bg-tertiary)" }}>
                  <th className="text-left px-4 py-2 font-medium">Queue Name</th>
                  <th className="text-left px-4 py-2 font-medium">URL</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((url) => (
                  <tr key={url} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" style={{ color: "var(--accent)" }} />
                      {getQueueName(url)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                      {url}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
