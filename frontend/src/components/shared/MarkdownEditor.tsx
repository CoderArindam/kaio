import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Link as LinkIcon,
  Undo,
  Redo,
  Eye,
  Edit3,
  Heading1,
  Heading2,
  Heading3,
  CheckSquare,
  Minus,
} from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = 'Add a detailed description...',
  rows = 5,
  autoFocus = false,
  onKeyDown,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-brand-primary underline cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    content: value,
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      const storage = editor.storage as unknown as { markdown?: { getMarkdown: () => string } };
      const markdown = storage.markdown?.getMarkdown() ?? '';
      onChange(markdown);
    },
    editorProps: {
      attributes: {
        class: 'outline-none p-3.5 text-sm text-brand-text min-h-[140px]',
      },
      handleKeyDown: (view, event) => {
        // Encapsulation: Stop propagation for shortcuts like Ctrl+B, Ctrl+I, Ctrl+Z so parent/global listeners don't catch them
        if (event.ctrlKey || event.metaKey) {
          event.stopPropagation();
        }

        // Tab & Shift+Tab handling for bullet lists, numbered lists, and task lists
        if (event.key === 'Tab' && view.state) {
          event.preventDefault();
          event.stopPropagation();

          const isBulletOrOrdered = editor?.isActive('bulletList') || editor?.isActive('orderedList');
          if (isBulletOrOrdered && editor) {
            if (event.shiftKey) {
              editor.commands.liftListItem('listItem');
            } else {
              editor.commands.sinkListItem('listItem');
            }
            return true;
          }

          if (editor?.isActive('taskList')) {
            if (event.shiftKey) {
              editor.commands.liftListItem('taskItem');
            } else {
              editor.commands.sinkListItem('taskItem');
            }
            return true;
          }

          // Default tab behavior inside editor: insert two spaces
          if (editor) {
            editor.commands.insertContent('  ');
          }
          return true;
        }

        if (onKeyDown) {
          onKeyDown(event as unknown as React.KeyboardEvent);
        }
        return false;
      },
    },
  });

  // Sync incoming value prop changes when editor is not focused
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const storage = editor.storage as unknown as { markdown?: { getMarkdown: () => string } };
      const currentMarkdown = storage.markdown?.getMarkdown() ?? '';
      if (value !== currentMarkdown) {
        editor.commands.setContent(value);
      }
    }
  }, [value, editor]);

  const setLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl);

    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  if (!editor) {
    return (
      <div className="border border-brand-border rounded-lg p-4 bg-brand-surface text-brand-text-muted text-sm animate-pulse">
        Loading editor...
      </div>
    );
  }

  const minHeightStyle = { minHeight: `${rows * 24 + 30}px` };

  return (
    <div
      className={`border border-brand-border rounded-lg overflow-hidden bg-brand-surface focus-within:border-brand-primary transition-colors ${className}`}
      onKeyDown={(e) => {
        // Secondary encapsulation guard at container level
        if (e.ctrlKey || e.metaKey) {
          e.stopPropagation();
        }
      }}
    >
      {/* Header / Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-brand-surface-low border-b border-brand-border flex-wrap gap-1">
        {/* Left: Mode Tabs */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('write')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition ${
              activeTab === 'write'
                ? 'bg-brand-surface text-brand-primary shadow-xs'
                : 'text-brand-text-muted hover:text-brand-text'
            }`}
          >
            <Edit3 size={13} />
            Write
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition ${
              activeTab === 'preview'
                ? 'bg-brand-surface text-brand-primary shadow-xs'
                : 'text-brand-text-muted hover:text-brand-text'
            }`}
          >
            <Eye size={13} />
            Preview
          </button>
        </div>

        {/* Right: Rich Formatting Actions (Write mode) */}
        {activeTab === 'write' && (
          <div className="flex items-center gap-0.5 text-brand-text-muted flex-wrap">
            {/* Undo / Redo */}
            <button
              type="button"
              title="Undo (Ctrl+Z)"
              disabled={!editor.can().chain().focus().undo().run()}
              onClick={() => editor.chain().focus().undo().run()}
              className="p-1.5 rounded hover:bg-brand-surface hover:text-brand-text disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <Undo size={14} />
            </button>
            <button
              type="button"
              title="Redo (Ctrl+Y)"
              disabled={!editor.can().chain().focus().redo().run()}
              onClick={() => editor.chain().focus().redo().run()}
              className="p-1.5 rounded hover:bg-brand-surface hover:text-brand-text disabled:opacity-30 disabled:hover:bg-transparent transition"
            >
              <Redo size={14} />
            </button>

            <div className="w-px h-3.5 bg-brand-border mx-1" />

            {/* Headings H1, H2, H3 */}
            <button
              type="button"
              title="Heading 1 (# text)"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('heading', { level: 1 }) ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <Heading1 size={14} />
            </button>
            <button
              type="button"
              title="Heading 2 (## text)"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('heading', { level: 2 }) ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <Heading2 size={14} />
            </button>
            <button
              type="button"
              title="Heading 3 (### text)"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('heading', { level: 3 }) ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <Heading3 size={14} />
            </button>

            <div className="w-px h-3.5 bg-brand-border mx-1" />

            {/* Bold / Italic / Strike / Code inline */}
            <button
              type="button"
              title="Bold (Ctrl+B)"
              onClick={() =>
                editor.isActive('bold')
                  ? editor.chain().focus().unsetMark('bold').run()
                  : editor.chain().focus().setMark('bold').run()
              }
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('bold') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <Bold size={14} />
            </button>
            <button
              type="button"
              title="Italic (Ctrl+I)"
              onClick={() =>
                editor.isActive('italic')
                  ? editor.chain().focus().unsetMark('italic').run()
                  : editor.chain().focus().setMark('italic').run()
              }
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('italic') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <Italic size={14} />
            </button>
            <button
              type="button"
              title="Strikethrough"
              onClick={() =>
                editor.isActive('strike')
                  ? editor.chain().focus().unsetMark('strike').run()
                  : editor.chain().focus().setMark('strike').run()
              }
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('strike') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <Strikethrough size={14} />
            </button>
            <button
              type="button"
              title="Inline Code"
              onClick={() =>
                editor.isActive('code')
                  ? editor.chain().focus().unsetMark('code').run()
                  : editor.chain().focus().setMark('code').run()
              }
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('code') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <Code size={14} />
            </button>

            <div className="w-px h-3.5 bg-brand-border mx-1" />

            {/* Lists / Task Lists / Blockquote / Code Block / Divider */}
            <button
              type="button"
              title="Bullet List (- item, Tab to indent)"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('bulletList') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              title="Numbered List (1. item, Tab to indent)"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('orderedList') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <ListOrdered size={14} />
            </button>
            <button
              type="button"
              title="Checklist (- [ ] task)"
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('taskList') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <CheckSquare size={14} />
            </button>
            <button
              type="button"
              title="Quote (> text)"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('blockquote') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <Quote size={14} />
            </button>
            <button
              type="button"
              title="Code Block (```code```)"
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('codeBlock') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <SquareCode size={14} />
            </button>
            <button
              type="button"
              title="Horizontal Divider (---)"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              className="p-1.5 rounded hover:bg-brand-surface hover:text-brand-text transition"
            >
              <Minus size={14} />
            </button>

            <div className="w-px h-3.5 bg-brand-border mx-1" />

            {/* Link */}
            <button
              type="button"
              title="Hyperlink ([link](url))"
              onClick={setLink}
              className={`p-1.5 rounded hover:bg-brand-surface transition ${
                editor.isActive('link') ? 'bg-brand-surface text-brand-primary font-bold' : 'hover:text-brand-text'
              }`}
            >
              <LinkIcon size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Editor Content Area */}
      {activeTab === 'write' ? (
        <div style={minHeightStyle} className="bg-transparent">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <div style={minHeightStyle} className="md-body p-3.5 text-sm overflow-auto">
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <span className="text-brand-text-muted italic">Nothing to preview</span>
          )}
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;
