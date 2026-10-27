const moduleFields = {
  admissions: ['Applicant', 'Programme', 'Stage', 'Decision'],
  students: ['Student', 'Programme', 'Year', 'Attendance', 'Status'],
  academics: ['Code', 'Course', 'Faculty', 'Enrolled', 'Credits'],
  timetable: ['Course', 'Day', 'Time', 'Room', 'Faculty', 'Status'],
  attendance: ['Student', 'Course', 'Present', 'Percentage', 'Signal'],
  exams: ['Assessment', 'Date', 'Room', 'Status'],
  staff: ['Faculty', 'Department', 'Teaching load', 'Leave', 'Status'],
  finance: ['Student', 'Invoice', 'Amount', 'Due', 'Status'],
  rooms: ['Room', 'Capacity', 'Equipment', 'Availability', 'Status'],
  maintenance: ['Issue', 'Location', 'Reported by', 'Priority', 'Status'],
  assets: ['Asset', 'Location', 'Owner', 'Service', 'Status'],
  transport: ['Route', 'Next arrival', 'Stop', 'Status'],
  hostels: ['Student', 'Residence', 'Request', 'Status'],
  library: ['Item', 'Borrower', 'Due', 'Status'],
  documents: ['Student', 'Document', 'Submitted', 'Status'],
  complaints: ['Case reference', 'Category', 'Summary', 'Priority', 'Status'],
  requests: ['Request', 'Submitted by', 'Team', 'Status'],
  announcements: ['Title', 'Audience', 'Published', 'Status'],
  events: ['Event', 'Owner', 'Date', 'Status'],
  analytics: ['Metric', 'Value', 'Change', 'Status'],
};

export default moduleFields;
