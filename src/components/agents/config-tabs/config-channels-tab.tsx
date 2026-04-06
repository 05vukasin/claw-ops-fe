"use client";

import {
  Field,
  SectionHeader,
  Toggle,
  SegmentBtn,
  INPUT_BASE,
  type ConfigObj,
} from "../agent-config-panel";

interface Props {
  config: ConfigObj;
  updateConfig: (path: string[], value: unknown) => void;
}

export function ConfigChannelsTab({ config, updateConfig }: Props) {
  const channels = config?.channels ?? {};
  const slack = channels?.slack ?? {};
  const telegram = channels?.telegram ?? {};
  const whatsapp = channels?.whatsapp ?? {};

  const setSlack = (field: string, value: unknown) =>
    updateConfig(["channels", "slack", field], value);
  const setTelegram = (field: string, value: unknown) =>
    updateConfig(["channels", "telegram", field], value);
  const setWhatsapp = (field: string, value: unknown) =>
    updateConfig(["channels", "whatsapp", field], value);

  return (
    <div className="space-y-5">
      {/* Slack */}
      <SectionHeader>Slack</SectionHeader>
      {!channels.slack ? (
        <p className="text-[11px] text-canvas-muted">
          Slack is not configured for this agent.
        </p>
      ) : (
        <div className="space-y-3 rounded-md border border-canvas-border p-3">
          <Toggle
            checked={slack.enabled !== false}
            onChange={(v) => setSlack("enabled", v)}
            label="Enabled"
          />
          <Field label="Streaming">
            <SegmentBtn
              options={["partial", "full", "off"]}
              value={slack.streaming ?? "off"}
              onChange={(v) => setSlack("streaming", v)}
            />
          </Field>
          <Field label="DM Policy">
            <select
              value={slack.dmPolicy ?? "pairing"}
              onChange={(e) => setSlack("dmPolicy", e.target.value)}
              className={INPUT_BASE}
            >
              <option value="pairing">Pairing</option>
              <option value="allowlist">Allowlist</option>
              <option value="open">Open</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
          <Toggle
            checked={!!slack.nativeStreaming}
            onChange={(v) => setSlack("nativeStreaming", v)}
            label="Native Streaming"
          />
          <Toggle
            checked={!!slack.blockStreaming}
            onChange={(v) => setSlack("blockStreaming", v)}
            label="Block Streaming"
          />
        </div>
      )}

      {/* Telegram */}
      <SectionHeader>Telegram</SectionHeader>
      <div className="rounded-md border border-canvas-border p-3">
        <Toggle
          checked={telegram.enabled !== false && !!channels.telegram}
          onChange={(v) => setTelegram("enabled", v)}
          label="Enabled"
        />
      </div>

      {/* WhatsApp */}
      <SectionHeader>WhatsApp</SectionHeader>
      {!channels.whatsapp ? (
        <p className="text-[11px] text-canvas-muted">
          WhatsApp is not configured for this agent.
        </p>
      ) : (
        <div className="space-y-3 rounded-md border border-canvas-border p-3">
          <Toggle
            checked={whatsapp.enabled !== false}
            onChange={(v) => setWhatsapp("enabled", v)}
            label="Enabled"
          />
          <Field label="DM Policy">
            <select
              value={whatsapp.dmPolicy ?? "allowlist"}
              onChange={(e) => setWhatsapp("dmPolicy", e.target.value)}
              className={INPUT_BASE}
            >
              <option value="allowlist">Allowlist</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
          <Field label="Allow From" optional>
            <textarea
              rows={3}
              value={
                Array.isArray(whatsapp.allowFrom)
                  ? whatsapp.allowFrom.join(", ")
                  : whatsapp.allowFrom ?? ""
              }
              onChange={(e) =>
                setWhatsapp(
                  "allowFrom",
                  e.target.value
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="Comma-separated phone numbers"
              className={`${INPUT_BASE} resize-none font-mono text-[11px]`}
            />
          </Field>
          <Field label="Group Policy">
            <select
              value={whatsapp.groupPolicy ?? "disabled"}
              onChange={(e) => setWhatsapp("groupPolicy", e.target.value)}
              className={INPUT_BASE}
            >
              <option value="allowed">Allowed</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}
