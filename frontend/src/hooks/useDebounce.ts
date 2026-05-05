import { useEffect, useRef, useState } from "react";

export function useDebounce<T>(value: T, delay: number): T {
	const [deb, setDeb] = useState(value);
	const t = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		if (t.current) clearTimeout(t.current);
		t.current = setTimeout(() => setDeb(value), delay);
		return () => {
			if (t.current) clearTimeout(t.current);
		};
	}, [value, delay]);
	return deb;
}
