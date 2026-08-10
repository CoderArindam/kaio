import React from 'react';
import { Reply, Trash2, X, Pencil, Check, Loader2, Smile } from 'lucide-react';
import { type Comment, type CommentReaction } from '../../../../../services/commentsApi';
import { type User } from '../../../../../services/usersApi';
import { UserAvatar } from '../../../../../components/common/UserAvatar';
import { formatUserName } from '../../../../../utils/userHelpers';

const EMOJI_OPTIONS = ['👍', '✅', '❤️'];

interface CommentItemProps {
  comment: Comment;
  isRoot: boolean;
  highlightedCommentId: number | null;
  editingCommentId: number | null;
  editText: string;
  isSavingEdit: boolean;
  activePickerCommentId: number | null;
  isOwner: boolean;
  boardMembers: User[];
  onEditTextChange: (text: string) => void;
  onStartEdit: (comment: Comment) => void;
  onCancelEdit: () => void;
  onSaveEdit: (commentId: number) => void;
  onStartReply: (comment: Comment) => void;
  onDelete: (commentId: number) => void;
  onToggleReaction: (commentId: number, emoji: string) => void;
  onSetActivePicker: (commentId: number | null) => void;
  renderContent: (content: string) => React.ReactNode;
}

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  isRoot,
  highlightedCommentId,
  editingCommentId,
  editText,
  isSavingEdit,
  activePickerCommentId,
  isOwner,
  onEditTextChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onStartReply,
  onDelete,
  onToggleReaction,
  onSetActivePicker,
  renderContent,
}) => {
  const user = {
    first_name: comment.user_first_name,
    last_name: comment.user_last_name,
    email: comment.user_email,
    avatar_url: comment.user_avatar_url,
  };

  const isEditing = editingCommentId === comment.id;
  const isHighlighted = highlightedCommentId === comment.id;
  const isPickerOpen = activePickerCommentId === comment.id;

  const textSize = isRoot ? 'text-sm' : 'text-xs';
  const nameSize = isRoot ? 'text-sm' : 'text-xs';
  const timeSize = isRoot ? 'text-xs' : 'text-[10px]';
  const actionSize = isRoot ? 'text-xs' : 'text-[10px]';
  const iconSize = isRoot ? 14 : 11;
  const avatarSize = isRoot ? 'md' : 'sm';
  const gap = isRoot ? 'gap-3' : 'gap-2';
  const padding = isRoot ? 'p-2' : 'p-1.5';
  const bubbleClass = isRoot
    ? 'bg-brand-surface border border-brand-border rounded-lg p-3'
    : 'bg-brand-surface-low border border-brand-border rounded p-2';
  const textareaRows = isRoot ? 3 : 2;
  const editAreaClass = isRoot
    ? 'w-full bg-brand-surface border border-brand-primary rounded-lg p-2.5 text-sm outline-none text-brand-text focus:ring-1 focus:ring-brand-primary'
    : 'w-full bg-brand-surface border border-brand-primary rounded p-2 text-xs outline-none text-brand-text focus:ring-1 focus:ring-brand-primary';

  return (
    <div
      id={`comment-${comment.id}`}
      className={`flex ${gap} ${padding} rounded-lg transition-all ${isHighlighted ? 'ring-2 ring-brand-primary bg-brand-primary/10' : ''}`}
    >
      <UserAvatar user={user} size={avatarSize} />

      <div className="flex-1">
        <div className="flex justify-between items-center">
          <span className={`font-${isRoot ? 'semibold' : 'medium'} ${nameSize} text-brand-text`}>
            {formatUserName(user)}
          </span>
          <span className={`${timeSize} text-brand-text-muted flex items-center gap-1`}>
            {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {comment.edited_at && (
              <span className={`${isRoot ? 'text-[10px]' : ''} text-brand-text-muted italic ml-${isRoot ? 1 : 0.5}`}>(edited)</span>
            )}
          </span>
        </div>

        {isEditing ? (
          <div className={`mt-${isRoot ? 2 : 1.5} space-y-${isRoot ? 2 : 1.5}`}>
            <textarea
              ref={(el) => {
                if (el) {
                  el.focus();
                  el.setSelectionRange(el.value.length, el.value.length);
                }
              }}
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (editText.trim() !== comment.content.trim()) {
                    onSaveEdit(comment.id);
                  } else {
                    onCancelEdit();
                  }
                } else if (e.key === 'Escape') {
                  onCancelEdit();
                }
              }}
              rows={textareaRows}
              className={editAreaClass}
            />
            <div className={`flex gap-2 justify-end ${isRoot ? 'text-xs' : 'text-[11px]'}`}>
              <button
                onClick={onCancelEdit}
                className="px-2 py-0.5 rounded bg-brand-surface-low text-brand-text-muted hover:text-brand-text border border-brand-border flex items-center gap-1"
              >
                <X size={isRoot ? 13 : 11} /> Cancel
              </button>
              <button
                onClick={() => onSaveEdit(comment.id)}
                disabled={!editText.trim() || editText.trim() === comment.content.trim() || isSavingEdit}
                className="px-2 py-0.5 rounded bg-brand-primary text-white hover:bg-brand-primary-hover flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isSavingEdit ? <Loader2 size={isRoot ? 13 : 11} className="animate-spin" /> : <Check size={isRoot ? 13 : 11} />}
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={`mt-1 ${bubbleClass} ${textSize} whitespace-pre-wrap text-brand-text leading-relaxed`}>
              {renderContent(comment.content)}
            </div>

            {comment.reactions && comment.reactions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {comment.reactions.map((r: CommentReaction) => (
                  <button
                    key={r.emoji}
                    onClick={() => onToggleReaction(comment.id, r.emoji)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${isRoot ? 'text-xs' : 'text-[11px]'} transition-all ${
                      r.reacted
                        ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/40 font-semibold shadow-xs'
                        : 'bg-brand-surface-low text-brand-text-muted border border-brand-border hover:bg-brand-surface-highlight hover:text-brand-text'
                    }`}
                    title={`${r.count} ${r.count === 1 ? 'person' : 'people'} reacted with ${r.emoji}`}
                  >
                    <span>{r.emoji}</span>
                    <span className="text-[10px] font-medium">{r.count}</span>
                  </button>
                ))}
              </div>
            )}

            <div className={`flex items-center gap-${isRoot ? 4 : 3} mt-${isRoot ? 2 : 1} ${actionSize} text-brand-text-muted`}>
              <button
                onClick={() => onStartReply(comment)}
                className={`hover:text-brand-primary flex items-center gap-${isRoot ? 1 : 0.5} font-medium`}
              >
                <Reply size={iconSize} /> Reply
              </button>

              <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onSetActivePicker(isPickerOpen ? null : comment.id)}
                  className={`hover:text-brand-primary flex items-center gap-${isRoot ? 1 : 0.5} font-medium transition-colors`}
                  title="Add reaction"
                >
                  <Smile size={iconSize} /> React
                </button>

                {isPickerOpen && (
                  <div className="absolute left-0 bottom-full mb-1.5 flex items-center gap-1 p-1 bg-brand-surface border border-brand-border rounded-lg shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
                    {EMOJI_OPTIONS.map((emoji) => {
                      const hasReacted = comment.reactions?.some((r) => r.emoji === emoji && r.reacted);
                      return (
                        <button
                          key={emoji}
                          onClick={() => {
                            onToggleReaction(comment.id, emoji);
                            onSetActivePicker(null);
                          }}
                          className={`p-1.5 ${isRoot ? 'text-base' : 'text-sm'} hover:bg-brand-surface-highlight rounded transition-transform hover:scale-125 ${hasReacted ? 'bg-brand-primary/20 rounded-md' : ''}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {isOwner && (
                <>
                  <button
                    onClick={() => onStartEdit(comment)}
                    className={`hover:text-brand-primary flex items-center gap-${isRoot ? 1 : 0.5}`}
                  >
                    <Pencil size={iconSize} /> Edit
                  </button>
                  <button
                    onClick={() => onDelete(comment.id)}
                    className={`hover:text-red-500 flex items-center gap-${isRoot ? 1 : 0.5}`}
                  >
                    <Trash2 size={iconSize} /> Delete
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CommentItem;
