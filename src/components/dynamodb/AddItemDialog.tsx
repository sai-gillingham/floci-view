"use client";

import { DynamoItemDialog } from "@/components/dynamodb/DynamoItemDialog";

export function AddItemDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  keyNames: string[];
  attributeNames: string[];
  onCreated?: () => void | Promise<void>;
}) {
  const { onCreated, ...rest } = props;
  return <DynamoItemDialog {...rest} variant="add" onCreated={onCreated} />;
}
