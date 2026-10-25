import {SCENES} from './extension/nightfall@local/scene-catalog.js?v=15';
import {readDownloadCatalog, formatPackageSize, createSceneCard} from './catalog-view.js?v=16';
(() => {
  'use strict';
  const scenes=SCENES.map(scene=>({...scene,title:scene.name,weather:scene.weatherLabel}));
  const $=id=>document.getElementById(id),frame=$('sceneFrame'),library=$('library'),toggle=$('libraryToggle');
  let state={scene:'station',paused:false,weather:60,stationMode:'shift'};
  try{const old=JSON.parse(localStorage.getItem('nightfall-preview-v5')||'null');if(old&&scenes.some(s=>s.id===old.scene)){state.scene=old.scene;state.paused=Boolean(old.paused);if(['shift','night','service'].includes(old.stationMode))state.stationMode=old.stationMode;state.weather=Math.max(0,Math.min(100,Number(old.weather)||0));}}catch{}
  const requestedScene=new URLSearchParams(location.search).get('scene');
  if(scenes.some(s=>s.id===requestedScene))state.scene=requestedScene;
  function save(){try{localStorage.setItem('nightfall-preview-v5',JSON.stringify(state));}catch{}}
  function send(){if(frame.hidden)return;frame.contentWindow?.postMessage({type:'nightfall:settings',paused:state.paused,weather:state.weather/100,life:1,stationMode:state.stationMode},location.origin);}
  function status(){ for(const b of $('stationModes').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.mode===state.stationMode)); $('pauseIcon').textContent=state.paused?'▷':'Ⅱ';$('pauseText').textContent=state.paused?'Продолжить':'Пауза';$('pause').setAttribute('aria-label',state.paused?'Продолжить анимацию':'Приостановить анимацию');$('weather').value=state.weather;$('weatherValue').textContent=state.weather+'%';send();save();}
  function choose(id){const s=scenes.find(x=>x.id===id);if(!s)return;state.scene=id;$('stationModes').hidden=id!=='station';$('stage').style.backgroundImage=`url('${s.image}')`;$('stage').style.backgroundSize=(id==='cloudcity'||id==='titans')?'contain':'cover';frame.style.opacity='0';frame.hidden=!s.page;frame.src=s.page||'about:blank';$('pause').disabled=!s.page;$('weather').disabled=!s.page;$('sceneEyebrow').textContent=s.tag;$('sceneTitle').textContent=s.title;$('sceneDescription').textContent=s.description;$('weatherLabel').textContent=s.weather;$('weather').setAttribute('aria-label','Интенсивность: '+s.weather.toLowerCase());document.title=s.title+' · Nightfall';for(const card of $('sceneCards').querySelectorAll('button[data-scene]')){const selected=card.dataset.scene===id;card.setAttribute('aria-pressed',String(selected));card.querySelector('.card-check').textContent=selected?'✓':'';}save();}
  function showLibrary(open){library.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){document.body.classList.remove('controls-hidden');for(const image of library.querySelectorAll('img[data-src]')){image.src=image.dataset.src;delete image.dataset.src;}loadDownloads();}}
  // A closed gallery must not download every full-resolution wallpaper.
  // Native lazy loading also defers off-screen cards after the gallery opens.
  const downloads=new Map();
  function appendSceneCard(s){const {group,card,details}=createSceneCard(s);card.addEventListener('click',()=>{if(state.scene!==s.id)choose(s.id);showLibrary(false);});downloads.set(s.id,details);$('sceneCards').append(group);}
  for(const scene of scenes)appendSceneCard(scene);
  let downloadsLoaded=false,downloadsLoading=false;
  async function loadDownloads(){
    if(downloadsLoaded||downloadsLoading)return;
    downloadsLoading=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch('./catalog/index.json',{cache:'no-cache',signal:controller.signal});
      if(!response.ok)throw new Error('Catalogue unavailable');
      const entries=readDownloadCatalog(await response.json(),scenes.map(s=>s.id));
      for(const [id,entry] of entries){
        if(!scenes.some(scene=>scene.id===id)){
          const scene={...entry,title:entry.name,detail:entry.subtitle,tag:'СООБЩЕСТВО · СТАТИЧЕСКАЯ ОБЛОЖКА',weather:'Предпросмотр',page:null};
          scenes.push(scene);appendSceneCard(scene);
          const image=downloads.get(id).parentElement.querySelector('img');image.src=image.dataset.src;delete image.dataset.src;
        }
        const details=downloads.get(id),credit=document.createElement('p');
        credit.className='pack-credit';credit.textContent=`${entry.author} · ${entry.license} · v${entry.version}`;
        if(id==='nightfall'){
          const included=document.createElement('span');included.className='pack-included';included.textContent='Встроена в приложение';
          details.replaceChildren(credit,included);details.hidden=false;continue;
        }
        const link=document.createElement('a');
        link.className='pack-download';link.href=entry.package.url;link.textContent=`Скачать сцену · ${formatPackageSize(entry.package.bytes)}`;
        link.setAttribute('aria-label',`Скачать сцену «${scenes.find(s=>s.id===id).title}», ${formatPackageSize(entry.package.bytes)}`);
        details.replaceChildren(credit,link);details.hidden=false;
      }
      downloadsLoaded=true;$('downloadStatus').textContent='Установите пакет в Nightfall: «Каталог» → «Установить из файла…». Или скачайте сцену прямо в приложении.';
    }catch{$('downloadStatus').textContent='Пакеты сейчас недоступны. Предпросмотр работает; откройте каталог ещё раз, чтобы повторить загрузку.';}
    finally{clearTimeout(timeout);downloadsLoading=false;}
  }
  for(const b of $('stationModes').querySelectorAll('button'))b.addEventListener('click',()=>{state.stationMode=b.dataset.mode;status();});
  frame.addEventListener('load',()=>{send();frame.style.opacity='1';});
  toggle.addEventListener('click',()=>showLibrary(library.hidden));$('closeLibrary').addEventListener('click',()=>showLibrary(false));
  $('pause').addEventListener('click',()=>{state.paused=!state.paused;status();});$('weather').addEventListener('input',()=>{state.weather=Number($('weather').value);status();});
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{const n=$('notice');n.textContent='Полный экран недоступен в этом окне браузера.';n.hidden=false;setTimeout(()=>n.hidden=true,4000);}}
  $('fullscreen').addEventListener('click',fullscreen);document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();showLibrary(true);});
  document.addEventListener('keydown',e=>{if(e.code==='Escape'){showLibrary(false);return;}if(e.target instanceof HTMLInputElement)return;if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();state.paused=!state.paused;status();}if(e.key.toLowerCase()==='f')fullscreen();if(e.key.toLowerCase()==='h'){showLibrary(false);document.body.classList.toggle('controls-hidden');}});
  status();choose(state.scene);
})();
