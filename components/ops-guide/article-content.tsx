"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import type { Components } from "react-markdown";

interface ArticleContentProps {
  content: string;
  checkedSteps: Record<number, boolean>;
  onToggleStep: (index: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

// Renders both legacy raw-HTML articles and new Markdown articles through
// one path: rehype-raw passes embedded HTML through untouched, so legacy
// content (Session 5 seed) keeps rendering exactly as before, while new
// content authored as Markdown (including GFM task lists) renders natively.
// Checkboxes from either source funnel through the same interactive
// checkbox override so step-progress tracking works identically for both.
export function ArticleContent({ content, checkedSteps, onToggleStep, containerRef }: ArticleContentProps) {
  let checkboxIndex = -1;

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
  };

  return (
    <div ref={containerRef} className="ops-article-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSlug]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
