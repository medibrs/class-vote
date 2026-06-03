// ============================================
// Results Page Logic (Frozen Static Snapshot)
// ============================================

const DEFAULT_AVATAR = './assets/default-avatar.svg';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function av(url) { return url || DEFAULT_AVATAR; }

function toggleDetail(id, header) {
  const body = document.getElementById(id);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  const arrow = header.querySelector('.detail-toggle');
  if (arrow) arrow.style.transform = isOpen ? 'rotate(180deg)' : '';
}

/**
 * Initialize the results page
 */
async function initResultsPage() {
  // Allow all authenticated classmates to access this page
  const session = await requireAuth();
  if (!session) return;

  await populateNavbar();
  
  // Get current user profile to check admin status
  const profile = await getCurrentProfile();
  await loadResults(profile);
}

/**
 * Load and display voting results from data.js / data.json
 */
async function loadResults(currentProfile) {
  const container = document.getElementById('results-container');
  if (!container) return;

  // 1. Get the data
  let data;
  if (window.VOTING_DATA) {
    data = window.VOTING_DATA;
  } else {
    try {
      const res = await fetch('./local/data.json');
      data = await res.json();
    } catch (e) {
      container.innerHTML = `
        <div class="glass-card" style="text-align: center; padding: 3rem; color: var(--color-error);">
          <h3>❌ Failed to load results data</h3>
          <p>The voting data has not been exported yet. Please run <code>node local/export_data.js</code> and deploy the updates.</p>
        </div>`;
      return;
    }
  }

  const { profiles, votes, exportedAt } = data;
  const isAdminUser = currentProfile && isAdmin(currentProfile.email);

  // Update export time subtitle
  const subEl = document.querySelector('.page-header p');
  if (subEl) {
    subEl.innerHTML = `Grit:lab Class Vote 2026 — Frozen snapshot<br><small style="opacity: 0.7;">Data exported: ${new Date(exportedAt).toLocaleString()}</small>`;
  }

  // Index profiles
  const profileMap = {};
  profiles.forEach(p => profileMap[p.id] = p);

  // Non-admin classmates
  const classmates = profiles.filter(p => !ADMIN_EMAILS.includes(p.email));

  // ── Summary Metrics ─────────────────────────────────
  const voterIds    = new Set(votes.map(v => v.voter_id));
  const voterCount  = voterIds.size;
  const totalVotes  = votes.length;
  const totalPeople = classmates.length;
  const notVotedYet = classmates.filter(p => !voterIds.has(p.id));
  const participation = totalPeople > 0
    ? Math.round((voterCount / totalPeople) * 100) : 0;

  // Update stats bar if exists in root HTML
  const totalVotersEl = document.getElementById('stat-total-voters');
  const totalVotesEl = document.getElementById('stat-total-votes');
  if (totalVotersEl) totalVotersEl.textContent = totalPeople;
  if (totalVotesEl) totalVotesEl.textContent = totalVotes;

  // ── Rankings per category ───────────────────────────
  const catTotals = {};
  CATEGORIES.forEach(c => catTotals[c.id] = {});
  votes.forEach(v => {
    if (!catTotals[v.category]) return;
    catTotals[v.category][v.nominee_id] =
      (catTotals[v.category][v.nominee_id] || 0) + 1;
  });

  // ── Per-voter progress ──────────────────────────────
  const voterProgress = {};
  votes.forEach(v => {
    if (!voterProgress[v.voter_id]) voterProgress[v.voter_id] = new Set();
    voterProgress[v.voter_id].add(v.category);
  });

  // ── Per-voter full vote details ─────────────────────
  const voterDetails = {};
  votes.forEach(v => {
    if (!voterDetails[v.voter_id]) voterDetails[v.voter_id] = {};
    voterDetails[v.voter_id][v.category] = {
      nominee: profileMap[v.nominee_id],
      motivation: v.motivation || null,
    };
  });

  // ── Global Leaderboard ──────────────────────────────
  const globalTotals = {};
  const globalBreakdowns = {};
  votes.forEach(v => {
    globalTotals[v.nominee_id] = (globalTotals[v.nominee_id] || 0) + 1;
    if (!globalBreakdowns[v.nominee_id]) globalBreakdowns[v.nominee_id] = {};
    globalBreakdowns[v.nominee_id][v.category] = (globalBreakdowns[v.nominee_id][v.category] || 0) + 1;
  });

  const getBreakdownBadges = (nid) => {
    const bd = globalBreakdowns[nid];
    if (!bd) return '';
    return Object.entries(bd)
      .sort((a, b) => b[1] - a[1])
      .map(([catId, count]) => {
        const cat = CATEGORIES.find(c => c.id === catId);
        if (!cat) return '';
        return `<span class="cat-mini-badge" title="${cat.name}: ${count} vote${count !== 1 ? 's' : ''}">
          ${cat.emoji}<span class="count">${count}</span>
        </span>`;
      })
      .join('');
  };

  const globalRanked = classmates
    .map(p => ({ profile: p, votes: globalTotals[p.id] || 0 }))
    .sort((a, b) => b.votes - a.votes);

  // Helper for podium — with full tie support
  function buildPodium() {
    if (globalRanked.length === 0 || globalRanked[0].votes === 0) {
      return `<div class="overall-section" style="text-align:center; padding: 2rem; color: var(--color-text-muted)">
        🏆 No votes have been cast yet.
      </div>`;
    }

    // Assign tie-aware ranks
    let currentRank = 1;
    const ranked = globalRanked.map((item, i) => {
      if (i > 0 && item.votes < globalRanked[i-1].votes) currentRank = i + 1;
      return { ...item, rank: item.votes > 0 ? currentRank : null };
    });

    const podiumEntries = ranked.filter(r => r.rank && r.rank <= 3);
    const rest = ranked.filter(r => r.rank && r.rank > 3);

    const styleMap = {
      1: { cls: 'first',  badge: '1' },
      2: { cls: 'second', badge: '2' },
      3: { cls: 'third',  badge: '3' },
    };

    const podiumSteps = podiumEntries.map(item => {
      const p = item.profile;
      const name = p.display_name || p.email.split('@')[0];
      const s = styleMap[item.rank];
      return `
      <div class="podium-step ${s.cls}">
        <div class="podium-badge">${s.badge}</div>
        <img class="podium-avatar" src="${av(p.avatar_url)}" onerror="this.src='${DEFAULT_AVATAR}'" alt="${esc(name)}">
        <div class="podium-name" title="${esc(name)}">${esc(name)}</div>
        <div class="podium-votes">${item.votes}</div>
        <div class="podium-label">Total Votes</div>
        <div class="cat-mini-badges">${getBreakdownBadges(p.id)}</div>
      </div>`;
    }).join('');

    const restRows = rest.map(item => {
      const p = item.profile;
      const name = p.display_name || p.email.split('@')[0];
      return `
      <div class="overall-item">
        <span class="overall-rank">#${item.rank}</span>
        <img class="overall-avatar" src="${av(p.avatar_url)}" onerror="this.src='${DEFAULT_AVATAR}'" alt="${esc(name)}">
        <div style="flex:1;display:flex;align-items:center;flex-wrap:wrap;gap:0.5rem;text-align:left;">
          <span class="overall-name">${esc(name)}</span>
          <div class="cat-mini-badges" style="margin:0;">${getBreakdownBadges(p.id)}</div>
        </div>
        <span class="overall-votes-pill">${item.votes} vote${item.votes !== 1 ? 's' : ''}</span>
      </div>`;
    }).join('');

    return `
    <div class="overall-section">
      <div class="podium-container">${podiumSteps}</div>
      ${restRows ? `
        <div style="margin:1.5rem 0 0.8rem;font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-muted);text-align:center;">
          Remaining Standings
        </div>
        <div class="overall-list">${restRows}</div>
      ` : ''}
    </div>`;
  }

  // Assemble HTML
  let html = `
    <!-- 1. Summary bar -->
    <div class="summary-bar">
      <div class="stat-pill">
        <div class="val purple">${totalVotes}</div>
        <div class="lbl">Total Votes Cast</div>
      </div>
      <div class="stat-pill">
        <div class="val green">${voterCount}</div>
        <div class="lbl">People Who Voted</div>
      </div>
      <div class="stat-pill">
        <div class="val red">${notVotedYet.length}</div>
        <div class="lbl">Haven't Voted Yet</div>
      </div>
      <div class="stat-pill">
        <div class="val gold">${participation}%</div>
        <div class="lbl">Participation</div>
      </div>
      <div class="stat-pill">
        <div class="val purple">${CATEGORIES.length}</div>
        <div class="lbl">Categories</div>
      </div>
    </div>

    <!-- 2. Current Leaders -->
    <div class="section-title">👑 Category Spotlight (Winners)</div>
    <div class="spotlight-grid">
      ${CATEGORIES.map(cat => {
        const entries = Object.entries(catTotals[cat.id])
          .sort((a,b) => b[1]-a[1]);
        if (!entries.length) {
          return `<div class="spotlight-card">
            <div class="spotlight-cat">${cat.emoji} ${cat.name}</div>
            <div class="no-votes">No votes yet</div>
          </div>`;
        }
        const topVotes = entries[0][1];
        const winners = entries.filter(e => e[1] === topVotes);
        const winnersHtml = winners.map(([wId]) => {
          const w = profileMap[wId];
          const wName = w ? (w.display_name || w.email.split('@')[0]) : 'Unknown';
          return `<div class="spotlight-winner">
            <img class="spotlight-avatar" src="${av(w?.avatar_url)}"
              onerror="this.src='${DEFAULT_AVATAR}'" alt="${esc(wName)}">
            <div>
              <div class="spotlight-name">${esc(wName)}</div>
            </div>
          </div>`;
        }).join('');
        return `<div class="spotlight-card">
          <div class="spotlight-cat">${cat.emoji} ${cat.name}</div>
          ${winnersHtml}
          <div class="spotlight-votes">${topVotes} vote${topVotes !== 1 ? 's' : ''}${winners.length > 1 ? ' · 🔥 ' + winners.length + '-way tie' : ''}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- 3. Full Rankings -->
    <div class="section-title">📊 Full Rankings — All Categories</div>
    <div class="rankings-grid">
      ${CATEGORIES.map(cat => {
        const entries = Object.entries(catTotals[cat.id])
          .sort((a,b) => b[1]-a[1]);
        const maxV = entries.length > 0 ? entries[0][1] : 1;
        const medals = ['🥇','🥈','🥉'];
        let currentRank = 1;
        const ranks = entries.map(([nid, cnt], i) => {
          if (i > 0 && cnt < entries[i-1][1]) currentRank = i + 1;
          return currentRank;
        });
        const rows = entries.length === 0
          ? `<div class="empty-row">No votes yet</div>`
          : entries.map(([nid, cnt], i) => {
              const p = profileMap[nid];
              const name = p ? (p.display_name || p.email.split('@')[0]) : 'Unknown';
              const bar = Math.round((cnt / maxV) * 100);
              const rank = ranks[i];
              return `<div class="rank-row">
                ${rank <= 3
                  ? `<span class="rank-medal">${medals[rank-1]}</span>`
                  : `<span class="rank-num">${rank}</span>`}
                <img class="rank-avatar" src="${av(p?.avatar_url)}"
                  onerror="this.src='${DEFAULT_AVATAR}'" alt="${esc(name)}">
                <span class="rank-name" title="${esc(p?.email || '')}">${esc(name)}</span>
                <div class="rank-bar-wrap">
                  <div class="rank-bar" style="width:${bar}%"></div>
                </div>
                <span class="rank-votes">${cnt}</span>
              </div>`;
            }).join('');
        return `<div class="rank-card">
          <div class="rank-card-header">${cat.emoji} ${cat.name}</div>
          ${rows}
        </div>`;
      }).join('')}
    </div>

    <!-- 4. Voter Status -->
    <div class="section-title">👥 Voter Status — All Classmates</div>
    <table class="voter-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>Categories voted (${CATEGORIES.length} total)</th>
        </tr>
      </thead>
      <tbody>
        ${classmates.map(p => {
          const voted = voterProgress[p.id];
          const count = voted ? voted.size : 0;
          const hasVoted = count > 0;
          const isComplete = count === CATEGORIES.length;
          const dots = CATEGORIES.map(cat => {
            const done = voted && voted.has(cat.id);
            return `<div class="mini-dot ${done ? 'filled' : ''}"
              data-cat="${cat.emoji} ${cat.name}" title="${cat.emoji} ${cat.name}"></div>`;
          }).join('');
          return `<tr>
            <td>
              <div class="voter-info">
                <img class="voter-avatar" src="${av(p.avatar_url)}"
                  onerror="this.src='${DEFAULT_AVATAR}'" alt="${esc(p.display_name)}">
                <span>${esc(p.display_name || p.email.split('@')[0])}</span>
              </div>
            </td>
            <td>
              <span class="badge ${isComplete ? 'complete' : hasVoted ? 'voted' : 'not-yet'}">
                ${isComplete ? '✅ Complete' : hasVoted ? '🕐 Partial' : '⏳ Not yet'}
              </span>
            </td>
            <td class="progress-cell">
              <div class="mini-progress">
                ${dots}
                <span class="voter-count-label">${count}/${CATEGORIES.length}</span>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <!-- 5. Haven't voted -->
    ${notVotedYet.length > 0 ? `
    <div class="section-title">⏳ Haven't Voted Yet (${notVotedYet.length})</div>
    <div style="display:flex;flex-wrap:wrap;gap:0.6rem;margin-bottom:2rem">
      ${notVotedYet.map(p => `
        <div style="display:flex;align-items:center;gap:0.5rem;background:var(--color-bg-card);border:1px solid var(--color-border);
          border-radius:99px;padding:0.35rem 0.75rem 0.35rem 0.35rem;font-size:0.82rem;">
          <img src="${av(p.avatar_url)}" onerror="this.src='${DEFAULT_AVATAR}'"
            style="width:24px;height:24px;border-radius:50%;object-fit:cover;">
          ${esc(p.display_name || p.email.split('@')[0])}
        </div>`).join('')}
    </div>` : `
    <div class="section-title" style="color:var(--color-success)">🎉 Everyone has voted!</div>`}

    <!-- 6. Individual vote details (SECURED: Only visible to admins) -->
    ${isAdminUser ? `
    <div class="section-title">🔒 Individual Vote Details — Who Voted for Who (Admin Only)</div>
    <div class="detail-grid">
      ${classmates.map((p, pi) => {
        const details = voterDetails[p.id] || {};
        const votedCount = Object.keys(details).length;
        const hasVoted = votedCount > 0;
        const name = p.display_name || p.email.split('@')[0];
        const rows = CATEGORIES.map(cat => {
          const v = details[cat.id];
          if (!v) {
            return `<div class="detail-vote-row">
              <span class="detail-cat-emoji">${cat.emoji}</span>
              <span class="detail-cat-name">${cat.name}</span>
              <span class="detail-no-vote">— not voted yet</span>
            </div>`;
          }
          const nName = v.nominee ? (v.nominee.display_name || v.nominee.email.split('@')[0]) : 'Unknown';
          return `<div class="detail-vote-row">
            <span class="detail-cat-emoji">${cat.emoji}</span>
            <span class="detail-cat-name">${cat.name}</span>
            <span class="detail-nominee">
              <img class="detail-nominee-avatar" src="${av(v.nominee?.avatar_url)}"
                onerror="this.src='${DEFAULT_AVATAR}'">
              <span>
                <span class="detail-nominee-name">${esc(nName)}</span>
                ${v.motivation ? `<span class="detail-motivation">💬 "${esc(v.motivation)}"</span>` : ''}
              </span>
            </span>
          </div>`;
        }).join('');
        return `<div class="detail-card ${!hasVoted ? 'not-voted-card' : ''}">
          <div class="detail-header" onclick="toggleDetail('detail-${pi}', this)">
            <img class="detail-header-avatar" src="${av(p.avatar_url)}"
              onerror="this.src='${DEFAULT_AVATAR}'">
            <span class="detail-header-name">${esc(name)}</span>
            <span class="detail-header-count">${votedCount}/${CATEGORIES.length} votes</span>
            <span class="detail-toggle">▼</span>
          </div>
          <div class="detail-body" id="detail-${pi}">
            ${rows}
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- 7. Overall Leaderboard (LAST) -->
    <div class="section-title">🏆 Overall Leaderboard — All Categories Combined</div>
    ${buildPodium()}
  `;

  container.innerHTML = html;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initResultsPage);
