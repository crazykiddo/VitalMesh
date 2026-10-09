/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldAlert, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-sm bg-[var(--bg-card)] border border-[var(--border-card)] rounded shadow-2xl p-5 space-y-4 text-xs font-mono"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-card)] pb-2 text-[var(--text-main)]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <span className="font-bold uppercase tracking-wider">{title}</span>
          </div>
          <button 
            onClick={onCancel}
            className="text-[var(--text-muted)] hover:text-rose-400 transition-colors p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[var(--text-muted)] leading-relaxed">{message}</p>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 bg-[var(--bg-app)] border border-[var(--border-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded font-bold cursor-pointer transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            className="px-3.5 py-1.5 bg-rose-500 text-white hover:bg-rose-600 rounded font-bold cursor-pointer transition-colors"
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
};
