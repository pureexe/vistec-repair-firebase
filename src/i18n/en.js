export default {
  app: { name: 'VISTEC Repair', sub: 'Repair request & tracking', org: 'Vidyasirimedhi Institute of Science and Technology' },
  nav: {
    home: 'Home', request: 'Report', track: 'Track', myJobs: 'My jobs', jobs: 'All jobs',
    dashboard: 'Dashboard', admin: 'Admin', master: 'Master data', users: 'Users', qr: 'QR codes',
    profile: 'Profile', login: 'Sign in', logout: 'Sign out', more: 'More'
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
    startRequest: 'Report now', trackTitle: 'Track a job', trackPlaceholder: 'Enter your 8-character tracking code',
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
    setPassword: 'Set a password for this e-mail', unlink: 'Unlink'
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
    gpsMap: 'View on map', successTitle: 'Request submitted', successText: 'Keep this tracking code. We will e-mail you whenever the status changes.',
    jobNo: 'Job no.', trackingCode: 'Tracking code', openTracking: 'Open tracking page', another: 'Report another',
    fromQr: 'From QR code: {name}'
  },
  track: {
    title: 'Track repair', notFound: 'Tracking code not found. Please check and try again.', lookup: 'Check',
    expected: 'Expected completion', expectedUnknown: 'Not set yet — staff will update after assessing the job',
    onHoldTitle: 'This job is on hold', timeline: 'Progress', reported: 'Reported', updated: 'Last update', live: 'Live',
    share: 'Share tracking link'
  },
  event: {
    created: 'Request received', status: 'Status changed to "{to}"', assign: 'Assigned to {to}', expected: 'Expected completion date set',
    hold: 'On hold: {to}', comment: 'Comment', photo: 'Photo added'
  },
  jobs: {
    title: 'Repair jobs', mine: 'My requests', assignedToMe: 'Assigned to me', searchPh: 'Search job no., description, reporter…',
    searchHelp: 'Press Enter to find a job no. / tracking code among all jobs · type to filter the jobs on this page',
    searchResult: '{n} job(s) found', page: 'Page {n} ({size} per page)', files: 'Files from the old system',
    count: '{n} jobs', empty: 'No jobs match', openOnly: 'Open jobs only', reporter: 'Reporter', assignee: 'Assignee',
    unassigned: 'Unassigned', createdAt: 'Reported', location: 'Location', detail: 'Job details', workDetail: 'Work performed',
    photos: 'Photos', addPhoto: 'Add photo', timeline: 'Activity log', addComment: 'Add comment', commentPh: 'Type a message…',
    publicComment: 'Visible to reporter (and e-mailed)', internal: 'Internal', overdue: 'Overdue', gpsLink: 'GPS location',
    newRequest: 'New request'
  },
  actions: {
    title: 'Actions', assign: 'Assign', assignTo: 'Assign to', start: 'Start work', hold: 'Put on hold',
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
    icon: 'Icon (mdi)', chooseBuilding: 'Choose a building to manage its areas'
  },
  users: {
    title: 'Users & roles', invite: 'Invite contractor / staff', inviteHint: 'When the invited person signs in with this e-mail (e-mail link or password) they get the role automatically',
    invites: 'Pending invites', lastLogin: 'Last sign-in', changeRole: 'Change role', filterRole: 'Filter by role'
  },
  qr: {
    title: 'QR codes for reporting', hint: 'Print and post in buildings/rooms. Scanning opens the form with the location pre-selected.',
    wholeBuilding: 'Whole building', scan: 'Scan to report a problem'
  },
  err: {
    required: 'Please fill in all required fields', pdpa: 'Please accept the PDPA consent', permission: 'You do not have permission to view this page',
    tooMany: 'Up to {n} photos', image: 'Could not process this image'
  }
}
