import { FormEvent, useEffect, useMemo, useState } from 'react';
import { moduleFields, modules } from './data';
import { authenticate, createAccount, createRecord, endSession, getRecords, getSession, saveComplaintTracking, updateRecord } from './api';
import type { Activity, CampusUser, ModuleKey, TableRow } from './types';

type Page = 'dashboard' | ModuleKey;
type DraftModal = { module: ModuleKey; title: string; hint: string } | null;
type ComplaintTracking = { reference: string; token: string; saved: boolean } | null;
type AccountDraft = { name: string; email: string; password: string; role: CampusUser['role']; department: string; programme: string };

const roleLabel = (role: CampusUser['role']) => role === 'administrator' ? 'Administrator' : role === 'staff' ? 'Faculty & staff' : 'Student';
const pageTitle = (page: Page) => page === 'dashboard' ? 'Overview' : modules.find((item) => item.key === page)?.label ?? 'CampusFlow';
const today = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
const createEmptyTables = (): Record<ModuleKey, TableRow[]> => ({
  admissions: [],
  students: [],
  academics: [],
  timetable: [],
  attendance: [],
  exams: [],
  staff: [],
  rooms: [],
  maintenance: [],
  assets: [],
  library: [],
  transport: [],
  hostels: [],
  finance: [],
  documents: [],
  complaints: [],
  announcements: [],
  events: [],
  requests: [],
  analytics: [],
});

export default function App() {
  const [user, setUser] = useState<CampusUser | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [tables, setTables] = useState<Record<ModuleKey, TableRow[]>>(createEmptyTables);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draftModal, setDraftModal] = useState<DraftModal>(null);
  const [draftName, setDraftName] = useState('');
  const [draftStatus, setDraftStatus] = useState('Submitted');
  const [draftOwnerEmail, setDraftOwnerEmail] = useState('');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [draftCategory, setDraftCategory] = useState('Safety');
  const [draftPriority, setDraftPriority] = useState('Medium');
  const [complaintTracking, setComplaintTracking] = useState<ComplaintTracking>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [accountDraft, setAccountDraft] = useState<AccountDraft>({ name: '', email: '', password: '', role: 'student', department: '', programme: '' });

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const restoreSession = async () => {
    setStartupError('');
    setLoading(true);
    try {
      const account = await getSession();
      if (!account) return;
      const records = await getRecords(account, notify);
      setUser(account);
      setTables(records);
    } catch (error) {
      setStartupError(error instanceof Error ? error.message : 'Could not connect to CampusFlow.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void restoreSession();
  }, []);

  const signIn = async (email: string, password: string) => {
    const account = await authenticate(email, password);
    const records = await getRecords(account, notify);
    setTables(records);
    setUser(account);
    setPage('dashboard');
    setSearch('');
    notify(`Signed in as ${roleLabel(account.role)}.`);
    return true;
  };

  const signOut = async () => {
    try {
      await endSession();
      setUser(null);
      setTables(createEmptyTables());
      setSetupToken('');
      setAccountModalOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not sign out.');
    }
  };

  const updateRow = async (module: ModuleKey, id: string, changes: Record<string, string>) => {
    const current = tables[module].find((row) => row.id === id);
    if (!current) throw new Error('This record is no longer available. Refresh the page and try again.');
    const payload = Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'id'));
    const record = await updateRecord(module, id, { ...payload, ...changes });
    setTables((currentTables) => ({
      ...currentTables,
      [module]: currentTables[module].map((row) => row.id === id ? record : row),
    }));
  };

  const pushActivity = (title: string, detail: string, tone: Activity['tone'] = 'green') => {
    setActivity((current) => [{ id: crypto.randomUUID(), title, detail, time: 'Just now', tone }, ...current].slice(0, 5));
  };

  const publish = async (title: string, audience = 'Students') => {
    const { record } = await createRecord('announcements', { Title: title, Audience: audience, Published: 'Just now', Status: 'Unread' });
    setTables((current) => ({
      ...current,
      announcements: [record, ...current.announcements],
    }));
  };

  const resolveClash = async () => {
    const clash = tables.timetable.find((row) => row.Status?.toLowerCase().includes('conflict'));
    if (!clash) {
      notify('There are no unresolved timetable conflicts.');
      return;
    }
    await updateRow('timetable', clash.id, { Room: 'Innovation Lab', Status: 'Rescheduled' });
    await publish(`${clash.Course ?? 'A class'} moved to Innovation Lab`, 'Affected students');
    pushActivity('Timetable conflict resolved', 'The timetable record was updated and an announcement was published.', 'green');
    notify('Conflict resolved. Affected students were notified.');
  };

  const progressTicket = async () => {
    const ticket = tables.maintenance.find((row) => row.Status !== 'Resolved');
    if (!ticket) {
      notify('There are no open maintenance tickets.');
      return;
    }
    const next = ticket.Status === 'New' ? 'Assigned' : ticket.Status === 'Assigned' ? 'In progress' : 'Resolved';
    await updateRow('maintenance', ticket.id, { Status: next });
    if (next === 'Resolved') {
      await publish(`${ticket.Issue ?? 'Maintenance issue'} resolved`, 'Affected students');
      pushActivity('Maintenance issue resolved', `${ticket.Issue ?? 'The issue'} was marked resolved.`, 'green');
    }
    notify(`Maintenance ticket marked ${next.toLowerCase()}.`);
  };

  const openDraft = (module: ModuleKey, title: string, hint: string, status = 'Submitted') => {
    setDraftName('');
    setDraftStatus(status);
    setDraftOwnerEmail('');
    setDraftValues(Object.fromEntries(moduleFields[module].filter((key) => key !== 'Status').map((key) => [key, ''])));
    setDraftCategory('Safety');
    setDraftPriority('Medium');
    setDraftModal({ module, title, hint });
  };

  const addRecord = async (event: FormEvent) => {
    event.preventDefault();
    if (!draftModal || !draftName.trim()) return;

    let payload: Record<string, string>;

    if (draftModal.module === 'complaints') {
      payload = {
        Category: draftCategory,
        Summary: draftName.trim(),
        Priority: draftPriority,
        Status: 'Submitted',
      };
    } else {
      const headers = moduleFields[draftModal.module];
      payload = {};
      headers.forEach((header, index) => {
        payload[header] = header === 'Status' ? draftStatus : index === 0 ? draftName.trim() : draftValues[header]?.trim() ?? '';
      });
    }

    const { record, trackingToken } = await createRecord(draftModal.module, payload, draftOwnerEmail);
    let trackingSaved = false;
    if (trackingToken && user) {
      try {
        saveComplaintTracking(record.id, trackingToken, user.id);
        trackingSaved = true;
      } catch (error) {
        console.error('Could not save the anonymous complaint tracking key in this browser.', error);
        trackingSaved = false;
      }
    }
    setTables((current) => ({
      ...current,
      [draftModal.module]: [record, ...current[draftModal.module]],
    }));

    pushActivity(`${draftModal.title} added`, draftModal.module === 'complaints' ? 'An anonymous report was submitted for confidential review.' : `${draftName.trim()} was saved in ${pageTitle(draftModal.module)}.`, 'blue');
    setDraftModal(null);
    if (trackingToken) {
      setComplaintTracking({ reference: record['Case reference'], token: trackingToken, saved: trackingSaved });
    } else {
      notify(`${draftModal.title} saved.`);
    }
  };

  const runAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The action could not be completed.');
    }
  };

  const addAccount = async (event: FormEvent) => {
    event.preventDefault();
    const { user: account } = await createAccount(setupToken, accountDraft);
    pushActivity('Campus account created', `${account.role} account created for ${account.email}.`, 'blue');
    setAccountDraft({ name: '', email: '', password: '', role: 'student', department: '', programme: '' });
    notify(`Account created for ${account.email}.`);
  };

  if (loading) {
    return <div className="login-page"><section className="login-panel"><h2>Connecting to CampusFlow…</h2></section></div>;
  }

  if (startupError) {
    return (
      <div className="login-page">
        <section className="login-panel">
          <h2>CampusFlow could not connect</h2>
          <p>{startupError}</p>
          <button className="primary full" onClick={() => void restoreSession()}>Retry connection</button>
        </section>
      </div>
    );
  }

  if (!user) {
    return <Login onSignIn={signIn} />;
  }

  const allowedModules = modules.filter((item) => item.roles.includes(user.role));
  const groups = Array.from(new Set(allowedModules.map((item) => item.group)));
  const selected = page === 'dashboard' ? null : modules.find((item) => item.key === page) ?? null;
  const attentionCount = [
    ...tables.timetable.filter((row) => row.Status?.toLowerCase().includes('conflict')),
    ...tables.maintenance.filter((row) => row.Status !== 'Resolved'),
    ...tables.requests.filter((row) => !['Completed', 'Resolved'].includes(row.Status ?? '')),
  ].length;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">?</span>
          <span>CampusFlow</span>
        </div>

        <div className="university-card">
          <small>UNIVERSITY WORKSPACE</small>
          <b>University workspace</b>
          <span>Current academic term</span>
        </div>

        <nav className="nav" aria-label="CampusFlow navigation">
          <button className={page === 'dashboard' ? 'active' : ''} onClick={() => { setPage('dashboard'); setSidebarOpen(false); }}>
            <span>?</span> Overview
          </button>

          {groups.map((group) => (
            <div key={group} className="nav-group">
              <p>{group}</p>
              {allowedModules.filter((item) => item.group === group).map((item) => (
                <button key={item.key} className={page === item.key ? 'active' : ''} onClick={() => { setPage(item.key); setSidebarOpen(false); }}>
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="account">
          <div className="avatar">{user.initials}</div>
          <div>
            <b>{user.name}</b>
            <small>{roleLabel(user.role)}</small>
          </div>
          <button className="signout" onClick={() => { void signOut(); }} title="Sign out">?</button>
        </div>
      </aside>

      <div className="scrim" onClick={() => setSidebarOpen(false)} />

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)}>?</button>
          <div className="breadcrumb">Workspace <span>/</span> <b>{pageTitle(page)}</b></div>
          <div className="top-actions">
            <span className="mode"><i />MySQL-backed workspace</span>
            <span className="date">{today}</span>
            <button className="notification" onClick={() => notify(`${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention.`)}>?<i /></button>
          </div>
        </header>

        <section className="hero">
          <div>
            <span className="eyebrow">{roleLabel(user.role)} portal</span>
            <h1>{page === 'dashboard' ? `Good morning, ${user.name.split(' ')[0]}.` : selected?.label}</h1>
            <p>
              {page === 'dashboard'
                ? 'Manage the academic day, campus operations, and student services from one trusted workspace.'
                : selected?.description}
            </p>
          </div>

          {page === 'dashboard' && (
            <button className="primary" onClick={() => setPage(user.role === 'staff' ? 'maintenance' : user.role === 'student' ? 'requests' : 'timetable')}>
              Open priority work <span>?</span>
            </button>
          )}
        </section>

        {page === 'dashboard' ? (
          <Dashboard
            user={user}
            tables={tables}
            activity={activity}
            navigate={setPage}
            resolveClash={() => { void runAction(resolveClash); }}
            progressTicket={() => { void runAction(progressTicket); }}
          />
        ) : selected && (
          <ModulePage
            user={user}
            module={selected.key}
            tables={tables}
            search={search}
            setSearch={setSearch}
            resolveClash={() => { void runAction(resolveClash); }}
            progressTicket={() => { void runAction(progressTicket); }}
            openDraft={openDraft}
            updateRow={updateRow}
            runAction={runAction}
            notify={notify}
          />
        )}
      </main>

      {user.role === 'administrator' && page === 'students' && (
        <button className="account-create-fab" onClick={() => setAccountModalOpen(true)}>+ Create campus account</button>
      )}

      {accountModalOpen && (
        <AccountForm
          account={accountDraft}
          setAccount={setAccountDraft}
          setupToken={setupToken}
          setSetupToken={setSetupToken}
          onClose={() => { setAccountModalOpen(false); setSetupToken(''); }}
          onSubmit={(event) => { void runAction(() => addAccount(event)); }}
        />
      )}

      {draftModal && (
        <DraftForm
          draft={draftModal}
          name={draftName}
          status={draftStatus}
          setName={setDraftName}
          setStatus={setDraftStatus}
          ownerEmail={draftOwnerEmail}
          setOwnerEmail={setDraftOwnerEmail}
          canAssignOwner={['administrator', 'staff'].includes(user.role) && ['attendance', 'exams', 'finance', 'documents', 'requests', 'hostels', 'library'].includes(draftModal.module)}
          ownerRequired={user.role !== 'student' && ['attendance', 'exams', 'finance', 'documents', 'requests', 'hostels', 'library'].includes(draftModal.module)}
          fields={moduleFields[draftModal.module].filter((key) => key !== 'Status')}
          values={draftValues}
          setValues={setDraftValues}
          category={draftCategory}
          priority={draftPriority}
          setCategory={setDraftCategory}
          setPriority={setDraftPriority}
          onClose={() => setDraftModal(null)}
          onSubmit={(event) => { void runAction(() => addRecord(event)); }}
        />
      )}

      {complaintTracking && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="complaint-tracking-title">
            <span className="eyebrow">Anonymous report submitted</span>
            <h2 id="complaint-tracking-title">Save your case details</h2>
            <p>Your report is not linked to your account. Keep this private key to track its status later.</p>
            <label>
              Case reference
              <input readOnly value={complaintTracking.reference} />
            </label>
            <label>
              Private tracking key
              <input readOnly value={complaintTracking.token} />
            </label>
            <small>{complaintTracking.saved
              ? 'The tracking key is also saved in this browser for your convenience.'
              : 'This browser could not save the key. Copy it now; it cannot be recovered if lost.'}</small>
            <div className="modal-actions">
              <button className="primary" onClick={() => setComplaintTracking(null)}>Done</button>
            </div>
          </section>
        </div>
      )}

      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}

function Login({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<boolean> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await onSignIn(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Sign in failed. Please try again.');
    }
  };

  return (
    <div className="login-page">
      <section className="login-copy">
        <div className="brand"><span className="brand-mark">?</span>CampusFlow</div>
        <span className="eyebrow">University management, connected</span>
        <h1>Run campus operations from one reliable place.</h1>
        <p>Admissions, academics, facilities, finance, student support, and communication in one role-aware workspace.</p>
        <div className="login-highlights">
          <span>? Role-based access</span>
          <span>? Conflict-aware scheduling</span>
          <span>? Responsive for mobile</span>
        </div>
      </section>

      <section className="login-panel">
        <div>
          <span className="eyebrow">Secure workspace</span>
          <h2>Sign in to CampusFlow</h2>
          <p>Sign in with the account provisioned by your university administrator.</p>
        </div>

        <form onSubmit={submit}>
          <label>
            Email
            <input required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@university.edu" type="email" />
          </label>
          <label>
            Password
            <input required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
          </label>

          {error && <div className="form-error">{error}</div>}
          <button className="primary full" type="submit">Sign in</button>
        </form>

        <small className="demo-note">Accounts are created by an authorized CampusFlow administrator.</small>
      </section>
    </div>
  );
}

function Dashboard({ user, tables, activity, navigate, resolveClash, progressTicket }: {
  user: CampusUser;
  tables: Record<ModuleKey, TableRow[]>;
  activity: Activity[];
  navigate: (page: Page) => void;
  resolveClash: () => void;
  progressTicket: () => void;
}) {
  const clashes = tables.timetable.filter((row) => row.Status?.toLowerCase().includes('conflict'));
  const openMaintenance = tables.maintenance.filter((row) => row.Status !== 'Resolved');
  const openRequests = tables.requests.filter((row) => !['Completed', 'Resolved'].includes(row.Status ?? ''));
  const studentAttendance = user.role === 'student' ? tables.attendance[0] : tables.attendance.find((row) => row.Student === user.name);
  const openInvoices = tables.finance.filter((row) => row.Status !== 'Paid');
  const stats = user.role === 'administrator'
    ? [
        ['Student records', String(tables.students.length), 'Current records'],
        ['Open maintenance', String(openMaintenance.length), 'Needs attention'],
        ['Timetable clashes', String(clashes.length), 'Needs action'],
        ['Invoices due', String(openInvoices.length), 'Unpaid records'],
      ]
    : user.role === 'staff'
      ? [
          ['Scheduled classes', String(tables.timetable.length), 'Current records'],
          ['Attendance records', String(tables.attendance.length), 'Available registers'],
          ['Open tickets', String(openMaintenance.length), 'Needs attention'],
          ['Student requests', String(openRequests.length), 'Awaiting response'],
        ]
      : [
          ['Scheduled classes', String(tables.timetable.length), 'Current records'],
          ['My attendance', studentAttendance?.Percentage ?? '—', studentAttendance?.Signal ?? 'No attendance record'],
          ['Open invoices', String(openInvoices.length), 'Unpaid records'],
          ['Open requests', String(openRequests.length), 'Awaiting response'],
        ];
  const priorityItems = [
    ...(clashes.length ? [{
      title: clashes[0].Course ?? 'Timetable conflict',
      detail: `${clashes[0].Day ?? 'Schedule'} ${clashes[0].Time ?? ''} · ${clashes[0].Room ?? 'Room not set'}`,
      page: 'timetable' as Page,
      action: user.role === 'administrator' ? 'Resolve clash' : 'View timetable',
      run: user.role === 'administrator' ? resolveClash : () => navigate('timetable'),
    }] : []),
    ...(openMaintenance.length ? [{
      title: openMaintenance[0].Issue ?? 'Open maintenance ticket',
      detail: `${openMaintenance[0].Location ?? 'Location not set'} · ${openMaintenance[0].Status ?? 'Open'}`,
      page: 'maintenance' as Page,
      action: user.role === 'student' ? 'View updates' : 'Update ticket',
      run: user.role === 'student' ? () => navigate('announcements') : progressTicket,
    }] : []),
    ...(openRequests.length ? [{
      title: openRequests[0].Request ?? 'Student service request',
      detail: `${openRequests[0].Team ?? 'Service desk'} · ${openRequests[0].Status ?? 'Open'}`,
      page: 'requests' as Page,
      action: 'Open desk',
      run: () => navigate('requests'),
    }] : []),
  ];

  const quickCards = [
    { title: 'Academic management', copy: 'Track courses, attendance and timetable health in one place.', icon: '?', page: 'academics' as Page },
    { title: 'Room optimization', copy: 'Spot space conflicts early and reassign rooms before classes start.', icon: '?', page: 'rooms' as Page },
    { title: 'Anonymous complaints', copy: 'Students can raise issues privately while admins can resolve them without revealing identity.', icon: '⚐', page: 'complaints' as Page },
    { title: 'Finance pulse', copy: 'Monitor loans, scholarships and payment status across student records.', icon: '?', page: 'finance' as Page },
  ];

  return (
    <>
      <section className="stats">
        {stats.map(([label, value, detail]) => (
          <article className="stat-card" key={label}>
            <span>{label}</span>
            <b>{value}</b>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="card priority-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Current records</span>
              <h2>Priority work center</h2>
            </div>
            <button className="text-button" onClick={() => navigate('analytics')}>View reports ?</button>
          </div>

          <div className="priority-list">
            {priorityItems.length ? priorityItems.map((item) => (
              <div className="priority-item" key={item.page}>
                <span className="priority-icon conflict">!</span>
                <section>
                  <b>{item.title}</b>
                  <p>{item.detail}</p>
                </section>
                <button className="secondary" onClick={item.run}>{item.action}</button>
              </div>
            )) : <p className="empty-state">No priority work is currently recorded.</p>}
          </div>
        </article>

        <CampusAssistant user={user} tables={tables} />
      </section>

      <section className="quick-grid">
        {quickCards.filter((card) => modules.find((item) => item.key === card.page)?.roles.includes(user.role)).map((card) => (
          <QuickCard
            key={card.title}
            title={card.title}
            copy={card.copy}
            icon={card.icon}
            onClick={() => navigate(card.page)}
          />
        ))}
      </section>

      <section className="card activity-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">This session</span>
            <h2>Recent activity</h2>
          </div>
        </div>

        <div className="activity-list">
          {activity.map((item) => (
            <div className="activity" key={item.id}>
              <i className={item.tone} />
              <div>
                <b>{item.title}</b>
                <p>{item.detail}</p>
              </div>
              <small>{item.time}</small>
            </div>
          ))}
          {!activity.length && <p className="empty-state">New actions in this session will appear here.</p>}
        </div>
      </section>
    </>
  );
}

function CampusAssistant({ user, tables }: { user: CampusUser; tables: Record<ModuleKey, TableRow[]> }) {
  const prompts = [
    'Are there any timetable conflicts?',
    'How is my attendance?',
    'Is there anything urgent in facilities?',
    'What is my invoice status?',
  ];

  const [question, setQuestion] = useState(prompts[0]);
  const [answer, setAnswer] = useState(getAssistantAnswer(prompts[0], tables, user));

  const ask = (value: string) => {
    setQuestion(value);
    setAnswer(getAssistantAnswer(value, tables, user));
  };

  return (
    <article className="card assistant-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Campus AI</span>
          <h2>Smart campus assistant</h2>
        </div>
      </div>

      <div className="assistant-prompt-list">
        {prompts.map((prompt) => (
          <button key={prompt} className={question === prompt ? 'active' : ''} onClick={() => ask(prompt)}>{prompt}</button>
        ))}
      </div>

      <div className="assistant-answer">
        <p className="assistant-label">Question</p>
        <b>{question}</b>
        <p className="assistant-label">Answer</p>
        <p>{answer}</p>
      </div>
    </article>
  );
}

function getAssistantAnswer(question: string, tables: Record<ModuleKey, TableRow[]>, user: CampusUser) {
  const q = question.toLowerCase();

  if (q.includes('timetable') || q.includes('room') || q.includes('move')) {
    const conflict = tables.timetable.find((row) => row.Status?.toLowerCase().includes('conflict'));
    return conflict
      ? `${conflict.Course ?? 'A class'} has an unresolved conflict at ${conflict.Room ?? 'an assigned room'}. Review the timetable before changing the schedule.`
      : 'No unresolved timetable conflicts are present in the records available to your account.';
  }

  if (q.includes('attendance') || q.includes('cs210')) {
    const attendance = tables.attendance;
    return attendance.length
      ? `There are ${attendance.length} attendance record${attendance.length === 1 ? '' : 's'} available to your account. Check the Attendance module for details.`
      : 'No attendance records are currently available to your account.';
  }

  if (q.includes('facility') || q.includes('maintenance') || q.includes('urgent')) {
    const ticket = tables.maintenance.find((row) => row.Status !== 'Resolved');
    return ticket
      ? `${ticket.Issue ?? 'A maintenance issue'} is ${ticket.Status ?? 'open'}${ticket.Location ? ` at ${ticket.Location}` : ''}.`
      : 'No open maintenance tickets are present in the records available to your account.';
  }

  if (q.includes('billing') || q.includes('fee') || q.includes('payment') || q.includes('invoice')) {
    const invoices = tables.finance;
    if (!invoices.length) return 'No invoice records are currently available to your account.';
    const due = invoices.filter((row) => row.Status !== 'Paid').length;
    return `${invoices.length} invoice record${invoices.length === 1 ? '' : 's'} available; ${due} unpaid. Payment processing is not configured.`;
  }

  if (user.role === 'student') {
    return 'Choose a question above to check the campus records available to your account.';
  }

  return 'Choose a question above to summarize the records available to your account.';
}

function QuickCard({ title, copy, icon, onClick }: { title: string; copy: string; icon: string; onClick: () => void }) {
  return (
    <button className="quick-card" onClick={onClick}>
      <span>{icon}</span>
      <section>
        <b>{title}</b>
        <p>{copy}</p>
      </section>
      <em>?</em>
    </button>
  );
}

type ModulePageProps = {
  user: CampusUser;
  module: ModuleKey;
  tables: Record<ModuleKey, TableRow[]>;
  search: string;
  setSearch: (value: string) => void;
  resolveClash: () => void;
  progressTicket: () => void;
  openDraft: (module: ModuleKey, title: string, hint: string, status?: string) => void;
  updateRow: (module: ModuleKey, id: string, changes: Record<string, string>) => Promise<void>;
  runAction: (action: () => Promise<void>) => Promise<void>;
  notify: (message: string) => void;
};

function ModulePage(props: ModulePageProps) {
  const { user, module, tables, search, setSearch, openDraft, updateRow, notify } = props;
  const definition = modules.find((item) => item.key === module)!;
  const rows = tables[module];
  const headers = rows.length ? Object.keys(rows[0]).filter((key) => key !== 'id') : moduleFields[module];
  const visibleRows = useMemo(() => rows.filter((row) => {
    return Object.values(row).join(' ').toLowerCase().includes(search.toLowerCase());
  }), [rows, search]);

  const action = module === 'timetable' && user.role === 'administrator'
    ? { label: 'Resolve detected clash', run: props.resolveClash }
    : module === 'maintenance'
      ? { label: tables.maintenance.some((row) => row.Status !== 'Resolved') ? 'Progress maintenance ticket' : 'No open tickets', run: props.progressTicket }
      : null;

  const canCreate = module === 'complaints'
    ? user.role === 'student'
    : user.role === 'administrator' && module !== 'analytics'
      || user.role === 'staff' && ['attendance', 'maintenance', 'announcements', 'events', 'requests'].includes(module)
      || user.role === 'student' && ['hostels', 'documents', 'requests'].includes(module);
  const createTitle = module === 'maintenance' ? 'Report issue' : module === 'requests' ? 'New service request' : module === 'complaints' ? 'Submit complaint' : module === 'finance' ? 'Create invoice' : module === 'rooms' ? 'New booking' : `Add ${definition.label.slice(0, -1) || 'record'}`;

  const advanceRequest = async (row: TableRow) => {
    const current = row.Status;
    const next = current === 'Submitted' ? 'Under review' : current === 'Under review' ? 'Approved' : current === 'Approved' ? 'Completed' : current;
    await updateRow(module, row.id, { Status: next });
    notify(`Request moved to ${next.toLowerCase()}.`);
  };

  const advanceComplaint = async (row: TableRow) => {
    const next = row.Status === 'Submitted' ? 'Under review' : row.Status === 'Under review' || row.Status === 'Escalated' ? 'Resolved' : row.Status;
    if (next === row.Status) return;

    await updateRow(module, row.id, { Status: next });
    notify(next === 'Resolved' ? 'Complaint resolved. The reporter can see the updated status.' : 'Complaint moved to internal review.');
  };

  return (
    <section className="module-page">
      <div className="module-toolbar">
        <label className="search">
          <span>?</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${definition.label.toLowerCase()}...`} />
        </label>

        <div>
          {action && <button className="secondary" onClick={() => { void props.runAction(async () => action.run()); }}>{action.label}</button>}
          {canCreate && (
            <button className="primary" onClick={() => openDraft(module, createTitle, `Add a record to ${definition.label}.`, module === 'maintenance' ? 'New' : 'Submitted')}>
              + {createTitle}
            </button>
          )}
        </div>
      </div>

      {module === 'timetable' && tables.timetable.some((row) => row.Status?.toLowerCase().includes('conflict')) && <ConflictBanner onResolve={props.resolveClash} resolved={false} />}
      {module === 'attendance' && user.role === 'student' && (
        <div className="insight-banner">
          <span>?</span>
          <div>
            <b>Your attendance records</b>
            <p>Only attendance records linked to your account are shown here.</p>
          </div>
        </div>
      )}
      {module === 'analytics' && <Analytics tables={tables} />}
      {module === 'complaints' && (
        <div className="insight-banner">
          <span>i</span>
          <div>
            <b>{user.role === 'student' ? 'Private case tracking' : 'Identity-free review'}</b>
            <p>{user.role === 'student'
              ? 'Your reports appear here by case reference. No student ID or name is included in the report.'
              : 'Reviewers see the report details and case reference only. Reporter identity is not stored with the complaint.'}</p>
          </div>
        </div>
      )}
      {module === 'maintenance' && tables.maintenance.some((row) => row.Status !== 'Resolved') && (
        <div className="insight-banner amber">
          <span>?</span>
          <div>
            <b>There are open maintenance records.</b>
            <p>Status updates are saved to the campus database.</p>
          </div>
        </div>
      )}

      <article className="card table-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{visibleRows.length} {visibleRows.length === 1 ? 'record' : 'records'}</span>
            <h2>{definition.label}</h2>
          </div>
          <small>Changes are saved to the campus database.</small>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {headers.map((header) => <th key={header}>{header}</th>)}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? (
                visibleRows.map((row) => (
                  <tr key={row.id}>
                    {headers.map((header) => (
                      <td key={header}>
                        {header === 'Status' || header === 'Signal' || header === 'Decision' || header === 'Availability'
                          ? <Status value={row[header]} />
                          : row[header]}
                      </td>
                    ))}

                    <td className="action-cell">
                      {module === 'requests' && user.role !== 'student' && (
                        <button className="secondary tiny" onClick={() => { void props.runAction(() => advanceRequest(row)); }}>Advance</button>
                      )}
                      {module === 'complaints' && user.role !== 'student' && row.Status !== 'Resolved' && (
                        <button className="secondary tiny" onClick={() => { void props.runAction(() => advanceComplaint(row)); }}>{row.Status === 'Submitted' ? 'Start review' : 'Resolve'}</button>
                      )}
                      {module === 'maintenance' && user.role === 'staff' && (
                        <button className="secondary tiny" onClick={props.progressTicket}>Update</button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={headers.length + 1} className="empty-state">No matching records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function Status({ value }: { value: string }) {
  const status = value.toLowerCase().replace(/ /g, '-');
  return <span className={`status ${status}`}>{value}</span>;
}

function ConflictBanner({ onResolve, resolved }: { onResolve: () => void; resolved: boolean }) {
  return resolved ? (
    <div className="insight-banner">
      <span>?</span>
      <div>
        <b>Timetable conflict resolved.</b>
        <p>The timetable record has been updated.</p>
      </div>
    </div>
  ) : (
    <div className="insight-banner danger">
      <span>!</span>
      <div>
        <b>One scheduling conflict needs a decision.</b>
        <p>Review the affected course and confirm an available replacement room.</p>
      </div>
      <button className="secondary" onClick={onResolve}>Resolve conflict</button>
    </div>
  );
}

function Analytics({ tables }: { tables: Record<ModuleKey, TableRow[]> }) {
  const attendanceRisk = tables.attendance.filter((row) => {
    const percentage = Number(row.Percentage?.replace('%', ''));
    return Number.isFinite(percentage) && percentage < 75;
  }).length;
  const paidInvoices = tables.finance.filter((row) => row.Status === 'Paid').length;
  const invoiceCount = tables.finance.length;
  const collection = invoiceCount ? Math.round((paidInvoices / invoiceCount) * 100) : null;

  return (
    <div className="analytics-strip">
      <div>
        <span>Attendance records below 75%</span>
        <b>{attendanceRisk}</b>
        <small>Based on records visible to this account</small>
      </div>
      <div>
        <span>Room records</span>
        <b>{tables.rooms.length}</b>
        <small>Current records</small>
      </div>
      <div>
        <span>Invoices paid</span>
        <b>{collection === null ? '—' : `${collection}%`}</b>
        <small>{invoiceCount} invoice record{invoiceCount === 1 ? '' : 's'}</small>
      </div>
    </div>
  );
}

function AccountForm({ account, setAccount, setupToken, setSetupToken, onClose, onSubmit }: {
  account: AccountDraft;
  setAccount: (account: AccountDraft) => void;
  setupToken: string;
  setSetupToken: (token: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const update = (changes: Partial<AccountDraft>) => setAccount({ ...account, ...changes });

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">x</button>
        <span className="eyebrow">User administration</span>
        <h2>Create campus account</h2>
        <p>Accounts are created on the server. The temporary setup token is not saved in the browser.</p>
        <label>
          Temporary setup token
          <input required type="password" autoComplete="off" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} />
        </label>
        <label>
          Full name
          <input required maxLength={160} value={account.name} onChange={(event) => update({ name: event.target.value })} />
        </label>
        <label>
          University email
          <input required type="email" maxLength={254} value={account.email} onChange={(event) => update({ email: event.target.value })} />
        </label>
        <label>
          Temporary password (minimum 12 characters)
          <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={account.password} onChange={(event) => update({ password: event.target.value })} />
        </label>
        <label>
          Role
          <select value={account.role} onChange={(event) => update({ role: event.target.value as CampusUser['role'] })}>
            <option value="student">Student</option>
            <option value="staff">Faculty &amp; staff</option>
            <option value="administrator">Administrator</option>
          </select>
        </label>
        <label>
          Department
          <input maxLength={160} value={account.department} onChange={(event) => update({ department: event.target.value })} />
        </label>
        {account.role === 'student' && (
          <label>
            Programme
            <input maxLength={160} value={account.programme} onChange={(event) => update({ programme: event.target.value })} />
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit">Create account</button>
        </div>
      </form>
    </div>
  );
}

function DraftForm({ draft, name, status, setName, setStatus, ownerEmail, setOwnerEmail, canAssignOwner, ownerRequired, category, priority, setCategory, setPriority, fields, values, setValues, onClose, onSubmit }: {
  draft: NonNullable<DraftModal>;
  name: string;
  status: string;
  setName: (value: string) => void;
  setStatus: (value: string) => void;
  ownerEmail: string;
  setOwnerEmail: (value: string) => void;
  canAssignOwner: boolean;
  ownerRequired: boolean;
  category: string;
  priority: string;
  setCategory: (value: string) => void;
  setPriority: (value: string) => void;
  fields: string[];
  values: Record<string, string>;
  setValues: (value: Record<string, string>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="close" onClick={onClose} aria-label="Close">x</button>
        <span className="eyebrow">CampusFlow workflow</span>
        <h2>{draft.title}</h2>
        <p>{draft.hint}</p>

        {canAssignOwner && (
          <label>
            Link to student account (email)
            <input required={ownerRequired} type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="student@university.edu" />
          </label>
        )}

        {draft.module === 'complaints' ? (
          <>
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option>Safety</option>
                <option>Facilities</option>
                <option>Academic</option>
                <option>Harassment or conduct</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              What happened?
              <textarea required maxLength={500} value={name} onChange={(event) => setName(event.target.value)} placeholder="Describe the concern without including your name or student ID." />
            </label>
            <label>
              Urgency
              <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </label>
            <small>Your case reference lets you track the status. Do not include identifying details in the report.</small>
          </>
        ) : (
          <>
            <label>
              {fields[0] ?? 'Name or summary'}
              <input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder={`Enter ${fields[0]?.toLowerCase() ?? 'a clear description'}`} />
            </label>
            {fields.slice(1).map((field) => (
              <label key={field}>
                {field}
                <input
                  required={!['Status', 'Decision', 'Signal', 'Availability', 'Change'].includes(field)}
                  value={values[field] ?? ''}
                  onChange={(event) => setValues({ ...values, [field]: event.target.value })}
                  placeholder={`Enter ${field.toLowerCase()}`}
                />
              </label>
            ))}
            {moduleFields[draft.module].includes('Status') && (
              <label>
                Starting status
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option>Submitted</option>
                  <option>New</option>
                  <option>Pending</option>
                  <option>Under review</option>
                </select>
              </label>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit">Save record</button>
        </div>
      </form>
    </div>
  );
}
