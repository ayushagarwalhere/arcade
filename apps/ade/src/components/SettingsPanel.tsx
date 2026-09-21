"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ADE_THEMES } from "@/lib/ade-themes";
import { DEFAULTS, updateSettings, useSettings, type Settings } from "@/lib/settings";
import type { RunnableAgent } from "@arcade/core/desktop";

const LABEL = "text-[12px] text-ade-fg/85";
const HINT = "mt-0.5 text-[11.5px] leading-[1.45] text-ade-faint";
const FIELD = "h-6 rounded border border-ade-line bg-ade-editor px-1.5 text-[12px] text-ade-fg outline-none focus:border-white/25";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ade-line px-4 py-3 first:border-t-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ade-fg/80">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <span className={`mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border transition ${value ? "border-ade-fg bg-ade-fg text-black" : "border-ade-faint"}`}>{value && <Check className="h-3 w-3" strokeWidth={3} />}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span className="min-w-0">
        <span className={LABEL}>{label}</span>
        {hint && <span className={`block ${HINT}`}>{hint}</span>}
      </span>
    </label>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={LABEL}>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`${FIELD} w-16 text-right font-mono`} />
    </div>
  );
}

export default function SettingsPanel({ agents }: { agents: RunnableAgent[] | null }) {
  const s = useSettings();
  const set = (patch: Partial<Settings>) => updateSettings(patch);
  const [shells, setShells] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    void window.arcade?.terminal?.shells().then(setShells, () => {});
  }, []);

  return (
    <div className="pb-6">
      <Group title="Color theme">
        <div className="grid grid-cols-2 gap-1.5">
          {ADE_THEMES.map((t) => {
            const on = t.id === s.themeId;
            return (
              <button key={t.id} onClick={() => set({ themeId: t.id })} title={t.name} aria-pressed={on} className={`overflow-hidden rounded border text-left transition ${on ? "border-ade-fg" : "border-ade-line hover:border-white/25"}`}>
                {/* A thumbnail drawn in the theme's own colours: chrome strip, then three "lines of code". */}
                <div className="flex h-10" style={{ background: t.chrome.editor }}>
                  <div className="w-3" style={{ background: t.chrome.chrome, borderRight: `1px solid ${t.chrome.line}` }} />
                  <div className="flex flex-1 flex-col justify-center gap-[3px] px-1.5">
                    {[
                      [t.syntax.keyword, 10, t.syntax.func, 16],
                      [t.syntax.string, 20, t.syntax.number, 6],
                      [t.syntax.comment, 24, t.syntax.type, 0],
                    ].map(([a, aw, b, bw], i) => (
                      <div key={i} className="flex gap-1">
                        <span className="h-[3px] rounded-full" style={{ background: a as string, width: aw as number }} />
                        {(bw as number) > 0 && <span className="h-[3px] rounded-full" style={{ background: b as string, width: bw as number }} />}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 px-1.5 py-1 text-[11px] text-ade-fg/85">
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {on && <Check className="h-3 w-3 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Editor">
        <Stepper label="Font size" value={s.fontSize} min={10} max={24} onChange={(fontSize) => set({ fontSize })} />
        <Stepper label="Tab size" value={s.tabSize} min={1} max={8} onChange={(tabSize) => set({ tabSize })} />
        <Toggle label="Word wrap" value={s.wordWrap} onChange={(wordWrap) => set({ wordWrap })} />
        <Toggle label="Minimap" value={s.minimap} onChange={(minimap) => set({ minimap })} />
        <Toggle label="Line numbers" value={s.lineNumbers} onChange={(lineNumbers) => set({ lineNumbers })} />
        <Toggle label="Auto save" hint="Save a file when the editor loses focus." value={s.autoSave} onChange={(autoSave) => set({ autoSave })} />
      </Group>

      <Group title="Agent">
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className={LABEL}>Run with</span>
            <select value={s.agentId} onChange={(e) => set({ agentId: e.target.value })} className={`${FIELD} max-w-[150px]`}>
              <option value="">First installed</option>
              {agents?.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.runnable}>
                  {a.name}
                  {a.runnable ? "" : " (not installed)"}
                </option>
              ))}
            </select>
          </div>
          {!agents && <p className={HINT}>Agents run on your machine; this list fills in inside the desktop app.</p>}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className={LABEL}>Model</span>
            <input value={s.agentModel} onChange={(e) => set({ agentModel: e.target.value.trim() })} placeholder="agent's default" spellCheck={false} className={`${FIELD} w-[150px] font-mono`} />
          </div>
          <p className={HINT}>Passed to the agent&apos;s own CLI, e.g. <span className="font-mono">sonnet</span> or <span className="font-mono">haiku</span> for Claude Code. A smaller model makes each turn cheaper. Empty uses whatever the agent is set to.</p>
        </div>
        <Toggle label="Let the agent edit files" hint="Off makes every turn read-only: it can look and explain, not change anything." value={s.agentMode === "edit"} onChange={(v) => set({ agentMode: v ? "edit" : "read" })} />
      </Group>

      <Group title="Security loop">
        <Toggle label="Run the project's tests before committing a fix" hint="Uses the test command the project declares. A failing run leaves the change uncommitted for you to review." value={s.testsBeforeCommit} onChange={(testsBeforeCommit) => set({ testsBeforeCommit })} />
        <Toggle
          label="Push and open the pull request without asking"
          hint="A verified fix is always committed to its own branch. Off (recommended) stops before anything leaves this machine."
          value={s.shipMode === "auto"}
          onChange={(v) => set({ shipMode: v ? "auto" : "ask" })}
        />
      </Group>

      {shells.length > 0 && (
        <Group title="Terminal">
          <div className="flex items-center justify-between gap-3">
            <span className={LABEL}>Shell</span>
            <select value={s.shell} onChange={(e) => set({ shell: e.target.value })} className={`${FIELD} max-w-[170px]`}>
              <option value="">Default ({shells[0].name})</option>
              {shells.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.name}
                </option>
              ))}
            </select>
          </div>
        </Group>
      )}

      <div className="px-4 pt-1">
        <button onClick={() => updateSettings(DEFAULTS)} className="h-6 rounded border border-ade-line px-2 text-[11.5px] text-ade-muted transition hover:bg-ade-raised hover:text-ade-fg">
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
