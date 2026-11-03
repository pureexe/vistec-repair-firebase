export default {
  app: { name: 'VISTEC Repair', sub: 'Repair request & tracking', org: 'Vidyasirimedhi Institute of Science and Technology' },
  nav: {
    home: 'Home', request: 'Report', track: 'Track', myJobs: 'My jobs', jobs: 'All jobs',
    dashboard: 'Dashboard', admin: 'Admin', master: 'Master data', users: 'Users', qr: 'QR codes',
    profile: 'Profile', login: 'Sign in', logout: 'Sign out', more: 'More',
    pm: 'Maintenance', pmList: 'PM plans', pmCalendar: 'PM calendar', assets: 'Assets', assetList: 'Machines & equipment', materials: 'Materials & spare parts'
  },
  common: {
    prev: 'Previous', next: 'Next', clear: 'Clear',
    save: 'Save', cancel: 'Cancel', close: 'Close', add: 'Add', edit: 'Edit', delete: 'Delete', search: 'Search',
    loading: 'Loading…', confirm: 'Confirm', back: 'Back', all: 'All', none: '-', yes: 'Yes', no: 'No',
    copy: 'Copy', copied: 'Copied', print: 'Print', optional: 'optional', required: 'required',
    saved: 'Saved', error: 'Something went wrong', noData: 'No data yet', name: 'Name', nameTh: 'Name (Thai)',
    nameEn: 'Name (English)', active: 'Active', order: 'Order', actions: 'Actions', send: 'Send', view: 'View',
    notConfigured: 'Firebase is not configured (.env) — the app will not work yet'
  },
  home: {
    heroTitle: 'Report a problem. Follow every step.',
    heroText: 'Report building, electrical, air-con, plumbing, IT and other issues on campus. Get a tracking number and an e-mail whenever the status changes.',
    startRequest: 'Report now', trackTitle: 'Track a job', trackPlaceholder: 'Enter your job no., e.g. VR2026-0001',
    feat1: 'Uses your phone GPS to fill in the location', feat2: 'E-mail on every status change',
    feat3: 'See the expected finish date — and why, if it is delayed'
  },
  auth: {
    title: 'Sign in', subtitle: 'VISTEC staff and students: please use your VISTEC Microsoft account',
    microsoft: 'Sign in with Microsoft (VISTEC)', google: 'Sign in with Google',
    orEmail: 'or use e-mail (contractors / external)',
    email: 'E-mail', password: 'Password', signIn: 'Sign in', register: 'Create account', haveAccount: 'Have an account? Sign in',
    noAccount: 'No account? Register with e-mail', forgot: 'Forgot password', resetSent: 'Password reset link sent',
    emailLink: 'E-mail me a sign-in link (no password)', linkSent: 'A sign-in link was sent to {email}. Open it on this device.',
    finishing: 'Signing you in…', confirmEmail: 'Please re-enter the e-mail you requested the link for',
    verifySent: 'Verification e-mail sent. Please verify your address.', displayName: 'Full name',
    accountExists: 'This e-mail already signed in with another method ({methods}). Sign in that way first, then link this method in your profile.',
    badCredential: 'Invalid e-mail or password',
    emailInUse: 'This e-mail is already registered — please sign in instead.',
    invalidEmail: 'That e-mail address is not valid', tooMany: 'Too many attempts. Please wait a moment and try again', recentLogin: 'Please sign out and sign in again before doing this',
    weakPassword: 'The password must be at least 6 characters.',
    notConfigured: 'Sign-in is not set up for this Firebase project yet (auth/configuration-not-found). An administrator must open Firebase Console → Authentication → Get started, turn on the E-mail/Password provider, then copy this project\'s real web app config into .env.',
    providerDisabled: 'This sign-in method is turned off in the Firebase project. An administrator must enable it in Firebase Console → Authentication → Sign-in method.',
    apiKeyInvalid: 'The Firebase API key in .env is not valid. Copy the web app config again from Firebase Console → Project settings → General → Your apps.',
    unauthorizedDomain: 'This domain may not sign users in. Add it in Firebase Console → Authentication → Settings → Authorized domains.',
    noMethods: 'No sign-in method is enabled for this deployment. An administrator must turn one on in Firebase Console → Authentication and in the VITE_AUTH_* settings.',
    needLogin: 'Please sign in before reporting so we can contact you and e-mail status updates.',
    contractorHint: 'External contractors: use the e-mail the admin invited and choose "E-mail me a sign-in link".'
  },
  profile: {
    title: 'My profile', phone: 'Phone', department: 'Department / School', company: 'Company',
    role: 'Role', language: 'Language', linked: 'Linked sign-in methods',
    linkHint: 'Link several methods to one account and sign in with any of them', link: 'Link', linkedOk: 'Account linked',
    setPassword: 'Set a password for this e-mail', unlink: 'Unlink',
    changeEmail: 'Change e-mail', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password (at least 6 characters)',
    confirmPassword: 'Confirm new password', newEmail: 'New e-mail', passwordMismatch: 'The new passwords do not match', sameEmail: 'The new e-mail is the same as the current one',
    passwordChanged: 'Password changed', emailSent: 'A confirmation link was sent to {email}. Your e-mail changes when you click it; then sign in with the new address',
    emailHint: 'We send a confirmation link to the new address. Your e-mail changes only after you click it', noPassword: 'Forgot it, or never set a password? E-mail me a link to set one'
  },
  roles: { user: 'Reporter', contractor: 'Contractor', technician: 'Technician / staff', admin: 'Administrator' },
  status: {
    new: 'Reported', assigned: 'Assigned', in_progress: 'In progress', on_hold: 'On hold',
    completed: 'Completed', cancelled: 'Cancelled'
  },
  priority: { normal: 'Normal', urgent: 'Urgent', low: 'Low', callback: 'Call back / appointment' },
  hold: {
    title: 'Reason for hold', waiting_parts: 'Waiting for parts / materials', budget: 'Waiting for budget / next finance cycle',
    contractor: 'Waiting for contractor / vendor', access: 'Waiting for access / appointment', other: 'Other',
    partsEta: 'Parts expected on', resumeDate: 'Expected to resume on', note: 'Details (visible to reporter)'
  },
  request: {
    title: 'Repair request form', site: 'Site', building: 'Building', area: 'Area / floor / room', locationDetail: 'Location detail',
    locationDetailPh: 'e.g. Room 301 next to the lift', jobType: 'Job type', description: 'Problem description',
    descriptionPh: 'Describe the problem, e.g. air-con dripping, light not working…', priority: 'Priority', contact: 'Your contact',
    name: 'Full name', phone: 'Phone', email: 'E-mail (for notifications)', department: 'Department',
    photos: 'Photos (max {n})', photosHint: 'Photos are resized to ≤720p and converted to WebP automatically',
    pdpa: 'I consent to my contact data being used only to update me on this job and provide the service (PDPA)',
    submit: 'Submit request', submitting: 'Submitting…', selectPh: '— select —',
    gps: 'Current location', gpsUse: 'Use GPS location', gpsLoading: 'Reading location…', gpsOk: 'Location found (±{m} m)',
    gpsNearest: 'Nearest building: {name} (~{m} m) — selected for you', gpsDenied: 'Could not read your location — please choose the building',
    gpsMap: 'View on map', successTitle: 'Request submitted', successText: 'Keep this job number to track your request. We will e-mail you whenever the status changes.',
    jobNo: 'Job no.', openTracking: 'Open tracking page', another: 'Report another',
    fromQr: 'From QR code: {name}',
    forAsset: 'Work order for: {name}'
  },
  track: {
    title: 'Track repair', notFound: 'Job number not found. Please check and try again.', lookup: 'Check',
    expected: 'Expected completion', expectedUnknown: 'Not set yet — staff will update after assessing the job',
    onHoldTitle: 'This job is on hold', timeline: 'Progress', reported: 'Reported', updated: 'Last update', live: 'Live',
    share: 'Share tracking link'
  },
  event: {
    created: 'Request received', status: 'Status changed to "{to}"', assign: 'Assigned to {to}', unassign: '{from} removed from the job', expected: 'Expected completion date set',
    hold: 'On hold: {to}', comment: 'Comment', photo: 'Photo added'
  },
  jobs: {
    title: 'Repair jobs', mine: 'My requests', assignedToMe: 'Assigned to me', searchPh: 'Search job no., description, reporter…',
    searchHelp: 'Press Enter to find a job no. among all jobs · type to filter the jobs on this page',
    searchResult: '{n} job(s) found', page: 'Page {n} ({size} per page)', files: 'Files from the old system',
    count: '{n} jobs', empty: 'No jobs match', openOnly: 'Open jobs only', reporter: 'Reporter', assignee: 'Assignee',
    unassigned: 'Unassigned', publicPage: 'Public tracking page', createdAt: 'Reported', location: 'Location', detail: 'Job details', workDetail: 'Work performed',
    photos: 'Photos', addPhoto: 'Add photo', timeline: 'Activity log', addComment: 'Add comment', commentPh: 'Type a message…',
    publicComment: 'Visible to reporter (and e-mailed)', internal: 'Internal', overdue: 'Overdue', gpsLink: 'GPS location',
    newRequest: 'New request'
  },
  actions: {
    title: 'Actions', assign: 'Assign', assignTo: 'Assign to', add: 'Add', addAssignee: 'Add staff to this job', removeAssignee: 'Remove {name} from this job?', start: 'Start work', hold: 'Put on hold',
    resume: 'Resume', complete: 'Close job (completed)', cancelJob: 'Cancel job', reopen: 'Reopen',
    setExpected: 'Set expected completion date', expectedNote: 'Note to reporter', priority: 'Priority',
    reason: 'Reason', confirmCancel: 'Cancel this job?', workDone: 'Work performed', notifyNote: 'The reporter is e-mailed automatically'
  },
  dashboard: {
    title: 'Repair overview', thisMonth: 'This month', lastMonth: 'Last month', total: 'All time', open: 'Open',
    done: '{p}% done', byStatus: 'By status', byType: 'By job type', byBuilding: 'By building', byMonth: 'Jobs per month (12 months)',
    byAssignee: 'By assignee', onHold: 'On hold', overdue: 'Past expected date'
  },
  master: {
    title: 'Master data', sites: 'Sites', site: 'Site', buildings: 'Buildings', areas: 'Areas', jobTypes: 'Job types', code: 'Code',
    lat: 'Latitude', lng: 'Longitude', useMyLocation: 'Use my location', seed: 'Create defaults',
    seedConfirm: 'Create the VISTEC building and standard job types?', seeded: 'Defaults created', building: 'Building',
    icon: 'Icon (mdi)', chooseBuilding: 'Choose a building to manage its areas',
    assetTypes: 'Asset / material types', isGroup: 'this is a system group'
  },
  users: {
    title: 'Users & roles', invite: 'Invite contractor / staff', inviteHint: 'When the invited person signs in with this e-mail (e-mail link or password) they get the role automatically',
    staffTitle: 'Staff without an account', staffHint: 'Technicians from the old CPFM system and anyone added here can be put on jobs before they have an account. Enter their e-mail: when they sign in with it, the record and its jobs become theirs. Or link an existing account directly.',
    staffCode: 'Staff code', noAccount: 'No account yet', linkEmail: 'E-mail for automatic linking', waitingFor: 'Links when {email} signs in',
    linkAccount: 'Link to an existing account', unlink: 'Unlink', unlinkConfirm: 'Unlink {name} from this account?', inactive: 'Inactive',
    addStaff: 'Add staff (no account yet)', addStaffHint: 'They can be put on jobs right away and linked to an account later',
    invites: 'Pending invites', lastLogin: 'Last sign-in', changeRole: 'Change role', filterRole: 'Filter by role'
  },
  qr: {
    title: 'QR codes for reporting', hint: 'Print and post in buildings/rooms. Scanning opens the form with the location pre-selected.',
    wholeBuilding: 'Whole building', scan: 'Scan to report a problem'
  },
  asset: {
    title: 'Machines & equipment', one: 'Asset', count: '{n} items', add: 'Add machine / equipment', searchPh: 'Search code, name, brand, model…',
    more: 'and {n} more — search or filter to see them', group: 'System', type: 'Type', status: 'Status', request: 'Work order',
    code: 'Code', name: 'Name', installedAt: 'Received / installed', brand: 'Brand', model: 'Model', serial: 'Serial no.', supplier: 'Supplier',
    qty: 'Quantity', unit: 'Unit', price: 'Unit price', warranty: 'Warranty (years)', life: 'Service life (years)', checklist: 'Check list',
    detail: 'Details', remark: 'Remarks', updated: 'Last changed', log: 'Repair / maintenance log', addLog: 'Add log entry',
    logPh: 'Log entry for {code}…', action: 'Action', date: 'Date', newStatus: 'Change status to', cost: 'Cost',
    downtime: 'Breakdown time', jobs: 'Work orders for this asset', history: 'Change history', edited: 'Details changed', created: 'Created'
  },
  assetStatus: { normal: 'Normal', repair: 'Under repair', written_off: 'Written off', expired: 'Expired' },
  assetAction: { pm: 'Maintenance', repair: 'Repair', change: 'Change / upgrade', transfer: 'Move', install: 'Install', other: 'Other' },
  material: {
    title: 'Materials & spare parts', add: 'Add material', searchPh: 'Search code, name, brand…', store: 'Store',
    lowOnly: 'At or below min only', showInactive: 'Show inactive', reorder: 'Reorder', onHand: 'On hand',
    stockCard: 'Stock card', in: 'Stock in', out: 'Issue stock', forJob: 'Job no.', moveTitle: 'Entry',
    jobNotFound: 'Job number not found', usedNote: 'Issued {name} {qty} {unit}', used: 'Materials and asset repairs on this job',
    issue: 'Issue material', outFor: 'Issued for job {no}'
  },
  pm: {
    title: 'Preventive maintenance plans', one: 'PM plan', plans: 'PM plans with this asset', add: 'Add PM plan', searchPh: 'Search PM number, title…',
    genTo: 'Work orders up to', gen: 'Create', genHelp: 'Creates a work order for every due date from today to the chosen date that has none yet',
    nothingDue: 'Nothing due in that range', genConfirm: 'Create {n} work orders?', generated: '{n} work order(s) created',
    next: 'Next', every: 'every {n} {unit}', planTitle: 'Title', start: 'Starts', end: 'Repeats until', repeat: 'Repeat',
    remind: 'Remind before', tasks: 'Tasks to do', assets: 'Machines', pickAsset: 'Choose a machine',
    schedule: 'Due dates', makeJob: 'Create work order', jobs: 'Work orders', today: 'Today'
  },
  repeat: { none: 'Does not repeat', minute: 'minute(s)', hour: 'hour(s)', day: 'day(s)', week: 'week(s)', month: 'month(s)', quarter: 'quarter(s)', year: 'year(s)' },
  cpfm: { overwritten: 'This record comes from the old CPFM system. The next import overwrites changes made here (edit it in CPFM until CPFM is switched off).' },
  err: {
    required: 'Please fill in all required fields', pdpa: 'Please accept the PDPA consent', permission: 'You do not have permission to view this page',
    tooMany: 'Up to {n} photos', image: 'Could not process this image'
  }
}
