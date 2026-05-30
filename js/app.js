// ============================================
// Voting Page Logic (with Motivations)
// ============================================

let allProfiles = [];
let currentVotes = {};  // { category_id: { nominee_id, nominee_name, nominee_avatar, motivation_id, motivation_text } }
let currentUserId = null;
let activeCategory = null;
let selectedNomineeId = null;
let selectedMotivationId = null;

/**
 * Initialize the voting page
 */
async function initVotingPage() {
  const session = await requireAuth();
  if (!session) return;

  currentUserId = session.user.id;

  await populateNavbar();
  await loadProfiles();
  await loadMyVotes();
  renderCategoryCards();
  updateStats();
  updateDeadlineDisplay();

  // Character counter for motivation textarea
  const motivationInput = document.getElementById('motivation-input');
  if (motivationInput) {
    motivationInput.addEventListener('input', () => {
      document.getElementById('motivation-char-count').textContent = motivationInput.value.length;
      // Deselect any selected chip when typing
      if (motivationInput.value.trim()) {
        selectedMotivationId = null;
        document.querySelectorAll('.motivation-chip.selected').forEach(el => el.classList.remove('selected'));
      }
    });
  }

  // Update countdown every minute
  setInterval(() => {
    updateDeadlineDisplay();
    if (!isVotingOpen()) {
      renderCategoryCards();
    }
  }, 60000);
}

/**
 * Load all classmate profiles
 */
async function loadProfiles() {
  const { data, error } = await _supabase
    .from('profiles')
    .select('*')
    .order('display_name');

  if (error) {
    console.error('Failed to load profiles:', error);
    showToast('Failed to load classmates', 'error');
    return;
  }

  allProfiles = data || [];
}

/**
 * Load current user's existing votes (with motivation info)
 */
async function loadMyVotes() {
  const { data, error } = await _supabase
    .from('votes')
    .select(`
      category,
      nominee_id,
      motivation_id,
      profiles!votes_nominee_id_fkey (
        id,
        display_name,
        avatar_url
      ),
      motivations (
        id,
        message
      )
    `)
    .eq('voter_id', currentUserId);

  if (error) {
    console.error('Failed to load votes:', error);
    return;
  }

  currentVotes = {};
  if (data) {
    data.forEach(vote => {
      const nominee = vote.profiles;
      const motivation = vote.motivations;
      currentVotes[vote.category] = {
        nominee_id: vote.nominee_id,
        nominee_name: nominee ? nominee.display_name : 'Unknown',
        nominee_avatar: nominee ? getAvatarUrl(nominee) : DEFAULT_AVATAR,
        motivation_id: vote.motivation_id,
        motivation_text: motivation ? motivation.message : null,
      };
    });
  }
}

/**
 * Render the category cards grid
 */
function renderCategoryCards() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;

  grid.innerHTML = CATEGORIES.map(cat => {
    const vote = currentVotes[cat.id];
    let votedHtml = '';
    if (vote) {
      const motivationLine = vote.motivation_text
        ? `<div class="voted-for-motivation">"${vote.motivation_text}"</div>`
        : '';
      votedHtml = `
        <div class="voted-for">
          <img class="voted-for-avatar" src="${vote.nominee_avatar}" alt="${vote.nominee_name}" onerror="this.src='${DEFAULT_AVATAR}'">
          <div>
            <span class="voted-for-name">${vote.nominee_name}</span>
            ${motivationLine}
          </div>
        </div>
      `;
    }

    const votingOpen = isVotingOpen();
    const hasStarted = hasVotingStarted();
    let statusHtml;
    if (!hasStarted) {
      statusHtml = `<span class="category-status">⏰ Not started</span>`;
    } else if (!votingOpen) {
      statusHtml = vote
        ? `<span class="category-status voted">✅ Voted</span>`
        : `<span class="category-status">⏰ Voting closed</span>`;
    } else {
      statusHtml = vote
        ? `<span class="category-status voted">✅ Voted</span>`
        : `<span class="category-status">Tap to vote</span>`;
    }

    const clickHandler = votingOpen ? `onclick="openVoteModal('${cat.id}')"` : '';
    const closedClass = !votingOpen ? 'voting-closed' : '';

    return `
      <div class="category-card ${closedClass}" style="--card-color: ${cat.color}" ${clickHandler} id="card-${cat.id}">
        <span class="category-emoji">${cat.emoji}</span>
        <div class="category-name">${cat.name}</div>
        ${statusHtml}
        ${votedHtml}
      </div>
    `;
  }).join('');
}

/**
 * Open the voting modal for a category (Step 1: pick nominee)
 */
function openVoteModal(categoryId) {
  activeCategory = CATEGORIES.find(c => c.id === categoryId);
  if (!activeCategory) return;

  selectedNomineeId = null;
  selectedMotivationId = null;

  const overlay = document.getElementById('vote-modal');
  const title = document.getElementById('modal-category-title');
  const searchInput = document.getElementById('modal-search-input');

  if (title) {
    title.innerHTML = `${activeCategory.emoji} ${activeCategory.name}`;
  }

  // Show step 1, hide step 2
  showModalStep('nominee');

  renderNomineeList('');

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (searchInput) {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 300);
  }
}

/**
 * Show a specific modal step
 */
function showModalStep(step) {
  const stepNominee = document.getElementById('modal-step-nominee');
  const stepMotivation = document.getElementById('modal-step-motivation');
  const backBtn = document.getElementById('modal-back-btn');

  if (step === 'nominee') {
    stepNominee.style.display = '';
    stepMotivation.style.display = 'none';
    backBtn.style.display = 'none';
  } else {
    stepNominee.style.display = 'none';
    stepMotivation.style.display = '';
    backBtn.style.display = '';
  }
}

/**
 * Go back from motivation step to nominee step
 */
function goBackToNominees() {
  selectedNomineeId = null;
  selectedMotivationId = null;
  showModalStep('nominee');
}

/**
 * Close the voting modal
 */
function closeVoteModal() {
  const overlay = document.getElementById('vote-modal');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
  activeCategory = null;
  selectedNomineeId = null;
  selectedMotivationId = null;
}

/**
 * Render nominee list in modal (filtered by search)
 */
function renderNomineeList(searchTerm) {
  const list = document.getElementById('nominee-list');
  if (!list) return;

  const term = searchTerm.toLowerCase().trim();

  const nominees = allProfiles.filter(p => {
    if (p.id === currentUserId) return false;
    if (term) {
      const name = (p.display_name || '').toLowerCase();
      const email = (p.email || '').toLowerCase();
      return name.includes(term) || email.includes(term);
    }
    return true;
  });

  if (nominees.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding: 2rem;">
        <div class="empty-state-icon">🔍</div>
        <h3>No classmates found</h3>
      </div>
    `;
    return;
  }

  const currentVote = activeCategory ? currentVotes[activeCategory.id] : null;

  list.innerHTML = nominees.map(p => {
    const isSelected = currentVote && currentVote.nominee_id === p.id;
    const avatar = getAvatarUrl(p);
    const name = p.display_name || p.email.split('@')[0];

    return `
      <div class="nominee-item ${isSelected ? 'selected' : ''}" onclick="selectNominee('${p.id}')" id="nominee-${p.id}">
        <img class="nominee-avatar" src="${avatar}" alt="${name}" onerror="this.src='${DEFAULT_AVATAR}'">
        <div class="nominee-info">
          <div class="nominee-name">${name}</div>
          <div class="nominee-email">${p.email}</div>
        </div>
        <div class="nominee-check">${isSelected ? '✓' : ''}</div>
      </div>
    `;
  }).join('');
}

/**
 * Select a nominee → go to motivation step
 */
async function selectNominee(nomineeId) {
  if (!activeCategory) return;

  if (!isVotingOpen()) {
    showToast('Voting has closed!', 'error');
    closeVoteModal();
    return;
  }

  selectedNomineeId = nomineeId;
  selectedMotivationId = null;

  const nominee = allProfiles.find(p => p.id === nomineeId);
  const nomineeName = nominee ? (nominee.display_name || nominee.email.split('@')[0]) : 'Unknown';
  const nomineeAvatar = nominee ? getAvatarUrl(nominee) : DEFAULT_AVATAR;

  // Update motivation header
  const header = document.getElementById('motivation-header');
  header.innerHTML = `
    <img src="${nomineeAvatar}" alt="${nomineeName}" onerror="this.src='${DEFAULT_AVATAR}'">
    <div class="motivation-header-info">
      <div class="motivation-header-name">${nomineeName}</div>
      <div class="motivation-header-label">for ${activeCategory.emoji} ${activeCategory.name}</div>
    </div>
  `;

  // Clear the textarea
  const motivationInput = document.getElementById('motivation-input');
  if (motivationInput) {
    motivationInput.value = '';
    document.getElementById('motivation-char-count').textContent = '0';
  }

  // Show step 2
  showModalStep('motivation');
}

/**
 * Submit vote with a NEW motivation (written in textarea)
 */
async function submitVoteWithNewMotivation() {
  const motivationInput = document.getElementById('motivation-input');
  const message = motivationInput ? motivationInput.value.trim() : '';

  if (!message) {
    // No motivation written — submit without
    await submitVoteWithMotivation(null);
    return;
  }

  // Create the new motivation
  const { data: newMotivation, error } = await _supabase
    .from('motivations')
    .upsert(
      {
        category: activeCategory.id,
        nominee_id: selectedNomineeId,
        message: message,
        created_by: currentUserId,
      },
      { onConflict: 'category,nominee_id,message' }
    )
    .select('id')
    .single();

  if (error) {
    console.error('Motivation create error:', error);
    showToast('Failed to save motivation. Voting without it.', 'error');
    await submitVoteWithMotivation(null);
    return;
  }

  await submitVoteWithMotivation(newMotivation.id, message);
}

/**
 * Submit the vote with an optional motivation_id
 */
async function submitVoteWithMotivation(motivationId, motivationText) {
  if (!activeCategory || !selectedNomineeId) return;

  if (!isVotingOpen()) {
    showToast('Voting has closed!', 'error');
    closeVoteModal();
    return;
  }

  const categoryId = activeCategory.id;

  const voteData = {
    voter_id: currentUserId,
    nominee_id: selectedNomineeId,
    category: categoryId,
    motivation_id: motivationId || null,
  };

  const { error } = await _supabase
    .from('votes')
    .upsert(voteData, { onConflict: 'voter_id,category' });

  if (error) {
    console.error('Vote error:', error);
    if (error.code === '23514') {
      showToast("You can't vote for yourself!", 'error');
    } else {
      showToast('Failed to save vote. Please try again.', 'error');
    }
    return;
  }

  // Update local state
  const nominee = allProfiles.find(p => p.id === selectedNomineeId);

  // If we selected an existing motivation but don't have the text, fetch it
  if (motivationId && !motivationText) {
    const chip = document.querySelector(`#motivation-${motivationId} .motivation-chip-text`);
    motivationText = chip ? chip.textContent : null;
  }

  currentVotes[categoryId] = {
    nominee_id: selectedNomineeId,
    nominee_name: nominee ? nominee.display_name : 'Unknown',
    nominee_avatar: nominee ? getAvatarUrl(nominee) : DEFAULT_AVATAR,
    motivation_id: motivationId,
    motivation_text: motivationText || null,
  };

  showToast(`Voted for ${currentVotes[categoryId].nominee_name}!`, 'success');

  renderCategoryCards();
  updateStats();
  closeVoteModal();
}

/**
 * Update voting stats display
 */
function updateStats() {
  const votedCount = Object.keys(currentVotes).length;
  const totalCount = CATEGORIES.length;

  const votedEl = document.getElementById('stat-voted');
  const remainingEl = document.getElementById('stat-remaining');
  const classEl = document.getElementById('stat-classmates');

  if (votedEl) votedEl.textContent = votedCount;
  if (remainingEl) remainingEl.textContent = totalCount - votedCount;
  if (classEl) classEl.textContent = allProfiles.length;
}

/**
 * Update the deadline countdown display
 */
function updateDeadlineDisplay() {
  const deadlineEl = document.getElementById('deadline-display');
  if (!deadlineEl) return;

  const now = new Date();
  if (now < VOTE_START_TIME) {
    const untilStart = getTimeUntilStart();
    deadlineEl.innerHTML = `⏰ <strong>Starts in ${untilStart || 'under a minute'}</strong> — May 30, 10:00 AM (Finland time)`;
    deadlineEl.className = 'deadline-banner pending';
  } else if (isVotingOpen()) {
    const remaining = getTimeRemaining();
    deadlineEl.innerHTML = `⏰ <strong>${remaining}</strong> — Deadline: June 2, 23:59 (Finland time)`;
    deadlineEl.className = 'deadline-banner open';
  } else {
    deadlineEl.innerHTML = '🔒 <strong>Voting is closed!</strong> Check out the results 🏆';
    deadlineEl.className = 'deadline-banner closed';
  }
}

/**
 * Handle search input in modal
 */
function handleModalSearch(event) {
  renderNomineeList(event.target.value);
}

/**
 * Escape HTML to prevent XSS in motivation text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Toast Notification System ---
function showToast(message, type = 'info') {
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

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    closeVoteModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeVoteModal();
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initVotingPage);
