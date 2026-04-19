import { createContext, useState } from "react";

export type NotificationStatus =
	| "LOADING"
	| "WAITING"
	| "SUCCESS"
	| "FAILED"
	| "SKIPPED"
	| "REQUEST";

export interface NotificationAction {
	label: string;
	onClick: () => void;
	variant?: "default" | "danger" | "warn";
}

export interface Notification<S extends string = NotificationStatus> {
	id: string;
	message: string;
	status?: S;
	onClick?: () => void;
	actions?: NotificationAction[];
}

export interface NotificationContextType<S extends string = NotificationStatus> {
	notifications: Notification<S>[];
	findNotification: (id: string) => Notification<S> | undefined;
	addNotification: (notification: Notification<S>) => void;
	removeNotification: (id: string) => void;
	updateNotification: (id: string, updates: Partial<Notification<S>>) => void;
}

export const NotificationContext = createContext<NotificationContextType<any> | undefined>(
	undefined,
);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
	const [notifications, setNotifications] = useState<Notification[]>([]);

	const findNotification = (id: string) => notifications.find((n) => n.id === id);

	const addNotification = (notification: Notification) => {
		setNotifications((prev) => {
			const existingIndex = prev.findIndex((n) => n.id === notification.id);
			if (existingIndex >= 0) {
				const updated = [...prev];
				updated[existingIndex] = { ...updated[existingIndex], ...notification };
				return updated;
			}
			return [...prev, { ...notification }];
		});
	};

	const removeNotification = (id: string) =>
		setNotifications((prev) => prev.filter((n) => n.id !== id));

	const updateNotification = (id: string, updates: Partial<Notification>) =>
		setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));

	return (
		<NotificationContext.Provider
			value={
				{
					notifications,
					findNotification,
					addNotification,
					removeNotification,
					updateNotification,
				} as NotificationContextType
			}
		>
			{children}
		</NotificationContext.Provider>
	);
}
