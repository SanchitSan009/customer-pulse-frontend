/* Canon product-discovery metrics from one live source snapshot. */
(() => {
  const all = selector => [...document.querySelectorAll(selector)].filter(el=>!el.closest('.overview'));
  const status = document.querySelector('[data-canon-status]');
  const refresh = document.querySelector('[data-canon-refresh]');
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const number = value => new Intl.NumberFormat('en-IN').format(value);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const accent = '#EF4444';
  const names = ['avg_user_turns', 'unique_products', 'comparison_chats', 'store_enquiries'];
  let lastGood = null;
  let loading = false;
  let timer;

  function setValue(selector, value, title, stale) {
    all(selector).forEach(el => {
      el.textContent = value;
      el.title = title;
    });
  }

  function render(snapshot) {
    const data=snapshot.detail?{...snapshot,...snapshot.detail}:snapshot;
    window.DashboardUI?.report('canon', data);
    const d = data.discovery;
    const prefix = `${data.stale ? 'Stale: ' + data.refresh_error + '. ' : ''}${data.period?`${data.period.start} to ${data.period.end} IST · Last 4 completed weeks`:'All available data'} · ${data.source_label}. Updated ${data.last_updated}. `;
    const coverage = `${data.source_rows} source rows; ${data.excluded_rows.missing_user_session_ids} user rows without session IDs; ${data.invalid_user_timestamps} invalid user timestamps. `;
    const definitions = d.definitions;
    setValue('[data-canon-conversations-value]', number(data.value), prefix + coverage + data.definition, data.stale);
    names.forEach(name => {
      const value = d.metrics[name];
      setValue(`[data-canon-value="${name}"]`, value === null ? '—' : number(value), prefix + coverage + definitions[name], data.stale);
    });
    status.textContent = data.stale ? 'Stale · last successful data' : `Updated ${data.last_updated}`;
    status.title = prefix + coverage;
    document.querySelector('[data-canon-source]').textContent = `${data.period?'Last 4 completed weeks · IST':'All available data'} · ${data.source_label}`;
    if (!d.available) { clearCharts('Discovery fields are unavailable in this source.'); return; }

    const stages = d.funnel.stages;
    all('[data-canon-funnel-note]').forEach(el => {
      el.textContent = `${data.stale ? 'Stale · ' : ''}${number(data.value)} chats`;
      el.title = prefix + d.funnel.definition;
    });
    all('[data-canon-funnel-row]').forEach(el => {
      const stage = stages[Number(el.dataset.canonFunnelRow)];
      el.querySelector('.val b').textContent = number(stage.count);
      el.querySelector('.val em').textContent = data.value ? `${(stage.count / data.value * 100).toFixed(1)}%` : '—';
      el.querySelector('.fill').style.width = data.value ? `${stage.count / data.value * 100}%` : '0%';
      el.title = prefix + d.funnel.definition;
    });
    all('[data-canon-depth-note]').forEach(el=>{
      el.textContent=`${data.stale?'Stale · ':''}${number(d.depth.total)} chats`;
      el.title=prefix+d.depth.definition;
    });
    all('[data-canon-depth]').forEach(el => {
      window.DashboardUI.conversationDepth(el,d.depth,accent);
      el.title = prefix + d.depth.definition;
    });
    all('[data-canon-activity]').forEach(el=>{
      window.DashboardUI.activityHeatmap(el,d.activity,accent);
      el.title=prefix+d.activity.definition+` ${d.activity.excluded_undated_sessions} sessions have no valid start timestamp.`;
    });
    all('[data-canon-weekly]').forEach(el => {
      const w = window.DashboardUI.chartWidth(el,Number(el.dataset.width)), h = Number(el.dataset.height);
      const labels = d.weekly.map(week => new Date(`${week.start}T00:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}));
      const series = Number(el.dataset.width) < 500 ? [{values:d.weekly.map(week=>week.matched)}] : [
        {values:d.weekly.map(week=>week.searched)},
        {values:d.weekly.map(week=>week.matched),color:'#FCA5A5',below:true},
      ];
      el.innerHTML = svgTrend({w,h,labelSize:w<500?10:15,min:0,bottomPadding:w<500?32:64,
        max:Math.max(1,Math.ceil(Math.max(...d.weekly.map(week=>week.searched))*1.25)),
        title:'Discovery chats per week',type:'line',fmt:value=>number(value),weeks:labels,
        everyOther:w<500,series},accent);
      el.title = `${prefix}${d.weekly[0].start} to ${d.weekly[11].end} IST. Twelve complete weeks; last four shaded. Counts are user-started session cohorts with sequential searches and matches. KPI totals cover all available data.`;
    });
    all('[data-canon-printers-note]').forEach(el=>{el.textContent=`${number(d.sessions_with_cards)} chats with cards`;el.title=prefix;});
    all('[data-canon-printers]').forEach(el=>{
      const maximum=Math.max(1,...d.top_printers.map(row=>row.sessions));
      el.innerHTML=d.top_printers.map(row=>`<div class="rk"><span class="rl" title="${escape(row.name)}">${escape(row.name)}</span><div class="rt"><div class="rf" style="width:${row.sessions/maximum*100}%;background:${accent}"></div></div><span class="rv"><b>${number(row.sessions)}</b><em>${d.sessions_with_cards?(row.sessions/d.sessions_with_cards*100).toFixed(1)+'%':'—'}</em></span></div>`).join('') || '<span class="rl">No printer cards recorded</span>';
      el.title=prefix+'Top five printers by distinct sessions shown their product card. Repeated cards count once per product per chat; a chat may see multiple products. Percentages use all chats with product cards.';
    });
    all('[data-canon-types]').forEach(el=>{
      const rows=d.printer_types.filter(row=>row.sessions>0);
      window.DashboardUI.categories(el,rows,accent);
      el.title=prefix+'Distinct chats shown a printer card in each catalog category. Categories can overlap within a chat. These are displayed recommendations, not verified preferences or sales.';
    });
    const reach=data.value?(stages[2].count/data.value*100).toFixed(1):'0.0';
    const notes=[
      `${number(stages[2].count)} chats (${reach}%) received product cards after a search.`,
      d.top_printers.length?`${d.top_printers[0].name} was shown in ${number(d.top_printers[0].sessions)} distinct chats.`:'No printer recommendations recorded.',
      `${number(stages[3].count)} chats continued after matches; average depth was ${number(d.metrics.avg_user_turns ?? 0)} user messages per chat.`,
    ];
    all('[data-canon-insight]').forEach(el=>{el.textContent=notes[Number(el.dataset.canonInsight)];el.title=prefix;});
    all('[data-canon-overview-insight]').forEach(el=>{el.textContent=notes[0];el.title=prefix;});
  }

  function clearCharts(message) {
    all('[data-canon-weekly], [data-canon-activity], [data-canon-depth], [data-canon-types]').forEach(el=>{
      const w=Number(el.dataset.width)||684,h=Number(el.dataset.height)||282;
      window.DashboardUI.empty(el);
      el.title=message;
    });
    all('[data-canon-funnel-row]').forEach(el=>{el.querySelector('.val b').textContent='—';el.querySelector('.val em').textContent='—';el.querySelector('.fill').style.width='0%';el.title=message;});
    all('[data-canon-printers], [data-canon-funnel-note], [data-canon-depth-note], [data-canon-printers-note], [data-canon-insight], [data-canon-overview-insight]').forEach(el=>{el.textContent='Unavailable';el.title=message;});
  }

  async function load(force=false) {
    clearTimeout(timer);
    if (loading) return;
    loading=true;
    window.DashboardUI?.report('canon', {state:'loading'});
    if(location.protocol==='file:'){clearCharts('Start python3 server.py and open the localhost dashboard.');status.textContent='Start local server to connect';refresh.disabled=true;loading=false;window.DashboardUI?.report('canon',{state:'error',error:'Start python3 server.py to connect.'});return;}
    refresh.disabled=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),195000);
    try{
      const response=await window.DashboardAPI.fetch(`/api/canon/conversations${force?'?refresh=1':''}`,{cache:'no-store',signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Canon data unavailable.');
      const d=data.discovery;
      if(!count(data.value)||!d||!d.metrics||!d.definitions||!data.excluded_rows||
        !Array.isArray(d.weekly)||d.weekly.length!==12||d.weekly.some(week=>!/^\d{4}-\d{2}-\d{2}$/.test(week.start)||!count(week.searched)||!count(week.matched)||week.matched>week.searched)||
        !Array.isArray(d.funnel?.stages)||d.funnel.stages.length!==4||d.funnel.stages[0].count!==data.value||d.funnel.stages.some((stage,i)=>!count(stage.count)||(i>0&&stage.count>d.funnel.stages[i-1].count))||
        names.some(name=>d.metrics[name]!==null&&(name==='avg_user_turns'?(!Number.isFinite(d.metrics[name])||d.metrics[name]<0):!count(d.metrics[name])))||
        !Array.isArray(d.top_printers)||d.top_printers.some(row=>!count(row.sessions))||!Array.isArray(d.printer_types)||d.printer_types.some(row=>!count(row.sessions))||!count(d.sessions_with_cards))throw new Error('Canon discovery data is incomplete or does not reconcile. Restart python3 server.py after code updates.');
      const activity=d.activity;
      if(!activity || activity.timezone!=='Asia/Kolkata' || !Array.isArray(activity.counts) || activity.counts.length!==7 ||
        activity.counts.some(row=>!Array.isArray(row)||row.length!==24||row.some(value=>!count(value))) ||
        !count(activity.total)||!count(activity.excluded_undated_sessions)||
        activity.counts.flat().reduce((sum,value)=>sum+value,0)!==activity.total||
        activity.total+activity.excluded_undated_sessions!==data.value||
        (activity.total>0 && (!/^\d{4}-\d{2}-\d{2}$/.test(activity.start)||!/^\d{4}-\d{2}-\d{2}$/.test(activity.end))))
        throw new Error('Canon activity data is incomplete. Restart python3 server.py after updating code.');
      const depth=d.depth;
      const depthKeys=['one','two_three','four_six','seven_plus'];
      if(!depth || depth.total!==data.value || !Array.isArray(depth.buckets) || depth.buckets.length!==4 ||
        depth.buckets.some((bucket,i)=>bucket.key!==depthKeys[i]||!count(bucket.chats)) ||
        depth.buckets.reduce((sum,bucket)=>sum+bucket.chats,0)!==depth.total ||
        depth.multiple_message_chats!==depth.total-depth.buckets[0].chats)
        throw new Error('Canon conversation-depth data does not reconcile. Restart python3 server.py after updating code.');
      const detail=data.detail;
      if(!detail || !count(detail.value) || !detail.period || !/^\d{4}-\d{2}-\d{2}$/.test(detail.period.start) || !/^\d{4}-\d{2}-\d{2}$/.test(detail.period.end) ||
        !detail.discovery || detail.discovery.funnel.stages[0].count!==detail.value ||
        detail.discovery.depth.buckets.reduce((sum,bucket)=>sum+bucket.chats,0)!==detail.value ||
        detail.discovery.activity.counts.flat().reduce((sum,n)=>sum+n,0)!==detail.value)
        throw new Error('Canon four-week metrics do not reconcile. Restart python3 server.py after updating code.');
      render(data);lastGood=data;
    }catch(error){
      const message=error.name==='AbortError'?'Canon refresh timed out.':error.message;
      if(lastGood){lastGood={...lastGood,stale:true,refresh_error:message};render(lastGood);}
      else{window.DashboardUI?.report('canon',{state:'error',error:message});setValue('[data-canon-conversations-value], [data-canon-value]','—',message,true);clearCharts(message);status.textContent='Data unavailable';status.title=message;}
    }finally{loading=false;clearTimeout(timeout);refresh.disabled=false;timer=setTimeout(()=>load(),lastGood?5*60*1000:15000);}
  }
  refresh.addEventListener('click',()=>load(true));
  window.addEventListener('dashboard:refresh',event=>{if(['all','canon'].includes(event.detail.source))load(true);});
  for (const event of ['dashboard:pagechange','dashboard:resize']) window.addEventListener(event,()=>{if(lastGood && !loading) render(lastGood);});
  load();
})();
