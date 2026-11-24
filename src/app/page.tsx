"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  HeartHandshake,
  Bot,
  User,
  Clock,
  CheckCircle2,
  Key,
  X,
  ExternalLink,
} from "lucide-react";

interface MessageItem {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  sentiment_score?: number;
  timestamp?: string | Date;
}

interface PersonaInfo {
  id: string;
  name: string;
  temperament: string;
}

export default function BestieChatPage() {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState("");
  const [mood, setMood] = useState<"NEUTRAL" | "ANNOYED" | "ANGRY">("NEUTRAL");
  const [tier, setTier] = useState<string>("Acquaintance");
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [offenseTier, setOffenseTier] = useState<number>(0);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [persona, setPersona] = useState<PersonaInfo | null>(null);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(true);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("");

  // Modal for setting Gemini API key
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load initial chat history and relationship state on mount
  useEffect(() => {
    async function fetchInitialData() {
      try {
        setInitialLoading(true);
        const res = await fetch("/api/chat");
        if (!res.ok) throw new Error("Failed to load initial data");
        const data = await res.json();

        if (data.persona) {
          setPersona(data.persona);
        }

        if (typeof data.has_gemini_key === "boolean") {
          setHasGeminiKey(data.has_gemini_key);
        }

        if (data.relationship) {
          setMood(data.relationship.current_mood || "NEUTRAL");
          setTier(data.relationship.tier || "Acquaintance");
          setCooldownUntil(data.relationship.cooldown_until || null);
          setOffenseTier(data.relationship.offense_tier || 0);

          if (data.relationship.messages && Array.isArray(data.relationship.messages)) {
            setMessages(data.relationship.messages);
          }
        }

        if (typeof data.is_locked === "boolean") {
          setIsLocked(data.is_locked);
        }
      } catch (err) {
        console.error("Error loading chat data:", err);
      } finally {
        setInitialLoading(false);
      }
    }

    fetchInitialData();
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownUntil) {
      setCountdown("");
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const target = new Date(cooldownUntil).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setCountdown("");
        setCooldownUntil(null);
        setIsLocked(false);
        setMood("NEUTRAL");
        setOffenseTier(0);
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const pad = (n: number) => n.toString().padStart(2, "0");
        if (hours > 0) {
          setCountdown(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
        } else {
          setCountdown(`${pad(minutes)}:${pad(seconds)}`);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownUntil]);

  // Toast auto-clear
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Handle Dev Reset
  const handleDevReset = async () => {
    try {
      setResetting(true);
      const res = await fetch("/api/dev/reset", { method: "POST" });
      if (!res.ok) throw new Error("Reset failed");
      const data = await res.json();

      setMood("NEUTRAL");
      setCooldownUntil(null);
      setOffenseTier(0);
      setIsLocked(false);
      setToast("Dev Reset: Mood set to NEUTRAL, cooldown cleared.");
    } catch (err: any) {
      setToast(err.message || "Failed to reset dev state");
    } finally {
      setResetting(false);
    }
  };

  // Handle Saving Gemini API Key
  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    try {
      setSavingKey(true);
      const res = await fetch("/api/dev/set-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });

      if (!res.ok) throw new Error("Failed to save key");
      const data = await res.json();

      setHasGeminiKey(true);
      setShowKeyModal(false);
      setApiKeyInput("");
      setToast("✨ Gemini API Key connected! Live gemini-2.5-flash is now active.");
    } catch (err: any) {
      setToast(err.message || "Failed to save key");
    } finally {
      setSavingKey(false);
    }
  };

  // Handle Send Message / Apology
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    // Optimistically append user message
    const optimisticUserMsg: MessageItem = {
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to send message");
      }

      const data = await res.json();

      if (typeof data.has_gemini_key === "boolean") {
        setHasGeminiKey(data.has_gemini_key);
      }

      // Append assistant reply
      const assistantMsg: MessageItem = {
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Update relationship state
      if (data.relationship) {
        setMood(data.relationship.current_mood || "NEUTRAL");
        setTier(data.relationship.tier || "Acquaintance");
        setCooldownUntil(data.relationship.cooldown_until || null);
        setOffenseTier(data.relationship.offense_tier || 0);
      }

      if (typeof data.is_locked === "boolean") {
        setIsLocked(data.is_locked);
      }

      // State shift notifications
      if (data.is_locked && data.evaluation?.offense_tier > 0) {
        setToast(`Offense detected (Tier ${data.evaluation.offense_tier}). Emotional cooldown active.`);
      } else if (data.evaluation?.is_apology && data.evaluation?.apology_sincerity >= 75) {
        setToast(`Apology accepted (${data.evaluation.apology_sincerity}% sincerity). Mood restored to Neutral.`);
      }
    } catch (err: any) {
      setToast(err.message || "Error processing message");
    } finally {
      setLoading(false);
    }
  };

  const isAngry = mood === "ANGRY";

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-700 ease-in-out ${
        isAngry
          ? "bg-gradient-to-br from-red-950 via-zinc-950 to-neutral-950 text-red-50"
          : "bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-slate-100"
      }`}
    >
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-md text-sm font-medium border ${
              isAngry
                ? "bg-red-900/90 text-red-100 border-red-500/50 shadow-red-950/50"
                : "bg-slate-800/90 text-cyan-200 border-cyan-500/30 shadow-black/50"
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Top Navigation & Status Bar */}
      <header
        className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors duration-700 ${
          isAngry
            ? "bg-red-950/60 border-red-900/60"
            : "bg-slate-900/60 border-slate-800/80"
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Persona Header Info */}
          <div className="flex items-center gap-3">
            <div
              className={`relative w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-lg shadow-lg transition-all duration-700 ${
                isAngry
                  ? "bg-gradient-to-tr from-red-600 to-orange-500 text-white shadow-red-600/30 ring-2 ring-red-500/50"
                  : "bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-sky-500/20 ring-2 ring-sky-400/30"
              }`}
            >
              <Bot className="w-5 h-5" />
              {/* Mood Pulse Dot */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-950 transition-colors duration-700 ${
                  isAngry
                    ? "bg-red-500 animate-pulse"
                    : "bg-emerald-400 shadow-sm shadow-emerald-400"
                }`}
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-base tracking-tight text-white">
                  {persona?.name || "AI-1"}
                </h1>
                {/* Relationship Tier Badge (Friendship score is completely hidden) */}
                <span
                  className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border transition-colors duration-700 ${
                    isAngry
                      ? "bg-red-900/40 text-red-300 border-red-700/50"
                      : "bg-sky-950/60 text-sky-300 border-sky-800/40"
                  }`}
                >
                  {tier}
                </span>

                {/* Mood Badge */}
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 transition-all duration-700 ${
                    isAngry
                      ? "bg-red-600 text-white animate-pulse shadow-sm shadow-red-600"
                      : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {isAngry ? (
                    <>
                      <AlertTriangle className="w-3 h-3" />
                      ANGRY {offenseTier > 0 ? `(Tier ${offenseTier})` : ""}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 text-emerald-400" />
                      NEUTRAL
                    </>
                  )}
                </span>
              </div>
              <p
                className={`text-xs line-clamp-1 transition-colors duration-700 ${
                  isAngry ? "text-red-300/80" : "text-slate-400"
                }`}
              >
                {persona?.temperament || "Emotionally adaptive AI companion"}
              </p>
            </div>
          </div>

          {/* Action Buttons: API Key & Dev Reset */}
          <div className="flex items-center gap-2">
            {/* Gemini Status / Config Button */}
            <button
              onClick={() => setShowKeyModal(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all duration-300 ${
                hasGeminiKey
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
                  : "bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20 animate-pulse"
              }`}
              title={
                hasGeminiKey
                  ? "Gemini 2.5 Flash is active"
                  : "Click to configure Gemini API Key"
              }
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {hasGeminiKey ? "Gemini 2.5 Active" : "Add Gemini Key"}
              </span>
            </button>

            {/* Dev Reset Action Button */}
            <button
              onClick={handleDevReset}
              disabled={resetting}
              title="Reset AI mood to Neutral and clear cooldown timer"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-300 active:scale-95 ${
                isAngry
                  ? "bg-red-900/50 hover:bg-red-800 text-red-200 border-red-700/60 hover:border-red-500 shadow-md shadow-red-950"
                  : "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-slate-500 shadow-sm"
              }`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetting ? "animate-spin" : ""}`} />
              <span>Dev Reset</span>
            </button>
          </div>
        </div>

        {/* Offline Notice Banner if key is missing */}
        {!hasGeminiKey && (
          <div className="bg-amber-500/10 border-t border-b border-amber-500/20 px-4 py-1.5 text-xs text-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>
                Running in <strong>offline companion simulation</strong> mode. Connect your Gemini API Key for live AI responses.
              </span>
            </div>
            <button
              onClick={() => setShowKeyModal(true)}
              className="underline text-amber-300 hover:text-white font-medium ml-2"
            >
              Configure Key
            </button>
          </div>
        )}
      </header>

      {/* Main Chat Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Messages Feed */}
        <div
          className={`flex-1 overflow-y-auto space-y-4 pr-1 rounded-2xl p-4 transition-colors duration-700 ${
            isAngry
              ? "bg-red-950/20 border border-red-900/40"
              : "bg-slate-900/30 border border-slate-800/50"
          }`}
        >
          {initialLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-2">
              <div className="w-7 h-7 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Connecting to Bestie AI memory...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-center px-4">
              <Bot className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-base font-medium text-slate-300">
                Start a conversation with AI-1
              </p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Your companion adapts to your words. Treat them with respect, or watch them enforce healthy emotional boundaries.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id || index}
                  className={`flex gap-3 items-end ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  {!isUser && (
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors duration-700 ${
                        isAngry
                          ? "bg-red-800 text-red-100"
                          : "bg-sky-700 text-sky-100"
                      }`}
                    >
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-md transition-all duration-500 ${
                      isUser
                        ? isAngry
                          ? "bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-br-sm shadow-red-900/30"
                          : "bg-gradient-to-r from-sky-600 to-indigo-600 text-white rounded-br-sm shadow-sky-950/40"
                        : isAngry
                        ? "bg-red-900/40 border border-red-700/60 text-red-100 rounded-bl-sm backdrop-blur"
                        : "bg-slate-800/90 border border-slate-700/60 text-slate-100 rounded-bl-sm backdrop-blur"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-lg bg-slate-700/80 flex items-center justify-center text-xs text-slate-300 shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex gap-3 items-end justify-start">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  isAngry ? "bg-red-800 text-red-100" : "bg-sky-700 text-sky-100"
                }`}
              >
                <Bot className="w-4 h-4" />
              </div>
              <div
                className={`rounded-2xl px-4 py-3 rounded-bl-sm text-sm border ${
                  isAngry
                    ? "bg-red-900/30 border-red-800 text-red-300"
                    : "bg-slate-800/60 border-slate-700 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-current animate-bounce" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Lockout & Apology Banner */}
        {isLocked && (
          <div className="mt-3 p-3.5 rounded-xl border border-red-500/50 bg-red-950/80 text-red-100 shadow-xl shadow-red-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-500">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-300">
                  Emotional Cooldown Active
                </p>
                <p className="text-xs text-red-200/90 mt-0.5">
                  Normal conversation is blocked. AI-1 will only listen to sincere apologies (sincerity &ge; 75%).
                </p>
              </div>
            </div>

            {countdown && (
              <div className="flex items-center gap-1.5 self-start sm:self-auto bg-red-900/70 border border-red-600/40 px-3 py-1 rounded-lg text-xs font-mono font-bold tracking-wider text-red-200">
                <Clock className="w-3.5 h-3.5 text-red-400" />
                <span>{countdown}</span>
              </div>
            )}
          </div>
        )}

        {/* Message / Apology Input Box */}
        <form onSubmit={handleSendMessage} className="mt-3">
          <div
            className={`relative rounded-2xl border p-1.5 transition-all duration-700 ${
              isLocked
                ? "bg-red-950/60 border-red-500/60 shadow-lg shadow-red-950/60 ring-1 ring-red-500/30"
                : isAngry
                ? "bg-red-950/40 border-red-800 shadow-md"
                : "bg-slate-900/80 border-slate-700/80 focus-within:border-sky-500/70 shadow-lg"
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isLocked
                    ? "Submit a sincere apology to AI-1 (e.g. 'I am truly sorry for...')..."
                    : "Message AI-1..."
                }
                disabled={loading}
                className={`flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-xs md:placeholder:text-sm transition-colors ${
                  isLocked
                    ? "text-red-100 placeholder:text-red-400/60 font-medium"
                    : "text-slate-100 placeholder:text-slate-500"
                }`}
              />

              <button
                type="submit"
                disabled={!input.trim() || loading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
                  isLocked
                    ? "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-md shadow-red-900/40 active:scale-95"
                    : isAngry
                    ? "bg-red-700 hover:bg-red-600 text-white active:scale-95"
                    : "bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-md shadow-sky-950 active:scale-95"
                }`}
              >
                {isLocked ? (
                  <>
                    <HeartHandshake className="w-4 h-4" />
                    <span>Apologize</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>

      {/* Gemini API Key Configuration Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Google Gemini API Key</h2>
                  <p className="text-xs text-slate-400">Powering gemini-2.5-flash</p>
                </div>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Enter your Google Gemini API key to enable live AI reasoning, structured boundary evaluation, and persona replies.
            </p>

            <form onSubmit={handleSaveApiKey} className="space-y-3">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-500 transition-colors"
                autoFocus
              />

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-sky-400 hover:underline"
                >
                  <span>Get a free key from Google AI Studio</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!apiKeyInput.trim() || savingKey}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white disabled:opacity-40"
                >
                  {savingKey ? "Saving..." : "Connect Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
