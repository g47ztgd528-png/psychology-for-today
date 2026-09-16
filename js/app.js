(function () {
  'use strict';

  /* ---------- Theme toggle ---------- */
  (function initTheme() {
    var toggle = document.querySelector('[data-theme-toggle]');
    var root = document.documentElement;
    var mode = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-theme', mode);
    function paintIcon() {
      toggle.setAttribute('aria-label', 'Switch to ' + (mode === 'dark' ? 'light' : 'dark') + ' mode');
      toggle.innerHTML = mode === 'dark'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    }
    paintIcon();
    toggle.addEventListener('click', function () {
      mode = mode === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', mode);
      paintIcon();
      refreshChartColors();
    });
  })();

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  var fmtInt = new Intl.NumberFormat('en-US');
  var fmtMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtCompactViews(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return fmtInt.format(Math.round(n));
  }

  /* ---------- Constants ---------- */
  var CURRENT_FLOOR_DAILY = 10000000 / 90; // 111,111
  var FUTURE_FLOOR_DAILY = 20000000 / 90; // 222,222

  /* ---------- Calculator ---------- */
  var rpmEl = document.getElementById('rpm');
  var targetRevenueEl = document.getElementById('targetRevenue');
  var videosPerDayEl = document.getElementById('videosPerDay');
  var convRateEl = document.getElementById('convRate');

  var els = {
    rpmValue: document.getElementById('rpmValue'),
    targetRevenueValue: document.getElementById('targetRevenueValue'),
    videosPerDayValue: document.getElementById('videosPerDayValue'),
    convRateValue: document.getElementById('convRateValue'),
    kpiMonthlyViews: document.getElementById('kpiMonthlyViews'),
    kpiDailyViews: document.getElementById('kpiDailyViews'),
    kpiViewsPerVideo: document.getElementById('kpiViewsPerVideo'),
    kpiSubsMonth: document.getElementById('kpiSubsMonth'),
    kpiMonthsTo1000: document.getElementById('kpiMonthsTo1000'),
    kpiVsFloor: document.getElementById('kpiVsFloor'),
    realityCheck: document.getElementById('realityCheck'),
    floorMultiple: document.getElementById('floorMultiple')
  };

  var scenarioChart, rollingChart;

  function recalc() {
    var rpm = parseFloat(rpmEl.value);
    var targetRevenue = parseFloat(targetRevenueEl.value);
    var videosPerDay = parseInt(videosPerDayEl.value, 10);
    var convRate = parseFloat(convRateEl.value) / 100;

    els.rpmValue.textContent = '$' + rpm.toFixed(2);
    els.targetRevenueValue.textContent = fmtMoney.format(targetRevenue);
    els.videosPerDayValue.textContent = videosPerDay;
    els.convRateValue.textContent = parseFloat(convRateEl.value).toFixed(1) + '%';

    var monthlyViews = (targetRevenue / rpm) * 1000;
    var dailyViews = monthlyViews / 30;
    var viewsPerVideo = dailyViews / videosPerDay;
    var subsMonth = monthlyViews * convRate;
    var monthsTo1000 = subsMonth > 0 ? Math.ceil(1000 / subsMonth) : Infinity;
    var floorMultiple = dailyViews / CURRENT_FLOOR_DAILY;

    els.kpiMonthlyViews.textContent = fmtCompactViews(monthlyViews) + ' views';
    els.kpiDailyViews.textContent = fmtCompactViews(dailyViews) + ' views';
    els.kpiViewsPerVideo.textContent = fmtCompactViews(viewsPerVideo) + ' views';
    els.kpiSubsMonth.textContent = '+' + fmtInt.format(Math.round(subsMonth));
    els.kpiMonthsTo1000.textContent = isFinite(monthsTo1000) ? monthsTo1000 + (monthsTo1000 === 1 ? ' month' : ' months') : 'N/A';
    els.kpiVsFloor.textContent = floorMultiple.toFixed(1) + '\u00d7 the 10M/90-day floor';
    els.floorMultiple.textContent = floorMultiple.toFixed(1) + '\u00d7';

    els.realityCheck.innerHTML = 'At <strong>$' + rpm.toFixed(2) + ' RPM</strong>, hitting <strong>' + fmtMoney.format(targetRevenue) +
      '/month</strong> needs roughly <strong>' + fmtCompactViews(viewsPerVideo) + ' views on every single one</strong> of your ' +
      videosPerDay + ' daily uploads, sustained all month \u2014 that is viral-level performance repeated on a daily schedule, not a one-off hit.' +
      ' It also puts you at <strong>' + floorMultiple.toFixed(1) + '\u00d7</strong> YouTube\u2019s 10M-views/90-day eligibility pace, so the eligibility floor is not the constraint \u2014 sustaining this volume and staying compliant is.';

    updateScenarioChart(targetRevenue);
  }

  [rpmEl, targetRevenueEl, videosPerDayEl, convRateEl].forEach(function (el) {
    el.addEventListener('input', recalc);
  });

  /* ---------- Scenario chart ---------- */
  function buildScenarioChart(targetRevenue) {
    var ctx = document.getElementById('scenarioChart');
    var scenarios = [
      { label: 'Conservative\n$0.05 RPM', rpm: 0.05 },
      { label: 'Typical\n$0.08 RPM', rpm: 0.08 },
      { label: 'Strong\n$0.12 RPM', rpm: 0.12 },
      { label: 'Best-case\n$0.25 RPM', rpm: 0.25 }
    ];
    var dailyViews = scenarios.map(function (s) { return (targetRevenue / s.rpm) * 1000 / 30; });

    scenarioChart = new Chart(ctx, {
      data: {
        labels: scenarios.map(function (s) { return s.label; }),
        datasets: [
          {
            type: 'bar',
            label: 'Daily views needed',
            data: dailyViews,
            backgroundColor: cssVar('--color-primary'),
            borderRadius: 6,
            maxBarThickness: 64
          },
          {
            type: 'line',
            label: 'Current eligibility pace (111K/day)',
            data: scenarios.map(function () { return CURRENT_FLOOR_DAILY; }),
            borderColor: cssVar('--color-warning'),
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: chartBaseOptions(function (v) { return fmtCompactViews(v); })
    });
  }

  function updateScenarioChart(targetRevenue) {
    if (!scenarioChart) { buildScenarioChart(targetRevenue); return; }
    var scenarios = [0.05, 0.08, 0.12, 0.25];
    scenarioChart.data.datasets[0].data = scenarios.map(function (rpm) { return (targetRevenue / rpm) * 1000 / 30; });
    scenarioChart.data.datasets[1].data = scenarios.map(function () { return CURRENT_FLOOR_DAILY; });
    scenarioChart.update();
  }

  function chartBaseOptions(yTickFmt) {
    var textColor = cssVar('--color-text-muted');
    var gridColor = cssVar('--color-divider');
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Satoshi', size: 12 } } },
        tooltip: {
          callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + fmtInt.format(Math.round(ctx.parsed.y)); } }
        }
      },
      scales: {
        x: { ticks: { color: textColor, font: { family: 'Satoshi', size: 11 } }, grid: { color: gridColor, display: false } },
        y: {
          ticks: { color: textColor, font: { family: 'Satoshi', size: 11 }, callback: yTickFmt },
          grid: { color: gridColor }
        }
      }
    };
  }

  /* ---------- Rolling threshold simulator ---------- */
  var simAvgViewsEl = document.getElementById('simAvgViews');
  var simVolatilityEl = document.getElementById('simVolatility');
  var simAvgViewsValue = document.getElementById('simAvgViewsValue');
  var simVolatilityValue = document.getElementById('simVolatilityValue');
  var runSimBtn = document.getElementById('runSim');
  var simStatus = document.getElementById('simStatus');

  function gaussianRandom() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function simulateSeries(avg, volatilityPct) {
    var days = 150;
    var series = [];
    var vol = volatilityPct / 100;
    for (var i = 0; i < days; i++) {
      var noise = gaussianRandom() * vol;
      var v = avg * (1 + noise);
      series.push(Math.max(0, v));
    }
    return series;
  }

  function rollingSums(series, window) {
    var out = [];
    var sum = 0;
    for (var i = 0; i < series.length; i++) {
      sum += series[i];
      if (i >= window) sum -= series[i - window];
      out.push(i >= window - 1 ? sum : null);
    }
    return out;
  }

  function buildOrUpdateRollingChart() {
    var avg = parseFloat(simAvgViewsEl.value);
    var volatility = parseFloat(simVolatilityEl.value);
    simAvgViewsValue.textContent = fmtInt.format(avg) + '/day';
    simVolatilityValue.textContent = volatility + '%';

    var series = simulateSeries(avg, volatility);
    var rolling = rollingSums(series, 90);
    var labels = series.map(function (_, i) { return 'Day ' + (i + 1); });

    var minRolling = Infinity;
    rolling.forEach(function (v) { if (v !== null && v < minRolling) minRolling = v; });

    var ctx = document.getElementById('rollingChart');
    var datasets = [
      {
        type: 'line',
        label: 'Trailing 90-day view sum',
        data: rolling,
        borderColor: cssVar('--color-primary'),
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.15,
        spanGaps: true
      },
      {
        type: 'line',
        label: 'Current floor (10M)',
        data: labels.map(function () { return 10000000; }),
        borderColor: cssVar('--color-warning'),
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0
      },
      {
        type: 'line',
        label: 'Post-Feb 2027 floor (20M)',
        data: labels.map(function () { return 20000000; }),
        borderColor: cssVar('--color-error'),
        borderDash: [2, 3],
        borderWidth: 1.5,
        pointRadius: 0
      }
    ];

    if (rollingChart) {
      rollingChart.data.labels = labels;
      rollingChart.data.datasets = datasets;
      rollingChart.update();
    } else {
      rollingChart = new Chart(ctx, {
        data: { labels: labels, datasets: datasets },
        options: chartBaseOptions(function (v) { return fmtCompactViews(v); })
      });
    }

    renderSimStatus(minRolling, avg);
  }

  function renderSimStatus(minRolling, avg) {
    simStatus.innerHTML = '';
    var badges = [];
    if (minRolling < 10000000) {
      badges.push(['status-danger', 'Dips below current 10M floor \u2014 Shorts revenue would pause']);
    } else {
      badges.push(['status-ok', 'Stays above the current 10M floor']);
    }
    if (minRolling < 20000000) {
      badges.push(['status-warn', 'Would fall short of the post-Feb 2027 20M floor']);
    } else {
      badges.push(['status-ok', 'Clears the post-Feb 2027 20M floor too']);
    }
    var bufferPct = ((avg - CURRENT_FLOOR_DAILY) / CURRENT_FLOOR_DAILY) * 100;
    badges.push([bufferPct > 15 ? 'status-ok' : bufferPct > 0 ? 'status-warn' : 'status-danger',
      'Average pace is ' + (bufferPct >= 0 ? '+' : '') + bufferPct.toFixed(0) + '% vs. the current floor']);

    badges.forEach(function (b) {
      var span = document.createElement('span');
      span.className = 'status-badge ' + b[0];
      span.textContent = b[1];
      simStatus.appendChild(span);
    });
  }

  runSimBtn.addEventListener('click', buildOrUpdateRollingChart);
  simAvgViewsEl.addEventListener('input', function () {
    simAvgViewsValue.textContent = fmtInt.format(parseFloat(simAvgViewsEl.value)) + '/day';
  });
  simVolatilityEl.addEventListener('input', function () {
    simVolatilityValue.textContent = simVolatilityEl.value + '%';
  });

  function refreshChartColors() {
    [scenarioChart, rollingChart].forEach(function (chart) {
      if (!chart) return;
      var opts = chartBaseOptions(chart === scenarioChart ? fmtCompactViews : fmtCompactViews);
      chart.options.plugins.legend.labels.color = opts.plugins.legend.labels.color;
      chart.options.scales.x.ticks.color = opts.scales.x.ticks.color;
      chart.options.scales.x.grid.color = opts.scales.x.grid.color;
      chart.options.scales.y.ticks.color = opts.scales.y.ticks.color;
      chart.options.scales.y.grid.color = opts.scales.y.grid.color;
      chart.data.datasets.forEach(function (ds) {
        if (ds.label && ds.label.indexOf('eligibility pace') > -1) ds.borderColor = cssVar('--color-warning');
        if (ds.label && ds.label.indexOf('Daily views needed') > -1) ds.backgroundColor = cssVar('--color-primary');
        if (ds.label && ds.label.indexOf('90-day view sum') > -1) ds.borderColor = cssVar('--color-primary');
        if (ds.label && ds.label.indexOf('Current floor') > -1) ds.borderColor = cssVar('--color-warning');
        if (ds.label && ds.label.indexOf('2027 floor') > -1) ds.borderColor = cssVar('--color-error');
      });
      chart.update();
    });
  }

  /* ---------- Compliance-strike exposure table ---------- */
  function buildRiskTable() {
    var body = document.getElementById('riskTableBody');
    var scenarios = [3, 6, 10, 15, 20];
    body.innerHTML = '';
    scenarios.forEach(function (perDay) {
      var perWeek = perDay * 7;
      var per90 = perDay * 90;
      var flagClass = 'risk-flag-low', flagText = 'Low';
      if (perDay >= 6 && perDay < 12) { flagClass = 'risk-flag-med'; flagText = 'Elevated'; }
      if (perDay >= 12) { flagClass = 'risk-flag-high'; flagText = 'High'; }
      var tr = document.createElement('tr');
      if (perDay === 10) tr.style.background = 'var(--color-primary-highlight)';
      tr.innerHTML = '<td>' + perDay + '</td><td>' + fmtInt.format(perWeek) + '</td><td>' + fmtInt.format(per90) +
        '</td><td class="risk-flag ' + flagClass + '">' + flagText + ' \u2014 ' + fmtInt.format(per90) + ' videos share exposure if one repeated template is flagged</td>';
      body.appendChild(tr);
    });
  }

  /* ---------- Weekly pillar rotation table ---------- */
  var PILLARS = [
    { name: 'Myth vs. Reality', note: 'Debunk a specific misconception with a cited source.' },
    { name: 'Concept Explainer', note: 'Define one term/mechanism in plain language with an original example.' },
    { name: 'Research Breakdown', note: 'Summarize one named study \u2014 cite authors/year on screen.' },
    { name: 'Case Reflection', note: 'Anonymized, composite scenario \u2014 label as illustrative, not a real client.' },
    { name: 'Viewer Question', note: 'Answer a real submitted question with your own analysis.' },
    { name: 'Book/Study Spotlight', note: 'Feature one source text; add your own critique or application.' },
    { name: 'Field-Notes Commentary', note: 'Personal, first-person take on a trend or news item \u2014 opinion clearly marked as such.' }
  ];
  var FORMATS = [
    'Direct-to-camera',
    'Text overlay + voiceover',
    'Whiteboard / diagram',
    'Two-voice dialogue',
    'Listicle with narration',
    'Labeled illustrative reenactment'
  ];
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function buildRotationTable() {
    var table = document.getElementById('rotationTable');
    var slots = 10;
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    headRow.innerHTML = '<th>Day</th>' + Array.from({ length: slots }, function (_, i) { return '<th>Slot ' + (i + 1) + '</th>'; }).join('');
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    DAYS.forEach(function (day, dayIdx) {
      var row = document.createElement('tr');
      var cell = document.createElement('td');
      cell.innerHTML = '<strong>' + day + '</strong>';
      row.appendChild(cell);
      for (var slotIdx = 0; slotIdx < slots; slotIdx++) {
        var globalIdx = dayIdx * slots + slotIdx;
        var pillar = PILLARS[globalIdx % PILLARS.length];
        var format = FORMATS[(globalIdx + Math.floor(globalIdx / PILLARS.length)) % FORMATS.length];
        var td = document.createElement('td');
        td.className = 'slot-cell';
        td.title = pillar.note;
        td.innerHTML = '<strong>' + pillar.name + '</strong>' + format;
        row.appendChild(td);
      }
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
  }

  /* ---------- Originality checklist ---------- */
  var CHECKLIST_ITEMS = [
    'Original on-camera or voiceover commentary in my own words',
    'At least one concrete, specific example or detail (not generic)',
    'A distinct visual treatment or B-roll versus recent uploads',
    'Cites a named source, study, or verifiable statistic',
    'Adds personal analysis, opinion, or lived-experience angle',
    'No AI persona presented as a licensed expert giving direct advice',
    'Includes a clear disclaimer that content is educational, not clinical advice'
  ];

  function buildChecklist() {
    var list = document.getElementById('checklist');
    CHECKLIST_ITEMS.forEach(function (item, i) {
      var li = document.createElement('li');
      var id = 'chk' + i;
      li.innerHTML = '<input type="checkbox" id="' + id + '" /><label for="' + id + '">' + item + '</label>';
      list.appendChild(li);
    });
    list.addEventListener('change', updateScore);
  }

  function updateScore() {
    var checked = document.querySelectorAll('#checklist input:checked').length;
    var total = CHECKLIST_ITEMS.length;
    document.getElementById('scoreValue').textContent = checked + ' / ' + total;
    var pct = (checked / total) * 100;
    var fill = document.getElementById('scoreBarFill');
    fill.style.width = pct + '%';
    var verdict = document.getElementById('scoreVerdict');
    var color;
    if (checked >= 5) { verdict.textContent = 'Publish-ready \u2014 low template risk.'; color = cssVar('--color-success'); }
    else if (checked === 4) { verdict.textContent = 'Borderline \u2014 add one more original element before publishing.'; color = cssVar('--color-warning'); }
    else { verdict.textContent = 'High template risk \u2014 revise before publishing.'; color = cssVar('--color-error'); }
    verdict.style.color = color;
    fill.style.background = color;
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    recalc();
    buildOrUpdateRollingChart();
    buildRiskTable();
    buildRotationTable();
    buildChecklist();
    updateScore();
  });
})();
