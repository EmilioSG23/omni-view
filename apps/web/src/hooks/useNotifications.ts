import { useContext } from "react";
import {
	NotificationContext,
	type NotificationContextType,
	type NotificationStatus,
} from "../core/notifications/NotificationProvider";

export function useNotifications<S extends string = NotificationStatus>() {
	const context = useContext(NotificationContext) as NotificationContextType<S> | undefined;
	if (!context) throw new Error("useNotifications must be used within a NotificationProvider");
	return context;
}
