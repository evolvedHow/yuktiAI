import { useState } from "react";
import { useDebate } from "./hooks/useDebate";
import { Sidebar } from "./components/Sidebar";
import { DebateTranscript } from "./components/DebateTranscript";
import { SettingsModal } from "./components/SettingsModal";
import { CustomTopicModal } from "./components/CustomTopicModal";
import { Topic } from "./types";

export default function App() {
  const {
    topicFiles,
    selectedTopicFile,
    selectTopicFile,
    topics,
    customTopics,
    addCustomTopic,
    removeCustomTopic,
    activeTopic,
    messages,
    status,
    settings,
    updateSettings,
    error,
    agentNames,
    startDebate,
    askQuestion,
    requestConclusion,
    gateState,
    advanceTurn,
    pauseGate,
    resumeGate,
    backendStatus,
    revealing,
    skipReveal,
    reviewState,
    debateStyles,
    activeStyle,
    setActiveStyle,
  } = useDebate();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customTopicModalOpen, setCustomTopicModalOpen] = useState(false);

  function handleSelectTopic(topic: Topic) {
    if (status === "active" || status === "concluding") {
      const ok = confirm(
        "A debate is currently running. Starting a new topic will stop it. Continue?",
      );
      if (!ok) return;
    }
    void startDebate(topic);
  }

  /** Manually entered topics are also saved so they can be re-run later. */
  function handleCustomTopic(topic: Topic) {
    addCustomTopic(topic);
    handleSelectTopic(topic);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Left sidebar */}
      <Sidebar
        topicFiles={topicFiles}
        selectedTopicFile={selectedTopicFile}
        onSelectTopicFile={selectTopicFile}
        topics={topics}
        customTopics={customTopics}
        onRemoveCustomTopic={removeCustomTopic}
        activeTopic={activeTopic}
        status={status}
        onSelectTopic={handleSelectTopic}
        onAsk={askQuestion}
        onConclude={requestConclusion}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenCustomTopic={() => setCustomTopicModalOpen(true)}
        debateStyles={debateStyles}
        activeStyle={activeStyle}
        onSelectStyle={setActiveStyle}
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
          agentNames={agentNames}
          gateState={gateState}
          onAdvance={advanceTurn}
          onPause={pauseGate}
          onResume={resumeGate}
          revealing={revealing}
          onSkipReveal={skipReveal}
          reviewState={reviewState}
        />
      </main>

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          backendStatus={backendStatus}
          onSave={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Custom topic modal */}
      <CustomTopicModal
        isOpen={customTopicModalOpen}
        onClose={() => setCustomTopicModalOpen(false)}
        onTopicSelect={handleCustomTopic}
      />
    </div>
  );
}
