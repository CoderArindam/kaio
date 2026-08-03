import React, { useState, useEffect, useRef } from 'react';
import {
  MessageCircle,
  Reply,
  Trash2,
  X,
  AtSign,
  Send,
  Loader2,
  Pencil,
  Check,
} from 'lucide-react';
import {
  getTaskComments,
  createComment,
  updateComment,
  deleteComment,
  type Comment,
} from '../../../../../services/commentsApi';
import { type Task } from '../../../../../services/tasksApi';
import { type User, getBoardMembers, getUsers } from '../../../../../services/usersApi';
import toast from 'react-hot-toast';
import { useActivityStore } from '../../../../../store/activityStore';
import ConfirmDialog from '../../../../../components/common/ConfirmDialog';
import { UserAvatar } from '../../../../../components/common/UserAvatar';
import { formatUserName } from '../../../../../utils/userHelpers';
import { useUiStore } from '../../../../../store/uiStore';

interface CommentsTabProps {
  task: Task;
  currentUserId: number | null;
  users: User[];
}

const CommentsTab: React.FC<CommentsTabProps> = ({
  task,
  currentUserId,
  users,
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCommentText, setNewCommentText] = useState("");
  const [replyToCommentId, setReplyToCommentId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [boardMembers, setBoardMembers] = useState<User[]>(users || []);

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const highlightedCommentId = useUiStore((state) => state.highlightedCommentId);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        console.error("Failed to load members for mentions", err);
      }
    };
    loadMembers();
    return () => {
      isMounted = false;
    };
  }, [task.board_id, users]);

  const isCommentOwner = (commentUserId: number | null) => {
    if (!commentUserId || !currentUserId) return false;
    return currentUserId === commentUserId;
  };

  const fetchComments = async () => {
    setIsLoading(true);
    try {
      const data = await getTaskComments(task.id);
      setComments(data);
    } catch (error) {
      console.error("Failed to fetch comments", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [task.id]);

  useEffect(() => {
    const handleCommentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.task_id === task.id) {
        fetchComments();
      }
    };
    window.addEventListener('kaio:comment_updated', handleCommentUpdated);
    return () => {
      window.removeEventListener('kaio:comment_updated', handleCommentUpdated);
    };
  }, [task.id]);

  useEffect(() => {
    if (!isLoading && comments.length > 0 && highlightedCommentId) {
      setTimeout(() => {
        const el = document.getElementById(`comment-${highlightedCommentId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [isLoading, comments.length, highlightedCommentId]);

  const handleStartReply = (targetComment: Comment) => {
    setReplyToCommentId(targetComment.id);
    const authorUser = {
      first_name: targetComment.user_first_name,
      last_name: targetComment.user_last_name,
      email: targetComment.user_email
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
    setEditText("");
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
        c.id === commentId
          ? { ...c, content: trimmed, edited_at: new Date().toISOString() }
          : c
      )
    );

    try {
      const updated = await updateComment(task.id, commentId, { content: trimmed });
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updated : c))
      );
      toast.success("Comment updated");
      setEditingCommentId(null);
      setEditText("");
    } catch (error: any) {
      setComments(previousComments);
      console.error("Failed to edit comment", error);
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : "Failed to edit comment");
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
      setNewCommentText("");
      setReplyToCommentId(null);
      await fetchComments();
      useActivityStore.getState().appendActivity(task.id, {
        entity_type: 'TASK', entity_id: task.id, activity_type: 'COMMENT_ADDED',
        old_value: null, new_value: null, metadata: {}
      });
      toast.success("Comment added");
    } catch (error: any) {
      console.error("Failed to create comment", error);
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : "Failed to create comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDeleteComment = async () => {
    if (commentToDelete === null) return;
    setIsDeleting(true);
    try {
      await deleteComment(commentToDelete);
      await fetchComments();
      useActivityStore.getState().appendActivity(task.id, {
        entity_type: 'TASK', entity_id: task.id, activity_type: 'COMMENT_DELETED',
        old_value: null, new_value: null, metadata: {}
      });
      toast.success("Comment deleted");
    } catch (error: any) {
      console.error("Failed to delete comment", error);
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : "Failed to delete comment");
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

      if (matches.length > 0) {
        setShowMentions(true);
      } else {
        setShowMentions(false);
      }
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
      const newText =
        textBefore.slice(0, match.index) + `${mentionToken} ` + textAfter;
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

    // Normalize any legacy structured tokens @[Name](user:123) to @Name
    let cleanContent = content.replace(/@\[([^\]]+)\]\(user:\d+\)/g, '@$1');

    // Build matching regex for current board members
    const sortedMembers = [...boardMembers].sort(
      (a, b) => formatUserName(b).length - formatUserName(a).length
    );

    const namePatterns = sortedMembers
      .map((m) => {
        const fn = formatUserName(m);
        return fn ? fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      })
      .filter(Boolean);

    if (namePatterns.length === 0) {
      return cleanContent;
    }

    const regex = new RegExp(`@(${namePatterns.join('|')})\\b`, 'gi');
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(cleanContent)) !== null) {
      if (match.index > lastIndex) {
        parts.push(cleanContent.slice(lastIndex, match.index));
      }
      const matchedName = match[1];
      parts.push(
        <span
          key={`chip-${match.index}`}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md text-xs font-semibold bg-brand-primary/15 text-brand-primary border border-brand-primary/30 cursor-pointer hover:bg-brand-primary/25 transition-colors"
        >
          @{matchedName}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < cleanContent.length) {
      parts.push(cleanContent.slice(lastIndex));
    }

    return <>{parts.length > 0 ? parts : cleanContent}</>;
  };

  const getThreadReplies = (rootId: number, allComments: Comment[]): Comment[] => {
    const result: Comment[] = [];
    const childMap = new Map<number, Comment[]>();
    
    allComments.forEach(c => {
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
    return result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  };

  const rootComments = comments.filter((c) => !c.parent_comment_id);

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
            <p className="text-xs mt-1">
              Be the first to comment on this task.
            </p>
          </div>
        ) : (
          rootComments.map((item) => {
            const itemUser = {
              first_name: item.user_first_name,
              last_name: item.user_last_name,
              email: item.user_email,
              avatar_url: item.user_avatar_url
            };
            const replies = getThreadReplies(item.id, comments);

            return (
              <div 
                key={item.id} 
                id={`comment-${item.id}`}
                className={`flex gap-3 p-2 rounded-lg transition-all ${
                  highlightedCommentId === item.id 
                    ? 'ring-2 ring-brand-primary bg-brand-primary/10' 
                    : ''
                }`}
              >
                <UserAvatar user={itemUser} size="md" />

                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm text-brand-text">
                      {formatUserName(itemUser)}
                    </span>
                    <span className="text-xs text-brand-text-muted flex items-center gap-1">
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {item.edited_at && <span className="text-[10px] text-brand-text-muted italic ml-1">(edited)</span>}
                    </span>
                  </div>

                  {editingCommentId === item.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        ref={(el) => {
                          if (el) {
                            el.focus();
                            el.setSelectionRange(el.value.length, el.value.length);
                          }
                        }}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (editText.trim() !== item.content.trim()) {
                              handleSaveEdit(item.id);
                            } else {
                              handleCancelEdit();
                            }
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        rows={3}
                        className="w-full bg-brand-surface border border-brand-primary rounded-lg p-2.5 text-sm outline-none text-brand-text focus:ring-1 focus:ring-brand-primary"
                      />
                      <div className="flex gap-2 justify-end text-xs">
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 rounded bg-brand-surface-low text-brand-text-muted hover:text-brand-text border border-brand-border flex items-center gap-1"
                        >
                          <X size={13} /> Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(item.id)}
                          disabled={!editText.trim() || editText.trim() === item.content.trim() || isSavingEdit}
                          className="px-3 py-1 rounded bg-brand-primary text-white hover:bg-brand-primary-hover flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {isSavingEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-1 bg-brand-surface border border-brand-border rounded-lg p-3 text-sm whitespace-pre-wrap text-brand-text leading-relaxed">
                        {renderCommentContent(item.content)}
                      </div>

                      <div className="flex gap-4 mt-2 text-xs text-brand-text-muted">
                        <button
                          onClick={() => handleStartReply(item)}
                          className="hover:text-brand-primary flex items-center gap-1 font-medium"
                        >
                          <Reply size={14} /> Reply
                        </button>
                        {isCommentOwner(item.user_id) && (
                          <>
                            <button
                              onClick={() => handleStartEdit(item)}
                              className="hover:text-brand-primary flex items-center gap-1"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                            <button
                              onClick={() => setCommentToDelete(item.id)}
                              className="hover:text-red-500 flex items-center gap-1"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  {replies.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {replies.map((reply) => {
                        const replyUser = {
                          first_name: reply.user_first_name,
                          last_name: reply.user_last_name,
                          email: reply.user_email,
                          avatar_url: reply.user_avatar_url
                        };
                        return (
                          <div 
                            key={reply.id} 
                            id={`comment-${reply.id}`}
                            className={`flex gap-2 p-1.5 rounded transition-all ${
                              highlightedCommentId === reply.id 
                                ? 'ring-2 ring-brand-primary bg-brand-primary/10' 
                                : ''
                            }`}
                          >
                            <UserAvatar user={replyUser} size="sm" />
                            <div className="flex-1">
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-xs text-brand-text">
                                  {formatUserName(replyUser)}
                                </span>
                                <span className="text-[10px] text-brand-text-muted flex items-center gap-1">
                                  {new Date(reply.created_at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                  {reply.edited_at && <span className="italic ml-0.5">(edited)</span>}
                                </span>
                              </div>

                              {editingCommentId === reply.id ? (
                                <div className="mt-1.5 space-y-1.5">
                                  <textarea
                                    ref={(el) => {
                                      if (el) {
                                        el.focus();
                                        el.setSelectionRange(el.value.length, el.value.length);
                                      }
                                    }}
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        if (editText.trim() !== reply.content.trim()) {
                                          handleSaveEdit(reply.id);
                                        } else {
                                          handleCancelEdit();
                                        }
                                      } else if (e.key === 'Escape') {
                                        handleCancelEdit();
                                      }
                                    }}
                                    rows={2}
                                    className="w-full bg-brand-surface border border-brand-primary rounded p-2 text-xs outline-none text-brand-text focus:ring-1 focus:ring-brand-primary"
                                  />
                                  <div className="flex gap-2 justify-end text-[11px]">
                                    <button
                                      onClick={handleCancelEdit}
                                      className="px-2 py-0.5 rounded bg-brand-surface-low text-brand-text-muted hover:text-brand-text border border-brand-border flex items-center gap-1"
                                    >
                                      <X size={11} /> Cancel
                                    </button>
                                    <button
                                      onClick={() => handleSaveEdit(reply.id)}
                                      disabled={!editText.trim() || editText.trim() === reply.content.trim() || isSavingEdit}
                                      className="px-2 py-0.5 rounded bg-brand-primary text-white hover:bg-brand-primary-hover flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                    >
                                      {isSavingEdit ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="mt-1 bg-brand-surface-low border border-brand-border rounded p-2 text-xs whitespace-pre-wrap text-brand-text leading-relaxed">
                                    {renderCommentContent(reply.content)}
                                  </div>
                                  <div className="flex gap-3 mt-1 text-[10px] text-brand-text-muted">
                                    <button
                                      onClick={() => handleStartReply(reply)}
                                      className="hover:text-brand-primary flex items-center gap-0.5 font-medium"
                                    >
                                      <Reply size={11} /> Reply
                                    </button>
                                    {isCommentOwner(reply.user_id) && (
                                      <>
                                        <button
                                          onClick={() => handleStartEdit(reply)}
                                          className="hover:text-brand-primary flex items-center gap-0.5"
                                        >
                                          <Pencil size={11} /> Edit
                                        </button>
                                        <button
                                          onClick={() => setCommentToDelete(reply.id)}
                                          className="hover:text-red-500 flex items-center gap-0.5"
                                        >
                                          <Trash2 size={11} /> Delete
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-brand-border relative">
        {replyToCommentId && (
          <div className="flex justify-between items-center text-xs text-brand-primary mb-2 bg-brand-surface p-2.5 rounded-lg border border-brand-primary/30">
            <span className="flex items-center gap-1.5 font-medium">
              <Reply size={14} /> Replying to{' '}
              <strong className="text-brand-text-primary">
                {(() => {
                  const target = comments.find(c => c.id === replyToCommentId);
                  if (!target) return 'comment';
                  return formatUserName({
                    first_name: target.user_first_name,
                    last_name: target.user_last_name,
                    email: target.user_email
                  });
                })()}
              </strong>
            </span>
            <button
              onClick={() => setReplyToCommentId(null)}
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
                  onClick={() => insertMention(u)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-surface-highlight rounded-md transition text-brand-text flex items-center gap-2.5"
                >
                  <UserAvatar user={u} size="sm" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-xs leading-none truncate">
                      {formatUserName(u)}
                    </span>
                    {u.email && <span className="text-[10px] text-brand-text-muted mt-1 leading-none truncate">{u.email}</span>}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-brand-text-muted">
                No matching members found
              </div>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={3}
          placeholder="Add a comment... (Type @ to mention team members)"
          value={newCommentText}
          onChange={handleTextareaChange}
          className="w-full bg-brand-surface border border-brand-border rounded-lg p-3 text-sm outline-none focus:border-brand-primary"
        />

        <div className="flex justify-between mt-3">
          <button
            type="button"
            className="text-brand-text-muted hover:text-brand-primary p-1 rounded transition-colors"
            title="Mention member"
            onClick={() => {
              setNewCommentText((prev) => prev + "@");
              setShowMentions(true);
              setMentionSearch("");
              textareaRef.current?.focus();
            }}
          >
            <AtSign size={18} />
          </button>

          <button
            onClick={handleAddComment}
            disabled={!newCommentText.trim() || isSubmitting}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
          >
            {isSubmitting && <Loader2 size={15} className="animate-spin" />}
            {isSubmitting ? "Sending..." : "Send"}
            {!isSubmitting && <Send size={15} />}
          </button>
        </div>
      </div>
      
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
