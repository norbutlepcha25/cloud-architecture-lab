import React, { useState } from 'react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { downloadCanvasAsPng } from '../../utils/exportImage.ts';
import {
  Activity,
  Layers,
  ShieldAlert,
  BarChart3,
  BookOpen,
  Download,
  FilePlus2,
  ImageDown
} from 'lucide-react';
import type { Theme } from '../../utils/theme.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

interface AppHeaderProps {
  onHome?: () => void;
  onOpenAnalysis: () => void;
  onOpenLabs: () => void;
  onOpenExport: () => void;
  onOpenCost: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onHome,
  onOpenAnalysis,
  onOpenLabs,
  onOpenExport,
  onOpenCost,
  theme,
  onToggleTheme
}) => {
  const {
    appMode,
    setAppMode,
    nodes,
    edges,
    loadTemplate,
    clearCanvas,
    analysis,
    costReport
  } = useArchitecture();

  const [isDownloadingImage, setIsDownloadingImage] = useState(false);

  const handleNewCanvas = () => {
    const hasAddedContent = nodes.some(n => n.type !== 'boundaryNode') || edges.length > 0;
    if (!hasAddedContent) {
      clearCanvas();
      return;
    }
    const confirmed = window.confirm('Reset canvas to default VPC, Public and Private subnets? This will clear all added services and connections.');
    if (confirmed) {
      clearCanvas();
    }
  };

  const handleDownloadImage = async () => {
    if (isDownloadingImage) return;
    setIsDownloadingImage(true);
    try {
      await downloadCanvasAsPng(nodes);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not download the diagram image.');
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const tab = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
      active ? 'bg-[rgba(255,255,255,0.12)] text-white' : 'text-white/55 hover:text-white hover:bg-[rgba(255,255,255,0.06)]'
    }`;
  const iconButton = 'flex items-center justify-center w-8 h-8 rounded-md text-white/55 hover:text-white hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors';

  return (
    <header className="h-12 shrink-0 bg-[#12181F] border-b border-black/40 px-3 flex items-center justify-between gap-3 select-none z-30">
      {/* Brand - links back to the home page */}
      <a
        href="#home"
        onClick={event => { if (onHome) { event.preventDefault(); onHome(); } }}
        className="flex items-center gap-2.5 rounded-md hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 focus-visible:outline-offset-2"
        title="Home"
      >
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M12 28C6 28 2 23 2 17C2 11.5 6.5 7 12 7C13.5 7 15 7.5 16 8.5C18.5 4.5 22.5 2 27 2C35 2 41 8 41 16C44.5 17 47 20 47 24C47 29.5 42.5 34 37 34H12C7 34 2 29.5 2 24" stroke="#FF9900" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <h1 className="text-sm font-semibold text-white tracking-tight hidden sm:block">
          Cloud Architecture Lab
        </h1>
      </a>

      {/* Modes and workspace tools */}
      <nav className="flex items-center gap-0.5" aria-label="Workspace modes">
        <button onClick={() => setAppMode('design')} className={tab(appMode === 'design')}>
          <Layers className="w-3.5 h-3.5" />
          <span>Design</span>
        </button>
        <button onClick={() => setAppMode('simulate')} className={tab(appMode === 'simulate')}>
          <Activity className="w-3.5 h-3.5" />
          <span>Simulate</span>
        </button>
        <button onClick={() => setAppMode('failure')} className={tab(appMode === 'failure')}>
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Failure Lab</span>
        </button>

        <div className="w-px h-4 bg-[rgba(255,255,255,0.12)] mx-1.5" />

        <button onClick={onOpenAnalysis} className={tab(false)}>
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Analyze</span>
          {analysis.spofs.length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-label={`${analysis.spofs.length} single points of failure`} />
          )}
        </button>
        <button onClick={onOpenLabs} className={tab(false)}>
          <BookOpen className="w-3.5 h-3.5" />
          <span>Labs</span>
        </button>
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenCost}
          className="px-2.5 h-8 rounded-md text-white/70 hover:text-white hover:bg-[rgba(255,255,255,0.06)] text-xs font-mono tabular-nums transition-colors"
          title="Estimated monthly cost"
        >
          ${costReport.monthlyTotal.toFixed(2)}/mo
        </button>

        <div className="w-px h-4 bg-[rgba(255,255,255,0.12)] mx-1" />

        <button onClick={handleNewCanvas} className={iconButton} title="New canvas" aria-label="New canvas">
          <FilePlus2 className="w-4 h-4" />
        </button>
        <button
          onClick={handleDownloadImage}
          disabled={isDownloadingImage || nodes.length === 0}
          className={iconButton}
          title={isDownloadingImage ? 'Rendering…' : 'Download PNG'}
          aria-label="Download PNG"
        >
          <ImageDown className="w-4 h-4" />
        </button>
        {theme && onToggleTheme && <ThemeToggle theme={theme} onToggle={onToggleTheme} iconSize={16} className={iconButton} />}

        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[#ffffff] text-[#12181F] hover:bg-[#e8ebef] text-xs font-semibold transition-colors ml-1"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
