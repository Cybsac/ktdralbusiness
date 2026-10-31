import { cookies } from 'next/headers';
import { verifyUserSessionCookie } from '@/lib/auth';
import { Suspense } from 'react';
import ExchangeForm from './ExchangeForm';

function ExchangeFormFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default async function IntercambioPage() {
  const session = await verifyUserSessionCookie(cookies().get('user_session')?.value);
  if (!session || !['ADMIN', 'COORDINATOR'].includes(session.role)) return <div className="mx-auto max-w-lg p-8 text-center"><h1 className="text-2xl font-bold">Intercambio no disponible</h1><p className="mt-3">Este servicio no está disponible al público.</p><a href="/" className="btn mt-5">Volver al inicio</a></div>;

  return (
    <div className="min-h-screen bg-[#0E0606] text-white">
      <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-yellow-400 to-red-400 bg-clip-text text-transparent mb-2">
            Intercambio Cliente
          </h1>
          <p className="text-white/60 text-sm sm:text-base">
            Comparte tu experiencia y obtén un premio
          </p>
        </div>
        <Suspense fallback={<ExchangeFormFallback />}>
          <ExchangeForm />
        </Suspense>
      </div>
    </div>
  );
}
