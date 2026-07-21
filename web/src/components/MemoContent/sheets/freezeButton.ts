// Freeze toggle for the sheets toolbar.
//
// x-spreadsheet's toolbar is built from a fixed item list with no extension
// point, so the button is appended to the rendered toolbar's left group by hand
// — the same approach the context menu takes. "Frozen" here means the *view* is
// pinned: scrolling and row/column resizing are blocked, while cell selection
// and editing keep working.

const BUTTON_CLASS = "sheets-freeze-btn";

export interface FreezeButton {
  // Re-syncs the button's pressed look with the current state.
  sync: (frozen: boolean) => void;
  destroy: () => void;
}

// Appends the button to the toolbar inside `host`, calling `onToggle` with the
// requested state on each click. Returns null when the toolbar isn't rendered
// (read-only blocks hide it entirely).
export function mountFreezeButton(
  host: HTMLElement,
  initial: boolean,
  labels: { freeze: string; unfreeze: string },
  onToggle: (frozen: boolean) => void,
): FreezeButton | null {
  // Mount into the toolbar element itself, *not* its `-toolbar-btns` group:
  // x-spreadsheet's overflow handling (moreResize) does `btns.html('')` on every
  // resize, which would silently delete any child we appended there. The toolbar
  // also reserves ~60px of free space on its right (widthFn() - 60), so the
  // button is absolutely positioned into that gap (see index.css).
  const toolbar = host.querySelector<HTMLElement>(".x-spreadsheet-toolbar");
  if (!toolbar) return null;

  const button = document.createElement("div");
  button.className = BUTTON_CLASS;
  button.textContent = "🔒";

  let frozen = initial;
  const sync = (next: boolean) => {
    frozen = next;
    button.classList.toggle("active", frozen);
    button.title = frozen ? labels.unfreeze : labels.freeze;
  };
  sync(initial);

  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle(!frozen);
  };
  button.addEventListener("click", onClick);
  toolbar.appendChild(button);

  return {
    sync,
    destroy: () => {
      button.removeEventListener("click", onClick);
      button.remove();
    },
  };
}
