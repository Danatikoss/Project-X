import type { MediaAsset } from "../types";

export async function getNaturalAR(asset: Pick<MediaAsset, "url" | "file_type">): Promise<number | null> {
	return new Promise((resolve) => {
		const tid = setTimeout(() => resolve(null), 1500);
		if (asset.file_type === "video") {
			const v = document.createElement("video");
			v.onloadedmetadata = () => {
				clearTimeout(tid);
				resolve(v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : null);
			};
			v.onerror = () => { clearTimeout(tid); resolve(null); };
			v.src = asset.url;
		} else {
			const img = new window.Image();
			img.onload = () => {
				clearTimeout(tid);
				resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
			};
			img.onerror = () => { clearTimeout(tid); resolve(null); };
			img.src = asset.url;
		}
	});
}
