"use client";

import dynamic from 'next/dynamic';

// React Admin expects a browser DOM, so keep the tabbed interface client-only.
const UsersWithTabs = dynamic(() => import('./UsersWithTabs'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
      Cargando usuarios...
    </div>
  ),
});

export default function UsersWithTabsClient() {
  return <UsersWithTabs />;
}
