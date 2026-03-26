import { useState } from "react";
import { useDebate } from "./hooks/useDebate";
import { Sidebar } from "./components/Sidebar";
import { DebateTranscript } from "./components/DebateTranscript";
import { SettingsModal } from "./components/SettingsModal";
import { Topic } from "./types";

export default function App() {
  const {
    topics,
    activeTopic,
    messages,
    status,
    settings,
    updateSettings,
    error,
    startDebate,
    askQuestion,
    requestConclusion,
    gateState,
    advanceTurn,
    pauseGate,
    resumeGate,
  } = useDebate();

  const [settingsOpen, setSettingsOpen] = useState(false);

  function handleSelectTopic(topic: Topic) {
    if (status === "active" || status === "concluding") {
      const ok = confirm(
        "A debate is currently running. Starting a new topic will stop it. Continue?",
      );
      if (!ok) return;
    }
    void startDebate(topic);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Left sidebar */}
      <Sidebar
        topics={topics}
        activeTopic={activeTopic}
        status={status}
        onSelectTopic={handleSelectTopic}
        onAsk={askQuestion}
        onConclude={requestConclusion}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Error banner */}
        {error && (
          <div className="shrink-0 flex items-center gap-3 px-6 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
            <span className="font-medium">Error:</span>
            <span>{error}</span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="ml-auto underline text-xs hover:text-red-900"
            >
              Open Settings
            </button>
          </div>
        )}

        {/* Transcript */}
        <DebateTranscript
          topic={activeTopic}
          messages={messages}
          status={status}
          gateState={gateState}
          onAdvance={advanceTurn}
          onPause={pauseGate}
          onResume={resumeGate}
        />
      </main>

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onSave={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
