import type { ComponentType } from "react";
import { GIT_REPO_URL } from "../consts";
import { GithubIcon } from "../icons/Github";

type Action = {
	id: string;
	href: string;
	label?: string;
	Icon?: ComponentType<{ className?: string }>;
	ariaLabel?: string;
};

const ACTIONS: Action[] = [
	{
		id: "github",
		href: GIT_REPO_URL,
		label: "GitHub",
		Icon: GithubIcon,
		ariaLabel: "Open GitHub repository",
	},
];

export function HeaderActions() {
	return (
		<div className="flex items-center gap-2">
			{ACTIONS.map((action) => {
				const Icon = action.Icon;
				return (
					<a
						key={action.id}
						href={action.href}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={action.ariaLabel ?? action.label}
						className="inline-flex items-center gap-2 px-3 py-1.5 rounded hover:bg-surface-1 transition text-sm
						border border-border hover:bg-accent-glow/25"
					>
						{Icon ? <Icon className="h-4 w-4" /> : null}
						{action.label ? <span className="hidden sm:inline">{action.label}</span> : null}
					</a>
				);
			})}
		</div>
	);
}
