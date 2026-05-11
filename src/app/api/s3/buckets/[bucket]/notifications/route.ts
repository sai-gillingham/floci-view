import { NextResponse } from "next/server";
import { s3Client } from "@/lib/aws-clients";
import {
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
  type Event as S3Event,
  type FilterRule,
  type NotificationConfiguration,
  type NotificationConfigurationFilter,
} from "@aws-sdk/client-s3";
import { errorResponse, MalformedJsonBodyError, readJsonBody, stringFromUnknown } from "@/app/api/s3/helpers";

interface RouteContext {
  params: Promise<{ bucket: string }>;
}

interface TriggerConfiguration {
  id: string;
  destinationType: "Queue" | "Topic" | "Lambda";
  destinationArn: string;
  eventTypes: string[];
  prefixFilter?: string;
  suffixFilter?: string;
}

const allowedEvents = new Set<string>([
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
]);

function filterRuleValue(filter: NotificationConfigurationFilter | undefined, name: "prefix" | "suffix") {
  return filter?.Key?.FilterRules?.find((rule) => rule.Name === name)?.Value ?? "";
}

function filterFromTrigger(trigger: TriggerConfiguration): NotificationConfigurationFilter | undefined {
  const filterRules: FilterRule[] = [];

  if (trigger.prefixFilter) filterRules.push({ Name: "prefix", Value: trigger.prefixFilter });
  if (trigger.suffixFilter) filterRules.push({ Name: "suffix", Value: trigger.suffixFilter });

  if (filterRules.length === 0) return undefined;

  return { Key: { FilterRules: filterRules } };
}

function normalizeTrigger(value: unknown): TriggerConfiguration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const destinationType = stringFromUnknown(record.destinationType);
  const destinationArn = stringFromUnknown(record.destinationArn);
  const eventTypes = Array.isArray(record.eventTypes)
    ? record.eventTypes
        .map((eventType) => stringFromUnknown(eventType))
        .filter((eventType) => allowedEvents.has(eventType))
    : [];

  if (
    !["Queue", "Topic", "Lambda"].includes(destinationType) ||
    !destinationArn ||
    eventTypes.length === 0
  ) {
    return null;
  }

  return {
    id: stringFromUnknown(record.id),
    destinationType: destinationType as TriggerConfiguration["destinationType"],
    destinationArn,
    eventTypes,
    prefixFilter: stringFromUnknown(record.prefixFilter) || undefined,
    suffixFilter: stringFromUnknown(record.suffixFilter) || undefined,
  };
}

function triggersFromConfiguration(configuration: NotificationConfiguration) {
  const queueTriggers =
    configuration.QueueConfigurations?.map((trigger) => ({
      id: trigger.Id ?? "",
      destinationType: "Queue" as const,
      destinationArn: trigger.QueueArn ?? "",
      eventTypes: trigger.Events ?? [],
      prefixFilter: filterRuleValue(trigger.Filter, "prefix"),
      suffixFilter: filterRuleValue(trigger.Filter, "suffix"),
    })) ?? [];
  const topicTriggers =
    configuration.TopicConfigurations?.map((trigger) => ({
      id: trigger.Id ?? "",
      destinationType: "Topic" as const,
      destinationArn: trigger.TopicArn ?? "",
      eventTypes: trigger.Events ?? [],
      prefixFilter: filterRuleValue(trigger.Filter, "prefix"),
      suffixFilter: filterRuleValue(trigger.Filter, "suffix"),
    })) ?? [];
  const lambdaTriggers =
    configuration.LambdaFunctionConfigurations?.map((trigger) => ({
      id: trigger.Id ?? "",
      destinationType: "Lambda" as const,
      destinationArn: trigger.LambdaFunctionArn ?? "",
      eventTypes: trigger.Events ?? [],
      prefixFilter: filterRuleValue(trigger.Filter, "prefix"),
      suffixFilter: filterRuleValue(trigger.Filter, "suffix"),
    })) ?? [];

  return [...queueTriggers, ...topicTriggers, ...lambdaTriggers];
}

function configurationFromTriggers(triggers: TriggerConfiguration[], eventBridgeEnabled: boolean) {
  const configuration: NotificationConfiguration = {};

  configuration.QueueConfigurations = triggers
    .filter((trigger) => trigger.destinationType === "Queue")
    .map((trigger) => ({
      Id: trigger.id || undefined,
      QueueArn: trigger.destinationArn,
      Events: trigger.eventTypes as S3Event[],
      Filter: filterFromTrigger(trigger),
    }));

  configuration.TopicConfigurations = triggers
    .filter((trigger) => trigger.destinationType === "Topic")
    .map((trigger) => ({
      Id: trigger.id || undefined,
      TopicArn: trigger.destinationArn,
      Events: trigger.eventTypes as S3Event[],
      Filter: filterFromTrigger(trigger),
    }));

  configuration.LambdaFunctionConfigurations = triggers
    .filter((trigger) => trigger.destinationType === "Lambda")
    .map((trigger) => ({
      Id: trigger.id || undefined,
      LambdaFunctionArn: trigger.destinationArn,
      Events: trigger.eventTypes as S3Event[],
      Filter: filterFromTrigger(trigger),
    }));

  if (eventBridgeEnabled) {
    configuration.EventBridgeConfiguration = {};
  }

  return configuration;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { bucket } = await params;
    const configuration = await s3Client.send(
      new GetBucketNotificationConfigurationCommand({ Bucket: bucket }),
    );

    return NextResponse.json({
      triggers: triggersFromConfiguration(configuration),
      eventBridgeEnabled: Boolean(configuration.EventBridgeConfiguration),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { bucket } = await params;

  try {
    const body = await readJsonBody<{ triggers?: unknown; eventBridgeEnabled?: unknown }>(request);
    const triggers = Array.isArray(body.triggers)
      ? body.triggers.flatMap((trigger) => {
          const normalized = normalizeTrigger(trigger);
          return normalized ? [normalized] : [];
        })
      : [];
    const eventBridgeEnabled = body.eventBridgeEnabled === true;

    await s3Client.send(
      new PutBucketNotificationConfigurationCommand({
        Bucket: bucket,
        NotificationConfiguration: configurationFromTriggers(triggers, eventBridgeEnabled),
      }),
    );

    return NextResponse.json({ ok: true, triggers, eventBridgeEnabled });
  } catch (error) {
    if (error instanceof MalformedJsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { bucket } = await params;
    await s3Client.send(
      new PutBucketNotificationConfigurationCommand({
        Bucket: bucket,
        NotificationConfiguration: {},
      }),
    );

    return NextResponse.json({ ok: true, triggers: [], eventBridgeEnabled: false });
  } catch (error) {
    return errorResponse(error);
  }
}
