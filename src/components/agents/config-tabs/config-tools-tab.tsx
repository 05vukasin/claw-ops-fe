"use client";

import {
  SectionHeader,
  SegmentBtn,
  Toggle,
  Field,
  type ConfigObj,
} from "../agent-config-panel";

interface Props {
  config: ConfigObj;
  updateConfig: (path: string[], value: unknown) => void;
}

export function ConfigToolsTab({ config, updateConfig }: Props) {
  const tools = config?.tools ?? {};
  const exec = tools?.exec ?? {};
  const webSearch = tools?.web?.search ?? {};
  const loopDetection = tools?.loopDetection ?? {};

  return (
    <div className="space-y-5">
      <SectionHeader>Execution</SectionHeader>
      <Field label="Security Level">
        <SegmentBtn
          options={["full", "sandbox", "restricted"]}
          value={exec.security ?? "full"}
          onChange={(v) => updateConfig(["tools", "exec", "security"], v)}
        />
      </Field>
      <Field label="Ask Before Execution">
        <SegmentBtn
          options={["on", "off"]}
          value={exec.ask ?? "off"}
          onChange={(v) => updateConfig(["tools", "exec", "ask"], v)}
        />
      </Field>

      <SectionHeader>Web Search</SectionHeader>
      <Toggle
        checked={webSearch.enabled !== false}
        onChange={(v) =>
          updateConfig(["tools", "web", "search", "enabled"], v)
        }
        label="Enabled"
      />

      <SectionHeader>Loop Detection</SectionHeader>
      <Toggle
        checked={loopDetection.enabled !== false}
        onChange={(v) =>
          updateConfig(["tools", "loopDetection", "enabled"], v)
        }
        label="Enabled"
      />
    </div>
  );
}
