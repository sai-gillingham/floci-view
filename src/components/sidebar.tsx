"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  HardDrive,
  Home,
  MessageSquare,
  Server,
  Users,
} from "lucide-react";

const services = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "S3", href: "/s3", icon: HardDrive, category: "Storage" },
  { name: "SQS", href: "/sqs", icon: MessageSquare, category: "Messaging" },
  { name: "CloudWatch", href: "/cloudwatch", icon: Activity, category: "Monitoring" },
  { name: "Cognito", href: "/cognito", icon: Users, category: "Security" },
];

export function Sidebar() {
  const pathname = usePathname();

  let lastCategory = "";

  return (
    <aside
      className="w-60 flex flex-col border-r shrink-0 h-full"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
        <Link href="/" className="flex items-center gap-2">
          <Server className="w-5 h-5" style={{ color: "var(--accent)" }} />
          <span className="font-bold text-lg">Floci</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {services.map((service) => {
          const showCategory = service.category && service.category !== lastCategory;
          if (service.category) lastCategory = service.category;
          const isActive = pathname === service.href || (service.href !== "/" && pathname.startsWith(service.href));
          const Icon = service.icon;

          return (
            <div key={service.name}>
              {showCategory && (
                <div
                  className="text-xs font-semibold uppercase tracking-wider px-3 pt-4 pb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {service.category}
                </div>
              )}
              <Link
                href={service.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
                style={{
                  background: isActive ? "var(--bg-tertiary)" : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                <Icon className="w-4 h-4" />
                {service.name}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
