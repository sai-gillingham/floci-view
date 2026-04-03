"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Users, Shield, RefreshCw } from "lucide-react";

interface UserPool {
  Id: string;
  Name: string;
  CreationDate: string;
  LastModifiedDate: string;
}

interface UserPoolDetail {
  Id: string;
  Name: string;
  EstimatedNumberOfUsers: number;
  MfaConfiguration: string;
  Status: string;
  CreationDate: string;
}

interface CognitoUser {
  Username: string;
  UserStatus: string;
  Enabled: boolean;
  UserCreateDate: string;
  Attributes?: { Name: string; Value: string }[];
}

export default function CognitoPage() {
  const [userPools, setUserPools] = useState<UserPool[]>([]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [poolDetail, setPoolDetail] = useState<UserPoolDetail | null>(null);
  const [users, setUsers] = useState<CognitoUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserPools();
  }, []);

  useEffect(() => {
    if (selectedPool) {
      fetchPoolDetail(selectedPool);
      fetchUsers(selectedPool);
    }
  }, [selectedPool]);

  const fetchUserPools = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cognito/user-pools");
      const data = await res.json();
      setUserPools(data.userPools ?? []);
    } catch {}
    setLoading(false);
  };

  const fetchPoolDetail = async (poolId: string) => {
    try {
      const res = await fetch(`/api/cognito/user-pools/${poolId}`);
      const data = await res.json();
      setPoolDetail(data.userPool ?? null);
    } catch {}
  };

  const fetchUsers = async (poolId: string) => {
    try {
      const res = await fetch(`/api/cognito/user-pools/${poolId}/users`);
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {}
  };

  const getEmail = (user: CognitoUser) => {
    return user.Attributes?.find((a) => a.Name === "email")?.Value ?? "-";
  };

  return (
    <div>
      <PageHeader title="Cognito User Pools" description="Identity and Access Management">
        <button
          onClick={fetchUserPools}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </PageHeader>

      <div className="flex h-[calc(100vh-73px)]">
        <div className="w-72 border-r overflow-y-auto p-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: "var(--text-secondary)" }}>
            User Pools ({userPools.length})
          </div>
          {loading && <div className="text-sm animate-pulse" style={{ color: "var(--text-secondary)" }}>Loading...</div>}
          {userPools.map((pool) => (
            <button
              key={pool.Id}
              onClick={() => setSelectedPool(pool.Id)}
              className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 mb-1 transition-colors"
              style={{
                background: selectedPool === pool.Id ? "var(--bg-tertiary)" : "transparent",
                color: selectedPool === pool.Id ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span className="truncate">{pool.Name}</span>
            </button>
          ))}
          {!loading && userPools.length === 0 && (
            <p className="text-sm px-3" style={{ color: "var(--text-secondary)" }}>No user pools found</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedPool && (
            <div className="flex items-center justify-center h-full" style={{ color: "var(--text-secondary)" }}>
              Select a user pool to view details
            </div>
          )}

          {selectedPool && poolDetail && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="rounded-lg border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
                  <div className="text-xs font-medium uppercase mb-1" style={{ color: "var(--text-secondary)" }}>Users</div>
                  <p className="text-2xl font-bold">{poolDetail.EstimatedNumberOfUsers ?? 0}</p>
                </div>
                <div className="rounded-lg border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
                  <div className="text-xs font-medium uppercase mb-1" style={{ color: "var(--text-secondary)" }}>MFA</div>
                  <p className="text-lg font-semibold">{poolDetail.MfaConfiguration ?? "OFF"}</p>
                </div>
                <div className="rounded-lg border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
                  <div className="text-xs font-medium uppercase mb-1" style={{ color: "var(--text-secondary)" }}>Status</div>
                  <StatusBadge status={poolDetail.Status ?? "available"} />
                </div>
              </div>

              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>Users</h2>
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--bg-tertiary)" }}>
                      <th className="text-left px-4 py-2 font-medium">Username</th>
                      <th className="text-left px-4 py-2 font-medium">Email</th>
                      <th className="text-left px-4 py-2 font-medium">Status</th>
                      <th className="text-left px-4 py-2 font-medium">Enabled</th>
                      <th className="text-right px-4 py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.Username} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-2 flex items-center gap-2">
                          <Users className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                          {user.Username}
                        </td>
                        <td className="px-4 py-2" style={{ color: "var(--text-secondary)" }}>
                          {getEmail(user)}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={user.UserStatus ?? "unknown"} />
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded"
                            style={{
                              background: user.Enabled ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                              color: user.Enabled ? "var(--success)" : "var(--error)",
                            }}
                          >
                            {user.Enabled ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--text-secondary)" }}>
                          {new Date(user.UserCreateDate).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                          No users found
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
