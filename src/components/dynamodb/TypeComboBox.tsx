type CellType = "S" | "N" | "BOOL" | "NULL" | "JSON";

import type { ComponentPropsWithoutRef } from "react";

type Props = Omit<ComponentPropsWithoutRef<"select">, "value" | "onChange"> & {
  value: CellType;
  onChange: (value: CellType) => void;
};

export function TypeComboBox(props: Props) {
  const { value, onChange, className, ...rest } = props;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CellType)}
      className={["floci-select", className].filter(Boolean).join(" ")}
      {...rest}
    >
      <option value="S">String</option>
      <option value="N">Number</option>
      <option value="BOOL">Bool</option>
      <option value="NULL">Null</option>
      <option value="JSON">JSON</option>
    </select>
  );
}

export type { CellType };

