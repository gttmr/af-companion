import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LiveWorkbenchLayout } from "../layout/LiveWorkbenchLayout";

const WorkspaceHome = lazy(() => import("./WorkspaceHome"));
const DiscoverWorkspace = lazy(() => import("./work/DiscoverWorkspace"));
const ComposeWorkspace = lazy(() => import("./work/ComposeWorkspace"));
const ScaffoldWorkspace = lazy(() => import("./work/ScaffoldWorkspace"));
const VerifyWorkspace = lazy(() => import("./work/VerifyWorkspace"));
const ConnectionsPage = lazy(() => import("./ConnectionsPage"));
const AssetsPage = lazy(() => import("./AssetsPage"));

function PageFallback() {
  return <div className="route-loading"><i /><span>Workspace projection을 여는 중…</span></div>;
}

function Page({ children }: { children: React.ReactNode }) {
  return <LiveWorkbenchLayout>{children}</LiveWorkbenchLayout>;
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Page><WorkspaceHome /></Page>} />
        <Route path="/work/:workId/discover" element={<Page><DiscoverWorkspace /></Page>} />
        <Route path="/work/:workId/compose" element={<Page><ComposeWorkspace /></Page>} />
        <Route path="/work/:workId/scaffold" element={<Page><ScaffoldWorkspace /></Page>} />
        <Route path="/work/:workId/verify" element={<Page><VerifyWorkspace /></Page>} />
        <Route path="/work/:workId" element={<Navigate to="discover" replace />} />
        <Route path="/connections" element={<Page><ConnectionsPage /></Page>} />
        <Route path="/assets" element={<Page><AssetsPage /></Page>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
