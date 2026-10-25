import {SCENES} from './extension/nightfall@local/scene-catalog.js?v=15';
(() => {
  'use strict';
  const scenes=SCENES.map(scene=>({...scene,title:scene.name,weather:scene.weatherLabel}));
  const $=id=>document.getElementById(id),frame=$('sceneFrame'),library=$('library'),toggle=$('libraryToggle');
  let state={scene:'station',paused:false,weather:60,stationMode:'shift'};
  try{const old=JSON.parse(localStorage.getItem('nightfall-preview-v5')||'null');if(old&&scenes.some(s=>s.id===old.scene)){state.scene=old.scene;state.paused=Boolean(old.paused);if(['shift','night','service'].includes(old.stationMode))state.stationMode=old.stationMode;state.weather=Math.max(0,Math.min(100,Number(old.weather)||0));}}catch{}
  const requestedScene=new URLSearchParams(location.search).get('scene');
  if(scenes.some(s=>s.id===requestedScene))state.scene=requestedScene;
  function save(){try{localStorage.setItem('nightfall-preview-v5',JSON.stringify(state));}catch{}}
  function send(){frame.contentWindow?.postMessage({type:'nightfall:settings',paused:state.paused,weather:state.weather/100,life:1,stationMode:state.stationMode},location.origin);}
  function status(){ for(const b of $('stationModes').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.mode===state.stationMode)); $('pauseIcon').textContent=state.paused?'▷':'Ⅱ';$('pauseText').textContent=state.paused?'Продолжить':'Пауза';$('pause').setAttribute('aria-label',state.paused?'Продолжить анимацию':'Приостановить анимацию');$('weather').value=state.weather;$('weatherValue').textContent=state.weather+'%';send();save();}
  function choose(id){const s=scenes.find(x=>x.id===id);if(!s)return;state.scene=id;$('stationModes').hidden=id!=='station';$('stage').style.backgroundImage=`url('${s.image}')`;$('stage').style.backgroundSize=(id==='cloudcity'||id==='titans')?'contain':'cover';frame.style.opacity='0';frame.src=s.page;$('sceneEyebrow').textContent=s.tag;$('sceneTitle').textContent=s.title;$('sceneDescription').textContent=s.description;$('weatherLabel').textContent=s.weather;$('weather').setAttribute('aria-label','Интенсивность: '+s.weather.toLowerCase());document.title=s.title+' · Nightfall';for(const card of $('sceneCards').children){const selected=card.dataset.scene===id;card.setAttribute('aria-pressed',String(selected));card.querySelector('.card-check').textContent=selected?'✓':'';}save();}
  function showLibrary(open){library.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){document.body.classList.remove('controls-hidden');for(const image of library.querySelectorAll('img[data-src]')){image.src=image.dataset.src;delete image.dataset.src;}}}
  // A closed gallery must not download every full-resolution wallpaper.
  // Native lazy loading also defers off-screen cards after the gallery opens.
  for(const s of scenes){const card=document.createElement('button');card.className='scene-card';card.dataset.scene=s.id;card.setAttribute('aria-label','Выбрать сцену «'+s.title+'»');card.innerHTML=`<img data-src="${s.image}" loading="lazy" decoding="async" width="1672" height="941" alt=""><span class="card-text"><span><span class="card-title">${s.title}</span><span class="card-subtitle">${s.detail}</span></span><span class="card-check" aria-hidden="true"></span></span>`;card.addEventListener('click',()=>{if(state.scene!==s.id)choose(s.id);showLibrary(false);});$('sceneCards').append(card);}
  for(const b of $('stationModes').querySelectorAll('button'))b.addEventListener('click',()=>{state.stationMode=b.dataset.mode;status();});
  frame.addEventListener('load',()=>{send();frame.style.opacity='1';});
  toggle.addEventListener('click',()=>showLibrary(library.hidden));$('closeLibrary').addEventListener('click',()=>showLibrary(false));
  $('pause').addEventListener('click',()=>{state.paused=!state.paused;status();});$('weather').addEventListener('input',()=>{state.weather=Number($('weather').value);status();});
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{const n=$('notice');n.textContent='Полный экран недоступен в этом окне браузера.';n.hidden=false;setTimeout(()=>n.hidden=true,4000);}}
  $('fullscreen').addEventListener('click',fullscreen);document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();showLibrary(true);});
  document.addEventListener('keydown',e=>{if(e.code==='Escape'){showLibrary(false);return;}if(e.target instanceof HTMLInputElement)return;if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();state.paused=!state.paused;status();}if(e.key.toLowerCase()==='f')fullscreen();if(e.key.toLowerCase()==='h'){showLibrary(false);document.body.classList.toggle('controls-hidden');}});
  status();choose(state.scene);
})();
