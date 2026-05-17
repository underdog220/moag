// ParamsForm — generischer Param-Editor für Upload-Operationen.
// Zeigt je nach Operation: Prompt-Textarea, Engine-Select oder nichts.

import type { UploadOperation } from "../../lib/uploadOperations";

export interface UploadParams {
  prompt?: string;
  engine?: string;
}

export interface ParamsFormProps {
  operation: UploadOperation;
  params: UploadParams;
  onChange: (params: UploadParams) => void;
}

export function ParamsForm({ operation, params, onChange }: ParamsFormProps) {
  const hasPrompt = operation.requires_prompt;
  const hasEngine =
    operation.requires_engine_choice &&
    operation.requires_engine_choice.length > 0;

  if (!hasPrompt && !hasEngine) return null;

  return (
    <div className="flex flex-col gap-3" data-testid={`params-form-${operation.id}`}>
      {/* Prompt-Textarea */}
      {hasPrompt && (
        <div>
          <label
            htmlFor={`prompt-${operation.id}`}
            className="mb-1 block text-xs font-medium text-fg-muted"
          >
            Prompt <span className="text-status-error" aria-label="Pflichtfeld">*</span>
          </label>
          <textarea
            id={`prompt-${operation.id}`}
            data-testid={`params-prompt-${operation.id}`}
            rows={3}
            value={params.prompt ?? ""}
            onChange={(e) => onChange({ ...params, prompt: e.target.value })}
            placeholder="z.B. Fasse dieses Dokument auf Deutsch zusammen."
            className="w-full resize-y rounded-lg border border-white/10 bg-bg-elevated
                       px-3 py-2 text-sm text-fg placeholder-fg-subtle
                       focus:border-brand/60 focus:outline-none focus:ring-1 focus:ring-brand/40"
          />
        </div>
      )}

      {/* Engine-Select */}
      {hasEngine && (
        <div>
          <label
            htmlFor={`engine-${operation.id}`}
            className="mb-1 block text-xs font-medium text-fg-muted"
          >
            Engine
          </label>
          <select
            id={`engine-${operation.id}`}
            data-testid={`params-engine-${operation.id}`}
            value={params.engine ?? operation.requires_engine_choice![0]}
            onChange={(e) => onChange({ ...params, engine: e.target.value })}
            className="w-full rounded-lg border border-white/10 bg-bg-elevated
                       px-3 py-2 text-sm text-fg
                       focus:border-brand/60 focus:outline-none focus:ring-1 focus:ring-brand/40"
          >
            {operation.requires_engine_choice!.map((eng) => (
              <option key={eng} value={eng}>
                {eng}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default ParamsForm;
