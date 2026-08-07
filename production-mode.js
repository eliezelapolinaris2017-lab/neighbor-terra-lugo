const ACTIVITY_KEY='neighbor-terra-lugo-activity';
const demoTitles=new Set(['Paquete recibido','Aviso de administración','Visita autorizada']);

function removeLegacyDemoActivity(){
  try{
    const items=JSON.parse(localStorage.getItem(ACTIVITY_KEY));
    if(!Array.isArray(items)||!items.length)return;
    const filtered=items.filter(item=>!demoTitles.has(String(item?.title||'')));
    if(filtered.length!==items.length)localStorage.setItem(ACTIVITY_KEY,JSON.stringify(filtered));
  }catch{}
}

function clearRenderedLegacyDemo(){
  const timeline=document.querySelector('#timeline');
  if(!timeline)return;
  const text=timeline.textContent||'';
  if([...demoTitles].every(title=>text.includes(title))){
    document.querySelector('#clearActivity')?.click();
  }
}

removeLegacyDemoActivity();
window.addEventListener('load',()=>setTimeout(clearRenderedLegacyDemo,0),{once:true});
