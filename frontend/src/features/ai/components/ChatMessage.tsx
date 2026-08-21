import React, { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  User, XCircle, AlertTriangle, CheckCircle2,
} from "lucide-react";
import type { ChatMessage as ChatMessageType } from "../types/ai";
import { ExecutionTimeline } from "./ExecutionTimeline";
import { ConfirmationCard } from "./ConfirmationCard";

interface ChatMessageProps {
  message: ChatMessageType;
}

// ─── Markdown customisation ──────────────────────────────────────────────────
const markdownComponents = {
  // Tables → styled with brand tokens
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-3 rounded-xl border border-brand-border shadow-sm">
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-brand-bg border-b border-brand-border">{children}</thead>
  ),
  tbody: ({ children }: any) => <tbody className="divide-y divide-brand-border">{children}</tbody>,
  th: ({ children }: any) => (
    <th className="px-3 py-2 text-left font-semibold text-brand-text-muted text-[12px] uppercase tracking-wide">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="px-3 py-2 text-brand-text">{children}</td>
  ),
  tr: ({ children }: any) => (
    <tr className="hover:bg-brand-bg/40 transition-colors">{children}</tr>
  ),
  // Headings
  h1: ({ children }: any) => <h1 className="text-base font-bold text-brand-text mt-4 mb-2">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-[15px] font-semibold text-brand-text mt-4 mb-2">{children}</h2>,
  h3: ({ children }: any) => (
    <h3 className="text-[14px] font-semibold text-brand-text mt-3 mb-2 flex items-center gap-2">
      {children}
    </h3>
  ),
  // List items — render task-style bullets
  li: ({ children }: any) => (
    <li className="flex items-start gap-2 py-1.5 px-3 rounded-lg hover:bg-brand-bg/60 transition-colors group">
      <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-brand-primary/60 flex-shrink-0 mt-2" />
      <span className="text-brand-text leading-snug">{children}</span>
    </li>
  ),
  ul: ({ children }: any) => (
    <ul className="my-2 flex flex-col gap-0.5 list-none p-0">{children}</ul>
  ),
  // Inline code
  code: ({ children }: any) => (
    <code className="px-1.5 py-0.5 rounded bg-brand-bg border border-brand-border text-[12px] font-mono text-brand-primary">
      {children}
    </code>
  ),
  // Block quote
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-brand-primary/40 pl-3 my-2 text-brand-text-muted italic">
      {children}
    </blockquote>
  ),
  // Strong
  strong: ({ children }: any) => (
    <strong className="font-semibold text-brand-text">{children}</strong>
  ),
  // Paragraphs
  p: ({ children }: any) => (
    <p className="leading-relaxed text-brand-text my-1.5">{children}</p>
  ),
};

// ─── Component ───────────────────────────────────────────────────────────────
export const ChatMessage: React.FC<ChatMessageProps> = memo(({ message }) => {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isTool = message.role === "tool";

  if (isSystem || isTool) return null;

  const isEmptyAssistant =
    !isUser &&
    !message.content &&
    (!message.metadata?.events || message.metadata.events.length === 0);

  const getErrorCard = () => {
    const errText =
      message.metadata?.latestEvent?.error?.toLowerCase() || "";
    if (errText.includes("permission") || errText.includes("unauthorized")) {
      return {
        title: "Permission Denied",
        icon: <AlertTriangle className="w-4 h-4" />,
        msg: "You don't have permission to perform this action.",
        color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
      };
    }
    if (errText.includes("validation") || errText.includes("missing")) {
      return {
        title: "Validation Error",
        icon: <AlertTriangle className="w-4 h-4" />,
        msg: "Please provide all required information.",
        color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
      };
    }
    return {
      title: "Execution Failed",
      icon: <XCircle className="w-4 h-4" />,
      msg: "The action could not be completed. Please try again.",
      color: "text-red-500 bg-red-500/10 border-red-500/20",
    };
  };

  const errorCard = getErrorCard();

  return (
    <div
      className={`flex w-full mb-4 ${
        isUser ? "justify-end" : "justify-start"
      } group animate-fade-in-up`}
    >
      <div
        className={`flex gap-2.5 ${
          isUser ? "flex-row-reverse max-w-[82%]" : "flex-row max-w-[92%] w-full"
        }`}
      >
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm border mt-0.5 ${
            isUser
              ? "bg-brand-primary text-white border-brand-primary/20"
              : "bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 text-white border-white/10"
          }`}
        >
          {isUser ? (
            <User className="w-4 h-4" />
          ) : (
            <div className="font-bold text-[14px] tracking-tight">K</div>
          )}
        </div>

        {/* Bubble */}
        <div
          className={`relative text-[13.5px] leading-relaxed transition-all duration-200 ${
            isUser
              ? "bg-brand-primary text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm"
              : "bg-brand-surface border border-brand-border rounded-2xl rounded-tl-sm shadow-sm overflow-hidden w-full"
          }`}
        >
          {/* Subtle gradient overlay for AI messages */}
          {!isUser && (
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
          )}

          <div
            className={`relative z-10 ${
              isUser ? "text-white/95" : "text-brand-text"
            } ${!isUser ? "px-4 py-3.5" : ""}`}
          >
            {/* Execution Timeline */}
            {!isUser && message.metadata?.events && (
              <ExecutionTimeline events={message.metadata.events} />
            )}

            {/* Thinking */}
            {isEmptyAssistant && (
              <div className="flex items-center gap-2 text-brand-text-muted py-1">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-brand-primary/60 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
                <span className="text-[13px] font-medium">Thinking…</span>
              </div>
            )}

            {/* Main content — rich markdown */}
            {message.content && (
              <div className={isUser ? "text-white/95" : ""}>
                {isUser ? (
                  <p className="leading-relaxed">{message.content}</p>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {message.content}
                  </ReactMarkdown>
                )}
              </div>
            )}

            {/* Confirmation Card */}
            {!isUser &&
              message.metadata?.executionStatus === "WAITING_FOR_CONFIRMATION" &&
              message.metadata?.latestEvent?.plan && (
                <ConfirmationCard
                  plan={message.metadata.latestEvent.plan}
                  reason={message.metadata.latestEvent.reason}
                  messageId={message.id}
                />
              )}

            {/* Cancelled */}
            {!isUser &&
              message.metadata?.executionStatus === "CANCELLED" &&
              !message.content && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-bg border border-brand-border text-brand-text-muted text-[13px]">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Execution cancelled</span>
                </div>
              )}

            {/* Partially Completed */}
            {!isUser &&
              message.metadata?.executionStatus === "PARTIALLY_COMPLETED" && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[13px]">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Some steps failed or were skipped</span>
                </div>
              )}

            {/* Failed */}
            {!isUser && message.metadata?.executionStatus === "FAILED" && (
              <div
                className={`mt-2 flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-[13px] ${errorCard.color}`}
              >
                <span className="flex-shrink-0 mt-0.5">{errorCard.icon}</span>
                <div>
                  <div className="font-semibold mb-0.5">{errorCard.title}</div>
                  <div className="opacity-80">{errorCard.msg}</div>
                </div>
              </div>
            )}

            {/* Completed with result (non-text tools that emit no content) */}
            {!isUser &&
              message.metadata?.executionStatus === "COMPLETED" &&
              message.metadata?.latestEvent?.result &&
              !message.content && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[13px]">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Action completed successfully</span>
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
});
