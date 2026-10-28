/* Github Actions daily check widget. Safe public-source data only. */
(() => {
  'use strict';
  const target = document.getElementById('latest-post-list');
  if (!target) return;
  const container = document.createElement('div');
  container.id = 'radar-live-daily';
  container.style.cssText = 'margin:0 0 16px;border:1px solid #cbd8ea;border-radius:12px;background:#fff;overflow:hidden';
  target.parentNode.insertBefore(container, target);
  const style = document.createElement('style');
  style.textContent = `
   #radar-live-daily .live-h{padding:14px 17px;background:#edf4ff;font-weight:750;font-size:14px;color:#1c3b55}
   #radar-live-daily .live-meta{font-size:12px;font-weight:400;color:#637894;padding-top:4px}
   #radar-live-daily .live-row{padding:12px 17px;border-top:1px solid #e3e9f0}
   #radar-live-daily .live-row a{font-size:13px;font-weight:650;color:#215fba;text-decoration:none}
   #radar-live-daily .live-row a:hover{text-decoration:underline}
   #radar-live-daily .live-row small{font-size:11px;color:#6d7f93;display:block;margin-top:5px}
   #radar-live-daily .live-warning{padding:10px 17px;font-size:12px;color:#9b571d;background:#fff7ec}
   #radar-live-daily .live-empty{padding:15px 17px;color:#64748b;font-size:13px}`;
  document.head.appendChild(style);
  const header = document.createElement('div');
  header.className = 'live-h';
  header.textContent = '자동 점검 · GitHub Actions';
  container.append(header);
  const metadata = document.createElement('div');
  metadata.className = 'live-meta';
  header.append(metadata);
  const notice = (txt, cls) => {
    const div = document.createElement('div');
    div.className = cls || 'live-empty';
    div.textContent = txt;
    container.append(div);
    return div;
  };
  const allowedHosts = new Set(['www.gseed.or.kr','gseed.or.kr','eims.seoul.go.kr','www.mcee.go.kr','mcee.go.kr']);
  const officialUrl = raw => {
    try {
      const p = new URL(raw);
      return p.protocol === 'https:' && allowedHosts.has(p.hostname) ? p.href : null;
    } catch { return null; }
  };
  fetch('./data/daily_radar.json?cache=' + Date.now(), {cache: 'no-store'})
    .then(response => {if (!response.ok) throw new Error('자동 점검자료 없음'); return response.json();})
    .then(data => {
      const names = Object.values(data.source_status || {});
      const success = names.filter(x => ['success','baseline_created'].includes(x.status)).length;
      const failed = names.length - success;
      metadata.textContent = `${data.checked_at || '시간 미확인'} · 검증된 7개 게시판 중 ${success}개 수집 · 실패/미검증 ${failed}개`;
      const changes = Array.isArray(data.changes) ? data.changes : [];
      if (failed) notice(`확인 실패 ${failed}개 경로가 있습니다. 실패 경로는 '변경 없음'으로 처리하지 않습니다.`, 'live-warning');
      if (!changes.length) {
        notice(data.baseline_only
          ? '최초 실행 기준선입니다. 이전 기록이 없어 새로운 개정이라고 표시하지 않습니다.'
          : '이번 실행에서 새로 확인된 게시물 후보가 없습니다. 성공적으로 점검한 게시판에 한정합니다.');
      } else {
        notice(`직전 수집과 비교해 새로 발견하거나 제목 등이 달라진 게시물 후보 ${changes.length}건 · 개정 확정은 아닙니다.`, 'live-empty');
        for (const item of changes.slice(0,20)) {
          const line = document.createElement('div');line.className = 'live-row';
          const url = officialUrl(item.url);
          if (url) {
            const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.textContent = item.title || '(제목 미확인)'; line.append(a);
          } else {line.textContent = item.title || '(제목 미확인)';}
          const sm = document.createElement('small');
          sm.textContent = `${item.date || ''} · ${item.source || ''} · ${item.kind === 'updated_candidate'?'목록내용 변경 후보':'새로 발견한 게시물'}`;
          line.append(sm);container.append(line);
        }
      }
      notice('감시 범위는 현재 G-SEED·서울 환경영향평가·기후에너지환경부의 7개 게시판에 한정됩니다. 전체 37개 경로의 개정 확인 완료가 아닙니다.', 'live-empty');
    })
    .catch(err => {metadata.textContent = 'GitHub Actions 결과 수신 전';notice('자동 점검 결과가 아직 게시되지 않았습니다. 최초 실행 후 표시됩니다.', 'live-warning');});
})();
