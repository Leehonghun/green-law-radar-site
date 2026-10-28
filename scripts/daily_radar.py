"""Daily public-only official radar collection and changed-post candidate detection.

This is intentionally limited to six vetted official boards (G-SEED x2,
Seoul EIMS x3, MCEE government RSS x2); it does NOT assert 37-source coverage.
A baseline is established on the first successful scan per source, never as news.
State is committed by Github Actions to the PUBLIC site repository. No secrets/PII.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import html
import json
import math
import re
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse, urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET

KST=ZoneInfo('Asia/Seoul')
GSEED='https://www.gseed.or.kr'
EIMS='https://eims.seoul.go.kr/eims/usr/news/'
MCEE_FEEDS={
    'mcee_notice': 'https://www.mcee.go.kr/home/web/board/rss.do?menuId=10524&boardMasterId=39',
    'mcee_rules': 'https://www.mcee.go.kr/home/web/law/rss.do?menuId=71&condition.typeCode=admrul',
}
SOURCES={
    'gseed_notice': {'name':'G-SEED 공지','site':'G-SEED','type':'full_listing'},
    'gseed_files': {'name':'G-SEED 공개자료','site':'G-SEED','type':'full_listing'},
    'eims_notice': {'name':'서울 환경영향평가 공지','site':'서울 EIMS','type':'full_listing'},
    'eims_announce': {'name':'서울 환경영향평가 공고·공람','site':'서울 EIMS','type':'full_listing'},
    'eims_library': {'name':'서울 환경영향평가 자료실','site':'서울 EIMS','type':'full_listing'},
    'mcee_notice': {'name':'기후에너지환경부 공지','site':'기후에너지환경부','type':'recent_rss_only'},
    'mcee_rules': {'name':'기후에너지환경부 고시·행정규칙','site':'기후에너지환경부','type':'recent_rss_only'},
}


def stable_hash(*elements):
    txt=json.dumps(elements,ensure_ascii=False,separators=(',',':'),sort_keys=True)
    return hashlib.sha256(txt.encode('utf-8')).hexdigest()


def clean_date(raw):
    match=re.search(r'(20\d{2})[-./](\d{1,2})[-./](\d{1,2})',str(raw or ''))
    if not match:return None
    try:return date(*map(int,match.groups())).isoformat()
    except ValueError:return None


def checked_https(raw, allowed):
    p=urlparse(raw)
    if p.scheme!='https' or p.hostname not in allowed:
        raise ValueError('Official trusted HTTPS host required')
    return raw


def normalize_post(source, post_id,title,published,url,*hashparts):
    title=' '.join(str(title or '').split())
    if not post_id or not title or not published:
        raise ValueError('missing post key/title/date')
    allowed={'www.gseed.or.kr','gseed.or.kr','eims.seoul.go.kr','www.mcee.go.kr','mcee.go.kr'}
    checked_https(url,allowed)
    return {'key':source+':'+str(post_id),'source_id':source,'source':SOURCES[source]['name'],
            'title':title[:450],'date':published,'url':url,
            'content_hash':stable_hash(title,published,*hashparts),
            'link_note':'공식 게시판 열기' if source.startswith('eims') else '공식 원문 후보'}


def parse_rss(content,source):
    root=ET.fromstring(content)
    if root.tag!='rss':raise ValueError('not an RSS document')
    nodes=root.findall('./channel/item')
    if not nodes:raise ValueError('missing feed items; no-change not assumed')
    seen=set();results=[]
    for node in nodes:
        title=' '.join((node.findtext('title') or '').split())
        relative=(node.findtext('link') or '').strip()
        if not relative:raise ValueError('item link missing')
        url=urljoin(MCEE_FEEDS[source],relative)
        parsed=urlparse(url)
        checked_https(url,{'www.mcee.go.kr','mcee.go.kr'})
        if parsed.params.lower().startswith('jsessionid='):
            parsed=parsed._replace(params='')
        url=urlunparse(parsed._replace(path=re.sub(r';jsessionid=[^/]+','',parsed.path,flags=re.I),fragment=''))
        guid=(node.findtext('guid') or '').strip() or url
        if guid in seen:raise ValueError('duplicate feed ID')
        seen.add(guid)
        date_text=(node.findtext('pubDate') or '').strip()
        try:
            dt=parsedate_to_datetime(date_text)
            published=dt.astimezone(KST).date().isoformat() if dt.tzinfo else dt.date().isoformat()
        except (ValueError,TypeError,OverflowError):
            published=clean_date(date_text)
        description=' '.join((node.findtext('description') or '').split())
        results.append(normalize_post(source,guid,title,published,url,description[:600]))
    return results


def retrieve_rss(url):
    checked_https(url,{'www.mcee.go.kr','mcee.go.kr'})
    req=Request(url,headers={'User-Agent':'GreenLawRadar/1.0 (public government bulletin reader)',
                 'Accept':'application/rss+xml,application/xml,text/xml,*/*'})
    with urlopen(req,timeout=22) as response:
        checked_https(response.geturl(),{'www.mcee.go.kr','mcee.go.kr'})
        raw=response.read(2_500_001)
    if len(raw)>2_500_000:raise ValueError('RSS response too large')
    return raw


async def collect_gseed(browser,source):
    key='notices' if source=='gseed_notice' else 'open_files'
    path='/board.do?pageNum=1' if key=='notices' else '/openFile.do?pageNum=1'
    endpoint='/boardPage.do' if key=='notices' else '/openFilePage.do'
    detail_path='/boardDetailPage.do' if key=='notices' else '/openFileDetailPage.do'
    context=await browser.new_context(locale='ko-KR',timezone_id='Asia/Seoul')
    page=await context.new_page()
    try:
        res=await page.goto(GSEED+path,wait_until='domcontentloaded',timeout=30000)
        if not res or res.status!=200:raise ValueError('G-SEED landing failed')
        result=[];expected=None;size=None
        for i in range(1,41):
            data=await page.evaluate("""async ({endpoint,i,open})=>{
                 const f=new URLSearchParams({bbsContent:'',currentPage:String(i)});
                 if(open)f.set('bbsCtgryCd','');
                 const r=await fetch(endpoint,{method:'POST',credentials:'same-origin',
                   headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
                            'X-Requested-With':'XMLHttpRequest'},body:f});
                 if(!r.ok)throw new Error('HTTP '+r.status);
                 return r.json();} """,{'endpoint':endpoint,'i':i,'open':key=='open_files'})
            if not isinstance(data.get('resultList'),list):raise ValueError('Official resultList absent')
            if i==1:
                expected=int(data['endNum']);size=int(data['pageSize'])
                if not (0<=expected<=5000 and 1<=size<=50):raise ValueError('Official total/page size abnormal')
                pages=math.ceil(expected/size)
                if pages>40:raise ValueError('G-SEED page cap; no success assertion')
            assert expected is not None and size is not None
            expected_page_rows=min(size,max(0,expected-(i-1)*size))
            if len(data['resultList'])!=expected_page_rows:
                raise ValueError('G-SEED partial page '+str(i))
            if int(data['endNum'])!=max(0,expected-(i-1)*size):
                raise ValueError('G-SEED page display count inconsistent')
            for rec in data['resultList']:
                pid=str(rec.get('bbsId') or '').strip()
                if not pid.isdigit():raise ValueError('G-SEED malformed ID')
                params={'rnum':str(rec.get('rnum') or ''),'bbsCnt':str(rec.get('bbsCnt') or '0'),
                        'bbsId':pid,'pageNum':str(i)}
                url=GSEED+detail_path+'?'+urlencode(params)
                result.append(normalize_post(source,pid,rec.get('bbsTitle'),clean_date(rec.get('rgtDt')),url,
                     str(rec.get('bbsContent') or '')[:1000],clean_date(rec.get('fnlMdfyDt'))))
            if i>=math.ceil(expected/size):break
            await asyncio.sleep(0.2)
        if len(result)!=expected or len({x['key'] for x in result})!=len(result):
            raise ValueError('G-SEED official total / IDs mismatch')
        return result
    finally:await context.close()


async def collect_eims(browser,section):
    source='eims_'+section
    home='https://eims.seoul.go.kr/eims/usr/main/index.do'
    context=await browser.new_context(locale='ko-KR',timezone_id='Asia/Seoul')
    page=await context.new_page()
    try:
        res=await page.goto(home,wait_until='domcontentloaded',timeout=30000)
        if not res or res.status!=200:raise ValueError('EIMS homepage unavailable')
        await page.get_by_text('소식알림',exact=True).first.click(timeout=10000)
        await page.wait_for_timeout(900)
        endpoint=EIMS+section+'/'
        total=await page.evaluate("""async ({endpoint,section})=>{
          const f=new URLSearchParams({curPage:'1',menuParam:section,ensID:'',searchType:'3',searchWord:''});
          const c=new AbortController();const t=setTimeout(()=>c.abort(),18000);
          try{const r=await fetch(endpoint+'count.json',{method:'POST',signal:c.signal,
                credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Requested-With':'XMLHttpRequest'},body:f});
              if(!r.ok)throw new Error('HTTP '+r.status);
              const j=await r.json();if(j.resultStatus!=='SUCCESS')throw new Error('invalid count response');
              return Number(j.resultData);
          }finally{clearTimeout(t)}
        }""",{'endpoint':endpoint,'section':section})
        if not (isinstance(total,(int,float)) and float(total).is_integer() and 0<=total<=5000):
            raise ValueError('EIMS official count abnormal')
        total=int(total); pages=math.ceil(total/10)
        if pages>60:raise ValueError('EIMS page cap')
        result=[]
        for i in range(1,pages+1):
            rows=await page.evaluate("""async ({endpoint,section,i,total})=>{
              const f=new URLSearchParams({rowSize:'10',totalRow:String(total),curPage:String(i),menuParam:section,
                   ensID:'',searchType:'3',searchWord:''});
              const c=new AbortController();const t=setTimeout(()=>c.abort(),18000);
              try{const r=await fetch(endpoint+'list_data.frg',{method:'POST',signal:c.signal,
                credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',
                'X-Requested-With':'XMLHttpRequest'},body:f});
                if(!r.ok)throw new Error('HTTP '+r.status);
                const dom=new DOMParser().parseFromString(await r.text(),'text/html');
                const actions={notice:'goNoticeView',announce:'goAnnounceView',library:'goLibraryView'};
                return [...dom.querySelectorAll('tbody tr[onclick]')].map(tr=>{
                  const action=tr.getAttribute('onclick')||'';
                  const match=action.startsWith(actions[section]+'(')?action.match(/[0-9]{8,}/):null;
                  const td=tr.querySelectorAll('td');
                  return {id:match?match[0]:null,title:td.length>=6?td[1].textContent.trim():null,
                     date:td.length>=6?td[5].textContent.trim():null};
                });
              }finally{clearTimeout(t)}
            }""",{'endpoint':endpoint,'section':section,'i':i,'total':total})
            if len(rows)!=min(10,max(0,total-(i-1)*10)):
                raise ValueError('EIMS missing page rows '+str(i))
            for row in rows:
                pid=str(row['id'] or '')
                if not pid.isdigit():raise ValueError('EIMS row ID missing')
                # EIMS details are POST session navigation; do NOT make up a direct detail URL.
                result.append(normalize_post(source,pid,row['title'],clean_date(row['date']),
                                  EIMS+section+'/list.do'))
            await asyncio.sleep(0.15)
        if len(result)!=total or len({x['key'] for x in result})!=len(result):
            raise ValueError('EIMS official total/unique ID mismatch')
        return result
    finally:await context.close()


def compare_and_save(state,groups,now):
    """Failed source preserves old baseline but is labeled failed (never 'no changes')."""
    seen=dict(state.get('seen') or {})
    success_history=dict(state.get('last_success') or {})
    status={};changes=[];successes=0
    for key in SOURCES:
        payload=groups.get(key)
        if isinstance(payload,Exception):
            status[key]={'name':SOURCES[key]['name'],'status':'failed','error':str(payload)[:250],
                         'last_success':success_history.get(key),'rows':0}
            continue
        if payload is None:
            status[key]={'name':SOURCES[key]['name'],'status':'unverified','error':'Not executed',
                         'last_success':success_history.get(key),'rows':0}
            continue
        if not isinstance(payload,list) or not payload:
            status[key]={'name':SOURCES[key]['name'],'status':'failed','error':'No entries returned; no-change not inferred',
                         'last_success':success_history.get(key),'rows':0}
            continue
        source_entries=[v for v in seen.values() if v.get('source_id')==key]
        baseline=bool(source_entries)
        for post in payload:
            previous=seen.get(post['key'])
            if previous is not None and post['content_hash']!=previous['content_hash']:
                changes.append({**post,'kind':'updated_candidate','observed_at':now})
            elif previous is None and baseline:
                changes.append({**post,'kind':'new_candidate','observed_at':now})
            seen[post['key']]={**post,'first_seen':previous.get('first_seen',now) if previous else now,
                               'last_seen':now}
        status[key]={'name':SOURCES[key]['name'],
                     'status':'success' if baseline else 'baseline_created',
                     'coverage':SOURCES[key]['type'],'rows':len(payload),'last_success':now}
        success_history[key]=now
        successes+=1
    trimmed={k:v for k,v in seen.items() if v.get('source_id') in SOURCES}
    return {'version':1,'seen':trimmed,'last_success':success_history}, {
        'checked_at':now,'check_date':now[:10],
        'scope':'7 tested official bulletin endpoints; NOT all 37 sources; not amendment confirmation',
        'total_sources':len(SOURCES),'success_sources':successes,
        'failed_sources':len(SOURCES)-successes,
        'source_status':status,
        'baseline_only':not any(v['status']=='success' for v in status.values()),
        'changes':sorted(changes,key=lambda v:(v.get('date') or '',v['observed_at']),reverse=True)[:120],
        'recent_observed':sorted([p for posts in groups.values() if isinstance(posts,list) for p in posts],
                                 key=lambda v:(v.get('date') or '',v['title']),reverse=True)[:24],
        'disclaimer':'신규·변경은 게시물 비교 후보입니다. 법규 개정 확정 아님. 실패한 게시판은 확인 완료가 아닙니다.'
    }


async def gather_sources(no_browser=False):
    output={}
    for key,url in MCEE_FEEDS.items():
        try:
            output[key]=await asyncio.to_thread(lambda u=url,k=key:parse_rss(retrieve_rss(u),k))
        except Exception as exc:output[key]=exc
    if no_browser:return output
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        try:
            for key in ('gseed_notice','gseed_files'):
                try:output[key]=await collect_gseed(browser,key)
                except Exception as exc:output[key]=exc
            for section in ('notice','announce','library'):
                key='eims_'+section
                try:output[key]=await collect_eims(browser,section)
                except Exception as exc:output[key]=exc
        finally:await browser.close()
    return output


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--repo-root',type=Path,default=Path(__file__).resolve().parents[1])
    ap.add_argument('--no-browser',action='store_true')
    args=ap.parse_args()
    root=args.repo_root
    statefile=root/'data'/'radar_state.json'; reportfile=root/'data'/'daily_radar.json'
    if statefile.exists():state=json.loads(statefile.read_text(encoding='utf-8'))
    else:state={'version':1,'seen':{},'last_success':{}}
    now=datetime.now(KST).isoformat(timespec='seconds')
    fetched=asyncio.run(gather_sources(args.no_browser))
    updated,report=compare_and_save(state,fetched,now)
    statefile.parent.mkdir(parents=True,exist_ok=True)
    statefile.write_text(json.dumps(updated,ensure_ascii=False,indent=2),encoding='utf-8')
    reportfile.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'time':now,'passed':report['success_sources'],
       'failed':report['failed_sources'],'change_candidates':len(report['changes']),
       'statuses':{k:v['status'] for k,v in report['source_status'].items()}},ensure_ascii=False))
    # An all-failed run still outputs explicit failure status; Action should be warning, not 'no changes'.
    if report['success_sources']==0:raise SystemExit('All official sources failed; report saved with failure details')

if __name__=='__main__':main()
