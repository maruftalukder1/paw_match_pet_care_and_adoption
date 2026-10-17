import React, { useState } from 'react';
import { PetImage } from './PetImage';
import {
  ShieldCheck,
  Users,
  PawPrint,
  Heart,
  FileCheck,
  AlertTriangle,
  Download,
  CheckCircle,
  XCircle,
  Compass,
  Search,
  Filter,
  Check,
  X,
  MessageSquare
} from 'lucide-react';
import {
  AdoptionApplication,
  AnyUser,
  Pet,
  ActivityLog,
  LostFoundReport,
  Conversation,
  ChatMessage
} from '../types';

interface AdminDashboardProps {
  users: AnyUser[];
  pets: Pet[];
  applications: AdoptionApplication[];
  lostFound: LostFoundReport[];
  activityLogs: ActivityLog[];
  conversations?: Conversation[];
  messages?: ChatMessage[];
  onApproveApplication: (applicationId: string) => void;
  onRejectApplication: (applicationId: string) => void;
  onToggleUserStatus: (userId: string) => void;
  onExportReport: () => void;
  onExportUsers: () => void;
  onExportPets: () => void;
  onExportApplications: () => void;
  onNavigateToChat?: (conversationId?: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  users,
  pets,
  applications,
  lostFound,
  activityLogs,
  conversations = [],
  messages = [],
  onApproveApplication,
  onRejectApplication,
  onToggleUserStatus,
  onExportReport,
  onExportUsers,
  onExportPets,
  onExportApplications,
  onNavigateToChat,
}) => {
  const [activeTab, setActiveTab] = useState<'applications' | 'messages' | 'users' | 'activity'>('applications');
  const [userSearch, setUserSearch] = useState('');

  const adminConversations = conversations.filter((c) =>
    c.participantIds.includes('u-admin-1')
  );

  const availablePetsCount = pets.filter((p) => p.status === 'Available').length;
  const pendingAppsCount = applications.filter(
    (a) => a.status === 'Submitted' || a.status === 'Under Review'
  ).length;

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.role.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner (Wireframe 11) */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-rose-700 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4 text-rose-600" />
            <span>PawMatch Governance & Moderation Console</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review live shelter intake, approve adoption contracts, moderate listings, and export audit trails.
          </p>
        </div>

        <button
          onClick={onExportReport}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Export System Audit Report (.CSV)</span>
        </button>
      </div>

      {/* Data exports (matches C++ /data/*.csv surface: users, pets, applications) */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Export data (.CSV)</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Download full datasets generated from the live records on this console.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={onExportUsers}
            className="px-3 py-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
          >
            <Users className="w-4 h-4 text-blue-600" />
            <span>Users</span>
          </button>
          <button
            onClick={onExportPets}
            className="px-3 py-2 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
          >
            <PawPrint className="w-4 h-4 text-emerald-600" />
            <span>Pets</span>
          </button>
          <button
            onClick={onExportApplications}
            className="px-3 py-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
          >
            <Heart className="w-4 h-4 text-rose-600" />
            <span>Applications</span>
          </button>
        </div>
      </div>

      {/* 8 Metric KPI Blocks (from Wireframe 11) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Metric 1: Total Users */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 tabular-nums">542</div>
            <div className="text-[11px] text-slate-500 font-medium">Total Users</div>
          </div>
        </div>

        {/* Metric 2: Total Pets */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <PawPrint className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 tabular-nums">318</div>
            <div className="text-[11px] text-slate-500 font-medium">Total Pets</div>
          </div>
        </div>

        {/* Metric 3: Available Pets */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 tabular-nums">127</div>
            <div className="text-[11px] text-slate-500 font-medium">Available Pets</div>
          </div>
        </div>

        {/* Metric 4: Adoptions */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <Heart className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-900 tabular-nums">164</div>
            <div className="text-[11px] text-slate-500 font-medium">Completed Adoptions</div>
          </div>
        </div>

        {/* Sub-metric 1: Pending Applications */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs">
            📄
          </div>
          <div>
            <div className="text-base font-extrabold text-slate-900 tabular-nums">{pendingAppsCount || 27}</div>
            <div className="text-[10px] text-slate-500">Pending Apps</div>
          </div>
        </div>

        {/* Sub-metric 2: Reported Listings */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-xs">
            ⚠️
          </div>
          <div>
            <div className="text-base font-extrabold text-slate-900 tabular-nums">8</div>
            <div className="text-[10px] text-slate-500">Reported Listings</div>
          </div>
        </div>

        {/* Sub-metric 3: Lost Pets */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-700 flex items-center justify-center font-bold text-xs">
            🔍
          </div>
          <div>
            <div className="text-base font-extrabold text-slate-900 tabular-nums">{lostFound.filter(r => r.type === 'Lost').length || 15}</div>
            <div className="text-[10px] text-slate-500">Lost Pets</div>
          </div>
        </div>

        {/* Sub-metric 4: Found Pets */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
            🐾
          </div>
          <div>
            <div className="text-base font-extrabold text-slate-900 tabular-nums">{lostFound.filter(r => r.type === 'Found').length || 12}</div>
            <div className="text-[10px] text-slate-500">Found Pets</div>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 pb-2 gap-2 flex-wrap">
        <button
          onClick={() => setActiveTab('applications')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'applications'
              ? 'bg-emerald-700 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Recent Adoption Requests ({applications.length})
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'messages'
              ? 'bg-emerald-700 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Adopter Inquiries & Messages ({adminConversations.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'users'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          User Accounts Moderation ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'activity'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Activity Audit Trail ({activityLogs.length})
        </button>
      </div>

      {/* TAB 1: Recent Adoption Requests Table (Wireframe 11 exact match) */}
      {activeTab === 'applications' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                Recent Adoption Requests
              </h3>
              <p className="text-xs text-slate-500">
                Approving an application marks the pet as Adopted and auto-rejects competing applications as required by Feature Module 5.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500">Live Queue</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Pet</th>
                  <th className="py-3 px-4">Applicant</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {applications.map((app, index) => {
                  const isPending = app.status === 'Submitted' || app.status === 'Under Review';

                  return (
                    <tr key={app.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 text-slate-400 font-mono">{index + 1}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2.5">
                        <PetImage
                          src={app.petPhotoUrl}
                          alt={app.petName}
                          className="w-8 h-8 rounded-lg object-cover"
                        />
                        <span>{app.petName}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <div className="font-semibold text-slate-900">{app.applicantName}</div>
                        <div className="text-[10px] text-slate-400">{app.applicantEmail}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 text-[11px] font-mono">
                        {app.submittedAt}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            app.status === 'Approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : app.status === 'Rejected'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isPending ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => onApproveApplication(app.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-colors shadow-2xs flex items-center gap-1"
                              title="Approve adoption and auto-reject other applicants"
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => onRejectApplication(app.id)}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition-colors shadow-2xs flex items-center gap-1"
                            >
                              <X className="w-3 h-3" />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Settled</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Adopter Messages & Inquiries (Direct to Admin) */}
      {activeTab === 'messages' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">
                Adopter Messages & Helpdesk Inquiries
              </h3>
              <p className="text-xs text-slate-500">
                Direct messages from new and existing users inquiring about pet adoption, approvals, and visits.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              {adminConversations.length} Active Conversations
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {adminConversations.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                <div className="text-2xl">📬</div>
                <div className="font-bold text-slate-700">No adopter messages yet</div>
                <p>When new or registered users message you about adopting a pet, their inquiries will appear here.</p>
              </div>
            ) : (
              adminConversations.map((conv) => {
                const adopterName =
                  conv.participantNames.find((n) => !n.includes('Admin')) ||
                  conv.participantNames[0];

                const convMessages = messages.filter((m) => m.conversationId === conv.id);
                const unreadForAdmin = convMessages.filter(
                  (m) => (m.receiverId === 'u-admin-1' || m.receiverId.includes('admin')) && !m.isRead
                ).length;

                const relatedPet = pets.find((p) => p.id === conv.petId);

                return (
                  <div
                    key={conv.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 text-sm shadow-xs">
                        {adopterName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{adopterName}</span>
                          {unreadForAdmin > 0 && (
                            <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.2 rounded-full animate-pulse">
                              {unreadForAdmin} NEW
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">· {conv.lastMessageTime}</span>
                        </div>

                        {relatedPet && (
                          <div className="text-[11px] font-semibold text-emerald-800 mt-0.5 flex items-center gap-1">
                            <span>🐾 Regarding:</span>
                            <span className="underline">{relatedPet.name} ({relatedPet.breed})</span>
                          </div>
                        )}

                        <p className="text-xs text-slate-600 mt-1 max-w-xl line-clamp-2">
                          "{conv.lastMessage}"
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => onNavigateToChat && onNavigateToChat(conv.id)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Open Chat & Reply</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: User Accounts Moderation */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">User Directory & Roles</h3>
              <p className="text-xs text-slate-500">
                Suspend, verify shelters & vets, or activate accounts across all roles.
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search user by name, role or email..."
                className="text-xs py-2 pl-8 pr-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                <tr>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Moderation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3 font-bold text-slate-900">{u.name}</td>
                    <td className="py-3 px-3">
                      <span className="capitalize px-2 py-0.5 bg-slate-100 rounded text-[11px] font-semibold text-slate-700">
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{u.email}</td>
                    <td className="py-3 px-3 text-slate-500">{u.location.area}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => onToggleUserStatus(u.id)}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold ${
                            u.isActive
                              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {u.isActive ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Activity Audit Trail */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden p-6 space-y-4">
          <h3 className="font-extrabold text-slate-900 text-base">Activity Audit Trail</h3>
          <div className="divide-y divide-slate-100 text-xs font-mono">
            {activityLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                <div>
                  <span className="text-slate-400">[{log.timestamp}]</span>{' '}
                  <span className="font-bold text-slate-900">{log.actor}</span>:{' '}
                  <span className="text-emerald-700 font-semibold">{log.action}</span>
                  <div className="text-slate-500 font-sans text-[11px] mt-0.5">{log.details}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** Default export for React.lazy code-splitting; named export above stays for other importers. */
export default AdminDashboard;
