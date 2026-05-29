// ============================================
// Results Page Logic
// ============================================

/**
 * Initialize the results page
 */
async function initResultsPage() {
  const session = await requireAdmin();
  if (!session) return;

  await populateNavbar();
  await loadResults();
}

/**
 * Load and display voting results
 */
async function loadResults() {
  const grid = document.getElementById('results-grid');
  if (!grid) return;

  // Show loading state
  grid.innerHTML = `
    <div class="loading-container" style="grid-column: 1 / -1;">
      <div>
        <div class="spinner"></div>
        <div class="loading-text">Loading results...</div>
      </div>
    </div>
  `;

  // Fetch all votes with nominee profiles
  const { data: votes, error } = await _supabase
    .from('votes')
    .select(`
      category,
      nominee_id,
      profiles!votes_nominee_id_fkey (
        id,
        display_name,
        avatar_url,
        email
      )
    `);

  if (error) {
    console.error('Results fetch error:', error);
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">❌</div>
        <h3>Failed to load results</h3>
        <p>Please try refreshing the page.</p>
      </div>
    `;
    return;
  }

  // Fetch total voter count for stats
  const { count: totalVoters } = await _supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  // Update stats
  const totalVotersEl = document.getElementById('stat-total-voters');
  const totalVotesEl = document.getElementById('stat-total-votes');
  if (totalVotersEl) totalVotersEl.textContent = totalVoters || 0;
  if (totalVotesEl) totalVotesEl.textContent = votes ? votes.length : 0;

  // Aggregate votes by category
  const resultsByCategory = {};

  CATEGORIES.forEach(cat => {
    resultsByCategory[cat.id] = {};
  });

  if (votes) {
    votes.forEach(vote => {
      const cat = vote.category;
      const nominee = vote.profiles;
      if (!nominee || !resultsByCategory[cat]) return;

      const nId = nominee.id;
      if (!resultsByCategory[cat][nId]) {
        resultsByCategory[cat][nId] = {
          id: nId,
          name: nominee.display_name || nominee.email.split('@')[0],
          avatar: getAvatarUrl(nominee),
          email: nominee.email,
          count: 0,
        };
      }
      resultsByCategory[cat][nId].count++;
    });
  }

  // Render results
  grid.innerHTML = CATEGORIES.map((cat, catIndex) => {
    const nominees = Object.values(resultsByCategory[cat.id])
      .sort((a, b) => b.count - a.count);

    const maxVotes = nominees.length > 0 ? nominees[0].count : 0;

    let bodyHtml;
    if (nominees.length === 0) {
      bodyHtml = `<div class="result-empty">No votes yet</div>`;
    } else {
      bodyHtml = nominees.slice(0, 5).map((n, i) => {
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'other';
        const medals = ['👑', '🥈', '🥉'];
        const rankLabel = i < 3 ? medals[i] : (i + 1);
        const barWidth = maxVotes > 0 ? (n.count / maxVotes) * 100 : 0;

        return `
          <div class="result-item" style="animation: countUp 0.5s ease ${0.1 * (i + 1)}s both;">
            <div class="result-rank ${rankClass}">${rankLabel}</div>
            <img class="result-avatar" src="${n.avatar}" alt="${n.name}" onerror="this.src='${DEFAULT_AVATAR}'">
            <div class="result-info">
              <div class="result-name">${n.name}</div>
              <div class="result-bar-container">
                <div class="result-bar" style="width: 0;" data-width="${barWidth}"></div>
              </div>
            </div>
            <div class="result-votes">${n.count}</div>
          </div>
        `;
      }).join('');
    }

    return `
      <div class="glass-card result-card" style="animation-delay: ${catIndex * 0.05}s; --card-color: ${cat.color};">
        <div class="result-card-header">
          <span class="result-emoji">${cat.emoji}</span>
          <h3>${cat.name}</h3>
        </div>
        ${bodyHtml}
      </div>
    `;
  }).join('');

  // Animate bars after render
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.result-bar').forEach(bar => {
        const width = bar.getAttribute('data-width');
        bar.style.width = width + '%';
      });
    }, 300);
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initResultsPage);
