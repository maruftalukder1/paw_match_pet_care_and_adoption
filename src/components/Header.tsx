import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Heart,
  MessageCircle,
  Bell,
  LogOut,
  ShieldCheck,
  Search,
  Compass,
  Sparkles,
  AlertCircle,
  BookOpen,
  User as UserIcon,
  ChevronDown,
  Menu,
  X,
  CheckCheck,
  PawPrint
} from 'lucide-react';
import { AnyUser, AppNotification } from '../types';
import { humanizeTimestamp } from '../utils/time';

interface HeaderProps {
  currentUser: AnyUser | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  notifications: AppNotification[];
  onOpenAuth: () => void;
  onLogout: () => void;
  favoritesCount: number;
  onMarkNotificationsRead: () => void;
  dataMode?: 'supabase' | 'local';
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  unreadMessagesCount,
  unreadNotificationsCount,
  notifications,
  onOpenAuth,
  onLogout,
  favoritesCount,
  onMarkNotificationsRead,
  dataMode = 'local',
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduceMotion = useReducedMotion();

  // The sticky header gains depth once the page scrolls (visual-only).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleToggleNotifications = () => {
    const nextState = !showNotifications;
    setShowNotifications(nextState);
    if (nextState) {
      // Mark as read when opened so the red badge clears when user sees it
      onMarkNotificationsRead();
    }
  };

  const handleNavClick = (tab: string) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className={`sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 transition-shadow duration-300 ${scrolled ? 'pm-header-scrolled' : ''}`}>
      <div className="max-w-7xl min-[1440px]:max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <button
            onClick={() => handleNavClick('home')}
            className="flex items-center gap-2.5 text-left group focus:outline-none"
          >
            <motion.div
              animate={reduceMotion ? undefined : { rotate: [0, -14, 12, -6, 0], y: [0, -2.5, 0] }}
              transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut' }}
              whileHover={{ scale: 1.12 }}
              className="w-8 h-8 min-[480px]:w-9 min-[480px]:h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm group-hover:bg-emerald-700 transition-colors"
            >
              <PawPrint className="w-5 h-5" />
            </motion.div>
            <div className="min-w-0">
              <div className="font-extrabold text-slate-900 tracking-tight text-base min-[480px]:text-lg leading-tight flex items-center gap-1.5">
                PawMatch
                {dataMode === 'supabase' ? (
                  <span className="hidden min-[480px]:inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded tracking-normal">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                ) : (
                  <span className="hidden min-[480px]:inline-flex text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded tracking-normal">
                    Local
                  </span>
                )}
              </div>
              <div className="hidden min-[480px]:block text-[11px] text-slate-500 font-medium -mt-0.5">
                Pet Care & Adoption
              </div>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation Links (Desktop, wide screens only — collapses into the menu below 1440px) */}
        <nav className="hidden min-[1440px]:flex items-center gap-1 text-sm font-medium text-slate-600 min-w-0">
          <button
            onClick={() => handleNavClick('home')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'home'
                ? 'text-emerald-700 bg-emerald-50 font-semibold'
                : 'hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Home
          </button>
          <button
            onClick={() => handleNavClick('pets')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'pets'
                ? 'text-emerald-700 bg-emerald-50 font-semibold'
                : 'hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Find Pets
          </button>
          <button
            onClick={() => handleNavClick('matchmaker')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'matchmaker'
                ? 'text-emerald-700 bg-emerald-50 font-semibold'
                : 'hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Matchmaker
          </button>
          <button
            onClick={() => handleNavClick('lost_found')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'lost_found'
                ? 'text-emerald-700 bg-emerald-50 font-semibold'
                : 'hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Lost & Found
          </button>
          <button
            onClick={() => handleNavClick('pet_care')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'pet_care'
                ? 'text-emerald-700 bg-emerald-50 font-semibold'
                : 'hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Pet Care & Vets
          </button>
          <button
            onClick={() => handleNavClick('services')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'services'
                ? 'text-emerald-700 bg-emerald-50 font-semibold'
                : 'hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Services
          </button>
          {currentUser && (
            <button
              onClick={() => handleNavClick('dashboard')}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'text-emerald-700 bg-emerald-50 font-semibold'
                  : 'hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Dashboard
            </button>
          )}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => handleNavClick('admin')}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'admin'
                  ? 'text-rose-700 bg-rose-50 font-semibold'
                  : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50/50'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin
            </button>
          )}
        </nav>

        {/* Zone 3: Actions & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {currentUser ? (
            <>
              {/* Messages button with accurate unread badge */}
              <button
                onClick={() => handleNavClick('chat')}
                className="relative shrink-0 p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                title="Messages"
              >
                <MessageCircle className="w-5 h-5" />
                {unreadMessagesCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-emerald-600 text-white font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                    {unreadMessagesCount}
                  </span>
                )}
              </button>

              {/* Notification bell with auto-read dropdown */}
              <div className="relative shrink-0">
                <button
                  onClick={handleToggleNotifications}
                  className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Notifications"
                >
                  <motion.span
                    className="inline-flex"
                    animate={reduceMotion ? undefined : { rotate: [0, 20, -16, 10, -6, 0] }}
                    transition={{ repeat: Infinity, duration: 2.4, repeatDelay: 3 }}
                  >
                    <Bell className="w-5 h-5" />
                  </motion.span>
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-800">Notifications</span>
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                          {notifications.length}
                        </span>
                      </div>
                      <button
                        onClick={onMarkNotificationsRead}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark all read</span>
                      </button>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          No notifications yet.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className={`p-3.5 transition-colors ${
                              n.isRead ? 'bg-white hover:bg-slate-50/70' : 'bg-emerald-50/40 hover:bg-emerald-50/70'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-xs font-bold text-slate-900">{n.title}</div>
                              <span className="text-[10px] text-slate-400 shrink-0">{humanizeTimestamp(n.timestamp)}</span>
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                              {n.message}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Avatar & Menu */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-1 pl-2 pr-1.5 rounded-lg hover:bg-slate-100 transition-colors min-w-0 max-w-[160px] shrink-0"
                >
                  {(currentUser.avatar || currentUser.avatarUrl) ? (
                    <img
                      src={(currentUser.avatar || currentUser.avatarUrl) as string}
                      alt={currentUser.name}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-extrabold border border-emerald-700 shrink-0">
                      {currentUser.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="hidden sm:block text-left min-w-0">
                    <div className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[88px]">
                      {currentUser.name.split(' ')[0]}
                    </div>
                    <div className="text-[10px] text-emerald-700 capitalize truncate max-w-[88px]">
                      {currentUser.role.replace('_', ' ')}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden min-[480px]:block" />
                </button>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.94, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -4 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                      className="absolute right-0 mt-2 w-48 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 origin-top-right overflow-hidden"
                    >
                      <div className="px-3 py-2 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 to-transparent">
                        <p className="text-xs font-bold text-slate-800 truncate">{currentUser.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                      </div>
                      {[
                        {
                          key: 'profile',
                          label: 'My Profile',
                          icon: 'profile',
                          action: () => {
                            handleNavClick('profile');
                            setShowUserMenu(false);
                          },
                        },
                        {
                          key: 'dashboard',
                          label: 'Dashboard',
                          icon: 'user',
                          action: () => {
                            handleNavClick('dashboard');
                            setShowUserMenu(false);
                          },
                        },
                        ...(currentUser.role === 'admin'
                          ? [
                              {
                                key: 'admin',
                                label: 'Admin Panel',
                                icon: 'admin',
                                action: () => {
                                  handleNavClick('admin');
                                  setShowUserMenu(false);
                                },
                              },
                            ]
                          : []),
                        {
                          key: 'logout',
                          label: 'Log Out',
                          icon: 'logout',
                          action: () => {
                            onLogout();
                            setShowUserMenu(false);
                          },
                        },
                      ].map((item, i) => (
                        <motion.button
                          key={item.key}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.04 * i, duration: 0.16 }}
                          whileHover={{ x: 3 }}
                          onClick={item.action}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                            item.icon === 'admin'
                              ? 'text-rose-700 hover:bg-rose-50'
                              : item.icon === 'logout'
                                ? 'text-slate-600 hover:bg-rose-50 hover:text-rose-700 border-t border-slate-100 mt-1'
                                : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                          }`}
                        >
                          {item.icon === 'user' && <UserIcon className="w-3.5 h-3.5" />}
                          {item.icon === 'profile' && <UserIcon className="w-3.5 h-3.5" />}
                          {item.icon === 'admin' && <ShieldCheck className="w-3.5 h-3.5" />}
                          {item.icon === 'logout' && (
                            <motion.span whileHover={{ rotate: -12 }} className="inline-flex">
                              <LogOut className="w-3.5 h-3.5" />
                            </motion.span>
                          )}
                          {item.label}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={onOpenAuth}
                className="px-2.5 min-[480px]:px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap"
              >
                Log In
              </button>
              <button
                onClick={onOpenAuth}
                className="px-2.5 min-[480px]:px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors whitespace-nowrap"
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Mobile Menu Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 min-[1440px]:hidden text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors ml-1 shrink-0"
            title="Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="min-[1440px]:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1">
          <button
            onClick={() => handleNavClick('home')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold ${
              activeTab === 'home' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'
            }`}
          >
            Home
          </button>
          <button
            onClick={() => handleNavClick('pets')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold ${
              activeTab === 'pets' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'
            }`}
          >
            Find Pets
          </button>
          <button
            onClick={() => handleNavClick('matchmaker')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold ${
              activeTab === 'matchmaker' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'
            }`}
          >
            Matchmaker Engine
          </button>
          <button
            onClick={() => handleNavClick('lost_found')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold ${
              activeTab === 'lost_found' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'
            }`}
          >
            Lost & Found
          </button>
          <button
            onClick={() => handleNavClick('pet_care')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold ${
              activeTab === 'pet_care' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'
            }`}
          >
            Pet Care & Vets
          </button>
          <button
            onClick={() => handleNavClick('services')}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold ${
              activeTab === 'services' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'
            }`}
          >
            Services
          </button>
          {currentUser && (
            <>
              <button
                onClick={() => handleNavClick('profile')}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold ${
                  activeTab === 'profile' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'
                }`}
              >
                My Profile
              </button>
              <button
                onClick={() => handleNavClick('dashboard')}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold ${
                  activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'
                }`}
              >
                Dashboard
              </button>
            </>
          )}
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => handleNavClick('admin')}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold text-rose-700 ${
                activeTab === 'admin' ? 'bg-rose-50 font-bold' : ''
              }`}
            >
              Admin Governance Console
            </button>
          )}
        </div>
      )}
    </header>
  );
};
