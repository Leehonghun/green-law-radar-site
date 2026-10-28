/* Green-building department work portal extension. Official public data only. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dataNode = $('radar-data');
  if (!dataNode || !$('latest-post-list')) return;
  let DATA;
  try { DATA = JSON.parse(dataNode.textContent); } catch { return; }
  if (!Array.isArray(DATA.records)) return;

  document.title = '건축환경부 업무지원 포털 | 법규 레이더';
  const brand = document.querySelector('.brand-title');
  if (brand) brand.innerHTML = '건축환경부<br>업무지원 포털';
  const brandSub = document.querySelector('.brand-sub');
  if (brandSub) brandSub.textContent = 'Building Environment Workspace';
  const mark = document.querySelector('.brand .mark');
  if (mark) mark.textContent = '업무';
  const navCaption = document.querySelector('.aside .nav-caption');
  if (navCaption) navCaption.textContent = '1 · 법규 레이더';
  const crumb = document.querySelector('.top .crumb');
  if (crumb && crumb.firstChild) crumb.firstChild.textContent = '건축환경부 업무지원 포털 ';
  const info = document.querySelector('.info span:last-child');
  if (info) info.textContent = '공식 사이트의 수집 결과를 보여주는 업무지원 화면입니다. 매일 예약 점검은 현재 일부 게시판에 한정되며, 게시물 수집이 법규 개정 확정을 의미하지는 않습니다.';
  // Keep the header honest after scheduled collection, instead of freezing its date at the initial snapshot.
  fetch('./data/daily_radar.json?portal-check=' + Date.now(), {cache:'no-store'})
    .then(r => { if (!r.ok) throw new Error('no daily report'); return r.json(); })
    .then(report => {
      const header = document.querySelector('.top-meta');
      if (!header || !report.checked_at) return;
      const checked = new Date(report.checked_at);
      const display = Number.isNaN(checked.getTime()) ? report.checked_at :
        new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(checked);
      header.textContent = `최근 자동 점검 ${display} · ${report.success_sources||0}/${report.total_sources||7}개 수집`;
    })
    .catch(() => { /* The initial static snapshot remains usable offline. */ });
  const bottom = document.querySelector('.sidebar-bottom');
  if (bottom) bottom.innerHTML = '<span class="small-dot"></span>업무지원 포털 · 시범 운영<br><span style="font-size:10px;opacity:.8">공식 게시물 자동 점검 연동 · 일부 경로 검증 중</span>';

  const style = document.createElement('style');
  style.textContent = `
    #view-today .section-head{flex-wrap:wrap;gap:12px}
    #view-today .section-head>small{display:none}
    .today-card{grid-template-columns:104px minmax(0,1fr)!important}
    .today-card .today-link{display:none!important}
    .portal-select-wrap{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .portal-select-wrap label{font-size:12px;color:#5e7286;font-weight:700;white-space:nowrap}
    .portal-select-wrap select{border:1px solid #cfdbe9;border-radius:9px;background:white;padding:8px 28px 8px 10px;min-width:155px;max-width:100%;color:#19354b}
    .portal-count{padding:10px 20px;font-size:12px;color:#617a90;border-bottom:1px solid #e3e9f0;background:#fafcff}
    .portal-more{display:block;margin:14px auto 4px;padding:9px 26px}
    .portal-module-nav{margin-top:18px;padding-top:16px;border-top:1px solid #33516a}
    .portal-module-note{margin-top:8px;font-size:12px;color:#6d8096}
    .portal-placeholder{background:#fff;border:1px solid #e3e9f0;border-radius:12px;padding:28px;max-width:900px}
    .portal-placeholder h2{margin:0 0 12px;font-size:20px;color:#213d55}
    .portal-placeholder p{color:#5d748c;line-height:1.8}
    .portal-placeholder ul{color:#445f78;padding-left:20px;line-height:1.9}
    @media (max-width:800px){.portal-select-wrap{width:100%;margin:12px 0 0}.portal-select-wrap select{flex:1}.today-card{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);

  // One category at a time; the list can be expanded without changing the whole site.
  const today = $('view-today');
  const head = today && today.querySelector('.section-head');
  const list = $('latest-post-list');
  if (head) {
    const filterWrap = document.createElement('div');
    filterWrap.className = 'portal-select-wrap';
    const label = document.createElement('label');
    label.htmlFor = 'today-channel-filter';
    label.textContent = '자료 유형';
    const select = document.createElement('select');
    select.id = 'today-channel-filter';
    const all = document.createElement('option');
    all.value = 'all'; all.textContent = '전체 유형';
    select.append(all);
    const priorities = ['공고·공람','상담실 Q&A','공지사항','공지·공고','고시·훈령·예규','자료실','공개자료실','법령자료'];
    const channels = [...new Set(DATA.records.map(x => x.channel).filter(Boolean))];
    channels.sort((a,b) => {
      const ai=priorities.indexOf(a),bi=priorities.indexOf(b);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b,'ko');
    });
    for(const name of channels){
      const opt=document.createElement('option'); opt.value=name;
      opt.textContent=`${name} (${DATA.records.filter(x => x.channel === name).length}건)`;
      select.append(opt);
    }
    filterWrap.append(label, select);
    head.append(filterWrap);
    const more = document.createElement('button');
    more.type='button'; more.className='soft-button portal-more';
    more.textContent='게시물 더 보기';
    list.after(more);
    let limit=14;
    const ordered = DATA.records.slice().sort((a,b) => String(b.date||'').localeCompare(String(a.date||'')));
    const plain = str => String(str==null?'':str);
    const safeUrl = raw => {
      try {
        const url=new URL(raw);
        return url.protocol==='https:'?url.href:null;
      } catch { return null; }
    };
    const make = (tag, cls, value) => {
      const el=document.createElement(tag);
      if(cls) el.className=cls;
      if(value!==undefined) el.textContent=plain(value);
      return el;
    };
    function classifyLive(text){
      if(text.includes('공고·공람')) return '공고·공람';
      if(text.includes('기후에너지환경부 고시')) return '고시·훈령·예규';
      if(text.includes('기후에너지환경부 공지')) return '공지·공고';
      if(text.includes('G-SEED 공개자료')) return '공개자료실';
      if(text.includes('G-SEED 공지')) return '공지사항';
      if(text.includes('서울 환경영향평가 공지')) return '공지사항';
      if(text.includes('서울 환경영향평가 자료실')) return '자료실';
      return null;
    }
    function filterLive(){
      const live=$('radar-live-daily');
      if(!live) return;
      const choice=select.value;
      live.querySelectorAll('.live-row').forEach(row => {
        const category=classifyLive(row.querySelector('small')?.textContent || '');
        row.hidden = choice !== 'all' && category !== choice;
      });
    }
    function render(){
      const match = ordered.filter(r => select.value==='all'||r.channel===select.value);
      const chosen=match.slice(0,limit);
      const header=make('div','portal-count',`${select.value==='all'?'전체 자료':select.value} ${match.length.toLocaleString('ko-KR')}건 · 게시일순 ${chosen.length}건 표시 · 신규/개정 확정 아님`);
      const frag=document.createDocumentFragment();frag.append(header);
      for(const r of chosen){
        const row=make('article','today-card');
        row.append(make('div','date',(r.date||'날짜 미확인').replaceAll('-','.')));
        const middle=make('div','today-main');
        const attrs=make('div');
        const badge=make('span','source',r.group||'기타');
        attrs.append(badge,document.createTextNode(' '),make('span','today-meta',r.channel||'유형 미확인'));
        middle.append(attrs);
        const titleWrap=make('div'); titleWrap.style.marginTop='9px';
        const url=safeUrl(r.url);
        if(url){
          const a=make('a','',`${r.title||'제목 미확인'} ↗`);
          a.href=url;a.target='_blank';a.rel='noopener noreferrer';
          a.title=r.link_type==='direct'?'공식 원문 열기':'공식 게시판으로 이동 — 제목 검색 필요';
          titleWrap.append(a);
        }else titleWrap.append(make('span','',r.title||'제목 미확인'));
        middle.append(titleWrap);
        middle.append(make('div','today-meta',`${r.source||''} · ${r.link_type==='direct'?'공식 원문 주소 확인':'개별 원문 미검증 — 게시판에서 제목 검색 필요'}`));
        row.append(middle);frag.append(row);
      }
      if(!chosen.length) frag.append(make('p','today-empty','선택한 유형의 수집 게시물이 없습니다.'));
      list.replaceChildren(frag);
      more.hidden = limit>=match.length;
      filterLive();
    }
    select.addEventListener('change',()=>{limit=select.value==='all'?14:20;render();});
    more.addEventListener('click',()=>{limit+=20;render();});
    render();
    // Automatic new-item widget arrives asynchronously; its rows follow the same category filter.
    const observer=new MutationObserver(()=>filterLive());
    observer.observe(today,{childList:true,subtree:true});
  }

  // Independent module tabs. Real calculators will be developed separately after standards/inputs are verified.
  const nav=document.querySelector('.aside .nav');
  const main=document.querySelector('.main .content');
  if(nav&&main){
    const caption=document.createElement('div');
    caption.className='nav-caption portal-module-nav';
    caption.textContent='업무 도구 · 확장 예정';
    nav.append(caption);
    const modules=[
      {id:'thermal',number:2,name:'열관류율 계산서',desc:'벽체·지붕·바닥의 열관류율을 검토하는 계산 도구를 추가할 자리입니다.',parts:['재료·두께·열전도율 입력','층별 열저항과 열관류율 자동 계산','부위별 기준값 비교 및 검토서 출력']},
      {id:'gseed',number:3,name:'녹색건축 점수 검토서',desc:'G-SEED 항목별 점수와 인증등급을 검토하는 도구를 추가할 자리입니다.',parts:['평가항목별 배점·획득점수 입력','분야별 소계와 총점·등급 검토','검토서·근거자료 내보내기']}
    ];
    const info=document.querySelector('.main .info');
    const stats=document.querySelector('.main .stats');
    const showNormal=()=>{
      for(const x of modules){const el=$('view-'+x.id);if(el)el.classList.add('hide');}
      nav.querySelectorAll('button[data-portal-module]').forEach(b=>b.classList.remove('active'));
      if(info) info.classList.remove('hide');
      if(stats) stats.classList.remove('hide');
    };
    nav.querySelectorAll('button[data-tab]').forEach(b=>b.addEventListener('click',showNormal));
    for(const m of modules){
      const button=document.createElement('button');
      button.type='button';button.textContent=`${m.number}. ${m.name}`;
      button.dataset.portalModule=m.id;
      nav.append(button);
      const section=document.createElement('section');
      section.id='view-'+m.id;section.className='section hide';
      const card=document.createElement('div');card.className='portal-placeholder';
      const h=document.createElement('h2');h.textContent=m.name;
      const p=document.createElement('p');p.textContent=m.desc;
      const ul=document.createElement('ul');
      m.parts.forEach(part=>{const li=document.createElement('li');li.textContent=part;ul.append(li);});
      const note=document.createElement('p');note.className='portal-module-note';note.textContent='메뉴만 준비된 상태입니다. 계산 및 저장 기능은 아직 작동하지 않습니다. 향후 입력자료는 사용자의 브라우저에서 처리하며 공개 저장소로 전송하지 않도록 설계합니다.';
      card.append(h,p,ul,note);section.append(card);main.append(section);
      button.addEventListener('click',()=>{
        document.querySelectorAll('.main .section').forEach(el=>el.classList.add('hide'));
        section.classList.remove('hide');
        if(info)info.classList.add('hide');
        if(stats)stats.classList.add('hide');
        nav.querySelectorAll('button').forEach(el=>el.classList.remove('active'));
        button.classList.add('active');
        if($('page-title'))$('page-title').textContent=m.name;
        if($('page-subtitle'))$('page-subtitle').textContent='향후 추가할 업무 도구입니다. 현재는 메뉴 구조만 준비되었습니다.';
        if($('crumb-label'))$('crumb-label').textContent=m.name;
      });
    }
  }
})();
