/* おたすけ らいと君 生成エンジン
   辞書（RAITO_DICT）×テンプレートで、タイトル・説明文・ハッシュタグ・価格の目安を決定的に組み立てる。
   AIは使わない。同じ入力からは必ず同じ結果が出る。
   使い方: RAITO.generate(input, dict[, bench]) -> {platform,title,titleLen,titleMin,titleMax,description,hashtags,price,warnings,fields} */
var RAITO = (function(){
  'use strict';

  var MEASURE_KEYS = ['肩幅','身幅','袖丈','着丈','ウエスト','股上','股下','わたり幅','裾幅','総丈','ヒップ','縦','横','マチ','全長'];
  var SIZE_ORDER = ['XXS','XS','S','M','L','XL','XXL','3XL','4XL'];
  var SIZE_ALIAS = {'SS':'XS','LL':'XL','2L':'XL','3L':'XXL','2XL':'XXL','4L':'3XL','5L':'4XL','O':'XL','XO':'XXL'};
  var GENDER_WORDS = ['レディース','メンズ','ユニセックス','キッズ'];
  var NO_BRAND = ['ノーブランド','のーぶらんど','nobrand','なし','不明'];
  var DEFAULT_TEMPLATES = {
    mercari:{order:['badge','brand','item','color','size','highValue','model','brandKeywords','categoryKeywords','material','colorAlt','gender'],min:38,max:39},
    yahoo:{order:['badge','brand','item','model','color','size','material','features','keywords'],min:98,max:99}
  };
  var BENCH_NOTE = '同じジャンルで実際に売れた例。この商品自体の実売ではありません';
  var BENCH_CATS = [
    ['財布',/財布|ウォレット|コインケース|カードケース/],
    ['バッグ',/バッグ|バック|トート|ショルダー|リュック|ポーチ|クラッチ|鞄|カバン/],
    ['靴',/靴|パンプス|スニーカー|ブーツ|サンダル|ローファー|シューズ|スリッポン/],
    ['ネクタイ',/ネクタイ/],['ストール',/ストール|マフラー|ショール|スカーフ/],
    ['アクセサリー',/ピアス|イヤリング|ネックレス|ブレスレット|指輪|リング|バングル|ブローチ/],
    ['ダウン',/ダウン/],['コート',/コート/],['ジャケット',/ジャケット|ブルゾン|アウター|パーカー|カーディガン/],
    ['ニット',/ニット|セーター/],['ワンピース',/ワンピース/],['シャツ',/シャツ|ブラウス|カットソー/],
    ['スカート',/スカート/],['パンツ',/パンツ|デニム|ジーンズ|スラックス|ズボン/],['スーツ',/スーツ|セットアップ/]
  ];
  // 定価に対する中古の目安（一般的な幅。必ず実際の売り切れ相場で確認する前提）
  var REF_RATIO = {'新品未使用':[0.5,0.7],'未使用に近い':[0.4,0.6],'目立った傷や汚れなし':[0.3,0.5],'やや傷や汚れあり':[0.2,0.35],'傷や汚れあり':[0.1,0.25],'全体的に状態が悪い':[0.05,0.15]};

  /* ---------- 小さな道具 ---------- */
  function len(s){ return Array.from(String(s||'')).length; }
  function str(v){ return v==null ? '' : String(v).trim(); }
  function norm(s){ return str(s).normalize('NFKC').toLowerCase().replace(/[\s　・]/g,''); }
  function has(hay, needle){ var n=norm(needle); return !!n && norm(hay).indexOf(n)>=0; }
  function arr(v){ if(Array.isArray(v)) return v; if(v==null||v==='') return []; return String(v).split(/[|｜]/); }
  function uniq(a){ var seen={}, out=[]; a.forEach(function(x){ x=str(x); var k=norm(x); if(x && !seen[k]){ seen[k]=1; out.push(x); } }); return out; }
  function yen(n){ n=Math.round(n); return (n<0?'-':'')+'¥'+Math.abs(n).toLocaleString('ja-JP'); }
  function toNum(v){ var n=Number(String(v==null?'':v).normalize('NFKC').replace(/[^\d.]/g,'')); return isFinite(n)&&n>0 ? n : 0; }
  function tokens(s){ return str(s).normalize('NFKC').split(/[\s、,，。\/／]+/).map(str).filter(Boolean); }

  function bad(word, dict){
    var list=(dict.forbidden||[]).concat(dict.fillerWords||[]);
    for(var i=0;i<list.length;i++){ if(list[i] && has(word, list[i])) return list[i]; }
    return '';
  }

  // 入力由来の語に禁止語・空語が混ざっていたら、その語だけ取り除く
  function strip(text, dict){
    var t=str(text);
    (dict.forbidden||[]).concat(dict.fillerWords||[]).forEach(function(w){ if(w) t=t.split(w).join(' '); });
    return t.replace(/\s+/g,' ').trim();
  }

  /* ---------- 辞書引き ---------- */
  function findBrand(raw, dict){
    var n=norm(raw); if(!n) return null;
    var list=dict.brands||[], hit=null;
    list.forEach(function(b){
      [b.brand_name,b.brand_name_jp,b.brand_name_en,b.reading].forEach(function(v){ if(!hit && v && norm(v)===n) hit=b; });
    });
    if(hit) return hit;
    list.forEach(function(b){
      [b.brand_name,b.brand_name_jp,b.brand_name_en].forEach(function(v){ if(!hit && v && norm(v).length>=2 && (n.indexOf(norm(v))>=0)) hit=b; });
    });
    return hit;
  }
  function detectCategory(input, dict){
    var texts=[str(input.item), str(input.model), str(input.features)];
    var best=null, bestLen=0, bestPri=99;
    (dict.categories||[]).forEach(function(c){
      var names=[c.subcategory].concat(arr(c.aliases));
      names.forEach(function(nm){
        if(!nm) return;
        for(var p=0;p<texts.length;p++){
          if(has(texts[p], nm)){
            var L=len(nm);
            if(p<bestPri || (p===bestPri && L>bestLen)){ best=c; bestLen=L; bestPri=p; }
            break;
          }
        }
      });
    });
    return best;
  }
  function findColor(raw, dict){
    var n=norm(raw); if(!n) return null;
    var list=dict.colors||[], hit=null;
    list.forEach(function(c){ [c.input_color,c.display_jp,c.display_common,c.display_en].forEach(function(v){ if(!hit && v && norm(v)===n) hit=c; }); });
    if(hit) return hit;
    list.forEach(function(c){ [c.display_common,c.display_jp].forEach(function(v){ if(!hit && v && norm(v).length>=2 && n.indexOf(norm(v))>=0) hit=c; }); });
    return hit;
  }
  function findMaterial(raw, dict){
    var n=norm(raw); if(!n) return null; var hit=null;
    (dict.materials||[]).forEach(function(m){ [m.material,m.english].forEach(function(v){ if(!hit && v && n.indexOf(norm(v))>=0) hit=m; }); });
    return hit;
  }
  function findCondition(raw, dict){
    var n=norm(raw), list=dict.conditions||[], hit=null;
    list.forEach(function(c){ if(!hit && norm(c.condition)===n) hit=c; });
    if(!hit && n){ list.forEach(function(c){ if(!hit && norm(c.condition).replace(/[、,]/g,'')===n.replace(/[、,]/g,'')) hit=c; }); }
    return hit || {condition:str(raw)||'目立った傷や汚れなし', badge:'', acceptable_expression:'', avoid_expression:''};
  }
  function sameCond(a,b){ return norm(a).replace(/[、,]/g,'')===norm(b).replace(/[、,]/g,''); }
  function isNew(cond){ return /新品/.test(cond.condition||''); }
  function sizeRank(label){
    var s=str(label).normalize('NFKC').toUpperCase().replace(/\s/g,'').replace(/サイズ/g,'');
    if(SIZE_ALIAS[s]) s=SIZE_ALIAS[s];
    return SIZE_ORDER.indexOf(s);
  }

  /* 高値ワード：根拠（入力）があるものだけ。極美品・美品は状態バッジとして別扱い */
  function highValueWords(input, dict, userText, cond){
    var out=[];
    var hv=(dict.highValue||[]).slice().sort(function(a,b){ return (Number(b.priority)||0)-(Number(a.priority)||0); });
    hv.forEach(function(h){
      var kw=str(h.keyword); if(!kw || kw==='極美品' || kw==='美品') return;
      var r=h.rule||{}, vals=arr(r.value).map(str).filter(Boolean), ok=false;
      if(r.type==='condition'){ ok=vals.some(function(v){ return sameCond(v, cond.condition); }) && has(userText, kw.replace(/付き$/,'')); }
      else if(r.type==='size_max'){ var me2=sizeRank(input.sizeLabel), mx=sizeRank(vals[0]); ok= me2>=0 && mx>=0 && me2<=mx; }
      else if(r.type==='material'){ ok=vals.some(function(v){ return has(input.material,v)||has(input.features,v)||has(input.item,v); }); }
      else if(r.type==='size_min'){ var me=sizeRank(input.sizeLabel), min=sizeRank(vals[0]); ok= me>=0 && min>=0 && me>=min; }
      else if(r.type==='country'){ ok=vals.some(function(v){ return has(userText, v+'製'); }); }
      else if(r.type==='user_confirmed'){ ok=has(userText, kw); }
      if(ok && !bad(kw, dict)) out.push(kw);
    });
    return out;
  }

  function badgeOf(cond, input, dict){
    var b=str(cond.badge);
    var g=(dict.highValue||[]).filter(function(h){ return str(h.keyword)==='極美品'; })[0];
    if(g){
      var need=(g.rule&&g.rule.type==='condition') ? arr(g.rule.value) : ['未使用に近い'];
      if(need.some(function(v){ return sameCond(v, cond.condition); }) && !str(input.damage)) b='極美品';
    }
    return b;
  }

  function sizeText(input, cat){
    var s=str(input.sizeLabel); if(!s) return '';
    if(cat && /シューズ|靴|スニーカー|パンプス|ブーツ|サンダル/.test(cat.category+' '+cat.subcategory) && /^\d+(\.\d+)?$/.test(s.normalize('NFKC'))) s=s+'cm';
    return s;
  }

  /* ---------- タイトル組み立て ---------- */
  // parts: [{t:text, keep:bool}]（keep=削らない必須語）／cands: 埋め候補（優先順）
  function assemble(parts, cands, min, max, dict, brandAlt){
    var used=[];
    function text(){ return used.map(function(p,i){ return p.t+(i<used.length-1 && !p.glue ? ' ' : ''); }).join(''); }
    // すでに入っている語と重複するか（1〜2字の語は完全一致だけ見る：M・L が UNIQLO に吸われないように）
    function contains(w){
      var n=norm(w);
      return used.some(function(p){ return str(p.t).split(/\s+/).some(function(tk){ var k=norm(tk); return k===n || (len(n)>=3 && k.indexOf(n)>=0); }); });
    }
    parts.forEach(function(p){ p.t=strip(p.t,dict); if(p.t && !contains(p.t)) used.push(p); });
    // 長すぎる：ブランドを和名だけに→末尾の任意語から削る→アイテム名を詰める
    if(len(text())>max && brandAlt){ used.forEach(function(p){ if(p.brand) p.t=brandAlt; }); }
    for(var i=used.length-1; i>=0 && len(text())>max; i--){ if(!used[i].keep) used.splice(i,1); }
    if(len(text())>max){
      var it=used.filter(function(p){return p.item;})[0];
      if(it){ var over=len(text())-max; it.t=Array.from(it.t).slice(0, Math.max(1, len(it.t)-over)).join(''); }
    }
    // 埋める：優先順に試し、ちょうど min〜max に収まる組み合わせを探す（優先度の高い語を先に採用）
    var pool=[];
    cands.forEach(function(w){ w=str(w); if(w && !bad(w,dict) && !contains(w) && pool.every(function(x){ return norm(x)!==norm(w); })) pool.push(w); });
    var baseLen=len(text()), best=[], bestLen=baseLen, budget=20000;
    if(baseLen<min){
      (function dfs(i, cur, chosen){
        if(--budget<0 || bestLen>=min) return;
        if(cur>bestLen){ bestLen=cur; best=chosen.slice(); }
        if(cur>=min) return;
        for(var j=i;j<pool.length;j++){
          var add=len(pool[j])+(cur>0?1:0);
          if(cur+add<=max){ chosen.push(pool[j]); dfs(j+1, cur+add, chosen); chosen.pop(); if(bestLen>=min||budget<0) return; }
        }
      })(0, baseLen, []);
      best.forEach(function(w){ used.push({t:w}); });
    }
    return text();
  }

  /* ---------- 価格 ---------- */
  function benchCat(text){ for(var i=0;i<BENCH_CATS.length;i++){ if(BENCH_CATS[i][1].test(text)) return BENCH_CATS[i][0]; } return ''; }
  function buildPrice(input, brand, cat, cond, bench){
    var noBrand = !brand;
    var fast = brand && /ファスト|ノーブランド/.test(str(brand.category));
    var lux = brand && (brand.luxury_flag===true || /^true$/i.test(str(brand.luxury_flag)));
    var profile = lux ? 'brand' : ((noBrand||fast) ? 'nonbrand' : 'general');
    var labels={brand:'ブランド品の売れた例', nonbrand:'ノーブランド・ファストファッションの売れた例', general:'一般ブランドの売れた例'};
    var key = benchCat([input.item, cat?cat.subcategory:'', cat?cat.category:''].join(' '));
    var out={profile:profile, profileLabel:labels[profile], category:key, n:0, examples:[], note:BENCH_NOTE, refGuide:null, profit:null, fallback:false};
    if(bench && key){
      var src=bench[profile]&&bench[profile][key];
      if(!src){ ['general','brand','nonbrand'].some(function(p){ if(bench[p]&&bench[p][key]){ src=bench[p][key]; out.profile=p; out.profileLabel=labels[p]; out.fallback=true; return true; } return false; }); }
      if(src){ out.n=src.n; out.examples=src.ex.map(function(e){ return {price:e[0], title:e[1]}; }); }
    }
    var ref=toNum(input.refPrice), r=null;
    Object.keys(REF_RATIO).forEach(function(k){ if(sameCond(k, cond.condition)) r=REF_RATIO[k]; });
    if(ref && r){ out.refGuide={refPrice:ref, low:Math.round(ref*r[0]/100)*100, high:Math.round(ref*r[1]/100)*100, text:'参考価格 '+yen(ref)+' × 状態「'+cond.condition+'」の一般的な目安：'+yen(Math.round(ref*r[0]/100)*100)+'〜'+yen(Math.round(ref*r[1]/100)*100)+'（売り切れ相場で必ず確認）'}; }
    var cost=toNum(input.cost);
    if(cost && out.examples.length){
      var mid=out.examples[Math.floor(out.examples.length/2)].price, fee=Math.round(mid*0.1);
      out.profit={mid:mid, fee:fee, cost:cost, diff:mid-fee-cost, text:'中央の例 '+yen(mid)+' で売れた場合：手数料10% 約'+yen(fee)+'を引いて、仕入れ値との差は '+yen(mid-fee-cost)+'（送料は別）'};
    }
    return out;
  }

  /* ---------- 本体 ---------- */
  function generate(input, dict, bench){
    input=input||{}; dict=dict||{};
    if(bench===undefined && typeof BENCH_EX!=='undefined') bench=BENCH_EX; // eslint-disable-line no-undef
    var platform = input.platform==='yahoo' ? 'yahoo' : 'mercari';
    var tpl = (dict.titleTemplates&&dict.titleTemplates[platform]) || DEFAULT_TEMPLATES[platform];
    var min = Number(tpl.min)||DEFAULT_TEMPLATES[platform].min, max = Number(tpl.max)||DEFAULT_TEMPLATES[platform].max;
    var order = (tpl.order&&tpl.order.length) ? tpl.order : DEFAULT_TEMPLATES[platform].order;
    var warnings=[];

    var brandRaw=str(input.brand), isNoBrand=NO_BRAND.indexOf(norm(brandRaw))>=0;
    var brand = isNoBrand ? null : findBrand(brandRaw, dict);
    var cat = detectCategory(input, dict);
    var color = findColor(input.color, dict);
    var mat = findMaterial(input.material, dict);
    var cond = findCondition(input.condition, dict);
    var badge = badgeOf(cond, input, dict);
    var picks=(Array.isArray(input.picks)?input.picks:[]).map(str).filter(Boolean);
    var purchased=str(input.purchasedFrom)||str(input.purchasedAt);
    var userText=[input.item,input.model,input.features,input.damage,input.material,input.accessories,purchased].concat(picks).map(str).join(' ');
    var kwText=[input.features,input.model,input.item,input.damage].concat(picks).map(str).join(' ');

    // ブランド表示
    var bJp='', bEn='', bDisp='';
    if(brand){ bJp=str(brand.brand_name_jp)||str(brand.brand_name); bEn=str(brand.brand_name_en)||str(brand.brand_name); }
    else if(brandRaw && !isNoBrand){ bJp=brandRaw; }
    bDisp = (bJp && bEn && norm(bJp)!==norm(bEn)) ? bJp+' '+bEn : (bJp||bEn);

    // 色
    var cCommon='', cJp='', cEn='';
    if(color){ cCommon=str(color.display_common)||str(color.display_jp); cJp=str(color.display_jp); cEn=str(color.display_en); }
    else if(str(input.color)){ cCommon=str(input.color); }
    var colorAll=uniq([cCommon,cJp,cEn]).join(' ');

    var size=sizeText(input, cat);
    var hv=highValueWords(input, dict, userText, cond);
    var brandName = brand ? str(brand.brand_name) : '';
    var bkw=(dict.brandKeywords||[]).filter(function(k){ return brandName && norm(k.brand)===norm(brandName) && has(kwText,k.keyword); })
      .sort(function(a,b){ return (Number(b.priority)||0)-(Number(a.priority)||0); }).map(function(k){ return str(k.keyword); });
    if(brand){ arr(brand.search_keywords).forEach(function(k){ k=str(k); if(k && has(kwText,k)) bkw.push(k); }); }
    bkw=uniq(bkw);
    if(!cat && brandName){
      // 種類名が辞書に無い（例：エアマックス90）ときは、入力に含まれるブランド別キーワードのカテゴリから判定
      (dict.brandKeywords||[]).forEach(function(k){
        if(cat || norm(k.brand)!==norm(brandName) || !has(kwText,k.keyword)) return;
        (dict.categories||[]).forEach(function(c){ if(!cat && (norm(c.subcategory)===norm(k.category))) cat=c; });
        (dict.categories||[]).forEach(function(c){ if(!cat && (norm(c.category)===norm(k.category))) cat=c; });
      });
      if(cat) size=sizeText(input, cat);
    }
    // カテゴリ推奨語は「この商品に当てはまる」と入力（特徴欄・候補の選択）で確認できたものだけ使う
    var recAll = cat ? arr(cat.recommended_keywords).map(str).filter(function(w){ return w && !bad(w,dict); }) : [];
    var rec = recAll.filter(function(w){ return has(kwText,w); });
    var gender=GENDER_WORDS.filter(function(g){ return has(userText,g); });
    var matName = mat ? str(mat.material) : str(input.material);

    // ---- タイトル ----
    var title, colorAlt=(cJp&&norm(cJp)!==norm(cCommon))?[cJp]:[];
    // 中立の埋め語（優先順）：ブランドの読み／親カテゴリ名／カラー英字／素材英字／性別語／USED（新品以外）／季節語（秋冬・春夏）／ノーブランド（入力時）
    var season = mat && /^(秋冬|春夏)$/.test(str(mat.season)) ? str(mat.season) : '';
    var neutral=[brand?str(brand.reading):'', cat?cat.category:'', cEn, mat?str(mat.english):''].concat(gender, [isNew(cond)?'':'USED', season, isNoBrand?'ノーブランド':'']);   // ノーブランドと入力された時だけ
    var measureWords=[];
    if(cat){ arr(cat.size_fields).forEach(function(f){ var v=str((input.measures||{})[f]); if(v && f!=='表記サイズ') measureWords.push(f+v.replace(/\s*cm$/i,'')+'cm'); }); }
    if(platform==='mercari'){
      // 先頭6つ（状態〜高値ワード）が土台、それ以降の order が埋め候補の優先順
      var slot={
        badge:[{t:badge?'【'+badge+'】':'', keep:true, glue:true}], brand:[{t:bDisp, keep:true, brand:true}], item:[{t:str(input.item), keep:true, item:true}],
        color:[{t:cCommon, keep:true}], size:[{t:size, keep:true}], highValue:hv.map(function(w){return {t:w};})
      };
      var fill={ model:[str(input.model)], brandKeywords:bkw, categoryKeywords:rec, material:[matName], colorAlt:colorAlt, gender:gender };
      var parts=[], cands=[];
      var fillOrder=order.filter(function(k){ return fill[k]; });
      ['model','brandKeywords','categoryKeywords','material','colorAlt','gender'].forEach(function(k){ if(fillOrder.indexOf(k)<0) fillOrder.push(k); });
      order.forEach(function(k){ if(slot[k]) slot[k].forEach(function(p){ parts.push(p); }); });
      fillOrder.forEach(function(k){ cands=cands.concat(fill[k]); });
      cands=cands.concat(neutral);   // 最後は嘘にならない中立の語だけ
      var clone=function(){ return parts.map(function(p){ return Object.assign({}, p); }); };
      title=assemble(clone(), cands, min, max, dict, bJp);
      // ブランド別キーワード（例：ノバチェック）が和英併記で入らないときは、和名だけにして入れる
      if(bkw.length && bJp && bDisp!==bJp){
        var miss=function(t){ return bkw.filter(function(k){ return !has(t,k); }).length; };
        var p2=clone(); p2.forEach(function(p){ if(p.brand) p.t=bJp; });
        var t2=assemble(p2, cands, min, max, dict, bJp);
        if(miss(t2)<miss(title)) title=t2;
      }
    } else {
      var feat=tokens(input.features).concat(picks).filter(function(w){ return !bad(w,dict); });
      var yslot={
        badge:[{t:badge?'【'+badge+'】':'', keep:true, glue:true}], brand:[{t:bDisp, keep:true, brand:true}], item:[{t:str(input.item), keep:true, item:true}],
        model:[{t:str(input.model)}], color:[{t:colorAll, keep:true}], size:[{t:size, keep:true}],
        material:[{t:uniq([matName, mat?str(mat.english):'']).join(' ')}],
        features:feat.concat(hv).map(function(w){return {t:w};}), keywords:bkw.concat(rec).map(function(w){return {t:w};})
      };
      var yparts=[]; order.forEach(function(k){ (yslot[k]||[]).forEach(function(p){ yparts.push(p); }); });
      var ycands=(cat?[cat.subcategory]:[]).concat(neutral, measureWords, [cond.condition.replace(/[、,]/g,''), isNew(cond)?'':'中古', '送料無料']);
      title=assemble(yparts, ycands, min, max, dict, bJp);
    }
    var titleLen=len(title);

    // ---- 不足の案内 ----
    if(!brandRaw) warnings.push('ブランド名を入れると、ブランド名で探す人に見つけてもらいやすくなります（ブランドが無いときは「ノーブランド」でOKです）');
    else if(!brand && !isNoBrand) warnings.push('「'+brandRaw+'」は辞書にないブランドです。入力どおりの表記でタイトルに入れています。和名と英字の両方を入れると検索に強くなります');
    if(!cat) warnings.push('アイテムの種類を判定できませんでした。「ショルダーバッグ」「Tシャツ」のように種類名を入れると、検索キーワードと採寸欄が出ます');
    if(!str(input.color)) warnings.push('色を入れると、タイトルに「ブラック 黒」のように色名が入り、色で探す人に見つかりやすくなります');
    var isBagLike = cat && /バッグ|財布|小物/.test(cat.category);
    if(!str(input.sizeLabel) && !isBagLike) warnings.push('表記サイズ（M・38・27cm など）を入れると、タイトルにサイズが入ります');
    if(!str(input.material)) warnings.push('素材（タグの表記）を入れると、素材名と素材の特長が説明文に入ります');
    var sizeFields = cat ? arr(cat.size_fields).map(str).filter(function(f){ return f && f!=='表記サイズ'; }) : [];
    var measures=input.measures||{};
    var missingM=sizeFields.filter(function(f){ return !str(measures[f]); });
    if(sizeFields.length && missingM.length) warnings.push('採寸（'+missingM.join('・')+'）を入れると、説明文の「（記入してください）」が埋まります');
    var unpicked=recAll.filter(function(w){ return rec.indexOf(w)<0; });
    if(titleLen<min && platform==='yahoo'){
      warnings.push('タイトルが'+titleLen+'字です（目標'+min+'〜'+max+'字）。型番・素材・特徴を足すと検索に強くなります');
    } else if(titleLen<min){
      warnings.push('タイトルが'+titleLen+'字です（目標'+min+'〜'+max+'字）。意味のない言葉では埋めていません。'
        +(unpicked.length ? 'この商品に当てはまる特徴（'+unpicked.slice(0,5).join('／')+' など）があれば選ぶか「その他の特徴」に入れると、タイトルに入ります' : '色・素材・型番・サイズ・特徴を足すと埋まります'));
    }
    (dict.forbidden||[]).forEach(function(w){ if(w && has(userText,w)) warnings.push('「'+w+'」は根拠がある場合のみ使えます（タイトルには入れていません。説明文に残す場合は根拠を書き添えてください）'); });

    // ---- 説明文 ----
    var L=[];
    L.push('■ブランド'); L.push(bDisp || (isNoBrand?'ノーブランド':'（記入してください）')); L.push('');
    L.push('■アイテム'); L.push(uniq([str(input.item), cat?cat.subcategory:'']).join(' ')||'（記入してください）');
    var kwLine=uniq([bDisp].concat(bkw, rec, cat?[cat.subcategory, cat.category]:[])).join(' ');
    if(kwLine) L.push('検索キーワード：'+kwLine);
    L.push('');
    L.push('■商品情報');
    if(str(input.model)) L.push('型番：'+str(input.model));
    if(toNum(input.refPrice)) L.push('参考価格：'+yen(toNum(input.refPrice)));
    L.push('カラー：'+(colorAll||'（記入してください）'));
    if(mat) L.push('素材：'+str(mat.material)+(str(mat.english)&&norm(mat.english)!==norm(mat.material)?'（'+str(mat.english)+'）':'')+(str(mat.feature)?'　'+str(mat.feature):''));
    else L.push('素材：'+(str(input.material)||'（記入してください）'));
    L.push('');
    L.push('■サイズ'); if(size||!isBagLike) L.push('表記サイズ：'+(size||'（記入してください）'));
    sizeFields.forEach(function(f){ var v=str(measures[f]); L.push(f+'：'+(v ? '約'+v.replace(/\s*cm$/i,'')+'cm' : '（記入してください）')); });
    if(sizeFields.length) L.push('※平置きでの採寸のため、多少の誤差はご容赦ください');
    L.push('');
    L.push('■状態'); L.push(cond.condition);
    if(str(cond.acceptable_expression)) L.push(str(cond.acceptable_expression));
    if(str(input.damage)) L.push('気になる点：'+str(input.damage));
    L.push(isNew(cond) ? 'お写真もあわせてご確認ください。' : '気になる点はお写真もあわせてご確認ください。追加のお写真が必要でしたらお気軽にお声がけください。');
    if(str(input.accessories)||purchased){
      L.push(''); L.push('■付属品・購入先');
      if(str(input.accessories)) L.push('付属品：'+str(input.accessories));
      if(purchased) L.push('購入先：'+purchased);
    } else warnings.push('付属品（保存袋・箱・タグなど）や購入先があれば入れると、安心して選んでもらえます');
    var featLine=uniq([str(input.features)].concat(picks.filter(function(w){ return !has(input.features,w); }))).join(' ');
    if(featLine){ L.push(''); L.push('■その他の特徴'); L.push(featLine); }
    var coords=(dict.coords||[]).filter(function(c){ return cat && (norm(c.item_category)===norm(cat.subcategory) || norm(c.item_category)===norm(cat.category)); });
    var cc=coords.filter(function(c){ return cCommon && norm(c.color)===norm(cCommon); });
    var useCo=(cc.length?cc:coords).slice(0,2);
    if(useCo.length){ L.push(''); L.push('■おすすめコーデ'); useCo.forEach(function(c){ L.push('・'+str(c.coordinate)+(str(c.style)?'（'+str(c.style)+'）':'')); }); }
    L.push('');
    L.push('■発送・その他');
    if(platform==='mercari'){
      L.push('・送料無料／即購入OK');
      L.push('・ご購入後1〜2日以内に、丁寧に梱包して発送します');
    } else {
      L.push('・送料無料（落札者様のご負担はありません）');
      L.push('・ご入金確認後1〜2日以内に、丁寧に梱包して発送します');
    }
    if(!isNew(cond)) L.push('・自宅保管のUSED品です。ご理解いただける方のご'+(platform==='mercari'?'購入':'入札')+'をお願いいたします');
    if(platform==='yahoo'){
      L.push(''); L.push('■落札後の流れ');
      L.push('1. 落札後、Yahoo!かんたん決済でお支払いください');
      L.push('2. 取引ナビでお届け先をご確認ください');
      L.push('3. ご入金確認後、1〜2日以内に発送いたします');
      L.push(''); L.push('■注意事項');
      L.push('・お使いの画面により、実物と色味が異なって見える場合がございます');
      L.push('・ご質問は入札前に質問欄からお願いいたします');
      if(!isNew(cond)) L.push('・中古品のため、状態にご理解のある方のご入札をお願いいたします');
    } else {
      L.push('・お使いの画面により、実物と色味が異なって見える場合がございます');
      L.push('・ご不明な点はお気軽にコメントください');
    }
    var description=L.join('\n');

    // ---- ハッシュタグ（8〜10個） ----
    var tagSrc=[bJp, bEn, str(input.item), cat?cat.subcategory:'', cat?cat.category:'', cCommon, matName, badge].concat(bkw, gender, rec,
      ['送料無料', platform==='mercari'?'即購入OK':'ヤフオク', '丁寧梱包', cond.condition, isNew(cond)?'新品':'USED', isNew(cond)?'未使用':'中古']);
    var hashtags=[];
    uniq(tagSrc).forEach(function(t){
      var tag='#'+t.normalize('NFKC').replace(/[\s#＃・,，、。()（）\[\]【】!?！？]/g,'');
      if(tag.length>1 && hashtags.length<10 && !bad(t,dict) && hashtags.indexOf(tag)<0) hashtags.push(tag);
    });

    return {
      platform:platform, title:title, titleLen:titleLen, titleMin:min, titleMax:max,
      description:description, hashtags:hashtags,
      price:buildPrice(input, brand, cat, cond, bench),
      warnings:uniq(warnings),
      fields:{
        brand:brand, brandDisplay:bDisp, category:cat, sizeFields:sizeFields,
        color:color, colorDisplay:colorAll, material:mat, condition:cond.condition, badge:badge, highValue:hv, brandKeywords:bkw
      }
    };
  }

  /* 画面用：この商品に当てはまるか選んでもらう候補（カテゴリ推奨語・ブランド別キーワード） */
  function chips(input, dict){
    var brand=findBrand(input.brand, dict), cat=detectCategory(input, dict), out=[];
    if(cat) arr(cat.recommended_keywords).forEach(function(w){ out.push(str(w)); });
    if(brand) (dict.brandKeywords||[]).forEach(function(k){ if(norm(k.brand)===norm(brand.brand_name)) out.push(str(k.keyword)); });
    return uniq(out).filter(function(w){ return w && !bad(w,dict) && !has(input.item,w); });
  }

  return {generate:generate, chips:chips, detectCategory:detectCategory, findBrand:findBrand, len:len, MEASURE_KEYS:MEASURE_KEYS, BENCH_NOTE:BENCH_NOTE};
})();
if(typeof module!=='undefined') module.exports=RAITO;
