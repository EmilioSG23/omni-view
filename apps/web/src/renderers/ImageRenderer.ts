/**
 * Renders still-image frames (JPEG, PNG, WebP, BMP …) onto a <canvas>.
 * Each ArrayBuffer is decoded via a Blob URL → Image → drawImage.
 */
export class ImageRenderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private readonly mimeType: string;

	constructor(container: HTMLElement, mimeType: string) {
		this.mimeType = mimeType;
		this.canvas = document.createElement("canvas");
		this.canvas.dataset.omniScreen = "1";
		this.canvas.style.cssText =
			"max-width:100%;max-height:100%;display:block;image-rendering:pixelated";
		this.ctx = this.canvas.getContext("2d")!;
		container.prepend(this.canvas);
	}

	push(buffer: ArrayBuffer): void {
		const url = URL.createObjectURL(new Blob([buffer], { type: this.mimeType }));
		const img = new Image();
		img.onload = () => {
			if (this.canvas.width !== img.naturalWidth) this.canvas.width = img.naturalWidth;
			if (this.canvas.height !== img.naturalHeight) this.canvas.height = img.naturalHeight;
			this.ctx.drawImage(img, 0, 0);
			URL.revokeObjectURL(url);
		};
		img.src = url;
	}

	destroy(): void {
		this.canvas.remove();
	}
}
