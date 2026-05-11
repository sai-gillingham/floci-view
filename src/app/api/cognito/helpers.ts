import { NextResponse } from "next/server";
import type {
  AttributeType,
  CreateUserPoolClientCommandInput,
  CreateUserPoolCommandInput,
  ExplicitAuthFlowsType,
  OAuthFlowType,
  PreventUserExistenceErrorTypes,
  ResourceServerScopeType,
  UpdateUserPoolClientCommandInput,
  UpdateUserPoolCommandInput,
  UserPoolClientType,
  UserPoolMfaType,
  UserPoolType,
  VerifiedAttributeType,
} from "@aws-sdk/client-cognito-identity-provider";

export function errorResponse(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status });
}

export async function parseBody(request: Request) {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

export function requiredString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

export function optionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function optionalNumber(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function optionalBoolean(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "boolean" ? value : undefined;
}

export function stringArray(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") return undefined;

  const items = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

export function attributesFromBody(body: Record<string, unknown>) {
  const attributes: AttributeType[] = [];
  const email = optionalString(body, "email");
  const phoneNumber = optionalString(body, "phoneNumber");

  if (email) attributes.push({ Name: "email", Value: email });
  if (phoneNumber) attributes.push({ Name: "phone_number", Value: phoneNumber });

  const extraAttributes = body.attributes;
  if (Array.isArray(extraAttributes)) {
    for (const attribute of extraAttributes) {
      if (!attribute || typeof attribute !== "object") continue;

      const item = attribute as Record<string, unknown>;
      const Name = typeof item.Name === "string" ? item.Name.trim() : "";
      const Value = typeof item.Value === "string" ? item.Value.trim() : "";
      if (Name && Value) attributes.push({ Name, Value });
    }
  }

  return attributes;
}

export function scopesFromBody(body: Record<string, unknown>) {
  const value = body.scopes;
  if (!Array.isArray(value)) return undefined;

  const scopes = value
    .map<ResourceServerScopeType | null>((scope) => {
      if (!scope || typeof scope !== "object") return null;

      const item = scope as Record<string, unknown>;
      const ScopeName = typeof item.ScopeName === "string" ? item.ScopeName.trim() : "";
      const ScopeDescription =
        typeof item.ScopeDescription === "string" ? item.ScopeDescription.trim() : "";

      return ScopeName ? { ScopeName, ScopeDescription } : null;
    })
    .filter((scope): scope is ResourceServerScopeType => scope !== null);

  return scopes.length ? scopes : undefined;
}

function cleanUndefined<T extends Record<string, unknown>>(input: T) {
  for (const key of Object.keys(input)) {
    if (input[key] === undefined) delete input[key];
  }

  return input;
}

/**
 * Normalize `PreventUserExistenceErrors` from the request body: uses optionalString on
 * `preventUserExistenceErrors`, then allows only Cognito's "ENABLED" | "LEGACY" (used by
 * createClientInput and clientUpdateInputFromDetail).
 */
function preventUserExistenceErrorsFromBody(body: Record<string, unknown>): PreventUserExistenceErrorTypes | undefined {
  const raw = optionalString(body, "preventUserExistenceErrors");
  if (raw === "ENABLED" || raw === "LEGACY") return raw;
  return undefined;
}

/**
 * Normalize `mfaConfiguration` from the request body for UpdateUserPool (see preventUserExistenceErrorsFromBody).
 * Only Cognito UserPoolMfaType values are returned; invalid strings are ignored.
 */
function mfaConfigurationFromBody(body: Record<string, unknown>): UserPoolMfaType | undefined {
  if (typeof body.mfaConfiguration !== "string") return undefined;
  const value = body.mfaConfiguration.trim();
  if (value === "OFF" || value === "ON" || value === "OPTIONAL") return value;
  return undefined;
}

export function createPoolInput(body: Record<string, unknown>): CreateUserPoolCommandInput | null {
  const PoolName = requiredString(body, "name");
  if (!PoolName) return null;

  const autoVerifiedAttributes: VerifiedAttributeType[] = [];
  if (optionalBoolean(body, "autoVerifyEmail")) autoVerifiedAttributes.push("email");
  if (optionalBoolean(body, "autoVerifyPhone")) autoVerifiedAttributes.push("phone_number");

  return cleanUndefined({
    PoolName,
    AutoVerifiedAttributes: autoVerifiedAttributes.length ? autoVerifiedAttributes : undefined,
    DeletionProtection: (optionalBoolean(body, "deletionProtection") ? "ACTIVE" : "INACTIVE") as
      CreateUserPoolCommandInput["DeletionProtection"],
  });
}

export function poolUpdateInputFromDetail(
  pool: UserPoolType,
  body: Record<string, unknown>,
): UpdateUserPoolCommandInput {
  const update = cleanUndefined({
    UserPoolId: pool.Id,
    Policies: pool.Policies,
    DeletionProtection: pool.DeletionProtection,
    LambdaConfig: pool.LambdaConfig,
    AutoVerifiedAttributes: pool.AutoVerifiedAttributes,
    SmsVerificationMessage: pool.SmsVerificationMessage,
    EmailVerificationMessage: pool.EmailVerificationMessage,
    EmailVerificationSubject: pool.EmailVerificationSubject,
    VerificationMessageTemplate: pool.VerificationMessageTemplate,
    SmsAuthenticationMessage: pool.SmsAuthenticationMessage,
    UserAttributeUpdateSettings: pool.UserAttributeUpdateSettings,
    MfaConfiguration: pool.MfaConfiguration,
    DeviceConfiguration: pool.DeviceConfiguration,
    EmailConfiguration: pool.EmailConfiguration,
    SmsConfiguration: pool.SmsConfiguration,
    UserPoolTags: pool.UserPoolTags,
    AdminCreateUserConfig: pool.AdminCreateUserConfig,
    UserPoolAddOns: pool.UserPoolAddOns,
    AccountRecoverySetting: pool.AccountRecoverySetting,
    PoolName: pool.Name,
    UserPoolTier: pool.UserPoolTier,
  });

  const PoolName = optionalString(body, "name");
  if (PoolName) update.PoolName = PoolName;
  if (typeof body.deletionProtection === "boolean") {
    update.DeletionProtection = body.deletionProtection ? "ACTIVE" : "INACTIVE";
  }
  if (typeof body.mfaConfiguration === "string") {
    const MfaConfiguration = mfaConfigurationFromBody(body);
    if (MfaConfiguration !== undefined) {
      update.MfaConfiguration = MfaConfiguration;
    }
  }
  if (typeof body.autoVerifyEmail === "boolean" || typeof body.autoVerifyPhone === "boolean") {
    const autoVerifiedAttributes: VerifiedAttributeType[] = [...(pool.AutoVerifiedAttributes ?? [])];
    if (typeof body.autoVerifyEmail === "boolean") {
      if (body.autoVerifyEmail) {
        if (!autoVerifiedAttributes.includes("email")) autoVerifiedAttributes.push("email");
      } else {
        const i = autoVerifiedAttributes.indexOf("email");
        if (i !== -1) autoVerifiedAttributes.splice(i, 1);
      }
    }
    if (typeof body.autoVerifyPhone === "boolean") {
      if (body.autoVerifyPhone) {
        if (!autoVerifiedAttributes.includes("phone_number")) autoVerifiedAttributes.push("phone_number");
      } else {
        const i = autoVerifiedAttributes.indexOf("phone_number");
        if (i !== -1) autoVerifiedAttributes.splice(i, 1);
      }
    }
    update.AutoVerifiedAttributes = autoVerifiedAttributes;
  }

  return update;
}

export function createClientInput(
  userPoolId: string,
  body: Record<string, unknown>,
): CreateUserPoolClientCommandInput | null {
  const ClientName = requiredString(body, "clientName");
  if (!ClientName) return null;

  const allowedOAuthFlows = stringArray(body, "allowedOAuthFlows") as OAuthFlowType[] | undefined;
  const allowedOAuthScopes = stringArray(body, "allowedOAuthScopes");
  const callbackUrls = stringArray(body, "callbackUrls");
  const logoutUrls = stringArray(body, "logoutUrls");
  const explicitAuthFlows = stringArray(body, "explicitAuthFlows") as ExplicitAuthFlowsType[] | undefined;
  const hasOAuthConfig =
    Boolean(allowedOAuthFlows?.length) || Boolean(allowedOAuthScopes?.length) || Boolean(callbackUrls?.length);

  return cleanUndefined({
    UserPoolId: userPoolId,
    ClientName,
    GenerateSecret: optionalBoolean(body, "generateSecret"),
    RefreshTokenValidity: optionalNumber(body, "refreshTokenValidity"),
    AccessTokenValidity: optionalNumber(body, "accessTokenValidity"),
    IdTokenValidity: optionalNumber(body, "idTokenValidity"),
    ExplicitAuthFlows: explicitAuthFlows,
    SupportedIdentityProviders: stringArray(body, "supportedIdentityProviders"),
    CallbackURLs: callbackUrls,
    LogoutURLs: logoutUrls,
    AllowedOAuthFlows: allowedOAuthFlows,
    AllowedOAuthScopes: allowedOAuthScopes,
    AllowedOAuthFlowsUserPoolClient:
      typeof body.allowedOAuthFlowsUserPoolClient === "boolean"
        ? body.allowedOAuthFlowsUserPoolClient
        : hasOAuthConfig || undefined,
    PreventUserExistenceErrors: preventUserExistenceErrorsFromBody(body),
    EnableTokenRevocation: optionalBoolean(body, "enableTokenRevocation"),
  });
}

export function clientUpdateInputFromDetail(
  client: UserPoolClientType,
  body: Record<string, unknown>,
): UpdateUserPoolClientCommandInput {
  const update = cleanUndefined({
    UserPoolId: client.UserPoolId,
    ClientId: client.ClientId,
    ClientName: client.ClientName,
    RefreshTokenValidity: client.RefreshTokenValidity,
    AccessTokenValidity: client.AccessTokenValidity,
    IdTokenValidity: client.IdTokenValidity,
    TokenValidityUnits: client.TokenValidityUnits,
    ReadAttributes: client.ReadAttributes,
    WriteAttributes: client.WriteAttributes,
    ExplicitAuthFlows: client.ExplicitAuthFlows,
    SupportedIdentityProviders: client.SupportedIdentityProviders,
    CallbackURLs: client.CallbackURLs,
    LogoutURLs: client.LogoutURLs,
    DefaultRedirectURI: client.DefaultRedirectURI,
    AllowedOAuthFlows: client.AllowedOAuthFlows,
    AllowedOAuthScopes: client.AllowedOAuthScopes,
    AllowedOAuthFlowsUserPoolClient: client.AllowedOAuthFlowsUserPoolClient,
    AnalyticsConfiguration: client.AnalyticsConfiguration,
    PreventUserExistenceErrors: client.PreventUserExistenceErrors,
    EnableTokenRevocation: client.EnableTokenRevocation,
    EnablePropagateAdditionalUserContextData: client.EnablePropagateAdditionalUserContextData,
    AuthSessionValidity: client.AuthSessionValidity,
    RefreshTokenRotation: client.RefreshTokenRotation,
  });

  if (typeof body.clientName === "string") update.ClientName = requiredString(body, "clientName");
  if (body.refreshTokenValidity !== undefined) update.RefreshTokenValidity = optionalNumber(body, "refreshTokenValidity");
  if (body.accessTokenValidity !== undefined) update.AccessTokenValidity = optionalNumber(body, "accessTokenValidity");
  if (body.idTokenValidity !== undefined) update.IdTokenValidity = optionalNumber(body, "idTokenValidity");
  if (body.explicitAuthFlows !== undefined) {
    update.ExplicitAuthFlows = stringArray(body, "explicitAuthFlows") as ExplicitAuthFlowsType[] | undefined;
  }
  if (body.supportedIdentityProviders !== undefined) {
    update.SupportedIdentityProviders = stringArray(body, "supportedIdentityProviders");
  }
  if (body.callbackUrls !== undefined) update.CallbackURLs = stringArray(body, "callbackUrls");
  if (body.logoutUrls !== undefined) update.LogoutURLs = stringArray(body, "logoutUrls");
  if (body.allowedOAuthFlows !== undefined) {
    update.AllowedOAuthFlows = stringArray(body, "allowedOAuthFlows") as OAuthFlowType[] | undefined;
  }
  if (body.allowedOAuthScopes !== undefined) update.AllowedOAuthScopes = stringArray(body, "allowedOAuthScopes");
  if (typeof body.allowedOAuthFlowsUserPoolClient === "boolean") {
    update.AllowedOAuthFlowsUserPoolClient = body.allowedOAuthFlowsUserPoolClient;
  }
  if (typeof body.preventUserExistenceErrors === "string") {
    const PreventUserExistenceErrors = preventUserExistenceErrorsFromBody(body);
    if (PreventUserExistenceErrors !== undefined) {
      update.PreventUserExistenceErrors = PreventUserExistenceErrors;
    }
  }
  if (typeof body.enableTokenRevocation === "boolean") {
    update.EnableTokenRevocation = body.enableTokenRevocation;
  }

  return update;
}
