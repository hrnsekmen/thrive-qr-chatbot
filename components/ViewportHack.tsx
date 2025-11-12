'use client';

import { useEffect } from 'react';

export default function ViewportHack() {
  useEffect(() => {
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const root = document.documentElement;

    const setAppHeight = () => {
      const h = vv?.height ?? window.innerHeight;
      root.style.setProperty('--app-height', `${Math.round(h)}px`);
    };

    const setKeyboardClass = () => {
      const viewportH = vv?.height ?? window.innerHeight;
      const windowH = window.innerHeight;
      // If visible viewport notably smaller than layout viewport, assume keyboard open
      const isOpen = viewportH < windowH * 0.96;
      root.classList.toggle('keyboard-open', isOpen);
    };

    const onChange = () => {
      setAppHeight();
      setKeyboardClass();
    };

    setAppHeight();
    setKeyboardClass();

    vv?.addEventListener('resize', onChange);
    vv?.addEventListener('scroll', onChange);
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    window.addEventListener('focusin', onChange);
    window.addEventListener('focusout', onChange);

    return () => {
      vv?.removeEventListener('resize', onChange);
      vv?.removeEventListener('scroll', onChange);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      window.removeEventListener('focusin', onChange);
      window.removeEventListener('focusout', onChange);
    };
  }, []);

  return null;
}


