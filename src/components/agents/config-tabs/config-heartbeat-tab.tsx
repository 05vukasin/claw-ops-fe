"use client";

import {
  Field,
  SectionHeader,
  Toggle,
  INPUT_BASE,
  type ConfigObj,
} from "../agent-config-panel";

interface Props {
  config: ConfigObj;
  updateConfig: (path: string[], value: unknown) => void;
}

export function ConfigHeartbeatTab({ config, updateConfig }: Props) {
  const hb = config?.agents?.defaults?.heartbeat ?? {};
  const activeHours = hb?.activeHours ?? {};

  const setHb = (field: string, value: unknown) =>
    updateConfig(["agents", "defaults", "heartbeat", field], value);

  const setActiveHours = (field: string, value: unknown) =>
    updateConfig(
      ["agents", "defaults", "heartbeat", "activeHours", field],
      value,
    );

  return (
    <div className="space-y-5">
      <SectionHeader>Schedule</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Interval">
          <input
            type="text"
            value={hb.every ?? ""}
            onChange={(e) => setHb("every", e.target.value || undefined)}
            placeholder="30m"
            className={INPUT_BASE}
          />
        </Field>
        <Field label="Model Override" optional>
          <input
            type="text"
            value={hb.model ?? ""}
            onChange={(e) => setHb("model", e.target.value || undefined)}
            placeholder="Use agent default"
            className={INPUT_BASE}
          />
        </Field>
      </div>
      <Field label="Target" optional>
        <input
          type="text"
          value={hb.target ?? ""}
          onChange={(e) => setHb("target", e.target.value || undefined)}
          placeholder="last"
          className={INPUT_BASE}
        />
      </Field>

      <SectionHeader>Active Hours</SectionHeader>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Start">
          <input
            type="text"
            value={activeHours.start ?? ""}
            onChange={(e) => setActiveHours("start", e.target.value || undefined)}
            placeholder="09:00"
            className={INPUT_BASE}
          />
        </Field>
        <Field label="End">
          <input
            type="text"
            value={activeHours.end ?? ""}
            onChange={(e) => setActiveHours("end", e.target.value || undefined)}
            placeholder="22:00"
            className={INPUT_BASE}
          />
        </Field>
        <Field label="Timezone">
          <input
            type="text"
            value={activeHours.timezone ?? ""}
            onChange={(e) =>
              setActiveHours("timezone", e.target.value || undefined)
            }
            placeholder="Europe/Belgrade"
            className={INPUT_BASE}
          />
        </Field>
      </div>

      <SectionHeader>Options</SectionHeader>
      <div className="space-y-3">
        <Toggle
          checked={!!hb.isolatedSession}
          onChange={(v) => setHb("isolatedSession", v)}
          label="Isolated Session"
        />
        <Toggle
          checked={!!hb.lightContext}
          onChange={(v) => setHb("lightContext", v)}
          label="Light Context (HEARTBEAT.md only)"
        />
        <Toggle
          checked={!!hb.includeReasoning}
          onChange={(v) => setHb("includeReasoning", v)}
          label="Include Reasoning"
        />
      </div>
    </div>
  );
}
