// ─── Frame type detection ─────────────────────────────────────────────────────

/** True if buffer is an fMP4 frame (ftyp, moov, or moof box). */
export function isFmpFrame(buf: ArrayBuffer): boolean {
	if (buf.byteLength < 8) return false;
	const v = new DataView(buf);
	const b4 = v.getUint8(4),
		b5 = v.getUint8(5);
	// "ft" (ftyp) or "mo" (moov / moof)
	return (b4 === 0x66 && b5 === 0x74) || (b4 === 0x6d && b5 === 0x6f);
}

/** True if buffer is a JPEG (SOI = FF D8). */
export function isJpeg(buf: ArrayBuffer): boolean {
	if (buf.byteLength < 2) return false;
	const v = new DataView(buf);
	return v.getUint8(0) === 0xff && v.getUint8(1) === 0xd8;
}

/** True if buffer is a PNG (magic 89 50 …). */
export function isPng(buf: ArrayBuffer): boolean {
	if (buf.byteLength < 4) return false;
	const v = new DataView(buf);
	return v.getUint8(0) === 0x89 && v.getUint8(1) === 0x50;
}
