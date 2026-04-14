import type { HTMLAttributes, ReactNode, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function MarkdownTable({
  children,
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & { children?: ReactNode }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-border/50">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

export function MarkdownThead({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground", className)}
      {...props}
    >
      {children}
    </thead>
  );
}

export function MarkdownTbody({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn("divide-y divide-border/40", className)}
      {...props}
    >
      {children}
    </tbody>
  );
}

export function MarkdownTr({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors hover:bg-muted/30", className)}
      {...props}
    >
      {children}
    </tr>
  );
}

export function MarkdownTh({
  children,
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("px-3 py-2 font-semibold", className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function MarkdownTd({
  children,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-3 py-2 align-top", className)}
      {...props}
    >
      {children}
    </td>
  );
}
