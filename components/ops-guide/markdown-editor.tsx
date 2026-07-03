"use client";

import * as React from "react";
import MDEditor, { commands as mdCommands } from "@uiw/react-md-editor";

import { getImageWidth, setImageWidth } from "@/lib/ops-guide";
import { safeUrlTransform } from "@/components/ops-guide/article-content";
import { ResizableImage } from "@/components/ops-guide/resizable-image";

// The toolbar's built-in "image" button asks for a raw URL via a text
// prompt — it doesn't go through our upload flow, so images inserted that
// way have no meaningful resize story. Keep every other default command.
const EDITOR_COMMANDS = mdCommands.getCommands().filter((cmd) => cmd.name !== "image");

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  colorMode: "light" | "dark";
  resolveImageSrc: (src: string) => string;
}

// This entire module (component + commands data) is only ever loaded via a
// dynamic(..., { ssr: false }) import from article-form-dialog.tsx — never
// statically, so it's safe to import the real @uiw/react-md-editor package
// (which touches browser globals at module scope) here.
export default function MarkdownEditor({ value, onChange, colorMode, resolveImageSrc }: MarkdownEditorProps) {
  return (
    <div data-color-mode={colorMode} className="h-full">
      <MDEditor
        value={value}
        onChange={(next) => onChange(next ?? "")}
        height={560}
        commands={EDITOR_COMMANDS}
        textareaProps={{ placeholder: "## Section title\n\nSteps...\n\n- [ ] Step one" }}
        previewOptions={{
          urlTransform: safeUrlTransform,
          components: {
            img: ({ src, alt }) =>
              src ? (
                <ResizableImage
                  src={resolveImageSrc(src)}
                  alt={alt}
                  initialWidth={getImageWidth(value, src) ?? 400}
                  onResizeEnd={(width) => onChange(setImageWidth(value, src, width))}
                />
              ) : null,
          },
        }}
      />
    </div>
  );
}
