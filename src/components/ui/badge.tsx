import type * as React from "react";

import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "secondary" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
	default: "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900",
	secondary: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
	outline:
		"border border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: BadgeVariant;
}

function Badge({
	className,
	variant = "default",
	...props
}: BadgeProps): JSX.Element {
	return (
		<div
			className={cn(
				"inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
				variantClasses[variant],
				className,
			)}
			{...props}
		/>
	);
}

export { Badge };
