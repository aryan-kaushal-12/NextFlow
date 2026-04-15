import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { clerkAppearance } from '@/lib/clerk-appearance';
import './globals.css';

export const metadata: Metadata = {
  title: 'NextFlow — LLM Workflow Builder',
  description: 'Build powerful LLM workflows with a visual canvas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
