import {
	ChevronLeft,
	ChevronRight,
	Download,
	Maximize,
	Minimize,
	Pause,
	Play,
	SkipBack,
	SkipForward,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Slide, SlideOverlay } from "../../types";
import { cn } from "../../utils/cn";

interface SlideshowProps {
	slides: Slide[];
	startIndex?: number;
	onClose: () => void;
	overlays?: Record<string, SlideOverlay[]>;
	onExport?: (fmt: "pptx" | "pdf") => void;
}

export function Slideshow({ slides, startIndex = 0, onClose, overlays, onExport }: SlideshowProps) {
	const [index, setIndex] = useState(Math.max(0, Math.min(startIndex, slides.length - 1)));
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [controlsVisible, setControlsVisible] = useState(true);
	const [autoplay, setAutoplay] = useState(false);
	const [autoplayInterval, setAutoplayIntervalMs] = useState(4000);
	const containerRef = useRef<HTMLDivElement>(null);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const autoplayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const slide = slides[index];
	const hasPrev = index > 0;
	const hasNext = index < slides.length - 1;

	const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
	const next = useCallback(() => {
		setIndex((i) => {
			if (i >= slides.length - 1) {
				setAutoplay(false);
				return i;
			}
			return i + 1;
		});
	}, [slides.length]);

	// Auto-enter fullscreen when slideshow opens
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		el.requestFullscreen().catch(() => {});
	}, []);

	// Fullscreen API
	const toggleFullscreen = useCallback(() => {
		if (!document.fullscreenElement) {
			containerRef.current?.requestFullscreen().catch(() => {});
		} else {
			document.exitFullscreen().catch(() => {});
		}
	}, []);

	// Keyboard navigation
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
				return;
			}
			if (e.key === "ArrowRight" || e.key === " ") {
				e.preventDefault();
				next();
			}
			if (e.key === "ArrowLeft") prev();
			if (e.key === "f" || e.key === "F") toggleFullscreen();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [next, prev, toggleFullscreen, onClose]);

	useEffect(() => {
		const handler = () => {
			const fs = !!document.fullscreenElement;
			setIsFullscreen(fs);
			// Exit slideshow when user presses Esc to leave fullscreen
			if (!fs) onClose();
		};
		document.addEventListener("fullscreenchange", handler);
		return () => document.removeEventListener("fullscreenchange", handler);
	}, [onClose]);

	// Auto-hide controls
	const showControls = useCallback(() => {
		setControlsVisible(true);
		if (hideTimer.current) clearTimeout(hideTimer.current);
		hideTimer.current = setTimeout(() => setControlsVisible(false), 3000);
	}, []);

	useEffect(() => {
		showControls();
		return () => {
			if (hideTimer.current) clearTimeout(hideTimer.current);
		};
	}, [showControls]);

	// Autoplay
	useEffect(() => {
		if (autoplayTimer.current) clearTimeout(autoplayTimer.current);
		if (!autoplay) return;
		autoplayTimer.current = setTimeout(() => next(), autoplayInterval);
		return () => {
			if (autoplayTimer.current) clearTimeout(autoplayTimer.current);
		};
	}, [autoplay, autoplayInterval, next]);

	return (
		<div
			ref={containerRef}
			className="fixed inset-0 bg-black z-50 flex items-center justify-center select-none"
			onMouseMove={showControls}
			onClick={showControls}
		>
			{/* Slide — fills the screen maintaining 16:9 */}
			<div
				className="relative"
				style={{
					width: "min(100vw, calc(100vh * 16 / 9))",
					height: "min(100vh, calc(100vw * 9 / 16))",
				}}
			>
				{slide?.video_url ? (
					<video
						src={slide.video_url}
						controls
						className="w-full h-full"
						poster={slide.thumbnail_url || undefined}
					/>
				) : slide?.thumbnail_url ? (
					<img
						src={slide.thumbnail_url}
						alt={slide.title || "Слайд"}
						className="w-full h-full object-contain"
						loading="eager"
						fetchPriority="high"
						decoding="async"
					/>
				) : slide ? (
					<div className="w-full h-full flex items-center justify-center bg-gray-900">
						<span className="text-white/40 text-sm">Нет изображения</span>
					</div>
				) : null}

				{/* Media overlays */}
				{slide &&
					overlays &&
					(overlays[String(slide.id)] || []).map((overlay) => (
						<div
							key={overlay.id}
							className="absolute pointer-events-none"
							style={{
								left: `${overlay.x}%`,
								top: `${overlay.y}%`,
								width: `${overlay.w}%`,
								height: `${overlay.h}%`,
							}}
						>
							{overlay.file_type === "video" ? (
								<video
									src={overlay.url}
									autoPlay
									loop
									muted
									playsInline
									className="w-full h-full object-contain"
								/>
							) : (
								<img src={overlay.url} alt="" className="w-full h-full object-contain" />
							)}
						</div>
					))}

				{/* Prev / Next arrows — overlaid on the slide */}
				{hasPrev && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							prev();
						}}
						className={cn(
							"absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12",
							"rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center",
							"transition-opacity duration-300",
							controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
						)}
					>
						<ChevronLeft className="w-7 h-7" />
					</button>
				)}
				{hasNext && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							next();
						}}
						className={cn(
							"absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12",
							"rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center",
							"transition-opacity duration-300",
							controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
						)}
					>
						<ChevronRight className="w-7 h-7" />
					</button>
				)}
			</div>

			{/* Top bar — absolute over everything */}
			<div
				className={cn(
					"absolute top-0 inset-x-0 z-10 flex items-center justify-between px-6 py-4",
					"bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-300",
					controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
				)}
			>
				<p className="text-white text-sm font-medium truncate max-w-xl">{slide?.title || ""}</p>
				<div className="flex items-center gap-2">
					{onExport && (
						<div className="flex items-center gap-1 mr-1">
							<button
								onClick={() => onExport("pptx")}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
								title="Скачать PPTX"
							>
								<Download className="w-3.5 h-3.5" /> PPTX
							</button>
							<button
								onClick={() => onExport("pdf")}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
								title="Скачать PDF"
							>
								<Download className="w-3.5 h-3.5" /> PDF
							</button>
						</div>
					)}
					<button
						onClick={toggleFullscreen}
						className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
						title={isFullscreen ? "Выйти из полноэкранного" : "Полный экран (F)"}
					>
						{isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
					</button>
					<button
						onClick={onClose}
						className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
						title="Закрыть (Esc)"
					>
						<X className="w-5 h-5" />
					</button>
				</div>
			</div>

			{/* Bottom bar — absolute over everything */}
			<div
				className={cn(
					"absolute bottom-0 inset-x-0 z-10",
					"bg-gradient-to-t from-black/70 to-transparent",
					"transition-opacity duration-300",
					controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
				)}
			>
				{/* Progress dots */}
				<div className="flex items-center justify-center gap-1.5 py-3">
					{slides.map((_, i) => (
						<button
							key={i}
							onClick={() => setIndex(i)}
							className={cn(
								"rounded-full transition-all duration-200",
								i === index ? "w-4 h-2 bg-white" : "w-2 h-2 bg-white/40 hover:bg-white/70"
							)}
						/>
					))}
				</div>

				{/* Controls */}
				<div className="flex items-center justify-between px-6 pb-5">
					<p className="text-white/60 text-sm">
						{index + 1} / {slides.length}
					</p>

					<div className="flex items-center gap-2">
						<button
							onClick={() => setIndex(0)}
							disabled={index === 0}
							className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
							title="В начало"
						>
							<SkipBack className="w-4 h-4" />
						</button>
						<button
							onClick={prev}
							disabled={!hasPrev}
							className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
						>
							<ChevronLeft className="w-5 h-5" />
						</button>
						<button
							onClick={() => setAutoplay((v) => !v)}
							className={cn(
								"w-10 h-10 rounded-full flex items-center justify-center transition-colors",
								autoplay
									? "bg-white text-black hover:bg-white/80"
									: "bg-white/20 text-white hover:bg-white/30"
							)}
							title={autoplay ? "Пауза" : "Авто-воспроизведение"}
						>
							{autoplay ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
						</button>
						<button
							onClick={next}
							disabled={!hasNext}
							className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
						>
							<ChevronRight className="w-5 h-5" />
						</button>
						<button
							onClick={() => setIndex(slides.length - 1)}
							disabled={index === slides.length - 1}
							className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
							title="В конец"
						>
							<SkipForward className="w-4 h-4" />
						</button>
					</div>

					<div className="flex items-center gap-2">
						<span className="text-white/40 text-xs">Скорость:</span>
						{[3, 5, 8].map((s) => (
							<button
								key={s}
								onClick={() => setAutoplayIntervalMs(s * 1000)}
								className={cn(
									"text-xs px-2 py-0.5 rounded transition-colors",
									autoplayInterval === s * 1000
										? "bg-white/30 text-white"
										: "text-white/40 hover:text-white/70"
								)}
							>
								{s}с
							</button>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
