const MAX_PX = 3000;
const MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB
const WEBP_QUALITY = 0.85;

const SKIP_TYPES = new Set(["image/gif", "image/svg+xml", "image/webp"]);

/**
 * Compresses large images to WebP before upload.
 * Skips GIF, SVG, WebP and files already under MAX_BYTES.
 * Returns the original file if compression doesn't reduce size.
 */
export async function optimizeImage(file: File): Promise<File> {
	if (!file.type.startsWith("image/") || SKIP_TYPES.has(file.type)) return file;
	if (file.size < MAX_BYTES) return file;

	return new Promise<File>((resolve) => {
		const img = new Image();
		const blobUrl = URL.createObjectURL(file);

		img.onload = () => {
			URL.revokeObjectURL(blobUrl);

			let { naturalWidth: w, naturalHeight: h } = img;
			if (w > MAX_PX || h > MAX_PX) {
				const ratio = Math.min(MAX_PX / w, MAX_PX / h);
				w = Math.round(w * ratio);
				h = Math.round(h * ratio);
			}

			const canvas = document.createElement("canvas");
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext("2d");
			if (!ctx) { resolve(file); return; }
			ctx.drawImage(img, 0, 0, w, h);

			canvas.toBlob(
				(blob) => {
					if (blob && blob.size < file.size) {
						const name = file.name.replace(/\.[^.]+$/, ".webp");
						resolve(new File([blob], name, { type: "image/webp" }));
					} else {
						resolve(file);
					}
				},
				"image/webp",
				WEBP_QUALITY,
			);
		};

		img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file); };
		img.src = blobUrl;
	});
}
