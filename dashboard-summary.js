/* All-time summary strip, period-scoped source cards and weekly trends. */
(() => {
  let lastGood=null,loading=false,timer;
  const number=value=>new Intl.NumberFormat('en-IN').format(value);
  const count=value=>Number.isSafeInteger(value)&&value>=0;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const one=selector=>document.querySelector('.overview '+selector);
  const write=(root,selector,value,unit='')=>root.querySelectorAll(selector).forEach(el=>{
    el.innerHTML=value==null?'—':number(value)+(unit?`<span style="font-size:24px">${unit}</span>`:'');
  });
  const weekLabel=day=>new Date(day+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
  window.DashboardSummary={header:'All time · Connecting live sources'};
  function rows(card,selector,stages){
    const base=stages[0]?.count;
    card.querySelectorAll(selector).forEach((el,i)=>{
      const value=stages[i]?.count;
      el.querySelector('.val b').textContent=value==null?'—':number(value);
      el.querySelector('.val em').textContent=base&&value!=null?(value/base*100).toFixed(1)+'%':'—';
      el.querySelector('.fill').style.width=base&&value!=null?(value/base*100)+'%':'0%';
    });
  }
  function trend(el,records,field,accent,title,type='line',height=160){
    if(!el)return;
    if(!records.length){window.DashboardUI.empty(el,'No recorded activity');return;}
    const values=records.map(row=>row[field]);
    el.style.height=height+'px';
    const width=window.DashboardUI.chartWidth(el,556);
    el.innerHTML=svgTrend({w:width,h:height,min:0,max:Math.max(1,...values.filter(v=>v!=null))*(type==='bar'?1.12:1.25),
      weeks:records.map(row=>weekLabel(row.start)),title,type,shadeCount:4,everyOther:true,labelSize:12,labelAll:true,
      fmt:value=>field==='median_seconds'?Number(value.toFixed(1))+'s':number(value),series:[{values}]},accent);
    el.title='12 calendar weeks · '+title+'. Last 4 reporting weeks highlighted; missing durations leave gaps.';
  }
  const trendKeys={piOrders:'orders',piInteractions:'interactions',agriconConversations:'conversations',
    agriconActiveFAs:'active_fas',agriconProcessingRuns:'processing_runs',
    canonAvgTurns:'avg_user_turns',canonProductsShown:'unique_products'};
  function renderTrends(card,data,source){
    card.querySelectorAll('[data-overview-kpi]').forEach(kpi=>{
      const metric=data.trends?.[trendKeys[kpi.dataset.overviewKpi]],row=kpi.querySelector('[data-overview-trend]');
      if(!row)return;
      const label=row.querySelector('b'),suffix=row.querySelector('.comparison-label');
      const delta=metric?.change_percent;
      const valid=typeof delta==='number'&&Number.isFinite(delta);
      const stale=source.status==='stale';
      row.dataset.direction=stale||!valid?'unknown':delta>0?'up':delta<0?'down':'flat';
      label.textContent=stale?'Stale':!valid?'No comparison':`${delta>0?'▲':delta<0?'▼':'→'} ${Math.abs(delta).toFixed(1)}%`;
      suffix.textContent='vs prior 4 wks';suffix.hidden=stale||!valid;
      row.title=`${data.period.start} to ${data.period.end}. Previous: ${data.previous_period?.start||'unavailable'} to ${data.previous_period?.end||'unavailable'}. `+
        (metric?`Current ${metric.value??'unavailable'}; previous ${metric.previous_value??'unavailable'}. `:'')+
        (stale?'Last successful snapshot.':valid?'Percentage change against the prior period.':'No comparable prior value; a zero or missing baseline has no percentage change.');
    });
  }
  function renderCards(data){
    for(const source of data.sources){
      const card=one(`[data-source="${source.key}"]`),d=data.overview[source.key];
      if(!card)continue;
      card.dataset.status=source.status==='live'?'ready':source.status==='unavailable'?'error':'stale';
      const period=d?.period;
      const scope=period?`${weekLabel(period.start)} – ${weekLabel(period.end)} · ${d.report_timezone==='Asia/Jakarta'?'WIB':'IST'} · ${source.key==='pi'?'includes current week':'4 completed weeks'}`:'Reporting period unavailable';
      card.title=`${scope} · ${source.label}. Updated ${source.last_updated||'not available'}. ${source.error||''}`;
      const periodLabel=card.querySelector('[data-overview-period]');if(periodLabel)periodLabel.textContent=scope;
      if(!d){
        card.querySelectorAll('.kpi .v,.val b,.val em').forEach(el=>el.textContent='—');
        card.querySelectorAll('.fill').forEach(el=>el.style.width='0%');
        card.querySelectorAll('.chart').forEach(el=>window.DashboardUI.empty(el,'Source unavailable'));
        card.querySelectorAll('[data-overview-change]').forEach(el=>{el.textContent='Unavailable';});
        card.querySelectorAll('[data-overview-trend] .comparison-label').forEach(el=>{el.hidden=true;});
        const p=card.querySelector('.insight p');if(p)p.textContent='Source unavailable. No totals inferred.';
        continue;
      }
      if(source.key==='pi'){
        write(card,'[data-pi-orders-value]',d.orders);write(card,'[data-pi-interactions-value]',d.interactions);
        trend(card.querySelector('[data-pi-orders-mini]'),d.weekly_orders,'count','#2DBD7F','Orders per week','bar',160);
        rows(card,'[data-pi-funnel-row]',d.funnel.stages);
        write(card,'[data-pi-funnel-note]',null);
        const note=card.querySelector('[data-pi-funnel-note]');if(note)note.textContent=d.funnel.available?number(d.funnel.stages[0].count)+' journeys':'Unavailable';
        const p=card.querySelector('[data-pi-product-insight]');
        if(p)p.textContent=d.funnel.available?`${number(d.funnel.product_enquiries)} product-enquiry journeys.`:'Journey data unavailable.';
      }else if(source.key==='agricon'){
        for(const name of ['conversations','active_fas','processing_runs'])write(card,`[data-agricon-value="${name}"]`,d[name]);
        trend(card.querySelector('[data-agricon-processing]'),d.weekly_processing,'median_seconds','#695DEC','Invoice processing time per week');
        rows(card,'[data-agricon-pipeline]',d.pipeline.map(count=>({count})));
        const note=card.querySelector('[data-agricon-pipeline-note]');if(note)note.textContent=number(d.pipeline[0])+' reviewed';
        const p=card.querySelector('[data-agricon-overview-insight]');if(p)p.textContent=`Awaiting HQ: ${number(d.hq_pending)} · Posted to ERP: ${number(d.pipeline[3])}`;
      }else{
        write(card,'[data-canon-value="avg_user_turns"]',d.metrics.avg_user_turns);write(card,'[data-canon-value="unique_products"]',d.metrics.unique_products);
        trend(card.querySelector('[data-canon-weekly]'),d.weekly,'matched','#EF4444','Discovery chats per week');
        rows(card,'[data-canon-funnel-row]',d.funnel.stages);
        const note=card.querySelector('[data-canon-funnel-note]');if(note)note.textContent=number(d.total)+' chats';
        const p=card.querySelector('[data-canon-overview-insight]');if(p)p.textContent=`${number(d.funnel.stages[2].count)} chats received product cards.`;
      }
      renderTrends(card,d,source);
      card.querySelectorAll('.kpi .v,.rows,.insight p,[data-pi-funnel-note],[data-agricon-pipeline-note],[data-canon-funnel-note]').forEach(el=>{el.title=card.title;});
    }
  }
  function renderWeekly(data){
    const el=one('[data-total-weekly]'),latest=one('[data-total-latest]');
    const records=data.weekly.slice(-12);
    latest.textContent=records.length&&records.at(-1).value!=null?number(records.at(-1).value):'—';
    if(!records.length&&data.metrics.conversations.value===0){latest.textContent='0';el.innerHTML='<span class="summary-unavailable">No conversations recorded</span>';return;}
    if(!records.length||records.some(row=>row.value==null)){
      el.innerHTML='<svg width="548" height="62" viewBox="0 0 548 62"><text x="274" y="36" text-anchor="middle" font-size="13" class="tp">Weekly totals unavailable</text></svg>';return;
    }
    const w=548,h=62,band=w/records.length,base=60,top=20,max=Math.max(1,...records.map(row=>row.value));
    let svg=`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Last 12 weeks of chats and PI journeys from connected sources; last 4 weeks highlighted">`;
    svg+=`<rect x="${band*Math.max(0,records.length-4)}" y="0" width="${band*Math.min(4,records.length)}" height="${h}" rx="6" fill="#FFFFFF" opacity="0.045"/>`;
    records.forEach((row,i)=>{
      const y=base-row.value/max*(base-top),x=band*(i+.5),bw=Math.min(28,band*.65);
      svg+=`<path d="${barPath(x-bw/2,y,base,bw)}" fill="#019EFF" opacity="${i>=records.length-4?1:.4}"><title>${row.start} to ${row.end}: ${number(row.value)} chats / journeys</title></path>`;
      svg+=`<text x="${x}" y="${y-6}" font-size="11" text-anchor="middle" class="${i>=records.length-4?'tw':'tp'}">${number(row.value)}</text>`;
    });
    el.innerHTML=svg+'</svg>';
    el.title='Latest 12 calendar weeks in IST, including the latest partial week. Last 4 weeks highlighted. Undated starts cannot be placed on the chart.';
  }
  function render(data){
    window.DashboardSummary.header='All time · '+data.sources.filter(s=>s.status!=='unavailable').length+'/3 connected sources'+(data.stale?' · Stale snapshot':'');
    window.dispatchEvent(new CustomEvent('dashboard:summary'));
    const strip=one('.live-summary');strip.dataset.summaryStatus=data.stale?'stale':data.complete?'ready':'incomplete';
    for(const [key,metric] of Object.entries(data.metrics)){
      const el=one(`[data-total="${key}"]`),note=one(`[data-total-note="${key}"]`);
      el.textContent=metric.value==null?'—':number(metric.value);
      const contributors=Object.keys(metric.contributors||{});
      const stale=data.sources.some(source=>contributors.includes(source.key)&&source.status==='stale');
      note.textContent=key==='agents'?`${metric.chat} chat · ${metric.voice} voice`:metric.value==null?'Unavailable':stale?'Stale · all time':'All time';
      el.closest('.tile').title=metric.definition+(metric.contributors?' Contributions: '+JSON.stringify(metric.contributors):'');
    }
    renderCards(data);renderWeekly(data);
  }
  function validate(data){
    if(data.scope!=='all_available_data'||data.report_timezone!=='Asia/Kolkata'||!Array.isArray(data.sources)||data.sources.length!==3||!data.overview||!Array.isArray(data.weekly))throw Error('Invalid landing-page summary.');
    for(const key of ['agents','conversations','orders','invoices_reviewed'])if(!data.metrics?.[key]||(data.metrics[key].value!==null&&!count(data.metrics[key].value)))throw Error('Invalid live summary metric.');
    if(data.weekly.some(row=>!/^\d{4}-\d{2}-\d{2}$/.test(row.start)||(row.value!==null&&!count(row.value))))throw Error('Invalid weekly live summary.');
    for(const [key,card] of Object.entries(data.overview)) {
      if(!['pi','agricon','canon'].includes(key)||!card.period||!/^\d{4}-\d{2}-\d{2}$/.test(card.period.start)||!/^\d{4}-\d{2}-\d{2}$/.test(card.period.end))throw Error('Invalid source card period.');
      const weeks=key==='pi'?card.weekly_orders:key==='agricon'?card.weekly_processing:card.weekly;
      if(!Array.isArray(weeks)||weeks.length!==12||weeks.some(row=>!/^\d{4}-\d{2}-\d{2}$/.test(row.start)))throw Error('Invalid source card weekly series.');
    }
    const parts=Object.values(data.metrics.conversations.contributors);
    if(parts.every(count)&&parts.reduce((sum,n)=>sum+n,0)!==data.metrics.conversations.value)throw Error('Live conversation totals do not reconcile.');
  }
  async function load(){
    if(loading)return;loading=true;clearTimeout(timer);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),210000);
    try{
      const response=await window.DashboardAPI.fetch('/api/dashboard/summary',{cache:'no-store',signal:controller.signal});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Live totals unavailable');validate(data);render(data);lastGood=data;
    }catch(error){
      if(lastGood)render({...lastGood,stale:true,sources:lastGood.sources.map(source=>({...source,status:source.status==='unavailable'?'unavailable':'stale'}))});
      else{
        window.DashboardSummary.header='All time · Live summary unavailable';window.dispatchEvent(new CustomEvent('dashboard:summary'));
        document.querySelectorAll('[data-total-note]').forEach(el=>el.textContent='Unavailable');
        const el=one('[data-total-weekly]');el.innerHTML='<span class="xl">Live summary unavailable</span>';el.title=error.message;
      }
    }finally{loading=false;clearTimeout(timeout);timer=setTimeout(load,lastGood?.complete?5*60*1000:15000);}
  }
  window.addEventListener('dashboard:pagechange',()=>{if(lastGood)renderCards(lastGood);});
  window.addEventListener('dashboard:resize',()=>{if(lastGood)renderCards(lastGood);});
  window.addEventListener('dashboard:refresh',()=>setTimeout(load,1000));
  load();
})();
