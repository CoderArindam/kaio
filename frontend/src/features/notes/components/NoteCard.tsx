import React from "react";
import { Pin, FileText, Pencil, ImageIcon, Trash2 } from "lucide-react";
import type { Note } from "../../../store/notesStore";

interface NoteCardProps {
  note: Note;
  isActive: boolean;
  onClick: () => void;
  onTogglePin?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
}

const typeIcon = {
  richtext: <FileText className="w-3.5 h-3.5" />,
  drawing: <Pencil className="w-3.5 h-3.5" />,
  image: <ImageIcon className="w-3.5 h-3.5" />,
};

const typeColor = {
  richtext: "text-brand-primary",
  drawing: "text-emerald-500",
  image: "text-violet-500",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function getPreview(note: Note): string {
  if (note.content_type === "richtext" && note.rich_content) {
    // Extract text from TipTap JSON
    const content = note.rich_content as {
      content?: { content?: { text?: string }[] }[];
    };
    const texts: string[] = [];
    const walk = (
      nodes: { type?: string; text?: string; content?: unknown[] }[],
    ) => {
      for (const n of nodes) {
        if (n.text) texts.push(n.text);
        if (n.content)
          walk(
            n.content as {
              type?: string;
              text?: string;
              content?: unknown[];
            }[],
          );
      }
    };
    if (content.content)
      walk(
        content.content as {
          type?: string;
          text?: string;
          content?: unknown[];
        }[],
      );
    return texts.join(" ").trim().slice(0, 80);
  }
  if (note.content_type === "drawing") return "Freehand drawing";
  if (note.content_type === "image") return "Image note";
  return "";
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  isActive,
  onClick,
  onTogglePin,
  onDelete,
}) => {
  const preview = getPreview(note);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all duration-150 group cursor-pointer select-none
        ${
          isActive
            ? "bg-amber-500/10 border-amber-500/30 shadow-sm"
            : "bg-brand-surface/60 border-brand-border/50 hover:bg-brand-surface hover:border-brand-border"
        }`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 shrink-0 ${typeColor[note.content_type]}`}>
          {typeIcon[note.content_type]}
        </span>
        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[13px] font-medium text-brand-text truncate block">
              {note.title?.trim() || "Untitled note"}
            </span>
            {preview && (
              <p className="text-[11px] text-brand-text-muted mt-0.5 line-clamp-2 leading-relaxed">
                {preview}
              </p>
            )}
            <span className="text-[10px] text-brand-text-muted/60 mt-1 block">
              {formatDate(note.updated_at)}
            </span>
          </div>

          <div className="flex flex-col items-center gap-4 shrink-0 -mr-1">
            {onTogglePin && (
              <button
                onClick={onTogglePin}
                className={`p-1 rounded-md transition-all ${
                  note.is_pinned
                    ? "opacity-100 hover:bg-amber-500/20"
                    : "opacity-0 group-hover:opacity-100 hover:bg-brand-surface-high"
                }`}
                title={note.is_pinned ? "Unpin note" : "Pin note"}
              >
                <Pin
                  className={`w-3.5 h-3.5 ${
                    note.is_pinned
                      ? "text-amber-500 fill-amber-500"
                      : "text-brand-text-muted hover:text-amber-500"
                  }`}
                />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500 text-brand-text-muted"
                title="Delete note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
