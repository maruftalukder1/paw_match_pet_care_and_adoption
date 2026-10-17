export type UserRole = 'adopter' | 'owner' | 'shelter' | 'vet' | 'service_provider' | 'admin';

export interface LocationCoordinates {
  area: string;
  lat: number;
  lon: number;
}

export interface BaseUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  location: LocationCoordinates;
  role: UserRole;
  isActive: boolean;
  avatarUrl?: string;
  /** Optional avatar image URL supplied by profile customization (shown in the header chip). */
  avatar?: string;
  /** Optional public profile fields editable from the Profile view. */
  address?: string;
  bio?: string;
  failedLoginAttempts?: number;
  isLocked?: boolean;
  securityQuestion?: string;
  securityAnswer?: string;
  /** Set false for accounts registered but not yet email-verified. Seed/demo accounts are grandfathered (undefined = verified). */
  emailVerified?: boolean;
  /** True when the account was created through Supabase Auth (email OTP). Auth is then the password source of truth. */
  authManaged?: boolean;
}

export interface AdopterProfile extends BaseUser {
  role: 'adopter';
  homeType: 'apartment' | 'house_with_yard' | 'condo' | 'rural';
  hasYard: boolean;
  dailyAloneHours: number;
  hasChildren: boolean;
  hasOtherPets: boolean;
  experienceLevel: 'beginner' | 'intermediate' | 'experienced';
  preferredSpecies: string[];
  preferredSize: 'small' | 'medium' | 'large' | 'any';
  preferredAgeRange: 'baby' | 'young' | 'adult' | 'senior' | 'any';
  activityLevel: 'low' | 'moderate' | 'high';
  monthlyBudget: number;
}

export interface ShelterProfile extends BaseUser {
  role: 'shelter';
  organizationName: string;
  licenseNumber: string;
  capacity: number;
  currentCount: number;
  verified: boolean;
}

export interface VetProfile extends BaseUser {
  role: 'vet';
  clinicName: string;
  specialization: string;
  licenseNumber: string;
  availableDays: string[];
  consultationFee: number;
}

export interface ServiceProviderProfile extends BaseUser {
  role: 'service_provider';
  serviceType: 'groomer' | 'walker' | 'sitter' | 'trainer';
  businessName: string;
  hourlyRate: number;
  rating: number;
  reviewCount: number;
}

export type AnyUser = BaseUser | AdopterProfile | ShelterProfile | VetProfile | ServiceProviderProfile;

export type PetSpecies = 'dog' | 'cat' | 'bird' | 'rabbit' | 'other';
export type PetStatus = 'Available' | 'Pending' | 'Adopted' | 'Lost' | 'Found';
export type PetSize = 'small' | 'medium' | 'large';
export type EnergyLevel = 'low' | 'moderate' | 'high';

export interface Pet {
  id: string;
  name: string;
  species: PetSpecies;
  breed: string;
  ageMonths: number;
  gender: 'Male' | 'Female';
  size: PetSize;
  color: string;
  energyLevel: EnergyLevel;
  goodWithKids: boolean;
  goodWithPets: boolean;
  vaccinated: boolean;
  neutered: boolean;
  healthNotes: string;
  status: PetStatus;
  ownerId: string;
  ownerName: string;
  ownerRole: 'owner' | 'shelter';
  location: LocationCoordinates;
  photoUrl: string;
  description: string;
  tags?: string[];
  dateAdded: string;
  /**
   * Local-only sync marker: true when a live-mode write to the server
   * failed and the pet is currently kept locally only. Never persisted to
   * the DB (petToRow drops it) and never set in local mode.
   */
  unsynced?: boolean;
}

export interface MatchScoreBreakdown {
  speciesScore: number;       // 20%
  sizeHomeScore: number;      // 15%
  energyActivityScore: number;// 20%
  kidsScore: number;          // 15%
  petsScore: number;          // 10%
  experienceScore: number;    // 10%
  distanceScore: number;      // 10%
  totalScore: number;         // 0 - 100
  distanceKm: number;
  reasons: string[];
  isHardExcluded?: boolean;
}

export interface AdoptionApplication {
  id: string;
  petId: string;
  petName: string;
  petBreed: string;
  petPhotoUrl: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantAddress: string;
  applicantAge: number;
  applicantOccupation: string;
  reason: string;
  previousExperience: string;
  hasOtherPets: boolean;
  hasEnoughSpace: boolean;
  references: string;
  status: 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Completed';
  reviewNotes?: string;
  submittedAt: string;
  updatedAt: string;
}

export interface MessageAttachment {
  kind: 'image' | 'audio' | 'file' | 'calllog';
  dataUrl?: string;
  name?: string;
  mime?: string;
  sizeBytes?: number;
  durationSec?: number;
  callType?: 'audio' | 'video';
  outcome?: 'completed' | 'missed' | 'declined';
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  content: string;
  /** @deprecated Display-only legacy string. Prefer `createdAt` (ISO). */
  timestamp: string;
  /** Real ISO-8601 timestamp used for sorting/grouping. Set by the app on creation (v2). */
  createdAt?: string;
  isRead: boolean;
  attachment?: MessageAttachment;
}

export interface Conversation {
  id: string;
  participantIds: [string, string];
  participantNames: [string, string];
  petId?: string;
  lastMessage: string;
  /** @deprecated Display-only legacy string. Prefer `lastMessageAt` (ISO). */
  lastMessageTime: string;
  /** Real ISO-8601 timestamp of the last message. Set by the app on creation (v2). */
  lastMessageAt?: string;
  unreadCount: number;
}

export interface LostFoundReport {
  id: string;
  type: 'Lost' | 'Found';
  species: PetSpecies;
  breed: string;
  petName?: string;
  color: string;
  size: PetSize;
  area: string;
  lat: number;
  lon: number;
  date: string;
  description: string;
  photoUrl: string;
  contactName: string;
  contactPhone: string;
  status: 'Active' | 'Resolved';
  matchedReportId?: string;
}

export interface MedicalRecord {
  id: string;
  petId: string;
  petName: string;
  date: string;
  diagnosis: string;
  treatment: string;
  vetName: string;
  weightKg: number;
  notes: string;
}

export interface VaccinationRecord {
  id: string;
  petId: string;
  petName: string;
  vaccineName: string;
  dateAdministered: string;
  nextDueDate: string;
  status: 'Completed' | 'Upcoming' | 'Overdue';
}

export interface VetAppointment {
  id: string;
  petId: string;
  petName: string;
  vetId: string;
  vetName: string;
  clinicName: string;
  date: string;
  timeSlot: string;
  reason: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
}

export interface ServiceItem {
  id: string;
  providerId: string;
  providerName: string;
  serviceType: 'grooming' | 'walking' | 'sitting' | 'training';
  title: string;
  description: string;
  price: number;
  duration: string;
  rating: number;
  reviewCount: number;
  location: LocationCoordinates;
  imageUrl: string;
}

export interface ServiceBooking {
  id: string;
  serviceId: string;
  serviceTitle: string;
  providerName: string;
  userId: string;
  userName: string;
  petName: string;
  bookingDate: string;
  status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
  price: number;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'message' | 'application' | 'match' | 'health' | 'lost_found' | 'booking';
  isRead: boolean;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
}
