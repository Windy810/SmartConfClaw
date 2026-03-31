import type { ComponentPropsWithoutRef, ReactElement } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type CodeComponentProps = ComponentPropsWithoutRef<"code"> & {
	inline?: boolean;
};

interface SessionQaMarkdownProps {
	/** Raw markdown from the model */
	source: string;
	className?: string;
}

const mdComponents: Components = {
	h1: ({ children }) => (
		<h1 className="mb-2 mt-3 border-b border-zinc-200 pb-1 text-base font-bold text-zinc-900 first:mt-0 dark:border-zinc-700 dark:text-zinc-50">
			{children}
		</h1>
	),
	h2: ({ children }) => (
		<h2 className="mb-1.5 mt-3 text-sm font-bold text-zinc-900 first:mt-0 dark:text-zinc-50">
			{children}
		</h2>
	),
	h3: ({ children }) => (
		<h3 className="mb-1 mt-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
			{children}
		</h3>
	),
	p: ({ children }) => (
		<p className="mb-2 last:mb-0 [&+p]:mt-0">{children}</p>
	),
	ul: ({ children }) => (
		<ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
	),
	ol: ({ children }) => (
		<ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
	),
	li: ({ children }) => <li className="leading-relaxed">{children}</li>,
	blockquote: ({ children }) => (
		<blockquote className="my-2 border-l-4 border-zinc-300 pl-3 text-zinc-600 italic dark:border-zinc-600 dark:text-zinc-400">
			{children}
		</blockquote>
	),
	a: ({ href, children }) => (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="font-medium text-blue-600 underline decoration-blue-600/40 underline-offset-2 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/40"
		>
			{children}
		</a>
	),
	hr: () => (
		<hr className="my-3 border-zinc-200 dark:border-zinc-700" />
	),
	table: ({ children }) => (
		<div className="my-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
			<table className="w-full min-w-[240px] border-collapse text-left text-xs">
				{children}
			</table>
		</div>
	),
	thead: ({ children }) => (
		<thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/80">
			{children}
		</thead>
	),
	th: ({ children }) => (
		<th className="px-2.5 py-2 font-semibold text-zinc-800 dark:text-zinc-200">
			{children}
		</th>
	),
	td: ({ children }) => (
		<td className="border-t border-zinc-100 px-2.5 py-2 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
			{children}
		</td>
	),
	tr: ({ children }) => <tr>{children}</tr>,
	tbody: ({ children }) => <tbody>{children}</tbody>,
	pre: ({ children }) => (
		<pre className="my-2 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-100 dark:border-zinc-700 dark:bg-zinc-950">
			{children}
		</pre>
	),
	code(props: CodeComponentProps) {
		const { inline, className, children, ...rest } = props;
		const isInline =
			inline === true ||
			(inline !== false && !String(className ?? "").includes("language-"));
		if (isInline) {
			return (
				<code
					className="rounded bg-zinc-200/90 px-1 py-0.5 font-mono text-[0.88em] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
					{...rest}
				>
					{children}
				</code>
			);
		}
		return (
			<code
				className={`block bg-transparent font-mono text-zinc-100 ${className ?? ""}`}
				{...rest}
			>
				{children}
			</code>
		);
	},
	strong: ({ children }) => (
		<strong className="font-semibold text-zinc-900 dark:text-zinc-50">{children}</strong>
	),
	em: ({ children }) => <em className="italic">{children}</em>,
};

export function SessionQaMarkdown({
	source,
	className = "",
}: SessionQaMarkdownProps): ReactElement {
	return (
		<div className={`text-sm leading-relaxed text-zinc-700 dark:text-zinc-200 ${className}`}>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
				{source}
			</ReactMarkdown>
		</div>
	);
}
