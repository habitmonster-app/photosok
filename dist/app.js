'use strict';
const $ = id => document.getElementById(id);
const state = {mode:'compress',target:500000,custom:false,quality:null,spec:null,items:[],busy:false,importing:false,controller:null,selected:null};
const names = Object.fromEntries(Object.entries(PhotoSokCopy.photoModes).map(([mode, copy]) => [mode, copy.label]));
let toastTimer;
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
function icon(id){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');const u=document.createElementNS(s.namespaceURI,'use');u.setAttribute('href','#i-'+id);s.append(u);return s;}
function button(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=fn;return b;}
function fmt(n){return PhotoEngine.formatBytes(n);}
// 제출용 사진 규격: 공식 안내에 나온 cm·형식·용량만 사용. 픽셀은 300dpi 환산값.
const SPECS={
 'qnet-half':{w:354,h:472,target:200000,source:'출처: 큐넷 사진등록 안내 (반명함 3×4cm, JPG, 200KB 이하, 여백 없이). 픽셀 354×472는 300dpi로 환산한 값이에요. 제출 전 큐넷 안내를 다시 확인해주세요.'},
 'qnet-id':{w:295,h:413,target:200000,source:'출처: 큐넷 사진등록 안내 (증명사진 2.5×3.5cm, JPG, 200KB 이하, 여백 없이). 픽셀 295×413은 300dpi로 환산한 값이에요. 제출 전 큐넷 안내를 다시 확인해주세요.'},
 'passport':{w:413,h:531,target:null,source:'출처: 출입국·외국인정책본부 표준사진 안내, 지자체 여권사진 규격 안내 (3.5×4.5cm, 흰색 배경, 테두리 없음, 정수리~턱 길이 규정 있음). 픽셀 413×531은 300dpi로 환산한 값이에요. 배경색과 얼굴 크기는 바꿔주지 않으니, 제출처 안내를 꼭 다시 확인해주세요.'}
};
function planText(){if(state.mode!=='compress')return '처리 대기';if(state.quality)return '화질 '+({0.92:'높음',0.8:'중간',0.6:'낮음'}[state.quality]||'')+'으로 줄일 예정';let t=state.target;if(state.custom){const v=Number($('customSize').value);if(Number.isFinite(v)&&v>=10)t=Math.floor(v*1000);}let plan=fmt(t)+' 이하로 줄일 예정';if($('exactSize').checked)plan+=' · '+$('exactWidth').value+'×'+$('exactHeight').value;return plan;}
function signature(){try{return JSON.stringify(options());}catch{return 'invalid';}}
function itemTitle(item){const name=item.originalFile?.name||item.file.name||'사진';return item.sourceType==='pdf'?name.replace(/\.pdf$/i,'')+' · '+(item.pageIndex+1)+'페이지':name;}
function itemSignature(opts,item){return JSON.stringify({opts,rotation:item.rotation||0,crop:opts.fit==='cover'?item.crop||null:null,page:item.sourceType==='pdf'?item.pageIndex:null});}
function touchItem(item){item.signature=null;item.stale=!!item.result;item.error=null;}
function invalidate(){if(state.busy)return;let opts;try{opts=options();}catch{}for(const i of state.items){i.stale=!!i.result&&(!opts||i.signature!==itemSignature(opts,i));i.error=null;}updateOutputNote();render();}
function updateOutputNote() {
 const copy = PhotoSokCopy.photoModes[state.mode];
 if (!copy) return;
 const canChooseMetadata = state.mode === 'compress';
 document.querySelector('.privacy-option').hidden = !canChooseMetadata;
 $('outputNote').textContent = canChooseMetadata
  ? ($('stripMetadata').checked ? copy.metadataOnNote : copy.metadataOffNote)
  : copy.outputNote;
 $('stripMetadata').disabled = state.busy || !canChooseMetadata;
}
function selectPhotoMode(mode) {
 if (state.busy || !PhotoSokCopy.photoModes[mode]) return;
 state.mode = mode;
 const copy = PhotoSokCopy.photoModes[mode];
 document.querySelectorAll('.mode').forEach(button => {
  const selected = button.dataset.mode === mode;
  button.classList.toggle('active', selected);
  button.setAttribute('aria-pressed', selected);
 });
 Object.keys(PhotoSokCopy.photoModes).forEach(key => $(key + 'Settings').hidden = key !== mode);
 $('settingsTitle').textContent = copy.heading;
 $('process').querySelector('svg use').setAttribute('href', '#i-' + copy.icon);
 $('outputLabel').textContent = copy.outputLabel;
 invalidate();
}
function outputName(item){return PhotoEngine.downloadName(item.sourceType==='pdf'?itemTitle(item)+'.png':item.file.name,item.result);}
function filesFor(items){const seen=new Set();return items.filter(i=>i.result).map(i=>{let name=outputName(i);const dot=name.lastIndexOf('.'),base=name.slice(0,dot),ext=name.slice(dot);for(let n=2;seen.has(name);n++)name=base+'_'+n+ext;seen.add(name);return new File([i.result.blob],name,{type:i.result.mime});});}
function canShareFiles(items){try{return !!(navigator.share&&navigator.canShare&&navigator.canShare({files:filesFor(items)}));}catch{return false;}}
async function sharePhotos(items){const files=filesFor(items);if(!files.length)return;if(!canShareFiles(items)){toast('이 브라우저는 사진 직접 공유를 지원하지 않아요. 저장 후 보내주세요.');return;}try{await navigator.share({files});toast('공유 창으로 사진을 전달했어요.');}catch(e){if(e.name==='AbortError')return;toast('공유 창을 열지 못했어요. 사진을 저장한 뒤 보내주세요.',true);}}

function render(){
 const has=state.items.length>0; $('dropZone').hidden=has;$('queueSection').hidden=!has;$('count').textContent=state.items.length;
 const list=$('photoList');list.replaceChildren();let cropFrame=null;try{const o=options();if(o.exactWidth&&o.fit==='cover')cropFrame={w:o.exactWidth,h:o.exactHeight};}catch{}
 for(const item of state.items){
  const card=document.createElement('article');card.className='photo-card';
  const img=document.createElement('img');img.className='photo-thumb';img.loading='lazy';img.decoding='async';img.width=76;img.height=76;img.src=item.outURL||item.url;img.alt='';img.onerror=()=>{img.style.visibility='hidden';};card.append(img);
  const detail=document.createElement('div');detail.className='photo-detail';const title=document.createElement('p');title.className='filename';title.textContent=itemTitle(item);title.title=itemTitle(item);detail.append(title);
  const status=document.createElement('p');status.className='photo-status';
  if(item.error){status.textContent=item.error;status.classList.add('error');}
  else if(item.result){const r=item.result;status.classList.add('done');const src=(item.originalFile||item.file).size,pct=Math.round((1-r.blob.size/src)*100);status.textContent=r.unchanged?fmt(item.file.size)+' · 이미 목표 용량 이하예요':(item.sourceType==='pdf'?'PDF 페이지 → ':fmt(src)+' → ')+fmt(r.blob.size)+(item.sourceType!=='pdf'&&pct>0?' (-'+pct+'%)':'')+' · '+r.width+' × '+r.height;}
  else status.textContent=(item.sourceType==='pdf'?'PDF 페이지':fmt((item.originalFile||item.file).size))+' · '+(item.processing?'처리 중…':planText());detail.append(status);
  if(item.convertInfo?.converted){const meta=document.createElement('p');meta.className='card-meta';meta.textContent='HEIC 변환 완료'+(item.convertInfo.downsized?' · 메모리 보호를 위해 축소됨':'');detail.append(meta);}
  const editActions=document.createElement('div');editActions.className='card-actions';if(cropFrame){const cb=button(item.crop?'자르기 다시 조절':'자르기 조절',()=>PhotoSokCrop.open(item,cropFrame.w,cropFrame.h));cb.className='crop-button';cb.disabled=state.busy;editActions.append(cb);}const db=button(item.decoSpec?'꾸미기 고치기':'꾸미기',()=>PhotoSokDeco.open(item));db.disabled=state.busy;editActions.append(db);const tb=button(item.textSpec?'글씨 고치기':'글씨 넣기',()=>PhotoSokText.open(item));tb.disabled=state.busy;editActions.append(tb);const edit=button('서류 보정',()=>editItem(item));edit.disabled=state.busy;editActions.append(edit);if(item.editBackup){const restore=button('보정 전으로',()=>restoreItem(item));restore.disabled=state.busy;editActions.append(restore);}detail.append(editActions);
  if(item.result&&item.stale){const prev=document.createElement('p');prev.className='photo-status stale';prev.textContent='이전 설정 결과 · 다시 처리하면 바뀌어요';detail.append(prev);}
  if(item.result?.metadataRemoved){const meta=document.createElement('p');meta.className='card-meta';meta.textContent='위치·촬영정보 제외됨';detail.append(meta);}
  if(item.result){const actions=document.createElement('div');actions.className='card-actions';actions.append(button('비교',()=>compare(item)),button('저장',()=>download(item)));if(canShareFiles([item]))actions.append(button('공유',()=>sharePhotos([item])));detail.append(actions);}
  card.append(detail);const remove=button('',()=>removeItem(item));remove.className='remove';remove.append(icon('close'));remove.setAttribute('aria-label',itemTitle(item)+' 삭제');remove.disabled=state.busy;card.append(remove);list.append(card);
 }
 const done=state.items.filter(i=>i.result);const stale=done.some(i=>i.stale);$('staleNote').hidden=!stale;$('shareAll').hidden=!done.length||state.busy||!canShareFiles(done);$('summary').hidden=!done.length;$('saveAll').hidden=!done.length||state.busy;$('zipNote').hidden=done.length<2||state.busy||!!window.PhotoSokApp;
 if(done.length){const before=[...new Set(done.map(i=>i.originalFile||i.file))].reduce((s,f)=>s+f.size,0),after=done.reduce((s,i)=>s+i.result.blob.size,0);$('totalBefore').textContent=fmt(before);$('totalAfter').textContent=fmt(after);const pct=Math.round((1-after/before)*100);$('saving').textContent=done.some(i=>i.sourceType==='pdf')?'페이지 → 사진':pct>=0?'-'+pct+'%':'+'+Math.abs(pct)+'%';$('saveAll').querySelector('span').textContent=done.length>1?done.length+(window.PhotoSokApp?'장 모두 갤러리에 저장':'장 모두 저장 (ZIP)'):'사진 저장하기';}
 $('process').disabled=!has||state.busy;$('process').querySelector('span').textContent=state.busy?(state.importing?PhotoSokCopy.actions.importing:PhotoSokCopy.actions.photoBusy):!has?PhotoSokCopy.actions.empty:state.items.length+'장 '+names[state.mode];
 $('cancel').hidden=!state.busy;$('progressWrap').hidden=!state.busy;$('clear').disabled=state.busy;$('addMore').disabled=state.busy;$('choose').disabled=state.busy;$('demo').disabled=state.busy;
 $('camera').disabled=state.busy;$('fromFiles').disabled=state.busy;
 document.querySelectorAll('.modes button,.preset-grid button,[data-quality],[data-spec],input[name=fit],#customToggle,#customSize,#maxEdge,#customEdge,#format,#exactSize,#exactWidth,#exactHeight,[data-dimensions]').forEach(el=>el.disabled=state.busy);
 updateOutputNote();
 const allCurrent=has&&state.items.every(i=>i.result&&!i.stale&&!i.error);$('mobileBar').hidden=!has;document.body.classList.toggle('has-mobile-bar',has);$('mobileStatus').textContent=state.busy?'사진 처리 중…':allCurrent?'완료 · '+done.length+'장':state.items.length+'장 선택';$('mobileHint').textContent=allCurrent?$('totalBefore').textContent+' → '+$('totalAfter').textContent:stale?'새 설정으로 다시 처리해주세요':'원본은 그대로 보관돼요';$('mobileAction').textContent=state.busy?'중단':allCurrent?'저장하기':names[state.mode];$('mobileAction').dataset.action=state.busy?'cancel':allCurrent?'save':'process';$('mobileShare').hidden=!allCurrent||!canShareFiles(done);

}
async function itemInputFile(item,{signal}={}){
 if(item.sourceType!=='pdf')return item.file;
 const rendered=await PDFTools.renderPage(item,{maxEdge:2400,signal});
 return new File([rendered.blob],itemTitle(item)+'.png',{type:'image/png'});
}
function disposeItem(item){for(const url of new Set([item.url,item.outURL,item.editBackup?.url]))if(url)URL.revokeObjectURL(url);}
function removeItem(item){if(state.busy)return;disposeItem(item);state.items=state.items.filter(i=>i!==item);for(const file of new Set([item.sourceType==='pdf'?item.file:null,item.editBackup?.sourceType==='pdf'?item.editBackup.file:null]))if(file&&!state.items.some(i=>i.file===file||i.editBackup?.file===file))void PDFTools.release(file);render();}
async function editItem(item){
 if(state.busy)return;state.busy=true;state.controller=new AbortController();render();
 try{
  const input=await itemInputFile(item,{signal:state.controller.signal});
  const edited=await DocumentEditor.open(input,{name:itemTitle(item)});
  if(!edited)return;delete item.textBase;delete item.textSpec;delete item.decoBase;delete item.decoSpec;
  if(!item.editBackup)item.editBackup={file:item.file,sourceType:item.sourceType,pageIndex:item.pageIndex,width:item.width,height:item.height,rotation:item.rotation,url:item.url};
  else if(item.url!==item.editBackup.url)URL.revokeObjectURL(item.url);
  const alreadyRotated=item.sourceType==='pdf';
  item.file=new File([edited.blob],itemTitle(item).replace(/\.[^.]+$/,'')+'_보정.png',{type:'image/png'});item.sourceType='photo';delete item.pageIndex;
  item.url=URL.createObjectURL(item.file);item.width=edited.width;item.height=edited.height;if(alreadyRotated)item.rotation=0;touchItem(item);
  toast(alreadyRotated?'보정한 PDF 페이지는 사진으로 바뀌어 글자 검색이 사라져요. 다시 처리하면 반영돼요.':'서류 보정을 적용했어요. 다시 처리하면 반영돼요.');
 }catch(e){if(e.name!=='AbortError')toast(e.message||'서류를 보정하지 못했어요.',true);}
 finally{state.busy=false;state.controller=null;render();}
}
function restoreItem(item){if(state.busy||!item.editBackup)return;URL.revokeObjectURL(item.url);Object.assign(item,item.editBackup);delete item.editBackup;delete item.textBase;delete item.textSpec;delete item.decoBase;delete item.decoSpec;touchItem(item);render();toast('보정 전 페이지로 돌아왔어요.');}
async function addFiles(files){
 if(state.busy)return;let skipped=0,added=0;const startLen=state.items.length;const problems=[];
 state.busy=true;state.importing=true;state.controller=new AbortController();const signal=state.controller.signal;$('progress').value=0;$('progressText').textContent='파일을 준비하고 있어요.';render();
 const list=Array.from(files);
 try{for(let at=0;at<list.length;at++){
  if(signal.aborted)break;const file=list[at];
  if(state.items.length>=20){skipped++;continue;}
  if(file.size>40000000){problems.push('40MB를 넘는 파일은 제외했어요.');continue;}
  if(!file.size){problems.push('빈 파일은 제외했어요.');continue;}
  const existing=[...new Set(state.items.map(i=>i.originalFile||i.file))].reduce((n,f)=>n+f.size,0);
  if(existing+file.size>200000000){problems.push('선택한 원본 파일은 전체 200MB까지 넣을 수 있어요.');continue;}
  const pending=[];let pdfInput=false;
  try{
   const head=new TextDecoder('latin1').decode(await file.slice(0,1024).arrayBuffer());
   pdfInput=file.type==='application/pdf'||/\.pdf$/i.test(file.name)||/%PDF-\d\.\d/.test(head);
   if(pdfInput){
    $('progressText').textContent='PDF 페이지를 읽고 있어요.';
    const source=await PDFTools.import(file,{signal});
    if(source.pageCount+state.items.length>20)throw new Error('전체 20페이지까지 넣을 수 있어요. PDF 페이지 수를 줄여 주세요.');
    for(const page of source.pages){
     const preview=await PDFTools.renderPage(page,{maxEdge:360,signal});
     pending.push({...page,originalFile:file,url:URL.createObjectURL(preview.blob),result:null,outURL:null,error:null,processing:false,stale:false,signature:null});
     $('progressText').textContent='PDF 미리보기 '+pending.length+' / '+source.pageCount+'페이지';
    }
   }else{
    if(!/^image\//.test(file.type)&&!/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name))throw new Error('사진 또는 PDF 파일을 선택해 주세요.');
    const prepared=await HeicSupport.prepare(file,{signal,onProgress:(p,message)=>{$('progress').value=(at+p)/list.length*100;$('progressText').textContent=message||'사진을 준비하고 있어요.';}});
    if(signal.aborted)throw new DOMException('작업을 중단했어요.','AbortError');
    pending.push({sourceType:'photo',file:prepared.file,originalFile:file,convertInfo:prepared,url:URL.createObjectURL(prepared.file),rotation:0,result:null,outURL:null,error:null,processing:false,stale:false,signature:null});
   }
   if(signal.aborted)throw new DOMException('작업을 중단했어요.','AbortError');
   state.items.push(...pending);added+=pending.length;render();
  }catch(e){for(const p of pending)disposeItem(p);if(pdfInput)await PDFTools.release(file);if(e.name==='AbortError')break;problems.push(file.name+': '+(e.message||'파일을 열지 못했어요.'));}
  $('progress').value=(at+1)/list.length*100;
 }}finally{const cancelled=signal.aborted;state.busy=false;state.importing=false;state.controller=null;render();if(skipped)problems.push('전체 20페이지까지 선택할 수 있어요.');if(problems.length)toast([...new Set(problems)].join(' '),true);else if(cancelled)toast('불러오기를 중단했어요. 추가된 페이지는 그대로예요.');else if(added)toast(added+'페이지를 추가했어요.');window.PhotoSokText?.afterAdd(state.items.slice(startLen));window.PhotoSokDeco?.afterAdd(state.items.slice(startLen));}
}
// 앱에서는 사진 고르기를 갤러리(안드로이드 사진 선택 화면)로, PDF는 파일 앱으로.
$('choose').onclick=$('addMore').onclick=()=>$(window.PhotoSokApp&&state.mode!=='pdf'?'gallery':'files').click();
$('fromFiles').hidden=!window.PhotoSokApp;$('fromFiles').onclick=()=>$('files').click();
$('camera').onclick=()=>$('capture').click();
$('files').onchange=$('capture').onchange=$('gallery').onchange=e=>{addFiles(e.target.files);e.target.value='';};
$('clear').onclick=()=>{if(state.busy)return;for(const i of state.items)disposeItem(i);state.items=[];void PDFTools.clear();render();};
let dragDepth=0;document.addEventListener('dragover',e=>{e.preventDefault();});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('dropZone').classList.remove('dragover');if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files);});$('dropZone').addEventListener('dragenter',()=>{dragDepth++;$('dropZone').classList.add('dragover');});$('dropZone').addEventListener('dragleave',()=>{if(--dragDepth<=0)$('dropZone').classList.remove('dragover');});
document.querySelectorAll('.mode').forEach(button => { button.onclick = () => selectPhotoMode(button.dataset.mode); });
document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{state.target=Number(b.dataset.target);state.custom=false;state.quality=null;$('customWrap').hidden=true;$('customToggle').setAttribute('aria-expanded','false');updatePresets();invalidate();});
function updatePresets(){document.querySelectorAll('[data-target]').forEach(b=>{const on=!state.custom&&Number(b.dataset.target)===state.target;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);if(on&&!b.querySelector('.preset-check')){const s=document.createElement('span');s.className='preset-check';s.textContent='✓';b.append(s);}});$('customToggle').querySelector('span').textContent=state.custom?'－':'＋';document.querySelectorAll('[data-quality]').forEach(b=>{const on=state.quality===Number(b.dataset.quality);b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});document.querySelectorAll('[data-spec]').forEach(b=>{const on=state.spec===b.dataset.spec;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);});const spec=SPECS[state.spec];$('specSource').hidden=!spec;$('specSource').textContent=spec?spec.source:'';const cover=$('fitCover').checked;$('fitHelper').textContent=cover?'비율이 다르면 가운데 기준으로 잘라요. 사진마다 \'자르기 조절\'을 눌러 위치와 확대를 직접 맞출 수 있어요.':'사진을 자르거나 늘이지 않고 흰 여백으로 맞춰요. 제출처의 규격을 직접 확인해주세요.';$('compressNote').querySelector('p').innerHTML=state.quality?'고른 화질로 <b>원래 크기 그대로</b> 다시 저장해요.<br>용량은 사진마다 달라요.':'선택한 용량 <b>이하로</b> 맞춰드려요.<br>필요하면 사진 크기도 함께 줄어들어요.';}
$('customToggle').onclick=()=>{state.custom=!state.custom;if(state.custom)state.quality=null;$('customWrap').hidden=!state.custom;$('customToggle').setAttribute('aria-expanded',state.custom);updatePresets();invalidate();if(state.custom)$('customSize').focus();};
$('customSize').oninput=invalidate;$('customEdge').oninput=invalidate;$('format').onchange=invalidate;$('maxEdge').onchange=()=>{$('customEdgeWrap').hidden=$('maxEdge').value!=='custom';invalidate();};
function options(){if(state.mode==='compress'&&state.quality)return {mode:'resize',maxEdge:8192,quality:state.quality,stripMetadata:true,format:'image/jpeg'};const o={mode:state.mode,targetBytes:state.target,format:$('format').value,maxEdge:Number($('maxEdge').value),quality:.9,stripMetadata:$('stripMetadata').checked};if(state.mode==='compress'&&$('exactSize').checked){const w=Number($('exactWidth').value),h=Number($('exactHeight').value);if(!Number.isInteger(w)||!Number.isInteger(h)||w<100||h<100||w>4000||h>4000)throw new Error('가로·세로는 100 ~ 4,000px 정수로 입력해주세요.');o.exactWidth=w;o.exactHeight=h;o.fit=$('fitCover').checked?'cover':'pad';}if(state.mode==='compress'&&state.custom){const v=Number($('customSize').value);if(!Number.isFinite(v)||v<10||v>40000)throw new Error('목표 용량은 10 ~ 40,000KB로 입력해주세요.');o.targetBytes=Math.floor(v*1000);}if(state.mode==='resize'&&$('maxEdge').value==='custom'){const v=Number($('customEdge').value);if(!Number.isFinite(v)||v<100||v>8000)throw new Error('긴 쪽 길이는 100 ~ 8,000px로 입력해주세요.');o.maxEdge=Math.round(v);}return o;}
$('process').onclick=async()=>{
 if(state.busy||!state.items.length)return;let opts;try{opts=options();}catch(e){toast(e.message,true);return;}
 if(state.items.every(i=>i.result&&i.signature===itemSignature(opts,i)&&!i.error)){toast('이미 같은 설정으로 완료됐어요. 바로 저장할 수 있어요.');return;}state.busy=true;state.controller=new AbortController();$('progress').value=0;render();let successes=0;
 for(let n=0;n<state.items.length;n++){
  if(state.controller.signal.aborted)break;const item=state.items[n],key=itemSignature(opts,item);if(item.result&&item.signature===key&&!item.error){item.stale=false;successes++;$('progress').value=(n+1)/state.items.length*100;continue;}item.processing=true;item.error=null;render();
  try{const input=await itemInputFile(item,{signal:state.controller.signal});const result=await PhotoEngine.transform(input,{...opts,crop:opts.fit==='cover'?item.crop:undefined,rotation:item.sourceType==='pdf'?0:(item.rotation||0),signal:state.controller.signal,onProgress:p=>{$('progress').value=(n+p)/state.items.length*100;$('progressText').textContent=(n+1)+' / '+state.items.length+'장 처리 중';}});if(item.convertInfo?.converted||item.sourceType==='pdf'||item.editBackup){result.unchanged=false;result.metadataRemoved=true;}if(item.outURL)URL.revokeObjectURL(item.outURL);item.result=result;item.outURL=URL.createObjectURL(result.blob);item.stale=false;item.signature=key;successes++;}
  catch(e){if(e.name!=='AbortError'){item.error=e.message||'사진을 처리하지 못했어요. 다른 사진으로 다시 시도해주세요.';if(item.result)item.stale=true;}}
  finally{item.processing=false;render();}
 }
 const cancelled=state.controller.signal.aborted;state.busy=false;state.controller=null;render();toast(cancelled?'중단했어요. 완료된 사진은 저장할 수 있어요.':successes+'장 처리 완료. 비교 후 저장해주세요.',!successes&&!cancelled);
};
$('cancel').onclick=()=>state.controller?.abort();
const counted=new WeakSet();
function recordSaving(items){let add=0;for(const i of items){const r=i?.result;if(!r||counted.has(r)||i.sourceType==='pdf')continue;counted.add(r);const d=(i.originalFile||i.file).size-r.blob.size;if(d>0)add+=d;}if(!add)return;try{const k='photosok-saved-total';localStorage.setItem(k,String((Number(localStorage.getItem(k))||0)+add));}catch{}document.dispatchEvent(new Event('photosok-saved'));}
async function saveBlob(blob,name,items=[]){const saved=await FileDelivery.save(blob,name);if(saved.status==='saved'||saved.status==='requested')recordSaving(items);if(saved.status==='saved')toast(saved.message||'저장했어요.');else if(saved.status==='failed')toast(saved.message||'저장하지 못했어요. 다시 시도해주세요.',true);return saved;}
function download(item){if(!item?.result)return;void saveBlob(item.result.blob,outputName(item),[item]);}
$('saveAll').onclick=async()=>{const done=state.items.filter(i=>i.result);if(done.length===1){download(done[0]);return;}$('saveAll').disabled=true;if(window.PhotoSokApp){try{let failed=0,where='';for(const i of done){const r=await FileDelivery.save(i.result.blob,outputName(i));if(r.status==='saved'){where=r.where||where;recordSaving([i]);}else failed++;}toast(failed?(done.length-failed)+'장 저장, '+failed+'장은 저장하지 못했어요.':done.length+'장을 '+(where||'기기')+'에 저장했어요.',!!failed);}finally{$('saveAll').disabled=false;}return;}try{const zip=await PhotoEngine.zip(done.map(i=>({name:outputName(i),blob:i.result.blob})));await saveBlob(zip,'사진쏙_'+done.length+'장.zip',done);}catch(e){toast('묶음 저장에 실패했어요. 사진별 저장을 이용해주세요.',true);}finally{$('saveAll').disabled=false;}};
function compare(item){state.selected=item;$('compareName').textContent=itemTitle(item)+(item.stale?' · 이전 설정 결과':'');$('beforeImage').src=item.url;$('afterImage').src=item.outURL;const r=item.result;$('beforeMeta').textContent=item.sourceType==='pdf'?'원본 PDF 페이지 미리보기':fmt((item.originalFile||item.file).size)+' · '+r.originalWidth+'×'+r.originalHeight;$('afterMeta').textContent=fmt(r.blob.size)+' · '+r.width+'×'+r.height;$('compareRange').value=50;updateCompare();$('compareDialog').showModal();}
function updateCompare(){const x=$('compareRange').value;$('beforeLayer').style.clipPath='inset(0 '+(100-x)+'% 0 0)';$('splitLine').style.left=x+'%';}
$('compareRange').oninput=updateCompare;$('closeCompare').onclick=()=>$('compareDialog').close();$('compareDialog').onclick=e=>{if(e.target===$('compareDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};$('dialogSave').onclick=()=>download(state.selected);
$('compareDialog').addEventListener('close',()=>{$('beforeImage').removeAttribute('src');$('afterImage').removeAttribute('src');state.selected=null;});
$('demo').onclick=async()=>{
 $('demo').disabled=true;try{
  const c=document.createElement('canvas');c.width=2400;c.height=1800;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,0,1800);g.addColorStop(0,'#c7ded7');g.addColorStop(.55,'#f2dfcd');g.addColorStop(1,'#d78365');x.fillStyle=g;x.fillRect(0,0,2400,1800);
  x.fillStyle='#fbefcb';x.beginPath();x.arc(1750,470,150,0,Math.PI*2);x.fill();
  for(const [y,col] of [[1000,'#92bab0'],[1250,'#397d77'],[1500,'#18353f']]){x.fillStyle=col;x.beginPath();x.moveTo(0,1800);x.lineTo(0,y);for(let z=0;z<=2400;z+=100)x.lineTo(z,y-170*Math.sin(z/460+y));x.lineTo(2400,1800);x.fill();}
  const data=x.getImageData(0,0,c.width,c.height);let seed=42;for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;const noise=((seed>>>24)-128)*.18;data.data[i]+=noise;data.data[i+1]+=noise;data.data[i+2]+=noise;}x.putImageData(data,0,0);
  const blob=await new Promise(res=>c.toBlob(res,'image/png'));c.width=c.height=1;if(!blob)throw Error();await addFiles([new File([blob],'사진쏙_샘플_풍경.png',{type:'image/png'})]);toast('샘플 풍경을 담았어요. 저장 조건을 골라 결과를 비교해보세요.');
 }catch(e){toast('예시를 불러오지 못했어요. 사진을 직접 선택해주세요.',true);}finally{$('demo').disabled=false;}
};
$('exactSize').onchange=()=>{$('exactFields').hidden=!$('exactSize').checked;if(!$('exactSize').checked)state.spec=null;else state.quality=null;updatePresets();invalidate();};
document.querySelectorAll('input[name=fit]').forEach(r=>r.onchange=()=>{state.spec=null;updatePresets();invalidate();});
document.querySelectorAll('[data-quality]').forEach(b=>b.onclick=()=>{const q=Number(b.dataset.quality);state.quality=state.quality===q?null:q;if(state.quality){state.custom=false;$('customWrap').hidden=true;$('customToggle').setAttribute('aria-expanded','false');state.spec=null;$('exactSize').checked=false;$('exactFields').hidden=true;}updatePresets();invalidate();});
document.querySelectorAll('[data-spec]').forEach(b=>b.onclick=()=>{const key=b.dataset.spec;if(state.spec===key){state.spec=null;updatePresets();invalidate();return;}const sp=SPECS[key];state.spec=key;state.quality=null;$('exactSize').checked=true;$('exactFields').hidden=false;$('exactWidth').value=sp.w;$('exactHeight').value=sp.h;$('fitCover').checked=true;if(sp.target){state.target=sp.target;state.custom=false;$('customWrap').hidden=true;$('customToggle').setAttribute('aria-expanded','false');}updatePresets();invalidate();});
$('exactWidth').oninput=$('exactHeight').oninput=()=>{state.spec=null;updatePresets();invalidate();};$('stripMetadata').onchange=invalidate;
document.querySelectorAll('[data-dimensions]').forEach(b=>b.onclick=()=>{const [w,h]=b.dataset.dimensions.split(',');$('exactWidth').value=w;$('exactHeight').value=h;state.spec=null;updatePresets();invalidate();});
$('shareAll').onclick=$('mobileShare').onclick=()=>sharePhotos(state.items.filter(i=>i.result));
$('mobileAction').onclick=()=>{const a=$('mobileAction').dataset.action;if(a==='cancel')state.controller?.abort();else if(a==='save')$('saveAll').click();else $('process').click();};
updatePresets();render();
