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

export function ConfigContextTab({ config, updateConfig }: Props) {
  const defaults = config?.agents?.defaults ?? {};
  const compaction = defaults?.compaction ?? {};
  const memFlush = compaction?.memoryFlush ?? {};
  const pruning = defaults?.contextPruning ?? {};

  return (
    <div className="space-y-5">
      <SectionHeader>Context Window</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Context Tokens">
          <input
            type="number"
            min={1000}
            max={1000000}
            value={defaults.contextTokens ?? ""}
            onChange={(e) =>
              updateConfig(
                ["agents", "defaults", "contextTokens"],
                parseInt(e.target.value) || undefined,
              )
            }
            placeholder="50000"
            className={INPUT_BASE}
          />
        </Field>
        <Field label="Max Concurrent Sessions">
          <input
            type="number"
            min={1}
            max={20}
            value={defaults.maxConcurrent ?? ""}
            onChange={(e) =>
              updateConfig(
                ["agents", "defaults", "maxConcurrent"],
                parseInt(e.target.value) || undefined,
              )
            }
            placeholder="2"
            className={INPUT_BASE}
          />
        </Field>
      </div>

      <SectionHeader>Compaction</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mode">
          <input
            type="text"
            value={compaction.mode ?? ""}
            onChange={(e) =>
              updateConfig(
                ["agents", "defaults", "compaction", "mode"],
                e.target.value || undefined,
              )
            }
            placeholder="default"
            className={INPUT_BASE}
          />
        </Field>
        <Field label="Reserve Tokens Floor">
          <input
            type="number"
            min={0}
            value={compaction.reserveTokensFloor ?? ""}
            onChange={(e) =>
              updateConfig(
                ["agents", "defaults", "compaction", "reserveTokensFloor"],
                parseInt(e.target.value) || undefined,
              )
            }
            placeholder="25000"
            className={INPUT_BASE}
          />
        </Field>
      </div>

      <SectionHeader>Memory Flush</SectionHeader>
      <div className="space-y-3">
        <Toggle
          checked={!!memFlush.enabled}
          onChange={(v) =>
            updateConfig(
              ["agents", "defaults", "compaction", "memoryFlush", "enabled"],
              v,
            )
          }
          label="Enabled"
        />
        <Field label="Soft Threshold Tokens" optional>
          <input
            type="number"
            min={0}
            value={memFlush.softThresholdTokens ?? ""}
            onChange={(e) =>
              updateConfig(
                [
                  "agents",
                  "defaults",
                  "compaction",
                  "memoryFlush",
                  "softThresholdTokens",
                ],
                parseInt(e.target.value) || undefined,
              )
            }
            placeholder="5000"
            className={INPUT_BASE}
          />
        </Field>
        <Field label="System Prompt" optional>
          <textarea
            rows={3}
            value={memFlush.systemPrompt ?? ""}
            onChange={(e) =>
              updateConfig(
                [
                  "agents",
                  "defaults",
                  "compaction",
                  "memoryFlush",
                  "systemPrompt",
                ],
                e.target.value || undefined,
              )
            }
            className={`${INPUT_BASE} resize-none font-mono text-[11px] leading-relaxed`}
          />
        </Field>
        <Field label="Flush Prompt" optional>
          <textarea
            rows={3}
            value={memFlush.prompt ?? ""}
            onChange={(e) =>
              updateConfig(
                [
                  "agents",
                  "defaults",
                  "compaction",
                  "memoryFlush",
                  "prompt",
                ],
                e.target.value || undefined,
              )
            }
            className={`${INPUT_BASE} resize-none font-mono text-[11px] leading-relaxed`}
          />
        </Field>
      </div>

      <SectionHeader>Context Pruning</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mode">
          <input
            type="text"
            value={pruning.mode ?? ""}
            onChange={(e) =>
              updateConfig(
                ["agents", "defaults", "contextPruning", "mode"],
                e.target.value || undefined,
              )
            }
            placeholder="cache-ttl"
            className={INPUT_BASE}
          />
        </Field>
        <Field label="TTL">
          <input
            type="text"
            value={pruning.ttl ?? ""}
            onChange={(e) =>
              updateConfig(
                ["agents", "defaults", "contextPruning", "ttl"],
                e.target.value || undefined,
              )
            }
            placeholder="5m"
            className={INPUT_BASE}
          />
        </Field>
      </div>
    </div>
  );
}
