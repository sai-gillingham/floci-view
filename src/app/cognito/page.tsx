"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  AppWindow,
  Ban,
  CheckCircle,
  Edit3,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface UserPool {
  Id?: string;
  Name?: string;
  CreationDate?: string;
  LastModifiedDate?: string;
}

interface UserPoolDetail {
  Id?: string;
  Name?: string;
  EstimatedNumberOfUsers?: number;
  MfaConfiguration?: string;
  Status?: string;
  CreationDate?: string;
  DeletionProtection?: string;
  AutoVerifiedAttributes?: string[];
}

interface CognitoUser {
  Username?: string;
  UserStatus?: string;
  Enabled?: boolean;
  UserCreateDate?: string;
  Attributes?: { Name?: string; Value?: string }[];
}

interface CognitoGroup {
  GroupName?: string;
  Description?: string;
  RoleArn?: string;
  Precedence?: number;
  CreationDate?: string;
}

interface UserPoolClient {
  ClientId?: string;
  ClientName?: string;
  CreationDate?: string;
  LastModifiedDate?: string;
  GenerateSecret?: boolean;
  RefreshTokenValidity?: number;
  AccessTokenValidity?: number;
  IdTokenValidity?: number;
  ExplicitAuthFlows?: string[];
  SupportedIdentityProviders?: string[];
  CallbackURLs?: string[];
  LogoutURLs?: string[];
  AllowedOAuthFlows?: string[];
  AllowedOAuthScopes?: string[];
  AllowedOAuthFlowsUserPoolClient?: boolean;
  PreventUserExistenceErrors?: string;
  EnableTokenRevocation?: boolean;
}

interface ResourceServer {
  Identifier?: string;
  Name?: string;
  Scopes?: Array<{ ScopeName?: string; ScopeDescription?: string }>;
}

type ToastKind = "success" | "error";
type CognitoTab = "users" | "groups" | "clients" | "resources" | "settings";

const controlStyle: CSSProperties = {
  background: "var(--bg-primary)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

const mutedTextStyle: CSSProperties = { color: "var(--text-secondary)" };

const inputClass =
  "h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]";
const textareaClass =
  "min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]";
const textButtonClass =
  "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const TABS: Array<{ value: CognitoTab; label: string; icon: typeof Users }> = [
  { value: "users", label: "Members", icon: Users },
  { value: "groups", label: "Groups", icon: Shield },
  { value: "clients", label: "Clients", icon: AppWindow },
  { value: "resources", label: "Resources", icon: Server },
  { value: "settings", label: "Pool", icon: Settings },
];

const AUTH_FLOWS = [
  "ALLOW_USER_SRP_AUTH",
  "ALLOW_USER_PASSWORD_AUTH",
  "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  "ALLOW_REFRESH_TOKEN_AUTH",
  "ALLOW_CUSTOM_AUTH",
];

const OAUTH_FLOWS = ["code", "implicit", "client_credentials"];

const initialCreatePoolForm = {
  name: "",
  deletionProtection: false,
  autoVerifyEmail: true,
  autoVerifyPhone: false,
};

const initialPoolSettingsForm = {
  name: "",
  deletionProtection: false,
  mfaConfiguration: "OFF",
  autoVerifyEmail: false,
  autoVerifyPhone: false,
};

const initialUserForm = {
  username: "",
  email: "",
  phoneNumber: "",
  temporaryPassword: "",
  password: "",
  permanent: true,
  enabled: true,
  suppressInvite: false,
};

const initialGroupForm = {
  groupName: "",
  description: "",
  roleArn: "",
  precedence: "",
};

const initialClientForm = {
  clientName: "",
  generateSecret: false,
  refreshTokenValidity: "30",
  accessTokenValidity: "1",
  idTokenValidity: "1",
  explicitAuthFlows: ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"],
  supportedIdentityProviders: "COGNITO",
  callbackUrls: "",
  logoutUrls: "",
  allowedOAuthFlows: ["code"],
  allowedOAuthScopes: "openid,email,profile",
  allowedOAuthFlowsUserPoolClient: true,
  preventUserExistenceErrors: "ENABLED",
  enableTokenRevocation: true,
};

const initialResourceForm = {
  identifier: "",
  name: "",
  scopes: "",
};

async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data ? String(data.error) : "Request failed";
    throw new Error(message);
  }

  return data as T;
}

function formatDateTime(value?: string) {
  if (!value) return "-";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getAttribute(user: CognitoUser, name: string) {
  return user.Attributes?.find((attribute) => attribute.Name === name)?.Value ?? "";
}

function parseScopes(value: string) {
  return value
    .split("\n")
    .map((line) => {
      const [name, ...description] = line.split(":");
      return {
        ScopeName: name?.trim() ?? "",
        ScopeDescription: description.join(":").trim(),
      };
    })
    .filter((scope) => scope.ScopeName);
}

function scopesToText(scopes?: ResourceServer["Scopes"]) {
  return (scopes ?? [])
    .map((scope) => `${scope.ScopeName ?? ""}: ${scope.ScopeDescription ?? ""}`.trim())
    .join("\n");
}

function listToText(items?: string[]) {
  return (items ?? []).join(",");
}

function encodePath(value: string) {
  return encodeURIComponent(value);
}

export default function CognitoPage() {
  const [userPools, setUserPools] = useState<UserPool[]>([]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [poolDetail, setPoolDetail] = useState<UserPoolDetail | null>(null);
  const [users, setUsers] = useState<CognitoUser[]>([]);
  const [groups, setGroups] = useState<CognitoGroup[]>([]);
  const [clients, setClients] = useState<UserPoolClient[]>([]);
  const [resourceServers, setResourceServers] = useState<ResourceServer[]>([]);
  const [activeTab, setActiveTab] = useState<CognitoTab>("users");
  const [loadingPools, setLoadingPools] = useState(true);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);

  /** Bumps on each full pool-panel load so stale in-flight fetches cannot overwrite state after pool switch. */
  const poolDataRequestIdRef = useRef(0);

  const [createPoolForm, setCreatePoolForm] = useState(initialCreatePoolForm);
  const [userForm, setUserForm] = useState(initialUserForm);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState(initialGroupForm);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<CognitoUser[]>([]);
  const [memberInput, setMemberInput] = useState("");
  const [clientForm, setClientForm] = useState(initialClientForm);
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [resourceForm, setResourceForm] = useState(initialResourceForm);
  const [editingResource, setEditingResource] = useState<string | null>(null);

  const poolSettingsFromPoolDetail = useMemo(
    () =>
      poolDetail
        ? {
            name: poolDetail.Name ?? "",
            deletionProtection: poolDetail.DeletionProtection === "ACTIVE",
            mfaConfiguration: poolDetail.MfaConfiguration ?? "OFF",
            autoVerifyEmail: Boolean(poolDetail.AutoVerifiedAttributes?.includes("email")),
            autoVerifyPhone: Boolean(poolDetail.AutoVerifiedAttributes?.includes("phone_number")),
          }
        : initialPoolSettingsForm,
    [poolDetail],
  );

  const poolSettingsFromPoolDetailKey = useMemo(
    () => JSON.stringify(poolSettingsFromPoolDetail),
    [poolSettingsFromPoolDetail],
  );

  const [poolSettingsForm, setPoolSettingsForm] = useState(initialPoolSettingsForm);
  const poolSettingsSourceKeyRef = useRef<string | null>(null);
  if (poolSettingsFromPoolDetailKey !== poolSettingsSourceKeyRef.current) {
    poolSettingsSourceKeyRef.current = poolSettingsFromPoolDetailKey;
    setPoolSettingsForm(poolSettingsFromPoolDetail);
  }

  const selectedPoolPath = selectedPool ? encodePath(selectedPool) : "";

  const setSuccess = useCallback((message: string) => setToast({ kind: "success", message }), []);
  const setError = useCallback((message: string) => setToast({ kind: "error", message }), []);

  const selectedPoolName = useMemo(
    () => userPools.find((pool) => pool.Id === selectedPool)?.Name ?? poolDetail?.Name ?? selectedPool,
    [poolDetail?.Name, selectedPool, userPools],
  );

  const refreshUserPools = useCallback(async () => {
    setLoadingPools(true);
    setToast(null);

    try {
      const data = await responseJson<{ userPools?: UserPool[] }>(await fetch("/api/cognito/user-pools"));
      setUserPools(data.userPools ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setUserPools([]);
    } finally {
      setLoadingPools(false);
    }
  }, [setError]);

  const fetchPoolDetail = useCallback(async (poolId: string, requestId?: number) => {
    const data = await responseJson<{ userPool?: UserPoolDetail | null }>(
      await fetch(`/api/cognito/user-pools/${encodePath(poolId)}`),
    );
    if (requestId !== undefined && requestId !== poolDataRequestIdRef.current) return;
    setPoolDetail(data.userPool ?? null);
  }, []);

  const fetchUsers = useCallback(async (poolId: string, requestId?: number) => {
    const data = await responseJson<{ users?: CognitoUser[] }>(
      await fetch(`/api/cognito/user-pools/${encodePath(poolId)}/users`),
    );
    if (requestId !== undefined && requestId !== poolDataRequestIdRef.current) return;
    setUsers(data.users ?? []);
  }, []);

  const fetchGroups = useCallback(async (poolId: string, requestId?: number) => {
    const data = await responseJson<{ groups?: CognitoGroup[] }>(
      await fetch(`/api/cognito/user-pools/${encodePath(poolId)}/groups`),
    );
    if (requestId !== undefined && requestId !== poolDataRequestIdRef.current) return;
    setGroups(data.groups ?? []);
  }, []);

  const fetchClients = useCallback(async (poolId: string, requestId?: number) => {
    const data = await responseJson<{ clients?: UserPoolClient[] }>(
      await fetch(`/api/cognito/user-pools/${encodePath(poolId)}/clients`),
    );
    if (requestId !== undefined && requestId !== poolDataRequestIdRef.current) return;
    setClients(data.clients ?? []);
  }, []);

  const fetchResourceServers = useCallback(async (poolId: string, requestId?: number) => {
    const data = await responseJson<{ resourceServers?: ResourceServer[] }>(
      await fetch(`/api/cognito/user-pools/${encodePath(poolId)}/resource-servers`),
    );
    if (requestId !== undefined && requestId !== poolDataRequestIdRef.current) return;
    setResourceServers(data.resourceServers ?? []);
  }, []);

  const fetchSelectedPoolData = useCallback(
    async (poolId: string) => {
      const requestId = ++poolDataRequestIdRef.current;
      setLoadingPanel(true);
      setToast(null);

      try {
        await Promise.all([
          fetchPoolDetail(poolId, requestId),
          fetchUsers(poolId, requestId),
          fetchGroups(poolId, requestId),
          fetchClients(poolId, requestId),
          fetchResourceServers(poolId, requestId),
        ]);
      } catch (error) {
        if (requestId !== poolDataRequestIdRef.current) return;
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        if (requestId === poolDataRequestIdRef.current) {
          setLoadingPanel(false);
        }
      }
    },
    [fetchClients, fetchGroups, fetchPoolDetail, fetchResourceServers, fetchUsers, setError],
  );

  const fetchGroupMembers = useCallback(
    async (poolId: string, groupName: string) => {
      try {
        const data = await responseJson<{ users?: CognitoUser[] }>(
          await fetch(`/api/cognito/user-pools/${encodePath(poolId)}/groups/${encodePath(groupName)}/members`),
        );
        setGroupMembers(data.users ?? []);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
        setGroupMembers([]);
      }
    },
    [setError],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshUserPools();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshUserPools]);

  useEffect(() => {
    setSelectedGroup(null);
    setGroupMembers([]);
    setMemberInput("");
    setEditingUser(null);
    setEditingGroup(null);
    setEditingClient(null);
    setEditingResource(null);
    setUserForm(initialUserForm);
    setGroupForm(initialGroupForm);
    setClientForm(initialClientForm);
    setResourceForm(initialResourceForm);

    if (!selectedPool) return;

    const timer = setTimeout(() => {
      void fetchSelectedPoolData(selectedPool);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchSelectedPoolData, selectedPool]);

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setToast(null);

      try {
        await action();
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [busy, setError],
  );

  const createPool = (event: FormEvent) => {
    event.preventDefault();
    void runAction(async () => {
      const data = await responseJson<{ userPool?: UserPool }>(
        await fetch("/api/cognito/user-pools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createPoolForm),
        }),
      );
      await refreshUserPools();
      setCreatePoolForm(initialCreatePoolForm);
      if (data.userPool?.Id) setSelectedPool(data.userPool.Id);
      setSuccess("User pool created");
    });
  };

  const savePoolSettings = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPool) return;

    void runAction(async () => {
      const data = await responseJson<{ userPool?: UserPoolDetail | null }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(poolSettingsForm),
        }),
      );
      setPoolDetail(data.userPool ?? null);
      await refreshUserPools();
      setSuccess("User pool updated");
    });
  };

  const deletePool = () => {
    if (!selectedPool || !window.confirm(`Delete user pool ${selectedPoolName}?`)) return;

    void runAction(async () => {
      await responseJson<{ ok: boolean }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}`, { method: "DELETE" }),
      );
      setSelectedPool(null);
      setPoolDetail(null);
      await refreshUserPools();
      setSuccess("User pool deleted");
    });
  };

  const saveUser = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPool) return;

    void runAction(async () => {
      const path = `/api/cognito/user-pools/${selectedPoolPath}/users`;
      if (editingUser) {
        await responseJson<{ user?: CognitoUser }>(
          await fetch(`${path}/${encodePath(editingUser)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userForm),
          }),
        );
        setSuccess("Member updated");
      } else {
        await responseJson<{ user?: CognitoUser }>(
          await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(userForm),
          }),
        );
        setSuccess("Member created");
      }

      setUserForm(initialUserForm);
      setEditingUser(null);
      await fetchUsers(selectedPool);
    });
  };

  const editUser = (user: CognitoUser) => {
    const username = user.Username ?? "";
    setEditingUser(username);
    setUserForm({
      ...initialUserForm,
      username,
      email: getAttribute(user, "email"),
      phoneNumber: getAttribute(user, "phone_number"),
      enabled: user.Enabled !== false,
    });
  };

  const updateUserEnabled = (user: CognitoUser, enabled: boolean) => {
    const username = user.Username;
    if (!selectedPool || !username) return;

    void runAction(async () => {
      await responseJson<{ user?: CognitoUser }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}/users/${encodePath(username)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        }),
      );
      await fetchUsers(selectedPool);
      setSuccess(enabled ? "Member enabled" : "Member disabled");
    });
  };

  const resetPassword = (user: CognitoUser) => {
    const username = user.Username;
    if (!selectedPool || !username) return;

    void runAction(async () => {
      await responseJson<{ ok: boolean }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}/users/${encodePath(username)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reset-password" }),
        }),
      );
      await fetchUsers(selectedPool);
      setSuccess("Forgot-password reset started");
    });
  };

  const deleteUser = (user: CognitoUser) => {
    const username = user.Username;
    if (!selectedPool || !username || !window.confirm(`Delete member ${username}?`)) return;

    void runAction(async () => {
      await responseJson<{ ok: boolean }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}/users/${encodePath(username)}`, {
          method: "DELETE",
        }),
      );
      await fetchUsers(selectedPool);
      setSuccess("Member deleted");
    });
  };

  const saveGroup = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPool) return;

    void runAction(async () => {
      const payload = {
        groupName: groupForm.groupName,
        description: groupForm.description,
        roleArn: groupForm.roleArn,
        precedence: groupForm.precedence,
      };
      const path = `/api/cognito/user-pools/${selectedPoolPath}/groups`;
      if (editingGroup) {
        await responseJson<{ group?: CognitoGroup }>(
          await fetch(`${path}/${encodePath(editingGroup)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        setSuccess("Group updated");
      } else {
        await responseJson<{ group?: CognitoGroup }>(
          await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        setSuccess("Group created");
      }

      setGroupForm(initialGroupForm);
      setEditingGroup(null);
      await fetchGroups(selectedPool);
    });
  };

  const editGroup = (group: CognitoGroup) => {
    setEditingGroup(group.GroupName ?? "");
    setGroupForm({
      groupName: group.GroupName ?? "",
      description: group.Description ?? "",
      roleArn: group.RoleArn ?? "",
      precedence: group.Precedence === undefined ? "" : String(group.Precedence),
    });
  };

  const deleteGroup = (group: CognitoGroup) => {
    const groupName = group.GroupName;
    if (!selectedPool || !groupName || !window.confirm(`Delete group ${groupName}?`)) return;

    void runAction(async () => {
      await responseJson<{ ok: boolean }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}/groups/${encodePath(groupName)}`, {
          method: "DELETE",
        }),
      );
      if (selectedGroup === groupName) {
        setSelectedGroup(null);
        setGroupMembers([]);
      }
      await fetchGroups(selectedPool);
      setSuccess("Group deleted");
    });
  };

  const selectGroupMembers = (groupName: string) => {
    if (!selectedPool) return;
    setSelectedGroup(groupName);
    void fetchGroupMembers(selectedPool, groupName);
  };

  const addGroupMember = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPool || !selectedGroup) return;

    void runAction(async () => {
      await responseJson<{ ok: boolean }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}/groups/${encodePath(selectedGroup)}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: memberInput }),
        }),
      );
      setMemberInput("");
      await fetchGroupMembers(selectedPool, selectedGroup);
      setSuccess("Member added to group");
    });
  };

  const removeGroupMember = (user: CognitoUser) => {
    const username = user.Username;
    if (!selectedPool || !selectedGroup || !username) return;

    void runAction(async () => {
      await responseJson<{ ok: boolean }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}/groups/${encodePath(selectedGroup)}/members`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        }),
      );
      await fetchGroupMembers(selectedPool, selectedGroup);
      setSuccess("Member removed from group");
    });
  };

  const toggleClientArrayValue = (key: "explicitAuthFlows" | "allowedOAuthFlows", value: string) => {
    setClientForm((current) => {
      const set = new Set(current[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return { ...current, [key]: Array.from(set) };
    });
  };

  const saveClient = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPool) return;

    void runAction(async () => {
      const path = `/api/cognito/user-pools/${selectedPoolPath}/clients`;
      if (editingClient) {
        await responseJson<{ client?: UserPoolClient }>(
          await fetch(`${path}/${encodePath(editingClient)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(clientForm),
          }),
        );
        setSuccess("User pool client updated");
      } else {
        await responseJson<{ client?: UserPoolClient }>(
          await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(clientForm),
          }),
        );
        setSuccess("User pool client created");
      }

      setClientForm(initialClientForm);
      setEditingClient(null);
      await fetchClients(selectedPool);
    });
  };

  const editClient = (client: UserPoolClient) => {
    const clientId = client.ClientId;
    if (!selectedPool || !clientId) return;

    void runAction(async () => {
      const data = await responseJson<{ client?: UserPoolClient | null }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}/clients/${encodePath(clientId)}`),
      );
      const detail = data.client ?? client;
      setEditingClient(detail.ClientId ?? "");
      setClientForm({
        clientName: detail.ClientName ?? "",
        generateSecret: false,
        refreshTokenValidity: String(detail.RefreshTokenValidity ?? 30),
        accessTokenValidity: String(detail.AccessTokenValidity ?? 1),
        idTokenValidity: String(detail.IdTokenValidity ?? 1),
        explicitAuthFlows: detail.ExplicitAuthFlows ?? initialClientForm.explicitAuthFlows,
        supportedIdentityProviders: listToText(detail.SupportedIdentityProviders ?? ["COGNITO"]),
        callbackUrls: listToText(detail.CallbackURLs),
        logoutUrls: listToText(detail.LogoutURLs),
        allowedOAuthFlows: detail.AllowedOAuthFlows ?? [],
        allowedOAuthScopes: listToText(detail.AllowedOAuthScopes),
        allowedOAuthFlowsUserPoolClient: detail.AllowedOAuthFlowsUserPoolClient ?? false,
        preventUserExistenceErrors: detail.PreventUserExistenceErrors ?? "ENABLED",
        enableTokenRevocation: detail.EnableTokenRevocation ?? true,
      });
    });
  };

  const deleteClient = (client: UserPoolClient) => {
    const clientId = client.ClientId;
    if (!selectedPool || !clientId || !window.confirm(`Delete client ${client.ClientName ?? clientId}?`)) return;

    void runAction(async () => {
      await responseJson<{ ok: boolean }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}/clients/${encodePath(clientId)}`, {
          method: "DELETE",
        }),
      );
      await fetchClients(selectedPool);
      setSuccess("User pool client deleted");
    });
  };

  const saveResourceServer = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPool) return;

    void runAction(async () => {
      const payload = {
        identifier: resourceForm.identifier,
        name: resourceForm.name,
        scopes: parseScopes(resourceForm.scopes),
      };
      const path = `/api/cognito/user-pools/${selectedPoolPath}/resource-servers`;
      if (editingResource) {
        await responseJson<{ resourceServer?: ResourceServer }>(
          await fetch(`${path}/${encodePath(editingResource)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        setSuccess("Resource server updated");
      } else {
        await responseJson<{ resourceServer?: ResourceServer }>(
          await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        setSuccess("Resource server created");
      }

      setResourceForm(initialResourceForm);
      setEditingResource(null);
      await fetchResourceServers(selectedPool);
    });
  };

  const editResourceServer = (server: ResourceServer) => {
    setEditingResource(server.Identifier ?? "");
    setResourceForm({
      identifier: server.Identifier ?? "",
      name: server.Name ?? "",
      scopes: scopesToText(server.Scopes),
    });
  };

  const deleteResourceServer = (server: ResourceServer) => {
    const identifier = server.Identifier;
    if (!selectedPool || !identifier || !window.confirm(`Delete resource server ${identifier}?`)) return;

    void runAction(async () => {
      await responseJson<{ ok: boolean }>(
        await fetch(`/api/cognito/user-pools/${selectedPoolPath}/resource-servers/${encodePath(identifier)}`, {
          method: "DELETE",
        }),
      );
      await fetchResourceServers(selectedPool);
      setSuccess("Resource server deleted");
    });
  };

  return (
    <div>
      <PageHeader title="Cognito User Pools" description="Identity and Access Management">
        <button
          onClick={refreshUserPools}
          className={textButtonClass}
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          disabled={loadingPools || busy}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </PageHeader>

      <div className="flex h-[calc(100vh-73px)]">
        <aside className="w-80 shrink-0 overflow-y-auto border-r p-3" style={{ borderColor: "var(--border)" }}>
          <form onSubmit={createPool} className="mb-4 rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase" style={mutedTextStyle}>
                Add User Pool
              </div>
              <Plus className="h-4 w-4" style={mutedTextStyle} />
            </div>
            <input
              aria-label="User pool name"
              value={createPoolForm.name}
              onChange={(event) => setCreatePoolForm((current) => ({ ...current, name: event.target.value }))}
              className={`${inputClass} mb-2`}
              style={controlStyle}
              placeholder="Pool name"
            />
            <label className="mb-2 flex items-center gap-2 text-xs" style={mutedTextStyle}>
              <input
                type="checkbox"
                checked={createPoolForm.autoVerifyEmail}
                onChange={(event) =>
                  setCreatePoolForm((current) => ({ ...current, autoVerifyEmail: event.target.checked }))
                }
              />
              Auto-verify email
            </label>
            <label className="mb-2 flex items-center gap-2 text-xs" style={mutedTextStyle}>
              <input
                type="checkbox"
                checked={createPoolForm.deletionProtection}
                onChange={(event) =>
                  setCreatePoolForm((current) => ({ ...current, deletionProtection: event.target.checked }))
                }
              />
              Deletion protection
            </label>
            <button type="submit" className={textButtonClass} style={controlStyle} disabled={busy}>
              <Plus className="h-3.5 w-3.5" /> Create
            </button>
          </form>

          <div className="mb-2 text-xs font-semibold uppercase" style={mutedTextStyle}>
            User Pools ({userPools.length})
          </div>
          {loadingPools && (
            <div className="text-sm animate-pulse" style={mutedTextStyle}>
              Loading...
            </div>
          )}
          {userPools.map((pool) => (
            <button
              key={pool.Id}
              onClick={() => pool.Id && setSelectedPool(pool.Id)}
              className="mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
              style={{
                background: selectedPool === pool.Id ? "var(--bg-tertiary)" : "transparent",
                color: selectedPool === pool.Id ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span className="truncate">{pool.Name ?? pool.Id}</span>
            </button>
          ))}
          {!loadingPools && userPools.length === 0 && (
            <p className="px-3 text-sm" style={mutedTextStyle}>
              No user pools found
            </p>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto p-4">
          {!selectedPool && (
            <div className="flex h-full items-center justify-center" style={mutedTextStyle}>
              Select a user pool to manage Cognito resources
            </div>
          )}

          {selectedPool && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-semibold">{selectedPoolName}</h1>
                  <p className="font-mono text-xs" style={mutedTextStyle}>
                    {selectedPool}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void fetchSelectedPoolData(selectedPool)}
                    className={textButtonClass}
                    style={controlStyle}
                    disabled={loadingPanel || busy}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reload Pool
                  </button>
                </div>
              </div>

              {toast && (
                <div
                  className="mb-4 rounded-md border px-3 py-2 text-sm"
                  style={{
                    borderColor: toast.kind === "success" ? "var(--success)" : "var(--error)",
                    color: toast.kind === "success" ? "var(--success)" : "var(--error)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  {toast.message}
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatCard label="Members" value={String(users.length || poolDetail?.EstimatedNumberOfUsers || 0)} />
                <StatCard label="Groups" value={String(groups.length)} />
                <StatCard label="Clients" value={String(clients.length)} />
                <StatCard label="Resources" value={String(resourceServers.length)} />
                <div className="rounded-md border p-3" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
                  <div className="mb-1 text-xs font-medium uppercase" style={mutedTextStyle}>
                    Status
                  </div>
                  <StatusBadge status={poolDetail?.Status ?? "available"} />
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2 border-b pb-3" style={{ borderColor: "var(--border)" }}>
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className={textButtonClass}
                      style={{
                        ...controlStyle,
                        background: activeTab === tab.value ? "var(--bg-tertiary)" : "var(--bg-primary)",
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" /> {tab.label}
                    </button>
                  );
                })}
              </div>

              {loadingPanel && (
                <div className="py-6 text-sm animate-pulse" style={mutedTextStyle}>
                  Loading Cognito resources...
                </div>
              )}

              {!loadingPanel && activeTab === "users" && (
                <section>
                  <form onSubmit={saveUser} className="mb-5 grid gap-3 rounded-md border p-4 lg:grid-cols-6" style={{ borderColor: "var(--border)" }}>
                    <div className="lg:col-span-2">
                      <FormLabel label="Username" />
                      <input
                        value={userForm.username}
                        onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))}
                        className={inputClass}
                        style={controlStyle}
                        disabled={Boolean(editingUser)}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <FormLabel label="Email" />
                      <input
                        value={userForm.email}
                        onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
                        className={inputClass}
                        style={controlStyle}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <FormLabel label="Phone" />
                      <input
                        value={userForm.phoneNumber}
                        onChange={(event) => setUserForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                        className={inputClass}
                        style={controlStyle}
                      />
                    </div>
                    {!editingUser && (
                      <div className="lg:col-span-2">
                        <FormLabel label="Temporary password" />
                        <input
                          type="password"
                          value={userForm.temporaryPassword}
                          onChange={(event) =>
                            setUserForm((current) => ({ ...current, temporaryPassword: event.target.value }))
                          }
                          className={inputClass}
                          style={controlStyle}
                        />
                      </div>
                    )}
                    {editingUser && (
                      <div className="lg:col-span-2">
                        <FormLabel label="New password" />
                        <input
                          type="password"
                          value={userForm.password}
                          onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                          className={inputClass}
                          style={controlStyle}
                        />
                      </div>
                    )}
                    <div className="flex items-end gap-4 lg:col-span-2">
                      <label className="flex h-9 items-center gap-2 text-sm" style={mutedTextStyle}>
                        <input
                          type="checkbox"
                          checked={userForm.enabled}
                          onChange={(event) => setUserForm((current) => ({ ...current, enabled: event.target.checked }))}
                        />
                        Enabled
                      </label>
                      {editingUser ? (
                        <label className="flex h-9 items-center gap-2 text-sm" style={mutedTextStyle}>
                          <input
                            type="checkbox"
                            checked={userForm.permanent}
                            onChange={(event) =>
                              setUserForm((current) => ({ ...current, permanent: event.target.checked }))
                            }
                          />
                          Permanent password
                        </label>
                      ) : (
                        <label className="flex h-9 items-center gap-2 text-sm" style={mutedTextStyle}>
                          <input
                            type="checkbox"
                            checked={userForm.suppressInvite}
                            onChange={(event) =>
                              setUserForm((current) => ({ ...current, suppressInvite: event.target.checked }))
                            }
                          />
                          Suppress invite
                        </label>
                      )}
                    </div>
                    <div className="flex items-end gap-2 lg:col-span-2">
                      <button type="submit" className={textButtonClass} style={controlStyle} disabled={busy}>
                        <Save className="h-3.5 w-3.5" /> {editingUser ? "Update Member" : "Add Member"}
                      </button>
                      {editingUser && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(null);
                            setUserForm(initialUserForm);
                          }}
                          className={iconButtonClass}
                          style={controlStyle}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </form>

                  <DataTable
                    headers={["Username", "Email", "Status", "Enabled", "Created", "Actions"]}
                    empty="No members found"
                    colSpan={6}
                  >
                    {users.map((user) => (
                      <tr key={user.Username} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-2">
                            <Users className="h-4 w-4" style={mutedTextStyle} />
                            <span className="break-all">{user.Username}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2" style={mutedTextStyle}>
                          {getAttribute(user, "email") || "-"}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={user.UserStatus ?? "unknown"} />
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={user.Enabled === false ? "disabled" : "enabled"} />
                        </td>
                        <td className="px-4 py-2" style={mutedTextStyle}>
                          {formatDateTime(user.UserCreateDate)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-2">
                            <IconAction label="Edit member" onClick={() => editUser(user)} icon={Edit3} disabled={busy} />
                            <IconAction label="Reset password" onClick={() => resetPassword(user)} icon={KeyRound} disabled={busy} />
                            <IconAction
                              label={user.Enabled === false ? "Enable member" : "Disable member"}
                              onClick={() => updateUserEnabled(user, user.Enabled === false)}
                              icon={user.Enabled === false ? CheckCircle : Ban}
                              disabled={busy}
                            />
                            <IconAction label="Delete member" onClick={() => deleteUser(user)} icon={Trash2} danger disabled={busy} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </section>
              )}

              {!loadingPanel && activeTab === "groups" && (
                <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div>
                    <form onSubmit={saveGroup} className="mb-5 grid gap-3 rounded-md border p-4 lg:grid-cols-6" style={{ borderColor: "var(--border)" }}>
                      <div className="lg:col-span-2">
                        <FormLabel label="Group name" />
                        <input
                          value={groupForm.groupName}
                          onChange={(event) => setGroupForm((current) => ({ ...current, groupName: event.target.value }))}
                          className={inputClass}
                          style={controlStyle}
                          disabled={Boolean(editingGroup)}
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <FormLabel label="Description" />
                        <input
                          value={groupForm.description}
                          onChange={(event) => setGroupForm((current) => ({ ...current, description: event.target.value }))}
                          className={inputClass}
                          style={controlStyle}
                        />
                      </div>
                      <div>
                        <FormLabel label="Precedence" />
                        <input
                          value={groupForm.precedence}
                          onChange={(event) => setGroupForm((current) => ({ ...current, precedence: event.target.value }))}
                          className={inputClass}
                          style={controlStyle}
                          inputMode="numeric"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <button type="submit" className={textButtonClass} style={controlStyle} disabled={busy}>
                          <Save className="h-3.5 w-3.5" /> {editingGroup ? "Update" : "Add"}
                        </button>
                        {editingGroup && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGroup(null);
                              setGroupForm(initialGroupForm);
                            }}
                            className={iconButtonClass}
                            style={controlStyle}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="lg:col-span-6">
                        <FormLabel label="Role ARN" />
                        <input
                          value={groupForm.roleArn}
                          onChange={(event) => setGroupForm((current) => ({ ...current, roleArn: event.target.value }))}
                          className={inputClass}
                          style={controlStyle}
                        />
                      </div>
                    </form>

                    <DataTable headers={["Group", "Description", "Precedence", "Members", "Actions"]} empty="No groups found" colSpan={5}>
                      {groups.map((group) => (
                        <tr key={group.GroupName} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-4 py-2">{group.GroupName}</td>
                          <td className="px-4 py-2" style={mutedTextStyle}>
                            {group.Description || "-"}
                          </td>
                          <td className="px-4 py-2" style={mutedTextStyle}>
                            {group.Precedence ?? "-"}
                          </td>
                          <td className="px-4 py-2">
                            <button
                              className={textButtonClass}
                              style={controlStyle}
                              onClick={() => group.GroupName && selectGroupMembers(group.GroupName)}
                            >
                              <Users className="h-3.5 w-3.5" /> Manage
                            </button>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-2">
                              <IconAction label="Edit group" onClick={() => editGroup(group)} icon={Edit3} disabled={busy} />
                              <IconAction label="Delete group" onClick={() => deleteGroup(group)} icon={Trash2} danger disabled={busy} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  </div>

                  <div className="rounded-md border p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold">Group Members</h2>
                      <span className="text-xs" style={mutedTextStyle}>
                        {selectedGroup ?? "No group selected"}
                      </span>
                    </div>
                    {selectedGroup ? (
                      <>
                        <form onSubmit={addGroupMember} className="mb-3 flex gap-2">
                          <input
                            value={memberInput}
                            onChange={(event) => setMemberInput(event.target.value)}
                            className={inputClass}
                            style={controlStyle}
                            placeholder="Username"
                          />
                          <button className={iconButtonClass} style={controlStyle} disabled={busy}>
                            <UserPlus className="h-3.5 w-3.5" />
                          </button>
                        </form>
                        <div className="space-y-2">
                          {groupMembers.map((user) => (
                            <div
                              key={user.Username}
                              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                              style={{ borderColor: "var(--border)" }}
                            >
                              <span className="truncate">{user.Username}</span>
                              <button
                                className={iconButtonClass}
                                style={controlStyle}
                                onClick={() => removeGroupMember(user)}
                                disabled={busy}
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          {groupMembers.length === 0 && (
                            <p className="text-sm" style={mutedTextStyle}>
                              No members in this group
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm" style={mutedTextStyle}>
                        Select Manage on a group to add or remove members.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {!loadingPanel && activeTab === "clients" && (
                <section>
                  <form onSubmit={saveClient} className="mb-5 grid gap-3 rounded-md border p-4 lg:grid-cols-6" style={{ borderColor: "var(--border)" }}>
                    <div className="lg:col-span-2">
                      <FormLabel label="Client name" />
                      <input
                        value={clientForm.clientName}
                        onChange={(event) => setClientForm((current) => ({ ...current, clientName: event.target.value }))}
                        className={inputClass}
                        style={controlStyle}
                      />
                    </div>
                    <div>
                      <FormLabel label="Refresh days" />
                      <input
                        value={clientForm.refreshTokenValidity}
                        onChange={(event) =>
                          setClientForm((current) => ({ ...current, refreshTokenValidity: event.target.value }))
                        }
                        className={inputClass}
                        style={controlStyle}
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <FormLabel label="Access hours" />
                      <input
                        value={clientForm.accessTokenValidity}
                        onChange={(event) =>
                          setClientForm((current) => ({ ...current, accessTokenValidity: event.target.value }))
                        }
                        className={inputClass}
                        style={controlStyle}
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <FormLabel label="ID hours" />
                      <input
                        value={clientForm.idTokenValidity}
                        onChange={(event) => setClientForm((current) => ({ ...current, idTokenValidity: event.target.value }))}
                        className={inputClass}
                        style={controlStyle}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <button type="submit" className={textButtonClass} style={controlStyle} disabled={busy}>
                        <Save className="h-3.5 w-3.5" /> {editingClient ? "Update" : "Add"}
                      </button>
                      {editingClient && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingClient(null);
                            setClientForm(initialClientForm);
                          }}
                          className={iconButtonClass}
                          style={controlStyle}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="lg:col-span-2">
                      <FormLabel label="Identity providers" />
                      <input
                        value={clientForm.supportedIdentityProviders}
                        onChange={(event) =>
                          setClientForm((current) => ({ ...current, supportedIdentityProviders: event.target.value }))
                        }
                        className={inputClass}
                        style={controlStyle}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <FormLabel label="OAuth scopes" />
                      <input
                        value={clientForm.allowedOAuthScopes}
                        onChange={(event) =>
                          setClientForm((current) => ({ ...current, allowedOAuthScopes: event.target.value }))
                        }
                        className={inputClass}
                        style={controlStyle}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <FormLabel label="Callback URLs" />
                      <input
                        value={clientForm.callbackUrls}
                        onChange={(event) => setClientForm((current) => ({ ...current, callbackUrls: event.target.value }))}
                        className={inputClass}
                        style={controlStyle}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <FormLabel label="Logout URLs" />
                      <input
                        value={clientForm.logoutUrls}
                        onChange={(event) => setClientForm((current) => ({ ...current, logoutUrls: event.target.value }))}
                        className={inputClass}
                        style={controlStyle}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <FormLabel label="OAuth flows" />
                      <div className="flex flex-wrap gap-2">
                        {OAUTH_FLOWS.map((flow) => (
                          <CheckboxPill
                            key={flow}
                            label={flow}
                            checked={clientForm.allowedOAuthFlows.includes(flow)}
                            onChange={() => toggleClientArrayValue("allowedOAuthFlows", flow)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="lg:col-span-4">
                      <FormLabel label="Auth flows" />
                      <div className="flex flex-wrap gap-2">
                        {AUTH_FLOWS.map((flow) => (
                          <CheckboxPill
                            key={flow}
                            label={flow}
                            checked={clientForm.explicitAuthFlows.includes(flow)}
                            onChange={() => toggleClientArrayValue("explicitAuthFlows", flow)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 lg:col-span-2">
                      {!editingClient && (
                        <label className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                          <input
                            type="checkbox"
                            checked={clientForm.generateSecret}
                            onChange={(event) =>
                              setClientForm((current) => ({ ...current, generateSecret: event.target.checked }))
                            }
                          />
                          Generate secret
                        </label>
                      )}
                      <label className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                        <input
                          type="checkbox"
                          checked={clientForm.allowedOAuthFlowsUserPoolClient}
                          onChange={(event) =>
                            setClientForm((current) => ({
                              ...current,
                              allowedOAuthFlowsUserPoolClient: event.target.checked,
                            }))
                          }
                        />
                        Hosted OAuth
                      </label>
                      <label className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                        <input
                          type="checkbox"
                          checked={clientForm.enableTokenRevocation}
                          onChange={(event) =>
                            setClientForm((current) => ({ ...current, enableTokenRevocation: event.target.checked }))
                          }
                        />
                        Token revocation
                      </label>
                    </div>
                  </form>

                  <DataTable headers={["Client", "Client ID", "Created", "Actions"]} empty="No user pool clients found" colSpan={4}>
                    {clients.map((client) => (
                      <tr key={client.ClientId} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-2">{client.ClientName}</td>
                        <td className="px-4 py-2 font-mono text-xs" style={mutedTextStyle}>
                          {client.ClientId}
                        </td>
                        <td className="px-4 py-2" style={mutedTextStyle}>
                          {formatDateTime(client.CreationDate)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-2">
                            <IconAction label="Edit client" onClick={() => editClient(client)} icon={Edit3} disabled={busy} />
                            <IconAction label="Delete client" onClick={() => deleteClient(client)} icon={Trash2} danger disabled={busy} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </section>
              )}

              {!loadingPanel && activeTab === "resources" && (
                <section>
                  <form onSubmit={saveResourceServer} className="mb-5 grid gap-3 rounded-md border p-4 lg:grid-cols-6" style={{ borderColor: "var(--border)" }}>
                    <div className="lg:col-span-2">
                      <FormLabel label="Identifier" />
                      <input
                        value={resourceForm.identifier}
                        onChange={(event) => setResourceForm((current) => ({ ...current, identifier: event.target.value }))}
                        className={inputClass}
                        style={controlStyle}
                        disabled={Boolean(editingResource)}
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <FormLabel label="Name" />
                      <input
                        value={resourceForm.name}
                        onChange={(event) => setResourceForm((current) => ({ ...current, name: event.target.value }))}
                        className={inputClass}
                        style={controlStyle}
                      />
                    </div>
                    <div className="flex items-end gap-2 lg:col-span-2">
                      <button type="submit" className={textButtonClass} style={controlStyle} disabled={busy}>
                        <Save className="h-3.5 w-3.5" /> {editingResource ? "Update" : "Add"}
                      </button>
                      {editingResource && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingResource(null);
                            setResourceForm(initialResourceForm);
                          }}
                          className={iconButtonClass}
                          style={controlStyle}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="lg:col-span-6">
                      <FormLabel label="Scopes" />
                      <textarea
                        value={resourceForm.scopes}
                        onChange={(event) => setResourceForm((current) => ({ ...current, scopes: event.target.value }))}
                        className={textareaClass}
                        style={controlStyle}
                        placeholder="read: Read access"
                      />
                    </div>
                  </form>

                  <DataTable headers={["Identifier", "Name", "Scopes", "Actions"]} empty="No resource servers found" colSpan={4}>
                    {resourceServers.map((server) => (
                      <tr key={server.Identifier} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-4 py-2 font-mono text-xs">{server.Identifier}</td>
                        <td className="px-4 py-2">{server.Name}</td>
                        <td className="px-4 py-2" style={mutedTextStyle}>
                          {(server.Scopes ?? []).map((scope) => scope.ScopeName).join(", ") || "-"}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-2">
                            <IconAction label="Edit resource server" onClick={() => editResourceServer(server)} icon={Edit3} disabled={busy} />
                            <IconAction label="Delete resource server" onClick={() => deleteResourceServer(server)} icon={Trash2} danger disabled={busy} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </section>
              )}

              {!loadingPanel && activeTab === "settings" && (
                <section className="max-w-3xl">
                  <form onSubmit={savePoolSettings} className="rounded-md border p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <FormLabel label="Pool name" />
                        <input
                          value={poolSettingsForm.name}
                          onChange={(event) =>
                            setPoolSettingsForm((current) => ({ ...current, name: event.target.value }))
                          }
                          className={inputClass}
                          style={controlStyle}
                        />
                      </div>
                      <div>
                        <FormLabel label="MFA configuration" />
                        <select
                          value={poolSettingsForm.mfaConfiguration}
                          onChange={(event) =>
                            setPoolSettingsForm((current) => ({ ...current, mfaConfiguration: event.target.value }))
                          }
                          className={inputClass}
                          style={controlStyle}
                        >
                          <option value="OFF">OFF</option>
                          <option value="OPTIONAL">OPTIONAL</option>
                          <option value="ON">ON</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                        <input
                          type="checkbox"
                          checked={poolSettingsForm.autoVerifyEmail}
                          onChange={(event) =>
                            setPoolSettingsForm((current) => ({ ...current, autoVerifyEmail: event.target.checked }))
                          }
                        />
                        Auto-verify email
                      </label>
                      <label className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                        <input
                          type="checkbox"
                          checked={poolSettingsForm.autoVerifyPhone}
                          onChange={(event) =>
                            setPoolSettingsForm((current) => ({ ...current, autoVerifyPhone: event.target.checked }))
                          }
                        />
                        Auto-verify phone
                      </label>
                      <label className="flex items-center gap-2 text-sm" style={mutedTextStyle}>
                        <input
                          type="checkbox"
                          checked={poolSettingsForm.deletionProtection}
                          onChange={(event) =>
                            setPoolSettingsForm((current) => ({ ...current, deletionProtection: event.target.checked }))
                          }
                        />
                        Deletion protection
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button className={textButtonClass} style={controlStyle} disabled={busy}>
                        <Save className="h-3.5 w-3.5" /> Save Pool
                      </button>
                      <button type="button" onClick={deletePool} className={textButtonClass} style={{ ...controlStyle, color: "var(--error)" }} disabled={busy}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete Pool
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function FormLabel({ label }: { label: string }) {
  return (
    <label className="mb-1 block text-xs font-medium uppercase" style={mutedTextStyle}>
      {label}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
      <div className="mb-1 text-xs font-medium uppercase" style={mutedTextStyle}>
        {label}
      </div>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function DataTable({
  headers,
  empty,
  colSpan,
  children,
}: {
  headers: string[];
  empty: string;
  colSpan: number;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--bg-tertiary)" }}>
            {headers.map((header, index) => (
              <th key={header} className={`px-4 py-2 font-medium ${index === headers.length - 1 ? "text-right" : "text-left"}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasChildren ? (
            children
          ) : (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center" style={mutedTextStyle}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  icon: Icon,
  danger = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  icon: typeof Edit3;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={iconButtonClass}
      style={{ ...controlStyle, color: danger ? "var(--error)" : "var(--text-secondary)" }}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function CheckboxPill({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className="inline-flex min-h-8 items-center gap-2 rounded-md border px-3 text-xs"
      style={{
        ...controlStyle,
        background: checked ? "var(--bg-tertiary)" : "var(--bg-primary)",
      }}
    >
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}
