/* Live data bindings only. Layout, typography and chart rendering stay in HTML. */
(() => {
  let lastGood = null;
  let loading = false;
  let refreshTimer;
  const all = selector => [...document.querySelectorAll(selector)].filter(el=>!el.closest('.overview'));
  const set = (selector, value) => all(selector).forEach(el => { el.textContent = value; });
  const format = value => new Intl.NumberFormat('en-IN').format(value);
  const delta = value => value === null ? '—'
    : `${value < 0 ? '▼' : value > 0 ? '▲' : '→'} ${Math.abs(value).toFixed(1)}%`;

  function title(selector, message) {
    all(selector).forEach(el => { el.title = message; });
  }

  function drawOrders(days) {
    const values = days.map(day => day.count);
    const labels = days.map(day => new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', {
      month: 'short', day: 'numeric', timeZone: 'UTC',
    }));
    const weekdays = days.map(day => new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }));
    const maximum = Math.max(1, Math.ceil(Math.max(...values) * 1.08));
    // Keep the existing chart styling with fourteen daily bars, weekday labels and the latest seven highlighted.
    all('[data-pi-orders-mini]').forEach(el => {
      el.outerHTML = miniTrend({ title: 'Orders per day', liveMetric: 'piOrders',
        type: 'bar', values, weeks: labels, weekdays, shadeCount: 7, max: maximum, fmt: String }, '#2DBD7F');
    });
    all('[data-pi-orders-main]').forEach(el => {
      el.outerHTML = svgTrend({ title: 'Orders per day', liveMetric: 'piOrders',
        type: 'bar', w: window.DashboardUI.chartWidth(el,984), h: 282, labelSize: 15, series: [{ values }],
        weeks: labels, weekdays, shadeCount: 7, max: maximum, fmt: String }, '#2DBD7F');
    });
  }

  function renderCartTime(data, metadata) {
    const metric = data.funnel.cart_to_order_time;
    const days = metric.daily;
    const samples = days.reduce((total, day) => total + day.count, 0);
    all('[data-pi-cart-time]').forEach(el => {
      el.innerHTML = window.DashboardUI.cartTimeChart(days, window.DashboardUI.chartWidth(el,526));
      el.title = `${metric.definition} ${metadata} Matched completions: ${samples}. ` + days.map(day => `${day.date}: ${day.count} completions; ${day.median_minutes === null ? 'no median' : `${day.median_minutes} min`}`).join('; ');
    });
    set('[data-pi-cart-time-note]', `${data.stale ? 'Stale · ' : ''}${!metric.available ? 'Unavailable' : !samples ? 'No matched completions' : 'Daily median · last 7 highlighted'}`);
  }

  function unavailable(message) {
    window.DashboardUI?.report('pi', {state:'error',error:message});
    all('[data-pi-cart-time]').forEach(el => { window.DashboardUI.empty(el); el.title = message; });
    set('[data-pi-cart-time-note]', 'Unavailable');
    clearFunnel(message);
    clearStates(message);
    set('[data-pi-interactions-value]', '—');
    set('[data-pi-interactions-change]', 'Unavailable');
    title('[data-pi-interactions-value], [data-pi-interactions-change]', message);
    set('[data-pi-repeat-orderers-value]', '—');
    set('[data-pi-repeat-orderers-change]', 'Unavailable');
    title('[data-pi-repeat-orderers-value], [data-pi-repeat-orderers-change]', message);
    set('[data-pi-orders-value], [data-pi-users-value], [data-pi-successful-orders-value]', '—');
    set('[data-pi-orders-change], [data-pi-users-change], [data-pi-successful-orders-change]', 'Unavailable');
    title('[data-pi-orders-value], [data-pi-users-value], [data-pi-successful-orders-value]', message);
    all('[data-pi-orders-mini], [data-pi-orders-main]').forEach(el => {
      window.DashboardUI.empty(el);
      el.setAttribute('aria-label', message);
    });
  }

  function clearFunnel(message) {
    all('[data-pi-funnel-row]').forEach(el => {
      el.querySelector('.val b').textContent = '—';
      el.querySelector('.val em').textContent = '';
      el.querySelector('.fill').style.width = '0%';
      el.title = message;
    });
    set('[data-pi-funnel-note]', 'Unavailable');
    set('[data-pi-product-insight], [data-pi-funnel-insight]', message);
  }

  function clearStates(message) {
    window.PIStateMap?.clear(message);
    set('[data-pi-states]', 'Unavailable');
    set('[data-pi-states-note]', '— orders');
    title('[data-pi-states], [data-pi-states-note]', message);
  }

  function renderStates(data, metadata) {
    const breakdown = data.orders.by_state;
    if (!breakdown.available) { clearStates('State data unavailable'); return; }
    window.PIStateMap?.render(breakdown, `${breakdown.definition} ${metadata}`, data.stale);
    const known = breakdown.rows.filter(row => row.state !== 'Unknown');
    const unknown = breakdown.rows.find(row => row.state === 'Unknown');
    const slots = 6 - (unknown ? 1 : 0);
    let displayed = known;
    if (known.length > slots) {
      const rest = known.slice(slots - 1);
      displayed = [...known.slice(0, slots - 1), {
        state: 'Others', count: rest.reduce((sum, row) => sum + row.count, 0),
        members: rest.map(row => `${row.state}: ${format(row.count)}`).join('; '),
      }];
    }
    if (unknown) displayed = [...displayed, unknown];
    const maximum = Math.max(1, ...displayed.map(row => row.count));
    all('[data-pi-states]').forEach(holder => {
      holder.replaceChildren();
      if (!displayed.length) holder.textContent = 'No confirmed orders in this period';
      displayed.forEach(row => {
        const el = document.createElement('div');
        el.className = 'rk';
        el.innerHTML = '<span class="rl"></span><div class="rt"><div class="rf"></div></div><span class="rv"><b></b><em></em></span>';
        el.querySelector('.rl').textContent = row.state;
        el.querySelector('.rv b').textContent = format(row.count);
        el.querySelector('.rv em').textContent = `${(row.count / breakdown.total * 100).toFixed(1)}%`;
        const fill = el.querySelector('.rf');
        fill.style.width = `${row.count / maximum * 100}%`;
        fill.style.background = row.state === 'Others' || row.state === 'Unknown' ? 'var(--muted-fill)' : '#2DBD7F';
        el.title = row.members || `${row.state}: ${format(row.count)} confirmed orders.`;
        holder.appendChild(el);
      });
    });
    set('[data-pi-states-note]', `${data.stale ? 'Stale · ' : ''}${format(breakdown.total)} orders`);
    title('[data-pi-states], [data-pi-states-note]', `${breakdown.definition} ${metadata}`);
  }

  function renderFunnel(data, metadata) {
    const funnel = data.funnel;
    if (!funnel.available) { clearFunnel('Journey data unavailable'); return; }
    const started = funnel.stages[0].count;
    const percent = value => value === null ? '—' : `${value.toFixed(1)}%`;
    all('[data-pi-funnel-row]').forEach(el => {
      const stage = funnel.stages[Number(el.dataset.piFunnelRow)];
      el.querySelector('.val b').textContent = format(stage.count);
      el.querySelector('.val em').textContent = percent(stage.percent_of_started);
      el.querySelector('.fill').style.width = `${started ? stage.count / started * 100 : 0}%`;
      el.title = `${funnel.definition} ${metadata} Conversion from previous stage: ${percent(stage.conversion_from_previous)}. Drop-off: ${stage.dropoff_from_previous}.`;
    });
    set('[data-pi-funnel-note]', `${data.stale ? 'Stale · ' : ''}${format(started)} journeys`);
    const productText = `${format(funnel.product_enquiries)} journeys (${percent(funnel.product_enquiry_percent)}) used product discovery. Optional branch; not required to order.`;
    set('[data-pi-product-insight]', productText);
    set('[data-pi-funnel-insight="0"]', productText);
    set('[data-pi-funnel-insight="1"]', `${format(funnel.direct_orders)} journeys ordered without a prior cart event; excluded from the main funnel.`);
    set('[data-pi-funnel-insight="2"]', `${percent(funnel.stages[2].conversion_from_previous)} of cart-presented journeys submitted an order within the reporting period.`);
    title('[data-pi-funnel-note], [data-pi-product-insight], [data-pi-funnel-insight]', `${funnel.definition} ${metadata} Data coverage: ${JSON.stringify(funnel.coverage)}.`);
  }

  function render(data) {
    window.DashboardUI?.report('pi', data);
    const orders = data.orders;
    const updated = new Date(data.last_updated).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const metadata = `${data.period.start} to ${data.period.end} IST, including the current partial week. Comparison: ${data.previous_period.start} to ${data.previous_period.end} IST. Updated ${updated} IST.${data.stale ? ` Stale: ${data.refresh_error}` : ''}`;
    renderFunnel(data, metadata);
    renderStates(data, metadata);
    renderCartTime(data, metadata);
    set('[data-pi-interactions-value]', format(data.interactions.count));
    set('[data-pi-interactions-change]', data.stale ? 'Stale' : delta(data.interactions.change_percent));
    title('[data-pi-interactions-value], [data-pi-interactions-change]', `${data.interactions.definition} ${metadata} Rows without message IDs: ${data.interactions.missing_message_ids}.`);
    const repeat = orders.repeat_orderers;
    set('[data-pi-repeat-orderers-value]', repeat.count === null ? '—' : format(repeat.count));
    set('[data-pi-repeat-orderers-change]', data.stale ? 'Stale' : delta(repeat.change_percent));
    title('[data-pi-repeat-orderers-value], [data-pi-repeat-orderers-change]', `${repeat.definition} ${metadata} Excluded orders: ${repeat.orders_missing_customer} missing customer, ${repeat.orders_with_ambiguous_customer} ambiguous customer.`);
    set('[data-pi-users-value]', format(data.value));
    set('[data-pi-users-change]', data.stale ? 'Stale' : delta(data.change_percent));
    title('[data-pi-users-value], [data-pi-users-change]', `Distinct inbound customer IDs; distributor identity is not verified. ${metadata}`);
    set('[data-pi-orders-value]', orders.count === null ? '—' : format(orders.count));
    set('[data-pi-orders-change]', data.stale ? 'Stale' : delta(orders.change_percent));
    title('[data-pi-orders-value], [data-pi-orders-change]', `${orders.definition} ${orders.coverage.first_confirmation_dates} orders use first-confirmation dates. ${metadata}`);
    if (orders.count !== null) drawOrders(orders.trend_daily);
    const successful = orders.successful_orders;
    set('[data-pi-successful-orders-value]', successful.count === null ? '—' : format(successful.count));
    set('[data-pi-successful-orders-change]', data.stale ? 'Stale' : successful.unknown ? 'Incomplete' : delta(successful.change_percent));
    all('[data-pi-successful-orders-change]').forEach(el => {
      const suffix = el.parentElement.querySelector('.comparison-label');
      if (suffix) suffix.textContent = successful.unknown ? ` · ${successful.known}/${successful.total} matched` : ' vs prior 4 wks';
    });
    title('[data-pi-successful-orders-value], [data-pi-successful-orders-change]', `${successful.definition} ${metadata} Verified successful subset: ${successful.verified_count}. Current status coverage: ${successful.known}/${successful.total}. Unknown: ${successful.unknown}; previous cohort unknown: ${successful.previous_unknown}. Breakdown: ${JSON.stringify(successful.by_status)}.`);
    title('[data-pi-orders-mini], [data-pi-orders-main]', `${orders.definition} ${metadata}`);
  }

  function validate(data) {
    if (!data.interactions || !Number.isSafeInteger(data.interactions.count) || data.interactions.count < 0) throw new Error('Invalid PI interaction count.');
    if (!Number.isSafeInteger(data.value) || data.value < 0 || !data.orders) throw new Error('Invalid PI metrics.');
    const orders = data.orders;
    const successful = orders.successful_orders;
    if (!successful || !Number.isSafeInteger(successful.total) || successful.total < 0 ||
        !Number.isSafeInteger(successful.unknown) || successful.unknown < 0 || successful.unknown > successful.total ||
        successful.known + successful.unknown !== successful.total ||
        (orders.count !== null && successful.total !== orders.count) ||
        (successful.count !== null && (!Number.isSafeInteger(successful.count) || successful.count < 0 || successful.count > successful.known)) ||
        Object.values(successful.by_status || {}).reduce((sum, count) => sum + count, 0) !== successful.total) throw new Error('Invalid PI successful-order coverage.');
    if (!orders.by_state || (orders.by_state.available &&
        (!Array.isArray(orders.by_state.rows) || orders.by_state.total !== orders.count ||
         orders.by_state.rows.some(row => typeof row.state !== 'string' || !Number.isSafeInteger(row.count) || row.count <= 0) ||
         orders.by_state.rows.reduce((sum, row) => sum + row.count, 0) !== orders.count))) throw new Error('PI state counts do not reconcile.');
    if (!orders.repeat_orderers || (orders.repeat_orderers.count !== null &&
        (!Number.isSafeInteger(orders.repeat_orderers.count) || orders.repeat_orderers.count < 0))) throw new Error('Invalid PI repeat-orderer count.');
    if (!data.funnel || !Array.isArray(data.funnel.stages) || data.funnel.stages.length !== 3) throw new Error('Invalid PI journey funnel.');
    const timing = data.funnel.cart_to_order_time;
    if (!timing || !Array.isArray(timing.daily) || timing.daily.length !== 14 ||
        timing.daily.some((day, index) => day.date !== new Date(Date.parse(`${data.period.end}T00:00:00Z`) - (13 - index) * 86400000).toISOString().slice(0, 10) ||
          !Number.isSafeInteger(day.count) || day.count < 0 ||
          (day.count === 0 ? day.median_minutes !== null : !Number.isFinite(day.median_minutes) || day.median_minutes < 0))) throw new Error('Invalid PI cart-to-order timing.');
    if (data.funnel.available) {
      const counts = data.funnel.stages.map(stage => stage.count);
      if (counts.some(count => !Number.isSafeInteger(count) || count < 0) || counts[2] > counts[1] || counts[1] > counts[0] ||
          !Number.isSafeInteger(data.funnel.product_enquiries) || data.funnel.product_enquiries > counts[0]) throw new Error('PI journey stages do not reconcile.');
    }
    if (orders.count === null) return;
    if (!Number.isSafeInteger(orders.count) || orders.count < 0 ||
        !Array.isArray(orders.trend_daily) || orders.trend_daily.length !== 14 ||
        orders.trend_daily.some((day, index) => !Number.isSafeInteger(day.count) || day.count < 0 ||
          day.date !== new Date(Date.parse(`${data.period.end}T00:00:00Z`) - (13 - index) * 86400000).toISOString().slice(0, 10)) ||
        !Array.isArray(orders.weekly) || orders.weekly.reduce((sum, week) => sum + week.count, 0) !== orders.count) {
      throw new Error('PI order chart data is invalid.');
    }
  }

  async function load(force=false) {
    clearTimeout(refreshTimer);
    if (loading) return;
    loading=true;
    window.DashboardUI?.report('pi', {state:'loading'});
    if (location.protocol === 'file:') {
      unavailable('Run python3 server.py and open http://127.0.0.1:8000 for live data.');
      loading=false;
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75000);
    try {
      const response = await window.DashboardAPI.fetch(`/api/pi/metrics${force?'?refresh=1':''}`, { signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'PI data is unavailable.');
      validate(data);
      render(data);
      lastGood = data;
    } catch (error) {
      const message = error.name === 'AbortError' ? 'PI refresh timed out.' : error.message;
      if (lastGood) { lastGood={...lastGood,stale:true,refresh_error:message}; render(lastGood); }
      else unavailable(message);
    } finally {
      loading=false;
      clearTimeout(timeout);
      refreshTimer = setTimeout(load, lastGood ? 5 * 60 * 1000 : 15000);
    }
  }
  window.addEventListener('dashboard:refresh',event=>{if(['all','pi'].includes(event.detail.source))load(true);});
  for (const event of ['dashboard:pagechange','dashboard:resize']) window.addEventListener(event,()=>{if(lastGood && !loading) render(lastGood);});
  load();
})();
