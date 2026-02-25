import {
  Dispatch,
  Ref,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';

export type PopupPlacement =
  | 'above'
  | 'below'
  | 'left'
  | 'right';

export interface Point {
  x: number;
  y: number;
}

export interface PopupTrigger<
  EPopup extends HTMLElement | SVGElement,
  EParent extends HTMLElement | SVGElement
> {
  visible: boolean;
  popupRef: Ref<EPopup>;
  parentRef: Ref<EParent>;
}

export interface PopupTriggerOptions {
  open?: boolean;
  intentTimeout?: number;
}

export function usePopupTrigger<
  EPopup extends HTMLElement | SVGElement,
  EParent extends HTMLElement | SVGElement = HTMLElement
>(
  placement: PopupPlacement,
  content?: any,
  {
    open: forceOpen,
    intentTimeout = 300,
  }: PopupTriggerOptions = {}
): PopupTrigger<EPopup, EParent> {
  const [visible, setVisible] = useState(false);

  const open = forceOpen ?? visible;

  const [parent, setParent] = useState<EParent | null>(null);

  useEffect(() => {
    if (!parent) {
      return;
    }

    const popup: PopupInstance = {
      trigger: parent,
      intentTimeout,
      setVisible,
    };

    register(popup);
    return () => unregister(popup);
  }, [parent, intentTimeout]);

  const popupRef = useRef<EPopup>(null);

  useEffect(() => {
    const popup = popupRef.current;
    if (!open || !popup || !parent) {
      return;
    }

    const { x, y } = placePopup(
      placement,
      parent.getBoundingClientRect(),
      popup.getBoundingClientRect()
    );

    popup.style.left = `${Math.round(x)}px`;
    popup.style.top = `${Math.round(y)}px`;
  }, [open, placement, parent, content]);

  return { visible: open, popupRef, parentRef: setParent };
}

type TriggerElement = HTMLElement | SVGElement;

interface PopupInstance {
  readonly trigger: TriggerElement;
  readonly intentTimeout: number;
  readonly setVisible: Dispatch<SetStateAction<boolean>>;
}

const popupStack: PopupInstance[] = [];
let popupTimeoutId: number | null = null;
let leaveTimeoutId: number | null = null;
const popups = new Map<TriggerElement, PopupInstance>();

const cancelLeave = (): void => {
  if (leaveTimeoutId !== null) {
    clearTimeout(leaveTimeoutId);
    leaveTimeoutId = null;
  }
};

const closeAll = (): void => {
  cancelLeave();
  if (popupTimeoutId !== null) {
    clearTimeout(popupTimeoutId);
    popupTimeoutId = null;
  }
  for (const p of popupStack) {
    p.setVisible(false);
  }
  popupStack.length = 0;
};

const enter = (popup: PopupInstance): void => {
  cancelLeave();

  // Already the top of the stack
  if (popupStack.length > 0 && popupStack[popupStack.length - 1] === popup) {
    return;
  }

  // Re-entering a popup lower in the stack — close everything above it
  const existingIndex = popupStack.indexOf(popup);
  if (existingIndex !== -1) {
    for (let i = popupStack.length - 1; i > existingIndex; i--) {
      popupStack[i].setVisible(false);
    }
    popupStack.length = existingIndex + 1;
    return;
  }

  // Nested popup: trigger is inside the popup root (i.e. inside an open popup)
  const isNested = popupStack.length > 0 && root !== null && root.contains(popup.trigger);

  if (!isNested) {
    closeAll();
  }

  popupStack.push(popup);

  if (isNested) {
    popup.setVisible(true);
  } else {
    popupTimeoutId = window.setTimeout(() => {
      popup.setVisible(true);
      popupTimeoutId = null;
    }, popup.intentTimeout);
  }
};

const scheduleLeave = (): void => {
  if (leaveTimeoutId === null) {
    leaveTimeoutId = window.setTimeout(() => {
      leaveTimeoutId = null;
      closeAll();
    }, 100);
  }
};

const mouseMove = (e: MouseEvent): void => {
  let popup: PopupInstance | undefined = undefined;

  let node = e.target as ChildNode | null;
  while (node && !popup) {
    popup = popups.get(node as TriggerElement);
    node = node.parentElement;
  }

  if (popup) {
    enter(popup);
  } else if (popupStack.length > 0 && root && root.contains(e.target as Node)) {
    cancelLeave();
  } else {
    scheduleLeave();
  }
};

const focus = (e: FocusEvent): void => {
  const popup = popups.get(e.target as TriggerElement);
  if (popup) {
    enter(popup);
  } else {
    closeAll();
  }
};

const blur = (e: FocusEvent): void => {
  const nextPopup = popups.get(e.relatedTarget as TriggerElement);
  if (!nextPopup) {
    closeAll();
  }
};

const register = (inst: PopupInstance): void => {
  if (popups.size === 0) {
    window.addEventListener('mousemove', mouseMove);
    window.addEventListener('focusin', focus);
    window.addEventListener('focusout', blur);
    window.addEventListener('scroll', closeAll);
  }
  popups.set(inst.trigger, inst);
};

const unregister = (inst: PopupInstance): void => {
  popups.delete(inst.trigger);
  if (popups.size === 0) {
    window.removeEventListener('mousemove', mouseMove);
    window.removeEventListener('focusin', focus);
    window.removeEventListener('focusout', blur);
    window.removeEventListener('scroll', closeAll);
  }
  const idx = popupStack.indexOf(inst);
  if (idx !== -1) {
    for (let i = popupStack.length - 1; i >= idx; i--) {
      popupStack[i].setVisible(false);
    }
    popupStack.length = idx;
  }
};

/**
 * Places a popup relative to a parent element.
 * @param placement The relative location of the popup.
 * @param parentRect The parent element's location on screen.
 * @param popupRect The popup element's location on screen.
 * @param separation The distance between the popup element and the edge of
 *        the parent element.
 * @param screenMargin The minimum distance between the popup element and
 *        the edge of the screen.
 * @return The location of the popup's top left corner.
 */
export function placePopup(
  placement: PopupPlacement,
  parentRect: DOMRect,
  popupRect: DOMRect,
  separation = 6,
  screenMargin = 8
): Point {
  let x: number;
  switch (placement) {
    case 'above':
    case 'below':
      x = parentRect.x + (parentRect.width - popupRect.width) / 2;
      break;
    case 'left':
      x = parentRect.x - popupRect.width - separation;
      break;
    case 'right':
      x = parentRect.x + parentRect.width + separation;
      break;
  }
  x = clamp(
    x,
    screenMargin,
    window.innerWidth - popupRect.width - screenMargin
  );

  let y: number;
  switch (placement) {
    case 'above':
      y = parentRect.y - popupRect.height - separation;
      break;
    case 'below':
      y = parentRect.y + parentRect.height + separation;
      break;
    case 'left':
    case 'right':
      y = parentRect.y + (parentRect.height - popupRect.height) / 2;
      break;
  }
  y = clamp(
    y,
    screenMargin,
    window.innerHeight - popupRect.height - screenMargin
  );

  return { x, y };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

let root: HTMLElement | null = null;

export function getPopupRoot(): HTMLElement {
  if (!root) {
    root = document.createElement('div');
    root.dataset.purpose = 'popups';
    document.body.appendChild(root);
  }
  return root;
}
