import { useCallback, useEffect, useRef, useState } from "react";

const SCROLL_THRESHOLD = 300; // pixels from bottom to consider "at bottom"

interface UseStickToBottomOptions {
  /** Dependencies that trigger auto-scroll when changed (if sticking) */
  deps?: unknown[];
}

interface UseStickToBottomReturn {
  /** Ref to attach to the scrollable container */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Whether the scroll position is at the bottom */
  isAtBottom: boolean;
  /** Scroll to bottom and re-enable sticking */
  scrollToBottom: () => void;
}

export function useStickToBottom(
  options: UseStickToBottomOptions = {},
): UseStickToBottomReturn {
  const { deps = [] } = options;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const shouldStickRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  // Track if scroll was triggered by wheel/touch (vs scrollbar drag)
  const scrollCauseRef = useRef<"wheel" | "touch" | "unknown">("unknown");

  // Check if scroll position is at bottom
  const checkIsAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD;
  }, []);

  // Update isAtBottom state on scroll, and detect scrollbar drags
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const currentScrollTop = el.scrollTop;
      const scrolledUp = currentScrollTop < lastScrollTopRef.current;
      lastScrollTopRef.current = currentScrollTop;

      const atBottom = checkIsAtBottom();
      setIsAtBottom(atBottom);

      // Re-enable sticking only when user intentionally scrolls DOWN to bottom
      // (not when they're still within threshold while scrolling up)
      if (atBottom && !scrolledUp) {
        shouldStickRef.current = true;
      }
      // Detect scrollbar drag (scroll up without wheel/touch event)
      else if (scrolledUp && scrollCauseRef.current === "unknown") {
        shouldStickRef.current = false;
      }

      // Reset cause after handling
      scrollCauseRef.current = "unknown";
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [checkIsAtBottom]);

  // Detect user scroll intent via wheel/touch - this disables sticking
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      scrollCauseRef.current = "wheel";
      // Wheel up = negative deltaY = scrolling up to see earlier content
      if (e.deltaY < 0) {
        shouldStickRef.current = false;
      }
    };

    const handleTouch = () => {
      scrollCauseRef.current = "touch";
      // Any touch interaction could be user wanting to scroll
      shouldStickRef.current = false;
    };

    el.addEventListener("wheel", handleWheel, { passive: true });
    el.addEventListener("touchmove", handleTouch, { passive: true });

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchmove", handleTouch);
    };
  }, []);

  // Auto-scroll when deps change and sticking is enabled
  useEffect(() => {
    if (!shouldStickRef.current) return;

    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      if (!scrollRef.current || !shouldStickRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

      // Determine scroll behavior:
      // - Instant for initial load (at top with content)
      // - Smooth for streaming updates
      const isFreshLoad = scrollTop === 0 && scrollHeight > clientHeight;

      scrollRef.current.scrollTo({
        top: scrollHeight,
        behavior: isFreshLoad ? "instant" : "smooth",
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Programmatic scroll to bottom (also re-enables sticking)
  const scrollToBottom = useCallback(() => {
    shouldStickRef.current = true;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    });
  }, []);

  return { scrollRef, isAtBottom, scrollToBottom };
}
