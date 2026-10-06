export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Installed (home-screen) PWAs on iOS ignore <a download>, so they only get the share sheet. */
export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Touch devices get the share sheet (Save to Files / AirDrop / apps); desktops get a normal download.
 *  navigator.share needs a fresh tap, so this must run from a click, not after a long render. */
export async function saveFile(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  downloadBlob(blob, name);
}

export const slugify = (s: string, max = 40) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max);
