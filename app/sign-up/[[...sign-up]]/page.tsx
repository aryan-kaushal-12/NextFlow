import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="auth-page-scroll min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#0A0A0A' }}>
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center mb-2">
            <div className="w-8 h-8 rounded-lg" style={{ background: 'linear-gradient(135deg,#A855F7,#7C3AED)' }} />
            <span className="text-xl font-semibold" style={{ color: '#F0F0F0' }}>NextFlow</span>
          </div>
          <p style={{ color: '#a3a3a3', fontSize: '14px' }}>LLM Workflow Builder</p>
        </div>
        <SignUp signInUrl="/sign-in" />
      </div>
    </div>
  );
}
