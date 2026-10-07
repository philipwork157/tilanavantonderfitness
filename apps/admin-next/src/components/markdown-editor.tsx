'use client';

import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered, Redo2, TextQuote, Undo2, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Rich text editor that reads and writes Markdown, configured like the Nuxt
 * admin's editor (Tiptap 3, GitHub-flavoured Markdown, no code blocks, strike
 * or underline) so posts round-trip unchanged between the two admins.
 */
export function MarkdownEditor({ value, onChange, placeholder, labelledBy }: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  labelledBy?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false, strike: false, underline: false, link: { openOnClick: false } }),
      Markdown.configure({ markedOptions: { gfm: true } }),
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…', showOnlyCurrent: true }),
    ],
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'tiptap-content',
        ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}),
        'aria-multiline': 'true',
        role: 'textbox',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getMarkdown()),
  });

  // Content replaced from outside (e.g. the saved version from the server).
  useEffect(() => {
    if (editor && value !== editor.getMarkdown()) {
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card focus-within:ring-2 focus-within:ring-ring/40">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="min-h-80 px-5 py-4" />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-2 py-1.5">
      <Tool icon={Heading2} label="Heading" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
      <Tool icon={Heading3} label="Small heading" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <Divider />
      <Tool icon={Bold} label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()} />
      <Tool icon={Italic} label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()} />
      <LinkTool editor={editor} active={state.link} />
      <Divider />
      <Tool icon={List} label="Bullet list" active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
      <Tool icon={ListOrdered} label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <Tool icon={TextQuote} label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()} />
      <Divider />
      <Tool icon={Undo2} label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()} />
      <Tool icon={Redo2} label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()} />
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}

function Tool({ icon: Icon, label, active, disabled, onClick }: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('size-8', active && 'bg-secondary text-foreground')}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Add, change or remove a link on the selected text. */
function LinkTool({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');

  function openChange(next: boolean) {
    if (next) setUrl((editor.getAttributes('link').href as string | undefined) ?? '');
    setOpen(next);
  }

  function apply(event: FormEvent) {
    event.preventDefault();
    const href = url.trim();
    if (!href) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: /^(https?:|mailto:|\/)/.test(href) ? href : `https://${href}` }).run();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className={cn('size-8', active && 'bg-secondary text-foreground')} aria-label="Link" aria-pressed={active}>
              <LinkIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Link</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80" align="start">
        <form onSubmit={apply} className="grid gap-2">
          <label htmlFor="link-url" className="text-xs font-semibold text-muted-foreground">Link address</label>
          <Input id="link-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus />
          <div className="flex justify-end gap-2">
            {active && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setOpen(false); }}>
                Remove link
              </Button>
            )}
            <Button type="submit" size="sm">Apply</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
