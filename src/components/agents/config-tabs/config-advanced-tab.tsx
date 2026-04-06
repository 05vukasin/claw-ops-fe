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

export function ConfigAdvancedTab({ config, updateConfig }: Props) {
  const gateway = config?.gateway ?? {};
  const messages = config?.messages ?? {};
  const commands = config?.commands ?? {};
  const diagnostics = config?.diagnostics ?? {};
  const cacheTrace = diagnostics?.cacheTrace ?? {};

  return (
    <div className="space-y-5">
      <SectionHeader>Gateway</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Port">
          <input
            type="number"
            min={1}
            max={65535}
            value={gateway.port ?? ""}
            onChange={(e) =>
              updateConfig(
                ["gateway", "port"],
                parseInt(e.target.value) || undefined,
              )
            }
            placeholder="18789"
            className={INPUT_BASE}
          />
        </Field>
        <Field label="Mode">
          <select
            value={gateway.mode ?? "local"}
            onChange={(e) => updateConfig(["gateway", "mode"], e.target.value)}
            className={INPUT_BASE}
          >
            <option value="local">Local</option>
            <option value="remote">Remote</option>
          </select>
        </Field>
        <Field label="Bind">
          <select
            value={gateway.bind ?? "lan"}
            onChange={(e) => updateConfig(["gateway", "bind"], e.target.value)}
            className={INPUT_BASE}
          >
            <option value="lan">LAN</option>
            <option value="loopback">Loopback</option>
            <option value="auto">Auto</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
        <Field label="Reload Mode">
          <select
            value={gateway.reload?.mode ?? "hybrid"}
            onChange={(e) =>
              updateConfig(["gateway", "reload", "mode"], e.target.value)
            }
            className={INPUT_BASE}
          >
            <option value="hybrid">Hybrid</option>
            <option value="hot">Hot</option>
            <option value="restart">Restart</option>
            <option value="off">Off</option>
          </select>
        </Field>
      </div>

      <SectionHeader>Messages</SectionHeader>
      <Field label="Ack Reaction Scope">
        <select
          value={messages.ackReactionScope ?? "group-mentions"}
          onChange={(e) =>
            updateConfig(["messages", "ackReactionScope"], e.target.value)
          }
          className={INPUT_BASE}
        >
          <option value="group-mentions">Group Mentions</option>
          <option value="all">All</option>
          <option value="none">None</option>
        </select>
      </Field>

      <SectionHeader>Commands</SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Native Commands">
          <select
            value={commands.native ?? "auto"}
            onChange={(e) =>
              updateConfig(["commands", "native"], e.target.value)
            }
            className={INPUT_BASE}
          >
            <option value="auto">Auto</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Field>
        <Field label="Native Skills">
          <select
            value={commands.nativeSkills ?? "auto"}
            onChange={(e) =>
              updateConfig(["commands", "nativeSkills"], e.target.value)
            }
            className={INPUT_BASE}
          >
            <option value="auto">Auto</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </Field>
      </div>
      <Toggle
        checked={commands.restart !== false}
        onChange={(v) => updateConfig(["commands", "restart"], v)}
        label="Allow Restart Command"
      />

      <SectionHeader>Diagnostics</SectionHeader>
      <div className="space-y-3">
        <Toggle
          checked={!!cacheTrace.enabled}
          onChange={(v) =>
            updateConfig(["diagnostics", "cacheTrace", "enabled"], v)
          }
          label="Cache Trace"
        />
        <Toggle
          checked={!!cacheTrace.includeMessages}
          onChange={(v) =>
            updateConfig(
              ["diagnostics", "cacheTrace", "includeMessages"],
              v,
            )
          }
          label="Include Messages"
        />
        <Toggle
          checked={!!cacheTrace.includePrompt}
          onChange={(v) =>
            updateConfig(["diagnostics", "cacheTrace", "includePrompt"], v)
          }
          label="Include Prompt"
        />
        <Toggle
          checked={!!cacheTrace.includeSystem}
          onChange={(v) =>
            updateConfig(["diagnostics", "cacheTrace", "includeSystem"], v)
          }
          label="Include System"
        />
      </div>
    </div>
  );
}
