type BoolChoice = "__absent__" | "null" | "true" | "false";

import type { ComponentPropsWithoutRef } from "react";

type Props = Omit<ComponentPropsWithoutRef<"select">, "value" | "onChange"> & {
  value: BoolChoice;
  onChange: (value: BoolChoice) => void;
  allowAbsent?: boolean;
};

export function BoolValueComboBox(props: Props) {
  const { value, onChange, allowAbsent, className, ...rest } = props;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as BoolChoice)}
      className={["floci-select", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {allowAbsent && <option value="__absent__">Unset</option>}
      <option value="null">null</option>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );
}

export type { BoolChoice };

