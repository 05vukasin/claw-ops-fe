"use client";

import { useCallback, useState } from "react";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";
import {
  UploadZone,
  FileTreePreview,
  ScriptEditor,
  AgentScriptEditor,
} from "@/components/zip-generator";
import { analyzeZip, type ZipAnalysis } from "@/lib/zip-analyzer";
import { createScriptApi } from "@/lib/api";

type WizardStep = 1 | 2 | 3;
type GeneratorMode = "deployment" | "agent";

const STEP_LABELS = ["Upload", "Preview", "Generate"];

export default function ZipGeneratorPage() {
  const [mode, setMode] = useState<GeneratorMode>("deployment");
  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ZipAnalysis | null>(null);
  const [script, setScript] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateWarning, setTemplateWarning] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    setTemplateWarning(null);
    try {
      const buf = await file.arrayBuffer();
      const result = await analyzeZip(buf);
      if (result.stats.totalFiles === 0) {
        setError("The ZIP archive is empty.");
        setAnalyzing(false);
        return;
      }
      if (mode === "agent") {
        const hasConfig = result.entries.some(
          (e) =>
            e.path === "config/openclaw.json" ||
            e.path.endsWith("/config/openclaw.json"),
        );
        if (!hasConfig) {
          setTemplateWarning(
            "No config/openclaw.json found. This ZIP may not be a valid agent template.",
          );
        }
      }
      setAnalysis(result);
      setStep(2);
    } catch {
      setError("Failed to parse ZIP file. It may be corrupted.");
    }
    setAnalyzing(false);
  }, [file, mode]);

  const handleSaveAsScript = useCallback(
    async (content: string, name: string) => {
      setSaving(true);
      try {
        await createScriptApi({
          name: name.trim(),
          scriptType: "INSTALL",
          description:
            mode === "agent"
              ? `Agent provisioning script from ${file?.name ?? "ZIP archive"}`
              : `Generated from ${file?.name ?? "ZIP archive"}`,
          scriptContent: content,
        });
      } catch {
        setError("Failed to save script.");
      }
      setSaving(false);
    },
    [file, mode],
  );

  const handleModeChange = useCallback(
    (newMode: GeneratorMode) => {
      setMode(newMode);
      if (step === 3) setStep(2);
      setScript("");
      setTemplateWarning(null);
    },
    [step],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <h2 className="mb-1 text-lg font-semibold tracking-tight text-canvas-fg">
        ZIP Generator
      </h2>
      <p className="mb-4 text-xs text-canvas-muted">
        {mode === "deployment"
          ? "Upload a ZIP archive and generate an interactive deployment script"
          : "Upload an agent template ZIP and generate a self-contained provisioning script"}
      </p>

      {/* Mode selector */}
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-lg border border-canvas-border bg-canvas-bg p-0.5">
          <button
            type="button"
            onClick={() => handleModeChange("deployment")}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              mode === "deployment"
                ? "bg-canvas-fg text-canvas-bg"
                : "text-canvas-muted hover:text-canvas-fg"
            }`}
          >
            Deployment Script
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("agent")}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              mode === "agent"
                ? "bg-canvas-fg text-canvas-bg"
                : "text-canvas-muted hover:text-canvas-fg"
            }`}
          >
            Agent Script
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} labels={STEP_LABELS} />

      {/* Template warning */}
      {templateWarning && (
        <div className="mb-4 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-4 py-2.5 text-sm text-yellow-600 dark:text-yellow-400">
          {templateWarning}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm text-red-500 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="mb-6">
        {step === 1 && (
          <UploadZone
            file={file}
            analyzing={analyzing}
            onFileAccepted={(f) => {
              setFile(f);
              setError(null);
            }}
            onClear={() => {
              setFile(null);
              setAnalysis(null);
              setError(null);
              setTemplateWarning(null);
            }}
            onAnalyze={handleAnalyze}
          />
        )}

        {step === 2 && analysis && <FileTreePreview analysis={analysis} />}

        {step === 3 &&
          analysis &&
          (mode === "deployment" ? (
            <ScriptEditor
              analysis={analysis}
              zipFileName={file?.name ?? "archive.zip"}
              script={script}
              onScriptChange={setScript}
              onSaveAsScript={handleSaveAsScript}
              saving={saving}
            />
          ) : (
            <AgentScriptEditor
              analysis={analysis}
              zipFileName={file?.name ?? "archive.zip"}
              script={script}
              onScriptChange={setScript}
              onSaveAsScript={handleSaveAsScript}
              saving={saving}
            />
          ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1) as WizardStep)}
            className="flex items-center gap-1.5 rounded-md border border-canvas-border px-4 py-1.5 text-sm text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiArrowLeft size={13} />
            Back
          </button>
        ) : (
          <span />
        )}

        {step > 1 && step < 3 && (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(3, s + 1) as WizardStep)}
            className="flex items-center gap-1.5 rounded-md bg-canvas-fg px-5 py-1.5 text-sm font-medium text-canvas-bg transition-opacity hover:opacity-90"
          >
            Next
            <FiArrowRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step Indicator                                                     */
/* ------------------------------------------------------------------ */

function StepIndicator({
  current,
  labels,
}: {
  current: number;
  labels: string[];
}) {
  return (
    <div className="mb-8 flex items-center justify-center gap-1">
      {labels.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;

        return (
          <div key={label} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`hidden h-px w-6 sm:block ${
                  isDone ? "bg-canvas-fg" : "bg-canvas-border"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                  isActive
                    ? "bg-canvas-fg text-canvas-bg"
                    : isDone
                      ? "bg-green-500 text-white"
                      : "border border-canvas-border text-canvas-muted"
                }`}
              >
                {stepNum}
              </div>
              <span
                className={`hidden text-[9px] font-medium uppercase tracking-wider sm:block ${
                  isActive ? "text-canvas-fg" : "text-canvas-muted"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
