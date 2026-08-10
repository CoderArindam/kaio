import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import {
  getTaskComments,
  createComment,
  updateComment,
  deleteComment,
  toggleCommentReaction,
  type Comment,
  type CommentReaction,
} from '../../../../../services/commentsApi';
import { type Task } from '../../../../../services/tasksApi';
import { type User, getBoardMembers, getUsers } from '../../../../../services/usersApi';
import toast from 'react-hot-toast';
import { useActivityStore } from '../../../../../store/activityStore';
import ConfirmDialog from '../../../../../components/common/ConfirmDialog';
import { formatUserName } from '../../../../../utils/userHelpers';
import { useUiStore } from '../../../../../store/uiStore';
import { CommentItem } from './CommentItem';
import { CommentInput } from './CommentInput';

interface CommentsTabProps {
  task: Task;
  currentUserId: number | null;
  users: User[];
}

const CommentsTab: React.FC<CommentsTabProps> = ({ task, currentUserId, users }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyToCommentId, setReplyToCommentId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [boardMembers, setBoardMembers] = useState<User[]>(users || []);

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const highlightedCommentId = useUiStore((state) => state.highlightedCommentId);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [activePickerCommentId, setActivePickerCommentId] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleClickOutside = () => setActivePickerCommentId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadMembers = async () => {
      try {
        let members: User[] = users || [];
        if (members.length === 0 && task.board_id) {
          members = await getBoardMembers(task.board_id);
        }
        if (members.length === 0) {
          members = await getUsers();
        }
        if (isMounted && members.length > 0) {
          setBoardMembers(members);
        }
      } catch (err) {
        console.error('Failed to load members for mentions', err);
      }
    };
    loadMembers();
    return () => { isMounted = false; };
  }, [task.board_id, users]);

  const fetchComments = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await getTaskComments(task.id);
      setComments(data);
    } catch (error) {
      console.error('Failed to fetch comments', error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => { fetchComments(true); }, [task.id]);

  useEffect(() => {
    const handleCommentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.task_id === task.id) {
        fetchComments(false);
      }
    };
    window.addEventListener('kaio:comment_updated', handleCommentUpdated);
    return () => window.removeEventListener('kaio:comment_updated', handleCommentUpdated);
  }, [task.id]);

  useEffect(() => {
    if (!isLoading && comments.length > 0 && highlightedCommentId) {
      setTimeout(() => {
        const el = document.getElementById(`comment-${highlightedCommentId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [isLoading, comments.length, highlightedCommentId]);

  const handleToggleReaction = async (commentId: number, emoji: string) => {
    const targetComment = comments.find((c) => c.id === commentId);
    if (!targetComment) return;
    const currentReactions = targetComment.reactions || [];
    const existingReaction = currentReactions.find((r) => r.emoji === emoji);
    const currentlyReacted = existingReaction?.reacted || false;

    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const prevReactions = c.reactions || [];
        const existing = prevReactions.find((r) => r.emoji === emoji);
        let nextReactions: CommentReaction[] = [];
        if (existing) {
          if (existing.reacted) {
            nextReactions =
              existing.count <= 1
                ? prevReactions.filter((r) => r.emoji !== emoji)
                : prevReactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r));
          } else {
            nextReactions = prevReactions.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r
            );
          }
        } else {
          nextReactions = [...prevReactions, { emoji, count: 1, reacted: true }];
        }
        return { ...c, reactions: nextReactions };
      })
    );

    try {
      await toggleCommentReaction(commentId, emoji, currentlyReacted);
    } catch (error: any) {
      console.error('Failed to toggle comment reaction', error);
      toast.error('Failed to update reaction');
      fetchComments(false);
    }
  };

  const handleStartReply = (targetComment: Comment) => {
    setReplyToCommentId(targetComment.id);
    const authorUser = {
      first_name: targetComment.user_first_name,
      last_name: targetComment.user_last_name,
      email: targetComment.user_email,
    };
    const authorName = formatUserName(authorUser);
    if (authorName && !newCommentText.toLowerCase().includes(`@${authorName.toLowerCase()}`)) {
      setNewCommentText((prev) => (prev ? `@${authorName} ${prev}` : `@${authorName} `));
    }
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const handleStartEdit = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditText(comment.content);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditText('');
  };

  const handleSaveEdit = async (commentId: number) => {
    const targetComment = comments.find((c) => c.id === commentId);
    const trimmed = editText.trim();
    if (!trimmed || isSavingEdit) return;
    if (targetComment && trimmed === targetComment.content.trim()) {
      handleCancelEdit();
      return;
    }
    setIsSavingEdit(true);
    const previousComments = [...comments];
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, content: trimmed, edited_at: new Date().toISOString() } : c
      )
    );
    try {
      const updated = await updateComment(task.id, commentId, { content: trimmed });
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      toast.success('Comment updated');
      setEditingCommentId(null);
      setEditText('');
    } catch (error: any) {
      setComments(previousComments);
      console.error('Failed to edit comment', error);
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to edit comment');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const extractMentionedUserIds = (text: string, memberList: User[]): number[] => {
    const ids = new Set<number>();
    const tokenRegex = /@\[([^\]]+)\]\(user:(\d+)\)/g;
    let match;
    while ((match = tokenRegex.exec(text)) !== null) {
      ids.add(parseInt(match[2], 10));
    }
    memberList.forEach((m) => {
      const fullName = formatUserName(m);
      const firstName = m.first_name || '';
      if (fullName && text.toLowerCase().includes(`@${fullName.toLowerCase()}`)) {
        ids.add(m.id);
      } else if (firstName && text.toLowerCase().includes(`@${firstName.toLowerCase()}`)) {
        ids.add(m.id);
      }
    });
    return Array.from(ids);
  };

  const handleAddComment = async () => {
    if (!newCommentText.trim()) return;
    setIsSubmitting(true);
    const mentionedUserIds = extractMentionedUserIds(newCommentText, boardMembers);
    try {
      await createComment(task.id, {
        content: newCommentText,
        parent_comment_id: replyToCommentId || undefined,
        mentioned_user_ids: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
      });
      setNewCommentText('');
      setReplyToCommentId(null);
      await fetchComments(false);
      useActivityStore.getState().appendActivity(task.id, {
        entity_type: 'TASK', entity_id: task.id, activity_type: 'COMMENT_ADDED',
        old_value: null, new_value: null, metadata: {},
      });
      toast.success('Comment added');
    } catch (error: any) {
      console.error('Failed to create comment', error);
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to create comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteComment = async () => {
    if (commentToDelete === null) return;
    setIsDeleting(true);
    try {
      await deleteComment(commentToDelete);
      await fetchComments(false);
      useActivityStore.getState().appendActivity(task.id, {
        entity_type: 'TASK', entity_id: task.id, activity_type: 'COMMENT_DELETED',
        old_value: null, new_value: null, metadata: {},
      });
      toast.success('Comment deleted');
    } catch (error: any) {
      console.error('Failed to delete comment', error);
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to delete comment');
    } finally {
      setIsDeleting(false);
      setCommentToDelete(null);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewCommentText(value);
    const cursor = e.target.selectionStart;
    setCursorPos(cursor);

    const textBefore = value.slice(0, cursor);
    const match = textBefore.match(/@([a-zA-Z0-9._-]{0,20}(?:\s[a-zA-Z0-9._-]{0,20})?)$/);

    if (match && !textBefore.slice(0, match.index).endsWith('\\')) {
      const query = match[1].toLowerCase().trim();
      setMentionSearch(query);
      const matches = boardMembers.filter((u) => {
        if (!query) return true;
        const fullName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        return fullName.includes(query) || email.includes(query);
      });
      setShowMentions(matches.length > 0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (user: User) => {
    const nameStr = formatUserName(user);
    const mentionToken = `@${nameStr}`;
    const textBefore = newCommentText.slice(0, cursorPos);
    const textAfter = newCommentText.slice(cursorPos);
    const match = textBefore.match(/@([a-zA-Z0-9._-]{0,20}(?:\s[a-zA-Z0-9._-]{0,20})?)$/);
    if (match) {
      const newText = textBefore.slice(0, match.index) + `${mentionToken} ` + textAfter;
      setNewCommentText(newText);
    }
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const filteredUsers = boardMembers.filter((u) => {
    const search = mentionSearch.toLowerCase().trim();
    if (!search) return true;
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
    return u.email.toLowerCase().includes(search) || fullName.includes(search);
  });

  const renderCommentContent = (content: string) => {
    if (!content) return null;
    let cleanContent = content.replace(/@\[([^\]]+)\]\(user:\d+\)/g, '@$1');
    const sortedMembers = [...boardMembers].sort(
      (a, b) => formatUserName(b).length - formatUserName(a).length
    );
    const namePatterns = sortedMembers
      .map((m) => {
        const fn = formatUserName(m);
        return fn ? fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      })
      .filter(Boolean);

    if (namePatterns.length === 0) return cleanContent;

    const regex = new RegExp(`@(${namePatterns.join('|')})\\b`, 'gi');
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(cleanContent)) !== null) {
      if (match.index > lastIndex) parts.push(cleanContent.slice(lastIndex, match.index));
      parts.push(
        <span
          key={`chip-${match.index}`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md text-xs font-semibold bg-brand-primary/15 text-brand-primary border border-brand-primary/30 cursor-pointer hover:bg-brand-primary/25 transition-colors"
        >
          @{match[1]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < cleanContent.length) parts.push(cleanContent.slice(lastIndex));
    return <>{parts.length > 0 ? parts : cleanContent}</>;
  };

  const getThreadReplies = (rootId: number, allComments: Comment[]): Comment[] => {
    const result: Comment[] = [];
    const childMap = new Map<number, Comment[]>();
    allComments.forEach((c) => {
      if (c.parent_comment_id) {
        const list = childMap.get(c.parent_comment_id) || [];
        list.push(c);
        childMap.set(c.parent_comment_id, list);
      }
    });
    const collect = (parentId: number) => {
      const children = childMap.get(parentId) || [];
      for (const child of children) {
        result.push(child);
        collect(child.id);
      }
    };
    collect(rootId);
    return result.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  };

  const rootComments = comments.filter((c) => !c.parent_comment_id);

  const commonItemProps = {
    editingCommentId,
    editText,
    isSavingEdit,
    activePickerCommentId,
    boardMembers,
    onEditTextChange: setEditText,
    onStartEdit: handleStartEdit,
    onCancelEdit: handleCancelEdit,
    onSaveEdit: handleSaveEdit,
    onStartReply: handleStartReply,
    onDelete: setCommentToDelete,
    onToggleReaction: handleToggleReaction,
    onSetActivePicker: setActivePickerCommentId,
    renderContent: renderCommentContent,
    highlightedCommentId,
  };

  return (
    <section className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {isLoading ? (
          <div className="py-8 flex flex-col items-center justify-center text-sm text-brand-text-muted bg-brand-surface-low rounded-lg border border-dashed border-brand-border">
            <Loader2 size={32} className="mb-3 animate-spin opacity-40" />
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-brand-text-muted bg-brand-surface-low rounded-lg border border-dashed border-brand-border">
            <MessageCircle size={32} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No comments yet</p>
            <p className="text-xs mt-1">Be the first to comment on this task.</p>
          </div>
        ) : (
          rootComments.map((item) => {
            const replies = getThreadReplies(item.id, comments);
            return (
              <div key={item.id}>
                <CommentItem
                  comment={item}
                  isRoot
                  isOwner={!!item.user_id && item.user_id === currentUserId}
                  {...commonItemProps}
                />
                {replies.length > 0 && (
                  <div className="mt-3 space-y-3 ml-8">
                    {replies.map((reply) => (
                      <CommentItem
                        key={reply.id}
                        comment={reply}
                        isRoot={false}
                        isOwner={!!reply.user_id && reply.user_id === currentUserId}
                        {...commonItemProps}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <CommentInput
        value={newCommentText}
        onChange={handleTextareaChange}
        onSubmit={handleAddComment}
        isSubmitting={isSubmitting}
        replyToCommentId={replyToCommentId}
        comments={comments}
        onCancelReply={() => setReplyToCommentId(null)}
        showMentions={showMentions}
        filteredUsers={filteredUsers}
        onInsertMention={insertMention}
        onMentionButtonClick={() => {
          setNewCommentText((prev) => prev + '@');
          setShowMentions(true);
          setMentionSearch('');
          textareaRef.current?.focus();
        }}
        textareaRef={textareaRef}
      />

      <ConfirmDialog
        isOpen={commentToDelete !== null}
        onClose={() => setCommentToDelete(null)}
        onConfirm={handleConfirmDeleteComment}
        title="Delete Comment"
        description="Are you sure you want to delete this comment? This action cannot be undone."
        confirmText="Delete"
        isDestructive={true}
        isLoading={isDeleting}
      />
    </section>
  );
};

export default CommentsTab;
