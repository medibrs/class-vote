// ============================================
// Profile Page Logic
// ============================================

let profileData = null;

/**
 * Initialize the profile page
 */
async function initProfilePage() {
  const session = await requireAuth();
  if (!session) return;

  await populateNavbar();
  await loadProfile(session.user.id);
}

/**
 * Load user profile data into the form
 */
async function loadProfile(userId) {
  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Profile load error:', error);
    showProfileToast('Failed to load profile', 'error');
    return;
  }

  profileData = data;

  // Populate form
  const avatarEl = document.getElementById('profile-avatar');
  const nameInput = document.getElementById('profile-name');
  const emailInput = document.getElementById('profile-email');

  if (avatarEl) {
    avatarEl.src = getAvatarUrl(data);
    avatarEl.onerror = function() { this.src = DEFAULT_AVATAR; };
  }

  if (nameInput) {
    nameInput.value = data.display_name || '';
  }

  if (emailInput) {
    emailInput.value = data.email || '';
  }
}

/**
 * Handle avatar file selection
 */
async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    showProfileToast('Please upload a JPEG, PNG, WebP, or GIF image.', 'error');
    return;
  }

  // Validate file size (900KB max)
  const maxBytes = 900 * 1024;
  if (file.size > maxBytes) {
    showProfileToast('Image must be less than 900KB (900ko).', 'error');
    return;
  }

  const session = await getSession();
  if (!session) return;

  const userId = session.user.id;
  const fileExt = file.name.split('.').pop();
  const filePath = `${userId}/avatar.${fileExt}`;

  // Show loading state
  const avatarEl = document.getElementById('profile-avatar');
  const saveBtn = document.getElementById('profile-save-btn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await _supabase
      .storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      showProfileToast('Failed to upload image. Please try again.', 'error');
      return;
    }

    // Get public URL
    const { data: urlData } = _supabase
      .storage
      .from('avatars')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl + '?t=' + Date.now(); // Cache bust

    // Update profile with new avatar URL
    const { error: updateError } = await _supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (updateError) {
      console.error('Profile update error:', updateError);
      showProfileToast('Image uploaded but failed to update profile.', 'error');
      return;
    }

    // Update UI
    if (avatarEl) avatarEl.src = publicUrl;

    // Update navbar avatar too
    const navAvatar = document.getElementById('navbar-avatar');
    if (navAvatar) navAvatar.src = publicUrl;

    showProfileToast('Profile photo updated!', 'success');

  } catch (err) {
    console.error('Avatar upload failed:', err);
    showProfileToast('Something went wrong. Please try again.', 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

/**
 * Save profile changes (display name)
 */
async function saveProfile() {
  const nameInput = document.getElementById('profile-name');
  const saveBtn = document.getElementById('profile-save-btn');

  if (!nameInput) return;

  const displayName = nameInput.value.trim();

  if (!displayName) {
    showProfileToast('Display name cannot be empty.', 'error');
    return;
  }

  if (displayName.length > 50) {
    showProfileToast('Display name must be 50 characters or less.', 'error');
    return;
  }

  const session = await getSession();
  if (!session) return;

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  const { error } = await _supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', session.user.id);

  if (error) {
    console.error('Save profile error:', error);
    showProfileToast('Failed to save. Please try again.', 'error');
  } else {
    showProfileToast('Profile saved successfully!', 'success');

    // Update navbar
    const navName = document.getElementById('navbar-username');
    if (navName) navName.textContent = displayName;
  }

  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
}

/**
 * Toast for profile page (reuses same pattern)
 */
function showProfileToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initProfilePage);
