/* Shared presentation and source state. Adapters remain responsible for data. */
(() => {
  const states = Object.fromEntries(['pi','agricon','canon'].map(key=>[key,{status:'loading'}]));
  const labels = {pi:'PI Industries',agricon:'Agricon',canon:'Canon',castrol:'Castrol'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => new Intl.NumberFormat('en-IN').format(value);
  const date = value => value ? new Date(value+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : '—';
  const scope = (source,data) => source==='canon' ? (data?.period?`${date(data.period.start)} – ${date(data.period.end)} · IST · 4 completed weeks`:'Last 4 completed weeks · IST') : data?.period ? `${date(data.period.start)} – ${date(data.period.end)} · ${source==='agricon'?'WIB · 4 completed weeks':'IST · includes current week'}` : 'Reporting period available after connection';
  const sourceStatus = state => ({ready:'Live',loading:state.data?'Refreshing':'Connecting',stale:'Stale',error:'Unavailable'})[state.status];
  const stateMarkup = (source,state) => `<span class="source-state" data-status="${state.status}"><i class="status-dot" aria-hidden="true"></i>${escape(labels[source])} · ${sourceStatus(state)}</span>`;
  function report(source, data) {
    const previous=states[source];
    if (data.state) states[source]={...previous,status:data.state,error:data.error};
    else states[source]={data,status:data.stale?'stale':'ready',error:data.refresh_error};
    queueMicrotask(paint);
  }
  function paint() {
    const current = document.querySelector('.page.on');
    const source=current?.dataset.source;
    Object.entries(states).forEach(([key,state])=>{
      document.querySelectorAll(`[data-source="${key}"]`).forEach(el=>{
        el.dataset.status=state.status;
        el.querySelectorAll('.kpi-live-dot').forEach(dot=>dot.setAttribute('aria-label',`${labels[key]} data: ${sourceStatus(state)}`));
        const badge=el.querySelector('.live');
        if(badge) {badge.innerHTML=`<i class="status-dot" aria-hidden="true" style="background:${state.status==='ready'?'var(--green)':state.status==='error'?'#F07178':'var(--amber)'}"></i>${sourceStatus(state)}`;badge.setAttribute('aria-label',`${labels[key]} data: ${sourceStatus(state)}`);}
      });

    });
    document.querySelectorAll('[data-source="castrol"] .live').forEach(el=>{el.textContent=el.closest('.overview')?'No feed':'Demo';el.setAttribute('aria-label',el.closest('.overview')?'Castrol has no connected live source':'Castrol sample data');});
    const ready=Object.values(states).filter(s=>s.status==='ready').length;
    const liveCount=document.querySelector('[data-live-source-count]');
    if(liveCount)liveCount.textContent=`${ready}/3`;
    const header=document.querySelector('header .sub');
    if(header) header.textContent=source==='castrol'?'Castrol · Demo data':source?`${labels[source]} · ${scope(source,states[source]?.data)}`:(window.DashboardSummary?.header || 'All time · Connecting live sources');
    const health=document.getElementById('sourceHealth');
    if(health)health.innerHTML=Object.entries(states).map(([key,state])=>stateMarkup(key,state)).join('');
    const badge=document.getElementById('connectionSummary');
    if(badge)badge.textContent=source==='castrol'?'Demo data':source?`${labels[source]} · ${sourceStatus(states[source])}`:`${ready}/3 sources live · 1 demo`;
    const context=document.getElementById('dataContext');
    const open=context.querySelector('details')?.open;
    if(source==='castrol') {
      context.innerHTML='<div class="context-copy"><strong>Castrol · Demo data</strong><div class="context-meta">Illustrative values. This agent is not connected to a live source.</div></div>';
    } else {
      const state=states[source];
      const data=state?.data;
      const main=source?`${labels[source]} · ${scope(source,data)}`:'All available data · live sources only';
      const updated=data?.last_updated?`Updated ${new Date(data.last_updated).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST · `:'';
      const meta=source ? updated+(state.status==='loading'?'Fetching the latest snapshot. Canon can take a few minutes.':state.status==='stale'?'Refresh failed. Showing the last successful snapshot.':state.status==='error'?'Source unavailable. Try refreshing.':'Refreshes every 5 minutes.') : 'All-time totals across connected sources. Castrol has no live feed and is excluded.';
      const explanation=source==='canon'?'Canon detail KPIs and charts cover sessions first started in the last four completed weeks in IST. Only events inside that period count. Product cards measure recommendations displayed; they do not represent sales. The overview card uses this same period.':source==='agricon'?'KPIs use the last four completed weeks in Jakarta time. FA approval is approved / reviewed. HQ verification is latest verified / FA approved, including pending. Processing time measures automated function execution, not human review.':'PI KPIs include the current partial week in IST and compare with the preceding four weeks. Daily charts show 14 days. An unavailable value means the source does not support that metric.';
      const busy=source?state.status==='loading':Object.values(states).some(s=>s.status==='loading');
      context.innerHTML=`<div class="context-copy"><strong>${escape(main)}</strong><div class="context-meta" role="status">${escape(meta)}</div></div><div class="context-actions"><details ${open?'open':''}><summary>About the data</summary><p>${escape(source?explanation:'Landing-page totals use all available source data. PI contributes journeys rather than verified chat sessions. Castrol has no live feed and is excluded. Source cards use their reporting periods and 12-week trends; only the summary strip uses all-time totals.')}${state?.error?'<br>'+escape(state.error):''}</p></details><button class="refresh-button" type="button" ${busy?'disabled':''}>${busy?'Refreshing…':'Refresh data'}</button></div>`;
      context.querySelector('button').addEventListener('click',()=>window.dispatchEvent(new CustomEvent('dashboard:refresh',{detail:{source:source||'all'}})));
    }
    document.querySelectorAll('.ht .d,.kpi .d').forEach(el=>{
      const b=el.querySelector('b'), suffix=el.querySelector('.comparison-label');
      if(!b || !suffix) return;
      if(!suffix.dataset.original) suffix.dataset.original=suffix.textContent;
      const text=b.textContent.trim();
      if(text==='—') b.textContent=el.parentElement.querySelector('.v')?.textContent.trim()==='—'?'Not available':'No comparison';
      suffix.hidden=['—','No comparison','Not available','Unavailable','Stale'].includes(text);
    });
  }

  function chartWidth(el,fallback=600) {
    if(!el || !el.closest('.page.on')) return fallback;
    const parent=el.parentElement, style=getComputedStyle(parent);
    return Math.max(240,Math.round(parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)));
  }
  function cartTimeChart(days, width=526) {
    const w=Math.max(240,width),h=226,left=44,right=w-18,top=24,bottom=174;
    const values=days.filter(day=>day.median_minutes!==null);
    if(!values.length)return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="No matched completions"><text x="${w/2}" y="${h/2}" text-anchor="middle" class="tp" font-size="13">No matched completions</text></svg>`;
    const peak=Math.max(.1,...values.map(day=>day.median_minutes));
    const raw=peak/3,power=10**Math.floor(Math.log10(raw));
    const step=([1,2,5,10].find(value=>value>=raw/power)||10)*power;
    const maximum=Math.ceil(peak/step)*step;
    const band=(right-left)/Math.max(1,days.length-1),x=i=>left+band*i;
    const y=value=>bottom-value/maximum*(bottom-top);
    const tick=value=>Number(value.toPrecision(3)).toString();
    const date=value=>new Date(`${value}T00:00:00Z`);
    const label=value=>date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
    const weekday=value=>date(value).toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'});
    const shade=x(Math.max(0,days.length-7))-band/2;
    let svg=`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily median cart-to-order time in minutes; missing days have no data point"><rect x="${Math.max(left,shade).toFixed(1)}" y="${top-12}" width="${(right-Math.max(left,shade)+8).toFixed(1)}" height="${bottom-top+12}" rx="8" fill="#fff" opacity="0.045"/>`;
    for(let i=0;i<=Math.round(maximum/step);i++) {
      const value=i*step,cy=y(value).toFixed(1);
      svg+=`<line x1="${left}" x2="${right}" y1="${cy}" y2="${cy}" stroke="#2a2d36" opacity="${i===0?.9:.5}"/><text x="${left-10}" y="${(+cy+4).toFixed(1)}" text-anchor="end" font-size="13" class="tx">${tick(value)}</text>`;
    }
    const points=days.map((day,i)=>day.median_minutes===null?null:[x(i),y(day.median_minutes)]);
    svg+=`<path d="${points.map((p,i)=>p?`${i&&points[i-1]?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`:'').join(' ')}" fill="none" stroke="#2dbd7f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    const labelStep=Math.max(2,Math.ceil(64/band));
    days.forEach((day,i)=>{
      const cx=x(i).toFixed(1),p=points[i];
      svg+=`<line x1="${cx}" x2="${cx}" y1="${bottom}" y2="${bottom+4}" stroke="#404651"/>`;
      if(p) {
        svg+=`<circle data-day-index="${i}" cx="${cx}" cy="${p[1].toFixed(1)}" r="3.5" fill="#2dbd7f" stroke="#111216" stroke-width="2"><title>${escape(day.date)}: ${day.median_minutes} min median · ${day.count} completions</title></circle>`;
        if(i%labelStep===0||i===days.length-1)svg+=`<text x="${cx}" y="${(p[1]-11).toFixed(1)}" text-anchor="middle" class="tp" font-size="14">${day.median_minutes.toFixed(1)}</text>`;
      } else svg+=`<text data-no-observations="${i}" x="${cx}" y="${(top+bottom)/2}" text-anchor="middle" class="tx" font-size="15">—<title>${escape(day.date)}: no matched completions; no median available</title></text>`;
      if((i%labelStep===0 && days.length-1-i>=labelStep)||i===days.length-1) {
        svg+=`<text data-day-index="${i}" x="${cx}" y="200" text-anchor="middle" class="tx" font-size="13">${weekday(day.date)}</text><text data-day-index="${i}" x="${cx}" y="217" text-anchor="middle" class="tx" font-size="13">${label(day.date)}</text>`;
      }
    });
    return svg+'</svg>';
  }
  function funnel(el,stages,{base=stages[0]?.count||0,color='var(--a)',footer=''}={}) {
    el.innerHTML=`<ol class="funnel-list">${stages.map((stage,i)=>{
      const width=base?stage.count/base*100:0;
      const next=base?stages[Math.min(i+1,stages.length-1)].count/base*100:0;
      return `<li class="funnel-step"><span>${escape(stage.label)}</span><div class="funnel-shape" aria-hidden="true" style="--a:${color};--width:${width}%;--next:${width?next/width*100:0}%;opacity:${1-i*.13}"></div><span class="funnel-count">${number(stage.count)}<small>${base?(stage.count/base*100).toFixed(1)+'%':'—'}</small></span></li>`;
    }).join('')}</ol>${footer?`<p class="funnel-footer">${escape(footer)}</p>`:''}`;
  }
  function categories(el,rows,color,format=number) {
    const max=Math.max(1,...rows.map(r=>r.sessions));
    el.innerHTML=rows.length?`<div class="category-list">${rows.map(row=>`<div><div class="category-label"><span>${escape(row.label)}</span><b>${format(row.sessions)}</b></div><div class="track"><div class="fill" style="width:${row.sessions/max*100}%;background:${color}"></div></div></div>`).join('')}</div>`:'<div class="empty-state">No printer cards recorded</div>';
  }
  function empty(el,message='Data unavailable. Use Refresh data to retry.') {
    if(el.tagName.toLowerCase()==='svg') {
      const w=chartWidth(el,600),h=170;
      el.setAttribute('viewBox',`0 0 ${w} ${h}`);
      el.innerHTML=`<text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="13" class="tp">${escape(message)}</text>`;
    } else el.innerHTML=`<div class="empty-state">${escape(message)}</div>`;
  }
  function activityHeatmap(el,activity,accent='#EF4444') {
    if(!activity.total){empty(el,'No chat starts with valid timestamps recorded.');return;}
    const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const w=chartWidth(el,984),h=282,left=58,top=30,step=(w-left-8)/24,rowStep=28;
    const max=Math.max(...activity.counts.flat());
    let peakDay=0,peakHour=0;
    let svg=`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Canon chat starts by weekday and hour, ${escape(activity.scope_label||'All available data')}, Indian Standard Time"><title>${escape(activity.definition)}</title>`;
    for(let hour=0;hour<24;hour+=3)svg+=`<text x="${left+(hour+.5)*step}" y="16" text-anchor="middle" font-size="13" class="tp">${String(hour).padStart(2,'0')}:00</text>`;
    activity.counts.forEach((row,day)=>{
      svg+=`<text x="0" y="${top+day*rowStep+16}" font-size="14" class="tp">${days[day]}</text>`;
      row.forEach((value,hour)=>{
        if(value>activity.counts[peakDay][peakHour]){peakDay=day;peakHour=hour;}
        const label=`${days[day]}, ${String(hour).padStart(2,'0')}:00–${String(hour+1).padStart(2,'0')}:00 IST: ${number(value)} chats started`;
        svg+=`<rect x="${left+hour*step}" y="${top+day*rowStep}" width="${Math.max(1,step-4)}" height="23" rx="4" fill="${value?accent:'#1C1E25'}" fill-opacity="${value ? .18+.82*Math.sqrt(value/max) : 1}" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title></rect>`;
      });
    });
    svg+=`<text x="${left}" y="250" font-size="13" class="tp">Fewer</text>`;
    for(let i=0;i<5;i++)svg+=`<rect x="${left+46+i*20}" y="237" width="15" height="15" rx="3" fill="${i?accent:'#1C1E25'}" fill-opacity="${i?(.18+.82*i/4):1}"/>`;
    svg+=`<text x="${left+152}" y="250" font-size="13" class="tp">More · peak ${number(max)}</text>`;
    svg+=`<text x="${w-8}" y="250" text-anchor="end" font-size="13" class="tp">${number(activity.total)} dated chats · ${activity.start} – ${activity.end}</text>`;
    svg+=`<text x="${left}" y="277" font-size="14" class="tw">Busiest recorded slot: ${days[peakDay]} · ${String(peakHour).padStart(2,'0')}:00–${String(peakHour+1).padStart(2,'0')}:00 IST · ${number(max)} chats</text></svg>`;
    el.innerHTML=svg;
  }
  function conversationDepth(el,depth,accent='#EF4444') {
    if(!depth.total){empty(el,'No customer conversations recorded.');return;}
    const w=684,h=282,cx=134,cy=132,r=94,around=2*Math.PI*r;
    const colors=['#3A3E4A',accent,'#A92335','#FCA5A5'];
    const percent=depth.multiple_message_chats/depth.total*100;
    let offset=0;
    let svg=`<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Conversation depth by customer messages per chat, ${escape(depth.scope_label||'All available data')}"><title>${escape(depth.definition)}</title><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1C1E25" stroke-width="27"/>`;
    depth.buckets.forEach((bucket,i)=>{
      const length=bucket.chats/depth.total*around;
      const share=bucket.chats/depth.total*100;
      const label=`${bucket.label}: ${number(bucket.chats)} chats (${share.toFixed(1)}%)`;
      if(bucket.chats)svg+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[i]}" stroke-width="27" stroke-dasharray="${length} ${around-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title></circle>`;
      offset+=length;
      const y=65+i*48;
      svg+=`<rect x="279" y="${y-13}" width="12" height="12" rx="3" fill="${colors[i]}"/><text x="304" y="${y}" font-size="16" class="tp">${escape(bucket.label)}</text><text x="590" y="${y}" text-anchor="end" font-size="16" class="tw">${number(bucket.chats)}</text><text x="684" y="${y}" text-anchor="end" font-size="14" class="tp">${share.toFixed(1)}%</text>`;
    });
    svg+=`<text x="${cx}" y="${cy+1}" text-anchor="middle" font-size="42" class="tw">${percent.toFixed(1)}%</text><text x="${cx}" y="${cy+29}" text-anchor="middle" font-size="14" class="tp">sent 2+ messages</text><text x="279" y="26" font-size="14" class="tp">Customer messages per chat</text><text x="342" y="277" text-anchor="middle" font-size="15" class="tp">Each chat appears once · ${escape(depth.scope_label||'All available data')}</text></svg>`;
    el.innerHTML=svg;
  }
  function redrawDemo() {
    const c=CUSTOMERS[3], page=document.querySelector('.page.on[data-source="castrol"]');
    if(page) {
      const main=page.querySelector('.row2 .panel>svg');
      if(main)main.outerHTML=svgTrend({...c.detail.main,w:chartWidth(main,984),h:282},c.accent);
      const secondary=page.querySelector('.row3 .panel:nth-child(2)>svg,.row3 .panel:nth-child(2)>[data-demo-categories]');
      if(secondary) {
        const width=chartWidth(secondary,526);
        if(width<440){secondary.outerHTML='<div data-demo-categories></div>';categories(page.querySelector('[data-demo-categories]'),c.detail.second.cats.map(([label,sessions])=>({label,sessions})),c.accent,value=>value.toFixed(1)+'%');}
        else secondary.outerHTML=svgColumns({...c.detail.second,w:width,h:226},c.accent);
      }
    }
    const mini=document.querySelector('.page.on.overview [data-source="castrol"] .chart');
    if(mini)empty(mini,'No live source connected.');
  }
  window.DashboardUI={report,chartWidth,cartTimeChart,funnel,categories,empty,activityHeatmap,conversationDepth};
  for(const event of ['dashboard:pagechange','dashboard:resize'])window.addEventListener(event,redrawDemo);
  redrawDemo();
  window.addEventListener('dashboard:pagechange',paint);
  window.addEventListener('dashboard:summary',paint);
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>window.dispatchEvent(new CustomEvent('dashboard:resize')),150);});
  document.querySelectorAll('[data-canon-weekly],[data-canon-activity],[data-canon-depth],[data-agricon-processing],[data-agricon-approval-chart],[data-canon-funnel],[data-agricon-funnel],[data-canon-printers],[data-canon-types],[data-agricon-rejections]').forEach(el=>{if(!el.children.length)el.innerHTML='<div class="empty-state">Connecting to live data…</div>';});
  // Keep metric definitions accessible without giant native hover overlays.
  const shortenTitles = () => document.querySelectorAll('#pages [title]').forEach(el=>{
    if(el.title.length>180){el.dataset.definition=el.title;el.title=el.title.slice(0,177)+'…';}
  });
  const observer=new MutationObserver(shortenTitles);
  observer.observe(document.getElementById('pages'),{subtree:true,attributes:true,attributeFilter:['title']});
  paint();
})();
