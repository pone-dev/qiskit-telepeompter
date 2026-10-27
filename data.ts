import type { ModuleDefinition } from './types';
import moduleFields from '../shared/module-fields.js';

export const modules: ModuleDefinition[] = [
  { key: 'admissions', label: 'Admissions', icon: '◫', description: 'Applications, offers, and enrollment readiness.', group: 'Academic', roles: ['administrator'] },
  { key: 'students', label: 'Student records', icon: '◉', description: 'Profiles, enrollment, progression, and clearance.', group: 'Academic', roles: ['administrator', 'staff'] },
  { key: 'academics', label: 'Courses & curriculum', icon: '▤', description: 'Programmes, course units, and section assignments.', group: 'Academic', roles: ['administrator', 'staff', 'student'] },
  { key: 'timetable', label: 'Timetable', icon: '◷', description: 'Teaching schedule, clash detection, and room changes.', group: 'Academic', roles: ['administrator', 'staff', 'student'] },
  { key: 'attendance', label: 'Attendance', icon: '✓', description: 'Class registers and early-support signals.', group: 'Academic', roles: ['administrator', 'staff', 'student'] },
  { key: 'exams', label: 'Exams & grades', icon: '★', description: 'Assessment schedule, marks, and results.', group: 'Academic', roles: ['administrator', 'staff', 'student'] },
  { key: 'staff', label: 'Staff & workload', icon: '♙', description: 'Faculty records, workload, and leave.', group: 'People', roles: ['administrator', 'staff'] },
  { key: 'finance', label: 'Fees & scholarships', icon: '₹', description: 'Invoices, payments, scholarship awards.', group: 'People', roles: ['administrator', 'student'] },
  { key: 'rooms', label: 'Rooms & bookings', icon: '⌖', description: 'Classrooms, labs, equipment, and reservations.', group: 'Operations', roles: ['administrator', 'staff', 'student'] },
  { key: 'maintenance', label: 'Maintenance', icon: '⚒', description: 'Facilities tickets, assignments, and resolutions.', group: 'Operations', roles: ['administrator', 'staff'] },
  { key: 'assets', label: 'Assets & inventory', icon: '▣', description: 'Campus equipment, ownership, and service dates.', group: 'Operations', roles: ['administrator', 'staff'] },
  { key: 'transport', label: 'Transport', icon: '↔', description: 'Routes, service alerts, and student passes.', group: 'Operations', roles: ['administrator', 'student'] },
  { key: 'hostels', label: 'Hostel services', icon: '⌂', description: 'Residence allocation, visitor and repair requests.', group: 'Services', roles: ['administrator', 'student'] },
  { key: 'library', label: 'Library', icon: '▥', description: 'Loans, reservations, and overdue reminders.', group: 'Services', roles: ['administrator', 'staff', 'student'] },
  { key: 'documents', label: 'Documents & approvals', icon: '▱', description: 'Forms, scholarship documents, and clearance.', group: 'Services', roles: ['administrator', 'student'] },
  { key: 'complaints', label: 'Anonymous complaints', icon: '⚐', description: 'Student-reported concerns reviewed without exposing identity.', group: 'Services', roles: ['administrator', 'staff', 'student'] },
  { key: 'requests', label: 'Service desk', icon: '◌', description: 'Student requests routed to the right team.', group: 'Services', roles: ['administrator', 'staff', 'student'] },
  { key: 'announcements', label: 'Announcements', icon: '⚑', description: 'Targeted notices and read history.', group: 'Services', roles: ['administrator', 'staff', 'student'] },
  { key: 'events', label: 'Events & clubs', icon: '◇', description: 'Event approval, registrations, and room requests.', group: 'Services', roles: ['administrator', 'staff', 'student'] },
  { key: 'analytics', label: 'Reports & analytics', icon: '◫', description: 'Enrollment, risk, facilities, and finance insights.', group: 'Insights', roles: ['administrator'] },
];

export { moduleFields };
