import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { Bot, ChevronDown, CircleHelp, Monitor, Settings2, Sparkles, X } from "lucide-react";
import { AiManager } from "./ai/manager";
import { AudioManager } from "./audio/manager";
import { Chat } from "./components/Chat";
import { ContextPanel } from "./components/ContextPanel";
import { Overlay } from "./components/Overlay";
import { Settings } from "./components/Settings";
import { StatusIndicator } from "./components/StatusIndicator";
import { Transcript } from "./components/Transcript";
import { ContextManager } from "./context/manager";
import { isLikelyQuestion } from "./context/question-detector";
import { native } from "./native/commands";
import { ScreenContextProvider } from "./screen/manager";
import type { AppSettings, CaptureCapability, ChatMessage, LocalCaptureTest, ProviderStatus, ScreenContext, TranscriptSegment } from "./types";
import { defaultSettings } from "./types";
import "./App.css";

type View = "assistant" | "context" | "settings";
const emptyScreen: ScreenContext = { application: "", windowTitle: "", visibleText: "", detectedTopics: [] };

function App() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>();
  const [captureCapability, setCaptureCapability] = useState<CaptureCapability>();
  const [view, setView] = useState<View>("assistant");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [requestId, setRequestId] = useState<string>();
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [partial, setPartial] = useState("");
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [audioError, setAudioError] = useState<string>();
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [screenContext, setScreenContext] = useState<ScreenContext>(emptyScreen);
  const [capturing, setCapturing] = useState(false);
  const [banner, setBanner] = useState("Local mock provider is ready.");

  const contextManager = useRef(new ContextManager());
  const audioManager = useRef(new AudioManager());
  const screenProvider = useRef(new ScreenContextProvider());
  const aiManager = useRef(new AiManager());
  const generateRef = useRef<(override?: string) => Promise<void>>(async () => {});
  const answerRef = useRef("");

  const refreshNativeStatus = useCallback(async () => {
    const [provider, capture] = await Promise.all([native.providerStatus(), native.getCaptureCapability()]);
    setProviderStatus(provider);
    setCaptureCapability(capture);
    setBanner(provider.message);
  }, []);

  useEffect(() => {
    native.getSettings().then((saved) => {
      setSettings(saved);
      document.documentElement.dataset.theme = saved.general.theme;
      if (!saved.screen.enabled) contextManager.current.clearScreenContext();
    }).catch(() => setBanner("Using local defaults — settings store is unavailable."));
    refreshNativeStatus().catch(() => setBanner("Native status is unavailable."));
    return () => { audioManager.current.stop(); };
  }, [refreshNativeStatus]);

  useEffect(() => {
    const refreshDevices = () => audioManager.current.getDevices().then(setAudioDevices).catch(() => setAudioDevices([]));
    refreshDevices();
    return audioManager.current.onDeviceChange(refreshDevices);
  }, []);

  const generate = useCallback(async (override?: string) => {
    const prompt = (override ?? question).trim();
    if (!prompt || generating) return;
    setQuestion(prompt);
    answerRef.current = "";
    setAnswer("");
    setGenerating(true);
    setBanner("Streaming response…");
    try {
      const stream = await aiManager.current.streamResponse(contextManager.current.build(prompt), (delta) => {
        answerRef.current += delta;
        if (settings.ai.streaming) setAnswer(answerRef.current);
      });
      setRequestId(stream.requestId);
      await stream.completion;
      if (!settings.ai.streaming) setAnswer(answerRef.current);
      setHistory((items) => {
        const next = [...items, { id: crypto.randomUUID(), role: "user" as const, content: prompt, createdAt: Date.now() }, { id: crypto.randomUUID(), role: "assistant" as const, content: answerRef.current || "Response generated.", createdAt: Date.now() }];
        return settings.privacy.conversationHistory ? next.slice(-16) : [];
      });
      setBanner("Response complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI provider failed.";
      setAnswer(`**AI unavailable**\n\n${message}\n\nCheck Settings and retry. The app remains usable offline with Mock.`);
      setBanner("AI unavailable — retry when ready.");
    } finally {
      setGenerating(false);
      setRequestId(undefined);
    }
  }, [generating, question, settings.ai.streaming, settings.privacy.conversationHistory]);

  useEffect(() => { generateRef.current = generate; }, [generate]);

  useEffect(() => {
    const shortcut = settings.general.shortcut || "CommandOrControl+Space";
    let disposed = false;
    register(shortcut, (event) => {
      if (event.state === "Pressed") {
        native.toggleOverlay().then(() => window.dispatchEvent(new Event("aster:focus-input"))).catch(() => setBanner(`Shortcut ${shortcut} is unavailable; choose another in Settings.`));
      }
    }).catch(() => setBanner(`Shortcut ${shortcut} is reserved by another app or the OS.`));
    register("CommandOrControl+Shift+Enter", (event) => {
      if (event.state === "Pressed") generateRef.current();
    }).catch(() => { /* optional convenience shortcut */ });
    return () => {
      if (!disposed) {
        disposed = true;
        unregister(shortcut).catch(() => undefined);
        unregister("CommandOrControl+Shift+Enter").catch(() => undefined);
      }
    };
  }, [settings.general.shortcut]);

  const stopGeneration = () => { if (requestId) native.cancelGeneration(requestId); setBanner("Generation cancelled."); };
  const clear = () => {
    contextManager.current.clear();
    setQuestion(""); setAnswer(""); setHistory([]); setTranscript([]); setPartial(""); setScreenContext(emptyScreen);
    setBanner("Conversation and cached context cleared.");
  };

  const addFinalTranscript = (text: string) => {
    if (!text.trim()) return;
    const segment = { id: crypto.randomUUID(), text, final: true, timestamp: Date.now() };
    contextManager.current.addTranscript(segment);
    setTranscript(contextManager.current.getTranscript());
    setPartial("");
    if (autoMode && isLikelyQuestion(text)) {
      setQuestion(text);
      window.setTimeout(() => generateRef.current(text), 0);
    }
  };

  const startListening = async () => {
    setAudioError(undefined);
    try {
      await audioManager.current.start(settings.audio.sttProvider, {
        onPartialTranscript: setPartial,
        onFinalTranscript: addFinalTranscript,
        onError: setAudioError,
      }, settings.audio.inputDevice);
      setListening(true); setPaused(false); setBanner("Microphone on — audio remains in memory only.");
    } catch (error) { setAudioError(error instanceof Error ? error.message : "Microphone unavailable."); }
  };
  const stopListening = async () => { await audioManager.current.stop(); setListening(false); setPaused(false); setPartial(""); setBanner("Microphone off."); };
  const pauseListening = async () => { await audioManager.current.pause(); setPaused(true); };
  const resumeListening = async () => { await audioManager.current.resume(); setPaused(false); };

  const captureScreen = async () => {
    if (!settings.screen.enabled) { setBanner("Enable Screen Context in Settings before capturing."); setView("settings"); return; }
    setCapturing(true);
    try {
      const next = await screenProvider.current.capture();
      contextManager.current.setScreenContext(next);
      setScreenContext(next);
      setBanner(next.visibleText ? "Screen text extracted locally; screenshot discarded." : "No readable text found in the selected capture.");
    } catch (error) { setBanner(error instanceof Error ? error.message : "Screen capture was not approved."); }
    finally { setCapturing(false); }
  };
  const clearScreen = () => { contextManager.current.clearScreenContext(); screenProvider.current.clearContext(); setScreenContext(emptyScreen); setBanner("Screen-derived context cleared."); };

  const saveSettings = async (draft: AppSettings) => {
    const saved = await native.saveSettings(draft);
    setSettings(saved);
    document.documentElement.dataset.theme = saved.general.theme;
    if (!saved.screen.enabled) clearScreen();
    await refreshNativeStatus();
  };
  const saveKey = async (provider: string, key: string) => { await native.saveProviderKey(provider, key); await refreshNativeStatus(); };
  const deleteKey = async (provider: string) => { await native.deleteProviderKey(provider); await refreshNativeStatus(); };
  const setCaptureExclusion = async (enabled: boolean) => {
    const capability = await native.setCaptureExclusion(enabled);
    setCaptureCapability(capability);
    setSettings((current) => ({ ...current, general: { ...current.general, screenShareExclusion: capability.enabled } }));
    setBanner(capability.message);
    return capability;
  };
  const runLocalCaptureTest = async (): Promise<LocalCaptureTest> => {
    const result = await native.runLocalCaptureTest();
    setCaptureCapability(result.capability);
    setBanner(result.supportedCaptureBehavior);
    return result;
  };
  const testProviderConnection = async () => {
    setBanner("Testing provider connection…");
    try {
      const status = await native.healthCheck();
      setProviderStatus(status);
      setBanner(status.message);
    } catch { setBanner("Provider health check failed before it could complete."); }
  };
  const aiStatusLabel = providerStatus?.connected ? "AI connected" : providerStatus?.configured ? "AI configured" : "AI offline";
  const aiStatusTone = providerStatus?.connected ? "ready" : "offline";
  const screenShareLabel = captureCapability?.mode === "native_exclusion" ? (captureCapability.enabled ? "Native exclusion" : "Native exclusion off") : captureCapability?.mode === "window_sharing" ? "Window sharing" : "Unsupported";
  const screenShareTone = captureCapability?.mode === "native_exclusion" && captureCapability.enabled ? "ready" : captureCapability?.mode === "window_sharing" ? "warning" : "offline";

  return (
    <Overlay style={{ opacity: settings.general.overlayOpacity }}>
      <header data-tauri-drag-region className="flex shrink-0 items-center justify-between border-b border-zinc-800/90 px-4 py-3">
        <div data-tauri-drag-region className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/15 text-violet-300"><Sparkles className="h-4 w-4" /></span><div data-tauri-drag-region><p className="text-sm font-bold tracking-tight text-zinc-100">Aster</p><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Native real-time assistant</p></div></div>
        <div className="flex items-center gap-2" data-tauri-drag-region><StatusIndicator label={aiStatusLabel} tone={aiStatusTone} /><button data-tauri-drag-region="false" onClick={() => getCurrentWindow().minimize()} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Minimize"><ChevronDown className="h-4 w-4" /></button><button data-tauri-drag-region="false" onClick={() => getCurrentWindow().close()} className="rounded-md p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-300" title="Close"><X className="h-4 w-4" /></button></div>
      </header>
      <nav className="grid shrink-0 grid-cols-3 gap-1 border-b border-zinc-800/90 px-3 py-2" aria-label="Aster sections">
        <Tab active={view === "assistant"} onClick={() => setView("assistant")} icon={<Bot className="h-3.5 w-3.5" />} label="Assistant" />
        <Tab active={view === "context"} onClick={() => setView("context")} icon={<Monitor className="h-3.5 w-3.5" />} label="Context" />
        <Tab active={view === "settings"} onClick={() => setView("settings")} icon={<Settings2 className="h-3.5 w-3.5" />} label="Settings" />
      </nav>
      {view === "assistant" && <Chat question={question} answer={answer} history={history} generating={generating} onQuestionChange={setQuestion} onGenerate={() => generate()} onStop={stopGeneration} onClear={clear} />}
      {view === "context" && <section className="min-h-0 flex-1 overflow-y-auto space-y-3 px-4 pb-4 pt-3"><div className="rounded-xl border border-zinc-800 bg-zinc-950/45 px-3 py-2"><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Privacy indicators</p><div className="flex flex-wrap gap-x-4 gap-y-1"><StatusIndicator label={listening ? "Mic on" : "Mic off"} tone={listening ? "active" : "offline"} /><StatusIndicator label={settings.screen.enabled ? "Screen context on" : "Screen context off"} tone={settings.screen.enabled ? "active" : "offline"} /><StatusIndicator label={`Screen-share: ${screenShareLabel}`} tone={screenShareTone} /><StatusIndicator label={aiStatusLabel} tone={aiStatusTone} /></div></div><Transcript listening={listening} paused={paused} partial={partial} transcript={transcript} autoMode={autoMode} error={audioError} onStart={startListening} onStop={stopListening} onPause={pauseListening} onResume={resumeListening} onAutoMode={setAutoMode} /><ContextPanel screenEnabled={settings.screen.enabled} screenContext={screenContext} capturing={capturing} onCapture={captureScreen} onClear={clearScreen} /><p className="flex items-start gap-1.5 px-1 text-[10px] leading-4 text-zinc-500"><CircleHelp className="mt-0.5 h-3 w-3 shrink-0" />Automatic mode only responds to likely questions and can be turned off anytime. Audio and screenshots are discarded by default.</p></section>}
      {view === "settings" && <Settings settings={settings} audioDevices={audioDevices} providerStatus={providerStatus} captureCapability={captureCapability} onSave={saveSettings} onSaveKey={saveKey} onDeleteKey={deleteKey} onCaptureExclusionChange={setCaptureExclusion} onRunCaptureTest={runLocalCaptureTest} onHealthCheck={testProviderConnection} />}
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800/90 px-4 py-2 text-[10px] text-zinc-500"><span className="truncate">{banner}</span><span className="shrink-0 text-zinc-600">{settings.general.shortcut}</span></footer>
    </Overlay>
  );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick(): void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition ${active ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"}`}>{icon}{label}</button>;
}

export default App;
