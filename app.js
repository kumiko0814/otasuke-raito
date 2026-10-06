/* おたすけ らいと君 画面（入力 → RAITO.generate → 表示・コピー・JSON書き出し・任意のAI補助） */
(function(){
  'use strict';
  var DICT = (typeof RAITO_DICT !== 'undefined') ? RAITO_DICT : null;           // eslint-disable-line no-undef
  var BENCH = (typeof BENCH_EX !== 'undefined') ? BENCH_EX : null;              // eslint-disable-line no-undef
  var $ = function(id){ return document.getElementById(id); };
  var platform = 'mercari', last = null, lastInput = null, sample = null, origDesc = null;
  var FIELDS = ['brand','item','model','refPrice','color','material','sizeLabel','condition','damage','accessories','purchasedFrom','features','cost'];
  var CONDITIONS_FALLBACK = ['新品未使用','未使用に近い','目立った傷や汚れなし','やや傷や汚れあり','傷や汚れあり'];

  /* 相棒のドット絵 */
  (function(){
    var PAL={A:'#8a7690',B:'#fce6ee',K:'#574a58',C:'#f5b8cf',W:'#c66f96'};
    var CHILD=['..AA........AA..','.ABBA......ABBA.','.ABBBAAAAAABBBA.','.ABBBBBBBBBBBBA.','ABBBBBBBBBBBBBBA','ABBKKBBBBBBKKBBA','ABBKKBBBBBBKKBBA','ABCCBBBBBBBBCCBA','ABBBBBBWWBBBBBBA','ABBBBBBBBBBBBBBA','.ABBBBBBBBBBBBA.','.ABBBBBBBBBBBBA.','..ABBBBBBBBBBA..','..ABBAAAAAABBA..','..AAA......AAA..','................'];
    var s='<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    CHILD.forEach(function(r,y){ for(var x=0;x<16;x++){ var c=PAL[r[x]]; if(c) s+='<rect x="'+x+'" y="'+y+'" width="1" height="1" fill="'+c+'"/>'; } });
    $('buddy').innerHTML=s+'</svg>';
  })();

  if(!DICT || typeof RAITO === 'undefined'){
    $('err').textContent='辞書が読み込めませんでした。少し待ってから、ページを読み込み直してください。';
    $('err').hidden=false; $('go').disabled=true; return;
  }

  /* 入力欄の準備：ラベル・例文は辞書の inputFields を優先 */
  var KEY_ALIAS={purchasedAt:'purchasedFrom'};
  (DICT.inputFields||[]).forEach(function(f){
    if(f.type==='measure') return;
    var el=$('f-'+(KEY_ALIAS[f.key]||f.key)); if(!el) return;
    if(f.placeholder) el.placeholder=f.placeholder;
    var lb=document.querySelector('label[for="f-'+(KEY_ALIAS[f.key]||f.key)+'"]');
    if(lb && f.label){ var em=lb.querySelector('em'); lb.textContent=f.label; if(em) lb.appendChild(em); }
  });
  if(!$('f-brand').placeholder) $('f-brand').placeholder='例）COACH／ユニクロ／ノーブランド';
  if(!$('f-item').placeholder) $('f-item').placeholder='例）ショルダーバッグ／Tシャツ';
  function fillList(id, values){ var dl=$(id); values.forEach(function(v){ if(!v) return; var o=document.createElement('option'); o.value=v; dl.appendChild(o); }); }
  fillList('dl-brand', (DICT.brands||[]).map(function(b){ return b.brand_name_jp||b.brand_name; }).concat(['ノーブランド']));
  fillList('dl-color', (DICT.colors||[]).map(function(c){ return c.display_common; }));
  fillList('dl-material', (DICT.materials||[]).map(function(m){ return m.material; }));
  var conds=(DICT.conditions&&DICT.conditions.length) ? DICT.conditions.map(function(c){ return c.condition; }) : CONDITIONS_FALLBACK;
  conds.forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; $('f-condition').appendChild(o); });
  $('f-condition').value = conds.indexOf('目立った傷や汚れなし')>=0 ? '目立った傷や汚れなし' : conds[0];

  /* 採寸欄：アイテムの種類を判定して、その size_fields だけ出す */
  var measVals={}, MEAS_PH={};
  (DICT.inputFields||[]).concat(DICT.extraMeasureFields||[]).forEach(function(f){ if(f.type==='measure' && f.label) MEAS_PH[f.label]=f.placeholder||'cm'; });
  function renderMeasures(){
    var cat=RAITO.detectCategory({item:$('f-item').value, model:$('f-model').value, features:$('f-features').value}, DICT);
    var flds=cat ? [].concat(cat.size_fields||[]).filter(function(f){ return f && f!=='表記サイズ'; }) : [];
    var grid=$('measGrid');
    grid.querySelectorAll('input').forEach(function(i){ measVals[i.dataset.k]=i.value; });
    grid.innerHTML='';
    $('meas').hidden=!flds.length;
    if(!flds.length) return;
    $('measTitle').textContent='採寸（'+cat.subcategory+'・平置き・cm）';
    flds.forEach(function(k){
      var d=document.createElement('div'), id='m-'+k;
      var lb=document.createElement('label'); lb.htmlFor=id; lb.textContent=k;
      var inp=document.createElement('input'); inp.id=id; inp.dataset.k=k; inp.inputMode='decimal'; inp.placeholder=MEAS_PH[k]||'cm'; inp.value=measVals[k]||'';
      d.appendChild(lb); d.appendChild(inp); grid.appendChild(d);
    });
  }
  /* 当てはまる特徴の候補（辞書のカテゴリ推奨語・ブランド別キーワード）。選んだものだけタイトルに入る */
  var picked={};
  function renderChips(){
    var list=RAITO.chips({brand:$('f-brand').value, item:$('f-item').value, model:$('f-model').value, features:$('f-features').value}, DICT);
    var box=$('chips'); box.innerHTML=''; $('chipsWrap').hidden=!list.length;
    list.forEach(function(w){
      var b=el('button',null,w); b.type='button'; b.setAttribute('aria-pressed', picked[w]?'true':'false');
      b.onclick=function(){ picked[w]=!picked[w]; b.setAttribute('aria-pressed', picked[w]?'true':'false'); };
      box.appendChild(b);
    });
  }
  ['f-item','f-model','f-features'].forEach(function(id){ $(id).addEventListener('input', renderMeasures); });
  ['f-brand','f-item','f-model'].forEach(function(id){ $(id).addEventListener('input', renderChips); });

  function collect(){
    var inp={platform:platform, measures:{}};
    FIELDS.forEach(function(k){ var el=$('f-'+k); if(el) inp[k]=(el.value||'').trim(); });
    $('measGrid').querySelectorAll('input').forEach(function(i){ if(i.value.trim()) inp.measures[i.dataset.k]=i.value.trim(); });
    inp.picks=[].slice.call($('chips').querySelectorAll('button[aria-pressed="true"]')).map(function(b){ return b.textContent; });
    return inp;
  }

  /* 表示 */
  function yen(n){ n=Math.round(Number(n)||0); return (n<0?'-':'')+'¥'+Math.abs(n).toLocaleString('ja-JP'); }
  function el(tag, cls, text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
  function copyText(txt, btn){
    var done=function(){ btn.textContent='コピーしました'; setTimeout(function(){ btn.textContent='コピー'; },1500); };
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done, fallback); }
      else fallback();
    }catch(e){ fallback(); }
    function fallback(){
      try{ var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); var ok=document.execCommand('copy'); document.body.removeChild(ta); if(ok) done(); else btn.textContent='長押しでコピー'; }
      catch(e){ btn.textContent='長押しでコピー'; }
    }
  }
  function copyBtn(getText, id){ var b=el('button','copy','コピー'); b.type='button'; if(id) b.id=id; b.onclick=function(){ copyText(getText(), b); }; return b; }
  function head(r, title, tools){ var h=el('h3'); h.appendChild(document.createTextNode(title)); if(tools){ var t=el('span','tools'); tools.forEach(function(x){ t.appendChild(x); }); h.appendChild(t); } r.appendChild(h); }

  function render(d){
    last=d; origDesc=null;
    var r=$('result'); r.innerHTML=''; r.hidden=false;
    var ok = d.titleLen>=d.titleMin && d.titleLen<=d.titleMax;
    var cnt=el('span','pill '+(ok?'ok':'lav'), d.titleLen+'字（目標 '+d.titleMin+'〜'+d.titleMax+'字）'); cnt.id='titleCount';
    head(r, 'タイトル', [cnt, copyBtn(function(){ return last.title; }, 'copyTitle')]);
    var t=el('div','box',d.title); t.id='outTitle'; r.appendChild(t);

    var descTools=[copyBtn(function(){ return last.description; }, 'copyDesc')];
    if(sample){ var ai=el('button','copy','説明文をなめらかに'); ai.type='button'; ai.id='aiSmooth'; ai.onclick=function(){ smooth(ai); }; descTools.unshift(ai); }
    head(r, '説明文', descTools);
    var ds=el('div','box',d.description); ds.id='outDesc'; r.appendChild(ds);
    var aiNote=el('div','note'); aiNote.id='aiNote'; aiNote.hidden=true; r.appendChild(aiNote);

    var tags=d.hashtags.join(' ');
    head(r, 'ハッシュタグ（'+d.hashtags.length+'個）', [copyBtn(function(){ return last.hashtags.join(' '); })]);
    r.appendChild(el('div','box',tags));

    var p=d.price||{};
    head(r, '価格の目安');
    var pb=el('div','box'); pb.style.whiteSpace='normal';
    if(p.examples && p.examples.length){
      pb.appendChild(el('div','cnt',p.profileLabel+'（'+p.category+'・'+p.n+'件から低・中・高の3例）'));
      p.examples.forEach(function(e){ var row=el('div','ex'); row.appendChild(el('b',null,yen(e.price))); row.appendChild(el('span',null,e.title)); pb.appendChild(row); });
    } else {
      pb.appendChild(el('div',null,'このジャンルの売れた例はまだ登録がありません。メルカリで「売り切れ」に絞って、同じ商品の価格を確かめてください。'));
    }
    r.appendChild(pb);
    r.appendChild(el('div','note strong', p.note || RAITO.BENCH_NOTE));
    if(p.refGuide) r.appendChild(el('div','note', p.refGuide.text));
    if(p.profit) r.appendChild(el('div','note', p.profit.text));

    if(d.warnings.length){
      head(r, 'あるともっと良くなるもの');
      var ck=el('div'); d.warnings.forEach(function(w){ ck.appendChild(el('div','check','・'+w)); }); r.appendChild(ck);
    }

    var btns=el('div','btns');
    var j1=el('button','cta ghost','JSONを保存'); j1.type='button'; j1.onclick=saveJson;
    var j2=el('button','cta ghost','JSONをコピー'); j2.type='button'; j2.onclick=function(){ copyText(JSON.stringify(exportObj(),null,2), j2); setTimeout(function(){ j2.textContent='JSONをコピー'; },1600); };
    btns.appendChild(j1); btns.appendChild(j2); r.appendChild(btns);

    $('greet').textContent = ok
      ? 'タイトルは'+d.titleLen+'字で、ちょうど良い長さです。説明文の「（記入してください）」があれば、埋めてから出品してくださいね。'
      : 'タイトルが'+d.titleLen+'字です。下の「あるともっと良くなるもの」を足すと、検索に強いタイトルになります。';
  }

  function exportObj(){ return {input:lastInput, output:{platform:last.platform,title:last.title,titleLen:last.titleLen,description:last.description,hashtags:last.hashtags,price:last.price,warnings:last.warnings}}; }
  function saveJson(){
    var txt=JSON.stringify(exportObj(),null,2);
    try{
      var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type:'application/json'}));
      a.download='raito_'+(last.platform)+'_'+Date.now()+'.json'; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }catch(e){ $('err').textContent='保存できない環境です。「JSONをコピー」を使ってください。'; $('err').hidden=false; }
  }

  function run(){
    var inp=collect();
    if(!inp.item && !inp.brand){ $('err').textContent='アイテム名を入れてください。'; $('err').hidden=false; return; }
    $('err').hidden=true;
    lastInput=inp;
    render(RAITO.generate(inp, DICT, BENCH));
    $('go').textContent='入れ直して、もう一度つくる';
  }
  $('go').onclick=function(){ run(); $('result').scrollIntoView({behavior:'smooth', block:'start'}); };
  document.querySelectorAll('#seg button').forEach(function(b){
    b.onclick=function(){
      document.querySelectorAll('#seg button').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on'); platform=b.dataset.p;
      if(last) run();
    };
  });

  /* ---- 任意のAI補助：説明文の言い回しだけ整える（タイトルは渡さない） ---- */
  var EMOJI=/\p{Extended_Pictographic}/u;
  function headings(t){ return (t.match(/^■.*$/gm)||[]).join('\n'); }
  function numbers(t){ return (t.normalize('NFKC').match(/\d+(?:[.,]\d+)*/g)||[]).sort().join(','); }
  function smooth(btn){
    var src=last.description;
    var ng=(DICT.forbidden||[]).concat(DICT.fillerWords||[]);
    var prompt='次の出品説明文の言い回しだけを、やさしく丁寧で読みやすい日本語に整えてください。\n'
      +'守ること：\n- 構造（■で始まる見出しの文言・順番）を一字も変えない\n- 事実・数値・サイズ・価格・型番・状態の内容を変えない。足さない・削らない\n'
      +'- 全体の字数をほぼ変えない（±15%以内）\n- 絵文字・顔文字・記号の飾りを使わない\n- 「（記入してください）」はそのまま残す\n'
      +'- 次の語は使わない：'+ng.join('、')+'\n'
      +'整えた説明文の本文だけを返してください（前置きや説明は書かない）。\n\n---\n'+src;
    btn.disabled=true; btn.textContent='整えています…';
    var note=$('aiNote');
    sample(prompt, {modelTier:'quick'}).then(function(res){
      var out=String(res&&res.text||'').trim();
      var bad=ng.filter(function(w){ return w && out.indexOf(w)>=0 && src.indexOf(w)<0; });
      var lenOk=Math.abs(out.length-src.length) <= src.length*0.2;
      if(!out || res.truncated || headings(out)!==headings(src) || numbers(out)!==numbers(src) || EMOJI.test(out) || bad.length || !lenOk){
        note.textContent='整えた結果が見出しや数値を変えてしまったので、元の説明文のままにしています。'; note.hidden=false; return;
      }
      origDesc=src; last.description=out; $('outDesc').textContent=out;
      note.textContent='言い回しを整えました（見出し・数値は元のままです）。'; note.hidden=false;
      var undo=el('button','copy','元に戻す'); undo.type='button'; undo.style.marginLeft='6px';
      undo.onclick=function(){ last.description=origDesc; $('outDesc').textContent=origDesc; note.hidden=true; };
      note.appendChild(undo);
    }).catch(function(e){
      var code=e&&e.code;
      if(code==='not_granted'){ btn.hidden=true; return; }
      note.textContent= code==='rate_limited' ? 'いま混み合っています。少し待ってからもう一度お願いします。' : '今回は整えられませんでした。元の説明文はそのまま使えます。';
      note.hidden=false;
    }).then(function(){ btn.disabled=false; btn.textContent='説明文をなめらかに'; });
  }
  (async function(){
    try{ if(window.claude && typeof window.claude.use==='function'){ sample = await window.claude.use('sample'); } }catch(e){ sample=null; }
    if(sample && last) render(last);
  })();
})();
