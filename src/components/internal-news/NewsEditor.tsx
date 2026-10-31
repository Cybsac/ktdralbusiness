"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";

import { NEWS_EMOJIS } from "./emojis";

export function NewsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (_html: string) => void;
}) {
  const change = useRef(onChange);
  change.current = onChange;
  const [link, setLink] = useState<string | null>(null);
  const [emojis, setEmojis] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
      }),
    ],
    immediatelyRender: false,
    content: value,
    onUpdate: ({ editor }) => change.current(editor.getHTML()),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "Contenido del comunicado",
        "aria-multiline": "true",
        class:
          "min-h-40 max-h-80 overflow-y-auto p-3 outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_a]:text-blue-500 [&_a]:underline [&_p]:my-2",
      },
    },
  });
  useEffect(() => {
    if (editor && editor.getHTML() !== value)
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);
  if (!editor) return <p>Cargando editor…</p>;
  const buttons = [
    { label: "Negrita", text: "B", run: () => editor.chain().focus().toggleBold().run() },
    { label: "Cursiva", text: "I", run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Subrayado", text: "U", run: () => editor.chain().focus().toggleUnderline().run() },
    { label: "Tachado", text: "S", run: () => editor.chain().focus().toggleStrike().run() },
    {
      label: "Viñetas",
      text: "• Lista",
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Lista numerada",
      text: "1. Lista",
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    { label: "Deshacer", text: "↶", run: () => editor.chain().focus().undo().run() },
    { label: "Rehacer", text: "↷", run: () => editor.chain().focus().redo().run() },
  ];
  return (
    <div className="min-w-0 rounded border border-slate-400 bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">
      <div
        role="toolbar"
        aria-label="Formato del comunicado"
        className="flex flex-wrap gap-1 border-b border-slate-400 p-2"
      >
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.label}
            aria-label={b.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={b.run}
            className="rounded border border-slate-400 px-2 py-1 text-sm"
          >
            {b.text}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setLink(editor.getAttributes("link").href || "");
            setLinkError(null);
          }}
          className="rounded border px-2 py-1 text-sm"
        >
          Enlace
        </button>
        <button
          type="button"
          aria-expanded={emojis}
          onClick={() => setEmojis(!emojis)}
          className="rounded border px-2 py-1 text-sm"
        >
          Emojis
        </button>
      </div>
      {link !== null && (
        <div className="flex flex-wrap gap-2 p-2">
          <input
            type="url"
            aria-label="URL del enlace"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="min-w-0 flex-1 rounded border bg-transparent p-2"
            placeholder="https://…"
          />
          <button
            type="button"
            onClick={() => {
              if (!link.trim()) {
                editor.chain().focus().unsetLink().run();
                setLink(null);
                return;
              }
              try {
                const url = new URL(link);
                if (!["https:", "http:", "mailto:"].includes(url.protocol)) throw new Error();
                editor.chain().focus().extendMarkRange("link").setLink({ href: url.href }).run();
                setLink(null);
              } catch {
                setLinkError("Introduce un enlace http, https o mailto válido.");
              }
            }}
          >
            Aplicar
          </button>
          <button type="button" onClick={() => setLink(null)}>
            Cancelar
          </button>
          {linkError && (
            <p role="alert" className="w-full text-sm text-red-500">
              {linkError}
            </p>
          )}
        </div>
      )}
      {emojis && (
        <div className="max-h-48 overflow-y-auto p-2">
          {Object.entries(NEWS_EMOJIS).map(([name, items]) => (
            <div key={name}>
              <p className="text-xs">{name}</p>
              <div className="flex flex-wrap">
                {items.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Insertar ${item}`}
                    className="p-2"
                    onClick={() => {
                      editor.chain().focus().insertContent(item).run();
                      setEmojis(false);
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
