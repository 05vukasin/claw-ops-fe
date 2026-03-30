"use client";

import { useCallback, useState } from "react";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";
import {
  UploadZone,
  FileTreePreview,
  ScriptEditor,
} from "@/components/zip-generator";
import { analyzeZip, type ZipAnalysis } from "@/lib/zip-analyzer";
import { createScriptApi } from "@/lib/api";

type WizardStep = 1 | 2 | 3;

const STEP_LABELS = ["Upload", "Preview", "Generate"];

export default function ZipGeneratorPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ZipAnalysis | null>(null);
  const [script, setScript] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const result = await analyzeZip(buf);
      if (result.stats.totalFiles === 0) {
        setError("The ZIP archive is empty.");
        setAnalyzing(false);
        return;
      }
      setAnalysis(result);
      setStep(2);
    } catch {
      setError("Failed to parse ZIP file. It may be corrupted.");
    }
    setAnalyzing(false);
  }, [file]);

  const handleSaveAsScript = useCallback(
    async (content: string, name: string) => {
      setSaving(true);
      try {
        await createScriptApi({
          name: name.trim(),
          scriptType: "INSTALL",
          description: `Generated from ${file?.name ?? "ZIP archive"}`,
          scriptContent: content,
        });
      } catch {
        setError("Failed to save script.");
      }
      setSaving(false);
    },
    [file],
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <h2 className="mb-1 text-lg font-semibold tracking-tight text-canvas-fg">
        ZIP Generator
      </h2>
      <p className="mb-6 text-xs text-canvas-muted">
        Upload a ZIP archive and generate an interactive deployment script
      </p>

      {/* Step indicator */}
      <StepIndicator current={step} labels={STEP_LABELS} />

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
            onFileAccepted={(f) => { setFile(f); setError(null); }}
            onClear={() => { setFile(null); setAnalysis(null); setError(null); }}
            onAnalyze={handleAnalyze}
          />
        )}

        {step === 2 && analysis && (
          <FileTreePreview analysis={analysis} />
        )}

        {step === 3 && analysis && (
          <ScriptEditor
            analysis={analysis}
            zipFileName={file?.name ?? "archive.zip"}
            script={script}
            onScriptChange={setScript}
            onSaveAsScript={handleSaveAsScript}
            saving={saving}
          />
        )}
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
