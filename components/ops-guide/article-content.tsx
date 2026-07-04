"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import { X } from "lucide-react";
import type { Components } from "react-markdown";

interface ArticleContentProps {
  content: string;
  checkedSteps: Record<number, boolean>;
  onToggleStep: (index: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

// react-markdown's default urlTransform strips any URL scheme it doesn't
// recognize as safe — including data: URIs, which silently drops every
// embedded base64 image. Allow data:image/* through explicitly; block
// everything else that isn't a normal link scheme (e.g. javascript:).
export function safeUrlTransform(url: string): string {
  if (/^data:image\//i.test(url)) return url;
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(url)) return url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return url; // relative paths
  return "";
}

// Renders both legacy raw-HTML articles and new Markdown articles through
// one path: rehype-raw passes embedded HTML through untouched, so legacy
// content (Session 5 seed) keeps rendering exactly as before, while new
// content authored as Markdown (including GFM task lists) renders natively.
// Checkboxes from either source funnel through the same interactive
// checkbox override so step-progress tracking works identically for both.
export function ArticleContent({ content, checkedSteps, onToggleStep, containerRef }: ArticleContentProps) {
  let checkboxIndex = -1;
  const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);

  const components: Components = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    input: ({ node, ...props }) => {
      if (props.type === "checkbox") {
        checkboxIndex += 1;
        const index = checkboxIndex;
        return (
          <input
            type="checkbox"
            checked={Boolean(checkedSteps[index])}
            onChange={() => onToggleStep(index)}
            className="mr-2 h-4 w-4 accent-accent align-middle"
          />
        );
      }
      return <input {...props} />;
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    img: ({ node, ...props }) => (
      <img
        {...props}
        className="cursor-zoom-in"
        onClick={() => props.src && setLightboxSrc(props.src)}
        alt={props.alt ?? ""}
      />
    ),
  };

  return (
    <>
      <div ref={containerRef} className="ops-article-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSlug]}
          components={components}
          urlTransform={safeUrlTransform}
        >
          {content}
        </ReactMarkdown>
      </div>

      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightboxSrc(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
