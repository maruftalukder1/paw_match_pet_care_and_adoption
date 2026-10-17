import React from 'react';
import { motion } from 'motion/react';
import { PawPrint, LogIn } from 'lucide-react';

interface ChatLoginGateProps {
  onLogin: () => void;
}

/**
 * ChatLoginGate — shown on the Messages tab when nobody is logged in.
 * Messaging needs a real account (conversations are per-user); browsing
 * stays free. The gate offers a single clearly-visible path to the login
 * modal instead of a broken or stranger-owned chat view.
 */
export const ChatLoginGate: React.FC<ChatLoginGateProps> = ({ onLogin }) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm px-6 py-14 text-center max-w-md mx-auto">
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
        className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4 shadow-md"
      >
        <PawPrint className="w-8 h-8" />
      </motion.div>
      <h2 className="text-lg font-extrabold text-slate-900">Messages are for members</h2>
      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
        Log in or create a free account to chat with shelters, vets and the
        PawMatch admin. Browsing pets needs no account.
      </p>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onLogin}
        className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-sm transition-colors"
      >
        <LogIn className="w-4 h-4" />
        Log In / Sign Up
      </motion.button>
    </div>
  </div>
);
