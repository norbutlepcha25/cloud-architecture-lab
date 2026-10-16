import { AnalyticsObserver } from './analytics/AnalyticsObserver.tsx';
import { HomePage } from './components/home/HomePage.tsx';
import { AppFooter } from './components/layout/AppFooter.tsx';
import React, { useState } from 'react';
import { ArchitectureProvider, useArchitecture } from './context/ArchitectureContext.tsx';
import { AppHeader } from './components/layout/AppHeader.tsx';
import { ServicePalette } from './components/palette/ServicePalette.tsx';
import { ArchitectureCanvas } from './components/canvas/ArchitectureCanvas.tsx';
import { ServiceInspector } from './components/inspector/ServiceInspector.tsx';
import { SimulationControls } from './components/simulation/SimulationControls.tsx';
import { EventTimeline } from './components/simulation/EventTimeline.tsx';
import { FailureControls } from './components/failure/FailureControls.tsx';
import { AnalysisModal } from './components/analysis/AnalysisModal.tsx';
import { LabsModal } from './components/labs/LabsModal.tsx';
import { ExportModal } from './components/export/ExportModal.tsx';
import { CostEstimatorModal } from './components/cost/CostEstimatorModal.tsx';
import { NaclSideColumn } from './components/inspector/NaclSideColumn.tsx';
import { useTheme } from './utils/theme.ts';

const AppContent: React.FC<{ onHome: () => void }> = ({ onHome }) => {
  const { appMode, showNaclSideColumn, setShowNaclSideColumn } = useArchitecture();
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isLabsOpen, setIsLabsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isCostOpen, setIsCostOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();

  // Dark mode lives on <html> so portalled dialogs are themed too: `dark` drives Tailwind dark:
  // variants, `lab-dark` the generated overrides in styles/lab-dark.generated.css. Removed when
  // leaving the lab; the home page themes itself.
  React.useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('dark', theme === 'dark');
    html.classList.toggle('lab-dark', theme === 'dark');
    return () => { html.classList.remove('dark', 'lab-dark'); };
  }, [theme]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-slate-900 font-sans select-none">
      {/* Top Application Header */}
      <AppHeader
        onHome={onHome}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenAnalysis={() => setIsAnalysisOpen(true)}
        onOpenLabs={() => setIsLabsOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenCost={() => setIsCostOpen(true)}
      />

      {/* Failure Testing Strip (Active in failure mode) */}
      {appMode === 'failure' && <FailureControls />}

      {/* Main Diagram Canvas Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Left AWS Service Palette */}
        <ServicePalette />

        {/* Center Diagram Canvas Area */}
        <main className="flex-1 relative flex flex-col h-full overflow-hidden bg-white">
          {/* Graph Canvas */}
          <ArchitectureCanvas />

          {/* Bottom Simulation Scrubbing Event Timeline */}
          <EventTimeline />

          {/* Simulation Controls Footer Bar */}
          <SimulationControls />
        </main>

        {/* Right Side Column: Either NACL Rule Column or Service Inspector */}
        {showNaclSideColumn ? (
          <NaclSideColumn onClose={() => setShowNaclSideColumn(false)} />
        ) : (
          <ServiceInspector />
        )}
      </div>

      <AppFooter />

      {/* Modals */}
      <AnalysisModal
        isOpen={isAnalysisOpen}
        onClose={() => setIsAnalysisOpen(false)}
      />

      <LabsModal
        isOpen={isLabsOpen}
        onClose={() => setIsLabsOpen(false)}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

      <CostEstimatorModal
        isOpen={isCostOpen}
        onClose={() => setIsCostOpen(false)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  const [page, setPage] = useState<'home' | 'lab'>(() => window.location.hash === '#lab' ? 'lab' : 'home');
  React.useEffect(() => {
    const sync = () => setPage(window.location.hash === '#lab' ? 'lab' : 'home');
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const navigate = (next: 'home' | 'lab') => { window.location.hash = next === 'lab' ? 'lab' : 'home'; setPage(next); };
  return (
    <ArchitectureProvider>
      <AnalyticsObserver page={page} />
      {page === 'home' && <HomePage onStart={() => navigate('lab')} />}
      {page === 'lab' && <AppContent onHome={() => navigate('home')} />}
    </ArchitectureProvider>
  );
};

export default App;
