// Handbook Widget Functionality (shared across student/teacher/admin portals)
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('hbSearchInput');
  const clearBtn = document.getElementById('hbClearSearch');
  const tabBtns = document.querySelectorAll('.handbook-tab-btn');
  const panels = document.querySelectorAll('.handbook-panel');
  const noResult = document.getElementById('hbNoResult');
  const searchInfo = document.getElementById('hbSearchInfo');

  if (!tabBtns.length) return; // Walang handbook widget sa page na ito

  // Update counter badges
  function updateCounts() {
    panels.forEach(panel => {
      const cat = panel.dataset.cat;
      const total = panel.querySelectorAll('.handbook-rule-list li').length;
      const countEl = document.getElementById(`hbCount${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
      if (countEl) countEl.textContent = total;
    });
  }
  updateCounts();

  // Tab Switcher inside Handbook
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      panels.forEach(panel => {
        if (panel.dataset.cat === cat) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });

      filterRules();
    });
  });

  // Search Filter Rules Function
  function filterRules() {
    if (!searchInput) return;
    const query = searchInput.value.toLowerCase().trim();
    if (clearBtn) clearBtn.style.display = query.length > 0 ? 'block' : 'none';

    let totalMatches = 0;
    const activeTabBtn = document.querySelector('.handbook-tab-btn.active');
    const activeTab = activeTabBtn ? activeTabBtn.dataset.cat : 'minor';

    panels.forEach(panel => {
      const isCurrentPanel = panel.dataset.cat === activeTab;
      const items = panel.querySelectorAll('.handbook-rule-list li');
      let panelMatches = 0;

      items.forEach(item => {
        const text = item.querySelector('.handbook-rule-text').textContent.toLowerCase();
        if (text.includes(query)) {
          item.style.display = 'flex';
          panelMatches++;
        } else {
          item.style.display = 'none';
        }
      });

      if (isCurrentPanel) totalMatches = panelMatches;
    });

    if (query.length > 0) {
      if (searchInfo) searchInfo.textContent = `Mga resulta para sa "${query}":`;
      if (noResult) noResult.style.display = totalMatches === 0 ? 'flex' : 'none';
    } else {
      if (searchInfo) searchInfo.textContent = '';
      if (noResult) noResult.style.display = 'none';
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', filterRules);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      filterRules();
      searchInput.focus();
    });
  }
});
