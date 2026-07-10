import { alertStyles } from "@/lib/markdownStyles";
import { cn } from "@/lib/utils";
import { NestedMarkdownRenderContext } from "../MarkdownRenderContext";
import type { ReactMarkdownProps } from "./types";

interface AlertProps extends React.BlockquoteHTMLAttributes<HTMLQuoteElement>, ReactMarkdownProps {
  children: React.ReactNode;
  alertType: string;
  alertIcon?: string;
}

/**
 * GitHub-style alert callout, rendered for blockquotes whose first line is a
 * `[!TYPE]` / `[!TYPE(icon)]` marker (see remark-alert). Falls back to the
 * type's default icon when no custom icon is given.
 */
export const Alert = ({ children, className, alertType, alertIcon, node: _node, ...props }: AlertProps) => {
  const style = alertStyles[alertType];
  if (!style) {
    return (
      <blockquote className={className} {...props}>
        <NestedMarkdownRenderContext>{children}</NestedMarkdownRenderContext>
      </blockquote>
    );
  }

  return (
    <blockquote className={cn("my-0 mb-2 flex gap-2 rounded-md border pl-3 pr-3 py-2 not-italic", style.classes, className)} {...props}>
      <span aria-hidden className="shrink-0 leading-6">
        {alertIcon || style.icon}
      </span>
      <div className="min-w-0 flex-1">
        <NestedMarkdownRenderContext>{children}</NestedMarkdownRenderContext>
      </div>
    </blockquote>
  );
};
