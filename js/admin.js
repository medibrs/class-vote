// ============================================
// Admin Page Logic
// ============================================

/**
 * Initialize the admin page
 */
async function initAdminPage() {
  const session = await requireAdmin();
  if (!session) return;

  await populateNavbar();

  // Show admin nav link
  const adminLink = document.getElementById('nav-admin');
  if (adminLink) adminLink.parentElement.style.display = '';

  await loadAllUsers();
}

/**
 * Load all users and split into admins vs regular users
 */
async function loadAllUsers() {
  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load users:', error);
    return;
  }

  const admins = [];
  const users = [];

  (data || []).forEach(profile => {
    if (isAdmin(profile.email)) {
      admins.push(profile);
    } else {
      users.push(profile);
    }
  });

  renderAdminList(admins);
  renderUserList(users);
}

/**
 * Render the admins list
 */
function renderAdminList(admins) {
  const list = document.getElementById('admin-list');
  const count = document.getElementById('admin-count');
  if (!list) return;

  if (count) count.textContent = admins.length;

  if (admins.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👑</div>
        <h3>No admins registered yet</h3>
      </div>
    `;
    return;
  }

  list.innerHTML = admins.map(p => renderUserCard(p, true)).join('');
}

/**
 * Render the regular users list
 */
function renderUserList(users) {
  const list = document.getElementById('user-list');
  const count = document.getElementById('user-count');
  if (!list) return;

  if (count) count.textContent = users.length;

  if (users.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <h3>No users registered yet</h3>
        <p>Share the link with your classmates!</p>
      </div>
    `;
    return;
  }

  list.innerHTML = users.map(p => renderUserCard(p, false)).join('');
}

/**
 * Render a single user card
 */
function renderUserCard(profile, isAdminUser) {
  const avatar = (profile.avatar_url) ? profile.avatar_url : DEFAULT_AVATAR;
  const name = profile.display_name || profile.email.split('@')[0];
  const joinDate = new Date(profile.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  const badge = isAdminUser ? '<span class="admin-badge">👑 Admin</span>' : '';

  return `
    <div class="admin-user-card">
      <img class="admin-user-avatar" src="${avatar}" alt="${name}" onerror="this.src='${DEFAULT_AVATAR}'">
      <div class="admin-user-info">
        <div class="admin-user-name">${name} ${badge}</div>
        <div class="admin-user-email">${profile.email}</div>
      </div>
      <div class="admin-user-joined">
        Joined ${joinDate}
      </div>
    </div>
  `;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initAdminPage);
