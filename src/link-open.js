// Browser-like note-link navigation shared by the editor, previews, canvas cards and side panels.
export const isMiddleClick = (event) => event?.button === 1;
export const linkOpenOptions = (event) => ({ newTab: isMiddleClick(event) || !!event?.ctrlKey || !!event?.metaKey });
