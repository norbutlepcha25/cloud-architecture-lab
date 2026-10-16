import React from 'react';
import { DraftControls } from '../layout/DraftControls.tsx';
import { Modal } from '../ui/Modal.tsx';

export function ExportModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return <Modal isOpen={isOpen} onClose={onClose} title="Export" size="md" closeLabel="Close export">
    <DraftControls />
  </Modal>;
}
