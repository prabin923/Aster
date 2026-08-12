import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, HelpCircle, KeyRound, MonitorCheck, Save, ShieldCheck } from "lucide-react";
import { safeCaptureCapability } from "../native/capture-capability";
import type { AppSettings, CaptureCapability, CaptureMode, CapturePrivacyTest, CaptureStatus, ProviderStatus } from "../types";

interface SettingsProps {
  settings: AppSettings;
  audioDevices: MediaDeviceInfo[];
  providerStatus?: ProviderStatus;
  captureStatus?: CaptureStatus;
  onSave(settings: AppSettings): Promise<void>;
  onSaveKey(provider: string, key: string): Promise<ProviderStatus>;
  onDeleteKey(provider: string): Promise<void>;
  onCaptureExclusionChange(enabled: boolean): Promise<CaptureCapability>;
  onRunCapturePrivacyTest(): Promise<CapturePrivacyTest>;
  onHealthCheck(): Promise<void>;
}

const providerModels: Record<string, string> = {
  mock: "aster-mock-stream", openai: "gpt-4.1-mini", gemini: "gemini-3.6-flash", claude: "claude-sonnet-4-5",
};

const modeLabel: Record<CaptureMode, string> = {
  native_exclusion: "Native exclusion",
  app_controlled_exclusion: "App-controlled exclusion",
  window_sharing_recommended: "Window sharing recommended",
  unsupported: "Unsupported",
};

export function Settings({ settings, audioDevices, providerStatus, captureStatus, onSave, onSaveKey, onDeleteKey, onCaptureExclusionChange, onRunCapturePrivacyTest, onHealthCheck }: SettingsProps) {
  const [draft, setDraft] = useState(settings);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" }>();
  const [showShareInstructions, setShowShareInstructions] = useState(false);
  const [captureTest, setCaptureTest] = useState<CapturePrivacyTest>();
  const capability = safeCaptureCapability(captureStatus);
  const appOwnedStream = captureStatus?.appOwnedStream;
  const keyRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(settings), [settings]);
  const updateNested = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => { await onSave(draft); setNotice({ message: "Settings saved locally.", tone: "success" }); };
  const selectedProviderStatus = providerStatus?.provider === draft.ai.provider ? providerStatus : undefined;
  const saveKey = async () => {
    const key = keyRef.current?.value ?? "";
    if (!key.trim()) return;
    try {
      const status = await onSaveKey(draft.ai.provider, key);
      if (keyRef.current) keyRef.current.value = "";
      setNotice({ message: `${status.message} Select Save settings to make this provider active.`, tone: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : typeof error === "string" ? error : String(error || "Check native secure storage and retry.");
      setNotice({ message: `Could not store API key: ${message}`, tone: "error" });
    }
  };
  const changeProvider = (provider: AppSettings["ai"]["provider"]) => updateNested("ai", { ...draft.ai, provider, model: providerModels[provider] });
  const changeExclusion = async (enabled: boolean) => {
    const capability = await onCaptureExclusionChange(enabled);
    updateNested("general", { ...draft.general, screenShareExclusion: capability.enabled });
    setNotice({ message: capability.message, tone: capability.enabled ? "success" : "error" });
  };
  const runCaptureTest = async () => {
    const result = await onRunCapturePrivacyTest();
    setCaptureTest(result);
  };

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
      <div className="mb-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Settings</p><h2 className="mt-1 text-base font-semibold text-zinc-100">Private, local-first controls</h2></div>
      <div className="space-y-3">
        <SettingsCard title="General">
          <Field label="Theme"><select value={draft.general.theme} onChange={(event) => updateNested("general", { ...draft.general, theme: event.target.value as AppSettings["general"]["theme"] })}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></Field>
          <Field label={`Overlay opacity — ${Math.round(draft.general.overlayOpacity * 100)}%`}><input value={draft.general.overlayOpacity} onChange={(event) => updateNested("general", { ...draft.general, overlayOpacity: Number(event.target.value) })} min="0.55" max="1" step="0.01" type="range" /></Field>
          <Toggle label="Always on top" checked={draft.general.alwaysOnTop} onChange={(alwaysOnTop) => updateNested("general", { ...draft.general, alwaysOnTop })} />
          <Toggle label="Follow active window" checked={draft.general.followActiveWindow} onChange={(followActiveWindow) => updateNested("general", { ...draft.general, followActiveWindow })} />
          <Field label="Overlay position"><select value={draft.general.position} onChange={(event) => updateNested("general", { ...draft.general, position: event.target.value })}><option value="top-right">Top right</option><option value="top-left">Top left</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option><option value="center">Center</option></select></Field>
          <Field label="Primary shortcut"><input value={draft.general.shortcut} onChange={(event) => updateNested("general", { ...draft.general, shortcut: event.target.value })} /></Field>
        </SettingsCard>
        <SettingsCard title="Audio">
          <Field label="Speech-to-text provider"><select value={draft.audio.sttProvider} onChange={(event) => updateNested("audio", { ...draft.audio, sttProvider: event.target.value as AppSettings["audio"]["sttProvider"] })}><option value="mock">Mock (offline development)</option><option value="native">Native macOS speech recognition</option><option value="browser">Browser speech recognition (WebView dependent)</option></select></Field>
          <Field label="Microphone"><select value={draft.audio.inputDevice} onChange={(event) => updateNested("audio", { ...draft.audio, inputDevice: event.target.value })}><option value="default">System default</option>{audioDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></Field>
          <Toggle label="Auto-listen on start" checked={draft.audio.autoListening} onChange={(autoListening) => updateNested("audio", { ...draft.audio, autoListening })} />
          <Toggle label="Retain transcript history" checked={draft.audio.retainTranscript} onChange={(retainTranscript) => updateNested("audio", { ...draft.audio, retainTranscript })} />
          <p className="text-[10px] leading-4 text-zinc-500">Native macOS speech requests permission from Apple and uses the system input device. Browser recognition may be unavailable in a desktop WebView.</p>
        </SettingsCard>
        <SettingsCard title="Screen context">
          <Toggle label="Enable screen context" checked={draft.screen.enabled} onChange={(enabled) => updateNested("screen", { ...draft.screen, enabled })} />
          <Toggle label="Use local OCR" checked={draft.screen.ocrEnabled} onChange={(ocrEnabled) => updateNested("screen", { ...draft.screen, ocrEnabled })} />
          <Toggle label="Retain screen-derived text" checked={draft.screen.retainContext} onChange={(retainContext) => updateNested("screen", { ...draft.screen, retainContext })} />
        </SettingsCard>
        <SettingsCard title="Screen-share privacy">
          <div className="flex items-center justify-between gap-2"><div><p className="text-[11px] font-medium text-zinc-200">Screen-share behavior</p><p className="mt-0.5 text-[10px] text-zinc-500">Native result from the desktop layer.</p></div><CapabilityBadge mode={capability?.mode} /></div>
          {capability?.mode === "native_exclusion" && <><Toggle label="Screen-share exclusion" checked={capability.enabled} onChange={changeExclusion} /><p className="rounded-lg bg-zinc-900/70 px-2.5 py-2 text-[10px] leading-4 text-zinc-400">{capability.enabled ? "Native capture exclusion active." : "Native capture exclusion inactive."} {capability.message}</p></>}
          {capability?.mode === "window_sharing_recommended" && <><div className="rounded-lg bg-amber-400/5 px-2.5 py-2 text-[10px] leading-4 text-zinc-400"><p className="mb-1 flex items-center gap-1.5 font-semibold text-amber-200"><HelpCircle className="h-3.5 w-3.5" /> Window sharing recommended</p><p>{capability.message}</p></div><button onClick={() => setShowShareInstructions((value) => !value)} className="w-full rounded-lg border border-amber-400/25 bg-amber-400/5 px-2.5 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10">How to share safely</button>{showShareInstructions && <ShareInstructions />}</>}
          {capability?.mode === "unsupported" && <div className="rounded-lg bg-zinc-900/70 px-2.5 py-2 text-[10px] leading-4 text-zinc-500"><p className="mb-1 flex items-center gap-1.5 font-semibold text-zinc-300"><CircleAlert className="h-3.5 w-3.5" /> Unsupported</p><p>{capability.message}</p></div>}
          {!capability && <p className="rounded-lg bg-zinc-900/70 px-2.5 py-2 text-[10px] text-zinc-500">Checking native capture capability…</p>}
          {appOwnedStream && <div className="rounded-lg border border-sky-400/15 bg-sky-400/5 px-2.5 py-2 text-[10px] leading-4 text-zinc-400"><p className="mb-1 flex items-center gap-1.5 font-semibold text-sky-200"><MonitorCheck className="h-3.5 w-3.5" /> {appOwnedStream.enabled ? "App-controlled exclusion verified" : "App-controlled exclusion available"}</p><p>{appOwnedStream.message}</p></div>}
          <div className="border-t border-zinc-800/80 pt-2"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Capture Privacy Test</p><button onClick={runCaptureTest} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"><MonitorCheck className="h-3.5 w-3.5" /> Run capture privacy test</button></div>
          {captureTest && <CaptureTestReport test={captureTest} />}
        </SettingsCard>
        <SettingsCard title="AI">
          <Field label="Provider"><select value={draft.ai.provider} onChange={(event) => changeProvider(event.target.value as AppSettings["ai"]["provider"])}><option value="mock">Mock — works offline</option><option value="openai">OpenAI</option><option value="gemini">Gemini</option><option value="claude">Claude</option></select></Field>
          <Field label="Model"><input value={draft.ai.model} onChange={(event) => updateNested("ai", { ...draft.ai, model: event.target.value })} /></Field>
          <Field label={`Temperature — ${draft.ai.temperature.toFixed(2)}`}><input value={draft.ai.temperature} onChange={(event) => updateNested("ai", { ...draft.ai, temperature: Number(event.target.value) })} min="0" max="1" step="0.05" type="range" /></Field>
          <Field label="Max output tokens"><input value={draft.ai.maxOutput} onChange={(event) => updateNested("ai", { ...draft.ai, maxOutput: Number(event.target.value) })} min="64" max="2048" type="number" /></Field>
          <Toggle label="Stream response text" checked={draft.ai.streaming} onChange={(streaming) => updateNested("ai", { ...draft.ai, streaming })} />
          {draft.ai.provider !== "mock" && <div className="rounded-xl border border-zinc-800 bg-black/20 p-2.5"><p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-300"><KeyRound className="h-3.5 w-3.5 text-violet-300" /> {selectedProviderStatus?.configured ? selectedProviderStatus.credentialStorage === "session" ? "Session-only key is ready" : "A key is stored securely" : "Add API key"}</p><div className="flex gap-2"><input ref={keyRef} autoComplete="off" className="min-w-0 flex-1" type="password" placeholder="Paste once — never shown again" /><button onClick={saveKey} className="rounded-lg bg-zinc-800 px-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700">Store</button></div>{selectedProviderStatus?.configured && <button onClick={() => onDeleteKey(draft.ai.provider)} className="mt-2 text-[10px] text-rose-300 hover:text-rose-200">Remove stored key</button>}</div>}
          {draft.ai.provider !== "mock" && selectedProviderStatus?.configured && settings.ai.provider === draft.ai.provider && <button onClick={() => onHealthCheck()} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800">Test provider connection</button>}
        </SettingsCard>
        <SettingsCard title="Privacy">
          <Toggle label="Conversation history" checked={draft.privacy.conversationHistory} onChange={(conversationHistory) => updateNested("privacy", { ...draft.privacy, conversationHistory })} />
          <Toggle label="Use active-window metadata in AI requests" checked={draft.privacy.aiContextualization} onChange={(aiContextualization) => updateNested("privacy", { ...draft.privacy, aiContextualization })} />
          <Toggle label="Telemetry" checked={draft.privacy.telemetry} onChange={(telemetry) => updateNested("privacy", { ...draft.privacy, telemetry })} />
          <p className="flex gap-1.5 text-[10px] leading-4 text-zinc-500"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />Active-window details stay local unless this toggle is enabled. Raw audio and screenshots are never persisted; telemetry is off by default and never includes prompts, transcripts, screenshots, or keys.</p>
        </SettingsCard>
      </div>
      <button onClick={save} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-2.5 text-sm font-semibold text-white hover:bg-violet-400"><Save className="h-4 w-4" /> Save settings</button>
      {notice && <p className={`mt-2 flex items-center justify-center gap-1.5 text-xs ${notice.tone === "success" ? "text-emerald-300" : "text-rose-300"}`}>{notice.tone === "success" ? <Check className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}{notice.message}</p>}
    </section>
  );
}

function CapabilityBadge({ mode }: { mode?: CaptureMode }) {
  const tone = mode === "native_exclusion" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : mode === "app_controlled_exclusion" ? "border-sky-400/25 bg-sky-400/10 text-sky-200" : mode === "window_sharing_recommended" ? "border-amber-400/25 bg-amber-400/10 text-amber-200" : "border-zinc-700 bg-zinc-900 text-zinc-400";
  return <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${tone}`}>{mode ? modeLabel[mode] : "Checking"}</span>;
}

function ShareInstructions() {
  return <ol className="list-decimal space-y-1 rounded-lg border border-amber-400/15 bg-black/20 px-7 py-3 text-[10px] leading-4 text-zinc-400"><li>Keep the Aster overlay visible locally.</li><li>In Zoom, Meet, or Teams, choose the specific meeting/application window when possible.</li><li>Do not select <strong>Entire Screen</strong> if you do not want other windows included.</li><li>Capture behavior depends on the meeting application's capture implementation.</li></ol>;
}

function CaptureTestReport({ test }: { test: CapturePrivacyTest }) {
  const result = test.result === "pass" ? "Pass" : test.result === "fail" ? "Fail" : "Not applicable";
  return <div className="space-y-1 rounded-lg border border-zinc-800 bg-black/20 px-2.5 py-2 text-[10px] leading-4 text-zinc-500"><p className="font-semibold text-zinc-200">Capture Privacy Test — {result}</p><p>Platform: {test.platform}</p><p>Overlay: {test.overlayDetected ? "Detected" : "Not detected"}</p><p>Native window: {test.nativeWindowDetected ? "Detected" : "Not detected"}</p><p>Capture capability: {modeLabel[test.captureCapability.mode]}</p><p>Exclusion: {test.exclusion === "enabled" ? "Enabled" : "Disabled"}</p>{test.appOwnedStream && <p>App-owned stream: {test.appOwnedStream.enabled ? "App-controlled exclusion" : "Not verified"}</p>}<p>{test.message}</p></div>;
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-zinc-800 bg-zinc-950/45 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-violet-300">{title}</p><div className="space-y-2.5">{children}</div></section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-[11px] font-medium text-zinc-400"><span className="mb-1 block">{label}</span>{children}</label>; }
function Toggle({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange(value: boolean): void }) { return <label className={`flex items-center justify-between gap-3 text-[11px] ${disabled ? "cursor-not-allowed text-zinc-600" : "cursor-pointer text-zinc-300"}`}><span>{label}</span><input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-violet-400 disabled:opacity-50" type="checkbox" /></label>; }
