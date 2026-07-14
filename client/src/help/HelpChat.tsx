import { useEffect, useRef, useState } from "react";
import type { HelpChatMessage } from "@shared/api";
import * as api from "../api";

const SUGGESTIONS = [
  "How do I get started?",
  "What is a plateau?",
  "Why is a skill not scored?",
  "How do drills work?",
];

const GREETING: HelpChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm the Master Chess help assistant. Ask me how anything works — uploading games, your player model, drills, the training plan — and I'll explain it. What can I help with?",
};

export function HelpChat({ screen, onClose }: { screen: string; onClose: () => void }) {
  const [messages, setMessages] = useState<HelpChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages.filter((m) => m !== GREETING);
    const nextMessages: HelpChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    try {
      // Send only real turns (drop the canned greeting) to the API.
      const payload: HelpChatMessage[] = [...history, { role: "user", content: question }];
      const res = await api.helpChat(payload, screen);
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            err instanceof Error && err.message
              ? `Sorry — I couldn't reach the assistant (${err.message}). Try again in a moment.`
              : "Sorry — I couldn't reach the assistant. Try again in a moment.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="help-chat" role="dialog" aria-label="Help assistant">
      <header className="help-chat-header">
        <div>
          <div className="help-chat-title">Help assistant</div>
          <div className="help-chat-subtitle">Answers grounded in how Master Chess actually works</div>
        </div>
        <button type="button" className="help-chat-close" onClick={onClose} aria-label="Close help">
          ✕
        </button>
      </header>

      <div className="help-chat-messages" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`help-msg help-msg-${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy ? <div className="help-msg help-msg-assistant help-msg-typing">…</div> : null}
        {messages.length === 1 ? (
          <div className="help-suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="help-suggestion" onClick={() => void send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <form
        className="help-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          maxLength={2000}
          disabled={busy}
          aria-label="Ask the help assistant"
        />
        <button type="submit" className="help-chat-send" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
