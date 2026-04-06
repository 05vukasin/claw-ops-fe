"use client";

import { useCallback } from "react";
import {
  Field,
  SectionHeader,
  SegmentBtn,
  Toggle,
  INPUT_BASE,
  type ConfigObj,
  getPath,
} from "../agent-config-panel";
import { FiX, FiPlus } from "react-icons/fi";

interface Props {
  config: ConfigObj;
  updateConfig: (path: string[], value: unknown) => void;
}

const THINKING_OPTIONS = ["off", "low", "medium", "high", "adaptive"];

export function ConfigModelTab({ config, updateConfig }: Props) {
  const defaults = config?.agents?.defaults ?? {};
  const modelObj = defaults?.model;
  const primary =
    typeof modelObj === "string" ? modelObj : modelObj?.primary ?? "";
  const fallbacks: string[] =
    typeof modelObj === "object" ? modelObj?.fallbacks ?? [] : [];
  const thinking = defaults?.thinkingDefault ?? "off";
  const blockStreaming = defaults?.blockStreamingDefault ?? "off";

  // Aliases: Record<modelId, { alias: string }>
  const modelsMap = defaults?.models ?? {};
  const aliases = Object.entries(modelsMap as Record<string, { alias?: string }>).map(
    ([id, val]) => ({ id, alias: val?.alias ?? "" }),
  );

  // Subagent
  const sub = defaults?.subagents ?? {};
  const subModel = sub?.model;
  const subPrimary =
    typeof subModel === "string" ? subModel : subModel?.primary ?? "";
  const subFallbacks: string[] =
    typeof subModel === "object" ? subModel?.fallbacks ?? [] : [];

  const setModelField = useCallback(
    (field: string, value: unknown) => {
      const cur =
        typeof modelObj === "string"
          ? { primary: modelObj }
          : { ...(modelObj ?? {}) };
      updateConfig(["agents", "defaults", "model"], { ...cur, [field]: value });
    },
    [modelObj, updateConfig],
  );

  const addAlias = useCallback(() => {
    const cur = { ...(modelsMap as Record<string, unknown>) };
    const newId = `new-model-${Date.now()}`;
    cur[newId] = { alias: "" };
    updateConfig(["agents", "defaults", "models"], cur);
  }, [modelsMap, updateConfig]);

  const removeAlias = useCallback(
    (id: string) => {
      const cur = { ...(modelsMap as Record<string, unknown>) };
      delete cur[id];
      updateConfig(["agents", "defaults", "models"], cur);
    },
    [modelsMap, updateConfig],
  );

  const updateAlias = useCallback(
    (oldId: string, newId: string, alias: string) => {
      const cur = { ...(modelsMap as Record<string, unknown>) };
      if (newId !== oldId) {
        delete cur[oldId];
      }
      cur[newId] = { alias };
      updateConfig(["agents", "defaults", "models"], cur);
    },
    [modelsMap, updateConfig],
  );

  return (
    <div className="space-y-5">
      <SectionHeader>Primary Model</SectionHeader>
      <Field label="Model ID">
        <input
          type="text"
          value={primary}
          onChange={(e) => setModelField("primary", e.target.value)}
          placeholder="openrouter/anthropic/claude-sonnet-4-6"
          className={INPUT_BASE}
        />
      </Field>
      <Field label="Fallback Models" optional>
        <input
          type="text"
          value={fallbacks.join(", ")}
          onChange={(e) =>
            setModelField(
              "fallbacks",
              e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
            )
          }
          placeholder="Comma-separated model IDs"
          className={INPUT_BASE}
        />
      </Field>

      <SectionHeader>Thinking</SectionHeader>
      <Field label="Thinking Level">
        <SegmentBtn
          options={THINKING_OPTIONS}
          value={thinking}
          onChange={(v) =>
            updateConfig(["agents", "defaults", "thinkingDefault"], v)
          }
        />
      </Field>
      <Field label="Block Streaming">
        <SegmentBtn
          options={["on", "off"]}
          value={blockStreaming}
          onChange={(v) =>
            updateConfig(["agents", "defaults", "blockStreamingDefault"], v)
          }
        />
      </Field>

      <SectionHeader>Model Aliases</SectionHeader>
      {aliases.length === 0 && (
        <p className="text-[11px] text-canvas-muted">No aliases configured.</p>
      )}
      {aliases.map((a) => (
        <div key={a.id} className="flex items-center gap-2">
          <input
            type="text"
            value={a.alias}
            onChange={(e) => updateAlias(a.id, a.id, e.target.value)}
            placeholder="Alias"
            className={`${INPUT_BASE} flex-1`}
          />
          <span className="text-[10px] text-canvas-muted">-&gt;</span>
          <input
            type="text"
            value={a.id}
            onChange={(e) => updateAlias(a.id, e.target.value, a.alias)}
            placeholder="Model ID"
            className={`${INPUT_BASE} flex-[2]`}
          />
          <button
            type="button"
            onClick={() => removeAlias(a.id)}
            className="shrink-0 rounded p-1 text-canvas-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <FiX size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addAlias}
        className="flex items-center gap-1 text-[11px] font-medium text-canvas-muted transition-colors hover:text-canvas-fg"
      >
        <FiPlus size={12} />
        Add Alias
      </button>

      <SectionHeader>Subagent</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Primary Model" optional>
          <input
            type="text"
            value={subPrimary}
            onChange={(e) => {
              const cur = typeof subModel === "object" ? { ...subModel } : {};
              updateConfig(["agents", "defaults", "subagents", "model"], {
                ...cur,
                primary: e.target.value,
              });
            }}
            className={INPUT_BASE}
          />
        </Field>
        <Field label="Max Concurrent" optional>
          <input
            type="number"
            min={1}
            max={10}
            value={sub?.maxConcurrent ?? ""}
            onChange={(e) =>
              updateConfig(
                ["agents", "defaults", "subagents", "maxConcurrent"],
                parseInt(e.target.value) || undefined,
              )
            }
            className={INPUT_BASE}
          />
        </Field>
        <Field label="Thinking" optional>
          <input
            type="text"
            value={sub?.thinking ?? ""}
            onChange={(e) =>
              updateConfig(
                ["agents", "defaults", "subagents", "thinking"],
                e.target.value || undefined,
              )
            }
            placeholder="adaptive"
            className={INPUT_BASE}
          />
        </Field>
        <Field label="Timeout (seconds)" optional>
          <input
            type="number"
            min={30}
            max={3600}
            value={sub?.runTimeoutSeconds ?? ""}
            onChange={(e) =>
              updateConfig(
                ["agents", "defaults", "subagents", "runTimeoutSeconds"],
                parseInt(e.target.value) || undefined,
              )
            }
            className={INPUT_BASE}
          />
        </Field>
      </div>
    </div>
  );
}
