// ============================================
// Authentication — Google OAuth via Supabase
// Restricted to @gritlab.ax emails only
// ============================================

/**
 * Sign in with Google OAuth
 */
async function signInWithGoogle() {
  if (SITE_LOCKED) {
    showLoginError('🔒 The site is currently under maintenance. Please come back later!');
    return;
  }

  const { data, error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/app',
      queryParams: {
        hd: 'gritlab.ax',
        prompt: 'select_account',
      },
    },
  });

  if (error) {
    console.error('Auth error:', error);
    showLoginError('Failed to start sign-in. Please try again.');
  }
}

/**
 * Sign out the current user
 */
async function signOut() {
  await _supabase.auth.signOut();
  window.location.href = '/';
}

/**
 * Get the current authenticated session
 * Returns null if not authenticated
 */
async function getSession() {
  const { data: { session }, error } = await _supabase.auth.getSession();
  if (error) {
    console.error('Session error:', error);
    return null;
  }
  return session;
}

/**
 * Get the current user's profile from the profiles table
 */
async function getCurrentProfile() {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error('Profile fetch error:', error);
    return null;
  }

  return data;
}

/**
 * Validate email domain is @gritlab.ax
 */
function isAllowedEmail(email) {
  if (!email) return false;
  return email.toLowerCase().endsWith('@' + ALLOWED_DOMAIN);
}

/**
 * Show login error message
 */
function showLoginError(message) {
  const errorEl = document.getElementById('login-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('show');
  }
}

/**
 * Auth guard for protected pages
 * Call this on page load for app.html, profile.html, results.html
 */
async function requireAuth() {
  if (SITE_LOCKED) {
    window.location.href = '/';
    return null;
  }

  const session = await getSession();

  if (!session) {
    window.location.href = '/';
    return null;
  }

  // Verify email domain
  const email = session.user.email;
  if (!isAllowedEmail(email)) {
    await _supabase.auth.signOut();
    window.location.href = '/?error=domain';
    return null;
  }

  return session;
}

/**
 * Initialize auth state listener
 * Call this on the login page to handle redirects after OAuth
 */
function initAuthListener() {
  _supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      // Check email domain
      if (!isAllowedEmail(session.user.email)) {
        await _supabase.auth.signOut();
        showLoginError('Only @gritlab.ax email addresses are allowed.');
        return;
      }
      // Redirect to app
      window.location.href = '/app';
    }
  });
}

/**
 * Get avatar URL with fallback to default
 */
function getAvatarUrl(profile) {
  if (profile && profile.avatar_url) {
    return profile.avatar_url;
  }
  return DEFAULT_AVATAR;
}

/**
 * Check if an email is an admin
 */
function isAdmin(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Auth guard for admin-only pages (results)
 */
async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;

  if (!isAdmin(session.user.email)) {
    window.location.href = '/app';
    return null;
  }

  return session;
}

/**
 * Populate the navbar with user info
 * Hides the Results link for non-admin users
 */
async function populateNavbar() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const avatarEl = document.getElementById('navbar-avatar');
  const nameEl = document.getElementById('navbar-username');

  if (avatarEl) {
    avatarEl.src = getAvatarUrl(profile);
    avatarEl.alt = profile.display_name || 'User';
  }

  if (nameEl) {
    nameEl.textContent = profile.display_name || profile.email.split('@')[0];
  }

  // Hide/Show Results and Admin links based on role
  const isAdminUser = isAdmin(profile.email);

  const resultsLink = document.getElementById('nav-results');
  if (resultsLink) {
    resultsLink.parentElement.style.display = isAdminUser ? '' : 'none';
  }

  const adminLink = document.getElementById('nav-admin');
  if (adminLink) {
    adminLink.parentElement.style.display = isAdminUser ? '' : 'none';
  }
}
