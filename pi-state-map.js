/* Self-hosted geography; only aggregate counts enter this component. */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const number = value => new Intl.NumberFormat('en-IN').format(value);
  let geometryRequest;
  let latestVersion = 0;

  function color(count, maximum) {
    if (!count) return '#242a32';
    const low = [20, 66, 49], high = [45, 205, 140];
    return `rgb(${low.map((value, index) => Math.round(value + (high[index] - value) * count / maximum)).join(',')})`;
  }

  function stateData(geometry, breakdown) {
    if (!geometry || geometry.regions?.length !== 36 || geometry.viewBox !== '0 0 340 380') throw new Error('Invalid map geography.');
    const names = new Set(geometry.regions.map(region => region.name));
    if (names.size !== 36 || geometry.regions.some(region => typeof region.name !== 'string' ||
        typeof region.path !== 'string' || !/^[MLZ\d.,\-]+$/.test(region.path))) throw new Error('Invalid map shapes.');
    const counts = new Map();
    for (const row of breakdown.rows) {
      if ((!names.has(row.state) && row.state !== 'Unknown') || counts.has(row.state) ||
          !Number.isSafeInteger(row.count) || row.count < 0) throw new Error('Invalid map state counts.');
      counts.set(row.state, row.count);
    }
    if ([...counts.values()].reduce((sum, count) => sum + count, 0) !== breakdown.total) throw new Error('Map counts do not reconcile.');
    const maximum = Math.max(1, ...geometry.regions.map(region => counts.get(region.name) || 0));
    return {
      regions: geometry.regions.map(region => {
        const count = counts.get(region.name) || 0;
        return {...region, count, percent: breakdown.total ? count / breakdown.total * 100 : 0, fill: color(count, maximum)};
      }),
      unknown: counts.get('Unknown') || 0,
      maximum,
    };
  }

  function geometry() {
    if (!geometryRequest) geometryRequest = fetch('./assets/india-states.json', {credentials: 'same-origin'})
      .then(response => {if (!response.ok) throw new Error('Map asset unavailable'); return response.json();})
      .catch(error => {geometryRequest = null; throw error;});
    return geometryRequest;
  }

  function switchView(panel, view) {
    panel.dataset.piStateView = view;
    panel.querySelector('[data-pi-state-map]').hidden = view !== 'map';
    panel.querySelector('[data-pi-states]').hidden = view !== 'list';
    panel.querySelectorAll('[data-pi-state-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.piStateView === view)));
  }

  function setup(panel) {
    if (panel.dataset.piMapSetup) return;
    panel.dataset.piMapSetup = 'true';
    panel.querySelectorAll('[data-pi-state-view]').forEach(button => button.addEventListener('click', () => switchView(panel, button.dataset.piStateView)));
    switchView(panel, 'map');
  }

  async function render(breakdown, metadata, stale = false) {
    const version = ++latestVersion;
    const panels = [...document.querySelectorAll('[data-pi-state-panel]')];
    panels.forEach(setup);
    try {
      const shapes = await geometry();
      if (version !== latestVersion) return;
      const data = stateData(shapes, breakdown);
      for (const panel of panels) {
        const holder = panel.querySelector('[data-pi-state-map]');
        holder.replaceChildren();
        holder.title = metadata;
        const layout = document.createElement('div'); layout.className = 'pi-map-layout';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', shapes.viewBox);
        svg.setAttribute('role', 'group');
        svg.setAttribute('aria-label', `India orders by state. ${number(breakdown.total)} orders. ${stale ? 'Stale data. ' : ''}Focus or hover a state for its count.`);
        const readout = document.createElement('div'); readout.className = 'pi-map-readout';
        readout.setAttribute('aria-live', 'polite');
        const summary = `${stale ? 'Stale · ' : ''}${breakdown.total ? 'Hover or focus a state' : 'No orders in this period'}${data.unknown ? ` · ${number(data.unknown)} unknown state` : ''}`;
        readout.textContent = summary;
        for (const region of data.regions) {
          const path = document.createElementNS(NS, 'path');
          const label = `${region.name}: ${number(region.count)} orders · ${region.percent.toFixed(1)}%`;
          path.setAttribute('d', region.path);
          path.setAttribute('fill', region.fill);
          path.setAttribute('fill-rule', 'evenodd');
          path.setAttribute('tabindex', '0');
          path.setAttribute('role', 'img');
          path.setAttribute('aria-label', label);
          path.dataset.state = region.name;
          const title = document.createElementNS(NS, 'title'); title.textContent = label; path.appendChild(title);
          for (const event of ['pointerenter', 'focus']) path.addEventListener(event, () => {readout.textContent = `${stale ? 'Stale · ' : ''}${label}`;});
          for (const event of ['pointerleave', 'blur']) path.addEventListener(event, () => {readout.textContent = summary;});
          svg.appendChild(path);
        }
        const ranking = document.createElement('div'); ranking.className = 'pi-map-ranking';
        const heading = document.createElement('div'); heading.className = 'pi-map-caption'; heading.textContent = 'TOP STATES'; ranking.appendChild(heading);
        const top = data.regions.filter(region => region.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5);
        for (const region of top) {
          const row = document.createElement('div'); row.className = 'pi-map-rank';
          const label = document.createElement('span'); label.textContent = region.name;
          const count = document.createElement('b'); count.textContent = number(region.count);
          const track = document.createElement('div'); track.className = 'pi-map-track';
          const fill = document.createElement('i'); fill.style.width = `${region.count / data.maximum * 100}%`; fill.style.backgroundColor = region.fill;
          track.appendChild(fill); row.append(label, count, track); ranking.appendChild(row);
        }
        const legend = document.createElement('div'); legend.className = 'pi-map-legend'; legend.textContent = 'Brighter = more orders · Grey = 0'; ranking.appendChild(legend);
        layout.append(svg, ranking); holder.append(layout, readout);
      }
    } catch (error) {
      if (version !== latestVersion) return;
      for (const panel of panels) {
        const holder = panel.querySelector('[data-pi-state-map]');
        holder.textContent = 'Map unavailable. Select List to view state counts.';
      }
    }
  }

  function clear(message) {
    ++latestVersion;
    document.querySelectorAll('[data-pi-state-panel]').forEach(panel => {
      setup(panel);
      const holder = panel.querySelector('[data-pi-state-map]'); holder.textContent = message; holder.title = message;
    });
  }

  if (typeof module !== 'undefined') module.exports = {stateData, color};
  if (typeof window !== 'undefined') window.PIStateMap = {render, clear};
})();
