'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, Bell, Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface HeaderProps {
  title?: string;
  onMobileMenuToggle?: () => void;
  mobileMenuOpen?: boolean;
}

export function Header({ title, onMobileMenuToggle, mobileMenuOpen }: HeaderProps) {
  const { profile } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (saved) setTheme(saved);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.body.classList.toggle('dark-mode', next === 'dark');
    document.body.classList.toggle('light-mode', next === 'light');
  }

  return (
    <header className="glass sticky top-0 z-20 px-4 md:px-6 py-3 flex items-center gap-3 border-b border-white/20 dark:border-white/10">
      {/* Mobile menu toggle */}
      <button
        className="md:hidden btn-ghost p-2"
        onClick={onMobileMenuToggle}
        aria-label="Toggle menu"
      >
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Title */}
      {title && (
        <h1 className="text-base font-semibold text-gray-900 dark:text-white flex-1 md:flex-none">
          {title}
        </h1>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="btn-ghost p-2 rounded-xl"
          aria-label="Toggle theme"
        >
          {theme === 'dark'
            ? <Sun size={18} className="text-amber-400" />
            : <Moon size={18} className="text-brand-500" />
          }
        </button>

        {/* Notifications (placeholder) */}
        <button className="btn-ghost p-2 rounded-xl relative">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </button>

        {/* User avatar (mobile) */}
        {profile && (
          <div className="md:hidden w-8 h-8 rounded-full bg-brand-600/20 flex items-center justify-center">
            <span className="text-xs font-bold text-brand-600 dark:text-brand-400">
              {profile.full_name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
