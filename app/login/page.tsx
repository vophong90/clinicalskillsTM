import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{padding:24}}>Đang tải...</div>}>
      <LoginForm />
    </Suspense>
  );
}
