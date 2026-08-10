import React from 'react';
import { AtSign, Send, Loader2, Reply, X } from 'lucide-react';
import { type Comment } from '../../../../../services/commentsApi';
import { type User } from '../../../../../services/usersApi';
import { UserAvatar } from '../../../../../components/common/UserAvatar';
import { formatUserName } from '../../../../../utils/userHelpers';

interface CommentInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  replyToCommentId: number | null;
  comments: Comment[];
  onCancelReply: () => void;
  showMentions: boolean;
  filteredUsers: User[];
  onInsertMention: (user: User) => void;
  onMentionButtonClick: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export const CommentInput: React.FC<CommentInputProps> = ({
  value,
  onChange,
  onSubmit,
  isSubmitting,
  replyToCommentId,
  comments,
  onCancelReply,
  showMentions,
  filteredUsers,
  onInsertMention,
  onMentionButtonClick,
  textareaRef,
}) => {
  return (
    <div className="pt-4 mt-4 border-t border-brand-border relative">
      {replyToCommentId && (
        <div className="flex justify-between items-center text-xs text-brand-primary mb-2 bg-brand-surface p-2.5 rounded-lg border border-brand-primary/30">
          <span className="flex items-center gap-1.5 font-medium">
            <Reply size={14} /> Replying to{' '}
            <strong className="text-brand-text-primary">
              {(() => {
                const target = comments.find((c) => c.id === replyToCommentId);
                if (!target) return 'comment';
                return formatUserName({
                  first_name: target.user_first_name,
                  last_name: target.user_last_name,
                  email: target.user_email,
                });
              })()}
            </strong>
          </span>
          <button
            onClick={onCancelReply}
            className="p-1 hover:bg-brand-surface-low rounded text-brand-text-muted hover:text-brand-text"
            title="Cancel reply"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {showMentions && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-brand-surface border border-brand-border rounded-lg shadow-xl z-50 max-h-52 overflow-y-auto p-1">
          {filteredUsers.length > 0 ? (
            filteredUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onInsertMention(u)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-brand-surface-highlight rounded-md transition text-brand-text flex items-center gap-2.5"
              >
                <UserAvatar user={u} size="sm" />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-xs leading-none truncate">{formatUserName(u)}</span>
                  {u.email && (
                    <span className="text-[10px] text-brand-text-muted mt-1 leading-none truncate">{u.email}</span>
                  )}
                </div>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-brand-text-muted">No matching members found</div>
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        rows={3}
        placeholder="Add a comment... (Type @ to mention team members)"
        value={value}
        onChange={onChange}
        className="w-full bg-brand-surface border border-brand-border rounded-lg p-3 text-sm outline-none focus:border-brand-primary"
      />

      <div className="flex justify-between mt-3">
        <button
          type="button"
          className="text-brand-text-muted hover:text-brand-primary p-1 rounded transition-colors"
          title="Mention member"
          onClick={onMentionButtonClick}
        >
          <AtSign size={18} />
        </button>

        <button
          onClick={onSubmit}
          disabled={!value.trim() || isSubmitting}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
        >
          {isSubmitting && <Loader2 size={15} className="animate-spin" />}
          {isSubmitting ? 'Sending...' : 'Send'}
          {!isSubmitting && <Send size={15} />}
        </button>
      </div>
    </div>
  );
};

export default CommentInput;
