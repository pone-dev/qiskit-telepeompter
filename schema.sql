CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  role ENUM('administrator', 'staff', 'student') NOT NULL,
  department VARCHAR(160) NULL,
  programme VARCHAR(160) NULL,
  password_hash VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS campus_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  module_key VARCHAR(32) NOT NULL,
  payload JSON NOT NULL,
  owner_id CHAR(36) NULL,
  created_by CHAR(36) NULL,
  case_reference VARCHAR(24) NULL UNIQUE,
  tracking_token_hash CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT campus_records_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT campus_records_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX campus_records_module_idx (module_key, created_at),
  INDEX campus_records_owner_idx (owner_id, module_key),
  CONSTRAINT campus_records_module_check CHECK (
    module_key IN (
      'admissions', 'students', 'academics', 'timetable', 'attendance', 'exams',
      'staff', 'rooms', 'maintenance', 'assets', 'library', 'transport', 'hostels',
      'finance', 'documents', 'complaints', 'announcements', 'events', 'requests', 'analytics'
    )
  )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id CHAR(36) NULL,
  action VARCHAR(24) NOT NULL,
  module_key VARCHAR(32) NOT NULL,
  record_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX audit_record_idx (module_key, record_id, created_at)
) ENGINE=InnoDB;
