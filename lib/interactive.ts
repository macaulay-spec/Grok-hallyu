import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewProps } from 'react-native';

/**
 * Interaction-safe scheduling for work that is *nice to have* but must never stand between the
 * member and a responsive app: live recommendations, cross-fandom discovery, secondary catalog
 * hydration.
 *
 * The gate opens on whichever comes first:
 *  - the member's first touch on the screen, observed in the responder capture phase so the touch
 *    itself is never stolen or delayed (the handler returns `false` and lets it through), or
 *  - a bounded idle ceiling, so someone who only looks at the screen still gets their content.
 *
 * The timer is a liveness backstop, not the happy path, and it is cleared on unmount. Everything
 * these screens show before the gate opens is already complete and correct — the gated calls only
 * ever *upgrade* what is on screen.
 */
export interface InteractionGate {
  /** True once it is safe to start deferred work. */
  ready: boolean;
  /** Responder-capture handler for the screen root (`<Screen onStartShouldSetResponderCapture=…>`). */
  capture: ViewProps['onStartShouldSetResponderCapture'];
}

/** @param ceilingMs hard backstop so deferred work still runs for a member who never touches anything. */
export function useInteractionGate(ceilingMs = 1200): InteractionGate {
  const [ready, setReady] = useState(false);
  const armed = useRef(false);

  const open = useCallback(() => {
    if (armed.current) return;
    armed.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (armed.current) return;
    const t = setTimeout(() => open(), ceilingMs);
    return () => clearTimeout(t);
  }, [open, ceilingMs]);

  const capture = useCallback(() => {
    open();
    return false; // capture phase, never claim — the button underneath still gets the touch
  }, [open]);

  return { ready, capture };
}
