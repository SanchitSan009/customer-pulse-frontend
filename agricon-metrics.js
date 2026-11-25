/* Fill existing Agricon KPI elements without changing dashboard structure. */
(() => {
  const all = selector => [...document.querySelectorAll(selector)].filter(el=>!el.closest('.overview'));
  const names = ['active_fas', 'processing_runs', 'conversations', 'invoices_reviewed', 'execution_success'];
  const countNames = ['active_fas', 'processing_runs', 'conversations', 'invoices_reviewed'];
  let lastGood = null;
  let loading = false;
  let timer;

  const number = value => new Intl.NumberFormat('en-US').format(value);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function renderCharts(data) {
    const dates = `${data.period.start} to ${data.period.end} · Asia/Jakarta`;
    const freshness = data.stale ? `Stale: ${data.refresh_error}. ` : '';
    all('[data-agricon-approval-chart]').forEach(el => {
      const weeks = data.weekly_approvals;
      const labels = weeks.map(week => new Date(`${week.start}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', timeZone: 'UTC',
      }));
      el.innerHTML = svgTrend({w: window.DashboardUI.chartWidth(el,984), h: 282, labelSize: 15, min: -10, max: 110,
        title: 'Weekly FA approval and latest HQ verification by FA-decision cohort (%)',
        type: 'line', fmt: value => value.toFixed(1), weeks: labels,
        series: [
          { values: weeks.map(week => week.fa_approved) },
          { values: weeks.map(week => week.hq_approved), color: '#019EFF', below: true },
        ],
      }, '#695DEC');
      el.title = `${freshness}${weeks[0].start} to ${weeks[11].end} · Asia/Jakarta. Last four weeks shaded. ` +
        'FA: approved / reviewed. HQ: latest verified / FA approved, including pending. Missing denominators leave gaps; no historical HQ status is inferred.';
      const points = el.querySelectorAll('circle');
      let index = 0;
      for (const name of ['fa_approved', 'hq_approved']) {
        weeks.forEach(week => {
          if (week[name] === null) return;
          const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent = `${week.start} to ${week.end}: ${name === 'fa_approved' ? 'FA approved' : 'HQ verified'} ${week[name].toFixed(1)}%. Reviewed ${week.fa_decisions}; FA approved ${week.fa_approved_count}; HQ verified ${week.hq_verified_count}.`;
          points[index++].appendChild(title);
        });
      }
    });
    const funnel = data.review_funnel;
    const base = funnel.stages[0].count;
    all('[data-agricon-pipeline-note]').forEach(el => {
      el.textContent = `${data.stale ? 'Stale · ' : ''}${number(base)} reviewed`;
      el.title = `${freshness}${dates}. ${funnel.definition}`;
    });
    all('[data-agricon-pipeline]').forEach(el => {
      const stage = funnel.stages[Number(el.dataset.agriconPipeline)];
      el.querySelector('.val b').textContent = number(stage.count);
      el.querySelector('.val em').textContent = base ? `${(stage.count / base * 100).toFixed(1)}%` : '—';
      el.querySelector('.fill').style.width = base ? `${stage.count / base * 100}%` : '0%';
      el.title = `${freshness}${dates}. ${funnel.definition}`;
    });
    all('[data-agricon-funnel]').forEach(el => {
      const footer = `${number(funnel.fa_rejected)} FA rejected · ${number(funnel.hq_pending)} pending HQ · ${number(funnel.hq_disapproved)} HQ disapproved${funnel.erp_failed ? ` · ${number(funnel.erp_failed)} ERP failed` : ''}`;
      window.DashboardUI.funnel(el,funnel.stages,{base,color:'#695DEC',footer});
      el.title = `${freshness}${dates}. ${funnel.definition}`;
    });
    all('[data-agricon-processing]').forEach(el => {
      const weeks = data.weekly_processing;
      const w = window.DashboardUI.chartWidth(el,Number(el.dataset.width)), h = Number(el.dataset.height);
      if (!data.processing.available || weeks.every(week => week.median_seconds === null)) {
        el.innerHTML = `<svg width="${w}" height="${h}" role="img" aria-label="No processing duration data"><text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="14" class="tp">No recorded processing times</text></svg>`;
      } else {
        const values = weeks.map(week => week.median_seconds);
        const labels = weeks.map(week => new Date(`${week.start}T00:00:00Z`).toLocaleDateString('en-GB', {day:'numeric',month:'short',timeZone:'UTC'}));
        el.innerHTML = svgTrend({w, h, labelSize: w < 500 ? 10 : 14, min: 0,
          max: Math.max(1, Math.ceil(Math.max(...values.filter(value => value !== null)) * 1.25)),
          title: 'Weekly median automated invoice-processing function execution time in seconds',
          type: 'line', fmt: value => `${Number(value.toFixed(1))}s`, weeks: labels,
          everyOther: true, series: [{values}]}, '#695DEC');
        let index = 0;
        const points = el.querySelectorAll('circle');
        weeks.forEach(week => {
          if (week.median_seconds === null) return;
          const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent = `${week.start} to ${week.end}: median ${week.median_seconds}s across ${week.timed_run_count} timed runs out of ${week.run_count}.`;
          points[index++].appendChild(title);
        });
      }
      el.title = `${freshness}${data.processing.definition} Last four weeks shaded; missing durations leave gaps. ${data.processing.invalid_or_missing_durations} source runs lack a valid duration.`;
    });
    const reasons = data.rejection_reasons;
    all('[data-agricon-rejections-note]').forEach(el => {
      el.textContent = `${data.stale ? 'Stale · ' : ''}${number(reasons.total)} rejected`;
      el.title = `${freshness}${dates}. One reason per FA-rejected record; percentages use all rejected records.`;
    });
    all('[data-agricon-rejections]').forEach(el => {
      const rows = reasons.rows.filter(row => row.count > 0)
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, 5);
      const maximum = Math.max(1, ...rows.map(row => row.count));
      el.innerHTML = rows.map(row => `
        <div class="rk">
          <span class="rl" title="${escape(row.label)} · Original: ${escape(row.source_reason || row.key)}">${escape(row.label)}</span>
          <div class="rt"><div class="rf" style="width:${row.count / maximum * 100}%;background:#695DEC"></div></div>
          <span class="rv"><b>${number(row.count)}</b><em>${reasons.total ? (row.count / reasons.total * 100).toFixed(1) + '%' : '—'}</em></span>
        </div>`).join('') || '<span class="rl">No recorded rejection reasons</span>';
      el.title = `${freshness}${dates}. Top five recorded rejection reasons with cases. Actual source explanations are retained; empty reasons are omitted. ${reasons.missing_reason_count} rejected records have no recorded reason. Percentages use all ${reasons.total} rejected records, including reasons outside the top five.`;
    });
    const insights = [
      `${number(funnel.hq_pending)} of ${number(data.counts.fa_approved_count)} FA-approved records are awaiting HQ. ${number(funnel.hq_disapproved)} were disapproved by HQ.`,
      `${number(reasons.total)} of ${number(base)} reviewed records were rejected by FA. ${number(reasons.missing_reason_count)} have no recorded reason.`,
      data.processing.period_median_seconds === null ? 'No recorded processing durations in this period.' :
        `Median processing time was ${data.processing.period_median_seconds}s across ${number(data.processing.period_timed_run_count)} timed runs. This measures function execution, not human review time.`,
    ];
    all('[data-agricon-insight]').forEach(el => { el.textContent = insights[Number(el.dataset.agriconInsight)]; });
    all('[data-agricon-overview-insight]').forEach(el => {
      el.textContent = `${number(funnel.hq_pending)} FA-approved records are awaiting HQ; ${number(funnel.stages[3].count)} have been posted to ERP.`;
    });
  }

  function render(data) {
    window.DashboardUI?.report('agricon', data);
    for (const name of names) {
      const metric = data.metrics[name];
      const description = `${metric.definition} Source: ${data.source_label}. ${data.period.start} to ${data.period.end} · Asia/Jakarta. ` +
        `Previous period: ${data.previous_period.start} to ${data.previous_period.end}. ` +
        `FA decisions: ${data.counts.fa_decisions}; approved: ${data.counts.fa_approved_count}; ` +
        `HQ verified: ${data.counts.hq_verified_count}; pending: ${data.counts.hq_pending_count}; disapproved: ${data.counts.hq_disapproved_count}. ` +
        (name === 'execution_success' ? `Processing runs: ${data.counts.processing_successful_count} successful, ${data.counts.processing_failed_count} failed, ${data.counts.processing_completed_count} completed; ${data.counts.processing_noncompleted_count} other statuses excluded. ` : '') +
        `FA-rejected/HQ-verified conflicts excluded from HQ numerator: ${data.counts.rejected_but_hq_verified}. ` +
        `Excluded user rows without session IDs: ${data.excluded_rows.missing_user_session_ids}. FA user rows without ERP account IDs: ${data.excluded_rows.missing_fa_account_ids}. ` +
        `Updated ${data.last_updated}.${data.stale ? ' Stale: ' + data.refresh_error : ''}`;
      all(`[data-agricon-value="${name}"]`).forEach(el => {
        el.firstChild.textContent = metric.value === null ? '—' : countNames.includes(name)
          ? new Intl.NumberFormat('en-US').format(metric.value) : metric.value.toFixed(1);
        const unit = el.querySelector('span');
        if (unit) unit.hidden = metric.value === null;
        el.title = description;
      });
      all(`[data-agricon-change="${name}"]`).forEach(el => {
        const delta = metric.change;
        el.textContent = data.stale ? 'Stale' : delta === null ? '—' :
          `${delta > 0 ? '▲' : delta < 0 ? '▼' : '→'} ${Math.abs(delta).toFixed(1)}${metric.change_unit === 'points' ? ' pts' : '%'}`;
        el.parentElement.lastChild.textContent = data.stale ? ' · last successful data' : ' vs prior 4 wks';
        el.parentElement.title = description;
      });
    }
    renderCharts(data);
  }

  function unavailable(message) {
    window.DashboardUI?.report('agricon', {state:'error',error:message});
    names.forEach(name => {
      all(`[data-agricon-value="${name}"]`).forEach(el => {
        el.firstChild.textContent = '—';
        const unit = el.querySelector('span');
        if (unit) unit.hidden = true;
        el.title = message;
      });
      all(`[data-agricon-change="${name}"]`).forEach(el => {
        el.textContent = 'Unavailable';
        el.parentElement.lastChild.textContent = '';
        el.parentElement.title = message;
      });
    });
    all('[data-agricon-approval-chart]').forEach(el => {
      window.DashboardUI.empty(el);
      el.title = message;
    });
    all('[data-agricon-pipeline]').forEach(el => {
      el.querySelector('.val b').textContent = '—';
      el.querySelector('.val em').textContent = '—';
      el.querySelector('.fill').style.width = '0%';
      el.title = message;
    });
    all('[data-agricon-pipeline-note], [data-agricon-rejections-note]').forEach(el => {
      el.textContent = 'Unavailable';
      el.title = message;
    });
    all('[data-agricon-rejections]').forEach(el => { el.textContent = '—'; el.title = message; });
    all('[data-agricon-processing], [data-agricon-funnel]').forEach(el => {
      const w = Number(el.dataset.width) || 684, h = Number(el.dataset.height) || 282;
      window.DashboardUI.empty(el);
      el.title = message;
    });
    all('[data-agricon-insight], [data-agricon-overview-insight]').forEach(el => { el.textContent = 'Data unavailable.'; el.title = message; });
  }

  async function load(force=false) {
    clearTimeout(timer);
    if (loading) return;
    loading=true;
    window.DashboardUI?.report('agricon', {state:'loading'});
    if (location.protocol === 'file:') {
      unavailable('Start python3 server.py and open the dashboard through localhost.');
      loading=false;
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 195000);
    try {
      const response = await window.DashboardAPI.fetch(`/api/agricon/metrics${force?'?refresh=1':''}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Agricon data unavailable.');
      for (const name of names) {
        const metric = data.metrics?.[name];
        if (!metric || (metric.value !== null && (!Number.isFinite(metric.value) || metric.value < 0 ||
          (countNames.includes(name) ? !Number.isSafeInteger(metric.value) : metric.value > 100))) ||
          (metric.change !== null && !Number.isFinite(metric.change))) {
          throw new Error('Invalid Agricon KPI response.');
        }
      }
      if (!data.period || !data.previous_period || !data.counts || !data.excluded_rows) {
        throw new Error('Incomplete Agricon KPI response.');
      }
      const count = value => Number.isSafeInteger(value) && value >= 0;
      const rate = value => value === null || (Number.isFinite(value) && value >= 0 && value <= 100);
      const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
      const funnel = data.review_funnel;
      if (!funnel || !Array.isArray(funnel.stages) || funnel.stages.length !== 4 ||
          funnel.stages.some((stage, index) => !count(stage.count) || (index > 0 && stage.count > funnel.stages[index-1].count)) ||
          funnel.stages[0].count !== data.counts.fa_decisions ||
          funnel.stages[1].count !== data.counts.fa_approved_count ||
          funnel.stages[2].count !== data.counts.hq_verified_count ||
          funnel.stages[3].count !== data.counts.erp_posted_count ||
          !count(funnel.fa_rejected) || funnel.fa_rejected !== data.rejection_reasons?.total ||
          !data.processing || !Array.isArray(data.weekly_processing) || data.weekly_processing.length !== 12 ||
          data.weekly_processing.some(week => !date(week.start) || !date(week.end) ||
            (week.median_seconds !== null && (!Number.isFinite(week.median_seconds) || week.median_seconds < 0)) ||
            !count(week.run_count) || !count(week.timed_run_count) || week.timed_run_count > week.run_count)) {
        throw new Error('Agricon review funnel or processing data does not reconcile. Restart python3 server.py after updating code.');
      }
      if (!Array.isArray(data.weekly_approvals) || data.weekly_approvals.length !== 12 ||
          data.weekly_approvals.some(week => !date(week.start) || !date(week.end) ||
            !rate(week.fa_approved) || !rate(week.hq_approved) ||
            !count(week.fa_decisions) || !count(week.fa_approved_count) || !count(week.hq_verified_count)) ||
          !data.pipeline || !count(data.pipeline.reviewed) || !count(data.pipeline.fa_approved) || !count(data.pipeline.hq_approved) ||
          !data.rejection_reasons || !count(data.rejection_reasons.total) || !Array.isArray(data.rejection_reasons.rows) ||
          data.rejection_reasons.rows.some(row => !count(row.count)) ||
          !count(data.rejection_reasons.missing_reason_count) ||
          data.rejection_reasons.rows.reduce((total, row) => total + row.count, 0) + data.rejection_reasons.missing_reason_count !== data.rejection_reasons.total ||
          data.weekly_approvals.slice(-4).reduce((total, week) => total + week.fa_decisions, 0) !== data.counts.fa_decisions) {
        throw new Error('Agricon chart data is incomplete or does not reconcile. Restart python3 server.py after updating code.');
      }
      render(data);
      lastGood = data;
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Agricon refresh timed out.' : error.message;
      if (lastGood) { lastGood={...lastGood,stale:true,refresh_error:message}; render(lastGood); }
      else unavailable(message);
    } finally {
      loading=false;
      clearTimeout(timeout);
      timer = setTimeout(load, lastGood ? 5 * 60 * 1000 : 15000);
    }
  }
  window.addEventListener('dashboard:refresh',event=>{if(['all','agricon'].includes(event.detail.source))load(true);});
  for (const event of ['dashboard:pagechange','dashboard:resize']) window.addEventListener(event,()=>{if(lastGood && !loading) render(lastGood);});
  load();
})();
