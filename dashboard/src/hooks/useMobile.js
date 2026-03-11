import { useState, useEffect, useRef } from 'react';

/**
 * Returns true when viewport width is below 1024px.
 * Uses debounced resize listener (150ms).
 */
export default function useMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const timer = useRef(null);

  useEffect(() => {
    function handleResize() {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setIsMobile(window.innerWidth < 1024);
      }, 150);
    }

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return isMobile;
}
