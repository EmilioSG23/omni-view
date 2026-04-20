import type { Notification } from "@/context/NotificationProvider";
import { memo, useEffect } from "react";
import { StatusIcon, getStatusColor } from "./NotificationIcon";

const ACTION_CLASSES: Record<string, string> = {
	default: "border-border text-secondary hover:text-primary hover:border-border-strong",
	danger: "border-error/40 text-error hover:bg-error/10",
	warn: "border-accent/40 text-accent hover:bg-accent/10",
};

export const NotificationCard = memo(function NotificationCard({
	notification,
	onRemove,
}: {
	notification: Notification;
	onRemove: (id: string) => void;
}) {
	const { id, message, status, onClick, actions } = notification;
	const isClickable = !!onClick;
	const isTerminal = status === "SUCCESS" || status === "FAILED" || status === "SKIPPED";

	useEffect(() => {
		if (isTerminal) {
			const timer = setTimeout(() => onRemove(id), 3000);
			return () => clearTimeout(timer);
		}
	}, [status, id, onRemove, isTerminal]);

	return (
		<div
			className={`w-72 rounded-xl border border-border bg-elevated shadow-lg transition-shadow hover:shadow-xl ${
				isClickable ? "cursor-pointer" : "cursor-default"
			}`}
			onClick={() => {
				if (isClickable) onClick!();
			}}
		>
			<div className="flex items-start gap-3 p-4">
				<StatusIcon
					status={status}
					className={`mt-0.5 size-5 shrink-0 ${getStatusColor(status)}`}
				/>
				<span className="flex-1 text-sm leading-snug text-primary">{message}</span>
			</div>

			{actions && actions.length > 0 && (
				<div className="flex gap-2 border-t border-border px-4 pb-3 pt-2">
					{actions.map((action) => (
						<button
							key={action.label}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								action.onClick();
							}}
							className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
								ACTION_CLASSES[action.variant ?? "default"]
							}`}
						>
							{action.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
});
