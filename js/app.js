// ============================================
// Voting Page Logic
// ============================================

let allProfiles = [];
let currentVotes = {};  // { category_id: { nominee_id, nominee_name, nominee_avatar } }
let currentUserId = null;
let activeCategory = null;

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

  // Update countdown every minute
  setInterval(() => {
    updateDeadlineDisplay();
    if (!isVotingOpen()) {
      renderCategoryCards(); // Re-render to disable cards
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
 * Load current user's existing votes
 */
async function loadMyVotes() {
  const { data, error } = await _supabase
    .from('votes')
    .select(`
      category,
      nominee_id,
      profiles!votes_nominee_id_fkey (
        id,
        display_name,
        avatar_url
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
      currentVotes[vote.category] = {
        nominee_id: vote.nominee_id,
        nominee_name: nominee ? nominee.display_name : 'Unknown',
        nominee_avatar: nominee ? getAvatarUrl(nominee) : DEFAULT_AVATAR,
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
    const votedHtml = vote ? `
      <div class="voted-for">
        <img class="voted-for-avatar" src="${vote.nominee_avatar}" alt="${vote.nominee_name}" onerror="this.src='${DEFAULT_AVATAR}'">
        <span class="voted-for-name">${vote.nominee_name}</span>
      </div>
    ` : '';

    const votingOpen = isVotingOpen();
    let statusHtml;
    if (!votingOpen) {
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
 * Open the voting modal for a category
 */
function openVoteModal(categoryId) {
  activeCategory = CATEGORIES.find(c => c.id === categoryId);
  if (!activeCategory) return;

  const overlay = document.getElementById('vote-modal');
  const title = document.getElementById('modal-category-title');
  const searchInput = document.getElementById('modal-search-input');

  if (title) {
    title.innerHTML = `${activeCategory.emoji} ${activeCategory.name}`;
  }

  renderNomineeList('');

  overlay.classList.add('active');
  if (searchInput) {
    searchInput.value = '';
    setTimeout(() => searchInput.focus(), 300);
  }
}

/**
 * Close the voting modal
 */
function closeVoteModal() {
  const overlay = document.getElementById('vote-modal');
  overlay.classList.remove('active');
  activeCategory = null;
}

/**
 * Render nominee list in modal (filtered by search)
 */
function renderNomineeList(searchTerm) {
  const list = document.getElementById('nominee-list');
  if (!list) return;

  const term = searchTerm.toLowerCase().trim();

  // Filter out current user and apply search
  const nominees = allProfiles.filter(p => {
    if (p.id === currentUserId) return false; // Can't vote for self
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
      <div class="nominee-item ${isSelected ? 'selected' : ''}" onclick="castVote('${p.id}')" id="nominee-${p.id}">
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
 * Cast or update a vote
 */
async function castVote(nomineeId) {
  if (!activeCategory) return;

  // Check deadline
  if (!isVotingOpen()) {
    showToast('Voting has closed! Deadline was June 2, 23:59 Finland time.', 'error');
    closeVoteModal();
    return;
  }

  const categoryId = activeCategory.id;

  // Upsert: insert or update if exists
  const { error } = await _supabase
    .from('votes')
    .upsert(
      {
        voter_id: currentUserId,
        nominee_id: nomineeId,
        category: categoryId,
      },
      {
        onConflict: 'voter_id,category',
      }
    );

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
  const nominee = allProfiles.find(p => p.id === nomineeId);
  currentVotes[categoryId] = {
    nominee_id: nomineeId,
    nominee_name: nominee ? nominee.display_name : 'Unknown',
    nominee_avatar: nominee ? getAvatarUrl(nominee) : DEFAULT_AVATAR,
  };

  showToast(`Voted for ${currentVotes[categoryId].nominee_name}!`, 'success');

  // Refresh UI
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

  if (isVotingOpen()) {
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
