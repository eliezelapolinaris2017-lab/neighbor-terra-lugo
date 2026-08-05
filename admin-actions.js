const actionGrid = document.querySelector('#actionGrid');

const observer = new MutationObserver(() => {
  if (!actionGrid || actionGrid.querySelector('[data-neighbor-homes]')) return;
  const residentsCard = [...actionGrid.querySelectorAll('.action-card')].find((card) => card.textContent.toLowerCase().includes('residentes'));
  if (!residentsCard) return;
  const homesCard = document.createElement('button');
  homesCard.className = 'action-card';
  homesCard.type = 'button';
  homesCard.dataset.neighborHomes = 'true';
  homesCard.innerHTML = '<span class="action-icon">🏠</span><strong>Residencias</strong><small>Unidades y propietarios</small>';
  actionGrid.insertBefore(homesCard, residentsCard);
});

observer.observe(actionGrid, { childList: true });
