/* SPDX-License-Identifier: MIT */
// Labeled measurements around Home Assistant's native tile controls.
const bridgeSetupUrl = 'https://github.com/Lorilonlon/truma-home-assistant-bridge/blob/main/README.de.md';
const timerSetupUrl = 'https://github.com/Lorilonlon/truma-home-assistant-bridge/blob/main/dashboard/TIMER.md';

function setupNotice(timer = false) {
  const text = timer
    ? 'Für Zeitpläne brauchst du die Truma iNet Bridge sowie die Timer-Helfer, das Skript und die Automation.'
    : 'Für diese Karte brauchst du eine klassische iNet-Box und die per MQTT eingerichtete Truma iNet Bridge. Prüfe auch die Entitäts-ID der Karte.';
  return `<p id="setup-notice" hidden style="padding:0 16px"><strong>${text}</strong> <a href="${bridgeSetupUrl}" target="_blank" rel="noopener">Bridge einrichten</a>${timer ? ` · <a href="${timerSetupUrl}" target="_blank" rel="noopener">Timer einrichten</a>` : ''}</p>`;
}

class CamperInetCard extends HTMLElement {
  static getStubConfig() { return {kind:'climate',entity:'climate.truma_inet_heizung',temperature_entity:'sensor.truma_inet_raumtemperatur'}; }
  constructor() { super(); this.attachShadow({mode: 'open'}); this._revision = 0; }
  setConfig(config) {
    if (!config.entity || !['climate', 'water'].includes(config.kind)) throw new Error('entity und kind sind erforderlich');
    this._config = config;
    this._revision++;
    this.shadowRoot.innerHTML = `<style>
      :host {display:block} ha-card {overflow:hidden}
      .native {--ha-card-border-width:0;--ha-card-box-shadow:none;--ha-card-background:transparent;--ha-card-border-radius:0px}
      .readings {display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 16px 16px}
      .reading {min-width:0;padding:12px;border-radius:12px;background:var(--secondary-background-color)}
      .label,.note {color:var(--secondary-text-color);font-size:12px;line-height:1.5}
      .value {font-size:24px;font-weight:600;line-height:1.4;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
      .error {padding:12px 16px;color:var(--error-color)}
    </style><ha-card>${setupNotice()}<div class="native"></div><div class="readings">
      <div class="reading"><div class="label" id="label-a"></div><div class="value" id="value-a"></div><div class="note" id="note-a"></div></div>
      <div class="reading"><div class="label" id="label-b"></div><div class="value" id="value-b"></div><div class="note" id="note-b"></div></div>
    </div></ha-card>`;
    this._tile = undefined;
    this._createTile(this._revision);
    this._render();
  }
  async _createTile(revision) {
    try {
      const helpers = await window.loadCardHelpers();
      if (revision !== this._revision) return;
      const c = this._config;
      this._tile = helpers.createCardElement({type:'tile', entity:c.entity,
        name:c.name || (c.kind === 'climate' ? 'Raumheizung' : 'Warmwasser einstellen'),
        hide_state:true, features_position:'bottom',
        features:c.kind === 'climate' ? [
          {type:'target-temperature'}, {type:'climate-hvac-modes',hvac_modes:['heat','off']},
          {type:'climate-fan-modes',style:'dropdown'}
        ] : [{type:'select-options'}]});
      if (this._hass) this._tile.hass = this._hass;
      this.shadowRoot.querySelector('.native').replaceChildren(this._tile);
    } catch (error) {
      if (revision !== this._revision) return;
      const note = document.createElement('div'); note.className='error';
      note.textContent='Bedienelemente konnten nicht geladen werden. Bitte das Dashboard neu laden.';
      this.shadowRoot.querySelector('.native').replaceChildren(note);
    }
  }
  set hass(hass) { this._hass=hass; if(this._tile) this._tile.hass=hass; this._render(); }
  _render() {
    if (!this._config || !this._hass) return;
    const c=this._config, state=this._hass.states[c.entity];
    this.shadowRoot.getElementById('setup-notice').hidden = Boolean(state);
    const available = state && !['unavailable','unknown'].includes(state.state);
    const measured=this._hass.states[c.temperature_entity];
    const format=(v,unit='°C') => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
      ? new Intl.NumberFormat(this._hass.locale?.language || 'de-DE',{maximumFractionDigits:1}).format(Number(v))+' '+unit : '—';
    const set=(id,value)=>{this.shadowRoot.getElementById(id).textContent=value;};
    set('label-a',c.kind==='climate'?'Im Raum':'Wassertemperatur');
    set('value-a',format(available && measured ? measured.state : null, measured?.attributes.unit_of_measurement || '°C'));
    set('note-a',available && measured && !['unavailable','unknown'].includes(measured.state)?'Gemessen':'Nicht verfügbar');
    if(c.kind==='climate') {
      set('label-b','Zieltemperatur'); set('value-b',format(available?state.attributes.temperature:null,this._hass.config?.unit_system?.temperature || '°C'));
      set('note-b',!available?'Nicht verfügbar':state.state==='off'?'Vorgemerkt · Heizung aus':'Bestätigt');
    } else {
      set('label-b','Warmwasserstufe'); set('value-b',available?state.state:'—');
      set('note-b',available?'Bestätigt':'Nicht verfügbar');
    }
  }
  getCardSize() { return this._config?.kind==='climate'?5:3; }
  getGridOptions() { return {columns:12,min_columns:6,min_rows:3}; }
}
if (!customElements.get('camper-inet-card')) customElements.define('camper-inet-card',CamperInetCard);
window.customCards=window.customCards||[];
if (!window.customCards.some(card => card.type === 'camper-inet-card')) window.customCards.push({type:'camper-inet-card',name:'Truma iNet Dashboard · Heizung und Warmwasser',description:'Benötigt die Truma iNet Bridge, MQTT und eine klassische iNet-Box.'});

// Persistent HA queue, draft-only inputs, explicit overlap consent.
class CamperInetTimerCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._editingSlot=undefined;}
  setConfig(config){
    const ids=Array.from({length:8},(_,i)=>'input_text.truma_timer_auftrag'+(i?'_'+(i+1):''));
    this._config={job_entities:ids,owner_entity:'input_text.truma_timer_aktuell',script_entity:'script.truma_timer_verwalten',automation_entity:'automation.truma_timer_zeitplan',...config};
    this.shadowRoot.innerHTML=`<style>
      :host{display:block}ha-card{display:block;padding:20px;border:1px solid var(--divider-color,#c8d1da)}
      h2{font-size:20px;margin:0 0 16px}.jobs{display:grid;gap:12px}.job{padding:14px;border:1px solid var(--divider-color,#c8d1da);border-radius:12px;transition:background .2s}
      .job.confirmed{background:color-mix(in srgb,var(--success-color,#388e3c) 28%,var(--ha-card-background,var(--card-background-color,#fff)));border-color:var(--success-color,#388e3c)}
      .job.failed{border-color:var(--error-color,#db4437)}.head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.badge{font-size:12px;background:var(--secondary-background-color,#eef2f5);padding:5px 9px;border-radius:14px}
      .summary{font-size:14px;line-height:1.6;white-space:pre-line;margin-top:9px}.detail,.note,#message{font-size:13px;line-height:1.5;color:var(--secondary-text-color,#54616c);margin-top:10px}
      .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin:18px 0}.wide{grid-column:1/-1}
      label{display:flex;flex-direction:column;gap:7px;font-size:13px;color:var(--secondary-text-color,#54616c)}
      input,select{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--divider-color,#c8d1da);border-radius:10px;padding:11px;font:inherit;font-size:16px;color:var(--primary-text-color,#19232e);background:var(--card-background-color,#fff)}
      .toggle{flex-direction:row;align-items:center;justify-content:space-between;min-height:34px;color:var(--primary-text-color,#19232e);font-size:14px}
      input[type=checkbox]{appearance:none;width:42px;height:24px;padding:3px;border:0;border-radius:14px;background:var(--disabled-color,#71808c);cursor:pointer}input[type=checkbox]::before{content:'';display:block;width:18px;height:18px;border-radius:50%;background:white;transition:transform .2s}input[type=checkbox]:checked{background:var(--primary-color,#1976d2)}input[type=checkbox]:checked::before{transform:translateX(18px)}
      button{font:inherit;border:0;border-radius:10px;padding:11px 14px;cursor:pointer;background:var(--primary-color,#1976d2);color:var(--text-primary-color,#fff)}button.secondary{background:var(--secondary-background-color,#eef2f5);color:var(--primary-text-color,#19232e)}
      .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.job button{font-size:13px;padding:8px 10px}.error{color:var(--error-color,#b71c1c)!important}:disabled{opacity:.55;cursor:default}[hidden]{display:none!important}
      @media(max-width:360px){ha-card{padding:14px}.grid{gap:10px}}
      .date-button{text-align:left;min-height:52px;font-size:16px}
      dialog{box-sizing:border-box;width:min(460px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;border:1px solid var(--divider-color,#c8d1da);border-radius:20px;padding:22px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#19232e);box-shadow:0 16px 64px #0006}
      dialog::backdrop{background:#0008}dialog h2{margin-bottom:6px}dialog button{min-height:44px}dialog .picker-tabs{display:flex;gap:8px;margin:16px 0}dialog .picker-tabs button{flex:1}
      .month-nav{display:flex;align-items:center;justify-content:space-between;margin:12px 0}.calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.calendar button{padding:0;min-height:44px;background:transparent;color:inherit}.calendar button[aria-pressed=true]{background:var(--primary-color,#1976d2);color:white}.calendar .weekday{text-align:center;font-size:12px;padding:8px 0;color:var(--secondary-text-color,#54616c)}
      .time-controls{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}.time-controls label{align-items:center}.time-controls input{font-size:32px;font-weight:600;text-align:center}.time-controls button{width:100%;font-size:24px}.picker-summary{font-size:16px;line-height:1.5;min-height:48px}.picker-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;flex-wrap:wrap}
    </style><ha-card><h2>Truma-Timer</h2>${setupNotice(true)}<div id="jobs" class="jobs"></div>
    <div class="actions"><button id="add" class="secondary">Weiteren Timer vormerken</button></div>
    <form><div class="grid">
      <label class="wide toggle">Täglich wiederholen<input id="daily" type="checkbox" role="switch" aria-label="Täglich wiederholen"></label>
      <label class="wide"><span id="start-label">Beginn</span><input id="start" type="hidden"><button id="pick-start" type="button" class="secondary date-button" aria-haspopup="dialog">Datum und Uhrzeit wählen</button></label>
      <label>Raumtemperatur<select id="temperature" required aria-label="Raumtemperatur"></select></label>
      <label>Gebläse<select id="fan" required aria-label="Gebläse"></select></label>
      <label class="wide">Warmwasser<select id="water" required aria-label="Warmwasser"></select></label>
      <label class="wide toggle">Endzeit verwenden<input id="use-end" type="checkbox" role="switch" aria-label="Endzeit verwenden"></label>
      <label id="end-field" class="wide" hidden>Ende<input id="end" type="hidden"><button id="pick-end" type="button" class="secondary date-button" aria-haspopup="dialog">Datum und Uhrzeit wählen</button></label>
    </div><div id="help" class="note"></div><div class="actions"><button id="submit" type="submit">Timer vormerken</button><button id="discard" type="button" class="secondary">Eingabe verwerfen</button></div></form>
    <div id="message" role="status" aria-live="polite"></div></ha-card>
    <dialog id="datetime-dialog" aria-labelledby="picker-title">
      <h2 id="picker-title">Beginn wählen</h2><div id="picker-summary" class="picker-summary" aria-live="polite"></div>
      <div class="picker-tabs"><button type="button" id="tab-date">1 · Datum</button><button type="button" id="tab-time">2 · Uhrzeit</button></div>
      <div id="date-panel"><div class="month-nav"><button type="button" id="month-prev" class="secondary" aria-label="Vorheriger Monat">‹</button><strong id="month-title"></strong><button type="button" id="month-next" class="secondary" aria-label="Nächster Monat">›</button></div><div id="calendar" class="calendar"></div><div class="actions"><button type="button" id="day-today" class="secondary">Heute</button><button type="button" id="day-tomorrow" class="secondary">Morgen</button></div></div>
      <div id="time-panel" hidden><div class="time-controls">
      <label>Stunde<button type="button" id="hour-up" class="secondary" aria-label="Stunde erhöhen">+</button><input id="picker-hour" type="number" inputmode="numeric" min="0" max="23" step="1" aria-label="Stunde"><button type="button" id="hour-down" class="secondary" aria-label="Stunde verringern">−</button></label>
      <label>Minute<button type="button" id="minute-up" class="secondary" aria-label="Minute erhöhen">+</button><input id="picker-minute" type="number" inputmode="numeric" min="0" max="59" step="1" aria-label="Minute"><button type="button" id="minute-down" class="secondary" aria-label="Minute verringern">−</button></label></div><p class="note">Stunde und Minute direkt eintippen oder mit + / − einstellen. Zeit am Wohnmobil: <span id="picker-zone"></span>.</p></div>
      <div class="picker-footer"><button type="button" id="picker-cancel" class="secondary">Abbrechen</button><button type="button" id="picker-apply">Übernehmen</button></div>
    </dialog>`;
    const values={temperature:[['Aus','Aus'],...Array.from({length:26},(_,i)=>[String(i+5),`${i+5} °C`])],fan:[['Aus','Aus'],['Eco','Niedrig · Eco'],['High','Hoch']],water:[['Aus','Aus'],['Niedrig','Niedrig · 40 °C'],['Hoch','Hoch · 60 °C'],['Boost','Boost']]};
    for(const[id,opts]of Object.entries(values)){const s=this._el(id);s.append(new Option('Bitte auswählen',''));for(const[v,l]of opts)s.append(new Option(l,v));s.value='';}
    this.shadowRoot.querySelector('form').onsubmit=e=>{e.preventDefault();this._submit();};
    for(const id of ['daily','use-end'])this._el(id).onchange=()=>this._render();
    this._initPicker();
    this._el('add').onclick=()=>this._new();this._el('discard').onclick=()=>{this._editingSlot=null;this._editingJob=null;this._render();};this._render();
  }
  _resetForm(){this.shadowRoot.querySelector('form').reset();for(const id of ['start','end'])this._el(id).value='';}
  _initPicker(){
    for(const id of ['start','end'])this._el('pick-'+id).onclick=()=>this._openPicker(id);
    this._el('picker-cancel').onclick=()=>this._el('datetime-dialog').close();
    this._el('tab-date').onclick=()=>this._pickerTab('date');this._el('tab-time').onclick=()=>this._pickerTab('time');
    for(const [id,delta]of [['month-prev',-1],['month-next',1]])this._el(id).onclick=()=>{this._pickerMonth.setUTCMonth(this._pickerMonth.getUTCMonth()+delta);this._calendar();};
    for(const [id,delta]of [['day-today',0],['day-tomorrow',1]])this._el(id).onclick=()=>{const d=new Date(this._inputTime(Date.now()/1000).slice(0,10)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);this._selectDay(d.toISOString().slice(0,10));};
    for(const [part,max]of [['hour',24],['minute',60]]){
      this._el('picker-'+part).oninput=()=>this._pickerSummary();
      for(const [suffix,delta]of [['up',1],['down',-1]])this._el(part+'-'+suffix).onclick=()=>{const e=this._el('picker-'+part);e.value=String(((Number(e.value)||0)+delta+max)%max).padStart(2,'0');this._pickerSummary();};
    }
    this._el('picker-apply').onclick=()=>{
      if(!this._pickerValid())return;
      const pad=v=>String(Number(v)).padStart(2,'0');
      this._el(this._pickerTarget).value=this._pickerDay+'T'+pad(this._el('picker-hour').value)+':'+pad(this._el('picker-minute').value);
      this._el('datetime-dialog').close();this._render();
    };
  }
  _openPicker(target){
    this._pickerTarget=target;
    const value=this._el(target).value||(target==='end'?this._el('start').value:'')||this._inputTime(Date.now()/1000+3600);
    this._pickerDay=value.slice(0,10);this._pickerMonth=new Date(this._pickerDay.slice(0,7)+'-01T12:00:00Z');
    this._el('picker-hour').value=value.slice(11,13);this._el('picker-minute').value=value.slice(14,16);
    this._el('picker-title').textContent=target==='start'?'Beginn wählen':'Ende wählen';this._el('picker-zone').textContent=this._hass.config?.time_zone||'Europe/Berlin';
    this._calendar();this._pickerTab('date');this._pickerSummary();this._el('datetime-dialog').showModal();
  }
  _pickerTab(tab){
    this._el('date-panel').hidden=tab!=='date';this._el('time-panel').hidden=tab!=='time';
    for(const name of ['date','time']){this._el('tab-'+name).classList.toggle('secondary',name!==tab);this._el('tab-'+name).setAttribute('aria-pressed',String(name===tab));}
  }
  _selectDay(day){this._pickerDay=day;this._calendar();this._pickerTab('time');this._pickerSummary();this._el('picker-hour').focus();}
  _pickerValid(){return !!this._pickerDay&&['hour','minute'].every(part=>{const e=this._el('picker-'+part);return e.value!==''&&e.checkValidity();});}
  _pickerSummary(){
    const d=new Date(this._pickerDay+'T12:00:00Z');
    const date=new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}).format(d);
    const valid=this._pickerValid();this._el('picker-apply').disabled=!valid;
    this._el('picker-summary').textContent=date+(valid?' · '+this._el('picker-hour').value.padStart(2,'0')+':'+this._el('picker-minute').value.padStart(2,'0')+' Uhr':' · Bitte gültige Uhrzeit eingeben');
  }
  _calendar(){
    const d=this._pickerMonth,y=d.getUTCFullYear(),m=d.getUTCMonth();
    this._el('month-title').textContent=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'}).format(d);
    const grid=this._el('calendar');grid.replaceChildren();for(const day of ['Mo','Di','Mi','Do','Fr','Sa','So']){const span=document.createElement('span');span.className='weekday';span.textContent=day;grid.append(span);}
    for(let i=0;i<(d.getUTCDay()+6)%7;i++)grid.append(document.createElement('span'));
    const count=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    for(let n=1;n<=count;n++){const day=new Date(Date.UTC(y,m,n,12)).toISOString().slice(0,10),b=document.createElement('button');b.type='button';b.textContent=n;b.dataset.date=day;b.setAttribute('aria-label',day);b.setAttribute('aria-pressed',String(day===this._pickerDay));b.onclick=()=>this._selectDay(day);grid.append(b);}
  }
  _el(id){return this.shadowRoot.getElementById(id);}
  set hass(h){this._hass=h;this._render();}
  _job(slot){try{const j=JSON.parse(this._hass?.states[this._config.job_entities[slot]]?.state||'{}');return j&&typeof j==='object'&&!Array.isArray(j)?j:{};}catch{return {};}}
  _jobs(){return this._config.job_entities.map((_,slot)=>({...this._job(slot),slot})).filter(j=>j.id&&j.p!=='cancelled'&&!this._expired(j));}
  _completedAt(j){return Number(j.finished)||Date.parse(this._hass?.states[this._config.job_entities[j.slot]]?.last_changed||'')/1000;}
  _expired(j){const t=this._completedAt(j);return j.p==='done'&&!j.d&&Number.isFinite(t)&&Date.now()/1000>=t+86400;}
  _owner(){return this._hass?.states[this._config.owner_entity]?.state;}
  _free(){const entries=this._config.job_entities.map((_,i)=>({i,j:this._job(i)}));return entries.find(x=>!x.j.id||x.j.p==='cancelled')?.i??entries.find(x=>x.j.p==='done'&&x.j.id!==this._owner())?.i??entries.find(x=>x.j.p==='done')?.i;}
  _new(){const slot=this._free();if(slot===undefined)return;this._editingSlot=slot;this._editingJob=null;this._resetForm();this._message='';this._render();}
  _edit(slot){
    const j=this._job(slot);if(!['armed','waiting','error'].includes(j.p))return;
    this._editingSlot=slot;this._editingJob=JSON.parse(JSON.stringify(j));
    this._el('start').value=this._inputTime(j.s);this._el('end').value=j.e?this._inputTime(j.e):'';
    this._el('temperature').value=j.t;this._el('fan').value=j.f;this._el('water').value=j.w;
    this._el('daily').checked=!!j.d;this._el('use-end').checked=!!j.e;
    this._localError=false;this._message='Timer bearbeiten. Bis zum Speichern gilt der bisherige Zeitplan.';
    this._render();this.shadowRoot.querySelector('form').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  _inputTime(ts){return new Date(this._wall(ts)*60000).toISOString().slice(0,16);}
  _format(ts){if(!Number(ts))return '—';return new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:this._hass?.config?.time_zone||'Europe/Berlin'}).format(new Date(ts*1000));}
  _wall(ts){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:this._hass.config?.time_zone||'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ts*1000));const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)/60000;}
  _inputWall(s){const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5])/60000:NaN;}
  _overlaps(data){
    const a=this._inputWall(data.start_at),alen=data.use_end?this._inputWall(data.end_at)-a:1e9;
    return this._jobs().filter(j=>j.slot!==this._editingSlot&&['armed','waiting','executing','running','restoring'].includes(j.p)).filter(j=>{
      const b=this._wall(j.s),blen=j.e?this._wall(j.e)-b:1e9,base=Math.max(a,b),ka=Math.trunc((base-a)/1440),kb=Math.trunc((base-b)/1440);
      return(data.daily?[0,ka-1,ka,ka+1]:[0]).some(i=>i>=0&&(j.d?[0,kb-1,kb,kb+1]:[0]).some(k=>k>=0&&a+i*1440<b+k*1440+blen&&b+k*1440<a+i*1440+alen));
    });
  }
  _render(){
    if(!this._config||!this._hass)return;
    clearTimeout(this._expiryTimeout);
    const expiries=this._config.job_entities.map((_,slot)=>({...this._job(slot),slot})).filter(j=>j.p==='done'&&!j.d).map(j=>(this._completedAt(j)+86400)*1000-Date.now()).filter(ms=>Number.isFinite(ms)&&ms>0);
    const states = this._hass.states;
    this._el('setup-notice').hidden = Boolean(states[this._config.script_entity] && states[this._config.automation_entity] && states[this._config.owner_entity] && this._config.job_entities.every(id => states[id]));
    if(expiries.length)this._expiryTimeout=setTimeout(()=>this._render(),Math.min(...expiries,2147483647)+50);
    const jobs=this._jobs(),script=this._hass.states[this._config.script_entity];
    const setup=script&&['on','off'].includes(script.state)&&this._hass.states[this._config.automation_entity]?.state==='on'&&this._config.job_entities.every(e=>this._hass.states[e]);
    if(this._pending){const p=this._pending,j=this._job(p.slot);if((p.id===j.id&&['armed','error'].includes(j.p))||(p.operation==='cancel'&&j.p==='cancelled')||(p.operation==='finish'&&['done','waiting','error'].includes(j.p))){
      this._pending=null;clearTimeout(this._timeout);this._message=j.p==='error'?'':j.p==='armed'?'In Home Assistant vorgemerkt. Übertragung an Truma erfolgt zur Startzeit.':j.p==='cancelled'?'Zeitplan entfernt.':'Ende von Truma bestätigt.';
      if(j.p==='armed'){this._lastSubmitId=j.id;this._editingSlot=null;this._editingJob=null;this._resetForm();}
    }}
    if(this._lastSubmitId&&!jobs.some(j=>j.id===this._lastSubmitId&&j.p==='armed')){this._lastSubmitId=null;this._message='';}
    if(this._editingSlot===undefined)this._editingSlot=jobs.length?null:this._free();
    const busy=script?.state==='on'||!!this._pending;
    const container=this._el('jobs');container.replaceChildren();
    const labels={saving:'Wird gespeichert',armed:'In HA vorgemerkt',executing:'Übertragung an Truma',running:'Von Truma bestätigt',restoring:'Vorzustand herstellen',waiting:'Täglich in HA vorgemerkt',done:'Ausgeführt',error:'Fehlgeschlagen'};
    const reasons={confirmation:'Nach drei Versuchen nicht vollständig bestätigt. Teiländerungen möglich.',missed:'Start verpasst; nicht nachgeholt.',interrupted:'Ausführung unterbrochen; tatsächliche Werte prüfen.',unavailable:'Verbindung oder Betriebswerte fehlen oder eine andere Steuerung ist aktiv.',snapshot:'Vorzustand nicht vollständig bekannt.',stale:'Ende zu lange überschritten.',clock:'Ortszeit existiert wegen Zeitumstellung nicht.',superseded:'Durch späteren Timer abgelöst; ältere End-Rückstellung entfällt.'};
    for(const j of jobs.sort((a,b)=>a.s-b.s)){
      const owner=j.id===this._owner(),superseded=j.p==='running'&&!owner;
      const row=document.createElement('div');row.className='job';row.dataset.slot=j.slot;
      row.classList.toggle('confirmed',setup&&(['armed','executing','restoring'].includes(j.p)||(j.p==='running'&&owner)));row.classList.toggle('failed',j.p==='error');
      const head=document.createElement('div');head.className='head';const title=document.createElement('strong');title.textContent=j.d?'Täglich':'Einmalig';const badge=document.createElement('span');badge.className='badge';badge.textContent=superseded?'Abgelöst':['done','waiting'].includes(j.p)&&owner?'Zuletzt von Truma bestätigt':labels[j.p]||'Status unbekannt';head.append(title,badge);
      const summary=document.createElement('div');summary.className='summary';summary.textContent=`${j.p==='waiting'?'Nächster Beginn':'Beginn'} ${this._format(j.s)}\n${j.t==='Aus'?'Heizung aus':j.t+' °C'} · Gebläse ${j.f} · Warmwasser ${j.w}${j.e?'\nEnde '+this._format(j.e)+(superseded||j.r==='superseded'?' · Rückstellung entfällt':' · Vorzustand wiederherstellen'):'\nOhne Endzeit · Einstellungen bleiben bestehen'}`;
      const detail=document.createElement('div');detail.className='detail';detail.textContent=superseded?reasons.superseded:j.p==='error'?reasons[j.r]||'Bitte HA-Meldung prüfen.':j.r==='superseded'?reasons.superseded:j.p==='waiting'&&owner?'Letzte Ausführung von Truma bestätigt. Der nächste Start ist in HA vorgemerkt.':['armed','waiting'].includes(j.p)?'Noch nicht an Truma übertragen. Home Assistant führt den nächsten Start aus.':j.p==='running'?'Startwerte von Truma bestätigt. Vorzustand für das Ende gesichert.':j.p==='done'?(j.e?'Vorherige Einstellungen bestätigt; Zeitfenster beendet.':'Startwerte von Truma bestätigt.'):'Rückmeldung der Box wird geprüft.';
      row.append(head,summary,detail);
      if(['armed','waiting','error','done'].includes(j.p)||superseded){const a=document.createElement('div');a.className='actions';const btn=document.createElement('button');btn.className='secondary';btn.textContent=['done','error'].includes(j.p)?'Aus Liste entfernen':'Timer entfernen';btn.disabled=busy||!setup;const expected={...j};delete expected.slot;btn.onclick=()=>this._action('cancel',{expected_job:expected},j.slot);if(['armed','waiting','error'].includes(j.p)){const edit=document.createElement('button');edit.className='secondary';edit.textContent='Timer bearbeiten';edit.disabled=busy||!setup;edit.onclick=()=>this._edit(j.slot);a.append(edit);}a.append(btn);row.append(a);}
      if(j.p==='running'&&owner){const a=document.createElement('div');a.className='actions';const btn=document.createElement('button');btn.className='secondary';btn.textContent='Jetzt beenden';btn.disabled=busy;btn.onclick=()=>this._action('finish',{},j.slot);a.append(btn);row.append(a);}
      container.append(row);
    }
    const form=this.shadowRoot.querySelector('form');form.hidden=this._editingSlot==null;
    this._el('submit').textContent=this._editingJob?'Änderungen speichern':'Timer vormerken';
    this._el('discard').textContent=this._editingJob?'Bearbeitung abbrechen':'Eingabe verwerfen';
    for(const e of form.querySelectorAll('input,select,button'))e.disabled=busy||!setup;
    this._el('add').hidden=this._editingSlot!=null;this._el('add').disabled=busy||!setup||this._free()===undefined;
    for(const id of ['start','end']){const value=this._el(id).value;this._el('pick-'+id).textContent=value?value.slice(8,10)+'.'+value.slice(5,7)+'.'+value.slice(0,4)+' · '+value.slice(11,16)+' Uhr':'Datum und Uhrzeit wählen';}
    this._el('end-field').hidden=!this._el('use-end').checked;this._el('end').required=this._el('use-end').checked;
    this._el('start-label').textContent=this._el('daily').checked?'Erster Beginn · danach täglich':'Beginn';
    this._el('help').textContent=`Uhrzeit: ${this._hass.config?.time_zone||'Europe/Berlin'}. ${this._el('use-end').checked?'Am Ende werden die unmittelbar vor dem Start gelesenen Einstellungen wiederhergestellt.':'Ohne Endzeit bleiben die neuen Einstellungen bestehen.'} HA und die Verbindung zur Box müssen zur Ausführung verfügbar sein.`;
    this._el('message').textContent=!setup?'Die Timersteuerung ist noch nicht bereit.':this._message||(this._free()===undefined?'Alle acht Timerplätze sind belegt. Zum Vormerken zuerst einen Timer entfernen.':!jobs.length?'Alle Felder ausfüllen und den Timer gemeinsam vormerken.':'');this._el('message').classList.toggle('error',!!this._localError||!setup);
  }
  _submit(){
    if(!this._el('start').value){this._openPicker('start');return;}
    if(this._el('use-end').checked&&!this._el('end').value){this._openPicker('end');return;}
    if(!this.shadowRoot.querySelector('form').reportValidity())return;
    const temperature=this._el('temperature').value,fan=this._el('fan').value;
    if((temperature==='Aus')!==(fan==='Aus')){this._localError=true;this._message='Bei Heizung aus Gebläse Aus wählen; sonst Niedrig oder Hoch.';this._render();return;}
    const id=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
    const data={request_id:id,start_at:this._el('start').value,end_at:this._el('end').value,temperature,fan,water:this._el('water').value,daily:this._el('daily').checked,use_end:this._el('use-end').checked};
    if(this._editingJob)data.expected_job=this._editingJob;
    const overlaps=this._overlaps(data);
    if(overlaps.length&&!window.confirm('Überschneidung mit folgenden Timern:\n\n'+overlaps.map(j=>`${this._format(j.s)} · ${j.t==='Aus'?'Heizung aus':j.t+' °C'}${j.d?' · täglich':''}`).join('\n')+'\n\nDer jeweils später startende Timer überschreibt die Einstellungen des früheren. Die End-Rückstellung des früheren entfällt. Bei gleichem Beginn hat der zuletzt gespeicherte Timer Vorrang.\n\nDiesen Timer trotzdem vormerken?'))return;
    data.overlap_ids=overlaps.map(j=>j.id).sort();this._action('submit',data,this._editingSlot);
  }
  async _action(operation,data={},slot=this._editingSlot){
    if(this._pending||this._hass.states[this._config.script_entity]?.state==='on')return;
    this._pending={operation,id:data.request_id,slot};this._localError=false;this._message=operation==='submit'?'Timer wird in HA gespeichert …':operation==='finish'?'Vorzustand wird wiederhergestellt …':'Timer wird entfernt …';this._render();
    this._timeout=setTimeout(()=>{this._pending=null;this._localError=true;this._message='Keine abschließende Rückmeldung. Bitte den Auftragsstatus prüfen.';this._render();},operation==='finish'?420000:20000);
    try{await this._hass.callService('script',this._config.script_entity.replace(/^script\./,''),{operation,slot,...data});this._render();}
    catch(e){const j=this._job(slot);if(operation==='submit'&&j.id===data.request_id&&j.p==='armed'){this._render();return;}clearTimeout(this._timeout);this._pending=null;this._localError=true;this._message=e.message||'Auftrag fehlgeschlagen.';this._render();}
  }
  connectedCallback(){this._render();}
  disconnectedCallback(){clearTimeout(this._expiryTimeout);clearTimeout(this._timeout);this._pending=null;}
  getCardSize(){return 6;}getGridOptions(){return {columns:12,min_columns:6,min_rows:6};}
}
if(!customElements.get('camper-inet-timer-card'))customElements.define('camper-inet-timer-card',CamperInetTimerCard);
window.customCards=window.customCards||[];
if (!window.customCards.some(card => card.type === 'camper-inet-timer-card')) window.customCards.push({type:'camper-inet-timer-card',name:'Truma-Timer',description:'Benötigt die Truma iNet Bridge und die HA-Timer-Helfer, das Skript und die Automation.'});

/* SPDX-License-Identifier: MIT */
class CamperInetFaultCard extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:'open'}); }
  setConfig(config) {
    this._config = {entity:'sensor.truma_inet_meldungen', seen_entity:'button.truma_inet_meldungen_gesehen', restart_entity:'script.truma_heizung_neu_starten', ...config};
    this.shadowRoot.innerHTML = `<style>
      :host{display:block}ha-card{padding:20px}h2{font-size:20px;margin:0 0 12px}
      #status{font-weight:600}#status.warn{color:var(--warning-color,#d5a030)}
      .note{font-size:13px;color:var(--secondary-text-color);line-height:1.5;margin:8px 0}
      .incident{padding:12px;margin:12px 0;border-radius:12px;background:var(--secondary-background-color);overflow-wrap:anywhere}
      .code{font-size:18px;font-weight:600;white-space:pre-wrap}.history{font-size:13px;margin:10px 0;line-height:1.5;overflow-wrap:anywhere}
      button{font:inherit;padding:9px 14px;border:0;border-radius:10px;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer;margin:8px 0}
      button:disabled{opacity:.5;cursor:default}summary{cursor:pointer;font-size:14px;margin-top:12px}
    </style><ha-card><h2>Meldungen</h2>${setupNotice()}<div id="status"></div><div class="note" id="fresh"></div>
      <div id="active"></div><div class="note" id="reset"></div><button id="seen">Als gesehen markieren</button>
      <button id="restart">Heizung neu starten</button>
      <div class="note" id="result"></div><details><summary>Verlauf</summary><div id="history"></div></details></ha-card>`;
    this.shadowRoot.getElementById('seen').onclick=async()=>{
      const result=this.shadowRoot.getElementById('result');
      try { await this._hass.callService('button','press',{entity_id:this._config.seen_entity});
        result.textContent='Gesehen angefordert · kein Gerätefehler wird zurückgesetzt.';
      } catch(e) { result.textContent='Bestätigung fehlgeschlagen. Bitte erneut prüfen.'; }
    };
    this.shadowRoot.getElementById('restart').onclick=async()=>{
      if(this._starting || this.shadowRoot.getElementById('restart').disabled) return;
      if(!window.confirm('Ist die Ursache behoben und darf die Heizung wieder anlaufen? Raumheizung und Warmwasser werden einmal ausgeschaltet und nach drei Minuten auf die bisherigen Werte gestellt. Ein Fehlerreset ist nicht garantiert.')) return;
      this._starting=true; this._render();
      const result=this.shadowRoot.getElementById('result');
      result.textContent='Neustart läuft · Rückmeldungen werden geprüft …';
      try {
        await this._hass.callService('script',this._config.restart_entity.slice(7),{cause_resolved:true});
        result.textContent='Ablauf beendet. Das Prüfergebnis steht in den Home-Assistant-Benachrichtigungen.';
      } catch(e) {
        result.textContent='Neustart nicht erfolgreich bestätigt. Meldungen und Benachrichtigungen prüfen; es folgt kein automatischer weiterer Versuch.';
      } finally { this._starting=false; this._render(); }
    };
    this._render();
  }
  set hass(hass) { this._hass=hass; this._render(); }
  _render() {
    if (!this._hass || !this._config) return;
    const entity=this._hass.states[this._config.entity], a=entity?.attributes || {};
    this.shadowRoot.getElementById('setup-notice').hidden = Boolean(entity);
    const available=entity && !['unavailable','unknown'].includes(entity.state);
    const time=v=>{const d=new Date(v);return v && Number.isFinite(d.getTime())?d.toLocaleString(this._hass.locale?.language || 'de-DE'):'—';};
    const byId=id=>this.shadowRoot.getElementById(id);
    byId('status').textContent=available?entity.state:'Fehlerstatus nicht erreichbar';
    byId('status').className=available && a.fresh && !a.active?.length?'':'warn';
    byId('fresh').textContent=(available && a.fresh?'Zuletzt geprüft: ':'Letzter bekannter Stand: ')+time(a.checked);
    const active=byId('active');active.replaceChildren();
    for(const item of a.active || []) {
      const row=document.createElement('div');row.className='incident';
      const code=document.createElement('div');code.className='code';code.textContent=item.device+' · '+item.code;
      const note=document.createElement('div');note.className='note';
      note.textContent=({warning:'Warnung',error:'Störung',command:'Nicht bestätigt',unknown:'Unbekannte Meldung'}[item.severity] || 'Meldung')+
        ' · seit '+time(item.occurred)+(item.seen?' · Gesehen':' · Neu')+
        (!available || item.stale?' · Noch nicht erneut geprüft':'');
      row.append(code,note);active.append(row);
    }
    const restart=this._hass.states[this._config.restart_entity];
    const canRestart=this._config.restart_entity?.startsWith('script.') && restart && !['unavailable','unknown'].includes(restart.state);
    byId('reset').textContent=a.active?.some(x=>x.source!=='command')?
      'Ursache zuerst beheben. „Gesehen“ bestätigt nur die Meldung. Ein Neustart schaltet aus und wieder ein; er garantiert keinen Fehlerreset.':'';
    byId('restart').hidden=!canRestart;
    byId('restart').disabled=!available || !a.fresh || this._starting || restart?.state==='on' ||
      this._hass.states['binary_sensor.truma_inet_verbindung']?.state!=='on' ||
      this._hass.states['sensor.truma_inet_timer']?.state!=='Aus' ||
      (this._hass.states['climate.truma_inet_heizung']?.state==='off' && this._hass.states['select.truma_inet_warmwasser']?.state==='Aus');
    byId('restart').textContent=this._starting || restart?.state==='on'?'Neustart läuft …':'Heizung neu starten';
    byId('seen').hidden=!a.active?.length;
    byId('seen').disabled=!available || !a.active?.some(x=>!x.seen);
    const history=byId('history');history.replaceChildren();
    for(const item of [...(a.history || [])].reverse()) {
      const row=document.createElement('div');row.className='history';
      row.textContent=time(item.at)+' · '+item.device+' · '+item.code+' · '+
        ({occurred:'Aufgetreten',seen:'Gesehen',resolved:'Nicht mehr gemeldet'}[item.change] || item.change);
      history.append(row);
    }
    if(!a.history?.length) history.textContent='Noch keine Meldungen erfasst.';
  }
  getCardSize() { return 3; }
  getGridOptions() { return {columns:12,min_columns:6,min_rows:2}; }
}
if(!customElements.get('camper-inet-fault-card')) customElements.define('camper-inet-fault-card',CamperInetFaultCard);
window.customCards=window.customCards || [];
if (!window.customCards.some(card => card.type === 'camper-inet-fault-card')) window.customCards.push({type:'camper-inet-fault-card',name:'Truma Meldungen',description:'Meldungen von der Truma iNet Bridge. Erfordert Bridge und MQTT.'});
