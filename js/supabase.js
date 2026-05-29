// ============================================
// Supabase Client Initialization
// ============================================
// ⚠️  REPLACE these with your actual Supabase credentials
//     (Dashboard → Settings → API)
// ============================================

const SUPABASE_URL = 'https://ozbrgtxjyybxxdjxucez.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96YnJndHhqeXlieHhkanh1Y2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNTA5MDQsImV4cCI6MjA5NTYyNjkwNH0.mUQTpSKdPVc5hmYrxBF2U9P0VAtPY9RWn0in2nQTKKs';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Allowed email domain
const ALLOWED_DOMAIN = 'gritlab.ax';

// Voting categories
const CATEGORIES = [
  { id: 'most_social',       emoji: '🤝', name: 'Most Social',       color: '#f472b6' },
  { id: 'most_helpful',      emoji: '🌟', name: 'Most Helpful',      color: '#fbbf24' },
  { id: 'most_resourceful',  emoji: '🔍', name: 'Most Resourceful',  color: '#34d399' },
  { id: 'most_sporty',       emoji: '🏃‍♂️', name: 'Most Sporty',       color: '#f87171' },
  { id: 'most_collaborator', emoji: '🤗', name: 'Most Collaborator', color: '#60a5fa' },
  { id: 'most_inspiring',    emoji: '✨', name: 'Most Inspiring',    color: '#a78bfa' },
  { id: 'most_entertainer',  emoji: '🎭', name: 'Most Entertainer',  color: '#fb923c' },
  { id: 'most_zen',          emoji: '🧘', name: 'Most Zen',          color: '#2dd4bf' },
  { id: 'most_grit',         emoji: '💪', name: 'Most Grit',         color: '#e879f9' },
  { id: 'most_coder',        emoji: '💻', name: 'Most Coder',        color: '#38bdf8' },
];

// Default avatar path
const DEFAULT_AVATAR = './assets/default-avatar.svg';

// Voting deadline: June 2, 2026 at 23:59 Finland time (EEST = UTC+3)
const VOTE_DEADLINE = new Date('2026-06-02T23:59:00+03:00');

/**
 * Check if voting is still open
 */
function isVotingOpen() {
  return new Date() < VOTE_DEADLINE;
}

/**
 * Get time remaining until deadline as a formatted string
 */
function getTimeRemaining() {
  const now = new Date();
  const diff = VOTE_DEADLINE - now;

  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}
