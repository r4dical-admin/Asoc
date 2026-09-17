<script lang="ts">
  export let component: Record<string, any>;
  export let components: Record<string, Record<string, any>>;
  export let results: Record<string, any> = {};
  const child = (id:string) => components[id];
  $: value = component.binding ? results[component.binding] : undefined;
  const label = (text:string) => text.replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase());
</script>

{#if component.component === 'Column' || component.component === 'Row'}
  <div class:dashboard-row={component.component === 'Row'} class:dashboard-column={component.component === 'Column'}>
    {#each component.children ?? [] as id}{#if child(id)}<svelte:self component={child(id)} {components} {results} />{/if}{/each}
  </div>
{:else if component.component === 'Heading'}
  <div class="dashboard-heading">{#if component.level === 1}<h2>{component.text}</h2>{:else}<h3>{component.text}</h3>{/if}</div>
{:else if component.component === 'Text'}
  <p>{component.text}</p>
{:else if component.component === 'Workflow' && value}
  <section class="widget wide"><header><h3>{component.title}</h3><span>Last {value.period_days} days</span></header>
    <div class="flow">
      <div><strong>{value.intakes_received}</strong><span>Intakes</span></div><i>→</i>
      <div><strong>{value.triage_decisions}</strong><span>Triaged</span><small>{value.triage_outcomes?.create ?? 0} new · {value.triage_outcomes?.comment ?? 0} linked · {value.triage_outcomes?.ignore ?? 0} ignored</small></div><i>→</i>
      <div><strong>{value.response_runs_completed}</strong><span>Playbook runs</span></div><i>→</i>
      <div><strong>{value.incidents_closed}</strong><span>Closed</span></div>
    </div><p class="footnote">{value.current_active} accessible incidents active now</p>
  </section>
{:else if component.component === 'MetricGroup'}
  <section class="widget"><header><h3>{component.title}</h3></header>
    {#if value && 'configured' in value}{#if value.configured}<div class="metrics"><div class:danger={value.active_breached>0}><strong>{value.active_breached}</strong><span>Breached</span></div><div><strong>{value.active_due_soon}</strong><span>Due soon</span></div><div><strong>{value.compliance_percent ?? '—'}{value.compliance_percent !== null ? '%' : ''}</strong><span>Compliance</span></div></div><p class="footnote">{value.policy} v{value.version}</p>{:else}<div class="empty-state">SLA not configured</div>{/if}
    {:else if value}<div class="metrics">{#each Object.entries(value).filter(([,item])=>typeof item!=='object').slice(0,6) as [key,item]}<div><strong>{item || '—'}</strong><span>{label(key)}</span></div>{/each}</div>{:else}<div class="empty-state">No data available.</div>{/if}
  </section>
{:else if component.component === 'RestrictedSummary'}
  <section class="widget restricted"><header><h3>{component.title}</h3><span>No drill-down</span></header><strong class="restricted-total">{value?.total ?? 0}</strong><span>inaccessible tickets</span>
    <div class="severity-row">{#each Object.entries(value?.by_severity ?? {}) as [severity,count]}<span>{severity}: {count}</span>{/each}</div><p class="footnote">Count and severity only · {value?.fixed_scope ?? 'fixed scope'}</p>
  </section>
{:else if component.component === 'RecordList'}
  <section class="widget"><header><h3>{component.title}</h3><span>{Array.isArray(value)?value.length:0} shown</span></header>
    {#if Array.isArray(value) && value.length}<div class="records">{#each value as record}<article><span class={`severity ${String(record.severity||'').toLowerCase()}`}>{record.severity || record.status || record.role || 'item'}</span><div><strong>{record.id || record.title || 'Activity'}</strong><small>{record.title && record.id ? record.title : record.body || record.status || ''}</small></div></article>{/each}</div>{:else}<div class="empty-state">Nothing needs attention.</div>{/if}
  </section>
{:else if component.component === 'Breakdown' || component.component === 'Trend'}
  <section class="widget"><header><h3>{component.title}</h3></header><div class="metrics">{#each Object.entries(value ?? {}) as [key,item]}<div><strong>{typeof item==='object'?'—':item}</strong><span>{label(key)}</span></div>{/each}</div></section>
{:else if value && !Array.isArray(value)}
  <section class="widget"><header><h3>{component.title ?? 'Incident'}</h3></header><dl>{#each Object.entries(value) as [key,item]}<div><dt>{label(key)}</dt><dd>{item || '—'}</dd></div>{/each}</dl></section>
{/if}

<style>
  .dashboard-column{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px}.dashboard-row{display:flex;flex-wrap:wrap;gap:16px;min-width:0}.dashboard-row>:global(*){flex:1;min-width:0}.dashboard-heading{grid-column:1/-1}.dashboard-heading h2,.dashboard-heading h3{margin:0}.widget{box-sizing:border-box;max-width:100%;overflow-wrap:anywhere;background:#0b150b;border:1px solid #1b3a1b;border-radius:3px;padding:18px;min-width:0}.wide{grid-column:1/-1}.widget header{display:flex;justify-content:space-between;align-items:center;margin-bottom:15px}.widget h3{font-size:14px;margin:0}.widget header span,.footnote{font-size:11px;color:#7cb37c}.flow,.metrics{display:flex;align-items:stretch;gap:10px;flex-wrap:wrap}.flow>div,.metrics>div{flex:1;min-width:90px;background:#101c10;border-radius:3px;padding:12px}.flow strong,.metrics strong{display:block;font-size:23px;overflow-wrap:anywhere}.flow span,.metrics span{font-size:11px;color:#8bbf8b}.flow small{display:block;margin-top:5px;color:#7cb37c}.flow i{align-self:center;color:#5e955e}.danger{background:#261313!important;color:#ff9292}.restricted{background:#0a130a}.restricted-total{font-size:32px;display:block}.severity-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.severity-row span,.severity{font-size:10px;padding:3px 7px;background:#1b301b;border-radius:3px}.records{display:grid;gap:7px}.records article{display:flex;align-items:start;gap:10px;padding:9px;background:#0d1a0d;border-radius:3px}.records article div{display:grid}.records small{color:#7cb37c}.severity.sev1{background:#351919;color:#ff9292}.severity.sev2{background:#332910;color:#f6d365}.empty-state{padding:20px;text-align:center;color:#7cb37c;background:#0d1a0d;border-radius:3px}dl{margin:0}dl div{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #1b3a1b}dt{color:#7cb37c}dd{margin:0;font-weight:600}@media(max-width:850px){.dashboard-column{grid-template-columns:1fr}.wide{grid-column:auto}.flow{align-items:stretch;flex-direction:column}.flow i{transform:rotate(90deg)}}
</style>
