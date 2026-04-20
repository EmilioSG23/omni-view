/** Application version reported to the backend for browser-based agents. */
export const BROWSER_AGENT_VERSION = "web/1.0";

/** localStorage key for the persisted device ID. */
export const DEVICE_ID_STORAGE_KEY = "omniview:device_id";

/** localStorage key for the persisted agent session password. */
export const PASSWORD_STORAGE_KEY = "omniview:agent_password";

/** URL of the GitHub repository for the project. */
export const GIT_REPO_URL = "https://github.com/EmilioSG23/omni-view";

/** Base URL of the backend API. */
export const BACKEND_URL =
	(window as { electronAPI?: { backendUrl?: string } }).electronAPI?.backendUrl ?? "/api";
