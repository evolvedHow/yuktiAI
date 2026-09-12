import { useState } from "react";
import { useDebate } from "./hooks/useDebate";
import { Sidebar } from "./components/Sidebar";
import { DebateTranscript } from "./components/DebateTranscript";
import { SettingsModal } from "./components/SettingsModal";
import { KeyVaultModal } from "./components/KeyVaultModal";
import { CustomTopicModal } from "./components/CustomTopicModal";
import { describeConfigProblem } from "./debate/gateway";
import { Topic } from "./types";

export default function App() {
  const {
    topicFiles,
    selectedTopicFile,
    selectTopicFile,
    topics,
    customTopics,
    addCustomTopic,
    updateCustomTopic,
    removeCustomTopic,
    topicMeta,
    topicVotes,
    setTopicTone,
    voteTopic,
    reviewTopic,
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
    gatewayInfo,
    revealing,
    skipReveal,
    reviewState,
    debateStyles,
    activeStyle,
    setActiveStyle,
  } = useDebate();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  /** The managed topic being edited; null/undefined = adding a new one. */
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);

  const configProblem = describeConfigProblem(settings, gatewayInfo);

  function handleSelectTopic(topic: Topic) {
    if (status === "active" || status === "concluding") {
      const ok = confirm(
        "A debate is currently running. Starting a new topic will stop it. Continue?",
      );
      if (!ok) return;
    }
    void startDebate(topic);
  }

  function openCreateEditor() {
    setEditingTopic(null);
    setEditorOpen(true);
  }

  function openEditEditor(topic: Topic) {
    // Topics without a saved copy (file topics) are materialised before editing.
    setEditingTopic(topic);
    setEditorOpen(true);
  }

  /** Editor save: create-or-update. Deliberately does NOT auto-start a debate. */
  function handleEditorSave(topic: Topic) {
    if (editingTopic && customTopics.some((t) => t.id === editingTopic.id)) {
      updateCustomTopic(editingTopic.id, topic);
    } else {
      addCustomTopic(topic);
    }
    setEditorOpen(false);
    setEditingTopic(null);
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
        topicMeta={topicMeta}
        topicVotes={topicVotes}
        onSetTopicTone={setTopicTone}
        onVoteTopic={voteTopic}
        onEditTopic={openEditEditor}
        onRemoveCustomTopic={removeCustomTopic}
        activeTopic={activeTopic}
        status={status}
        onSelectTopic={handleSelectTopic}
        onAsk={askQuestion}
        onConclude={requestConclusion}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenCustomTopic={openCreateEditor}
        debateStyles={debateStyles}
        activeStyle={activeStyle}
        onSelectStyle={setActiveStyle}
      />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Setup warning — persistent until the LLM is configured */}
        {configProblem && (
          <div className="shrink-0 flex items-center gap-3 px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900">
            <span>⚙️</span>
            <span>{configProblem}</span>
            <button
              onClick={() => setVaultOpen(true)}
              className="ml-auto shrink-0 font-medium underline decoration-dotted hover:text-amber-950"
            >
              🔑 Open Key Vault
            </button>
          </div>
        )}

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
          onOpenVault={() => setVaultOpen(true)}
        />
      )}

      {/* Key Vault modal */}
      {vaultOpen && (
        <KeyVaultModal
          settings={settings}
          onSave={updateSettings}
          onClose={() => setVaultOpen(false)}
        />
      )}

      {/* Topic editor modal */}
      <CustomTopicModal
        isOpen={editorOpen}
        topic={editingTopic}
        configReady={!configProblem}
        reviewEnabled={settings.reviewNewTopics}
        onClose={() => {
          setEditorOpen(false);
          setEditingTopic(null);
        }}
        onSave={handleEditorSave}
        onReview={reviewTopic}
      />
    </div>
  );
}