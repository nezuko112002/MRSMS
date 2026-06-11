'use client';

import { useEffect } from 'react';

export function ThemeScript() {
  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'dark';
    const html = document.documentElement;
    const body = document.body;
    if (saved === 'dark') {
      html.classList.add('dark');
      body.classList.add('dark-mode');
      body.classList.remove('light-mode');
    } else {
      html.classList.remove('dark');
      body.classList.add('light-mode');
      body.classList.remove('dark-mode');
    }
  }, []);
  return null;
}
