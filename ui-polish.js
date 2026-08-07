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
    replacements.forEach(([pattern,next])=>{text=text.replace(pattern,next);});
    return text;
  }

  function cleanNode(node){
    if(!node)return;
    if(node.nodeType===Node.TEXT_NODE){
      const next=sanitizeText(node.nodeValue);
      if(next!==node.nodeValue)node.nodeValue=next;
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    if(['SCRIPT','STYLE','NOSCRIPT'].includes(node.tagName))return;
    if(node.hasAttribute?.('aria-label')){
      const current=node.getAttribute('aria-label');
      const next=sanitizeText(current);
      if(next!==current)node.setAttribute('aria-label',next);
    }
    node.childNodes.forEach(cleanNode);
  }

  function normalizeConnectionBanner(){
    const banner=document.querySelector('#connectionBanner');
    if(!banner)return;
    const text=sanitizeText(banner.textContent);
    if(banner.dataset.connected==='true'){
      if(!/conectado a la nube/i.test(text))banner.textContent='Conectado a la nube · datos protegidos por usuario';
    }else if(/firebase|base de datos|nube/i.test(text)){
      banner.textContent=text;
    }
  }

  cleanNode(document.body);
  normalizeConnectionBanner();
  const observer=new MutationObserver(records=>{
    records.forEach(record=>{
      if(record.type==='characterData')cleanNode(record.target);
      record.addedNodes.forEach(cleanNode);
    });
    normalizeConnectionBanner();
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
})();
