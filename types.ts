export type UserRole = 'administrator' | 'staff' | 'student';
export type TicketStatus = 'New' | 'Assigned' | 'In progress' | 'Resolved';
export type BookingStatus = 'Available' | 'Booked' | 'Pending';
export type RequestStatus = 'Submitted' | 'Under review' | 'Approved' | 'Completed';
export type PaymentStatus = 'Paid' | 'Due' | 'Overdue';
export type AnnouncementAudience = 'All campus' | 'Students' | 'Staff' | 'Engineering';

export type CampusUser = {
  id: string;
  name: string;
  initials: string;
  role: UserRole;
  title: string;
  email: string;
  department: string;
};

export type ModuleKey =
  | 'admissions' | 'students' | 'academics' | 'timetable' | 'attendance' | 'exams'
  | 'staff' | 'rooms' | 'maintenance' | 'assets' | 'library' | 'transport' | 'hostels'
  | 'finance' | 'documents' | 'complaints' | 'announcements' | 'events' | 'requests' | 'analytics';

export type ModuleDefinition = {
  key: ModuleKey;
  label: string;
  icon: string;
  description: string;
  group: 'Academic' | 'People' | 'Operations' | 'Services' | 'Insights';
  roles: UserRole[];
};

export type TableRow = Record<string, string> & { id: string };

export type Activity = {
  id: string;
  title: string;
  detail: string;
  time: string;
  tone: 'green' | 'amber' | 'blue' | 'red';
};
