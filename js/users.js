// ============================================
// Users Page Logic
// ============================================

/**
 * Initialize the users page
 */
async function initUsersPage() {
  const session = await requireAdmin();
  if (!session) return;

  await populateNavbar();
  await loadClassmates();
}

/**
 * Load and display registered users (classmates)
 */
async function loadClassmates() {
  const list = document.getElementById('user-list');
  const count = document.getElementById('user-count');
  if (!list) return;

  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load users:', error);
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <h3>Failed to load classmates</h3>
        <p>Please try refreshing the page.</p>
      </div>
    `;
    return;
  }

  // Filter out admins to get only regular users
  const classmates = (data || []).filter(profile => !isAdmin(profile.email));

  if (count) count.textContent = classmates.length;

  if (classmates.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <h3>No users registered yet</h3>
        <p>Share the link with your classmates!</p>
      </div>
    `;
    return;
  }

  list.innerHTML = classmates.map(p => renderUserCard(p)).join('');
}

/**
 * Render a single user card
 */
function renderUserCard(profile) {
  const avatar = (profile.avatar_url) ? profile.avatar_url : DEFAULT_AVATAR;
  const name = profile.display_name || profile.email.split('@')[0];
  const joinDate = new Date(profile.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  return `
    <div class="admin-user-card">
      <img class="admin-user-avatar" src="${avatar}" alt="${name}" onerror="this.src='${DEFAULT_AVATAR}'">
      <div class="admin-user-info">
        <div class="admin-user-name">${name}</div>
        <div class="admin-user-email">${profile.email}</div>
      </div>
      <div class="admin-user-joined">
        Joined ${joinDate}
      </div>
    </div>
  `;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initUsersPage);
