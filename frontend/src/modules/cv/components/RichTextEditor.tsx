// Lightweight WYSIWYG used across all multi-line CV fields. Two modes:
//   • mode="list"      — value is string[] (one bullet per item)
//   • mode="paragraph" — value is string (markdown, paragraphs joined by \n\n)
//
// Output is always inline markdown (**bold**, *italic*, [text](url)), kept on
// purpose minimal so PDF export and ATS-plain-text remain clean.

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Link as LinkIcon } from 'lucide-react';
import {
  htmlListToMdLines,
  htmlParagraphsToMd,
  mdLinesToEditorHtml,
  mdToEditorHtml,
} from '../lib/markdown';

type ListProps = {
  mode: 'list';
  value: string[];
  onChange: (value: string[]) => void;
};

type ParagraphProps = {
  mode: 'paragraph';
  value: string;
  onChange: (value: string) => void;
};

type CommonProps = {
  placeholder?: string;
  className?: string;
  minHeight?: number;
  ariaLabel?: string;
};

type Props = (ListProps | ParagraphProps) & CommonProps;

// Custom Document schema for list mode. The default Document permits "block+",
// which means pressing Enter on an empty <li> exits the list and creates a
// paragraph alongside it. That paragraph never makes it into our string[]
// output, so anything typed afterwards silently disappears. Forcing the doc
// to contain a single bulletList traps the cursor inside the list — Enter
// always creates another <li>, never a stray <p>.
const BulletListDocument = Document.extend({
  content: 'bulletList',
});

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Prevent the toolbar button from stealing focus from the editor —
      // otherwise toggleBold etc. would run with no selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={!!active}
      className={`w-7 h-7 inline-flex items-center justify-center rounded border-2 text-xs transition-colors ${
        active
          ? 'bg-brand text-white border-brand'
          : 'bg-surface border-neo-border text-muted hover:text-white hover:border-brand-light'
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const promptLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', prev || 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    let safe = url.trim();
    if (!/^https?:\/\//i.test(safe) && !safe.startsWith('mailto:')) safe = `https://${safe}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run();
  };
  return (
    <div className="tiptap-toolbar flex items-center gap-1 px-1.5 py-1 border-b-2 border-neo-border bg-surface-light/40">
      <ToolbarButton
        title="Bold (⌘B)"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton
        title="Italic (⌘I)"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="w-3.5 h-3.5" />
      </ToolbarButton>
      <ToolbarButton title="Link" active={editor.isActive('link')} onClick={promptLink}>
        <LinkIcon className="w-3.5 h-3.5" />
      </ToolbarButton>
    </div>
  );
}

function valueKey(mode: 'list' | 'paragraph', value: string | string[]): string {
  // Stable, content-aware key used to detect external value changes without
  // confusing two distinct array shapes that happen to share a join (e.g.
  // ["ab","c"] vs ["a","bc"]). Using  (a character users won't type)
  // as separator avoids collisions with literal whitespace in items.
  return mode === 'list' ? (value as string[]).join('') : (value as string);
}

export default function RichTextEditor(props: Props) {
  const { mode, placeholder, className = '', minHeight = 80, ariaLabel } = props;
  // onChange ref keeps the editor instance stable while letting the latest
  // parent callback receive updates.
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  // Tracks the last value we emitted upward. When the parent re-renders and
  // gives us back the same value (the common case during typing), we skip
  // setContent entirely — that's what was nuking the caret position.
  const lastEmittedRef = useRef<string>(valueKey(mode, props.value));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // List mode replaces Document with a bulletList-only schema below.
        document: mode === 'list' ? false : undefined,
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        // List mode keeps bulletList only; paragraph mode disables both lists
        // so users can't accidentally turn a summary into a list.
        bulletList: mode === 'list' ? {} : false,
        orderedList: false,
        listItem: mode === 'list' ? {} : false,
        // StarterKit v3 ships its own Link — disable so our explicit
        // configuration below is the only one registered.
        link: false,
      }),
      ...(mode === 'list' ? [BulletListDocument] : []),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ['http', 'https', 'mailto'],
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({
        placeholder: placeholder || '',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content:
      mode === 'list'
        ? mdLinesToEditorHtml(props.value)
        : mdToEditorHtml(props.value),
    editorProps: {
      attributes: {
        class: 'tiptap-content focus:outline-none',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (mode === 'list') {
        const lines = htmlListToMdLines(html);
        lastEmittedRef.current = valueKey('list', lines);
        (onChangeRef.current as ListProps['onChange'])(lines);
      } else {
        const md = htmlParagraphsToMd(html);
        lastEmittedRef.current = valueKey('paragraph', md);
        (onChangeRef.current as ParagraphProps['onChange'])(md);
      }
    },
  });

  // Push external value changes (AI rewrite, undo from outside, parent reset)
  // back into the editor — but only when the value differs from what we last
  // emitted. Without this guard, every keystroke triggers a setContent that
  // resets the caret to position 0.
  useEffect(() => {
    if (!editor) return;
    const incomingKey = valueKey(mode, props.value);
    if (incomingKey === lastEmittedRef.current) return;
    const next =
      mode === 'list'
        ? mdLinesToEditorHtml(props.value as string[])
        : mdToEditorHtml(props.value as string);
    // emitUpdate: false — we don't want this programmatic update to round-trip
    // and re-emit the same value back to the parent.
    editor.commands.setContent(next, { emitUpdate: false });
    lastEmittedRef.current = incomingKey;
  }, [editor, mode, valueKey(mode, props.value)]);

  return (
    <div
      className={`tiptap-shell neo-input p-0 overflow-hidden ${className}`}
      style={{ ['--tiptap-min-h' as string]: `${minHeight}px` }}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
