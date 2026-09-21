import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { Sidebar } from '@/features/shell/Sidebar';
import { Topbar } from '@/features/shell/Topbar';
// BILLING-DISABLED BUILD: un-comment with the strip in the layout below.
// import { TrialStrip } from '@/features/shell/TrialStrip';

/**
 * Shown while a page chunk arrives.
 *
 * Deliberately inside <main>, not around the whole shell: the sidebar and topbar
 * are already on screen and must stay there, or every navigation would flash the
 * entire frame away and back.
 */
function PageFallback() {
  return (
    <div className="flex flex-col gap-md" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded-sm bg-neutral-100" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-neutral-100" />
    </div>
  );
}

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* min-w-0 matters: without it a wide table inside a flex child refuses
          to shrink and the whole page scrolls sideways. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* BILLING-DISABLED BUILD: the free-trial countdown strip. */}
        {/* <TrialStrip /> */}
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 p-md lg:p-lg">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
