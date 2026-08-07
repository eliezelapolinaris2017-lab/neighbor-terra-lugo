(()=>{
  const replacements=[
    [/Firebase conectado/gi,'Conectado a la nube'],
    [/Conectando con Firebase/gi,'Conectando a la nube'],
    [/sin conexión a Firebase/gi,'sin conexión a la nube'],
    [/Firebase no respondió/gi,'la base de datos no respondió'],
    [/No hay conexión con Firebase/gi,'No hay conexión con la nube'],
    [/Firebase activo/gi,'Base de datos activa'],
    [/Firebase necesita terminar de preparar esta consulta/gi,'La base de datos necesita terminar de preparar esta consulta'],
    [/Firebase no está disponible ahora/gi,'La base de datos no está disponible ahora'],
    [/Firebase no está configurado/gi,'La base de datos no está configurada'],
    [/Firebase/gi,'base de datos']
  ];

  function sanitizeText(value){
    let text=String(value??'');
    for(const [pattern,next] of replacements) text=text.replace(pattern,next);
    return text;
  }

  function cleanNode(node){
    if(!node)return;
    if(node.nodeType===Node.TEXT_NODE){
      const current=node.nodeValue||'';
      const next=sanitizeText(current);
      if(next!==current) node.nodeValue=next;
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    if(['SCRIPT','STYLE','NOSCRIPT'].includes(node.tagName))return;
    if(node.hasAttribute?.('aria-label')){
      const current=node.getAttribute('aria-label')||'';
      const next=sanitizeText(current);
      if(next!==current) node.setAttribute('aria-label',next);
    }
    [...node.childNodes].forEach(cleanNode);
  }

  function patchBanner(){
    const banner=document.querySelector('#connectionBanner');
    if(!banner)return;
    const current=banner.textContent||'';
    let next=sanitizeText(current);
    if(banner.dataset.connected==='true' && !/conectado a la nube/i.test(next)){
      next='Conectado a la nube · datos protegidos por usuario';
    }
    if(next!==current) banner.textContent=next;
  }

  cleanNode(document.body);
  patchBanner();

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes) cleanNode(node);
    }
    patchBanner();
  });
  observer.observe(document.body,{childList:true,subtree:true});
})();
