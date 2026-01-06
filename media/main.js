(function() {
  console.log('[JSON Log Viewer] main.js loaded');
  
  // State
  let logs = [];
  let currentFilter = 'ALL';
  let currentSearch = '';

  // DOM Elements
  const logContainer = document.getElementById('logContainer');
  const searchInput = document.getElementById('searchInput');
  const levelFilter = document.getElementById('levelFilter');
  const statsEl = document.getElementById('stats');
  const modalOverlay = document.getElementById('modalOverlay');
  const closeModalBtn = document.getElementById('closeModal');
  const viewerTab = document.getElementById('viewerTab');
  const rawTab = document.getElementById('rawTab');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const searchHelpBtn = document.getElementById('searchHelpBtn');
  const searchHelpPopup = document.getElementById('searchHelpPopup');
  const closeSearchHelpBtn = document.getElementById('closeSearchHelp');

  console.log('[JSON Log Viewer] DOM elements:', {
    logContainer: !!logContainer,
    searchInput: !!searchInput,
    levelFilter: !!levelFilter,
    statsEl: !!statsEl,
    modalOverlay: !!modalOverlay
  });

  // Initialize
  function init() {
    console.log('[JSON Log Viewer] init() called');
    console.log('[JSON Log Viewer] initialLogContent length:', typeof initialLogContent !== 'undefined' ? initialLogContent.length : 'undefined');
    
    try {
      parseLogs(initialLogContent);
      console.log('[JSON Log Viewer] Parsed logs count:', logs.length);
      renderLogs();
      console.log('[JSON Log Viewer] Logs rendered');
      bindEvents();
      console.log('[JSON Log Viewer] Events bound');
    } catch (e) {
      console.error('[JSON Log Viewer] Error in init:', e);
    }
  }

  // Parse log content
  function parseLogs(content) {
    logs = [];
    const lines = content.split('\n').filter(line => line.trim());
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const parsed = JSON.parse(line);
        
        // Prepare fields with cost as the first field if present
        const fields = {};
        if (parsed.cost) {
          fields.cost = parsed.cost;
        }
        if (parsed.fields) {
          Object.assign(fields, parsed.fields);
        }

        logs.push({
          index: i,
          raw: line,
          time: parsed.time || '',
          level: (parsed.level || 'INFO').toUpperCase(),
          name: parsed.name || '',
          message: parsed.message || '',
          fields: fields,
          caller: parsed.caller || '',
          error: parsed.error || ''
        });
      } catch (e) {
        // If not valid JSON, try to parse as plain text
        logs.push({
          index: i,
          raw: line,
          time: '',
          level: 'INFO',
          name: '',
          message: line,
          fields: {},
          caller: '',
          error: ''
        });
      }
    }
  }

  // Render logs
  function renderLogs() {
    logContainer.innerHTML = '';
    
    if (logs.length === 0) {
      logContainer.innerHTML = `
        <div class="no-results">
          <h3>No logs found</h3>
          <p>The file appears to be empty or contains no valid log entries.</p>
        </div>
      `;
      updateStats(0, 0);
      return;
    }

    let visibleCount = 0;
    const fragment = document.createDocumentFragment();

    logs.forEach((log, index) => {
      const isVisible = matchesFilter(log);
      if (isVisible) visibleCount++;

      const entry = document.createElement('div');
      entry.className = `log-entry ${log.level}${isVisible ? '' : ' hidden'}`;
      entry.dataset.index = index;
      entry.innerHTML = createLogEntryHTML(log);
      fragment.appendChild(entry);
    });

    logContainer.appendChild(fragment);
    updateStats(visibleCount, logs.length);
  }

  // Create HTML for a log entry
  function createLogEntryHTML(log) {
    const fieldsHtml = createFieldsPreviewHTML(log.fields);
    const callerTooltip = log.caller ? escapeHtml(log.caller) : '';
    const errorMessage = log.error ? `: ${escapeHtml(log.error)}` : '';
    
    return `
      <span class="log-time" ${callerTooltip ? `title="${callerTooltip}"` : ''}>[${escapeHtml(log.time)}]</span>
      <span class="log-level ${log.level}">${log.level}</span>
      ${log.name ? `<span class="log-name">${escapeHtml(log.name)}:</span>` : ''}
      <span class="log-message">${escapeHtml(log.message)}${errorMessage}</span>
      ${fieldsHtml}
    `;
  }

  // Create fields preview HTML
  function createFieldsPreviewHTML(fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return '';

    const previewItems = keys.slice(0, 4).map(key => {
      const value = formatFieldValue(fields[key]);
      return `<span class="field-item" data-field="${escapeHtml(key)}">${escapeHtml(key)}=${escapeHtml(value)}</span>`;
    });

    const hasMore = keys.length > 4;
    
    return `
      <span class="log-fields">
        ${previewItems.join('<span class="field-separator">, </span>')}
        ${hasMore ? `<button class="fields-toggle" data-fields='${escapeHtml(JSON.stringify(fields))}'>[+${keys.length - 4} more]</button>` : ''}
      </span>
    `;
  }

  // Format field value for preview
  function formatFieldValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') return '{...}';
    if (typeof value === 'string' && value.length > 50) {
      return value.substring(0, 47) + '...';
    }
    return String(value);
  }

  // Check if log matches current filter
  function matchesFilter(log) {
    // Level filter
    if (currentFilter !== 'ALL' && log.level !== currentFilter) {
      return false;
    }

    // Search filter with expression support
    if (currentSearch) {
      if (!matchesSearchExpression(log, currentSearch)) {
        return false;
      }
    }

    return true;
  }

  // Parse and evaluate search expression
  function matchesSearchExpression(log, searchStr) {
    const trimmed = searchStr.trim();
    if (!trimmed) return true;

    // Check for OR conditions (split by ' or ')
    if (trimmed.toLowerCase().includes(' or ')) {
      const orParts = trimmed.split(/\s+or\s+/i);
      return orParts.some(part => matchesSearchExpression(log, part.trim()));
    }

    // Check for AND conditions (split by ' and ')
    if (trimmed.toLowerCase().includes(' and ')) {
      const andParts = trimmed.split(/\s+and\s+/i);
      return andParts.every(part => matchesSearchExpression(log, part.trim()));
    }

    // Parse single expression
    return evaluateSingleExpression(log, trimmed);
  }

  // Evaluate a single expression like "name=~xxx" or "level=INFO"
  function evaluateSingleExpression(log, expr) {
    // Patterns: field=~value (contains), field!~value (not contains), field=value (equals), field!=value (not equals)
    const containsMatch = expr.match(/^(\w+)=~(.+)$/);
    const notContainsMatch = expr.match(/^(\w+)!~(.+)$/);
    const equalsMatch = expr.match(/^(\w+)=([^~].*)$/);
    const notEqualsMatch = expr.match(/^(\w+)!=([^~].*)$/);

    if (containsMatch) {
      const [, field, value] = containsMatch;
      const fieldValue = getFieldValue(log, field);
      return fieldValue.toLowerCase().includes(value.toLowerCase());
    }

    if (notContainsMatch) {
      const [, field, value] = notContainsMatch;
      const fieldValue = getFieldValue(log, field);
      return !fieldValue.toLowerCase().includes(value.toLowerCase());
    }

    if (notEqualsMatch) {
      const [, field, value] = notEqualsMatch;
      const fieldValue = getFieldValue(log, field);
      return fieldValue.toLowerCase() !== value.toLowerCase();
    }

    if (equalsMatch) {
      const [, field, value] = equalsMatch;
      const fieldValue = getFieldValue(log, field);
      return fieldValue.toLowerCase() === value.toLowerCase();
    }

    // Default: simple text search across all fields
    const searchableText = [
      log.time,
      log.level,
      log.name,
      log.message,
      log.caller,
      JSON.stringify(log.fields)
    ].join(' ').toLowerCase();
    
    return searchableText.includes(expr.toLowerCase());
  }

  // Get field value from log entry
  function getFieldValue(log, field) {
    const fieldLower = field.toLowerCase();
    
    // Check direct properties
    if (fieldLower === 'time') return log.time || '';
    if (fieldLower === 'level') return log.level || '';
    if (fieldLower === 'name') return log.name || '';
    if (fieldLower === 'message' || fieldLower === 'msg') return log.message || '';
    if (fieldLower === 'caller') return log.caller || '';
    
    // Check in fields object
    if (log.fields && log.fields[field] !== undefined) {
      return String(log.fields[field]);
    }
    
    // Case-insensitive search in fields
    if (log.fields) {
      for (const key of Object.keys(log.fields)) {
        if (key.toLowerCase() === fieldLower) {
          return String(log.fields[key]);
        }
      }
    }
    
    return '';
  }

  // Update visibility of log entries
  function updateVisibility() {
    const entries = logContainer.querySelectorAll('.log-entry');
    let visibleCount = 0;

    entries.forEach((entry, index) => {
      const log = logs[index];
      const isVisible = matchesFilter(log);
      entry.classList.toggle('hidden', !isVisible);
      if (isVisible) visibleCount++;
    });

    updateStats(visibleCount, logs.length);
  }

  // Update stats display
  function updateStats(visible, total) {
    if (visible === total) {
      statsEl.textContent = `${total} entries`;
    } else {
      statsEl.textContent = `${visible} / ${total} entries`;
    }
  }

  // Show fields modal
  function showFieldsModal(fields) {
    viewerTab.innerHTML = renderTreeView(fields);
    rawTab.innerHTML = `<pre class="raw-json">${escapeHtml(JSON.stringify(fields, null, 2))}</pre>`;
    modalOverlay.classList.add('active');
  }

  // Hide fields modal
  function hideFieldsModal() {
    modalOverlay.classList.remove('active');
  }

  // Render tree view for fields
  function renderTreeView(obj, depth = 0) {
    if (obj === null) {
      return '<span class="tree-value null">null</span>';
    }
    
    if (typeof obj !== 'object') {
      return renderPrimitiveValue(obj);
    }

    const isArray = Array.isArray(obj);
    const entries = isArray ? obj.map((v, i) => [i, v]) : Object.entries(obj);
    const openBracket = isArray ? '[' : '{';
    const closeBracket = isArray ? ']' : '}';
    const typeLabel = isArray ? 'array' : 'object';

    if (entries.length === 0) {
      return `<span class="tree-bracket">${openBracket}${closeBracket}</span>`;
    }

    const id = `tree-${depth}-${Math.random().toString(36).substr(2, 9)}`;
    
    let html = `
      <div class="tree-node">
        <span class="tree-toggle" data-target="${id}">▼</span>
        <span class="tree-bracket">{${typeLabel}}</span>
        <div class="tree-children" id="${id}">
    `;

    entries.forEach(([key, value]) => {
      html += `
        <div class="tree-line">
          <span class="tree-key">${escapeHtml(String(key))}</span>: ${renderTreeView(value, depth + 1)}
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
  }

  // Render primitive value
  function renderPrimitiveValue(value) {
    if (typeof value === 'string') {
      return `<span class="tree-value string">"${escapeHtml(value)}"</span>`;
    }
    if (typeof value === 'number') {
      return `<span class="tree-value number">${value}</span>`;
    }
    if (typeof value === 'boolean') {
      return `<span class="tree-value boolean">${value}</span>`;
    }
    return `<span class="tree-value">${escapeHtml(String(value))}</span>`;
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Bind events
  function bindEvents() {
    // Search input
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value;
        updateVisibility();
      }, 200);
    });

    // Level filter
    levelFilter.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      updateVisibility();
    });

    // Click on log entry to show fields
    logContainer.addEventListener('click', (e) => {
      // Check if clicked on fields toggle button
      const toggleBtn = e.target.closest('.fields-toggle');
      if (toggleBtn) {
        const fields = JSON.parse(toggleBtn.dataset.fields);
        showFieldsModal(fields);
        return;
      }

      // Check if clicked on field item
      const fieldItem = e.target.closest('.field-item');
      if (fieldItem) {
        const entry = fieldItem.closest('.log-entry');
        const index = parseInt(entry.dataset.index);
        const log = logs[index];
        showFieldsModal(log.fields);
        return;
      }

      // Check if clicked on log-fields area
      const fieldsArea = e.target.closest('.log-fields');
      if (fieldsArea) {
        const entry = fieldsArea.closest('.log-entry');
        const index = parseInt(entry.dataset.index);
        const log = logs[index];
        showFieldsModal(log.fields);
      }
    });

    // Close modal
    closeModalBtn.addEventListener('click', hideFieldsModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        hideFieldsModal();
      }
    });

    // Tab switching
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        document.getElementById(`${tab}Tab`).classList.add('active');
      });
    });

    // Tree toggle (collapse/expand)
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('tree-toggle')) {
        const target = document.getElementById(e.target.dataset.target);
        if (target) {
          target.classList.toggle('collapsed');
          e.target.textContent = target.classList.contains('collapsed') ? '▶' : '▼';
        }
      }
    });

    // Search help popup
    if (searchHelpBtn && searchHelpPopup) {
      searchHelpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        searchHelpPopup.classList.toggle('active');
      });

      if (closeSearchHelpBtn) {
        closeSearchHelpBtn.addEventListener('click', () => {
          searchHelpPopup.classList.remove('active');
        });
      }

      // Close popup when clicking outside
      document.addEventListener('click', (e) => {
        if (!searchHelpPopup.contains(e.target) && e.target !== searchHelpBtn) {
          searchHelpPopup.classList.remove('active');
        }
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideFieldsModal();
        if (searchHelpPopup) {
          searchHelpPopup.classList.remove('active');
        }
      }
      // Ctrl/Cmd + F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  // Handle messages from extension
  window.addEventListener('message', (e) => {
    const message = e.data;
    if (message.command === 'updateLogs') {
      parseLogs(message.content);
      renderLogs();
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

