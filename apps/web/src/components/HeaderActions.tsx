import { OmniViewInfoModal } from "@/components/modals/OmniViewInfoModal";
import { ThemeModal } from "@/components/modals/ThemeModal";
import { GIT_REPO_URL } from "@/consts";
import { useModal } from "@/hooks/useModal";
import { GithubIcon } from "@/icons/Github";
import { ThemeIcon } from "@/icons/ThemeIcon";

const BUTTON_CLASS =
	"inline-flex items-center gap-2 px-3 h-full py-1.5 rounded transition text-sm border border-border hover:bg-accent-glow/25";

export function HeaderActions() {
	const { open } = useModal();

	return (
		<div className="flex items-center gap-2 h-full">
			{/* Info */}
			<button
				type="button"
				onClick={() => open(<OmniViewInfoModal />, "44rem")}
				aria-label="Open info page"
				title="Open info page"
				className={BUTTON_CLASS}
			>
				?
			</button>
			{/* GitHub */}
			<a
				href={GIT_REPO_URL}
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Open GitHub repository"
				title="Open GitHub repository"
				className={BUTTON_CLASS}
			>
				<GithubIcon className="h-4 w-4" />
				<span className="hidden sm:inline">GitHub</span>
			</a>

			{/* Theme picker */}
			<button
				type="button"
				onClick={() => open(<ThemeModal />, "44rem")}
				aria-label="Change theme"
				title={"Change theme"}
				className={BUTTON_CLASS}
			>
				<ThemeIcon className="h-4 w-4" />
			</button>
		</div>
	);
}
