console.log('index.js loaded');
document.addEventListener('DOMContentLoaded', () => {
  const addHostBtn = document.getElementById('add-host-btn');
  const importBtn = document.getElementById('import-btn');
  const clearBtn = document.getElementById('clear-btn');
  const nodesTbody = document.getElementById('nodes-tbody');
  const logArea = document.getElementById('log-area');

  // Modal elements
  const hostModal = document.getElementById('host-modal');
  const closeModal = document.getElementById('close-modal');
  const hostInput = document.getElementById('host-input');
  const modalAddBtn = document.getElementById('modal-add-btn');

  // Chart elements
  const graphModal = document.getElementById('graph-modal');
  const closeGraphModal = document.getElementById('close-graph-modal');
  const graphCanvas = document.getElementById('graph-canvas');
  const chartBtn = document.querySelector('.control-panel button[title="Chart"]');

  // Details modal elements
  const detailsModal = document.getElementById('details-modal');
  const closeDetailsModal = document.getElementById('close-details-modal');
  const detailsCanvas = document.getElementById('details-canvas');
  const detailsTitle = document.getElementById('details-title');
  const detailsStats = document.getElementById('details-stats');
  let detailsInterval = null;

  // Store hosts and their row elements
  const hosts = [];
  let graphInterval = null;
  const startStopBtn = document.querySelector('.control-panel button[title="Start/Stop"]');
  let selectedRow = null;
  let selectedHostObj = null;

  const intervalSelect = document.getElementById('interval-select');
  let pingIntervalMs = 5 * 60 * 1000; // Default to 5 minutes

  // Update ping interval when dropdown changes
  intervalSelect.addEventListener('change', () => {
    const value = intervalSelect.value;
    if (value.includes('minute')) {
      pingIntervalMs = parseInt(value) * 60 * 1000;
    } else if (value.includes('hour')) {
      pingIntervalMs = parseInt(value) * 60 * 60 * 1000;
    } else {
      pingIntervalMs = 60 * 1000;
    }
    // Restart ping loops for all hosts
    hosts.forEach(h => {
      if (!h.paused) {
        h.pingLoopRunning = false;
        startPingingHost(h.host, h.row, h);
      }
    });
    log(`Ping interval set to ${intervalSelect.value}.`);
  });

  function log(message) {
    const now = new Date().toLocaleTimeString();
    logArea.value += `[${now}] ${message}\n`;
    logArea.scrollTop = logArea.scrollHeight;
  }

  addHostBtn.addEventListener('click', () => {
    hostInput.value = '';
    hostModal.style.display = 'flex';
    hostInput.focus();
  });

  closeModal.addEventListener('click', () => {
    hostModal.style.display = 'none';
  });

  modalAddBtn.addEventListener('click', () => {
    const host = hostInput.value.trim();
    if (!host) return;
    addHostRow(host);
    hostModal.style.display = 'none';
    log(`Added host: ${host}`);
  });

  window.addEventListener('click', (e) => {
    if (e.target === hostModal) {
      hostModal.style.display = 'none';
    }
  });

  clearBtn.addEventListener('click', () => {
    while (nodesTbody.firstChild) {
      nodesTbody.removeChild(nodesTbody.firstChild);
    }
    hosts.length = 0;
    log('Cleared all hosts.');
  });

  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const lines = evt.target.result.split(/\r?\n/);
        let count = 0;
        for (const line of lines) {
          const host = line.trim();
          if (host) {
            addHostRow(host);
            count++;
          }
        }
        log(`Imported ${count} hosts from CSV.`);
      };
      reader.readAsText(file);
    };
    input.click();
  });

  // Export functionality
  const exportBtn = document.querySelector('.control-panel button[title="Export"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const csv = hosts.map(h => h.host).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hosts.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      log('Exported hosts to CSV.');
    });
  }

  // Chart button logic
  if (chartBtn) {
    chartBtn.addEventListener('click', () => {
      graphModal.style.display = 'flex';
      drawGraph();
      graphInterval = setInterval(drawGraph, 1000);
    });
  }
  closeGraphModal.addEventListener('click', () => {
    graphModal.style.display = 'none';
    if (graphInterval) {
      clearInterval(graphInterval);
      graphInterval = null;
    }
  });
  window.addEventListener('click', (e) => {
    if (e.target === graphModal) {
      graphModal.style.display = 'none';
      if (graphInterval) {
        clearInterval(graphInterval);
        graphInterval = null;
      }
    }
  });

  // Row selection logic
  nodesTbody.addEventListener('click', (e) => {
    // Ignore clicks on the remove button
    if (e.target.classList.contains('remove-btn')) return;
    let tr = e.target.closest('tr');
    if (!tr) return;
    // Deselect previous
    if (selectedRow) selectedRow.classList.remove('selected-row');
    selectedRow = tr;
    selectedRow.classList.add('selected-row');
    // Find host object
    selectedHostObj = hosts.find(h => h.row === selectedRow);
    // Update button icon
    if (selectedHostObj && selectedHostObj.paused) {
      startStopBtn.innerHTML = '<span>▶️</span>';
    } else {
      startStopBtn.innerHTML = '<span>⏸️</span>';
    }
  });

  // Start/Stop button logic
  if (startStopBtn) {
    startStopBtn.addEventListener('click', () => {
      if (!selectedHostObj) return;
      selectedHostObj.paused = !selectedHostObj.paused;
      if (selectedHostObj.paused) {
        startStopBtn.innerHTML = '<span>▶️</span>';
        log(`Paused: ${selectedHostObj.host}`);
      } else {
        startStopBtn.innerHTML = '<span>⏸️</span>';
        log(`Resumed: ${selectedHostObj.host}`);
        // Resume ping loop if not running
        if (!selectedHostObj.pingLoopRunning) {
          startPingingHost(selectedHostObj.host, selectedHostObj.row, selectedHostObj);
        }
      }
    });
  }

  // Add a host row with remove and details buttons and ping logic
  function addHostRow(host) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${host}</td>
      <td></td>
      <td></td>
      <td></td>
      <td><button class="remove-btn">Remove</button> <button class="details-btn">Details</button></td>
    `;
    nodesTbody.appendChild(row);
    const hostObj = { host, row, pings: [], lost: 0, rtts: [], paused: false, pingLoopRunning: false, sent: 0, lostCount: 0 };
    hosts.push(hostObj);
    startPingingHost(host, row, hostObj);
    // Remove button logic
    row.querySelector('.remove-btn').addEventListener('click', () => {
      nodesTbody.removeChild(row);
      const idx = hosts.findIndex(h => h.row === row);
      if (idx !== -1) hosts.splice(idx, 1);
      log(`Removed host: ${host}`);
      // Deselect if this was selected
      if (selectedRow === row) {
        selectedRow = null;
        selectedHostObj = null;
        startStopBtn.innerHTML = '<span>⏯️</span>';
      }
    });
    // Details button logic
    row.querySelector('.details-btn').addEventListener('click', () => {
      openDetailsModal(hostObj);
    });
  }

  function openDetailsModal(hostObj) {
    detailsModal.style.display = 'flex';
    detailsTitle.textContent = `Round-Trip-Time (ms) - ${hostObj.host} - Last ${hostObj.rtts.length} samples`;
    drawDetailsGraph(hostObj);
    if (detailsInterval) clearInterval(detailsInterval);
    detailsInterval = setInterval(() => drawDetailsGraph(hostObj), 1000);
  }
  closeDetailsModal.addEventListener('click', () => {
    detailsModal.style.display = 'none';
    if (detailsInterval) clearInterval(detailsInterval);
  });
  window.addEventListener('click', (e) => {
    if (e.target === detailsModal) {
      detailsModal.style.display = 'none';
      if (detailsInterval) clearInterval(detailsInterval);
    }
  });

  function drawDetailsGraph(hostObj) {
    const ctx = detailsCanvas.getContext('2d');
    ctx.clearRect(0, 0, detailsCanvas.width, detailsCanvas.height);
    // Draw grid (light)
    ctx.save();
    ctx.strokeStyle = '#e6eaf0';
    ctx.lineWidth = 1;
    for (let x = 60; x < 440; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, 250); ctx.stroke();
    }
    for (let y = 20; y <= 250; y += 23) {
      ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(430, y); ctx.stroke();
    }
    ctx.restore();
    // Draw axes (darker)
    ctx.save();
    ctx.strokeStyle = '#4a5a6a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(60, 20); ctx.lineTo(60, 250); ctx.lineTo(430, 250); ctx.stroke();
    ctx.restore();
    // Find min/max RTT
    let min = Infinity, max = -Infinity, sum = 0, count = 0, cur = null;
    hostObj.rtts.forEach(rtt => {
      if (typeof rtt === 'number') {
        if (rtt < min) min = rtt;
        if (rtt > max) max = rtt;
        sum += rtt;
        count++;
        cur = rtt;
      }
    });
    const avg = count ? sum / count : 0;
    // Y axis scaling
    let yMin = Math.floor((min === Infinity ? 0 : min) / 10) * 10;
    let yMax = Math.ceil((max === -Infinity ? 100 : max) / 10) * 10;
    if (yMax === yMin) yMax = yMin + 10;
    // Draw RTT line (smooth)
    ctx.save();
    ctx.strokeStyle = '#e41a1c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let started = false;
    hostObj.rtts.forEach((rtt, i) => {
      if (typeof rtt !== 'number') return;
      const x = 60 + (i * ((370) / (hostObj.rtts.length-1 || 1)));
      const y = 250 - ((rtt - yMin) / (yMax - yMin)) * 210;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
    // Draw points
    ctx.save();
    ctx.fillStyle = '#e41a1c';
    hostObj.rtts.forEach((rtt, i) => {
      if (typeof rtt !== 'number') return;
      const x = 60 + (i * ((370) / (hostObj.rtts.length-1 || 1)));
      const y = 250 - ((rtt - yMin) / (yMax - yMin)) * 210;
      ctx.beginPath(); ctx.arc(x, y, 2.7, 0, 2*Math.PI); ctx.fill();
    });
    // Highlight current RTT
    if (typeof cur === 'number') {
      const x = 60 + ((hostObj.rtts.length-1) * ((370) / (hostObj.rtts.length-1 || 1)));
      const y = 250 - ((cur - yMin) / (yMax - yMin)) * 210;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 2*Math.PI);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#e41a1c'; ctx.stroke();
    }
    ctx.restore();
    // Y axis labels
    ctx.save();
    ctx.fillStyle = '#2a3a4a';
    ctx.font = '13px Segoe UI, Arial, sans-serif';
    ctx.fillText(`${yMax} ms`, 10, 30);
    ctx.fillText(`${yMin} ms`, 10, 250);
    ctx.restore();
    // X axis labels (show time index)
    ctx.save();
    ctx.fillStyle = '#2a3a4a';
    ctx.font = '13px Segoe UI, Arial, sans-serif';
    ctx.fillText('Now', 400, 255);
    ctx.fillText(`-${hostObj.rtts.length-1 || 0}s`, 60, 255);
    ctx.restore();
    // Legend
    ctx.save();
    ctx.fillStyle = '#e41a1c';
    ctx.fillRect(70, 10, 12, 12);
    ctx.fillStyle = '#2a3a4a';
    ctx.font = '13px Segoe UI, Arial, sans-serif';
    ctx.fillText('Round-trip-time', 90, 21);
    ctx.restore();
    // Stats (already styled in HTML)
    detailsStats.innerHTML = `
      <b>Min</b>: ${min === Infinity ? '-' : min.toFixed(2)} ms &nbsp; 
      <b>Avg</b>: ${avg ? avg.toFixed(2) : '-'} ms &nbsp; 
      <b>Max</b>: ${max === -Infinity ? '-' : max.toFixed(2)} ms &nbsp; 
      <b>Cur</b>: ${cur !== null ? cur.toFixed(2) : '-'} ms<br/>
      Packets: Sent = ${hostObj.sent || 0}, Received = ${(hostObj.sent||0)-(hostObj.lost||0)}, Lost = ${hostObj.lost||0}
    `;
  }

  // Draw a simple line graph for all hosts
  function drawGraph() {
    const ctx = graphCanvas.getContext('2d');
    ctx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
    // Draw axes
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(40, 10);
    ctx.lineTo(40, 210);
    ctx.lineTo(350, 210);
    ctx.stroke();
    // Find max RTT
    let maxRTT = 100;
    hosts.forEach(h => {
      h.rtts.forEach(rtt => {
        if (typeof rtt === 'number' && rtt > maxRTT) maxRTT = rtt;
      });
    });
    // Draw lines for each host
    const colors = ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#a65628','#f781bf','#999999'];
    hosts.forEach((h, i) => {
      ctx.strokeStyle = colors[i % colors.length];
      ctx.beginPath();
      h.rtts.forEach((rtt, j) => {
        if (typeof rtt !== 'number') return;
        const x = 40 + (j * ((310) / 29));
        const y = 210 - ((rtt / maxRTT) * 200);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // Host label
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillText(h.host, 50 + i*60, 225);
    });
    // Y axis labels
    ctx.fillStyle = '#222';
    ctx.fillText('RTT (ms)', 2, 20);
    ctx.fillText(maxRTT.toFixed(0), 2, 30);
    ctx.fillText('0', 2, 210);
  }

  // Ping logic (update to use pingIntervalMs)
  function startPingingHost(host, row, hostObj) {
    if (!hostObj) return;
    if (hostObj.pingLoopRunning) return;
    hostObj.pingLoopRunning = true;
    let sent = hostObj.sent || 0;
    let lost = hostObj.lost || 0;
    async function pingLoop() {
      if (hostObj.paused) {
        hostObj.pingLoopRunning = false;
        return;
      }
      sent++;
      const res = await window.api.pingHost(host);
      if (!res.alive) lost++;
      row.cells[1].textContent = res.host || '';
      row.cells[2].textContent = res.time !== null ? res.time : '-';
      row.cells[3].textContent = ((lost / sent) * 100).toFixed(0);
      // Store RTT for graph
      if (hostObj) {
        if (typeof res.time === 'number') hostObj.rtts.push(res.time);
        else hostObj.rtts.push(null);
        if (hostObj.rtts.length > 30) hostObj.rtts.shift();
        hostObj.sent = sent;
        hostObj.lost = lost;
      }
      setTimeout(pingLoop, pingIntervalMs);
    }
    pingLoop();
  }

  // Menu bar actions
  document.getElementById('menu-file').addEventListener('click', (e) => {
    // Simple dropdown simulation
    const menu = document.createElement('div');
    menu.className = 'menu-dropdown';
    menu.style.position = 'absolute';
    menu.style.top = '32px';
    menu.style.left = e.target.getBoundingClientRect().left + 'px';
    menu.style.background = '#fff';
    menu.style.border = '1px solid #b0c4de';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    menu.style.zIndex = 2000;
    menu.innerHTML = `
      <div class='menu-dropdown-item' id='file-import'>Import Hosts</div>
      <div class='menu-dropdown-item' id='file-export'>Export Hosts</div>
      <div class='menu-dropdown-item' id='file-exit'>Exit</div>
    `;
    document.body.appendChild(menu);
    // Remove on click outside
    setTimeout(() => {
      window.addEventListener('click', function handler(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
          window.removeEventListener('click', handler);
        }
      });
    }, 10);
    // Actions
    menu.querySelector('#file-import').onclick = () => { importBtn.click(); menu.remove(); };
    menu.querySelector('#file-export').onclick = () => { if (exportBtn) exportBtn.click(); menu.remove(); };
    menu.querySelector('#file-exit').onclick = () => { if (window.api && window.api.exitApp) window.api.exitApp(); else window.close(); menu.remove(); };
  });
  document.getElementById('menu-settings').addEventListener('click', (e) => {
    const menu = document.createElement('div');
    menu.className = 'menu-dropdown';
    menu.style.position = 'absolute';
    menu.style.top = '32px';
    menu.style.left = e.target.getBoundingClientRect().left + 'px';
    menu.style.background = '#fff';
    menu.style.border = '1px solid #b0c4de';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    menu.style.zIndex = 2000;
    menu.innerHTML = `<div class='menu-dropdown-item' id='settings-clear'>Clear All Hosts</div>`;
    document.body.appendChild(menu);
    setTimeout(() => {
      window.addEventListener('click', function handler(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
          window.removeEventListener('click', handler);
        }
      });
    }, 10);
    menu.querySelector('#settings-clear').onclick = () => { clearBtn.click(); menu.remove(); };
  });
  document.getElementById('menu-help').addEventListener('click', (e) => {
    const menu = document.createElement('div');
    menu.className = 'menu-dropdown';
    menu.style.position = 'absolute';
    menu.style.top = '32px';
    menu.style.left = e.target.getBoundingClientRect().left + 'px';
    menu.style.background = '#fff';
    menu.style.border = '1px solid #b0c4de';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    menu.style.zIndex = 2000;
    menu.innerHTML = `<div class='menu-dropdown-item' id='help-about'>About</div>`;
    document.body.appendChild(menu);
    setTimeout(() => {
      window.addEventListener('click', function handler(ev) {
        if (!menu.contains(ev.target)) {
          menu.remove();
          window.removeEventListener('click', handler);
        }
      });
    }, 10);
    menu.querySelector('#help-about').onclick = () => { document.getElementById('about-modal').style.display = 'flex'; menu.remove(); };
  });
  // About modal close
  document.getElementById('close-about-modal').onclick = () => {
    document.getElementById('about-modal').style.display = 'none';
  };
});
