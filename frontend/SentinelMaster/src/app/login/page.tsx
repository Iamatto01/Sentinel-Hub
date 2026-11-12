import { Suspense } from 'react';
import type { Metadata } from 'next';
import LoginForm from '@/components/LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: "try{document.documentElement.setAttribute('data-theme','dark');}catch(e){}",
        }}
      />
      <Suspense
        fallback={
          <div className="login-page">
            <div className="login-card">
              <div className="loading-line">
                <span className="spinner" />
                Preparing secure sign-in…
              </div>
            </div>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </>
  );
}
