"use client";

import { DynamoItemDialog } from "@/components/dynamodb/DynamoItemDialog";
import type { DynamoItem } from "@/types/dynamodb";

export function EditItemDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  keyNames: string[];
  item: DynamoItem | null;
  focusAttr?: string | null;
  onUpdated?: () => void | Promise<void>;
}) {
  return <DynamoItemDialog {...props} variant="edit" />;
}
