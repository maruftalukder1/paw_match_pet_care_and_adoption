import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Terminal,
  Code2,
  Play,
  Copy,
  Check,
  Download,
  Folder,
  FileCode,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { CPP_FILES_TREE } from '../data/cppSourceTree';

interface CppConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CppConsoleModal: React.FC<CppConsoleModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'source'>('terminal');
  const [selectedFile, setSelectedFile] = useState<string>('include/models/Pet.h');
  const [copied, setCopied] = useState(false);

  // Terminal state
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    '=========================================================================',
    '  PawMatch — Local Pet Care & Adoption Matchmaker (C++17 Console App)',
    '  Built with STL: vector, map, unordered_map, set, priority_queue',
    '  Design Patterns: Strategy, Observer, Factory, Repository, Singleton',
    '=========================================================================',
    '[*] Database loaded successfully from plain-text /data files.',
    '[*] Loaded 11 users, 15 pets, 4 applications, 3 lost/found reports.',
    '',
    '------------------------- MAIN MENU -------------------------',
    ' 1. User Management (Login / Register / Profile)',
    ' 2. Pet Management (Add / Edit / Remove Pets)',
    ' 3. Search & Filter Pets (Multi-filter & Haversine Distance)',
    ' 4. Matchmaker Engine (7-Factor Weighted Compatibility Scoring)',
    ' 5. Adoption Application System (Submit & Review Workflow)',
    ' 6. 1-to-1 Messaging & Conversations',
    ' 7. Local Discovery & "Near Me" Radius Search',
    ' 8. Pet Healthcare (Medical Records, Vaccines & Appointments)',
    ' 9. Lost & Found Auto-Matcher',
    '10. Favorites & Notifications (Observer Pattern)',
    '11. Pet Care Services & Booking (Grooming, Walking, Sitting)',
    '12. Admin Governance Panel & Audit Logs',
    ' 0. Exit Application',
    '-------------------------------------------------------------',
    'PawMatch:~$ Type an option (1-12) or "help":',
  ]);
  const [commandInput, setCommandInput] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'terminal') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalHistory, activeTab]);

  if (!isOpen) return null;

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = commandInput.trim();
    if (!cmd) return;

    const newHistory = [...terminalHistory, `PawMatch:~$ ${cmd}`];

    switch (cmd.toLowerCase()) {
      case 'help':
        newHistory.push(
          'Available commands:',
          '  1..12 - Run specific module menu',
          '  3     - Search & Filter pets table (formatted via TablePrinter)',
          '  4     - Run Matchmaker priority_queue Top-N calculations',
          '  8     - Display medical & vaccination schedule table',
          '  9     - Run Lost & Found spatial auto-matcher algorithm',
          '  12    - Open Admin statistics & audit report',
          '  clear - Clear terminal screen',
          '  stats - Show loaded data store entities count'
        );
        break;

      case 'clear':
        setTerminalHistory(['PawMatch:~$ Terminal screen cleared.']);
        setCommandInput('');
        return;

      case 'stats':
        newHistory.push(
          '+-----------------------------------------------+',
          '| IN-MEMORY DATABASE STATISTICS                 |',
          '+-----------------------------------------------+',
          '| Registered Users:      11                     |',
          '| Registered Pets:       15                     |',
          '| Adoption Applications: 4                      |',
          '| Medical Logs:          3                      |',
          '| Lost & Found Reports:  3                      |',
          '| Service Providers:     3                      |',
          '+-----------------------------------------------+'
        );
        break;

      case '3':
        newHistory.push(
          '+----+---------+-------------------+-----+--------+-------+------------+--------------+',
          '| ID | NAME    | SPECIES / BREED   | AGE | GENDER | SIZE  | VACCINATED | AREA         |',
          '+----+---------+-------------------+-----+--------+-------+------------+--------------+',
          '| P1 | Bruno   | Dog / Labrador    | 24m | Male   | Large | YES        | Mirpur       |',
          '| P2 | Luna    | Cat / Persian     | 12m | Female | Small | YES        | Dhanmondi    |',
          '| P3 | Rocky   | Dog / Shepherd    | 36m | Male   | Large | YES        | Uttara       |',
          '| P4 | Milo    | Dog / Mixed       | 14m | Male   | Med   | YES        | Mohammadpur  |',
          '| P5 | Max     | Dog / Golden Retr | 24m | Male   | Large | YES        | Banani       |',
          '| P6 | Coco    | Rabbit / Lop      | 18m | Female | Small | YES        | Mirpur       |',
          '| P7 | Kiwi    | Bird / Parakeet   | 14m | Male   | Small | NO         | Dhanmondi    |',
          '+----+---------+-------------------+-----+--------+-------+------------+--------------+',
          '[*] Query executed in 0.42ms. 7 results returned (Page 1 of 2).'
        );
        break;

      case '4':
        newHistory.push(
          '[*] Executing Strategy: BalancedScoringStrategy (Weights: Species 20%, Size 15%, Energy 20%, Kids 15%, Pets 10%, Exp 10%, Dist 10%)',
          '[*] Pushing evaluated candidates into std::priority_queue<MatchCandidate>...',
          '',
          '+------+---------+-------+----------+--------------------------------------------------+',
          '| RANK | PET     | SCORE | DISTANCE | KEY REASONS FOR COMPATIBILITY                    |',
          '+------+---------+-------+----------+--------------------------------------------------+',
          '| #1   | Bruno   | 95%   | 2.4 km   | Species match, synchronized energy, kid friendly |',
          '| #2   | Luna    | 89%   | 6.1 km   | Quiet temperament, small size, kid friendly      |',
          '| #3   | Rocky   | 84%   | 8.3 km   | Energetic, trained guardian, requires yard       |',
          '| #4   | Milo    | 78%   | 4.7 km   | High social rapport with existing pets           |',
          '+------+---------+-------+----------+--------------------------------------------------+',
          '[*] Hard Filter Exclusions: 1 pet filtered out (requires single pet home).'
        );
        break;

      case '8':
        newHistory.push(
          '+---------------------------------------------------------------------------------+',
          '| HEALTHCARE & VACCINATION SCHEDULE TRACKER                                       |',
          '+---------------------------------------------------------------------------------+',
          '| Pet: Bruno (P1) | Rabies Core Vaccine      | Administered: 15-03-2024 | Status: OK   |',
          '| Pet: Bruno (P1) | Bordetella (Kennel Cough)| Next Due:     10-10-2024 | Status: DUE  |',
          '| Pet: Luna (P2)  | FVRCP Tri-cat Booster    | Administered: 14-02-2024 | Status: OK   |',
          '| Pet: Milo (P4)  | Canine Parvovirus        | Due Date:     10-09-2024 | Status: LATE |',
          '+---------------------------------------------------------------------------------+',
          '[*] No double-booking conflict detected on Dr. Bennett\'s schedule.'
        );
        break;

      case '9':
        newHistory.push(
          '[*] Running LostFoundAutoMatcher on 3 registered community reports...',
          '[*] Comparing: Report LF-1 (Lost Golden Retriever in Mirpur)',
          '    vs Report LF-3 (Found Mixed Retriever in Mirpur 11)',
          '    -> Species: MATCH (Dog)',
          '    -> Size: MATCH (Large/Medium)',
          '    -> Spatial Proximity: 1.8 km distance (Haversine)',
          '    -> Date delta: 4 days',
          '[!] HIGH CONFIDENCE POTENTIAL MATCH FOUND! Triggering Observer notification to reporters.'
        );
        break;

      case '12':
        newHistory.push(
          '+---------------------------------------------------------+',
          '| PAWMATCH ADMIN CONSOLE & ACTIVITY AUDIT TRAIL           |',
          '+---------------------------------------------------------+',
          '| [2024-10-05 10:24] User Rahim submitted app for Bruno.  |',
          '| [2024-10-05 09:30] Shelter approved application for Luna|',
          '| [2024-10-04 16:40] Hasan Mahmud submitted app for Rocky |',
          '| [2024-10-03 17:15] Auto-rejected conflicting app Milo.  |',
          '+---------------------------------------------------------+',
          '[*] Ready to export audit trail as plain text or CSV.'
        );
        break;

      case '0':
      case 'exit':
        newHistory.push(
          '[*] Saving database state to /data files...',
          '[*] /data/users.csv saved.',
          '[*] /data/pets.csv saved.',
          '[*] /data/applications.csv saved.',
          '[*] Application cleanly terminated with exit code 0.'
        );
        break;

      default:
        newHistory.push(
          `Command "${cmd}" received. Type "3", "4", "8", "9", "12", "stats" or "help" for demo actions.`
        );
        break;
    }

    setTerminalHistory(newHistory);
    setCommandInput('');
  };

  const currentFileContent = CPP_FILES_TREE[selectedFile] || '// Select a file to view source code';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentFileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownloadAll = () => {
    const blob = new Blob([currentFileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedFile.split('/').pop() || 'PawMatchCode.cpp';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-md">
      <div className="bg-slate-950 rounded-3xl max-w-6xl w-full h-[88vh] flex flex-col shadow-2xl border border-slate-800 overflow-hidden text-slate-100">
        {/* Top Window Bar */}
        <div className="bg-slate-900 px-6 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
            </div>

            <div className="text-xs font-bold text-slate-300 ml-2 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>PawMatch C++17 Architecture & Terminal Studio</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-800 p-1 rounded-xl flex items-center text-xs font-semibold">
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'terminal'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Live Terminal Emulator</span>
              </button>
              <button
                onClick={() => setActiveTab('source')}
                className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'source'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>C++ Source Inspector</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAB 1: Terminal View */}
        {activeTab === 'terminal' && (
          <div className="flex-1 flex flex-col p-4 sm:p-6 font-mono text-xs overflow-hidden bg-black/90">
            <div className="flex-1 overflow-y-auto space-y-1 text-emerald-400 pr-2">
              {terminalHistory.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                  {line}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            <form onSubmit={handleCommandSubmit} className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-2">
              <span className="text-emerald-500 font-bold">PawMatch:~$</span>
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Type 3 (search), 4 (matchmaker), 8 (health), 9 (lost/found), 12 (admin) or help..."
                className="flex-1 bg-transparent text-white outline-none font-mono text-xs"
                autoFocus
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-sans font-bold text-xs"
              >
                Execute
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: Source Code Inspector View */}
        {activeTab === 'source' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left File Tree Sidebar */}
            <div className="w-72 bg-slate-900 border-r border-slate-800 p-4 overflow-y-auto space-y-4 shrink-0 text-xs">
              <div className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
                Project File Hierarchy
              </div>

              <div className="space-y-1">
                {Object.keys(CPP_FILES_TREE).map((path) => (
                  <button
                    key={path}
                    onClick={() => setSelectedFile(path)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 truncate transition-colors font-mono text-[11px] ${
                      selectedFile === path
                        ? 'bg-emerald-600/30 text-emerald-400 font-bold border border-emerald-500/40'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span className="truncate">{path}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Code Display Area */}
            <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
              <div className="px-6 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {selectedFile}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Code'}</span>
                  </button>

                  <button
                    onClick={handleDownloadAll}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </button>
                </div>
              </div>

              <pre className="flex-1 p-6 overflow-auto text-xs font-mono text-slate-300 leading-relaxed bg-black/60">
                <code>{currentFileContent}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** Default export for React.lazy code-splitting; named export above stays for other importers. */
export default CppConsoleModal;
