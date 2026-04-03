"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { HardDrive, MessageSquare, Activity, Users, RefreshCw } from "lucide-react";

interface ServiceStatus {
  service: string;
  status: string;
  count: number;
  label: string;
}

const serviceIcons: Record<string, typeof HardDrive> = {
  S3: HardDrive,
  SQS: MessageSquare,
  CloudWatch: Activity,
  Cognito: Users,
};

const serviceHrefs: Record<string, string> = {
  S3: "/s3",
  SQS: "/sqs",
  CloudWatch: "/cloudwatch",
  Cognito: "/cognito",
};

export default function Dashboard() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        setServices(data.services);
        setError(null);
      } else {
        setError("Unable to fetch service status.");
      }
    } catch {
      setError("Unable to connect to Floci. Make sure it is running on port 4566.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <PageHeader title="Dashboard" description="Floci service overview">
        <button
          onClick={fetchStatus}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </PageHeader>

      {error && (
        <div className="m-6 p-4 rounded-lg border" style={{ borderColor: "var(--error)", background: "rgba(239, 68, 68, 0.1)" }}>
          <p style={{ color: "var(--error)" }}>{error}</p>
        </div>
      )}

      {loading && !error && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse" style={{ color: "var(--text-secondary)" }}>
            Connecting to Floci...
          </div>
        </div>
      )}

      {!loading && services.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6">
          {services.map((svc) => {
            const Icon = serviceIcons[svc.service] ?? Activity;
            const href = serviceHrefs[svc.service] ?? "/";
            return (
              <a
                key={svc.service}
                href={href}
                className="rounded-lg border p-5 flex flex-col gap-3 transition-colors hover:opacity-90"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5" style={{ color: "var(--accent)" }} />
                    <span className="font-semibold">{svc.service}</span>
                  </div>
                  <StatusBadge status={svc.status} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{svc.count}</p>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{svc.label}</p>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
