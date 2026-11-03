"use client";

import React from "react";
import { Modal } from "@/components/Modal";
import { Info, GlassWater } from "lucide-react";

interface BottleIceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  busy?: boolean;
}

export function BottleIceModal({ isOpen, onClose, onContinue, busy = false }: BottleIceModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Información sobre complementos"
      size="lg"
      showCloseButton={false}
      closeOnBackdropClick={false}
    >
      <div className="space-y-6">
        {/* Iconos principales */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-3">
              <GlassWater className="w-8 h-8 text-amber-400" />
            </div>
            <span className="text-sm font-medium text-amber-400">Complementos por separado</span>
          </div>
        </div>

        {/* Mensaje principal */}
        <div className="text-center space-y-4">
          <p className="text-slate-300 leading-relaxed">
            Los complementos como gaseosas y jugos se pueden adquirir por separado en nuestra barra.
          </p>
        </div>

        {/* Información adicional */}
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-slate-300">
              <p className="mb-2">
                <strong>Consulta los beneficios de tu pack seleccionado.</strong>
              </p>
              <p className="text-xs">Los beneficios dependen del pack elegido.</p>
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            {busy ? 'Cancelando…' : 'Cancelar reserva'}
          </button>
          <button
            onClick={onContinue}
            disabled={busy}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg transition-all"
          >
            Continuar y ver QRs
          </button>
        </div>
      </div>
    </Modal>
  );
}
