import { dark } from '@clerk/themes';
import type { Appearance } from '@clerk/types';

/**
 * NextFlow dark UI aligned with Clerk — fixes OAuth / placeholder / footer contrast.
 */
export const clerkAppearance: Appearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#A855F7',
    colorBackground: '#161616',
    colorInputBackground: '#111111',
    colorText: '#F0F0F0',
    colorTextSecondary: '#a3a3a3',
    colorNeutral: '#d4d4d4',
    colorDanger: '#f87171',
    colorSuccess: '#4ade80',
    colorWarning: '#a78bfa',
    borderRadius: '0.5rem',
  },
  elements: {
    rootBox: 'mx-auto w-full max-w-[400px]',
    card: 'bg-[#161616] border border-[#272727] shadow-2xl !shadow-black/40',
    headerTitle: 'text-[#F0F0F0]',
    headerSubtitle: 'text-[#a3a3a3]',
    // OAuth — explicit light text on elevated dark surface (fixes invisible Google label)
    socialButtonsBlockButton:
      '!bg-[#1E1E1E] !border !border-[#3f3f46] hover:!bg-[#262626] hover:!border-[#52525b] !text-[#F0F0F0] !shadow-none',
    socialButtonsBlockButtonText: '!text-[#F0F0F0] !font-medium',
    socialButtonsBlockButtonArrow: '!text-[#a3a3a3]',
    dividerLine: 'bg-[#272727]',
    dividerText: 'text-[#737373]',
    formFieldLabel: 'text-[#c4c4c4]',
    formFieldHintText: 'text-[#737373]',
    formFieldErrorText: 'text-[#f87171]',
    formFieldInput:
      '!bg-[#111111] !border-[#272727] !text-[#F0F0F0] focus:!border-[#A855F7] focus:!ring-1 focus:!ring-[#A855F7]/40',
    formFieldInputShowPasswordButton: 'text-[#a3a3a3] hover:text-[#F0F0F0]',
    formButtonPrimary:
      '!bg-[#A855F7] hover:!bg-[#9333EA] !text-white !font-medium !shadow-none',
    formButtonReset: 'text-[#a3a3a3] hover:text-[#F0F0F0]',
    footer: '!bg-[#121212] border-t border-[#272727]',
    footerAction: 'text-[#a3a3a3]',
    footerActionText: 'text-[#a3a3a3]',
    footerActionLink: 'text-[#A855F7] hover:text-[#c4b5fd] font-medium',
    identityPreview: 'bg-[#111111] border-[#272727]',
    identityPreviewText: 'text-[#F0F0F0]',
    identityPreviewEditButton: 'text-[#A855F7]',
    alertText: 'text-[#fca5a5]',
    formResendCodeLink: 'text-[#A855F7] hover:text-[#c4b5fd]',
    otpCodeFieldInput: '!bg-[#111111] !border-[#272727] !text-[#F0F0F0]',
    navbar: 'bg-[#161616] border-[#272727]',
    navbarButton: 'text-[#F0F0F0]',
    badge: 'bg-[#2e1064]/80 text-[#e9d5ff] border-[#6d28d9]/40',
    scrollBox: 'bg-[#161616]',
  },
};
