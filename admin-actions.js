const actionGrid = document.querySelector('#actionGrid');

const observer = new MutationObserver(() => {
  if (!actionGrid) return;
  const residentsCard = [...actionGrid.querySelectorAll('.action-card')].find((card) => card.textContent.toLowerCase().includes('residentes'));
  if (!residentsCard) return;

  if (!actionGrid.querySelector('[data-neighbor-homes]')) {
    const homesCard = document.createElement('button');
    homesCard.className = 'action-card';
    homesCard.type = 'button';
    homesCard.dataset.neighborHomes = 'true';
    homesCard.innerHTML = '<span class="action-icon">🏠</span><strong>Residencias</strong><small>Unidades y propietarios</small>';
    actionGrid.insertBefore(homesCard, residentsCard);
  }

  if (!actionGrid.querySelector('[data-neighbor-vehicles]')) {
    const vehiclesCard = document.createElement('button');
    vehiclesCard.className = 'action-card';
    vehiclesCard.type = 'button';
    vehiclesCard.dataset.neighborVehicles = 'true';
    vehiclesCard.innerHTML = '<span class="action-icon">🚙</span><strong>Vehículos</strong><small>Tablillas y unidades</small>';
    residentsCard.insertAdjacentElement('afterend', vehiclesCard);
  }
});

observer.observe(actionGrid, { childList: true });
