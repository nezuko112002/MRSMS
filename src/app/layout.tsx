import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeScript } from '@/components/layout/ThemeScript';
import { ClientProviders } from '@/components/layout/ClientProviders';

export const metadata: Metadata = {
  title: 'MRSMS — Material Request & Stock Management System',
  description: 'Material Request & Stock Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body suppressHydrationWarning>
        <ThemeScript />
        <AuthProvider>
          <ClientProviders>
            {children}
          </ClientProviders>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'rgba(30,27,75,0.9)',
                color: '#e0e7ff',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#34d399', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#f87171', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
