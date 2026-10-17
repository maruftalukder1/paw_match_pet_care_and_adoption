import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Search,
  Heart,
  Sparkles,
  MapPin,
  ShieldCheck,
  ArrowRight,
  Stethoscope,
  Scissors,
  PawPrint,
  Clock,
  Compass,
  MessageCircle,
  ClipboardCheck,
  Home,
  Quote,
  ChevronDown,
  Star,
  Users,
  Building2,
  CalendarCheck,
  HelpCircle,
  BadgeCheck,
  FileText,
} from 'lucide-react';
import { Pet, AnyUser, AdoptionApplication, ServiceItem } from '../types';
import { PetBadges } from './PetBadges';
import { PetImage } from './PetImage';
import { Reveal } from './Reveal';
import { formatPetAge } from '../utils/time';

interface LandingPageProps {
  pets: Pet[];
  applications: AdoptionApplication[];
  users: AnyUser[];
  services: ServiceItem[];
  onSelectPet: (pet: Pet) => void;
  onNavigateTab: (tab: string) => void;
  onSearchQuery: (query: string) => void;
  favorites: string[];
  onToggleFavorite: (petId: string) => void;
}

/** Small premium section header: animated icon chip + uppercase eyebrow + title. */
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  dark?: boolean;
}> = ({ icon, eyebrow, title, action, dark }) => {
  const reduceMotion = useReducedMotion();
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
      <div>
        <div className="flex items-center gap-2">
          <motion.span
            animate={reduceMotion ? undefined : { scale: [1, 1.18, 1] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
            className={`inline-flex w-7 h-7 rounded-lg items-center justify-center shrink-0 ${
              dark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {icon}
          </motion.span>
          <span
            className={`text-xs font-bold uppercase tracking-wider ${
              dark ? 'text-emerald-300' : 'text-emerald-700'
            }`}
          >
            {eyebrow}
          </span>
        </div>
        <h2 className={`text-2xl sm:text-3xl font-extrabold mt-1.5 ${dark ? 'text-white' : 'text-slate-900'}`}>
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({
  pets,
  applications,
  users,
  services,
  onSelectPet,
  onNavigateTab,
  onSearchQuery,
  favorites,
  onToggleFavorite,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const reduceMotion = useReducedMotion();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onSearchQuery(searchInput);
      onNavigateTab('pets');
    }
  };

  // ---- Real stats, computed from the app's own data (never hardcoded) ----
  const availablePets = pets.filter((p) => p.status === 'Available').length;
  const applicationCount = applications.length;
  const shelterCount = users.filter((u) => u.role === 'shelter').length;
  const serviceCount = services.length;
  const topRatedService =
    services.length > 0 ? services.reduce((a, b) => (a.rating >= b.rating ? a : b)) : null;

  const stats = [
    { icon: PawPrint, value: String(availablePets), label: 'Pets waiting for homes', chip: 'bg-emerald-100 text-emerald-700' },
    { icon: ClipboardCheck, value: String(applicationCount), label: 'Adoption applications', chip: 'bg-sky-100 text-sky-700' },
    { icon: Building2, value: String(shelterCount), label: 'Verified shelters & partners', chip: 'bg-amber-100 text-amber-700' },
    { icon: Scissors, value: String(serviceCount), label: 'Local care services', chip: 'bg-violet-100 text-violet-700' },
  ];

  const featuredPets = pets.slice(0, 4);

  // ---- Community stories, tied to real applications + seed pets ----
  const statusRank: Record<string, number> = { Completed: 0, Approved: 0, 'Under Review': 1, Submitted: 2, Rejected: 3 };
  const storyApps = [...applications]
    .sort((a, b) => (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3))
    .slice(0, 3);

  const storyQuotes: Record<string, string> = {
    Completed: 'The whole process was transparent — from the first message to the day she came home. We could not imagine life without her now.',
    Approved: 'The shelter stayed in touch at every step and the match feels perfect. It is wonderful knowing the vetting is taken seriously.',
    'Under Review': 'Applying took just minutes. Now we are eagerly preparing our home — and the shelter keeps us updated throughout.',
    Submitted: 'Applying took just minutes. Now we are eagerly preparing our home — and the shelter keeps us updated throughout.',
    Rejected: 'Even though it was not the right match this time, the process showed us how much care goes into every placement.',
  };

  const storyFor = (app: AdoptionApplication) => {
    const pet = pets.find((p) => p.name === app.petName);
    const [first, last] = app.applicantName.split(' ');
    return {
      quote: storyQuotes[app.status] ?? storyQuotes.Submitted,
      name: `${first} ${last?.charAt(0) ?? ''}.`,
      petName: app.petName,
      breed: app.petBreed,
      photo: pet?.photoUrl ?? app.petPhotoUrl,
      shelter: pet?.ownerName ?? 'a PawMatch partner',
      status: app.status,
    };
  };

  // ---- FAQ ----
  const faqs = [
    {
      q: 'How does the adoption process work?',
      a: 'It takes three steps: browse pets and check your match score, submit the adoption application from a pet\u2019s profile, then meet the pet and finalize with the shelter or owner. You can message the lister at any point from the pet\u2019s detail page — applications are free and carry no obligation until both sides agree.',
    },
    {
      q: 'Are there any adoption fees?',
      a: 'PawMatch itself charges nothing. Individual shelters or owners may ask for a small rehoming contribution to cover care costs — always confirm any amount with them directly through Messages before you apply, and never pay outside a conversation you can trace.',
    },
    {
      q: 'How do I know a listing is trustworthy?',
      a: 'Every pet profile shows exactly what is on record: vaccination and neuter status, health notes, medical and vaccination entries, and who listed the pet. Listings from licensed shelters carry a "Verified shelter partner" badge. If something feels off, message PawMatch Admin directly from the pet\u2019s page.',
    },
    {
      q: 'I lost my pet. What should I do?',
      a: 'Open Lost & Found and file a report with your pet\u2019s species, color, size and last-seen area. PawMatch\u2019s similarity matcher automatically compares lost and found reports by attributes and distance, and you can contact the finder in one tap.',
    },
    {
      q: 'Can I book vet visits, grooming or other care?',
      a: 'Yes. The Pet Care & Vets tab has species care guides, vaccination schedules and licensed vets you can book appointments with. The Services tab lists local groomers, walkers, sitters and trainers with real ratings — bookings and appointments are confirmed right in the app.',
    },
    {
      q: 'How do I verify my account?',
      a: 'When you create an account, PawMatch emails you an 8-digit verification code to prove you own the address. Enter it in the app to activate your account — this keeps bots out and keeps messaging between real people. Demo accounts listed on the login panel are grandfathered in.',
    },
  ];

  return (
    <div className="space-y-16 md:space-y-20 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/70 via-slate-50 to-white pt-8 pb-16 md:pt-12 md:pb-20">
        {/* Clearly-visible continuous motion per the standing design rule:
            drifting paw marks + a slow gradient wash behind the hero. */}
        <div className="absolute inset-0" aria-hidden="true">
          <div className="pm-hero-wash" />
          <PawPrint className="pm-hero-paw w-14 h-14 top-[12%] left-[4%]" />
          <PawPrint className="pm-hero-paw w-9 h-9 top-[68%] left-[44%]" style={{ animationDelay: '-2.4s', animationDuration: '8.5s' }} />
          <PawPrint className="pm-hero-paw w-16 h-16 top-[22%] right-[3%] text-teal-200" style={{ animationDelay: '-4.1s', animationDuration: '9.5s' }} />
          <PawPrint className="pm-hero-paw w-7 h-7 bottom-[10%] right-[38%]" style={{ animationDelay: '-5.6s', animationDuration: '7.8s' }} />
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Headlines & Search */}
            <motion.div
              className="lg:col-span-7 space-y-6 text-left"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}
            >
              <motion.div
                variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/80 text-emerald-800 text-xs font-semibold"
              >
                <motion.span
                  animate={{ rotate: [0, 18, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut' }}
                  className="inline-flex"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                </motion.span>
                Intelligent Local Pet Matching & Care Portal
              </motion.div>

              <motion.h1
                variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
                className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.12]"
              >
                Find a Friend <br />
                <span className="text-emerald-700">Change a Life</span>
              </motion.h1>

              <motion.p
                variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
                className="text-lg text-slate-600 max-w-xl leading-relaxed"
              >
                Adopt. Care. Connect. A better tomorrow for every pet in your local community.
                Connect with verified shelters, owners, vets, and pet specialists near you.
              </motion.p>

              {/* Search Bar Input */}
              <form onSubmit={handleSearchSubmit} className="pt-2">
                <div className="flex items-center p-1.5 bg-white rounded-2xl shadow-lg border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-500 max-w-xl transition-all">
                  <div className="pl-3.5 pr-2 text-slate-400">
                    <Search className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search pets by species, breed or location..."
                    className="w-full py-2.5 px-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm rounded-xl transition-colors shadow-xs shrink-0 flex items-center gap-2"
                  >
                    <span>Search</span>
                  </button>
                </div>
              </form>

              {/* Dual CTA — professional hero composition: primary browse path
                  + secondary matchmaker path, both with ≥44px tap targets */}
              <motion.div
                variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
                className="flex flex-wrap items-center gap-3 pt-1"
              >
                <button onClick={() => onNavigateTab('pets')} className="pm-btn-primary">
                  <PawPrint className="w-4 h-4" />
                  Find Pets to Adopt
                </button>
                <button onClick={() => onNavigateTab('matchmaker')} className="pm-btn-secondary">
                  <motion.span
                    animate={reduceMotion ? undefined : { rotate: [0, 18, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    className="inline-flex"
                  >
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                  </motion.span>
                  Try the AI Matchmaker
                </button>
              </motion.div>

              {/* Quick Tags */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Popular:</span>
                {['Labrador', 'Persian Cat', 'Puppy', 'Mirpur', 'Uttara', 'Rabbit'].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      onSearchQuery(tag);
                      onNavigateTab('pets');
                    }}
                    className="hover:text-emerald-700 hover:underline transition-colors"
                  >
                    {tag} ·
                  </button>
                ))}
              </div>

              {/* Floating animated icon chips — always gently moving */}
              <div className="flex flex-wrap items-center gap-2.5 pt-3" aria-hidden="true">
                {[
                  { Icon: PawPrint, label: 'Adopt', chip: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                  { Icon: Heart, label: 'Care', chip: 'text-rose-600 bg-rose-50 border-rose-200' },
                  { Icon: MessageCircle, label: 'Chat', chip: 'text-blue-600 bg-blue-50 border-blue-200' },
                  { Icon: ShieldCheck, label: 'Verified', chip: 'text-amber-600 bg-amber-50 border-amber-200' },
                  { Icon: Stethoscope, label: 'Vets', chip: 'text-purple-600 bg-purple-50 border-purple-200' },
                ].map(({ Icon, label, chip }, i) => (
                  <motion.span
                    key={label}
                    animate={reduceMotion ? undefined : { y: [0, -9, 0], rotate: [0, 7, -7, 0] }}
                    transition={{ repeat: Infinity, duration: 3, delay: i * 0.45, ease: 'easeInOut' }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs font-bold shadow-sm bg-white/90 backdrop-blur ${chip}`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </motion.span>
                ))}
              </div>
            </motion.div>

            {/* Right Column: Hero Visual Asset */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="aspect-4/3 rounded-3xl overflow-hidden shadow-2xl border-4 border-white bg-slate-100">
                  <PetImage
                    src="https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&auto=format&fit=crop&q=80"
                    alt="Happy adopted golden retriever dog"
                    eager
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Floating Metric Card 0 — real shelter count from the app's data.
                    On small screens the three cards share a narrow canvas, so
                    the rating card sits BELOW this one instead of beside it. */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut', delay: 1.1 }}
                  className="absolute -top-5 left-2 sm:-top-6 sm:left-6 bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-2.5 max-w-[215px]"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 whitespace-nowrap">{shelterCount} Verified Shelters</div>
                    <div className="text-[11px] text-slate-500">trusted local partners</div>
                  </div>
                </motion.div>

                {/* Floating Metric Card 1 — real count from the app's data */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                  className="absolute -bottom-6 -left-6 bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-base">
                    ✓
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">{availablePets} Available Pets</div>
                    <div className="text-[11px] text-slate-500">Across Dhaka communities</div>
                  </div>
                </motion.div>

                {/* Floating Metric Card 2 — real top-rated service from the app's data */}
                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ repeat: Infinity, duration: 4.6, ease: 'easeInOut', delay: 0.6 }}
                  className="absolute top-[3.75rem] right-2 sm:-top-4 sm:right-auto sm:-right-4 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-2.5"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-900">{topRatedService?.rating}★ Top-Rated Service</div>
                    <div className="text-[10px] text-slate-500">{topRatedService?.providerName}</div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Quick Action Feature Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              tab: 'pets',
              title: 'Adopt a Pet',
              desc: 'Browse verified dogs, cats, rabbits & birds ready for a loving home.',
              Icon: PawPrint,
              chip: 'bg-emerald-50 text-emerald-700',
              hoverBorder: 'hover:border-emerald-300',
              hoverText: 'group-hover:text-emerald-700',
            },
            {
              tab: 'lost_found',
              title: 'Lost & Found',
              desc: 'Automated similarity matcher to reunite missing furry companions.',
              Icon: Compass,
              chip: 'bg-amber-50 text-amber-700',
              hoverBorder: 'hover:border-amber-300',
              hoverText: 'group-hover:text-amber-700',
            },
            {
              tab: 'pet_care',
              title: 'Pet Care & Vets',
              desc: 'Species care guides, vaccination schedules & licensed vet bookings.',
              Icon: Stethoscope,
              chip: 'bg-blue-50 text-blue-700',
              hoverBorder: 'hover:border-blue-300',
              hoverText: 'group-hover:text-blue-700',
            },
            {
              tab: 'services',
              title: 'Local Services',
              desc: 'Grooming salons, pack dog walkers, trusted sitters and dog trainers.',
              Icon: Scissors,
              chip: 'bg-purple-50 text-purple-700',
              hoverBorder: 'hover:border-purple-300',
              hoverText: 'group-hover:text-purple-700',
            },
          ].map(({ tab, title, desc, Icon, chip, hoverBorder, hoverText }, i) => (
            <button
              key={tab}
              onClick={() => onNavigateTab(tab)}
              className={`p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:-translate-y-0.5 ${hoverBorder} transition-all text-left group flex items-start gap-4`}
            >
              <motion.div
                animate={reduceMotion ? undefined : { y: [0, -5, 0], rotate: [0, 6, -6, 0] }}
                transition={{ repeat: Infinity, duration: 4, delay: i * 0.5, ease: 'easeInOut' }}
                className={`w-12 h-12 rounded-xl ${chip} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
              >
                <Icon className="w-6 h-6" />
              </motion.div>
              <div>
                <h3 className={`font-bold text-slate-900 text-base ${hoverText} transition-colors`}>
                  {title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Live Stats Band — computed from real app data */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 rounded-3xl px-6 py-8 sm:px-10 shadow-lg">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map(({ icon: Icon, value, label, chip }, i) => (
              <Reveal key={label} delay={i * 0.08} className="flex items-center gap-3.5">
                <div className={`w-11 h-11 rounded-xl ${chip} flex items-center justify-center shrink-0 shadow-sm`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-white leading-none">{value}</div>
                  <div className="text-[11px] text-emerald-100 mt-1 font-medium">{label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Pets Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          icon={<Heart className="w-4 h-4 fill-rose-500" />}
          eyebrow="Ready for Adoption"
          title="Featured Pets Looking for Homes"
          action={
            <button
              onClick={() => onNavigateTab('pets')}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <span>View All Pets</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredPets.map((pet) => {
            const isFav = favorites.includes(pet.id);
            return (
              <div
                key={pet.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col"
              >
                <div className="relative aspect-4/3 overflow-hidden bg-slate-100">
                  <PetImage
                    src={pet.photoUrl}
                    alt={pet.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <button
                    onClick={() => onToggleFavorite(pet.id)}
                    className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-md rounded-full text-slate-600 hover:text-rose-500 shadow-sm transition-colors"
                    title="Add to favorites"
                  >
                    <motion.span
                      animate={reduceMotion ? undefined : isFav ? { scale: [1, 1.35, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                      className="inline-flex"
                    >
                      <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </motion.span>
                  </button>

                  {/* Premium badges from real pet data */}
                  <div className="absolute bottom-3 left-3 max-w-[72%]">
                    <PetBadges pet={pet} />
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-extrabold text-slate-900 text-lg group-hover:text-emerald-700 transition-colors">
                        {pet.name}
                      </h3>
                      <span className="text-xs font-semibold text-slate-500">
                        {formatPetAge(pet.ageMonths)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 font-medium">{pet.breed}</p>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{pet.location.area}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => onSelectPet(pet)}
                      className="w-full py-2 bg-emerald-50 text-emerald-800 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-bold transition-all text-center"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How Adoption Works — 3 steps */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          icon={<ClipboardCheck className="w-4 h-4" />}
          eyebrow="Simple & Transparent"
          title="How Adoption Works"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              n: '1',
              Icon: Search,
              chip: 'bg-emerald-100 text-emerald-700',
              title: 'Browse & Match',
              desc: 'Explore pets by species, breed or area. Run the Matchmaker to see your compatibility score with each pet.',
            },
            {
              n: '2',
              Icon: FileText,
              chip: 'bg-sky-100 text-sky-700',
              title: 'Apply & Meet',
              desc: 'Submit the adoption application right from the pet\u2019s profile, then message the shelter or owner to arrange a visit.',
            },
            {
              n: '3',
              Icon: Home,
              chip: 'bg-amber-100 text-amber-700',
              title: 'Welcome Home',
              desc: 'Get approved, bring your new friend home, and keep their health on track with vet bookings and care guides.',
            },
          ].map(({ n, Icon, chip, title, desc }, i) => (
            <Reveal
              key={n}
              delay={i * 0.1}
              className="relative bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all p-6 overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-11 h-11 rounded-xl ${chip} flex items-center justify-center shrink-0`}>
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-3xl font-extrabold text-slate-200">{n}</span>
              </div>
              <h3 className="font-bold text-slate-900 text-base">{title}</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Community Stories — tied to real seed pets & applications */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          icon={<Users className="w-4 h-4" />}
          eyebrow="Community Stories"
          title="Happy Tails from the PawMatch Family"
          action={
            <button
              onClick={() => onNavigateTab('pets')}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <span>Start Your Story</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {storyApps.map((app, i) => {
            const s = storyFor(app);
            const matchedPet = pets.find((p) => p.name === app.petName);
            const statusStyle =
              s.status === 'Approved' || s.status === 'Completed'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800';
            return (
              <Reveal
                key={app.id}
                delay={i * 0.1}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all overflow-hidden flex flex-col"
              >
                <div className="relative h-40 overflow-hidden bg-slate-100">
                  <PetImage
                    src={s.photo}
                    alt={s.petName}
                    className="w-full h-full object-cover"
                  />
                  <span
                    className={`absolute top-3 left-3 text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-sm ${statusStyle}`}
                  >
                    {s.status === 'Approved' || s.status === 'Completed' ? 'Adopted ✓' : `Application ${s.status}`}
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <Quote className="w-5 h-5 text-emerald-300 fill-emerald-200 mb-2" />
                  <blockquote className="text-xs text-slate-600 leading-relaxed flex-1">
                    {s.quote}
                  </blockquote>
                  <figcaption className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                      {s.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {s.name} & {s.petName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {s.breed} · via {s.shelter}
                      </div>
                    </div>
                  </figcaption>
                  {matchedPet && (
                    <button
                      onClick={() => onSelectPet(matchedPet)}
                      className="mt-3 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline self-start"
                    >
                      Meet {s.petName} →
                    </button>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Why Choose PawMatch Section */}
      <section className="bg-slate-900 text-white rounded-3xl max-w-7xl mx-auto px-6 py-12 sm:px-12 sm:py-16">
        <SectionHeader
          dark
          icon={<ShieldCheck className="w-4 h-4" />}
          eyebrow="Trust & Transparency"
          title="Built for Lifelong Companion Compatibility"
        />
        <p className="-mt-5 mb-8 text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl">
          Our matchmaker algorithm factors in home type, daily exercise schedule, children safety,
          and other pet harmony to ensure zero surrenders and unconditional love.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              Icon: Sparkles,
              title: 'Weighted Matchmaker',
              desc: 'Calculates species, energy, size vs apartment, and experience levels with swappable strategies.',
            },
            {
              Icon: Stethoscope,
              title: 'Transparent Healthcare',
              desc: 'Every profile includes vaccination history, medical check records, and direct vet appointment links.',
            },
            {
              Icon: Compass,
              title: 'Community Lost & Found',
              desc: 'Automated spatial and visual attribute matching between reported lost pets and shelter intake lists.',
            },
          ].map(({ Icon, title, desc }, i) => (
            <Reveal
              key={title}
              delay={i * 0.1}
              className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700/80 hover:border-emerald-500/40 hover:shadow-lg transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-base text-white">{title}</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ Accordion */}
      <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <SectionHeader
          icon={<HelpCircle className="w-4 h-4" />}
          eyebrow="Good to Know"
          title="Frequently Asked Questions"
        />
        <div className="space-y-3">
          {faqs.map((item, i) => {
            const open = openFaq === i;
            return (
              <div
                key={i}
                className={`bg-white rounded-2xl border transition-all ${
                  open ? 'border-emerald-300 shadow-md' : 'border-slate-200/80 shadow-xs hover:border-emerald-200'
                }`}
              >
                <button
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={open}
                >
                  <span className="text-sm font-bold text-slate-900">{item.q}</span>
                  <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={{ duration: 0.25 }}
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                      open ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </motion.span>
                </button>
                <motion.div
                  initial={false}
                  animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-xs sm:text-sm text-slate-600 leading-relaxed">{item.a}</p>
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Sticky-style CTA */}
        <div className="mt-8 bg-gradient-to-r from-emerald-700 to-teal-600 rounded-2xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 text-white flex items-center justify-center shrink-0">
              <CalendarCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-white font-extrabold text-base">Ready to meet your new best friend?</div>
              <div className="text-emerald-100 text-xs">Browse pets, run your match score, apply in minutes.</div>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('pets')}
            className="shrink-0 px-6 py-3 bg-white text-emerald-800 font-bold text-sm rounded-xl hover:bg-emerald-50 transition-colors shadow-sm flex items-center gap-2"
          >
            <PawPrint className="w-4 h-4" />
            Find Pets Near You
          </button>
        </div>
      </section>
    </div>
  );
};
