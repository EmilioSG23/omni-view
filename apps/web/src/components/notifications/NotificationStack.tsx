import type { Notification } from "@/context/NotificationProvider";
import { NotificationCard } from "./NotificationCard";

export function NotificationStack({
	notifications,
	onRemove,
}: {
	notifications: Notification[];
	onRemove: (id: string) => void;
}) {
	return (
		<div className="pointer-events-none fixed top-6 right-6 z-50 flex flex-col gap-2">
			{notifications.map((notif) => (
				<div
					key={notif.id}
					className="pointer-events-auto"
					style={{
						animation: "notif-in 0.2s ease-out both",
					}}
				>
					<NotificationCard notification={notif} onRemove={onRemove} />
				</div>
			))}
			<style>{`
				@keyframes notif-in {
					from { opacity: 0; transform: translateX(1.5rem); }
					to   { opacity: 1; transform: translateX(0); }
				}
			`}</style>
		</div>
	);
}
